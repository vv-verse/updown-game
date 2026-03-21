/**
 * Lobby.jsx v3 — uses roomCodeRef for safe socket emits
 */
import { useEffect } from 'react';
import socket from './socket';

const PLAYER_COLORS = ['#c8ff00', '#00ffcc', '#ff3366', '#ffaa00', '#aa88ff', '#ff88cc'];

export default function Lobby({ room, setRoom, myId, roomCodeRef }) {
  const isHost = room.hostId === myId;

  useEffect(() => {
    const handler = ({ room: updated }) => setRoom(updated);
    socket.on('playerJoined', handler);
    socket.on('playerLeft',   handler);
    return () => {
      socket.off('playerJoined', handler);
      socket.off('playerLeft',   handler);
    };
  }, [setRoom]);

  function handleStart() {
    socket.emit('startGame', { roomCode: roomCodeRef.current });
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-8">
          <p className="font-mono text-paper/40 text-xs tracking-widest uppercase mb-1">Room Code</p>
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="font-display text-6xl text-acid tracking-widest">{room.code}</h2>
            <button
              className="font-mono text-xs text-paper/40 hover:text-acid transition-colors border
                         border-paper/20 hover:border-acid px-3 py-1 tracking-widest uppercase"
              onClick={() => navigator.clipboard?.writeText(room.code)}
            >
              Copy
            </button>
          </div>
          <p className="font-mono text-paper/30 text-xs mt-1">Share this code with friends</p>
        </div>

        {/* Range + timer info */}
        <div className="card mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-mono text-xs text-paper/30 tracking-widest uppercase mb-1">Range</p>
            <p className="font-mono text-acid font-bold">{room.range.min} — {room.range.max}</p>
          </div>
          <div>
            <p className="font-mono text-xs text-paper/30 tracking-widest uppercase mb-1">Timer</p>
            <p className="font-mono text-paper/60 text-sm">
              {room.timerSeconds
                ? room.timerSeconds >= 60
                  ? `${Math.floor(room.timerSeconds/60)}m${room.timerSeconds%60>0?` ${room.timerSeconds%60}s`:''}`
                  : `${room.timerSeconds}s`
                : 'No timer'}
            </p>
          </div>
        </div>

        {/* Players */}
        <div className="mb-8">
          <p className="font-mono text-xs text-paper/40 tracking-widest uppercase mb-3">
            Players ({room.players.length}/6)
          </p>
          <div className="space-y-2">
            {room.players.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-3 border border-paper/10 px-4 py-3 bg-paper/3 animate-slide-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length] }} />
                <span className="font-body font-medium flex-1 truncate">{p.name}</span>
                {p.id === room.hostId && (
                  <span className="font-mono text-xs text-acid/70 tracking-widest">HOST</span>
                )}
                {p.id === myId && (
                  <span className="font-mono text-xs text-paper/30 tracking-widest">YOU</span>
                )}
              </div>
            ))}
            {room.players.length < 2 && (
              <div className="flex items-center gap-3 border border-dashed border-paper/10 px-4 py-3">
                <div className="w-3 h-3 rounded-full border border-paper/20" />
                <span className="font-mono text-paper/20 text-sm">Waiting for player…</span>
              </div>
            )}
          </div>
        </div>

        {isHost ? (
          <div>
            <button
              className="btn-primary w-full text-lg py-4 animate-glow"
              onClick={handleStart}
              disabled={room.players.length < 2}
            >
              {room.players.length < 2 ? 'Need 1 more player…' : 'Start Game →'}
            </button>
            <p className="text-center font-mono text-xs text-paper/20 mt-3">
              Only you (host) can start
            </p>
          </div>
        ) : (
          <div className="card text-center">
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-acid animate-pulse-fast" />
              <span className="font-mono text-sm text-paper/60 tracking-widest uppercase">
                Waiting for host to start
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
