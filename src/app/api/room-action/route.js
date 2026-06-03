import { RoomServiceClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { action, room, participantIdentity, metadata } = await req.json();

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const url = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !url) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        // Convert wss:// to https:// for REST API
        const httpUrl = url.replace('wss://', 'https://');
        const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);

        switch (action) {
            case 'kick': {
                // Remove participant from room
                await svc.removeParticipant(room, participantIdentity);
                return NextResponse.json({ success: true, message: `${participantIdentity} telah dikeluarkan.` });
            }

            case 'update-participant-meta': {
                // Update participant metadata
                await svc.updateParticipant(room, participantIdentity, { metadata });
                return NextResponse.json({ success: true });
            }

            case 'admit-participant': {
                // Change status from waiting to admitted and grant permissions
                const newMetadata = JSON.stringify({ ...JSON.parse(metadata || '{}'), status: 'admitted' });
                await svc.updateParticipant(room, participantIdentity, {
                    metadata: newMetadata,
                    permission: {
                        canPublish: true,
                        canSubscribe: true,
                        canPublishData: true,
                    },
                });
                return NextResponse.json({ success: true, message: `${participantIdentity} diizinkan masuk.` });
            }

            case 'update-room-meta': {
                // Update room-level metadata (waiting room state, lock, etc.)
                await svc.updateRoomMetadata(room, metadata);
                return NextResponse.json({ success: true });
            }

            case 'mute-participant': {
                // Mute a specific participant's track
                await svc.mutePublishedTrack(room, participantIdentity, metadata, true);
                return NextResponse.json({ success: true });
            }

            case 'list-participants': {
                // List all participants in a room
                const participants = await svc.listParticipants(room);
                return NextResponse.json({ participants });
            }

            case 'list-rooms': {
                // List all active rooms
                const rooms = await svc.listRooms();
                return NextResponse.json({ rooms });
            }

            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        }

    } catch (error) {
        console.error('[Room Action API] ❌ Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
