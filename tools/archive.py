"""Shared deterministic monthly archive. A failed collection never advances coverage."""
import gzip
import json
import os
import re
import time
from pathlib import Path
from urllib.request import Request, urlopen
from datetime import datetime, timezone, timedelta

JST=timezone(timedelta(hours=9))
STORE=Path("archive")
def get(url):
    for attempt in range(3):
        try:
            with urlopen(Request(url,headers={"User-Agent":"quake-atlas/1 (+https://github.com/snowleaflab/quake-atlas)"}),timeout=35) as r:
                return r.read()
        except OSError:
            if attempt==2: raise
            time.sleep(2**attempt)
def read(path, fallback=None):
    if not path.exists(): return fallback
    raw=path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix==".gz" else raw)
def save(path,obj):
    raw=json.dumps(obj,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode()
    if path.suffix==".gz": raw=gzip.compress(raw,compresslevel=5,mtime=0)
    if path.exists() and path.read_bytes()==raw: return
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(".tmp")
    temp.write_bytes(raw)
    os.replace(temp,path)
def monthpath(month):
    if not re.fullmatch(r"\d{4}-\d{2}",month): raise ValueError(month)
    return STORE / (month+".json.gz")
# Display scale is ordinal. Historical unsplit 5 and 6 retain separate labels.
LABELS=["不明","1","2","3","4","5弱","5","5強","6弱","6","6強","7"]
