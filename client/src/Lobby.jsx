/**
 * Lobby.jsx
 * Waiting room — shows players, room code, and start button (host only).
 */
import { useEffect } from 'react';
import socket from './socket';

// Player badge colors cycle through these
const PLAYER_COLORS = ['#c8ff00', '#00ffcc', '#ff3366', '#ffaa00', '#aa88ff', '#ff88cc'];

export default function Lobby({ room, setRoom, myId }) {
  const isHost = room.hostId === myId;

  // Keep room in sync with late-joining events (playerJoined handled in App)
  useEffect(() => {
    const handler = ({ room: updated }) => setRoom(updated);
    socket.on('playerJoined', handler);
    socket.on('playerLeft',   handler);
    return () => { socket.off('playerJoined', handler); socket.off('playerLeft', handler); };
  }, [setRoom]);

  function handleStart() {
    socket.emit('startGame', { roomCode: room.code });
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="mb-8">
          <p className="font-mono text-paper/40 text-xs tracking-widest uppercase mb-1">Room Code</p>
          <div className="flex items-center gap-4">
            <h2 className="font-display text-6xl text-acid tracking-widest">{room.code}</h2>
            <button
              className="font-mono text-xs text-paper/40 hover:text-acid transition-colors border
                         border-paper/20 hover:border-acid px-3 py-1 tracking-widest uppercase"
              onClick={() => navigator.clipboard.writeText(room.code)}
              title="Copy code"
            >
              Copy
            </button>
          </div>
          <p className="font-mono text-paper/30 text-xs mt-1 tracking-wide">
            Share this code with friends to join
          </p>
        </div>

        {/* Range info */}
        <div className="card mb-6 flex items-center gap-4">
          <span className="font-mono text-xs text-paper/40 tracking-widest uppercase">Range</span>
          <span className="font-mono text-acid font-bold text-lg">
            {room.range.min} — {room.range.max}
          </span>
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
                className="flex items-center gap-3 border border-paper/10 px-4 py-3
                           animate-slide-up bg-paper/3"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length] }}
                />
                <span className="font-body font-medium flex-1">{p.name}</span>
                {p.id === room.hostId && (
                  <span className="font-mono text-xs text-acid/70 tracking-widest">HOST</span>
                )}
                {p.id === myId && (
                  <span className="font-mono text-xs text-paper/30 tracking-widest">YOU</span>
                )}
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 2 - room.players.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center gap-3 border border-dashed border-paper/10 px-4 py-3"
              >
                <div className="w-3 h-3 rounded-full border border-paper/20" />
                <span className="font-mono text-paper/20 text-sm">Waiting for player…</span>
              </div>
            ))}
          </div>
        </div>

        {/* Start button */}
        {isHost ? (
          <div>
            <button
              className="btn-primary w-full text-lg py-4 animate-glow"
              onClick={handleStart}
              disabled={room.players.length < 2}
            >
              {room.players.length < 2 ? 'Need 1 more player…' : 'Start Game →'}
            </button>
            <p className="text-center font-mono text-xs text-paper/20 mt-3 tracking-wide">
              Only you (host) can start the game
            </p>
          </div>
        ) : (
          <div className="card text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
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
