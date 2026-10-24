// 개발자 모드 체크포인트 선택 화면 (?dev)
import { W, H, DEV_START } from '../constants.js';
import { DB } from '../db.js';
import { findCheckpoint, applyCheckpoint } from '../dev.js';
import { initAudio, stopAllLoops, sfx } from '../audio.js';
import { UI, textStyle, dirOf, isConfirm } from '../ui/ui.js';

let autoStarted = false;

export default class Dev extends Phaser.Scene {
  constructor() { super('Dev'); }

  create() {
    this.ui = new UI(this);
    stopAllLoops();
    this.cameras.main.fadeIn(200);
    this.add.text(W / 2, 28, '개발자 모드 — 시작 시점 선택', textStyle(16, '#c9a46a')).setOrigin(0.5);
    this.add.text(W / 2, H - 22, '↑↓ 선택 · E 시작 · 플레이 중 P 키로 이 화면 복귀 · 저장은 개발용 슬롯 사용', textStyle(11, '#6d6875')).setOrigin(0.5);

    // ?start=<id>: 처음 한 번만 바로 시작 (오디오 정책 때문에 키 입력 하나는 필요)
    const start = !autoStarted && DEV_START && findCheckpoint(DEV_START);
    autoStarted = true;
    if (start) return this.gate(start);
    if (DEV_START && !findCheckpoint(DEV_START)) this.ui.toast(`체크포인트 없음: ${DEV_START}`);
    this.menu();
  }

  gate(cp) {
    const t = this.add.text(W / 2, H / 2, `${cp.label}\n\n아무 키나 눌러 시작`, textStyle(15, '#bdb6aa', { align: 'center' })).setOrigin(0.5);
    const go = () => {
      this.input.keyboard.off('keydown', go);
      this.input.off('pointerdown', go);
      t.destroy();
      this.launch(cp.id);
    };
    this.input.keyboard.on('keydown', go);
    this.input.on('pointerdown', go);
  }

  // 체크포인트가 화면보다 많으면 커서를 따라 목록이 스크롤된다
  menu() {
    const cps = DB.checkpoints;
    const labels = [...cps.map(c => `${c.label}  (${c.id})`), '타이틀 화면 (일반 시작)'];
    const gap = 24, top = 56, rows = Math.floor((H - top - 40) / gap);
    const items = Array.from({ length: Math.min(rows, labels.length) }, (_, r) => this.add.text(92, top + r * gap, '', textStyle(14)));
    const cursor = this.add.text(70, 0, '▶', textStyle(12, '#c9a46a'));
    const more = this.add.text(W - 40, top, '', textStyle(11, '#6d6875')).setOrigin(1, 0);
    let idx = 0, first = 0;
    const draw = () => {
      first = Phaser.Math.Clamp(first, idx - rows + 1, idx);
      items.forEach((t, r) => t.setText(labels[first + r] || '').setColor(first + r === idx ? '#ffffff' : '#8f8996'));
      cursor.setY(top + (idx - first) * gap + 2);
      more.setText(labels.length > rows ? `${idx + 1} / ${labels.length}` : '');
    };
    const off = this.ui.listen(e => {
      const d = dirOf(e);
      if (d === 'up') { idx = (idx + labels.length - 1) % labels.length; sfx('tick'); }
      else if (d === 'down') { idx = (idx + 1) % labels.length; sfx('tick'); }
      else if (isConfirm(e)) {
        off();
        if (idx === cps.length) { initAudio(); return this.scene.start('Title'); }
        return this.launch(cps[idx].id);
      }
      draw();
    });
    draw();
  }

  launch(id) {
    initAudio();
    const [scene, data] = applyCheckpoint(id);
    this.cameras.main.fadeOut(250);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }
}
