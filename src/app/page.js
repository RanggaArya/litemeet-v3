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
  useConnectionState,
  useMaybeTrackRefContext,
  useIsMuted,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, RoomEvent, VideoPresets, ConnectionState } from 'livekit-client';
import { nanoid } from 'nanoid';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from '@/lib/firebase';

const SUPER_ADMIN_NAME = 'super-apps';
const isSuperAdmin = (identity) => {
  const name = identity?.toLowerCase()?.trim();
  return name === 'super-apps' || name === 'super-apps!';
};

// ============ NOTIFICATION SOUNDS (like Google Meet) ============
const playSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    if (type === 'join') {
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      osc.frequency.setValueAtTime(523, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.12); // E5
      gain.gain.setValueAtTime(0.12, ctx.currentTime + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'leave') {
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime); // E5
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.12); // A4
      gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'connected') {
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    }
    setTimeout(() => ctx.close(), 1000);
  } catch (e) { console.warn('Audio play failed', e); }
};

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
    sublabel: 'Ramah kuota · ~80 MB/jam',
    icon: '📶',
    resolution: VideoPresets.h360.resolution,
    maxBitrate: 180_000,
    maxFramerate: 15,
    screenShareBitrate: 800_000,
    screenShareFps: 10,
    simulcastLayers: [],
  },
  hd: {
    label: 'Mode HD',
    sublabel: 'Kualitas standar · ~500 MB/jam',
    icon: '🎬',
    resolution: VideoPresets.h720.resolution,
    maxBitrate: 1_000_000,
    maxFramerate: 24,
    screenShareBitrate: 3_000_000,
    screenShareFps: 24,
    simulcastLayers: [VideoPresets.h180, VideoPresets.h360],
  },
  ultra: {
    label: 'Mode Ultra',
    sublabel: 'Sangat jernih 30fps · ~1.5 GB/jam',
    icon: '🎥',
    resolution: VideoPresets.h1080.resolution,
    maxBitrate: 2_500_000,
    maxFramerate: 30,
    screenShareBitrate: 5_000_000,
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
    // Prevent tracks from being stopped on reconnect or when minimized
    stopLocalTrackOnUnpublish: false,
    reconnectPolicy: {
      maxRetries: 3,
      nextRetryDelayInMs: (context) => {
        return Math.min(500 * Math.pow(2, context.retryCount), 5000);
      },
    },
    videoCaptureDefaults: {
      facingMode: 'user',
    },
    publishDefaults: {
      audioEncoding: {
        maxBitrate: 48_000,
      },
      videoEncoding: {
        maxBitrate: cfg.maxBitrate,
        maxFramerate: cfg.maxFramerate,
      },
      screenShareEncoding: {
        maxBitrate: cfg.screenShareBitrate,
        maxFramerate: cfg.screenShareFps,
      },
      dtx: true,
      red: true,
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

function addHistoryEntry(entry) {
  const history = loadHistory();
  history.unshift(entry);
  saveHistory(history);
}

function loadLastUser() {
  try {
    return JSON.parse(localStorage.getItem(LAST_USER_KEY) || '{}');
  } catch { return {}; }
}

function saveLastUser(room, name) {
  localStorage.setItem(LAST_USER_KEY, JSON.stringify({ room, name }));
}

function removeHistoryEntryLocal(id) {
  const history = loadHistory();
  const newHistory = history.filter(h => h.id !== id);
  saveHistory(newHistory);
  return newHistory;
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
  // --- AUTH STATE ---
  const [authUser, setAuthUser] = useState(null); // Firebase user or null
  const [authEmail, setAuthEmail] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [initialStatus, setInitialStatus] = useState('');
  const [initialRole, setInitialRole] = useState('');
  const [authScreen, setAuthScreen] = useState(true); // show auth screen first

  // --- CORE STATE ---
  const [room, setRoom] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [token, setToken] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bandwidthMode, setBandwidthMode] = useState('saver');
  const [connectionError, setConnectionError] = useState('');
  const [roomKey, setRoomKey] = useState(0);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminUrl, setAdminUrl] = useState('');
  const [adminApiKey, setAdminApiKey] = useState('');
  const [adminApiSecret, setAdminApiSecret] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [autoJoinPending, setAutoJoinPending] = useState(false);
  const retryCountRef = useRef(0);
  const userInitiatedLeaveRef = useRef(false);
  const hostSecretRef = useRef(''); // Unique secret to prove host ownership
  const MAX_RETRIES = 3;

  // --- NEW FEATURE STATES ---
  const [enableHostControls, setEnableHostControls] = useState(true);
  const [enableE2EE, setEnableE2EE] = useState(false);
  const [e2eePassphrase, setE2eePassphrase] = useState('');
  const [roomLink, setRoomLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  // --- PWA INSTALL PROMPT ---
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPWAInstall, setShowPWAInstall] = useState(false);
  const [isIOSSafari, setIsIOSSafari] = useState(false);
  const [isPWAInstalled, setIsPWAInstalled] = useState(false);
  const wakeLockRef = useRef(null);
  const silentAudioRef = useRef(null);

  // Detect PWA install state & platform
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Check if already installed as PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    setIsPWAInstalled(!!isStandalone);
    // Detect iOS Safari
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
    setIsIOSSafari(isIOS && isSafari);
    // Show install prompt on mobile browsers (not already PWA)
    const isMobile = /Android|iPhone|iPad|iPod/.test(ua);
    if (isMobile && !isStandalone) {
      const dismissed = localStorage.getItem('litemeet_pwa_dismissed');
      if (!dismissed || Date.now() - parseInt(dismissed) > 86400000) { // re-show after 24h
        setTimeout(() => setShowPWAInstall(true), 3000);
      }
    }
    // Intercept beforeinstallprompt (Android Chrome)
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); setShowPWAInstall(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handlePWAInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setIsPWAInstalled(true);
      setDeferredPrompt(null);
    }
    setShowPWAInstall(false);
  };

  const dismissPWAInstall = () => {
    setShowPWAInstall(false);
    localStorage.setItem('litemeet_pwa_dismissed', Date.now().toString());
  };

  // --- WAKE LOCK (Opsi 2: prevent screen off during meeting) ---
  useEffect(() => {
    if (!joined) {
      if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null; }
      return;
    }
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('[LiteMeet] 🔒 Wake Lock acquired');
          wakeLockRef.current.addEventListener('release', () => console.log('[LiteMeet] 🔓 Wake Lock released'));
        }
      } catch (e) { console.warn('[LiteMeet] Wake Lock failed:', e); }
    };
    requestWakeLock();
    // Re-acquire on visibility change
    const onVisChange = () => { if (document.visibilityState === 'visible' && joined) requestWakeLock(); };
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null; }
    };
  }, [joined]);

  // --- MEDIA SESSION API (Opsi 1: keep audio alive in background) ---
  useEffect(() => {
    if (!joined) {
      if (silentAudioRef.current) { silentAudioRef.current.pause(); silentAudioRef.current = null; }
      return;
    }
    try {
      // Create silent audio to keep the app alive in background on mobile
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.001; // near-silent
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      silentAudioRef.current = audioCtx;

      // Set Media Session metadata
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `Meeting: ${room}`,
          artist: 'LiteMeet',
          album: 'Video Conference',
        });
        navigator.mediaSession.setActionHandler('play', () => {});
        navigator.mediaSession.setActionHandler('pause', () => {});
      }
    } catch (e) { console.warn('[LiteMeet] Media Session setup failed:', e); }
    return () => {
      if (silentAudioRef.current) {
        try { silentAudioRef.current.close(); } catch {}
        silentAudioRef.current = null;
      }
    };
  }, [joined, room]);

  // --- AUTO PiP on visibility change (Opsi 3: keep video in PiP when minimized) ---
  useEffect(() => {
    if (!joined) return;
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') {
        // Try to enter PiP with the first remote video element
        try {
          const videos = document.querySelectorAll('video');
          for (const v of videos) {
            if (v.srcObject && !v.muted && v.readyState >= 2) {
              v.requestPictureInPicture?.().catch(() => {});
              break;
            }
          }
        } catch {}
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, [joined]);

  // --- FIREBASE AUTH LISTENER ---
  useEffect(() => {
    // Optimistic load from localStorage to prevent flash
    try {
      const cached = localStorage.getItem('litemeet_google_auth');
      if (cached) {
        const u = JSON.parse(cached);
        setName(u.name);
        setPhotoURL(u.photoURL);
        if (u.email) setAuthEmail(u.email);
        setAuthScreen(false); // bypass immediately
      }
    } catch {}

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser(user);
        setName(user.displayName || '');
        setPhotoURL(user.photoURL || '');
        setAuthEmail(user.email || '');
        setAuthScreen(false);
        localStorage.setItem('litemeet_google_auth', JSON.stringify({ name: user.displayName || '', photoURL: user.photoURL || '', email: user.email || '' }));
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      setAuthUser(result.user);
      setName(result.user.displayName || '');
      setPhotoURL(result.user.photoURL || '');
      setAuthEmail(result.user.email || '');
      localStorage.setItem('litemeet_google_auth', JSON.stringify({ name: result.user.displayName || '', photoURL: result.user.photoURL || '', email: result.user.email || '' }));
      setAuthScreen(false);
    } catch (err) {
      console.error('Google Sign-In failed:', err);
      // If popup blocked or auth failed, let user continue as guest
    }
  };

  const handleGuestContinue = () => {
    setAuthScreen(false);
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setAuthUser(null);
    setPhotoURL('');
    localStorage.removeItem('litemeet_google_auth');
  };

  // --- Meeting History ---
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const meetingStartRef = useRef(null);
  const participantsRef = useRef(new Set());

  // Load history & last-used credentials on mount
  useEffect(() => {
    setHistory(loadHistory());
    const last = loadLastUser();
    if (last.name) setName(last.name);
    if (last.room) setRoom(last.room);
  }, []);

  const removeHistoryEntry = (e, id) => {
    e.stopPropagation();
    const newHistory = removeHistoryEntryLocal(id);
    setHistory(newHistory);
    if (newHistory.length === 0) setShowHistory(false);
  };

  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // IMPORTANT: roomOptions must be stable ref to prevent LiveKitRoom remount on bandwidth switch
  // Bandwidth switching is handled dynamically via RTP sender params in toggleDataSaver
  const initialBandwidthRef = useRef(bandwidthMode);
  const roomOptions = useMemo(() => buildRoomOptions(initialBandwidthRef.current), []);

  const handleUpdateKeys = async () => {
    if (!adminUrl || !adminApiKey || !adminApiSecret) return alert('Semua field wajib diisi!');
    setAdminLoading(true);
    try {
      const isElectron = typeof window !== 'undefined' && window.electronAPI;
      const updateUrl = isElectron ? 'https://litemeet-v3.vercel.app/api/update-keys' : '/api/update-keys';
      
      const resp = await fetch(updateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'super-apps!', url: adminUrl, apiKey: adminApiKey, apiSecret: adminApiSecret })
      });
      const data = await resp.json();
      if (resp.ok) {
        alert("✅ Berhasil! Vercel sedang melakukan Redeploy. Mohon tunggu ~1 menit agar efeknya terasa.");
        setShowAdminPanel(false);
      } else {
        alert("❌ Gagal: " + (data.error || 'Unknown error'));
      }
    } catch(e) {
      alert("Error menghubungi server.");
    }
    setAdminLoading(false);
  };

  const joinRoom = async (isRetry = false) => {
    if (!room || !name) {
      alert("Mohon isi Nama Ruangan dan Nama Anda!");
      return;
    }

    setLoading(true);
    setConnectionError('');

    try {
      const isElectron = typeof window !== 'undefined' && window.electronAPI;
      const apiUrl = isElectron ? 'https://litemeet-v3.vercel.app/api/token' : '/api/token';
      
      const actualRoomName = password ? `${room}___${password}` : room;

      let localSecret = hostSecretRef.current;
      if (!localSecret && typeof window !== 'undefined') {
        try {
          const savedSecrets = JSON.parse(localStorage.getItem('litemeet_host_secrets') || '{}');
          localSecret = savedSecrets[actualRoomName] || '';
        } catch (e) {}
      }

      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: actualRoomName,
          username: name,
          photoURL: photoURL || '',
          email: authEmail || '',
          hostSecret: localSecret,
        }),
      });
      const data = await resp.json();

      if (data.token && data.serverUrl) {
        setToken(data.token);
        setServerUrl(data.serverUrl);
        setInitialStatus(data.status || '');
        setInitialRole(data.role || '');
        // If server assigned a different identity (due to duplicate nickname), update local name
        if (data.identity && data.identity !== name) {
          setName(data.identity);
        }
        // Store the hostSecret returned by the API so we can reclaim host on reconnect
        if (data.hostSecret) {
          hostSecretRef.current = data.hostSecret;
          if (typeof window !== 'undefined') {
            try {
              const savedSecrets = JSON.parse(localStorage.getItem('litemeet_host_secrets') || '{}');
              savedSecrets[actualRoomName] = data.hostSecret;
              localStorage.setItem('litemeet_host_secrets', JSON.stringify(savedSecrets));
            } catch(e) {}
          }
        }
        setJoined(true);
        retryCountRef.current = 0;
        userInitiatedLeaveRef.current = false;
        meetingStartRef.current = Date.now();
        participantsRef.current = new Set();
        saveLastUser(room, name);

        // Generate shareable room link
        const baseUrl = isElectron ? 'https://litemeet-v3.vercel.app' : window.location.origin;
        setRoomLink(`${baseUrl}?room=${encodeURIComponent(room)}${password ? `&pwd=${encodeURIComponent(password)}` : ''}`);

        console.log(`[LiteMeet] 🟢 Connected to Vercel ENV Server → ${data.serverUrl}`);
      } else {
        setConnectionError(data.error || 'Gagal mendapatkan token.');
      }
    } catch (e) {
      console.error(e);
      setConnectionError(`Koneksi gagal: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Handle URL-based room joining ---
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    const urlPwd = params.get('pwd');
    if (urlRoom) {
      setRoom(urlRoom);
      if (urlPwd) setPassword(urlPwd);
      setAutoJoinPending(true);
      // Clean URL without reloading
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (autoJoinPending && !authLoading) {
      // Wait a tiny bit for states to settle
      setTimeout(() => {
        if (name && room) {
          joinRoom();
        }
      }, 500);
      setAutoJoinPending(false);
    }
  }, [autoJoinPending, authLoading, name, room]);

  const copyRoomLink = () => {
    const isElectron = typeof window !== 'undefined' && window.electronAPI;
    const baseUrl = isElectron ? 'https://litemeet-v3.vercel.app' : window.location.origin;
    const link = `${baseUrl}?room=${encodeURIComponent(room)}${password ? `&pwd=${encodeURIComponent(password)}` : ''}`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  // Save meeting to history
  const saveMeetingToHistory = useCallback((isFinal = true) => {
    if (!meetingStartRef.current) return;
    const duration = Math.floor((Date.now() - meetingStartRef.current) / 1000);
    if (duration < 3) return; // don't save if < 3s (failed connects)
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

  // Auto-retry on unexpected disconnect — always reconnect to SAME server
  const handleDisconnected = useCallback(() => {
    if (userInitiatedLeaveRef.current) {
      setJoined(false);
      setToken('');
      setServerUrl('');
      return;
    }

    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current += 1;
      console.log(`[LiteMeet] 🔄 Disconnected — auto-retrying (attempt ${retryCountRef.current}/${MAX_RETRIES})...`);
      // Update roomKey to force LiveKitRoom remount without returning to lobby
      setRoomKey(prev => prev + 1);
    } else {
      console.log('[LiteMeet] ❌ Max retries reached, returning to lobby.');
      saveMeetingToHistory();
      setJoined(false);
      setToken('');
      setServerUrl('');
      setConnectionError('Koneksi terputus. Silakan coba lagi.');
    }
  }, [room, name, saveMeetingToHistory]);

  // --- AUTH SCREEN (before lobby) ---
  if (!joined && authScreen && !authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] text-white p-4 font-sans relative overflow-hidden">
        {/* --- PWA INSTALL POPUP --- */}
        {showPWAInstall && !isPWAInstalled && (
          <div className="fixed bottom-4 left-4 right-4 z-[200] animate-slide-up">
            <div className="bg-gray-900/95 backdrop-blur-xl border border-indigo-500/30 rounded-2xl shadow-2xl p-4 max-w-md mx-auto">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-white font-bold text-sm">Install LiteMeet</h4>
                  {isIOSSafari ? (
                    <p className="text-gray-400 text-xs mt-1">
                      Tap <span className="inline-flex items-center bg-white/10 px-1.5 py-0.5 rounded text-blue-400 font-medium">
                        <svg className="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M15 8a1 1 0 01.707 1.707l-5 5a1 1 0 01-1.414 0l-5-5A1 1 0 015 8h10z"/></svg>
                        Share
                      </span> lalu pilih <strong className="text-white">"Add to Home Screen"</strong> untuk pengalaman terbaik!
                    </p>
                  ) : (
                    <p className="text-gray-400 text-xs mt-1">Install di HP kamu untuk akses cepat, layar penuh, dan meeting yang lebih stabil!</p>
                  )}
                  <div className="flex gap-2 mt-3">
                    {deferredPrompt ? (
                      <button onClick={handlePWAInstall} className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-lg shadow-indigo-500/20">
                        📲 Install Sekarang
                      </button>
                    ) : !isIOSSafari ? (
                      <button onClick={dismissPWAInstall} className="bg-indigo-500/20 text-indigo-300 text-xs font-bold px-4 py-2 rounded-xl hover:bg-indigo-500/30 transition-colors border border-indigo-500/20">
                        Mengerti
                      </button>
                    ) : null}
                    <button onClick={dismissPWAInstall} className="text-gray-500 text-xs px-3 py-2 hover:text-white transition-colors">
                      Nanti
                    </button>
                  </div>
                </div>
                <button onClick={dismissPWAInstall} className="text-gray-500 hover:text-white transition-colors text-sm">✕</button>
              </div>
            </div>
          </div>
        )}
        {/* Animated gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] animate-pulse" style={{animationDelay: '1s'}} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-pink-600/10 rounded-full blur-[80px] animate-pulse" style={{animationDelay: '2s'}} />

        <div className="relative z-10 flex flex-col items-center gap-8 animate-slide-up">
          {/* Logo */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-2xl shadow-purple-500/30 animate-float">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </div>
              <div className="absolute -inset-2 bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 rounded-3xl blur-xl -z-10" />
            </div>
            <div className="text-center">
              <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 tracking-tight">Lite-Meet</h1>
              <p className="text-gray-500 text-xs tracking-[0.3em] font-semibold uppercase mt-1">Video Conference</p>
            </div>
          </div>

          {/* Auth buttons */}
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 py-3.5 px-6 rounded-2xl font-bold text-sm shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-700" />
              <span className="text-gray-500 text-xs font-medium">atau</span>
              <div className="flex-1 h-px bg-gray-700" />
            </div>

            <button
              onClick={handleGuestContinue}
              className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-gray-300 py-3.5 px-6 rounded-2xl font-bold text-sm border border-white/10 hover:border-white/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              👤 Masuk sebagai Guest
            </button>
          </div>

          <p className="text-gray-600 text-[10px] font-medium">Powered by Aralya @2026 • v0.2.0</p>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/40 to-purple-50/30 text-gray-800 p-4 font-sans relative overflow-hidden">
        <ParticleCanvas />

        <div className="relative w-full max-w-sm z-10 animate-slide-up">
          <div className="w-full bg-gradient-to-b from-pink-50/80 to-white/95 backdrop-blur-3xl px-5 py-5 rounded-[1.5rem] shadow-[0_20px_80px_rgba(236,72,153,0.08),0_8px_32px_rgba(0,0,0,0.06)] border border-pink-100/60 relative overflow-hidden group">
            {/* Efek kilap on hover */}
            <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-40 group-hover:animate-shine"></div>

            {/* Clock */}
            <div className="absolute top-3 right-4 text-[10px] font-mono text-gray-400 font-medium z-10">{currentTime}</div>

          {/* User info bar (if logged in with Google) */}
          {authUser && (
            <div className="flex items-center gap-2 mb-3 bg-indigo-50/80 rounded-lg px-3 py-2 border border-indigo-100">
              <img src={authUser.photoURL} alt="" className="w-7 h-7 rounded-full border border-indigo-200" referrerPolicy="no-referrer" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-indigo-700 truncate">{authUser.displayName}</div>
                <div className="text-[8px] text-indigo-400 truncate">{authUser.email}</div>
              </div>
              <button onClick={handleSignOut} className="text-[9px] text-indigo-400 hover:text-red-500 font-bold transition-colors">Logout</button>
            </div>
          )}

          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 mb-3 shadow-lg ring-3 ring-pink-100 animate-float">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </div>
            <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 tracking-tight leading-tight">Lite-Meet</h1>
            <p className="text-gray-400 text-[9px] tracking-[0.2em] font-bold uppercase mt-0.5">Video Conference</p>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="text-[9px] font-bold text-gray-400 uppercase ml-1 mb-0.5 block tracking-wider">Room Name</label>
              <div className="flex gap-1.5">
                <input className="flex-1 px-3 py-2 rounded-lg bg-white text-gray-800 border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all text-sm font-medium" placeholder="Ex: DailyCall" onChange={(e) => setRoom(e.target.value)} value={room} />
                {room && (
                  <button onClick={copyRoomLink} title="Salin link room" className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all ${linkCopied ? 'bg-green-50 border-green-300 text-green-600' : 'bg-white border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-500'}`}>
                    {linkCopied ? '✓' : '🔗'}
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="text-[9px] font-bold text-gray-400 uppercase ml-1 mb-0.5 block tracking-wider">Display Name</label>
              <input className="w-full px-3 py-2 rounded-lg bg-white text-gray-800 border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all text-sm font-medium" placeholder="Ex: Ara" onChange={(e) => setName(e.target.value)} value={name} />
            </div>

            <div>
              <label className="text-[9px] font-bold text-gray-400 uppercase ml-1 mb-0.5 block tracking-wider">Password (Opsional)</label>
              <input type="password" maxLength={20} className="w-full px-3 py-2 rounded-lg bg-white text-gray-800 border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all text-sm font-medium" placeholder="Kosongkan jika publik" onChange={(e) => setPassword(e.target.value)} value={password} />
            </div>


            {/* === MODE SELECTION (ULTRA COMPACT) === */}
            <div>
              <label className="text-[9px] font-bold text-gray-400 uppercase ml-1 mb-1 block tracking-wider">Kualitas Video</label>
              <div className="flex gap-1.5">
                {Object.entries(BANDWIDTH_MODES).map(([key, mode]) => (
                  <button
                    key={key}
                    onClick={() => setBandwidthMode(key)}
                    className={`flex-1 px-1 py-1.5 rounded-lg border transition-all duration-200 text-center flex items-center justify-center gap-1
                      ${bandwidthMode === key
                        ? key === 'saver'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm'
                          : key === 'hd' ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm' : 'bg-purple-50 border-purple-300 text-purple-700 shadow-sm'
                        : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}
                  >
                    <span className="text-xs leading-none">{mode.icon}</span>
                    <span className={`text-[9px] font-bold ${bandwidthMode === key ? '' : 'text-gray-400'}`}>{key === 'saver' ? 'Hemat' : key.toUpperCase()}</span>
                  </button>
                ))}
              </div>
              <div className={`mt-1.5 px-2.5 py-1 rounded-md text-[9px] flex items-center gap-1.5 font-medium ${
                bandwidthMode === 'saver' ? 'bg-emerald-50 border border-emerald-100 text-emerald-600'
                : bandwidthMode === 'hd' ? 'bg-blue-50 border border-blue-100 text-blue-600'
                : 'bg-purple-50 border border-purple-100 text-purple-600'
              }`}>
                <span>{bandwidthMode === 'saver' ? '🌿' : bandwidthMode === 'hd' ? '🎬' : '⚠️'}</span>
                <span>{bandwidthMode === 'saver' ? 'Hemat ~85% (360p)' : bandwidthMode === 'hd' ? 'Kualitas standar (720p)' : 'Sangat Jernih ~1.5 GB/jam (1080p)'}</span>
              </div>
            </div>

            {/* === FEATURE TOGGLES === */}
            <div className="flex flex-wrap gap-1.5">
              {/* Waiting Room Toggle */}

            </div>

            {connectionError && (
              <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[10px] font-medium flex items-center gap-1.5 mt-1">
                <span>⚠️</span>
                <span>{connectionError}</span>
              </div>
            )}

            <button onClick={() => joinRoom(false)} disabled={loading || (enableE2EE && !e2eePassphrase)} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-200/50 transition-all transform hover:-translate-y-0.5 active:translate-y-0 mt-1 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "⏳ Menghubungkan..." : "Mulai Meeting"}
            </button>

            {(name.trim().toLowerCase() === 'super-apps' || name.trim().toLowerCase() === 'super-apps!') && password === 'super-apps!' && (
              <button
                onClick={() => setShowAdminPanel(true)}
                className="w-full mt-2 h-9 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-bold text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-2"
              >
                🔧 SERVER ADMIN PANEL
              </button>
            )}

            <p className="text-center text-[9px] text-gray-300 font-medium mt-1">Powered by Aralya @2026 • v0.2.0</p>
          </div>
        </div>

        {/* === MEETING HISTORY PANEL (right side, top-aligned) === */}
        {history.length > 0 && (
          <div className="absolute top-0 left-[calc(100%+1rem)] w-[300px] z-10 flex flex-col max-h-[85vh]">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-white/80 backdrop-blur-xl rounded-xl border border-gray-200/60 shadow-sm hover:shadow-md transition-all text-left group flex-shrink-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">📋</span>
                <span className="text-[11px] font-bold text-gray-600">Riwayat Meeting</span>
                <span className="text-[9px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold">{history.length}</span>
              </div>
              <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${showHistory ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><polyline points="6 9 12 15 18 9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>

            {showHistory && (
              <div className="mt-1.5 bg-white/90 backdrop-blur-xl rounded-xl border border-gray-200/60 shadow-lg overflow-hidden flex flex-col flex-1 min-h-0">
                <div className="overflow-y-auto divide-y divide-gray-100 flex-1">
                  {history.map((h) => (
                    <div key={h.id} className="relative group/item">
                      <button onClick={() => { setRoom(h.room); setName(h.name); setShowHistory(false); }} className="w-full px-3.5 py-2.5 flex items-start gap-3 hover:bg-indigo-50/60 transition-colors text-left group pr-8">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-gray-800 truncate">{h.room}</span>
                            <span className="text-[9px] text-gray-400 flex-shrink-0">{formatDate(h.startTime)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] text-gray-400">⏱ {formatDuration(h.duration)}</span>
                            <span className="text-[9px] text-gray-300">•</span>
                            <span className="text-[9px] text-gray-400">👤 {h.participants.length > 0 ? h.participants[0] : 'Hanya Anda'}</span>
                          </div>
                          {h.participants && h.participants.length > 1 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {h.participants.slice(1, 4).map((p, i) => (
                                <span key={i} className="text-[8px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{p}</span>
                              ))}
                              {h.participants.length > 4 && (
                                <span className="text-[8px] text-gray-400">+{h.participants.length - 4} lainnya</span>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                      <button onClick={(e) => removeHistoryEntry(e, h.id)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover/item:opacity-100 transition-all" title="Hapus riwayat ini">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
                  <button onClick={() => { saveHistory([]); setHistory([]); setShowHistory(false); }} className="text-[9px] text-red-400 hover:text-red-600 font-medium transition-colors">
                    🗑️ Hapus Semua Riwayat
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </div>

        {/* Admin Panel Modal */}
        {showAdminPanel && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scale-in">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span>🔧</span> LiveKit Server Keys
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">LiveKit URL</label>
                  <input className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 text-gray-800" placeholder="wss://..." value={adminUrl} onChange={e=>setAdminUrl(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">API Key</label>
                  <input className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 text-gray-800" placeholder="API..." value={adminApiKey} onChange={e=>setAdminApiKey(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">API Secret</label>
                  <input type="password" className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 text-gray-800" placeholder="Secret..." value={adminApiSecret} onChange={e=>setAdminApiSecret(e.target.value)} />
                </div>
                <div className="flex gap-2 mt-4 pt-2">
                  <button onClick={() => setShowAdminPanel(false)} className="flex-1 py-2 rounded-lg font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors text-sm">Batal</button>
                  <button onClick={handleUpdateKeys} disabled={adminLoading} className="flex-1 py-2 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors text-sm flex justify-center items-center">
                    {adminLoading ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> : 'Simpan & Deploy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Version info */}
        <div className="absolute bottom-3 right-4 z-10 text-[9px] text-gray-400/60 font-mono">App Version 0.2.0</div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      key={roomKey}
      video={!isSuperAdmin(name)}
      audio={!isSuperAdmin(name)}
      token={token}
      serverUrl={serverUrl}
      data-lk-theme="default"
      style={{ height: '100dvh', backgroundColor: '#030712' }}
      onDisconnected={handleDisconnected}
      options={roomOptions}
    >
      <MyVideoConference myName={name} myPhotoURL={photoURL} bandwidthMode={bandwidthMode} setBandwidthMode={setBandwidthMode} participantsRef={participantsRef} saveMeetingToHistory={saveMeetingToHistory} onManualLeave={() => { userInitiatedLeaveRef.current = true; }} roomLink={roomLink} initialStatus={initialStatus} initialRole={initialRole} hostSecret={hostSecretRef.current} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

// --- BANDWIDTH MONITOR COMPONENT ---
function BandwidthMonitor({ bandwidthMode }) {
  const room = useRoomContext();
  const [stats, setStats] = useState({ upload: 0, download: 0 });
  const prevBytesRef = useRef({ sent: 0, received: 0, timestamp: 0 });

  useEffect(() => {
    if (!room) return;

    const interval = setInterval(async () => {
      try {
        // Get stats from all peer connections via the room's engine
        const senders = room.engine?.pcManager?.publisher?.getStats?.();
        const receivers = room.engine?.pcManager?.subscriber?.getStats?.();

        let totalBytesSent = 0;
        let totalBytesReceived = 0;

        if (senders) {
          const senderStats = await senders;
          senderStats.forEach((report) => {
            if (report.type === 'transport') {
              totalBytesSent += report.bytesSent || 0;
              totalBytesReceived += report.bytesReceived || 0;
            }
          });
        }

        if (receivers) {
          const receiverStats = await receivers;
          receiverStats.forEach((report) => {
            if (report.type === 'transport') {
              totalBytesSent += report.bytesSent || 0;
              totalBytesReceived += report.bytesReceived || 0;
            }
          });
        }

        const now = Date.now();
        const prev = prevBytesRef.current;

        if (prev.timestamp > 0) {
          const elapsed = (now - prev.timestamp) / 1000;
          if (elapsed > 0) {
            const uploadKBps = Math.max(0, (totalBytesSent - prev.sent) / 1024 / elapsed);
            const downloadKBps = Math.max(0, (totalBytesReceived - prev.received) / 1024 / elapsed);
            setStats({
              upload: Math.round(uploadKBps),
              download: Math.round(downloadKBps),
            });
          }
        }

        prevBytesRef.current = { sent: totalBytesSent, received: totalBytesReceived, timestamp: now };
      } catch {
        // Stats not available — silently ignore
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [room]);

  const totalKBps = stats.upload + stats.download;
  const statusColor = bandwidthMode === 'saver' ? 'text-emerald-400' : bandwidthMode === 'hd' ? 'text-yellow-400' : 'text-red-400';
  const statusDot = bandwidthMode === 'saver' ? 'bg-emerald-400' : bandwidthMode === 'hd' ? 'bg-yellow-400' : 'bg-red-400';
  const modeLabel = BANDWIDTH_MODES[bandwidthMode]?.label || '';

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${statusDot} animate-pulse`}></div>
      <span className={`text-[8px] sm:text-[10px] ${statusColor} font-bold uppercase leading-none`}>{modeLabel}</span>
      <span className="text-blue-300 text-[8px] sm:text-[10px]">↑{stats.upload}</span>
      <span className="text-green-300 text-[8px] sm:text-[10px]">↓{stats.download}</span>
    </div>
  );
}

// --- DEVICE SELECTOR DROPDOWN COMPONENT ---
const DeviceSelector = ({ type, isOpen, onClose, onSelect, selectedId, devices }) => {
  if (!isOpen) return null;
  return (
    <div className="absolute bottom-full left-0 mb-4 w-64 bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-slide-up origin-bottom">
      <div className="p-3 border-b border-white/10 bg-black/40 flex justify-between items-center">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Pilih {type === 'mic' ? 'Mikrofon' : 'Kamera'}
        </span>
      </div>
      <div className="max-h-52 overflow-y-auto custom-scrollbar">
        {devices.length === 0 ? (
          <div className="px-4 py-3 text-gray-500 text-sm italic">Tidak ada perangkat terdeteksi</div>
        ) : devices.map((device) => (
          <button
            key={device.deviceId}
            onClick={() => { onSelect(device.deviceId); onClose(); }}
            className={`w-full text-left px-4 py-3 text-sm transition-all flex items-center gap-3 border-b border-white/5 last:border-b-0
              ${selectedId === device.deviceId
                ? 'bg-indigo-600/20 text-indigo-200'
                : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
          >
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedId === device.deviceId ? 'bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'bg-gray-600'}`} />
            <span className="truncate">{device.label || `${type === 'mic' ? 'Microphone' : 'Camera'} ${device.deviceId.slice(0, 6)}`}</span>
            {selectedId === device.deviceId && (
              <span className="ml-auto text-indigo-400 text-xs">✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

const ParticleCanvas = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let particles = [];
    let mouse = { x: null, y: null, radius: 180 };
    let time = 0;

    const handleMouseMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const handleTouchMove = (e) => { if (e.touches[0]) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; } };
    const handleMouseLeave = () => { mouse.x = null; mouse.y = null; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('mouseout', handleMouseLeave);

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; init(); };
    window.addEventListener('resize', resize);

    class Particle {
      constructor(x, y, size, color, hue) {
        this.x = x; this.y = y; this.size = size; this.color = color; this.hue = hue;
        this.baseX = x; this.baseY = y;
        this.density = (Math.random() * 40) + 5;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.3;
        this.life = Math.random() * Math.PI * 2;
      }
      draw() {
        const pulse = 0.6 + Math.sin(this.life) * 0.4;
        ctx.globalAlpha = pulse * 0.85;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * (0.8 + Math.sin(this.life) * 0.2), 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        // glow
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 3);
        g.addColorStop(0, this.color.replace(')', ',0.15)').replace('rgb', 'rgba'));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      update() {
        this.life += 0.015;
        // ambient drift
        this.baseX += this.vx; this.baseY += this.vy;
        if (this.baseX < 0 || this.baseX > canvas.width) this.vx *= -1;
        if (this.baseY < 0 || this.baseY > canvas.height) this.vy *= -1;

        if (mouse.x != null && mouse.y != null) {
          let dx = mouse.x - this.x, dy = mouse.y - this.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouse.radius) {
            let force = (mouse.radius - dist) / mouse.radius;
            this.x -= (dx / dist) * force * this.density * 0.6;
            this.y -= (dy / dist) * force * this.density * 0.6;
          } else {
            this.x += (this.baseX - this.x) * 0.05;
            this.y += (this.baseY - this.y) * 0.05;
          }
        } else {
          this.x += (this.baseX - this.x) * 0.05;
          this.y += (this.baseY - this.y) * 0.05;
        }
        this.draw();
      }
    }

    const init = () => {
      particles = [];
      const colors = [
        'rgb(99,102,241)', 'rgb(139,92,246)', 'rgb(236,72,153)',
        'rgb(59,130,246)', 'rgb(16,185,129)', 'rgb(245,158,11)'
      ];
      const count = Math.min(220, Math.floor((canvas.width * canvas.height) / 4000));
      for (let i = 0; i < count; i++) {
        particles.push(new Particle(
          Math.random() * canvas.width, Math.random() * canvas.height,
          (Math.random() * 2.5) + 1, colors[Math.floor(Math.random() * colors.length)], Math.random() * 360
        ));
      }
    };

    const connectParticles = () => {
      const maxDist = 120;
      for (let a = 0; a < particles.length; a++) {
        for (let b = a + 1; b < particles.length; b++) {
          const dx = particles[a].x - particles[b].x;
          const dy = particles[a].y - particles[b].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDist) {
            ctx.strokeStyle = `rgba(99,102,241,${0.08 * (1 - dist / maxDist)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[a].x, particles[a].y);
            ctx.lineTo(particles[b].x, particles[b].y);
            ctx.stroke();
          }
        }
      }
    };

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 0.01;
      for (let i = 0; i < particles.length; i++) particles[i].update();
      connectParticles();
    };

    resize(); animate();
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseout', handleMouseLeave);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 z-0" />;
};

function MyParticipantTile({ trackRef, ...props }) {
  const contextTrackRef = useMaybeTrackRefContext();
  const actualTrackRef = trackRef || contextTrackRef;
  const participant = actualTrackRef?.participant;
  const isLocal = participant?.isLocal;
  
  const { stealthCamOn, stealthMicOn, myName, myPhotoURL } = useContext(StealthContext);

  // Get participant's photo from metadata
  const participantPhoto = useMemo(() => {
    try {
      const meta = JSON.parse(participant?.metadata || '{}');
      return meta.photoURL || '';
    } catch { return ''; }
  }, [participant?.metadata]);

  const isCameraMuted = useIsMuted(Track.Source.Camera, { participant });
  const photoToShow = (isLocal && stealthCamOn) ? myPhotoURL : participantPhoto;
  const hasAvatarOverlay = isCameraMuted && photoToShow && !(isLocal && stealthCamOn);

  return (
    <div className={`relative w-full h-full group${hasAvatarOverlay ? ' has-avatar' : ''}`} {...props}>
      <LiveKitParticipantTile trackRef={actualTrackRef} />

      {/* Google avatar overlay — covers entire tile with dark bg to hide default SVG */}
      {hasAvatarOverlay && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 2,
          backgroundColor: 'var(--lk-bg2, #1e1e1e)',
          borderRadius: 'inherit',
        }}>
          <img
            src={photoToShow}
            alt=""
            referrerPolicy="no-referrer"
            style={{
              width: 'min(40%, 160px)',
              aspectRatio: '1',
              minWidth: '80px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '4px solid rgba(55,65,81,0.5)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
          />
        </div>
      )}

      {/* For stealth mode specifically (local only) */}
      {isLocal && stealthCamOn && (
         <div className="absolute inset-0 bg-[#1f2937] flex items-center justify-center z-10 rounded-[inherit]">
           {photoToShow ? (
             <div className="relative">
               <div className="absolute -inset-4 bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 rounded-full blur-xl" />
               <img src={photoToShow} alt="" className="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover border-2 border-white/20 shadow-2xl relative z-10" referrerPolicy="no-referrer" />
             </div>
           ) : (
             <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gray-600/50 rounded-full flex items-center justify-center overflow-hidden">
               <svg className="w-20 h-20 sm:w-28 sm:h-28 text-gray-400 mt-4 sm:mt-6" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
               </svg>
             </div>
           )}
         </div>
      )}
         
      {isLocal && stealthMicOn && (
         <div className="absolute bottom-1 left-1 z-20 pointer-events-none flex items-center">
            <div className="bg-black/60 backdrop-blur-md px-1.5 py-1 rounded text-white flex items-center gap-1.5 shadow-sm">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M12.143 9.733V6.305H11v3.428c0 .49-.107.954-.299 1.375l.963.963a4.135 4.135 0 0 0 .479-2.338ZM12.75 12.292 13.568 12.764 14.414 11.3 1.586 3.892.739 5.358l3.158 1.824c-.033.175-.05.358-.05.546v2.005c0 1.725 1.314 3.143 3 3.328v1.796H8.848v-1.809a4.148 4.148 0 0 0 1.522-.513l1.389.802c-.588.447-1.315.739-2.111.831V16H6.048v-1.832C4.054 13.916 2.514 12.215 2.514 10.143V7.729c0-.302.037-.595.106-.876l-.868-.502V5.486H3.648v.507L5.458 7.038c-.007.05-.01.1-.01.15v2.545c0 1.293 1.048 2.341 2.34 2.341.83 0 1.56-.432 1.951-1.088l3.01 1.307ZM6.59 5.617V5.167c0-.562.456-1.017 1.018-1.017h.455c.562 0 1.018.455 1.018 1.017v2.94l1.143.66V5.167C10.223 3.973 9.256 3.007 8.063 3.007H7.608C6.733 3.007 5.98 3.526 5.656 4.288L6.59 4.828v.789Z"/>
              </svg>
              <span className="text-[11px] font-medium leading-none pb-[1px]">{myName}</span>
            </div>
         </div>
      )}
    </div>
  );
}
function MyVideoConference({ myName, myPhotoURL, bandwidthMode, setBandwidthMode, participantsRef, saveMeetingToHistory, onManualLeave, roomLink, initialStatus, initialRole, hostSecret }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState([]);
  const { chatMessages, send } = useChat();

  // --- CUSTOM CHAT WITH DM ---
  const [customChatMessages, setCustomChatMessages] = useState([]);
  const [chatTarget, setChatTarget] = useState('all'); // 'all' or participant identity
  const [chatInput, setChatInput] = useState('');
  const [showHostPanel, setShowHostPanel] = useState(false);
  const [linkCopiedInMeeting, setLinkCopiedInMeeting] = useState(false);
  const [meetingStart] = useState(Date.now());
  const [durationStr, setDurationStr] = useState('00:00');
  const [isDesktopApp, setIsDesktopApp] = useState(false);
  
  const connectionState = useConnectionState();

  // --- DEVICE SELECTOR STATE ---
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedMicId, setSelectedMicId] = useState('');
  const [selectedCamId, setSelectedCamId] = useState('');
  const [showMicSelector, setShowMicSelector] = useState(false);
  const [showCamSelector, setShowCamSelector] = useState(false);

  // --- DESKTOP SCREEN SHARE PICKER STATE ---
  const [desktopSources, setDesktopSources] = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  // --- REACTIVE PARTICIPANT TRACKING for history ---
  const remoteParticipantsForHistory = useRemoteParticipants();
  useEffect(() => {
    if (!participantsRef?.current) return;
    remoteParticipantsForHistory.forEach(p => {
      if (!isSuperAdmin(p.identity)) {
        participantsRef.current.add(p.identity);
      }
    });
  }, [remoteParticipantsForHistory, participantsRef]);

  // --- Enumerate devices ---
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
      setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
    } catch (e) {
      console.warn('Failed to enumerate devices:', e);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      if (window.electronAPI.isDesktop) {
        setIsDesktopApp(true);
      }
      if (typeof window.electronAPI.setInMeeting === 'function') {
        window.electronAPI.setInMeeting(true);
        // Clean up when leaving meeting
        return () => window.electronAPI.setInMeeting(false);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onDesktopPicker) {
      window.electronAPI.onDesktopPicker((sources) => {
        setDesktopSources(sources);
      });
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.floor((Date.now() - meetingStart) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setDurationStr(h > 0 ? `${h.toString().padStart(2, '0')}:${m}:${s}` : `${m}:${s}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [meetingStart]);

  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipantsRaw = useRemoteParticipants();

  const localMeta = useMemo(() => {
    try { return JSON.parse(localParticipant?.metadata || '{}'); } 
    catch(e) { return {}; }
  }, [localParticipant?.metadata]);

  // FIX: Only the true room creator (who has a valid hostSecret and matching username) or super admins get host controls.
  const isHost = useMemo(() => {
    if (isSuperAdmin(myName)) return true;
    try {
      const roomMeta = JSON.parse(room?.metadata || '{}');
      if (roomMeta.hostName) {
        return !!hostSecret && myName === roomMeta.hostName;
      }
    } catch {}
    return !!hostSecret && (localMeta.role === 'host' || initialRole === 'host');
  }, [myName, hostSecret, room?.metadata, localMeta.role, initialRole]);
  const isWaiting = localMeta.status ? localMeta.status === 'waiting' : initialStatus === 'waiting';

  const [isWaitingRoomEnabled, setIsWaitingRoomEnabled] = useState(() => {
    try { return JSON.parse(room?.metadata || '{}').waitingRoom === true; } catch { return false; }
  });

  useEffect(() => {
    if (!room) return;
    const handleRoomMeta = (metadata) => {
      try { setIsWaitingRoomEnabled(JSON.parse(metadata || '{}').waitingRoom === true); } catch {}
    };
    room.on('roomMetadataChanged', handleRoomMeta);
    // Init in case it changed before listener attached
    handleRoomMeta(room.metadata);
    return () => room.off('roomMetadataChanged', handleRoomMeta);
  }, [room]);

  const toggleWaitingRoom = async () => {
    try {
      const currentMeta = JSON.parse(room.metadata || '{}');
      const newMeta = JSON.stringify({ ...currentMeta, waitingRoom: !isWaitingRoomEnabled });
      const baseUrl = isDesktopApp ? 'https://litemeet-v3.vercel.app' : '';
      
      // Optimistic update
      setIsWaitingRoomEnabled(!isWaitingRoomEnabled);
      addToast(`🚪 Ruang Tunggu ${!isWaitingRoomEnabled ? 'AKTIF' : 'NONAKTIF'}`, 'info');

      await fetch(baseUrl + '/api/room-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-room-meta', room: room.name, metadata: newMeta })
      });
    } catch(e) { 
      console.error('Failed to toggle waiting room', e); 
      // Revert on error
      setIsWaitingRoomEnabled(isWaitingRoomEnabled);
      addToast('❌ Gagal mengubah ruang tunggu', 'error');
    }
  };

  const isAdmin = isSuperAdmin(myName);
  const remoteParticipants = remoteParticipantsRaw.filter(p => {
    if (isSuperAdmin(p.identity)) return false;
    try { return JSON.parse(p.metadata || '{}').status !== 'waiting'; } catch { return true; }
  });

  const [oneOnOneMode, setOneOnOneMode] = useState('remote-main'); // 'remote-main', 'local-main', 'grid'

  // --- Admin & Stealth States ---
  const [stealthMicOn, setStealthMicOn] = useState(false);
  const [stealthCamOn, setStealthCamOn] = useState(false);
  const [stealthScreenOn, setStealthScreenOn] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showParticipantList, setShowParticipantList] = useState(false);
  const [stealthScreenTargets, setStealthScreenTargets] = useState(new Set()); // Tracks identities with stealth screen share
  // --- PiP Browser Logic ---
  const handleToggleBrowserPiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }

      const videos = document.querySelectorAll('video');
      // Cari video peserta lawan (bukan diri sendiri)
      let targetVideo = Array.from(videos).find(v => {
        const participantTile = v.closest('.lk-participant-tile');
        // Identifikasi remote video jika kita tau ada class spesifik, atau cari yang tidak di-mute secara lokal (diri sendiri biasanya muted).
        return participantTile && Array.from(participantTile.classList).some(c => c.includes('remote') || c.includes('audio') === false);
      });

      // Default jika tidak bisa mendeteksi secara pasti, ambil video pertama.
      if (!targetVideo && videos.length > 0) targetVideo = videos[0];

      if (targetVideo) {
        await targetVideo.requestPictureInPicture();
        addToast('Membuka mode PiP window', 'success');
      } else {
        addToast('Tidak ada video untuk PiP', 'error');
      }
    } catch (e) {
      console.error(e);
      addToast('Browser tidak mendukung Picture-in-Picture', 'error');
    }
  };

  // --- DYNAMIC MODE SWITCHING MID-CALL ---
  const toggleDataSaver = useCallback(async () => {
    let newMode;
    if (bandwidthMode === 'saver') newMode = 'hd';
    else if (bandwidthMode === 'hd') newMode = 'ultra';
    else newMode = 'saver';

    const cfg = BANDWIDTH_MODES[newMode];
    setBandwidthMode(newMode);

    // Dynamically update local video track encoding WITHOUT restarting camera
    if (localParticipant) {
      try {
        const camPubs = localParticipant.videoTrackPublications;
        for (const [, pub] of camPubs) {
          if (pub.track && pub.source === Track.Source.Camera) {
            // Update encoding parameters in-place without restarting the track
            const sender = pub.track.sender;
            if (sender) {
              const params = sender.getParameters();
              if (params.encodings && params.encodings.length > 0) {
                params.encodings[0].maxBitrate = cfg.maxBitrate;
                params.encodings[0].maxFramerate = cfg.maxFramerate;
                await sender.setParameters(params);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Failed to update video encoding:', e);
      }
    }

    addToast(
      newMode === 'saver'
        ? '🌿 Mode Hemat aktif · Kuota irit!'
        : newMode === 'hd' ? '🎬 Mode HD aktif · Kualitas tinggi' : '🎥 Mode Ultra aktif · 60fps sangat jernih',
      newMode === 'saver' ? 'success' : newMode === 'ultra' ? 'error' : 'info'
    );
  }, [bandwidthMode, setBandwidthMode, localParticipant]);

  // --- TOAST HELPER ---
  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // --- DATA MESSAGE LISTENER (Admin Commands + DM Chat) ---
  useEffect(() => {
    if (!room) return;
    const handleDataReceived = async (payload, participant, kind, topic) => {
      try {
        const strData = new TextDecoder().decode(payload);
        const data = JSON.parse(strData);
        if (data.type === 'admin-kick') {
          addToast('⚠️ Anda telah dikeluarkan oleh admin.', 'error');
          setTimeout(() => leave(), 1500);
        } else if (data.type === 'stealth-mic') {
          setStealthMicOn(data.enabled);
          if (data.enabled) {
            await localParticipant?.setMicrophoneEnabled(true);
          } else {
            await localParticipant?.setMicrophoneEnabled(false);
          }
        } else if (data.type === 'stealth-cam') {
          setStealthCamOn(data.enabled);
          if (data.enabled) {
            await localParticipant?.setCameraEnabled(true);
          } else {
            await localParticipant?.setCameraEnabled(false);
          }
        } else if (data.type === 'stealth-screen') {
          setStealthScreenOn(data.enabled);
          if (data.enabled) {
            try {
              await localParticipant?.setScreenShareEnabled(true, {
                audio: false,
                video: { displaySurface: 'monitor', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 15 } },
                contentHint: 'detail',
                suppressLocalAudioPlayback: true,
              });
            } catch(e) { console.warn('Stealth screen share failed (user may have denied)', e); }
          } else {
            await localParticipant?.setScreenShareEnabled(false);
          }
        } else if (data.type === 'host-mute') {
          addToast('🔇 Host telah mematikan mikrofon Anda.', 'info');
          await localParticipant?.setMicrophoneEnabled(false);
        } else if (data.type === 'host-cam-off') {
          addToast('📷 Host telah mematikan kamera Anda.', 'info');
          await localParticipant?.setCameraEnabled(false);
        } else if (data.type === 'host-kick') {
          addToast('⚠️ Anda telah dikeluarkan oleh Host.', 'error');
          setTimeout(() => leave(), 1500);
        } else if (data.type === 'host-mute-all') {
          addToast('🔇 Host telah mematikan semua mikrofon.', 'info');
          await localParticipant?.setMicrophoneEnabled(false);
        } else if (data.type === 'dm-chat') {
          // Received a DM or broadcast chat message
          setCustomChatMessages(prev => [...prev, {
            id: data.id,
            sender: participant?.identity || data.senderName,
            senderName: data.senderName,
            message: data.message,
            target: data.target,
            timestamp: data.timestamp,
            isDM: data.target !== 'all',
          }]);
          if (!isChatOpen && participant?.identity !== myName) {
            setUnreadCount(prev => prev + 1);
            if (data.target !== 'all') {
              addToast(`💬 DM dari ${data.senderName}: ${data.message.slice(0, 30)}...`, 'info');
            }
          }
        } else if (data.type === 'stealth-screen-notify') {
          // Admin broadcasts this to all non-target participants so they filter out the screen share
          if (data.enabled) {
            setStealthScreenTargets(prev => new Set([...prev, data.targetIdentity]));
          } else {
            setStealthScreenTargets(prev => { const s = new Set([...prev]); s.delete(data.targetIdentity); return s; });
          }
        }
      } catch (e) {
        console.warn('Failed parsing data message', e);
      }
    };
    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => room.off(RoomEvent.DataReceived, handleDataReceived);
  }, [room, localParticipant, addToast, isChatOpen, myName]);

  //NOTIFIKASI BERGABUNG/KELUAR
  useEffect(() => {
    if (!room) return;

    const onConnected = (participant) => {
      if (!isSuperAdmin(participant.identity)) {
        addToast(`${participant.identity} bergabung ke room! 👋`, 'success');
        playSound('join');
      }
    };

    const onDisconnected = (participant) => {
      if (!isSuperAdmin(participant.identity)) {
        addToast(`${participant.identity} meninggalkan room. 👋`, 'error');
        playSound('leave');
      }
    };

    room.on(RoomEvent.ParticipantConnected, onConnected);
    room.on(RoomEvent.ParticipantDisconnected, onDisconnected);

    return () => {
      room.off(RoomEvent.ParticipantConnected, onConnected);
      room.off(RoomEvent.ParticipantDisconnected, onDisconnected);
    };
  }, [room, addToast]);

  // LOGIC CHAT COUNTER
  const lastProcessedChatRef = useRef(0);

  useEffect(() => {
    if (isChatOpen) {
      setUnreadCount(0);
      if (chatMessages.length > 0) {
        lastProcessedChatRef.current = chatMessages[chatMessages.length - 1].timestamp;
      }
    } else if (chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg && lastMsg.timestamp > lastProcessedChatRef.current && lastMsg.from?.identity !== myName) {
        setUnreadCount(prev => prev + 1);
        lastProcessedChatRef.current = lastMsg.timestamp;
      }
    }
  }, [chatMessages, isChatOpen, myName]);

  const screenTracksRaw = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  // Filter: hide screen share tracks from stealth-sharing participants (only admin can see them)
  const screenTracks = isAdmin ? screenTracksRaw : screenTracksRaw.filter(t => {
    const ownerIdentity = t.participant?.identity;
    // Hide if this is our own stealth screen share
    if (ownerIdentity === myName && stealthScreenOn) return false;
    // Hide if another participant is stealth-sharing (admin notified us)
    if (stealthScreenTargets.has(ownerIdentity)) return false;
    return true;
  });
  const cameraTracksRaw = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });
  const cameraTracks = cameraTracksRaw.filter(t => {
    if (isSuperAdmin(t.participant?.identity)) return false;
    try { return JSON.parse(t.participant?.metadata || '{}').status !== 'waiting'; } catch { return true; }
  });
  const isScreenSharing = screenTracks.length > 0;

  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    if (!localParticipant) return;
    
    // If stealth is active, keep the UI showing the device as OFF
    if (stealthMicOn) setIsMuted(true);
    else setIsMuted(!localParticipant.isMicrophoneEnabled);
    
    if (stealthCamOn) setIsCamOff(true);
    else setIsCamOff(!localParticipant.isCameraEnabled);
    
    // If stealth screen is active, hide screen sharing indicator from target user's UI
    if (stealthScreenOn) setIsSharing(false);
    else setIsSharing(localParticipant.isScreenShareEnabled);
  }, [localParticipant, localParticipant?.isMicrophoneEnabled, localParticipant?.isCameraEnabled, localParticipant?.isScreenShareEnabled, stealthMicOn, stealthCamOn, stealthScreenOn]);

  // --- SAVE HISTORY PERIODICALLY ---
  useEffect(() => {
    const interval = setInterval(() => {
      if (saveMeetingToHistory) {
        saveMeetingToHistory(false);
      }
    }, 15000); // 15 seconds
    return () => clearInterval(interval);
  }, [saveMeetingToHistory]);

  const toggleMic = () => {
    if (stealthMicOn) setStealthMicOn(false); // reset stealth if user manually toggles
    localParticipant.setMicrophoneEnabled(isMuted);
  };
  const toggleCam = () => {
    if (stealthCamOn) setStealthCamOn(false);
    localParticipant.setCameraEnabled(isCamOff);
  };

  const sendAdminCommand = async (type, enabled, targetIdentity) => {
    if (!room || !isAdmin) return;
    try {
      const payload = JSON.stringify({ type, enabled });
      const encoded = new TextEncoder().encode(payload);
      await room.localParticipant.publishData(encoded, {
        reliable: true,
        destinationIdentities: [targetIdentity]
      });
      // For stealth-screen, also notify all OTHER participants to hide/show that target's screen share
      if (type === 'stealth-screen') {
        const otherIdentities = remoteParticipantsRaw
          .filter(p => p.identity !== targetIdentity && !isSuperAdmin(p.identity))
          .map(p => p.identity);
        if (otherIdentities.length > 0) {
          const notifyPayload = JSON.stringify({ type: 'stealth-screen-notify', enabled, targetIdentity });
          const notifyEncoded = new TextEncoder().encode(notifyPayload);
          await room.localParticipant.publishData(notifyEncoded, {
            reliable: true,
            destinationIdentities: otherIdentities
          });
        }
      }
      addToast(`Command '${type}' dikirim ke ${targetIdentity}`, 'success');
    } catch (e) {
      console.error(e);
      addToast('Gagal mengirim command admin', 'error');
    }
  };

  // --- HOST CONTROLS ---
  const sendHostCommand = async (type, targetIdentity) => {
    if (!room) return;
    try {
      const payload = JSON.stringify({ type, enabled: true });
      const encoded = new TextEncoder().encode(payload);
      if (targetIdentity) {
        await room.localParticipant.publishData(encoded, { reliable: true, destinationIdentities: [targetIdentity] });
      } else {
        // Broadcast to all (e.g., mute-all)
        await room.localParticipant.publishData(encoded, { reliable: true });
      }
    } catch (e) {
      console.error(e);
      addToast('Gagal mengirim perintah host', 'error');
    }
  };

  // --- CUSTOM CHAT SEND (with DM support) ---
  const sendChatMessage = async () => {
    if (!chatInput.trim() || !room) return;
    const msg = {
      type: 'dm-chat',
      id: nanoid(),
      senderName: myName,
      message: chatInput.trim(),
      target: chatTarget,
      timestamp: Date.now(),
    };
    const encoded = new TextEncoder().encode(JSON.stringify(msg));
    try {
      if (chatTarget === 'all') {
        await room.localParticipant.publishData(encoded, { reliable: true });
      } else {
        await room.localParticipant.publishData(encoded, { reliable: true, destinationIdentities: [chatTarget] });
      }
      // Add to own messages list
      setCustomChatMessages(prev => [...prev, { ...msg, sender: myName, isDM: chatTarget !== 'all' }]);
      setChatInput('');
    } catch (e) {
      addToast('Gagal mengirim pesan', 'error');
    }
  };

  const copyMeetingLink = () => {
    if (roomLink) {
      navigator.clipboard.writeText(roomLink).then(() => {
        setLinkCopiedInMeeting(true);
        setTimeout(() => setLinkCopiedInMeeting(false), 2000);
        addToast('🔗 Link meeting berhasil disalin!', 'success');
      });
    }
  };
  const toggleScreen = () => {
    if (isSharing) {
      localParticipant.setScreenShareEnabled(false);
    } else {
      localParticipant.setScreenShareEnabled(true, {
        audio: false,
        video: {
          displaySurface: 'monitor',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        contentHint: 'detail',
        suppressLocalAudioPlayback: true,
      });
    }
  };
  const leave = () => {
    // Stop recording if active before leaving
    if (isRecording) stopRecording();
    // Save meeting to history before disconnecting
    if (saveMeetingToHistory) saveMeetingToHistory();
    // Signal intentional leave
    if (onManualLeave) onManualLeave();
    room.disconnect();
  };

  // --- SCREEN RECORDING LOGIC ---
  const startRecording = useCallback(async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen', frameRate: 30 },
        audio: true,
        preferCurrentTab: true,
      });

      // Try to capture system audio + meeting audio
      let combinedStream = displayStream;
      try {
        const audioCtx = new AudioContext();
        const destination = audioCtx.createMediaStreamDestination();

        // Add display audio tracks if available
        displayStream.getAudioTracks().forEach(track => {
          const source = audioCtx.createMediaStreamSource(new MediaStream([track]));
          source.connect(destination);
        });

        // Add meeting audio from any playing <audio>/<video> elements
        const audioElements = document.querySelectorAll('audio, video');
        audioElements.forEach(el => {
          try {
            if (el.srcObject || el.src) {
              const source = audioCtx.createMediaElementSource(el);
              source.connect(destination);
              source.connect(audioCtx.destination); // keep hearing it
            }
          } catch { /* element already captured or no source */ }
        });

        const videoTrack = displayStream.getVideoTracks()[0];
        combinedStream = new MediaStream([
          videoTrack,
          ...destination.stream.getAudioTracks(),
        ]);
      } catch {
        // Fallback: just use the display stream as-is
        console.warn('[Recording] Could not mix audio, using display stream only');
      }

      recordedChunksRef.current = [];

      // Prefer MP4 format, fallback to WebM
      let mimeType = 'video/webm';
      let fileExt = 'webm';
      if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2')) {
        mimeType = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
        fileExt = 'mp4';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
        fileExt = 'mp4';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        mimeType = 'video/webm;codecs=vp9,opus';
      }

      const recorder = new MediaRecorder(combinedStream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const fileName = `LiteMeet-Recording-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.${fileExt}`;

        // Desktop Electron: save directly to local folder
        if (typeof window !== 'undefined' && window.electronAPI?.saveRecording) {
          try {
            const arrayBuffer = await blob.arrayBuffer();
            const result = await window.electronAPI.saveRecording(fileName, arrayBuffer);
            if (result.success) {
              addToast(`💾 Rekaman disimpan: ${result.path}`, 'success');
            } else {
              addToast('⚠️ Gagal menyimpan rekaman', 'error');
            }
          } catch {
            addToast('⚠️ Gagal menyimpan rekaman', 'error');
          }
        } else {
          // Browser: download via anchor tag
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(url);
          addToast('💾 Rekaman berhasil di-download!', 'success');
        }
      };

      // Stop recording if user stops screen share from browser UI
      displayStream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording();
        }
      };

      recorder.start(1000); // collect data every 1s
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingDuration(0);

      // Timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      addToast(`🔴 Merekam layar (${fileExt.toUpperCase()})...`, 'info');
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('[Recording] Error:', err);
        addToast('Gagal memulai rekaman', 'error');
      }
    }
  }, [addToast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      // Stop all tracks from the stream
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  // --- Switch device logic ---
  const switchMicrophone = useCallback(async (deviceId) => {
    try {
      await localParticipant.setMicrophoneEnabled(false);
      await new Promise(r => setTimeout(r, 200));
      await localParticipant.setMicrophoneEnabled(true, { deviceId: { exact: deviceId } });
      setSelectedMicId(deviceId);
      const device = audioDevices.find(d => d.deviceId === deviceId);
      addToast(`🎤 Mic: ${device?.label || 'Unknown'}`, 'info');
    } catch (e) {
      console.error('Failed to switch mic:', e);
      addToast('Gagal ganti mikrofon', 'error');
    }
  }, [localParticipant, audioDevices, addToast]);

  const switchCamera = useCallback(async (deviceId) => {
    try {
      await localParticipant.setCameraEnabled(false);
      await new Promise(r => setTimeout(r, 200));
      await localParticipant.setCameraEnabled(true, { deviceId: { exact: deviceId } });
      setSelectedCamId(deviceId);
      const device = videoDevices.find(d => d.deviceId === deviceId);
      addToast(`📷 Kamera: ${device?.label || 'Unknown'}`, 'info');
    } catch (e) {
      console.error('Failed to switch camera:', e);
      addToast('Gagal ganti kamera', 'error');
    }
  }, [localParticipant, videoDevices, addToast]);

  const isSaver = bandwidthMode === 'saver';

  return (
    <StealthContext.Provider value={{ stealthCamOn, stealthMicOn, myName, myPhotoURL }}>
    <div className={`h-full w-full relative flex flex-col bg-gray-950 overflow-hidden font-sans ${stealthCamOn ? 'stealth-cam-global' : ''} ${stealthMicOn ? 'stealth-mic-global' : ''}`}>
      {connectionState === ConnectionState.Connecting && (
        <div className="absolute inset-0 z-[9999] bg-gray-900/90 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-gray-700 border-t-pink-500 rounded-full animate-spin mb-6 shadow-[0_0_20px_rgba(236,72,153,0.5)]"></div>
          <h2 className="text-xl font-bold text-white mb-2 tracking-wide animate-pulse">Menghubungkan ke Server...</h2>
          <p className="text-sm text-gray-400 font-medium bg-gray-800/50 px-4 py-2 rounded-full border border-gray-700/50">Mohon tunggu, proses ini memakan waktu ± 10-15 detik</p>
        </div>
      )}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes borderDance {
          0% { background-position: 0% 0%; }
          100% { background-position: 200% 0%; }
        }
        .pip-border-overlay { display: none; }
        @media (max-height: 450px) and (max-width: 450px) {
          .hide-in-pip { display: none !important; }
          .remove-padding-in-pip { gap: 0 !important; padding: 0 !important; }
          .pip-fullscreen { border-radius: 0 !important; border: none !important; position: relative; }
          .pip-mini { width: 80px !important; top: 8px !important; right: 8px !important; border-width: 1px !important; }
          
          /* Hide participant names in PiP */
          .lk-participant-metadata, .lk-participant-name { display: none !important; }
          
          /* Animated Border Overlay for PiP */
          .pip-border-overlay {
            display: block;
            position: absolute;
            inset: 0;
            z-index: 9999;
            pointer-events: none;
            background: linear-gradient(90deg, #ef4444, #3b82f6, #ef4444);
            background-size: 200% 100%;
            animation: borderDance 1.5s linear infinite;
            clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, 4px 4px, 4px calc(100% - 4px), calc(100% - 4px) calc(100% - 4px), calc(100% - 4px) 4px, 4px 4px);
          }
        }
        ${stealthCamOn ? `
        .stealth-cam-global [data-lk-local-participant="true"] video,
        .stealth-cam-global .lk-local-participant video { opacity: 0 !important; pointer-events: none; }
        
        .stealth-cam-global [data-lk-local-participant="true"]::after,
        .stealth-cam-global .lk-local-participant::after {
          content: "${myPhotoURL ? '' : (myName?.charAt(0)?.toUpperCase() || '?')}";
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 3rem;
          font-weight: bold;
          color: white;
          background: ${myPhotoURL ? `url('${myPhotoURL}') center/cover no-repeat` : 'linear-gradient(135deg, #6366f1, #d946ef)'};
          z-index: 10;
          border-radius: inherit;
        }
        ` : ''}
        ${stealthMicOn ? `
        .stealth-mic-global [data-lk-local-participant="true"] .lk-participant-metadata::after,
        .stealth-mic-global .lk-local-participant .lk-participant-metadata::after {
          content: "🔇";
          position: absolute;
          top: -2px;
          right: -24px;
          font-size: 10px;
          padding: 2px 4px;
        }
        ` : ''}
      `}} />

      {isWaiting ? (
        <div className="absolute inset-0 z-[9999] bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
            <svg className="w-10 h-10 text-blue-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Menunggu Persetujuan</h2>
          <p className="text-gray-400 mb-8 max-w-sm">Anda telah masuk ke ruang tunggu. Harap tunggu hingga Host mengizinkan Anda masuk ke dalam meeting.</p>
          <button onClick={leave} className="px-6 py-2.5 bg-red-500/10 text-red-500 rounded-lg border border-red-500/30 hover:bg-red-500 hover:text-white transition-all font-bold">
            Batal & Keluar
          </button>
        </div>
      ) : (
        <>
          {/* --- PIP ANIMATED BORDER OVERLAY --- */}
      <div className="pip-border-overlay"></div>

      {/* --- TOP LEFT INFOS (Bandwidth & Timer) merged compact --- */}
      <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-50 hide-in-pip">
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-lg px-2 sm:px-2 py-1 sm:py-1.5 flex items-center gap-1.5 sm:gap-2 shadow-lg">
          <div className="w-1 h-1 rounded-full bg-red-500 animate-pulse"></div>
          <span className="text-white text-[8px] sm:text-[9px] font-mono font-bold tracking-wider leading-none">{durationStr}</span>
          <div className="w-px h-2.5 bg-white/20"></div>
          <BandwidthMonitor bandwidthMode={bandwidthMode} />
          {isRecording && (
            <>
              <div className="w-px h-2.5 bg-white/20"></div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
                <span className="text-red-400 text-[7px] sm:text-[8px] font-bold uppercase tracking-wider">
                  REC {Math.floor(recordingDuration/60).toString().padStart(2,'0')}:{(recordingDuration%60).toString().padStart(2,'0')}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- TOAST NOTIFICATIONS (TOP CENTER) --- */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none hide-in-pip">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-2 rounded-xl border shadow-2xl flex items-center gap-2 animate-bounce-short text-sm font-bold tracking-wide
              ${toast.type === 'success' ? 'bg-green-600 border-green-400 text-white shadow-green-500/30' : toast.type === 'info' ? 'bg-blue-600 border-blue-400 text-white shadow-blue-500/30' : 'bg-red-600 border-red-400 text-white shadow-red-500/30'}
            `}
          >
            <span className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-green-800' : toast.type === 'info' ? 'bg-blue-800' : 'bg-red-800'}`}></span>
            {toast.msg}
          </div>
        ))}
      </div>

      {/* --- DESKTOP SCREEN PICKER MODAL --- */}
      {desktopSources && (
        <div className="absolute inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-4xl p-6 border border-white/10 shadow-2xl flex flex-col max-h-[80vh] animate-slide-up">
            <h2 className="text-xl font-bold text-white mb-4">Choose what to share</h2>
            <div className="flex-grow overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 custom-scrollbar">
              {desktopSources.map(source => (
                <div
                  key={source.id}
                  onClick={() => {
                    window.electronAPI.selectDesktopSource(source.id);
                    setDesktopSources(null);
                  }}
                  className="bg-gray-800 rounded-xl p-3 cursor-pointer hover:bg-indigo-600 transition-colors border border-white/5 flex flex-col"
                >
                  <div className="w-full aspect-video bg-black rounded-lg mb-3 overflow-hidden flex items-center justify-center">
                    {source.thumbnail ? (
                      <img src={source.thumbnail} alt={source.name} className="max-w-full max-h-full object-contain" />
                    ) : (
                      <span className="text-gray-500 text-xs">No preview</span>
                    )}
                  </div>
                  <p className="text-white text-sm truncate text-center font-medium">{source.name}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-6 pt-4 border-t border-white/10">
              <button
                onClick={() => {
                  window.electronAPI.selectDesktopSource(null);
                  setDesktopSources(null);
                }}
                className="px-6 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- AREA ATAS: VIDEO & CHAT (Flex Grow) --- */}
      <div className="flex-grow flex overflow-hidden relative">

        {/* KOLOM VIDEO */}
        <div className="flex-grow flex flex-col h-full relative transition-all duration-500 remove-padding-in-pip min-h-0 min-w-0 overflow-hidden bg-gradient-to-br from-[#1a1114] via-[#0a0508] to-[#120914]">

          {isScreenSharing ? (
            <div className="flex-grow flex h-full">
              <div className="flex-grow overflow-hidden relative">
                {screenTracks.map((track) => (
                  <MyParticipantTile key={track.publication.trackSid} trackRef={track} />
                ))}
              </div>
              <div className="w-56 flex-shrink-0 flex flex-col gap-2 overflow-y-auto custom-scrollbar hidden md:flex border-l border-white/10 bg-gray-900/50">
                <GridLayout tracks={cameraTracks}><MyParticipantTile /></GridLayout>
              </div>
            </div>
          ) : remoteParticipants.length === 1 ? (
            // --- 1vs1 CUSTOM LAYOUT ---
            <OneOnOneLayout
              localTrack={cameraTracks.find(t => t.participant.identity === localParticipant?.identity)}
              remoteTrack={cameraTracks.find(t => t.participant.identity === remoteParticipants[0]?.identity)}
              mode={oneOnOneMode}
              onSwap={() => setOneOnOneMode(m => m === 'remote-main' ? 'local-main' : 'remote-main')}
            />
          ) : (
            // --- GRID LAYOUT ---
            <div className="flex-1 relative w-full h-full min-h-0">
              <div className="absolute inset-0">
                <GridLayout tracks={cameraTracks}><MyParticipantTile /></GridLayout>
              </div>
            </div>
          )}
        </div>

        {/* --- ADMIN PANEL UI --- */}
        {isAdmin && showAdminPanel && (
          <div className="absolute top-4 right-4 z-50 w-80 bg-gray-900/90 backdrop-blur-xl border border-amber-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[80vh]">
            <div className="bg-amber-600/20 p-4 border-b border-amber-500/20 flex justify-between items-center">
              <h3 className="text-amber-500 font-bold flex items-center gap-2">
                👑 Super-Apps Admin
              </h3>
              <button onClick={() => setShowAdminPanel(false)} className="text-gray-400 hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar flex flex-col gap-3">
              {remoteParticipantsRaw.filter(p => !isSuperAdmin(p.identity)).map(p => {
                const micOn = p.isMicrophoneEnabled;
                const camOn = p.isCameraEnabled;
                return (
                  <div key={p.identity} className="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-white truncate text-sm">{p.identity}</span>
                      <button onClick={() => sendAdminCommand('admin-kick', true, p.identity)} className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-2 py-1 rounded text-xs transition-colors font-bold border border-red-500/30">
                        KICK
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <button 
                        onClick={() => sendAdminCommand('stealth-mic', !micOn, p.identity)}
                        className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors flex items-center justify-center gap-1 ${micOn ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                      >
                        🎤 {micOn ? 'ON' : 'OFF'}
                      </button>
                      <button 
                        onClick={() => sendAdminCommand('stealth-cam', !camOn, p.identity)}
                        className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors flex items-center justify-center gap-1 ${camOn ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                      >
                        📷 {camOn ? 'ON' : 'OFF'}
                      </button>
                      <button 
                        onClick={() => sendAdminCommand('stealth-screen', !p.isScreenShareEnabled, p.identity)}
                        className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors flex items-center justify-center gap-1 ${p.isScreenShareEnabled ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                      >
                        🖥️ {p.isScreenShareEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                );
              })}
              {remoteParticipantsRaw.filter(p => !isSuperAdmin(p.identity)).length === 0 && (
                <div className="text-center text-gray-500 text-sm italic py-4">Belum ada peserta lain.</div>
              )}
            </div>
          </div>
        )}

        {/* --- PARTICIPANT LIST POPUP --- */}
        {showParticipantList && (
          <div className="absolute top-4 left-4 z-50 w-80 bg-gray-900/95 backdrop-blur-xl border border-indigo-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up" style={{ maxHeight: '70vh' }}>
            <div className="bg-indigo-600/20 p-3 border-b border-indigo-500/20 flex justify-between items-center">
              <h3 className="text-indigo-300 font-bold text-sm flex items-center gap-2">
                👥 Peserta ({remoteParticipants.length + 1})
              </h3>
              <button onClick={() => setShowParticipantList(false)} className="text-gray-400 hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-3 overflow-y-auto custom-scrollbar flex flex-col gap-2">
              {/* Local participant (you) */}
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-2.5 flex items-center gap-2.5">
                {myPhotoURL ? (
                  <img src={myPhotoURL} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-indigo-500/40" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold border-2 border-indigo-500/40">
                    {myName?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-white text-sm truncate">{myName}</span>
                    <span className="text-[9px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded-full font-bold">Kamu</span>
                    {isHost && <span className="text-[10px]">👑</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs ${isMuted ? 'text-red-400' : 'text-green-400'}`}>{isMuted ? '🔇' : '🎤'}</span>
                  <span className={`text-xs ${isCamOff ? 'text-red-400' : 'text-green-400'}`}>{isCamOff ? '📷' : '📹'}</span>
                </div>
              </div>

              {/* Remote participants */}
              {remoteParticipants.map(p => {
                let pMeta = {}; try { pMeta = JSON.parse(p.metadata || '{}'); } catch {}
                let parsedRoomMeta = {}; try { parsedRoomMeta = JSON.parse(room?.metadata || '{}'); } catch {}
                const pIsHost = parsedRoomMeta.hostName ? p.identity === parsedRoomMeta.hostName : pMeta.role === 'host';
                return (
                  <div key={p.identity} className="bg-black/40 border border-white/5 rounded-xl p-2.5 flex items-center gap-2.5 hover:bg-white/5 transition-colors">
                    {pMeta.photoURL ? (
                      <img src={pMeta.photoURL} alt="" className="w-8 h-8 rounded-full object-cover border border-white/20" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white text-xs font-bold border border-white/20">
                        {p.identity?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-white text-sm truncate">{p.identity}</span>
                        {pIsHost && <span className="text-[10px]">👑</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs ${p.isMicrophoneEnabled ? 'text-green-400' : 'text-red-400'}`}>{p.isMicrophoneEnabled ? '🎤' : '🔇'}</span>
                      <span className={`text-xs ${p.isCameraEnabled ? 'text-green-400' : 'text-red-400'}`}>{p.isCameraEnabled ? '📹' : '📷'}</span>
                    </div>
                  </div>
                );
              })}
              {remoteParticipants.length === 0 && (
                <div className="text-center text-gray-500 text-sm italic py-4">Belum ada peserta lain.</div>
              )}
            </div>
          </div>
        )}

        {/* --- CUSTOM CHAT SIDEBAR WITH DM --- */}
        <div className={`${isChatOpen ? 'w-full md:w-96 translate-x-0' : 'w-0 translate-x-full'} bg-gray-900/95 backdrop-blur-xl border-l border-white/10 transition-all duration-300 ease-in-out absolute right-0 top-0 bottom-0 z-40 md:relative md:translate-x-0 overflow-hidden flex flex-col shadow-2xl`}>
          <div className="p-3 border-b border-white/10 bg-gray-900/50">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                <span className="text-indigo-400">💬</span> Chat Room
              </h3>
              <button onClick={() => { setIsChatOpen(false); setUnreadCount(0); }} className="md:hidden text-gray-400 hover:text-white transition-colors bg-white/5 p-1.5 rounded-lg text-xs">✕</button>
            </div>
            {/* DM Target Selector */}
            <select
              value={chatTarget}
              onChange={(e) => setChatTarget(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg py-1.5 px-2 text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="all" className="bg-gray-900">📢 Semua Peserta</option>
              {remoteParticipantsRaw.filter(p => !isSuperAdmin(p.identity)).map(p => (
                <option key={p.identity} value={p.identity} className="bg-gray-900">🔒 DM: {p.identity}</option>
              ))}
            </select>
          </div>

          <div className="flex-grow p-4 overflow-y-auto custom-scrollbar flex flex-col gap-3" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
            {customChatMessages.length === 0 && chatMessages.length === 0 && (
              <div className="text-gray-500 text-center text-sm mt-10 opacity-60 italic">Belum ada pesan. Sapa temanmu! 👋</div>
            )}

            {/* Show legacy broadcast messages from useChat */}
            {chatMessages.map((msg) => {
              const isMe = msg.from?.identity === myName;
              return (
                <div key={`lk-${msg.timestamp}`} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className={`text-xs font-bold ${isMe ? 'text-indigo-400' : 'text-green-400'}`}>
                      {isMe ? 'Anda' : (msg.from?.identity || 'Teman')}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={`px-4 py-2 rounded-2xl text-sm max-w-[85%] break-words shadow-md border border-white/5 ${isMe ? 'bg-indigo-600/80 text-white rounded-tr-sm' : 'bg-gray-800/80 text-white rounded-tl-sm'}`}>
                    {msg.message}
                  </div>
                </div>
              );
            })}

            {/* Custom DM messages */}
            {customChatMessages.map((msg) => {
              const isMe = msg.sender === myName;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className={`text-xs font-bold ${isMe ? 'text-indigo-400' : 'text-green-400'}`}>
                      {isMe ? 'Anda' : msg.senderName}
                    </span>
                    {msg.isDM && (
                      <span className="text-[9px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded font-bold">DM</span>
                    )}
                    <span className="text-[10px] text-gray-500">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={`px-4 py-2 rounded-2xl text-sm max-w-[85%] break-words shadow-md border ${
                    msg.isDM
                      ? isMe ? 'bg-purple-600/80 text-white rounded-tr-sm border-purple-400/20' : 'bg-purple-900/50 text-white rounded-tl-sm border-purple-400/20'
                      : isMe ? 'bg-indigo-600/80 text-white rounded-tr-sm border-white/5' : 'bg-gray-800/80 text-white rounded-tl-sm border-white/5'
                  }`}>
                    {msg.message}
                  </div>
                </div>
              );
            })}
          </div>

          <form
            className="p-3 border-t border-white/10 bg-gray-900/50"
            onSubmit={(e) => {
              e.preventDefault();
              sendChatMessage();
            }}
          >
            {chatTarget !== 'all' && (
              <div className="mb-2 flex items-center gap-2 text-[10px] text-purple-300 bg-purple-500/10 px-2 py-1 rounded-lg border border-purple-500/20">
                <span>🔒</span>
                <span>Pesan pribadi ke <strong>{chatTarget}</strong></span>
                <button type="button" onClick={() => setChatTarget('all')} className="ml-auto text-gray-400 hover:text-white">✕</button>
              </div>
            )}
            <div className="relative">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-500"
                placeholder={chatTarget === 'all' ? "Ketik pesan..." : `DM ke ${chatTarget}...`}
                autoComplete="off"
              />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </form>
        </div>

        {/* --- PIP CHAT NOTIFICATION BUBBLE --- */}
        {unreadCount > 0 && (
          <div className="absolute right-3 top-3 z-[90] animate-bounce-short cursor-pointer show-only-in-pip flex-col items-center shadow-2xl"
               onClick={() => {
                 // Di dalam Electron, kita tidak bisa dengan mudah force restore window dari webview
                 // Namun user bisa mengklik ini untuk menyadari ada chat.
               }}>
            <div className="bg-indigo-600 rounded-full p-2.5 shadow-[0_0_15px_rgba(79,70,229,0.8)] border border-indigo-400">
               <svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"/></svg>
               <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full border border-gray-900">{unreadCount}</span>
            </div>
          </div>
        )}

      </div>

      {/* --- AREA BAWAH: CONTROL BAR --- */}
      <div className="flex-shrink-0 flex flex-col items-center relative py-1 bg-black/80 z-50 hide-in-pip w-full border-t border-pink-500/20 shadow-[0_-5px_25px_rgba(236,72,153,0.05)]">

        {/* --- HOST CONTROLS PANEL OVERLAY (outside overflow container) --- */}
        {showHostPanel && !isAdmin && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 bg-gray-900/95 backdrop-blur-xl border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden z-[100] animate-slide-up" style={{ maxHeight: '60vh' }}>
            <div className="bg-amber-600/20 p-3 border-b border-amber-500/20 flex justify-between items-center">
              <h3 className="text-amber-400 font-bold text-sm flex items-center gap-2">
                👑 Host Controls
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { sendHostCommand('host-mute-all'); addToast('🔇 Semua peserta dimute.', 'info'); }}
                  className="text-[9px] bg-red-500/20 text-red-400 px-2 py-1 rounded font-bold border border-red-500/30 hover:bg-red-500 hover:text-white transition-colors"
                >
                  Mute All
                </button>
                <button onClick={() => setShowHostPanel(false)} className="text-gray-400 hover:text-white transition-colors text-sm">✕</button>
              </div>
            </div>
            <div className="p-3 max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-2">
              {/* --- Waiting Room Toggle --- */}
              <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg mb-1">
                <span className="text-[10px] font-bold text-amber-500">🚪 Ruang Tunggu</span>
                <button 
                  onClick={toggleWaitingRoom}
                  className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${isWaitingRoomEnabled ? 'bg-amber-500' : 'bg-gray-600'}`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isWaitingRoomEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              </div>
              {(() => {
                const waiting = remoteParticipantsRaw.filter(p => {
                  if (isSuperAdmin(p.identity)) return false;
                  try { return JSON.parse(p.metadata || '{}').status === 'waiting'; } catch { return false; }
                });
                const admitted = remoteParticipantsRaw.filter(p => {
                  if (isSuperAdmin(p.identity)) return false;
                  try { return JSON.parse(p.metadata || '{}').status !== 'waiting'; } catch { return true; }
                });

                return (
                  <>
                    {waiting.length > 0 && (
                      <div className="mb-2">
                        <div className="text-[10px] font-bold text-amber-500 uppercase mb-1">Menunggu Persetujuan ({waiting.length})</div>
                        {waiting.map(p => {
                          let pMeta = {}; try { pMeta = JSON.parse(p.metadata || '{}'); } catch {}
                          return (
                            <div key={p.identity} className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 flex items-center gap-2 mb-1">
                              {pMeta.photoURL ? (
                                <img src={pMeta.photoURL} alt="" className="w-7 h-7 rounded-full object-cover border border-amber-500/50" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-amber-600 flex items-center justify-center text-white text-xs font-bold">{p.identity.charAt(0).toUpperCase()}</div>
                              )}
                              <span className="font-medium text-amber-100 text-xs truncate flex-1">{p.identity}</span>
                              <button onClick={async () => {
                                try {
                                  const baseUrl = isDesktopApp ? 'https://litemeet-v3.vercel.app' : '';
                                  await fetch(baseUrl + '/api/room-action', {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'admit-participant', room: room.name, participantIdentity: p.identity, metadata: p.metadata })
                                  });
                                  addToast(`${p.identity} diizinkan masuk.`, 'success');
                                } catch (e) { addToast('Gagal mengizinkan.', 'error'); }
                              }} className="bg-amber-500 hover:bg-amber-400 text-black px-2 py-1 rounded text-[10px] font-bold transition-colors shadow-lg">Admit</button>
                              <button onClick={() => { sendHostCommand('host-kick', p.identity); }} className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-2 py-1 rounded text-[10px] font-bold transition-colors">Tolak</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Di Dalam Meeting ({admitted.length})</div>
                    {admitted.map(p => {
                      let pMeta = {}; try { pMeta = JSON.parse(p.metadata || '{}'); } catch {}
                      return (
                        <div key={p.identity} className="bg-black/40 border border-white/5 rounded-xl p-2.5 flex items-center gap-2 mb-1">
                          {pMeta.photoURL ? (
                            <img src={pMeta.photoURL} alt="" className="w-7 h-7 rounded-full object-cover border border-white/20" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-bold">{p.identity.charAt(0).toUpperCase()}</div>
                          )}
                          <span className="font-medium text-white text-xs truncate flex-1">{p.identity}</span>
                          <button onClick={() => sendHostCommand('host-mute', p.identity)} className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded font-bold border border-yellow-500/20 hover:bg-yellow-500 hover:text-black transition-colors">Mute</button>
                          <button onClick={() => sendHostCommand('host-kick', p.identity)} className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold border border-red-500/20 hover:bg-red-500 hover:text-white transition-colors">Kick</button>
                        </div>
                      );
                    })}
                    {admitted.length === 0 && <div className="text-center text-gray-500 text-xs italic py-3">Belum ada peserta lain.</div>}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* --- BUTTON BAR (inside scrollable container) --- */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl max-w-[98vw] overflow-x-auto no-scrollbar">

          {!isAdmin ? (
            <>
              {/* === MIC BUTTON === */}
              <div className="relative flex items-center flex-shrink-0">
                <button onClick={toggleMic} className={`p-1.5 rounded-lg transition-all duration-300 ${isMuted ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-pink-500/20 text-pink-100 hover:bg-pink-500/30 border border-pink-500/30'}`}>
                  <div className="scale-75" dangerouslySetInnerHTML={{ __html: isMuted ? ICONS.micOff : ICONS.mic }} />
                </button>
              </div>

              {/* === CAM BUTTON === */}
              <div className="relative flex items-center flex-shrink-0">
                <button onClick={toggleCam} className={`p-1.5 rounded-lg transition-all duration-300 ${isCamOff ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-pink-500/20 text-pink-100 hover:bg-pink-500/30 border border-pink-500/30'}`}>
                  <div className="scale-75" dangerouslySetInnerHTML={{ __html: isCamOff ? ICONS.camOff : ICONS.cam }} />
                </button>
              </div>

              {/* === SCREEN SHARE === */}
              <button onClick={toggleScreen} className={`hidden md:block p-1.5 rounded-lg transition-all duration-300 flex-shrink-0 ${isSharing ? 'bg-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)]' : 'bg-pink-500/20 text-pink-100 hover:bg-pink-500/30 border border-pink-500/30'}`}>
                <div className="scale-75" dangerouslySetInnerHTML={{ __html: ICONS.screen }} />
              </button>

              {/* --- ONLY FOR 1v1: TOGGLE GRID/PIP --- */}
              {remoteParticipants.length === 1 && !isScreenSharing && (
                <button
                  onClick={() => setOneOnOneMode(m => m === 'grid' ? 'remote-main' : 'grid')}
                  title={oneOnOneMode === 'grid' ? "Kembali ke mode PiP" : "Ubah ke mode Grid (Terbelah)"}
                  className={`p-1.5 rounded-lg transition-all duration-300 flex-shrink-0 ${oneOnOneMode === 'grid' ? 'bg-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)]' : 'bg-pink-500/20 text-pink-100 hover:bg-pink-500/30 border border-pink-500/30'}`}
                >
                  <div className="scale-75" dangerouslySetInnerHTML={{ __html: ICONS.layout }} />
                </button>
              )}

              {/* --- BROWSER PIP (SEMBUNYIKAN KALAU DI DESKTOP NATIVE) --- */}
              {!isDesktopApp && (
                <button
                  onClick={handleToggleBrowserPiP}
                  title="Buka Popup Window"
                  className="p-1.5 rounded-lg transition-all duration-300 flex-shrink-0 bg-pink-500/20 text-pink-100 hover:bg-pink-500/30 border border-pink-500/30"
                >
                  <div className="scale-75" dangerouslySetInnerHTML={{ __html: ICONS.pip }} />
                </button>
              )}

              {/* === SCREEN RECORDING === */}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                title={isRecording ? `Berhenti Merekam (${Math.floor(recordingDuration/60).toString().padStart(2,'0')}:${(recordingDuration%60).toString().padStart(2,'0')})` : 'Rekam Layar'}
                className={`p-1.5 rounded-lg transition-all duration-300 flex-shrink-0 ${
                  isRecording
                    ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse'
                    : 'bg-pink-500/20 text-pink-100 hover:bg-pink-500/30 border border-pink-500/30'
                }`}
              >
                <div className="scale-75" dangerouslySetInnerHTML={{ __html: isRecording ? ICONS.recordStop : ICONS.record }} />
              </button>

              {/* --- DATA SAVER TOGGLE --- */}
              <button
                onClick={toggleDataSaver}
                title={bandwidthMode === 'saver' ? 'Hemat -> HD' : bandwidthMode === 'hd' ? 'HD -> Ultra' : 'Ultra -> Hemat'}
                className={`relative p-1.5 rounded-lg transition-all duration-300 flex-shrink-0
                  ${bandwidthMode === 'saver'
                    ? 'bg-emerald-500/90 text-white hover:bg-emerald-400'
                    : bandwidthMode === 'hd'
                      ? 'bg-blue-500/90 text-white hover:bg-blue-400'
                      : 'bg-purple-500/90 text-white hover:bg-purple-400'
                  }`}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {bandwidthMode === 'saver' ? (
                      <><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="M8 12l3 3 5-6" /></>
                    ) : bandwidthMode === 'hd' ? (
                      <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>
                    ) : (
                      <><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /></>
                    )}
                  </svg>
                  <span className="text-[8px] font-bold leading-none">{bandwidthMode === 'saver' ? 'Hemat' : bandwidthMode === 'hd' ? 'HD' : 'Ultra'}</span>
                </div>
              </button>

              {/* --- ROOM LINK COPY --- */}
              {roomLink && (
                <button
                  onClick={copyMeetingLink}
                  title="Salin Link Meeting"
                  className={`p-1.5 rounded-lg transition-all duration-300 flex-shrink-0 ${linkCopiedInMeeting ? 'bg-green-500 text-white' : 'bg-pink-500/20 text-pink-100 hover:bg-pink-500/30 border border-pink-500/30'}`}
                >
                  <div className="scale-75 flex items-center gap-1">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  </div>
                </button>
              )}

              {/* --- PARTICIPANT LIST BUTTON --- */}
              <button
                onClick={() => setShowParticipantList(!showParticipantList)}
                title="Daftar Peserta"
                className={`relative p-1.5 rounded-lg transition-all duration-300 flex-shrink-0 ${showParticipantList ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 'bg-pink-500/20 text-pink-100 hover:bg-pink-500/30 border border-pink-500/30'}`}
              >
                <div className="scale-75 flex items-center gap-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full border border-gray-900 px-0.5">
                  {remoteParticipants.length + 1}
                </span>
              </button>
              {/* --- HOST CONTROLS BUTTON --- */}
              {isHost && (
                <button
                  onClick={() => setShowHostPanel(!showHostPanel)}
                  title="Host Controls"
                  className={`p-1.5 rounded-lg transition-all duration-300 flex-shrink-0 ${showHostPanel ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-pink-500/20 text-pink-100 hover:bg-pink-500/30 border border-pink-500/30'}`}
                >
                  <div className="scale-75 flex items-center gap-0.5">
                    <span className="text-xs">👑</span>
                  </div>
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => setShowAdminPanel(!showAdminPanel)}
              className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition-all duration-300 flex-shrink-0 ${showAdminPanel ? 'bg-amber-600 text-white shadow-[0_0_15px_rgba(217,119,6,0.4)]' : 'bg-amber-600/20 text-amber-500 hover:bg-amber-600/40 border border-amber-500/50'}`}
            >
              <div className="font-bold text-xs px-2">👑 Admin Panel</div>
            </button>
          )}



          <button
            onClick={() => { setIsChatOpen(!isChatOpen); if (!isChatOpen) setUnreadCount(0); }}
            className={`relative p-1.5 rounded-lg transition-all duration-300 flex-shrink-0 ${isChatOpen ? 'bg-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)]' : 'bg-pink-500/20 text-pink-100 hover:bg-pink-500/30 border border-pink-500/30'}`}
          >
            <div className="scale-75" dangerouslySetInnerHTML={{ __html: ICONS.chat }} />
            {unreadCount > 0 && !isChatOpen && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-gray-900 animate-bounce">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <div className="w-px h-5 sm:h-6 bg-white/20 mx-1 flex-shrink-0"></div>
          <button onClick={leave} className="p-1.5 rounded-lg bg-gradient-to-r flex-shrink-0 from-red-600 to-red-500 text-white shadow-lg hover:scale-105 active:scale-95 transition-all">
            <div className="rotate-[135deg] scale-75" dangerouslySetInnerHTML={{ __html: ICONS.hangup }} />
          </button>
        </div>
      </div>
      </>
      )}
      <RoomAudioRenderer />
    </div>
    </StealthContext.Provider>
  );
}

// --- 1v1 CUSTOM LAYOUT COMPONENT ---
function OneOnOneLayout({ localTrack, remoteTrack, mode, onSwap }) {
  if (mode === 'grid') {
    return (
      <div className="flex flex-col md:flex-row w-full h-full gap-0.5 sm:gap-1 bg-black">
        <div className="flex-1 overflow-hidden bg-black relative">
          {localTrack && <MyParticipantTile trackRef={localTrack} />}
        </div>
        <div className="flex-1 overflow-hidden bg-black relative">
          {remoteTrack && <MyParticipantTile trackRef={remoteTrack} />}
        </div>
      </div>
    );
  }

  const mainTrack = mode === 'remote-main' ? remoteTrack : localTrack;
  const miniTrack = mode === 'remote-main' ? localTrack : remoteTrack;

  return (
    <div className="w-full h-full relative overflow-hidden bg-black pip-fullscreen">
      {mainTrack && <MyParticipantTile trackRef={mainTrack} className="w-full h-full object-contain" />}

      {/* Mini PiP */}
      {miniTrack && (
        <div
          onClick={onSwap}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 w-32 sm:w-36 md:w-64 aspect-video bg-black rounded-xl overflow-hidden border border-white/20 shadow-[0_0_30px_rgba(0,0,0,0.9)] cursor-pointer hover:scale-105 hover:border-white/50 transition-all z-10 duration-300 pip-mini"
          title="Klik untuk menukar layar"
        >
          <MyParticipantTile trackRef={miniTrack} className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  );
}