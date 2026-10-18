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
    if (scene.textures.exists(key)) return; // assets/sprites의 완성 그래픽이 있으면 그걸 쓴다
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
  // 계단 난간 (두 칸 사이 경계에 가로로 놓인다): 녹슨 쇠 손잡이 + 기둥, 여러 칸 이으면 한 줄로 이어진다
  make('rail_h', g => {
    g.fillStyle(0x000000, 0.35).fillRect(0, 13, T, 3);
    g.fillStyle(0x2a2c30).fillRect(14, 4, 4, 10);
    g.fillStyle(0x3a3d42).fillRect(0, 2, T, 4);
    g.fillStyle(0x6b6f76).fillRect(0, 2, T, 1);
    g.fillStyle(0x5a3e2a).fillRect(0, 5, T, 1);
    g.fillStyle(0x3a3d42).fillRect(0, 9, T, 2);
  }, T, 16);
  // 옆으로 난 계단 (단이 세로줄로 보인다)
  make('floor_stairs_side', g => {
    g.fillStyle(0x34343a).fillRect(0, 0, T, T);
    g.fillStyle(0x45454c);
    for (let x = 2; x < T; x += 8) g.fillRect(x, 0, 4, T);
    g.fillStyle(0x8a7a3a);
    for (let x = 6; x < T; x += 8) g.fillRect(x, 0, 1, T);
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
  // 맵 기믹 (12번 책상 밀기): 비뚤게 끌려온 책상(밀 수 있음, 바닥에 끈 자국) / 책상 위에 의자를 거꾸로 쌓은 더미(꿈쩍 안 함)
  make('desk_push', g => {
    g.fillStyle(0x2a2016, 0.9).fillRect(0, 27, 12, 1).fillRect(18, 29, 14, 1);
    g.fillStyle(0x000000, 0.25).fillRect(6, 25, 24, 4);
    g.fillStyle(0x5c4027).fillRect(6, 22, 3, 7).fillRect(26, 23, 3, 6);
    g.fillStyle(0x7a5a38).fillRect(5, 10, 26, 13);
    g.fillStyle(0x8d6a44).fillRect(5, 10, 26, 3);
    g.fillStyle(0x4a3420).fillRect(5, 22, 26, 1);
  });
  make('desk_pile', g => {
    g.fillStyle(0x000000, 0.3).fillRect(3, 26, 27, 4);
    g.fillStyle(0x5c4027).fillRect(4, 22, 3, 7).fillRect(25, 22, 3, 7);
    g.fillStyle(0x6a4c30).fillRect(3, 15, 26, 8);
    g.fillStyle(0x4a4e55).fillRect(6, 3, 2, 12).fillRect(14, 3, 2, 12).fillRect(17, 1, 2, 14).fillRect(25, 1, 2, 14);
    g.fillStyle(0x5d4632).fillRect(5, 9, 12, 3).fillRect(16, 7, 12, 3);
    g.fillStyle(0x8d6a44).fillRect(3, 15, 26, 2);
  });
  // 맵 기믹 (과학실 달라진 곳 찾기): 그날의 소화기·램프 불꽃·알코올병 / 지금 쓰러져 있는 소화기
  make('past_ext', g => {
    g.fillStyle(0x000000, 0.3).fillEllipse(16, 29, 14, 4);
    g.fillStyle(0xb02a22).fillRoundedRect(10, 8, 12, 21, 3);
    g.fillStyle(0xd84a3a).fillRect(12, 10, 2, 16);
    g.fillStyle(0x2a2a2e).fillRect(13, 3, 6, 5).fillRect(18, 4, 7, 2);
    g.fillStyle(0xe8e0d0).fillRect(11, 15, 10, 5);
  });
  make('ext_fallen', g => {
    g.fillStyle(0x000000, 0.3).fillEllipse(16, 26, 26, 5);
    g.fillStyle(0x8a2a22).fillRoundedRect(5, 17, 21, 10, 3);
    g.fillStyle(0xa83a30).fillRect(7, 18, 16, 2);
    g.fillStyle(0x2a2a2e).fillRect(25, 19, 5, 6);
    g.fillStyle(0xc8c0a8).fillRect(27, 16, 2, 4).fillCircle(28, 15, 2);
  });
  make('past_flame', g => {
    g.fillStyle(0xe8a030, 0.9).fillEllipse(16, 14, 8, 14);
    g.fillStyle(0xfff0a0, 0.95).fillEllipse(16, 17, 4, 7);
  });
  make('past_bottle', g => {
    g.fillStyle(0x6a8a6a, 0.95).fillRect(13, 12, 7, 12);
    g.fillStyle(0x8aaa8a).fillRect(15, 7, 3, 5);
    g.fillStyle(0xe8e0d0).fillRect(13, 16, 7, 4);
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
  // 침실 (GDD 6장 프롤로그 침실): 가구·바닥 소품·벽 장식
  make('nightstand', g => {
    g.fillStyle(0x4a3626).fillRect(5, 14, 22, 15);
    g.fillStyle(0x5c4430).fillRect(5, 14, 22, 3);
    g.fillStyle(0x2e2218).fillRect(7, 20, 18, 1);
    g.fillStyle(0xb59b5a).fillRect(15, 23, 2, 2);
    // 멈춘 탁상시계
    g.fillStyle(0x2a2a2e).fillRect(10, 5, 12, 10);
    g.fillStyle(0xd8d0bc).fillRect(11, 6, 10, 8);
    g.fillStyle(0x1a1a1a).fillRect(15, 7, 1, 4).fillRect(15, 10, 3, 1);
  });
  make('chair', g => {
    g.fillStyle(0x4a3424).fillRect(9, 4, 14, 10);
    g.fillStyle(0x5c4430).fillRect(9, 4, 14, 2);
    g.fillStyle(0x6a4c30).fillRect(8, 15, 16, 5);
    g.fillStyle(0x3a2818).fillRect(9, 20, 2, 9).fillRect(21, 20, 2, 9);
  });
  make('dresser', g => {
    g.fillStyle(0x4f3a28).fillRect(3, 4, 26, 25);
    g.fillStyle(0x624832).fillRect(3, 4, 26, 3);
    g.fillStyle(0x34261a).fillRect(5, 12, 22, 1).fillRect(5, 19, 22, 1);
    g.fillStyle(0xb59b5a).fillRect(15, 9, 2, 2).fillRect(15, 15, 2, 2).fillRect(15, 23, 2, 2);
  });
  make('desk_diary', g => {
    g.fillStyle(0x5c4027).fillRect(4, 22, 3, 7).fillRect(25, 22, 3, 7);
    g.fillStyle(0x7a5a38).fillRect(3, 9, 26, 14);
    g.fillStyle(0x8d6a44).fillRect(3, 9, 26, 3);
    g.fillStyle(0xd8cfb4).fillRect(8, 11, 8, 9).fillRect(17, 11, 8, 9);
    g.fillStyle(0x7a6a4a).fillRect(16, 11, 1, 9);
    g.fillStyle(0x4a4038).fillRect(9, 13, 5, 1).fillRect(9, 15, 6, 1).fillRect(18, 13, 5, 1).fillRect(18, 17, 4, 1);
  });
  make('rug', g => {
    g.fillStyle(0x4a2e2e).fillRect(2, 6, 28, 22);
    g.fillStyle(0x5e3a36).fillRect(4, 8, 24, 18);
    g.fillStyle(0x4a2e2e).fillRect(8, 12, 16, 10);
  });
  make('slippers', g => {
    g.fillStyle(0x3a4a5e).fillRoundedRect(7, 12, 7, 13, 3);
    g.fillStyle(0x3a4a5e).fillRoundedRect(18, 15, 7, 13, 3);
    g.fillStyle(0x2a3646).fillRect(8, 13, 5, 4).fillRect(19, 16, 5, 4);
  });
  make('papers', g => {
    g.fillStyle(0xcfc6ae).fillRect(5, 14, 10, 8).fillRect(16, 19, 11, 8);
    g.fillStyle(0xbdb49c).fillRect(12, 8, 9, 7);
    g.fillStyle(0x3a3430).fillRect(7, 16, 6, 1).fillRect(18, 21, 4, 4).fillRect(14, 10, 4, 1);
  });
  make('box', g => {
    g.fillStyle(0x000000, 0.25).fillRect(5, 26, 24, 4);
    g.fillStyle(0x8a6a44).fillRect(4, 10, 24, 18);
    g.fillStyle(0x9c7a50).fillRect(4, 10, 24, 4);
    g.fillStyle(0xbcae88).fillRect(14, 10, 4, 18);
    g.fillStyle(0xe8e2d6).fillRect(7, 17, 5, 4);
  });
  make('photo_wall', g => { // 비뚤어진 액자 (벽 칸)
    g.fillStyle(0x3a2817).fillTriangle(9, 9, 23, 7, 24, 22).fillTriangle(9, 9, 24, 22, 10, 24);
    g.fillStyle(0xbdb49c).fillTriangle(11, 11, 22, 9, 22, 20).fillTriangle(11, 11, 22, 20, 12, 22);
    g.fillStyle(0x5a6a7a).fillRect(13, 13, 3, 6);
    g.fillStyle(0x8a826c).fillRect(18, 11, 4, 9);
  });
  make('mirror_wall', g => { // 낡은 거울 (벽 칸)
    g.fillStyle(0x5a4a38).fillRect(9, 4, 14, 22);
    g.fillStyle(0x6e8290).fillRect(11, 6, 10, 18);
    g.fillStyle(0xa8bcc6, 0.5).fillRect(13, 8, 2, 8);
    g.fillStyle(0x3a3a3a, 0.6).fillRect(17, 15, 3, 1).fillRect(12, 20, 4, 1);
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
  make('stairs_down', g => {
    g.fillStyle(0x45454c);
    for (let i = 0; i < 4; i++) g.fillRect(8 - i * 2, 2 + i * 7, T - 16 + i * 4, 5);
    g.fillStyle(0xd8cfb4).fillTriangle(16, 28, 10, 20, 22, 20);
  });

  // 옥상
  make('floor_roof', g => {
    g.fillStyle(0x3b3d40).fillRect(0, 0, T, T);
    g.fillStyle(0x34363a).fillRect(0, 0, T, 1).fillRect(0, 0, 1, T);
    g.fillStyle(0x2c2e31).fillRect(7, 12, 9, 1).fillRect(15, 13, 1, 6).fillRect(22, 25, 6, 1);
  });
  make('fence', g => {
    g.fillStyle(0x101114).fillRect(0, 0, T, T);
    g.fillStyle(0x1b1d22).fillRect(0, 22, T, 10);
    g.lineStyle(1, 0x6a707a, 0.8);
    for (let i = -T; i < T; i += 6) { g.lineBetween(i, 0, i + 22, 22); g.lineBetween(i + 22, 0, i, 22); }
    g.fillStyle(0x7a808a).fillRect(0, 0, T, 2).fillRect(0, 20, T, 2);
  });
  // 난간에 칼로 새긴 「7.13」 (P6 조사 지점) — 녹슨 자리에 긁힌 숫자가 보인다
  make('carving', g => {
    g.fillStyle(0x101114).fillRect(0, 0, T, T);
    g.fillStyle(0x1b1d22).fillRect(0, 22, T, 10);
    g.lineStyle(1, 0x6a707a, 0.8);
    for (let i = -T; i < T; i += 6) { g.lineBetween(i, 0, i + 22, 22); g.lineBetween(i + 22, 0, i, 22); }
    g.fillStyle(0x7a808a).fillRect(0, 0, T, 2).fillRect(0, 20, T, 2);
    g.fillStyle(0x6a3a22).fillRect(2, 5, 28, 12);
    g.fillStyle(0x8a4e2c).fillRect(3, 6, 26, 1);
    g.fillStyle(0xe0d2b4);
    g.fillRect(4, 8, 5, 1).fillRect(8, 9, 1, 2).fillRect(7, 11, 1, 2).fillRect(6, 13, 1, 2); // 7
    g.fillRect(11, 14, 1, 1);                                                               // .
    g.fillRect(14, 8, 1, 7).fillRect(13, 9, 1, 1);                                          // 1
    g.fillRect(18, 8, 5, 1).fillRect(22, 9, 1, 2).fillRect(19, 11, 4, 1).fillRect(22, 12, 1, 2).fillRect(18, 14, 5, 1); // 3
  });
  make('tank', g => {
    g.fillStyle(0x000000, 0.3).fillRect(2, 26, 28, 5);
    g.fillStyle(0x4d6a7a).fillRect(2, 4, 28, 23);
    g.fillStyle(0x5f8090).fillRect(2, 4, 28, 4);
    g.fillStyle(0x3d5664).fillRect(2, 14, 28, 2);
    g.fillStyle(0x2a2c30).fillRect(5, 26, 3, 5).fillRect(24, 26, 3, 5);
  });
  make('roofbench', g => {
    g.fillStyle(0x000000, 0.25).fillRect(1, 24, 30, 4);
    g.fillStyle(0x2a2c30).fillRect(3, 20, 3, 8).fillRect(26, 20, 3, 8);
    g.fillStyle(0x5a4632).fillRect(0, 12, T, 4).fillRect(0, 17, T, 4);
  });
  make('butts', g => {
    g.fillStyle(0xd8d0c0);
    g.fillRect(9, 18, 5, 2).fillRect(16, 21, 4, 2).fillRect(20, 16, 5, 2);
    g.fillStyle(0xb06a30).fillRect(9, 18, 1, 2).fillRect(20, 16, 1, 2);
    g.fillStyle(0xc8c0a8).fillRect(12, 23, 6, 4);
  });
  make('ball', g => {
    g.fillStyle(0x000000, 0.3).fillEllipse(16, 26, 16, 4);
    g.fillStyle(0xe6e0d0).fillCircle(16, 18, 8);
    g.fillStyle(0x1a1a1a).fillCircle(16, 18, 3).fillCircle(10, 15, 2).fillCircle(21, 23, 2);
  });
  make('comic', g => {
    g.fillStyle(0x000000, 0.25).fillRect(1, 24, 30, 4);
    g.fillStyle(0x2a2c30).fillRect(3, 20, 3, 8).fillRect(26, 20, 3, 8);
    g.fillStyle(0x5a4632).fillRect(0, 12, T, 4).fillRect(0, 17, T, 4);
    g.fillStyle(0xc04a3a).fillRect(10, 9, 12, 8);
    g.fillStyle(0xe8d8b0).fillRect(12, 11, 8, 2);
  });
  make('tag', g => {
    g.fillStyle(0x2a3a6a).fillRect(10, 16, 13, 6);
    g.fillStyle(0xe8e2d6).fillRect(12, 18, 9, 2);
  });
  // 책상 위에 엎어진 액자 (교무실)
  make('frame', g => {
    g.fillStyle(0x5c4027).fillRect(4, 10, 24, 16);
    g.fillStyle(0x3a2817).fillRect(6, 12, 20, 12);
    g.fillStyle(0xd8cfb4).fillRect(9, 15, 14, 2).fillRect(9, 19, 10, 1);
  });
  make('extbox', g => {
    g.fillStyle(0x000000, 0.3).fillRect(6, 27, 20, 4);
    g.fillStyle(0x8a2020).fillRect(6, 3, 20, 25);
    g.fillStyle(0x5a1414).fillRect(8, 5, 16, 21);
    g.fillStyle(0xd8d0c0).fillRect(10, 8, 12, 3);
  });
  make('scorch', g => {
    g.fillStyle(0x050403, 0.45).fillEllipse(16, 17, 28, 20);
    g.fillStyle(0x050403, 0.4).fillEllipse(10, 12, 12, 9).fillEllipse(23, 22, 12, 8);
    g.fillStyle(0x3a1408, 0.25).fillEllipse(16, 17, 12, 8);
  });

  // 2층: 음악실 · 컴퓨터실 · 방송실
  const piano = (g, left) => {
    g.fillStyle(0x000000, 0.3).fillRect(0, 26, T, 4);
    g.fillStyle(0x17110d).fillRect(0, 2, T, 25);
    g.fillStyle(0x2a1f17).fillRect(0, 2, T, 4);
    g.fillStyle(0xe6e0d0).fillRect(0, 17, T, 8);
    g.fillStyle(0x8a8478);
    for (let x = 3; x < T; x += 5) g.fillRect(x, 17, 1, 8);
    g.fillStyle(0x0c0a08);
    for (let x = 2; x < T; x += 5) if ((x / 5 | 0) % 7 !== 2) g.fillRect(x, 17, 3, 5);
    if (left) g.fillStyle(0xd8cfb4).fillRect(18, 7, 12, 8).fillStyle(0x3a3020).fillRect(20, 9, 8, 1).fillRect(20, 12, 6, 1);
  };
  make('piano_l', g => piano(g, true));
  make('piano_r', g => piano(g, false));
  make('bench', g => {
    g.fillStyle(0x000000, 0.25).fillRect(5, 24, 22, 4);
    g.fillStyle(0x1f1612).fillRect(6, 20, 3, 8).fillRect(23, 20, 3, 8);
    g.fillStyle(0x2e221a).fillRect(4, 11, 24, 10);
    g.fillStyle(0x3d2e22).fillRect(4, 11, 24, 3);
  });
  make('stand', g => {
    g.fillStyle(0x2a2a2e).fillRect(15, 14, 2, 15).fillRect(10, 28, 12, 2);
    g.fillStyle(0x3a3a40).fillRect(7, 5, 18, 11);
    g.fillStyle(0xd8cfb4, 0.5).fillRect(9, 7, 14, 7);
  });
  const pc = (g, on) => {
    g.fillStyle(0x000000, 0.25).fillRect(3, 26, 26, 4);
    g.fillStyle(0x6a6e72).fillRect(2, 17, 28, 10);
    g.fillStyle(0xb8b4a8).fillRect(7, 3, 18, 14);
    g.fillStyle(on ? 0x2a5a8a : 0x0d1014).fillRect(9, 5, 14, 10);
    if (on) g.fillStyle(0xcfe2f2, 0.8).fillRect(11, 8, 10, 1).fillRect(11, 11, 6, 1);
    g.fillStyle(0xb8b4a8).fillRect(13, 17, 6, 2);
    g.fillStyle(0x2a2c30).fillRect(6, 21, 20, 3);
  };
  make('pc', g => pc(g, false));
  make('pc_on', g => pc(g, true));
  make('console', g => {
    g.fillStyle(0x000000, 0.25).fillRect(2, 26, 28, 4);
    g.fillStyle(0x2e3034).fillRect(1, 8, 30, 19);
    g.fillStyle(0x45484e).fillRect(1, 8, 30, 3);
    g.fillStyle(0x9aa3ab);
    for (let x = 4; x < 30; x += 5) g.fillRect(x, 13, 2, 10);
    g.fillStyle(0xd8d8d8);
    for (let x = 3; x < 30; x += 5) g.fillRect(x, 15 + (x * 7) % 6, 4, 2);
  });
  make('tapedeck', g => {
    g.fillStyle(0x000000, 0.25).fillRect(3, 26, 26, 4);
    g.fillStyle(0x5c4027).fillRect(2, 18, 28, 9);
    g.fillStyle(0x24262a).fillRect(4, 6, 24, 13);
    g.fillStyle(0x0c0d0f).fillRect(7, 8, 18, 7);
    g.fillStyle(0x6a6e72).fillCircle(12, 11, 2).fillCircle(20, 11, 2);
    g.fillStyle(0xa02020).fillRect(24, 16, 3, 2);
    g.fillStyle(0x8a8478);
    for (let i = 0; i < 4; i++) g.fillRect(4 + i * 7, 21, 5, 4);
  });

  // 인물
  for (const dir of ['down', 'up', 'left', 'right']) make('player_' + dir, g => person(g, { dir }));
  make('shadow', g => {
    g.fillStyle(0x000000, 0.45).fillCircle(16, 17, 15);
    person(g, { skin: 0x0b0b0e, hair: 0x000000, top: 0x101018, bottom: 0x08080a, eyes: 0xff2a2a });
  });
  // 과거 겹쳐보기의 그날 인물 (바랜 실루엣)
  make('past_fig', g => person(g, { skin: 0x8a7a62, hair: 0x4a3e2e, top: 0x6a5a44, bottom: 0x4a3e2e, eyes: 0x3a3024 }));
  // 도윤의 귀신: 창백하고 눈이 없다 (공격하지 않는 안내자)
  make('ghost', g => {
    g.fillStyle(0xbfd6e6, 0.25).fillCircle(16, 17, 15);
    person(g, { skin: 0xdfe8ee, hair: 0x9aaab8, top: 0xc8d6e0, bottom: 0xaabccc, eyes: 0xdfe8ee });
  });

  // 과학실 · 준비실
  make('labtable', g => {
    g.fillStyle(0x000000, 0.3).fillRect(1, 26, 30, 4);
    g.fillStyle(0x2a2c30).fillRect(1, 8, T - 2, 18);
    g.fillStyle(0x3a3e44).fillRect(1, 8, T - 2, 4);
    g.fillStyle(0x6e7a80).fillRect(6, 3, 3, 6).fillRect(22, 4, 4, 5);
  });
  make('chemshelf', g => {
    g.fillStyle(0x4a3826).fillRect(2, 1, 28, 30);
    g.fillStyle(0x2a2016).fillRect(4, 3, 24, 12).fillRect(4, 17, 24, 12);
    const c = [0x6a8a5a, 0x8a5a3a, 0x5a6a8a, 0x9a9a7a];
    for (let i = 0; i < 6; i++) g.fillStyle(c[i % 4]).fillRect(5 + i * 4, 7, 3, 8).fillRect(5 + i * 4, 21, 3, 8);
  });
  make('lamp', g => {
    g.fillStyle(0x2a2c30).fillRect(1, 14, T - 2, 14);
    g.fillStyle(0x9ab0b8, 0.8).fillCircle(16, 10, 5);
    g.fillStyle(0x3a3020).fillRect(15, 3, 2, 4);
    g.fillStyle(0xff7a2a).fillRect(15, 1, 2, 2);
  });
  make('trash', g => {
    g.fillStyle(0x000000, 0.3).fillEllipse(16, 29, 18, 4);
    g.fillStyle(0x4a5056).fillRect(8, 8, 16, 20);
    g.fillStyle(0x5e666c).fillRect(6, 6, 20, 4);
    g.fillStyle(0x3a4046).fillRect(11, 12, 2, 13).fillRect(15, 12, 2, 13).fillRect(19, 12, 2, 13);
  });
  make('bag', g => {
    g.fillStyle(0x000000, 0.3).fillEllipse(16, 28, 20, 4);
    g.fillStyle(0x2a3a5a).fillRoundedRect(7, 10, 18, 17, 4);
    g.fillStyle(0x1e2a44).fillRect(9, 17, 14, 2);
    g.lineStyle(2, 0x1e2a44).strokeRoundedRect(11, 5, 10, 8, 3);
  });

  // 손전등 빛 (어둠 렌더텍스처에서 지울 때 사용)
  const light = (key, r) => {
    const tex = scene.textures.createCanvas(key, r * 2, r * 2);
    const c = tex.getContext();
    const grd = c.createRadialGradient(r, r, 0, r, r, r);
    // 폐건물에서 손전등 하나로 버티는 밝기: 한가운데도 완전히 밝지 않고(0.86),
    // 중앙부터 살짝씩 어두워지며 가장자리까지 넓게 펴진 옅은 그림자 영역이 남는다
    grd.addColorStop(0, 'rgba(255,255,255,0.86)');
    grd.addColorStop(0.15, 'rgba(255,255,255,0.8)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.62)');
    grd.addColorStop(0.65, 'rgba(255,255,255,0.4)');
    grd.addColorStop(0.88, 'rgba(255,255,255,0.15)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grd;
    c.fillRect(0, 0, r * 2, r * 2);
    tex.refresh();
  };
  light('light', 210); // 반지름 — Explore.js drawDark()와 같아야 한다
  light('light_s', 70);
}
