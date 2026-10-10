// 개발자 모드 체크포인트 선택 화면 (?dev)
import { W, H, DEV_START } from '../constants.js';
import { DB } from '../db.js';
import { findCheckpoint, applyCheckpoint } from '../dev.js';
import { initAudio, stopAllLoops } from '../audio.js';
import { UI, textStyle } from '../ui/ui.js';

let autoStarted = false;

export default class Dev extends Phaser.Scene {
  constructor() { super('Dev'); }

  create() {
    this.ui = new UI(this);
    stopAllLoops();
    this.cameras.main.fadeIn(200);
    this.add.text(W / 2, 28, '개발자 모드 — 시작 시점 선택', textStyle(16, '#c9a46a')).setOrigin(0.5);
    this.add.text(W / 2, H - 22, '↑↓ 선택 · E 시작 · 플레이 중 ` 키로 이 화면 복귀 · 저장은 개발용 슬롯 사용', textStyle(11, '#6d6875')).setOrigin(0.5);

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

  async menu() {
    const cps = DB.checkpoints;
    const labels = [...cps.map(c => `${c.label}  (${c.id})`), '타이틀 화면 (일반 시작)'];
    const box = this.add.container(70, 56);
    // 체크포인트가 늘어도 화면 안에 들어오도록 간격을 줄인다
    const gap = Math.min(27, Math.floor((H - 100) / labels.length));
    const i = await this.ui.select(box, 0, 0, labels, { size: gap < 22 ? 12 : 14, gap });
    if (i === cps.length) { initAudio(); return this.scene.start('Title'); }
    this.launch(cps[i].id);
  }

  launch(id) {
    initAudio();
    const [scene, data] = applyCheckpoint(id);
    this.cameras.main.fadeOut(250);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }
}
