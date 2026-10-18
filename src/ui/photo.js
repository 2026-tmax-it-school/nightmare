// 침실 액자 1인칭 화면: 침실 벽에 비뚤게 걸린 중학교 졸업 사진. 사진 오른쪽이 안쪽으로 접혀 하얀 뒷면이 보이고,
// 재민 옆의 친구는 접힌 선에 걸려 몸이 반쪽만 남았다. 그 얼굴의 눈은 검은 펜으로 일자로 그어져 있다
// (가려진 친구 = 도윤의 복선, 교무실 액자 사진의 짝).
// 액자 스크립트에서 { "t": "photo" }로 연다. 스크립트가 끝나면 Explore가 닫는다.
import { W, H } from '../constants.js';
import { textStyle } from './ui.js';

const P = { w: 260, h: 180 };   // 사진 크기 (액자 가운데 기준)
const FOLD = 180;               // 사진 왼쪽 끝에서 접힌 선까지 (오른쪽 80px가 접혀 넘어갔다)
// 빛바랜 세피아
const C = { bg: 0xb59d7a, bgDark: 0x9c8462, banner: 0x86705a, skin: 0xd2b28c, skinDark: 0xb0906c, hair: 0x3c2e22, coat: 0x4c4036, collar: 0xe0d2b8, flower: 0xa86a5a, leaf: 0x6a6a48 };

// 침실 벽 (1인칭 화면 공용): 맵의 wall_face 그림(회벽 + 맨 아래 갈색 띠)을 8배로 + 침실 맵과 같은 밤 조명
export function bedroomWall(s) {
  const tex = s.textures.get('wall_face');
  if (!tex.has('m_plaster')) { tex.add('m_plaster', 0, 0, 3, 32, 15); tex.add('m_band', 0, 0, 18, 32, 14); }
  const FS = 8, bandH = 14 * FS;
  return [
    s.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0),
    s.add.tileSprite(0, 0, W, H - bandH, 'wall_face', 'm_plaster').setOrigin(0).setTileScale(FS),
    s.add.tileSprite(0, H - bandH, W, bandH, 'wall_face', 'm_band').setOrigin(0).setTileScale(FS),
    s.add.rectangle(0, 0, W, H, 0x0a1020, 0.5).setOrigin(0),
  ];
}

export class PhotoView {
  constructor(scene) {
    this.s = scene;
    const wall = this.buildWall();
    const frame = scene.add.container(W / 2, 186).setAngle(-7);
    const g = scene.add.graphics();
    this.drawFrame(g);
    this.drawPhoto(g);
    this.drawGlass(g);
    frame.add(g);
    this.root = scene.add.container(0, 0, [
      ...wall, frame,
      scene.add.text(W / 2, H - 14, '액자를 보고 있다', textStyle(11, '#6f6878')).setOrigin(0.5, 1),
    ]).setScrollFactor(0).setDepth(90).setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
  }

  set() {}

  buildWall() {
    return [...bedroomWall(this.s),
      this.s.add.rectangle(W / 2, 40, 6, 6, 0x6a5a48)]; // 액자를 걸어 둔 못
  }

  // 낡은 나무 액자 + 그림자 + 매트(사진 둘레 미색 종이)
  drawFrame(g) {
    const fw = P.w + 64, fh = P.h + 64;
    g.fillStyle(0x000000, 0.35).fillRect(-fw / 2 + 10, -fh / 2 + 12, fw, fh);  // 벽에 진 그림자
    g.lineStyle(2, 0x5a4a38, 1).lineBetween(-60, -fh / 2, 0, -fh / 2 - 130).lineBetween(60, -fh / 2, 0, -fh / 2 - 130); // 걸이 끈
    g.fillStyle(0x3e2a1a).fillRect(-fw / 2, -fh / 2, fw, fh);
    g.fillStyle(0x5a3e28).fillRect(-fw / 2 + 4, -fh / 2 + 4, fw - 8, fh - 8);
    g.fillStyle(0x2a1c12).fillRect(-fw / 2 + 18, -fh / 2 + 18, fw - 36, fh - 36);
    g.fillStyle(0xcfc2a4).fillRect(-fw / 2 + 20, -fh / 2 + 20, fw - 40, fh - 40); // 매트
    // 칠이 벗겨진 자국·긁힘
    g.fillStyle(0x24170e, 0.8).fillRect(-fw / 2, -fh / 2, 12, 4).fillRect(fw / 2 - 18, fh / 2 - 4, 18, 4).fillRect(fw / 2 - 4, -fh / 2 + 30, 4, 22);
    g.lineStyle(1, 0x8a6a4a, 0.8).lineBetween(-fw / 2 + 30, -fh / 2 + 8, -fw / 2 + 52, -fh / 2 + 10).lineBetween(fw / 2 - 10, fh / 2 - 40, fw / 2 - 8, fh / 2 - 20);
  }

  // 졸업 사진: 펼침막 아래 꽃다발을 든 재민과 그 옆의 친구. 오른쪽은 접혀 넘어가 친구는 반쪽만 보인다
  drawPhoto(g) {
    const x0 = -P.w / 2, y0 = -P.h / 2;
    g.fillStyle(C.bg).fillRect(x0, y0, FOLD, P.h);
    g.fillStyle(C.bgDark).fillRect(x0, y0 + P.h - 40, FOLD, 40);                 // 운동장 바닥
    g.fillStyle(C.banner).fillRect(x0 + 10, y0 + 10, FOLD - 10, 22);             // 졸업식 펼침막 (글씨 없음)
    g.fillStyle(0xc8b490).fillRect(x0 + 18, y0 + 18, 50, 3).fillRect(x0 + 76, y0 + 18, 60, 3);
    // 재민 (중학생, 교복)
    const jx = x0 + 92, jy = y0 + 92;
    g.fillStyle(C.coat).fillRoundedRect(jx - 38, jy + 26, 76, P.h - 92 - 26 + 2, { tl: 14, tr: 14, bl: 0, br: 0 });
    g.fillStyle(C.collar).fillTriangle(jx - 12, jy + 26, jx, jy + 44, jx - 2, jy + 26).fillTriangle(jx + 12, jy + 26, jx, jy + 44, jx + 2, jy + 26);
    g.fillStyle(C.skinDark).fillRect(jx - 7, jy + 14, 14, 14);
    g.fillStyle(C.skin).fillEllipse(jx, jy, 38, 44);
    g.fillStyle(C.hair).fillEllipse(jx, jy - 16, 42, 20).fillRect(jx - 20, jy - 16, 5, 14).fillRect(jx + 15, jy - 16, 5, 14);
    g.fillStyle(0x2a2018).fillRect(jx - 10, jy - 2, 5, 2).fillRect(jx + 5, jy - 2, 5, 2);
    g.fillStyle(0x8a5a48).fillRect(jx - 7, jy + 10, 14, 2).fillRect(jx - 8, jy + 9, 2, 1).fillRect(jx + 6, jy + 9, 2, 1); // 웃는 입
    // 꽃다발
    g.fillStyle(C.leaf).fillTriangle(jx - 30, jy + 70, jx - 6, jy + 40, jx - 2, jy + 74);
    g.fillStyle(C.flower).fillCircle(jx - 20, jy + 46, 6).fillCircle(jx - 10, jy + 42, 6).fillCircle(jx - 14, jy + 52, 5);
    // 친구 (재민 오른쪽, 몸 가운데가 접힌 선에 걸린다 → 왼쪽 반쪽만 보인다). 재민보다 조금 크다
    const fx0 = x0 + FOLD + 2, fy = y0 + 88;
    g.fillStyle(C.coat).fillRoundedRect(fx0 - 40, fy + 28, 80, P.h - 88 - 28 + 2, { tl: 14, tr: 14, bl: 0, br: 0 });
    g.fillStyle(C.collar).fillTriangle(fx0 - 13, fy + 28, fx0, fy + 46, fx0 - 2, fy + 28);
    g.fillStyle(C.skinDark).fillRect(fx0 - 7, fy + 16, 14, 14);
    g.fillStyle(C.skin).fillEllipse(fx0, fy, 40, 46);
    g.fillStyle(C.hair).fillEllipse(fx0, fy - 17, 44, 20).fillRect(fx0 - 21, fy - 17, 5, 15);
    g.fillStyle(0x8a5a48).fillRect(fx0 - 8, fy + 11, 8, 2);
    // 두 눈을 가로지르는 검은 펜 줄 (일부러 그은 듯 삐져나온 끝과 덧그은 자국)
    g.fillStyle(0x0c0a08).fillRect(fx0 - 22, fy - 4, 26, 6).fillRect(fx0 - 25, fy - 3, 4, 3);
    g.fillStyle(0x0c0a08, 0.7).fillRect(fx0 - 20, fy - 6, 18, 2).fillRect(fx0 - 16, fy + 2, 14, 2);
    // 접혀 넘어간 오른쪽: 하얀 뒷면이 앞으로 와 있다 (접힌 선은 살짝 들떠 그늘이 진다)
    const fx = x0 + FOLD;
    g.fillStyle(0x000000, 0.25).fillRect(fx - 7, y0, 4, P.h);
    g.fillStyle(0xe6ddc8).fillRect(fx - 4, y0 - 2, P.w - FOLD + 4, P.h + 4);
    g.fillStyle(0xcfc4ac).fillRect(fx - 4, y0 - 2, 6, P.h + 4);                    // 접힌 모서리
    g.fillStyle(0xbdb29a, 0.6).fillRect(fx + 20, y0 + 40, 50, 2).fillRect(fx + 26, y0 + 50, 34, 2); // 뒷면에 비친 얼룩
    // 빛바램: 전체에 누런 막
    g.fillStyle(0xe8d8b0, 0.12).fillRect(x0, y0, P.w, P.h);
  }

  // 액자 유리의 사선 반사광과 먼지
  drawGlass(g) {
    const x0 = -P.w / 2 - 12, y0 = -P.h / 2 - 12, w = P.w + 24, h = P.h + 24;
    g.fillStyle(0xffffff, 0.08).fillTriangle(x0 + 20, y0, x0 + 90, y0, x0 + 20, y0 + 120).fillTriangle(x0 + 90, y0, x0 + 20, y0 + 120, x0 + 40, y0 + 140);
    g.fillStyle(0x0a1020, 0.35).fillRect(x0, y0, w, h);  // 밤 조명
    g.fillStyle(0x2a2a2a, 0.3).fillCircle(x0 + 200, y0 + 40, 3).fillCircle(x0 + 60, y0 + 170, 4).fillCircle(x0 + 240, y0 + 150, 2);
  }

  destroy() {
    const root = this.root;
    return new Promise(r => this.s.tweens.add({ targets: root, alpha: 0, duration: 200, onComplete: () => { root.destroy(); r(); } }));
  }
}
