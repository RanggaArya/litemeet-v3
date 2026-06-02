import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { room, username, photoURL, role, e2ee } = await req.json();

        if (!room || !username) {
            return NextResponse.json({ error: 'Missing room or username' }, { status: 400 });
        }

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const url = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !url) {
            console.error('[Token API] ❌ Missing LiveKit API Keys in process.env');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        console.log(`[Token API] 🎯 Room "${room}" → User "${username}" (role: ${role || 'participant'})`);

        try {
            // Build participant metadata
            const metadata = JSON.stringify({
                photoURL: photoURL || '',
                role: role || 'participant', // 'host' | 'participant'
                authMethod: photoURL ? 'google' : 'guest',
                e2ee: e2ee || false,
            });

            const at = new AccessToken(apiKey, apiSecret, {
                identity: username,
                metadata: metadata,
            });

            at.addGrant({
                roomJoin: true,
                room: room,
                canPublishData: true,
                canUpdateOwnMetadata: true,
            });

            const token = await at.toJwt();

            return NextResponse.json({
                token,
                serverUrl: url,
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