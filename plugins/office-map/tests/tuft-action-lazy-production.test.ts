// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect,it,vi,afterEach } from 'vitest'
import { SelectedPack } from '../src/pack.ts'
import { deferred,flush } from './tuft-action-fixture.ts'
import { decodeOwner } from '../src/action-resources.ts'
afterEach(()=>vi.unstubAllGlobals())
it('does not load any action entry while selecting the initial native pack',async()=>{
  const requested:string[]=[]
  const pack=new SelectedPack(async()=>({scenery:{native:'native-url'},portraits:{},dimensions:{native:[2,2]}}),()=>{const image={naturalWidth:2,naturalHeight:2,onload:null as (()=>void)|null,onerror:null,decode:async()=>{},set src(url:string){if(url){requested.push(url);queueMicrotask(()=>this.onload?.())}}};return image as unknown as HTMLImageElement})
  expect(await pack.select('woodland')).not.toBeNull();expect(requested).toEqual(['native-url']);pack.release()
})
it('retains a started native decode and its owner through replacement',async()=>{
  const gate=deferred<void>(),started=deferred<void>();let active=0,maximum=0,serial=0;const images:{src:string}[]=[]
  const pack=new SelectedPack(async()=>({scenery:{native:'generated-native-url'},portraits:{},dimensions:{native:[2,2]}}),()=>{
    const number=++serial;let url='';const image={naturalWidth:2,naturalHeight:2,onload:null as (()=>void)|null,onerror:null as (()=>void)|null,get src(){return url},set src(value:string){url=value;if(value)queueMicrotask(()=>this.onload?.())},async decode(){maximum=Math.max(maximum,++active);try{if(number===1){started.resolve();await gate.promise}}finally{active--}}};images.push(image);return image as unknown as HTMLImageElement
  })
  const first=pack.select('woodland');await started.promise;const replacement=pack.select('woodland');await flush()
  let old:Awaited<typeof first>|undefined,fresh:Awaited<typeof replacement>|undefined
  try { expect(images[0]!.src).toBe('generated-native-url');expect(active).toBe(1);expect(images[1]?.src??'').toBe('') }
  finally { gate.resolve();old=await first;fresh=await replacement;pack.release();await flush() }
  expect(old).toBeNull();expect(fresh).not.toBeNull();expect(images[0]!.src).toBe('');expect(maximum).toBe(1)
})
it('defers completed native pack cleanup until the current native reader releases its owner',async()=>{
  let url='';const image={naturalWidth:2,naturalHeight:2,onload:null as (()=>void)|null,onerror:null as (()=>void)|null,get src(){return url},set src(value:string){url=value;if(value)queueMicrotask(()=>this.onload?.())},decode:async()=>{}}
  const selected=new SelectedPack(async()=>({scenery:{native:'generated-native-url'},portraits:{},dimensions:{native:[2,2]}}),()=>image as unknown as HTMLImageElement),pack=await selected.select('woodland');expect(pack).not.toBeNull()
  const gate=deferred<void>(),reader=decodeOwner.run('generated native reader',()=>gate.promise);selected.release();await flush()
  try { expect(image.src).toBe('generated-native-url');expect(pack!.images.size).toBe(1) }
  finally { gate.resolve();await reader;await flush() }
  expect(image.src).toBe('');expect(pack!.images.size).toBe(0)
})
