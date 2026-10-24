"""거울 CG에서 거울 속 사람만 따로 떼어, 사람이 숨 쉬듯 움직이게 할 수 있게 두 장으로 나눈다.

사용법: python tools/split_person.py   (opencv-python-headless 필요: pip install opencv-python-headless)
  입력: assets/cg/mirror_*.png (tools/cg.py가 만든 640×480)
  결과: assets/cg/<이름>_person.png — 사람만 남기고 가장자리를 부드럽게 한 투명 PNG
        assets/cg/<이름>_back.png   — 사람이 있던 자리를 주변 배경으로 메운 그림 (사람이 움직여도 잔상이 안 남는다)
  게임(src/ui/mirror.js)은 두 장이 모두 있으면 바탕 위에서 사람 층만 움직이고, 없으면 그림 한 장을 그대로 쓴다.
  금이 간 거울(mirror_now_cracked)은 금이 사람 위로 지나가므로 나누지 않는다.
  사람 윤곽은 GrabCut으로 찾는다. RECTS 는 사람이 들어 있는 사각형(x, y, w, h).
"""
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CG = os.path.join(ROOT, 'assets', 'cg')

# 같은 장면(사람 위치가 같음)의 그림은 첫 그림의 윤곽을 함께 쓴다
RECTS = {
    'mirror_now': (228, 108, 194, 228),
    'mirror_young': (228, 100, 194, 236),
    'mirror_bedroom': (215, 60, 180, 270),
}
SHARE = {'mirror_now_fog': 'mirror_now'}


def person_mask(img, key):
    x, y, w, h = RECTS[key]
    mask = np.full(img.shape[:2], cv2.GC_BGD, np.uint8)
    mask[y:y + h, x:x + w] = cv2.GC_PR_FGD
    if key == 'mirror_bedroom':
        # 머리 뒤의 밝은 창은 배경: 창 영역을 배경으로 하되 머리·목은 사람으로 고정
        mask[78:182, 240:392] = cv2.GC_PR_BGD
        cv2.ellipse(mask, (321, 128), (36, 50), 0, 0, 360, cv2.GC_FGD, -1)
        mask[170:h + y, 232:410] = cv2.GC_PR_FGD
    bg = np.zeros((1, 65), np.float64)
    fg = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, None, bg, fg, 8, cv2.GC_INIT_WITH_MASK)
    m = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        m = (lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)   # 가장 큰 덩어리만
    return m


def split(name, mask):
    img = cv2.imread(os.path.join(CG, name + '.png'))
    grown = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    alpha = cv2.GaussianBlur(grown.astype(np.float32), (0, 0), 1.0)
    person = np.dstack([img, (alpha * 255).astype(np.uint8)])
    cv2.imwrite(os.path.join(CG, name + '_person.png'), person)
    hole = cv2.dilate(mask, np.ones((9, 9), np.uint8))
    back = cv2.inpaint(img, hole, 7, cv2.INPAINT_TELEA)
    cv2.imwrite(os.path.join(CG, name + '_back.png'), back)
    print('ok', name)


def main():
    masks = {}
    for key in RECTS:
        masks[key] = person_mask(cv2.imread(os.path.join(CG, key + '.png')), key)
        split(key, masks[key])
    for name, src in SHARE.items():
        split(name, masks[src])


if __name__ == '__main__':
    main()
