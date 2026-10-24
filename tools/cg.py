"""컷신 CG 가공: assets/source/cg/<이름>.(png|webp) → assets/cg/<이름>.png (640×480)

- 4:3이 아니면 가운데 기준으로 양옆(또는 위아래)을 잘라 4:3으로 맞춘다. CROP_X로 가로 시작점 지정 가능
- Gemini 워터마크(오른쪽 아래 반짝이)는 바로 왼쪽 영역을 복사해 덮는다
사용: python tools/cg.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'source' / 'cg'
OUT = ROOT / 'assets' / 'cg'
SIZE = (640, 480)
# 4:3 자르기 시작 x (원본 픽셀). 없으면 가운데
CROP_X = {'ending3_gate': 130}
# 결과를 위로 올리는 픽셀 (640×480 기준). 대화창(아래 128px)에 가리는 물건을 보이게 하고, 빈 아래는 맨 아래 줄 색으로 채운다
SHIFT_Y = {'shaman': 50}
# AI가 아래쪽에 대화창 같은 띠를 그려 넣은 그림: 이 y(640×480 기준)부터를 위쪽 그림을 거꾸로 이어 붙이고 어둡게 덮는다 (바닥이 이어지는 그림자처럼)
FILL_BAND = {'stall_empty': 361, 'mirror_bedroom': 361}
# 워터마크 영역 (1024 폭 기준 비율: x0, y0, x1, y1) — 원본 1024×765에서 (896, 636, 948, 690)
WM = (896 / 1024, 636 / 765, 948 / 1024, 690 / 765)


def remove_watermark(im):
    w, h = im.size
    if abs(w / h - 4 / 3) > 0.02:
        return im  # 다른 비율은 워터마크가 자르는 영역에 있다
    x0, y0, x1, y1 = int(WM[0] * w), int(WM[1] * h), int(WM[2] * w), int(WM[3] * h)
    dx = (x1 - x0) + 16
    im.paste(im.crop((x0 - dx, y0, x1 - dx, y1)), (x0, y0))
    return im


def to_4_3(im, name):
    w, h = im.size
    if w / h > 4 / 3:
        cw = round(h * 4 / 3)
        x = CROP_X.get(name, (w - cw) // 2)
        return im.crop((x, 0, x + cw, h))
    ch = round(w * 3 / 4)
    y = (h - ch) // 2
    return im.crop((0, y, w, y + ch))


def fill_band(im, y0):
    """y0 아래를 지우고, y0 바로 위 그림을 거꾸로 이어 붙인 뒤 아래로 갈수록 어둡게 한다."""
    w, h = im.size
    out = im.copy()
    n = h - y0
    src = im.crop((0, max(0, y0 - n), w, y0)).transpose(Image.FLIP_TOP_BOTTOM)
    src = src.resize((w, n))
    for i in range(n):
        k = 0.36 - 0.30 * i / n           # 띠 위쪽은 0.36배, 맨 아래는 0.06배 (거의 검게 사라짐)
        row = src.crop((0, i, w, i + 1)).point(lambda v, k=k: int(v * k))
        out.paste(row, (0, y0 + i))
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for f in sorted(SRC.glob('*')):
        if f.suffix.lower() not in ('.png', '.webp', '.jpg'):
            continue
        im = Image.open(f).convert('RGB')
        im = to_4_3(remove_watermark(im), f.stem).resize(SIZE, Image.LANCZOS)
        y0 = FILL_BAND.get(f.stem)
        if y0:
            im = fill_band(im, y0)
        dy = SHIFT_Y.get(f.stem, 0)
        if dy:
            out = Image.new('RGB', SIZE, im.getpixel((SIZE[0] // 2, SIZE[1] - 1)))
            out.paste(im.crop((0, dy, SIZE[0], SIZE[1])), (0, 0))
            im = out
        im.save(OUT / f'{f.stem}.png', optimize=True)
        print('ok', f.stem)


if __name__ == '__main__':
    main()
