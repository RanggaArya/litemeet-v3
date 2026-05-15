import Pusher from 'pusher';
import {
    PUSHER_KEYS,
    getPusherKey,
    advancePusherKey,
} from '../_lib/keys';

export async function POST(req) {
    const maxAttempts = PUSHER_KEYS.length;
    let lastError = null;

    const data = await req.formData();
    const socketId = data.get('socket_id');
    const channelName = data.get('channel_name');

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const currentKey = getPusherKey();

        try {
            const pusher = new Pusher({
                appId: currentKey.appId,
                key: currentKey.key,
                secret: currentKey.secret,
                cluster: currentKey.cluster,
                useTLS: true,
            });

            const authResponse = pusher.authenticate(socketId, channelName);

            console.log(`[Pusher Auth] ✅ Pusher key "${currentKey.appId}" berhasil`);

            return Response.json(authResponse);
        } catch (error) {
            console.warn(`[Pusher Auth] ⚠️ Pusher key "${currentKey.appId}" gagal: ${error.message}`);
            lastError = error;
            advancePusherKey();
        }
    }

    console.error(`[Pusher Auth] ❌ Semua Pusher keys gagal!`);
    return Response.json(
        { error: `Pusher auth gagal. Error: ${lastError?.message}` },
        { status: 503 }
    );
}