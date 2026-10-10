// 임시 사운드: Web Audio로 합성한다. 무료 효과음이 정해지면 파일 재생으로 교체.
let ctx = null;
let master = null;
let noiseBuf = null;
const loops = {};

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function env(param, t, a, peak, d) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + a);
  param.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function noiseSource() {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

function noise(t, { freq = 800, q = 1, type = 'bandpass', peak = 0.3, a = 0.005, d = 0.08 } = {}) {
  const s = noiseSource();
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  env(g.gain, t, a, peak, d);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random());
  s.stop(t + a + d + 0.05);
}

function tone(t, { freq = 440, to = null, type = 'sine', peak = 0.2, a = 0.01, d = 0.3, vib = 0 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + a + d);
  if (vib) {
    const l = ctx.createOscillator();
    const lg = ctx.createGain();
    l.frequency.value = 6; lg.gain.value = vib;
    l.connect(lg).connect(o.frequency);
    l.start(t); l.stop(t + a + d + 0.05);
  }
  const g = ctx.createGain();
  env(g.gain, t, a, peak, d);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + a + d + 0.05);
}

// 각 효과음은 재생 길이(초)를 반환한다.
const SFX = {
  step: t => { noise(t, { freq: 420, q: 1.5, peak: 0.07, d: 0.06 }); return 0.1; },
  thud: t => { noise(t, { type: 'lowpass', freq: 240, peak: 0.3, d: 0.12 }); return 0.15; },
  run: t => { for (let i = 0; i < 9; i++) noise(t + i * 0.2, { freq: 520 + (i % 2) * 80, q: 2, peak: 0.35, d: 0.07 }); return 1.9; },
  follow: t => { for (let i = 0; i < 6; i++) noise(t + i * 0.42, { freq: 260, q: 3, peak: 0.2 + i * 0.07, d: 0.12 }); return 2.6; },
  sob: t => {
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.75;
      tone(s, { freq: 430 - i * 20, to: 330 - i * 20, type: 'triangle', peak: 0.07, a: 0.08, d: 0.55, vib: 18 });
      noise(s, { freq: 1800, q: 4, peak: 0.03, a: 0.05, d: 0.4 });
    }
    return 2.4;
  },
  creak: t => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(150, t + 0.8);
    o.frequency.linearRampToValueAtTime(95, t + 1.4);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 6;
    const am = ctx.createGain(); am.gain.value = 0.5;
    const l = ctx.createOscillator(); l.type = 'square'; l.frequency.value = 22;
    const lg = ctx.createGain(); lg.gain.value = 0.5;
    l.connect(lg).connect(am.gain);
    const g = ctx.createGain();
    env(g.gain, t, 0.15, 0.35, 1.3);
    o.connect(f).connect(am).connect(g).connect(master);
    o.start(t); l.start(t); o.stop(t + 1.6); l.stop(t + 1.6);
    return 1.6;
  },
  slam: t => { noise(t, { type: 'lowpass', freq: 380, q: 0.7, peak: 0.9, d: 0.6 }); tone(t, { freq: 75, to: 38, peak: 0.8, d: 0.6 }); return 0.8; },
  doorClose: t => { noise(t, { type: 'lowpass', freq: 700, peak: 0.45, d: 0.25 }); tone(t, { freq: 120, to: 60, peak: 0.35, d: 0.3 }); return 0.4; },
  call: t => {
    [[233, 0], [208, 0.38], [196, 0.62]].forEach(([f, dt]) => {
      tone(t + dt, { freq: f, type: 'triangle', peak: 0.1, a: 0.06, d: 0.3, vib: 4 });
      tone(t + dt + 0.32, { freq: f, type: 'triangle', peak: 0.035, a: 0.06, d: 0.3, vib: 4 });
    });
    return 1.3;
  },
  glass: t => {
    noise(t, { type: 'highpass', freq: 2500, peak: 0.5, d: 0.5 });
    for (let i = 0; i < 6; i++) tone(t + Math.random() * 0.2, { freq: 2000 + Math.random() * 3000, type: 'square', peak: 0.04, d: 0.08 });
    return 0.6;
  },
  glitch: t => { for (let i = 0; i < 10; i++) tone(t + i * 0.035, { freq: 80 + Math.random() * 1800, type: 'square', peak: 0.06, a: 0.002, d: 0.03 }); return 0.4; },
  whisper: t => { noise(t, { freq: 2600, q: 6, peak: 0.05, a: 0.1, d: 0.4 }); return 0.5; },
  laugh: t => { for (let i = 0; i < 5; i++) tone(t + i * 0.14, { freq: 320 - i * 12, type: 'triangle', peak: 0.05, a: 0.01, d: 0.09, vib: 30 }); return 0.8; },
  beep: t => { tone(t, { freq: 880, type: 'square', peak: 0.05, d: 0.06 }); return 0.1; },
  tick: t => { tone(t, { freq: 1200, type: 'square', peak: 0.025, d: 0.02 }); return 0.05; },
  ok: t => { tone(t, { freq: 523, peak: 0.12, d: 0.15 }); tone(t + 0.12, { freq: 784, peak: 0.12, d: 0.3 }); return 0.5; },
  error: t => { tone(t, { freq: 150, type: 'square', peak: 0.08, d: 0.22 }); return 0.3; },
  item: t => { tone(t, { freq: 660, to: 990, peak: 0.1, d: 0.25 }); return 0.3; },
  unlock: t => { noise(t, { freq: 3000, q: 3, peak: 0.2, d: 0.04 }); noise(t + 0.09, { freq: 2200, q: 3, peak: 0.25, d: 0.05 }); return 0.2; },
  locker: t => { noise(t, { type: 'lowpass', freq: 900, peak: 0.3, d: 0.18 }); tone(t, { freq: 180, to: 140, type: 'square', peak: 0.04, d: 0.15 }); return 0.25; },
  heart: t => { tone(t, { freq: 62, peak: 0.6, d: 0.14 }); tone(t + 0.24, { freq: 55, peak: 0.45, d: 0.16 }); return 0.5; },
  chime: t => { tone(t, { freq: 1320, peak: 0.06, a: 0.01, d: 1.0 }); tone(t, { freq: 1980, peak: 0.03, a: 0.01, d: 0.8 }); return 1; },
};

export function sfx(name) {
  if (!ctx || !SFX[name]) return 0;
  return SFX[name](ctx.currentTime + 0.02);
}

export function startLoop(name) {
  if (!ctx || loops[name]) return;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(1, t + 1);
  out.connect(master);
  const nodes = [];
  let timer = null;

  const osc = (freq, type, gain) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = gain;
    o.connect(g).connect(out); o.start(t); nodes.push(o);
  };
  const hiss = (freq, gain, type = 'lowpass') => {
    const s = noiseSource();
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(f).connect(g).connect(out); s.start(t); nodes.push(s);
  };

  if (name === 'rain') { hiss(1400, 0.14); hiss(5000, 0.02, 'highpass'); }
  else if (name === 'drone') { osc(55, 'sine', 0.05); osc(55.6, 'sine', 0.05); hiss(200, 0.04); }
  else if (name === 'chase') { osc(41, 'sawtooth', 0.025); sfx('heart'); timer = setInterval(() => sfx('heart'), 520); }

  loops[name] = { out, nodes, timer };
}

export function stopLoop(name) {
  const l = loops[name];
  if (!l) return;
  delete loops[name];
  clearInterval(l.timer);
  const t = ctx.currentTime;
  l.out.gain.cancelScheduledValues(t);
  l.out.gain.setValueAtTime(Math.max(l.out.gain.value, 0.0001), t);
  l.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  l.nodes.forEach(n => n.stop(t + 0.7));
}

export function stopAllLoops(except = []) {
  Object.keys(loops).forEach(k => { if (!except.includes(k)) stopLoop(k); });
}
