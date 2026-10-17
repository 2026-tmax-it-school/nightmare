// 화장실 세면대 거울 1인칭 화면: 거울 속에 재민의 얼굴과 등 뒤 화장실이 비친다.
// 거울 스크립트에서 { "t": "mirror", "face": "now" | "young", "fog": bool, "cracked": bool }로 열고 바꾼다.
// 스크립트가 끝나면 Explore가 닫는다.
import { W, H } from '../constants.js';
import { textStyle } from './ui.js';

const M = { x: 170, y: 34, w: 300, h: 290 };   // 거울 유리 영역
const FX = W / 2, FY = 176;                     // 얼굴 중심 (어깨는 거울 아래 테두리에 걸린다)

// 지금의 재민(20대 회사원) / 거울 이벤트의 열일곱 살(교복)
const FACES = {
  now: { skin: 0xd9b996, shade: 0xb8977a, hair: 0x15141a, top: 0x262a33, collar: 0xd8d8d2, tie: null, tired: true },
  young: { skin: 0xe8cbaa, shade: 0xc8a888, hair: 0x1c1a20, top: 0x23304e, collar: 0xe8e6de, tie: 0x7a2228, tired: false },
};

export class MirrorView {
  constructor(scene, opts = {}) {
    this.s = scene;
    this.room = scene.add.graphics();
    this.drawRoom(this.room);
    this.glass = scene.add.graphics();
    this.face = scene.add.graphics();
    this.faceBox = scene.add.container(0, 0, [this.face]);
    this.over = scene.add.graphics();
    const frame = scene.add.graphics();
    this.drawFrame(frame);

    this.root = scene.add.container(0, 0, [
      this.room, this.glass, this.faceBox, this.over, frame,
      scene.add.text(W / 2, H - 14, '거울을 보고 있다', textStyle(11, '#6f6878')).setOrigin(0.5, 1),
    ]).setScrollFactor(0).setDepth(90).setAlpha(0);
    this.set({ face: 'now', ...opts });

    scene.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
    // 숨 쉴 때마다 거울 속 얼굴이 아주 조금 오르내린다
    this.breath = scene.tweens.add({ targets: this.faceBox, y: 3, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // 얼굴·김 서림·금을 바꾼다 (지정하지 않은 값은 그대로)
  set(opts) {
    this.opts = { ...this.opts, ...opts };
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

  // 거울 밖: 화장실 앞벽 타일과 세면대
  drawRoom(g) {
    g.fillStyle(0x000000).fillRect(0, 0, W, H);
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

  // 거울 속: 등 뒤의 화장실 (칸막이·천장 등)
  drawReflection(g) {
    const { x, y, w, h } = M;
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

  // 가슴 위 상반신 (정면, 크게)
  drawFace(g, f) {
    // 어깨 · 옷
    g.fillStyle(f.top).fillRoundedRect(FX - 110, FY + 70, 220, M.y + M.h + 8 - (FY + 70), { tl: 40, tr: 40, bl: 0, br: 0 });
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
    // 거울 속 얼굴은 어둡다
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

  // 녹슨 거울 테두리
  drawFrame(g) {
    const { x, y, w, h } = M;
    g.fillStyle(0x6f767c).fillRect(x - 10, y - 10, w + 20, 10).fillRect(x - 10, y + h, w + 20, 10)
      .fillRect(x - 10, y, 10, h).fillRect(x + w, y, 10, h);
    g.fillStyle(0x4a5156).fillRect(x - 10, y + h + 6, w + 20, 4);
    g.fillStyle(0x8a5a3a, 0.5).fillRect(x - 10, y + 40, 4, 30).fillRect(x + w + 6, y + 180, 4, 50);
    g.fillStyle(0x9aa3ab);
    for (const [px, py] of [[x - 5, y - 5], [x + w + 5, y - 5], [x - 5, y + h + 5], [x + w + 5, y + h + 5]]) g.fillRect(px - 2, py - 2, 4, 4);
  }

  destroy() {
    this.breath.stop();
    const root = this.root;
    return new Promise(r => this.s.tweens.add({ targets: root, alpha: 0, duration: 200, onComplete: () => { root.destroy(); r(); } }));
  }
}
