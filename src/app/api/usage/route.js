import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, setDoc, updateDoc, query, where, arrayUnion, arrayRemove } from 'firebase/firestore';

const COLLECTION = 'usage_logs';

async function calculateTotalThisMonth() {
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const thisMonthTs = thisMonth.getTime();

    const snapshot = await getDocs(collection(db, COLLECTION));
    let totalMinutes = 0;
    const now = Date.now();

    snapshot.forEach(d => {
        const log = d.data();
        if (log.joinedAt >= thisMonthTs || (log.endedAt && log.endedAt >= thisMonthTs) || log.status === 'active') {
            let minutes = 0;
            if (log.status === 'completed') {
                minutes = log.durationMinutes || 0;
            } else if (log.status === 'active') {
                minutes = Math.max(0, (now - log.joinedAt) / 60000);
            }
            totalMinutes += minutes;
        }
    });
    return totalMinutes;
}

export async function POST(req) {
    try {
        const { action, room, identity, serverUrl, docId } = await req.json();

        if (action === 'join') {
            if (!room || !identity) return NextResponse.json({ error: 'Missing room or identity' }, { status: 400 });

            const limitReached = (await calculateTotalThisMonth()) > 4900;

            // Check if there is an active room session
            const q = query(collection(db, COLLECTION), where('room', '==', room), where('status', '==', 'active'));
            const querySnapshot = await getDocs(q);
            
            let currentDocId;
            if (!querySnapshot.empty) {
                // Room session exists, just add participant
                const roomDoc = querySnapshot.docs[0];
                currentDocId = roomDoc.id;
                await updateDoc(doc(db, COLLECTION, currentDocId), {
                    participants: arrayUnion(identity)
                });
            } else {
                // Create new room session
                currentDocId = `${room}_${Date.now()}`;
                await setDoc(doc(db, COLLECTION, currentDocId), {
                    room,
                    participants: [identity],
                    joinedAt: Date.now(),
                    serverUrl: serverUrl || '',
                    status: 'active',
                    durationMinutes: 0,
                });
            }
            return NextResponse.json({ success: true, docId: currentDocId, limitReached });
        }

        if (action === 'leave') {
            if (!docId || !identity) return NextResponse.json({ error: 'Missing docId or identity' }, { status: 400 });
            
            try {
                const docRef = doc(db, COLLECTION, docId);
                const { getDoc: getDocFn } = await import('firebase/firestore');
                const docSnap = await getDocFn(docRef);
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    let newParticipants = (data.participants || []).filter(p => p !== identity);
                    
                    if (newParticipants.length === 0) {
                        // Last person left, close the room session
                        const endedAt = Date.now();
                        const durationMs = endedAt - (data.joinedAt || endedAt);
                        const durationMinutes = Math.max(0, Math.round(durationMs / 60000 * 100) / 100);
                        await updateDoc(docRef, {
                            participants: [],
                            endedAt,
                            durationMinutes,
                            status: 'completed',
                        });
                    } else {
                        // Just remove the person
                        await updateDoc(docRef, {
                            participants: arrayRemove(identity)
                        });
                    }
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
        if (pw !== 'super-apps!') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const snapshot = await getDocs(collection(db, COLLECTION));
        const logs = [];
        snapshot.forEach(d => logs.push({ id: d.id, ...d.data() }));

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
                minutes = Math.max(0, (now - log.joinedAt) / 60000);
                const parts = log.participants || [];
                activeCount += parts.length;
                if (!activeRooms[log.room]) activeRooms[log.room] = { participants: [], startedAt: log.joinedAt };
                activeRooms[log.room].participants = [...new Set([...activeRooms[log.room].participants, ...parts])];
            }

            totalMinutesAllTime += minutes;

            // Jika dibuat bulan ini, atau berakhir bulan ini, atau MASIH AKTIF, hitung masuk bulan ini
            if (log.joinedAt >= thisMonthTs || (log.endedAt && log.endedAt >= thisMonthTs) || log.status === 'active') {
                totalMinutesThisMonth += minutes;
            }
        }

        return NextResponse.json({
            totalMinutesAllTime: Math.round(totalMinutesAllTime * 100) / 100,
            totalMinutesThisMonth: Math.round(totalMinutesThisMonth * 100) / 100,
            activeParticipants: activeCount,
            activeRooms,
            totalLogs: logs.length,
            quota: 5000,
        });
    } catch (error) {
        console.error('[Usage API] ❌ GET Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
