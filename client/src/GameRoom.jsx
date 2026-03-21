/**
 * GameRoom.jsx v4
 *
 * Changes:
 *  1. PC layout  — 3-column desktop (scores | game | chat), bottom tabs on mobile
 *  2. Chat fonts — bigger on both PC (16px messages, 13px names) and mobile
 *  3. Exit popup — beforeunload + in-app confirm dialog before leaving the room
 *  4. All roomCodeRef.current emits retained
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import socket from './socket';
import { sounds } from './sounds.js';

const PLAYER_COLORS = ['#c8ff00', '#00ffcc', '#ff3366', '#ffaa00', '#aa88ff', '#ff88cc'];
const EMOJI_LIST = ['👍','🔥','😂','😮','🎉','❤️','💀','🤔','👏','😎'];

// ── Helpers ───────────────────────────────────────────────────────────

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
    <span className={`font-mono font-bold tabular-nums ${urgent ? 'text-danger animate-pulse-fast' : 'text-paper/70'}`}
      style={{ fontSize: 22 }}>
      {String(Math.floor(secs / 60)).padStart(2,'0')}:{String(secs % 60).padStart(2,'0')}
    </span>
  );
}

// ── Exit Confirmation Modal ───────────────────────────────────────────
function ExitModal({ onConfirm, onCancel }) {
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      background:'rgba(0,0,0,0.75)',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:20,
    }}>
      <div style={{
        background:'#0f0f18', border:'1px solid rgba(200,255,0,0.3)',
        borderRadius:8, padding:'28px 28px 24px',
        maxWidth:340, width:'100%',
      }}>
        <h2 style={{ fontFamily:'monospace', fontSize:20, color:'#c8ff00', marginBottom:10, letterSpacing:1 }}>
          Leave the room?
        </h2>
        <p style={{ fontFamily:'sans-serif', fontSize:15, color:'rgba(245,240,232,0.6)', lineHeight:1.6, marginBottom:24 }}>
          If you leave now you'll exit the game. Your teammates will still be playing. Are you sure?
        </p>
        <div style={{ display:'flex', gap:10 }}>
          <button
            onClick={onCancel}
            style={{
              flex:1, padding:'11px', fontFamily:'monospace', fontSize:13,
              letterSpacing:1, textTransform:'uppercase', cursor:'pointer',
              background:'transparent', border:'1px solid rgba(245,240,232,0.25)',
              color:'rgba(245,240,232,0.7)', borderRadius:4, transition:'border-color 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.borderColor='rgba(245,240,232,0.5)'}
            onMouseOut={e => e.currentTarget.style.borderColor='rgba(245,240,232,0.25)'}
          >
            Stay
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex:1, padding:'11px', fontFamily:'monospace', fontSize:13,
              letterSpacing:1, textTransform:'uppercase', cursor:'pointer',
              background:'rgba(255,51,102,0.15)', border:'1px solid #ff3366',
              color:'#ff3366', borderRadius:4, transition:'background 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.background='rgba(255,51,102,0.28)'}
            onMouseOut={e => e.currentTarget.style.background='rgba(255,51,102,0.15)'}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Scores Panel (reused in both desktop sidebar and mobile tab) ──────
function ScoresPanel({ room, myId, picker, colorMap, lo, hi, timerLabel }) {
  return (
    <div style={{ padding:'16px', overflow:'auto', height:'100%' }}>
      <p style={{ fontFamily:'monospace', fontSize:10, color:'rgba(245,240,232,0.3)', letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>
        Scoreboard · Round {room.round}
      </p>
      <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:20 }}>
        {[...room.players]
          .sort((a,b) => (room.scores[b.id]||0) - (room.scores[a.id]||0))
          .map((p, i) => (
            <div key={p.id} style={{
              display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
              border:'1px solid rgba(245,240,232,0.08)',
              background:'rgba(245,240,232,0.03)', borderRadius:4,
            }}>
              <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.3)', width:18, flexShrink:0 }}>#{i+1}</span>
              <div style={{ width:9, height:9, borderRadius:'50%', background: colorMap[p.id], flexShrink:0 }} />
              <span style={{ flex:1, fontFamily:'sans-serif', fontSize:14, color: p.id===myId ? '#c8ff00' : 'rgba(245,240,232,0.85)', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {p.name}
                {p.id === picker?.id && ' 🎯'}
              </span>
              {p.id === room.hostId && <span style={{ fontFamily:'monospace', fontSize:10, color:'rgba(200,255,0,0.5)' }}>HOST</span>}
              {p.id === myId && <span style={{ fontFamily:'monospace', fontSize:10, color:'rgba(245,240,232,0.3)' }}>YOU</span>}
              <span style={{ fontFamily:'monospace', fontSize:20, fontWeight:'bold', color: colorMap[p.id], flexShrink:0 }}>
                {room.scores[p.id] || 0}
              </span>
            </div>
          ))}
      </div>

      {/* Game info */}
      <div style={{ padding:'12px', border:'1px solid rgba(245,240,232,0.07)', borderRadius:4, background:'rgba(245,240,232,0.02)' }}>
        <p style={{ fontFamily:'monospace', fontSize:10, color:'rgba(245,240,232,0.3)', letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>
          Game Info
        </p>
        {[
          ['Range',  <span style={{ color:'#c8ff00', fontWeight:'bold' }}>{room.range.min} – {room.range.max}</span>],
          ...(room.guessHistory?.length > 0 ? [['Window', <span style={{ color:'#00ffcc', fontWeight:'bold' }}>{lo} – {hi}</span>]] : []),
          ['Timer',  timerLabel],
          ['Room',   room.code],
        ].map(([k,v]) => (
          <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
            <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.4)' }}>{k}</span>
            <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.65)' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Chat Panel (reused in both desktop sidebar and mobile tab) ────────
function ChatPanel({ chatMessages, chatInput, setChatInput, sendChat, sendEmoji, chatEndRef, myId, isDesktop }) {
  // Font sizes scale up on desktop
  const msgFont  = isDesktop ? 16 : 15;
  const nameFont = isDesktop ? 13 : 12;
  const inputFont = isDesktop ? 15 : 14;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Messages */}
      <div style={{ flex:1, overflow:'auto', padding: isDesktop ? '16px 20px' : '12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
        {chatMessages.length === 0 && (
          <p style={{ fontFamily:'monospace', fontSize: nameFont, color:'rgba(245,240,232,0.2)', textAlign:'center', marginTop:24 }}>
            No messages yet. Say hi! 👋
          </p>
        )}
        {chatMessages.map(msg => (
          <div key={msg.id} style={{ display:'flex', flexDirection:'column', alignItems: msg.playerId === myId ? 'flex-end' : 'flex-start' }}>
            <span style={{ fontFamily:'monospace', fontSize: nameFont, color:'rgba(245,240,232,0.4)', marginBottom:4 }}>
              {msg.playerName}
            </span>
            <span style={{
              display:'inline-block', maxWidth:'80%', wordBreak:'break-word',
              padding: isDesktop ? '10px 14px' : '8px 12px',
              fontSize: msgFont,
              lineHeight: 1.5,
              background: msg.playerId === myId ? 'rgba(200,255,0,0.12)' : 'rgba(245,240,232,0.06)',
              border: msg.playerId === myId ? '1px solid rgba(200,255,0,0.3)' : '1px solid rgba(245,240,232,0.1)',
              color: msg.playerId === myId ? '#c8ff00' : 'rgba(245,240,232,0.85)',
              borderRadius: 8,
            }}>
              {msg.message}
            </span>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Emoji bar */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding: isDesktop ? '8px 16px' : '6px 14px', borderTop:'1px solid rgba(245,240,232,0.08)' }}>
        {EMOJI_LIST.map(e => (
          <button key={e} onClick={() => sendEmoji(e)}
            style={{ fontSize: isDesktop ? 22 : 20, background:'none', border:'none', cursor:'pointer', padding:'2px 4px', lineHeight:1, transition:'transform 0.1s' }}
            onMouseOver={ev => ev.currentTarget.style.transform='scale(1.3)'}
            onMouseOut={ev => ev.currentTarget.style.transform='scale(1)'}
          >{e}</button>
        ))}
      </div>

      {/* Chat input */}
      <div style={{ padding: isDesktop ? '10px 14px' : '8px 12px', borderTop:'1px solid rgba(245,240,232,0.08)', display:'flex', gap:8 }}>
        <input
          className="input-field"
          style={{ flex:1, fontSize: inputFont, padding: isDesktop ? '11px 14px' : '10px 12px' }}
          placeholder="Type a message…"
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendChat()}
          maxLength={200}
        />
        <button className="btn-primary"
          style={{ padding: isDesktop ? '11px 18px' : '10px 16px', fontSize: inputFont }}
          onClick={sendChat}
          disabled={!chatInput.trim()}
        >↑</button>
      </div>
    </div>
  );
}

// ── Game Panel (center column on PC, main tab on mobile) ──────────────
function GamePanel({
  room, myId, isPicker, isHost, picker,
  guess, setGuess, secretInput, setSecretInput,
  lastHint, inputShake, roundResult, colorMap,
  lo, hi, submitSecret, submitGuess, handleNextRound,
  guessInputRef, isDesktop,
}) {
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', padding: isDesktop ? '24px 28px' : '16px', overflow:'auto', gap:14 }}>

      {/* Phase header */}
      {room.state === 'picking' && (
        <div>
          <h2 style={{ fontFamily:'var(--font-display,monospace)', fontSize: isDesktop ? 48 : 36, color:'#c8ff00', lineHeight:1.05, letterSpacing:2 }}>
            {isPicker ? 'Pick Your Number' : `${picker?.name} is picking…`}
          </h2>
          <p style={{ fontFamily:'monospace', fontSize: isDesktop ? 14 : 12, color:'rgba(245,240,232,0.4)', marginTop:5 }}>
            {isPicker ? `Choose a secret: ${room.range.min} – ${room.range.max}` : 'Get ready — guessing starts soon!'}
          </p>
        </div>
      )}

      {room.state === 'guessing' && (
        <div>
          <h2 style={{ fontFamily:'var(--font-display,monospace)', fontSize: isDesktop ? 48 : 36, color:'#f5f0e8', lineHeight:1.05, letterSpacing:2 }}>
            {isPicker ? 'Waiting for Guesses' : 'Make Your Guess'}
          </h2>
          <p style={{ fontFamily:'monospace', fontSize: isDesktop ? 14 : 12, color:'rgba(245,240,232,0.4)', marginTop:5 }}>
            {isPicker ? 'Watching others guess…' : `Range: ${lo} – ${hi}`}
          </p>
        </div>
      )}

      {room.state === 'roundEnd' && roundResult && (
        <div className="animate-pop">
          {roundResult.winnerId ? (
            <>
              <h2 style={{ fontFamily:'var(--font-display,monospace)', fontSize: isDesktop ? 48 : 36, color:'#c8ff00', lineHeight:1.05, letterSpacing:2 }}>
                {roundResult.winnerId === myId ? '🎉 You Got It!' : `${roundResult.winnerName} Won!`}
              </h2>
              <p style={{ fontFamily:'monospace', fontSize: isDesktop ? 14 : 13, color:'rgba(245,240,232,0.6)', marginTop:5 }}>
                Secret was <strong style={{ color:'#c8ff00' }}>{roundResult.secretNumber}</strong>
              </p>
            </>
          ) : (
            <>
              <h2 style={{ fontFamily:'var(--font-display,monospace)', fontSize: isDesktop ? 48 : 36, color:'#ffaa00', lineHeight:1.05, letterSpacing:2 }}>
                Time's Up!
              </h2>
              <p style={{ fontFamily:'monospace', fontSize: isDesktop ? 14 : 12, color:'rgba(245,240,232,0.4)', marginTop:5 }}>
                Nobody guessed in time.
              </p>
            </>
          )}
        </div>
      )}

      {/* Picker input */}
      {room.state === 'picking' && isPicker && (
        <form onSubmit={submitSecret} style={{ display:'flex', gap:10, maxWidth: isDesktop ? 420 : '100%' }}>
          <input
            type="number" inputMode="numeric" className="input-field"
            style={{ flex:1, fontSize: isDesktop ? 28 : 24, textAlign:'center', fontFamily:'monospace' }}
            placeholder={`${room.range.min}–${room.range.max}`}
            value={secretInput}
            onChange={e => setSecretInput(e.target.value)}
            min={room.range.min} max={room.range.max} autoFocus
          />
          <button type="submit" className="btn-primary"
            style={{ padding: isDesktop ? '12px 28px' : '12px 20px', fontSize: isDesktop ? 15 : 14 }}
            disabled={!secretInput}>
            Lock In
          </button>
        </form>
      )}

      {room.state === 'picking' && !isPicker && (
        <div className="card" style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'#c8ff00', animation:'pulse 1s infinite' }} />
          <span style={{ fontFamily:'monospace', fontSize: isDesktop ? 14 : 12, color:'rgba(245,240,232,0.5)' }}>
            {picker?.name} is choosing…
          </span>
        </div>
      )}

      {/* Guess input */}
      {room.state === 'guessing' && !isPicker && (
        <div>
          {lastHint && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }} className="animate-pop">
              <HintBadge hint={lastHint.hint} />
              <span style={{ fontFamily:'monospace', fontSize: isDesktop ? 13 : 12, color:'rgba(245,240,232,0.5)' }}>
                {lastHint.hint === 'UP'   && `${lastHint.guess} is too low — go higher`}
                {lastHint.hint === 'DOWN' && `${lastHint.guess} is too high — go lower`}
              </span>
            </div>
          )}
          <form onSubmit={submitGuess}
            style={{ display:'flex', gap:10, maxWidth: isDesktop ? 420 : '100%' }}
            className={inputShake ? 'animate-shake' : ''}
          >
            <input
              ref={guessInputRef}
              type="number" inputMode="numeric" className="input-field"
              style={{ flex:1, fontSize: isDesktop ? 28 : 24, textAlign:'center', fontFamily:'monospace' }}
              placeholder={`${lo}–${hi}`}
              value={guess}
              onChange={e => setGuess(e.target.value)}
              min={room.range.min} max={room.range.max} autoFocus
            />
            <button type="submit" className="btn-primary"
              style={{ padding: isDesktop ? '12px 28px' : '12px 20px', fontSize: isDesktop ? 15 : 14 }}
              disabled={!guess}>
              Go
            </button>
          </form>
        </div>
      )}

      {room.state === 'guessing' && isPicker && (
        <div className="card">
          <span style={{ fontFamily:'monospace', fontSize: isDesktop ? 14 : 12, color:'rgba(245,240,232,0.4)' }}>
            Watching guesses roll in… 👀
          </span>
        </div>
      )}

      {/* Round end */}
      {room.state === 'roundEnd' && (
        <div>
          {isHost ? (
            <button className="btn-primary"
              style={{ padding: isDesktop ? '14px 40px' : '14px 100%', width: isDesktop ? 'auto' : '100%', fontSize: isDesktop ? 16 : 15 }}
              onClick={handleNextRound}>
              Next Round →
            </button>
          ) : (
            <div className="card" style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'#c8ff00', animation:'pulse 1s infinite' }} />
              <span style={{ fontFamily:'monospace', fontSize: isDesktop ? 14 : 12, color:'rgba(245,240,232,0.5)' }}>
                Waiting for host…
              </span>
            </div>
          )}
        </div>
      )}

      {/* Guess history */}
      <div style={{ flex:1 }}>
        <p style={{ fontFamily:'monospace', fontSize:10, color:'rgba(245,240,232,0.3)', letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>
          Guess History {room.guessHistory?.length > 0 && `(${room.guessHistory.length})`}
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {(!room.guessHistory || room.guessHistory.length === 0) && (
            <p style={{ fontFamily:'monospace', fontSize: isDesktop ? 13 : 12, color:'rgba(245,240,232,0.2)' }}>
              No guesses yet.
            </p>
          )}
          {[...(room.guessHistory || [])].reverse().map((entry, i) => (
            <div key={`${entry.timestamp}-${i}`}
              style={{
                display:'flex', alignItems:'center', gap:10,
                padding: isDesktop ? '10px 14px' : '8px 12px',
                border:'1px solid rgba(245,240,232,0.06)',
                background:'rgba(245,240,232,0.03)', borderRadius:4,
              }}
              className={i === 0 ? 'animate-pop' : ''}
            >
              <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background: colorMap[entry.playerId] || '#888' }} />
              <span style={{ fontFamily:'sans-serif', fontSize: isDesktop ? 14 : 13, color:'rgba(245,240,232,0.75)', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {entry.playerName}{entry.playerId === myId ? ' (you)' : ''}
              </span>
              <span style={{ fontFamily:'monospace', fontSize: isDesktop ? 15 : 14, fontWeight:'bold', color:'rgba(245,240,232,0.9)', flexShrink:0 }}>
                {entry.guess}
              </span>
              <HintBadge hint={entry.hint} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────

export default function GameRoom({ room: initialRoom, setRoom, myId, roomCodeRef }) {
  const [room,        setLocalRoom]   = useState(initialRoom);
  const [guess,       setGuess]       = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [lastHint,    setLastHint]    = useState(null);
  const [roundResult, setRoundResult] = useState(null);
  const [inputShake,  setInputShake]  = useState(false);
  const [activeTab,   setActiveTab]   = useState('game');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput,    setChatInput]    = useState('');
  const [unread,       setUnread]       = useState(0);
  const [showExitModal, setShowExitModal] = useState(false);

  // Detect desktop (≥ 768px)
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const chatEndRef   = useRef(null);
  const guessInputRef = useRef(null);

  const picker   = room.players[room.pickerIndex];
  const isPicker = picker?.id === myId;
  const isHost   = room.hostId === myId;

  const colorMap = {};
  room.players.forEach((p, i) => { colorMap[p.id] = PLAYER_COLORS[i % PLAYER_COLORS.length]; });

  const updateRoom = useCallback((r) => { setLocalRoom(r); setRoom(r); }, [setRoom]);

  // ── beforeunload — browser refresh / close warning ────────────────
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = 'Are you sure you want to leave the room?';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ── Socket listeners ──────────────────────────────────────────────
  useEffect(() => {
    const onPlayerLeft   = ({ room }) => updateRoom(room);
    const onPlayerJoined = ({ room }) => updateRoom(room);

    const onNumberPicked = ({ room }) => {
      updateRoom(room);
      setLastHint(null); setGuess(''); setSecretInput(''); setRoundResult(null);
      setActiveTab('game');
    };
    const onWaitingForPick = ({ room }) => {
      updateRoom(room);
      setLastHint(null); setGuess(''); setSecretInput(''); setRoundResult(null);
    };
    const onHint = ({ guess: g, hint, playerId, room }) => {
      updateRoom(room);
      if (playerId === myId) {
        setLastHint({ hint, guess: g });
        setInputShake(hint !== 'CORRECT');
        setTimeout(() => setInputShake(false), 500);
        if (hint === 'UP')   sounds.up();
        if (hint === 'DOWN') sounds.down();
      }
    };
    const onRoundWon = ({ winnerId, winnerName, secretNumber, room }) => {
      updateRoom(room);
      setRoundResult({ winnerId, winnerName, secretNumber });
      sounds.correct();
    };
    const onTimeUp = ({ room }) => {
      updateRoom(room);
      setRoundResult({ winnerId: null, winnerName: null, secretNumber: null });
      sounds.error();
    };
    const onNextRound = ({ room }) => {
      updateRoom(room);
      setRoundResult(null); setLastHint(null); setActiveTab('game');
    };
    const onChatMessage = (msg) => {
      setChatMessages(prev => [...prev, msg]);
      setActiveTab(prev => {
        const onChat = prev === 'chat' || (isDesktop);
        if (!onChat) setUnread(u => u + 1);
        return prev;
      });
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
    };

    socket.on('playerLeft',     onPlayerLeft);
    socket.on('playerJoined',   onPlayerJoined);
    socket.on('numberPicked',   onNumberPicked);
    socket.on('waitingForPick', onWaitingForPick);
    socket.on('hint',           onHint);
    socket.on('roundWon',       onRoundWon);
    socket.on('timeUp',         onTimeUp);
    socket.on('nextRound',      onNextRound);
    socket.on('chatMessage',    onChatMessage);

    return () => {
      socket.off('playerLeft',     onPlayerLeft);
      socket.off('playerJoined',   onPlayerJoined);
      socket.off('numberPicked',   onNumberPicked);
      socket.off('waitingForPick', onWaitingForPick);
      socket.off('hint',           onHint);
      socket.off('roundWon',       onRoundWon);
      socket.off('timeUp',         onTimeUp);
      socket.off('nextRound',      onNextRound);
      socket.off('chatMessage',    onChatMessage);
    };
  }, [myId, updateRoom, isDesktop]);

  // ── Actions ───────────────────────────────────────────────────────
  function submitSecret(e) {
    e.preventDefault();
    if (!secretInput) return;
    socket.emit('pickNumber', { roomCode: roomCodeRef.current, number: Number(secretInput) });
  }
  function submitGuess(e) {
    e.preventDefault();
    if (!guess) return;
    socket.emit('guessNumber', { roomCode: roomCodeRef.current, guess: Number(guess) });
    setGuess('');
    setTimeout(() => guessInputRef.current?.focus(), 50);
  }
  function handleNextRound() {
    socket.emit('nextRound', { roomCode: roomCodeRef.current });
  }
  function sendChat(e) {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('sendChat', { roomCode: roomCodeRef.current, message: chatInput.trim() });
    setChatInput('');
  }
  function sendEmoji(emoji) {
    socket.emit('sendChat', { roomCode: roomCodeRef.current, message: emoji });
  }
  function switchTab(tab) {
    setActiveTab(tab);
    if (tab === 'chat') setUnread(0);
  }

  // ── Narrow window ─────────────────────────────────────────────────
  let lo = room.range.min, hi = room.range.max;
  (room.guessHistory || []).forEach(({ guess: g, hint }) => {
    if (hint === 'UP')   lo = Math.max(lo, g + 1);
    if (hint === 'DOWN') hi = Math.min(hi, g - 1);
  });

  const timerLabel = room.timerSeconds
    ? room.timerSeconds >= 60
      ? `${Math.floor(room.timerSeconds/60)}m${room.timerSeconds%60>0?` ${room.timerSeconds%60}s`:''}`
      : `${room.timerSeconds}s`
    : 'No timer';

  // Shared panel props
  const panelProps = { room, myId, picker, colorMap, lo, hi, timerLabel };
  const gameProps  = {
    ...panelProps, isPicker, isHost,
    guess, setGuess, secretInput, setSecretInput,
    lastHint, inputShake, roundResult,
    submitSecret, submitGuess, handleNextRound,
    guessInputRef,
  };
  const chatProps = {
    chatMessages, chatInput, setChatInput, sendChat, sendEmoji,
    chatEndRef, myId,
  };

  // ── DESKTOP LAYOUT (3 columns) ────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100dvh', overflow:'hidden' }}>
        {/* Exit modal */}
        {showExitModal && (
          <ExitModal
            onConfirm={() => { window.location.reload(); }}
            onCancel={() => setShowExitModal(false)}
          />
        )}

        {/* Top bar */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 24px', borderBottom:'1px solid rgba(245,240,232,0.1)',
          background:'rgba(245,240,232,0.03)', flexShrink:0,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <span style={{ fontFamily:'monospace', fontSize:24, color:'#c8ff00', letterSpacing:3, fontWeight:'bold' }}>
              UP DOWN
            </span>
            <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.3)', letterSpacing:2 }}>
              ROUND {room.round}
            </span>
            <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.25)', letterSpacing:2 }}>
              {room.code}
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            {room.timerEnd && <Timer timerEnd={room.timerEnd} />}
            <button
              onClick={() => setShowExitModal(true)}
              style={{
                fontFamily:'monospace', fontSize:12, letterSpacing:1, textTransform:'uppercase',
                background:'transparent', border:'1px solid rgba(255,51,102,0.4)',
                color:'rgba(255,51,102,0.7)', padding:'6px 14px', cursor:'pointer', borderRadius:4,
                transition:'all 0.15s',
              }}
              onMouseOver={e => { e.currentTarget.style.background='rgba(255,51,102,0.1)'; e.currentTarget.style.color='#ff3366'; }}
              onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(255,51,102,0.7)'; }}
            >
              Leave Room
            </button>
          </div>
        </div>

        {/* 3-column body */}
        <div style={{ flex:1, display:'grid', gridTemplateColumns:'260px 1fr 320px', overflow:'hidden' }}>
          {/* Left: Scores */}
          <div style={{ borderRight:'1px solid rgba(245,240,232,0.08)', overflow:'auto' }}>
            <ScoresPanel {...panelProps} />
          </div>

          {/* Center: Game */}
          <div style={{ overflow:'auto', borderRight:'1px solid rgba(245,240,232,0.08)' }}>
            <GamePanel {...gameProps} isDesktop={true} />
          </div>

          {/* Right: Chat — always visible on desktop */}
          <div style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'12px 20px 8px', borderBottom:'1px solid rgba(245,240,232,0.08)', flexShrink:0 }}>
              <span style={{ fontFamily:'monospace', fontSize:11, color:'rgba(245,240,232,0.35)', letterSpacing:2, textTransform:'uppercase' }}>
                Chat
              </span>
            </div>
            <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
              <ChatPanel {...chatProps} isDesktop={true} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── MOBILE LAYOUT (bottom tabs) ───────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh', overflow:'hidden' }}>
      {/* Exit modal */}
      {showExitModal && (
        <ExitModal
          onConfirm={() => { window.location.reload(); }}
          onCancel={() => setShowExitModal(false)}
        />
      )}

      {/* Top bar */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 16px', borderBottom:'1px solid rgba(245,240,232,0.1)',
        background:'rgba(245,240,232,0.03)', flexShrink:0,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontFamily:'monospace', fontSize:18, color:'#c8ff00', letterSpacing:2, fontWeight:'bold' }}>
            UP DOWN
          </span>
          <span style={{ fontFamily:'monospace', fontSize:10, color:'rgba(245,240,232,0.3)', letterSpacing:1 }}>
            R{room.round}
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {room.timerEnd && <Timer timerEnd={room.timerEnd} />}
          <button
            onClick={() => setShowExitModal(true)}
            style={{
              fontFamily:'monospace', fontSize:10, letterSpacing:1, textTransform:'uppercase',
              background:'transparent', border:'1px solid rgba(255,51,102,0.35)',
              color:'rgba(255,51,102,0.65)', padding:'5px 10px', cursor:'pointer', borderRadius:4,
            }}
          >
            Leave
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex:1, overflow:'hidden', position:'relative' }}>
        <div style={{ display: activeTab === 'game'   ? 'flex' : 'none', flexDirection:'column', height:'100%' }}>
          <GamePanel {...gameProps} isDesktop={false} />
        </div>
        <div style={{ display: activeTab === 'chat'   ? 'flex' : 'none', flexDirection:'column', height:'100%' }}>
          <ChatPanel {...chatProps} isDesktop={false} />
        </div>
        <div style={{ display: activeTab === 'scores' ? 'block'  : 'none', height:'100%', overflow:'auto' }}>
          <ScoresPanel {...panelProps} />
        </div>
      </div>

      {/* Bottom tab bar */}
      <div style={{
        display:'flex', borderTop:'1px solid rgba(245,240,232,0.1)',
        background:'rgba(10,10,15,0.97)', flexShrink:0,
        paddingBottom:'env(safe-area-inset-bottom, 0px)',
      }}>
        {[
          { id:'game',   label:'Game',   icon:'🎮' },
          { id:'chat',   label:'Chat',   icon:'💬' },
          { id:'scores', label:'Scores', icon:'🏆' },
        ].map(tab => (
          <button key={tab.id} onClick={() => switchTab(tab.id)}
            style={{
              flex:1, display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', padding:'10px 4px',
              background:'none', border:'none', cursor:'pointer',
              color: activeTab === tab.id ? '#c8ff00' : 'rgba(245,240,232,0.35)',
              borderTop: activeTab === tab.id ? '2px solid #c8ff00' : '2px solid transparent',
              transition:'color 0.15s', position:'relative',
            }}>
            <span style={{ fontSize:20, lineHeight:1 }}>{tab.icon}</span>
            <span style={{ fontFamily:'monospace', fontSize:10, marginTop:3, letterSpacing:1, textTransform:'uppercase' }}>
              {tab.label}
            </span>
            {tab.id === 'chat' && unread > 0 && (
              <span style={{
                position:'absolute', top:6, right:'calc(50% - 18px)',
                background:'#ff3366', color:'#fff', borderRadius:'50%',
                width:16, height:16, fontSize:10, fontWeight:'bold',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
