"""계단실 계단 그림 6장을 코드로 그린다 (위에서 본 모습, 걸어가는 방향인 동서로 놓인 계단).

사용법: python tools/draw_stairs.py
  동쪽(오른쪽)이 위인 오르는 계단 — 기본 그림을 시계 방향으로 90° 돌린 것:
    floor_stairs_up       오르는 계단 한 칸: 세로선(단 끝)이 8px 간격으로 일정하게 이어진다
    floor_stairs_up_top   동쪽 벽 바로 앞 칸: 맨 오른쪽 8px은 벽 밑 그늘이 있는 평평한 층계참 → 그 왼쪽부터 오르는 계단
    floor_stairs_down     동쪽으로 내려가는 계단 한 칸: 디딤판(밝음) + 앞면(어둡게)으로 높낮이를 보인다
    floor_stairs_down_end 내려가는 계단이 시작되는 칸(서쪽 복도 바닥과 맞닿음): 왼쪽은 복도 바닥 그림을 그대로 이어 높이 차이가 없어 보이게
  서쪽(왼쪽)으로 내려가는 계단 — 반시계 방향으로 돌린 것 (옥상):
    floor_stairs_down_w, floor_stairs_down_end_w (끝 칸은 동쪽 복도 바닥과 맞닿음)
원본 이미지 없이 만들므로 sprites.json 에서는 existing 으로 둔다.
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'sprites')
N = 32
STEP = 8    # 한 단의 높이(px)


def noise(t, seed):
    """콘크리트 질감: 밝기를 ±3 정도 흔든다 (같은 자리에서 항상 같은 모양)."""
    rng = np.random.default_rng(seed)
    d = rng.integers(-3, 4, size=(N, N, 1))
    t[..., :3] = np.clip(t[..., :3].astype(int) + d, 0, 255).astype(np.uint8)


def base():
    t = np.zeros((N, N, 4), np.uint8)
    t[..., 3] = 255
    return t


def row(t, y, rgb):
    t[y, :, :3] = rgb


def up_rows(t, y0, y1, offset=0):
    """오르는 계단 줄 그리기: 단마다 윗모서리 밝은 선 → 디딤판 → 끝에 어두운 선 (가로선이 일정 간격)."""
    for y in range(y0, y1):
        k = (y - offset) % STEP
        row(t, y, {0: (140, 140, 130), 1: (112, 112, 104), 2: (106, 106, 99), 3: (102, 102, 95),
                   4: (98, 98, 92), 5: (92, 92, 87), 6: (84, 84, 80), 7: (50, 50, 51)}[k])


def down_rows(t, y0, y1, offset=0):
    """내려가는 계단 줄: 디딤판(밝음, 윗모서리 선) 5px + 앞면(어둡게) 3px. 아래로 갈수록 한 단씩 낮아진다."""
    for y in range(y0, y1):
        k = (y - offset) % STEP
        row(t, y, {0: (132, 132, 122), 1: (110, 110, 102), 2: (106, 106, 99), 3: (102, 102, 95),
                   4: (98, 98, 92), 5: (60, 60, 58), 6: (54, 54, 53), 7: (40, 40, 42)}[k])


def stairs_up():
    t = base(); up_rows(t, 0, N); noise(t, 1); return t


def stairs_up_top():
    t = base()
    for y, c in ((0, (34, 34, 36)), (1, (46, 46, 47)), (2, (66, 66, 64)), (3, (96, 96, 90)),
                 (4, (112, 112, 104)), (5, (112, 112, 104)), (6, (108, 108, 100)), (7, (104, 104, 97))):
        row(t, y, c)                              # 층계참: 벽 밑 그늘 → 평평한 바닥
    up_rows(t, STEP, N)                           # 8줄부터 오르는 계단 (앞 칸과 같은 간격)
    noise(t, 2)
    return t


def stairs_down():
    t = base(); down_rows(t, 0, N); noise(t, 3); return t


def stairs_down_end(corridor):
    t = base()
    down_rows(t, 0, 16)                           # 위 두 단은 계단
    t[16:, :, :3] = corridor[16:, :, :3]          # 아래는 복도 바닥 그림 그대로 (높이 차이 없음)
    row(t, 15, (40, 40, 42))
    t2 = t.copy(); noise(t2, 4); t[:16] = t2[:16]  # 질감은 계단 부분에만
    return t


def save(name, arr):
    Image.fromarray(arr, 'RGBA').save(os.path.join(OUT, name + '.png'))


def main():
    corridor = np.asarray(Image.open(os.path.join(OUT, 'floor_corridor.png')).convert('RGBA'))
    cw = lambda a: np.ascontiguousarray(np.rot90(a, -1))     # 위쪽(북) → 오른쪽(동)
    ccw = lambda a: np.ascontiguousarray(np.rot90(a, 1))     # 위쪽(북) → 왼쪽(서)
    end = stairs_down_end(corridor)
    save('floor_stairs_up', cw(stairs_up()))
    save('floor_stairs_up_top', cw(stairs_up_top()))
    save('floor_stairs_down', cw(stairs_down()))
    save('floor_stairs_down_end', cw(end))
    save('floor_stairs_down_w', ccw(stairs_down()))
    save('floor_stairs_down_end_w', ccw(end))
    print('floor_stairs_up, up_top, down, down_end, down_w, down_end_w')


if __name__ == '__main__':
    main()
