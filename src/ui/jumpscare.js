// 점프스케어 (GDD 8장, 이슈 #113): 화면 가득 그림자 얼굴이 확 튀어나오며 큰 소리 → 잠깐 머문 뒤 사라진다.
// 스크립트 { "t": "jumpscare", "image": "scare_cabinet" }. 그림은 assets/cg/<image>.png (constants.js SCARE_CGS에 이름을 넣어야 불러온다).
// 그림이 없으면 임시 그림(검은 얼굴 + 빈 눈)을 그린다.
import { W, H } from '../constants.js';
import { sfx } from '../audio.js';

const HOLD_MS = 650;
const FADE_MS = 280;

// 임시 그림: 화면을 채우는 검은 머리 실루엣, 하얗게 빈 눈과 벌어진 입
function placeholder(s) {
  const g = s.add.graphics();
  g.fillStyle(0x000000, 1).fillRect(0, 0, W, H);
  g.fillStyle(0x0d0b0f, 1).fillEllipse(W / 2, H / 2 + 40, 420, 560);
  g.fillStyle(0x141016, 1).fillEllipse(W / 2, H / 2 + 20, 330, 420);
  for (const ex of [-70, 70]) {
    g.fillStyle(0x000000, 1).fillEllipse(W / 2 + ex, H / 2 - 30, 92, 64);
    g.fillStyle(0xe8e0d8, 1).fillEllipse(W / 2 + ex, H / 2 - 30, 30, 22);
    g.fillStyle(0x7a0000, 1).fillCircle(W / 2 + ex, H / 2 - 30, 6);
  }
  g.fillStyle(0x000000, 1).fillEllipse(W / 2, H / 2 + 110, 120, 150);
  return g;
}

export function jumpscare(scene, a) {
  scene.ui?.hideDialog?.();
  const key = 'cg_' + a.image;
  const pic = scene.textures.exists(key)
    ? scene.add.image(W / 2, H / 2, key).setDisplaySize(W, H)
    : placeholder(scene);
  const root = scene.add.container(0, 0, [scene.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0), pic])
    .setScrollFactor(0).setDepth(300);
  // 화면 가운데를 기준으로 크게 시작해 순식간에 들이닥친다
  root.setPosition(W / 2, H / 2).setScale(1.35);
  root.list.forEach(o => { o.x -= W / 2; o.y -= H / 2; });
  sfx('scare');
  const cam = scene.cameras.main;
  cam.shake(380, 0.03);
  cam.flash(160, 140, 0, 0);
  return new Promise(resolve => {
    scene.tweens.add({ targets: root, scale: 1, duration: 90, ease: 'Quad.easeOut' });
    scene.time.delayedCall(HOLD_MS, () => {
      scene.tweens.add({
        targets: root, alpha: 0, duration: FADE_MS,
        onComplete: () => { root.destroy(); resolve(); },
      });
    });
  });
}
