# Builds assets/city/thane-district.json from two OpenStreetMap (Overpass API) extracts:
#   buildings.json:  [out:json];way["building"](19.200,72.962,19.232,72.998);out geom;
#   ways.json:       [out:json];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](19.210,72.955,19.237,72.985);
#                     way["natural"="water"](19.205,72.950,19.242,72.990);way["water"](19.205,72.950,19.242,72.990););out geom;
# Usage: python3 tools/district.py buildings.json assets/city/thane-district.json 19.2235 72.9700 ways.json
# Map data © OpenStreetMap contributors, ODbL.
# OSM building footprints -> compact district for the VizClix scene.
# Output: {"unit": metres per scene unit, "c": [lat, lon], "b": [[height, seed, x, z, x, z, ...], ...]}
import json, math, sys
src, dst = sys.argv[1], sys.argv[2]
LAT, LON = float(sys.argv[3]), float(sys.argv[4]); UNIT, RMIN, RMAX = 8.0, 19.0, 74.0
M = 111320.0; ML = M * math.cos(math.radians(LAT))
d = json.load(open(src))
out = []
for e in d['elements']:
    g = e.get('geometry')
    if not g or len(g) < 4: continue
    pts = [((p['lon'] - LON) * ML / UNIT, -(p['lat'] - LAT) * M / UNIT) for p in g[:-1]]
    cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
    r = math.hypot(cx, cz)
    if r < RMIN or r > RMAX: continue
    keep = [pts[0]]
    for p in pts[1:]:
        if math.dist(p, keep[-1]) > 0.3: keep.append(p)
    if len(keep) < 3: continue
    area = abs(sum(keep[i][0] * keep[i - 1][1] - keep[i - 1][0] * keep[i][1] for i in range(len(keep)))) / 2
    if area < 0.15: continue
    seed = (e['id'] * 2654435761 % 4294967296) / 4294967296
    tags = e.get('tags', {})
    try: lv = float(tags['building:levels'])
    except (KeyError, ValueError):
        lv = 1 + 3 * seed if area < 1 else 3 + 6 * seed if area < 6 else (7 + 8 * seed if seed < 0.55 else 18 + 24 * seed)
    h = round(lv * 3.2 / UNIT, 2)
    flat = [round(v, 2) for p in keep for v in p]
    out.append([h, round(seed * 100, 2)] + flat)
json.dump({"unit": UNIT, "c": [LAT, LON], "b": out}, open(dst, 'w'), separators=(',', ':'))
print(len(out), 'buildings')

# roads (ribbon width in units) and water, from a second OSM extract when given
if len(sys.argv) > 5:
    W = {'motorway': 2.4, 'trunk': 2.2, 'primary': 1.6, 'secondary': 1.2, 'tertiary': 0.8}
    roads, water = [], []
    for e in json.load(open(sys.argv[5]))['elements']:
        g = e.get('geometry'); t = e.get('tags', {})
        if not g: continue
        pts = [((p['lon'] - LON) * ML / UNIT, -(p['lat'] - LAT) * M / UNIT) for p in g]
        if t.get('highway') in W:
            if min(math.hypot(*p) for p in pts) > 110: continue
            roads.append([W[t['highway']]] + [round(v, 2) for p in pts for v in p])
        elif len(pts) > 3 and min(math.hypot(*p) for p in pts) < 120:
            water.append([round(v, 2) for p in pts[:-1] for v in p])
    data = json.load(open(dst)); data['r'] = roads; data['w'] = water
    json.dump(data, open(dst, 'w'), separators=(',', ':'))
    print(len(roads), 'roads', len(water), 'water')
