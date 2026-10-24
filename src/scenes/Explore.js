// 탑뷰 탐색: 칸 단위 이동, 조사, 문, 트리거, 손전등 어둠, 사물함 숨기, 그림자 추격
import { TILE, W, H } from '../constants.js';
import { DB } from '../db.js';
import { state, flag, setFlag, saveGame, checkCond, guiltLevel } from '../state.js';
import { runScript } from '../script.js';
import { UI, textStyle, isConfirm, dirOf } from '../ui/ui.js';
import { sfx, startLoop, stopLoop, stopAllLoops } from '../audio.js';
import { LockerView } from '../ui/locker.js';
import { holdBreath, struggle, eyesShut } from '../ui/hideGame.js';
import { MirrorView } from '../ui/mirror.js';
import { StallView } from '../ui/stall.js';
import { PhotoView } from '../ui/photo.js';

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const key = (x, y) => `${x},${y}`;
const cx = t => t * TILE + TILE / 2;
// 가구·플레이어의 앞뒤 순서: 화면 아래쪽(앞)에 있을수록 위에 그린다. 바닥 장식(1)보다 위, 조사 표시(4)보다 아래.
const depthAt = (y, player = false) => 2 + y / 100 + (player ? 0.005 : 0);
// 그림이 아직 없는 타일은 비슷한 타일로 대신 그린다
const TILE_FALLBACK = { floor_pc: 'floor_tile' };

const MOVE_MS = 150;
const WINDOW_PANES = [[6, 3, 9, 14], [18, 3, 8, 14]]; // 창 그림(window_home) 유리 두 칸 [x, y, w, h] — 비가 내리는 곳
const SIGHT_R = 640;      // 레이캐스팅 시야 거리(px). 어두운 맵에선 손전등이 실제 범위를 정한다
const SIGHT_EPS = 0.0005; // 벽 모서리 양옆으로 쏘는 광선의 각도 차 — 모서리 너머까지 시야가 이어진다
const WALL_TOP_TINT = 0x9aa6bc; // 위에서 내려다본 벽 줄의 문·창 색조 — 그림은 알아보이되 그늘진 벽 윗면과 어울리게
const CAM_EASE_MS = 350; // 방 고정 ↔ 따라가기 전환 시간
const CHASE_STEP_MS = 250;
const CHASE_WANDER_MS = 2500; // 숨은 뒤 그림자가 주변을 서성이는 시간
const CHASE_LEAVE_DIST = 10;  // 서성인 뒤 숨은 곳에서 이 칸 수 이상 떨어진 복도까지 걸어 나가 사라진다
// 그림자 소리 (GDD 4.6): 이 칸 수보다 멀면 들리지 않는다. 숨소리 간격은 멀 때 → 가까울 때
const SHADOW_HEAR = 12;
const BREATH_FAR_MS = 1800, BREATH_NEAR_MS = 800;
// 부정 수치 (GDD 4.4)
const DENIAL_HAUNT = 30;   // 이상이면 가끔 환각
const DENIAL_PHANTOM = 60; // 이상이면 환각 때 그림자 환영도
const DENIAL_MAX = 100;    // 붙잡힘
const HAUNT_EVERY_S = 30;  // 환각 최소 간격(초), 여기에 0~15초를 더한다
// 죄책감 (GDD 4.4-2): 단계별 환청 간격(초) [최소, 최대] / 3단계 키 반전 간격(초)·지속(ms)
const GUILT_HAUNT_S = { 2: [35, 55], 3: [18, 30] };
const GUILT_INVERT_EVERY_S = [45, 75];
const GUILT_INVERT_MS = 2500;
const GUILT_CALM_S = 10; // 대화·이벤트·추격이 끝난 뒤 죄책감 연출을 쉬는 시간(초)
// 환청과 함께 화면에 잠깐 떠오르는 목소리 (도윤 / 가해자들)
const GUILT_VOICES = ['……재민아.', '거기 있지?', '문 열어 줘.', '약속했잖아.', '왜 모른 척했어?', '야, 윤재민. 너도 웃기지?', '너도 웃었잖아.', '그냥 가자. 아무도 몰라.'];

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

    this.tiles = this.grid.map((row, y) => row.map((ch, x) => {
      const rotation = (m.tileRotations || []).find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      return this.add.image(cx(x), cx(y), this.tileTex(x, y)).setAngle(rotation?.angle || 0).setDepth(0);
    }));
    // 문 칸 밑에 문 너머 바닥을 깔아, 열린 문의 빈 곳으로 바닥이 보이게 한다 (정면 문 = 위쪽 칸이 문 너머)
    this.grid.forEach((row, y) => row.forEach((ch, x) => {
      if (!(m.legend[ch] || '').startsWith('door')) return;
      const beyond = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]].find(([bx, by]) => this.isFloor(bx, by));
      // 문 너머는 어둡게 — 문짝(나무)과 구분되고 안쪽 공간처럼 보인다
      if (beyond) this.add.image(cx(x), cx(y), this.tileTex(...beyond)).setDepth(-1).setTint(0x55505a);
    }));
    this.buildRooms();
    this.objects = new Map();
    this.condObjs = []; // cond가 있는 물건: 조건이 맞을 때만 맵에 놓인다 (syncObjects)
    for (const o of m.objects) {
      const obj = { ...o };
      // 밀 수 있는 물건(push): 민 자리는 플래그 push_<id>에 남는다
      if (o.push) {
        obj.home = [o.x, o.y];
        const at = state.flags['push_' + o.id];
        if (at) [obj.x, obj.y] = at;
      }
      if (o.tex) {
        // 2칸 높이 가구(32×64)는 바닥 칸을 기준으로 위로 솟는다. 앞에 있는(아래쪽) 것이 뒤의 것을 가린다.
        // lift / dx: 그림만 위로 / 옆으로 옮긴다(px). 낮은 가구를 벽에 붙이거나 큰 카펫을 방 가운데 둘 때. 막히는 칸은 그대로
        // flat: 바닥에 깔린 것(카펫·종이 등)은 플레이어보다 아래에 그린다
        obj.img = this.add.image(cx(obj.x) + (o.dx || 0), (obj.y + 1) * TILE - (o.lift || 0), this.objTex(o)).setOrigin(0.5, 1)
          .setDepth(o.flat ? 1.2 : depthAt(obj.y));
        if (o.frame !== undefined && obj.img.texture.has(o.frame)) obj.img.setFrame(o.frame);
      }
      if (o.door && flag('open_' + o.door)) this.tiles[o.y][o.x].setTexture('door_open');
      if (o.cond) { this.condObjs.push(obj); obj.img?.setVisible(false); continue; }
      this.objects.set(key(obj.x, obj.y), obj);
    }
    this.syncObjects();
    this.rainWins = [...this.objects.values()].filter(o => o.rain && o.img);
    this.rainG = this.add.graphics().setDepth(2.0005);
    this.buildRails();
    this.buildSight();
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
    this.player = this.add.image(cx(this.tx), this.playerY(this.tx, this.ty), 'player_' + this.dir).setDepth(depthAt(this.ty, true));
    // 그림자 맵에선 플레이어 발밑에도 그림자 (카펫 위에서 떠 보이지 않게). 위치는 update()가 맞춘다
    this.playerShadow = m.shadows ? this.add.ellipse(0, 0, 20, 6, 0x000000, 0.3).setDepth(1.5) : null;

    const cam = this.cameras.main;
    const mw = this.cols * TILE, mh = this.rows * TILE;
    this.camFixedMap = mw <= W && mh <= H;
    if (this.camFixedMap) cam.centerOn(mw / 2, mh / 2);
    else { this.camRoom = undefined; this.updateCamera(true); }

    // 가구 밑 그림자 (맵 옵션 shadows): 바닥에 놓인 물건 아래에 옅은 그림자. 바닥에 깔린 것(flat)·벽에 거는 것(벽 칸이고 lift 없음)은 제외
    // 벽 칸에 두고 lift로 바닥까지 내려 그린 가구(앞 칸을 지나갈 수 있게 한 침실 가구)는 그림자가 있다.
    // 그림자는 물건마다 따로 두고 update()에서 물건을 따라간다 — 밀린 책상·조건부로 나타나는 물건·시야 밖 물건에 그림자만 남지 않게
    this.objShadows = [];
    if (m.shadows) {
      for (const o of new Set([...this.objects.values(), ...this.condObjs])) {
        if (!o.img || o.flat || (!this.isFloor(o.x, o.y) && !o.lift)) continue;
        // 벽에 거는 그림(열쇠함 등)은 아래쪽이 비어 있다 — 바닥에 닿지 않으니 그림자를 두지 않는다
        const key = o.img.texture.key, iw = o.img.width, ih = o.img.height;
        let grounded = false;
        for (let y = ih - 1; y >= ih - 6 && !grounded; y--) for (let x = iw / 2 - 6; x <= iw / 2 + 6; x++) if (this.textures.getPixelAlpha(x, y, key) > 0) { grounded = true; break; }
        if (!grounded) continue;
        // 그림의 실제 폭에 맞춘 그림자 (좁은 협탁은 작게, 책상은 넓게)
        // shadowSide: 옆 벽에 붙은 긴 가구(신발장·게시판)는 가구 모양 그대로의 그림자를 방 쪽 아래로 살짝 밀어 두 겹(진하게·옅게) 깐다
        if (o.shadowSide) {
          const sd = o.shadowSide === 'right' ? 1 : -1;
          for (const [d, al] of [[2, 0.32], [4, 0.14]]) {
            const e = this.add.image(0, 0, key).setOrigin(0.5, 1).setTintFill(0x000000).setAlpha(al).setDepth(1.5);
            this.objShadows.push({ o, e, dx: sd * d, dy: d - 1 });
          }
          continue;
        }
        // 그림의 실제 폭에 맞춘 그림자 (좁은 협탁은 작게, 책상은 넓게)
        const w = Math.min(TILE + 4, o.img.width - 2);
        this.objShadows.push({ o, e: this.add.ellipse(0, 0, w, 9, 0x000000, 0.36).setDepth(1.5), dx: 0, dy: -2 });
      }
    }
    // 은은한 빛 (맵 옵션 lights): 창으로 드는 달빛 등. { x, y, r(px), color, alpha } — 칸 가운데 기준, 가장자리로 갈수록 옅어진다
    for (const l of m.lights || []) {
      const g = this.add.graphics().setDepth(8.8).setBlendMode(Phaser.BlendModes.ADD);
      const c = Phaser.Display.Color.HexStringToColor(l.color || '#8aa0c8').color;
      for (let i = 8; i >= 1; i--) g.fillStyle(c, (l.alpha ?? 0.05)).fillEllipse(cx(l.x), cx(l.y), l.r * 2 * i / 8, l.r * 1.4 * i / 8);
    }
    // 가장자리 어둡게 (맵 옵션 vignette = 진하기): 겹치는 띠라 구석이 가장 어둡다
    if (m.vignette) {
      const g = this.add.graphics().setDepth(8.9);
      for (let i = 0; i < 8; i++) g.lineStyle(6, 0x000000, m.vignette * (1 - i / 8)).strokeRect(3 + i * 6, 3 + i * 6, mw - 6 - i * 12, mh - 6 - i * 12);
    }
    if (m.ambient) {
      this.add.rectangle(0, 0, mw, mh, Phaser.Display.Color.HexStringToColor(m.ambient.color).color, m.ambient.alpha).setOrigin(0).setDepth(9);
    }
    // 씬을 다시 시작해도 인스턴스는 그대로라, 어둡지 않은 맵에선 null로 비워야 이전 맵의 (파괴된) 어둠을 그리지 않는다
    this.dark = m.dark ? this.add.renderTexture(0, 0, mw, mh).setOrigin(0).setDepth(10) : null;
    this.tint = this.add.rectangle(0, 0, W, H, 0x5a0000, 0).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.promptTxt = this.add.text(0, 0, 'E', textStyle(11, '#111111', { backgroundColor: '#d8cfb4', padding: { x: 4, y: 1 } }))
      .setOrigin(0.5).setDepth(12).setVisible(false);
    // 조사 대상 칸 표시: 모서리 괄호 테두리가 은은하게 깜빡인다
    // 방 조명(ambient 9) 위에 그려야 밝은 방에서도 흐려지지 않는다. 어둠(10) 아래라 손전등 밖에선 보이지 않는다
    // 어두운 외곽선 위에 흰색 — 밝은 벽·바닥에서도 외곽선 덕분에 눈에 띈다
    this.focus = this.add.graphics().setDepth(9.6).setVisible(false);
    const h = TILE / 2, l = 9;
    for (const [w, c, a] of [[4, 0x120c06, 0.7], [2, 0xffffff, 1]]) {
      this.focus.lineStyle(w, c, a);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        this.focus.lineBetween(sx * h, sy * h, sx * (h - l), sy * h);
        this.focus.lineBetween(sx * h, sy * h, sx * h, sy * (h - l));
      }
    }
    this.tweens.add({ targets: this.focus, alpha: 0.6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.areaTxt = this.add.text(14, 12, '', textStyle(13, '#a8a1b0', { backgroundColor: 'rgba(0,0,0,0.55)', padding: { x: 8, y: 4 } }))
      .setScrollFactor(0).setDepth(95).setAlpha(0);

    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.input.keyboard.on('keydown', this.onKey, this);
    this.events.on('denial', this.applyStage, this);
    const onLeave = e => this.saveOnLeave(e);
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onLeave);
    this.events.once('shutdown', () => {
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onLeave);
      this.input.keyboard.off('keydown', this.onKey, this);
      this.chaseTimer?.remove();
      this.breathTimer?.remove();
      stopLoop('chase');
    });

    this.bgm = this.bgmName();
    // 배경 음악 (GDD 4.7, 이슈 #118): 환경음 위에 깐다. 추격 중에는 멈춘다
    this.music = m.music || null;
    stopAllLoops([this.bgm, this.music]);
    if (this.bgm) startLoop(this.bgm);
    if (this.music && !state.flags.pendingChase) startLoop(this.music);
    if (m.piano) this.time.delayedCall(2000, this.pianoTick, [], this);
    this.applyStage();
    this.updatePrompt();
    this.updateArea();
    this.updateRooms();
    this.updateObjective();
    this.haunt = 0;
    this.time.addEvent({ delay: 1000, loop: true, callback: this.denialTick, callbackScope: this });
    this.guiltWait = this.guiltDelay();
    this.invertWait = Phaser.Math.Between(...GUILT_INVERT_EVERY_S);
    this.time.addEvent({ delay: 1000, loop: true, callback: this.guiltTick, callbackScope: this });
    cam.fadeIn(500);
    this.time.delayedCall(550, () => this.runEnter());
  }

  update(time, delta) {
    this.stepCamera(delta);
    this.playerShadow?.setPosition(this.player.x, this.player.y + 14);
    for (const { o, e, dx, dy } of this.objShadows) e.setPosition(o.img.x + dx, o.img.y + dy).setVisible(o.img.visible);
    if (this.rainWins.length) this.drawWindowRain(delta);
    this.drawSight();
    if (this.dark) this.drawDark();
    this.lockerView?.update(this.chase, this.tx, this.ty);
    // 위를 볼 때는 머리 위 E가 조사 대상을 가리므로 대상 칸 위로 올린다
    if (this.promptTxt.visible) {
      if (this.dir === 'up') this.promptTxt.setPosition(this.focus.x, this.focus.y - 26);
      else this.promptTxt.setPosition(this.player.x, this.player.y - 26);
    }
    // 목표 패널이 플레이어나 바로 앞 칸(조사 대상)을 가리면 흐리게 (옥상 「7.13」처럼 위쪽 끝의 조사 지점)
    const [fdx, fdy] = DIRS[this.dir];
    this.ui.fadeHudOver([this.playerScreenBox(), this.screenBox(cx(this.tx + fdx), cx(this.ty + fdy), 16, 16)]);
    if (this.busy || this.moving || this.hidden || this.over) return;
    const k = this.keys;
    const dir = (k.UP.isDown || k.W.isDown) ? 'up'
      : (k.DOWN.isDown || k.S.isDown) ? 'down'
      : (k.LEFT.isDown || k.A.isDown) ? 'left'
      : (k.RIGHT.isDown || k.D.isDown) ? 'right' : null;
    if (dir) this.tryMove(this.guiltDir(dir));
  }

  drawDark() {
    const rt = this.dark;
    rt.clear();
    rt.fill(0x000000, 1); // 부분 알파는 WebGL에서 훨씬 밝게 나와서 완전한 어둠 + 손전등 그라데이션으로 처리
    if (flag('stage1') && Math.random() < 0.01) return; // 손전등이 깜빡인다
    const [tex, r] = this.hidden ? ['light_s', 70] : ['light', 210]; // 반지름은 textures.js의 light()와 같게
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
    const po = this.objects.get(key(nx, ny));
    if (po?.push && checkCond(po.pushCond)) return this.tryPush(po, dir);
    if (!this.passable(nx, ny) || this.railBetween(this.tx, this.ty, nx, ny)) { this.updatePrompt(); return; }
    const gate = this.gateAt(nx, ny, dir);
    if (gate) return this.gateBlocked(gate, nx, ny);
    this.moving = true;
    this.tx = nx;
    this.ty = ny;
    // 방을 나서는 순간 그 방 안에서만 보이는 것(화장실 거울 등)을 바로 숨긴다 — 걸어가는 동안 비치지 않게
    if (this.room[ny][nx] !== this.room[ny - dy][nx - dx]) this.updateRooms();
    // 아래로 갈 때 미리 앞쪽 깊이로 올려야 이동 중에 가구 밑으로 파고들지 않는다
    this.player.setDepth(depthAt(Math.max(ny, ny - dy), true));
    this.updatePrompt();
    this.steps = (this.steps || 0) + 1;
    if (this.steps % 2 === 0) sfx('step');
    // 걷는 그림(player_<방향>_1~4)이 있으면 한 칸에 두 장씩, 걸음마다 다음 두 장으로 넘긴다
    const walk = `player_${this.dir}_`;
    const anim = this.textures.exists(walk + '1');
    const first = this.steps % 2 ? 3 : 1;
    this.tweens.add({
      targets: this.player, x: cx(nx), y: this.playerY(nx, ny), duration: MOVE_MS,
      onUpdate: tw => { if (anim) this.player.setTexture(walk + (first + (tw.progress < 0.5 ? 0 : 1))); },
      onComplete: () => { this.player.setTexture('player_' + this.dir); this.moving = false; this.afterMove(); },
    });
  }

  // ── 밀기 (GDD 6장 맵 기믹): 걸어 들어가면 한 칸 밀리고, 나도 그 자리로 들어선다. 앞이 막혔으면 꿈쩍하지 않는다 ──
  tryPush(o, dir) {
    const [dx, dy] = DIRS[dir];
    const bx = o.x + dx, by = o.y + dy;
    // 무너지는 물건(topple) 쪽으로 밀면 그 스크립트가 실행된다 (의자 더미 → 큰 소리 → 그림자)
    const hit = this.objects.get(key(bx, by));
    if (hit?.topple) {
      sfx('deskDrag');
      this.tweens.add({ targets: o.img, x: o.img.x + dx * 6, y: o.img.y + dy * 6, duration: 80, yoyo: true });
      return this.run(this.resolve(hit.topple));
    }
    const blocked = !this.isFloor(bx, by) || !this.passable(bx, by) || this.railBetween(o.x, o.y, bx, by)
      || (this.chase && this.chase.x === bx && this.chase.y === by);
    if (blocked) {
      if (this.pushHit !== key(o.x, o.y)) { this.pushHit = key(o.x, o.y); sfx('thud'); }
      this.updatePrompt();
      return;
    }
    this.pushHit = null;
    this.objects.delete(key(o.x, o.y));
    [o.x, o.y] = [bx, by];
    this.objects.set(key(bx, by), o);
    setFlag('push_' + o.id, [bx, by]);
    sfx('deskDrag');
    o.img.setDepth(depthAt(by));
    this.tweens.add({ targets: o.img, x: cx(bx), y: (by + 1) * TILE, duration: MOVE_MS });
    this.tryMove(dir);
  }

  // 민 물건은 keep 플래그를 얻기 전까지, 그 방을 나가면 제자리로 돌아간다 (막혀도 다시 풀 수 있게)
  resetPushed() {
    const here = this.room[this.ty]?.[this.tx] ?? -1;
    if (here < 0) return;
    for (const o of [...this.objects.values(), ...this.condObjs]) {
      if (!o.push || (o.keep && flag(o.keep))) continue;
      const [hx, hy] = o.home;
      if ((o.x === hx && o.y === hy) || this.roomOf(hx, hy) === here) continue;
      if (this.objects.get(key(o.x, o.y)) === o) { this.objects.delete(key(o.x, o.y)); this.objects.set(key(hx, hy), o); }
      [o.x, o.y] = [hx, hy];
      o.img?.setPosition(cx(hx), (hy + 1) * TILE).setDepth(depthAt(hy));
      setFlag('push_' + o.id, null);
    }
  }

  // cond가 있는 물건을 지금 조건에 맞춰 놓거나 치운다 (스크립트 { t: 'syncObjects' }, 스크립트가 끝날 때)
  syncObjects() {
    // 밀 수 있게 된 책상은 끈 자국이 있는 그림(pushTex)으로 바꿔 알아볼 수 있게 한다
    for (const o of this.objects.values()) {
      if (o.push && o.pushTex && o.img) o.img.setTexture(checkCond(o.pushCond) ? o.pushTex : this.objTex(o));
    }
    for (const o of this.condObjs) {
      const on = checkCond(o.cond);
      const k = key(o.x, o.y);
      if (on && this.objects.get(k) !== o) { this.objects.set(k, o); o.img?.setVisible(this.shown ? this.shown[o.y][o.x] : true); }
      else if (!on && this.objects.get(k) === o) { this.objects.delete(k); o.img?.setVisible(false); }
    }
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

  // ── 방: 벽·문으로 나뉜 바닥 덩어리. 카메라 고정과 벽 앞면/윗면에 쓴다 (보이는 범위는 레이캐스팅 시야가 정한다) ──
  // (x, y) 바로 위가 1칸 벽이고, 그 너머가 다른 방의 바닥인지
  sharedWallAbove(x, y) {
    return this.isWall(x, y - 1) && this.isFloor(x, y - 2) && this.room[y - 2][x] !== this.room[y][x];
  }

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
    this.roomKey = null;
  }

  // ── 레이캐스팅 시야: 플레이어에서 쏜 광선이 벽·닫힌 문에 막히기 전까지만 보인다 ──
  // 열린 문 너머는 문틈 각도만큼, 코너는 돌아서는 만큼 서서히 보인다.
  // 반짝임(9.7) 위·어둠·손전등(10) 아래에 깔아, 반만 보이는 칸의 반짝임이 어둠 속에 떠 보이지 않게 한다
  buildSight() {
    this.sight = this.add.renderTexture(0, 0, this.cols * TILE, this.rows * TILE).setOrigin(0).setDepth(9.8);
    this.sightPoly = this.make.graphics({}, false);
    this.sightAt = null;
    this.buildOpaque();
  }

  // 시야를 막는 칸: 맵 밖, 벽·창·닫힌 문 (바닥·열린 문·옥상 펜스는 비친다)
  // frame: 열린 문 칸. 비스듬히 보면 문짝 그림이 대각선으로 잘리므로, 광선이 지나가면 칸 전체를 보여 준다
  buildOpaque() {
    this.frame = this.grid.map(r => r.map(() => false));
    this.opaque = this.grid.map((row, y) => row.map((ch, x) => {
      const o = this.objects.get(key(x, y));
      const t = this.map.legend[ch] || 'wall';
      const open = o?.door ? flag('open_' + o.door) : t === 'door_open';
      if (open) this.frame[y][x] = true;
      if (o?.door) return !open;
      return !(t.startsWith('floor') || open || t === 'fence');
    }));
    this.sightAt = null;
  }

  opaqueAt(x, y) {
    return x < 0 || y < 0 || x >= this.cols || y >= this.rows || this.opaque[y][x];
  }

  // 칸 격자를 따라가는 광선 (DDA). 처음 닿은 막힌 칸과 거리를 돌려준다. frames: 지나간 열린 문 칸을 모은다
  castRay(ox, oy, dx, dy, maxT, frames = null) {
    let tx = Math.floor(ox / TILE), ty = Math.floor(oy / TILE);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const ddx = dx ? Math.abs(TILE / dx) : Infinity, ddy = dy ? Math.abs(TILE / dy) : Infinity;
    let mx = dx > 0 ? ((tx + 1) * TILE - ox) / dx : dx < 0 ? (tx * TILE - ox) / dx : Infinity;
    let my = dy > 0 ? ((ty + 1) * TILE - oy) / dy : dy < 0 ? (ty * TILE - oy) / dy : Infinity;
    for (;;) {
      let t;
      if (mx < my) { t = mx; mx += ddx; tx += sx; } else { t = my; my += ddy; ty += sy; }
      if (t >= maxT) return { t: maxT, hit: false };
      if (this.opaqueAt(tx, ty)) return { t, tx, ty, hit: true };
      if (frames && this.frame[ty][tx]) frames.add(ty * this.cols + tx);
    }
  }

  // 시야 다각형(광선 끝점들)과 보이는 벽 칸 목록
  castSight(ox, oy) {
    const r = SIGHT_R;
    const x0 = Math.max(0, Math.floor((ox - r) / TILE)), x1 = Math.min(this.cols - 1, Math.floor((ox + r) / TILE));
    const y0 = Math.max(0, Math.floor((oy - r) / TILE)), y1 = Math.min(this.rows - 1, Math.floor((oy + r) / TILE));
    // 벽이 없는 쪽도 둥글게 닫히도록 고르게 쏘는 광선
    const angles = [];
    for (let i = 0; i < 48; i++) angles.push((i / 48) * Math.PI * 2 - Math.PI);
    // 바닥과 맞닿은 막힌 칸의 모서리마다 광선 3개 (모서리 정확히 + 양옆)
    const done = new Set();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!this.opaque[y][x]) continue;
      if (!Object.values(DIRS).some(([dx, dy]) => !this.opaqueAt(x + dx, y + dy))) continue;
      for (const [px, py] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
        const ci = py * (this.cols + 1) + px;
        if (done.has(ci)) continue;
        done.add(ci);
        const vx = px * TILE - ox, vy = py * TILE - oy;
        if (vx * vx + vy * vy > r * r) continue;
        const a = Math.atan2(vy, vx);
        angles.push(a - SIGHT_EPS, a, a + SIGHT_EPS);
      }
    }
    angles.sort((a, b) => a - b);
    const poly = [], hits = new Set();
    for (const a of angles) {
      const dx = Math.cos(a), dy = Math.sin(a);
      const h = this.castRay(ox, oy, dx, dy, r, hits);
      poly.push(ox + dx * h.t, oy + dy * h.t);
      if (h.hit && h.tx >= 0 && h.ty >= 0 && h.tx < this.cols && h.ty < this.rows) hits.add(h.ty * this.cols + h.tx);
    }
    // 방 모서리 벽: 광선은 꼭짓점에만 닿아 빠지므로, 가로·세로 이웃 벽이 둘 다 보이면 함께 보인다
    const lit = (x, y) => hits.has(y * this.cols + x);
    const corners = [];
    for (const i of hits) {
      const hx = i % this.cols, hy = (i - hx) / this.cols;
      for (const [dx, dy] of Object.values(DIRS)) {
        const x = hx + dx, y = hy + dy;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows || !this.opaque[y][x] || lit(x, y)) continue;
        if ((lit(x - 1, y) || lit(x + 1, y)) && (lit(x, y - 1) || lit(x, y + 1))) corners.push(y * this.cols + x);
      }
    }
    corners.forEach(i => hits.add(i));
    // 문 칸에 서 있으면 같은 벽 줄의 양옆 벽은 옆으로 스칠 뿐이라 밝히지 않는다 — 문 양옆 벽만 밝게 떠 보이지 않게 (#92)
    const { tx, ty } = this;
    if (!this.isFloor(tx, ty)) {
      const row = this.isWall(tx - 1, ty) && this.isWall(tx + 1, ty), col = this.isWall(tx, ty - 1) && this.isWall(tx, ty + 1);
      for (const i of [...hits]) {
        const hx = i % this.cols, hy = (i - hx) / this.cols;
        if ((row && hy === ty && hx !== tx) || (col && hx === tx && hy !== ty)) hits.delete(i);
      }
    }
    return { poly, hits };
  }

  // 매 프레임: 플레이어가 움직였을 때만 다시 그린다 (이동 중에도 시야가 부드럽게 따라온다)
  drawSight() {
    const ox = this.player.x, oy = this.player.y;
    const k = `${ox},${oy}`;
    if (k === this.sightAt) return;
    this.sightAt = k;
    const { poly, hits } = this.castSight(ox, oy);
    const g = this.sightPoly.clear().fillStyle(0xffffff, 1);
    // 시야 다각형은 플레이어를 중심으로 한 별 모양이라 부채꼴 삼각형으로 채운다
    const n = poly.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      g.fillTriangle(ox, oy, poly[i * 2], poly[i * 2 + 1], poly[j * 2], poly[j * 2 + 1]);
    }
    for (const i of hits) {
      const x = i % this.cols;
      g.fillRect(x * TILE, ((i - x) / this.cols) * TILE, TILE, TILE);
    }
    this.sight.clear().fill(0x000000, 1).erase(g);
  }

  // 칸이 보이는지 (가운데나 네 귀퉁이 중 하나라도 광선이 닿으면). 막힌 칸은 광선이 처음 닿은 칸이면 보인다
  seeTile(ox, oy, x, y) {
    for (const [px, py] of [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) {
      const vx = (x + px) * TILE - ox, vy = (y + py) * TILE - oy, d = Math.hypot(vx, vy);
      if (d < 1) return true;
      const h = this.castRay(ox, oy, vx / d, vy / d, d);
      if (!h.hit || (h.tx === x && h.ty === y)) return true;
    }
    return false;
  }

  updateRooms() {
    this.sightAt = null;
    // 가구·반짝임은 그 칸이 시야에 들어올 때만 보인다 (다른 방의 2칸 가구가 벽 칸으로 윗부분만 비치지 않게)
    const ox = cx(this.tx), oy = cx(this.ty);
    const at = (x, y) => (x < 0 || y < 0 || x >= this.cols || y >= this.rows ? -1 : this.room[y][x]);
    // 문 칸에 서 있으면 양쪽 방 기준
    let ids = [at(this.tx, this.ty)];
    if (ids[0] < 0) ids = Object.values(DIRS).map(([dx, dy]) => at(this.tx + dx, this.ty + dy));
    ids = [...new Set(ids.filter(i => i >= 0))].sort();
    // 벽 칸에 붙은 물건(창문 등)은 그 벽이 시야에 보이면 함께 보인다 — 벽을 비추는 광선과 같은 기준
    const shown = this.grid.map(r => r.map(() => null));
    let wallHits;
    for (const o of this.objects?.values() || []) {
      // below: 아래쪽 방을 향해 벽에 건 물건(게시판 등)은 그 방 바닥 칸이 보일 때만 보인다 (벽 너머 복도에서 비치지 않게)
      if (shown[o.y][o.x] === null && o.below) shown[o.y][o.x] = this.seeTile(ox, oy, o.x, o.y + 1);
      if (shown[o.y][o.x] === null && this.opaque[o.y]?.[o.x]) {
        wallHits ??= this.castSight(ox, oy).hits;
        shown[o.y][o.x] = wallHits.has(o.y * this.cols + o.x) || this.seeTile(ox, oy, o.x, o.y);
      }
      shown[o.y][o.x] ??= this.seeTile(ox, oy, o.x, o.y);
      o.img?.setVisible(shown[o.y][o.x]);
      // 2칸 가구의 윗부분이 다른 방과 함께 쓰는 1칸 벽에 솟으면(화장실 거울 등), 그 방 밖에서는 벽이 윗부분을 가린다.
      // 밖에서 보면 그 벽은 바깥 방의 벽이라 안쪽 거울이 바깥 벽에 걸린 것처럼 보이기 때문이다 (#92).
      // 아래 칸(세면대 등)은 그대로 시야를 따른다. 문 칸은 그 벽 줄이라 밖으로 친다
      if (o.img?.height > TILE && this.sharedWallAbove(o.x, o.y)) {
        const h = o.img.height;
        if (at(this.tx, this.ty) === at(o.x, o.y)) o.img.setCrop();
        else o.img.setCrop(0, h - TILE, o.img.width, TILE);
      }
    }
    this.shown = shown;
    if (this.sparkles) this.updateSparkles();
    const k = ids.join();
    if (!ids.length || k === this.roomKey) return;
    this.roomKey = k;
    // 벽 앞면은 그 벽 아래 방에 있을 때만 앞면. 위쪽 방 안에서 보면 같은 벽이 윗면(두꺼운 벽)으로 보인다
    if (this.textures.exists('wall_face')) {
      for (let y = 0; y < this.rows - 1; y++) for (let x = 0; x < this.cols; x++) {
        const t = this.tiles[y][x];
        if (t.texture.key !== 'wall_face' && t.texture.key !== 'wall_top') continue;
        if (this.tileTex(x, y) !== 'wall_face') continue;
        t.setTexture(ids.includes(at(x, y + 1)) ? 'wall_face' : 'wall_top');
      }
    }
    // 벽 줄의 문·창도 같다: 위쪽 방에서 내려다보면 벽이 윗면(어두운 남색)이 되므로 문만 밝게 뜨지 않게 같은 어둠으로 물들인다
    for (let y = 1; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      const tex = this.map.legend[this.grid[y][x]] || 'wall';
      if (tex === 'wall' || tex.startsWith('floor') || !this.isWall(x - 1, y) || !this.isWall(x + 1, y)) continue;
      const fromAbove = ids.includes(at(x, y - 1)) && !ids.includes(at(x, y + 1));
      if (fromAbove) this.tiles[y][x].setTint(WALL_TOP_TINT);
      else this.tiles[y][x].clearTint();
    }
  }

  // ── 카메라: 화면에 다 들어오는 방에 들어서면 그 방을 화면 가운데에 고정하고(목표 패널·대화창에 가리지 않게),
  // 복도처럼 화면보다 큰 곳에선 플레이어를 따라간다. 문 칸에선 바꾸지 않는다. instant: 이동 없이 바로 맞춘다
  // 실제 이동은 stepCamera()가 매 프레임 한다. 여기선 목표(방 / 따라가기)만 바꾸고 전환을 시작한다 ──
  updateCamera(instant = false) {
    if (this.camFixedMap) return;
    let id = this.room[this.ty]?.[this.tx] ?? -1;
    if (id < 0) { if (!instant) return; id = this.camRoom ?? -1; }
    const b = this.roomBox[id];
    const fits = !!b && (b.x1 - b.x0 + 1) * TILE <= W && (b.y1 - b.y0 + 1) * TILE <= H;
    const target = fits ? id : null;
    if (target === this.camRoom && !instant) return;
    this.camRoom = target;
    this.camEase(instant ? 0 : CAM_EASE_MS);
  }

  // 지금 위치에서 새 목표까지 ms 동안 부드럽게 옮긴다 (0이면 바로)
  camEase(ms) {
    const cam = this.cameras.main;
    cam.stopFollow();
    // 경계는 stepCamera가 직접 맞춘다. Phaser 경계를 켜고 끄면 그 순간 화면이 튄다
    cam.useBounds = false;
    this.camFrom = { x: cam.midPoint.x, y: cam.midPoint.y };
    this.camT = ms ? 0 : 1;
    this.camMs = ms;
    this.stepCamera(0);
  }

  // 방 고정: 방 가운데 / 따라가기: 플레이어 (맵 밖이 보이지 않게 가장자리에서 멈춘다)
  camTarget() {
    const b = this.camRoom != null && this.roomBox[this.camRoom];
    if (b) return [(b.x0 + b.x1 + 1) * TILE / 2, (b.y0 + b.y1 + 1) * TILE / 2];
    const mw = this.cols * TILE, mh = this.rows * TILE;
    return [Phaser.Math.Clamp(this.player.x, W / 2, mw - W / 2), Phaser.Math.Clamp(this.player.y, H / 2, mh - H / 2)];
  }

  // 전환 중엔 출발점과 (움직이는) 목표 사이를 이어서, 끝나는 순간 목표와 정확히 겹친다 → 끝에서 튀지 않는다.
  // 전환이 끝나면 바로 붙어 따라간다: 늦게 따라오면 멈춘 뒤에도 화면이 미끄러져 한 발 더 가는 것처럼 느껴진다
  stepCamera(dt) {
    if (this.camFixedMap || this.pastLayer || !this.camFrom) return; // 과거 겹쳐보기 중엔 그쪽이 카메라를 움직인다
    let [x, y] = this.camTarget();
    if (this.camT < 1) {
      this.camT = Math.min(1, this.camT + dt / this.camMs);
      const e = Phaser.Math.Easing.Sine.InOut(this.camT);
      x = this.camFrom.x + (x - this.camFrom.x) * e;
      y = this.camFrom.y + (y - this.camFrom.y) * e;
    }
    this.cameras.main.centerOn(Math.round(x), Math.round(y));
  }

  // 벽: 아래가 바닥이면 앞면(정면에서 본 벽), 아니면 윗면 — 완성 그래픽이 있을 때만
  tileTex(x, y) {
    let tex = this.map.legend[this.grid[y][x]] || 'wall';
    if (!this.textures.exists(tex)) tex = TILE_FALLBACK[tex] || 'wall'; // 아직 그림이 없는 타일
    // 펜스가 세로로 이어지는 칸(옥상 좌우 테두리)은 따로 그리지 않고 안쪽 바닥 그림을 그대로 쓴다
    if (tex === 'fence' && y > 0 && this.map.legend[this.grid[y - 1][x]] === 'fence') {
      const inner = this.map.legend[this.grid[y][x > this.cols / 2 ? x - 1 : x + 1]];
      if (inner && this.textures.exists(inner)) return inner;
    }
    // 위쪽 펜스는 두 칸마다 기둥이 선 칸을 둔다
    if (tex === 'fence' && x % 2 === 1 && this.textures.exists('fence_post')) return 'fence_post';
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
      if (o.solid === true) return false; // 그림 없이 막기만 하는 칸 (두 칸짜리 가구의 윗칸 등)
    }
    return !this.solid.has(this.grid[y][x]);
  }

  afterMove() {
    this.gateHit = null;
    this.pushHit = null;
    this.player.setDepth(depthAt(this.ty, true));
    this.updateRooms();
    this.updateCamera();
    state.pos = { x: this.tx, y: this.ty };
    state.dir = this.dir;
    if (this.chase && this.chase.x === this.tx && this.chase.y === this.ty) return this.caught();
    this.resetPushed();
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
    // 함정이 있는 방 등은 들어설 때 자동 저장한다 (map.saveOnEnter: [{ area, cond }]) — 게임오버면 여기부터 다시
    if ((this.map.saveOnEnter || []).some(s => s.area === a.name && checkCond(s.cond))) {
      saveGame();
      this.ui.toast('자동 저장됨');
    }
    this.areaTxt.setText(a.name);
    this.tweens.killTweensOf(this.areaTxt);
    this.areaTxt.setAlpha(1);
    this.tweens.add({ targets: this.areaTxt, alpha: 0, delay: 1800, duration: 600 });
  }

  // ── 조사 ──
  // 월드 좌표의 상자(가운데 x, y, 반폭 hw, 반높이 hh)를 화면 좌표로 — 목표 패널·대화창이 가리는지 판단할 때
  screenBox(x, y, hw, hh) {
    const v = this.cameras.main.worldView, z = this.cameras.main.zoom;
    return { x0: (x - hw - v.x) * z, y0: (y - hh - v.y) * z, x1: (x + hw - v.x) * z, y1: (y + hh - v.y) * z };
  }

  // 플레이어 그림(머리부터 발까지)이 화면에서 차지하는 자리. UI가 대화창 위치를 정할 때도 쓴다
  playerScreenBox() {
    if (!this.player?.visible || this.hidden) return null;
    return this.screenBox(this.player.x, this.player.y, 12, 16);
  }

  frontObj() {
    const [dx, dy] = DIRS[this.dir];
    const o = this.objects.get(key(this.tx + dx, this.ty + dy));
    // below: 아래쪽 방을 향해 벽에 건 물건은 그 방에서만 조사한다 (벽 너머 복도에서 열쇠함을 열지 않게, #116)
    if (o?.below && this.ty !== o.y + 1) return undefined;
    return o;
  }

  // ── 반짝임 (GDD 4.7): 아직 조사하지 않은 물건은 멀리서도 보이게 작은 빛이 깜빡인다 ──
  // 같은 방의 같은 스크립트 물건(책상 16개, 피아노 좌우 등)은 하나로 묶어 대표 한 칸에만 띄운다.
  // 조사 결과의 갈래(if 조건들)가 마지막으로 본 때와 달라지면 다시 반짝인다 (예: 전화 후 알코올램프)
  buildSparkles() {
    this.sparkles = new Map();
    for (const o of this.objects.values()) {
      if (!o.script || o.hide || o.push || o.cond || o.sparkle === false) continue; // sparkle: false = 조사는 되지만 표시는 안 함
      const g = `${typeof o.script === 'string' ? o.script : key(o.x, o.y)}@${this.roomOf(o.x, o.y)}`;
      o.sparkleKey = g;
      if (this.sparkles.has(g)) continue;
      // 조사 표시(focus)와 같은 모서리 괄호가 반짝인다. 어둠(10) 아래에 그려 손전등 시야 밖에선 보이지 않는다
      // 색은 조사 표시(focus)와 같다: 어두운 외곽선 위에 흰색
      const b = this.add.graphics().setDepth(9.7).setPosition(...this.markAt(o));
      const h = TILE / 2 - 1, l = 7;
      for (const [w, c, a] of [[4, 0x120c06, 0.7], [2, 0xffffff, 1]]) {
        b.lineStyle(w, c, a);
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          b.lineBetween(sx * h, sy * h, sx * (h - l), sy * h);
          b.lineBetween(sx * h, sy * h, sx * h, sy * (h - l));
        }
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
    // 잠긴 문은 먼저 손잡이를 당겨 본다 (열쇠가 있으면 이어서 열리는 소리)
    if (o.door && !flag('open_' + o.door)) sfx('doorLocked');
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
    if (on) this.focus.setPosition(...this.markAt(o));
  }

  // 창 너머 비 (물건 옵션 rain: true): 창 그림의 유리 두 칸 안에서 빗줄기가 떨어진다. 좌표는 32×32 창 그림 기준.
  // 거울 속 창의 비(mirror.js)와 같은 방식: 1px 줄을 옅게, 픽셀 칸에 맞춰 그린다 (1px 미만은 화면에서 깜빡여 어색하다).
  // 빗방울마다 자리·속도·길이·진하기가 달라 같은 무늬가 되풀이되지 않는다
  drawWindowRain(delta) {
    const g = this.rainG;
    g.clear();
    const drop = ([px, py, pw, ph], d = {}) => Object.assign(d, {
      x: px + Math.floor(Math.random() * pw), y: py - Math.random() * ph, v: 0.02 + Math.random() * 0.025, len: 2 + Math.floor(Math.random() * 3), a: 0.15 + Math.random() * 0.3,
    });
    for (const o of this.rainWins) {
      o.drops ??= WINDOW_PANES.flatMap(p => Array.from({ length: 8 }, () => Object.assign(drop(p), { pane: p, y: p[1] + Math.random() * p[3] })));
      if (!o.img?.visible) continue;
      const ox = o.img.x - o.img.width / 2, oy = o.img.y - o.img.height;
      for (const d of o.drops) {
        const [, py, , ph] = d.pane;
        d.y += d.v * delta;
        if (d.y > py + ph) drop(d.pane, d);
        const y = Math.round(d.y), top = Math.max(y, py), bot = Math.min(y + d.len, py + ph);
        if (bot > top) g.fillStyle(0x8aa0bc, d.a).fillRect(Math.round(ox) + d.x, Math.round(oy) + top, 1, bot - top);
      }
    }
  }

  // 플레이어를 그릴 높이: 맵 옵션 wallHug(px)가 있으면 바로 위가 벽인 줄에서 그만큼 위로 그린다
  // (침실처럼 가구를 벽 아랫부분까지 올린 방에서 캐릭터도 벽에 붙어 보이게)
  // 문은 벽의 일부로 친다 — 가로 벽의 문 바로 아래 칸만 내려가 보이지 않게. 문 칸에 서 있을 때는 올리지 않는다
  // (세로 벽의 문 칸은 위가 벽이라 올리면 문틀 위로 튀어나온다, 이슈 #124)
  playerY(x, y) {
    const hug = this.map.wallHug && !this.isDoor(x, y) && (this.isWall(x, y - 1) || this.isDoor(x, y - 1));
    return cx(y) - (hug ? this.map.wallHug : 0);
  }

  isDoor(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    const t = this.map.legend[this.grid[y][x]];
    return t === 'door_open' || t === 'door_locked' || t === 'exit_door' || t === 'homedoor';
  }

  // 조사 표시·반짝임 위치: 보통은 칸 가운데, lift로 그림을 옮긴 물건은 그림 가운데
  markAt(o) {
    if (!o.lift || !o.img) return [cx(o.x), cx(o.y)];
    return [o.img.x, o.img.y - o.img.height / 2];
  }

  onKey(e) {
    if (this.busy || this.moving || this.over) return;
    const dir = dirOf(e);
    // 키를 누르고 있는 동안의 이동은 update()가 맡는다. OS 키 반복까지 받으면 뗀 직후 한 칸 더 갈 수 있다.
    if (dir) { if (!this.hidden && !e.repeat) this.tryMove(this.guiltDir(dir)); return; }
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
    else this.camEase(CAM_EASE_MS); // 방 고정 / 따라가기로 부드럽게 돌아온다
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
    this.stopGuilt(); // 대화·이벤트가 시작되면 죄책감 연출을 바로 거둔다
    this.busy = true;
    this.updatePrompt();
    if ((await runScript(this, list)) === 'stop') return;
    this.ui.hideDialog();
    // 거울·칸막이 안 같은 1인칭 화면은 스크립트가 끝나면 닫힌다
    if (this.closeup) { const v = this.closeup; this.closeup = null; await v.destroy(); }
    this.busy = false;
    this.syncObjects();
    this.applyStage(); // 스크립트로 바뀐 플래그에 맞춰 낙서·바닥 장식도 바로 보이게
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
    this.stopGuilt();
    this.busy = true;
    this.updatePrompt();
    sfx('beep');
    // 기억 노트는 탐색 중에만 열리므로 여기서의 수동 저장은 진행이 반만 기록될 일이 없다 (GDD 4.7, 이슈 #121)
    const end = await this.ui.covered(() => this.ui.notebook(this.hint(), this.progress(), saveGame));
    if (end === 'title') return this.toTitle();
    this.busy = false;
    this.updatePrompt();
    // 설정 탭에서 새 소리 스위치를 바꿨으면 배경음도 바로 바꾼다
    const bgm = this.bgmName();
    if (bgm !== this.bgm) {
      if (this.bgm) stopLoop(this.bgm);
      if (bgm) startLoop(bgm);
      this.bgm = bgm;
    }
  }

  // 2층 음악실 피아노 (맵 옵션 piano: { x, y, room, hear, until }, GDD 4.7, 이슈 #131)
  // hear칸 밖이면 들리지 않고 가까울수록 커진다. room 밖에서는 벽 너머처럼 먹먹하게. 대화·퍼즐·노트(busy)·추격 중엔 치지 않는다
  pianoTick() {
    const p = this.map.piano;
    if (flag(p.until)) return;
    if (!this.over && !this.busy && !this.chase) {
      const v = 1 - Math.hypot(p.x - this.tx, p.y - this.ty) / p.hear;
      if (v > 0) sfx('pianoPhrase', v, this.areaName !== p.room);
    }
    this.time.delayedCall(Phaser.Math.Between(6000, 9000), this.pianoTick, [], this);
  }

  // 맵 배경음. 새 배경음(bgmTrial)이 있으면 그것 (GDD 4.7, 이슈 #66)
  bgmName() {
    return this.map.bgmTrial || this.map.bgm;
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
    this.ui.hudOff = !!this.hidden;
    this.ui.syncHud();
    this.updateSparkles();
  }

  // ── 스크립트 전용 동작 ──
  action(a) {
    switch (a.t) {
      case 'openDoor': return this.openDoor(a.id);
      case 'syncObjects': return this.syncObjects();
      case 'shadowStrike': return this.shadowStrike(a);
      case 'stage': setFlag('stage' + a.n); this.applyStage(); return;
      case 'chase':
        // 추격 직전 자동저장 → 잡히면 여기서 재시작
        setFlag('pendingChase', { id: a.id, spawn: a.spawn, after: a.after || null, step: a.step || null, hide: a.hide || null, sparedScript: a.sparedScript || null });
        saveGame();
        this.ui.toast('자동 저장됨');
        return this.startChase();
      case 'resumeChase': return this.startChase();
      case 'pastOn': return this.pastOn(a.id);
      case 'pastOff': return this.pastOff();
      // 1인칭 화면 — 화장실 거울: 처음이면 열고, 열려 있으면 얼굴·김·금만 바꾼다 / 칸막이 안
      case 'mirror':
      case 'stall':
      case 'photo': {
        const View = { mirror: MirrorView, stall: StallView, photo: PhotoView }[a.t];
        if (this.closeup instanceof View) return this.closeup.set(a);
        this.closeup?.destroy();
        this.closeup = new View(this, a);
        return this.ui.wait(250);
      }
      case 'ghost': return this.ghost(a);
    }
  }

  // 「저장하고 타이틀로」: 타이틀은 배경음을 끄지 않으므로 여기서 끄고 넘어간다
  toTitle() {
    this.busy = true;
    stopAllLoops();
    const cam = this.cameras.main;
    cam.fadeOut(600);
    cam.once('camerafadeoutcomplete', () => this.scene.start('Title'));
  }

  // 창을 닫거나 숨길 때: 탐색 중이면 저장한다. 대화·이벤트·퍼즐·노트(busy), 추격, 사물함, 게임오버 중에는
  // 진행이 반만 기록될 수 있어 저장하지 않는다. 걷는 중이면 state.pos는 마지막으로 도착한 칸이다
  saveOnLeave(e) {
    if (e.type === 'visibilitychange' && document.visibilityState !== 'hidden') return;
    if (this.busy || this.hidden || this.chase || this.over || state.flags.pendingChase) return;
    saveGame();
  }

  goto(a) {
    this.busy = true;
    const cam = this.cameras.main;
    cam.fadeOut(600);
    cam.once('camerafadeoutcomplete', () => this.scene.start(a.scene, a));
  }

  openDoor(id) {
    setFlag('open_' + id);
    sfx('doorOpen');
    for (const o of this.objects.values()) if (o.door === id) this.tiles[o.y][o.x].setTexture('door_open');
    this.buildOpaque(); // 열린 문 너머가 보이기 시작한다
    this.updateRooms();
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
    this.guiltWait = Math.max(this.guiltWait, 8); // 부정 수치 환각과 죄책감 환청이 겹치지 않게
    sfx('follow');
    this.ui.glitch(250);
    if (state.denial >= DENIAL_PHANTOM) this.phantom();
  }

  // ── 죄책감 (GDD 4.4-2): 기억을 되찾을수록 환청·화면 왜곡이 잦아지고, 3단계에선 잠깐 키가 반전된다 ──
  // 탐색 중에만 일어난다 (대화·퍼즐·추격·사물함 중엔 멈춤)
  guiltDelay() {
    const [a, b] = GUILT_HAUNT_S[guiltLevel()] || [40, 60];
    return Phaser.Math.Between(a, b);
  }

  guiltTick() {
    if (this.over || !this.map.dark) return;
    // 대화·이벤트·퍼즐·추격·사물함 중엔 나오던 연출도 거두고, 끝난 뒤에도 잠시 쉬었다가 다시 시작한다
    if (this.busy || this.hidden || this.chase || state.flags.pendingChase) { this.stopGuilt(); this.guiltCalm = GUILT_CALM_S; return; }
    if (this.guiltCalm > 0) { this.guiltCalm--; return; }
    const lv = guiltLevel();
    if (lv < 2) return;
    if (--this.guiltWait <= 0) { this.guiltWait = this.guiltDelay(); this.guiltHaunt(lv); }
    if (lv >= 3 && !this.invert && --this.invertWait <= 0) {
      this.invertWait = Phaser.Math.Between(...GUILT_INVERT_EVERY_S);
      this.invertKeys();
    }
  }

  // 환청 (속삭임·문 긁는 소리·부르는 목소리) + 화면에 잠깐 떠오르는 말 + 짧은 일그러짐. 3단계는 시야도 출렁인다
  guiltHaunt(lv) {
    sfx(Phaser.Utils.Array.GetRandom(['whisper', 'scratch', 'murmur']));
    this.ui.glitch(lv >= 3 ? 320 : 200);
    const t = this.guiltText = this.add.text(Phaser.Math.Between(90, W - 90), Phaser.Math.Between(90, H - 170), Phaser.Utils.Array.GetRandom(GUILT_VOICES),
      textStyle(14, '#b46a6a', { fontStyle: 'italic' })).setOrigin(0.5).setScrollFactor(0).setDepth(97).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 0.75, duration: 500, hold: 900, yoyo: true, onComplete: () => { t.destroy(); if (this.guiltText === t) this.guiltText = null; } });
    if (lv >= 3) {
      // 시야각 왜곡: 화면이 살짝 기울었다 돌아온다
      const cam = this.cameras.main;
      this.guiltWarp = this.tweens.addCounter({
        from: 0, to: 1, duration: 1400, ease: 'Sine.easeInOut',
        onUpdate: tw => { const v = Math.sin(tw.getValue() * Math.PI); cam.setRotation(v * 0.035 * (this.warpSign ||= 1)); cam.setZoom(1 + v * 0.04); },
        onComplete: () => { cam.setRotation(0); cam.setZoom(1); this.warpSign = -this.warpSign; this.guiltWarp = null; },
      });
    }
  }

  // 키 반전: 심장 소리·흔들림으로 예고한 뒤 잠깐 좌우 또는 상하 이동이 뒤집힌다
  invertKeys() {
    sfx('heart');
    this.cameras.main.shake(350, 0.005);
    this.invertTimer = this.time.delayedCall(450, () => {
      if (this.busy || this.chase || this.hidden || this.over) return;
      this.invert = Phaser.Math.RND.pick(['lr', 'ud']);
      this.ui.glitch(150);
      this.invertTimer = this.time.delayedCall(GUILT_INVERT_MS, () => { this.invert = null; this.invertTimer = null; });
    });
  }

  // 이벤트·추격이 시작되면 진행 중인 죄책감 연출(떠오른 글자·화면 기울기·키 반전)을 바로 거둔다
  stopGuilt() {
    if (this.guiltText) { this.tweens.killTweensOf(this.guiltText); this.guiltText.destroy(); this.guiltText = null; }
    if (this.guiltWarp) { this.guiltWarp.stop(); this.guiltWarp = null; this.cameras.main.setRotation(0).setZoom(1); }
    this.invertTimer?.remove();
    this.invertTimer = null;
    this.invert = null;
  }

  // 반전 중이면 방향을 뒤집는다 (추격 중에는 반전하지 않는다)
  guiltDir(dir) {
    if (!this.invert || this.chase) return dir;
    const flip = this.invert === 'lr' ? { left: 'right', right: 'left' } : { up: 'down', down: 'up' };
    return flip[dir] || dir;
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
    this.stopGuilt();
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
    // 그림자가 사물함 바로 앞에 서 있는데 문을 열고 나오면 붙잡힌다
    if (this.chase && this.chase.x === this.tx && this.chase.y === this.ty) this.caught();
  }

  // ── 추격 ──
  startChase() {
    this.stopGuilt();
    const pc = state.flags.pendingChase;
    if (!pc || this.chase) return;
    const sprite = this.add.image(cx(pc.spawn.x), cx(pc.spawn.y), 'shadow').setDepth(3).setAlpha(0);
    this.tweens.add({ targets: sprite, alpha: 0.95, duration: 500 });
    // step: 그림자가 한 칸 움직이는 시간(ms). hide: 숨었을 때 반응 (없음 / breath / struggle). 추격마다 다르다 (GDD 4.6)
    // sparedScript: 문 붙잡기를 버텨 냈을 때 눈을 감기 전에 나오는 대사 (맵 스크립트 이름)
    this.chase = { x: pc.spawn.x, y: pc.spawn.y, sprite, lost: 0, step: pc.step || CHASE_STEP_MS, hide: pc.hide || null, sparedScript: pc.sparedScript || null };
    if (this.music) stopLoop(this.music);
    startLoop('chase');
    this.chaseTimer = this.time.addEvent({ delay: this.chase.step, loop: true, callback: this.chaseStep, callbackScope: this });
    this.breathTimer = this.time.delayedCall(400, this.breathe, [], this);
  }

  // 그림자가 얼마나 가까운지 (0 = 들리지 않을 만큼 멂, 1 = 바로 옆)
  shadowNear() {
    const c = this.chase;
    if (!c) return 0;
    return Math.max(0, 1 - Math.hypot(c.x - this.tx, c.y - this.ty) / SHADOW_HEAR);
  }

  // 그림자 소리: 가까울수록 크게. 숨어 있으면 사물함 문 너머로 먹먹하게 들린다
  shadowSfx(name) {
    const p = this.shadowNear();
    if (p > 0) sfx(name, 0.1 + 0.9 * p * p, this.hidden);
  }

  // 숨소리는 발걸음과 따로 돈다. 가까울수록 간격이 짧아진다
  breathe() {
    if (!this.chase || this.over) return;
    if (!this.busy) this.shadowSfx('breath');
    const delay = Phaser.Math.Linear(BREATH_FAR_MS, BREATH_NEAR_MS, this.shadowNear());
    this.breathTimer = this.time.delayedCall(delay, this.breathe, [], this);
  }

  chaseStep() {
    const c = this.chase;
    if (!c || this.busy || this.over) return;
    let next;
    if (this.hidden && c.hide && !c.spared) {
      // 숨는 걸 봤다: 사물함 바로 앞(플레이어 칸)까지 곧장 와서 미니게임
      if (c.x === this.tx && c.y === this.ty) return this.lockerEncounter();
      next = this.pathStep(c.x, c.y, this.tx, this.ty);
      if (!next) c.spared = true; // 갈 길이 없으면 1번째 추격처럼 서성이다 떠난다
    } else if (this.hidden) {
      // 숨은 동안엔 주변을 서성이다가, 방 밖 복도로 걸어 나가 멀어진 뒤 사라진다
      c.lost += c.step;
      if (c.lost < CHASE_WANDER_MS) {
        const opts = Object.values(DIRS).map(([dx, dy]) => [c.x + dx, c.y + dy]).filter(([x, y]) => this.passable(x, y) && !this.railBetween(c.x, c.y, x, y));
        // 방금 온 칸으로 바로 되돌아가지 않아야 제자리에서 떨지 않는다
        const fwd = opts.filter(([x, y]) => !(x === c.px && y === c.py));
        next = fwd.length ? Phaser.Utils.Array.GetRandom(fwd) : opts[0] || null;
      } else {
        c.exit ??= this.chaseExit(c.x, c.y);
        if (!c.exit || (c.x === c.exit[0] && c.y === c.exit[1])) return this.endChase();
        next = this.pathStep(c.x, c.y, c.exit[0], c.exit[1]);
        if (!next) return this.endChase();
      }
    } else {
      c.lost = 0;
      c.exit = null;
      next = this.pathStep(c.x, c.y, this.tx, this.ty);
    }
    if (!next) return;
    [c.px, c.py] = [c.x, c.y];
    [c.x, c.y] = next;
    this.shadowSfx('shadowStep');
    this.tweens.add({ targets: c.sprite, x: cx(c.x), y: cx(c.y), duration: c.step - 20 });
    if (!this.hidden && c.x === this.tx && c.y === this.ty) this.caught();
  }

  // 사물함 앞에 선 그림자와의 미니게임 (GDD 4.6). 그동안은 사물함에서 나갈 수 없고 그림자도 멈춘다(busy)
  async lockerEncounter() {
    const c = this.chase;
    this.busy = true;
    this.lockerView?.hint.setVisible(false);
    // 숨 참기는 심장 박동 리듬 게임이라, 추격 배경음의 박동과 섞이지 않게 잠시 멈춘다
    if (c.hide === 'breath') stopLoop('chase');
    const ok = await (c.hide === 'struggle' ? struggle(this) : holdBreath(this));
    if (this.over || this.chase !== c) return;
    if (!ok) return this.caught();
    if (c.hide === 'struggle') return this.shutEyes(c);
    if (c.hide === 'breath') startLoop('chase');
    this.busy = false;
    this.lockerView?.hint.setVisible(true);
    // 버텨 냈다: 서성이지 않고 바로 복도로 걸어 나가 사라진다
    c.spared = true;
    c.lost = CHASE_WANDER_MS;
    c.exit = null;
  }

  // 문 붙잡기를 버텨 냈다: 「제발…!」 → 눈을 질끈 감는 암전 → 눈을 뜨면 그림자가 사라져 있다 (걸어 나가지 않는다)
  async shutEyes(c) {
    const after = state.flags.pendingChase?.after;
    if (c.sparedScript) await runScript(this, this.getScript(c.sparedScript));
    this.ui.hideDialog();
    await eyesShut(this, () => this.endChase(false));
    if (this.over) return;
    this.lockerView?.hint.setVisible(true);
    if (after) this.run(this.getScript(after));
    else { this.busy = false; this.updateObjective(); }
  }

  // 시작점에서 갈 수 있는 칸까지의 거리 (BFS)
  distFrom(sx, sy) {
    const dist = new Map([[key(sx, sy), 0]]);
    const q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (dist.has(k) || !this.passable(nx, ny) || this.railBetween(x, y, nx, ny)) continue;
        dist.set(k, dist.get(key(x, y)) + 1);
        q.push([nx, ny]);
      }
    }
    return dist;
  }

  // 그림자가 떠나갈 칸: 숨은 곳에서 CHASE_LEAVE_DIST 이상 떨어진 복도 중 그림자에게 가장 가까운 칸.
  // 교실·방에 숨었으면 문을 지나 복도로, 복도에 숨었으면 복도를 따라 멀어진다.
  // 그런 복도가 없으면 숨은 곳에서 가장 먼 칸으로 간다.
  chaseExit(sx, sy) {
    const fromHide = this.distFrom(this.tx, this.ty);
    const fromShadow = this.distFrom(sx, sy);
    let best = null, bestD = Infinity, far = null, farD = -1;
    for (const [k, d] of fromShadow) {
      const [x, y] = k.split(',').map(Number);
      const h = fromHide.get(k) ?? Infinity;
      if (h >= CHASE_LEAVE_DIST && d < bestD && this.map.legend[this.grid[y][x]] === 'floor_corridor') [best, bestD] = [[x, y], d];
      if (h !== Infinity && h > farD) [far, farD] = [[x, y], h];
    }
    return best || far;
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

  // runAfter: false면 추격 후 스크립트를 부르는 쪽(shutEyes)이 직접 실행한다
  endChase(runAfter = true) {
    const c = this.chase;
    const pc = state.flags.pendingChase;
    this.chaseTimer.remove();
    this.breathTimer?.remove();
    this.chase = null;
    stopLoop('chase');
    sfx('escape');
    if (this.music) startLoop(this.music);
    this.tweens.add({ targets: c.sprite, alpha: 0, duration: 600, onComplete: () => c.sprite.destroy() });
    setFlag(pc.id + '_done');
    setFlag('pendingChase', null);
    saveGame();
    if (!runAfter) return;
    if (pc.after) this.run(this.getScript(pc.after));
    else this.updateObjective();
  }

  // 함정: 그림자가 from 칸에서 순식간에 덮쳐 와 붙잡는다 (스크립트 { t: 'shadowStrike', from: { x, y } })
  async shadowStrike(a) {
    this.ui.hideDialog();
    const s = this.add.image(cx(a.from.x), cx(a.from.y), 'shadow').setDepth(10.5).setAlpha(0);
    sfx('slam');
    await new Promise(r => this.tweens.add({ targets: s, alpha: 0.95, duration: 250, onComplete: r }));
    await new Promise(r => this.tweens.add({ targets: s, x: this.player.x, y: this.player.y, duration: a.ms || 450, ease: 'Quad.easeIn', onComplete: r }));
    this.caught();
    return 'stop';
  }

  caught() {
    if (this.over) return;
    this.over = true;
    this.busy = true;
    this.chaseTimer?.remove();
    this.breathTimer?.remove();
    stopLoop('chase');
    sfx('caught');
    const cam = this.cameras.main;
    cam.shake(400, 0.02);
    cam.flash(300, 120, 0, 0);
    this.time.delayedCall(700, () => {
      cam.fadeOut(500);
      cam.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
    });
  }
}
