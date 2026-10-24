"""게임·엔진·폰트를 내장한 실행 파일 빌드. Python 3.10+와 Go 1.22+ 필요.

python3 tools/build_release.py --target all
GO=/path/to/go python3 tools/build_release.py --target macos
첫 빌드에만 엔진·폰트 다운로드를 위한 인터넷이 필요하다.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".build" / "downloads"
STAGE = ROOT / ".build" / "launcher"
DIST = ROOT / "dist"
PHASER = "https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js"
FONTS = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&family=Noto+Serif+KR:wght@600&display=block"


def download(url):
    path = CACHE / hashlib.sha256(url.encode()).hexdigest()
    if not path.exists():
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
        temp = path.with_suffix(".tmp")
        temp.write_bytes(data)
        temp.replace(path)
    return path.read_bytes()


def prepare():
    CACHE.mkdir(parents=True, exist_ok=True)
    if STAGE.exists():
        shutil.rmtree(STAGE)
    web = STAGE / "web"
    web.mkdir(parents=True)
    for folder in ("src", "data", "assets"):
        shutil.copytree(ROOT / folder, web / folder,
                        ignore=shutil.ignore_patterns("source", ".DS_Store", "__pycache__"))
    vendor = web / "vendor"
    vendor.mkdir()
    (vendor / "phaser.min.js").write_bytes(download(PHASER))
    css = download(FONTS).decode()
    urls = sorted(set(re.findall(r"url\((https://[^)]+)\)", css)))
    if not urls:
        raise RuntimeError("Google Fonts CSS did not contain font URLs")

    def font(url):
        name = hashlib.sha256(url.encode()).hexdigest()[:20] + Path(url).suffix
        (vendor / name).write_bytes(download(url))
        return url, name

    with ThreadPoolExecutor(max_workers=8) as pool:
        for url, name in pool.map(font, urls):
            css = css.replace(url, name)
    (vendor / "fonts.css").write_text(css)
    licenses = vendor / "licenses"
    licenses.mkdir()
    for name, url in {
        "Phaser.txt": "https://cdn.jsdelivr.net/npm/phaser@3.80.1/LICENSE.md",
        "NotoSansKR.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/OFL.txt",
        "NotoSerifKR.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifkr/OFL.txt",
        "Go.txt": "https://raw.githubusercontent.com/golang/go/master/LICENSE",
    }.items():
        (licenses / name).write_bytes(download(url))
    html = (ROOT / "index.html").read_text()
    html = re.sub(r'  <link rel="preconnect"[^>]+>\n', '', html)
    html = re.sub(r'<link href="https://fonts.googleapis.com/[^>]+>',
                  '<link href="vendor/fonts.css" rel="stylesheet">', html)
    html = html.replace(PHASER, "vendor/phaser.min.js")
    (web / "index.html").write_text(html)
    shutil.copy(ROOT / "tools" / "launcher" / "main.go", STAGE / "main.go")
    (STAGE / "go.mod").write_text("module forgotten-classroom-launcher\n\ngo 1.22\n")
    digest = hashlib.sha256()
    for path in sorted(STAGE.rglob("*")):
        if path.is_file():
            digest.update(path.relative_to(STAGE).as_posix().encode())
            digest.update(b"\0")
            digest.update(path.read_bytes())
    return digest.hexdigest()[:20]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=["all", "windows", "macos"], default="all")
    args = parser.parse_args()
    go = os.environ.get("GO") or shutil.which("go")
    if not go:
        parser.error("Go 1.22+ is required. Install from https://go.dev/dl/ or set GO=/path/to/go")
    print("Preparing game, Phaser, and offline fonts...", flush=True)
    build_id = prepare()
    DIST.mkdir(exist_ok=True)
    targets = {
        "windows": ("windows", "amd64", "ForgottenClassroom-Windows.exe"),
        "macos": ("darwin", "arm64", "ForgottenClassroom-Mac"),
    }
    for target, (goos, arch, name) in targets.items():
        if args.target not in ("all", target):
            continue
        env = {**os.environ, "GOOS": goos, "GOARCH": arch, "CGO_ENABLED": "0"}
        print(f"Building {name}...", flush=True)
        subprocess.run([go, "build", "-trimpath", "-ldflags", f"-s -w -X main.buildID={build_id}",
                        "-o", str(DIST / name), "."], cwd=STAGE, env=env, check=True)
        print(f"Created {DIST / name} ({(DIST / name).stat().st_size / 1024**2:.1f} MiB)", flush=True)


if __name__ == "__main__":
    main()
