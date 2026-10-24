// 엔딩 크레딧: data/credits.json 의 줄들이 CG 배경 위로 천천히 올라간다. 아무 키나 클릭하면 건너뛰고 타이틀로
import { W, H } from '../constants.js';
import { DB } from '../db.js';
import { textStyle, cgBackdrop } from '../ui/ui.js';

const STYLE = {
  title: [34, '#d8d0c0'],
  sub: [13, '#7a7480'],
  head: [15, '#8f8996'],
  text: [14, '#d8d0c0'],
};
const GAP = 28;     // 빈 줄 높이
const SPEED = 36;   // 올라가는 속도 (px/초)

export default class Credits extends Phaser.Scene {
  constructor() { super('Credits'); }

  init(data) { this.bg = data.bg; }

  create() {
    cgBackdrop(this, this.bg, 0.72);
    this.cameras.main.fadeIn(800);
    const lines = this.add.container(0, H + 20);
    let y = 0;
    for (const l of DB.credits) {
      if (l.kind === 'gap') { y += GAP; continue; }
      const [size, color] = STYLE[l.kind] || STYLE.text;
      const t = this.add.text(W / 2, y, l.text, textStyle(size, color, { align: 'center' })).setOrigin(0.5, 0);
      lines.add(t);
      y += t.height + 14;
    }
    this.done = false;
    this.tweens.add({
      targets: lines, y: -y - 20, duration: ((H + y + 40) / SPEED) * 1000, ease: 'Linear',
      onComplete: () => this.leave(),
    });
    this.input.keyboard.on('keydown', () => this.leave());
    this.input.on('pointerdown', () => this.leave());
  }

  leave() {
    if (this.done) return;
    this.done = true;
    this.cameras.main.fadeOut(600);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Title'));
  }
}
