// ============================================================
// CENTRAL KEY MANAGEMENT — Multi API Key Rotation & Failover
// ============================================================
// Semua API keys disimpan di sini sebagai array.
// Server akan round-robin dan otomatis switch jika key gagal.
// ============================================================

// --- LiveKit Credentials (10 akun) ---
export const LIVEKIT_KEYS = [
  {
    url: 'wss://lite-meet-kwu4mtkc.livekit.cloud',
    apiKey: 'APIHLXhwrEKz2FH',
    apiSecret: 'wdTfi6pqoufyGPBDVymEfwyIhIvIH5jKNE2QCSH0RigB',
  },
  {
    url: 'wss://lite-meet-4tar7uj8.livekit.cloud',
    apiKey: 'APIJU6HFAxyds2q',
    apiSecret: '30Dy8i4jjLWV1RjzaLrJF3O9eZgCievpuGWz9swue1jA',
  },
  {
    url: 'wss://lite-meet-aeauf2f2.livekit.cloud',
    apiKey: 'APIKJwQx6Uemxie',
    apiSecret: 'OTuXrfrxxgrefZJvVbWrRzBMukDTZFboYainyd1dFOfC',
  },
  {
    url: 'wss://lite-meet-yn5nbh6o.livekit.cloud',
    apiKey: 'API72bFBbC6ffxP',
    apiSecret: 'y2RGAMMg0T5I1gAUdWTPeHTJPqmvhRfQXZFgvwqh7yH',
  },
  {
    url: 'wss://lite-meet-edcxrqj8.livekit.cloud',
    apiKey: 'API7Jp9vPrUhdsy',
    apiSecret: 'VBZtWszE4rC46s2U0COAE4Vm8yfGPfaKx6z7zpSg0yfB',
  },
  {
    url: 'wss://litemeet-0ggmeatv.livekit.cloud',
    apiKey: 'API6Lbq4XzHBuNS',
    apiSecret: 'LKVegP5sS2MLn5xaX8GWuSgtrpdWH4YFcAWbtGP1nvc',
  },
  {
    url: 'wss://lite-meet-skuuao2e.livekit.cloud',
    apiKey: 'APIEYh4TMbKVjUH',
    apiSecret: 'dSflTgLmC8efhw0lKwP9BwPatG0sas2eI9ovGvRfPnDG',
  },
  {
    url: 'wss://lite-meet-tdt1jdt4.livekit.cloud',
    apiKey: 'APIzNTjhEQwV8xd',
    apiSecret: 'loaIYteNiSWrMcvcNtS1x38m1gJckKo1n9z8U7vjLZa',
  },
  {
    url: 'wss://lite-meet-dbqt1g5v.livekit.cloud',
    apiKey: 'API6NjrVSfHwfVZ',
    apiSecret: 'BT4ZWxX9wvjecyji1qq31QIpWejkfWhC4IOwj6ALDyTA',
  },
  {
    url: 'wss://lite-meet-kti21m00.livekit.cloud',
    apiKey: 'APIerapvr3rBCQE',
    apiSecret: '1GzJTOf8VeLnC2bpbYR02I7k4XRwSGoxSHJkJkhEpDZ',
  },
  {
    url: 'wss://lite-meet-n61x9bok.livekit.cloud',
    apiKey: 'APIFvhrjQtcP8Qf',
    apiSecret: 'DorPMfwVqMhFisS6mwZNNHFN4KH6BEjGSNmcIH8tW2M',
  },
];

// --- Pusher Credentials (2 akun) ---
export const PUSHER_KEYS = [
  {
    appId: '2106095',
    key: '285cf92fee7a1e5a6fe2',
    secret: '65502056986f0ac2a58b',
    cluster: 'ap1',
  },
  {
    appId: '2155304',
    key: '53d40bda13f82d13dba9',
    secret: '38b89db5dd2ad76b07c1',
    cluster: 'ap1',
  },
];

// --- Twilio Credentials (from env vars to pass GitHub secret scanning) ---
export const TWILIO_KEYS = [
  {
    accountSid: process.env.TWILIO_SID_1 || '',
    authToken: process.env.TWILIO_TOKEN_1 || '',
  },
  {
    accountSid: process.env.TWILIO_SID_2 || '',
    authToken: process.env.TWILIO_TOKEN_2 || '',
  },
];

// ============================================================
// In-memory index trackers (persist across requests in the
// same server process — resets on server restart which is fine)
// ============================================================
let livekitIndex = 0;
let pusherIndex = 0;
let twilioIndex = 0;

// Mapping Room ke Server LiveKit sudah DIHAPUS karena tidak kompatibel dengan Serverless.
// Sebagai gantinya, kita gunakan Deterministic Hashing.
export function hashRoomName(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// --- Round-robin getter: returns current key and advances index ---
// Masih dipakai untuk Pusher atau fallback, tapi untuk LiveKit Token sekarang pakai Hash
export function getLivekitKey(index = null) {
  const targetIndex = index !== null ? index : livekitIndex;
  const key = LIVEKIT_KEYS[targetIndex % LIVEKIT_KEYS.length];
  return { ...key, index: targetIndex % LIVEKIT_KEYS.length };
}

export function advanceLivekitKey() {
  livekitIndex = (livekitIndex + 1) % LIVEKIT_KEYS.length;
  return getLivekitKey();
}

export function getPusherKey() {
  return PUSHER_KEYS[pusherIndex % PUSHER_KEYS.length];
}

export function advancePusherKey() {
  pusherIndex = (pusherIndex + 1) % PUSHER_KEYS.length;
  console.log(`[KeyManager] 🔄 Switched to Pusher key #${pusherIndex} → ${PUSHER_KEYS[pusherIndex].appId}`);
  return getPusherKey();
}

export function getTwilioKey() {
  return TWILIO_KEYS[twilioIndex % TWILIO_KEYS.length];
}

export function advanceTwilioKey() {
  twilioIndex = (twilioIndex + 1) % TWILIO_KEYS.length;
  console.log(`[KeyManager] 🔄 Switched to Twilio key #${twilioIndex} → ${TWILIO_KEYS[twilioIndex].accountSid}`);
  return getTwilioKey();
}
