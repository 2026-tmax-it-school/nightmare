// 발표용 「프롤로그 — 스포주의」 끝 화면 (GDD 9장, 개발자 모드 체크포인트 spoiler 전용):
// 화면이 천천히 검게 덮이고 「궁금해?」 「궁금하면 해봐.」 + 귀신 웃음소리. 글자가 떠 있는 채로 멈춘다 ('stop' → 탐색으로 돌아가지 않음)
import { W, H } from '../constants.js';
import { sfx, stopAllLoops } from '../audio.js';
import { textStyle } from './ui.js';

const FADE_MS = 2600;  // 검은 화면이 스르르 덮이는 시간
const DEPTH = 400;     // 대화창·목표 패널·점프스케어(300)보다 위

export async function teaser(scene) {
  scene.ui?.hideDialog?.();
  const wait = ms => new Promise(r => scene.time.delayedCall(ms, r));
  const show = (o, ms) => new Promise(r => scene.tweens.add({ targets: o, alpha: 1, duration: ms, onComplete: r }));
  const line = (y, text, color) => scene.add.text(W / 2, y, text, textStyle(22, color)).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 1).setAlpha(0);

  const black = scene.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0).setScrollFactor(0).setDepth(DEPTH).setAlpha(0);
  await show(black, FADE_MS);
  stopAllLoops();
  await wait(700);
  await show(line(H / 2 - 22, '궁금해?', '#b03a3a'), 900);
  await wait(900);
  sfx('ghostLaugh');
  await show(line(H / 2 + 22, '궁금하면 해봐.', '#e8e2d6'), 900);
  return 'stop';
}
