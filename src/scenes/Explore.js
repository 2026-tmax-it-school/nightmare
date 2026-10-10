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

export default class Explore extends Phaser.Scene {
  constructor() { super('Explore'); }

  init(data) { this.mapId = data.map || state.map; }

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

    const pos = resume ? state.pos : m.spawn;
    this.tx = pos.x;
    this.ty = pos.y;
    this.dir = (resume ? state.dir : m.spawn.dir) || 'down';
    this.player = this.add.image(cx(this.tx), cx(this.ty), 'player_' + this.dir).setDepth(3);

    const cam = this.cameras.main;
    const mw = this.cols * TILE, mh = this.rows * TILE;
    if (mw <= W && mh <= H) cam.centerOn(mw / 2, mh / 2);
    else { cam.setBounds(0, 0, mw, mh); cam.startFollow(this.player, true, 0.2, 0.2); }

    if (m.ambient) {
      this.add.rectangle(0, 0, mw, mh, Phaser.Display.Color.HexStringToColor(m.ambient.color).color, m.ambient.alpha).setOrigin(0).setDepth(9);
    }
    if (m.dark) this.dark = this.add.renderTexture(0, 0, mw, mh).setOrigin(0).setDepth(10);
    this.tint = this.add.rectangle(0, 0, W, H, 0x5a0000, 0).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.promptTxt = this.add.text(0, 0, 'E', textStyle(11, '#111111', { backgroundColor: '#d8cfb4', padding: { x: 4, y: 1 } }))
      .setOrigin(0.5).setDepth(12).setVisible(false);
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
    cam.fadeIn(500);
    this.time.delayedCall(550, () => this.runEnter());
  }

  update() {
    if (this.dark) this.drawDark();
    this.lockerView?.update(this.chase, this.tx, this.ty);
    if (this.promptTxt.visible) this.promptTxt.setPosition(this.player.x, this.player.y - 26);
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
    for (const t of this.map.triggers || []) {
      const inside = this.tx >= t.x && this.tx < t.x + t.w && this.ty >= t.y && this.ty < t.y + t.h;
      if (inside && !flag(t.once) && checkCond(t.cond)) {
        setFlag(t.once);
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
    this.promptTxt.setVisible(!this.hidden && !this.busy && this.interactable(this.frontObj()));
  }

  onKey(e) {
    if (this.busy || this.moving || this.over) return;
    const dir = dirOf(e);
    if (dir) { if (!this.hidden) this.tryMove(dir); return; }
    if (isConfirm(e)) {
      if (this.hidden) return this.exitLocker();
      const o = this.frontObj();
      if (!this.interactable(o)) return;
      if (o.hide) return this.enterLocker();
      this.run(this.resolve(o.script));
    } else if (e.code === 'Escape' && !this.hidden && !this.chase) {
      this.openNotebook();
    }
  }

  resolve(s) { return typeof s === 'string' ? this.map.scripts[s] : s; }
  getScript(name) { return this.map.scripts[name]; }

  async run(list) {
    this.busy = true;
    this.promptTxt.setVisible(false);
    if ((await runScript(this, list)) === 'stop') return;
    this.ui.hideDialog();
    this.busy = false;
    this.updatePrompt();
  }

  async runEnter() {
    const list = [];
    const e = this.map.onEnter;
    if (e && !flag(e.once)) { setFlag(e.once); list.push(...e.script); }
    if (state.flags.pendingChase) list.push({ t: 'text', text: '……발소리가 다가온다.' }, { t: 'resumeChase' });
    if (list.length) await this.run(list);
  }

  async openNotebook() {
    this.busy = true;
    this.promptTxt.setVisible(false);
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
        setFlag('pendingChase', { id: a.id, spawn: a.spawn, after: a.after || null });
        saveGame();
        this.ui.toast('자동 저장됨');
        return this.startChase();
      case 'resumeChase': return this.startChase();
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
    this.tint.setFillStyle(0x5a0000, (flag('stage1') ? 0.1 : 0) + state.denial / 400);
    this.decals.forEach(d => d.setVisible(checkCond(d.cond)));
  }

  // ── 사물함 ──
  enterLocker() {
    this.hidden = true;
    sfx('locker');
    this.player.setVisible(false);
    this.promptTxt.setVisible(false);
    this.lockerView = new LockerView(this);
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
    this.chase = { x: pc.spawn.x, y: pc.spawn.y, sprite, lost: 0 };
    startLoop('chase');
    this.chaseTimer = this.time.addEvent({ delay: CHASE_STEP_MS, loop: true, callback: this.chaseStep, callbackScope: this });
  }

  chaseStep() {
    const c = this.chase;
    if (!c || this.busy || this.over) return;
    let next;
    if (this.hidden) {
      // 숨은 동안엔 주변을 서성이다 사라진다
      c.lost += CHASE_STEP_MS;
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
    this.tweens.add({ targets: c.sprite, x: cx(c.x), y: cx(c.y), duration: CHASE_STEP_MS - 20 });
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
