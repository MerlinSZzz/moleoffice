# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
"""Pack the reviewed native PNGs without changing a pixel. Requires Pillow.
Run with --source <review-art-root> --output <folder>; no source archive ships.
"""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--source', type=Path, required=True)
ap.add_argument('--output', type=Path, required=True)
a = ap.parse_args(); a.output.mkdir(parents=True, exist_ok=True)
entries = {}; houses = {}
def add(key, relative):
    p = a.source / relative; im = Image.open(p).convert('RGBA')
    trim = im.getbbox() or (0, 0, *im.size)
    cropped = im.crop(trim)
    restored = Image.new('RGBA', im.size); restored.paste(cropped, trim[:2])
    # Preserve even invisible RGB cells when the native file carries them.
    if restored.tobytes() != im.tobytes(): trim = (0, 0, *im.size); cropped = im
    entries[key] = {'source': relative, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
                    'pixelHash': hashlib.sha256(im.tobytes()).hexdigest(), 'size': list(im.size),
                    'trim': list(trim), 'image': cropped, 'anchor': [im.width // 2, im.height - 1]}
    return entries[key]
for family, folder, stem in [('A', 'round7a-batch-a', 'a'), ('B', 'round7b-batch-b', 'B')]:
    # Only houses used by the size-matched runtime pools. Long houses grow in the
    # existing outward lanes; their own supplied desk slots determine capacity.
    for n in ([1, 2, 3, 4] if family == 'A' else [1, 2, 3, 4, 6]):
        key = f'{family}{n:02}'; prefix = f'{folder}/sprites/{stem}{n:02}'
        meta = json.loads((a.source / (prefix + '.json')).read_text())
        openings = meta['walkableOpenings']
        openings = [o['polygon'] if isinstance(o, dict) else o for o in openings]
        houses[key] = {k: meta[k] for k in ['canvasSize', 'groundAnchor', 'collisionPolygons', 'walkableAreas', 'hitArea', 'floorBounds', 'deskSlots']}
        houses[key]['openings'] = [p for p in openings if max(v[1] for v in p) == meta['canvasSize'][1]]
        houses[key]['layers'] = []
        houses[key]['metadataSource'] = prefix + '.json'
        houses[key]['metadataSha256'] = hashlib.sha256((a.source / (prefix + '.json')).read_bytes()).hexdigest()
        for layer in meta['layers']:
            suffix = Path(layer['file']).stem.split('-', 1)[1]
            draw_layer = 'floor' if suffix == 'floor' else 'front' if suffix == 'front' else 'object' if suffix == 'partition' else 'back'
            anchor = layer.get('groundAnchor', meta['groundAnchor'])
            sprite = key + '-' + suffix
            add(sprite, prefix + '-' + suffix + '.png')['anchor'] = anchor
            houses[key]['layers'].append({'sprite': sprite, 'layer': draw_layer, 'anchor': anchor, 'depth': layer.get('depthSortY')})
    for n in ([27, 28, 29, 30, 32, 33, 42, 46, 56, 57, 58, 62, 63, 65] if family == 'A' else [27, 28, 29, 30, 32, 33, 38, 40, 42, 43, 48, 52, 54, 56, 57, 59, 60, 61, 64, 65]):
        key=f'{family}{n:02}'; prefix=f'{folder}/sprites/{stem}{n:02}'
        meta=json.loads((a.source/(prefix+'.json')).read_text()); e=add(key,prefix+'.png'); e['anchor']=meta['groundAnchor']
        e['collision']=meta.get('collisionPolygons',[]); e['hitArea']=meta['hitArea']; e['layer']=meta.get('drawOrderLayer',meta.get('drawOrder','object'))
for name in ['grass-0','earth-0','worker-desk','desk-lamp','desk-plant','bookshelf','tea-table','tea-set','stool-sw','stool-se','message-board','tree-assembled','ground-fern','daisies','lantern']:
    add(name, f'round2e/sprites/{name}-runtime.png')
for n,name in [(1,'open-laptop'),(2,'coffee-mug'),(3,'paper-stack'),(10,'log-seat-a'),(14,'kettle-stand'),(21,'mushroom-cluster'),(22,'berry-bush'),(23,'pine-tree'),(24,'tree-stump')]:
    add(name,f'round5a-woodland-pack2/sprites/{n:02}-{name}-runtime.png')
names=['tuft','fringe','bun','fan','crest','helmet','waves','part','beret','knit','raincoat','apron','bowtie','backpack','roll','flower']
for n,name in enumerate(names,1):
    source='round3o-side-stride/sprites/stand.png' if n==1 else f'round4-feet-a/sprites/{n:02}-{name}-standing.png' if n<=9 else f'round4-feet-b/sprites/{n:02}-{name}/standing.png'
    e=add('stand-'+name,source); im=Image.open(a.source/source).convert('RGBA'); bounds=im.getbbox(); e['anchor']=[64,bounds[3]-1]
    # The reviewed gait is registered on a shared canvas. Never recenter each drawing's bounds:
    # that would undo the even head travel. All actions retain the standing origin and scale.
    stem=f'{n:02}-{name}'
    if n==1: folder='round3o-side-stride/sprites'; files=['S1-A','pass','S1-B']
    elif n==2: folder='round4s-stride-a/sprites'; files=[stem+'-A',stem+'-pass',stem+'-B']
    elif n<=9: folder='round4s-stride-a/registered/sprites'; files=[stem+'-A',stem+'-pass',stem+'-B']
    elif n in [11,12]: folder=f'round4s-stride-b/registered/work/{stem}/sprites'; files=['S1-A','pass','S1-B']
    elif n==16: folder=f'round4s-stride-b/fix/work/{stem}/sprites'; files=['S1-A','pass','S1-B']
    else: folder=f'round4s-stride-b/sprites/{stem}'; files=['A','pass','B']
    for action,file in zip(['A','pass','B'],files): add(f'walk-{name}-{action}',folder+'/'+file+'.png')['anchor']=e['anchor'][:]
    for pose in ['carry','cheer','wave']:
        source=f'round5b-poses-a/sprites/{stem}-{pose}.png' if n<=8 else f'round5b-poses-b/sprites/{stem}/{pose}.png'
        add(pose+'-'+name,source)['anchor']=e['anchor'][:]
# Deterministic shelf packing; 1024-square maximum keeps each decode at most 4 MiB.
bins=[]
for key,e in sorted(entries.items(),key=lambda kv:(-kv[1]['image'].height,-kv[1]['image'].width,kv[0])):
    im=e['image']; placed=False
    for b in bins:
        for shelf in b['shelves']:
            if im.height <= shelf['height'] and shelf['x']+im.width+2 <= 1024:
                e['rect']=[shelf['x'],shelf['y'],im.width,im.height]; shelf['x']+=im.width+2; placed=True; break
        if not placed and b['height']+im.height+2<=1024:
            shelf={'x':im.width+4,'y':b['height']+1,'height':im.height+2}; b['shelves'].append(shelf); e['rect']=[2,shelf['y'],im.width,im.height]; b['height']+=im.height+2; placed=True
        if placed: e['atlas']=b['id']; b['keys'].append(key); break
    if not placed:
        b={'id':f'village-{len(bins)}','height':im.height+2,'shelves':[{'x':im.width+4,'y':1,'height':im.height+2}],'keys':[key]}; bins.append(b); e['atlas']=b['id']; e['rect']=[2,1,im.width,im.height]
atlases={}
for b in bins:
    width=max(entries[k]['rect'][0]+entries[k]['rect'][2]+1 for k in b['keys']); height=b['height']
    atlas=Image.new('RGBA',(width,height))
    for k in b['keys']: atlas.paste(entries[k]['image'],entries[k]['rect'][:2])
    path=a.output/(b['id']+'.png'); atlas.save(path,optimize=True)
    atlases[b['id']]={'size':[width,height],'bytes':path.stat().st_size,'decodedBytes':width*height*4,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    for k in b['keys']:
        e=entries[k]; x,y,w,h=e['rect']; restored=Image.new('RGBA',e['size']); restored.paste(atlas.crop((x,y,x+w,y+h)),e['trim'][:2])
        assert hashlib.sha256(restored.tobytes()).hexdigest()==e['pixelHash'],k
for e in entries.values(): del e['image']
catalog={'format':1,'atlases':atlases,'sprites':entries,'houses':houses,'packing':'Native RGBA pixels, no resampling, reversible transparent-margin crop; exact full-canvas pixel hashes verified.'}
(a.output/'village-catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
print(json.dumps({'sprites':len(entries),'atlases':len(bins),'fileBytes':sum(e['bytes'] for e in atlases.values()),'decodedBytes':sum(e['decodedBytes'] for e in atlases.values()),'maxDecodeBytes':max(e['decodedBytes'] for e in atlases.values())},indent=2))
