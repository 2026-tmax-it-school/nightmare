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
// 가구·플레이어의 앞뒤 순서: 화면 아래쪽(앞)에 있을수록 위에 그린다. 바닥 장식(1)보다 위, 조사 표시(4)보다 아래.
const depthAt = (y, player = false) => 2 + y / 100 + (player ? 0.005 : 0);
// 그림이 아직 없는 타일은 비슷한 타일로 대신 그린다
const TILE_FALLBACK = { floor_pc: 'floor_tile' };

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

    this.tiles = this.grid.map((row, y) => row.map((ch, x) => this.add.image(cx(x), cx(y), this.tileTex(x, y)).setDepth(0)));
    // 문 칸 밑에 문 너머 바닥을 깔아, 열린 문의 빈 곳으로 바닥이 보이게 한다 (정면 문 = 위쪽 칸이 문 너머)
    this.grid.forEach((row, y) => row.forEach((ch, x) => {
      if (!(m.legend[ch] || '').startsWith('door')) return;
      const beyond = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]].find(([bx, by]) => this.isFloor(bx, by));
      // 문 너머는 어둡게 — 문짝(나무)과 구분되고 안쪽 공간처럼 보인다
      if (beyond) this.add.image(cx(x), cx(y), this.tileTex(...beyond)).setDepth(-1).setTint(0x55505a);
    }));
    this.buildRooms();
    this.objects = new Map();
    for (const o of m.objects) {
      const obj = { ...o };
      if (o.tex) {
        // 2칸 높이 가구(32×64)는 바닥 칸을 기준으로 위로 솟는다. 앞에 있는(아래쪽) 것이 뒤의 것을 가린다.
        obj.img = this.add.image(cx(o.x), (o.y + 1) * TILE, this.objTex(o)).setOrigin(0.5, 1).setDepth(depthAt(o.y));
      }
      if (o.door && flag('open_' + o.door)) this.tiles[o.y][o.x].setTexture('door_open');
      this.objects.set(key(o.x, o.y), obj);
    }
    this.buildRails();
    this.buildSparkles();
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
    this.player = this.add.image(cx(this.tx), cx(this.ty), 'player_' + this.dir).setDepth(depthAt(this.ty, true));

    const cam = this.cameras.main;
    const mw = this.cols * TILE, mh = this.rows * TILE;
    this.camFixedMap = mw <= W && mh <= H;
    if (this.camFixedMap) cam.centerOn(mw / 2, mh / 2);
    else { cam.setBounds(0, 0, mw, mh); this.camRoom = undefined; this.updateCamera(true); }

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
    this.updateRooms();
    this.updateObjective();
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
    if (!this.passable(nx, ny) || this.railBetween(this.tx, this.ty, nx, ny)) { this.updatePrompt(); return; }
    const gate = this.gateAt(nx, ny, dir);
    if (gate) return this.gateBlocked(gate, nx, ny);
    this.moving = true;
    this.tx = nx;
    this.ty = ny;
    // 아래로 갈 때 미리 앞쪽 깊이로 올려야 이동 중에 가구 밑으로 파고들지 않는다
    this.player.setDepth(depthAt(Math.max(ny, ny - dy), true));
    this.updatePrompt();
    this.steps = (this.steps || 0) + 1;
    if (this.steps % 2 === 0) sfx('step');
    this.tweens.add({
      targets: this.player, x: cx(nx), y: cx(ny), duration: MOVE_MS,
      onComplete: () => { this.moving = false; this.afterMove(); },
    });
  }

  // ── 층 이동 막기 (GDD 4.7, 스토리 건너뛰기 방지): map.gates의 칸에 dir 방향으로 들어서려 할 때 cond가 아니면 막고 독백을 띄운다 ──
  // 나올 때(반대 방향)는 막지 않는다. cond가 없으면 늘 막는다
  gateAt(x, y, dir) {
    return (this.map.gates || []).find(g => g.dir === dir && x >= g.x && x < g.x + (g.w || 1) && y >= g.y && y < g.y + (g.h || 1) && !(g.cond && checkCond(g.cond)));
  }

  gateBlocked(g, x, y) {
    this.updatePrompt();
    // 키를 누르고 있는 동안 매 프레임 다시 뜨지 않도록, 다른 칸으로 움직일 때까지 한 번만 알린다
    if (this.gateHit === key(x, y)) return;
    this.gateHit = key(x, y);
    sfx('thud');
    // 추격 중엔 대화창으로 시간을 멈추지 않고 알림만
    if (this.chase) this.ui.toast(g.text);
    else this.run([{ t: 'text', who: '재민', text: g.text }]);
  }

  // ── 그래픽 선택 ──
  isWall(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return true;
    return this.map.legend[this.grid[y][x]] === 'wall';
  }

  // ── 난간: 칸이 아니라 위아래 두 칸 사이의 경계를 막는다 (map.rails: { x, y, w } = y줄 아래쪽 경계) ──
  buildRails() {
    this.rails = new Set();
    for (const r of this.map.rails || []) {
      for (let x = r.x; x < r.x + (r.w || 1); x++) {
        this.rails.add(key(x, r.y));
        // 위쪽 칸(r.y)에 선 사람보다 앞에, 아래쪽 칸에 선 사람보다 뒤에 그린다
        const img = this.add.image(cx(x), (r.y + 1) * TILE, 'rail_h').setDepth(depthAt(r.y) + 0.008);
        this.objects.set('rail' + key(x, r.y), { x, y: r.y, img });
      }
    }
  }

  railBetween(x1, y1, x2, y2) {
    return x1 === x2 && Math.abs(y1 - y2) === 1 && this.rails?.has(key(x1, Math.min(y1, y2)));
  }

  isFloor(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    return (this.map.legend[this.grid[y][x]] || '').startsWith('floor');
  }

  // ── 방 단위 시야: 지금 있는 방(벽·문으로 나뉜 바닥 덩어리)과 그 둘레 벽만 보이고 나머지는 가린다 ──
  buildRooms() {
    this.room = this.grid.map(r => r.map(() => -1));
    this.roomBox = []; // 방마다 바닥 칸의 경계 상자 (카메라 고정용)
    let id = 0;
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      if (this.room[y][x] >= 0 || !this.isFloor(x, y)) continue;
      const q = [[x, y]];
      this.room[y][x] = id;
      const b = this.roomBox[id] = { x0: x, y0: y, x1: x, y1: y };
      while (q.length) {
        const [qx, qy] = q.pop();
        b.x0 = Math.min(b.x0, qx); b.x1 = Math.max(b.x1, qx);
        b.y0 = Math.min(b.y0, qy); b.y1 = Math.max(b.y1, qy);
        for (const [dx, dy] of Object.values(DIRS)) {
          const nx = qx + dx, ny = qy + dy;
          if (this.isFloor(nx, ny) && this.room[ny][nx] < 0) { this.room[ny][nx] = id; q.push([nx, ny]); }
        }
      }
      id++;
    }
    this.roomMask = this.add.graphics().setDepth(8);
    this.roomKey = null;
  }

  updateRooms() {
    const at = (x, y) => (x < 0 || y < 0 || x >= this.cols || y >= this.rows ? -1 : this.room[y][x]);
    // 문 칸에 서 있으면 양쪽 방을 모두 보여 준다
    let ids = [at(this.tx, this.ty)];
    if (ids[0] < 0) ids = Object.values(DIRS).map(([dx, dy]) => at(this.tx + dx, this.ty + dy));
    ids = [...new Set(ids.filter(i => i >= 0))].sort();
    const k = ids.join();
    if (!ids.length || k === this.roomKey) return;
    this.roomKey = k;
    const g = this.roomMask.clear().fillStyle(0x000000, 1);
    const shown = this.grid.map(r => r.map(() => false));
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      let seen = false;
      for (let dy = -1; dy <= 1 && !seen; dy++) for (let dx = -1; dx <= 1 && !seen; dx++) seen = ids.includes(at(x + dx, y + dy));
      shown[y][x] = seen;
      if (!seen) g.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    // 다른 방의 2칸 가구가 벽 칸으로 윗부분만 비치지 않도록, 바닥 칸이 가려진 가구는 통째로 숨긴다
    for (const o of this.objects?.values() || []) o.img?.setVisible(shown[o.y][o.x]);
    this.shown = shown;
    if (this.sparkles) this.updateSparkles();
    // 벽 앞면은 그 벽 아래 방에 있을 때만 앞면. 위쪽 방 안에서 보면 같은 벽이 윗면(두꺼운 벽)으로 보인다
    if (this.textures.exists('wall_face')) {
      for (let y = 0; y < this.rows - 1; y++) for (let x = 0; x < this.cols; x++) {
        const t = this.tiles[y][x];
        if (t.texture.key !== 'wall_face' && t.texture.key !== 'wall_top') continue;
        if (this.tileTex(x, y) !== 'wall_face') continue;
        t.setTexture(ids.includes(at(x, y + 1)) ? 'wall_face' : 'wall_top');
      }
    }
  }

  // ── 카메라: 화면에 다 들어오는 방에 들어서면 그 방을 화면 가운데에 고정하고(목표 패널·대화창에 가리지 않게),
  // 복도처럼 화면보다 큰 곳에선 플레이어를 따라간다. 문 칸에선 바꾸지 않는다. instant: 이동 없이 바로 맞춘다 ──
  updateCamera(instant = false) {
    if (this.camFixedMap) return;
    let id = this.room[this.ty]?.[this.tx] ?? -1;
    if (id < 0) { if (!instant) return; id = this.camRoom ?? -1; }
    const b = this.roomBox[id];
    const fits = !!b && (b.x1 - b.x0 + 1) * TILE <= W && (b.y1 - b.y0 + 1) * TILE <= H;
    const target = fits ? id : null;
    if (target === this.camRoom && !instant) return;
    this.camRoom = target;
    const cam = this.cameras.main;
    cam.stopFollow();
    if (fits) {
      // 맵 가장자리 방도 가운데에 오도록 경계를 끈다 (방 밖은 방 단위 시야로 가려져 있다)
      cam.useBounds = false;
      const x = (b.x0 + b.x1 + 1) * TILE / 2, y = (b.y0 + b.y1 + 1) * TILE / 2;
      if (instant) cam.centerOn(x, y);
      else cam.pan(x, y, 250, 'Sine.easeOut', true);
      return;
    }
    cam.useBounds = true;
    // lerp 1: 카메라가 늦게 따라오면 멈춘 뒤에도 화면이 미끄러져 한 발 더 가는 것처럼 느껴진다
    if (instant) { cam.startFollow(this.player, true, 1, 1); return; }
    const mw = this.cols * TILE, mh = this.rows * TILE;
    const px = Phaser.Math.Clamp(this.player.x, W / 2, mw - W / 2), py = Phaser.Math.Clamp(this.player.y, H / 2, mh - H / 2);
    cam.pan(px, py, 200, 'Sine.easeOut', true, (c, p) => {
      if (p === 1 && this.camRoom === null) cam.startFollow(this.player, true, 1, 1);
    });
  }

  // 벽: 아래가 바닥이면 앞면(정면에서 본 벽), 아니면 윗면 — 완성 그래픽이 있을 때만
  tileTex(x, y) {
    let tex = this.map.legend[this.grid[y][x]] || 'wall';
    if (!this.textures.exists(tex)) tex = TILE_FALLBACK[tex] || 'wall'; // 아직 그림이 없는 타일
    if (tex === 'floor_stairs') {
      // 2칸 폭 계단: 왼쪽·오른쪽 가장자리 그림이 있으면 쓴다
      const same = dx => this.map.legend[this.grid[y][x + dx]] === 'floor_stairs';
      if (!same(-1) && same(1) && this.textures.exists('floor_stairs_l')) return 'floor_stairs_l';
      if (same(-1) && !same(1) && this.textures.exists('floor_stairs_r')) return 'floor_stairs_r';
      return tex;
    }
    if (tex.startsWith('floor')) {
      // 같은 바닥의 낡은 변형(_2, _3)을 칸 위치로 정해 섞는다 — 매번 같은 자리에 같은 변형
      const r = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 100;
      const v = r < 9 ? '_2' : r < 18 ? '_3' : '';
      return v && this.textures.exists(tex + v) ? tex + v : tex;
    }
    if (tex !== 'wall' || !this.textures.exists('wall_face')) return tex;
    // 아래가 바닥일 때만 앞면. 세로 벽에 난 문·창(준비실 문, 2층 창) 위 칸은 윗면으로 둔다
    const below = y + 1 < this.rows && this.map.legend[this.grid[y + 1][x]];
    return below && below.startsWith('floor') ? 'wall_face' : 'wall_top';
  }

  // 사물함: 아래쪽 벽에 붙어 있으면 뒷면(지붕이 보이는 쪽)
  objTex(o) {
    if (o.tex === 'locker' && this.textures.exists('locker_back') && this.isWall(o.x, o.y + 1) && !this.isWall(o.x, o.y - 1)) return 'locker_back';
    return o.tex;
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
    this.gateHit = null;
    this.player.setDepth(depthAt(this.ty, true));
    this.updateRooms();
    this.updateCamera();
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

  // ── 반짝임 (GDD 4.7): 아직 조사하지 않은 물건은 멀리서도 보이게 작은 빛이 깜빡인다 ──
  // 같은 방의 같은 스크립트 물건(책상 16개, 피아노 좌우 등)은 하나로 묶어 대표 한 칸에만 띄운다.
  // 조사 결과의 갈래(if 조건들)가 마지막으로 본 때와 달라지면 다시 반짝인다 (예: 전화 후 알코올램프)
  buildSparkles() {
    this.sparkles = new Map();
    for (const o of this.objects.values()) {
      if (!o.script || o.hide) continue;
      const g = `${typeof o.script === 'string' ? o.script : key(o.x, o.y)}@${this.roomOf(o.x, o.y)}`;
      o.sparkleKey = g;
      if (this.sparkles.has(g)) continue;
      // 조사 표시(focus)와 같은 모서리 괄호가 반짝인다. 어둠(10) 아래에 그려 손전등 시야 밖에선 보이지 않는다
      const b = this.add.graphics().setDepth(9.7).setPosition(cx(o.x), cx(o.y));
      b.lineStyle(2, 0xffe2a0, 1);
      const h = TILE / 2 - 1, l = 7;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        b.lineBetween(sx * h, sy * h, sx * (h - l), sy * h);
        b.lineBetween(sx * h, sy * h, sx * h, sy * (h - l));
      }
      b.setAlpha(0.15);
      this.tweens.add({ targets: b, alpha: 0.85, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Phaser.Math.Between(0, 1400) });
      this.sparkles.set(g, { o, parts: [b] });
    }
  }

  // 벽·창 칸에 놓인 조사 지점은 맞닿은 바닥의 방으로 친다
  roomOf(x, y) {
    const at = (x, y) => (x < 0 || y < 0 || x >= this.cols || y >= this.rows ? -1 : this.room[y][x]);
    if (at(x, y) >= 0) return at(x, y);
    for (const [dx, dy] of Object.values(DIRS)) if (at(x + dx, y + dy) >= 0) return at(x + dx, y + dy);
    return -1;
  }

  // 스크립트가 지금 어느 갈래로 실행될지 (if 결과를 이어 붙인 문자열). choice·puzzle 안쪽은 보지 않는다
  scriptSig(list, depth = 0) {
    let s = '';
    for (const a of list || []) {
      if (a.t === 'if') { const ok = checkCond(a.cond); s += (ok ? 'T' : 'F') + this.scriptSig(ok ? a.then : a.else, depth + 1); }
      else if (a.t === 'call' && depth < 5) s += this.scriptSig(this.getScript(a.name), depth + 1);
    }
    return s;
  }

  seenOf() {
    state.seen ||= {};
    return (state.seen[this.mapId] ||= {});
  }

  updateSparkles() {
    const seen = this.seenOf();
    for (const [g, { o, parts }] of this.sparkles) {
      const fresh = this.interactable(o) && seen[g] !== this.scriptSig(this.resolve(o.script));
      const on = fresh && !this.hidden && !!this.shown?.[o.y]?.[o.x];
      parts.forEach(p => p.setVisible(on));
    }
  }

  // 조사: 스크립트가 끝난 뒤의 갈래를 본 것으로 기록한다 (조사하면서 바뀐 플래그까지 반영)
  async examine(o) {
    await this.run(this.resolve(o.script));
    if (!o.sparkleKey || this.over) return;
    this.seenOf()[o.sparkleKey] = this.scriptSig(this.resolve(o.script));
    this.updateSparkles();
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
      this.examine(o);
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
      cam.stopFollow();
      cam.useBounds = false;
      cam.pan(fx, Math.min(fy + 90, top + H / 2 - 50), 500, 'Sine.easeInOut');
    }
  }

  pastOff() {
    const layer = this.pastLayer || [];
    this.pastLayer = null;
    const cam = this.cameras.main;
    if (this.camFixedMap) { cam.useBounds = true; cam.centerOn(this.cols * TILE / 2, this.rows * TILE / 2); }
    else this.updateCamera(true); // 방 고정 / 따라가기를 원래대로
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
    this.updateObjective();
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
    await this.ui.notebook(this.hint(), this.progress());
    this.busy = false;
    this.updatePrompt();
  }

  hint() {
    const h = (DB.hints[this.mapId] || []).find(h => checkCond(h.cond));
    return h ? h.text : '……';
  }

  // 현재 장 = start 조건을 만족하는 마지막 장 (data/objectives.json)
  progress() {
    const ch = [...DB.objectives].reverse().find(c => checkCond(c.start));
    if (!ch) return null;
    const marks = ch.steps.map(s => !!s.done && checkCond(s.done));
    return { ch, marks, done: marks.filter(Boolean).length, total: marks.length };
  }

  // 진행이 바뀔 때마다(스크립트·사물함·추격 후) 목표 패널과 반짝임을 함께 갱신한다
  updateObjective() {
    this.ui.objective(this.progress(), this.hint());
    this.ui.obj.c.setVisible(!this.hidden);
    this.updateSparkles();
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
        if (dist.has(key(nx, ny)) || !this.passable(nx, ny) || this.railBetween(x, y, nx, ny)) continue;
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
    this.updateObjective();
    this.lockerView = new LockerView(this, o.view);
  }

  exitLocker() {
    this.hidden = false;
    sfx('locker');
    this.player.setVisible(true);
    this.lockerView?.destroy();
    this.lockerView = null;
    this.updatePrompt();
    this.updateObjective();
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
      const opts = Object.values(DIRS).map(([dx, dy]) => [c.x + dx, c.y + dy]).filter(([x, y]) => this.passable(x, y) && !this.railBetween(c.x, c.y, x, y));
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
        if (this.railBetween(x, y, nx, ny)) continue;
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
    else this.updateObjective();
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
