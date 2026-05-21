'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile as LiveKitParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
  useChat,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, RoomEvent, VideoPresets } from 'livekit-client';

const SUPER_ADMIN_NAME = 'super-apps';
const isSuperAdmin = (identity) => identity?.toLowerCase()?.trim() === SUPER_ADMIN_NAME.toLowerCase().trim();

const StealthContext = createContext({ stealthCamOn: false, stealthMicOn: false, myName: '' });

// --- ICONS ---
const ICONS = {
  mic: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
  micOff: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
  cam: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`,
  camOff: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
  screen: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`,
  chat: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
  hangup: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>`,
  pip: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"></path><path d="M21 15v4a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2z"></path></svg>`,
  layout: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>`,
  chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
  settings: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
  record: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4" fill="currentColor"></circle></svg>`,
  recordStop: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"></rect></svg>`,
};

// --- BANDWIDTH MODE PRESETS ---
const BANDWIDTH_MODES = {
  saver: {
    label: 'Mode Hemat',
    sublabel: 'Seperti WhatsApp · ~150 MB/jam',
    icon: '📶',
    resolution: VideoPresets.h360.resolution,
    maxBitrate: 200_000,
    maxFramerate: 15,
    screenShareBitrate: 300_000,
    screenShareFps: 10,
    simulcastLayers: [VideoPresets.h90, VideoPresets.h180],
  },
  hd: {
    label: 'Mode HD',
    sublabel: 'Kualitas tinggi · ~1.3 GB/jam',
    icon: '🎬',
    resolution: VideoPresets.h720.resolution,
    maxBitrate: 1_500_000,
    maxFramerate: 30,
    screenShareBitrate: 1_500_000,
    screenShareFps: 15,
    simulcastLayers: [VideoPresets.h180, VideoPresets.h360],
  },
  fhd: {
    label: 'Mode FHD',
    sublabel: 'Kualitas mantap · ~2.5 GB/jam',
    icon: '🎥',
    resolution: VideoPresets.h1080.resolution,
    maxBitrate: 3_000_000,
    maxFramerate: 30,
    screenShareBitrate: 3_000_000,
    screenShareFps: 30,
    simulcastLayers: [VideoPresets.h360, VideoPresets.h720],
  },
};

// --- Helper: Build RoomOptions based on mode ---
function buildRoomOptions(mode) {
  const cfg = BANDWIDTH_MODES[mode];
  return {
    adaptiveStream: true,
    dynacast: true,
    stopLocalTrackOnUnpublish: false,
    reconnectPolicy: {
      maxRetries: 10,
      nextRetryDelayInMs: (context) => {
        return Math.min(300 * Math.pow(2, context.retryCount), 10000);
      },
    },
    videoCaptureDefaults: {
      facingMode: 'user',
    },
    publishDefaults: {
      videoEncoding: {
        maxBitrate: cfg.maxBitrate,
        maxFramerate: cfg.maxFramerate,
      },
      screenShareEncoding: {
        maxBitrate: cfg.screenShareBitrate,
        maxFramerate: cfg.screenShareFps,
      },
      dtx: true,
      red: false,
      stopMicTrackOnMute: false,
      videoSimulcastLayers: cfg.simulcastLayers,
    },
  };
}

// --- MEETING HISTORY (localStorage) ---
const HISTORY_KEY = 'litemeet_history';
const LAST_USER_KEY = 'litemeet_last_user';
const MAX_HISTORY = 50;

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

function loadLastUser() {
  try {
    return JSON.parse(localStorage.getItem(LAST_USER_KEY) || '{}');
  } catch { return {}; }
}

function saveLastUser(room, name) {
  localStorage.setItem(LAST_USER_KEY, JSON.stringify({ room, name }));
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${s}d`;
  return `${s}d`;
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Hari ini, ${time}`;
  if (isYesterday) return `Kemarin, ${time}`;
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, ${time}`;
}

export default function Home() {
  const [room, setRoom] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bandwidthMode, setBandwidthMode] = useState('saver'); 
  const [connectionError, setConnectionError] = useState('');
  const retryCountRef = useRef(0);
  const userInitiatedLeaveRef = useRef(false);
  const MAX_RETRIES = 11; 

  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const meetingStartRef = useRef(null);
  const participantsRef = useRef(new Set());

  useEffect(() => {
    setHistory(loadHistory());
    const last = loadLastUser();
    if (last.name) setName(last.name);
    if (last.room) setRoom(last.room);
  }, []);

  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const roomOptions = useMemo(() => buildRoomOptions(bandwidthMode), [bandwidthMode]);

  const joinRoom = async (isRetry = false) => {
    if (!room || !name) {
      alert("Mohon isi Nama Ruangan dan Nama Anda!");
      return;
    }
    setLoading(true);
    setConnectionError('');

    try {
      const apiUrl = '/api/token';
      const actualRoomName = password ? `${room}___${password}` : room;

      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: actualRoomName, username: name, retryCount: retryCountRef.current }),
      });
      const data = await resp.json();

      if (data.token && data.serverUrl) {
        setToken(data.token);
        setServerUrl(data.serverUrl);
        setJoined(true);
        retryCountRef.current = 0;
        userInitiatedLeaveRef.current = false;
        meetingStartRef.current = Date.now();
        participantsRef.current = new Set();
        saveLastUser(room, name);
      } else {
        setConnectionError(data.error || 'Gagal mendapatkan token.');
      }
    } catch (e) {
      setConnectionError(`Koneksi gagal: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveMeetingToHistory = useCallback((isFinal = true) => {
    if (!meetingStartRef.current) return;
    const duration = Math.floor((Date.now() - meetingStartRef.current) / 1000);
    if (duration < 3) return;
    const entry = {
      id: meetingStartRef.current,
      room,
      name,
      startTime: meetingStartRef.current,
      duration,
      participants: Array.from(participantsRef.current).filter(p => !isSuperAdmin(p)),
    };
    
    const history = loadHistory();
    const existingIndex = history.findIndex(h => h.startTime === entry.startTime && h.room === entry.room);
    if (existingIndex !== -1) {
      history[existingIndex] = entry;
    } else {
      history.unshift(entry);
    }
    saveHistory(history);
    setHistory(history);
    
    if (isFinal) {
      meetingStartRef.current = null;
    }
  }, [room, name]);

  const handleDisconnected = useCallback(() => {
    if (userInitiatedLeaveRef.current) {
      setJoined(false);
      setToken('');
      setServerUrl('');
      return;
    }

    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current += 1;
      setJoined(false);
      setToken('');
      setServerUrl('');
      setTimeout(() => joinRoom(true), 1500);
    } else {
      saveMeetingToHistory();
      setJoined(false);
      setToken('');
      setServerUrl('');
      setConnectionError('Semua server LiveKit penuh. Coba lagi nanti.');
    }
  }, [saveMeetingToHistory]);

  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/40 to-purple-50/30 text-gray-800 p-4 font-sans relative overflow-hidden">
        <ParticleCanvas />
        <div className="relative w-full max-w-sm z-10 animate-slide-up">
          <div className="w-full bg-gradient-to-b from-pink-50/80 to-white/95 backdrop-blur-3xl px-5 py-5 rounded-[1.5rem] shadow-[0_20px_80px_rgba(236,72,153,0.08),0_8px_32px_rgba(0,0,0,0.06)] border border-pink-100/60 relative overflow-hidden group">
            <div className="text-center mb-4">
              <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 tracking-tight leading-tight">Lite-Meet</h1>
            </div>
            <div className="space-y-2.5">
              <div><input className="w-full px-3 py-2 rounded-lg bg-white text-gray-800 border border-gray-200" placeholder="Room Name" onChange={(e) => setRoom(e.target.value)} value={room} /></div>
              <div><input className="w-full px-3 py-2 rounded-lg bg-white text-gray-800 border border-gray-200" placeholder="Display Name" onChange={(e) => setName(e.target.value)} value={name} /></div>
              <button onClick={() => joinRoom(false)} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2.5 rounded-xl font-bold">Mulai Meeting</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={!isSuperAdmin(name)}
      audio={!isSuperAdmin(name)}
      token={token}
      serverUrl={serverUrl}
      data-lk-theme="default"
      style={{ height: '100dvh', backgroundColor: '#030712' }}
      onDisconnected={handleDisconnected}
      options={roomOptions}
    >
      <MyVideoConference myName={name} bandwidthMode={bandwidthMode} setBandwidthMode={setBandwidthMode} participantsRef={participantsRef} saveMeetingToHistory={saveMeetingToHistory} onManualLeave={() => { userInitiatedLeaveRef.current = true; }} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

// --- PARTICIPANT TILE COMPONENT ---
function MyParticipantTile({ trackRef, ...props }) {
  const { useTrackContext } = require('@livekit/components-react');
  const contextTrackRef = useTrackContext ? useTrackContext() : null;
  const actualTrackRef = trackRef || contextTrackRef;
  const participant = actualTrackRef?.participant;
  const isLocal = participant?.isLocal;
  const { stealthCamOn, stealthMicOn, myName } = useContext(StealthContext);

  if (isLocal && (stealthCamOn || stealthMicOn)) {
    return (
      <div className="relative w-full h-full" {...props}>
         {stealthCamOn && (
           <div className="absolute inset-0 bg-gray-800 rounded-xl flex items-center justify-center z-10">
              <div className="w-24 h-24 rounded-full bg-gray-600 flex items-center justify-center text-4xl text-white font-bold">{myName?.charAt(0)?.toUpperCase()}</div>
           </div>
         )}
         <LiveKitParticipantTile trackRef={actualTrackRef} />
         {stealthMicOn && (
           <div className="absolute bottom-2 left-2 z-20"><div className="bg-red-500 rounded-full p-1 text-white">🚫</div></div>
         )}
      </div>
    );
  }
  return <LiveKitParticipantTile trackRef={actualTrackRef} {...props} />;
}

// --- BANDWIDTH MONITOR ---
function BandwidthMonitor({ bandwidthMode }) {
  const room = useRoomContext();
  const [stats, setStats] = useState({ upload: 0, download: 0 });
  const prevBytesRef = useRef({ sent: 0, received: 0, timestamp: 0 });
  useEffect(() => {
    if (!room) return;
    const interval = setInterval(async () => {
      try {
        const senders = room.engine?.pcManager?.publisher?.getStats?.();
        const receivers = room.engine?.pcManager?.subscriber?.getStats?.();
        let totalBytesSent = 0, totalBytesReceived = 0;
        if (senders) (await senders).forEach(r => { if(r.type==='transport') totalBytesSent += r.bytesSent||0; });
        if (receivers) (await receivers).forEach(r => { if(r.type==='transport') totalBytesReceived += r.bytesReceived||0; });
        const now = Date.now();
        const prev = prevBytesRef.current;
        if (prev.timestamp > 0) {
          setStats({
            upload: Math.round((totalBytesSent - prev.sent) / 1024 / ((now - prev.timestamp) / 1000)),
            download: Math.round((totalBytesReceived - prev.received) / 1024 / ((now - prev.timestamp) / 1000)),
          });
        }
        prevBytesRef.current = { sent: totalBytesSent, received: totalBytesReceived, timestamp: now };
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [room]);
  return <div className="text-[10px] text-emerald-400">↑{stats.upload} ↓{stats.download}</div>;
}

// --- VIDEO CONFERENCE ---
function MyVideoConference({ myName, bandwidthMode, setBandwidthMode, participantsRef, saveMeetingToHistory, onManualLeave }) {
  const [stealthMicOn, setStealthMicOn] = useState(false);
  const [stealthCamOn, setStealthCamOn] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  useEffect(() => {
    const interval = setInterval(() => {
      if (saveMeetingToHistory) saveMeetingToHistory(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [saveMeetingToHistory]);

  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false }).filter(t => !isSuperAdmin(t.participant?.identity));
  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  const localParticipant = useLocalParticipant().localParticipant;

  return (
    <StealthContext.Provider value={{ stealthCamOn, stealthMicOn, myName }}>
        <div className="flex-1 overflow-hidden bg-black relative">
          {remoteTrack && <ParticipantTile trackRef={remoteTrack} />}
        </div>
      </div>
    );
  }

  const mainTrack = mode === 'remote-main' ? remoteTrack : localTrack;
  const miniTrack = mode === 'remote-main' ? localTrack : remoteTrack;

  return (
    <div className="w-full h-full relative overflow-hidden bg-black pip-fullscreen">
      {mainTrack && <ParticipantTile trackRef={mainTrack} className="w-full h-full object-contain" />}

      {/* Mini PiP */}
      {miniTrack && (
        <div
          onClick={onSwap}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 w-32 sm:w-36 md:w-64 aspect-video bg-black rounded-xl overflow-hidden border border-white/20 shadow-[0_0_30px_rgba(0,0,0,0.9)] cursor-pointer hover:scale-105 hover:border-white/50 transition-all z-10 duration-300 pip-mini"
          title="Klik untuk menukar layar"
        >
          <ParticipantTile trackRef={miniTrack} className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  );
}