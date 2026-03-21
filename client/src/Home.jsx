/**
 * Home.jsx
 * Landing page: create room or join with a code.
 */
import { useState } from 'react';
import socket from './socket';

export default function Home({ myName, setMyName }) {
  const [tab,      setTab]      = useState('create'); // 'create' | 'join'
  const [joinCode, setJoinCode] = useState('');
  const [rangeMin, setRangeMin] = useState(1);
  const [rangeMax, setRangeMax] = useState(1000);

  function handleCreate(e) {
    e.preventDefault();
    if (!myName.trim()) return;
    socket.emit('createRoom', {
      playerName: myName.trim(),
      range: { min: Number(rangeMin), max: Number(rangeMax) },
    });
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!myName.trim() || !joinCode.trim()) return;
    socket.emit('joinRoom', {
      roomCode:   joinCode.trim().toUpperCase(),
      playerName: myName.trim(),
    });
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="mb-10 text-center">
          <h1 className="font-display text-8xl tracking-wider text-acid leading-none">
            UP<br />DOWN
          </h1>
          <p className="font-mono text-paper/50 text-sm tracking-widest mt-2 uppercase">
            Multiplayer Number Guess
          </p>
        </div>

        {/* Name input */}
        <div className="mb-6">
          <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">
            Your Name
          </label>
          <input
            className="input-field text-lg"
            placeholder="Enter your name…"
            value={myName}
            onChange={e => setMyName(e.target.value)}
            maxLength={20}
          />
        </div>

        {/* Tabs */}
        <div className="flex mb-6 border-b border-paper/10">
          {['create', 'join'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 font-mono text-sm py-3 tracking-widest uppercase transition-colors
                ${tab === t
                  ? 'text-acid border-b-2 border-acid -mb-px'
                  : 'text-paper/40 hover:text-paper/70'}`}
            >
              {t === 'create' ? '+ Create Room' : '→ Join Room'}
            </button>
          ))}
        </div>

        {/* Create Room */}
        {tab === 'create' && (
          <form onSubmit={handleCreate} className="space-y-4 animate-slide-up">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">
                  Min
                </label>
                <input
                  type="number"
                  className="input-field"
                  value={rangeMin}
                  onChange={e => setRangeMin(e.target.value)}
                  min={1}
                />
              </div>
              <div>
                <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">
                  Max
                </label>
                <input
                  type="number"
                  className="input-field"
                  value={rangeMax}
                  onChange={e => setRangeMax(e.target.value)}
                  max={10000}
                />
              </div>
            </div>
            <button
              type="submit"
              className="btn-primary w-full animate-glow"
              disabled={!myName.trim()}
            >
              Create Room
            </button>
          </form>
        )}

        {/* Join Room */}
        {tab === 'join' && (
          <form onSubmit={handleJoin} className="space-y-4 animate-slide-up">
            <div>
              <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">
                Room Code
              </label>
              <input
                className="input-field text-2xl text-center tracking-[0.5em] uppercase"
                placeholder="XXXXXX"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={!myName.trim() || joinCode.length !== 6}
            >
              Join Room
            </button>
          </form>
        )}

        {/* Footer */}
        <p className="text-center text-paper/20 font-mono text-xs mt-10 tracking-widest">
          2 – 6 PLAYERS · REAL-TIME MULTIPLAYER
        </p>
      </div>
    </div>
  );
}
