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
    this.load.json('cutscenes', 'data/cutscenes.json');
    for (const id of MAPS) this.load.json('map_' + id, `data/maps/${id}.json`);
    if (DEV) this.load.json('checkpoints', 'data/checkpoints.json');
  }

  create() {
    makeTextures(this);
    const json = k => this.cache.json.get(k);
    const clues = json('clues');
    Object.assign(DB.clues, clues.clues);
    Object.assign(DB.items, clues.items);
    Object.assign(DB.fragments, clues.fragments);
    const puzzles = json('puzzles');
    Object.assign(DB.puzzles, puzzles.puzzles);
    Object.assign(DB.deductions, puzzles.deductions);
    Object.assign(DB.hints, json('hints'));
    Object.assign(DB.cutscenes, json('cutscenes'));
    for (const id of MAPS) DB.maps[id] = json('map_' + id);
    if (DEV) DB.checkpoints = json('checkpoints').checkpoints;
    this.scene.start(DEV ? 'Dev' : 'Title');
  }
}
