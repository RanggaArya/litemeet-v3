import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import { registerPlugin } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { App as CapacitorApp } from '@capacitor/app';
import { LiveKitRoom, GridLayout, ParticipantTile as LiveKitParticipantTile, RoomAudioRenderer, useTracks, useLocalParticipant, useRemoteParticipants, useRoomContext, useChat, useConnectionState } from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, RoomEvent, ConnectionState } from 'livekit-client';
import { API_BASE, ICONS, BANDWIDTH_MODES, buildRoomOptions, loadHistory, saveHistory, addHistoryEntry, loadLastUser, saveLastUser, formatDuration, formatDate } from './constants';

const SUPER_ADMIN_NAME = 'super-apps';
const isSuperAdmin = (identity) => identity?.toLowerCase()?.trim() === SUPER_ADMIN_NAME.toLowerCase().trim();

const StealthContext = createContext({ stealthCamOn: false, stealthMicOn: false, myName: '' });

// Capacitor plugin bridge untuk ForegroundService native
const ForegroundCall = registerPlugin('ForegroundCall');
const isAndroid = () => typeof window !== 'undefined' && window.Capacitor?.getPlatform() === 'android';

// ============ CUSTOM PARTICIPANT TILE (Stealth UI + Google Avatar) ============
function MyParticipantTile({ trackRef, ...props }) {
  // Safe import — useMaybeTrackRefContext returns null if no context
  let contextTrackRef = null;
  try {
    const lkComponents = require('@livekit/components-react');
    if (lkComponents.useMaybeTrackRefContext) {
      contextTrackRef = lkComponents.useMaybeTrackRefContext();
    }
  } catch (e) { /* ignore */ }
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

  // Check if camera is muted
  let isCameraMuted = false;
  try {
    const lkComponents = require('@livekit/components-react');
    if (lkComponents.useIsMuted) {
      isCameraMuted = lkComponents.useIsMuted(Track.Source.Camera, { participant });
    }
  } catch (e) { /* ignore */ }

  const photoToShow = (isLocal && stealthCamOn) ? (myPhotoURL || '') : participantPhoto;
  const hasAvatarOverlay = isCameraMuted && photoToShow && !(isLocal && stealthCamOn);

  if (isLocal && (stealthCamOn || stealthMicOn)) {
    return (
      <div className="relative w-full h-full" {...props}>
         {stealthCamOn && (
           <div style={{position:'absolute', inset:0, background:'#1f2937', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10}}>
              {photoToShow ? (
                <div style={{position: 'relative'}}>
                  <div style={{position: 'absolute', top: '-16px', left: '-16px', right: '-16px', bottom: '-16px', background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, rgba(236,72,153,0.2) 100%)', borderRadius: '50%', filter: 'blur(10px)'}} />
                  <img src={photoToShow} alt="" style={{width:'100px', height:'100px', borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(255,255,255,0.2)', position: 'relative', zIndex: 11}} referrerPolicy="no-referrer" />
                </div>
              ) : (
                <div style={{width:'100px', height:'100px', background:'rgba(75,85,99,0.5)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden'}}>
                  <svg style={{width:'80px', height:'80px', color:'#9ca3af', marginTop:'20px'}} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
              )}
           </div>
         )}
         <LiveKitParticipantTile trackRef={actualTrackRef} />
         {stealthMicOn && (
           <div style={{position:'absolute', bottom:'8px', left:'8px', zIndex:20, pointerEvents:'none', display:'flex', alignItems:'center'}}>
              <div style={{background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', padding:'4px 6px', borderRadius:'4px', color:'white', display:'flex', alignItems:'center', gap:'6px', boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}}>
                <svg style={{width:'14px', height:'14px'}} viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12.143 9.733V6.305H11v3.428c0 .49-.107.954-.299 1.375l.963.963a4.135 4.135 0 0 0 .479-2.338ZM12.75 12.292 13.568 12.764 14.414 11.3 1.586 3.892.739 5.358l3.158 1.824c-.033.175-.05.358-.05.546v2.005c0 1.725 1.314 3.143 3 3.328v1.796H8.848v-1.809a4.148 4.148 0 0 0 1.522-.513l1.389.802c-.588.447-1.315.739-2.111.831V16H6.048v-1.832C4.054 13.916 2.514 12.215 2.514 10.143V7.729c0-.302.037-.595.106-.876l-.868-.502V5.486H3.648v.507L5.458 7.038c-.007.05-.01.1-.01.15v2.545c0 1.293 1.048 2.341 2.34 2.341.83 0 1.56-.432 1.951-1.088l3.01 1.307ZM6.59 5.617V5.167c0-.562.456-1.017 1.018-1.017h.455c.562 0 1.018.455 1.018 1.017v2.94l1.143.66V5.167C10.223 3.973 9.256 3.007 8.063 3.007H7.608C6.733 3.007 5.98 3.526 5.656 4.288L6.59 4.828v.789Z"/>
                </svg>
                <span style={{fontSize:'12px', fontWeight:'500'}}>{myName}</span>
              </div>
           </div>
         )}
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full${hasAvatarOverlay ? ' has-avatar' : ''}`} {...props}>
      <LiveKitParticipantTile trackRef={actualTrackRef} />
      {hasAvatarOverlay && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 2,
          backgroundColor: 'var(--lk-bg2, #1e1e1e)', borderRadius: 'inherit',
        }}>
          <img src={photoToShow} alt="" referrerPolicy="no-referrer"
            style={{
              width: 'min(40%, 160px)', aspectRatio: '1', minWidth: '80px',
              borderRadius: '50%', objectFit: 'cover',
              border: '4px solid rgba(55,65,81,0.5)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ============ DRAGGABLE PiP (video kecil pojok) ============
function DraggablePip({ trackRef, onTap }) {
  const pipRef = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, origX: 0, origY: 0, moved: false, startTime: 0 });

  const onTouchStart = (e) => {
    const t = e.touches[0];
    dragRef.current = { active: true, startX: t.clientX, startY: t.clientY, origX: pos.x, origY: pos.y, moved: false, startTime: Date.now() };
  };
  const onTouchMove = (e) => {
    if (!dragRef.current.active) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - dragRef.current.startX);
    const dy = Math.abs(t.clientY - dragRef.current.startY);
    if (dx > 5 || dy > 5) dragRef.current.moved = true;
    setPos({ x: dragRef.current.origX + (t.clientX - dragRef.current.startX), y: dragRef.current.origY + (t.clientY - dragRef.current.startY) });
  };
  const onTouchEnd = () => { 
    // Tap = sentuh tanpa geser dan kurang dari 300ms
    if (dragRef.current.active && !dragRef.current.moved && (Date.now() - dragRef.current.startTime) < 300) {
      if (onTap) onTap();
    }
    dragRef.current.active = false; 
  };

  return (
    <div
      ref={pipRef}
      className="pip-self"
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <MyParticipantTile trackRef={trackRef} />
    </div>
  );
}

// ============ SMART VIDEO LAYOUT ============
// Selalu tampilkan 1 video besar + 1 video kecil di pojok (seperti VC biasa)
// Baik di fullscreen maupun di mode PiP Android
function SmartVideoLayout({ tracks, remoteCount, isPipMode }) {
  const { localParticipant } = useLocalParticipant();
  const [swapped, setSwapped] = useState(false);
  const totalPeople = remoteCount + 1;

  if (totalPeople >= 3) {
    return <GridLayout tracks={tracks} style={{ height: '100%' }}><MyParticipantTile /></GridLayout>;
  }

  const localTrackRaw = tracks.find(t => t.participant?.isLocal && (t.source === Track.Source.Camera || t.publication?.source === Track.Source.Camera));
  const remoteTrackRaw = tracks.find(t => !t.participant?.isLocal && (t.source === Track.Source.Camera || t.publication?.source === Track.Source.Camera || t.source === Track.Source.ScreenShare));

  const mainTrack = swapped && remoteTrackRaw && localTrackRaw ? localTrackRaw : remoteTrackRaw;
  const pipTrack = swapped && remoteTrackRaw && localTrackRaw ? remoteTrackRaw : localTrackRaw;

  return (
    <div className="spotlight-layout">
      <div className="spotlight-main">
        {mainTrack
          ? <MyParticipantTile trackRef={mainTrack} />
          : localTrackRaw
            ? <MyParticipantTile trackRef={localTrackRaw} />
            : <div className="waiting-room"><div className="waiting-icon">👥</div><p>Menunggu peserta lain bergabung...</p></div>
        }
      </div>
      {remoteTrackRaw && localTrackRaw && <DraggablePip trackRef={pipTrack} onTap={() => setSwapped(!swapped)} />}
    </div>
  );
}


// ===================== MEETING COMPONENT =====================
function MeetingView({ myName, bandwidthMode, setBandwidthMode, participantsRef, saveMeetingToHistory, onLeave, initialRole, initialStatus }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const { chatMessages, send } = useChat();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [showMore, setShowMore] = useState(false);
  const [meetingStart] = useState(Date.now());
  const [durationStr, setDurationStr] = useState('00:00');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isPipMode, setIsPipMode] = useState(false);
  
  const connectionState = useConnectionState();
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const chatEndRef = useRef(null);

  // Parse local metadata
  let localMeta = {};
  try {
    if (localParticipant?.metadata) {
      localMeta = JSON.parse(localParticipant.metadata);
    }
  } catch (e) {}

  const isHost = initialRole === 'host';
  const isWaiting = localMeta.status ? localMeta.status === 'waiting' : initialStatus === 'waiting';

  const [isWaitingRoomEnabled, setIsWaitingRoomEnabled] = useState(() => {
    try {
      if (room.metadata) {
        const meta = JSON.parse(room.metadata);
        if (typeof meta.waitingRoom === 'boolean') return meta.waitingRoom;
      }
    } catch (e) {}
    return true; // Default ON
  });

  // Listen to room metadata changes
  useEffect(() => {
    const handleRoomMetadataChanged = (metadata) => {
      try {
        const meta = JSON.parse(metadata);
        if (typeof meta.waitingRoom === 'boolean') setIsWaitingRoomEnabled(meta.waitingRoom);
      } catch (e) {}
    };
    if (room) {
      room.on('roomMetadataChanged', handleRoomMetadataChanged);
      return () => room.off('roomMetadataChanged', handleRoomMetadataChanged);
    }
  }, [room]);

  const toggleWaitingRoom = async () => {
    try {
      const currentMeta = room.metadata ? JSON.parse(room.metadata) : {};
      const newMeta = JSON.stringify({ ...currentMeta, waitingRoom: !isWaitingRoomEnabled });
      await fetch('https://litemeet-v3.vercel.app/api/room-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-room-meta', room: room.name, metadata: newMeta })
      });
      setIsWaitingRoomEnabled(!isWaitingRoomEnabled);
      addToast(`Ruang tunggu ${!isWaitingRoomEnabled ? 'AKTIF' : 'NONAKTIF'}`);
    } catch (e) {
      addToast('Gagal mengubah pengaturan', 'error');
    }
  };

  const isAdmin = isSuperAdmin(myName);
  const [showAdminRoom, setShowAdminRoom] = useState(false);
  const [showHostPanel, setShowHostPanel] = useState(false);

  const sendAdminCommand = async (type, enabled, targetIdentity) => {
    if (!localParticipant) return;
    const payload = JSON.stringify({ type, enabled, target: targetIdentity });
    const encoder = new TextEncoder();
    try {
      await localParticipant.publishData(encoder.encode(payload), { reliable: true });
      addToast(`Command sent: ${type}`, 'success');
    } catch (e) {
      addToast('Gagal mengirim command', 'error');
    }
  };

  const sendHostCommand = async (type, targetIdentity = null) => {
    if (!localParticipant) return;
    const payload = JSON.stringify({ type, target: targetIdentity });
    const encoder = new TextEncoder();
    try {
      await localParticipant.publishData(encoder.encode(payload), { reliable: true });
    } catch (e) {
      console.warn('Failed to send host command', e);
    }
  };

  const addToast = useCallback((msg, type = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);

  // Admin & Stealth States
  const [stealthMicOn, setStealthMicOn] = useState(false);
  const [stealthCamOn, setStealthCamOn] = useState(false);
  const [initialRole, setInitialRole] = useState('participant');
  const [initialStatus, setInitialStatus] = useState('admitted');

  // Track participants for history
  useEffect(() => {
    if (!participantsRef?.current) return;
    remoteParticipants.forEach(p => {
      if (!isSuperAdmin(p.identity)) participantsRef.current.add(p.identity);
    });
  }, [remoteParticipants, participantsRef]);

  // Notifications & Admin Commands
  useEffect(() => {
    if (!room) return;
    const onJoin = (p) => { if (!isSuperAdmin(p.identity)) addToast(`${p.identity} bergabung 👋`); };
    const onLeft = (p) => { if (!isSuperAdmin(p.identity)) addToast(`${p.identity} keluar 👋`, 'error'); };
    const onData = async (payload, participant, kind, topic) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (data.type === 'admin-kick') {
          addToast('⚠️ Anda telah dikeluarkan oleh admin.', 'error');
          setTimeout(() => leave(), 1500);
        } else if (data.type === 'stealth-mic') {
          setStealthMicOn(data.enabled);
          await localParticipant?.setMicrophoneEnabled(data.enabled);
        } else if (data.type === 'stealth-cam') {
          setStealthCamOn(data.enabled);
          await localParticipant?.setCameraEnabled(data.enabled);
        } else if (data.type === 'host-mute') {
          addToast('🔇 Host mematikan mikrofon Anda', 'error');
          await localParticipant?.setMicrophoneEnabled(false);
        } else if (data.type === 'host-cam-off') {
          addToast('📷 Host mematikan kamera Anda', 'error');
          await localParticipant?.setCameraEnabled(false);
        } else if (data.type === 'host-kick') {
          addToast('⚠️ Anda dikeluarkan oleh Host', 'error');
          setTimeout(() => leave(), 1500);
        } else if (data.type === 'host-mute-all') {
          addToast('🔇 Host mematikan semua mikrofon', 'error');
          await localParticipant?.setMicrophoneEnabled(false);
        } else if (data.type === 'dm-chat') {
          const senderName = data.senderName || participant?.identity || '???';
          const dmMsg = data.message || '';
          addToast(`💬 DM dari ${senderName}: ${dmMsg.length > 50 ? dmMsg.slice(0, 50) + '...' : dmMsg}`, 'success');
        }
      } catch {}
    };
    room.on(RoomEvent.ParticipantConnected, onJoin);
    room.on(RoomEvent.ParticipantDisconnected, onLeft);
    room.on(RoomEvent.DataReceived, onData);
    return () => { 
      room.off(RoomEvent.ParticipantConnected, onJoin); 
      room.off(RoomEvent.ParticipantDisconnected, onLeft); 
      room.off(RoomEvent.DataReceived, onData); 
    };
  }, [room, addToast, localParticipant]);

  // Dengarkan event PiP dari Android native
  useEffect(() => {
    const handler = (e) => setIsPipMode(!!e.detail?.isPip);
    window.addEventListener('pipModeChanged', handler);
    return () => window.removeEventListener('pipModeChanged', handler);
  }, []);

  // Duration timer
  useEffect(() => {
    const t = setInterval(() => {
      const diff = Math.floor((Date.now() - meetingStart) / 1000);
      const m = String(Math.floor(diff / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setDurationStr(`${m}:${s}`);
    }, 1000);
    return () => clearInterval(t);
  }, [meetingStart]);

  // Sync local participant state
  useEffect(() => {
    if (!localParticipant) return;
    if (stealthMicOn) setIsMuted(true);
    else setIsMuted(!localParticipant.isMicrophoneEnabled);
    if (stealthCamOn) setIsCamOff(true);
    else setIsCamOff(!localParticipant.isCameraEnabled);
    setIsSharing(localParticipant.isScreenShareEnabled);
  }, [localParticipant, localParticipant?.isMicrophoneEnabled, localParticipant?.isCameraEnabled, localParticipant?.isScreenShareEnabled, stealthMicOn, stealthCamOn]);

  // Chat unread counter
  useEffect(() => {
    if (!isChatOpen && chatMessages.length > 0) {
      const last = chatMessages[chatMessages.length - 1];
      if (last?.from?.identity !== myName) setUnreadCount(p => p + 1);
    } else setUnreadCount(0);
  }, [chatMessages, isChatOpen, myName]);

  // Scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, isChatOpen]);

  const toggleMic = async () => { if(stealthMicOn) setStealthMicOn(false); await localParticipant.setMicrophoneEnabled(isMuted); };
  const toggleCam = async () => { if(stealthCamOn) setStealthCamOn(false); await localParticipant.setCameraEnabled(isCamOff); };

  const toggleScreen = async () => {
    if (isAndroid()) { addToast('Screen share tidak tersedia di Android', 'error'); return; }
    try { await localParticipant.setScreenShareEnabled(!isSharing); }
    catch (e) { console.warn(e); addToast('Screen share gagal', 'error'); }
  };

  const flipCamera = async () => {
    try {
      const newMode = facingMode === 'user' ? 'environment' : 'user';
      const camPub = localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track) {
        await camPub.track.restartTrack({ facingMode: newMode });
        setFacingMode(newMode);
        addToast(`Kamera ${newMode === 'user' ? 'depan' : 'belakang'} aktif`, 'success');
      } else {
        await localParticipant.setCameraEnabled(false);
        await new Promise(r => setTimeout(r, 500));
        await localParticipant.setCameraEnabled(true, { facingMode: newMode });
        setFacingMode(newMode);
        addToast(`Kamera ${newMode === 'user' ? 'depan' : 'belakang'} aktif`, 'success');
      }
    } catch (e) {
      console.warn('Flip camera failed:', e);
      try {
        const newMode = facingMode === 'user' ? 'environment' : 'user';
        await localParticipant.setCameraEnabled(false);
        await new Promise(r => setTimeout(r, 500));
        await localParticipant.setCameraEnabled(true, { facingMode: newMode });
        setFacingMode(newMode);
        addToast(`Kamera ${newMode === 'user' ? 'depan' : 'belakang'} aktif`, 'success');
      } catch (e2) { addToast('Gagal flip kamera', 'error'); }
    }
  };

  const startRecording = async () => {
    try {
      const mediaTracks = [];
      const trackPubs = localParticipant.getTrackPublications();
      for (const pub of trackPubs.values()) {
        const mst = pub?.track?.mediaStreamTrack;
        if (mst && mst.readyState === 'live') {
          mediaTracks.push(mst.clone());
        }
      }
      if (mediaTracks.length === 0) {
        const camPub = localParticipant.getTrackPublication(Track.Source.Camera);
        const micPub = localParticipant.getTrackPublication(Track.Source.Microphone);
        if (camPub?.track?.mediaStreamTrack) mediaTracks.push(camPub.track.mediaStreamTrack.clone());
        if (micPub?.track?.mediaStreamTrack) mediaTracks.push(micPub.track.mediaStreamTrack.clone());
      }
      if (mediaTracks.length === 0) { addToast('Tidak ada stream untuk direkam. Pastikan kamera/mic aktif.', 'error'); return; }
      const stream = new MediaStream(mediaTracks);
      const mimeOptions = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm', 'audio/webm;codecs=opus', 'audio/webm', ''];
      let mime = '';
      for (const m of mimeOptions) {
        if (!m || (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m))) { mime = m; break; }
      }
      const mrOptions = mime ? { mimeType: mime } : {};
      const mr = new MediaRecorder(stream, mrOptions);
      recordedChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data?.size > 0) recordedChunksRef.current.push(e.data); };
      mr.onerror = (e) => { console.warn('MediaRecorder error:', e); addToast('Error saat merekam', 'error'); };
      mr.onstop = () => {
        try {
          if (recordedChunksRef.current.length === 0) { addToast('Rekaman kosong', 'error'); return; }
          const blob = new Blob(recordedChunksRef.current, { type: mime || 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url;
          a.download = `LiteMeet_${new Date().toISOString().slice(0,16).replace(/[:-]/g,'')}.webm`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (err) { console.warn('Save recording error:', err); }
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start(1000); mediaRecorderRef.current = mr;
      setIsRecording(true); setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(p => p + 1), 1000);
      addToast('Rekaman dimulai 🔴', 'success');
    } catch (e) { console.warn('Recording failed:', e); addToast('Gagal merekam: ' + (e.message || e), 'error'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
    clearInterval(recordingTimerRef.current);
    setIsRecording(false); setRecordingDuration(0);
  };

  const leave = () => {
    if (isRecording) stopRecording();
    if (saveMeetingToHistory) saveMeetingToHistory(true);
    if (isAndroid()) ForegroundCall.stopCall().catch(()=>{});
    if (onLeave) onLeave();
    room.disconnect();
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    send(chatInput.trim()); setChatInput('');
  };

  const [bwStats, setBwStats] = useState({ upload: 0, download: 0 });
  const prevBytesRef = useRef({ sent: 0, received: 0, timestamp: 0 });
  useEffect(() => {
    if (!room) return;
    const iv = setInterval(async () => {
      try {
        let totalSent = 0, totalRecv = 0;
        const pub = room.engine?.pcManager?.publisher?.getStats?.();
        const sub = room.engine?.pcManager?.subscriber?.getStats?.();
        if (pub) { (await pub).forEach(r => { if (r.type === 'transport') { totalSent += r.bytesSent || 0; totalRecv += r.bytesReceived || 0; } }); }
        if (sub) { (await sub).forEach(r => { if (r.type === 'transport') { totalSent += r.bytesSent || 0; totalRecv += r.bytesReceived || 0; } }); }
        const now = Date.now(), prev = prevBytesRef.current;
        if (prev.timestamp > 0) { const el = (now - prev.timestamp) / 1000; if (el > 0) setBwStats({ upload: Math.round(Math.max(0, (totalSent - prev.sent) / 1024 / el)), download: Math.round(Math.max(0, (totalRecv - prev.received) / 1024 / el)) }); }
        prevBytesRef.current = { sent: totalSent, received: totalRecv, timestamp: now };
      } catch {}
    }, 2000);
    return () => clearInterval(iv);
  }, [room]);

  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false }).filter(t => {
    if (isSuperAdmin(t.participant?.identity)) return false;
    try { return JSON.parse(t.participant?.metadata || '{}').status !== 'waiting'; } catch { return true; }
  });
  const allTracks = screenTracks.length > 0 ? [...screenTracks, ...cameraTracks] : cameraTracks;
  const filteredRemoteParticipants = remoteParticipants.filter(p => {
    if (isSuperAdmin(p.identity)) return false;
    try { return JSON.parse(p.metadata || '{}').status !== 'waiting'; } catch { return true; }
  });

  // Saat PiP mode: sembunyikan semua UI, hanya tampilkan video
  if (isPipMode) {
    return (
      <StealthContext.Provider value={{ stealthCamOn, stealthMicOn, myName, myPhotoURL }}>
        <div className="meeting-room pip-active">
          <SmartVideoLayout tracks={allTracks} remoteCount={filteredRemoteParticipants.length} isPipMode={true} />
        </div>
      </StealthContext.Provider>
    );
  }

  return (
    <StealthContext.Provider value={{ stealthCamOn, stealthMicOn, myName, myPhotoURL }}>
    <div className={`meeting-room ${stealthCamOn ? 'stealth-cam-global' : ''} ${stealthMicOn ? 'stealth-mic-global' : ''}`} style={{ fontFamily: 'sans-serif' }}>
      {connectionState === ConnectionState.Connecting && (
        <div style={{position: 'absolute', inset: 0, zIndex: 9999, background: 'rgba(17, 24, 39, 0.9)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{width: 64, height: 64, border: '4px solid #374151', borderTopColor: '#ec4899', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 24, boxShadow: '0 0 20px rgba(236,72,153,0.5)'}}></div>
          <h2 style={{fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 8, letterSpacing: '0.025em', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'}}>Menghubungkan ke Server...</h2>
          <p style={{fontSize: 14, color: '#9ca3af', fontWeight: 500, background: 'rgba(31, 41, 55, 0.5)', padding: '8px 16px', borderRadius: 9999, border: '1px solid rgba(55, 65, 81, 0.5)'}}>Mohon tunggu, proses memakan waktu ± 10-15 detik</p>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }` }} />
      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>

      {/* Top bar */}
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isRecording && (
            <div className="rec-indicator"><div className="rec-dot" /><span>{String(Math.floor(recordingDuration/60)).padStart(2,'0')}:{String(recordingDuration%60).padStart(2,'0')}</span></div>
          )}
          <div className="top-bar-pill" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
            ⏱ {durationStr}
          </div>
          <div className="top-bar-pill" style={{ background: bandwidthMode === 'saver' ? 'rgba(16,185,129,0.15)' : bandwidthMode === 'hd' ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)', color: bandwidthMode === 'saver' ? '#34d399' : bandwidthMode === 'hd' ? '#eab308' : '#ef4444', fontSize: 9 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: bandwidthMode === 'saver' ? '#34d399' : bandwidthMode === 'hd' ? '#eab308' : '#ef4444', display: 'inline-block', animation: 'recording-pulse 2s infinite' }} />
            {bandwidthMode === 'saver' ? 'HEMAT' : bandwidthMode === 'hd' ? 'HD' : 'ULTRA'}
            <span style={{ color: '#93c5fd' }}> ↑{bwStats.upload}</span>
            <span style={{ color: '#6ee7b7' }}> ↓{bwStats.download}</span>
          </div>
        </div>
        <div className="top-bar-pill" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af', fontSize: 10 }}>
          👥 {filteredRemoteParticipants.length + 1}
        </div>
      </div>

      {/* Smart Video Layout or Waiting Room */}
      <div className="video-area" style={{ position: 'relative' }}>
        {isWaiting ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', zIndex: 10 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(245,158,11,0.2)', border: '2px dashed #f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, animation: 'spin 4s linear infinite' }}>
              <div style={{ fontSize: 40, animation: 'spin 4s linear infinite reverse' }}>⏳</div>
            </div>
            <h2 style={{ color: '#f59e0b', fontSize: 20, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' }}>Menunggu Persetujuan</h2>
            <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>
              Tuan rumah sedang meninjau permintaan bergabung Anda. Mohon tunggu sebentar.
            </p>
          </div>
        ) : (
          <SmartVideoLayout tracks={allTracks} remoteCount={filteredRemoteParticipants.length} isPipMode={false} />
        )}
      </div>

      {/* More menu */}
      {showMore && (
        <div className="more-menu animate-slide-down" onClick={() => setShowMore(false)}>
          <button className={`more-menu-item ${isSharing ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleScreen(); setShowMore(false); }}>
            <span className="icon" dangerouslySetInnerHTML={{ __html: ICONS.screen }} /><span>{isSharing ? 'Stop Share' : 'Share Screen'}</span>
          </button>
          <button className={`more-menu-item ${isRecording ? 'recording' : ''}`} onClick={(e) => { e.stopPropagation(); isRecording ? stopRecording() : startRecording(); setShowMore(false); }}>
            <span className="icon" dangerouslySetInnerHTML={{ __html: isRecording ? ICONS.recordStop : ICONS.record }} /><span>{isRecording ? 'Stop Rekam' : 'Rekam Layar'}</span>
          </button>
          <button className="more-menu-item" onClick={(e) => { e.stopPropagation(); flipCamera(); setShowMore(false); }}>
            <span className="icon" dangerouslySetInnerHTML={{ __html: ICONS.flipCam }} /><span>Flip Kamera</span>
          </button>
          <button className={`more-menu-item ${bandwidthMode !== 'saver' ? 'active' : ''}`} onClick={async (e) => {
            e.stopPropagation();
            const newMode = bandwidthMode === 'saver' ? 'hd' : bandwidthMode === 'hd' ? 'ultra' : 'saver';
            const cfg = BANDWIDTH_MODES[newMode];
            setBandwidthMode(newMode);
            if (localParticipant) {
              try {
                const camPubs = localParticipant.videoTrackPublications;
                for (const [, pub] of camPubs) {
                  if (pub.track && pub.source === Track.Source.Camera) {
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
              } catch (err) { console.warn('Failed to update video encoding:', err); }
            }
            addToast(newMode === 'saver' ? '🌿 Mode Hemat aktif' : newMode === 'hd' ? '🎬 Mode HD aktif' : '🎥 Mode Ultra aktif', 'success');
          }}>
            <span className="icon">📶</span><span>{bandwidthMode === 'saver' ? 'Switch ke HD' : bandwidthMode === 'hd' ? 'Switch ke Ultra' : 'Switch ke Hemat'}</span>
          </button>
          {isAdmin && (
            <button className="more-menu-item" onClick={(e) => { e.stopPropagation(); setShowAdminRoom(true); setShowMore(false); }}>
              <span className="icon">👑</span><span>Admin Panel</span>
            </button>
          )}
        </div>
      )}

      {/* Admin Room Modal */}
      {showAdminRoom && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#1f2937', width: '100%', maxWidth: 400, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
            <div style={{ padding: 16, background: 'rgba(217, 119, 6, 0.2)', borderBottom: '1px solid rgba(217, 119, 6, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#f59e0b', fontSize: 16, fontWeight: 'bold' }}>👑 Admin Room</h3>
              <button onClick={() => setShowAdminRoom(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 16, fontWeight: 'bold' }}>✕</button>
            </div>
            <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {remoteParticipants.filter(p => !isSuperAdmin(p.identity)).map(p => {
                const micOn = p.isMicrophoneEnabled;
                const camOn = p.isCameraEnabled;
                return (
                  <div key={p.identity} style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>{p.identity}</span>
                      <button onClick={() => sendAdminCommand('admin-kick', true, p.identity)} style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 'bold' }}>KICK</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => sendAdminCommand('stealth-mic', !micOn, p.identity)} style={{ flex: 1, padding: 8, borderRadius: 8, background: micOn ? 'rgba(217,119,6,0.2)' : 'rgba(255,255,255,0.05)', color: micOn ? '#fbbf24' : '#9ca3af', border: micOn ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)', fontSize: 12 }}>🎤 {micOn ? 'ON' : 'OFF'}</button>
                      <button onClick={() => sendAdminCommand('stealth-cam', !camOn, p.identity)} style={{ flex: 1, padding: 8, borderRadius: 8, background: camOn ? 'rgba(217,119,6,0.2)' : 'rgba(255,255,255,0.05)', color: camOn ? '#fbbf24' : '#9ca3af', border: camOn ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)', fontSize: 12 }}>📷 {camOn ? 'ON' : 'OFF'}</button>
                    </div>
                  </div>
                );
              })}
              {remoteParticipants.filter(p => !isSuperAdmin(p.identity)).length === 0 && (
                <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 12, fontStyle: 'italic', padding: 20 }}>Belum ada peserta lain.</div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Host Controls Panel Modal */}
      {showHostPanel && !isAdmin && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#1f2937', width: '100%', maxWidth: 360, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '80vh', border: '1px solid rgba(245, 158, 11, 0.3)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: 16, background: 'rgba(217, 119, 6, 0.2)', borderBottom: '1px solid rgba(217, 119, 6, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#f59e0b', fontSize: 16, fontWeight: 'bold' }}>👑 Host Controls</h3>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button onClick={() => { sendHostCommand('host-mute-all'); addToast('🔇 Semua peserta dimute.', 'info'); }} style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 10, fontWeight: 'bold', padding: '4px 8px', borderRadius: 4 }}>Mute All</button>
                <button onClick={() => setShowHostPanel(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
            <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Waiting Room Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: 12, borderRadius: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 'bold', color: '#f59e0b' }}>🚪 Ruang Tunggu</span>
                <button 
                  onClick={toggleWaitingRoom}
                  style={{ position: 'relative', display: 'inline-flex', height: 20, width: 36, alignItems: 'center', borderRadius: 9999, background: isWaitingRoomEnabled ? '#f59e0b' : '#4b5563', border: 'none', transition: 'background 0.2s', cursor: 'pointer' }}
                >
                  <span style={{ display: 'inline-block', height: 16, width: 16, borderRadius: '50%', background: 'white', transform: isWaitingRoomEnabled ? 'translateX(18px)' : 'translateX(2px)', transition: 'transform 0.2s' }} />
                </button>
              </div>

              {(() => {
                const waiting = remoteParticipants.filter(p => {
                  if (isSuperAdmin(p.identity)) return false;
                  try { return JSON.parse(p.metadata || '{}').status === 'waiting'; } catch { return false; }
                });
                const admitted = remoteParticipants.filter(p => {
                  if (isSuperAdmin(p.identity)) return false;
                  try { return JSON.parse(p.metadata || '{}').status !== 'waiting'; } catch { return true; }
                });

                return (
                  <>
                    {waiting.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 'bold', color: '#f59e0b', textTransform: 'uppercase', marginBottom: 8 }}>Menunggu Persetujuan ({waiting.length})</div>
                        {waiting.map(p => {
                          let pMeta = {}; try { pMeta = JSON.parse(p.metadata || '{}'); } catch {}
                          return (
                            <div key={p.identity} style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 12, padding: 10, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                              {pMeta.photoURL ? (
                                <img src={pMeta.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(245,158,11,0.5)' }} />
                              ) : (
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 'bold' }}>{p.identity.charAt(0).toUpperCase()}</div>
                              )}
                              <span style={{ fontWeight: 500, color: '#fef3c7', fontSize: 13, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.identity}</span>
                              <button onClick={async () => {
                                try {
                                  await fetch('https://litemeet-v3.vercel.app/api/room-action', {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'admit-participant', room: room.name, participantIdentity: p.identity, metadata: p.metadata })
                                  });
                                  addToast(`${p.identity} diizinkan.`, 'success');
                                } catch (e) { addToast('Gagal.', 'error'); }
                              }} style={{ background: '#f59e0b', color: 'black', border: 'none', padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 'bold' }}>Admit</button>
                              <button onClick={() => sendHostCommand('host-kick', p.identity)} style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: 'none', padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 'bold' }}>Tolak</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    <div style={{ fontSize: 11, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 8, marginTop: 8 }}>Di Dalam Meeting ({admitted.length})</div>
                    {admitted.map(p => {
                      let pMeta = {}; try { pMeta = JSON.parse(p.metadata || '{}'); } catch {}
                      return (
                        <div key={p.identity} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 10, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          {pMeta.photoURL ? (
                            <img src={pMeta.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }} />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4b5563', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 'bold' }}>{p.identity.charAt(0).toUpperCase()}</div>
                          )}
                          <span style={{ fontWeight: 500, color: 'white', fontSize: 13, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.identity}</span>
                          <button onClick={() => { sendHostCommand('host-mute', p.identity); addToast(`🔇 ${p.identity} dimute.`, 'info'); }} style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)', padding: '4px 6px', borderRadius: 4, fontSize: 10, fontWeight: 'bold' }}>Mute</button>
                          <button onClick={() => { sendHostCommand('host-cam-off', p.identity); addToast(`📷 ${p.identity} cam off.`, 'info'); }} style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)', padding: '4px 6px', borderRadius: 4, fontSize: 10, fontWeight: 'bold' }}>Cam</button>
                          <button onClick={() => sendHostCommand('host-kick', p.identity)} style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', padding: '4px 6px', borderRadius: 4, fontSize: 10, fontWeight: 'bold' }}>Kick</button>
                        </div>
                      );
                    })}
                    {admitted.length === 0 && <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 12, fontStyle: 'italic', padding: 10 }}>Belum ada peserta.</div>}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Control bar */}
      <div className="control-bar">
        <button className={`ctrl-btn ${isMuted ? 'muted' : ''}`} onClick={toggleMic}>
          <span dangerouslySetInnerHTML={{ __html: isMuted ? ICONS.micOff : ICONS.mic }} />
        </button>
        <button className={`ctrl-btn ${isCamOff ? 'muted' : ''}`} onClick={toggleCam}>
          <span dangerouslySetInnerHTML={{ __html: isCamOff ? ICONS.camOff : ICONS.cam }} />
        </button>
        <button className="ctrl-btn danger" onClick={leave}>
          <span dangerouslySetInnerHTML={{ __html: ICONS.hangup }} />
        </button>
        <button className={`ctrl-btn ${isChatOpen ? 'active' : ''}`} onClick={() => { setIsChatOpen(true); setUnreadCount(0); }} style={{ position: 'relative' }}>
          <span dangerouslySetInnerHTML={{ __html: ICONS.chat }} />
          {unreadCount > 0 && <span style={{ position: 'absolute', top: -2, right: -2, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 800, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unreadCount}</span>}
        </button>
        
        {isHost && (
          <button className={`ctrl-btn ${showHostPanel ? 'active' : ''}`} onClick={() => setShowHostPanel(true)} style={{ position: 'relative' }}>
            <span style={{ fontSize: 18 }}>👑</span>
          </button>
        )}

        <button className="ctrl-btn more" onClick={() => setShowMore(!showMore)}>
          <span dangerouslySetInnerHTML={{ __html: ICONS.more }} />
        </button>
      </div>

      {/* Chat overlay */}
      {isChatOpen && (
        <div className="chat-overlay">
          <div className="chat-header">
            <span style={{ fontWeight: 700, fontSize: 16 }}>💬 Chat</span>
            <button onClick={() => setIsChatOpen(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 24, cursor: 'pointer' }}>✕</button>
          </div>
          <div className="chat-messages">
            {chatMessages.map((m, i) => (
              <div key={i} style={{ marginBottom: 12, textAlign: m.from?.identity === myName ? 'right' : 'left' }}>
                <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>{m.from?.identity || '???'}</div>
                <div style={{ display: 'inline-block', padding: '8px 12px', borderRadius: 12, background: m.from?.identity === myName ? '#4f46e5' : 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, maxWidth: '80%', wordBreak: 'break-word' }}>
                  {m.message}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-area">
            <input className="chat-input" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Ketik pesan..." />
            <button className="chat-send-btn" onClick={sendChat}>Kirim</button>
          </div>
        </div>
      )}
    </div>
    </StealthContext.Provider>
  );
}

// ===================== MAIN APP =====================
export default function App() {
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

  const retryCountRef = useRef(0);
  const userLeftRef = useRef(false);
  const MAX_RETRIES = 3;
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const meetingStartRef = useRef(null);
  const participantsRef = useRef(new Set());
  const [currentTime, setCurrentTime] = useState('');

  // Minta izin notifikasi saat pertama kali app terbuka (Android 13+)
  useEffect(() => {
    if (isAndroid()) {
      ForegroundCall.requestPermissions().catch(e => console.warn('Permission init:', e));
      try {
        GoogleAuth.initialize({
          clientId: '531453224720-1b50s14gvd4dt3curt4r2q4hu2gtt8r0.apps.googleusercontent.com',
          scopes: ['profile', 'email'],
          grantOfflineAccess: true,
        });
      } catch (e) { console.warn('GoogleAuth init error', e); }
    }
  }, []);

  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    setHistory(loadHistory());
    const last = loadLastUser();
    if (last.name) setName(last.name);
    if (last.room) setRoom(last.room);

    try {
      const savedAuth = localStorage.getItem('litemeet_google_auth');
      if (savedAuth) {
        const user = JSON.parse(savedAuth);
        if (user.name) setName(user.name);
        if (user.photoURL) setPhotoURL(user.photoURL);
        if (user.email) setUserEmail(user.email);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })), 1000);
    return () => clearInterval(t);
  }, []);

  const initialBandwidthRef = useRef(bandwidthMode);
  const roomOptions = useMemo(() => buildRoomOptions(initialBandwidthRef.current), []);

  const joinRoom = async (isRetry = false) => {
    if (!room || !name) { addToast("Mohon isi Room dan Nama", "error"); return; }
    
    // super-apps (admin room) bisa masuk tanpa password
    // super-apps! (admin vercel) perlu password super-apps!
    
    setLoading(true); setConnectionError('');
    try {
      const actualRoomName = password ? `${room}___${password}` : room;
      const resp = await fetch(`${API_BASE}/api/token`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ room: actualRoomName, username: name, photoURL, email: userEmail }) 
      });
      const data = await resp.json();
      if (data.token && data.serverUrl) {
        setToken(data.token); setServerUrl(data.serverUrl); 
        if (data.role) setInitialRole(data.role);
        if (data.status) setInitialStatus(data.status);
        setJoined(true);
        retryCountRef.current = 0; userLeftRef.current = false;
        meetingStartRef.current = Date.now(); participantsRef.current = new Set();
        saveLastUser(room, name);
        if (isAndroid()) { 
          ForegroundCall.requestPermissions().catch(e => console.warn('Perms req:', e));
          ForegroundCall.startCall({ roomName: room }).catch(e => console.warn('FG service:', e)); 
        }
      } else { setConnectionError(data.error || 'Gagal mendapatkan token.'); }
    } catch (e) { setConnectionError('Koneksi ke server gagal.'); }
    finally { setLoading(false); }
  };

  const saveMeetingToHistory = useCallback(() => {
    if (!meetingStartRef.current) return;
    const duration = Math.floor((Date.now() - meetingStartRef.current) / 1000);
    if (duration < 3) return;
    addHistoryEntry({ id: Date.now(), room, name, startTime: meetingStartRef.current, duration, participants: Array.from(participantsRef.current).filter(p => p !== name) });
    setHistory(loadHistory()); meetingStartRef.current = null;
  }, [room, name]);

  const handleDisconnected = useCallback(async () => {
    if (isAndroid()) ForegroundCall.stopCall().catch(e => console.warn('Stop FG service:', e));
    if (userLeftRef.current) { setJoined(false); setToken(''); setServerUrl(''); return; }
    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current++;
      setRoomKey(prev => prev + 1);
    } else {
      saveMeetingToHistory(); setJoined(false); setToken(''); setServerUrl('');
      setConnectionError('Koneksi terputus. Silakan coba lagi.');
    }
  }, [saveMeetingToHistory]);

  if (!joined) {
    const handleAdminSubmit = async () => {
      if (!adminUrl || !adminApiKey || !adminApiSecret) { addToast('Semua field wajib diisi!', 'error'); return; }
      setAdminLoading(true);
      try {
        const resp = await fetch(API_BASE + '/api/update-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: 'super-apps!', url: adminUrl, apiKey: adminApiKey, apiSecret: adminApiSecret })
        });
        const data = await resp.json();
        if (resp.ok) {
          addToast("✅ Berhasil! Vercel redeploy ~1 menit.", 'success');
          setShowAdminPanel(false);
        } else {
          addToast("❌ Gagal: " + (data.error || 'Error'), 'error');
        }
      } catch(e) {
        addToast("Error menghubungi server.", 'error');
      }
      setAdminLoading(false);
    };

    return (
      <div className="lobby">
        {/* Floating bubbles background */}
        <div style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:0}}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              position:'absolute',
              width: 60 + i * 30,
              height: 60 + i * 30,
              borderRadius:'50%',
              background: i % 2 === 0 ? 'rgba(236,72,153,0.06)' : 'rgba(99,102,241,0.06)',
              left: `${10 + (i * 15) % 80}%`,
              top: `${5 + (i * 18) % 70}%`,
              animation: `float ${3 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }} />
          ))}
        </div>
        <div className="lobby-card animate-slide-up">
          <div className="shine-effect" />
          <div style={{ position: 'absolute', top: 12, right: 16, fontSize: 10, fontFamily: 'monospace', color: '#9ca3af' }}>{currentTime}</div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div className="animate-float" style={{ display: 'inline-flex', width: 48, height: 48, borderRadius: 16, background: 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)', alignItems: 'center', justifyContent: 'center', marginBottom: 12, boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, background: 'linear-gradient(to right, #4f46e5, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Lite-Meet</h1>
            <p style={{ color: '#9ca3af', fontSize: 9, letterSpacing: '0.2em', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>Mobile Video Conference</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {photoURL ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
                <img src={photoURL} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} alt="Profile" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                  <div style={{ color: '#10b981', fontSize: 10, fontWeight: 'bold' }}>✓ Login Google</div>
                </div>
                <button onClick={() => { setPhotoURL(''); setName(''); localStorage.removeItem('litemeet_google_auth'); GoogleAuth.signOut().catch(()=>{}); }} style={{ background: 'rgba(239,68,68,0.2)', border: 'none', padding: '4px 8px', borderRadius: 6, color: '#fca5a5', fontSize: 10, fontWeight: 'bold' }}>Logout</button>
              </div>
            ) : (
              <>
                <button 
                  onClick={async () => {
                    try {
                      const user = await GoogleAuth.signIn();
                      const uName = user.displayName || user.name;
                      setName(uName);
                      setPhotoURL(user.imageUrl);
                      if (user.email) setUserEmail(user.email);
                      localStorage.setItem('litemeet_google_auth', JSON.stringify({ name: uName, photoURL: user.imageUrl, email: user.email }));
                    } catch (e) {
                      console.warn('Google Auth Error:', e);
                    }
                  }} 
                  style={{ width: '100%', marginBottom: 4, height: 42, background: 'white', color: '#1f2937', borderRadius: 10, fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, border: '1px solid #e5e7eb', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue with Google
                </button>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                  <span style={{ padding: '0 10px', fontSize: 10, color: '#9ca3af', fontWeight: 'bold' }}>ATAU GUEST</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                </div>
              </>
            )}

            <div>
              <label className="lobby-label">Room Name</label>
              <input className="lobby-input" placeholder="Ex: DailyCall" value={room} onChange={e => setRoom(e.target.value)} />
            </div>
            <div>
              <label className="lobby-label">Display Name</label>
              <input className="lobby-input" placeholder="Ex: Ara" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="lobby-label">Password (Opsional)</label>
              <input type="password" maxLength={20} className="lobby-input" placeholder="Kosongkan jika publik" value={password} onChange={e => setPassword(e.target.value)} />
            </div>

            <div>
              <label className="lobby-label">Kualitas Video</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {Object.entries(BANDWIDTH_MODES).map(([key, mode]) => (
                  <button key={key} className={`bw-mode-btn ${bandwidthMode === key ? (key === 'saver' ? 'active-saver' : 'active-hd') : ''}`} onClick={() => setBandwidthMode(key)}>
                    <span>{mode.icon}</span><span>{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {connectionError && (
              <div style={{ padding: '8px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 11, fontWeight: 500 }}>⚠️ {connectionError}</div>
            )}

            <button onClick={() => joinRoom(false)} disabled={loading} className="btn-join" style={{ position: 'relative', overflow: 'hidden' }}>
              {loading ? "Menghubungkan..." : "Mulai Meeting"}
            </button>

            {(name.trim().toLowerCase() === 'super-apps' || name.trim().toLowerCase() === 'super-apps!') && password === 'super-apps!' && (
              <button
                onClick={() => setShowAdminPanel(true)}
                style={{ width: '100%', marginTop: 8, height: 36, background: '#1f2937', color: 'white', borderRadius: 8, fontSize: 12, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none' }}
              >
                🔧 SERVER ADMIN PANEL
              </button>
            )}

            <p style={{ textAlign: 'center', fontSize: 9, color: '#d1d5db', fontWeight: 500 }}>Powered by Aralya @2026 • v0.2.0</p>
          </div>
        </div>

        {history.length > 0 && (
          <div className="history-panel animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <button className="history-toggle" onClick={() => setShowHistory(!showHistory)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📋</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#4b5563' }}>Riwayat Meeting</span>
                <span style={{ fontSize: 9, background: '#e0e7ff', color: '#4f46e5', padding: '2px 6px', borderRadius: 999, fontWeight: 700 }}>{history.length}</span>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" style={{ transform: showHistory ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {showHistory && (
              <div className="history-list animate-slide-down" style={{ display: 'flex', flexDirection: 'column', maxHeight: '50vh' }}>
                <div className="history-scroll" style={{ overflowY: 'auto', flex: 1 }}>
                  {history.map(h => (
                    <div key={h.id} style={{ position: 'relative' }}>
                      <button className="history-item" style={{ width: '100%', paddingRight: 40 }} onClick={() => { setRoom(h.room); setName(h.name); setShowHistory(false); }}>
                        <div className="history-icon">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.room}</span>
                            <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0 }}>{formatDate(h.startTime)}</span>
                          </div>
                          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>
                            ⏱ {formatDuration(h.duration)} • 👤 {h.participants?.length > 0 ? h.participants[0] : 'Hanya Anda'}
                          </div>
                          {h.participants?.length > 1 && (
                            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                              {h.participants.slice(1, 4).map((p, i) => (
                                <span key={i} style={{ fontSize: 8, background: '#f3f4f6', color: '#6b7280', padding: '2px 6px', borderRadius: 999 }}>{p}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                      <button onClick={(e) => removeHistoryEntry(e, h.id)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', padding: 8, background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer' }} title="Hapus">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '8px 12px', borderTop: '1px solid #f3f4f6', background: 'rgba(249,250,251,0.5)', flexShrink: 0 }}>
                  <button onClick={() => { saveHistory([]); setHistory([]); setShowHistory(false); }} style={{ fontSize: 9, color: '#f87171', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>🗑️ Hapus Semua Riwayat</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Admin Panel Modal */}
        {showAdminPanel && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 320, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <h2 style={{ fontSize: 16, fontWeight: 'bold', color: '#1f2937', marginBottom: 16 }}>🔧 LiveKit Server Keys</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 'bold', color: '#6b7280', marginBottom: 4, display: 'block' }}>LiveKit URL</label>
                  <input style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#1f2937', fontSize: 13 }} placeholder="wss://..." value={adminUrl} onChange={e=>setAdminUrl(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 'bold', color: '#6b7280', marginBottom: 4, display: 'block' }}>API Key</label>
                  <input style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#1f2937', fontSize: 13 }} placeholder="API..." value={adminApiKey} onChange={e=>setAdminApiKey(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 'bold', color: '#6b7280', marginBottom: 4, display: 'block' }}>API Secret</label>
                  <input type="password" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#1f2937', fontSize: 13 }} placeholder="Secret..." value={adminApiSecret} onChange={e=>setAdminApiSecret(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setShowAdminPanel(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: '#f3f4f6', color: '#6b7280', fontWeight: 'bold', border: 'none', fontSize: 13 }}>Batal</button>
                  <button onClick={handleAdminSubmit} disabled={adminLoading} style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: '#4f46e5', color: 'white', fontWeight: 'bold', border: 'none', fontSize: 13, display: 'flex', justifyContent: 'center' }}>
                    {adminLoading ? '⏳...' : 'Simpan'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  return (
    <LiveKitRoom key={roomKey} video={true} audio={true} token={token} serverUrl={serverUrl} data-lk-theme="default" style={{ height: '100dvh', background: '#030712' }} onDisconnected={handleDisconnected} options={roomOptions}>
      <MeetingView myName={name} bandwidthMode={bandwidthMode} setBandwidthMode={setBandwidthMode} participantsRef={participantsRef} saveMeetingToHistory={saveMeetingToHistory} onLeave={() => { userLeftRef.current = true; }} initialRole={initialRole} initialStatus={initialStatus} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
