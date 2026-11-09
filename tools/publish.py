"""Build static monthly lists, detail buckets and regional daily histograms."""
from collections import defaultdict, Counter
from archive import *
from geography import build

OUT=Path("public/data")
def run():
    cities,stations,_=build()
    save(OUT/"cities.json",cities)
    save(OUT/"stations.json.gz",{k:v[:3] for k,v in stations.items()})
    hist=defaultdict(lambda:defaultdict(Counter))
    timelines=defaultdict(list)
    months=[]
    for path in sorted(STORE.glob("????-??.json.gz")):
        month=path.name[:7]
        events=sorted(read(path),key=lambda r:(r["at"],r["id"]),reverse=True)
        summary=[]
        details=defaultdict(dict)
        for i,r in enumerate(events):
            local=dict(r.get("local",{}))
            for city,_,scale in r["obs"]:
                if city: local[city]=max(scale,local.get(city,0))
            # Split map details independently of the front-page list.
            block=str(i//32)
            details[block][r["id"]]=r["obs"]
            row={k:r[k] for k in ["at","id","name","depth","m","s","lat","lon"]}
            row.update(local=local,block=block)
            summary.append(row)
            for code,scale in [("all",r["s"]),*local.items()]:
                if scale:
                    hist[code][r["at"][:10]][scale]+=1
                    timelines[code].append([r["at"],scale,r["id"]])
        save(OUT/"months"/(month+".json.gz"),summary)
        for block,obs in details.items(): save(OUT/"map"/month/(block+".json.gz"),obs)
        months.append(month)
    for code,dates in hist.items():
        save(OUT/"counts"/(code+".json.gz"),dates)
        save(OUT/"timeline"/(code+".json.gz"),sorted(timelines[code]))
    status=read(STORE/"status.json",{})
    save(OUT/"index.json",dict(months=months,counts=list(hist),years=read(STORE/"years.json",[]),
                               **{k:v for k,v in status.items() if k!="seen"}))
if __name__=="__main__": run()
