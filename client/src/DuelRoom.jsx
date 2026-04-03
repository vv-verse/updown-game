/**
 * DuelRoom.jsx — 1v1 Duel mode
 * Both players pick a secret simultaneously, then alternate guessing.
 * Each player sees only their own hints. First correct guess wins.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useVoiceChat } from './useVoiceChat.js';
import socket from './socket';
import { sounds } from './sounds.js';

const COLORS = ['#c8ff00', '#00ffcc'];
const EMOJI_LIST = ['👍','🔥','😂','😮','🎉','❤️','💀','🤔','👏','😎'];

function HintBadge({ hint }) {
  if (hint === 'UP')      return <span className="tag-up">▲ UP</span>;
  if (hint === 'DOWN')    return <span className="tag-down">▼ DOWN</span>;
  if (hint === 'CORRECT') return <span className="tag-correct">✓ CORRECT</span>;
  return null;
}

function Timer({ timerEnd }) {
  const [secs, setSecs] = useState(null);
  useEffect(() => {
    if (!timerEnd) { setSecs(null); return; }
    const tick = () => setSecs(Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [timerEnd]);
  if (secs === null) return null;
  const urgent = secs <= 10;
  return (
    <span className={`font-mono font-bold tabular-nums text-xl ${urgent ? 'text-danger animate-pulse-fast' : 'text-paper/60'}`}>
      {String(Math.floor(secs/60)).padStart(2,'0')}:{String(secs%60).padStart(2,'0')}
    </span>
  );
}

function ExitModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
      <div style={{ background:'#0f0f18',border:'1px solid rgba(200,255,0,0.3)',borderRadius:8,padding:'28px 28px 24px',maxWidth:340,width:'100%' }}>
        <h2 style={{ fontFamily:'monospace',fontSize:20,color:'#c8ff00',marginBottom:10 }}>Leave the room?</h2>
        <p style={{ fontFamily:'sans-serif',fontSize:15,color:'rgba(245,240,232,0.6)',lineHeight:1.6,marginBottom:24 }}>You'll exit the duel.</p>
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={onCancel} style={{ flex:1,padding:'11px',fontFamily:'monospace',fontSize:13,letterSpacing:1,textTransform:'uppercase',cursor:'pointer',background:'transparent',border:'1px solid rgba(245,240,232,0.25)',color:'rgba(245,240,232,0.7)',borderRadius:4 }}>Stay</button>
          <button onClick={onConfirm} style={{ flex:1,padding:'11px',fontFamily:'monospace',fontSize:13,letterSpacing:1,textTransform:'uppercase',cursor:'pointer',background:'rgba(255,51,102,0.15)',border:'1px solid #ff3366',color:'#ff3366',borderRadius:4 }}>Leave</button>
        </div>
      </div>
    </div>
  );
}

function MicSvg({ color }) {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color||'#c8ff00'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>;
}
function MicOffSvg() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffaa00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 10v-1m14 0v1a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>;
}
function SpkSvg({ color }) {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color||'#c8ff00'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>;
}
function SpkOffSvg() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffaa00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>;
}

function VoiceControls({ inVoice, micMuted, speakerMuted, joinVoice, leaveVoice, toggleMic, toggleSpeaker }) {
  const btn = (active, onClick, children) => (
    <button onClick={onClick} style={{ display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:'50%',cursor:'pointer',background:active?'rgba(255,170,0,0.12)':'rgba(200,255,0,0.08)',border:active?'1px solid rgba(255,170,0,0.5)':'1px solid rgba(200,255,0,0.35)' }}>
      {children}
    </button>
  );
  if (!inVoice) return btn(false, joinVoice, <MicSvg />);
  return (
    <div style={{ display:'flex',gap:5 }}>
      {btn(micMuted,     toggleMic,     micMuted     ? <MicOffSvg /> : <MicSvg />)}
      {btn(speakerMuted, toggleSpeaker, speakerMuted ? <SpkOffSvg /> : <SpkSvg />)}
    </div>
  );
}

export default function DuelRoom({ room: initialRoom, setRoom, myId, roomCodeRef, voiceEnabled }) {
  const [room,          setLocal]       = useState(initialRoom);
  const [secretInput,   setSecretInput] = useState('');
  const [secretLocked,  setSecretLocked]= useState(false);
  const [guess,         setGuess]       = useState('');
  const [myHistory,     setMyHistory]   = useState([]);
  const [roundResult,   setRoundResult] = useState(null);
  const [oppCount,      setOppCount]    = useState(0);
  const [inputShake,    setInputShake]  = useState(false);
  const [showExit,      setShowExit]    = useState(false);
  const [activeTab,     setActiveTab]   = useState('game');
  const [chatMessages,  setChat]        = useState([]);
  const [chatInput,     setChatInput]   = useState('');
  const [unread,        setUnread]      = useState(0);
  const [isDesktop,     setIsDesktop]   = useState(() => window.innerWidth >= 768);

  const chatRef    = useRef(null);
  const chatPrev   = useRef(0);
  const guessRef   = useRef(null);

  const { inVoice, micMuted, speakerMuted, micError, joinVoice, leaveVoice, toggleMic, toggleSpeaker }
    = useVoiceChat(roomCodeRef, myId, room.players);

  useEffect(() => {
    const h = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    if (chatMessages.length !== chatPrev.current) {
      chatPrev.current = chatMessages.length;
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages.length]);

  useEffect(() => {
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  const updateRoom = useCallback((r) => { setLocal(r); setRoom(r); }, [setRoom]);

  useEffect(() => {
    const onLeft   = ({ room }) => updateRoom(room);
    const onJoined = ({ room }) => updateRoom(room);

    const onPickConf = ({ room }) => { updateRoom(room); setSecretLocked(true); sounds.join(); };
    const onOnePicked  = ({ room }) => updateRoom(room);
    const onBothPicked = ({ room }) => { updateRoom(room); setActiveTab('game'); sounds.start(); };

    const onHint = ({ guess: g, hint, myHistory: hist, room }) => {
      updateRoom(room); setMyHistory(hist || []);
      if (hint === 'CORRECT') { sounds.correct(); }
      else {
        setInputShake(true); setTimeout(() => setInputShake(false), 500);
        if (hint === 'UP') sounds.up(); else sounds.down();
      }
      setGuess(''); setTimeout(() => guessRef.current?.focus(), 50);
    };

    const onOppGuessed = ({ opponentGuessCount, room }) => { updateRoom(room); setOppCount(opponentGuessCount); };
    const onTurnChange = ({ room }) => { updateRoom(room); setGuess(''); setTimeout(() => guessRef.current?.focus(), 100); };
    const onTurnSkip   = ({ room }) => { updateRoom(room); setGuess(''); };

    const onWon = ({ winnerId, winnerName, secrets, room }) => {
      updateRoom(room); setRoundResult({ winnerId, winnerName, secrets });
      if (winnerId === myId) sounds.correct(); else sounds.error();
    };

    const onNext = ({ room }) => {
      updateRoom(room); setSecretInput(''); setSecretLocked(false);
      setGuess(''); setMyHistory([]); setRoundResult(null); setOppCount(0); setActiveTab('game');
    };
    const onWaitPick = ({ room }) => {
      updateRoom(room); setSecretInput(''); setSecretLocked(false);
      setGuess(''); setMyHistory([]); setRoundResult(null); setOppCount(0);
    };

    const onChat = (msg) => {
      setChat(prev => [...prev, msg]);
      setActiveTab(prev => { if (prev !== 'chat' && !isDesktop) setUnread(u => u+1); return prev; });
    };

    socket.on('playerLeft',          onLeft);
    socket.on('playerJoined',        onJoined);
    socket.on('duelPickConfirmed',   onPickConf);
    socket.on('duelOnePicked',       onOnePicked);
    socket.on('duelBothPicked',      onBothPicked);
    socket.on('duelHint',            onHint);
    socket.on('duelOpponentGuessed', onOppGuessed);
    socket.on('duelTurnChange',      onTurnChange);
    socket.on('duelTurnSkipped',     onTurnSkip);
    socket.on('duelWon',             onWon);
    socket.on('nextRound',           onNext);
    socket.on('duelWaitingPick',     onWaitPick);
    socket.on('chatMessage',         onChat);

    return () => {
      socket.off('playerLeft',          onLeft);
      socket.off('playerJoined',        onJoined);
      socket.off('duelPickConfirmed',   onPickConf);
      socket.off('duelOnePicked',       onOnePicked);
      socket.off('duelBothPicked',      onBothPicked);
      socket.off('duelHint',            onHint);
      socket.off('duelOpponentGuessed', onOppGuessed);
      socket.off('duelTurnChange',      onTurnChange);
      socket.off('duelTurnSkipped',     onTurnSkip);
      socket.off('duelWon',             onWon);
      socket.off('nextRound',           onNext);
      socket.off('duelWaitingPick',     onWaitPick);
      socket.off('chatMessage',         onChat);
    };
  }, [myId, updateRoom, isDesktop]);

  function submitSecret(e) {
    e.preventDefault();
    if (!secretInput || secretLocked) return;
    const n = Math.round(Number(secretInput));
    if (n < room.range.min || n > room.range.max) return;
    socket.emit('duelPick', { roomCode: roomCodeRef.current, number: n });
  }
  function submitGuess(e) {
    e.preventDefault();
    if (!guess) return;
    socket.emit('duelGuess', { roomCode: roomCodeRef.current, guess: Number(guess) });
    setGuess('');
  }
  function sendChat(e) {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('sendChat', { roomCode: roomCodeRef.current, message: chatInput.trim() });
    setChatInput('');
  }
  function sendEmoji(em) { socket.emit('sendChat', { roomCode: roomCodeRef.current, message: em }); }
  function switchTab(t)  { setActiveTab(t); if (t==='chat') setUnread(0); }

  const me       = room.players.find(p => p.id === myId);
  const opponent = room.players.find(p => p.id !== myId);
  const isMyTurn = room.duelTurnId === myId;
  const isHost   = room.hostId === myId;
  const lastHint = myHistory.length > 0 ? myHistory[myHistory.length - 1] : null;

  let lo = room.range.min, hi = room.range.max;
  myHistory.forEach(({ guess: g, hint }) => {
    if (hint === 'UP')   lo = Math.max(lo, g + 1);
    if (hint === 'DOWN') hi = Math.min(hi, g - 1);
  });

  // ── PICKING PHASE ─────────────────────────────────────────────────
  const Picking = (
    <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
      <div>
        <h2 className="font-display" style={{ fontSize:isDesktop?48:34,color:'#c8ff00',lineHeight:1.05,letterSpacing:2 }}>Pick Your Secret</h2>
        <p style={{ fontFamily:'monospace',fontSize:13,color:'rgba(245,240,232,0.4)',marginTop:5 }}>
          Choose a number {room.range.min}–{room.range.max}. Your opponent picks at the same time — neither sees the other's number.
        </p>
      </div>
      {!secretLocked ? (
        <form onSubmit={submitSecret} style={{ display:'flex',gap:10,maxWidth:380 }}>
          <input type="number" inputMode="numeric" className="input-field"
            style={{ flex:1,fontSize:28,textAlign:'center',fontFamily:'monospace' }}
            placeholder={`${room.range.min}–${room.range.max}`}
            value={secretInput} onChange={e=>setSecretInput(e.target.value)}
            min={room.range.min} max={room.range.max} autoFocus />
          <button type="submit" className="btn-primary" style={{ padding:'12px 24px',fontSize:15 }} disabled={!secretInput}>Lock In</button>
        </form>
      ) : (
        <div className="card animate-pop" style={{ display:'flex',alignItems:'center',gap:10,maxWidth:380 }}>
          <span style={{ fontSize:20 }}>🔒</span>
          <div>
            <p style={{ fontFamily:'monospace',fontSize:14,color:'#c8ff00' }}>Locked! Waiting for {opponent?.name}…</p>
          </div>
        </div>
      )}
      <div style={{ display:'flex',gap:10,maxWidth:380 }}>
        {room.players.map((p,i) => {
          const picked = room.pickedBy && room.pickedBy[p.id];
          return (
            <div key={p.id} style={{ flex:1,padding:'10px 12px',border:`1px solid ${picked?'rgba(200,255,0,0.4)':'rgba(245,240,232,0.1)'}`,background:picked?'rgba(200,255,0,0.06)':'rgba(245,240,232,0.03)',borderRadius:5,display:'flex',alignItems:'center',gap:8 }}>
              <div style={{ width:8,height:8,borderRadius:'50%',background:COLORS[i] }} />
              <span style={{ fontFamily:'monospace',fontSize:12,color:picked?'#c8ff00':'rgba(245,240,232,0.5)' }}>{p.name}{p.id===myId?' (you)':''}</span>
              <span style={{ marginLeft:'auto',fontSize:14 }}>{picked?'✓':'…'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── GUESSING PHASE ─────────────────────────────────────────────────
  const Guessing = (
    <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
      {/* VS cards */}
      <div style={{ display:'flex',gap:10 }}>
        {room.players.map((p,i) => {
          const isMe = p.id === myId;
          const isTurn = room.duelTurnId === p.id;
          const count = isMe ? myHistory.length : oppCount;
          return (
            <div key={p.id} style={{ flex:1,padding:'10px 14px',border:`1px solid ${isTurn?COLORS[i]+'88':'rgba(245,240,232,0.08)'}`,background:isTurn?`${COLORS[i]}0f`:'rgba(245,240,232,0.02)',borderRadius:6,transition:'all 0.2s' }}>
              <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:4 }}>
                <div style={{ width:8,height:8,borderRadius:'50%',background:COLORS[i] }} />
                <span style={{ fontFamily:'monospace',fontSize:12,color:isMe?'#c8ff00':'rgba(245,240,232,0.7)' }}>{p.name}{isMe?' (you)':''}</span>
              </div>
              <p style={{ fontFamily:'monospace',fontSize:22,fontWeight:'bold',color:COLORS[i] }}>
                {count} <span style={{ fontSize:11,fontWeight:'normal',color:'rgba(245,240,232,0.35)' }}>guesses</span>
              </p>
              {isTurn && <p style={{ fontFamily:'monospace',fontSize:10,color:COLORS[i],marginTop:3,letterSpacing:1 }}>GUESSING NOW</p>}
            </div>
          );
        })}
      </div>

      {/* My last hint */}
      {lastHint && (
        <div style={{ display:'flex',alignItems:'center',gap:8 }} className="animate-pop">
          <HintBadge hint={lastHint.hint} />
          <span style={{ fontFamily:'monospace',fontSize:12,color:'rgba(245,240,232,0.5)' }}>
            {lastHint.guess} is {lastHint.hint==='UP'?'too low — go higher':'too high — go lower'}
          </span>
        </div>
      )}

      {/* Guess input */}
      {isMyTurn ? (
        <form onSubmit={submitGuess} style={{ display:'flex',gap:10,maxWidth:380 }} className={inputShake?'animate-shake':''}>
          <input ref={guessRef} type="number" inputMode="numeric" className="input-field"
            style={{ flex:1,fontSize:26,textAlign:'center',fontFamily:'monospace' }}
            placeholder={`${lo}–${hi}`} value={guess}
            onChange={e=>setGuess(e.target.value)} min={room.range.min} max={room.range.max} autoFocus />
          <button type="submit" className="btn-primary" style={{ padding:'12px 24px',fontSize:15 }} disabled={!guess}>Guess</button>
        </form>
      ) : (
        <div className="card" style={{ display:'flex',alignItems:'center',gap:8,maxWidth:380 }}>
          <div style={{ width:8,height:8,borderRadius:'50%',background:COLORS[room.players.findIndex(p=>p.id!==myId)],animation:'pulse 1s infinite' }} />
          <span style={{ fontFamily:'monospace',fontSize:12,color:'rgba(245,240,232,0.5)' }}>{opponent?.name} is guessing… wait for your turn</span>
        </div>
      )}

      {/* My history */}
      <div>
        <p style={{ fontFamily:'monospace',fontSize:10,color:'rgba(245,240,232,0.3)',letterSpacing:2,textTransform:'uppercase',marginBottom:8 }}>
          Your Guesses {myHistory.length>0&&`(${myHistory.length})`}
        </p>
        <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
          {myHistory.length===0&&<p style={{ fontFamily:'monospace',fontSize:12,color:'rgba(245,240,232,0.2)' }}>No guesses yet.</p>}
          {[...myHistory].reverse().map((entry,i)=>(
            <div key={`${entry.timestamp}-${i}`} style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 12px',border:'1px solid rgba(245,240,232,0.06)',background:'rgba(245,240,232,0.03)',borderRadius:4 }} className={i===0?'animate-pop':''}>
              <span style={{ fontFamily:'monospace',fontSize:14,fontWeight:'bold',color:'rgba(245,240,232,0.9)',flex:1 }}>{entry.guess}</span>
              <HintBadge hint={entry.hint} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── ROUND END ──────────────────────────────────────────────────────
  const RoundEnd = roundResult && (
    <div className="animate-pop" style={{ display:'flex',flexDirection:'column',gap:16 }}>
      <div>
        <h2 className="font-display" style={{ fontSize:isDesktop?48:34,color:roundResult.winnerId===myId?'#c8ff00':'#ff3366',lineHeight:1.05,letterSpacing:2 }}>
          {roundResult.winnerId===myId?'🎉 You Won!':`${roundResult.winnerName} Won!`}
        </h2>
        <p style={{ fontFamily:'monospace',fontSize:13,color:'rgba(245,240,232,0.5)',marginTop:5 }}>
          {myHistory.length} guess{myHistory.length!==1?'es':''} by you · {oppCount} by {opponent?.name}
        </p>
      </div>
      {/* Reveal both secrets */}
      {roundResult.secrets&&(
        <div style={{ display:'flex',gap:10 }}>
          {room.players.map((p,i)=>(
            <div key={p.id} style={{ flex:1,padding:'14px 16px',border:`1px solid ${COLORS[i]}66`,background:`${COLORS[i]}0a`,borderRadius:6,textAlign:'center' }}>
              <p style={{ fontFamily:'monospace',fontSize:11,color:'rgba(245,240,232,0.4)',marginBottom:6 }}>{p.name}{p.id===myId?' (you)':''}'s secret</p>
              <p style={{ fontFamily:'monospace',fontSize:36,fontWeight:'bold',color:COLORS[i] }}>{roundResult.secrets[p.id]}</p>
            </div>
          ))}
        </div>
      )}
      {/* Scores */}
      <div style={{ display:'flex',gap:10 }}>
        {room.players.map((p,i)=>(
          <div key={p.id} style={{ flex:1,padding:'10px',border:'1px solid rgba(245,240,232,0.08)',background:'rgba(245,240,232,0.03)',borderRadius:4,textAlign:'center' }}>
            <p style={{ fontFamily:'monospace',fontSize:11,color:'rgba(245,240,232,0.4)',marginBottom:4 }}>{p.name}</p>
            <p style={{ fontFamily:'monospace',fontSize:28,fontWeight:'bold',color:COLORS[i] }}>{room.scores[p.id]||0}</p>
            <p style={{ fontFamily:'monospace',fontSize:10,color:'rgba(245,240,232,0.3)' }}>wins</p>
          </div>
        ))}
      </div>
      {isHost
        ? <button className="btn-primary" style={{ padding:'14px 32px',fontSize:15,display:'inline-block',whiteSpace:'nowrap' }} onClick={()=>socket.emit('nextRound',{roomCode:roomCodeRef.current})}>Play Again →</button>
        : <div className="card" style={{ display:'flex',alignItems:'center',gap:8 }}><div style={{ width:8,height:8,borderRadius:'50%',background:'#c8ff00',animation:'pulse 1s infinite' }} /><span style={{ fontFamily:'monospace',fontSize:12,color:'rgba(245,240,232,0.5)' }}>Waiting for host…</span></div>
      }
    </div>
  );

  const mainContent = roundResult ? RoundEnd : room.duelState==='picking' ? Picking : room.duelState==='guessing' ? Guessing : null;

  // ── Chat ───────────────────────────────────────────────────────────
  const Chat = (
    <div style={{ display:'flex',flexDirection:'column',height:'100%' }}>
      <div ref={chatRef} style={{ flex:1,overflow:'auto',padding:'12px 16px',display:'flex',flexDirection:'column',gap:10 }}>
        {chatMessages.length===0&&<p style={{ fontFamily:'monospace',fontSize:12,color:'rgba(245,240,232,0.2)',textAlign:'center',marginTop:24 }}>No messages yet. Trash talk! 😂</p>}
        {chatMessages.map(msg=>(
          <div key={msg.id} style={{ display:'flex',flexDirection:'column',alignItems:msg.playerId===myId?'flex-end':'flex-start' }}>
            <span style={{ fontFamily:'monospace',fontSize:12,color:'rgba(245,240,232,0.4)',marginBottom:3 }}>{msg.playerName}</span>
            <span style={{ display:'inline-block',maxWidth:'80%',wordBreak:'break-word',padding:'9px 13px',fontSize:15,lineHeight:1.5,borderRadius:8,background:msg.playerId===myId?'rgba(200,255,0,0.12)':'rgba(245,240,232,0.06)',border:msg.playerId===myId?'1px solid rgba(200,255,0,0.3)':'1px solid rgba(245,240,232,0.1)',color:msg.playerId===myId?'#c8ff00':'rgba(245,240,232,0.85)' }}>{msg.message}</span>
          </div>
        ))}
      </div>
      <div style={{ display:'flex',flexWrap:'wrap',gap:6,padding:'6px 14px',borderTop:'1px solid rgba(245,240,232,0.08)' }}>
        {EMOJI_LIST.map(e=><button key={e} onClick={()=>sendEmoji(e)} style={{ fontSize:20,background:'none',border:'none',cursor:'pointer',padding:'2px 4px',lineHeight:1 }}>{e}</button>)}
      </div>
      <div style={{ padding:'8px 12px',borderTop:'1px solid rgba(245,240,232,0.08)',display:'flex',gap:8 }}>
        <input className="input-field" style={{ flex:1,fontSize:14,padding:'10px 12px' }} placeholder="Type a message…" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat()} maxLength={200} />
        <button className="btn-primary" style={{ padding:'10px 16px',fontSize:14 }} onClick={sendChat} disabled={!chatInput.trim()}>↑</button>
      </div>
    </div>
  );

  // ── Top bar ────────────────────────────────────────────────────────
  const TopBar = (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:isDesktop?'10px 24px':'10px 16px',borderBottom:'1px solid rgba(245,240,232,0.1)',background:'rgba(245,240,232,0.03)',flexShrink:0,gap:10,flexWrap:'wrap' }}>
      <div style={{ display:'flex',alignItems:'center',gap:10 }}>
        <span style={{ fontFamily:'monospace',fontSize:isDesktop?22:18,color:'#ff3366',fontWeight:'bold',letterSpacing:2 }}>1v1 DUEL</span>
        <span style={{ fontFamily:'monospace',fontSize:11,color:'rgba(245,240,232,0.25)',letterSpacing:1 }}>R{room.round} · {room.code}</span>
      </div>
      <div style={{ display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
        {room.timerEnd && <Timer timerEnd={room.timerEnd} />}
        {voiceEnabled && <VoiceControls inVoice={inVoice} micMuted={micMuted} speakerMuted={speakerMuted} joinVoice={joinVoice} leaveVoice={leaveVoice} toggleMic={toggleMic} toggleSpeaker={toggleSpeaker} />}
        <button onClick={()=>setShowExit(true)} style={{ fontFamily:'monospace',fontSize:isDesktop?12:10,letterSpacing:1,textTransform:'uppercase',background:'transparent',border:'1px solid rgba(255,51,102,0.4)',color:'rgba(255,51,102,0.7)',padding:isDesktop?'6px 14px':'5px 10px',cursor:'pointer',borderRadius:4 }}>Leave</button>
      </div>
    </div>
  );

  const MicErr = micError && <div style={{ background:'rgba(255,51,102,0.12)',color:'#ff3366',fontFamily:'monospace',fontSize:12,padding:'7px 16px',textAlign:'center',flexShrink:0 }}>⚠ {micError}</div>;

  // Desktop
  if (isDesktop) return (
    <div style={{ display:'flex',flexDirection:'column',height:'100dvh',overflow:'hidden' }}>
      {showExit && <ExitModal onConfirm={()=>window.location.reload()} onCancel={()=>setShowExit(false)} />}
      {TopBar}{MicErr}
      <div style={{ flex:1,display:'grid',gridTemplateColumns:'1fr 300px',overflow:'hidden' }}>
        <div style={{ overflow:'auto',padding:'24px 28px',borderRight:'1px solid rgba(245,240,232,0.08)' }}>{mainContent}</div>
        <div style={{ display:'flex',flexDirection:'column',overflow:'hidden' }}>
          <div style={{ padding:'12px 20px 8px',borderBottom:'1px solid rgba(245,240,232,0.08)',flexShrink:0 }}>
            <span style={{ fontFamily:'monospace',fontSize:11,color:'rgba(245,240,232,0.35)',letterSpacing:2,textTransform:'uppercase' }}>Chat</span>
          </div>
          <div style={{ flex:1,overflow:'hidden',display:'flex',flexDirection:'column' }}>{Chat}</div>
        </div>
      </div>
    </div>
  );

  // Mobile
  return (
    <div style={{ display:'flex',flexDirection:'column',height:'100dvh',overflow:'hidden' }}>
      {showExit && <ExitModal onConfirm={()=>window.location.reload()} onCancel={()=>setShowExit(false)} />}
      {TopBar}{MicErr}
      <div style={{ flex:1,overflow:'hidden' }}>
        <div style={{ display:activeTab==='game'?'block':'none',height:'100%',overflow:'auto',padding:16 }}>{mainContent}</div>
        <div style={{ display:activeTab==='chat'?'flex':'none',flexDirection:'column',height:'100%' }}>{Chat}</div>
      </div>
      <div style={{ display:'flex',borderTop:'1px solid rgba(245,240,232,0.1)',background:'rgba(10,10,15,0.97)',flexShrink:0,paddingBottom:'env(safe-area-inset-bottom,0px)' }}>
        {[{id:'game',label:'Duel',icon:'⚔️'},{id:'chat',label:'Chat',icon:'💬'}].map(tab=>(
          <button key={tab.id} onClick={()=>switchTab(tab.id)} style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'10px 4px',background:'none',border:'none',cursor:'pointer',color:activeTab===tab.id?'#c8ff00':'rgba(245,240,232,0.35)',borderTop:activeTab===tab.id?'2px solid #c8ff00':'2px solid transparent',position:'relative' }}>
            <span style={{ fontSize:20,lineHeight:1 }}>{tab.icon}</span>
            <span style={{ fontFamily:'monospace',fontSize:10,marginTop:3,letterSpacing:1,textTransform:'uppercase' }}>{tab.label}</span>
            {tab.id==='chat'&&unread>0&&<span style={{ position:'absolute',top:6,right:'calc(50% - 18px)',background:'#ff3366',color:'#fff',borderRadius:'50%',width:16,height:16,fontSize:10,fontWeight:'bold',display:'flex',alignItems:'center',justifyContent:'center' }}>{unread>9?'9+':unread}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
