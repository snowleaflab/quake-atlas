"""Import JMA's published annual intensity files, preserving distinct same-time events."""
import io
import zipfile
from urllib.parse import urljoin
from collections import defaultdict
from archive import *
from geography import build

BASE="https://www.data.jma.go.jp/eqev/data/bulletin/"
VALUE=dict(zip("1234A5BC6D7",range(1,12)))
def num(raw,div=1):
    s=raw.strip()
    if not s: return None
    try: return int(raw.replace(b" ",b"0"))/div
    except ValueError: return None
def coord(deg,minute):
    d=num(deg)
    return round(d+(num(minute,6000) or 0),4) if d is not None else None
def parse(blob,year,stations):
    files=zipfile.ZipFile(io.BytesIO(blob))
    data=files.read(next(n for n in files.namelist() if n.lower().endswith(".dat")))
    for codec in ("utf8","euc_jp","cp932"):
        try: data.decode(codec); break
        except UnicodeDecodeError: pass
    events=[]
    event=None
    remaining=0
    for i,row in enumerate(data.splitlines()):
        if row[:1] in (b"A",b"B",b"D") and remaining==0:
            remaining=int(row[90:95].strip() or 0)
            if row[95:96] in (b"H",b"D",b"M"):
                event=None
                continue
            prefix=row[1:13].decode().replace(" ","0")
            try: at=datetime.strptime(prefix,"%Y%m%d%H%M")
            except ValueError:
                event=None
                continue
            secs=num(row[13:17],100) or 0
            at+=timedelta(seconds=secs)
            mag=row[52:54].decode()
            m=num(row[52:54],10)
            if mag[0] in "ABC" and mag[1].isdigit(): m=-(ord(mag[0])-64+int(mag[1])/10)
            unknown_position="詳細不明" in row[68:90].decode(codec,errors="replace")
            event=dict(id=f"a{year}-{i}",at=at.isoformat(timespec="seconds"),name=row[68:90].decode(codec,errors="replace").strip(),
                       lat=None if unknown_position else coord(row[21:24],row[24:28]),lon=None if unknown_position else coord(row[32:36],row[36:40]),depth=num(row[44:49].replace(b" ",b"0"),100) if row[44:49].strip() else None,
                       m=m,s=VALUE.get(chr(row[61]),0),obs=[])
            events.append(event)
        elif row[:7].strip().isdigit():
            remaining=max(0,remaining-1)
            if event is None: continue
            sid=row[:7].decode().strip()
            s=VALUE.get(chr(row[18]),0)
            city=(stations.get(sid) or [None]*4)[3]
            event["obs"].append([city,sid,s])
    return events
def run():
    catalog=get(BASE+"shindo.html").decode("utf8",errors="replace")
    links=dict((int(y),urljoin(BASE,p)) for p,y in re.findall(r'href="([^"]*/i(\d{4})\.zip)"',catalog))
    if not links: raise ValueError("No JMA annual archives found")
    _,stations,_=build()
    done=read(STORE/"years.json",[])
    for y,url in sorted(links.items(),reverse=True):
        if y in done: continue
        cached=Path(os.getenv("QUAKE_ZIPS",".cache"))/f"i{y}.zip"
        rows=parse(cached.read_bytes() if cached.exists() else get(url),y,stations)
        if not rows: raise ValueError(y)
        months=defaultdict(list)
        for r in rows: months[r["at"][:7]].append(r)
        for i in range(1,13):
            month=f"{y}-{i:02}"
            save(monthpath(month),months[month])
        done.append(y)
        save(STORE/"years.json",sorted(done))
        print(y,len(rows),flush=True)
if __name__=="__main__": run()
