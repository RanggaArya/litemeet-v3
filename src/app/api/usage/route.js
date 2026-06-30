import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, setDoc, updateDoc, query, where, orderBy, deleteDoc } from 'firebase/firestore';

const COLLECTION = 'usage_logs';

export async function POST(req) {
    try {
        const { action, room, identity, serverUrl, docId, password } = await req.json();

        if (action === 'join') {
            // Record participant join
            if (!room || !identity) {
                return NextResponse.json({ error: 'Missing room or identity' }, { status: 400 });
            }
            const id = `${room}_${identity}_${Date.now()}`;
            await setDoc(doc(db, COLLECTION, id), {
                room,
                identity,
                joinedAt: Date.now(),
                serverUrl: serverUrl || '',
                status: 'active',
                durationMinutes: 0,
            });
            return NextResponse.json({ success: true, docId: id });
        }

        if (action === 'leave') {
            // Record participant leave
            if (!docId) {
                return NextResponse.json({ error: 'Missing docId' }, { status: 400 });
            }
            const leftAt = Date.now();
            try {
                const docRef = doc(db, COLLECTION, docId);
                // We need to read the doc to calculate duration
                const { getDoc: getDocFn } = await import('firebase/firestore');
                const docSnap = await getDocFn(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const durationMs = leftAt - (data.joinedAt || leftAt);
                    const durationMinutes = Math.max(0, Math.round(durationMs / 60000 * 100) / 100); // 2 decimal
                    await updateDoc(docRef, {
                        leftAt,
                        durationMinutes,
                        status: 'completed',
                    });
                }
            } catch (e) {
                console.warn('[Usage API] leave update error:', e.message);
            }
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        console.error('[Usage API] ❌ Error:', error);
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
        const logs = [];
        snapshot.forEach(d => logs.push({ id: d.id, ...d.data() }));

        // Calculate totals
        const now = Date.now();
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);
        const thisMonthTs = thisMonth.getTime();

        let totalMinutesAllTime = 0;
        let totalMinutesThisMonth = 0;
        let activeCount = 0;
        const activeRooms = {};

        for (const log of logs) {
            let minutes = 0;
            if (log.status === 'completed') {
                minutes = log.durationMinutes || 0;
            } else if (log.status === 'active') {
                // Still in room — calculate live duration
                minutes = Math.max(0, (now - log.joinedAt) / 60000);
                activeCount++;
                if (!activeRooms[log.room]) activeRooms[log.room] = { participants: [], startedAt: log.joinedAt };
                activeRooms[log.room].participants.push(log.identity);
            }

            totalMinutesAllTime += minutes;

            // This month check
            const joinedAt = log.joinedAt || 0;
            if (joinedAt >= thisMonthTs) {
                totalMinutesThisMonth += minutes;
            }
        }

        return NextResponse.json({
            totalMinutesAllTime: Math.round(totalMinutesAllTime * 100) / 100,
            totalMinutesThisMonth: Math.round(totalMinutesThisMonth * 100) / 100,
            activeParticipants: activeCount,
            activeRooms,
            totalLogs: logs.length,
            quota: 5000, // LiveKit free tier
        });
    } catch (error) {
        console.error('[Usage API] ❌ GET Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
