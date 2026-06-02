import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { room, username, photoURL, isCreator, waitingRoom } = await req.json();

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
        let roomExists = false;
        let isWaitingRoomEnabled = waitingRoom === true;

        try {
            const rooms = await svc.listRooms();
            const existingRoom = rooms.find(r => r.name === room);
            if (existingRoom) {
                roomExists = true;
                // Read waiting room status from existing room metadata
                try {
                    const parsedMeta = JSON.parse(existingRoom.metadata || '{}');
                    if (parsedMeta.waitingRoom) isWaitingRoomEnabled = true;
                } catch(e) {}
            } else {
                // First person to join the room is always the host
                role = 'host';
            }
        } catch (e) {
            console.warn('[Token API] Could not list rooms, defaulting to participant', e.message);
        }

        // If user claims to be creator and room doesn't exist, they are definitely host
        if (isCreator && !roomExists) {
            role = 'host';
        }

        console.log(`[Token API] 🎯 Room "${room}" -> User "${username}" (role: ${role})`);

        try {
            let canPublish = true;
            let canSubscribe = true;
            let userStatus = "admitted";

            // If it's a waiting room and user is NOT a host, put them in waiting state
            if (isWaitingRoomEnabled && role !== 'host') {
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