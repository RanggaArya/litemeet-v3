import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';
import {
    LIVEKIT_KEYS,
    getLivekitKey,
    advanceLivekitKey,
} from '../_lib/keys';

export async function POST(req) {
    try {
        const { room, username } = await req.json();

        if (!room || !username) {
            return NextResponse.json({ error: 'Missing room or username' }, { status: 400 });
        }

        // Try each LiveKit key until one works (max = total keys)
        const maxAttempts = LIVEKIT_KEYS.length;
        let lastError = null;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const currentKey = getLivekitKey();

            try {
                const at = new AccessToken(currentKey.apiKey, currentKey.apiSecret, {
                    identity: username,
                });

                at.addGrant({ roomJoin: true, room: room });

                const token = await at.toJwt();

                console.log(`[Token API] ✅ Using LiveKit key #${currentKey.index} (${currentKey.apiKey}) for room "${room}"`);

                // Return token + serverUrl so client knows which server to connect to
                return NextResponse.json({
                    token,
                    serverUrl: currentKey.url,
                    keyIndex: currentKey.index,
                });
            } catch (err) {
                console.warn(`[Token API] ⚠️ LiveKit key #${currentKey.index} (${currentKey.apiKey}) failed: ${err.message}`);
                lastError = err;
                // Advance to next key and retry
                advanceLivekitKey();
            }
        }

        // All keys exhausted
        console.error(`[Token API] ❌ All ${maxAttempts} LiveKit keys failed!`);
        return NextResponse.json(
            { error: `Semua API key LiveKit gagal. Error terakhir: ${lastError?.message}` },
            { status: 503 }
        );
    } catch (error) {
        console.error('[Token API] ❌ Unexpected error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}