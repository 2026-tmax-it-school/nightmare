// 개발자 모드: ?dev → 체크포인트 선택 화면, ?dev&start=<id> → 바로 그 시점부터.
// 저장은 별도 슬롯을 써서 실제 플레이 저장을 덮어쓰지 않는다. 플레이 중 P / ` 키 → 체크포인트 선택으로.
import { DB } from './db.js';
import { DEV } from './constants.js';
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

// 일반 모드에서 P로 개발자 화면 진입, Ctrl+Shift+`로 모드 전환. 다시 로드해야 저장·엔딩 기록 슬롯도 함께 전환된다.
// 개발자 모드에서는 P 또는 ` 키를 눌러 체크포인트 선택 화면으로 돌아간다.
export function installDevHotkey(game) {
  let switching = false;
  const onKeyDown = e => {
    if (e.repeat || e.isComposing || switching) return;
    if (e.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
    const enterDev = !DEV && e.code === 'KeyP' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
    const toggleDev = e.code === 'Backquote' && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey;
    if (enterDev || toggleDev) {
      e.preventDefault();
      e.stopImmediatePropagation();
      switching = true;
      const url = new URL(location.href);
      if (DEV) url.searchParams.delete('dev');
      else url.searchParams.set('dev', '');
      url.searchParams.delete('start');
      location.assign(url.href);
      return;
    }
    if (!['KeyP', 'Backquote'].includes(e.code) || !DEV || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || !DB.checkpoints.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const sm = game.scene;
    if (sm.isActive('Dev')) return;
    for (const s of sm.getScenes(true)) s.scene.stop();
    sm.start('Dev');
  };
  window.addEventListener('keydown', onKeyDown, true);
  game.events.once('destroy', () => window.removeEventListener('keydown', onKeyDown, true));
}
