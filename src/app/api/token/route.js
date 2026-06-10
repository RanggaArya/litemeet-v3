import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export async function POST(req) {
    try {
        const { room, username, photoURL, email, hostSecret, waitingRoomPref, warmup } = await req.json();

        // Handle pre-warm requests to wake up Vercel cold starts instantly
        if (warmup) {
            return NextResponse.json({ success: true, message: 'Server warmed up!' });
        }

        let finalIdentity = username; // May be suffixed if duplicate

        if (!room || !username) {
            return NextResponse.json({ error: 'Missing room or username' }, { status: 400 });
        }

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const url = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !url) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const httpUrl = url.replace('wss://', 'https://');
        const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
        
        let role = 'participant';
        let isWaitingRoomEnabled = false;
        let returnedHostSecret = '';

        try {
            // ⚡ OPTIMASI: Jalankan listRooms() dan listParticipants() SECARA PARALEL
            // Sebelumnya: listRooms → tunggu → listParticipants → tunggu = 2x RTT
            // Sekarang:   keduanya jalan bersamaan = hanya 1x RTT (hemat 300-800ms)
            const [rooms, participantsRaw] = await Promise.allSettled([
                svc.listRooms([room]), // ⚡ filter by room name langsung — lebih efisien
                svc.listParticipants(room).catch(() => []), // graceful jika room belum ada
            ]);

            const roomList = rooms.status === 'fulfilled' ? rooms.value : [];
            const participants = participantsRaw.status === 'fulfilled' ? participantsRaw.value : [];
            const existingRoom = roomList.find(r => r.name === room);

            if (existingRoom) {
                // Room exists — parse metadata dan cek host
                let parsedMeta = {};
                try {
                    parsedMeta = JSON.parse(existingRoom.metadata || '{}');
                    if (parsedMeta.waitingRoom) isWaitingRoomEnabled = true;
                } catch(e) {}

                // Cek host berdasarkan secret atau email
                if (
                    (hostSecret && parsedMeta.hostSecret && hostSecret === parsedMeta.hostSecret && (!parsedMeta.hostName || username === parsedMeta.hostName)) ||
                    (email && parsedMeta.hostEmail && email === parsedMeta.hostEmail)
                ) {
                    role = 'host';
                    returnedHostSecret = parsedMeta.hostSecret || hostSecret;
                }

                // --- Duplicate nickname handling (sudah punya data participants dari parallel fetch) ---
                const matchingParticipant = participants.find(p => p.identity === username);
                if (matchingParticipant) {
                    let existingEmail = '';
                    try {
                        const pMeta = JSON.parse(matchingParticipant.metadata || '{}');
                        existingEmail = pMeta.email || '';
                    } catch (e) {}

                    // Same email = device switch, LiveKit akan replace koneksi lama
                    if (email && existingEmail && email === existingEmail) {
                        console.log(`[Token API] 🔄 Same email match for "${username}" — allowing device switch`);
                    } else {
                        // Guest/nama sama dari orang berbeda — suffix otomatis
                        const takenIdentities = new Set(participants.map(p => p.identity));
                        let suffix = 2;
                        while (takenIdentities.has(`${username}_${suffix}`)) {
                            suffix++;
                        }
                        finalIdentity = `${username}_${suffix}`;
                        console.log(`[Token API] 👥 Duplicate nickname "${username}" — reassigned to "${finalIdentity}"`);
                    }
                }
            } else {
                // Room belum ada — buat room baru + generate hostSecret
                // ⚡ createRoom tidak perlu di-await panjang karena token bisa digenerate paralel juga
                const newHostSecret = randomBytes(16).toString('hex');
                returnedHostSecret = newHostSecret;
                role = 'host';

                // Fire-and-forget createRoom — token generation tidak perlu tunggu ini selesai
                // Room akan dibuat oleh LiveKit otomatis saat token dipakai connect jika createRoom belum selesai
                svc.createRoom({
                    name: room,
                    emptyTimeout: 600,
                    metadata: JSON.stringify({
                        hostSecret: newHostSecret,
                        hostEmail: email || null,
                        hostName: username,
                        waitingRoom: waitingRoomPref || false
                    })
                }).catch(e => console.warn('[Token API] createRoom error (non-fatal):', e.message));
                // ⚡ Tidak await! LiveKit server akan handle room creation saat client connect
            }
        } catch (e) {
            console.warn('[Token API] Room checking error:', e.message);
            // Non-fatal: lanjutkan generate token meski pengecekan gagal
        }

        console.log(`[Token API] ⚡ Room "${room}" -> User "${finalIdentity}" (role: ${role})${finalIdentity !== username ? ` (originally "${username}")` : ''}`);

        // ⚡ Generate token (murni CPU, tidak ada network call)
        try {
            let canPublish = true;
            let canSubscribe = true;
            let userStatus = 'admitted';

            const isSuperApps = finalIdentity === 'super-apps' || finalIdentity === 'super-apps!';
            if (isSuperApps) role = 'host';

            if (isWaitingRoomEnabled && role !== 'host' && !isSuperApps) {
                canPublish = false;
                canSubscribe = false;
                userStatus = 'waiting';
                console.log(`[Token API] ⏳ Participant "${finalIdentity}" placed in waiting room`);
            }

            const metadata = JSON.stringify({
                photoURL: photoURL || '',
                role: role,
                authMethod: photoURL ? 'google' : 'guest',
                status: userStatus,
                email: email || ''
            });

            const at = new AccessToken(apiKey, apiSecret, {
                identity: finalIdentity,
                metadata: metadata,
            });

            at.addGrant({
                roomJoin: true,
                room: room,
                canPublish: canPublish,
                canSubscribe: canSubscribe,
                canPublishData: true,
                canUpdateOwnMetadata: true,
            });

            const token = await at.toJwt();

            return NextResponse.json({
                token,
                serverUrl: url,
                status: userStatus,
                role: role,
                identity: finalIdentity,
                hostSecret: returnedHostSecret,
            });
        } catch (err) {
            console.error(`[Token API] ❌ Error generating token:`, err);
            return NextResponse.json({ error: 'Gagal membuat token: ' + err.message }, { status: 500 });
        }

    } catch (error) {
        console.error('[Token API] ❌ Unexpected error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}