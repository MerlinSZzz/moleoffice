// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach,expect,it,vi } from 'vitest'
import { DecodeOwner,Compositions } from '../src/action-resources.ts'
import { OwnedBuild } from '../src/owned-build.ts'
import { ActionPacks,actionSourceVersion } from '../src/action-packs.ts'
import { ActionFormatError,ActionTransportError } from '../src/action-data.ts'
import { data,source,readPixels,deferred,flush } from './tuft-action-fixture.ts'
import type { NativePixels } from '../src/look-png.ts'
import { readActionImage } from '../src/action-pixels.ts'
import { PageIntents,workIntent } from '../src/action-intent.ts'
import type { WorkRow } from '../src/model.ts'
import { createHash } from 'node:crypto'
afterEach(()=>vi.unstubAllGlobals())
it('has one actual decoder, cancels queued work promptly and waits for a nonabortable active decoder',async()=>{
  const owner=new DecodeOwner(),gate=deferred<number>(),abort=new AbortController();let active=0,max=0,second=false
  const first=owner.run('native',async()=>{max=Math.max(max,++active);try{return await gate.promise}finally{active--}},abort.signal)
  const next=owner.run('look',async()=>{second=true;max=Math.max(max,++active);active--;return 2})
  const queuedAbort=new AbortController(),queued=owner.run('cancelled',async()=>{throw Error('must not start')},queuedAbort.signal);const rejected=expect(queued).rejects.toThrow('cancelled')
  queuedAbort.abort();await rejected;abort.abort();await flush();expect(second).toBe(false);expect(active).toBe(1)
  gate.resolve(1);expect(await first).toBe(1);expect(await next).toBe(2);await flush();expect(max).toBe(1);expect(owner.snapshot()).toMatchObject({active:0,queued:0,maximum:1})
})
it('releases a throwing sliced materializer without releasing a following owners lease',async()=>{
  const owner=new DecodeOwner(),build=new OwnedBuild<void>(owner),turns:(()=>void)[]=[]
  Object.assign(build,{later:(fn:()=>void)=>{turns.push(fn);return 1},clear:()=>{}})
  build.start((function*(){yield;throw Error('generated materializer failure')})(),()=>{})
  const gate=deferred<void>(),next=owner.run('next',()=>gate.promise)
  expect(()=>turns.shift()!()).toThrow('generated materializer failure');await flush();expect(owner.snapshot()).toMatchObject({active:1,kind:'next'})
  build.cancel();expect(owner.snapshot().active).toBe(1);gate.resolve();await next;await flush();expect(owner.snapshot().active).toBe(0)
})
it('reserves two identities including cancelled pending imports and accounts stale persistent metadata',async()=>{
  const a=deferred<typeof data>(),b=deferred<typeof data>(),c=vi.fn(async()=>data),cache=new Compositions(),owner=new DecodeOwner()
  const packs=new ActionPacks(new Map([['a',{version:'a',load:()=>a.promise}],['b',{version:'b',load:()=>b.promise}],['c',{version:'c',load:c}]]),cache,()=>{},owner,readPixels)
  packs.setNeeds(['a','b','c']);expect(packs.snapshot().slots).toHaveLength(2);packs.setNeeds(['c']);expect(c).not.toHaveBeenCalled();expect(packs.snapshot().slots).toHaveLength(2)
  a.resolve(data);b.resolve(data);await vi.waitFor(()=>expect(packs.snapshot().slots).toHaveLength(0));expect(c).toHaveBeenCalledTimes(1);expect(packs.snapshot().persistentMetadataBytes).toBeGreaterThan(0);packs.dispose()
})
it('loads exact sources sequentially below target and permanently rejects malformed pixels; only renewed transport retries',async()=>{
  const owner=new DecodeOwner(),registry=new Map([['tuft',{version:actionSourceVersion(data),load:async()=>data}]]),cache=new Compositions();let active=0,max=0
  const packs=new ActionPacks(registry,cache,()=>{},owner,async(...args)=>{max=Math.max(max,++active);try{return await readPixels(args[0])}finally{active--}})
  packs.setNeeds(['tuft']);await vi.waitFor(()=>expect(packs.resident('tuft')).not.toBeNull());expect(max).toBe(1);expect(packs.resident('tuft')!.bytes).toBeLessThanOrEqual(768*1024);packs.dispose()
  let now=0;const load=vi.fn(async()=>{throw new ActionTransportError('generated missing')});const failed=new ActionPacks(new Map([['tuft',{version:'failure',load}]]),cache,()=>{},owner,readPixels,()=>now)
  failed.setNeeds(['tuft']);await vi.waitFor(()=>expect(failed.snapshot().slots).toHaveLength(0));failed.setNeeds(['tuft']);now=2000;failed.setNeeds(['tuft']);expect(load).toHaveBeenCalledTimes(1)
  failed.setNeeds([]);failed.setNeeds(['tuft']);await vi.waitFor(()=>expect(load).toHaveBeenCalledTimes(2));now=5000;failed.setNeeds([]);failed.setNeeds(['tuft']);await flush();expect(load).toHaveBeenCalledTimes(2);failed.dispose()
  const malformed=vi.fn(async()=>{throw new ActionFormatError('dimensions')});const permanent=new ActionPacks(new Map([['tuft',{version:'bad',load:malformed}]]),cache,()=>{},owner,readPixels,()=>now);permanent.setNeeds(['tuft']);await vi.waitFor(()=>expect(permanent.snapshot().slots).toHaveLength(0));now+=2000;permanent.setNeeds([]);permanent.setNeeds(['tuft']);await flush();expect(malformed).toHaveBeenCalledTimes(1);expect(permanent.snapshot().attempts[0]?.permanent).toBe(true);permanent.dispose()
})
it('bounds the combined standing and action output cache to eight and clears identity derivatives on eviction',()=>{
  const canvases:any[]=[];vi.stubGlobal('ImageData',class{constructor(public data:Uint8ClampedArray,public width:number,public height:number){}})
  const cache=new Compositions(()=>{const c={width:0,height:0,getContext:()=>({putImageData:()=>{}})};canvases.push(c);return c as unknown as HTMLCanvasElement})
  for(let i=0;i<43;i++)cache.put('standing:'+i,new Uint8Array(128*128*4),128,128)
  for(let i=0;i<14;i++)cache.put('action:'+i,new Uint8Array(160*128*4),160,128,'tuft')
  expect(canvases).toHaveLength(8);expect(cache.snapshot().count).toBe(8);cache.dropIdentity('tuft');expect(cache.snapshot().count).toBe(0);expect(canvases.every(c=>c.width===1&&c.height===1)).toBe(true)
})
it('discards a cancelled valid-source decode before further reads or publication',async()=>{
  let reads=0;const gate=deferred<NativePixels>(),read=vi.fn(async(url:string):Promise<NativePixels>=>++reads===1?await gate.promise:readPixels(url)),owner=new DecodeOwner(),cache=new Compositions()
  const packs=new ActionPacks(new Map([['tuft',{version:actionSourceVersion(data),load:async()=>data}]]),cache,()=>{},owner,read)
  packs.setNeeds(['tuft']);await vi.waitFor(()=>expect(read).toHaveBeenCalledTimes(1));packs.setNeeds([])
  expect(packs.snapshot().slots).toHaveLength(1);expect(packs.resident('tuft')).toBeNull();gate.resolve(source('r1'))
  await vi.waitFor(()=>expect(packs.snapshot().slots).toHaveLength(0));expect(read).toHaveBeenCalledTimes(1);expect(packs.resident('tuft')).toBeNull();expect(owner.snapshot().active).toBe(0);packs.dispose()
})
it('releases retained resident buffers and identity canvases when demand withdraws',async()=>{
  vi.stubGlobal('ImageData',class{constructor(public data:Uint8ClampedArray,public width:number,public height:number){}})
  const cache=new Compositions(()=>({width:0,height:0,getContext:()=>({putImageData:()=>{}})}) as unknown as HTMLCanvasElement),packs=new ActionPacks(new Map([['tuft',{version:actionSourceVersion(data),load:async()=>data}]]),cache,()=>{},new DecodeOwner(),readPixels)
  packs.setNeeds(['tuft']);await vi.waitFor(()=>expect(packs.resident('tuft')).not.toBeNull());const retired=packs.resident('tuft')!,entry=cache.put('derived',new Uint8Array(4),1,1,'tuft')!
  entry.canvas.width=2;entry.canvas.height=2;packs.setNeeds([])
  expect(packs.snapshot().slots).toHaveLength(0);expect(retired.sources.size).toBe(0);expect(retired.masks.size).toBe(0);expect(retired.objects.size).toBe(0);expect(retired.bytes).toBe(0);expect(cache.snapshot().count).toBe(0);expect(entry.canvas.width).toBe(1);expect(entry.canvas.height).toBe(1);expect(entry.pixels.byteLength).toBe(0);packs.dispose()
})
it('retains the action image URL and owner until a started decode settles after cancellation',async()=>{
  const decode=deferred<void>(),started=deferred<void>(),images:GeneratedImage[]=[];let active=0,maximum=0,nextStarted=false
  class GeneratedImage {
    naturalWidth=128;naturalHeight=128;crossOrigin='';decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;private url=''
    constructor(){images.push(this)}
    get src(){return this.url};set src(value:string){this.url=value;if(value)queueMicrotask(()=>this.onload?.())}
    async decode(){maximum=Math.max(maximum,++active);started.resolve();try{await decode.promise}finally{active--}}
  }
  vi.stubGlobal('Image',GeneratedImage);const owner=new DecodeOwner(),abort=new AbortController(),pending=owner.run('action image',()=>readActionImage('generated-url',128,128,abort.signal,()=>!abort.signal.aborted),abort.signal),rejected=expect(pending).rejects.toThrow('cancelled')
  await started.promise;const next=owner.run('replacement',async()=>{nextStarted=true;maximum=Math.max(maximum,++active);active--;return true});abort.abort();await flush()
  try { expect(images[0]!.src).toBe('generated-url');expect(nextStarted).toBe(false);expect(owner.snapshot().active).toBe(1) }
  finally { decode.resolve();await rejected;await next;await flush() }
  expect(images[0]!.src).toBe('');expect(maximum).toBe(1);expect(owner.snapshot().active).toBe(0)
})
it('permanently rejects malformed or forbidden body URLs before image reads or retry',async()=>{
  for(const url of ['http://[','%zz','data:image/png;base64,AAAA','javascript:void(0)','blob:https://action.invalid/generated','','bad\npath','bad%0apath']) {
    let now=0;const altered=structuredClone(data);altered.sources.r1!.url=url
    const load=vi.fn(async()=>altered),read=vi.fn(async()=>{throw new ActionTransportError('must not read malformed URL')}),packs=new ActionPacks(new Map([['tuft',{version:actionSourceVersion(altered),load}]]),new Compositions(),()=>{},new DecodeOwner(),read,()=>now)
    packs.setNeeds(['tuft']);await vi.waitFor(()=>expect(packs.snapshot().slots).toHaveLength(0));expect(read).not.toHaveBeenCalled();expect(packs.snapshot().attempts[0]?.permanent).toBe(true)
    now=2000;packs.setNeeds([]);packs.setNeeds(['tuft']);await flush();expect(load).toHaveBeenCalledTimes(1);expect(read).not.toHaveBeenCalled();packs.dispose()
  }
})
it('retains only bounded SHA256 actor and canonical work tokens without row-reorder replay',()=>{
  const rows=[{id:'b',detail:'reporting',runStanding:null,updatedAt:'revision-b'},{id:'a',detail:'reporting',runStanding:null,updatedAt:'revision-a'}] as WorkRow[],token=workIntent(rows)!
  const expected=createHash('sha256').update(JSON.stringify([['a','reporting',null,'revision-a'],['b','reporting',null,'revision-b']])).digest('hex')
  expect(token).toBe(expected);expect(workIntent(rows.slice().reverse())).toBe(token)
  const ledger=new PageIntents();expect(ledger.canPlay('generated-identity',token)).toBe(true);ledger.remember('generated-identity',token);expect(ledger.canPlay('generated-identity',token)).toBe(false)
  rows[0]!.updatedAt='explicit-revision';const renewed=workIntent(rows)!;expect(renewed).not.toBe(token);expect(ledger.canPlay('generated-identity',renewed)).toBe(true)
  const entries=(ledger as unknown as {entries:Map<string,string|null>}).entries;expect([...entries]).toEqual([[createHash('sha256').update(JSON.stringify('generated-identity')).digest('hex'),token]])
})
it('bounds page admission without eviction and rejects oversized actor and tuple inputs before hashing',()=>{
  const ledger=new PageIntents(),token='a'.repeat(64)
  for(let i=0;i<4096;i++){expect(ledger.canPlay('generated-'+i,token)).toBe(true);ledger.remember('generated-'+i,token)}
  expect(ledger.snapshot()).toMatchObject({count:4096,capacity:4096,saturated:true,fallback:'own-still-no-demand'})
  expect(ledger.canPlay('generated-overflow',token)).toBe(false);expect(ledger.canPlay('generated-0',token)).toBe(false);expect(ledger.canPlay('generated-0','b'.repeat(64))).toBe(true)
  const empty=new PageIntents();expect(empty.canPlay('x'.repeat(2049),token)).toBe(false);expect(empty.snapshot().count).toBe(0)
  const row={id:'x',detail:'reporting',runStanding:null,updatedAt:'r'} as WorkRow
  expect(workIntent(Array.from({length:4097},()=>row))).toBeNull();expect(workIntent([{...row,updatedAt:'x'.repeat(65527)}])).toBeNull()
})
