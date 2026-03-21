/**
 * GameRoom.jsx v3
 *
 * FIXES:
 *  1. "Room not found" — all socket.emit calls use roomCodeRef.current (never stale)
 *  2. Mobile-first layout — single column, bottom tab bar (Game / Chat / Scores)
 *  3. Chat is a full panel, not a sidebar — works perfectly on phones
 *  4. Guess history newest at top, no scrolling needed
 *  5. Inputs have inputmode="numeric" for mobile number keyboard
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import socket from './socket';
import { sounds } from './sounds.js';

const PLAYER_COLORS = ['#c8ff00', '#00ffcc', '#ff3366', '#ffaa00', '#aa88ff', '#ff88cc'];
const EMOJI_LIST = ['👍','🔥','😂','😮','🎉','❤️','💀','🤔','👏','😎'];

// ── Small reusable components ─────────────────────────────────────────

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
    <span className={`font-mono text-xl font-bold tabular-nums ${urgent ? 'text-danger animate-pulse-fast' : 'text-paper/70'}`}>
      {String(Math.floor(secs / 60)).padStart(2,'0')}:{String(secs % 60).padStart(2,'0')}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────

export default function GameRoom({ room: initialRoom, setRoom, myId, roomCodeRef }) {
  const [room,        setLocalRoom]   = useState(initialRoom);
  const [guess,       setGuess]       = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [lastHint,    setLastHint]    = useState(null);
  const [roundResult, setRoundResult] = useState(null);
  const [inputShake,  setInputShake]  = useState(false);
  const [activeTab,   setActiveTab]   = useState('game'); // 'game' | 'chat' | 'scores'
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput,    setChatInput]    = useState('');
  const [unread,       setUnread]       = useState(0);
  const chatEndRef = useRef(null);
  const guessInputRef = useRef(null);

  const picker   = room.players[room.pickerIndex];
  const isPicker = picker?.id === myId;
  const isHost   = room.hostId === myId;

  const colorMap = {};
  room.players.forEach((p, i) => { colorMap[p.id] = PLAYER_COLORS[i % PLAYER_COLORS.length]; });

  const updateRoom = useCallback((r) => {
    setLocalRoom(r);
    setRoom(r);
  }, [setRoom]);

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
      setRoundResult(null);
      setLastHint(null);
      setActiveTab('game');
    };

    const onChatMessage = (msg) => {
      setChatMessages(prev => [...prev, msg]);
      if (activeTab !== 'chat') setUnread(u => u + 1);
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
  }, [myId, updateRoom, activeTab]);

  // ── Actions — all use roomCodeRef.current to prevent "Room not found" ──

  function submitSecret(e) {
    e.preventDefault();
    if (!secretInput) return;
    socket.emit('pickNumber', {
      roomCode: roomCodeRef.current,
      number:   Number(secretInput),
    });
  }

  function submitGuess(e) {
    e.preventDefault();
    if (!guess) return;
    socket.emit('guessNumber', {
      roomCode: roomCodeRef.current,
      guess:    Number(guess),
    });
    setGuess('');
    // Re-focus input after submit on mobile
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

  // ── Narrow window from hint history ──────────────────────────────
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

  // ── RENDER ────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh', overflow:'hidden' }}>

      {/* ── TOP BAR ─────────────────────────────────────────────── */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 16px', borderBottom:'1px solid rgba(245,240,232,0.1)',
        background:'rgba(245,240,232,0.03)', flexShrink:0,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:'var(--font-display, monospace)', fontSize:22, color:'#c8ff00', letterSpacing:3 }}>
            UP DOWN
          </span>
          <span style={{ fontFamily:'monospace', fontSize:11, color:'rgba(245,240,232,0.3)', letterSpacing:2 }}>
            R{room.round}
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {room.timerEnd && <Timer timerEnd={room.timerEnd} />}
          <span style={{ fontFamily:'monospace', fontSize:11, color:'rgba(245,240,232,0.4)', letterSpacing:1 }}>
            {room.code}
          </span>
        </div>
      </div>

      {/* ── TAB CONTENT ──────────────────────────────────────────── */}
      <div style={{ flex:1, overflow:'hidden', position:'relative' }}>

        {/* ═══ GAME TAB ═══════════════════════════════════════════ */}
        <div style={{
          display: activeTab === 'game' ? 'flex' : 'none',
          flexDirection:'column', height:'100%', padding:'16px', overflow:'auto',
          gap:12,
        }}>

          {/* Phase header */}
          {room.state === 'picking' && (
            <div>
              <h2 className="font-display" style={{ fontSize:36, color:'#c8ff00', lineHeight:1.1 }}>
                {isPicker ? 'Pick Your Number' : `${picker?.name} is picking…`}
              </h2>
              <p style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.4)', marginTop:4 }}>
                {isPicker
                  ? `Enter a secret number: ${room.range.min} – ${room.range.max}`
                  : 'Get ready — guessing starts soon!'}
              </p>
            </div>
          )}

          {room.state === 'guessing' && (
            <div>
              <h2 className="font-display" style={{ fontSize:36, color:'#f5f0e8', lineHeight:1.1 }}>
                {isPicker ? 'Waiting for Guesses' : 'Make Your Guess'}
              </h2>
              <p style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.4)', marginTop:4 }}>
                {isPicker
                  ? 'Others are searching…'
                  : `Range: ${lo} – ${hi}`}
              </p>
            </div>
          )}

          {room.state === 'roundEnd' && roundResult && (
            <div className="animate-pop">
              {roundResult.winnerId ? (
                <>
                  <h2 className="font-display" style={{ fontSize:36, color:'#c8ff00', lineHeight:1.1 }}>
                    {roundResult.winnerId === myId ? '🎉 You Got It!' : `${roundResult.winnerName} Won!`}
                  </h2>
                  <p style={{ fontFamily:'monospace', fontSize:13, color:'rgba(245,240,232,0.6)', marginTop:4 }}>
                    Secret was <strong style={{ color:'#c8ff00' }}>{roundResult.secretNumber}</strong>
                  </p>
                </>
              ) : (
                <>
                  <h2 className="font-display" style={{ fontSize:36, color:'#ffaa00', lineHeight:1.1 }}>Time's Up!</h2>
                  <p style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.4)', marginTop:4 }}>
                    Nobody guessed in time.
                  </p>
                </>
              )}
            </div>
          )}

          {/* ── Picker: secret input ──────────────────────────── */}
          {room.state === 'picking' && isPicker && (
            <form onSubmit={submitSecret} style={{ display:'flex', gap:8, marginTop:4 }}>
              <input
                type="number"
                inputMode="numeric"
                className="input-field"
                style={{ flex:1, fontSize:24, textAlign:'center', fontFamily:'monospace' }}
                placeholder={`${room.range.min}–${room.range.max}`}
                value={secretInput}
                onChange={e => setSecretInput(e.target.value)}
                min={room.range.min}
                max={room.range.max}
                autoFocus
              />
              <button type="submit" className="btn-primary" style={{ padding:'12px 20px', fontSize:14 }} disabled={!secretInput}>
                Lock In
              </button>
            </form>
          )}

          {room.state === 'picking' && !isPicker && (
            <div className="card" style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'#c8ff00', animation:'pulse 1s infinite' }} />
              <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.5)' }}>
                {picker?.name} is choosing…
              </span>
            </div>
          )}

          {/* ── Guesser: guess input ──────────────────────────── */}
          {room.state === 'guessing' && !isPicker && (
            <div>
              {lastHint && (
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }} className="animate-pop">
                  <HintBadge hint={lastHint.hint} />
                  <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.5)' }}>
                    {lastHint.hint === 'UP'   && `${lastHint.guess} too low`}
                    {lastHint.hint === 'DOWN' && `${lastHint.guess} too high`}
                  </span>
                </div>
              )}
              <form onSubmit={submitGuess}
                style={{ display:'flex', gap:8 }}
                className={inputShake ? 'animate-shake' : ''}
              >
                <input
                  ref={guessInputRef}
                  type="number"
                  inputMode="numeric"
                  className="input-field"
                  style={{ flex:1, fontSize:24, textAlign:'center', fontFamily:'monospace' }}
                  placeholder={`${lo}–${hi}`}
                  value={guess}
                  onChange={e => setGuess(e.target.value)}
                  min={room.range.min}
                  max={room.range.max}
                  autoFocus
                />
                <button type="submit" className="btn-primary" style={{ padding:'12px 20px', fontSize:14 }} disabled={!guess}>
                  Go
                </button>
              </form>
            </div>
          )}

          {room.state === 'guessing' && isPicker && (
            <div className="card">
              <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.4)' }}>
                Watching guesses roll in… 👀
              </span>
            </div>
          )}

          {/* ── Round end: next round ─────────────────────────── */}
          {room.state === 'roundEnd' && (
            <div style={{ marginTop:4 }}>
              {isHost ? (
                <button className="btn-primary" style={{ width:'100%', padding:'14px', fontSize:16 }} onClick={handleNextRound}>
                  Next Round →
                </button>
              ) : (
                <div className="card" style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:'#c8ff00', animation:'pulse 1s infinite' }} />
                  <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.5)' }}>
                    Waiting for host…
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Guess history — newest first ──────────────────── */}
          <div style={{ flex:1, marginTop:8 }}>
            <p style={{ fontFamily:'monospace', fontSize:10, color:'rgba(245,240,232,0.3)', letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>
              Guess History {room.guessHistory?.length > 0 && `(${room.guessHistory.length})`}
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {(!room.guessHistory || room.guessHistory.length === 0) && (
                <p style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.2)' }}>
                  No guesses yet.
                </p>
              )}
              {[...(room.guessHistory || [])].reverse().map((entry, i) => (
                <div
                  key={`${entry.timestamp}-${i}`}
                  style={{
                    display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                    border:'1px solid rgba(245,240,232,0.06)',
                    background:'rgba(245,240,232,0.03)',
                    borderRadius:4,
                  }}
                  className={i === 0 ? 'animate-pop' : ''}
                >
                  <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background: colorMap[entry.playerId] || '#888' }} />
                  <span style={{ fontFamily:'sans-serif', fontSize:13, color:'rgba(245,240,232,0.7)', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {entry.playerName}{entry.playerId === myId ? ' (you)' : ''}
                  </span>
                  <span style={{ fontFamily:'monospace', fontSize:14, fontWeight:'bold', color:'rgba(245,240,232,0.9)', flexShrink:0 }}>
                    {entry.guess}
                  </span>
                  <HintBadge hint={entry.hint} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ CHAT TAB ═══════════════════════════════════════════ */}
        <div style={{
          display: activeTab === 'chat' ? 'flex' : 'none',
          flexDirection:'column', height:'100%',
        }}>
          {/* Messages */}
          <div style={{ flex:1, overflow:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>
            {chatMessages.length === 0 && (
              <p style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.2)', textAlign:'center', marginTop:24 }}>
                No messages yet. Say hi! 👋
              </p>
            )}
            {chatMessages.map(msg => (
              <div key={msg.id} style={{ display:'flex', flexDirection:'column', alignItems: msg.playerId === myId ? 'flex-end' : 'flex-start' }}>
                <span style={{ fontFamily:'monospace', fontSize:11, color:'rgba(245,240,232,0.3)', marginBottom:3 }}>
                  {msg.playerName}
                </span>
                <span style={{
                  display:'inline-block', maxWidth:'75%', wordBreak:'break-word',
                  padding:'8px 12px', fontSize:14,
                  background: msg.playerId === myId ? 'rgba(200,255,0,0.12)' : 'rgba(245,240,232,0.06)',
                  border: msg.playerId === myId ? '1px solid rgba(200,255,0,0.3)' : '1px solid rgba(245,240,232,0.1)',
                  color: msg.playerId === myId ? '#c8ff00' : 'rgba(245,240,232,0.8)',
                  borderRadius:6,
                }}>
                  {msg.message}
                </span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Emoji bar */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'8px 16px', borderTop:'1px solid rgba(245,240,232,0.08)' }}>
            {EMOJI_LIST.map(e => (
              <button
                key={e}
                onClick={() => sendEmoji(e)}
                style={{ fontSize:22, background:'none', border:'none', cursor:'pointer', padding:'2px 4px', lineHeight:1 }}
              >
                {e}
              </button>
            ))}
          </div>

          {/* Chat input */}
          <div style={{ padding:'8px 12px', borderTop:'1px solid rgba(245,240,232,0.08)', display:'flex', gap:8 }}>
            <input
              className="input-field"
              style={{ flex:1, fontSize:14, padding:'10px 12px' }}
              placeholder="Type a message…"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
              maxLength={200}
            />
            <button
              className="btn-primary"
              style={{ padding:'10px 16px', fontSize:14 }}
              onClick={sendChat}
              disabled={!chatInput.trim()}
            >
              ↑
            </button>
          </div>
        </div>

        {/* ═══ SCORES TAB ═════════════════════════════════════════ */}
        <div style={{
          display: activeTab === 'scores' ? 'block' : 'none',
          height:'100%', overflow:'auto', padding:'16px',
        }}>
          <p style={{ fontFamily:'monospace', fontSize:10, color:'rgba(245,240,232,0.3)', letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>
            Scoreboard · Round {room.round}
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {[...room.players]
              .sort((a,b) => (room.scores[b.id]||0) - (room.scores[a.id]||0))
              .map((p, i) => (
                <div key={p.id} style={{
                  display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
                  border:'1px solid rgba(245,240,232,0.08)',
                  background:'rgba(245,240,232,0.03)', borderRadius:4,
                }}>
                  <span style={{ fontFamily:'monospace', fontSize:13, color:'rgba(245,240,232,0.3)', width:20 }}>#{i+1}</span>
                  <div style={{ width:10, height:10, borderRadius:'50%', background: colorMap[p.id], flexShrink:0 }} />
                  <span style={{ flex:1, fontFamily:'sans-serif', fontSize:14, color: p.id===myId ? '#c8ff00' : 'rgba(245,240,232,0.8)' }}>
                    {p.name}
                    {p.id === picker?.id && ' 🎯'}
                    {p.id === room.hostId && <span style={{ color:'rgba(200,255,0,0.5)', fontSize:11, marginLeft:6 }}>HOST</span>}
                    {p.id === myId && <span style={{ color:'rgba(245,240,232,0.3)', fontSize:11, marginLeft:6 }}>YOU</span>}
                  </span>
                  <span style={{ fontFamily:'monospace', fontSize:20, fontWeight:'bold', color: colorMap[p.id] }}>
                    {room.scores[p.id] || 0}
                  </span>
                </div>
              ))}
          </div>

          <div style={{ marginTop:20, padding:'12px 16px', border:'1px solid rgba(245,240,232,0.08)', borderRadius:4, background:'rgba(245,240,232,0.02)' }}>
            <p style={{ fontFamily:'monospace', fontSize:10, color:'rgba(245,240,232,0.3)', letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>
              Game Info
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.4)' }}>Range</span>
                <span style={{ fontFamily:'monospace', fontSize:12, color:'#c8ff00', fontWeight:'bold' }}>{room.range.min} – {room.range.max}</span>
              </div>
              {room.guessHistory?.length > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.4)' }}>Window</span>
                  <span style={{ fontFamily:'monospace', fontSize:12, color:'#00ffcc', fontWeight:'bold' }}>{lo} – {hi}</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.4)' }}>Timer</span>
                <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.6)' }}>{timerLabel}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.4)' }}>Room</span>
                <span style={{ fontFamily:'monospace', fontSize:12, color:'rgba(245,240,232,0.6)' }}>{room.code}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM TAB BAR ───────────────────────────────────────── */}
      <div style={{
        display:'flex', borderTop:'1px solid rgba(245,240,232,0.1)',
        background:'rgba(10,10,15,0.95)', flexShrink:0,
        paddingBottom:'env(safe-area-inset-bottom, 0px)',
      }}>
        {[
          { id:'game',   label:'Game',   icon:'🎮' },
          { id:'chat',   label:'Chat',   icon:'💬' },
          { id:'scores', label:'Scores', icon:'🏆' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            style={{
              flex:1, display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', padding:'10px 4px',
              background:'none', border:'none', cursor:'pointer',
              color: activeTab === tab.id ? '#c8ff00' : 'rgba(245,240,232,0.35)',
              borderTop: activeTab === tab.id ? '2px solid #c8ff00' : '2px solid transparent',
              transition:'color 0.15s, border-color 0.15s',
              position:'relative',
            }}
          >
            <span style={{ fontSize:20, lineHeight:1 }}>{tab.icon}</span>
            <span style={{ fontFamily:'monospace', fontSize:10, marginTop:3, letterSpacing:1, textTransform:'uppercase' }}>
              {tab.label}
            </span>
            {tab.id === 'chat' && unread > 0 && (
              <span style={{
                position:'absolute', top:6, right:'calc(50% - 18px)',
                background:'#ff3366', color:'#fff', borderRadius:'50%',
                width:16, height:16, fontSize:10, fontFamily:'monospace', fontWeight:'bold',
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
