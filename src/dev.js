// 개발자 모드: ?dev → 체크포인트 선택 화면, ?dev&start=<id> → 바로 그 시점부터.
// 저장은 별도 슬롯을 써서 실제 플레이 저장을 덮어쓰지 않는다. 플레이 중 ` 키 → 체크포인트 선택으로.
import { DB } from './db.js';
import { state, resetState } from './state.js';

export const findCheckpoint = id => DB.checkpoints.find(c => c.id === id);

// from 체인을 따라 상태를 누적해서 적용하고, 시작할 [씬, 데이터]를 돌려준다
export function applyCheckpoint(id) {
  const cp = findCheckpoint(id);
  resetState();
  const chain = [];
  for (let c = cp; c; c = c.from && findCheckpoint(c.from)) chain.unshift(c);
  for (const c of chain) {
    for (const f of c.flags || []) state.flags[f] = true;
    Object.assign(state.flags, c.set);
    for (const id of c.take || []) state.items = state.items.filter(v => v !== id);
    for (const k of ['clues', 'items', 'fragments']) {
      for (const v of c[k] || []) if (!state[k].includes(v)) state[k].push(v);
    }
    if (c.denial != null) state.denial = c.denial;
  }
  if (cp.map) {
    state.map = cp.map;
    state.pos = cp.pos ? { x: cp.pos.x, y: cp.pos.y } : null;
    state.dir = cp.pos?.dir || 'down';
  }
  const data = cp.scene === 'Cutscene' ? { id: cp.cutscene } : cp.map ? { map: cp.map } : cp.ending ? { ending: cp.ending } : {};
  return [cp.scene, data];
}

// ` 키로 어디서든 체크포인트 선택 화면으로 돌아간다
export function installDevHotkey(game) {
  window.addEventListener('keydown', e => {
    if (e.code !== 'Backquote' || !DB.checkpoints.length) return;
    const sm = game.scene;
    if (sm.isActive('Dev')) return;
    for (const s of sm.getScenes(true)) s.scene.stop();
    sm.start('Dev');
  });
}
