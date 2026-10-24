// 엔딩 화면: 엔딩 이름 · 이번 회차의 기억 조각 · 지금까지 본 엔딩 (2회차 요소, GDD 4.7)
import { W, H } from '../constants.js';
import { DB } from '../db.js';
import { state, recordEnding } from '../state.js';
import { stopAllLoops } from '../audio.js';
import { UI, textStyle, cgBackdrop } from '../ui/ui.js';

// 엔딩 화면 배경은 그 엔딩 컷신의 첫 CG
const ENDING_CG = { 1: 'ending1', 2: 'ending2_walk', 3: 'ending3_gate' };

export default class Ending extends Phaser.Scene {
  constructor() { super('Ending'); }

  init(data) { this.ending = data.ending; }

  create() {
    this.ui = new UI(this);
    stopAllLoops();
    cgBackdrop(this, ENDING_CG[this.ending], 0.65);
    const e = DB.endings[this.ending];
    const meta = recordEnding(this.ending);
    this.cameras.main.fadeIn(1200);
    this.add.text(W / 2, H / 2 - 96, `엔딩 ${this.ending}`, textStyle(14, '#8f8996')).setOrigin(0.5);
    this.add.text(W / 2, H / 2 - 64, e.name, textStyle(24, '#d8d0c0')).setOrigin(0.5);
    this.add.text(W / 2, H / 2 - 22, e.desc, textStyle(13, '#8f8996', { align: 'center' })).setOrigin(0.5);
    this.add.text(W / 2, H / 2 + 14, `기억 조각 ${state.fragments.length} / 8`, textStyle(13, '#6d6875')).setOrigin(0.5);
    const seen = Object.keys(DB.endings).map(n => (meta.endings.includes(Number(n)) ? `엔딩 ${n}` : '???')).join('   ');
    this.add.text(W / 2, H / 2 + 38, seen, textStyle(12, '#55505c')).setOrigin(0.5);
    const menu = this.add.container(W / 2 - 50, H / 2 + 86);
    this.time.delayedCall(1500, async () => {
      await this.ui.select(menu, 0, 0, ['타이틀로']);
      this.cameras.main.fadeOut(500);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Title'));
    });
  }
}
