// 화장실 칸막이 안 1인칭 화면: 열린 칸 안의 변기·타일 벽과, 안쪽으로 열린 문짝(오른쪽)을 본다.
// 칸 스크립트에서 { "t": "stall", "kind": "knock" | "graffiti" | "clogged" }로 연다. 스크립트가 끝나면 Explore가 닫는다.
import { W, H } from '../constants.js';
import { textStyle } from './ui.js';

// 변기 (완성 그림 toilet_closeup 96×192을 1.3배로, 아래 가운데 기준). 변기 안쪽 물 위치는 BOWL
const TOILET = { x: W / 2 - 30, y: 380, scale: 1.3 };
const BOWL = { x: W / 2 - 30, y: 272 };
const DOOR = [[440, 70], [600, 18], [600, 470], [440, 404]]; // 안쪽으로 열린 문짝 (원근)

// 칸마다 다른 것 — 2층: 노크 칸(손톱 자국·걸쇠) / 낙서 / 막힌 변기, 1층: 빈 칸 / 손톱 자국 / 그을린 벽
const KINDS = {
  // 문 안쪽 아래, 손톱으로 긁은 세로 자국 다발
  scratch(s, g) {
    g.lineStyle(2, 0xd8cfc0, 0.7);
    for (let i = 0; i < 9; i++) {
      const x = 470 + i * 12, y0 = 300 + (i % 3) * 8 + i * 2;
      g.lineBetween(x, y0, x + 3, y0 + 70 + (i % 4) * 10);
    }
    g.lineStyle(1, 0x7a2a22, 0.6);
    for (let i = 0; i < 5; i++) g.lineBetween(476 + i * 20, 318 + i * 3, 478 + i * 20, 372 + i * 4);
  },
  knock(s, g) {
    KINDS.scratch(s, g);
    // 잠금 걸쇠 (방금 풀린)
    g.fillStyle(0x9aa3ab).fillRect(450, 226, 16, 8);
    g.fillStyle(0x6f767c).fillRect(452, 234, 6, 12);
  },
  // 아무것도 없는 칸: 빈 휴지걸이와 바닥에 떨어진 휴지 심
  empty(s, g) {
    g.fillStyle(0x9aa3ab).fillRect(150 + 20, 250, 30, 6).fillRect(150 + 32, 256, 6, 10);
    g.fillStyle(0xbfb8a8).fillEllipse(230, 430, 22, 12);
    g.fillStyle(0x8a8478).fillEllipse(230, 430, 8, 6);
  },
  // 이 칸만 타일 벽이 그을려 있다 (그날의 불을 떠올리게 하는 흔적)
  burnt(s, g) {
    g.fillStyle(0x0a0908, 0.75).fillEllipse(300, 110, 150, 110);
    g.fillStyle(0x0a0908, 0.5).fillEllipse(360, 70, 120, 70).fillEllipse(230, 160, 90, 80);
    g.fillStyle(0x0a0908, 0.35).fillEllipse(300, 60, 240, 90);
    g.lineStyle(1, 0x3a2a1e, 0.6);
    for (let i = 0; i < 5; i++) g.lineBetween(260 + i * 18, 150, 254 + i * 20, 200 + (i % 2) * 14); // 흘러내린 그을음
  },
  graffiti(s, g, add) {
    g.fillStyle(0x15141a, 0.5).fillRect(468, 150, 100, 4);
    add(s.add.text(520, 200, '피아노 왕자\n전용 ㅋ', textStyle(17, '#1c1a20', { fontStyle: 'bold', align: 'center' }))
      .setOrigin(0.5).setAngle(-12));
    // 주변의 알아볼 수 없는 끄적임과, 낙서를 지우려다 만 자국
    g.lineStyle(1, 0x2a2628, 0.7);
    for (let i = 0; i < 6; i++) g.lineBetween(474 + i * 14, 268 + i * 3, 486 + i * 14, 262 + i * 3);
    g.fillStyle(0xbfc6c8, 0.35).fillRect(470, 300, 90, 16);
  },
  clogged(s, g) {
    // 넘칠 듯 고인 물과 처박힌 교과서
    g.fillStyle(0x4a5a52, 0.85).fillEllipse(BOWL.x, BOWL.y, 76, 26);
    g.fillStyle(0x6a5a3a).fillRect(BOWL.x - 22, BOWL.y - 8, 36, 11);
    g.fillStyle(0x8a7a52).fillRect(BOWL.x - 21, BOWL.y - 7, 34, 2);
    g.fillStyle(0x2a2420).fillRect(BOWL.x - 14, BOWL.y - 4, 12, 5);   // 도려낸 이름 칸
    g.fillStyle(0x3a4a44, 0.6).fillEllipse(W / 2 - 30, 420, 160, 30); // 바닥에 번진 물
  },
};

export class StallView {
  constructor(scene, opts = {}) {
    this.s = scene;
    const parts = [];
    const g = scene.add.graphics();
    parts.push(g);
    this.drawStall(g);
    if (scene.textures.exists('toilet_closeup')) {
      parts.push(scene.add.image(TOILET.x, TOILET.y, 'toilet_closeup').setOrigin(0.5, 1).setScale(TOILET.scale));
    } else this.drawToilet(g);
    const detail = scene.add.graphics();
    parts.push(detail);
    (KINDS[opts.kind] || (() => {}))(scene, detail, o => o && parts.push(o));
    const shade = scene.add.graphics();
    shade.fillStyle(0x000000, 0.28).fillRect(0, 0, W, H);
    shade.fillStyle(0x000000, 0.5).fillRect(0, 0, W, 16).fillRect(0, H - 16, W, 16).fillRect(0, 0, 16, H).fillRect(W - 16, 0, 16, H);
    parts.push(shade, scene.add.text(W / 2, H - 14, '칸막이 안을 보고 있다', textStyle(11, '#6f6878')).setOrigin(0.5, 1));

    this.root = scene.add.container(0, 0, parts).setScrollFactor(0).setDepth(90).setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
  }

  set() {}

  // 좁은 칸: 뒷벽 타일, 양옆 칸막이, 오른쪽에 안쪽으로 열린 문짝 (변기는 따로)
  drawStall(g) {
    g.fillStyle(0x000000).fillRect(0, 0, W, H);
    // 뒷벽 타일
    g.fillStyle(0x2c3331).fillRect(150, 40, 290, 330);
    g.lineStyle(1, 0x222826, 1);
    for (let y = 40; y < 370; y += 22) g.lineBetween(150, y, 440, y);
    for (let x = 150; x < 440; x += 22) g.lineBetween(x, 40, x, 370);
    g.fillStyle(0x10130f, 0.4).fillEllipse(220, 120, 90, 60).fillEllipse(400, 330, 70, 40); // 물때
    // 왼쪽 칸막이 (원근)
    g.fillStyle(0x4a5257).fillPoints([{ x: 40, y: 0 }, { x: 150, y: 40 }, { x: 150, y: 370 }, { x: 40, y: H }], true);
    g.fillStyle(0x3d4549).fillPoints([{ x: 40, y: 0 }, { x: 150, y: 40 }, { x: 150, y: 52 }, { x: 40, y: 18 }], true);
    // 바닥
    g.fillStyle(0x23282a).fillPoints([{ x: 150, y: 370 }, { x: 440, y: 370 }, { x: 600, y: H }, { x: 40, y: H }], true);
    g.lineStyle(1, 0x1a1e20, 1);
    for (let i = 1; i < 5; i++) g.lineBetween(150 + i * 58, 370, 40 + i * 112, H);
    // 안쪽으로 열린 문짝
    g.fillStyle(0x5a646a).fillPoints(DOOR.map(([x, y]) => ({ x, y })), true);
    g.fillStyle(0x4a5358).fillPoints([{ x: 440, y: 70 }, { x: 452, y: 66 }, { x: 452, y: 408 }, { x: 440, y: 404 }], true);
    g.fillStyle(0x9aa3ab).fillRect(456, 220, 4, 18); // 옷걸이 고리
  }

  // 완성 그림(toilet_closeup)이 없을 때의 임시 변기와 물탱크
  drawToilet(g) {
    const cx = TOILET.x;
    g.fillStyle(0xc9d0d2).fillRect(cx - 50, 196, 100, 70);
    g.fillStyle(0xaab2b5).fillRect(cx - 50, 196, 100, 8);
    g.fillStyle(0x9aa3ab).fillRect(cx + 30, 210, 12, 5);
    g.fillStyle(0xbfc6c8).fillRect(cx - 14, 266, 28, 26);
    g.fillStyle(0xd8dee0).fillEllipse(cx, 326, 140, 70);
    g.fillStyle(0x7f888c).fillEllipse(cx, 322, 104, 44);
    g.fillStyle(0xc9d0d2).fillRect(cx - 30, 348, 60, 28);
  }

  destroy() {
    const root = this.root;
    return new Promise(r => this.s.tweens.add({ targets: root, alpha: 0, duration: 200, onComplete: () => { root.destroy(); r(); } }));
  }
}
