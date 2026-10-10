import { W, H } from './constants.js';
import Boot from './scenes/Boot.js';
import Title from './scenes/Title.js';
import Cutscene from './scenes/Cutscene.js';
import Explore from './scenes/Explore.js';
import GameOver from './scenes/GameOver.js';
import DemoEnd from './scenes/DemoEnd.js';

// ?debug: 화면이 가려져도 루프가 돌도록 타이머 사용 + 콘솔에서 window.__game 접근
const debug = new URLSearchParams(location.search).has('debug');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#000000',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: debug ? { forceSetTimeOut: true, target: 60 } : undefined,
  scene: [Boot, Title, Cutscene, Explore, GameOver, DemoEnd],
});

if (debug) window.__game = game;
