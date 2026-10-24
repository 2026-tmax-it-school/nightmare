"""옥상 펜스 그림을 코드로 그린다 (참고 이미지의 모양: 어두운 마름모 철망 + 가로 레일 + 밝은 콘크리트 턱).

사용법: python tools/draw_fence.py
  결과: assets/sprites/fence.png (위쪽 펜스), fence_post.png (기둥이 선 칸 — 2칸마다 번갈아),
        carving.png (기둥 칸에 「7.13」 각인)
  각인 점 좌표는 tools/sprites.json 의 "_carving_draw".
원본 이미지 없이 만들므로 sprites.json 에서는 이 그림들을 existing 으로 둔다.
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'sprites')
N = 32


def px(arr, x0, y0, x1, y1, rgb):
    arr[y0:y1, x0:x1, :3] = rgb
    arr[y0:y1, x0:x1, 3] = 255


def top_tile(post):
    t = np.zeros((N, N, 4), np.uint8)
    # 철망 (0~10줄): 어두운 바탕에 밝고 또렷한 마름모 선
    px(t, 0, 0, N, 11, (24, 18, 21))
    for y in range(11):
        for x in range(N):
            if (x + 2 * y) % 4 == 0 or (x - 2 * y) % 4 == 0:
                t[y, x, :3] = (88, 82, 86)
    # 가로 레일 (11~14줄)
    px(t, 0, 11, N, 15, (84, 78, 80))
    px(t, 0, 11, N, 12, (118, 111, 114))
    px(t, 0, 14, N, 15, (46, 40, 41))
    # 콘크리트 턱: 밝은 면(15~30). 턱 아래 그림자 띠는 두지 않는다 (맨 아랫줄만 얇은 윤곽선)
    px(t, 0, 15, N, 31, (118, 108, 102))
    px(t, 0, 15, N, 16, (138, 128, 123))
    px(t, 0, 27, N, 31, (104, 95, 91))
    px(t, 0, 31, N, 32, (58, 51, 51))
    for x, y in ((4, 18), (11, 21), (19, 17), (26, 22), (8, 26), (23, 28)):   # 먼지·얼룩 점
        t[y, x, :3] = (100, 91, 87)
    for x, y, h in ((5, 16, 3), (18, 16, 5)):                                 # 녹물 자국 (드문드문, 탁한 갈색)
        t[y:y + h, x, :3] = (98, 74, 60)
    px(t, 9, 16, 12, 18, (104, 92, 86))                                       # 옅은 얼룩
    if post:
        px(t, 14, 0, 18, 19, (74, 67, 69))     # 기둥 (4px)
        px(t, 14, 0, 15, 19, (110, 103, 106))
        px(t, 17, 0, 18, 19, (44, 38, 40))
        px(t, 13, 19, 19, 21, (50, 44, 45))    # 기둥 발치
    return t


def save(name, arr):
    Image.fromarray(arr, 'RGBA').save(os.path.join(OUT, name + '.png'))


def main():
    conf = json.load(open(os.path.join(ROOT, 'tools', 'sprites.json'), encoding='utf-8'))
    save('fence', top_tile(False))
    save('fence_post', top_tile(True))
    carving = top_tile(True)
    for x, y, w, h, rgb in conf['_carving_draw']:
        carving[y:y + h, x:x + w] = [*rgb, 255]
    save('carving', carving)
    print('fence, fence_post, carving')


if __name__ == '__main__':
    main()
