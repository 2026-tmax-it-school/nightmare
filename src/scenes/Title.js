import { W, H, GAME_TITLE } from '../constants.js';
import { state, resetState, loadGame, hasSave, loadMeta } from '../state.js';
import { initAudio, sfx, startLoop, stopAllLoops } from '../audio.js';
import { UI, textStyle, cgBackdrop } from '../ui/ui.js';

export default class Title extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    this.ui = new UI(this);
    cgBackdrop(this, 'front', 0.55);
    this.cameras.main.fadeIn(400);
    // 브라우저 자동재생 정책: 첫 입력에서 오디오를 연다
    const gate = this.add.container(0, 0, [
      this.add.text(W / 2, H / 2 - 10, '클릭하거나 아무 키나 눌러 시작', textStyle(15, '#bdb6aa')).setOrigin(0.5),
      this.add.text(W / 2, H / 2 + 22, '헤드폰 착용을 권장합니다', textStyle(12, '#6d6875')).setOrigin(0.5),
    ]);
    const go = () => {
      this.input.keyboard.off('keydown', go);
      this.input.off('pointerdown', go);
      initAudio();
      gate.destroy();
      this.showMenu();
    };
    this.input.keyboard.on('keydown', go);
    this.input.on('pointerdown', go);
  }

  async showMenu() {
    startLoop('drone');
    startLoop('m_title');
    const title = this.add.text(W / 2, 140, GAME_TITLE, textStyle(34, '#d8d0c0')).setOrigin(0.5).setAlpha(0);
    const sub = this.add.text(W / 2, 184, '— IT희망학교 —', textStyle(13, '#7a7480')).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: [title, sub], alpha: 1, duration: 1200 });
    this.add.text(W / 2, H - 36, '이 게임은 학교폭력과 죽음을 소재로 합니다.', textStyle(12, '#6d6875')).setOrigin(0.5);
    // 2회차 요소: 본 엔딩과 가장 많이 모은 기억 조각 (엔딩을 하나라도 봤을 때만)
    const meta = loadMeta();
    if (meta.endings.length) {
      const list = [1, 2, 3].map(n => (meta.endings.includes(n) ? `엔딩 ${n}` : '???')).join(' · ');
      this.add.text(W / 2, 214, `${list}   |   기억 조각 최대 ${meta.maxFragments} / 8`, textStyle(12, '#8f8996')).setOrigin(0.5);
    }

    const canContinue = hasSave();
    const labels = ['새로 시작', canContinue ? '이어하기' : '이어하기 (저장 없음)'];
    const menu = this.add.container(W / 2 - 64, 270);
    for (;;) {
      const i = await this.ui.select(menu, 0, 0, labels);
      if (i === 0) { resetState(); return this.leave('Cutscene', { id: 'dream' }); }
      if (canContinue && loadGame()) return this.leave('Explore', { map: state.map });
      sfx('error');
      menu.removeAll(true);
    }
  }

  leave(scene, data) {
    stopAllLoops();
    this.cameras.main.fadeOut(600);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }
}
