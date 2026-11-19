# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
"""Export adopted atlas cells. Raw imagegen outputs stay outside Git. No invented transparency provenance."""
import argparse,json,hashlib
from pathlib import Path
from PIL import Image
import numpy as np
p=argparse.ArgumentParser();p.add_argument("raw",type=Path);p.add_argument("out",type=Path);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
colours={"slate":(82,91,112),"cocoa":(112,82,72),"chestnut":(150,101,69),"sand":(172,143,99),"silver":(152,164,170),"cream":(198,184,153)}
entries=[]
for name,rows,names in [("heads",2,["neutral","happy","curious","focused","sleepy","surprised","side","back"]),("environment",3,["tree","pine","mushrooms","boulder","crystals","lantern","arch","pond","window","plant","bookcase","sofa"])]:
 source=a.raw/(name+".png");original=Image.open(source);im=original.convert("RGBA");pixels=np.array(im)
 if original.mode!="RGBA":
  # The character atlas intentionally used a magenta key; this is local key removal, not generated alpha.
  key=(pixels[:,:,0]>150)&(pixels[:,:,2]>150)&(pixels[:,:,1]<100)&((pixels[:,:,0].astype(int)-pixels[:,:,1])>80)
  pixels[key,3]=0;im=Image.fromarray(pixels)
 cells=[]
 for i,label in enumerate(names):
  box=(round(i%4*im.width/4),round(i//4*im.height/rows),round((i%4+1)*im.width/4),round((i//4+1)*im.height/rows))
  # The generated window extends past the nominal first column. Its plant neighbour starts at x=420.
  if name=="environment" and i==8:box=(0,724,420,1086)
  if name=="environment" and i==9:box=(420,724,724,1086)
  cell=im.crop(box);bounds=cell.getbbox()
  if bounds is None:raise RuntimeError(f"Empty cell {label}")
  cells.append((label,cell.crop(bounds)))
 if name=="heads":
  factor=56/max(c.width for _,c in cells)
  atlas=Image.new("RGBA",(64*8,64*len(colours)))
  for fy,(fur,target) in enumerate(colours.items()):
   for ix,(label,cell) in enumerate(cells):
    pix=np.array(cell);r,g,b=[pix[:,:,k].astype(float) for k in range(3)]
    mask=(pix[:,:,3]>0)&(r>30)&(r<170)&(b>r*1.025)&(abs(g-r)<35)
    light=(.2126*r+.7152*g+.0722*b)/88
    if fur!="slate":
     for k in range(3):pix[:,:,k][mask]=np.clip(target[k]*light[mask],0,255).astype("uint8")
    cell=Image.fromarray(pix).resize((round(cell.width*factor),round(cell.height*factor)),Image.Resampling.NEAREST)
    atlas.alpha_composite(cell,(ix*64+(64-cell.width)//2,fy*64+56-cell.height))
  atlas.save(a.out/"heads.webp",lossless=True,exact=True)
  entries.append({"id":name,"sourceSHA256":hashlib.sha256(source.read_bytes()).hexdigest(),"alpha":"local magenta-key removal","frame":[64,64],"columns":names,"rows":list(colours)})
 else:
  atlas=Image.new("RGBA",(4*128,3*128))
  for i,(label,cell) in enumerate(cells):
   factor=min(120/cell.width,120/cell.height)
   cell=cell.resize((round(cell.width*factor),round(cell.height*factor)),Image.Resampling.NEAREST)
   atlas.alpha_composite(cell,((i%4)*128+(128-cell.width)//2,(i//4)*128+124-cell.height))
  atlas.save(a.out/"environment.webp",lossless=True,exact=True)
  entries.append({"id":name,"sourceSHA256":hashlib.sha256(source.read_bytes()).hexdigest(),"alpha":"generated RGBA preserved","extraction":"4x3 cells, with third-row window/plant boundary at source x=420","frame":[128,128],"cells":names})
for entry in entries:
 f=a.out/(entry["id"]+".webp");entry["bytes"]=f.stat().st_size;entry["sha256"]=hashlib.sha256(f.read_bytes()).hexdigest()
(a.out/"manifest.json").write_text(json.dumps({"method":"Imagegen source atlases; local cell extraction, nearest-neighbour sizing and requested fur-colour variants.","entries":entries},indent=2)+"\n")
print([(e["id"],e["bytes"]) for e in entries])
