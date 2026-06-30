const { RoomServiceClient } = require('livekit-server-sdk');

// ===== ISI DENGAN KUNCI SERVER LAMA ANDA =====
const LIVEKIT_URL = 'wss://lite-meet-tdt1jdt4.livekit.cloud';
const API_KEY = 'APIzNTjhEQwV8xd';
const API_SECRET = 'loaIYteNiSWrMcvcNtS1x38m1gJckKo1n9z8U7vjLZa';
// =============================================

async function kickAllOldRooms() {
  console.log('Menghubungkan ke server LiveKit lama...');
  try {
    const svc = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);
    const rooms = await svc.listRooms();

    if (rooms.length === 0) {
      console.log('✅ Tidak ada room aktif di server ini.');
      return;
    }

    console.log(`⚠️ Menemukan ${rooms.length} room aktif. Memulai penghapusan...`);
    for (const r of rooms) {
      await svc.deleteRoom(r.name);
      console.log(`🚪 Berhasil menghapus/memutus room: ${r.name}`);
    }
    console.log('🎉 Selesai! Semua partisipan di server lama telah diputus.');
    console.log('Mereka sekarang akan otomatis reconnect dan diarahkan ke Server Baru oleh Vercel.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

kickAllOldRooms();


//node kick_old_server.js

