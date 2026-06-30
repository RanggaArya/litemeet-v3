import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

const COLLECTION = 'livekit_presets';

export async function POST(req) {
    try {
        const { action, password, preset, presetId } = await req.json();

        // Auth check
        if (password !== 'super-apps!') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (action === 'save') {
            // Save a new preset
            if (!preset || !preset.label || !preset.url || !preset.apiKey || !preset.apiSecret) {
                return NextResponse.json({ error: 'Missing preset fields' }, { status: 400 });
            }
            const id = `preset_${Date.now()}`;
            await setDoc(doc(db, COLLECTION, id), {
                label: preset.label,
                url: preset.url,
                apiKey: preset.apiKey,
                apiSecret: preset.apiSecret,
                isCurrent: false,
                createdAt: Date.now(),
            });
            return NextResponse.json({ success: true, presetId: id });
        }

        if (action === 'delete') {
            if (!presetId) {
                return NextResponse.json({ error: 'Missing presetId' }, { status: 400 });
            }
            await deleteDoc(doc(db, COLLECTION, presetId));
            return NextResponse.json({ success: true });
        }

        if (action === 'set-current') {
            if (!presetId) {
                return NextResponse.json({ error: 'Missing presetId' }, { status: 400 });
            }
            // First, unset all current flags
            const snapshot = await getDocs(collection(db, COLLECTION));
            const batch = writeBatch(db);
            snapshot.forEach(d => {
                batch.update(d.ref, { isCurrent: false });
            });
            // Then set the selected one as current
            batch.update(doc(db, COLLECTION, presetId), { isCurrent: true });
            await batch.commit();
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        console.error('[Presets API] ❌ Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const pw = searchParams.get('password');
        if (pw !== 'super-apps!') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const snapshot = await getDocs(collection(db, COLLECTION));
        const presets = [];
        snapshot.forEach(d => presets.push({ id: d.id, ...d.data() }));

        // Sort by createdAt desc
        presets.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        return NextResponse.json({ presets });
    } catch (error) {
        console.error('[Presets API] ❌ GET Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
