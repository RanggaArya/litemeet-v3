import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { room, username, photoURL, email, isCreator } = await req.json();

        if (!room || !username) {
            return NextResponse.json({ error: 'Missing room or username' }, { status: 400 });
        }

        const hostKey = email || username; // Use email if available, otherwise username

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const url = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !url) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const httpUrl = url.replace('wss://', 'https://');
        const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
        
        let role = 'participant';
        let roomExists = false;
        let isWaitingRoomEnabled = false;

        try {
            const rooms = await svc.listRooms();
            const existingRoom = rooms.find(r => r.name === room);
            
            if (existingRoom) {
                roomExists = true;
                let parsedMeta = {};
                try {
                    parsedMeta = JSON.parse(existingRoom.metadata || '{}');
                    if (parsedMeta.waitingRoom) isWaitingRoomEnabled = true;
                } catch(e) {}

                // Check if returning user is the host
                if (parsedMeta.hostIdentity === hostKey) {
                    role = 'host';
                }
            } else {
                // Pre-create room with host metadata
                await svc.createRoom({
                    name: room,
                    emptyTimeout: 300,
                    metadata: JSON.stringify({ hostIdentity: hostKey, waitingRoom: false })
                });
                role = 'host';
            }
        } catch (e) {
            console.warn('[Token API] Room checking/creation error:', e.message);
        }

        console.log(`[Token API] 🎯 Room "${room}" -> User "${username}" (role: ${role})`);

        try {
            let canPublish = true;
            let canSubscribe = true;
            let userStatus = "admitted";

            const isSuperApps = username === 'super-apps' || username === 'super-apps!';

            // If it's a waiting room and user is NOT a host or super admin, put them in waiting state
            if (isWaitingRoomEnabled && role !== 'host' && !isSuperApps) {
                canPublish = false;
                canSubscribe = false;
                userStatus = "waiting";
                console.log(`[Token API] ⏳ Participant "${username}" placed in waiting room`);
            }

            // Build participant metadata
            const metadata = JSON.stringify({
                photoURL: photoURL || '',
                role: role,
                authMethod: photoURL ? 'google' : 'guest',
                status: userStatus
            });

            const at = new AccessToken(apiKey, apiSecret, {
                identity: username,
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
                role: role
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