// 탑뷰 탐색: 칸 단위 이동, 조사, 문, 트리거, 손전등 어둠, 사물함 숨기, 그림자 추격
import { TILE, W, H } from '../constants.js';
import { DB } from '../db.js';
import { state, flag, setFlag, saveGame, checkCond } from '../state.js';
import { runScript } from '../script.js';
import { UI, textStyle, isConfirm, dirOf } from '../ui/ui.js';
import { sfx, startLoop, stopLoop, stopAllLoops } from '../audio.js';
import { LockerView } from '../ui/locker.js';

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const key = (x, y) => `${x},${y}`;
const cx = t => t * TILE + TILE / 2;

const MOVE_MS = 150;
const CHASE_STEP_MS = 250;
const CHASE_GIVE_UP_MS = 4500;
// 부정 수치 (GDD 4.4)
const DENIAL_HAUNT = 30;   // 이상이면 가끔 환각
const DENIAL_PHANTOM = 60; // 이상이면 환각 때 그림자 환영도
const DENIAL_MAX = 100;    // 붙잡힘
const HAUNT_EVERY_S = 30;  // 환각 최소 간격(초), 여기에 0~15초를 더한다

export default class Explore extends Phaser.Scene {
  constructor() { super('Explore'); }

  // data.pos: 층 이동 등으로 다른 맵에서 넘어올 때의 도착 칸 ({ x, y, dir })
  init(data) {
    this.mapId = data.map || state.map;
    this.arrive = data.pos || null;
  }

  create() {
    const m = this.map = DB.maps[this.mapId];
    const resume = state.map === this.mapId && state.pos;
    state.map = this.mapId;
    this.grid = m.grid.map(r => [...r]);
    this.cols = this.grid[0].length;
    this.rows = this.grid.length;
    this.solid = new Set(m.solid);
    this.busy = false;
    this.moving = false;
    this.hidden = false;
    this.over = false;
    this.chase = null;
    this.areaName = null;
    this.ui = new UI(this);

    this.tiles = this.grid.map((row, y) => row.map((ch, x) => this.add.image(cx(x), cx(y), m.legend[ch] || 'wall').setDepth(0)));
    this.objects = new Map();
    for (const o of m.objects) {
      const obj = { ...o };
      if (o.tex) obj.img = this.add.image(cx(o.x), cx(o.y), o.tex).setDepth(2);
      if (o.door && flag('open_' + o.door)) this.tiles[o.y][o.x].setTexture('door_open');
      this.objects.set(key(o.x, o.y), obj);
    }
    this.decals = (m.graffiti || []).map(g => {
      const t = this.add.text(g.x * TILE, g.y * TILE, g.text, textStyle(15, '#8e1616', { fontStyle: 'bold' }))
        .setDepth(1).setAlpha(0.85).setAngle(g.angle ?? 0);
      t.cond = g.cond;
      return t;
    });
    // 학교 변화 단계에 따라 나타나는 바닥 장식 (그을음 등)
    this.decor = (m.decor || []).map(d => {
      const img = this.add.image(cx(d.x), cx(d.y), d.tex).setDepth(1);
      img.cond = d.cond;
      return img;
    });

    const pos = this.arrive || (resume ? state.pos : m.spawn);
    this.tx = pos.x;
    this.ty = pos.y;
    this.dir = (this.arrive ? this.arrive.dir : resume ? state.dir : m.spawn.dir) || 'down';
    // 도착 직후 저장해도 이전 맵의 좌표가 남지 않도록 바로 기록
    state.pos = { x: this.tx, y: this.ty };
    state.dir = this.dir;
    this.player = this.add.image(cx(this.tx), cx(this.ty), 'player_' + this.dir).setDepth(3);

    const cam = this.cameras.main;
    const mw = this.cols * TILE, mh = this.rows * TILE;
    if (mw <= W && mh <= H) cam.centerOn(mw / 2, mh / 2);
    // lerp 1: 카메라가 늦게 따라오면 멈춘 뒤에도 화면이 미끄러져 한 발 더 가는 것처럼 느껴진다
    else { cam.setBounds(0, 0, mw, mh); cam.startFollow(this.player, true, 1, 1); }

    if (m.ambient) {
      this.add.rectangle(0, 0, mw, mh, Phaser.Display.Color.HexStringToColor(m.ambient.color).color, m.ambient.alpha).setOrigin(0).setDepth(9);
    }
    if (m.dark) this.dark = this.add.renderTexture(0, 0, mw, mh).setOrigin(0).setDepth(10);
    this.tint = this.add.rectangle(0, 0, W, H, 0x5a0000, 0).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.promptTxt = this.add.text(0, 0, 'E', textStyle(11, '#111111', { backgroundColor: '#d8cfb4', padding: { x: 4, y: 1 } }))
      .setOrigin(0.5).setDepth(12).setVisible(false);
    // 조사 대상 칸 표시: 모서리 괄호 테두리가 은은하게 깜빡인다
    this.focus = this.add.graphics().setDepth(4).setVisible(false);
    this.focus.lineStyle(2, 0xd8cfb4, 1);
    const h = TILE / 2, l = 9;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.focus.lineBetween(sx * h, sy * h, sx * (h - l), sy * h);
      this.focus.lineBetween(sx * h, sy * h, sx * h, sy * (h - l));
    }
    this.tweens.add({ targets: this.focus, alpha: 0.4, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.areaTxt = this.add.text(14, 12, '', textStyle(13, '#a8a1b0', { backgroundColor: 'rgba(0,0,0,0.55)', padding: { x: 8, y: 4 } }))
      .setScrollFactor(0).setDepth(95).setAlpha(0);

    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.input.keyboard.on('keydown', this.onKey, this);
    this.events.on('denial', this.applyStage, this);
    this.events.once('shutdown', () => {
      this.input.keyboard.off('keydown', this.onKey, this);
      this.chaseTimer?.remove();
      stopLoop('chase');
    });

    stopAllLoops([m.bgm]);
    if (m.bgm) startLoop(m.bgm);
    this.applyStage();
    this.updatePrompt();
    this.updateArea();
    this.haunt = 0;
    this.time.addEvent({ delay: 1000, loop: true, callback: this.denialTick, callbackScope: this });
    cam.fadeIn(500);
    this.time.delayedCall(550, () => this.runEnter());
  }

  update() {
    if (this.dark) this.drawDark();
    this.lockerView?.update(this.chase, this.tx, this.ty);
    // 위를 볼 때는 머리 위 E가 조사 대상을 가리므로 대상 칸 위로 올린다
    if (this.promptTxt.visible) {
      if (this.dir === 'up') this.promptTxt.setPosition(this.focus.x, this.focus.y - 26);
      else this.promptTxt.setPosition(this.player.x, this.player.y - 26);
    }
    if (this.busy || this.moving || this.hidden || this.over) return;
    const k = this.keys;
    const dir = (k.UP.isDown || k.W.isDown) ? 'up'
      : (k.DOWN.isDown || k.S.isDown) ? 'down'
      : (k.LEFT.isDown || k.A.isDown) ? 'left'
      : (k.RIGHT.isDown || k.D.isDown) ? 'right' : null;
    if (dir) this.tryMove(dir);
  }

  drawDark() {
    const rt = this.dark;
    rt.clear();
    rt.fill(0x000000, 1); // 부분 알파는 WebGL에서 훨씬 밝게 나와서 완전한 어둠 + 손전등 그라데이션으로 처리
    if (flag('stage1') && Math.random() < 0.01) return; // 손전등이 깜빡인다
    const [tex, r] = this.hidden ? ['light_s', 70] : ['light', 170];
    rt.erase(tex, this.player.x - r, this.player.y - r);
  }

  // ── 이동 ──
  face(dir) {
    this.dir = dir;
    state.dir = dir;
    this.player.setTexture('player_' + dir);
  }

  tryMove(dir) {
    if (this.dir !== dir) this.face(dir);
    const [dx, dy] = DIRS[dir];
    const nx = this.tx + dx, ny = this.ty + dy;
    if (this.chase && this.chase.x === nx && this.chase.y === ny) return this.caught();
    if (!this.passable(nx, ny)) { this.updatePrompt(); return; }
    this.moving = true;
    this.tx = nx;
    this.ty = ny;
    this.updatePrompt();
    this.steps = (this.steps || 0) + 1;
    if (this.steps % 2 === 0) sfx('step');
    this.tweens.add({
      targets: this.player, x: cx(nx), y: cx(ny), duration: MOVE_MS,
      onComplete: () => { this.moving = false; this.afterMove(); },
    });
  }

  passable(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    const o = this.objects.get(key(x, y));
    if (o) {
      if (o.door) return flag('open_' + o.door);
      if (o.tex && o.solid !== false) return false;
    }
    return !this.solid.has(this.grid[y][x]);
  }

  afterMove() {
    state.pos = { x: this.tx, y: this.ty };
    state.dir = this.dir;
    if (this.chase && this.chase.x === this.tx && this.chase.y === this.ty) return this.caught();
    this.updatePrompt();
    this.updateArea();
    this.pastNotice();
    for (const t of this.map.triggers || []) {
      const inside = this.tx >= t.x && this.tx < t.x + t.w && this.ty >= t.y && this.ty < t.y + t.h;
      // once가 없는 트리거(계단 등)는 그 칸에 들어설 때마다 실행된다
      if (inside && !(t.once && flag(t.once)) && checkCond(t.cond)) {
        if (t.once) setFlag(t.once);
        this.run(this.resolve(t.script));
        break;
      }
    }
  }

  updateArea() {
    const a = (this.map.areas || []).find(a => this.tx >= a.x && this.tx < a.x + a.w && this.ty >= a.y && this.ty < a.y + a.h);
    if (!a || a.name === this.areaName) return;
    this.areaName = a.name;
    this.areaTxt.setText(a.name);
    this.tweens.killTweensOf(this.areaTxt);
    this.areaTxt.setAlpha(1);
    this.tweens.add({ targets: this.areaTxt, alpha: 0, delay: 1800, duration: 600 });
  }

  // ── 조사 ──
  frontObj() {
    const [dx, dy] = DIRS[this.dir];
    return this.objects.get(key(this.tx + dx, this.ty + dy));
  }

  interactable(o) {
    return !!o && (o.hide || (o.script && !(o.door && flag('open_' + o.door))));
  }

  updatePrompt() {
    const o = this.frontObj();
    const on = !this.hidden && !this.busy && this.interactable(o);
    this.promptTxt.setVisible(on);
    this.focus.setVisible(on);
    if (on) this.focus.setPosition(cx(o.x), cx(o.y));
  }

  onKey(e) {
    if (this.busy || this.moving || this.over) return;
    const dir = dirOf(e);
    // 키를 누르고 있는 동안의 이동은 update()가 맡는다. OS 키 반복까지 받으면 뗀 직후 한 칸 더 갈 수 있다.
    if (dir) { if (!this.hidden && !e.repeat) this.tryMove(dir); return; }
    if (isConfirm(e)) {
      if (this.hidden) return this.exitLocker();
      const o = this.frontObj();
      if (!this.interactable(o)) return;
      if (o.hide) return this.enterLocker(o);
      this.run(this.resolve(o.script));
    } else if (e.code === 'Escape' && !this.hidden && !this.chase) {
      this.openNotebook();
    } else if (e.code === 'KeyQ' && !this.hidden && !this.chase) {
      this.tryPast();
    }
  }

  // ── 과거 겹쳐보기 (GDD 4.5): 부적을 얻은 뒤, 맵의 past 구역에서 Q ──
  pastHere() {
    return (this.map.past || []).find(p => this.tx >= p.x && this.tx < p.x + p.w && this.ty >= p.y && this.ty < p.y + p.h && checkCond(p.cond));
  }

  tryPast() {
    if (!flag('pastSight')) return;
    const p = this.pastHere();
    if (!p) { this.ui.toast('……여기선 아무것도 겹쳐 보이지 않는다.'); return; }
    this.run([{ t: 'pastOn', id: p.id }, ...p.script, { t: 'pastOff' }, { t: 'flag', key: p.flag }]);
  }

  // 아직 보지 않은 구역에 들어서면 부적이 반응한다
  pastNotice() {
    const p = flag('pastSight') && this.pastHere();
    const id = p && !flag(p.flag) ? p.id : null;
    if (id && id !== this.pastNoticed) { sfx('chime'); this.ui.toast('부적이 뜨거워진다… (Q: 과거 겹쳐보기)'); }
    this.pastNoticed = id;
  }

  pastOn(id) {
    const p = this.map.past.find(p => p.id === id);
    sfx('glitch');
    this.cameras.main.flash(300, 200, 180, 140);
    this.dark?.setVisible(false);
    const layer = [this.add.rectangle(0, 0, W, H, 0x6b5a3a, 0.5).setOrigin(0).setScrollFactor(0).setDepth(9.5)];
    for (const f of p.figures || []) {
      layer.push(this.add.image(cx(f.x), cx(f.y), f.tex || 'past_fig').setDepth(9.6));
      if (f.label) layer.push(this.add.text(cx(f.x), cx(f.y) - 24, f.label, textStyle(11, '#f0e2c0')).setOrigin(0.5, 1).setDepth(9.7));
    }
    for (const o of layer) { const a = o.alpha; o.setAlpha(0); this.tweens.add({ targets: o, alpha: a, duration: 500 }); }
    this.pastLayer = layer;
    // 맵 가장자리 방(과학실 등)에선 인물이 대화창에 가려지므로, 인물들이 화면 위쪽에 오도록 카메라를 옮긴다
    const figs = p.figures || [];
    if (figs.length) {
      const cam = this.cameras.main;
      const fx = figs.reduce((s, f) => s + cx(f.x), 0) / figs.length;
      const fy = figs.reduce((s, f) => s + cx(f.y), 0) / figs.length;
      const top = Math.min(...figs.map(f => cx(f.y))); // 가장 위 인물의 이름표가 화면 밖으로 나가지 않게
      this.pastFollow = !!cam._follow;
      cam.stopFollow();
      cam.useBounds = false;
      cam.pan(fx, Math.min(fy + 90, top + H / 2 - 50), 500, 'Sine.easeInOut');
    }
  }

  pastOff() {
    const layer = this.pastLayer || [];
    this.pastLayer = null;
    const cam = this.cameras.main;
    cam.useBounds = true;
    if (this.pastFollow) cam.startFollow(this.player, true, 1, 1);
    else cam.centerOn(this.cols * TILE / 2, this.rows * TILE / 2);
    this.pastFollow = false;
    this.dark?.setVisible(true);
    sfx('glitch');
    this.tweens.add({ targets: layer, alpha: 0, duration: 400, onComplete: () => layer.forEach(o => o.destroy()) });
  }

  // 도윤의 귀신: 잠시 나타났다가 사라진다 (어둠 위에 보이도록 depth를 높인다)
  ghost(a) {
    const g = this.add.image(cx(a.x), cx(a.y), 'ghost').setDepth(10.5).setAlpha(0);
    this.ui.hideDialog(); // 맵 아래쪽 방에선 대화창이 귀신을 가린다
    sfx('whisper');
    return new Promise(r => this.tweens.add({
      targets: g, alpha: 0.85, duration: 900, hold: a.hold || 1800, yoyo: true,
      onComplete: () => { g.destroy(); r(); },
    }));
  }

  resolve(s) { return typeof s === 'string' ? this.map.scripts[s] : s; }
  getScript(name) { return this.map.scripts[name]; }

  async run(list) {
    this.busy = true;
    this.updatePrompt();
    if ((await runScript(this, list)) === 'stop') return;
    this.ui.hideDialog();
    this.busy = false;
    this.updatePrompt();
  }

  async runEnter() {
    const list = [];
    const e = this.map.onEnter;
    if (e && !flag(e.once)) { setFlag(e.once); list.push(...e.script); }
    // 조건부 진입 이벤트 (예: 옥상 이후 1층 귀환)
    for (const c of this.map.onEnterIf || []) {
      if (!flag(c.once) && checkCond(c.cond)) { setFlag(c.once); list.push(...c.script); }
    }
    if (state.flags.pendingChase) list.push({ t: 'text', text: '……발소리가 다가온다.' }, { t: 'resumeChase' });
    if (list.length) await this.run(list);
  }

  async openNotebook() {
    this.busy = true;
    this.updatePrompt();
    sfx('beep');
    await this.ui.notebook(this.hint());
    this.busy = false;
    this.updatePrompt();
  }

  hint() {
    const h = (DB.hints[this.mapId] || []).find(h => checkCond(h.cond));
    return h ? h.text : '……';
  }

  // ── 스크립트 전용 동작 ──
  action(a) {
    switch (a.t) {
      case 'openDoor': return this.openDoor(a.id);
      case 'stage': setFlag('stage' + a.n); this.applyStage(); return;
      case 'chase':
        // 추격 직전 자동저장 → 잡히면 여기서 재시작
        setFlag('pendingChase', { id: a.id, spawn: a.spawn, after: a.after || null, step: a.step || null });
        saveGame();
        this.ui.toast('자동 저장됨');
        return this.startChase();
      case 'resumeChase': return this.startChase();
      case 'pastOn': return this.pastOn(a.id);
      case 'pastOff': return this.pastOff();
      case 'ghost': return this.ghost(a);
    }
  }

  goto(a) {
    this.busy = true;
    const cam = this.cameras.main;
    cam.fadeOut(600);
    cam.once('camerafadeoutcomplete', () => this.scene.start(a.scene, a));
  }

  openDoor(id) {
    setFlag('open_' + id);
    sfx('unlock');
    for (const o of this.objects.values()) if (o.door === id) this.tiles[o.y][o.x].setTexture('door_open');
  }

  applyStage() {
    this.tint.setFillStyle(0x5a0000, (flag('stage1') ? 0.1 : 0) + (flag('stage2') ? 0.08 : 0) + state.denial / 400);
    this.decals.forEach(d => d.setVisible(checkCond(d.cond)));
    this.decor.forEach(d => d.setVisible(checkCond(d.cond)));
  }

  // ── 부정 수치: 높을수록 환각, 최대치면 붙잡힌다 ──
  denialTick() {
    if (this.over || !this.map.dark) return;
    if (state.denial >= DENIAL_MAX) {
      if (!this.busy && !this.hidden) this.caught();
      return;
    }
    if (this.busy || this.hidden || this.chase || state.denial < DENIAL_HAUNT) return;
    if (++this.haunt < HAUNT_EVERY_S) return;
    this.haunt = -Phaser.Math.Between(0, 15);
    sfx('follow');
    this.ui.glitch(250);
    if (state.denial >= DENIAL_PHANTOM) this.phantom();
  }

  // 손전등 빛 가장자리의 빈 칸에 그림자가 잠깐 서 있다 사라진다 (쫓아오지 않음)
  // 벽 너머에 나타나지 않도록 걸어서 4~6칸 거리인 칸만 고른다
  phantom() {
    const dist = new Map([[key(this.tx, this.ty), 0]]);
    const q = [[this.tx, this.ty]];
    const spots = [];
    while (q.length) {
      const [x, y] = q.shift();
      const d = dist.get(key(x, y));
      if (d >= 4) spots.push([x, y]);
      if (d >= 6) continue;
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx, ny = y + dy;
        if (dist.has(key(nx, ny)) || !this.passable(nx, ny)) continue;
        dist.set(key(nx, ny), d + 1);
        q.push([nx, ny]);
      }
    }
    if (!spots.length) return;
    const [x, y] = Phaser.Utils.Array.GetRandom(spots);
    const s = this.add.image(cx(x), cx(y), 'shadow').setDepth(3).setAlpha(0);
    this.tweens.add({ targets: s, alpha: 0.85, duration: 400, hold: 900, yoyo: true, onComplete: () => s.destroy() });
  }

  // ── 사물함 ──
  enterLocker(o) {
    this.hidden = true;
    sfx('locker');
    this.player.setVisible(false);
    this.updatePrompt();
    this.lockerView = new LockerView(this, o.view);
  }

  exitLocker() {
    this.hidden = false;
    sfx('locker');
    this.player.setVisible(true);
    this.lockerView?.destroy();
    this.lockerView = null;
    this.updatePrompt();
  }

  // ── 추격 ──
  startChase() {
    const pc = state.flags.pendingChase;
    if (!pc || this.chase) return;
    const sprite = this.add.image(cx(pc.spawn.x), cx(pc.spawn.y), 'shadow').setDepth(3).setAlpha(0);
    this.tweens.add({ targets: sprite, alpha: 0.95, duration: 500 });
    // step: 그림자가 한 칸 움직이는 시간(ms). 추격마다 다르게 줄 수 있다 (GDD 4.6)
    this.chase = { x: pc.spawn.x, y: pc.spawn.y, sprite, lost: 0, step: pc.step || CHASE_STEP_MS };
    startLoop('chase');
    this.chaseTimer = this.time.addEvent({ delay: this.chase.step, loop: true, callback: this.chaseStep, callbackScope: this });
  }

  chaseStep() {
    const c = this.chase;
    if (!c || this.busy || this.over) return;
    let next;
    if (this.hidden) {
      // 숨은 동안엔 주변을 서성이다 사라진다
      c.lost += c.step;
      if (c.lost >= CHASE_GIVE_UP_MS) return this.endChase();
      const opts = Object.values(DIRS).map(([dx, dy]) => [c.x + dx, c.y + dy]).filter(([x, y]) => this.passable(x, y));
      next = opts.length ? Phaser.Utils.Array.GetRandom(opts) : null;
    } else {
      c.lost = 0;
      next = this.pathStep(c.x, c.y, this.tx, this.ty);
    }
    if (!next) return;
    [c.x, c.y] = next;
    sfx('thud');
    this.tweens.add({ targets: c.sprite, x: cx(c.x), y: cx(c.y), duration: c.step - 20 });
    if (!this.hidden && c.x === this.tx && c.y === this.ty) this.caught();
  }

  // BFS로 목표까지의 다음 한 칸
  pathStep(sx, sy, gx, gy) {
    const prev = new Map([[key(sx, sy), null]]);
    const q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === gx && y === gy) break;
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (prev.has(k)) continue;
        if (!(nx === gx && ny === gy) && !this.passable(nx, ny)) continue;
        prev.set(k, [x, y]);
        q.push([nx, ny]);
      }
    }
    if (!prev.has(key(gx, gy))) return null;
    let cur = [gx, gy];
    for (;;) {
      const p = prev.get(key(cur[0], cur[1]));
      if (!p) return null;
      if (p[0] === sx && p[1] === sy) return cur;
      cur = p;
    }
  }

  endChase() {
    const c = this.chase;
    const pc = state.flags.pendingChase;
    this.chaseTimer.remove();
    this.chase = null;
    stopLoop('chase');
    this.tweens.add({ targets: c.sprite, alpha: 0, duration: 600, onComplete: () => c.sprite.destroy() });
    setFlag(pc.id + '_done');
    setFlag('pendingChase', null);
    saveGame();
    if (pc.after) this.run(this.getScript(pc.after));
  }

  caught() {
    if (this.over) return;
    this.over = true;
    this.busy = true;
    this.chaseTimer?.remove();
    stopLoop('chase');
    sfx('slam');
    const cam = this.cameras.main;
    cam.shake(400, 0.02);
    cam.flash(300, 120, 0, 0);
    this.time.delayedCall(700, () => {
      cam.fadeOut(500);
      cam.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
    });
  }
}
