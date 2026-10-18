"""AI가 만든 원본 이미지에서 게임용 스프라이트를 만든다.

사용법: python tools/sprites.py
        python tools/sprites.py --boxes assets/source/<파일>   ← 원본 안 그림들의 영역 [x0, y0, x1, y1] 찾기
  - 함께 만드는 것: docs/asset_reference.png (완성 에셋 확대 모음 — AI에 스타일 기준으로 첨부)
  - 설정: tools/sprites.json (원본 파일·잘라낼 영역·크기·방식)
  - 원본: assets/source/ (Git에 올리지 않음)
  - 결과: assets/sprites/<이름>.png  +  assets/sprites/manifest.json (게임이 읽을 목록)
  - 확인용: assets/source/_preview.png (4배 확대 모음)

방식(mode)
  tile    : 영역을 꽉 채워 W×H로 줄인다 (바닥·벽, 불투명)
  stretch : tile과 같지만 비율이 달라도 늘려 맞춘다 (문)
  object  : 배경색을 투명으로 지우고 비율을 지켜 W×H 안에 아래 가운데 정렬 (가구)
옵션
  trim    : [왼, 위, 오른, 아래] 픽셀만큼 영역 가장자리를 더 잘라낸다
  patch   : [[x, y, w, h, dx, dy], ...] 원본의 (x,y,w,h)를 (x+dx, y+dy)에서 복사해 덮는다 (워터마크 지우기)
  cutout  : object인데 배경이 바닥 그림일 때 그림만 따로 떼어 내는 방법
            {"kind": "border", "tol": 55}  가장자리 바닥 색과 tol 이상 다른 가장 큰 덩어리 (볼록한 물체용)
            {"kind": "blue"}               파란빛 물체(가방 등)와 그 외곽선
            {"kind": "flood", "tol": 60}   바깥과 이어진 배경만 지운다 (회색 격자 배경, 가구 다리 사이도 비게)
                                             "extra": [[r, g, b], ...]로 함께 지울 색(그림 뒤 벽판 등)을 더한다
                                             "gray": false  밝은 무채색을 배경으로 보지 않는다 (회색 금속 의자 등)
                                             "holes": [x0, y0, x1, y1]  이 범위(0~1 비율)에선 갇힌 배경(책상 다리 사이)도 지운다
                                             "all": true  떨어진 덩어리도 모두 남긴다 (위아래 두 판으로 된 게시판)
  fill    : object를 비율과 상관없이 W×H에 꽉 채운다 (예: 사물함 높이를 줄일 때). [w, h]면 그 크기로 (top과 함께 쓰면 벽 윗부분에만 거는 창)
  top     : object를 아래가 아니라 위에서 이 픽셀만큼 내려 붙인다 (벽에 거는 물건, 예: 열쇠함)
  keep_box: box를 그림 경계로 좁히지 않고 그대로 쓴다. 나란히 붙는 두 그림의 높이·선을 맞출 때 (침실 책상 두 칸)
  parts   : object를 여러 조각으로 따로 잘라 한 장에 배치한다. [{"box": [...], "at": [x, y, w, h]}, ...]
            각 조각은 비율을 지켜 at 영역 안 아래 가운데에 놓인다 (예: 거울은 벽 칸 아래쪽, 세면대는 바로 아래 바닥 칸)
  frame   : 문틀(양옆·위 어두운 나무)과 문턱(아래 회색 줄)을 둘러 벽과 구분되게 한다
  brighten: tile·stretch 결과의 밝기를 곱한다 (예: 1.5 → 어두운 문을 밝게). 문틀은 그 뒤에 둘러서 그대로
  clear_dark : [x0, y0, x1, y1, 밝기] 결과 이미지의 이 범위(0~1 비율)에서 어두운 픽셀을 투명하게 (열린 문 너머로 바닥이 보이게)
기본으로 tile·stretch는 가장자리를 4픽셀 더 잘라 배경색이 번진 테두리를 없앤다.
"""
import json
import os
from collections import deque

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'source')
OUT = os.path.join(ROOT, 'assets', 'sprites')
BG_DIST = 90  # 배경색과 이 정도 이상 다르면 그림으로 본다


def load(name, cache={}):
    if name not in cache:
        cache[name] = np.asarray(Image.open(os.path.join(SRC, name)).convert('RGB')).astype(np.int32)
    return cache[name].copy()


def tight(img, box):
    """영역 안에서 배경색이 아닌 부분만 남기도록 경계를 좁힌다."""
    x0, y0, x1, y1 = box
    bg = img[2, 2]
    sub = img[y0:y1, x0:x1]
    fg = np.abs(sub - bg).sum(axis=2) > BG_DIST
    ys, xs = np.nonzero(fg)
    return x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1


def magentaish(rgb):
    """마젠타 배경, 또는 배경과 섞여 분홍빛이 된 경계 픽셀."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r - g > 25) & (b - g > 25)


def biggest(mask):
    """가장 큰 이어진 덩어리만 남긴다."""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    best = []
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        comp = []
        q = deque([(y, x)])
        seen[y, x] = True
        while q:
            cy, cx = q.popleft()
            comp.append((cy, cx))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if len(comp) > len(best):
            best = comp
    out = np.zeros_like(mask)
    ys, xs = zip(*best)
    out[list(ys), list(xs)] = True
    return out


def convex_rows(m):
    """행마다 가장 왼쪽~오른쪽 사이를 채운다 (안쪽 구멍 메우기)."""
    m = m.copy()
    for y in range(m.shape[0]):
        xs = np.nonzero(m[y])[0]
        if len(xs):
            m[y, xs.min():xs.max() + 1] = True
    return m


def cutout(sub, cfg):
    if cfg['kind'] == 'flood':
        return flood_cut(sub, cfg)
    if cfg['kind'] == 'border':
        edge = np.concatenate([sub[:8].reshape(-1, 3), sub[-8:].reshape(-1, 3), sub[:, :8].reshape(-1, 3), sub[:, -8:].reshape(-1, 3)])
        m = np.abs(sub - np.median(edge, axis=0)).sum(axis=2) > cfg.get('tol', 55)
    else:  # blue
        r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
        m = (b - r > 6) | ((r + g + b < 110) & (b >= r - 4))
    return convex_rows(biggest(m))


def flood_cut(sub, cfg):
    """가장자리 배경색(또는 밝은 무채색 격자)과 비슷하면서 바깥과 이어진 픽셀만 배경으로 지운다."""
    edge = np.concatenate([sub[:6].reshape(-1, 3), sub[-6:].reshape(-1, 3), sub[:, :6].reshape(-1, 3), sub[:, -6:].reshape(-1, 3)])
    mx, mn = sub.max(axis=2), sub.min(axis=2)
    bgish = np.abs(sub - np.median(edge, axis=0)).sum(axis=2) < cfg.get('tol', 60)
    if cfg.get('gray', True):
        bgish |= (mx - mn < 20) & (mx > 165) & (mx < 250)
    for c in cfg.get('extra', []):
        bgish |= np.abs(sub - np.array(c)).sum(axis=2) < cfg.get('extra_tol', 22)
    h, w = bgish.shape
    out = np.zeros_like(bgish)
    q = deque()
    for y, x in [(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)]:
        if bgish[y, x] and not out[y, x]:
            out[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not out[ny, nx] and bgish[ny, nx]:
                out[ny, nx] = True
                q.append((ny, nx))
    if 'holes' in cfg:  # 이 범위(0~1 비율) 안에서는 바깥과 이어지지 않은 배경(다리 사이 틈)도 지운다
        fx0, fy0, fx1, fy1 = cfg['holes']
        ys, xs = slice(round(fy0 * h), round(fy1 * h)), slice(round(fx0 * w), round(fx1 * w))
        out[ys, xs] |= bgish[ys, xs]
    return ~out if cfg.get('all') else biggest(~out)


def shrink(rgb, mask, size):
    """마스크 가중 평균으로 줄여 배경색이 가장자리에 번지지 않게 한다."""
    m = mask.astype(np.float32)
    pre = Image.fromarray((rgb * m[..., None]).clip(0, 255).astype(np.uint8))
    pm = Image.fromarray((m * 255).astype(np.uint8))
    c = np.asarray(pre.resize(size, Image.BOX)).astype(np.float32)
    a = np.asarray(pm.resize(size, Image.BOX)).astype(np.float32) / 255
    col = np.where(a[..., None] > 0, c / np.maximum(a[..., None], 1e-6), 0)
    out = np.dstack([col.clip(0, 255), np.where(a > 0.5, 255, 0)]).astype(np.uint8)
    return out


def add_frame(out):
    """문틀: 양옆 2px·위 2px 어두운 나무(안쪽 1px 밝은 선), 아래 2px 문턱."""
    jamb, hi, sill = (43, 30, 20, 255), (92, 68, 46, 255), (58, 58, 62, 255)
    out[:, :2] = jamb
    out[:, -2:] = jamb
    out[:2, :] = jamb
    out[2:, 2] = hi
    out[2:, -3] = hi
    out[2, 2:-2] = hi
    out[-2:, 2:-2] = sill


def build(key, cfg):
    img = load(cfg['src'])
    for x, y, w, h, dx, dy in cfg.get('patch', []):
        img[y:y + h, x:x + w] = img[y + dy:y + dy + h, x + dx:x + dx + w]
    if 'parts' in cfg:
        return build_parts(img, cfg)
    x0, y0, x1, y1 = cfg['box'] if cfg.get('keep_box') else tight(img, cfg['box'])
    mode = cfg.get('mode', 'tile')
    edge = 4 if mode in ('tile', 'stretch') else 0
    l, t, r, b = cfg.get('trim', [0, 0, 0, 0])
    x0, y0, x1, y1 = x0 + l + edge, y0 + t + edge, x1 - r - edge, y1 - b - edge
    sub = img[y0:y1, x0:x1]
    W, H = cfg.get('size', [32, 32])
    if mode in ('tile', 'stretch'):
        out = shrink(sub, np.ones(sub.shape[:2], bool), (W, H))
        if cfg.get('brighten'):
            out[..., :3] = (out[..., :3].astype(np.float32) * cfg['brighten']).clip(0, 255).astype(np.uint8)
        if cfg.get('frame'):
            add_frame(out)
        if 'clear_dark' in cfg:
            fx0, fy0, fx1, fy1, lum = cfg['clear_dark']
            reg = out[round(fy0 * H):round(fy1 * H), round(fx0 * W):round(fx1 * W)]
            reg[reg[..., :3].astype(int).sum(axis=2) < lum, 3] = 0
        return out
    # object: 배경을 지우고 비율을 지켜 아래 가운데 정렬
    if 'cutout' in cfg:
        mask = cutout(sub, cfg['cutout'])
    else:
        mask = (np.abs(sub - img[2, 2]).sum(axis=2) > BG_DIST) & ~magentaish(sub)
    if not cfg.get('keep_box'):
        ys, xs = np.nonzero(mask)
        sub, mask = sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1], mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    sh, sw = mask.shape
    scale = min(W / sw, H / sh) * cfg.get('scale', 1)
    tw, th = max(1, round(sw * scale)), max(1, round(sh * scale))
    if cfg.get('fill'):
        tw, th = cfg['fill'] if isinstance(cfg['fill'], list) else (W, H)
    small = shrink(sub, mask, (tw, th))
    canvas = np.zeros((H, W, 4), np.uint8)
    ox, oy = (W - tw) // 2, cfg.get('top', H - th)
    canvas[oy:oy + th, ox:ox + tw] = small
    return clean_edge(canvas)


def build_parts(img, cfg):
    W, H = cfg.get('size', [32, 32])
    canvas = np.zeros((H, W, 4), np.uint8)
    for part in cfg['parts']:
        x0, y0, x1, y1 = tight(img, part['box'])
        sub = img[y0:y1, x0:x1]
        mask = (np.abs(sub - img[2, 2]).sum(axis=2) > BG_DIST) & ~magentaish(sub)
        ys, xs = np.nonzero(mask)
        sub, mask = sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1], mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        ax, ay, aw, ah = part['at']
        sh, sw = mask.shape
        scale = min(aw / sw, ah / sh)
        tw, th = max(1, round(sw * scale)), max(1, round(sh * scale))
        small = shrink(sub, mask, (tw, th))
        ox, oy = ax + (aw - tw) // 2, ay + ah - th
        region = canvas[oy:oy + th, ox:ox + tw]
        keep = small[..., 3] > 0
        region[keep] = small[keep]
    return clean_edge(canvas)


def clean_edge(canvas):
    # 투명한 곳과 맞닿은 테두리 픽셀에 남은 보랏빛(배경 번짐)을 회색으로 바꾼다
    a = canvas[..., 3] > 0
    pad = np.pad(a, 1)
    edge = a & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    c = canvas[..., :3].astype(int)
    tint = edge & (c[..., 0] - c[..., 1] > 8) & (c[..., 2] - c[..., 1] > 8)
    canvas[tint, :3] = c[tint].mean(axis=1, keepdims=True).astype(np.uint8)
    return canvas


def main():
    conf = json.load(open(os.path.join(ROOT, 'tools', 'sprites.json'), encoding='utf-8'))
    os.makedirs(OUT, exist_ok=True)
    made = {}
    for key, cfg in conf.items():
        if key.startswith('_'):
            continue
        if not os.path.exists(os.path.join(SRC, cfg['src'])):
            # 원본은 Git에 없다. 다른 컴퓨터에서는 이미 만들어진 PNG를 그대로 둔다
            done = os.path.join(OUT, key + '.png')
            if os.path.exists(done):
                im = Image.open(done)
                made[key] = [im.width, im.height]
                print(f'{key:16s} 원본 없음 — 기존 PNG 유지')
            else:
                print(f'{key:16s} 원본 없음 — 건너뜀 ({cfg["src"]})')
            continue
        arr = build(key, cfg)
        Image.fromarray(arr, 'RGBA').save(os.path.join(OUT, key + '.png'))
        made[key] = [arr.shape[1], arr.shape[0]]
        print(f'{key:16s} {arr.shape[1]}x{arr.shape[0]}')
    json.dump(made, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8'), indent=1)
    # 확인용 모음 (4배 확대, 체크무늬 배경)
    cell = 4 * 64 + 8
    sheet = Image.new('RGBA', (cell * min(6, len(made)), cell * ((len(made) + 5) // 6)), (60, 60, 60, 255))
    for i, key in enumerate(made):
        im = Image.open(os.path.join(OUT, key + '.png'))
        big = im.resize((im.width * 4, im.height * 4), Image.NEAREST)
        sheet.alpha_composite(big, (i % 6 * cell + 4, i // 6 * cell + 4))
    if os.path.isdir(SRC):
        sheet.save(os.path.join(SRC, '_preview.png'))
    # AI에 첨부할 스타일 기준: 완성 에셋을 8배로 확대해 회색 바탕에 늘어놓는다 (Git에 포함)
    cell = 8 * 64 + 16
    cols = 6
    ref = Image.new('RGB', (cell * cols, cell * ((len(made) + cols - 1) // cols)), (128, 128, 128))
    for i, key in enumerate(made):
        im = Image.open(os.path.join(OUT, key + '.png')).convert('RGBA')
        big = im.resize((im.width * 8, im.height * 8), Image.NEAREST)
        ref.paste(big, (i % cols * cell + 8, i // cols * cell + 8), big)
    ref.save(os.path.join(ROOT, 'docs', 'asset_reference.png'))


def find_boxes(path):
    """배경(왼쪽 위 모서리 색)과 다른 덩어리들의 영역을 출력한다. sprites.json의 box에 쓴다."""
    img = np.asarray(Image.open(path).convert('RGB')).astype(np.int32)
    fg = (np.abs(img - img[2, 2]).sum(axis=2) > BG_DIST)[::4, ::4]
    seen = np.zeros_like(fg)
    print(f'{path}  크기 {img.shape[1]}x{img.shape[0]}  배경색 {img[2, 2].tolist()}')
    for y, x in zip(*np.nonzero(fg)):
        if seen[y, x]:
            continue
        q, n = deque([(y, x)]), 0
        seen[y, x] = True
        y0 = y1 = y
        x0 = x1 = x
        while q:
            cy, cx = q.popleft()
            n += 1
            y0, y1, x0, x1 = min(y0, cy), max(y1, cy), min(x0, cx), max(x1, cx)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < fg.shape[0] and 0 <= nx < fg.shape[1] and fg[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if n > 40:
            print(f'  "box": [{x0 * 4}, {y0 * 4}, {(x1 + 1) * 4}, {(y1 + 1) * 4}]')


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == '--boxes':
        for p in sys.argv[2:]:
            find_boxes(p)
    else:
        main()
