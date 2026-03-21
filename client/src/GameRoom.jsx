/**
 * GameRoom.jsx v2
 * Changes:
 *  1. Guess history — newest at TOP, no auto-scroll needed
 *  2. Chat panel — right side, send messages + emoji reactions
 *  3. Timer reads from room.timerSeconds (0 = no timer)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import socket from './socket';
import { sounds } from './sounds.js';

const PLAYER_COLORS = ['#c8ff00', '#00ffcc', '#ff3366', '#ffaa00', '#aa88ff', '#ff88cc'];

// Quick emoji reactions for chat
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
    <div className={`font-mono text-2xl font-bold tabular-nums ${urgent ? 'text-danger animate-pulse-fast' : 'text-paper/60'}`}>
      {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}
    </div>
  );
}

export default function GameRoom({ room: initialRoom, setRoom, myId, onBackToLobby }) {
  const [room,        setLocalRoom]  = useState(initialRoom);
  const [guess,       setGuess]      = useState('');
  const [secretInput, setSecretInput]= useState('');
  const [lastHint,    setLastHint]   = useState(null);
  const [roundResult, setRoundResult]= useState(null);
  const [inputShake,  setInputShake] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput,    setChatInput]    = useState('');
  const [chatOpen,     setChatOpen]     = useState(true);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const chatEndRef = useRef(null);

  const picker   = room.players[room.pickerIndex];
  const isPicker = picker?.id === myId;
  const isHost   = room.hostId === myId;

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
    };
    const onWaitingForPick = ({ room }) => {
      updateRoom(room);
      setLastHint(null); setGuess(''); setSecretInput(''); setRoundResult(null);
    };

    const onHint = ({ guess: g, hint, playerId, playerName, room }) => {
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
    };

    // Chat
    const onChatMessage = (msg) => {
      setChatMessages(prev => [...prev, msg]);
      // If chat is closed, bump unread count
      setChatOpen(prev => {
        if (!prev) setUnreadCount(u => u + 1);
        return prev;
      });
      // Auto-scroll chat to bottom
      setTimeout(() => {
        if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }, 30);
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
  }, [myId, updateRoom]);

  // ── Actions ────────────────────────────────────────────────────────
  function submitSecret(e) {
    e.preventDefault();
    if (!secretInput) return;
    socket.emit('pickNumber', { roomCode: room.code, number: Number(secretInput) });
  }

  function submitGuess(e) {
    e.preventDefault();
    if (!guess) return;
    socket.emit('guessNumber', { roomCode: room.code, guess: Number(guess) });
    setGuess('');
  }

  function sendChat(e) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('sendChat', { roomCode: room.code, message: chatInput.trim() });
    setChatInput('');
  }

  function sendEmoji(emoji) {
    socket.emit('sendChat', { roomCode: room.code, message: emoji });
  }

  function toggleChat() {
    setChatOpen(v => !v);
    setUnreadCount(0);
  }

  // ── Color map ──────────────────────────────────────────────────────
  const colorMap = {};
  room.players.forEach((p, i) => { colorMap[p.id] = PLAYER_COLORS[i % PLAYER_COLORS.length]; });

  // Narrow window from guess history
  let lo = room.range.min, hi = room.range.max;
  (room.guessHistory || []).forEach(({ guess: g, hint }) => {
    if (hint === 'UP')   lo = Math.max(lo, g + 1);
    if (hint === 'DOWN') hi = Math.min(hi, g - 1);
  });

  // Timer label in lobby sidebar
  const timerLabel = room.timerSeconds
    ? room.timerSeconds >= 60
      ? `${Math.floor(room.timerSeconds / 60)}m${room.timerSeconds % 60 > 0 ? ` ${room.timerSeconds % 60}s` : ''}`
      : `${room.timerSeconds}s`
    : 'No timer';

  return (
    <div className="flex-1 flex min-h-screen overflow-hidden">

      {/* ── LEFT: scoreboard sidebar ──────────────────────────────── */}
      <aside className="w-52 flex-shrink-0 bg-paper/3 border-r border-paper/10 p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs text-paper/40 tracking-widest uppercase">Round {room.round}</p>
          {room.timerEnd && <Timer timerEnd={room.timerEnd} />}
        </div>

        <div>
          <p className="font-mono text-xs text-paper/40 tracking-widest uppercase mb-2">Scores</p>
          <div className="space-y-2">
            {[...room.players]
              .sort((a, b) => (room.scores[b.id] || 0) - (room.scores[a.id] || 0))
              .map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorMap[p.id] }} />
                  <span className={`font-body text-sm flex-1 truncate ${p.id === myId ? 'text-acid' : 'text-paper/80'}`}>
                    {p.name}{p.id === picker?.id ? ' 🎯' : ''}
                  </span>
                  <span className="font-mono text-sm font-bold" style={{ color: colorMap[p.id] }}>
                    {room.scores[p.id] || 0}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="border-t border-paper/10 pt-3 space-y-2">
          <div>
            <p className="font-mono text-xs text-paper/30 tracking-widest uppercase mb-1">Range</p>
            <p className="font-mono text-acid font-bold text-sm">{room.range.min} – {room.range.max}</p>
          </div>
          {room.guessHistory?.length > 0 && (
            <div>
              <p className="font-mono text-xs text-paper/30 tracking-widest uppercase mb-1">Window</p>
              <p className="font-mono text-neon font-bold text-sm">{lo} – {hi}</p>
            </div>
          )}
          <div>
            <p className="font-mono text-xs text-paper/30 tracking-widest uppercase mb-1">Timer</p>
            <p className="font-mono text-paper/50 text-xs">{timerLabel}</p>
          </div>
        </div>
      </aside>

      {/* ── CENTER: main game ──────────────────────────────────────── */}
      <main className="flex-1 flex flex-col p-4 lg:p-6 overflow-hidden min-w-0">

        {/* Phase header */}
        <div className="mb-5">
          {room.state === 'picking' && (
            <div className="animate-slide-up">
              <h2 className="font-display text-4xl lg:text-5xl text-acid">
                {isPicker ? 'Pick Your Number' : `${picker?.name} is picking…`}
              </h2>
              <p className="font-mono text-paper/40 text-sm mt-1">
                {isPicker
                  ? `Choose a secret number between ${room.range.min} and ${room.range.max}`
                  : 'Get ready to guess!'}
              </p>
            </div>
          )}
          {room.state === 'guessing' && (
            <div className="animate-slide-up">
              <h2 className="font-display text-4xl lg:text-5xl text-paper">
                {isPicker ? 'Waiting for Guesses' : 'Make Your Guess'}
              </h2>
              <p className="font-mono text-paper/40 text-sm mt-1">
                {isPicker
                  ? 'Others are searching for your number…'
                  : `Guess between ${room.range.min} and ${room.range.max}`}
              </p>
            </div>
          )}
          {room.state === 'roundEnd' && roundResult && (
            <div className="animate-pop">
              {roundResult.winnerId ? (
                <>
                  <h2 className="font-display text-4xl lg:text-5xl text-acid">
                    {roundResult.winnerId === myId ? '🎉 You Got It!' : `${roundResult.winnerName} Won!`}
                  </h2>
                  <p className="font-mono text-paper/60 text-sm mt-1">
                    The secret number was <span className="text-acid font-bold">{roundResult.secretNumber}</span>
                  </p>
                </>
              ) : (
                <>
                  <h2 className="font-display text-4xl lg:text-5xl text-warn">Time's Up!</h2>
                  <p className="font-mono text-paper/60 text-sm mt-1">Nobody guessed in time.</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Picker: secret input */}
        {room.state === 'picking' && isPicker && (
          <form onSubmit={submitSecret} className="mb-5 animate-slide-up">
            <div className="flex gap-3 max-w-sm">
              <input
                type="number"
                className="input-field text-2xl text-center font-mono"
                placeholder={`${room.range.min}–${room.range.max}`}
                value={secretInput}
                onChange={e => setSecretInput(e.target.value)}
                min={room.range.min} max={room.range.max}
                autoFocus
              />
              <button type="submit" className="btn-primary px-8" disabled={!secretInput}>
                Lock In
              </button>
            </div>
            <p className="font-mono text-xs text-paper/30 mt-2">Nobody else can see this number</p>
          </form>
        )}

        {room.state === 'picking' && !isPicker && (
          <div className="mb-5 card animate-pulse max-w-sm">
            <p className="font-mono text-paper/40 text-sm">
              <span className="text-acid">{picker?.name}</span> is choosing a secret number…
            </p>
          </div>
        )}

        {/* Guesser: guess form */}
        {room.state === 'guessing' && !isPicker && (
          <div className="mb-5">
            {lastHint && (
              <div className="mb-3 flex items-center gap-3 animate-pop">
                <HintBadge hint={lastHint.hint} />
                <span className="font-mono text-paper/50 text-sm">
                  {lastHint.hint === 'UP'   && `${lastHint.guess} is too low — go higher`}
                  {lastHint.hint === 'DOWN' && `${lastHint.guess} is too high — go lower`}
                </span>
              </div>
            )}
            <form onSubmit={submitGuess} className={`flex gap-3 max-w-sm ${inputShake ? 'animate-shake' : ''}`}>
              <input
                type="number"
                className="input-field text-2xl text-center font-mono"
                placeholder={`${lo}–${hi}`}
                value={guess}
                onChange={e => setGuess(e.target.value)}
                min={room.range.min} max={room.range.max}
                autoFocus
              />
              <button type="submit" className="btn-primary px-8" disabled={!guess}>
                Guess
              </button>
            </form>
          </div>
        )}

        {room.state === 'guessing' && isPicker && (
          <div className="mb-5 card max-w-sm">
            <p className="font-mono text-paper/40 text-sm">Watching guesses roll in… 👀</p>
          </div>
        )}

        {/* Round end: next round */}
        {room.state === 'roundEnd' && (
          <div className="mb-5 animate-pop">
            {isHost ? (
              <button className="btn-primary text-lg py-4 px-10" onClick={() => socket.emit('nextRound', { roomCode: room.code })}>
                Next Round →
              </button>
            ) : (
              <div className="card max-w-xs flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-acid animate-pulse-fast" />
                <span className="font-mono text-sm text-paper/60 tracking-widest uppercase">
                  Waiting for host…
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Guess History — newest FIRST, no scroll needed ───────── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <p className="font-mono text-xs text-paper/30 tracking-widest uppercase mb-2">
            Guess History {room.guessHistory?.length > 0 && `(${room.guessHistory.length})`}
          </p>
          <div className="overflow-y-auto flex-1 space-y-1 pr-1" style={{ maxHeight: '320px' }}>
            {(!room.guessHistory || room.guessHistory.length === 0) && (
              <p className="font-mono text-paper/20 text-sm">No guesses yet this round.</p>
            )}
            {/* Reversed so newest is always at the TOP — no scrolling needed */}
            {[...(room.guessHistory || [])].reverse().map((entry, i) => (
              <div
                key={`${entry.timestamp}-${i}`}
                className={`flex items-center gap-3 py-2 px-3 border border-paper/5 bg-paper/3
                  ${i === 0 ? 'animate-pop' : ''}`}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colorMap[entry.playerId] || '#888' }}
                />
                <span className="font-body text-sm text-paper/70 flex-1">
                  {entry.playerName}
                  {entry.playerId === myId && <span className="text-paper/30"> (you)</span>}
                </span>
                <span className="font-mono text-sm font-bold text-paper/80">{entry.guess}</span>
                <HintBadge hint={entry.hint} />
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── RIGHT: Chat panel ─────────────────────────────────────── */}
      <aside
        className={`flex-shrink-0 border-l border-paper/10 bg-paper/3 flex flex-col transition-all duration-300
          ${chatOpen ? 'w-64 lg:w-72' : 'w-12'}`}
      >
        {/* Chat toggle header */}
        <button
          onClick={toggleChat}
          className="flex items-center gap-2 px-3 py-3 border-b border-paper/10
                     hover:bg-paper/5 transition-colors w-full text-left"
        >
          <span className="font-mono text-xs text-paper/50 tracking-widest uppercase flex-1">
            {chatOpen ? 'Chat' : ''}
          </span>
          {!chatOpen && unreadCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-acid text-ink text-xs font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          <span className="text-paper/40 text-sm">{chatOpen ? '→' : '←'}</span>
        </button>

        {chatOpen && (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 0 }}>
              {chatMessages.length === 0 && (
                <p className="font-mono text-paper/20 text-xs text-center mt-4">
                  No messages yet.<br/>Say hi! 👋
                </p>
              )}
              {chatMessages.map(msg => (
                <div key={msg.id} className={`${msg.playerId === myId ? 'text-right' : 'text-left'}`}>
                  <p className="font-mono text-xs text-paper/30 mb-0.5">{msg.playerName}</p>
                  <span
                    className={`inline-block text-sm px-3 py-1.5 max-w-full break-words
                      ${msg.playerId === myId
                        ? 'bg-acid/15 text-acid border border-acid/30'
                        : 'bg-paper/8 text-paper/80 border border-paper/10'}`}
                    style={{ wordBreak: 'break-word' }}
                  >
                    {msg.message}
                  </span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Emoji bar */}
            <div className="flex flex-wrap gap-1 px-3 py-2 border-t border-paper/10">
              {EMOJI_LIST.map(e => (
                <button
                  key={e}
                  onClick={() => sendEmoji(e)}
                  className="text-lg hover:scale-125 transition-transform active:scale-95"
                  title={e}
                >
                  {e}
                </button>
              ))}
            </div>

            {/* Chat input */}
            <form onSubmit={sendChat} className="flex gap-2 p-3 border-t border-paper/10">
              <input
                className="input-field text-sm flex-1 py-2"
                placeholder="Type a message…"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                maxLength={200}
              />
              <button
                type="submit"
                className="btn-primary px-3 py-2 text-xs"
                disabled={!chatInput.trim()}
              >
                ↑
              </button>
            </form>
          </>
        )}
      </aside>
    </div>
  );
}
