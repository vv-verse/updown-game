/**
 * GameRoom.jsx
 * The active game view. Handles:
 *  • Number-picker phase (picker enters secret number)
 *  • Guessing phase (other players submit guesses)
 *  • Hint display (UP / DOWN / CORRECT)
 *  • Round-end & winner reveal
 *  • Scoreboard sidebar
 *  • Guess history
 *  • Turn timer countdown
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import socket from './socket';
import { sounds } from './sounds.js';

const PLAYER_COLORS = ['#c8ff00', '#00ffcc', '#ff3366', '#ffaa00', '#aa88ff', '#ff88cc'];

// Hint badge
function HintBadge({ hint }) {
  if (hint === 'UP')      return <span className="tag-up">▲ UP</span>;
  if (hint === 'DOWN')    return <span className="tag-down">▼ DOWN</span>;
  if (hint === 'CORRECT') return <span className="tag-correct">✓ CORRECT</span>;
  return null;
}

// Timer display
function Timer({ timerEnd }) {
  const [secs, setSecs] = useState(null);
  useEffect(() => {
    if (!timerEnd) { setSecs(null); return; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
      setSecs(left);
    };
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

export default function GameRoom({ room: initialRoom, setRoom, myId, myName, onBackToLobby }) {
  const [room,         setLocalRoom]   = useState(initialRoom);
  const [guess,        setGuess]       = useState('');
  const [secretInput,  setSecretInput] = useState('');
  const [lastHint,     setLastHint]    = useState(null);  // { hint, guess }
  const [roundResult,  setRoundResult] = useState(null);  // { winnerId, winnerName, secretNumber }
  const [inputShake,   setInputShake]  = useState(false);
  const historyRef = useRef(null);

  const picker  = room.players[room.pickerIndex];
  const isPicker = picker?.id === myId;
  const isHost   = room.hostId === myId;

  // Sync local room with parent when we need to (player joins/leaves)
  const updateRoom = useCallback((r) => {
    setLocalRoom(r);
    setRoom(r);
  }, [setRoom]);

  // ── Socket listeners ──────────────────────────────────────────────
  useEffect(() => {
    const onPlayerLeft  = ({ room }) => updateRoom(room);
    const onPlayerJoined = ({ room }) => updateRoom(room);

    // Picker's number was locked in → switch to guessing phase
    const onNumberPicked = ({ room }) => {
      updateRoom(room);
      setLastHint(null);
      setGuess('');
      setSecretInput('');
      setRoundResult(null);
    };

    // Next round starts
    const onWaitingForPick = ({ room }) => {
      updateRoom(room);
      setLastHint(null);
      setGuess('');
      setSecretInput('');
      setRoundResult(null);
    };

    // A guess hint came in
    const onHint = ({ guess: g, hint, playerId, playerName, room }) => {
      updateRoom(room);
      // Only show the flashy hint if it was MY guess
      if (playerId === myId) {
        setLastHint({ hint, guess: g });
        setInputShake(hint !== 'CORRECT');
        setTimeout(() => setInputShake(false), 500);
        if (hint === 'UP')   sounds.up();
        if (hint === 'DOWN') sounds.down();
      }
      // Scroll history
      setTimeout(() => {
        if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
      }, 50);
    };

    // Round won
    const onRoundWon = ({ winnerId, winnerName, secretNumber, room }) => {
      updateRoom(room);
      setRoundResult({ winnerId, winnerName, secretNumber });
      sounds.correct();
    };

    // Time's up
    const onTimeUp = ({ room }) => {
      updateRoom(room);
      setRoundResult({ winnerId: null, winnerName: null, secretNumber: room.secretNumber });
      sounds.error();
    };

    // Next round triggered
    const onNextRound = ({ room }) => {
      updateRoom(room);
      setRoundResult(null);
      setLastHint(null);
    };

    socket.on('playerLeft',    onPlayerLeft);
    socket.on('playerJoined',  onPlayerJoined);
    socket.on('numberPicked',  onNumberPicked);
    socket.on('waitingForPick', onWaitingForPick);
    socket.on('hint',          onHint);
    socket.on('roundWon',      onRoundWon);
    socket.on('timeUp',        onTimeUp);
    socket.on('nextRound',     onNextRound);

    return () => {
      socket.off('playerLeft',    onPlayerLeft);
      socket.off('playerJoined',  onPlayerJoined);
      socket.off('numberPicked',  onNumberPicked);
      socket.off('waitingForPick', onWaitingForPick);
      socket.off('hint',          onHint);
      socket.off('roundWon',      onRoundWon);
      socket.off('timeUp',        onTimeUp);
      socket.off('nextRound',     onNextRound);
    };
  }, [myId, updateRoom]);

  // ── Actions ───────────────────────────────────────────────────────
  function submitSecret(e) {
    e.preventDefault();
    const n = Number(secretInput);
    if (!n) return;
    socket.emit('pickNumber', { roomCode: room.code, number: n });
  }

  function submitGuess(e) {
    e.preventDefault();
    const n = Number(guess);
    if (!n) return;
    socket.emit('guessNumber', { roomCode: room.code, guess: n });
    setGuess('');
  }

  function handleNextRound() {
    socket.emit('nextRound', { roomCode: room.code });
  }

  // ── Player color map ─────────────────────────────────────────────
  const colorMap = {};
  room.players.forEach((p, i) => { colorMap[p.id] = PLAYER_COLORS[i % PLAYER_COLORS.length]; });

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-screen">

      {/* ── Sidebar: players + scores ──────────────────────────────── */}
      <aside className="lg:w-64 bg-paper/3 border-b lg:border-b-0 lg:border-r border-paper/10 p-4 lg:p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="font-mono text-xs text-paper/40 tracking-widest uppercase">Round {room.round}</p>
          {room.timerEnd && <Timer timerEnd={room.timerEnd} />}
        </div>

        <p className="font-mono text-xs text-paper/40 tracking-widest uppercase mb-3">Scoreboard</p>
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

        {/* Range reminder */}
        <div className="mt-6 pt-4 border-t border-paper/10">
          <p className="font-mono text-xs text-paper/30 tracking-widest uppercase mb-1">Range</p>
          <p className="font-mono text-acid font-bold">{room.range.min} – {room.range.max}</p>
        </div>

        {/* Narrow hint bounds from history */}
        {room.guessHistory?.length > 0 && (() => {
          let lo = room.range.min, hi = room.range.max;
          room.guessHistory.forEach(({ guess: g, hint }) => {
            if (hint === 'UP')   lo = Math.max(lo, g + 1);
            if (hint === 'DOWN') hi = Math.min(hi, g - 1);
          });
          return (
            <div className="mt-3">
              <p className="font-mono text-xs text-paper/30 tracking-widest uppercase mb-1">Current Window</p>
              <p className="font-mono text-neon font-bold">{lo} – {hi}</p>
            </div>
          );
        })()}
      </aside>

      {/* ── Main game area ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col p-4 lg:p-8 overflow-hidden">

        {/* Phase header */}
        <div className="mb-6">
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
                  ? 'Sit tight — others are trying to find your number'
                  : `Guess a number between ${room.range.min} and ${room.range.max}`}
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
                    The secret number was{' '}
                    <span className="text-acid font-bold">{roundResult.secretNumber}</span>
                  </p>
                </>
              ) : (
                <>
                  <h2 className="font-display text-4xl lg:text-5xl text-warn">Time's Up!</h2>
                  <p className="font-mono text-paper/60 text-sm mt-1">
                    The secret number was{' '}
                    <span className="text-acid font-bold">{roundResult.secretNumber}</span>
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── PICKING phase: secret number form ─────────────────────── */}
        {room.state === 'picking' && isPicker && (
          <form onSubmit={submitSecret} className="mb-6 animate-slide-up">
            <div className="flex gap-3 max-w-sm">
              <input
                type="number"
                className="input-field text-2xl text-center font-mono"
                placeholder={`${room.range.min}–${room.range.max}`}
                value={secretInput}
                onChange={e => setSecretInput(e.target.value)}
                min={room.range.min}
                max={room.range.max}
                autoFocus
              />
              <button type="submit" className="btn-primary px-8" disabled={!secretInput}>
                Lock In
              </button>
            </div>
            <p className="font-mono text-xs text-paper/30 mt-2">
              This number is secret — no other players can see it
            </p>
          </form>
        )}

        {room.state === 'picking' && !isPicker && (
          <div className="mb-6 card animate-pulse-fast max-w-sm">
            <p className="font-mono text-paper/40 text-sm tracking-wide">
              <span className="text-acid">{picker?.name}</span> is choosing the secret number…
            </p>
          </div>
        )}

        {/* ── GUESSING phase: guess form ────────────────────────────── */}
        {room.state === 'guessing' && !isPicker && (
          <div className="mb-6">
            {/* Big hint flash */}
            {lastHint && (
              <div className="mb-4 flex items-center gap-4 animate-pop">
                <HintBadge hint={lastHint.hint} />
                <span className="font-mono text-paper/50 text-sm">
                  Your guess of <strong className="text-paper">{lastHint.guess}</strong> is{' '}
                  {lastHint.hint === 'UP' && 'too low'}
                  {lastHint.hint === 'DOWN' && 'too high'}
                </span>
              </div>
            )}

            <form onSubmit={submitGuess} className={`flex gap-3 max-w-sm ${inputShake ? 'animate-shake' : ''}`}>
              <input
                type="number"
                className="input-field text-2xl text-center font-mono"
                placeholder={`${room.range.min}–${room.range.max}`}
                value={guess}
                onChange={e => setGuess(e.target.value)}
                min={room.range.min}
                max={room.range.max}
                autoFocus
              />
              <button type="submit" className="btn-primary px-8" disabled={!guess}>
                Guess
              </button>
            </form>
          </div>
        )}

        {room.state === 'guessing' && isPicker && (
          <div className="mb-6 card max-w-sm">
            <p className="font-mono text-paper/40 text-sm">
              Watching guesses come in… 👀
            </p>
          </div>
        )}

        {/* ── Round end: next-round button ──────────────────────────── */}
        {room.state === 'roundEnd' && (
          <div className="mb-6 animate-pop">
            {isHost ? (
              <button className="btn-primary text-lg py-4 px-10" onClick={handleNextRound}>
                Next Round →
              </button>
            ) : (
              <div className="card max-w-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-acid animate-pulse-fast" />
                  <span className="font-mono text-sm text-paper/60 tracking-widest uppercase">
                    Waiting for host…
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Guess History ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <p className="font-mono text-xs text-paper/30 tracking-widest uppercase mb-2">
            Guess History {room.guessHistory?.length > 0 && `(${room.guessHistory.length})`}
          </p>
          <div
            ref={historyRef}
            className="flex-1 overflow-y-auto space-y-1 pr-1"
            style={{ maxHeight: '320px' }}
          >
            {(!room.guessHistory || room.guessHistory.length === 0) && (
              <p className="font-mono text-paper/20 text-sm">No guesses yet this round.</p>
            )}
            {[...( room.guessHistory || [])].reverse().map((entry, i) => (
              <div
                key={`${entry.timestamp}-${i}`}
                className="flex items-center gap-3 py-2 px-3 border border-paper/5 bg-paper/3 animate-slide-up"
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
    </div>
  );
}
