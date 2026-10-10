import { DEV } from './constants.js';

// 개발자 모드는 별도 슬롯에 저장해 실제 플레이 저장을 건드리지 않는다
const SAVE_KEY = 'ithope_save_v1' + (DEV ? '_dev' : '');

function fresh() {
  return { flags: {}, clues: [], items: [], fragments: [], denial: 0, map: null, pos: null, dir: 'down' };
}

export const state = fresh();

export function resetState() {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, fresh());
}

export const flag = k => !!state.flags[k];
export function setFlag(k, v = true) { state.flags[k] = v; }

function addTo(list, v) {
  if (list.includes(v)) return false;
  list.push(v);
  return true;
}
export const addClue = id => addTo(state.clues, id);
export const addItem = id => addTo(state.items, id);
export const addFragment = n => addTo(state.fragments, n);
export function addDenial(n) { state.denial = Math.min(100, Math.max(0, state.denial + n)); }

const asList = v => (Array.isArray(v) ? v : [v]);

// 조건 객체: 모든 항목이 참이어야 통과
export function checkCond(c) {
  if (!c) return true;
  if (c.flag && !asList(c.flag).every(flag)) return false;
  if (c.notFlag && asList(c.notFlag).some(flag)) return false;
  if (c.clue && !asList(c.clue).every(id => state.clues.includes(id))) return false;
  if (c.noClue && asList(c.noClue).some(id => state.clues.includes(id))) return false;
  if (c.item && !asList(c.item).every(id => state.items.includes(id))) return false;
  if (c.noItem && asList(c.noItem).some(id => state.items.includes(id))) return false;
  return true;
}

export function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    resetState();
    Object.assign(state, JSON.parse(raw));
    return true;
  } catch { return false; }
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}
