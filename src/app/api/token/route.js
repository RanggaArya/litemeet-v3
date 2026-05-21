import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';
import {
    LIVEKIT_KEYS,
    getLivekitKey,
    hashRoomName,
} from '../_lib/keys';

export async function POST(req) {
    try {
        const { room, username, retryCount = 0 } = await req.json();

        if (!room || !username) {
            return NextResponse.json({ error: 'Missing room or username' }, { status: 400 });
        }

        // 1. Dapatkan Index Dasar dari Hash Nama Room
        const baseIndex = hashRoomName(room);
        
        // 2. Tambahkan retryCount (jika klien gagal konek sebelumnya, retryCount > 0)
        const targetIndex = (baseIndex + retryCount) % LIVEKIT_KEYS.length;
        
        // 3. Ambil Key yang terpilih
        const selectedKey = getLivekitKey(targetIndex);

        console.log(`[Token API] 🎲 Room "${room}" (Hash: ${baseIndex}, Retry: ${retryCount}) -> Assigned to Key #${selectedKey.index} (${selectedKey.apiKey})`);

        // 4. Generate Token
        try {
            const at = new AccessToken(selectedKey.apiKey, selectedKey.apiSecret, {
                identity: username,
            });

            at.addGrant({ roomJoin: true, room: room, canPublishData: true });
            const token = await at.toJwt();

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