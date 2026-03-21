/**
 * sounds.js
 * Tiny Web Audio API sound engine — no external files needed.
 * All sounds are procedurally generated.
 */

let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function playTone({ frequency = 440, type = 'sine', duration = 0.15, gain = 0.3, delay = 0 }) {
  try {
    const ac  = getCtx();
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.connect(env);
    env.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ac.currentTime + delay);
    env.gain.setValueAtTime(0, ac.currentTime + delay);
    env.gain.linearRampToValueAtTime(gain, ac.currentTime + delay + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + duration);
    osc.start(ac.currentTime + delay);
    osc.stop(ac.currentTime + delay + duration + 0.05);
  } catch (_) { /* AudioContext might be blocked */ }
}

export const sounds = {
  up() {
    playTone({ frequency: 330, type: 'square', duration: 0.12, gain: 0.2 });
    playTone({ frequency: 440, type: 'square', duration: 0.12, gain: 0.2, delay: 0.1 });
  },
  down() {
    playTone({ frequency: 440, type: 'square', duration: 0.12, gain: 0.2 });
    playTone({ frequency: 330, type: 'square', duration: 0.12, gain: 0.2, delay: 0.1 });
  },
  correct() {
    [523, 659, 784, 1047].forEach((f, i) =>
      playTone({ frequency: f, type: 'sine', duration: 0.15, gain: 0.25, delay: i * 0.08 })
    );
  },
  join() {
    playTone({ frequency: 600, type: 'sine', duration: 0.1, gain: 0.15 });
  },
  start() {
    [400, 500, 700].forEach((f, i) =>
      playTone({ frequency: f, type: 'triangle', duration: 0.12, gain: 0.2, delay: i * 0.1 })
    );
  },
  error() {
    playTone({ frequency: 200, type: 'sawtooth', duration: 0.2, gain: 0.15 });
  },
};
