import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { password, url, apiKey, apiSecret } = await req.json();

        // Basic validation
        if (password !== 'super-apps!') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!url || !apiKey || !apiSecret) {
            return NextResponse.json({ error: 'Missing LiveKit credentials' }, { status: 400 });
        }

        const projectId = process.env.VERCEL_PROJECT_ID;
        const token = process.env.VERCEL_ACCESS_TOKEN;

        if (!projectId || !token) {
            return NextResponse.json({ error: 'Vercel configuration missing in ENV' }, { status: 500 });
        }

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        };

        // 1. Ambil daftar env variables saat ini untuk mendapatkan ID-nya
        const listRes = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env`, { headers });
        if (!listRes.ok) {
            const errText = await listRes.text();
            throw new Error(`Gagal mengambil ENV dari Vercel: ${errText}`);
        }
        const listData = await listRes.json();
        const envs = listData.envs || [];

        // 2. Fungsi pembantu untuk update atau create env var
        const updateEnv = async (key, value) => {
            const existing = envs.find(e => e.key === key);
            if (existing) {
                // Update via PATCH
                const patchRes = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env/${existing.id}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ value, type: 'encrypted', target: ['production', 'preview', 'development'] })
                });
                if (!patchRes.ok) throw new Error(`Gagal update ${key}`);
            } else {
                // Create via POST
                const postRes = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ key, value, type: 'encrypted', target: ['production', 'preview', 'development'] })
                });
                if (!postRes.ok) throw new Error(`Gagal membuat ${key}`);
            }
        };

        // 3. Eksekusi update
        await updateEnv('LIVEKIT_URL', url);
        await updateEnv('LIVEKIT_API_KEY', apiKey);
        await updateEnv('LIVEKIT_API_SECRET', apiSecret);

        // Vercel akan otomatis men-trigger redeploy saat env var berubah (jika setting auto-redeploy aktif).
        // Biasanya butuh sekitar 1-2 menit untuk live.

        return NextResponse.json({ success: true, message: 'API Keys updated successfully. Vercel is redeploying.' });

    } catch (error) {
        console.error('[Update Keys API] ❌ Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
