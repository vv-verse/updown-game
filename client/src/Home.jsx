import { useState } from 'react';
import socket from './socket';

const TIMER_OPTIONS = [
  { label:'No Timer', value:0 },{ label:'30 sec', value:30 },{ label:'1 min', value:60 },
  { label:'2 min', value:120 },{ label:'3 min', value:180 },{ label:'Custom', value:-1 },
];

export default function Home({ myName, setMyName, voiceEnabled, setVoiceEnabled }) {
  const [tab,         setTab]         = useState('create');
  const [gameMode,    setGameMode]    = useState('normal');
  const [joinCode,    setJoinCode]    = useState('');
  const [rangeMin,    setRangeMin]    = useState(1);
  const [rangeMax,    setRangeMax]    = useState(1000);
  const [timerChoice, setTimerChoice] = useState(60);
  const [customSecs,  setCustomSecs]  = useState(90);
  const finalSecs = timerChoice === -1 ? Number(customSecs) : timerChoice;

  function handleCreate(e) {
    e.preventDefault();
    if (!myName.trim()) return;
    socket.emit('createRoom', { playerName:myName.trim(), range:{ min:Number(rangeMin), max:Number(rangeMax) }, timerSeconds:finalSecs, mode:gameMode });
  }
  function handleJoin(e) {
    e.preventDefault();
    if (!myName.trim() || !joinCode.trim()) return;
    socket.emit('joinRoom', { roomCode:joinCode.trim().toUpperCase(), playerName:myName.trim() });
  }

  const voiceColor = voiceEnabled ? '#c8ff00' : 'rgba(245,240,232,0.4)';

  return (
    <div className="flex-1 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-7xl tracking-wider text-acid leading-none">UP<br />DOWN</h1>
          <p className="font-mono text-paper/50 text-xs tracking-widest mt-2 uppercase">Multiplayer Number Guess</p>
        </div>

        <div className="mb-5">
          <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">Your Name</label>
          <input className="input-field text-base" placeholder="Enter your name…" value={myName} onChange={e=>setMyName(e.target.value)} maxLength={20} autoComplete="off" />
        </div>

        {/* Voice toggle */}
        <div onClick={()=>setVoiceEnabled(v=>!v)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', marginBottom:20, cursor:'pointer', border:`1px solid ${voiceEnabled?'rgba(200,255,0,0.5)':'rgba(245,240,232,0.12)'}`, background:voiceEnabled?'rgba(200,255,0,0.06)':'rgba(245,240,232,0.03)', borderRadius:6, userSelect:'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={voiceColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
            <div>
              <p style={{ fontFamily:'monospace', fontSize:13, fontWeight:500, color:voiceEnabled?'#c8ff00':'rgba(245,240,232,0.7)', letterSpacing:1 }}>Voice Chat</p>
              <p style={{ fontFamily:'monospace', fontSize:10, color:'rgba(245,240,232,0.35)', marginTop:2 }}>{voiceEnabled?'On — mic asked when you join':'Off — text chat only'}</p>
            </div>
          </div>
          <div style={{ width:40, height:22, borderRadius:11, flexShrink:0, background:voiceEnabled?'#c8ff00':'rgba(245,240,232,0.15)', position:'relative', transition:'background 0.2s' }}>
            <div style={{ position:'absolute', top:3, left:voiceEnabled?21:3, width:16, height:16, borderRadius:'50%', background:voiceEnabled?'#0a0a0f':'rgba(245,240,232,0.5)', transition:'left 0.2s' }} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex mb-5 border-b border-paper/10">
          {['create','join'].map(t=>(
            <button key={t} onClick={()=>setTab(t)} className={`flex-1 font-mono text-xs py-3 tracking-widest uppercase transition-colors ${tab===t?'text-acid border-b-2 border-acid -mb-px':'text-paper/40 hover:text-paper/70'}`}>
              {t==='create'?'+ Create':'→ Join'}
            </button>
          ))}
        </div>

        {tab === 'create' && (
          <form onSubmit={handleCreate} className="space-y-5 animate-slide-up">
            {/* Game mode */}
            <div>
              <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">Game Mode</label>
              <div className="grid grid-cols-2 gap-3">
                {[{id:'normal',label:'Normal',sub:'2–6 players'},{id:'duel',label:'1v1 Duel',sub:'2 players only'}].map(m=>(
                  <button key={m.id} type="button" onClick={()=>setGameMode(m.id)} style={{ padding:'12px 10px', border:`1px solid ${gameMode===m.id?'#c8ff00':'rgba(245,240,232,0.15)'}`, borderRadius:6, cursor:'pointer', textAlign:'center', background:gameMode===m.id?'rgba(200,255,0,0.08)':'rgba(245,240,232,0.03)' }}>
                    <p style={{ fontFamily:'monospace', fontSize:13, fontWeight:500, color:gameMode===m.id?'#c8ff00':'rgba(245,240,232,0.75)', letterSpacing:1 }}>{m.label}</p>
                    <p style={{ fontFamily:'monospace', fontSize:10, color:'rgba(245,240,232,0.35)', marginTop:3 }}>{m.sub}</p>
                  </button>
                ))}
              </div>
              {gameMode === 'duel' && (
                <div style={{ marginTop:10, padding:'10px 12px', background:'rgba(200,255,0,0.05)', border:'1px solid rgba(200,255,0,0.2)', borderRadius:5 }}>
                  <p style={{ fontFamily:'monospace', fontSize:11, color:'rgba(200,255,0,0.8)', lineHeight:1.7 }}>Both players pick a secret number simultaneously. Then you take turns guessing each other's number. First to guess correctly wins. You only see your own hints.</p>
                </div>
              )}
            </div>

            {/* Range */}
            <div>
              <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">Number Range</label>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="font-mono text-xs text-paper/30 block mb-1">Min</label><input type="number" inputMode="numeric" className="input-field text-sm" value={rangeMin} onChange={e=>setRangeMin(e.target.value)} min={1} /></div>
                <div><label className="font-mono text-xs text-paper/30 block mb-1">Max</label><input type="number" inputMode="numeric" className="input-field text-sm" value={rangeMax} onChange={e=>setRangeMax(e.target.value)} max={10000} /></div>
              </div>
            </div>

            {/* Timer */}
            <div>
              <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">{gameMode==='duel'?'Time Per Turn':'Turn Timer'}</label>
              <div className="grid grid-cols-3 gap-2">
                {TIMER_OPTIONS.map(opt=>(
                  <button key={opt.value} type="button" onClick={()=>setTimerChoice(opt.value)} className={`font-mono text-xs py-2 px-1 border transition-all tracking-wide uppercase ${timerChoice===opt.value?'border-acid text-acid bg-acid/10':'border-paper/20 text-paper/50 hover:border-paper/40'}`}>{opt.label}</button>
                ))}
              </div>
              {timerChoice===-1&&<div className="mt-2 flex items-center gap-2"><input type="number" inputMode="numeric" className="input-field w-24 text-center text-sm" value={customSecs} onChange={e=>setCustomSecs(Math.max(10,Math.min(600,Number(e.target.value))))} min={10} max={600} /><span className="font-mono text-paper/40 text-xs">seconds</span></div>}
              <p className="font-mono text-xs text-paper/25 mt-2">{finalSecs===0?'∞ No time limit':`⏱ ${finalSecs}s ${gameMode==='duel'?'per guess turn':'per round'}`}</p>
            </div>

            <button type="submit" className="btn-primary w-full py-4 text-base" disabled={!myName.trim()}>
              Create {gameMode==='duel'?'1v1 Room':'Room'}
            </button>
          </form>
        )}

        {tab === 'join' && (
          <form onSubmit={handleJoin} className="space-y-4 animate-slide-up">
            <div>
              <label className="font-mono text-xs text-paper/50 tracking-widest uppercase block mb-2">Room Code</label>
              <input className="input-field text-3xl text-center tracking-[0.4em] uppercase" placeholder="XXXXXX" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} maxLength={6} autoComplete="off" autoCapitalize="characters" />
            </div>
            <button type="submit" className="btn-primary w-full py-4 text-base" disabled={!myName.trim()||joinCode.length!==6}>Join Room</button>
          </form>
        )}

        <p className="text-center text-paper/20 font-mono text-xs mt-8 tracking-widest">2–6 PLAYERS · REAL-TIME</p>
      </div>
    </div>
  );
}
