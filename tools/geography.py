"""Resolve historical station positions against the bundled municipal boundaries."""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

GEO = Path("public/geo")

def inside(ring, x, y):
    result = False
    a, b = ring[-1]
    for c, d in ring:
        if (b > y) != (d > y) and x < (c-a)*(y-b)/(d-b)+a:
            result = not result
        a, b = c, d
    return result

def boundaries():
    topo = json.loads((GEO / "cities.json").read_text())
    scale = topo["transform"]["scale"]
    offset = topo["transform"]["translate"]
    arcs = []
    for deltas in topo["arcs"]:
        x = y = 0
        line = []
        for dx, dy in deltas:
            x += dx
            y += dy
            line.append([x*scale[0]+offset[0], y*scale[1]+offset[1]])
        arcs.append(line)
    cells = defaultdict(list)
    cities = {}
    for item in next(iter(topo["objects"].values()))["geometries"]:
        props = item["properties"]
        code = props.get("N03_007")
        if not code:
            continue
        city = props["N03_004"]
        parent = props.get("N03_003") or ""
        cities[code] = props["N03_001"]+" "+(parent if city.endswith("区") else "")+city
        polygons = item["arcs"] if item["type"] == "MultiPolygon" else [item["arcs"]]
        for polygon in polygons:
            rings = []
            for ring in polygon:
                coords = []
                for i in ring:
                    seg = arcs[i] if i>=0 else arcs[~i][::-1]
                    coords.extend(seg[:-1])
                rings.append(coords)
            if not rings[0]: continue
            xs, ys = zip(*rings[0])
            for x in range(int(min(xs)), int(max(xs))+1):
                for y in range(int(min(ys)), int(max(ys))+1):
                    cells[x,y].append((code,rings))
    return cities,cells

def build():
    cities, cells = boundaries()
    stations = {}
    names = defaultdict(list)
    for row in csv.reader(Path("tools/stations.csv").open()):
        if not row[0].isdigit() or not row[2] or not row[3]: continue
        code, name = row[:2]
        y, x = map(float,row[2:4])
        region = next((c for c,rings in cells[int(x),int(y)] if inside(rings[0],x,y)
                       and not any(inside(r,x,y) for r in rings[1:])),None)
        # Prefer the unambiguous municipal name when coarse/rounded geometry falls across a border.
        if region:
            pref = cities[region].split()[0]
            matches = [c for c,n in cities.items() if n.startswith(pref+" ") and name.startswith(n.split()[1])]
            if matches: region = max(matches,key=lambda c:len(cities[c]))
        stations[code]=[name,y,x,region]
        names[re.sub("[＊*]","",name)].append(code)
    return cities,stations,names
