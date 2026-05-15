import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { LiveKitRoom, GridLayout, ParticipantTile, RoomAudioRenderer, useTracks, useLocalParticipant, useRemoteParticipants, useRoomContext, useChat } from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, RoomEvent } from 'livekit-client';
import { API_BASE, ICONS, BANDWIDTH_MODES, buildRoomOptions, loadHistory, saveHistory, addHistoryEntry, loadLastUser, saveLastUser, formatDuration, formatDate } from './constants';

// ===================== MEETING COMPONENT =====================
function MeetingView({ myName, bandwidthMode, setBandwidthMode, participantsRef, saveMeetingToHistory, onLeave }) {
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
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });

  const addToast = useCallback((msg, type = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);

  // Track participants for history
  useEffect(() => {
    if (!participantsRef?.current) return;
    remoteParticipants.forEach(p => participantsRef.current.add(p.identity));
  }, [remoteParticipants, participantsRef]);

  // Notifications
  useEffect(() => {
    if (!room) return;
    const onJoin = (p) => addToast(`${p.identity} bergabung 👋`);
    const onLeft = (p) => addToast(`${p.identity} keluar 👋`, 'error');
    room.on(RoomEvent.ParticipantConnected, onJoin);
    room.on(RoomEvent.ParticipantDisconnected, onLeft);
    return () => { room.off(RoomEvent.ParticipantConnected, onJoin); room.off(RoomEvent.ParticipantDisconnected, onLeft); };
  }, [room, addToast]);

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
    setIsMuted(!localParticipant.isMicrophoneEnabled);
    setIsCamOff(!localParticipant.isCameraEnabled);
    setIsSharing(localParticipant.isScreenShareEnabled);
  }, [localParticipant, localParticipant?.isMicrophoneEnabled, localParticipant?.isCameraEnabled, localParticipant?.isScreenShareEnabled]);

  // Chat unread counter
  useEffect(() => {
    if (!isChatOpen && chatMessages.length > 0) {
      const last = chatMessages[chatMessages.length - 1];
      if (last?.from?.identity !== myName) setUnreadCount(p => p + 1);
    } else setUnreadCount(0);
  }, [chatMessages, isChatOpen, myName]);

  // Scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, isChatOpen]);

  const toggleMic = async () => { await localParticipant.setMicrophoneEnabled(isMuted); };
  const toggleCam = async () => { await localParticipant.setCameraEnabled(isCamOff); };
  const toggleScreen = async () => {
    try { await localParticipant.setScreenShareEnabled(!isSharing); } catch (e) { console.warn(e); }
  };

  const flipCamera = async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: newMode } } });
      const track = stream.getVideoTracks()[0];
      await localParticipant.setCameraEnabled(false);
      await localParticipant.publishTrack(track, { source: Track.Source.Camera });
    } catch (e) { console.warn('Flip camera failed:', e); setFacingMode(facingMode); }
  };

  // Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const mr = new MediaRecorder(stream, { mimeType: mime });
      recordedChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `LiteMeet_${new Date().toISOString().slice(0,16).replace(/[:-]/g,'')}.webm`;
        a.click(); URL.revokeObjectURL(url);
      };
      mr.start(1000); mediaRecorderRef.current = mr;
      setIsRecording(true); setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(p => p + 1), 1000);
      stream.getVideoTracks()[0].onended = () => stopRecording();
    } catch (e) { console.warn('Recording failed:', e); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
    clearInterval(recordingTimerRef.current);
    setIsRecording(false); setRecordingDuration(0);
  };

  const leave = () => {
    if (isRecording) stopRecording();
    if (saveMeetingToHistory) saveMeetingToHistory();
    if (onLeave) onLeave();
    room.disconnect();
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    send(chatInput.trim()); setChatInput('');
  };

  const tracks = screenTracks.length > 0 ? [...screenTracks, ...cameraTracks] : cameraTracks;

  return (
    <div className="meeting-room">
      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>

      {/* Top bar */}
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isRecording && (
            <div className="rec-indicator"><div className="rec-dot" /><span>{String(Math.floor(recordingDuration/60)).padStart(2,'0')}:{String(recordingDuration%60).padStart(2,'0')}</span></div>
          )}
          <div className="top-bar-pill" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
            ⏱ {durationStr}
          </div>
        </div>
        <div className="top-bar-pill" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af', fontSize: 10 }}>
          👥 {remoteParticipants.length + 1}
        </div>
      </div>

      {/* Video */}
      <div className="video-area">
        <GridLayout tracks={tracks} style={{ height: '100%' }}>
          <ParticipantTile />
        </GridLayout>
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
          <button className={`more-menu-item ${bandwidthMode === 'hd' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setBandwidthMode(bandwidthMode === 'saver' ? 'hd' : 'saver'); setShowMore(false); }}>
            <span className="icon">📶</span><span>{bandwidthMode === 'saver' ? 'Switch ke HD' : 'Switch ke Hemat'}</span>
          </button>
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
  );
}

// ===================== MAIN APP =====================
export default function App() {
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bandwidthMode, setBandwidthMode] = useState('saver');
  const [connectionError, setConnectionError] = useState('');
  const retryCountRef = useRef(0);
  const userLeftRef = useRef(false);
  const MAX_RETRIES = 11;
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const meetingStartRef = useRef(null);
  const participantsRef = useRef(new Set());
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    setHistory(loadHistory());
    const last = loadLastUser();
    if (last.name) setName(last.name);
    if (last.room) setRoom(last.room);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })), 1000);
    return () => clearInterval(t);
  }, []);

  const roomOptions = useMemo(() => buildRoomOptions(bandwidthMode), [bandwidthMode]);

  const joinRoom = async (isRetry = false) => {
    if (!room || !name) { alert('Mohon isi Nama Room dan Nama Anda!'); return; }
    setLoading(true); setConnectionError('');
    try {
      if (isRetry) await fetch(`${API_BASE}/api/switch-key`, { method: 'POST' });
      const resp = await fetch(`${API_BASE}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room, username: name }) });
      const data = await resp.json();
      if (data.token && data.serverUrl) {
        setToken(data.token); setServerUrl(data.serverUrl); setJoined(true);
        retryCountRef.current = 0; userLeftRef.current = false;
        meetingStartRef.current = Date.now(); participantsRef.current = new Set();
        saveLastUser(room, name);
        // Start foreground service for background call
        try {
          const { ForegroundService } = await import('@capawesome-team/capacitor-android-foreground-service');
          await ForegroundService.startForegroundService({ id: 1, title: 'LiteMeet', body: `Panggilan aktif: ${room}`, smallIcon: 'ic_stat_videocam' });
        } catch (e) { /* not on native */ }
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
    // Stop foreground service
    try { const { ForegroundService } = await import('@capawesome-team/capacitor-android-foreground-service'); await ForegroundService.stopForegroundService(); } catch (e) {}
    if (userLeftRef.current) { setJoined(false); setToken(''); setServerUrl(''); return; }
    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current++; setJoined(false); setToken(''); setServerUrl('');
      setTimeout(() => joinRoom(true), 1500);
    } else {
      saveMeetingToHistory(); setJoined(false); setToken(''); setServerUrl('');
      setConnectionError('Semua server penuh. Coba lagi nanti.');
    }
  }, [room, name, saveMeetingToHistory]);

  // ===================== LOBBY =====================
  if (!joined) {
    return (
      <div className="lobby">
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
            <div>
              <label className="lobby-label">Room Name</label>
              <input className="lobby-input" placeholder="Ex: DailyCall" value={room} onChange={e => setRoom(e.target.value)} />
            </div>
            <div>
              <label className="lobby-label">Display Name</label>
              <input className="lobby-input" placeholder="Ex: Ara" value={name} onChange={e => setName(e.target.value)} />
            </div>

            {/* Bandwidth mode */}
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

            <button className="btn-join" onClick={() => joinRoom(false)} disabled={loading}>
              {loading ? '⏳ Menghubungkan...' : 'Mulai Meeting'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 9, color: '#d1d5db', fontWeight: 500 }}>Powered by Aralya @2026</p>
          </div>
        </div>

        {/* History */}
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
              <div className="history-list animate-slide-down">
                <div className="history-scroll">
                  {history.map(h => (
                    <button key={h.id} className="history-item" onClick={() => { setRoom(h.room); setName(h.name); setShowHistory(false); }}>
                      <div className="history-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
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
                  ))}
                </div>
                <div style={{ padding: '8px 12px', borderTop: '1px solid #f3f4f6', background: 'rgba(249,250,251,0.5)' }}>
                  <button onClick={() => { saveHistory([]); setHistory([]); }} style={{ fontSize: 9, color: '#f87171', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>🗑️ Hapus Semua Riwayat</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ===================== IN-CALL =====================
  return (
    <LiveKitRoom video={true} audio={true} token={token} serverUrl={serverUrl} data-lk-theme="default" style={{ height: '100dvh', background: '#030712' }} onDisconnected={handleDisconnected} options={roomOptions}>
      <MeetingView myName={name} bandwidthMode={bandwidthMode} setBandwidthMode={setBandwidthMode} participantsRef={participantsRef} saveMeetingToHistory={saveMeetingToHistory} onLeave={() => { userLeftRef.current = true; }} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
