# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
"""Preserve generated originals; export lossless web images and verify byte budgets.
Run with Pillow and c2pa-python. This never generates or repaints an image.
"""
from pathlib import Path
import argparse, hashlib, json, shutil
from PIL import Image
import c2pa
p=argparse.ArgumentParser()
p.add_argument('--jobs',type=Path,required=True)
p.add_argument('--originals',type=Path,required=True)
p.add_argument('--exports',type=Path,required=True)
a=p.parse_args()
budget=json.loads((Path(__file__).resolve().parent / 'image-budget.json').read_text())
a.originals.mkdir(parents=True,exist_ok=True);a.exports.mkdir(parents=True,exist_ok=True)
hash_file=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
entries=[]
for job in json.loads(a.jobs.read_text()):
    source=Path(job['source']);original=a.originals/(job['id']+'.png');target=a.exports/(job['id']+'.webp')
    if original.exists() and hash_file(source)!=hash_file(original):raise RuntimeError('A different original already exists: '+str(original))
    if not original.exists():shutil.copy2(source,original)
    image=Image.open(original)
    image.save(target,format='WEBP',lossless=True,method=6)
    exported=Image.open(target).convert('RGB')
    if image.convert('RGB').tobytes()!=exported.tobytes():raise RuntimeError('Lossless export changed pixels: '+str(target))
    with c2pa.Reader(str(original)) as reader:
        credential=json.loads(reader.json());validation=reader.get_validation_results();state=reader.get_validation_state()
        credential['localValidation']={'state':state,'results':validation}
    agents=[]
    for manifest in credential.get('manifests',{}).values():
        for assertion in manifest.get('assertions',[]):
            for action in assertion.get('data',{}).get('actions',[]):
                if action.get('softwareAgent'):agents.append(action['softwareAgent'])
    (a.originals/(job['id']+'-c2pa.json')).write_text(json.dumps(credential,ensure_ascii=False,indent=2))
    entries.append({'id':job['id'],'prompt':job['prompt'],'method':job['method'],'returnedModel':job['returnedModel'],
        'contentCredential':{'softwareAgents':agents,'localValidationState':state,'signatureAndPixelsChecked':validation,
          'note':'The credential declares gpt-image version 2.0. The reader checks the signature and image hash. Its local trust store does not trust the signing certificate; this is not a claim of trust-list verification.'},
        'original':{'file':original.name,'sha256':hash_file(original),'bytes':original.stat().st_size,'width':image.width,'height':image.height},
        'export':{'file':target.name,'sha256':hash_file(target),'bytes':target.stat().st_size,'pixelIdentical':True,'format':'lossless WebP'}})
original_files=[x for x in a.originals.rglob('*') if x.is_file() and x.suffix.lower() in ['.png','.jpg','.jpeg','.webp']]
export_files=[x for x in a.exports.rglob('*') if x.is_file() and x.suffix.lower() in ['.png','.jpg','.jpeg','.webp','.avif','.gif','.svg']]
original_bytes=sum(x.stat().st_size for x in original_files);export_bytes=sum(x.stat().st_size for x in export_files)
if not entries:raise RuntimeError('No images were exported.')
if original_bytes>budget['originalImages']:raise RuntimeError('Original image budget exceeded.')
if export_bytes>budget['gitImages']:raise RuntimeError('Git image budget exceeded.')
manifest={'version':1,'originalsLocalDirectory':str(a.originals),'limits':budget,'bytes':{'gitImages':export_bytes,'originalImages':original_bytes},'entries':entries}
(a.exports/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(a.originals/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'images':len(entries),'gitBytes':export_bytes,'originalBytes':original_bytes}))
