// 사물함에 숨었을 때 그림자가 바로 앞까지 오면 열리는 미니게임 (GDD 4.6)
// holdBreath: 2번째 추격 — 숨 참기(심장 박동 리듬) / struggle: 3번째 추격 — 문 붙잡기 (Pressure의 Pandemonium 참고)
// 둘 다 Promise<boolean>: true = 버텨 냄, false = 붙잡힘
import { W, H } from '../constants.js';
import { textStyle } from './ui.js';
import { sfx } from '../audio.js';

const DEPTH = 92; // 사물함 1인칭 시점(90) 위

// ── 숨 참기: 심장 박동 리듬 (House of Ashes·Songs of Horror 참고) ──
// 쫓기는 박자가 아니라 숨을 죽이며 진정하는 박자: 박동 사이 간격(ms)이 점점 길어진다 (간격 5개 → 6박).
// 3번째 사이만 살짝 당겨진다 — 그림자가 냄새를 맡아 심장이 한 번 철렁. 박동 사이에 숨 돌릴 틈이 충분하도록 아주 느리게
const BEATS = [2600, 2800, 2400, 3000, 3400];
const BREATH = {
  leadIn: 2400,               // 첫 박동까지 (고리가 줄어드는 걸 한 번 보고 시작)
  approach: 2200,             // 고리가 줄어들기 시작해 심장에 닿기까지 — 박 간격보다 짧아 고리는 대개 하나씩만 보인다
  good: 150, ok: 260,         // 판정 범위(ms): 좋음 / 아슬
  okNoise: 0.08,              // 아슬 — 숨이 조금 샌다
  missNoise: 0.25,            // 놓침
  strayNoise: 0.15,           // 박동과 상관없이 눌렀을 때
  sniff: 2,                   // 이 박동 번호(0부터) 앞뒤로 그림자가 냄새를 맡는다 — 연출만
  heartR: 20, ringR: 96,      // 심장 반지름, 고리가 줄어들기 시작하는 반지름
};

// ── 문 붙잡기 ──
const STRUGGLE = {
  start: 0.3,                 // 게이지 시작값 (0이면 붙잡힘, 1이면 성공)
  up: 0.4, down: 0.15,        // 원 안 / 밖일 때 초당 변화
  grace: 1000,                // 시작 직후 게이지가 줄지 않는 시간 — 커서를 원으로 옮길 여유
  radius: 28,                 // 가운데 원 반지름(px)
  shake: 6,                   // 화면 전체 상시 흔들림(px)
  tremor: 13,                 // 커서 상시 떨림(px) — 화면과 따로, 원 기준으로 흔들린다
  drift: 38,                  // 커서가 저절로 미끄러지는 속도(px/초). 방향이 계속 바뀐다
  turn: 2.2,                  // 미끄러지는 방향이 바뀌는 정도
  joltEvery: [1100, 2000],    // 크게 튀는 간격
  jolt: [70, 130],            // 크게 튈 때 커서가 밀려나는 거리
  joltCam: 0.02,              // 크게 튈 때 카메라 흔들림 세기
  maxOff: 170,                // 커서 밀림의 최대치 (실제 마우스가 캔버스 밖으로 나가지 않을 만큼)
};

const rand = (a, b) => a + Math.random() * (b - a);

// 화면 아래쪽 게이지 하나 (라벨 + 바)
function gauge(scene, y, label, color) {
  const w = 220, x = W / 2 - w / 2;
  const back = scene.add.rectangle(x, y, w, 10, 0x000000, 0.6).setOrigin(0, 0.5).setStrokeStyle(1, 0x6f6878);
  const bar = scene.add.rectangle(x + 1, y, w - 2, 8, color).setOrigin(0, 0.5);
  const txt = scene.add.text(x - 10, y, label, textStyle(12, '#c9c0d2')).setOrigin(1, 0.5);
  return { parts: [back, bar, txt], set: v => { bar.width = Math.max(0, (w - 2) * Math.min(1, v)); } };
}

// 매 프레임 콜백을 붙였다 떼는 도우미. step(dt)가 true/false를 돌려주면 끝난다
function loop(scene, step) {
  return new Promise(resolve => {
    const fn = (t, dt) => {
      const r = step(Math.min(dt, 50));
      if (r === true || r === false) { scene.events.off('update', fn); resolve(r); }
    };
    scene.events.on('update', fn);
    scene.events.once('shutdown', () => { scene.events.off('update', fn); resolve(false); });
  });
}

export async function holdBreath(scene) {
  const B = BREATH;
  const cx = W / 2, cy = 214;
  const space = scene.input.keyboard.addKey('SPACE');
  const title = scene.add.text(cx, 44, '숨을 죽여라', textStyle(22, '#e8dff0', { fontStyle: 'bold' })).setOrigin(0.5);
  const help = scene.add.text(cx, 74, '고리가 심장에 겹치는 순간 Space — 천천히, 박동에 맞춰 진정하기', textStyle(12, '#a8a1b0')).setOrigin(0.5);
  const sniffTxt = scene.add.text(cx, 116, '……킁', textStyle(16, '#ff5a5a')).setOrigin(0.5).setAlpha(0);
  const red = scene.add.rectangle(0, 0, W, H, 0x5a0000, 0).setOrigin(0);
  const g = scene.add.graphics();
  const judge = scene.add.text(cx, cy + 50, '', textStyle(14, '#e8dff0', { fontStyle: 'bold' })).setOrigin(0.5);
  const hold = gauge(scene, H - 92, '진정', 0x9fc4e8);
  const noise = gauge(scene, H - 72, '소리', 0xd04040);
  const ui = scene.add.container(0, 0, [red, title, help, sniffTxt, g, judge, ...hold.parts, ...noise.parts]).setScrollFactor(0).setDepth(DEPTH);

  // 박동 시각(ms): 첫 박동 + BEATS의 간격들 → BEATS.length + 1박
  const beats = [{ at: B.leadIn }];
  for (const gap of BEATS) beats.push({ at: beats[beats.length - 1].at + gap });
  for (const b of beats) Object.assign(b, { res: null, sounded: false });
  let t = 0, loud = 0, flash = 0, pulse = 0;
  const show = (txt, color) => {
    judge.setText(txt).setColor(color).setAlpha(1).setScale(1.15);
    scene.tweens.killTweensOf(judge);
    scene.tweens.add({ targets: judge, alpha: 0, scale: 1, delay: 300, duration: 500 });
  };
  const mark = (b, res) => {
    b.res = res;
    if (res === 'good') show('좋음', '#bfe3ff');
    else if (res === 'ok') { loud += B.okNoise; show('아슬', '#ffe2a0'); }
    else { loud += B.missNoise; flash = 1; show('놓침', '#ff6a6a'); sfx('breath', 1); scene.cameras.main.shake(160, 0.005); }
  };
  const onKey = () => {
    // 가장 가까운 아직 판정 안 된 박동
    const b = beats.filter(b => !b.res).sort((p, q) => Math.abs(p.at - t) - Math.abs(q.at - t))[0];
    const d = b ? Math.abs(b.at - t) : Infinity;
    if (d <= B.good) mark(b, 'good');
    else if (d <= B.ok) mark(b, 'ok');
    else if (d <= 450) mark(b, 'miss');
    else { loud += B.strayNoise; flash = 0.7; show('헉', '#ff6a6a'); sfx('breath', 0.7); }
  };
  space.on('down', onKey);

  const result = await loop(scene, dt => {
    t += dt;
    let calm = beats.filter(b => b.res).length / beats.length; // 0 → 1: 진정될수록 박동·떨림이 잦아든다
    for (const b of beats) {
      if (!b.sounded && t >= b.at) { b.sounded = true; sfx('heart', 0.9 - 0.5 * calm); pulse = 1; }
      if (!b.res && t > b.at + B.ok) mark(b, 'miss'); // 누르지 않고 지나감
    }
    // 놓친 박동을 처리한 뒤에 "다음 박동"을 정한다
    const i = beats.findIndex(b => !b.res);
    calm = beats.filter(b => b.res).length / beats.length;
    const sniffing = i === B.sniff || i === B.sniff + 1;
    flash = Math.max(0, flash - dt / 500);
    pulse = Math.max(0, pulse - dt / 260);

    g.clear();
    // 큰 고리가 천천히 줄어들어 심장에 겹친다. 겹치는 순간(좋음 범위)엔 하얗게
    for (const b of beats) {
      if (b.res) continue;
      const k = (b.at - t) / B.approach; // 1 → 0 이면 심장에 닿는다
      if (k > 1 || k < -0.2) continue;
      const r = B.heartR + Math.max(0, k) * (B.ringR - B.heartR);
      g.lineStyle(3, Math.abs(b.at - t) <= B.good ? 0xffffff : 0x9fc4e8, Math.min(1, 1.5 - k));
      g.strokeCircle(cx, cy, r);
    }
    // 심장: 박동마다 뛰되, 진정될수록 작게 뛴다
    const hr = B.heartR * (1 + (0.25 - 0.15 * calm) * pulse);
    g.fillStyle(0x8a1c24, 1).fillCircle(cx - hr * 0.42, cy - hr * 0.2, hr * 0.62).fillCircle(cx + hr * 0.42, cy - hr * 0.2, hr * 0.62);
    g.fillTriangle(cx - hr * 1.0, cy - hr * 0.05, cx + hr * 1.0, cy - hr * 0.05, cx, cy + hr * 0.95);
    // 겹칠 자리 표시: 심장 둘레의 옅은 원
    g.lineStyle(2, 0xe8dff0, 0.4).strokeCircle(cx, cy, B.heartR + 2);
    hold.set(calm);
    noise.set(loud);
    sniffTxt.setAlpha(sniffing ? 0.5 + 0.3 * Math.sin(t / 160) : 0);
    red.fillAlpha = 0.22 * flash + (sniffing ? 0.06 : 0) + (1 - calm) * 0.06 + loud * 0.1;
    scene.debugHide = { t: Math.round(t), next: i >= 0 ? Math.round(beats[i].at - t) : null, judged: beats.filter(b => b.res).length, hit: beats.filter(b => b.res && b.res !== 'miss').length, loud: +loud.toFixed(2) }; // ?debug 자동 테스트용
    if (loud >= 1) return false;
    if (i < 0) return true;
  });
  space.off('down', onKey);
  scene.input.keyboard.removeKey(space);
  ui.destroy();
  delete scene.debugHide;
  return result;
}

export async function struggle(scene) {
  const S = STRUGGLE;
  const cam = scene.cameras.main;
  const canvas = scene.game.canvas;
  const cx = W / 2, cy = H / 2;
  const ptr = scene.input.activePointer;

  const title = scene.add.text(cx, 44, '문을 붙잡아라!', textStyle(22, '#ffd0d0', { fontStyle: 'bold' })).setOrigin(0.5);
  const help = scene.add.text(cx, 74, '마우스로 커서를 가운데 원 안에 붙잡아 두기 — 밖으로 나가면 게이지가 닳는다', textStyle(12, '#a8a1b0')).setOrigin(0.5);
  const ring = scene.add.graphics();
  const bar = gauge(scene, H - 82, '버티기', 0xe0c070);
  // 원·글자·게이지는 화면(사물함 시점)과 함께 흔들린다
  const ui = scene.add.container(0, 0, [title, help, ring, ...bar.parts]).setScrollFactor(0).setDepth(DEPTH);
  // 커서는 화면 흔들림과 따로 논다 — 원 기준으로 계속 떨리고 미끄러진다
  const cursor = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 1);
  cursor.lineStyle(2, 0xffffff, 1).lineBetween(-7, 0, 7, 0).lineBetween(0, -7, 0, 7);
  cursor.fillStyle(0xff4040, 1).fillCircle(0, 0, 2);
  canvas.style.cursor = 'none';
  sfx('slam');
  cam.shake(300, S.joltCam);

  // 커서 = 실제 마우스 + 밀림(off: 저절로 미끄러짐 + 크게 튈 때 쌓임) + 떨림
  const off = { x: 0, y: 0 }; // 처음엔 실제 마우스 자리에서 시작한다
  const ph = Array.from({ length: 10 }, () => rand(0, 6));
  let heading = rand(0, Math.PI * 2);
  let t = 0, v = S.start, nextJolt = rand(...S.joltEvery);
  const result = await loop(scene, dt => {
    t += dt;
    const s = t / 1000, k = dt / 1000;
    // 화면 전체가 떨린다 (사물함 시점 + 원·게이지)
    const scx = S.shake * (Math.sin(s * 43 + ph[0]) * 0.6 + Math.sin(s * 71 + ph[1]) * 0.4);
    const scy = S.shake * (Math.sin(s * 37 + ph[2]) * 0.6 + Math.sin(s * 89 + ph[3]) * 0.4);
    ui.setPosition(scx, scy);
    if (scene.lockerView) scene.lockerView.root.setPosition(scx, scy);
    // 커서 떨림: 느린 흔들림 + 잔떨림
    const trx = S.tremor * (Math.sin(s * 5.3 + ph[4]) * 0.55 + Math.sin(s * 9.1 + ph[5]) * 0.3 + Math.sin(s * 23 + ph[6]) * 0.15);
    const try_ = S.tremor * (Math.sin(s * 4.7 + ph[7]) * 0.55 + Math.sin(s * 8.3 + ph[8]) * 0.3 + Math.sin(s * 19 + ph[9]) * 0.15);
    // 저절로 미끄러짐: 방향이 계속 바뀌어 가만히 두면 원 밖으로 흘러 나간다
    heading += rand(-S.turn, S.turn) * k * 3;
    off.x += Math.cos(heading) * S.drift * k;
    off.y += Math.sin(heading) * S.drift * k;
    nextJolt -= dt;
    if (nextJolt <= 0) {
      nextJolt = rand(...S.joltEvery);
      const a = rand(0, Math.PI * 2), d = rand(...S.jolt);
      off.x += Math.cos(a) * d; off.y += Math.sin(a) * d;
      cam.shake(220, S.joltCam);
      sfx('thud', 1);
    }
    const len = Math.hypot(off.x, off.y);
    if (len > S.maxOff) { off.x *= S.maxOff / len; off.y *= S.maxOff / len; }
    // 화면에 보이는 커서와 원의 위치로 판정한다
    const px = ptr.x + off.x + trx, py = ptr.y + off.y + try_;
    const rx = cx + scx, ry = cy + scy;
    const inside = Math.hypot(px - rx, py - ry) <= S.radius;
    const draining = !inside && t > S.grace;
    if (inside) v += S.up * k;
    else if (draining) v -= S.down * k;
    cursor.setPosition(px, py);
    ring.clear().lineStyle(3, inside ? 0xffffff : 0xff4a4a, 1).strokeCircle(cx, cy, S.radius);
    ring.fillStyle(inside ? 0xffffff : 0xff4a4a, 0.12).fillCircle(cx, cy, S.radius);
    bar.set(v);
    bar.parts[1].setFillStyle(draining && Math.floor(t / 120) % 2 ? 0xff4a4a : 0xe0c070); // 닳는 동안 붉게 깜빡인다
    // ?debug 자동 테스트용: aim = 커서를 원 한가운데에 두려면 실제 마우스가 있어야 할 자리
    scene.debugStruggle = { aim: { x: rx - off.x - trx, y: ry - off.y - try_ }, v: +v.toFixed(2), inside };
    if (v >= 1) return true;
    if (v <= 0) return false;
  });
  canvas.style.cursor = '';
  if (scene.lockerView) scene.lockerView.root.setPosition(0, 0);
  ui.destroy();
  cursor.destroy();
  delete scene.debugStruggle;
  return result;
}

// 눈을 질끈 감았다 뜬다: 위아래 눈꺼풀이 닫혀 암전 → whileShut() → 다시 뜬다
export async function eyesShut(scene, whileShut) {
  const half = H / 2 + 4;
  const top = scene.add.rectangle(0, -half, W, half, 0x000000).setOrigin(0);
  const bottom = scene.add.rectangle(0, H, W, half, 0x000000).setOrigin(0);
  const lids = scene.add.container(0, 0, [top, bottom]).setScrollFactor(0).setDepth(97);
  const tween = cfg => new Promise(r => scene.tweens.add({ ...cfg, onComplete: r }));
  const wait = ms => new Promise(r => scene.time.delayedCall(ms, r));
  await Promise.all([
    tween({ targets: top, y: 0, duration: 260, ease: 'Quad.easeIn' }),
    tween({ targets: bottom, y: H - half, duration: 260, ease: 'Quad.easeIn' }),
  ]);
  scene.cameras.main.shake(120, 0.004);
  await wait(500); sfx('heart', 0.8);
  await wait(900); sfx('heart', 0.5);
  await whileShut?.();
  await wait(900);
  // 천천히, 조심스럽게 뜬다
  await Promise.all([
    tween({ targets: top, y: -half, duration: 900, ease: 'Sine.easeOut' }),
    tween({ targets: bottom, y: H, duration: 900, ease: 'Sine.easeOut' }),
  ]);
  lids.destroy();
}
