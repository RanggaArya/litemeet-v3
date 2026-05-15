import twilio from 'twilio';
import {
    TWILIO_KEYS,
    getTwilioKey,
    advanceTwilioKey,
} from '../_lib/keys';

export async function GET() {
    const maxAttempts = TWILIO_KEYS.length;
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const currentKey = getTwilioKey();

        try {
            const client = twilio(currentKey.accountSid, currentKey.authToken);
            const token = await client.tokens.create();

            console.log(`[TURN API] ✅ Twilio key "${currentKey.accountSid.slice(-6)}" berhasil`);

            return Response.json({
                iceServers: token.iceServers,
            });
        } catch (error) {
            console.warn(`[TURN API] ⚠️ Twilio key "${currentKey.accountSid.slice(-6)}" gagal: ${error.message}`);
            lastError = error;
            advanceTwilioKey();
        }
    }

    console.error(`[TURN API] ❌ Semua ${maxAttempts} Twilio keys gagal!`);
    return Response.json(
        { error: `Gagal ambil TURN token. Error: ${lastError?.message}` },
        { status: 503 }
    );
}