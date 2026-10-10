import os
import re
import struct
import sys
from pathlib import Path
from urllib.parse import urlparse

CACHE_ROOT = Path(os.environ["LOCALAPPDATA"]) / (
    "Packages/5319275A.WhatsAppDesktop_cv1g1gvanyjgm/LocalCache/EBWebView/Default/Service Worker/CacheStorage"
)
OUT = Path(__file__).parent / "cache"

ENTRY_MAGIC = 0xFCFB6D1BA7725C30
EOF_MAGIC = struct.pack("<Q", 0xF4FA6F45970D41D8)
WANTED = {"css": "css", "html": "html"}


def parse_entry(path: Path):
    data = path.read_bytes()
    if len(data) < 24:
        return None
    magic, _version, key_len = struct.unpack_from("<QII", data, 0)
    if magic != ENTRY_MAGIC:
        return None
    key = data[24 : 24 + key_len].decode("utf-8", "replace")
    body_start = 24 + key_len
    eof1 = data.find(EOF_MAGIC, body_start)
    if eof1 < 0:
        return None
    body = data[body_start:eof1]
    headers = data[eof1 + 24 :]
    return key, body, headers


def classify(url: str, headers: bytes):
    path = urlparse(url).path.lower()
    if path.endswith(".css") or b"text/css" in headers:
        return "css"
    if path.endswith((".html", ".htm")) or path in ("", "/") or b"text/html" in headers:
        return "html"
    return None


def safe_name(url: str, ext: str) -> str:
    u = urlparse(url)
    name = (u.netloc + u.path).strip("/") or "index"
    name = re.sub(r'[<>:"\\|?*]', "_", name).replace("/", "__")
    if not name.endswith("." + ext):
        name += "." + ext
    return name[:180]


def main():
    counts = {"css": 0, "html": 0, "skipped": 0}
    for f in CACHE_ROOT.rglob("*_0"):
        parsed = parse_entry(f)
        if not parsed:
            continue
        url, body, headers = parsed
        kind = classify(url, headers)
        if not kind or not body:
            counts["skipped"] += 1
            continue
        target = OUT / kind / safe_name(url, WANTED[kind])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
        counts[kind] += 1
        print(f"[{kind}] {len(body):>9} B  {url}")
    print(counts, file=sys.stderr)


if __name__ == "__main__":
    main()
