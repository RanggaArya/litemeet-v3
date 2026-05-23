import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';
import { LIVEKIT_KEYS, hashRoomName } from '../_lib/keys';

export async function POST(req) {
    try {
        const { room, username } = await req.json();

        if (!room || !username) {
            return NextResponse.json({ error: 'Missing room or username' }, { status: 400 });
        }

        // DETERMINISTIC: Semua user di room yang sama SELALU mendapat server yang sama.
        // retryCount TIDAK lagi menggeser index server.
        // Ini memastikan semua user di room "DailyCall" selalu ke server #X.
        const serverIndex = hashRoomName(room) % LIVEKIT_KEYS.length;
        const selectedKey = LIVEKIT_KEYS[serverIndex];

        console.log(`[Token API] 🎯 Room "${room}" → FIXED to Server #${serverIndex} (${selectedKey.url})`);

        try {
            const at = new AccessToken(selectedKey.apiKey, selectedKey.apiSecret, {
                identity: username,
            });

            at.addGrant({ roomJoin: true, room: room, canPublishData: true });
            const token = await at.toJwt();

            return NextResponse.json({
                token,
                serverUrl: selectedKey.url,
                keyIndex: serverIndex,
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