import { W, H, MAPS, DEV } from '../constants.js';
import { DB } from '../db.js';
import { makeTextures } from '../textures.js';
import { textStyle } from '../ui/ui.js';

export default class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.add.text(W / 2, H / 2, '불러오는 중…', textStyle(14, '#77707f')).setOrigin(0.5);
    this.load.json('clues', 'data/clues.json');
    this.load.json('puzzles', 'data/puzzles.json');
    this.load.json('hints', 'data/hints.json');
    this.load.json('objectives', 'data/objectives.json');
    // 컷신 CG (tools/cg.py가 만든 assets/cg/<이름>.png). 컷신의 bg에 적힌 image만 불러온다
    this.load.on('filecomplete-json-cutscenes', (key, type, data) => {
      const names = new Set();
      JSON.stringify(data, (k, v) => { if (v && v.t === 'bg' && v.image) names.add(v.image); return v; });
      for (const name of names) this.load.image('cg_' + name, `assets/cg/${name}.png`);
    });
    this.load.json('cutscenes', 'data/cutscenes.json');
    for (const id of MAPS) this.load.json('map_' + id, `data/maps/${id}.json`);
    if (DEV) this.load.json('checkpoints', 'data/checkpoints.json');
    // 완성된 그래픽 (tools/sprites.py가 만든 목록). 목록에 있는 것만 이미지로, 나머지는 textures.js의 임시 그래픽
    this.load.on('filecomplete-json-sprites', (key, type, list) => {
      for (const name of Object.keys(list)) this.load.image(name, `assets/sprites/${name}.png`);
    });
    this.load.json('sprites', 'assets/sprites/manifest.json');
  }

  create() {
    makeTextures(this);
    const json = k => this.cache.json.get(k);
    const clues = json('clues');
    Object.assign(DB.clues, clues.clues);
    Object.assign(DB.items, clues.items);
    Object.assign(DB.fragments, clues.fragments);
    DB.people = clues.people;
    DB.timeline = clues.timeline;
    Object.assign(DB.endings, clues.endings);
    const puzzles = json('puzzles');
    Object.assign(DB.puzzles, puzzles.puzzles);
    Object.assign(DB.deductions, puzzles.deductions);
    Object.assign(DB.hints, json('hints'));
    DB.objectives = json('objectives').chapters;
    Object.assign(DB.cutscenes, json('cutscenes'));
    for (const id of MAPS) DB.maps[id] = json('map_' + id);
    if (DEV) DB.checkpoints = json('checkpoints').checkpoints;
    this.scene.start(DEV ? 'Dev' : 'Title');
  }
}
