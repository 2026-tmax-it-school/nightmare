import { W, H } from '../constants.js';
import { state, loadGame } from '../state.js';
import { stopAllLoops } from '../audio.js';
import { UI, textStyle } from '../ui/ui.js';

export default class GameOver extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create() {
    this.ui = new UI(this);
    stopAllLoops();
    this.cameras.main.fadeIn(800);
    this.add.text(W / 2, H / 2 - 60, '붙잡혔다.', textStyle(28, '#a02020')).setOrigin(0.5);
    this.add.text(W / 2, H / 2 - 20, '그날의 내가, 나를 내려다보고 있었다.', textStyle(13, '#77707f')).setOrigin(0.5);
    const menu = this.add.container(W / 2 - 64, H / 2 + 40);
    this.time.delayedCall(900, async () => {
      const i = await this.ui.select(menu, 0, 0, ['마지막 저장부터 다시', '타이틀로']);
      const [scene, data] = i === 0 && loadGame() ? ['Explore', { map: state.map }] : ['Title', {}];
      // 부정 수치 최대치로 저장돼 있으면 다시 시작하자마자 붙잡히므로 한 단계 낮춘다
      if (state.denial >= 100) state.denial = 85;
      this.cameras.main.fadeOut(500);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
    });
  }
}
