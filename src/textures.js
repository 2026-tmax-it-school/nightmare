// 임시 도트 그래픽: 무료 에셋이 정해지면 Boot에서 이미지 로드로 교체한다.
import { TILE as T } from './constants.js';

function person(g, { skin = 0xe2c3a3, hair = 0x15141a, top = 0x34405a, bottom = 0x1f1f26, eyes = 0x111111, dir = 'down' } = {}) {
  g.fillStyle(0x000000, 0.25).fillEllipse(16, 29, 18, 5);
  g.fillStyle(bottom).fillRect(11, 24, 4, 6).fillRect(17, 24, 4, 6);
  g.fillStyle(top).fillRoundedRect(9, 15, 14, 11, 3);
  g.fillStyle(skin).fillCircle(16, 10, 7);
  g.fillStyle(hair);
  if (dir === 'up') g.fillCircle(16, 9, 7.5);
  else {
    g.fillEllipse(16, 5, 15, 7);
    if (dir === 'left') g.fillRect(17, 3, 6, 9);
    if (dir === 'right') g.fillRect(9, 3, 6, 9);
  }
  g.fillStyle(eyes);
  if (dir === 'down') g.fillRect(12, 10, 2, 2).fillRect(18, 10, 2, 2);
  else if (dir === 'left') g.fillRect(11, 10, 2, 2);
  else if (dir === 'right') g.fillRect(19, 10, 2, 2);
}

export function makeTextures(scene) {
  const make = (key, draw, w = T, h = T) => {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  };

  // 바닥 · 벽
  make('floor_corridor', g => {
    g.fillStyle(0x303036).fillRect(0, 0, T, T);
    g.fillStyle(0x2a2a2f).fillRect(0, 0, T, 1).fillRect(0, 0, 1, T);
    g.fillStyle(0x38383f).fillRect(6, 9, 2, 1).fillRect(21, 23, 3, 1);
  });
  make('floor_wood', g => {
    g.fillStyle(0x45341f).fillRect(0, 0, T, T);
    g.fillStyle(0x3a2c1a);
    for (let y = 7; y < T; y += 8) g.fillRect(0, y, T, 1);
    g.fillRect(10, 0, 1, 7).fillRect(24, 8, 1, 7).fillRect(6, 16, 1, 7).fillRect(20, 24, 1, 8);
  });
  make('floor_tile', g => {
    g.fillStyle(0x4f5457).fillRect(0, 0, T, T);
    g.fillStyle(0x464b4e).fillRect(0, 0, 16, 16).fillRect(16, 16, 16, 16);
  });
  make('floor_stairs', g => {
    g.fillStyle(0x34343a).fillRect(0, 0, T, T);
    g.fillStyle(0x45454c);
    for (let y = 2; y < T; y += 8) g.fillRect(0, y, T, 4);
  });
  make('floor_room', g => {
    g.fillStyle(0x4c4036).fillRect(0, 0, T, T);
    g.fillStyle(0x433830).fillRect(0, 15, T, 1).fillRect(15, 0, 1, 15).fillRect(5, 16, 1, 16);
  });
  make('wall', g => {
    g.fillStyle(0x141319).fillRect(0, 0, T, T);
    g.fillStyle(0x201e27).fillRect(0, 0, T, 8);
    g.fillStyle(0x0b0a0e).fillRect(0, T - 2, T, 2);
  });

  // 문
  make('door_open', g => {
    g.fillStyle(0x2b241c).fillRect(0, 0, T, T);
    g.fillStyle(0x4d3b28).fillRect(0, 0, 4, T).fillRect(T - 4, 0, 4, T);
  });
  make('door_locked', g => {
    g.fillStyle(0x4a3624).fillRect(0, 0, T, T);
    g.lineStyle(2, 0x2a1d12).strokeRect(1, 1, T - 2, T - 2);
    g.fillStyle(0x1e2a30).fillRect(8, 5, 16, 8);
    g.fillStyle(0xb59b5a).fillCircle(24, 19, 2);
  });
  make('exit_door', g => {
    g.fillStyle(0x3a3f44).fillRect(0, 0, T, T);
    g.fillStyle(0x24282c).fillRect(15, 0, 2, T);
    g.fillStyle(0x56606a).fillRect(4, 4, 9, 12).fillRect(19, 4, 9, 12);
    g.fillStyle(0x9aa3ab).fillRect(12, 18, 2, 5).fillRect(18, 18, 2, 5);
  });
  make('homedoor', g => {
    g.fillStyle(0x5a4030).fillRect(0, 0, T, T);
    g.lineStyle(2, 0x3a281c).strokeRect(3, 1, T - 6, T - 2);
    g.fillStyle(0xc8b070).fillCircle(24, 17, 2);
  });

  // 사물
  make('desk', g => {
    g.fillStyle(0x000000, 0.25).fillRect(5, 24, 24, 4);
    g.fillStyle(0x5c4027).fillRect(4, 22, 3, 7).fillRect(25, 22, 3, 7);
    g.fillStyle(0x7a5a38).fillRect(3, 9, 26, 14);
    g.fillStyle(0x8d6a44).fillRect(3, 9, 26, 3);
  });
  make('lectern', g => {
    g.fillStyle(0x5b412a).fillRect(2, 6, 28, 22);
    g.fillStyle(0x6e5034).fillRect(2, 6, 28, 4);
    g.fillStyle(0xd6ccb0).fillRect(10, 8, 12, 8);
    g.fillStyle(0xa02020).fillRect(12, 11, 8, 1);
  });
  make('board', g => {
    g.fillStyle(0x5a4632).fillRect(0, 3, T, 24);
    g.fillStyle(0x1f3a2c).fillRect(0, 5, T, 20);
    g.fillStyle(0x2f4f3c, 0.8).fillRect(4, 10, 10, 2).fillRect(18, 15, 9, 2);
  });
  make('notice', g => {
    g.fillStyle(0x8a6a42).fillRect(2, 4, 28, 22);
    g.fillStyle(0xd8cfb8, 0.8).fillRect(5, 7, 9, 7).fillRect(17, 8, 9, 7).fillRect(8, 17, 16, 6);
    g.fillStyle(0xb02020).fillRect(9, 8, 1, 1).fillRect(21, 9, 1, 1);
  });
  make('locker', g => {
    g.fillStyle(0x000000, 0.3).fillRect(5, 28, 24, 4);
    g.fillStyle(0x56606a).fillRect(4, 0, 24, 30);
    g.fillStyle(0x434b53).fillRect(15, 0, 2, 30);
    g.fillStyle(0x3a4148);
    for (let y = 4; y < 12; y += 3) g.fillRect(7, y, 6, 1).fillRect(19, y, 6, 1);
    g.fillStyle(0x9aa3ab).fillRect(12, 15, 2, 4).fillRect(18, 15, 2, 4);
  });
  make('keybox', g => {
    g.fillStyle(0x6b6f73).fillRect(7, 4, 18, 22);
    g.fillStyle(0x4f5357).fillRect(9, 6, 14, 18);
    g.fillStyle(0xb0b4b8);
    for (let i = 0; i < 4; i++) g.fillRect(11 + i * 3, 19, 2, 2);
  });
  make('cabinet', g => {
    g.fillStyle(0x50555a).fillRect(3, 2, 26, 28);
    g.fillStyle(0x3e4246).fillRect(3, 11, 26, 1).fillRect(3, 20, 26, 1);
    g.fillStyle(0x9aa3ab).fillRect(14, 6, 4, 2).fillRect(14, 15, 4, 2).fillRect(14, 24, 4, 2);
  });
  make('monitor', g => {
    g.fillStyle(0x5c4027).fillRect(2, 16, 28, 12);
    g.fillStyle(0x2a2a2e).fillRect(7, 3, 18, 14);
    g.fillStyle(0x0a0c10).fillRect(9, 5, 14, 10);
  });
  make('logdesk', g => {
    g.fillStyle(0x5c4027).fillRect(4, 22, 3, 7).fillRect(25, 22, 3, 7);
    g.fillStyle(0x7a5a38).fillRect(3, 9, 26, 14);
    g.fillStyle(0xc8b88a).fillRect(9, 11, 14, 9);
    g.fillStyle(0x7a6a4a).fillRect(16, 11, 1, 9);
  });
  make('mirror', g => {
    g.fillStyle(0x8a8f94).fillRect(6, 1, 20, 16);
    g.fillStyle(0x9fb3bf).fillRect(8, 3, 16, 12);
    g.fillStyle(0xcfdde6, 0.6).fillRect(10, 4, 3, 8);
    g.fillStyle(0xcfd6da).fillRect(5, 20, 22, 8);
    g.fillStyle(0x8a9298).fillRect(14, 22, 4, 3);
  });
  make('stall', g => {
    g.fillStyle(0x6f7a80).fillRect(1, 1, 30, 30);
    g.fillStyle(0x5a646a).fillRect(1, 1, 30, 3);
    g.fillStyle(0x9aa3ab).fillRect(24, 15, 2, 4);
  });
  make('bed_top', g => {
    g.fillStyle(0x3b3330).fillRect(2, 2, 28, 30);
    g.fillStyle(0xd8d4cc).fillRect(5, 5, 22, 10);
    g.fillStyle(0x2e3a55).fillRect(4, 18, 24, 14);
  });
  make('bed_bottom', g => {
    g.fillStyle(0x3b3330).fillRect(2, 0, 28, 28);
    g.fillStyle(0x2e3a55).fillRect(4, 0, 24, 24);
    g.fillStyle(0x26304a).fillRect(4, 10, 24, 2);
  });
  make('shelf', g => {
    g.fillStyle(0x4a3626).fillRect(2, 1, 28, 29);
    g.fillStyle(0x2e2218).fillRect(4, 3, 24, 11).fillRect(4, 16, 24, 11);
    const c = [0x8a3a3a, 0x3a5a8a, 0x8a7a3a, 0x4a7a4a, 0x6a4a7a];
    for (let i = 0; i < 6; i++) g.fillStyle(c[i % 5]).fillRect(5 + i * 4, 5, 3, 9).fillRect(5 + i * 4, 18, 3, 9);
  });
  make('window', g => {
    g.fillStyle(0x141319).fillRect(0, 0, T, T);
    g.fillStyle(0x4d3b28).fillRect(3, 3, 26, 22);
    g.fillStyle(0x1c2633).fillRect(5, 5, 22, 18);
    g.fillStyle(0x4d3b28).fillRect(15, 5, 2, 18);
    g.fillStyle(0x6a7f99, 0.6).fillRect(8, 7, 1, 5).fillRect(20, 11, 1, 6).fillRect(11, 15, 1, 5);
  });
  make('mailbox', g => {
    g.fillStyle(0x7a2a2a).fillRect(8, 8, 16, 14);
    g.fillStyle(0x5a1e1e).fillRect(10, 12, 12, 2);
    g.fillStyle(0xe8e2d6).fillRect(13, 6, 7, 5);
  });
  make('stairs_up', g => {
    g.fillStyle(0x45454c);
    for (let i = 0; i < 4; i++) g.fillRect(2 + i * 2, 2 + i * 7, T - 4 - i * 4, 5);
    g.fillStyle(0xd8cfb4).fillTriangle(16, 4, 10, 12, 22, 12);
  });

  // 인물
  for (const dir of ['down', 'up', 'left', 'right']) make('player_' + dir, g => person(g, { dir }));
  make('shadow', g => {
    g.fillStyle(0x000000, 0.45).fillCircle(16, 17, 15);
    person(g, { skin: 0x0b0b0e, hair: 0x000000, top: 0x101018, bottom: 0x08080a, eyes: 0xff2a2a });
  });

  // 손전등 빛 (어둠 렌더텍스처에서 지울 때 사용)
  const light = (key, r) => {
    const tex = scene.textures.createCanvas(key, r * 2, r * 2);
    const c = tex.getContext();
    const grd = c.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grd;
    c.fillRect(0, 0, r * 2, r * 2);
    tex.refresh();
  };
  light('light', 170);
  light('light_s', 70);
}
