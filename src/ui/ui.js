// 화면 고정 UI: 대화창, 선택지, 알림, 연출, 퍼즐, 추리, 기억 노트
import { W, H, FONT } from '../constants.js';
import { DB } from '../db.js';
import { state, addDenial } from '../state.js';
import { sfx, playNote } from '../audio.js';

export const textStyle = (size = 15, color = '#e8e2d6', extra = {}) => ({
  fontFamily: FONT, fontSize: `${size}px`, color, lineSpacing: 6, resolution: 2, ...extra,
});

const CONFIRM = ['KeyE', 'Space', 'Enter', 'NumpadEnter'];
const DIR_KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
export const isConfirm = e => CONFIRM.includes(e.code) && !e.repeat;
export const dirOf = e => DIR_KEYS[e.code];

const tweenP = (scene, cfg) => new Promise(r => scene.tweens.add({ ...cfg, onComplete: r }));

export class UI {
  constructor(scene) {
    this.s = scene;
    this.toasts = [];
  }

  fixed(obj, depth = 100) { return obj.setScrollFactor(0).setDepth(depth); }
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

  hideDialog() { if (this.dlg) this.dlg.c.setVisible(false); }

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

  // ── 알림 · 배너 ──
  toast(msg) {
    const y = 14 + this.toasts.length * 32;
    const t = this.fixed(this.s.add.text(W - 14, y, msg, textStyle(13, '#e8d8b0', {
      backgroundColor: 'rgba(20,18,26,0.88)', padding: { x: 10, y: 5 },
    })).setOrigin(1, 0), 150);
    this.toasts.push(t);
    this.s.tweens.add({
      targets: t, alpha: 0, delay: 2200, duration: 500,
      onComplete: () => { t.destroy(); this.toasts = this.toasts.filter(x => x !== t); },
    });
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
    await this.wait(900);
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
  puzzle(id) {
    this.hideDialog();
    const p = DB.puzzles[id];
    const fn = { seat: this.seatPuzzle, keypad: this.keypad, piano: this.piano, match: this.match, order: this.order, silhouette: this.silhouette }[p.type];
    return fn.call(this, p);
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

  keypad(p) {
    return new Promise(resolve => {
      const pw = 340, ph = 250, n = p.digits;
      const c = this.fixed(this.s.add.container(W / 2 - pw / 2, H / 2 - ph / 2), 170);
      c.add([
        this.s.add.rectangle(0, 0, pw, ph, 0x1b1d20).setOrigin(0).setStrokeStyle(2, 0x5a5f66),
        this.s.add.text(pw / 2, 16, p.title, textStyle(17, '#d8d8d8')).setOrigin(0.5, 0),
      ]);
      const vals = Array(n).fill(0);
      let pos = 0, wrong = 0;
      const startX = pw / 2 - (n * 54 - 10) / 2;
      const boxes = vals.map((_, i) => {
        c.add(this.s.add.rectangle(startX + i * 54, 60, 44, 56, 0x0c0d0f).setOrigin(0).setStrokeStyle(2, 0x5a5f66));
        const t = this.s.add.text(startX + i * 54 + 22, 88, '0', textStyle(28, '#e8e2d6')).setOrigin(0.5);
        c.add(t);
        return t;
      });
      const under = this.s.add.rectangle(0, 122, 44, 3, 0xc9a46a).setOrigin(0);
      const msg = this.s.add.text(pw / 2, 140, '', textStyle(13, '#c06060')).setOrigin(0.5, 0);
      const hint = this.s.add.text(pw / 2, 166, '', textStyle(12, '#a99f8e', { wordWrap: { width: pw - 40, useAdvancedWrap: true }, align: 'center' })).setOrigin(0.5, 0);
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

  // 피아노: 악보대로 건반을 누른다 (p.melody: 1=도 … 7=시)
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
        const k = this.s.add.rectangle(kx + i * kw, ky, kw - 2, kh, 0xe6e0d0).setOrigin(0).setStrokeStyle(2, 0x3a2e22);
        c.add([k, this.s.add.text(kx + i * kw + kw / 2 - 1, ky + kh - 30, `${n}\n${i + 1}`, textStyle(12, '#3a2e22', { align: 'center' })).setOrigin(0.5, 0.5)]);
        return k;
      });
      for (const i of [0, 1, 3, 4, 5]) c.add(this.s.add.rectangle(kx + (i + 1) * kw - 1, ky, 30, 66, 0x0c0a08).setOrigin(0.5, 0));
      const cursor = this.s.add.rectangle(0, ky + kh + 8, kw - 10, 4, 0xc9a46a).setOrigin(0);
      const msg = this.s.add.text(pw / 2, ky + kh + 20, '', textStyle(13, '#c06060')).setOrigin(0.5, 0);
      const hint = this.s.add.text(pw / 2, ky + kh + 42, '', textStyle(12, '#a99f8e', { wordWrap: { width: pw - 40, useAdvancedWrap: true }, align: 'center' })).setOrigin(0.5, 0);
      c.add([played, cursor, msg, hint, this.s.add.text(pw / 2, ph - 20, '←→ 건반  E 누르기  숫자 1~7 바로 누르기  Backspace 지우기  ESC 닫기', textStyle(11, '#6d6875')).setOrigin(0.5)]);

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
        const d = dirOf(e);
        const digit = /^(Digit|Numpad)([1-7])$/.exec(e.code);
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

  // 순서 맞추기: 항목을 골라 순서대로 넣는다. 넣을 때 그 소리를 재생한다.
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
      c.add([desc, msg, hint, this.s.add.text(pw / 2, ph - 18, '↑↓ 고르기  E 듣고 순서에 넣기  Backspace 빼기  ESC 닫기', textStyle(11, '#6d6875')).setOrigin(0.5)]);

      let idx = 0, wrong = 0, locked = false;
      const seq = [];
      const draw = () => {
        list.forEach((t, i) => t.setColor(seq.includes(i) ? '#4a4652' : i === idx ? '#ffffff' : '#8f8996').setText((i === idx ? '▶ ' : '   ') + p.tapes[i].label));
        desc.setText(p.tapes[idx].desc);
        slots.forEach((t, i) => t.setText(seq[i] != null ? p.tapes[seq[i]].label : ''));
      };
      const off = this.listen(e => {
        if (locked) return;
        const d = dirOf(e);
        if (d === 'up') { idx = (idx + n - 1) % n; sfx('tick'); }
        else if (d === 'down') { idx = (idx + 1) % n; sfx('tick'); }
        else if (e.code === 'Backspace') seq.pop();
        else if (e.code === 'Escape') { off(); c.destroy(); resolve(false); return; }
        else if (isConfirm(e)) {
          if (seq.includes(idx)) { sfx('error'); return; }
          seq.push(idx);
          msg.setText('');
          locked = true;
          // 소리가 끝날 때까지 다음 입력을 막는다
          const dur = sfx(p.tapes[idx].sfx) || 0.3;
          draw();
          this.wait(dur * 1000 + 150).then(() => {
            if (seq.length < n) { locked = false; return; }
            if (seq.join() === p.answer.join()) {
              off(); sfx('ok'); msg.setColor('#7ac080').setText('……그날 오후가 이어진다.');
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
          return;
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
    const blankText = (b, v = '＿＿＿') => b.text.replace('{}', v);
    const lines = d.blanks.map((b, i) => {
      const t = this.s.add.text(48, 100 + i * 34, blankText(b), textStyle(16, '#4a4652'));
      c.add(t);
      return t;
    });
    const msgY = 100 + d.blanks.length * 34 + 12;
    const msg = this.s.add.text(48, msgY, '', textStyle(14, '#b08080', { wordWrap: { width: W - 96, useAdvancedWrap: true } }));
    c.add(msg);

    for (let i = 0; i < d.blanks.length; i++) {
      const b = d.blanks[i];
      lines[i].setColor('#e8e2d6');
      for (;;) {
        const opt = this.s.add.container(0, 0);
        c.add(opt);
        const o = b.options[await this.select(opt, 64, 320, b.options.map(x => x.label))];
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
      lines[i].setText(blankText(b, b.options.find(x => x.correct).label)).setColor('#d8c09a');
    }

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
  notebook(hintText) {
    return new Promise(resolve => {
      const tabs = ['소지품', '단서', '기억 조각', '생각하기'];
      // 목록은 구분선(y 104~404) 안에 ROWS줄만 보이고, 커서를 따라 스크롤된다
      const ROWS = 11;
      let tab = 0, idx = 0, first = 0;
      const c = this.fixed(this.s.add.container(0, 0), 180);
      c.add([
        this.s.add.rectangle(0, 0, W, H, 0x060608, 0.95).setOrigin(0),
        this.s.add.text(28, 20, '기억 노트', textStyle(20, '#c9a46a')),
        this.s.add.text(W - 28, 26, `기억 조각 ${state.fragments.length} / 8`, textStyle(13, '#8f8996')).setOrigin(1, 0),
        this.s.add.text(W / 2, H - 24, '←→ 탭   ↑↓ 선택   ESC 닫기', textStyle(13, '#9a94a3')).setOrigin(0.5),
        this.s.add.rectangle(230, 104, 1, 300, 0x2e2b34).setOrigin(0),
      ]);
      const tabTexts = tabs.map((t, i) => {
        const tx = this.s.add.text(28 + i * 110, 66, t, textStyle(14));
        c.add(tx);
        return tx;
      });
      const list = this.s.add.container(0, 0);
      const detail = this.s.add.text(250, 110, '', textStyle(14, '#d8d0c0', { wordWrap: { width: W - 290, useAdvancedWrap: true } }));
      const more = this.s.add.text(222, 410, '', textStyle(11, '#6d6875')).setOrigin(1, 0);
      c.add([list, detail, more]);

      const entries = () => {
        if (tab === 0) return state.items.map(id => DB.items[id]);
        if (tab === 1) return state.clues.map(id => DB.clues[id]);
        if (tab === 2) return state.fragments.map(n => ({ name: `조각 ${n} — ${DB.fragments[n].name}`, desc: DB.fragments[n].desc }));
        return [{ name: '지금 할 일', desc: hintText }];
      };
      const draw = () => {
        tabTexts.forEach((t, i) => t.setColor(i === tab ? '#ffffff' : '#6d6875'));
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
        else if (d === 'up') { if (idx > 0) { idx--; sfx('tick'); } }
        else if (d === 'down') { if (idx < last) { idx++; sfx('tick'); } }
        else if (e.code === 'Escape') { off(); c.destroy(); resolve(); return; }
        draw();
      });
      draw();
    });
  }
}
