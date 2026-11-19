// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect,it } from 'vitest'
import { readFileSync } from 'node:fs'
import { decodeLookPng } from '../src/look-png.ts'
import { actionSourceVersion } from '../src/action-packs.ts'
import { TUFT_ACTION_VERSION } from '../src/action-version.ts'
import { canonicalFrame,stageAt, type FacilityAction } from '../src/action-data.ts'
import { composeAction,actionCompositionKey } from '../src/action-compose.ts'
import { data,reference,source,png,hash } from './tuft-action-fixture.ts'
it('retains all seven exact accepted bodies and only region-pinned clothing masks',async()=>{
  let encoded=0,decoded=0
  for(const [key,body] of Object.entries(data.sources)) {
    const expected=reference.bodies[key],file=readFileSync(new URL('../assets/tuft-action-'+key+'.png',import.meta.url)),raw=source(key)
    encoded+=file.length;decoded+=raw.data.length
    expect(hash(file)).toBe(expected.sha256);expect(hash(raw.data)).toBe(expected.rgbaSHA256)
    expect([raw.width,raw.height]).toEqual([expected.width,expected.height])
    const mask=await decodeLookPng(Buffer.from(body.mask.split(',')[1]!,'base64')),exact=new Uint8Array(raw.width*raw.height)
    for(const [y,left,right,label] of expected.clothingRuns) { expect([3,4]).toContain(label);exact.fill(255,y*raw.width+left,y*raw.width+right) }
    expect(mask.channels).toBe(1);expect(mask.data).toEqual(exact)
  }
  expect(encoded).toBe(49406);expect(decoded).toBe(475136);expect(actionSourceVersion(data)).toBe(TUFT_ACTION_VERSION)
  for(const edit of [(d:typeof data)=>{d.cuts[0]=83},(d:typeof data)=>{d.pawPixels.c1![0]![0]!++},(d:typeof data)=>{d.sources.c1!.mask+='x'},(d:typeof data)=>{d.objects.book!.url+='x'},(d:typeof data)=>{d.composition.pinPosition[0]!++}]) { const changed=structuredClone(data);edit(changed);expect(actionSourceVersion(changed)).not.toBe(TUFT_ACTION_VERSION) }
})
it('retains the complete timeline, original cuts, upright book and exact contact transforms',()=>{
  expect(data.stages.map(s=>[s.first,s.last,s.source,s.origin,s.state,s.vignette,s.pinned,s.object])).toEqual(reference.stages.map((s:any)=>[s.first,s.last,s.source,s.origin,s.state,s.vignette,s.pinned,s.object ? {kind:s.object.kind,position:s.object.position}:null]))
  const seated=Array.from({length:36},(_,i)=>stageAt(data,84+i)!);expect(new Set(seated.map(s=>actionCompositionKey(data,s))).size).toBe(1)
  expect(stageAt(data,83)?.source).toBe('p2');expect(stageAt(data,84)?.source).toBe('seated');expect(stageAt(data,119)?.source).toBe('seated');expect(stageAt(data,120)?.source).toBe('p2')
  const covered=new Set<number>()
  for(const action of ['pickup','desk','putdown','garden'] as FacilityAction[]) for(let f=0;f<(action==='desk'?84:60);f++) covered.add(canonicalFrame(action,(f+.01)*1000/30).index)
  expect([...covered].sort((a,b)=>a-b)).toEqual(Array.from({length:264},(_,i)=>i))
  expect(canonicalFrame('desk',999999)).toEqual({index:143,terminal:true});expect(canonicalFrame('putdown',999999)).toEqual({index:203,terminal:true})
  const objects=new Map(Object.entries(data.objects).map(([key,o])=>[key,png(Buffer.from(o.url.split(',')[1]!,'base64'))]))
  let opaquePaws=0,transparentOverBook=0
  for(const stage of data.stages.filter(s=>s.source!=='stand')) { const body=source(stage.source),copy=body.data.slice(),output=composeAction(data,stage,body,objects);expect(body.data).toEqual(copy);expect(output.length).toBe(copy.length)
    // The canonical original paw and body pixels outside object contact remain byte-identical.
    for(const [x,y] of data.pawPixels[stage.source]??[]) if(stage.vignette!=='board' && data.composition.bookPositions[stage.state]) {
      const at=(y!*body.width+x!)*4
      if(copy[at+3]===255) { opaquePaws++;expect(output.slice(at,at+4)).toEqual(copy.slice(at,at+4)) }
      else if(copy[at+3]===0) { const book=objects.get('book')!,bp=data.composition.bookPositions[stage.state]!,bx=x!+stage.origin[0]!-data.composition.originalWholePoseOrigin[0]!-bp[0]!,by=y!+stage.origin[1]!-data.composition.originalWholePoseOrigin[1]!-bp[1]!,from=(by*book.width+bx)*4
        if(bx>=0&&bx<book.width&&by>=0&&by<book.height&&book.data[from+3]===255) { transparentOverBook++;expect(output.slice(at,at+4)).toEqual(book.data.slice(from,from+4)) }
      }
    }
  }
  expect(opaquePaws).toBeGreaterThan(0);expect(transparentOverBook).toBeGreaterThan(0)
})
