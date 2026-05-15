import { NextResponse } from 'next/server';
import { advanceLivekitKey } from '../_lib/keys';

// Client calls this when LiveKit connection fails (limit reached, etc.)
// This advances the server's key index so the next /api/token call uses a fresh key.
export async function POST() {
    try {
        const newKey = advanceLivekitKey();
        console.log(`[Switch Key API] 🔄 Client requested key switch → now using key #${newKey.index} (${newKey.apiKey})`);

        return NextResponse.json({
            success: true,
            message: `Switched to LiveKit key #${newKey.index}`,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
