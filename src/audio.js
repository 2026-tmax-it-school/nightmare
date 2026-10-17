// 임시 사운드: Web Audio로 합성한다. 무료 효과음이 정해지면 파일 재생으로 교체.

let ctx = null;
let master = null;
let noiseBuf = null;
let bus = null;  // sfx(name, vol, muffle) 호출 동안만 쓰는 출력 (음량·먹먹함). 평소엔 master
const loops = {};
const dest = () => bus || master;

// 전체 볼륨 (0~1). 기억 노트의 설정 탭에서 바꾸고, 브라우저에 기억해 둔다.
const VOLUME_KEY = 'ithope_volume';
let volume = (() => {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY));
    return Number.isNaN(v) ? 0.7 : Math.min(1, Math.max(0, v));
  } catch { return 0.7; }
})();

export const getVolume = () => volume;

export function setVolume(v) {
  volume = Math.round(Math.min(1, Math.max(0, v)) * 10) / 10;
  if (master) master.gain.setValueAtTime(volume, ctx.currentTime);
  try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch {}
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
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
  s.connect(f).connect(g).connect(dest());
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
  o.connect(g).connect(dest());
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
  // 죄책감 환청: 닫힌 문을 손톱으로 긁는 소리 / 귀에 바짝 붙어 웅얼거리는 목소리
  scratch: t => {
    for (let i = 0; i < 7; i++) noise(t + i * 0.12 + Math.random() * 0.04, { freq: 1600 + Math.random() * 1600, q: 9, peak: 0.06, a: 0.01, d: 0.09 });
    return 0.95;
  },
  murmur: t => {
    for (let i = 0; i < 4; i++) {
      noise(t + i * 0.22, { freq: 900 + Math.random() * 500, q: 5, peak: 0.05, a: 0.04, d: 0.18 });
      tone(t + i * 0.22, { freq: 150 + Math.random() * 40, type: 'triangle', peak: 0.035, a: 0.03, d: 0.17, vib: 12 });
    }
    return 1;
  },
  laugh: t => { for (let i = 0; i < 5; i++) tone(t + i * 0.14, { freq: 320 - i * 12, type: 'triangle', peak: 0.05, a: 0.01, d: 0.09, vib: 30 }); return 0.8; },
  beep: t => { tone(t, { freq: 880, type: 'square', peak: 0.05, d: 0.06 }); return 0.1; },
  tick: t => { tone(t, { freq: 1200, type: 'square', peak: 0.025, d: 0.02 }); return 0.05; },
  ok: t => { tone(t, { freq: 523, peak: 0.12, d: 0.15 }); tone(t + 0.12, { freq: 784, peak: 0.12, d: 0.3 }); return 0.5; },
  error: t => { tone(t, { freq: 150, type: 'square', peak: 0.08, d: 0.22 }); return 0.3; },
  item: t => { tone(t, { freq: 660, to: 990, peak: 0.1, d: 0.25 }); return 0.3; },
  unlock: t => { noise(t, { freq: 3000, q: 3, peak: 0.2, d: 0.04 }); noise(t + 0.09, { freq: 2200, q: 3, peak: 0.25, d: 0.05 }); return 0.2; },
  locker: t => { noise(t, { type: 'lowpass', freq: 900, peak: 0.3, d: 0.18 }); tone(t, { freq: 180, to: 140, type: 'square', peak: 0.04, d: 0.15 }); return 0.25; },
  heart: t => { tone(t, { freq: 62, peak: 0.6, d: 0.14 }); tone(t + 0.24, { freq: 55, peak: 0.45, d: 0.16 }); return 0.5; },
  // 그림자: 무겁게 디디고 끌리는 발소리 / 들이쉬고 길게 내쉬는 거친 숨 + 낮은 울음
  shadowStep: t => {
    noise(t, { type: 'lowpass', freq: 170, q: 0.8, peak: 0.5, d: 0.16 });
    tone(t, { freq: 60, to: 38, peak: 0.3, d: 0.14 });
    noise(t + 0.06, { freq: 650, q: 2.5, peak: 0.07, a: 0.02, d: 0.14 });
    return 0.22;
  },
  breath: t => {
    noise(t, { freq: 1100, q: 1.2, peak: 0.1, a: 0.3, d: 0.2 });
    noise(t + 0.55, { freq: 480, q: 1.4, peak: 0.16, a: 0.06, d: 0.5 });
    tone(t + 0.55, { freq: 92, to: 74, type: 'sawtooth', peak: 0.02, a: 0.08, d: 0.45, vib: 3 });
    return 1.1;
  },
  // 맵 기믹: 책상을 바닥에 끄는 소리
  deskDrag: t => {
    noise(t, { freq: 320, q: 2.5, peak: 0.22, a: 0.03, d: 0.22 });
    noise(t + 0.04, { freq: 1400, q: 6, peak: 0.05, a: 0.02, d: 0.18 });
    return 0.3;
  },
  // 쌓아 둔 의자가 와르르 무너지는 소리 (책상 밀기 함정)
  chairsFall: t => {
    noise(t, { type: 'lowpass', freq: 600, q: 0.7, peak: 0.8, d: 0.5 });
    for (let i = 0; i < 9; i++) {
      const s = t + 0.05 + i * 0.09 + Math.random() * 0.05;
      noise(s, { freq: 900 + Math.random() * 1600, q: 3, peak: 0.25 - i * 0.02, d: 0.06 });
      tone(s, { freq: 300 + Math.random() * 500, type: 'square', peak: 0.03, d: 0.05 });
    }
    noise(t + 0.95, { type: 'lowpass', freq: 300, peak: 0.4, d: 0.3 });
    return 1.3;
  },
  // ── 새 소리 (SITUATION 참고) ──
  // 아이템: 손에 쥐는 바스락 + 낮은 두 음
  itemNew: t => {
    noise(t, { freq: 2400, q: 1.5, peak: 0.08, d: 0.12 });
    tone(t + 0.04, { freq: 392, type: 'triangle', peak: 0.1, d: 0.2 });
    tone(t + 0.16, { freq: 523, type: 'triangle', peak: 0.1, d: 0.35 });
    return 0.55;
  },
  // 단서: 종이 넘기는 소리 + 불길하게 내려가는 두 음
  clueNew: t => {
    noise(t, { freq: 3200, q: 0.8, peak: 0.07, a: 0.02, d: 0.18 });
    noise(t + 0.12, { freq: 2600, q: 0.8, peak: 0.05, a: 0.02, d: 0.14 });
    tone(t + 0.1, { freq: 659, peak: 0.07, d: 0.4 });
    tone(t + 0.32, { freq: 622, peak: 0.07, d: 0.6, vib: 4 });
    return 0.95;
  },
  // 문 열림: 자물쇠 딸깍 + 경첩 삐걱
  doorOpenNew: t => {
    noise(t, { freq: 3000, q: 3, peak: 0.2, d: 0.04 });
    noise(t + 0.08, { freq: 2200, q: 3, peak: 0.22, d: 0.05 });
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t + 0.2);
    o.frequency.linearRampToValueAtTime(190, t + 0.9);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 7;
    const g = ctx.createGain();
    env(g.gain, t + 0.2, 0.1, 0.18, 0.7);
    o.connect(f).connect(g).connect(dest());
    o.start(t + 0.2); o.stop(t + 1.05);
    return 1.05;
  },
  // 잠긴 문: 손잡이를 두어 번 덜컹
  doorLockedNew: t => {
    for (let i = 0; i < 3; i++) {
      noise(t + i * 0.13, { type: 'lowpass', freq: 600, peak: 0.28 - i * 0.05, d: 0.07 });
      noise(t + i * 0.13 + 0.02, { freq: 2600, q: 4, peak: 0.06, d: 0.03 });
    }
    return 0.45;
  },
  // 문 닫힘: 무겁게 쾅 + 울림
  doorShutNew: t => {
    noise(t, { type: 'lowpass', freq: 500, peak: 0.6, d: 0.35 });
    tone(t, { freq: 90, to: 45, peak: 0.5, d: 0.5 });
    noise(t + 0.05, { type: 'bandpass', freq: 300, q: 2, peak: 0.1, a: 0.05, d: 1.2 });
    return 1.3;
  },
  // 잡힘: 쾅 + 귀를 찢는 높은 울림
  caughtNew: t => {
    SFX.slam(t);
    tone(t, { freq: 1900, to: 1500, type: 'sawtooth', peak: 0.05, a: 0.01, d: 0.9, vib: 40 });
    noise(t, { type: 'highpass', freq: 4000, peak: 0.12, a: 0.01, d: 0.6 });
    return 1;
  },
  // 따돌림(숨기 성공): 멀어지는 발소리 끝에 긴 한숨
  escapeNew: t => {
    for (let i = 0; i < 3; i++) noise(t + i * 0.35, { type: 'lowpass', freq: 200, peak: 0.12 - i * 0.03, d: 0.12 });
    noise(t + 1.2, { freq: 700, q: 1, peak: 0.1, a: 0.15, d: 0.9 });
    return 2.3;
  },
  // 배경음 속 가끔 섞이는 소리
  drip: t => { tone(t, { freq: 1800 + Math.random() * 600, to: 900, peak: 0.03, a: 0.002, d: 0.12 }); return 0.15; },
  farPiano: t => {
    const f = [196, 220, 247, 262, 294][Math.floor(Math.random() * 5)];
    tone(t, { freq: f, type: 'triangle', peak: 0.03, a: 0.01, d: 1.6 });
    tone(t, { freq: f * 1.01, peak: 0.01, a: 0.01, d: 1.4 });
    return 1.6;
  },
  gust: t => { noise(t, { freq: 450, q: 0.8, peak: 0.12, a: 1.2, d: 1.6 }); return 2.8; },
  chime: t => { tone(t, { freq: 1320, peak: 0.06, a: 0.01, d: 1.0 }); tone(t, { freq: 1980, peak: 0.03, a: 0.01, d: 0.8 }); return 1; },
  alarm: t => { for (let i = 0; i < 6; i++) tone(t + i * 0.3, { freq: i % 2 ? 740 : 980, type: 'square', peak: 0.06, a: 0.01, d: 0.26 }); return 1.8; },
  // 칸막이 문을 두드리는 소리 한 번 (2층 화장실 노크)
  knock: t => { noise(t, { type: 'lowpass', freq: 520, q: 1.2, peak: 0.5, d: 0.08 }); tone(t, { freq: 140, to: 90, peak: 0.25, d: 0.09 }); return 0.15; },
  bang: t => {
    for (let i = 0; i < 4; i++) noise(t + i * 0.32, { type: 'lowpass', freq: 300, peak: 0.55, d: 0.16 });
    for (let i = 0; i < 6; i++) noise(t + 1.6 + i * 0.22, { freq: 520, q: 2, peak: 0.3 - i * 0.045, d: 0.07 });
    return 3;
  },
};

// 피아노 건반 (1=도 … 7=시)
const NOTE_HZ = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88];
export function playNote(n) {
  if (!ctx || !NOTE_HZ[n - 1]) return;
  const t = ctx.currentTime + 0.01;
  tone(t, { freq: NOTE_HZ[n - 1], type: 'triangle', peak: 0.16, a: 0.005, d: 0.7 });
  tone(t, { freq: NOTE_HZ[n - 1] * 2, peak: 0.03, a: 0.005, d: 0.4 });
}

// 새 소리 (이슈 #66): 상황 이름 → 재생할 소리
const SITUATION = {
  itemGet: 'itemNew',
  clueGet: 'clueNew',
  doorOpen: 'doorOpenNew',
  doorLocked: 'doorLockedNew',
  doorClose: 'doorShutNew',
  caught: 'caughtNew',
  escape: 'escapeNew',
};

// vol: 0~1 음량 배율 (0이면 재생하지 않음), muffle: 벽 너머처럼 높은 소리를 깎는다
export function sfx(name, vol = 1, muffle = false) {
  if (SITUATION[name]) name = SITUATION[name];
  if (!ctx || !SFX[name] || vol <= 0) return 0;
  if (vol >= 1 && !muffle) return SFX[name](ctx.currentTime + 0.02);
  const g = ctx.createGain();
  g.gain.value = Math.min(1, vol);
  if (muffle) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    f.connect(g);
    bus = f;
  } else bus = g;
  g.connect(master);
  try { return SFX[name](ctx.currentTime + 0.02); } finally { bus = null; }
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
  else if (name === 'wind') { hiss(500, 0.09, 'bandpass'); hiss(180, 0.06); osc(48, 'sine', 0.03); }
  else if (name === 'chase') { osc(41, 'sawtooth', 0.025); sfx('heart'); timer = setInterval(() => sfx('heart'), 520); }
  // 새 배경음 (맵의 bgmTrial): 드론·바람 위에 가끔 다른 소리가 섞인다
  else if (name === 'hall' || name === 'hall2' || name === 'roof') {
    if (name === 'roof') { hiss(500, 0.09, 'bandpass'); hiss(180, 0.06); osc(48, 'sine', 0.03); }
    else { osc(55, 'sine', 0.05); osc(55.6, 'sine', 0.05); hiss(200, 0.04); }
    const extra = { hall: ['drip', 'drip', 'creak'], hall2: ['farPiano', 'drip'], roof: ['gust'] }[name];
    const next = () => {
      timer = setTimeout(() => {
        if (loops[name]?.out !== out) return;
        const pick = extra[Math.floor(Math.random() * extra.length)];
        // creak은 원래 크게 나는 소리라 배경에서는 줄인다
        sfx(pick, pick === 'creak' ? 0.25 : 1);
        next();
        loops[name].timer = timer;
      }, 4000 + Math.random() * 6000);
    };
    next();
  }

  loops[name] = { out, nodes, timer };
}

export function stopLoop(name) {
  const l = loops[name];
  if (!l) return;
  delete loops[name];
  clearInterval(l.timer);
  clearTimeout(l.timer);
  const t = ctx.currentTime;
  l.out.gain.cancelScheduledValues(t);
  l.out.gain.setValueAtTime(Math.max(l.out.gain.value, 0.0001), t);
  l.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  l.nodes.forEach(n => n.stop(t + 0.7));
}

export function stopAllLoops(except = []) {
  Object.keys(loops).forEach(k => { if (!except.includes(k)) stopLoop(k); });
}
