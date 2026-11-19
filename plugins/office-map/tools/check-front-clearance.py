# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
"""Check native resting/pose pixels against front layers at real fixture seats. Requires Pillow."""
from pathlib import Path
import argparse, hashlib, json
from PIL import Image, ImageChops

ap = argparse.ArgumentParser()
ap.add_argument('--layout', type=Path, required=True)
ap.add_argument('--output', type=Path, required=True)
ap.add_argument('--poses', action='store_true', help='Also check carry, cheer and local wave previews')
ap.add_argument('--summary', action='store_true', help='Keep only failures and per-variant totals for many rosters')
a = ap.parse_args()
assets = Path(__file__).resolve().parents[1] / 'assets'
catalog = json.loads((assets / 'village-catalog.json').read_text())
layout = json.loads(a.layout.read_text())
cache = {}
def sprite(key):
    if key not in cache:
        e = catalog['sprites'][key]; x,y,w,h = e['rect']
        sheet = Image.open(assets / (e['atlas'] + '.png')).convert('RGBA')
        im = Image.new('RGBA', e['size']); im.paste(sheet.crop((x,y,x+w,y+h)),e['trim'][:2])
        assert hashlib.sha256(im.tobytes()).hexdigest() == e['pixelHash'], key
        cache[key] = im
    return cache[key]
checks = []; overlap_cache = {}; totals = {}; case_count = 0; maximum = 0
layouts = layout if isinstance(layout, list) else [layout]
for layout in layouts:
    for house in layout['houses']:
        front = sprite(house['style'] + '-front').getchannel('A')
        seats = [(id,layout['seats'][id]) for id in house['occupants']]
        for id,seat in seats:
            for key,e in catalog['sprites'].items():
                if not key.startswith(('stand-', 'carry-', 'cheer-', 'wave-') if a.poses else ('stand-',)): continue
                for scale in [.8,.85,.92]:
                    case_count += 1
                    totals[house['style']] = totals.get(house['style'], 0) + 1
                    cache_key = (house['style'], seat['foot']['x'] - house['x'], seat['foot']['y'] - house['y'], key, scale)
                    if cache_key in overlap_cache:
                        count = overlap_cache[cache_key]
                        maximum = max(maximum, count)
                        if count or not a.summary: checks.append({'house':house['style'],'seat':id,'look':key,'scale':scale,'frontOverlapPixels':count})
                        continue
                    im = sprite(key); im = im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.NEAREST)
                    mask = Image.new('L', front.size)
                    x = round(seat['foot']['x'] - house['x'] - e['anchor'][0]*scale)
                    y = round(seat['foot']['y'] - house['y'] - e['anchor'][1]*scale)
                    mask.paste(im.getchannel('A'), (x,y))
                    overlap = ImageChops.multiply(front,mask)
                    count = sum(value > 0 for value in overlap.tobytes()) if overlap.getbbox() else 0
                    overlap_cache[cache_key] = count; maximum = max(maximum, count)
                    if count or not a.summary: checks.append({'house':house['style'],'seat':id,'look':key,'scale':scale,'frontOverlapPixels':count})
result = {'checks':checks,'rosterCount':len(layouts),'caseCount':case_count,'uniqueRasterCases':len(overlap_cache),'casesByVariant':totals,'maximumFrontOverlapPixels':maximum}
a.output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
assert result['maximumFrontOverlapPixels'] == 0, 'A front layer masks a standing mole'
