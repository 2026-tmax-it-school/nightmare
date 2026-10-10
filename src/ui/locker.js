// 사물함 안 1인칭 시점: 통풍구 틈 너머로 복도와 다가오는 그림자를 본다
import { W, H } from '../constants.js';
import { textStyle } from './ui.js';

const VX = W / 2, VY = 230;                  // 복도 소실점
const SLIT = { x0: 170, x1: 470, y0: 176, h: 9, gap: 14, n: 6 };
const SLIT_Y1 = SLIT.y0 + SLIT.n * SLIT.gap;
const SEE_DIST = 8;                          // 이 칸 수 안이면 실루엣이 보인다

export class LockerView {
  constructor(scene) {
    this.s = scene;
    this.scale = 0;
    this.offset = 0;

    const outside = scene.add.graphics();
    this.drawCorridor(outside);
    this.figure = this.makeFigure(scene);
    const door = scene.add.graphics();
    this.drawDoor(door);

    this.view = scene.add.container(0, 0, [outside, this.figure, door]);
    this.root = scene.add.container(0, 0, [
      this.view,
      scene.add.text(W / 2, H - 30, '사물함 안에 숨어 있다 — E: 나가기', textStyle(12, '#6f6878')).setOrigin(0.5),
    ]).setScrollFactor(0).setDepth(90).setAlpha(0);

    scene.tweens.add({ targets: this.root, alpha: 1, duration: 180 });
    // 숨소리에 맞춰 시야가 천천히 오르내린다
    this.breath = scene.tweens.add({ targets: this.view, y: 3, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  drawCorridor(g) {
    g.fillStyle(0x000000).fillRect(0, 0, W, H);
    // 바닥 / 좌우 벽 / 천장을 소실점으로 모은다
    g.fillStyle(0x1d1f27).fillTriangle(0, H, W, H, VX, VY);
    g.fillStyle(0x15161d).fillTriangle(0, 0, 0, H, VX, VY);
    g.fillStyle(0x15161d).fillTriangle(W, 0, W, H, VX, VY);
    g.fillStyle(0x0b0b10).fillTriangle(0, 0, W, 0, VX, VY);
    // 바닥 타일 줄눈
    g.lineStyle(1, 0x2a2c36, 0.6);
    for (let i = -6; i <= 6; i++) g.lineBetween(VX + i * 110, H, VX, VY);
    // 벽에 늘어선 교실 문
    g.fillStyle(0x24201c);
    for (const t of [0.35, 0.6, 0.78]) {
      const s = 1 - t;
      const w = 50 * s, h = 150 * s;
      const lx = VX - (VX - 20) * s, rx = VX + (VX - 20) * s;
      const y = VY + 60 * s;
      g.fillRect(lx, y - h, w, h);
      g.fillRect(rx - w, y - h, w, h);
    }
    // 복도 끝은 완전한 어둠
    g.fillStyle(0x000000).fillCircle(VX, VY, 34);
  }

  makeFigure(scene) {
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.95);
    g.fillEllipse(0, -170, 46, 56);          // 머리
    g.fillRect(-20, -150, 40, 14);           // 목
    g.fillRoundedRect(-52, -138, 104, 150, 18); // 몸
    g.fillRect(-58, -126, 16, 120).fillRect(42, -126, 16, 120); // 팔
    g.fillRect(-34, 10, 26, 110).fillRect(8, 10, 26, 110);      // 다리
    g.fillStyle(0xff2a2a).fillRect(-14, -176, 7, 3).fillRect(7, -176, 7, 3); // 눈
    const c = scene.add.container(VX, VY, [g]).setScale(0).setVisible(false);
    return c;
  }

  drawDoor(g) {
    const { x0, x1, y0, h, gap, n } = SLIT;
    g.fillStyle(0x23282d);
    g.fillRect(0, 0, W, y0);
    g.fillRect(0, SLIT_Y1, W, H - SLIT_Y1);
    g.fillRect(0, y0, x0, SLIT_Y1 - y0);
    g.fillRect(x1, y0, W - x1, SLIT_Y1 - y0);
    for (let i = 0; i < n; i++) g.fillRect(x0, y0 + i * gap + h, x1 - x0, gap - h);
    // 틈 가장자리의 눌린 철판 / 희미한 빛
    for (let i = 0; i < n; i++) {
      const y = y0 + i * gap;
      g.fillStyle(0x3a4148).fillRect(x0 - 2, y + h, x1 - x0 + 4, 2);
      g.fillStyle(0x0f1215).fillRect(x0 - 2, y - 2, x1 - x0 + 4, 2);
      g.fillStyle(0x8fa0b8, 0.05).fillRect(x0, y, x1 - x0, h);
    }
    // 문짝 이음매 · 리벳 · 가장자리 그림자
    g.fillStyle(0x1a1e22).fillRect(0, 60, W, 3).fillRect(0, 410, W, 3);
    g.fillStyle(0x4a535b);
    for (const x of [40, W - 40]) for (const y of [40, 120, 360, 440]) g.fillRect(x - 2, y - 2, 4, 4);
    g.fillStyle(0x000000, 0.5).fillRect(0, 0, W, 18).fillRect(0, H - 18, W, 18).fillRect(0, 0, 18, H).fillRect(W - 18, 0, 18, H);
  }

  // 매 프레임: 추격자와의 거리에 따라 실루엣 크기·위치, 시야 떨림
  update(chase, px, py) {
    let target = 0, offset = this.offset;
    const d = chase ? Math.abs(chase.x - px) + Math.abs(chase.y - py) : Infinity;
    if (d <= SEE_DIST) {
      target = 1.15 / Math.max(d, 1);
      offset = Phaser.Math.Clamp((chase.x - px) * 55, -150, 150);
    }
    this.scale += (target - this.scale) * 0.12;
    this.offset += (offset - this.offset) * 0.12;
    const f = this.figure;
    f.setVisible(this.scale > 0.02);
    f.setScale(this.scale);
    // 다가올수록 커지되, 붉은 눈은 항상 통풍구 틈 높이에 걸린다
    f.setPosition(VX + this.offset * Math.min(this.scale * 2, 1), VY + 170 * Math.min(this.scale, 1));
    this.view.x = d <= 2 ? Phaser.Math.Between(-2, 2) : 0;
  }

  destroy() {
    this.breath.stop();
    const root = this.root;
    this.s.tweens.add({ targets: root, alpha: 0, duration: 150, onComplete: () => root.destroy() });
  }
}
