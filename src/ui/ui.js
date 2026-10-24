// 화면 고정 UI: 대화창, 선택지, 알림, 연출, 퍼즐, 추리, 기억 노트
import { W, H, FONT } from '../constants.js';
import { DB } from '../db.js';
import { state, addDenial, checkCond } from '../state.js';
import { sfx, playNote, getVolume, setVolume } from '../audio.js';

// pixelArt 캔버스가 창 크기에 맞춰 최근접 필터로 확대되면, 해상도가 낮은 작은 글자는
// 가는 획이 샘플링에서 통째로 빠져 다른 글자처럼 깨져 보인다 → 텍스트를 더 높은 해상도로 미리 그려 둔다
export const textStyle = (size = 15, color = '#e8e2d6', extra = {}) => ({
  fontFamily: FONT, fontSize: `${size}px`, color, lineSpacing: 6, resolution: 3, ...extra,
});

// 타이틀·게임오버·엔딩 화면 배경: 컷신 CG를 어둡게 깔아 글자가 읽히게 한다. CG가 없으면 아무것도 깔지 않는다
export function cgBackdrop(scene, name, dim = 0.5, tint = 0x000000) {
  const key = 'cg_' + name;
  if (!scene.textures.exists(key)) return;
  scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(W, H).setDepth(-2);
  scene.add.rectangle(0, 0, W, H, tint, dim).setOrigin(0).setDepth(-1);
}

const CONFIRM = ['KeyE', 'Space', 'Enter', 'NumpadEnter'];
const DIR_KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
export const isConfirm = e => CONFIRM.includes(e.code) && !e.repeat;
export const dirOf = e => DIR_KEYS[e.code];

const blankText = (b, v = '＿＿＿') => b.text.replace('{}', v);
const tweenP = (scene, cfg) => new Promise(r => scene.tweens.add({ ...cfg, onComplete: r }));

export class UI {
  constructor(scene) {
    this.s = scene;
    this.toasts = [];
    this.covers = 0;      // 화면 전체를 덮는 창(퍼즐·추리·기억 노트)이 열려 있는 수
    this.hudOff = false;  // 사물함 안처럼 장면이 직접 목표 패널을 끈 상태
    this.dlgTop = false;  // 대화창을 화면 위쪽에 띄운 상태 (오른쪽 위 목표 패널과 겹친다)
  }

  fixed(obj, depth = 100) { return obj.setScrollFactor(0).setDepth(depth); }

  // 목표 패널·알림은 덮는 창 뒤로 글자가 비치거나 위쪽 대화창과 겹치지 않게 그동안 숨긴다
  syncHud() {
    const on = !this.covers && !this.hudOff && !this.dlgTop;
    this.obj?.c.setVisible(on);
    for (const t of this.toasts) t.setVisible(on);
  }

  async covered(fn) {
    this.covers++;
    this.syncHud();
    try { return await fn(); } finally { this.covers--; this.syncHud(); }
  }

  // 목표 패널이 플레이어나 바로 앞 조사 대상을 가리면 흐리게 한다. rects: 화면 좌표 [{x0, y0, x1, y1}]
  fadeHudOver(rects) {
    const o = this.obj;
    if (!o || !o.c.visible) return;
    const PW = 250, M = 6;
    const px0 = W - 14 - PW - M, px1 = W - 14 + M, py0 = 12 - M, py1 = o.bottom + M;
    const hit = rects.some(r => r && r.x1 > px0 && r.x0 < px1 && r.y1 > py0 && r.y0 < py1);
    const want = hit ? 0.18 : 1;
    if (o.fadeTo === want) return;
    o.fadeTo = want;
    this.s.tweens.killTweensOf(o.c);
    this.s.tweens.add({ targets: o.c, alpha: want, duration: 180 });
  }
  wait(ms) { return new Promise(r => this.s.time.delayedCall(ms, r)); }

  // 다음 프레임부터 키 입력을 받는다 (현재 눌린 키가 바로 전달되지 않도록)
  listen(handler) {
    const kb = this.s.input.keyboard;
    let active = true;
    const fn = e => { if (active) handler(e); };
    const timer = this.s.time.delayedCall(1, () => kb.on('keydown', fn));
    return () => { active = false; timer.remove(false); kb.off('keydown', fn); };
  }

  waitConfirm() {
    return new Promise(res => { const off = this.listen(e => { if (isConfirm(e)) { off(); res(); } }); });
  }

  // ── 대화창 ──
  ensureDialog() {
    if (this.dlg) return this.dlg;
    const c = this.fixed(this.s.add.container(20, H - 128), 120);
    // 1px 테두리는 픽셀 경계에 반씩 걸쳐 왼쪽 선이 통째로 빠진다 → 2px
    const bg = this.s.add.rectangle(0, 0, W - 40, 112, 0x0a0a0f, 0.9).setOrigin(0).setStrokeStyle(2, 0x5d5a66);
    const name = this.s.add.text(16, 10, '', textStyle(14, '#c9a46a'));
    const body = this.s.add.text(16, 34, '', textStyle(15, '#e8e2d6', { wordWrap: { width: W - 80, useAdvancedWrap: true } }));
    const arrow = this.s.add.text(W - 66, 86, '▼', textStyle(14, '#c9c2d0'));
    c.add([bg, name, body, arrow]);
    this.dlg = { c, name, body, arrow, blink: null };
    return this.dlg;
  }

  say(who, text) {
    const d = this.ensureDialog();
    // 플레이어가 화면 아래쪽(대화창 자리)에 있으면 대화창을 위로 올려 가리지 않게 한다 (쯔꾸르식)
    const p = this.s.playerScreenBox?.();
    this.dlgTop = !!p && p.y1 > H - 128 - 4;
    d.c.setY(this.dlgTop ? 16 : H - 128);
    this.syncHud();
    d.c.setVisible(true);
    d.name.setText(who || '');
    d.body.setColor(who ? '#e8e2d6' : '#bdb6aa').setY(who ? 34 : 24).setText('');
    d.arrow.setVisible(false);
    const chars = [...text];
    return new Promise(resolve => {
      let i = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        tick.remove();
        d.body.setText(text);
        // 깜박임이 흐린 순간에 나타나면 못 보고 넘기므로, 항상 선명한 상태에서 다시 시작
        d.arrow.setVisible(true);
        d.blink?.remove();
        d.blink = this.s.tweens.add({ targets: d.arrow, alpha: { from: 1, to: 0.35 }, duration: 500, yoyo: true, repeat: -1 });
      };
      const tick = this.s.time.addEvent({
        delay: 22, loop: true,
        callback: () => { i++; d.body.setText(chars.slice(0, i).join('')); if (i >= chars.length) finish(); },
      });
      const next = () => {
        if (!done) return finish();
        off();
        this.s.input.off('pointerdown', next);
        resolve();
      };
      const off = this.listen(e => { if (isConfirm(e)) next(); });
      this.s.input.on('pointerdown', next);
    });
  }

  hideDialog() {
    if (this.dlg) this.dlg.c.setVisible(false);
    if (this.dlgTop) { this.dlgTop = false; this.syncHud(); }
  }

  // ── 목록 선택 (키보드 + 마우스) ──
  select(container, x, y, labels, { cancel = false, size = 15, gap = 28 } = {}) {
    return new Promise(resolve => {
      let idx = 0;
      const cursor = this.s.add.text(x, y, '▶', textStyle(size - 2, '#c9a46a')).setScrollFactor(0);
      container.add(cursor);
      const pick = () => { off(); sfx('beep'); resolve(idx); };
      const items = labels.map((label, i) => {
        const t = this.s.add.text(x + 22, y + i * gap, label, textStyle(size)).setScrollFactor(0).setInteractive({ useHandCursor: true });
        t.on('pointerover', () => { idx = i; draw(); });
        t.on('pointerdown', () => { idx = i; pick(); });
        container.add(t);
        return t;
      });
      const draw = () => {
        cursor.setY(items[idx].y + 1);
        items.forEach((t, i) => t.setColor(i === idx ? '#ffffff' : '#8f8996'));
      };
      const off = this.listen(e => {
        const d = dirOf(e);
        if (d === 'up') { idx = (idx + labels.length - 1) % labels.length; draw(); sfx('tick'); }
        else if (d === 'down') { idx = (idx + 1) % labels.length; draw(); sfx('tick'); }
        else if (isConfirm(e)) pick();
        else if (cancel && e.code === 'Escape') { off(); resolve(-1); }
      });
      draw();
    });
  }

  async choice(prompt, labels) {
    this.hideDialog();
    const c = this.fixed(this.s.add.container(W / 2 - 190, 0), 130);
    const p = this.s.add.text(18, 14, prompt, textStyle(14, '#c9b89a', { wordWrap: { width: 344, useAdvancedWrap: true } }));
    const top = p.height + 28;
    const h = top + labels.length * 28 + 6;
    c.add(this.s.add.rectangle(0, 0, 380, h, 0x0a0a0f, 0.94).setOrigin(0).setStrokeStyle(2, 0x5d5a66));
    c.add(p);
    c.setY(H / 2 - h / 2);
    const i = await this.select(c, 22, top, labels);
    c.destroy();
    return i;
  }

  // ── 노크: Space로 두드린 횟수를 센다. 마지막으로 두드리고 잠시 멈추면 끝난다 ──
  knock() {
    this.hideDialog();
    const c = this.fixed(this.s.add.container(W / 2, H - 92), 130);
    c.add(this.s.add.rectangle(0, 0, 360, 74, 0x0a0a0f, 0.94).setStrokeStyle(2, 0x5d5a66));
    c.add(this.s.add.text(0, -18, 'Space: 문을 두드린다', textStyle(14, '#c9b89a')).setOrigin(0.5));
    const marks = this.s.add.text(0, 14, '', textStyle(18, '#e8e2d6')).setOrigin(0.5);
    c.add(marks);
    return new Promise(res => {
      let n = 0, idle;
      const done = () => { off(); idle?.remove(false); this.wait(300).then(() => { c.destroy(); res(n); }); };
      const off = this.listen(e => {
        if (e.code !== 'Space' || e.repeat) return;
        n++;
        sfx('knock');
        this.s.cameras.main.shake(60, 0.002);
        marks.setText(Array(n).fill('똑').join(' · '));
        idle?.remove(false);
        idle = this.s.time.delayedCall(1400, done);
      });
      idle = this.s.time.delayedCall(8000, done); // 아무것도 안 두드리면 그만둔 것으로 본다
    });
  }

  // ── 알림 · 배너 ──
  toast(msg) {
    // 목표 패널이 있으면 그 아래부터 쌓는다
    const y = (this.obj?.c.visible ? this.obj.bottom + 6 : 14) + this.toasts.length * 32;
    const t = this.fixed(this.s.add.text(W - 14, y, msg, textStyle(13, '#e8d8b0', {
      backgroundColor: 'rgba(20,18,26,0.88)', padding: { x: 10, y: 5 },
    })).setOrigin(1, 0), 150);
    t.setVisible(!this.covers && !this.dlgTop);
    this.toasts.push(t);
    this.s.tweens.add({
      targets: t, alpha: 0, delay: 2200, duration: 500,
      onComplete: () => { t.destroy(); this.toasts = this.toasts.filter(x => x !== t); },
    });
  }

  // ── 목표 패널 (오른쪽 위, GDD 4.7): 장 이름·진행도 + 지금 할 일 ──
  // p: { ch, done, total } (Explore.progress()), hint: 지금 할 일 문구
  objective(p, hint) {
    const PW = 250;
    if (!this.obj) {
      const c = this.fixed(this.s.add.container(W - 14, 12), 96);
      const bg = this.s.add.graphics();
      const head = this.s.add.text(-PW + 10, 7, '', textStyle(12, '#a8a1b0'));
      // 진행도 칸은 글자(■□)로 쓰면 글꼴에 따라 윗부분이 잘려서 직접 그린다
      const bar = this.s.add.graphics();
      const count = this.s.add.text(-10, 7, '', textStyle(12, '#c9a46a')).setOrigin(1, 0);
      const body = this.s.add.text(-PW + 10, 28, '', textStyle(12, '#d8cfb4', { wordWrap: { width: PW - 20, useAdvancedWrap: true } }));
      c.add([bg, head, bar, count, body]);
      this.obj = { c, bg, head, bar, count, body, bottom: 0 };
    }
    const o = this.obj;
    o.head.setText(p ? `${p.ch.title} · ${p.ch.sub}` : '');
    o.count.setText(p && p.total ? `${p.done}/${p.total}` : '');
    o.bar.clear();
    if (p && p.total) {
      const S = 8, G = 3;
      const y = 7 + Math.round((o.count.height - S) / 2);
      let x = -10 - o.count.width - 8 - p.total * (S + G) + G;
      for (let i = 0; i < p.total; i++, x += S + G) {
        if (i < p.done) o.bar.fillStyle(0xc9a46a, 1).fillRect(x, y, S, S);
        else o.bar.lineStyle(1, 0xc9a46a, 0.7).strokeRect(x + 0.5, y + 0.5, S - 1, S - 1);
      }
    }
    const text = '▶ ' + hint;
    if (o.body.text !== text) {
      // 할 일이 바뀌면 잠깐 밝게 눈에 띄게 한다
      if (o.body.text) { this.s.tweens.killTweensOf(o.body); o.body.setAlpha(0.2); this.s.tweens.add({ targets: o.body, alpha: 1, duration: 700 }); }
      o.body.setText(text);
    }
    const h = o.body.y + o.body.height + 8;
    o.bg.clear().fillStyle(0x000000, 0.55).fillRect(-PW, 0, PW, h);
    o.bottom = 12 + h;
  }

  banner(title, sub = '', hold = 1400) {
    this.hideDialog();
    const c = this.fixed(this.s.add.container(W / 2, H / 2), 140).setAlpha(0);
    c.add([
      this.s.add.rectangle(0, 0, W, 110, 0x000000, 0.78),
      this.s.add.text(0, -14, title, textStyle(24, '#e8e2d6')).setOrigin(0.5),
      this.s.add.text(0, 22, sub, textStyle(14, '#a99f8e')).setOrigin(0.5),
    ]);
    return tweenP(this.s, { targets: c, alpha: 1, duration: 500, hold, yoyo: true }).then(() => c.destroy());
  }

  // ── 연출 ──
  glitch(ms = 450) {
    sfx('glitch');
    const g = this.fixed(this.s.add.graphics(), 190);
    const colors = [0xff0033, 0x00ffcc, 0xffffff, 0x000000];
    const ev = this.s.time.addEvent({
      delay: 40, repeat: Math.floor(ms / 40),
      callback: () => {
        g.clear();
        for (let i = 0; i < 6; i++) {
          g.fillStyle(Phaser.Utils.Array.GetRandom(colors), Math.random() * 0.5);
          g.fillRect(0, Math.random() * H, W, 4 + Math.random() * 24);
        }
      },
    });
    this.s.cameras.main.shake(ms, 0.006);
    return this.wait(ms).then(() => { ev.remove(); g.destroy(); });
  }

  async crack() {
    sfx('glass');
    const g = this.fixed(this.s.add.graphics(), 200);
    g.lineStyle(2, 0xffffff, 0.9);
    for (let i = 0; i < 9; i++) {
      let x = W / 2, y = H / 2;
      const ang = (Math.PI * 2 * i) / 9 + Math.random() * 0.4;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += Math.cos(ang + (Math.random() - 0.5) * 0.8) * 70;
        y += Math.sin(ang + (Math.random() - 0.5) * 0.8) * 70;
        g.lineTo(x, y);
      }
      g.strokePath();
    }
    this.s.cameras.main.flash(200, 255, 255, 255);
    this.s.cameras.main.shake(400, 0.015);
    // 금은 이벤트(기억·대사)가 끝날 때까지 남고, 스크립트의 effect "uncrack"으로 걷힌다
    this.crackG?.destroy();
    this.crackG = g;
    await this.wait(900);
  }

  // 화면의 금이 서서히 사라지고 원래 화면으로 돌아온다
  uncrack() {
    const g = this.crackG;
    if (!g) return;
    this.crackG = null;
    return tweenP(this.s, { targets: g, alpha: 0, duration: 700 }).then(() => g.destroy());
  }

  glow() {
    sfx('chime');
    const c = this.fixed(this.s.add.circle(W / 2, H / 2, 46, 0xffd76a, 0), 150);
    return tweenP(this.s, { targets: c, fillAlpha: 0.45, duration: 500, yoyo: true }).then(() => c.destroy());
  }

  async memory(lines) {
    this.hideDialog();
    sfx('glitch');
    const c = this.fixed(this.s.add.container(0, 0), 160);
    const bg = this.s.add.rectangle(0, 0, W, H, 0x1c120b, 1).setOrigin(0).setAlpha(0);
    const scan = this.s.add.graphics();
    scan.fillStyle(0x000000, 0.25);
    for (let y = 0; y < H; y += 4) scan.fillRect(0, y, W, 2);
    c.add([bg, scan]);
    await tweenP(this.s, { targets: bg, alpha: 0.94, duration: 400 });
    const startY = H / 2 - (lines.length - 1) * 18;
    for (let i = 0; i < lines.length; i++) {
      const t = this.s.add.text(W / 2, startY + i * 36, lines[i], textStyle(16, '#d8c09a')).setOrigin(0.5).setAlpha(0);
      c.add(t);
      sfx('whisper');
      this.s.tweens.add({ targets: t, alpha: 0.9, duration: 300 });
      this.s.tweens.add({ targets: t, x: { from: W / 2 - 3, to: W / 2 + 3 }, duration: 60, yoyo: true, repeat: 4 });
      await this.wait(1300);
    }
    await this.wait(700);
    this.s.cameras.main.flash(300, 255, 255, 255);
    sfx('glitch');
    c.destroy();
  }

  // ── 퍼즐 ──
  async puzzle(id) {
    this.hideDialog();
    const p = DB.puzzles[id];
    const fn = { seat: this.seatPuzzle, keypad: this.keypad, piano: this.piano, match: this.match, order: this.order, silhouette: this.silhouette, compare: this.compare, timeline: this.timeline }[p.type];
    // 퍼즐 창은 화면 가운데라 오른쪽 위 목표 패널과 겹친다
    return this.covered(() => fn.call(this, p));
  }

  seatPuzzle(p) {
    return new Promise(resolve => {
      const pw = 520, ph = 420;
      const cw = 96, ch = 46, gx = 60, gy = 90, gapX = 12, gapY = 10;
      const c = this.fixed(this.s.add.container(W / 2 - pw / 2, H / 2 - ph / 2), 170);
      c.add([
        this.s.add.rectangle(0, 0, pw, ph, 0xd9cfb4).setOrigin(0).setStrokeStyle(2, 0x3a2e20),
        this.s.add.text(pw / 2, 14, p.title, textStyle(18, '#2a2016')).setOrigin(0.5, 0),
        this.s.add.text(pw / 2, 48, '[ 칠판 · 교탁 ]', textStyle(12, '#5a4a36')).setOrigin(0.5, 0),
        this.s.add.text(24, gy + 70, '창\n가', textStyle(13, '#5a4a36')),
      ]);
      for (let col = 0; col < p.cols; col++) {
        const start = col * p.rows + 1, end = start + p.rows - 1;
        c.add(this.s.add.text(gx + col * (cw + gapX) + cw / 2, gy - 14, `${start}~${end}번`, textStyle(12, '#6a5a44')).setOrigin(0.5, 1));
        for (let row = 0; row < p.rows; row++) {
          const x = gx + col * (cw + gapX), y = gy + row * (ch + gapY);
          c.add(this.s.add.rectangle(x, y, cw, ch, 0xc8bb98).setOrigin(0).setStrokeStyle(2, 0x6a5a44));
          const name = p.names[`${col},${row}`];
          if (name) c.add(this.s.add.text(x + cw / 2, y + ch / 2, name, textStyle(13, '#3a2e20')).setOrigin(0.5).setAlpha(0.55));
        }
      }
      const memoY = gy + p.rows * (ch + gapY) + 6;
      c.add(this.s.add.text(gx, memoY, p.memo.join('\n'), textStyle(13, '#3a2e20')));
      const hint = this.s.add.text(gx, memoY + 48, '', textStyle(12, '#8a2a1a', { wordWrap: { width: 400, useAdvancedWrap: true } }));
      c.add(hint);
      c.add(this.s.add.text(pw / 2, ph - 22, '방향키: 이동   E: 선택   ESC: 닫기', textStyle(11, '#6a5a44')).setOrigin(0.5));
      const cursor = this.s.add.rectangle(0, 0, cw + 6, ch + 6).setStrokeStyle(3, 0x8a1010);
      c.add(cursor);

      let cx = 0, cy = 0, wrong = 0;
      const draw = () => cursor.setPosition(gx + cx * (cw + gapX) + cw / 2, gy + cy * (ch + gapY) + ch / 2);
      const off = this.listen(e => {
        const d = dirOf(e);
        if (d) {
          if (d === 'left') cx = Math.max(0, cx - 1);
          if (d === 'right') cx = Math.min(p.cols - 1, cx + 1);
          if (d === 'up') cy = Math.max(0, cy - 1);
          if (d === 'down') cy = Math.min(p.rows - 1, cy + 1);
          draw(); sfx('tick');
        } else if (isConfirm(e)) {
          if (cx === p.answer[0] && cy === p.answer[1]) {
            off(); sfx('ok');
            cursor.setStrokeStyle(3, 0x1d6b2a);
            this.wait(700).then(() => { c.destroy(); resolve(true); });
          } else {
            wrong++; sfx('error');
            this.s.tweens.add({ targets: c, x: c.x + 6, duration: 40, yoyo: true, repeat: 2 });
            hint.setText(wrong >= 1 && p.hint ? p.hint : '……아니야. 이 자리가 아니다.');
          }
        } else if (e.code === 'Escape') { off(); c.destroy(); resolve(false); }
      });
      draw();
    });
  }

  // 숫자 자물쇠. p.format이 있으면 제목 아래에 입력 형식을 적는다 (예: 「월 2자리 + 일 2자리」)
  keypad(p) {
    return new Promise(resolve => {
      const top = p.format ? 76 : 60;
      const pw = 340, ph = 190 + top, n = p.digits;
      const c = this.fixed(this.s.add.container(W / 2 - pw / 2, H / 2 - ph / 2), 170);
      c.add([
        this.s.add.rectangle(0, 0, pw, ph, 0x1b1d20).setOrigin(0).setStrokeStyle(2, 0x5a5f66),
        this.s.add.text(pw / 2, 16, p.title, textStyle(17, '#d8d8d8')).setOrigin(0.5, 0),
      ]);
      if (p.format) c.add(this.s.add.text(pw / 2, 46, p.format, textStyle(12, '#a99f8e')).setOrigin(0.5, 0));
      const vals = Array(n).fill(0);
      let pos = 0, wrong = 0;
      const startX = pw / 2 - (n * 54 - 10) / 2;
      const boxes = vals.map((_, i) => {
        c.add(this.s.add.rectangle(startX + i * 54, top, 44, 56, 0x0c0d0f).setOrigin(0).setStrokeStyle(2, 0x5a5f66));
        const t = this.s.add.text(startX + i * 54 + 22, top + 28, '0', textStyle(28, '#e8e2d6')).setOrigin(0.5);
        c.add(t);
        return t;
      });
      const under = this.s.add.rectangle(0, top + 62, 44, 3, 0xc9a46a).setOrigin(0);
      const msg = this.s.add.text(pw / 2, top + 80, '', textStyle(13, '#c06060')).setOrigin(0.5, 0);
      const hint = this.s.add.text(pw / 2, top + 106, '', textStyle(12, '#a99f8e', { wordWrap: { width: pw - 40, useAdvancedWrap: true }, align: 'center' })).setOrigin(0.5, 0);
      c.add([under, msg, hint, this.s.add.text(pw / 2, ph - 22, '↑↓ 숫자  ←→ 자리  숫자키 입력  E 확인  ESC 닫기', textStyle(11, '#6d6875')).setOrigin(0.5)]);
      const draw = () => { boxes.forEach((t, i) => t.setText(String(vals[i]))); under.setX(startX + pos * 54); };
      const off = this.listen(e => {
        const d = dirOf(e);
        const digit = /^(Digit|Numpad)(\d)$/.exec(e.code);
        if (digit) { vals[pos] = Number(digit[2]); pos = Math.min(n - 1, pos + 1); sfx('tick'); }
        else if (d === 'up') { vals[pos] = (vals[pos] + 1) % 10; sfx('tick'); }
        else if (d === 'down') { vals[pos] = (vals[pos] + 9) % 10; sfx('tick'); }
        else if (d === 'left') pos = Math.max(0, pos - 1);
        else if (d === 'right') pos = Math.min(n - 1, pos + 1);
        else if (isConfirm(e)) {
          if (vals.join('') === p.code) {
            off(); sfx('unlock'); msg.setColor('#7ac080').setText('딸깍.');
            this.wait(600).then(() => { c.destroy(); resolve(true); });
            return;
          }
          wrong++; sfx('error');
          msg.setText('삐— 열리지 않는다.');
          if (wrong >= 2 && p.hint) hint.setText(p.hint);
        } else if (e.code === 'Escape') { off(); c.destroy(); resolve(false); return; }
        draw();
      });
      draw();
    });
  }

  // 피아노: 악보대로 건반을 누른다 (p.melody: 1=도 … 7=시). 키보드·클릭 모두 press()로 들어온다.
  // p.refs: 연주 중 펼쳐 볼 수 있는 단서 id (모은 것만 보여 준다)
  piano(p) {
    return new Promise(resolve => {
      const NOTES = ['도', '레', '미', '파', '솔', '라', '시'];
      const pw = 470, ph = 330, kw = 56, kh = 116, ky = 116;
      const kx = pw / 2 - (NOTES.length * kw) / 2;
      const c = this.fixed(this.s.add.container(W / 2 - pw / 2, H / 2 - ph / 2), 170);
      c.add([
        this.s.add.rectangle(0, 0, pw, ph, 0x17110d).setOrigin(0).setStrokeStyle(2, 0x5a4632),
        this.s.add.text(pw / 2, 14, p.title, textStyle(17, '#d8cfb4')).setOrigin(0.5, 0),
        this.s.add.text(pw / 2, 44, `악보 — ${p.score}`, textStyle(14, '#a99f8e')).setOrigin(0.5, 0),
      ]);
      const played = this.s.add.text(pw / 2, 76, '', textStyle(16, '#e8e2d6')).setOrigin(0.5, 0);
      const keys = NOTES.map((n, i) => {
        const k = this.s.add.rectangle(kx + i * kw, ky, kw - 2, kh, 0xe6e0d0).setOrigin(0).setStrokeStyle(2, 0x3a2e22)
          .setScrollFactor(0).setInteractive({ useHandCursor: true });
        k.on('pointerover', () => { if (!locked && !refs) { idx = i; draw(); } });
        k.on('pointerdown', () => { if (locked || refs) return; idx = i; press(i); draw(); });
        c.add([k, this.s.add.text(kx + i * kw + kw / 2 - 1, ky + kh - 30, `${n}\n${i + 1}`, textStyle(12, '#3a2e22', { align: 'center' })).setOrigin(0.5, 0.5)]);
        return k;
      });
      // 검은 건반은 이 퍼즐에서 쓰지 않는다 — 클릭을 받아 두기만 해서 아래 흰 건반으로 새지 않게 한다
      for (const i of [0, 1, 3, 4, 5]) c.add(this.s.add.rectangle(kx + (i + 1) * kw - 1, ky, 30, 66, 0x0c0a08).setOrigin(0.5, 0).setScrollFactor(0).setInteractive());
      const cursor = this.s.add.rectangle(0, ky + kh + 8, kw - 10, 4, 0xc9a46a).setOrigin(0);
      const msg = this.s.add.text(pw / 2, ky + kh + 20, '', textStyle(13, '#c06060')).setOrigin(0.5, 0);
      const hint = this.s.add.text(pw / 2, ky + kh + 42, '', textStyle(12, '#a99f8e', { wordWrap: { width: pw - 40, useAdvancedWrap: true }, align: 'center' })).setOrigin(0.5, 0);
      c.add([played, cursor, msg, hint, this.s.add.text(pw / 2, ph - 20, '←→ 건반  E·클릭 누르기  숫자 1~7  Backspace 지우기  C 단서  ESC 닫기', textStyle(11, '#6d6875')).setOrigin(0.5)]);

      // 단서 보기: 퍼즐 위에 덮는 창. 열려 있는 동안 키 입력은 이 창만 받고, 입력한 멜로디는 그대로 둔다
      let refs = null;
      const openRefs = () => {
        refs = this.s.add.container(0, 0);
        const bg = this.s.add.rectangle(0, 0, pw, ph, 0x0d0a08).setOrigin(0).setStrokeStyle(2, 0x5a4632)
          .setScrollFactor(0).setInteractive();
        bg.on('pointerdown', closeRefs);
        const body = (p.refs || []).map(id => (state.clues.includes(id)
          ? `■ ${DB.clues[id].name}\n${DB.clues[id].desc}`
          : '■ ???\n아직 확인하지 않은 단서다.')).join('\n\n');
        refs.add([
          bg,
          this.s.add.text(pw / 2, 14, '모아 둔 단서', textStyle(16, '#c9a46a')).setOrigin(0.5, 0),
          this.s.add.text(28, 50, body, textStyle(13, '#d8cfb4', { wordWrap: { width: pw - 56, useAdvancedWrap: true } })),
          this.s.add.text(pw / 2, ph - 20, 'C · E · ESC · 클릭: 돌아가기', textStyle(11, '#6d6875')).setOrigin(0.5),
        ]);
        c.add(refs);
        sfx('tick');
      };
      const closeRefs = () => { refs?.destroy(); refs = null; sfx('tick'); };
      const refsBtn = this.s.add.text(pw - 14, 16, '단서 보기', textStyle(12, '#c9a46a')).setOrigin(1, 0)
        .setScrollFactor(0).setInteractive({ useHandCursor: true });
      refsBtn.on('pointerdown', () => { if (!locked && !refs) openRefs(); });
      c.add(refsBtn);

      let idx = 0, wrong = 0, locked = false;
      const seq = [];
      const draw = () => {
        cursor.setX(kx + idx * kw + 4);
        played.setText(seq.map(n => NOTES[n - 1]).join(' ') || '…');
      };
      const press = i => {
        playNote(i + 1);
        keys[i].setFillStyle(0xc9a46a);
        this.s.time.delayedCall(140, () => keys[i].setFillStyle(0xe6e0d0));
        seq.push(i + 1);
        msg.setText('');
        if (seq.length < p.melody.length) return;
        locked = true;
        if (seq.join() === p.melody.join()) {
          off(); msg.setColor('#7ac080').setText('……이 곡이다.');
          this.wait(900).then(() => { c.destroy(); resolve(true); });
          return;
        }
        wrong++;
        this.wait(500).then(() => {
          sfx('error');
          msg.setColor('#c06060').setText('……어딘가 음이 틀렸다.');
          if (wrong >= 2 && p.hint) hint.setText(p.hint);
          seq.length = 0;
          locked = false;
          draw();
        });
      };
      const off = this.listen(e => {
        if (locked) return;
        if (refs) {
          if (e.code === 'KeyC' || e.code === 'Escape' || isConfirm(e)) closeRefs();
          return;
        }
        const d = dirOf(e);
        const digit = /^(Digit|Numpad)([1-7])$/.exec(e.code);
        if (e.code === 'KeyC') { openRefs(); return; }
        if (digit) { idx = Number(digit[2]) - 1; press(idx); }
        else if (d === 'left') { idx = Math.max(0, idx - 1); sfx('tick'); }
        else if (d === 'right') { idx = Math.min(NOTES.length - 1, idx + 1); sfx('tick'); }
        else if (isConfirm(e)) press(idx);
        else if (e.code === 'Backspace') seq.pop();
        else if (e.code === 'Escape') { off(); c.destroy(); resolve(false); return; }
        draw();
      });
      draw();
    });
  }

  // 대화 로그를 보며 닉네임마다 실제 인물을 고른다. row.distortion이면 오답이 곧 왜곡 선택이다.
  async match(p) {
    this.hideDialog();
    const c = this.fixed(this.s.add.container(0, 0), 170);
    c.add([
      this.s.add.rectangle(0, 0, W, H, 0x07070a, 0.96).setOrigin(0),
      this.s.add.text(W / 2, 16, p.title, textStyle(18, '#c9a46a')).setOrigin(0.5, 0),
      this.s.add.rectangle(20, 52, 360, 300, 0x10141a).setOrigin(0).setStrokeStyle(2, 0x2e3a48),
      this.s.add.text(32, 60, p.log.join('\n'), textStyle(13, '#b8c4d0', { lineSpacing: 9, wordWrap: { width: 336, useAdvancedWrap: true } })),
      this.s.add.text(400, 58, '닉네임은 누구였을까', textStyle(13, '#77707f')),
    ]);
    const msg = this.s.add.text(20, 366, '', textStyle(14, '#b08080', { wordWrap: { width: W - 40, useAdvancedWrap: true } }));
    c.add(msg);
    const ok = await this.pickRows(c, p.rows, {
      choices: p.people, rowX: 400, rowY: 88, rowGap: 30, optX: 400, optY: 222, msg, wrong: '……대화 내용과 맞지 않는다.',
    });
    if (!ok) { c.destroy(); return false; }
    await this.wait(600);
    c.add(this.s.add.text(W / 2, H - 30, 'E: 계속', textStyle(12, '#77707f')).setOrigin(0.5));
    await this.waitConfirm();
    c.destroy();
    return true;
  }

  // 행마다 보기 하나를 고른다 (행에 options가 없으면 공통 choices). distortion 행의 오답은 왜곡 선택.
  // 성공하면 행 텍스트 배열, ESC로 닫으면 false.
  async pickRows(c, rows, { choices, rowX, rowY, rowGap, rowWidth = W - rowX - 16, optX, optY, optGap = 30, msg, wrong = '……맞지 않는다.', onPick }) {
    const label = (r, v = '＿＿＿') => `「${r.nick}」 → ${v}`;
    const texts = rows.map((r, i) => {
      const t = this.s.add.text(rowX, rowY + i * rowGap, label(r), textStyle(15, '#4a4652', { wordWrap: { width: rowWidth, useAdvancedWrap: true } }));
      c.add(t);
      return t;
    });
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const opts = r.options || choices;
      texts[i].setColor('#e8e2d6');
      for (;;) {
        const opt = this.s.add.container(0, 0);
        c.add(opt);
        const pick = await this.select(opt, optX, optY, opts, { cancel: true, size: 14, gap: optGap });
        opt.destroy();
        if (pick === -1) return false;
        if (pick === r.answer) { sfx('ok'); msg.setText(''); break; }
        if (r.distortion) {
          texts[i].setText(label(r, opts[pick])).setColor('#a03030');
          await this.distortion(msg, r.evidence);
          break;
        }
        sfx('error');
        msg.setColor('#b08080').setText(wrong);
      }
      texts[i].setText(label(r, opts[r.answer])).setColor('#d8c09a');
      onPick?.(i);
    }
    return texts;
  }

  // 실루엣 재구성: 1) 약도의 자리마다 인물 배치  2) 인물마다 그날의 대사
  async silhouette(p) {
    this.hideDialog();
    const c = this.fixed(this.s.add.container(0, 0), 170);
    const mx = 20, my = 52, mw = 300, mh = 230;
    c.add([
      this.s.add.rectangle(0, 0, W, H, 0x07070a, 0.96).setOrigin(0),
      this.s.add.text(W / 2, 14, p.title, textStyle(18, '#c9a46a')).setOrigin(0.5, 0),
      this.s.add.rectangle(mx, my, mw, mh, 0x15161b).setOrigin(0).setStrokeStyle(2, 0x3a3d48),
    ]);
    // 옥상 약도: 펜스(위), 물탱크(왼쪽 위), 벤치(오른쪽), 출입문(아래)
    const g = this.s.add.graphics();
    g.lineStyle(1, 0x5d6170, 0.8);
    for (let x = mx + 8; x < mx + mw - 4; x += 10) g.lineBetween(x, my + 6, x + 5, my + 14);
    g.fillStyle(0x30343c).fillRect(mx + 22, my + 28, 52, 40);
    g.fillStyle(0x3d2e22).fillRect(mx + mw - 58, my + 100, 40, 14);
    g.fillStyle(0x2b241c).fillRect(mx + mw / 2 - 18, my + mh - 8, 36, 8);
    c.add(g);
    const at = s => [mx + s.x * mw, my + s.y * mh];
    for (const s of p.spots) {
      const [x, y] = at(s);
      c.add([
        this.s.add.circle(x, y, 13).setStrokeStyle(2, 0x6d6875),
        this.s.add.text(x, y + 26, s.nick, textStyle(11, '#77707f')).setOrigin(0.5, 0),
      ]);
    }
    const figure = (s, name) => {
      const [x, y] = at(s);
      const f = this.s.add.graphics();
      f.fillStyle(0x000000, 0.95).fillCircle(x, y - 10, 7).fillRoundedRect(x - 9, y - 3, 18, 18, 4);
      c.add([f, this.s.add.text(x, y - 32, name, textStyle(12, '#d8c09a')).setOrigin(0.5, 0)]);
      sfx('whisper');
    };
    const msg = this.s.add.text(20, 398, '', textStyle(14, '#b08080', { wordWrap: { width: W - 40, useAdvancedWrap: true } }));
    const head = this.s.add.text(340, 56, p.placeTitle, textStyle(13, '#77707f'));
    c.add([msg, head]);

    const placed = await this.pickRows(c, p.spots, {
      choices: p.people, rowX: 340, rowY: 84, rowGap: 30, optX: 40, optY: 296, optGap: 24, msg,
      wrong: '……그 자리가 아니었다.', onPick: i => figure(p.spots[i], p.people[p.spots[i].answer]),
    });
    if (!placed) { c.destroy(); return false; }
    await this.wait(700);
    placed.forEach(t => t.destroy());
    head.setText(p.lineTitle);
    const said = await this.pickRows(c, p.lines, {
      choices: p.sayings, rowX: 340, rowY: 84, rowGap: 50, optX: 40, optY: 296, optGap: 24, msg,
      wrong: '……그 사람이 한 말이 아니다.',
    });
    if (!said) { c.destroy(); return false; }
    await this.wait(600);
    c.add(this.s.add.text(W / 2, H - 22, 'E: 계속', textStyle(12, '#77707f')).setOrigin(0.5));
    await this.waitConfirm();
    c.destroy();
    return true;
  }

  // 순서 맞추기: Space로 미리 듣고(순서는 그대로), E로 순서에 넣는다. 넣은 테이프도 다시 들을 수 있다.
  order(p) {
    return new Promise(resolve => {
      const pw = 500, ph = 360, n = p.tapes.length;
      const c = this.fixed(this.s.add.container(W / 2 - pw / 2, H / 2 - ph / 2), 170);
      c.add([
        this.s.add.rectangle(0, 0, pw, ph, 0x15171a).setOrigin(0).setStrokeStyle(2, 0x4a4f56),
        this.s.add.text(pw / 2, 14, p.title, textStyle(17, '#d8d8d8')).setOrigin(0.5, 0),
        this.s.add.text(pw / 2, 42, p.memo, textStyle(12, '#8f8996')).setOrigin(0.5, 0),
      ]);
      const list = p.tapes.map((t, i) => {
        const tx = this.s.add.text(40, 78 + i * 28, t.label, textStyle(15));
        c.add(tx);
        return tx;
      });
      const desc = this.s.add.text(200, 78, '', textStyle(13, '#c8c0b0', { wordWrap: { width: 270, useAdvancedWrap: true } }));
      const slots = Array.from({ length: n }, (_, i) => {
        const x = pw / 2 - (n * 104) / 2 + i * 104;
        c.add([
          this.s.add.rectangle(x, 206, 96, 44, 0x0c0d0f).setOrigin(0).setStrokeStyle(2, 0x4a4f56),
          this.s.add.text(x + 4, 190, `${i + 1}`, textStyle(11, '#6d6875')),
        ]);
        const t = this.s.add.text(x + 48, 228, '', textStyle(13, '#e8e2d6')).setOrigin(0.5);
        c.add(t);
        return t;
      });
      const msg = this.s.add.text(pw / 2, 262, '', textStyle(13, '#c06060')).setOrigin(0.5, 0);
      const hint = this.s.add.text(pw / 2, 284, '', textStyle(12, '#a99f8e', { wordWrap: { width: pw - 40, useAdvancedWrap: true }, align: 'center' })).setOrigin(0.5, 0);
      c.add([desc, msg, hint, this.s.add.text(pw / 2, ph - 18, '↑↓ 고르기  Space 듣기  E 순서에 넣기  Backspace 빼기  ESC 닫기', textStyle(11, '#6d6875')).setOrigin(0.5)]);

      let idx = 0, wrong = 0, locked = false, closed = false;
      let playing = -1;  // 지금 재생 중인 테이프 (재생이 끝날 때까지 다른 테이프를 겹쳐 틀지 않는다)
      const seq = [];
      const draw = () => {
        list.forEach((t, i) => t.setColor(seq.includes(i) ? '#4a4652' : i === idx ? '#ffffff' : '#8f8996')
          .setText((i === idx ? '▶ ' : '   ') + p.tapes[i].label + (i === playing ? ' ♪' : '')));
        desc.setText(p.tapes[idx].desc);
        slots.forEach((t, i) => t.setText(seq[i] != null ? p.tapes[seq[i]].label : ''));
      };
      const preview = () => {
        if (playing !== -1) return;
        playing = idx;
        const dur = sfx(p.tapes[idx].sfx) || 0.3;
        this.wait(dur * 1000 + 150).then(() => { if (closed) return; playing = -1; draw(); });
      };
      const check = () => {
        locked = true;
        this.wait(400).then(() => {
          if (closed) return;
          if (seq.join() === p.answer.join()) {
            off(); closed = true; sfx('ok'); msg.setColor('#7ac080').setText('……그날 오후가 이어진다.');
            this.wait(900).then(() => { c.destroy(); resolve(true); });
            return;
          }
          wrong++; sfx('error');
          msg.setColor('#c06060').setText('……이 순서가 아니다.');
          if (p.hint) hint.setText(p.hint);
          seq.length = 0;
          locked = false;
          draw();
        });
      };
      const off = this.listen(e => {
        if (locked) return;
        const d = dirOf(e);
        if (d === 'up') { idx = (idx + n - 1) % n; sfx('tick'); }
        else if (d === 'down') { idx = (idx + 1) % n; sfx('tick'); }
        else if (e.code === 'Backspace') seq.pop();
        else if (e.code === 'Escape') { off(); closed = true; c.destroy(); resolve(false); return; }
        else if (e.code === 'Space' && !e.repeat) preview();
        else if (isConfirm(e)) {
          if (seq.includes(idx)) { sfx('error'); msg.setColor('#c06060').setText('……이미 순서에 넣은 테이프다.'); return; }
          seq.push(idx);
          sfx('tick');
          msg.setText('');
          if (seq.length === n) check();
        }
        draw();
      });
      draw();
    });
  }

  // 타임라인: 사건 카드를 시간 순서대로 놓는다. distortion 카드를 놓으면 왜곡 선택 → 증거로 깨지고 카드가 사라진다.
  timeline(p) {
    return new Promise(resolve => {
      const n = p.answer.length;
      const wrap = w => ({ wordWrap: { width: w, useAdvancedWrap: true } });
      const c = this.fixed(this.s.add.container(0, 0), 170);
      c.add([
        this.s.add.rectangle(0, 0, W, H, 0x07070a, 0.96).setOrigin(0),
        this.s.add.text(W / 2, 12, p.title, textStyle(18, '#c9a46a')).setOrigin(0.5, 0),
        this.s.add.text(24, 44, '그날의 장면들', textStyle(12, '#77707f')),
        this.s.add.text(338, 44, '일어난 순서', textStyle(12, '#77707f')),
        this.s.add.rectangle(326, 64, 298, n * 36 + 12, 0x101014).setOrigin(0).setStrokeStyle(2, 0x2e2b34),
      ]);
      const cards = p.cards.map((card, i) => {
        const t = this.s.add.text(24, 70 + i * 36, '', textStyle(13, '#8f8996', wrap(290)));
        c.add(t);
        return t;
      });
      const slots = Array.from({ length: n }, (_, i) => {
        const t = this.s.add.text(338, 72 + i * 36, '', textStyle(13, '#d8c09a', wrap(276)));
        c.add(t);
        return t;
      });
      const msg = this.s.add.text(24, 70 + p.cards.length * 36 + 8, '', textStyle(13, '#b08080', wrap(W - 48)));
      const hint = this.s.add.text(24, H - 70, '', textStyle(12, '#a99f8e', wrap(W - 48)));
      c.add([msg, hint, this.s.add.text(W / 2, H - 20, '↑↓ 고르기  E 순서에 놓기  Backspace 빼기  ESC 닫기', textStyle(11, '#6d6875')).setOrigin(0.5)]);

      let idx = 0, locked = false;
      const placed = [], gone = new Set();
      const draw = () => {
        cards.forEach((t, i) => {
          const used = placed.includes(i) || gone.has(i);
          t.setText((i === idx ? '▶ ' : '   ') + p.cards[i].text).setColor(gone.has(i) ? '#3a3640' : used ? '#4a4652' : i === idx ? '#ffffff' : '#8f8996');
        });
        slots.forEach((t, i) => t.setText(`${i + 1}. ${placed[i] != null ? p.cards[placed[i]].text : '＿＿＿'}`));
      };
      const off = this.listen(async e => {
        if (locked) return;
        const d = dirOf(e);
        if (d === 'up') { idx = (idx + p.cards.length - 1) % p.cards.length; sfx('tick'); }
        else if (d === 'down') { idx = (idx + 1) % p.cards.length; sfx('tick'); }
        else if (e.code === 'Backspace') placed.pop();
        else if (e.code === 'Escape') { off(); c.destroy(); resolve(false); return; }
        else if (isConfirm(e)) {
          if (placed.includes(idx) || gone.has(idx)) { sfx('error'); return; }
          if (p.cards[idx].distortion) {
            locked = true;
            cards[idx].setColor('#a03030');
            await this.distortion(msg, p.evidence);
            gone.add(idx);
            locked = false;
            draw();
            return;
          }
          placed.push(idx);
          msg.setText('');
          sfx('tick');
          if (placed.length === n) {
            if (placed.join() === p.answer.join()) {
              off(); draw(); sfx('ok');
              msg.setColor('#7ac080').setText('……그날이, 처음부터 끝까지 이어진다.');
              this.wait(1200).then(() => { c.destroy(); resolve(true); });
              return;
            }
            sfx('error');
            msg.setColor('#c06060').setText('……이 순서가 아니다.');
            if (p.hint) hint.setText(p.hint);
            placed.length = 0;
          }
        }
        draw();
      });
      draw();
    });
  }

  // 왜곡된 기억: 부정 수치 상승 → 증거로 깨진다
  async distortion(msg, evidence) {
    addDenial(15);
    this.s.events.emit('denial');
    await this.glitch(500);
    msg.setColor('#b08080').setText('……기억이 일그러진다.');
    await this.wait(1000);
    msg.setColor('#d8c09a').setText(`[증거] ${evidence.name}\n${evidence.quote}`);
    await this.wait(2400);
    msg.setColor('#b08080').setText('……아니야.');
    await this.wait(1000);
    msg.setText('');
  }

  // 빈칸마다 보기를 고른다. 왜곡 보기는 증거로 깨진 뒤 정답으로 채워진다.
  async fillBlanks(c, blanks, lines, msg, { optX, optY, size = 15, gap = 28, active = '#e8e2d6', done = '#d8c09a' }) {
    for (let i = 0; i < blanks.length; i++) {
      const b = blanks[i];
      lines[i].setColor(active);
      for (;;) {
        const opt = this.s.add.container(0, 0);
        c.add(opt);
        const o = b.options[await this.select(opt, optX, optY, b.options.map(x => x.label), { size, gap })];
        opt.destroy();
        if (o.correct) { sfx('ok'); msg.setText(''); break; }
        if (o.distortion) {
          lines[i].setText(blankText(b, o.label)).setColor('#a03030');
          await this.distortion(msg, b.evidence);
          break;
        }
        sfx('error');
        msg.setColor('#b08080').setText('……맞지 않는다.');
      }
      lines[i].setText(blankText(b, b.options.find(x => x.correct).label)).setColor(done);
    }
  }

  // 문서 대조: 왼쪽 원본을 보며 오른쪽 먹칠된 문서의 빈칸을 채운다
  async compare(p) {
    const c = this.fixed(this.s.add.container(0, 0), 170);
    const ink = '■■■■■■';
    const wrap = { wordWrap: { width: 276, useAdvancedWrap: true } };
    c.add([
      this.s.add.rectangle(0, 0, W, H, 0x07070a, 0.96).setOrigin(0),
      this.s.add.text(W / 2, 12, p.title, textStyle(18, '#c9a46a')).setOrigin(0.5, 0),
      this.s.add.rectangle(16, 46, 296, 300, 0xd9cfb4).setOrigin(0).setStrokeStyle(2, 0x3a2e20),
      this.s.add.text(28, 54, p.sourceTitle, textStyle(13, '#5a4a36')),
      this.s.add.text(28, 80, p.source.join('\n'), textStyle(12, '#2a2016', { ...wrap, lineSpacing: 7 })),
      this.s.add.rectangle(328, 46, 296, 300, 0xe8e4da).setOrigin(0).setStrokeStyle(2, 0x5a5f66),
      this.s.add.text(340, 54, p.reportTitle, textStyle(13, '#4a4f56')),
    ]);
    const lines = p.blanks.map((b, i) => {
      const t = this.s.add.text(340, 86 + i * 62, blankText(b, ink), textStyle(14, '#8a8690', wrap));
      c.add(t);
      return t;
    });
    const msg = this.s.add.text(340, 356, '', textStyle(13, '#b08080', wrap));
    c.add(msg);
    await this.fillBlanks(c, p.blanks, lines, msg, {
      optX: 24, optY: 360, size: 14, gap: 26, active: '#16161c', done: '#6a4a14', // 밝은 종이 위라 어두운 글자
    });

    let y = 362;
    for (const line of p.outro || []) {
      await this.wait(700);
      c.add(this.s.add.text(28, y, line, textStyle(14, '#9a94a0')));
      y += 26;
    }
    c.add(this.s.add.text(W / 2, H - 18, 'E: 계속', textStyle(12, '#77707f')).setOrigin(0.5));
    await this.waitConfirm();
    c.destroy();
    return true;
  }

  // ── 기억 재구성 (추리) ──
  async deduction(id) {
    this.hideDialog();
    const d = DB.deductions[id];
    const c = this.fixed(this.s.add.container(0, 0), 170);
    c.add([
      this.s.add.rectangle(0, 0, W, H, 0x07070a, 0.96).setOrigin(0),
      this.s.add.text(W / 2, 26, d.title, textStyle(20, '#c9a46a')).setOrigin(0.5, 0),
      this.s.add.text(W / 2, 58, '단서를 떠올려 빈칸을 채운다', textStyle(12, '#77707f')).setOrigin(0.5, 0),
    ]);
    const lines = d.blanks.map((b, i) => {
      const t = this.s.add.text(48, 100 + i * 34, blankText(b), textStyle(16, '#4a4652'));
      c.add(t);
      return t;
    });
    const msgY = 100 + d.blanks.length * 34 + 12;
    const msg = this.s.add.text(48, msgY, '', textStyle(14, '#b08080', { wordWrap: { width: W - 96, useAdvancedWrap: true } }));
    c.add(msg);
    await this.fillBlanks(c, d.blanks, lines, msg, { optX: 64, optY: 320 });

    let y = msgY;
    for (const line of d.outro || []) {
      await this.wait(700);
      c.add(this.s.add.text(48, y, line, textStyle(15, '#9a94a0')));
      y += 28;
    }
    c.add(this.s.add.text(W / 2, H - 36, 'E: 계속', textStyle(12, '#77707f')).setOrigin(0.5));
    await this.waitConfirm();
    c.destroy();
  }

  // ── 기억 노트 (ESC) ──
  notebook(hintText, prog) {
    return new Promise(resolve => {
      const tabs = ['소지품', '단서', '기억 조각', '인물', '타임라인', '생각하기', '설정'];
      const SETTINGS = tabs.length - 1;
      // 목록은 구분선(y 104~404) 안에 ROWS줄만 보이고, 커서를 따라 스크롤된다
      const ROWS = 11;
      let tab = 0, idx = 0, first = 0;
      const c = this.fixed(this.s.add.container(0, 0), 180);
      c.add([
        this.s.add.rectangle(0, 0, W, H, 0x060608, 0.95).setOrigin(0),
        this.s.add.text(28, 20, '기억 노트', textStyle(20, '#c9a46a')),
        this.s.add.text(W - 28, 26, `기억 조각 ${state.fragments.length} / 8`, textStyle(13, '#8f8996')).setOrigin(1, 0),
        this.s.add.rectangle(230, 104, 1, 300, 0x2e2b34).setOrigin(0),
      ]);
      const tabTexts = tabs.map((t, i) => {
        const tx = this.s.add.text(28 + i * 84, 66, t, textStyle(14));
        c.add(tx);
        return tx;
      });
      const keys = this.s.add.text(W / 2, H - 24, '', textStyle(13, '#9a94a3')).setOrigin(0.5);
      c.add(keys);
      const list = this.s.add.container(0, 0);
      const detail = this.s.add.text(250, 110, '', textStyle(14, '#d8d0c0', { wordWrap: { width: W - 290, useAdvancedWrap: true } }));
      const more = this.s.add.text(222, 410, '', textStyle(11, '#6d6875')).setOrigin(1, 0);
      c.add([list, detail, more]);

      const entries = () => {
        if (tab === 0) return state.items.map(id => DB.items[id]);
        if (tab === 1) return state.clues.map(id => DB.clues[id]);
        if (tab === 2) return [...state.fragments].sort((a, b) => a - b).map(n => ({ name: `조각 ${n} — ${DB.fragments[n].name}`, desc: DB.fragments[n].desc }));
        // 인물·타임라인: 관련 단서·플래그를 얻으면 나타난다 (data/clues.json)
        if (tab === 3) return DB.people.filter(e => checkCond(e.cond));
        if (tab === 4) return DB.timeline.filter(e => checkCond(e.cond));
        if (tab === SETTINGS) {
          return [{ name: `전체 볼륨  ${Math.round(getVolume() * 100)}%`, desc: '↑↓ 로 볼륨을 조절합니다.\n바꾼 값은 이 브라우저에 기억됩니다.' }];
        }
        // 생각하기: 지금 할 일 + 이번 장의 단계 체크리스트 (data/objectives.json)
        const steps = (prog?.ch.steps || []).map((s, i) => ({
          name: `${prog.marks[i] ? '✔' : '·'} ${s.name}`,
          desc: prog.marks[i] ? '끝냈다.' : '아직이다.',
        }));
        return [{ name: '지금 할 일', desc: hintText }, ...steps];
      };
      const draw = () => {
        tabTexts.forEach((t, i) => t.setColor(i === tab ? '#ffffff' : '#6d6875'));
        keys.setText(tab === SETTINGS ? '←→ 탭   ↑↓ 볼륨   ESC 닫기' : '←→ 탭   ↑↓ 선택   ESC 닫기');
        list.removeAll(true);
        const es = entries();
        idx = Math.min(idx, Math.max(0, es.length - 1));
        first = Phaser.Math.Clamp(first, idx - ROWS + 1, idx);
        if (!es.length) list.add(this.s.add.text(28, 110, '(없음)', textStyle(14, '#6d6875')));
        es.slice(first, first + ROWS).forEach((e, r) => {
          const i = first + r;
          list.add(this.s.add.text(28, 110 + r * 26, (i === idx ? '▶ ' : '   ') + e.name, textStyle(14, i === idx ? '#ffffff' : '#8f8996')));
        });
        more.setText(es.length > ROWS ? `${idx + 1} / ${es.length}` : '');
        detail.setText(es[idx]?.desc || '');
      };
      const off = this.listen(e => {
        const d = dirOf(e);
        const last = entries().length - 1;
        if (d === 'left') { tab = (tab + tabs.length - 1) % tabs.length; idx = first = 0; sfx('tick'); }
        else if (d === 'right') { tab = (tab + 1) % tabs.length; idx = first = 0; sfx('tick'); }
        else if (tab === SETTINGS && (d === 'up' || d === 'down')) { setVolume(getVolume() + (d === 'up' ? 0.1 : -0.1)); sfx('tick'); }
        else if (d === 'up') { if (idx > 0) { idx--; sfx('tick'); } }
        else if (d === 'down') { if (idx < last) { idx++; sfx('tick'); } }
        else if (e.code === 'Escape') { off(); c.destroy(); resolve(); return; }
        draw();
      });
      draw();
    });
  }
}
