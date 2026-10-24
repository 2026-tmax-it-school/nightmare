// 거울 1인칭 화면: 거울 속에 재민의 얼굴과 등 뒤 공간이 비친다. 기본은 화장실 세면대 거울, place: "bedroom"이면 침실 벽거울.
// 거울 스크립트에서 { "t": "mirror", "place", "face": "now" | "young", "fog": bool, "cracked": bool }로 열고 바꾼다.
// 스크립트가 끝나면 Explore가 닫는다.
import { W, H } from '../constants.js';
import { textStyle } from './ui.js';

const M = { x: 170, y: 34, w: 300, h: 290 };   // 거울 유리 영역
const FX = W / 2, FY = 176;                     // 얼굴 중심 (어깨는 거울 아래 테두리에 걸린다)

// 지금의 재민(20대 회사원) / 거울 이벤트의 열일곱 살(교복)
export const FACES = {
  now: { skin: 0xd9b996, shade: 0xb8977a, hair: 0x15141a, top: 0x262a33, collar: 0xd8d8d2, tie: null, tired: true },
  young: { skin: 0xe8cbaa, shade: 0xc8a888, hair: 0x1c1a20, top: 0x23304e, collar: 0xe8e6de, tie: 0x7a2228, tired: false },
};

// 재민의 가슴 위 상반신 (정면). 거울·창문 1인칭 화면이 같이 쓴다. (fx, fy) = 얼굴 중심, bottom = 옷 아래 끝
export function drawPortrait(g, f, fx, fy, bottom) {
  const FX = fx, FY = fy;
  // 어깨 · 옷
  g.fillStyle(f.top).fillRoundedRect(FX - 110, FY + 70, 220, bottom - (FY + 70), { tl: 40, tr: 40, bl: 0, br: 0 });
  g.fillStyle(f.collar).fillTriangle(FX - 30, FY + 70, FX, FY + 112, FX - 4, FY + 70).fillTriangle(FX + 30, FY + 70, FX, FY + 112, FX + 4, FY + 70);
  if (f.tie) g.fillStyle(f.tie).fillTriangle(FX - 8, FY + 84, FX + 8, FY + 84, FX, FY + 150);
  // 목 · 얼굴
  g.fillStyle(f.shade).fillRect(FX - 20, FY + 40, 40, 36);
  g.fillStyle(f.skin).fillEllipse(FX, FY, 104, 124);
  g.fillStyle(f.shade).fillEllipse(FX - 52, FY + 4, 14, 24).fillEllipse(FX + 52, FY + 4, 14, 24);
  // 머리카락
  g.fillStyle(f.hair).fillEllipse(FX, FY - 44, 112, 54).fillRect(FX - 54, FY - 44, 12, 40).fillRect(FX + 42, FY - 44, 12, 40);
  if (!f.tired) g.fillTriangle(FX - 40, FY - 30, FX - 6, FY - 26, FX - 30, FY - 10); // 앞머리
  // 눈 · 눈썹 · 입
  g.fillStyle(0x15141a).fillRect(FX - 30, FY - 2, 14, 5).fillRect(FX + 16, FY - 2, 14, 5);
  g.fillRect(FX - 32, FY - 14, 18, 3).fillRect(FX + 14, FY - 14, 18, 3);
  if (f.tired) g.fillStyle(0x8a6e5a, 0.6).fillRect(FX - 30, FY + 5, 14, 3).fillRect(FX + 16, FY + 5, 14, 3); // 다크서클
  g.fillStyle(f.shade).fillRect(FX - 3, FY + 6, 6, 18);
  g.fillStyle(0x7a4a40).fillRect(FX - 12, FY + 34, 24, 3);
}

// 거울 완성 CG (assets/cg/mirror_*.png, 640×480). 상태에 맞는 그림이 있으면 코드로 그린 화면 대신 쓴다
function cgKey(o) {
  if (o.place === 'bedroom') return 'cg_mirror_bedroom';
  if (o.face === 'young') return 'cg_mirror_young';
  if (o.fog) return 'cg_mirror_now_fog';
  return o.cracked ? 'cg_mirror_now_cracked' : 'cg_mirror_now';
}
const CG_GLASS = { x: 119, y: 28, w: 404, h: 308 };   // CG 안 거울 유리 영역 (640×480 기준)
// 거울 속 사람은 이 점(유리 아래 가운데)을 기준으로 숨 쉬듯 늘었다 줄어든다
const CG_ANCHOR = { x: 320, y: 336 };

export class MirrorView {
  constructor(scene, opts = {}) {
    this.s = scene;
    this.bedroom = opts.place === 'bedroom';
    if (scene.textures.exists(cgKey({ face: 'now', ...opts }))) return this.initCG(scene, opts);
    this.room = scene.add.graphics();
    this.drawRoom(this.room);
    this.glass = scene.add.graphics();
    this.face = scene.add.graphics();
    this.faceBox = scene.add.container(0, 0, [this.face]);
    this.over = scene.add.graphics();
    const frame = scene.add.graphics();
    this.drawFrame(frame);

    this.front = scene.add.container(0, 0);
    this.vignette = scene.add.graphics();
    if (this.bedroom) this.drawVignette(this.vignette);
    this.props = scene.add.container(0, 0);
    if (this.bedroom) this.addBedroomProps();

    this.root = scene.add.container(0, 0, [
      this.room, this.front, this.glass, this.props, this.faceBox, this.vignette, this.over, frame,
      scene.add.text(W / 2, H - 14, '거울을 보고 있다', textStyle(11, '#6f6878')).setOrigin(0.5, 1),
    ]).setScrollFactor(0).setDepth(90).setAlpha(0);
    this.set({ face: 'now', ...opts });

    scene.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
    // 숨 쉴 때마다 거울 속 얼굴이 아주 조금 오르내린다
    this.breath = scene.tweens.add({ targets: this.faceBox, y: 3, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // 완성 CG 화면: 얼굴·김 서림·금 상태에 따라 그림을 바꾼다. 어린 얼굴에 금이 간 그림은 없어서 어린 얼굴 위에 코드로 금을 긋는다
  initCG(scene, opts) {
    this.cg = true;
    this.opts = { face: 'now', place: opts.place, ...opts };
    const key = cgKey(this.opts), parts = this.cgParts(key);
    // 사람 층(_person)과 사람을 지운 바탕(_back)이 있으면 사람만 움직이고, 없으면 그림 한 장을 그대로 쓴다
    this.img = scene.add.image(0, 0, parts.back).setOrigin(0).setDisplaySize(W, H);
    this.person = scene.add.image(CG_ANCHOR.x, CG_ANCHOR.y, parts.person || parts.back)
      .setOrigin(CG_ANCHOR.x / W, CG_ANCHOR.y / H).setVisible(!!parts.person);
    this.crackG = scene.add.graphics();
    this.root = scene.add.container(0, 0, [
      scene.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0), this.img, this.person, this.crackG,
      scene.add.text(W / 2, H - 14, '거울을 보고 있다', textStyle(11, '#6f6878')).setOrigin(0.5, 1),
    ]).setScrollFactor(0).setDepth(90).setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
    this.breath = scene.tweens.add({ targets: this.person, scaleY: 1.014, scaleX: 1.004, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.drawCGCracks();
  }

  // 상태에 맞는 CG 한 벌: 사람을 나눈 그림이 있으면 { back, person }, 아니면 { back: 그림 한 장 }
  cgParts(key) {
    const t = this.s.textures;
    return t.exists(key + '_person') && t.exists(key + '_back') ? { back: key + '_back', person: key + '_person' } : { back: key };
  }

  drawCGCracks() {
    const g = this.crackG;
    g.clear();
    if (!(this.opts.cracked && this.opts.face === 'young')) return;
    const { x, y, w, h } = CG_GLASS, ox = x + w / 2, oy = y + h * 0.45;
    g.lineStyle(2, 0xe8eef2, 0.75);
    for (let i = 0; i < 11; i++) {
      // 금은 유리 가장자리에서 끝난다 (광선이 유리 사각형 밖으로 나가는 거리까지만)
      const a = (i / 11) * Math.PI * 2 + 0.3, ux = Math.cos(a), uy = Math.sin(a);
      const tx = ux > 0 ? (x + w - ox) / ux : (x - ox) / ux, ty = uy > 0 ? (y + h - oy) / uy : (y - oy) / uy;
      const len = Math.min(tx, ty) * (0.82 + (i % 3) * 0.09), dx = ux * len, dy = uy * len;
      g.beginPath().moveTo(ox, oy).lineTo(ox + dx * 0.45 + 8, oy + dy * 0.45 - 6).lineTo(ox + dx, oy + dy).strokePath();
    }
    g.lineStyle(1, 0xe8eef2, 0.5).strokeCircle(ox, oy, 14).strokeCircle(ox, oy, 34);
  }

  // 얼굴·김 서림·금을 바꾼다 (지정하지 않은 값은 그대로)
  set(opts) {
    this.opts = { ...this.opts, ...opts };
    if (this.cg) {
      const key = cgKey(this.opts);
      if (this.s.textures.exists(key)) {
        const parts = this.cgParts(key);
        this.img.setTexture(parts.back);
        this.person.setTexture(parts.person || parts.back).setVisible(!!parts.person);
      }
      this.drawCGCracks();
      if (opts.face && this.root.alpha > 0) this.s.cameras.main.flash(160, 40, 40, 50);
      return;
    }
    const { face, fog, cracked } = this.opts;
    this.glass.clear();
    this.drawReflection(this.glass);
    this.face.clear();
    this.drawFace(this.face, FACES[face] || FACES.now);
    this.over.clear();
    if (fog) this.drawFog(this.over);
    if (cracked) this.drawCracks(this.over);
    if (opts.face && this.root.alpha > 0) this.s.cameras.main.flash(160, 40, 40, 50);
  }

  // 거울 밖: 화장실 앞벽 타일과 세면대 / 침실 벽(회벽 + 갈색 걸레받이)
  drawRoom(g) {
    g.fillStyle(0x000000).fillRect(0, 0, W, H);
    if (this.bedroom) {
      return; // 벽은 addBedroomProps가 맵의 wall_face 그림으로 깐다
    }
    g.fillStyle(0x2a2f2e).fillRect(0, 0, W, 360);
    g.lineStyle(1, 0x1f2423, 1);
    for (let y = 0; y < 360; y += 24) g.lineBetween(0, y, W, y);
    for (let x = 0; x < W; x += 24) g.lineBetween(x, 0, x, 360);
    // 세면대 상판과 수도꼭지
    g.fillStyle(0xbfc6c8).fillRect(90, 336, 460, 26);
    g.fillStyle(0x8f979a).fillRect(90, 360, 460, 6);
    g.fillStyle(0x9aa3ab).fillRect(312, 316, 16, 22).fillRect(300, 312, 40, 6);
    g.fillStyle(0x000000, 0.45).fillRect(0, 366, W, H - 366);
  }

  // 거울 속: 등 뒤의 화장실 (칸막이·천장 등) / 침실 (어두운 방, 현관문, 비 내리는 창)
  drawReflection(g) {
    const { x, y, w, h } = M;
    if (this.bedroom) {
      // 벽·바닥만 그린다. 현관문·창은 맵과 같은 에셋 그림(addBedroomProps)
      g.fillStyle(0x24231f).fillRect(x, y, w, h);
      g.fillStyle(0x1a1815).fillRect(x, y + h - 70, w, 70); // 바닥
      g.fillStyle(0x0d0c0a, 0.4).fillEllipse(x + w - 30, y + 30, 90, 50).fillEllipse(x + 40, y + h - 20, 100, 40);
      return;
    }
    g.fillStyle(0x1b2120).fillRect(x, y, w, h);
    g.lineStyle(1, 0x151a19, 1);
    for (let ty = y + 10; ty < y + h; ty += 18) g.lineBetween(x, ty, x + w, ty);
    for (let tx = x + 6; tx < x + w; tx += 18) g.lineBetween(tx, y, tx, y + h);
    // 등 뒤 칸막이 문들 (거울이라 오른쪽에 있다)
    g.fillStyle(0x3d4549).fillRect(x + 214, y + 44, 40, 190).fillRect(x + 258, y + 44, 42, 190);
    g.fillStyle(0x2c3236).fillRect(x + 254, y + 44, 4, 190);
    g.fillStyle(0x9aa3ab).fillRect(x + 220, y + 140, 3, 8);
    // 꺼진 천장 등 + 희미한 빛
    g.fillStyle(0x3a3f44).fillRect(x + 60, y + 6, 70, 6);
    g.fillStyle(0xcfd8e0, 0.05).fillTriangle(x + 60, y + 12, x + 130, y + 12, x + 180, y + h).fillTriangle(x + 60, y + 12, x + 10, y + h, x + 180, y + h);
    // 물때 · 얼룩
    g.fillStyle(0x0d1010, 0.35).fillEllipse(x + 30, y + h - 30, 80, 40).fillEllipse(x + w - 20, y + 20, 60, 30);
  }

  // 침실 거울 속: 등 뒤 현관문(거울이라 왼쪽)과 비 내리는 창을 맵과 같은 에셋 그림으로. 창 유리 안에는 비가 계속 내린다
  addBedroomProps() {
    const { x, y, w, h } = M;
    const S = 4, floorY = y + h - 70, wallY = floorY - 32 * S; // 거울 속은 맵 그림의 4배: 벽 한 칸 = 128px
    // 벽: 맵의 wall_face를 그대로 쓴다. 회벽(위 1~18줄)은 위로 반복, 갈색 띠(19줄~)는 바닥 바로 위
    const tex = this.s.textures.get('wall_face');
    // 회벽은 맨 위 어두운 테두리(0~2줄)를 빼야 위로 반복해도 줄무늬가 생기지 않는다
    if (!tex.has('m_plaster')) { tex.add('m_plaster', 0, 0, 3, 32, 15); tex.add('m_band', 0, 0, 18, 32, 14); }
    const wallTile = (wx, wy, ww, wh, frame, sc) => this.s.add.tileSprite(wx, wy, ww, wh, 'wall_face', frame).setOrigin(0).setTileScale(sc);
    // 거울 밖 앞벽 (8배): 화면 위부터 회벽, 맨 아래 갈색 띠
    const FS = 8, bandH = 14 * FS;
    this.front.add([wallTile(0, 0, W, H - bandH, 'm_plaster', FS), wallTile(0, H - bandH, W, bandH, 'm_band', FS),
      this.s.add.rectangle(0, 0, W, H, 0x0a1020, 0.5).setOrigin(0)]); // 침실 맵과 같은 밤 조명 (맵 ambient보다 조금 더 어둡게)
    // 거울 속 뒷벽 (4배): 위는 회벽, 바닥 바로 위 한 칸이 맵과 같은 벽 (문·창이 그 칸에 있다)
    const back = [wallTile(x, y, w, wallY - y + S, 'm_plaster', S), wallTile(x, wallY, w, 32 * S, undefined, S)];
    // 현관문: 재민 뒤 오른쪽에 있으니 거울 속에서도 오른쪽. 32×32 그림을 문 비율(좁고 높게)로 늘린다
    const door = this.s.add.image(x + w - 96 - 10, floorY, 'homedoor').setOrigin(0, 1).setDisplaySize(96, 150);
    // 창: 맵과 같은 그림을 같은 배율로, 벽 칸 안 같은 높이에. 그림 중 창틀 부분(x 3~28, y 1~19)만
    const CX = 3, CY = 1, wx = x + 10, wy = wallY + CY * S; // 창은 왼쪽
    const win = this.s.add.image(wx - CX * S, wallY, 'window_home').setOrigin(0).setScale(S).setCrop(CX, CY, 26, 19);
    const rain = this.s.add.graphics();
    // 거울 속 배경은 인물보다 눈에 덜 띄게 어둡게 + 유리의 옅은 푸른 회색 (얼굴 그림의 어둠과 합쳐 약 35% 어둡다)
    this.props.add([...back, door, win, rain, this.s.add.rectangle(x, y, w, h, 0x101824, 0.5).setOrigin(0)]);
    // 유리 두 칸 (Explore의 WINDOW_PANES와 같은 위치) → 화면 좌표
    const panes = [[6, 3, 9, 14], [18, 3, 8, 14]].map(([px, py, pw, ph]) => [wx + (px - CX) * S, wy + (py - CY) * S, pw * S, ph * S]);
    // 가는 빗줄기: 방울마다 자리·속도·길이·진하기가 달라 무늬가 되풀이되지 않는다
    const drop = (p, d = {}) => Object.assign(d, {
      pane: p, x: p[0] + Math.random() * p[2], y: p[1] - Math.random() * p[3], v: 0.08 + Math.random() * 0.1, len: 6 + Math.random() * 8, a: 0.2 + Math.random() * 0.35,
    });
    const drops = panes.flatMap(p => Array.from({ length: 14 }, () => Object.assign(drop(p), { y: p[1] + Math.random() * p[3] })));
    let last = this.s.time.now;
    this.rainEv = this.s.time.addEvent({
      delay: 30, loop: true, callback: () => {
        const now = this.s.time.now, dt = now - last;
        last = now;
        rain.clear();
        for (const d of drops) {
          const [, py, , ph] = d.pane;
          d.y += d.v * dt;
          if (d.y > py + ph) drop(d.pane, d);
          const top = Math.max(d.y, py), bot = Math.min(d.y + d.len, py + ph);
          if (bot > top) rain.fillStyle(0x8aa0bc, d.a).fillRect(d.x, top, 1, bot - top);
        }
      },
    });
  }

  // 침실 거울 유리 모서리 비네팅: 가장자리로 갈수록 어둡고 네 귀퉁이가 가장 어둡다 (인물 위에도 덮인다)
  drawVignette(g) {
    const { x, y, w, h } = M;
    for (let i = 0; i < 10; i++) g.lineStyle(6, 0x05070a, 0.32 * (1 - i / 10)).strokeRect(x + 3 + i * 6, y + 3 + i * 6, w - 6 - i * 12, h - 6 - i * 12);
    // 귀퉁이: 유리 안쪽 삼각형만 (밖으로 번지지 않게), 두 겹
    for (const [r, al] of [[44, 0.22], [24, 0.25]]) {
      g.fillStyle(0x05070a, al);
      g.fillTriangle(x, y, x + r, y, x, y + r).fillTriangle(x + w, y, x + w - r, y, x + w, y + r)
        .fillTriangle(x, y + h, x + r, y + h, x, y + h - r).fillTriangle(x + w, y + h, x + w - r, y + h, x + w, y + h - r);
    }
  }

  // 가슴 위 상반신 (정면, 크게) + 거울 속 얼굴은 어둡다
  drawFace(g, f) {
    drawPortrait(g, f, FX, FY, M.y + M.h + 8);
    g.fillStyle(0x0a0d12, 0.35).fillRect(M.x, M.y, M.w, M.h);
  }

  drawFog(g) {
    const { x, y, w, h } = M;
    g.fillStyle(0xd8dde0, 0.5).fillRect(x, y, w, h);
    g.fillStyle(0xeef2f4, 0.25);
    for (const [ex, ey, ew, eh] of [[60, 60, 160, 90], [200, 160, 180, 110], [90, 230, 200, 80]]) g.fillEllipse(x + ex, y + ey, ew, eh);
  }

  drawCracks(g) {
    g.lineStyle(2, 0xe8eef2, 0.75);
    const ox = M.x + 210, oy = M.y + 90;
    for (const [dx, dy] of [[-150, -60], [-180, 40], [-90, 190], [10, 200], [90, 120], [80, -90], [-30, -90]]) {
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(ox + dx * 0.45 + 8, oy + dy * 0.45 - 6);
      g.lineTo(ox + dx, oy + dy);
      g.strokePath();
    }
    g.lineStyle(1, 0xe8eef2, 0.5).strokeCircle(ox, oy, 14).strokeCircle(ox, oy, 34);
  }

  // 녹슨 거울 테두리 / 침실: 얼룩진 나무 테두리
  drawFrame(g) {
    const { x, y, w, h } = M;
    if (this.bedroom) {
      g.fillStyle(0x5a3e28).fillRect(x - 14, y - 14, w + 28, 14).fillRect(x - 14, y + h, w + 28, 14)
        .fillRect(x - 14, y, 14, h).fillRect(x + w, y, 14, h);
      g.fillStyle(0x3e2a1a).fillRect(x - 14, y + h + 10, w + 28, 4).fillRect(x + w + 10, y - 14, 4, h + 28);
      g.fillStyle(0x2a1c12, 0.6).fillRect(x - 14, y + 70, 6, 24).fillRect(x + w + 4, y + 200, 6, 30).fillRect(x + 120, y - 14, 30, 5);
      g.fillStyle(0x0a0a0a, 0.35).fillCircle(x + 60, y + 40, 6).fillCircle(x + 240, y + 230, 8).fillCircle(x + 210, y + 60, 4); // 유리 얼룩
      // 유리와 테두리 사이 얇은 어두운 선 (유리 경계가 또렷하게)
      g.lineStyle(3, 0x150e08, 1).strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
      // 유리 가장자리 희미한 반사광 (위·왼쪽 빛, 오른쪽 위 귀퉁이 사선)
      g.fillStyle(0xcfd8e0, 0.16).fillRect(x + 2, y + 2, w - 4, 2).fillRect(x + 2, y + 4, 2, h - 6);
      g.fillStyle(0xcfd8e0, 0.08).fillTriangle(x + w - 70, y + 2, x + w - 40, y + 2, x + w - 2, y + 40).fillTriangle(x + w - 70, y + 2, x + w - 2, y + 40, x + w - 2, y + 70);
      // 테두리 모서리의 낡은 질감·흠집: 밝은 긁힘 + 칠이 벗겨진 어두운 자국
      g.lineStyle(1, 0x8a6a4a, 0.8);
      for (const [ax, ay, bx, by] of [[x - 12, y - 6, x - 4, y - 12], [x + w + 3, y - 10, x + w + 11, y - 4], [x - 11, y + h + 4, x - 3, y + h + 11],
        [x + w + 4, y + h + 9, x + w + 12, y + h + 2], [x + 30, y - 9, x + 46, y - 7], [x + w - 60, y + h + 6, x + w - 44, y + h + 8]]) g.lineBetween(ax, ay, bx, by);
      g.fillStyle(0x24170e, 0.8).fillRect(x - 14, y - 14, 9, 3).fillRect(x - 14, y - 11, 3, 7).fillRect(x + w + 5, y + h + 11, 9, 3)
        .fillRect(x + w + 11, y + h + 4, 3, 7).fillRect(x + w + 6, y - 14, 6, 2).fillRect(x - 14, y + h + 6, 2, 6);
      return;
    }
    g.fillStyle(0x6f767c).fillRect(x - 10, y - 10, w + 20, 10).fillRect(x - 10, y + h, w + 20, 10)
      .fillRect(x - 10, y, 10, h).fillRect(x + w, y, 10, h);
    g.fillStyle(0x4a5156).fillRect(x - 10, y + h + 6, w + 20, 4);
    g.fillStyle(0x8a5a3a, 0.5).fillRect(x - 10, y + 40, 4, 30).fillRect(x + w + 6, y + 180, 4, 50);
    g.fillStyle(0x9aa3ab);
    for (const [px, py] of [[x - 5, y - 5], [x + w + 5, y - 5], [x - 5, y + h + 5], [x + w + 5, y + h + 5]]) g.fillRect(px - 2, py - 2, 4, 4);
  }

  destroy() {
    this.breath.stop();
    this.rainEv?.remove();
    const root = this.root;
    return new Promise(r => this.s.tweens.add({ targets: root, alpha: 0, duration: 200, onComplete: () => { root.destroy(); r(); } }));
  }
}
