import Pusher from 'pusher';

export async function POST(req) {
    const data = await req.formData();
    const socketId = data.get('socket_id');
    const channelName = data.get('channel_name');

    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.PUSHER_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.PUSHER_CLUSTER;

    if (!appId || !key || !secret || !cluster) {
        console.error('[Pusher Auth] ❌ Missing Pusher Keys in process.env');
        return Response.json({ error: 'Server configuration error' }, { status: 500 });
    }

    try {
        const pusher = new Pusher({
            appId,
            key,
            secret,
            cluster,
            useTLS: true,
        });

        const authResponse = pusher.authenticate(socketId, channelName);
        console.log(`[Pusher Auth] ✅ Pusher key berhasil`);
        return Response.json(authResponse);
    } catch (error) {
        console.error(`[Pusher Auth] ❌ Error: ${error.message}`);
        return Response.json(
            { error: `Pusher auth gagal. Error: ${error.message}` },
            { status: 503 }
        );
    }
}