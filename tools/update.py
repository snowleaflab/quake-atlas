"""Use JMA event IDs for live reports and page through older, non-overlapping P2P dates."""
import calendar
import hashlib
import math
import xml.etree.ElementTree as ET
from urllib.parse import urlencode
from datetime import date
from archive import *
from geography import build

FEED="https://www.data.jma.go.jp/developer/xml/feed/"
INT=dict(zip(["1","2","3","4","5-","5+","6-","6+","7"],[1,2,3,4,5,7,8,10,11]))
P2P={10:1,20:2,30:3,40:4,45:5,50:7,55:8,60:10,70:11}
def finite(value,low,high):
    try: n=float(value)
    except (TypeError,ValueError): return None
    return n if math.isfinite(n) and low<=n<=high else None

def xml_report(raw,names,stations):
    root=ET.fromstring(raw)
    for el in root.iter(): el.tag=el.tag.split("}")[-1]
    if root.findtext("Control/Status")!="通常": return None
    head=root.find("Head")
    eid=head.findtext("EventID","")
    if not re.fullmatch(r"\d{14}",eid): return None
    revision=root.findtext("Control/DateTime")
    if head.findtext("InfoType")=="取消": return {"id":eid,"rev":revision,"cancel":True}
    body=root.find("Body")
    quake=body.find("Earthquake")
    if quake is None: return None
    at=quake.findtext("OriginTime") or quake.findtext("ArrivalTime")
    area=quake.find("Hypocenter/Area")
    if area is None or not at: return None
    coords=re.findall(r"[+-]\d+(?:\.\d+)?",area.findtext("Coordinate",""))
    lat=finite(coords[0],-90,90) if len(coords)>1 else None
    lon=finite(coords[1],-180,180) if len(coords)>1 else None
    depth=finite(-float(coords[2])/1000,0,900) if len(coords)>2 else None
    obs=[]
    local={}
    for city in body.findall(".//Observation/Pref/Area/City"):
        code=city.findtext("Code","")[:5]
        if not re.fullmatch(r"\d{5}",code): continue
        local[code]=max(local.get(code,0),INT.get(city.findtext("MaxInt"),0))
        for st in city.findall("IntensityStation"):
            name=st.findtext("Name","").rstrip("＊*")
            ids=names.get(name,[])
            sid=next((i for i in reversed(ids) if stations[i][3]==code),ids[-1] if ids else "@"+name)
            obs.append([code,sid,INT.get(st.findtext("Int"),0)])
    return dict(id=eid,rev=revision,at=datetime.fromisoformat(at).astimezone(JST).replace(tzinfo=None).isoformat(),
                name=area.findtext("Name") or "震源不明",m=finite(quake.findtext("Magnitude"),-3,12),lat=lat,lon=lon,depth=depth,
                s=INT.get(body.findtext(".//Observation/MaxInt"),0),obs=obs,local=local)

def p2p_interval(start,end,geo):
    cities,stations,names=geo
    events={}
    offset=0
    while True:
        query=urlencode(dict(since_date=start.strftime("%Y%m%d"),until_date=end.strftime("%Y%m%d"),
                             limit=100,offset=offset,order=1,quake_type="DetailScale"))
        reports=json.loads(get("https://api.p2pquake.net/v2/jma/quake?"+query))
        if not isinstance(reports,list): raise ValueError("invalid P2P response")
        for r in reports:
            q=r["earthquake"]
            at=datetime.strptime(q["time"],"%Y/%m/%d %H:%M:%S")
            if not start<=at.date()<=end: continue
            h=q["hypocenter"]
            obs=[]
            for p in r.get("points",[]):
                if p["isArea"]: continue
                name=p["addr"].rstrip("＊*")
                ids=names.get(name,[])
                sid=next((i for i in reversed(ids) if cities.get(stations[i][3],"").startswith(p["pref"]+" ")),None)
                region=stations[sid][3] if sid else None
                if not region:
                    matches=[c for c,n in cities.items() if n.startswith(p["pref"]+" ") and name.startswith(n.split()[1])]
                    if matches: region=max(matches,key=lambda c:len(cities[c]))
                obs.append([region,sid or "@"+name,P2P.get(p["scale"],0)])
            key=(at.isoformat(),h["name"])
            events[key]=dict(id="p"+hashlib.sha256("|".join(key).encode()).hexdigest()[:18],at=key[0],name=h["name"],
                             m=finite(h["magnitude"],0,12),lat=finite(h["latitude"],-90,90),lon=finite(h["longitude"],-180,180),
                             depth=finite(h["depth"],0,900),s=P2P.get(q["maxScale"],0),obs=obs)
        if len(reports)<100: break
        offset+=len(reports)
        time.sleep(6.3)
    return list(events.values())

def run():
    geo=build()
    state=read(STORE/"status.json",{})
    urls=set()
    for name in ["eqvol_l.xml","eqvol.xml"]:
        feed=ET.fromstring(get(FEED+name))
        for entry in feed.findall("{*}entry"):
            url=entry.findtext("{*}id","")
            if re.fullmatch(r"https://www\.data\.jma\.go\.jp/developer/xml/data/\d{14}_\d+_VXSE53_\d+\.xml",url):
                urls.add(url)
    if not urls: raise ValueError("JMA feed contains no detail reports")
    previous=set(state.get("seen",[]))
    reports=[xml_report(get(url),geo[2],geo[1]) for url in sorted(urls-previous)]
    reports=[r for r in reports if r]
    if not state:
        first=min(r["at"][:10] for r in reports if "at" in r)
        state["cutover"]=(date.fromisoformat(first)+timedelta(days=1)).isoformat()
    cut=date.fromisoformat(state["cutover"])
    months={}
    def bucket(m):
        if m not in months: months[m]={r["id"]:r for r in read(monthpath(m),[])}
        return months[m]
    for r in reports:
        oldmonth=r["id"][:4]+"-"+r["id"][4:6]
        old=bucket(oldmonth).get(r["id"])
        if old and old["rev"]>=r["rev"]: continue
        bucket(oldmonth).pop(r["id"],None)
        if not r.get("cancel") and r["at"][:10]>=state["cutover"] and r["s"]:
            bucket(r["at"][:7])[r["id"]]=r
    for m,rows in months.items(): save(monthpath(m),list(rows.values()))
    # Archive backfill progresses one calendar month per run; first run covers both comparison windows.
    years=read(STORE/"years.json",[])
    lower=date(max(years,default=2024)+1,1,1)
    end=date.fromisoformat(state.get("bridgeFrom",cut.isoformat()))-timedelta(days=1)
    if end>=lower:
        start=max(lower,end.replace(day=1) if "bridgeFrom" in state else end-timedelta(days=65))
        rows=p2p_interval(start,end,geo)
        for r in rows: bucket(r["at"][:7])[r["id"]]=r
        for m,items in months.items(): save(monthpath(m),list(items.values()))
        state["bridgeFrom"]=start.isoformat()
    now=datetime.now(JST)
    if state.get("updated"):
        last=datetime.fromisoformat(state["updated"]).date()
        earliest=min(date(int(u.split("/")[-1][:4]),int(u.split("/")[-1][4:6]),int(u.split("/")[-1][6:8])) for u in urls)
        if last+timedelta(days=1)<earliest:
            state.setdefault("gaps",[]).append([(last+timedelta(days=1)).isoformat(),earliest.isoformat()])
    state.update(updated=now.isoformat(timespec="seconds"),seen=sorted(urls))
    save(STORE/"status.json",state)
if __name__=="__main__": run()
