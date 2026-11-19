# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# Summarise press-census runs: python3 tools/press-summary.py <tag> <dir>, over <dir>/press-<tag>-*.json.
# Counts, per page and in total: presses, rows skipped as not under their own point, marks on the row pressed,
# marks on another drawing of the same record, marks elsewhere. Criterion B1 wants the last two at 0.
import json, glob, sys, collections
tag = sys.argv[1]
tot = collections.Counter()
rows = []
for f in sorted(glob.glob(f'{sys.argv[2]}/press-{tag}-*.json')):
    d = json.load(open(f))
    listed = d['listed']
    byi = {e['i']: e for e in listed}
    n = collections.Counter()
    for p in d['presses']:
        key = p['pressed']
        visible = p['underPoint'] == key and not p.get('skipped')
        n['presses'] += 1
        if not visible:
            n['notVisibleAtPoint'] += 1
            continue
        n['visible'] += 1
        # which listed element was pressed: same key and same text (first such)
        same = [e for e in listed if e['key'] == key]
        pressed_i = p.get('i', next((e['i'] for e in same if e['text'] == p['text']), same[0]['i'] if same else None))
        lands = p['landsOn'] or []
        if not lands or lands[0] is None:
            n['noMark'] += 1
            continue
        li = lands[0].get('i'); lk = lands[0].get('key')
        if li == pressed_i:
            n['markOnPressed'] += 1
        elif lk == key:
            n['markOnAnotherDrawingOfSameRecord'] += 1
        else:
            n['markElsewhere'] += 1
    rows.append((d['id'], dict(n), len(d['dups'])))
    tot.update(n)
for r in rows:
    print(r[0], r[1], 'dupKeys=%d' % r[2])
print('TOTAL', dict(tot))
