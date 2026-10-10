import { W, H } from '../constants.js';
import { state } from '../state.js';
import { stopAllLoops } from '../audio.js';
import { UI, textStyle } from '../ui/ui.js';

export default class DemoEnd extends Phaser.Scene {
  constructor() { super('DemoEnd'); }

  create() {
    this.ui = new UI(this);
    stopAllLoops();
    this.cameras.main.fadeIn(1000);
    this.add.text(W / 2, H / 2 - 80, '— 데모 끝 —', textStyle(22, '#d8d0c0')).setOrigin(0.5);
    this.add.text(W / 2, H / 2 - 36, '옥상 이야기는 다음 업데이트에서.', textStyle(14, '#8f8996')).setOrigin(0.5);
    this.add.text(W / 2, H / 2 - 4, `기억 조각 ${state.fragments.length} / 8`, textStyle(13, '#6d6875')).setOrigin(0.5);
    const menu = this.add.container(W / 2 - 50, H / 2 + 50);
    this.time.delayedCall(1200, async () => {
      await this.ui.select(menu, 0, 0, ['타이틀로']);
      this.cameras.main.fadeOut(500);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Title'));
    });
  }
}
