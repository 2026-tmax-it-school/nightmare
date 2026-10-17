// 데이터(JSON) 스크립트 실행기. 씬(host)은 ui, getScript(), goto(), action() 을 제공한다.
import { DB } from './db.js';
import { setFlag, addClue, addItem, removeItem, addFragment, addDenial, saveGame, checkCond } from './state.js';
import { sfx, startLoop, stopLoop } from './audio.js';

const delay = (h, ms) => new Promise(r => h.time.delayedCall(ms, r));

export async function runScript(h, list) {
  for (const a of list || []) {
    if ((await exec(h, a)) === 'stop') return 'stop';
  }
}

async function exec(h, a) {
  switch (a.t) {
    case 'text': return h.ui.say(a.who, a.text);
    case 'wait': return delay(h, a.ms);
    case 'sfx': { const d = sfx(a.name); if (a.wait) await delay(h, d * 1000); return; }
    case 'loop': return a.stop ? stopLoop(a.name) : startLoop(a.name);
    case 'flag': setFlag(a.key, 'value' in a ? a.value : true); return;
    case 'clue':
      if (addClue(a.id)) { sfx('clueGet'); h.ui.toast(`단서 획득 — ${DB.clues[a.id].name}`); }
      return;
    case 'item':
      if (addItem(a.id)) { sfx('itemGet'); h.ui.toast(`소지품 획득 — ${DB.items[a.id].name}`); }
      return;
    case 'take': // 소지품을 잃는다 (버리기, 부서짐 등)
      if (removeItem(a.id) && a.toast !== false) h.ui.toast(`소지품 잃음 — ${DB.items[a.id].name}`);
      return;
    case 'fragment':
      if (addFragment(a.n)) { sfx('chime'); await h.ui.banner(`기억 조각 ${a.n} / 8`, DB.fragments[a.n].name); }
      return;
    case 'denial': addDenial(a.n); h.events.emit('denial'); return;
    case 'if': return runScript(h, checkCond(a.cond) ? a.then : a.else);
    case 'call': return runScript(h, h.getScript(a.name));
    case 'choice': {
      const i = await h.ui.choice(a.prompt, a.options.map(o => o.label));
      return runScript(h, a.options[i].then);
    }
    case 'save': saveGame(); h.ui.toast('자동 저장됨'); return;
    case 'effect': return effect(h, a);
    case 'memory': return h.ui.memory(a.lines);
    case 'puzzle': {
      const ok = await h.ui.puzzle(a.id);
      return runScript(h, ok ? a.success : a.fail);
    }
    case 'deduction': return h.ui.deduction(a.id);
    // 플레이어가 Space로 직접 두드린 횟수가 n과 같으면 success
    case 'knock': {
      const n = await h.ui.knock();
      return runScript(h, n === a.n ? a.success : a.fail);
    }
    case 'chapter': return h.ui.banner(a.title, a.sub, 1800);
    case 'goto': h.goto(a); return 'stop';
    default: return h.action?.(a);
  }
}

function effect(h, a) {
  const cam = h.cameras.main;
  switch (a.name) {
    case 'shake': cam.shake(a.ms || 300, a.i || 0.01); return;
    case 'flash': {
      const c = Phaser.Display.Color.HexStringToColor(a.color || '#ffffff');
      cam.flash(a.ms || 250, c.red, c.green, c.blue);
      return;
    }
    case 'fadeOut': return new Promise(r => { cam.once('camerafadeoutcomplete', r); cam.fadeOut(a.ms || 600); });
    case 'fadeIn': return new Promise(r => { cam.once('camerafadeincomplete', r); cam.fadeIn(a.ms || 600); });
    case 'glitch': return h.ui.glitch(a.ms || 450);
    case 'crack': return h.ui.crack();
    case 'uncrack': return h.ui.uncrack();
    case 'glow': return h.ui.glow();
  }
}
