// 사물함 안 1인칭 시점: 통풍구 틈 너머로 복도와 다가오는 그림자를 본다
import { W, H } from '../constants.js';
import { textStyle } from './ui.js';

const VX = W / 2, VY = 230;                  // 복도 소실점
const SLIT = { x0: 170, x1: 470, y0: 176, h: 9, gap: 14, n: 6 };
const SLIT_Y1 = SLIT.y0 + SLIT.n * SLIT.gap;
const SEE_DIST = 8;                          // 이 칸 수 안이면 실루엣이 보인다

// 장소별 틈 너머 풍경. 통풍구로 보이는 건 x 170~470, y 176~260 띠뿐이라 핵심 요소는 그 안에 둔다.
// 맵 데이터의 사물함 오브젝트에 "view"로 지정한다 (없으면 corridor).
const SCENERY = {
  corridor(g) {
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
  },

  // 교실 뒤편에서 앞을 본다: 칠판, 달빛 드는 창문, 줄지은 책상
  classroom(g) {
    g.fillStyle(0x000000).fillRect(0, 0, W, H);
    g.fillStyle(0x19181d).fillRect(110, 100, 420, 200);              // 앞쪽 벽
    g.fillStyle(0x221a14).fillTriangle(0, H, W, H, VX, 300);         // 나무 바닥
    g.fillRect(110, 300, 420, 6);
    // 칠판
    g.fillStyle(0x3a2e22).fillRect(172, 158, 196, 80);
    g.fillStyle(0x17271e).fillRect(176, 162, 188, 70);
    g.lineStyle(1, 0x5d6e62, 0.45);
    g.lineBetween(190, 180, 250, 176).lineBetween(196, 196, 300, 192).lineBetween(270, 214, 340, 210);
    g.fillStyle(0x3a2e22).fillRect(172, 236, 196, 4);                // 분필 받침
    // 창문 + 달빛
    g.fillStyle(0x24324c).fillRect(386, 150, 80, 92);
    g.fillStyle(0x34466a, 0.6).fillRect(390, 154, 34, 40).fillRect(428, 198, 34, 40);
    g.fillStyle(0x15161a).fillRect(424, 150, 4, 92).fillRect(386, 194, 80, 4);
    g.fillStyle(0x6a82b0, 0.07).fillTriangle(386, 242, 466, 242, 520, H).fillTriangle(386, 242, 300, H, 520, H);
    // 책상 줄 (멀수록 작게)
    for (const [y, w, h, gap] of [[244, 30, 7, 46], [254, 40, 9, 60]]) {
      for (let x = 182; x + w <= 470; x += gap) {
        g.fillStyle(0x4a3826).fillRect(x, y, w, h);
        g.fillStyle(0x2a2018).fillRect(x + 2, y + h, 2, 6).fillRect(x + w - 4, y + h, 2, 6);
      }
    }
  },

  // 경비실: 꺼진 CCTV 모니터 묶음, 책상, 벽의 열쇠함, 철문
  guardroom(g) {
    g.fillStyle(0x000000).fillRect(0, 0, W, H);
    g.fillStyle(0x1a1c19).fillRect(130, 110, 380, 190);              // 벽
    g.fillStyle(0x1e2021).fillTriangle(0, H, W, H, VX, 300);         // 바닥
    g.fillRect(130, 300, 380, 6);
    // 달력
    g.fillStyle(0x6c665a).fillRect(180, 168, 26, 34);
    g.fillStyle(0x8e2a24).fillRect(180, 168, 26, 6);
    g.fillStyle(0x3a3a36);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) g.fillRect(183 + c * 6, 178 + r * 6, 3, 3);
    // CCTV 모니터 2×2 — 하나만 희미하게 지직거린다
    g.fillStyle(0x2a2a2e).fillRect(232, 164, 108, 70);
    g.fillStyle(0x0a0c10).fillRect(236, 168, 48, 29).fillRect(288, 168, 48, 29).fillRect(236, 201, 48, 29).fillRect(288, 201, 48, 29);
    g.fillStyle(0x4a6460, 0.35).fillRect(288, 201, 48, 29);
    g.fillStyle(0x8fb0a8, 0.25);
    for (let y = 203; y < 229; y += 4) g.fillRect(290, y, 44, 1);
    // 책상
    g.fillStyle(0x5c4027).fillRect(210, 238, 160, 10);
    g.fillStyle(0x3e2c1c).fillRect(216, 248, 6, 14).fillRect(358, 248, 6, 14);
    g.fillStyle(0xc8b88a, 0.6).fillRect(300, 232, 26, 6);            // 펼쳐진 일지
    // 열쇠함
    g.fillStyle(0x6b6f73).fillRect(384, 172, 30, 38);
    g.fillStyle(0x4f5357).fillRect(387, 175, 24, 32);
    g.fillStyle(0xb0b4b8);
    for (let i = 0; i < 4; i++) g.fillRect(390 + i * 5, 200, 3, 3);
    // 철문 (작은 유리창)
    g.fillStyle(0x2c3034).fillRect(430, 150, 44, 150);
    g.fillStyle(0x0b0e14).fillRect(440, 166, 24, 30);
    g.fillStyle(0x9aa3ab).fillRect(434, 230, 4, 8);
  },

  // 음악실: 깨진 창으로 드는 달빛, 업라이트 피아노, 보면대
  music(g) {
    g.fillStyle(0x000000).fillRect(0, 0, W, H);
    g.fillStyle(0x1a1720).fillRect(110, 100, 420, 200);              // 벽
    g.fillStyle(0x221a14).fillTriangle(0, H, W, H, VX, 300);         // 나무 바닥
    g.fillRect(110, 300, 420, 6);
    // 깨진 창문 + 달빛
    g.fillStyle(0x24324c).fillRect(184, 150, 84, 90);
    g.fillStyle(0x34466a, 0.6).fillRect(188, 154, 36, 40);
    g.fillStyle(0x15161a).fillRect(224, 150, 4, 90).fillRect(184, 194, 84, 4);
    g.lineStyle(1, 0x8fa6c8, 0.7);
    g.lineBetween(232, 200, 262, 236).lineBetween(246, 214, 236, 238).lineBetween(246, 214, 266, 210);
    g.fillStyle(0x6a82b0, 0.07).fillTriangle(184, 240, 268, 240, 330, H).fillTriangle(184, 240, 120, H, 330, H);
    // 업라이트 피아노 (건반 뚜껑이 열려 있다)
    g.fillStyle(0x0f0b09).fillRect(310, 178, 130, 72);
    g.fillStyle(0x2a1f17).fillRect(310, 178, 130, 5);
    g.fillStyle(0xd8d2c2).fillRect(314, 226, 122, 10);
    g.fillStyle(0x0c0a08);
    for (let x = 320; x < 432; x += 12) g.fillRect(x, 226, 5, 6);
    g.fillStyle(0xd8cfb4, 0.7).fillRect(356, 190, 30, 20);           // 악보
    // 보면대
    g.fillStyle(0x2a2a2e).fillRect(452, 214, 3, 46).fillRect(444, 258, 20, 3);
    g.fillStyle(0x3a3a40).fillRect(438, 196, 32, 20);
  },

  // 방송실: ON AIR 표시등, 방송 콘솔, 테이프 선반
  broadcast(g) {
    g.fillStyle(0x000000).fillRect(0, 0, W, H);
    g.fillStyle(0x17191c).fillRect(110, 100, 420, 200);              // 흡음벽
    g.fillStyle(0x1b1c20);
    for (let x = 116; x < 524; x += 24) for (let y = 106; y < 296; y += 24) g.fillRect(x, y, 18, 18);
    g.fillStyle(0x1e2021).fillTriangle(0, H, W, H, VX, 300);         // 바닥
    g.fillRect(110, 300, 420, 6);
    // ON AIR (꺼짐, 희미하게 붉다)
    g.fillStyle(0x2a0d0d).fillRect(290, 156, 60, 18);
    g.fillStyle(0x7a2020, 0.5).fillRect(294, 160, 52, 10);
    // 테이프 선반
    g.fillStyle(0x3a2c20).fillRect(178, 168, 90, 86);
    const tc = [0x8a3a3a, 0x3a5a8a, 0x8a7a3a, 0x4a7a4a, 0x6a6a6a];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) {
      if (r === 1 && (i === 3 || i === 4 || i === 5 || i === 6)) continue; // 빠진 테이프 네 개
      g.fillStyle(tc[(i + r) % 5]).fillRect(182 + i * 9, 172 + r * 28, 7, 22);
    }
    // 콘솔 + 마이크
    g.fillStyle(0x2e3034).fillRect(300, 218, 170, 34);
    g.fillStyle(0x9aa3ab);
    for (let x = 308; x < 462; x += 14) g.fillRect(x, 224, 3, 20);
    g.fillStyle(0xd8d8d8);
    for (let x = 306; x < 462; x += 14) g.fillRect(x, 228 + (x * 7) % 12, 7, 3);
    g.fillStyle(0x3a3a40).fillRect(388, 188, 3, 30);
    g.fillStyle(0x50555a).fillEllipse(389, 184, 14, 18);
  },
};

export class LockerView {
  constructor(scene, view = 'corridor') {
    this.s = scene;
    this.scale = 0;
    this.offset = 0;

    const outside = scene.add.graphics();
    (SCENERY[view] || SCENERY.corridor)(outside);
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
