/**
 * Home.jsx v2 — configurable timer when creating a room
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
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        <div className="mb-10 text-center">
          <h1 className="font-display text-8xl tracking-wider text-acid leading-none">
            UP<br />DOWN
          </h1>
          <p className="font-mono text-paper/50 text-sm tracking-widest mt-2 uppercase">
            Multiplayer Number Guess
          </p>
        </div>

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

        {tab === 'create' && (
          <form onSubmit={handleCreate} className="space-y-5 animate-slide-up">

            {/* Range */}
            <div>
              <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">
                Number Range
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-mono text-xs text-paper/30 block mb-1">Min</label>
                  <input type="number" className="input-field" value={rangeMin}
                    onChange={e => setRangeMin(e.target.value)} min={1} />
                </div>
                <div>
                  <label className="font-mono text-xs text-paper/30 block mb-1">Max</label>
                  <input type="number" className="input-field" value={rangeMax}
                    onChange={e => setRangeMax(e.target.value)} max={10000} />
                </div>
              </div>
            </div>

            {/* Timer */}
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
                    className={`font-mono text-xs py-2 px-2 border transition-all tracking-wider uppercase
                      ${timerChoice === opt.value
                        ? 'border-acid text-acid bg-acid/10'
                        : 'border-paper/20 text-paper/50 hover:border-paper/40 hover:text-paper/70'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {timerChoice === -1 && (
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="number"
                    className="input-field w-28 text-center"
                    value={customSecs}
                    onChange={e => setCustomSecs(Math.max(10, Math.min(600, Number(e.target.value))))}
                    min={10} max={600}
                    placeholder="seconds"
                  />
                  <span className="font-mono text-paper/40 text-sm">seconds (10–600)</span>
                </div>
              )}

              <p className="font-mono text-xs text-paper/30 mt-2">
                {finalSecs === 0
                  ? '∞ No time limit — players guess at their own pace'
                  : `⏱ ${finalSecs >= 60
                      ? `${Math.floor(finalSecs / 60)}m${finalSecs % 60 > 0 ? ` ${finalSecs % 60}s` : ''}`
                      : `${finalSecs}s`} per guessing round`}
              </p>
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

        <p className="text-center text-paper/20 font-mono text-xs mt-10 tracking-widest">
          2 – 6 PLAYERS · REAL-TIME MULTIPLAYER
        </p>
      </div>
    </div>
  );
}
