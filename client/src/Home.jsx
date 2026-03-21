/**
 * Home.jsx v3 — mobile friendly, same timer config
 */
import { useState } from 'react';
import socket from './socket';

const TIMER_OPTIONS = [
  { label: 'No Timer', value: 0 },
  { label: '30 sec',   value: 30 },
  { label: '1 min',    value: 60 },
  { label: '2 min',    value: 120 },
  { label: '3 min',    value: 180 },
  { label: 'Custom',   value: -1 },
];

export default function Home({ myName, setMyName }) {
  const [tab,         setTab]         = useState('create');
  const [joinCode,    setJoinCode]    = useState('');
  const [rangeMin,    setRangeMin]    = useState(1);
  const [rangeMax,    setRangeMax]    = useState(1000);
  const [timerChoice, setTimerChoice] = useState(60);
  const [customSecs,  setCustomSecs]  = useState(90);

  const finalSecs = timerChoice === -1 ? Number(customSecs) : timerChoice;

  function handleCreate(e) {
    e.preventDefault();
    if (!myName.trim()) return;
    socket.emit('createRoom', {
      playerName:   myName.trim(),
      range:        { min: Number(rangeMin), max: Number(rangeMax) },
      timerSeconds: finalSecs,
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
    <div className="flex-1 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="font-display text-7xl tracking-wider text-acid leading-none">
            UP<br />DOWN
          </h1>
          <p className="font-mono text-paper/50 text-xs tracking-widest mt-2 uppercase">
            Multiplayer Number Guess
          </p>
        </div>

        {/* Name */}
        <div className="mb-5">
          <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">
            Your Name
          </label>
          <input
            className="input-field text-base"
            placeholder="Enter your name…"
            value={myName}
            onChange={e => setMyName(e.target.value)}
            maxLength={20}
            autoComplete="off"
          />
        </div>

        {/* Tabs */}
        <div className="flex mb-5 border-b border-paper/10">
          {['create', 'join'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 font-mono text-xs py-3 tracking-widest uppercase transition-colors
                ${tab === t
                  ? 'text-acid border-b-2 border-acid -mb-px'
                  : 'text-paper/40 hover:text-paper/70'}`}
            >
              {t === 'create' ? '+ Create' : '→ Join'}
            </button>
          ))}
        </div>

        {/* Create */}
        {tab === 'create' && (
          <form onSubmit={handleCreate} className="space-y-4 animate-slide-up">
            <div>
              <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">
                Number Range
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-mono text-xs text-paper/30 block mb-1">Min</label>
                  <input type="number" inputMode="numeric" className="input-field text-sm" value={rangeMin}
                    onChange={e => setRangeMin(e.target.value)} min={1} />
                </div>
                <div>
                  <label className="font-mono text-xs text-paper/30 block mb-1">Max</label>
                  <input type="number" inputMode="numeric" className="input-field text-sm" value={rangeMax}
                    onChange={e => setRangeMax(e.target.value)} max={10000} />
                </div>
              </div>
            </div>

            <div>
              <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">
                Turn Timer
              </label>
              <div className="grid grid-cols-3 gap-2">
                {TIMER_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTimerChoice(opt.value)}
                    className={`font-mono text-xs py-2 px-1 border transition-all tracking-wide uppercase
                      ${timerChoice === opt.value
                        ? 'border-acid text-acid bg-acid/10'
                        : 'border-paper/20 text-paper/50 hover:border-paper/40'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {timerChoice === -1 && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number" inputMode="numeric"
                    className="input-field w-24 text-center text-sm"
                    value={customSecs}
                    onChange={e => setCustomSecs(Math.max(10, Math.min(600, Number(e.target.value))))}
                    min={10} max={600}
                  />
                  <span className="font-mono text-paper/40 text-xs">seconds</span>
                </div>
              )}
              <p className="font-mono text-xs text-paper/25 mt-2">
                {finalSecs === 0 ? '∞ No time limit' : `⏱ ${finalSecs}s per round`}
              </p>
            </div>

            <button type="submit" className="btn-primary w-full py-4 text-base" disabled={!myName.trim()}>
              Create Room
            </button>
          </form>
        )}

        {/* Join */}
        {tab === 'join' && (
          <form onSubmit={handleJoin} className="space-y-4 animate-slide-up">
            <div>
              <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">
                Room Code
              </label>
              <input
                className="input-field text-3xl text-center tracking-[0.4em] uppercase"
                placeholder="XXXXXX"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full py-4 text-base"
              disabled={!myName.trim() || joinCode.length !== 6}
            >
              Join Room
            </button>
          </form>
        )}

        <p className="text-center text-paper/20 font-mono text-xs mt-8 tracking-widest">
          2–6 PLAYERS · REAL-TIME
        </p>
      </div>
    </div>
  );
}
