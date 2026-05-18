import { NextResponse } from 'next/server';
import { advanceLivekitKey, clearRoomKeyMapping } from '../_lib/keys';

// Client calls this when LiveKit connection fails (limit reached, etc.)
// This advances the server's key index so the next /api/token call uses a fresh key.
// It also clears the room mapping so the dead key is no longer used for this room.
export async function POST(req) {
    try {
        let room = null;
        try {
            const body = await req.json();
            room = body.room;
        } catch (e) {
            // Ignore JSON parse error if body is empty (backward compatibility)
        }

        const newKey = advanceLivekitKey();
        console.log(`[Switch Key API] 🔄 Client requested key switch → now using key #${newKey.index} (${newKey.apiKey})`);

        if (room) {
            clearRoomKeyMapping(room);
        }

        return NextResponse.json({
            success: true,
            message: `Switched to LiveKit key #${newKey.index}`,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
