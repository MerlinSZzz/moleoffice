// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { composeStanding, nativeStanding, LookFrames, LOOK_BITMAP_BYTES, LOOK_CACHE_FRAMES, LOOK_HEAP_BYTES, type LookData } from '../src/look-frames.ts'
import { decodeLookPng, type NativePixels } from '../src/look-png.ts'
import { identityRecipe } from '../src/look-identity.ts'
import { lookOrder } from '../src/look-order.ts'
import { standingOf, standingClothes, portraitOf, standingLooks } from '../src/appearance.ts'
import { SCENERY_TILE_BYTES } from '../src/scenery-tiles.ts'
import { SURFACE_BYTES } from '../src/render-plan.ts'
import { ATLAS_BYTES, type ArtPack } from '../src/pack.ts'
import catalog from '../assets/village-catalog.json'
import recipes from '../assets/standing-looks/recipes.json'
import expected from './fixtures/standing-looks.json'
const require = createRequire(import.meta.url), { PNG } = require('playwright-core/lib/utilsBundle')
const data = recipes as unknown as LookData, hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const png = (name: string) => new Uint8Array(readFileSync(new URL('../assets/' + name, import.meta.url)))
const originals: Uint8Array[] = [], masks = new Map<number, NativePixels>()
const sheets: Record<string, NativePixels> = {}
beforeAll(async () => {
  for (const [index, source] of data.sources.entries()) {
    const frame = catalog.sprites[source.sprite as keyof typeof catalog.sprites]
    const atlas = sheets[frame.atlas] ??= await decodeLookPng(png(frame.atlas + '.png'))
    originals[index] = nativeStanding(atlas, frame)
    if (source.mask) masks.set(index, await decodeLookPng(png('standing-looks/' + source.mask[0])))
  }
})
afterEach(() => vi.unstubAllGlobals())
it('decodes the 43 existing exact study outputs and preserves every unmasked RGBA byte, alpha and native origin', () => {
  const unique = new Set<string>()
  for (const [recipe, [index, choice]] of data.recipes.slice(0, 43).entries()) {
    const source = data.sources[index!]!, original = originals[index!]!, mask = masks.get(index!)
    const actual = composeStanding(original, mask, data, recipe), expectedRow = expected[recipe]!
    expect(source.sprite).toBe('stand-' + expectedRow.source); expect(choice).toBe(expectedRow.clothes)
    expect(lookOrder[recipe]).toBe(index! * 3 + choice!)
    expect(actual.byteLength).toBe(128 * 128 * 4); expect(hash(actual)).toBe(expectedRow.hash)
    expect(source.anchor).toEqual(expectedRow.anchor); unique.add(hash(actual))
    let alphaChanges=0,unmaskedChanges=0
    for (let y=0;y<128;y++) for(let x=0;x<128;x++) {
      const at=(y*128+x)*4, box=source.mask?.[1]
      const masked=box && mask && x>=box[0]! && x<box[2]! && y>=box[1]! && y<box[3]! && mask.data[(y-box[1]!)*mask.width+x-box[0]!]
      if(actual[at+3]!==original[at+3])alphaChanges++
      if (!masked || !choice) for(let c=0;c<4;c++) if(actual[at+c]!==original[at+c])unmaskedChanges++
    }
    expect(alphaChanges).toBe(0);expect(unmaskedChanges).toBe(0)
  }
  expect(unique.size).toBe(43)
  for(const [sheet, actual]of Object.entries(sheets)) {
    const independent=PNG.sync.read(Buffer.from(png(sheet+'.png')))
    expect(hash(actual.data)).toBe(hash(independent.data))
  }
})
it('keeps transparent and protected pixels exact and rejects approximate source RGB or missing masks', () => {
  const fixture: LookData={palettes:[[[40,50,60]]],sources:[{sprite:'stand-control',anchor:[64,110],mask:['mask',[0,0,2,1]],map:[[0x010203,0]]}],recipes:[[0,1],[0,0]]}
  const raw=new Uint8Array(128*128*4);raw.set([1,2,3,128,1,2,3,255,7,8,9,0])
  const mask={width:2,height:1,channels:1,data:new Uint8Array([255,0])}
  const actual=composeStanding(raw,mask,fixture,0)
  expect([...actual.slice(0,12)]).toEqual([40,50,60,128,1,2,3,255,7,8,9,0])
  expect(composeStanding(raw,undefined,fixture,1)).toEqual(raw)
  expect(()=>composeStanding(raw,undefined,fixture,0)).toThrow('mask')
  raw[0]=2;expect(()=>composeStanding(raw,mask,fixture,0)).toThrow('exact palette')
})
it('assigns the exact SHA-256 identity modulo43 in any read order and keeps supported saved overrides', () => {
  const made='2026-11-17 23:59:59'
  const ids=['','abc','鼹鼠🌲','x'.repeat(120),...Array.from({length:712},(_,i)=>JSON.stringify(['agent','generated-'+i]))]
  const selected=new Map(ids.map(id=>[id,standingOf(portraitOf(null),id,made)]))
  for(const id of [...ids].reverse()) {
    const expectedIndex=Number(BigInt('0x'+createHash('sha256').update(id).digest('hex'))%43n)
    expect(identityRecipe(id,43)).toBe(expectedIndex)
    expect(standingOf(portraitOf(null),id,made)).toEqual(selected.get(id))
    expect(selected.get(id)!.recipe).toBe(expectedIndex)
  }
  expect(new Set([...selected.values()].map(s=>s.recipe)).size).toBe(43)
  expect([...lookOrder].filter(v=>v%3).length).toBe(31)
  for(const lookId of ['bare','scarf','sand-apron','cocoa-vest','silver-glasses']) {
    const stored={version:2,style:'c-forest',lookId},before=structuredClone(stored),saved=standingOf(portraitOf(stored),'generated',made)
    expect(saved.source).toBe('saved-catalogue');expect(standingClothes(saved)).toBe(0);expect(stored).toEqual(before)
  }
  expect(data.sources.map(s=>s.sprite)).toEqual(standingLooks.map(s=>'stand-'+s))
})
class Canvas {
  width=1;height=1;image:Uint8Array|null=null
  getContext() { return { putImageData:(im:{data:Uint8Array})=>{this.image=im.data} } }
}
function loader(readOverride?: (url:string,signal:AbortSignal)=>Promise<Uint8Array>) {
  vi.stubGlobal('ImageData',class { constructor(public data:Uint8ClampedArray,public width:number,public height:number){} })
  const canvases:Canvas[]=[],requests:string[]=[],maskUrls=Object.fromEntries(data.sources.filter(s=>s.mask).map(s=>[s.mask![0],s.mask![0]]))
  let active=0,maximum=0
  const read=async (url:string,signal:AbortSignal)=> {requests.push(url);maximum=Math.max(maximum,++active);try {return await(readOverride?readOverride(url,signal):Promise.resolve(png(url.startsWith('village-')?url:'standing-looks/'+url)))} finally {active--} }
  const cache=new LookFrames(async()=>({data,masks:maskUrls}),read,()=>{const canvas=new Canvas();canvases.push(canvas);return canvas as unknown as HTMLCanvasElement},async(_image,frame,signal)=>{await read(frame.atlas+'.png',signal);return nativeStanding(sheets[frame.atlas]!,frame)})
  const pack={sources:{sprites:catalog.sprites,atlases:Object.fromEntries(Object.keys(catalog.atlases).map(s=>[s,s+'.png'])),dimensions:Object.fromEntries(Object.entries(catalog.atlases).map(([s,v])=>[s,v.size as [number,number]])),scenery:{},portraits:{}},images:new Map(Object.keys(catalog.atlases).map(s=>[s,{} as HTMLImageElement])),bytes:0} as ArtPack
  return {cache,pack,canvases,requests,maximum:()=>maximum}
}
it('loads sources sequentially, bounds all shared frames, evicts before allocation and releases every canvas',async()=> {
  const {cache,pack,canvases,maximum}=loader();expect(await cache.select(pack)).toBe(true);expect(maximum()).toBe(1)
  expect(cache.sourceBytes).toBeLessThan(2*1024*1024)
  for(let i=0;i<43;i++) {expect(cache.frame(i)).not.toBeNull();expect(cache.bytes).toBeLessThanOrEqual(LOOK_BITMAP_BYTES)}
  expect(canvases.filter(c=>c.width===128)).toHaveLength(LOOK_CACHE_FRAMES)
  expect(canvases).toHaveLength(LOOK_CACHE_FRAMES)
  expect(hash((cache.frame(42) as unknown as Canvas).image!)).toBe(expected[42]!.hash)
  const reused=cache.frame(42);expect(cache.frame(42)).toBe(reused)
  const calls:unknown[][]=[];cache.draw({drawImage:(...args:unknown[])=>calls.push(args)} as unknown as CanvasRenderingContext2D,42,{x:200,y:300},.82)
  const anchor=data.sources[data.recipes[42]![0]!]!.anchor
  expect(calls[0]).toEqual([reused,0,0,128,128,200-anchor[0]!*.82,300-anchor[1]!*.82,128*.82,128*.82])
  cache.release();expect(cache.bytes).toBe(0);expect(cache.sourceBytes).toBe(0);expect(cache.ready).toBe(false)
  expect(canvases.every(c=>c.width===1&&c.height===1)).toBe(true);expect(cache.frame(0)).toBeNull()
  // Three scenery caches count together, plus free-pool/nameplate allowance and decode overlap.
  expect(ATLAS_BYTES+SURFACE_BYTES+3*SCENERY_TILE_BYTES+2*1024*1024+8*1024*1024+256*160*4+2*26*26*4+16).toBeLessThanOrEqual(64*1024*1024)
  expect(LOOK_BITMAP_BYTES).toBeLessThanOrEqual(2*1024*1024);expect(LOOK_HEAP_BYTES).toBeLessThanOrEqual(8*1024*1024)
})
it('cancels a pending close/replacement and releases failed partial loads without stale refill',async()=> {
  let resolveRead:((bytes:Uint8Array)=>void)|undefined,signal:AbortSignal|undefined
  const {cache,pack,requests}=loader(async(_url,s)=>{signal=s;return await new Promise<Uint8Array>(resolve=>{resolveRead=resolve})})
  const pending=cache.select(pack);await vi.waitFor(()=>expect(requests.length).toBe(1))
  cache.release();expect(signal!.aborted).toBe(true);resolveRead!(png(requests[0]!));expect(await pending).toBe(false)
  expect(cache.ready).toBe(false);expect(cache.sourceBytes).toBe(0)
  let readCount=0
  const failed=loader(async url=>{if(++readCount===2)throw Error('generated missing source');return png(url.startsWith('village-')?url:'standing-looks/'+url)})
  expect(await failed.cache.select(failed.pack)).toBe(false);expect(readCount).toBe(2);expect(failed.cache.sourceBytes).toBe(0)
  const replacement=loader();expect(await replacement.cache.select(replacement.pack)).toBe(true);replacement.cache.frame(0)
  expect(await replacement.cache.select(replacement.pack)).toBe(true);expect(replacement.canvases[0]!.width).toBe(1);replacement.cache.release()
  let oldRead:((b:Uint8Array)=>void)|undefined,calls=0
  const overlap=loader(async url=>++calls===1?await new Promise<Uint8Array>(resolve=>{oldRead=resolve}):png(url.startsWith('village-')?url:'standing-looks/'+url))
  const old=overlap.cache.select(overlap.pack);await vi.waitFor(()=>expect(calls).toBe(1))
  const fresh=overlap.cache.select(overlap.pack);await Promise.resolve();expect(calls).toBe(1)
  oldRead!(png(overlap.requests[0]!));expect(await old).toBe(false);expect(await fresh).toBe(true)
  expect(overlap.maximum()).toBe(1);expect(overlap.cache.ready).toBe(true);overlap.cache.release()
})
