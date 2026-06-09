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
        let returnedHostSecret = ''; // Only returned to the actual host

        try {
            const rooms = await svc.listRooms();
            const existingRoom = rooms.find(r => r.name === room);
            
            if (existingRoom) {
                // Room exists — check if this user is the host by verifying their secret
                let parsedMeta = {};
                try {
                    parsedMeta = JSON.parse(existingRoom.metadata || '{}');
                    if (parsedMeta.waitingRoom) isWaitingRoomEnabled = true;
                } catch(e) {}

                // Grant host role if the user provides the correct hostSecret (and matching name) OR their verified email matches
                if (
                    (hostSecret && parsedMeta.hostSecret && hostSecret === parsedMeta.hostSecret && (!parsedMeta.hostName || username === parsedMeta.hostName)) ||
                    (email && parsedMeta.hostEmail && email === parsedMeta.hostEmail)
                ) {
                    role = 'host';
                    returnedHostSecret = parsedMeta.hostSecret || hostSecret; // Give them the secret so their new device caches it
                }

                // --- Duplicate nickname handling ---
                try {
                    const participants = await svc.listParticipants(room);
                    const matchingParticipant = participants.find(p => p.identity === username);

                    if (matchingParticipant) {
                        let existingEmail = '';
                        try {
                            const pMeta = JSON.parse(matchingParticipant.metadata || '{}');
                            existingEmail = pMeta.email || '';
                        } catch (e) {}

                        // Same email (non-empty) = same account, device switch is OK — LiveKit will replace
                        if (email && existingEmail && email === existingEmail) {
                            console.log(`[Token API] 🔄 Same email match for "${username}" — allowing device switch`);
                            // finalIdentity stays as username, LiveKit will replace the old connection
                        } else {
                            // Different user or guest — find next available suffix
                            const takenIdentities = new Set(participants.map(p => p.identity));
                            let suffix = 2;
                            while (takenIdentities.has(`${username}_${suffix}`)) {
                                suffix++;
                            }
                            finalIdentity = `${username}_${suffix}`;
                            console.log(`[Token API] 👥 Duplicate nickname "${username}" — reassigned to "${finalIdentity}"`);
                        }
                    }
                } catch (e) {
                    console.warn('[Token API] Could not check participants for duplicates:', e.message);
                }
            } else {
                // Room doesn't exist — this user is the creator/host
                // Generate a unique hostSecret for this room
                const newHostSecret = randomBytes(16).toString('hex');
                
                await svc.createRoom({
                    name: room,
                    emptyTimeout: 600,
                    metadata: JSON.stringify({ 
                        hostSecret: newHostSecret,
                        hostEmail: email || null,
                        hostName: username,
                        waitingRoom: waitingRoomPref || false 
                    })
                });
                role = 'host';
                returnedHostSecret = newHostSecret; // Send it to the creator
            }
        } catch (e) {
            console.warn('[Token API] Room checking/creation error:', e.message);
        }

        console.log(`[Token API] 🎯 Room "${room}" -> User "${finalIdentity}" (role: ${role})${finalIdentity !== username ? ` (originally "${username}")` : ''}`);

        try {
            let canPublish = true;
            let canSubscribe = true;
            let userStatus = "admitted";

            const isSuperApps = finalIdentity === 'super-apps' || finalIdentity === 'super-apps!';

            // Super admin always gets host role
            if (isSuperApps) {
                role = 'host';
            }

            // If it's a waiting room and user is NOT a host or super admin, put them in waiting state
            if (isWaitingRoomEnabled && role !== 'host' && !isSuperApps) {
                canPublish = false;
                canSubscribe = false;
                userStatus = "waiting";
                console.log(`[Token API] ⏳ Participant "${finalIdentity}" placed in waiting room`);
            }

            // Build participant metadata
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
                identity: finalIdentity, // Final identity (may be suffixed if duplicate)
                hostSecret: returnedHostSecret, // Only non-empty for the actual host
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