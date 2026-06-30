import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { password, action, bundle, id } = await req.json();

        // Basic validation
        if (password !== 'super-apps!') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

        // 1. Ambil daftar env variables saat ini untuk mendapatkan LIVEKIT_BUNDLES
        const listRes = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env`, { headers });
        if (!listRes.ok) {
            throw new Error('Gagal mengambil ENV dari Vercel');
        }
        const listData = await listRes.json();
        const envs = listData.envs || [];
        
        const existingEnv = envs.find(e => e.key === 'LIVEKIT_BUNDLES');
        let bundles = [];
        if (existingEnv && existingEnv.value) {
            try {
                bundles = JSON.parse(existingEnv.value);
            } catch(e) {
                bundles = [];
            }
        }

        // 2. Handle Action (GET, ADD, DELETE)
        if (action === 'GET') {
            return NextResponse.json({ success: true, bundles });
        }
        
        if (action === 'ADD') {
            if (!bundle || !bundle.url || !bundle.apiKey) {
                return NextResponse.json({ error: 'Data bundle tidak lengkap' }, { status: 400 });
            }
            bundle.id = Date.now().toString();
            bundles.push(bundle);
        } else if (action === 'DELETE') {
            bundles = bundles.filter(b => b.id !== id);
        }

        // 3. Simpan kembali ke Vercel ENV
        const newValue = JSON.stringify(bundles);
        
        if (existingEnv) {
            const delRes = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env/${existingEnv.id}`, {
                method: 'DELETE',
                headers
            });
            if (!delRes.ok) throw new Error('Gagal menghapus ENV lama');
        }
        
        const postRes = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ key: 'LIVEKIT_BUNDLES', value: newValue, type: 'encrypted', target: ['production', 'preview', 'development'] })
        });
        
        if (!postRes.ok) throw new Error('Gagal membuat ENV baru');

        return NextResponse.json({ success: true, bundles });

    } catch (error) {
        console.error('[Bundles API] ❌ Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
