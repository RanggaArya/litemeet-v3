import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';
import {
    LIVEKIT_KEYS,
    getLivekitKey,
    advanceLivekitKey,
    getRoomKeyIndex,
    setRoomKeyIndex,
    clearRoomKeyMapping
} from '../_lib/keys';

// Helper function to check if a LiveKit server is healthy (not out of quota)
async function isKeyHealthy(key) {
    try {
        const svc = new RoomServiceClient(key.url, key.apiKey, key.apiSecret);
        // listRooms() will throw if the API key is rate limited or invalid
        await svc.listRooms();
        return true;
    } catch (error) {
        console.warn(`[HealthCheck] ⚠️ Key #${key.index} (${key.apiKey}) failed health check: ${error.message}`);
        return false;
    }
}

export async function POST(req) {
    try {
        const { room, username } = await req.json();

        if (!room || !username) {
            return NextResponse.json({ error: 'Missing room or username' }, { status: 400 });
        }

        const maxAttempts = LIVEKIT_KEYS.length;
        let lastError = null;
        let selectedKey = null;

        // 1. Cek apakah room ini sudah ter-mapping ke server tertentu
        const existingKeyIndex = getRoomKeyIndex(room);
        
        if (existingKeyIndex !== null) {
            console.log(`[Token API] 🔍 Room "${room}" found in mapping -> Key #${existingKeyIndex}`);
            selectedKey = getLivekitKey(existingKeyIndex);
            
            // Lakukan quick health check untuk memastikan key mapping ini masih hidup
            const isHealthy = await isKeyHealthy(selectedKey);
            if (!isHealthy) {
                // Jika mati di tengah jalan, hapus mapping dan cari key baru
                clearRoomKeyMapping(room);
                selectedKey = null; 
            }
        }

        // 2. Jika belum ada key yang terpilih (room baru, atau room lama yg key-nya mati)
        if (!selectedKey) {
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const candidateKey = getLivekitKey(); // pakai index global
                
                const isHealthy = await isKeyHealthy(candidateKey);
                if (isHealthy) {
                    selectedKey = candidateKey;
                    // Simpan mapping agar user selanjutnya yg join masuk ke server yg sama
                    setRoomKeyIndex(room, selectedKey.index);
                    break;
                } else {
                    // Jika rusak/limit, paksa pindah ke key selanjutnya untuk attempt berikutnya
                    advanceLivekitKey();
                }
            }
        }

        // 3. Jika setelah looping tetap tidak dapat key sehat
        if (!selectedKey) {
            console.error(`[Token API] ❌ All ${maxAttempts} LiveKit keys failed health checks!`);
            return NextResponse.json(
                { error: 'Semua server LiveKit penuh/limit. Silakan coba beberapa saat lagi.' },
                { status: 503 }
            );
        }

        // 4. Generate Token menggunakan selectedKey yang dijamin Sehat & Tepat Sasaran
        try {
            const at = new AccessToken(selectedKey.apiKey, selectedKey.apiSecret, {
                identity: username,
            });

            at.addGrant({ roomJoin: true, room: room });
            const token = await at.toJwt();

            console.log(`[Token API] ✅ Token generated for "${username}" in room "${room}" using Key #${selectedKey.index}`);

            return NextResponse.json({
                token,
                serverUrl: selectedKey.url,
                keyIndex: selectedKey.index,
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