import { W, H, DEV } from './constants.js';
import { installDevHotkey } from './dev.js';
import Dev from './scenes/Dev.js';
import Boot from './scenes/Boot.js';
import Title from './scenes/Title.js';
import Cutscene from './scenes/Cutscene.js';
import Explore from './scenes/Explore.js';
import GameOver from './scenes/GameOver.js';
import DemoEnd from './scenes/DemoEnd.js';

// ?debug: 화면이 가려져도 루프가 돌도록 타이머 사용 + 콘솔에서 window.__game 접근
const debug = new URLSearchParams(location.search).has('debug');

// pixelArt(최근접 필터)를 글씨에도 적용하면 화면 배율에 따라 획이 빠져 깨진다 → 텍스트만 선형 필터
const makeText = Phaser.GameObjects.GameObjectFactory.prototype.text;
Phaser.GameObjects.GameObjectFactory.prototype.text = function (...args) {
  const t = makeText.apply(this, args);
  t.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return t;
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#000000',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: debug ? { forceSetTimeOut: true, target: 60 } : undefined,
  scene: [Boot, Title, Cutscene, Explore, GameOver, DemoEnd, Dev],
});

if (debug || DEV) window.__game = game;
if (DEV) installDevHotkey(game);
