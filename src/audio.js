// 사운드: assets/sounds/manifest.json에 있는 소리는 파일로, 나머지는 Web Audio로 합성한 임시 소리로 낸다 (이슈 #114).

let ctx = null;
let master = null;
let noiseBuf = null;
let bus = null;  // sfx(name, vol, muffle) 호출 동안만 쓰는 출력 (음량·먹먹함). 평소엔 master
const loops = {};
const dest = () => bus || master;

// ── 소리 파일 (이슈 #114) ──
// manifest: { "이름": "파일" } 또는 { "이름": { "file": "파일", "vol": 0.6 } }. 이름은 SFX·배경음 이름 (docs/에셋_목록.md 「소리」)
// file을 배열로 적으면 재생할 때마다 그중 하나를 고른다 (발소리처럼 자주 나는 소리가 똑같이 들리지 않게)
// 파일 내려받기는 바로 시작하고, 디코딩은 AudioContext가 생긴 뒤(initAudio) 한다. 디코딩이 끝나기 전·실패하면 합성음
const SOUND_DIR = 'assets/sounds/';
let manifest = null;  // 이름 → { bytes: Promise<ArrayBuffer[]>, vol }
const decoding = {};  // 이름 → 디코딩 Promise (실패하면 지운다)
const files = {};     // 이름 → { bufs, vol } (디코딩 끝난 것)

fetch(SOUND_DIR + 'manifest.json')
  .then(r => (r.ok ? r.json() : {}))
  .catch(() => ({}))
  .then(list => {
    manifest = {};
    for (const [name, v] of Object.entries(list)) {
      const { file, vol = 1 } = typeof v === 'string' || Array.isArray(v) ? { file: v } : v;
      const bytes = Promise.all([].concat(file).map(f =>
        fetch(SOUND_DIR + f).then(r => { if (!r.ok) throw new Error(`${r.status} ${f}`); return r.arrayBuffer(); })));
      bytes.catch(() => {});  // 실패는 decodeFiles에서 알린다 (initAudio 전이면 처리 안 된 거부로 남지 않게)
      manifest[name] = { vol, bytes };
    }
    decodeFiles();
  });

function decodeFiles() {
  if (!ctx || !manifest) return;
  for (const [name, { bytes, vol }] of Object.entries(manifest)) {
    if (decoding[name] || files[name]) continue;
    decoding[name] = bytes
      .then(list => Promise.all(list.map(b => ctx.decodeAudioData(b))))
      .then(bufs => (files[name] = { bufs, vol }))
      .catch(e => {
        console.warn(`소리 파일을 불러오지 못해 합성음을 씁니다: ${name}`, e);
        delete decoding[name];
        return null;
      });
  }
}

function playFile(name, t, out, loop = false) {
  const { bufs, vol } = files[name];
  const s = ctx.createBufferSource();
  s.buffer = bufs[Math.floor(Math.random() * bufs.length)];
  s.loop = loop;
  const g = ctx.createGain();
  g.gain.value = vol;
  s.connect(g).connect(out);
  s.start(t);
  return s;
}

// 파일이 있으면 파일을, 없으면 합성음을 낸다. 재생 길이(초)를 반환한다
const play = (name, t) => (files[name] ? playFile(name, t, dest()).buffer.duration : SFX[name](t));

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
  decodeFiles();
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

// 계단 발소리 (이슈 #132): 걸음마다 신발 밑창 + 계단 판의 낮은 울림. freqs 순서로 높이가 바뀐다
function stairSteps(t, freqs) {
  freqs.forEach((f, i) => {
    const at = t + i * 0.22;
    noise(at, { freq: f, q: 1.5, peak: 0.09, d: 0.06 });
    tone(at, { freq: f / 4, peak: 0.06, d: 0.08 });
  });
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
  // ── 이동 효과음 (GDD 4.7, 이슈 #132) ──
  // 계단: 발소리 4걸음. 올라갈 땐 걸음마다 높게, 내려갈 땐 낮게 (화면이 어두워지는 0.6초 동안 + 조금 더)
  stairsUpNew: t => { stairSteps(t, [300, 360, 420, 490]); return 1; },
  stairsDownNew: t => { stairSteps(t, [490, 420, 360, 300]); return 1; },
  // 옥상 철문: 녹슨 경첩이 끼이익 길게 → 무겁게 쿵 + 쇠 울림
  roofDoorNew: t => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t);
    o.frequency.linearRampToValueAtTime(260, t + 0.45);
    o.frequency.linearRampToValueAtTime(180, t + 0.7);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 8;
    const g = ctx.createGain();
    env(g.gain, t, 0.08, 0.14, 0.62);
    o.connect(f).connect(g).connect(dest());
    o.start(t); o.stop(t + 0.75);
    noise(t + 0.72, { type: 'lowpass', freq: 420, peak: 0.4, d: 0.3 });
    tone(t + 0.72, { freq: 82, to: 50, peak: 0.3, d: 0.45 });
    tone(t + 0.74, { freq: 612, peak: 0.025, d: 0.9 });
    return 1.6;
  },
  // 열린 교실 문 지나가기: 미닫이 레일이 드르륵 (작게)
  doorSlideNew: t => {
    for (let i = 0; i < 9; i++) noise(t + i * 0.035, { freq: 700 + (i % 3) * 120, q: 2, peak: 0.07 - i * 0.004, d: 0.025 });
    noise(t + 0.34, { type: 'lowpass', freq: 380, peak: 0.08, d: 0.06 });
    return 0.45;
  },
  // ── 2장(2층) 장면 소리 (이슈 #132) ──
  // 켜진 PC: 낡은 본체 팬이 웅— 돌고 짧게 삑
  pcOnNew: t => {
    tone(t, { freq: 118, peak: 0.07, a: 0.3, d: 1.2, vib: 1.5 });
    tone(t, { freq: 236, peak: 0.025, a: 0.3, d: 1.0 });
    noise(t, { freq: 1400, q: 0.7, peak: 0.02, a: 0.3, d: 1.1 });
    tone(t + 0.35, { freq: 1000, type: 'square', peak: 0.04, d: 0.08 });
    return 1.5;
  },
  // 방송실 스피커: 지직거리는 잡음
  speakerHissNew: t => {
    noise(t, { freq: 3200, q: 0.6, peak: 0.05, a: 0.15, d: 1.4 });
    for (let i = 0; i < 6; i++) noise(t + 0.1 + Math.random() * 1.2, { freq: 1800 + Math.random() * 2000, q: 4, peak: 0.08, d: 0.02 });
    return 1.6;
  },
  // 테이프 재생: 데크 버튼 딸깍 → 테이프가 도는 잡음 + 낮은 모터 소리
  tapePlayNew: t => {
    noise(t, { freq: 2600, q: 3, peak: 0.18, d: 0.03 });
    noise(t + 0.05, { type: 'lowpass', freq: 500, peak: 0.12, d: 0.05 });
    noise(t + 0.15, { freq: 4200, q: 0.7, peak: 0.04, a: 0.2, d: 1.2 });
    tone(t + 0.15, { freq: 60, peak: 0.04, a: 0.2, d: 1.1, vib: 2 });
    return 1.5;
  },
  // 화장실 수도꼭지: 물방울 똑, 똑 + 타일에 울리는 잔향
  faucetNew: t => {
    [0, 0.7, 1.25].forEach((dt, i) => {
      const f = 1500 + i * 120;
      tone(t + dt, { freq: f, to: f * 0.55, peak: 0.07, a: 0.002, d: 0.1 });
      tone(t + dt + 0.09, { freq: f * 0.9, to: f * 0.5, peak: 0.02, a: 0.002, d: 0.12 });
    });
    return 1.5;
  },
  drip: t => { tone(t, { freq: 1800 + Math.random() * 600, to: 900, peak: 0.03, a: 0.002, d: 0.12 }); return 0.15; },
  // 2층 음악실 피아노: 도윤 악보의 앞 두 음 「미 솔」만 치다 멈춘다 (이슈 #131). 음량·먹먹함은 거리에 따라 sfx()로 준다
  pianoPhrase: t => {
    [[329.63, 0], [392.0, 0.75]].forEach(([f, dt]) => {
      tone(t + dt, { freq: f, type: 'triangle', peak: 0.12, a: 0.005, d: 1.4 });
      tone(t + dt, { freq: f * 2, peak: 0.025, a: 0.005, d: 0.8 });
    });
    return 2.2;
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
  // 이동·2층 장면 (이슈 #132)
  stairsUp: 'stairsUpNew',
  stairsDown: 'stairsDownNew',
  roofDoor: 'roofDoorNew',
  doorPass: 'doorSlideNew',
  pcOn: 'pcOnNew',
  speakerHiss: 'speakerHissNew',
  tapePlay: 'tapePlayNew',
  faucet: 'faucetNew',
};

// vol: 0~1 음량 배율 (0이면 재생하지 않음), muffle: 벽 너머처럼 높은 소리를 깎는다
export function sfx(name, vol = 1, muffle = false) {
  if (SITUATION[name]) name = SITUATION[name];
  if (!ctx || !(SFX[name] || files[name]) || vol <= 0) return 0;
  if (vol >= 1 && !muffle) return play(name, ctx.currentTime + 0.02);
  const g = ctx.createGain();
  g.gain.value = Math.min(1, vol);
  if (muffle) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    f.connect(g);
    bus = f;
  } else bus = g;
  g.connect(master);
  try { return play(name, ctx.currentTime + 0.02); } finally { bus = null; }
}

// ── 배경 음악 (GDD 4.7, 이슈 #118): 느린 화음 패드 + 음계 안에서 무작위로 드문드문 치는 음 ──
// 정해진 선율이 없으므로 P3 정답 멜로디가 그대로 나오지 않는다. 이름이 m_으로 시작하는 루프
const NOTE = (() => {
  const names = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  return s => {
    const [, l, acc, o] = s.match(/^([A-G])([#b]?)(\d)$/);
    const semi = names[l] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + (o - 4) * 12;
    return 440 * 2 ** (semi / 12);
  };
})();
const chords = list => list.map(c => c.split(' ').map(NOTE));
// beat: 한 박(초), 한 마디 = 4박마다 화음이 바뀐다. density: 박마다 음을 칠 확률. pad·lead: 음량
const MUSIC = {
  m_title: { beat: 1.5, density: 0.3, pad: 0.016, lead: 0.03, cut: 900,
    chords: chords(['A2 E3 C4', 'F2 C3 A3', 'C3 G3 E4', 'E2 B2 G#3']), scale: ['A4', 'C5', 'D5', 'E5', 'G5'].map(NOTE) },
  m_bedroom: { beat: 1.4, density: 0.4, pad: 0.015, lead: 0.028, cut: 1100,
    chords: chords(['D3 A3 F4', 'Bb2 F3 D4', 'F2 C3 A3', 'C3 G3 E4']), scale: ['D4', 'F4', 'G4', 'A4', 'C5'].map(NOTE) },
  m_school1f: { beat: 2.0, density: 0.18, pad: 0.014, lead: 0.022, cut: 700,
    chords: chords(['E2 B2 G3', 'C2 G2 E3', 'A2 E3 C4', 'B2 F3 D4']), scale: ['E5', 'F#5', 'G5', 'B5', 'C6'].map(NOTE) },
  m_school2f: { beat: 1.6, density: 0.28, pad: 0.014, lead: 0.026, cut: 900,
    chords: chords(['A2 E3 C4', 'D3 A3 F4', 'G2 D3 B3', 'E2 B2 G#3']), scale: ['A4', 'B4', 'C5', 'E5', 'F5'].map(NOTE) },
  m_rooftop: { beat: 1.8, density: 0.22, pad: 0.015, lead: 0.024, cut: 1000,
    chords: chords(['D3 A3 E4', 'C3 G3 D4', 'Bb2 F3 C4', 'G2 D3 A3']), scale: ['D5', 'E5', 'A5', 'C6'].map(NOTE) },
};

// 한 마디: 화음 패드(천천히 차오르고 사라짐) + 드문드문 치는 음. out에 연결한다
function musicBar(m, bar, t, out) {
  const len = m.beat * 4;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = m.cut;
  f.connect(out);
  for (const freq of m.chords[bar % m.chords.length]) {
    for (const [type, mul] of [['sine', 1], ['triangle', 1.003]]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = freq * mul;
      const g = ctx.createGain();
      // 다음 마디와 조금 겹쳐 끊김 없이 이어진다
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(m.pad, t + 1.5);
      g.gain.setValueAtTime(m.pad, t + len - 0.7);
      g.gain.linearRampToValueAtTime(0, t + len + 0.8);
      o.connect(g).connect(f);
      o.start(t); o.stop(t + len + 0.9);
    }
  }
  for (let b = 0; b < 4; b++) {
    if (Math.random() >= m.density) continue;
    const freq = m.scale[Math.floor(Math.random() * m.scale.length)];
    const s = t + b * m.beat + Math.random() * 0.15;
    for (const [type, mul, peak] of [['triangle', 1, m.lead], ['sine', 2, m.lead * 0.25]]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = freq * mul;
      const g = ctx.createGain();
      env(g.gain, s, 0.01, peak, 2.4);
      o.connect(g).connect(out);
      o.start(s); o.stop(s + 2.5);
    }
  }
}

// 지금 켜져 있는 배경음·음악 이름 (개발·확인용)
export const activeLoops = () => Object.keys(loops);

export function startLoop(name) {
  if (!ctx || loops[name]) return;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(1, t + 1);
  out.connect(master);
  const nodes = [];
  let timer = null;

  // 소리 파일이 있으면 그 파일을 끝없이 되풀이한다 (합성 배경음 대신). 디코딩 중이면 끝난 뒤 시작하고, 실패하면 합성음으로
  if (files[name] || decoding[name]) {
    loops[name] = { out, nodes, timer };
    const begin = f => {
      if (loops[name]?.out !== out) return;
      if (f) { nodes.push(playFile(name, ctx.currentTime, out, true)); return; }
      out.disconnect();
      delete loops[name];
      startLoop(name);
    };
    if (files[name]) begin(files[name]);
    else decoding[name].then(begin);
    return;
  }

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
  // 배경 음악: 1.5초 앞까지 마디를 미리 짜 둔다. 멈추면 타이머를 끄고 out을 줄여, 이미 짜 둔 음도 들리지 않는다
  else if (MUSIC[name]) {
    const m = MUSIC[name];
    let bar = 0, next = t + 0.3;
    const pump = () => {
      while (next < ctx.currentTime + 1.5) { musicBar(m, bar++, next, out); next += m.beat * 4; }
    };
    pump();
    timer = setInterval(pump, 500);
  }
  // 새 배경음 (맵의 bgmTrial): 드론·바람 위에 가끔 다른 소리가 섞인다
  else if (name === 'hall' || name === 'hall2' || name === 'roof') {
    if (name === 'roof') { hiss(500, 0.09, 'bandpass'); hiss(180, 0.06); osc(48, 'sine', 0.03); }
    else { osc(55, 'sine', 0.05); osc(55.6, 'sine', 0.05); hiss(200, 0.04); }
    // 2층 피아노는 배경음이 아니라 거리에 따라 Explore가 친다 (pianoPhrase)
    const extra = { hall: ['drip', 'drip', 'creak'], hall2: ['drip'], roof: ['gust'] }[name];
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

// 배경 음악만 멈춘다 (컷신: 환경음은 이어 가고 음악은 끊는다)
export function stopMusic() {
  Object.keys(loops).forEach(k => { if (MUSIC[k]) stopLoop(k); });
}
