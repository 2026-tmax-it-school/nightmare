// 컷신: 배경(CG 그림 또는 임시 색 + CG 설명) · 대사 · 효과음 · 자막. CG는 bg의 image → assets/cg/<image>.png
import { W, H } from '../constants.js';
import { DB } from '../db.js';
import { runScript } from '../script.js';
import { startLoop, stopLoop, stopMusic } from '../audio.js';
import { UI, textStyle } from '../ui/ui.js';

export default class Cutscene extends Phaser.Scene {
  constructor() { super('Cutscene'); }

  init(data) { this.cid = data.id; }

  create() {
    this.ui = new UI(this);
    this.bg = this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0);
    this.cg = this.add.image(0, 0, '__DEFAULT').setOrigin(0).setDisplaySize(W, H).setVisible(false);
    this.label = this.add.text(W / 2, H / 2 - 70, '', textStyle(13, '#55505c')).setOrigin(0.5);
    this.rainG = this.add.graphics().setDepth(5);
    this.drops = null;
    this.events.once('shutdown', () => stopLoop('rain'));
    stopMusic(); // 탐색 화면의 배경 음악은 컷신에서 끊는다 (GDD 4.7)
    this.cameras.main.fadeIn(500);
    runScript(this, DB.cutscenes[this.cid]).then(() => this.ui.hideDialog());
  }

  update() {
    if (!this.drops) return;
    const g = this.rainG;
    g.clear();
    g.lineStyle(1, 0x8a9ab0, 0.35);
    for (const d of this.drops) {
      d.y += d.v;
      d.x -= d.v * 0.15;
      if (d.y > H) { d.y = -20; d.x = Math.random() * (W + 60); }
      g.lineBetween(d.x, d.y, d.x - 2, d.y + 12);
    }
  }

  getScript() { return []; }

  action(a) {
    switch (a.t) {
      case 'bg':
      {
        this.bg.setFillStyle(Phaser.Display.Color.HexStringToColor(a.color).color);
        // CG 그림이 있으면 그림, 없으면 임시 색 + CG 설명
        const key = a.image && 'cg_' + a.image;
        const has = key && this.textures.exists(key);
        if (has) this.cg.setTexture(key).setDisplaySize(W, H);
        this.cg.setVisible(!!has);
        this.label.setText(has ? '' : a.label || '');
        return;
      }
      case 'caption': return this.caption(a.text, a.ms || 1800);
      case 'rain':
        if (a.stop) { this.drops = null; this.rainG.clear(); stopLoop('rain'); return; }
        this.drops = Array.from({ length: 90 }, () => ({ x: Math.random() * (W + 60), y: Math.random() * H, v: 7 + Math.random() * 5 }));
        startLoop('rain');
        return;
    }
  }

  caption(text, ms) {
    const t = this.add.text(W / 2, H / 2 + 40, text, textStyle(14, '#8d8696', { fontStyle: 'italic' })).setOrigin(0.5).setAlpha(0).setDepth(6);
    return new Promise(res => this.tweens.add({
      targets: t, alpha: 1, duration: 400, hold: Math.max(0, ms - 800), yoyo: true,
      onComplete: () => { t.destroy(); res(); },
    }));
  }

  goto(a) {
    const cam = this.cameras.main;
    cam.fadeOut(600);
    cam.once('camerafadeoutcomplete', () => this.scene.start(a.scene, a));
  }
}
