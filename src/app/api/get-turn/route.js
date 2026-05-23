import twilio from 'twilio';

export async function GET() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
        console.error('[TURN API] ❌ Missing Twilio Keys in process.env');
        return Response.json({ error: 'Server configuration error' }, { status: 500 });
    }

    try {
        const client = twilio(accountSid, authToken);
        const token = await client.tokens.create();

        console.log(`[TURN API] ✅ Twilio key berhasil`);

        return Response.json({
            iceServers: token.iceServers,
        });
    } catch (error) {
        console.warn(`[TURN API] ⚠️ Twilio gagal: ${error.message}`);
        return Response.json(
            { error: `Gagal ambil TURN token. Error: ${error.message}` },
            { status: 503 }
        );
    }
}