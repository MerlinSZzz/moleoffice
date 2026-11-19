// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect,it,vi } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { standingOf,standingClothes,portraitOf } from '../src/appearance.ts'
import { mapOffice } from '../src/model.ts'
import { agent,people,workRow } from './fixtures.ts'
import type { Occupant } from '../src/model.ts'
import type { MovingContact } from '../src/walks.ts'
import catalog from '../assets/village-catalog.json'
// These focused fixtures exercise the original renderer/epoch seams with action demand inert.
const inertActions=()=>({actions:{draw:()=>false,invalidate:()=>{},setCandidates:()=>{},commitStatic:()=>{}},
  contacts:{ready:false,release:()=>{},select:async()=>false},refreshActionNeeds:()=>{},clearSleepingLooks:()=>{},prepareSleepingLooks:()=>{},viewportChanged:()=>{}})

const made='2026-11-17 23:59:59'
const methods=OfficeMap.prototype as unknown as {
  actors(keys:string[]):{key:string;point:{x:number;y:number};walk?:MovingContact}[]
  actor(ctx:CanvasRenderingContext2D,key:string,point:{x:number;y:number},walk?:MovingContact):void
}
const identity=(colour:boolean)=>Array.from({length:100},(_,i)=>JSON.stringify(['agent','control-'+i])).find(id=>!!standingClothes(standingOf(portraitOf(null),id,made))===colour)!
function scene(saved=false,colour=true) {
  const key=identity(colour),standing=standingOf(portraitOf(saved?{version:2,style:'c-forest',lookId:'sand-apron'}:null),key,made)
  const occupant={...mapOffice(people,null).occupants[0]!,key,standing,work:[],agent:agent('generated',{appearance:null,scale:null}),facts:undefined} as unknown as Occupant
  const point={x:500,y:600},route={x:900,y:950},walk={id:'walk',from:key,to:'elsewhere',point:route,elapsed:.2,facing:-1} as MovingContact
  const composed:unknown[][]=[],native:unknown[][]=[]
  const ctx=new Proxy({drawImage:(...args:unknown[])=>native.push(args)},{get:(a,k)=>Reflect.get(a,k)??(()=>{})}) as unknown as CanvasRenderingContext2D
  const fake={...inertActions(),atFacility:new Map(),actionBindings:new Map(),freeToWalk:new Set(),drawnScale:OfficeMap.prototype.drawnScale,occupants:new Map([[key,occupant]]),layout:{ownership:true,seats:{[key]:{foot:point,pose:'carry'}}},individuals:true,options:{still:false,wave:null as string|null,workAvailable:true},moving:[walk],camera:{left:0,top:0,width:2000,height:2000},
    pack:{sources:{sprites:catalog.sprites},images:new Map(Object.keys(catalog.atlases).map(name=>[name,{name}]))},lookFrames:{draw:(...args:unknown[])=>{composed.push(args);return true}}}
  return {key,point,route,walk,occupant,ctx,fake,composed,native}
}
it('keeps each recoloured actor at its own station before scene sorting and nameplate placement',()=> {
  const s=scene(),actors=methods.actors.call(s.fake,[s.key])
  expect(actors).toEqual([{key:s.key,point:s.point,walk:undefined}])
  methods.actor.call(s.fake,s.ctx,s.key,actors[0]!.point,actors[0]!.walk)
  expect(s.native).toHaveLength(0);expect(s.composed[0]![0]).toBe(s.ctx);expect(s.composed[0]!.slice(1)).toEqual([s.occupant.standing.recipe,s.point,.82])
  for(const still of [true,false])for(const wave of [null,s.key]) {
    s.fake.options.still=still;s.fake.options.wave=wave
    s.occupant.work=[workRow('done',{detail:'completed',runStanding:'closed'})]
    methods.actor.call(s.fake,s.ctx,s.key,s.point)
    expect(s.native).toHaveLength(0);expect(s.composed.at(-1)![2]).toEqual(s.point)
  }
})
it('retains original and supplied saved gait, still, wave and work-state frames',()=> {
  for(const saved of [false,true]) {
    const s=scene(saved,false),look=s.occupant.standing.look
    const frame=()=>{const call=s.native.at(-1)!;return Object.entries(catalog.sprites).find(([,f])=>s.fake.pack.images.get(f.atlas)===call[0]&&JSON.stringify(f.rect)===JSON.stringify(call.slice(1,5)))?.[0]}
    const actors=methods.actors.call(s.fake,[s.key]);expect(actors[0]!.point).toEqual(s.route)
    methods.actor.call(s.fake,s.ctx,s.key,s.route,s.walk);expect(frame()).toMatch(new RegExp('^walk-'+look+'-'))
    s.fake.options.still=true;methods.actor.call(s.fake,s.ctx,s.key,s.point);expect(frame()).toBe('stand-'+look)
    s.fake.options.still=false;s.fake.options.wave=s.key;methods.actor.call(s.fake,s.ctx,s.key,s.point);expect(frame()).toBe('wave-'+look)
    s.fake.options.wave=null;s.occupant.work=[];methods.actor.call(s.fake,s.ctx,s.key,s.point);expect(frame()).toBe('carry-'+look)
    s.fake.layout.ownership=false;s.occupant.work=[workRow('handoff',{detail:'waiting_check'})];methods.actor.call(s.fake,s.ctx,s.key,s.point);expect(frame()).toBe('carry-'+look)
    s.occupant.work=[workRow('done',{detail:'completed',runStanding:'closed'})];methods.actor.call(s.fake,s.ctx,s.key,s.point);expect(frame()).toBe('cheer-'+look)
    expect(s.composed).toHaveLength(0)
    if(saved)expect(s.occupant.standing.source).toBe('saved-catalogue')
  }
})
it('distant identity fallback and close saved override remain separate and retired actors never draw',()=> {
  const s=scene(true,true)
  s.fake.individuals=false;methods.actor.call(s.fake,s.ctx,s.key,s.point);expect(s.composed).toHaveLength(1)
  s.fake.individuals=true;methods.actor.call(s.fake,s.ctx,s.key,s.point);expect(s.native).toHaveLength(1)
  s.occupant.agent.retired=true;methods.actor.call(s.fake,s.ctx,s.key,s.point);expect(s.native).toHaveLength(1)
})
it('loads derived frames even when index preparation has already attached the native pack',async()=> {
  const layout={seats:{},rooms:[]},model={rooms:[],occupants:[]},options={still:false},pack={}
  const select=vi.fn(async()=>true),release=vi.fn(),dynamic=vi.fn()
  const fake={...inertActions(),layout,indexedLayout:layout,model,options,pack,lookPack:null,lookEpoch:0,frameLookEpoch:-1,canvas:{dataset:{} as Record<string,string>},lookFrames:{select,release},closed:false,opening:false,
    camera:{left:0,top:0,width:800,height:600},sizePlane:()=>{},paint:()=>{},dynamic}
  ;(OfficeMap.prototype as any).update.call(fake,layout,model,options,pack)
  expect(fake.canvas.dataset['lookReady']).toBe('false');expect(fake.canvas.dataset['lookState']).toBe('loading')
  await Promise.resolve();expect(select).toHaveBeenCalledExactlyOnceWith(pack);expect(dynamic).toHaveBeenCalledTimes(1)
  expect(fake.canvas.dataset['lookState']).toBe('prepared');expect(fake.canvas.dataset['lookReady']).toBe('false')
  ;(OfficeMap.prototype as any).update.call(fake,layout,model,options,pack)
  expect(select).toHaveBeenCalledTimes(1)
})
it('marks only a presented full-camera frame from the current prepared epoch as look ready',()=> {
  const ctx=new Proxy({getImageData:()=>({data:new Uint8Array(4)})},{get:(a,k)=>Reflect.get(a,k)??(()=>{})})
  const canvas=()=>({dataset:{} as Record<string,string>,style:{},width:1,height:1,getContext:()=>ctx,setAttribute:()=>{},remove:()=>{}})
  const inner:any=Object.create(OfficeMap.prototype),camera={left:0,top:0,width:100,height:100},full={x:0,y:0,width:100,height:100}
  Object.assign(inner,{...inertActions(),closed:false,layout:{houses:[],seats:{},bounds:full},camera,canvas:canvas(),frame:canvas(),background:canvas(),zoom:1,ratio:1,lookEpoch:1,frameLookEpoch:-1,lookFrames:{ready:false},lookState:'loading',villagePlan:null,individuals:true,moving:[],occupants:new Map(),nameplates:null,
    options:{still:true,theme:'light',language:'en'},padding:{x:0,y:0},seats:{*querySteps(){return[]}},scenery:{*querySteps(){return[]}},selectFacts:()=>{},plane:{append:()=>{}},view:{scrollLeft:0,scrollTop:0,clientWidth:100,clientHeight:100},targets:{style:{}}})
  const finish=(work:Generator)=>{while(!work.next().done){}}
  const old=inner.dynamicSteps([full]);old.next();inner.lookFrames.ready=true;inner.lookState='prepared';finish(old);inner.present()
  expect(inner.canvas.dataset.lookReady).toBe('false')
  finish(inner.dynamicSteps([{x:0,y:0,width:10,height:10}]));inner.present();expect(inner.canvas.dataset.lookReady).toBe('false')
  finish(inner.dynamicSteps([full]));inner.present();expect(inner.canvas.dataset.lookReady).toBe('true')
  const superseded=inner.dynamicSteps([full]);superseded.next();inner.lookEpoch++;inner.frameLookEpoch=-1;finish(superseded);inner.present();expect(inner.canvas.dataset.lookReady).toBe('false')
  inner.lookFrames.ready=false;inner.lookState='failed';inner.present();expect(inner.canvas.dataset.lookReady).toBe('false');expect(inner.canvas.dataset.lookState).toBe('failed')
})
it('does not certify failed, superseded or closed asynchronous look preparation',async()=> {
  const layout={seats:{},rooms:[]},model={rooms:[],occupants:[]},options={},pack={}
  const resolvers:((v:boolean)=>void)[]=[],dynamic=vi.fn(),select=vi.fn(()=>new Promise<boolean>(resolve=>resolvers.push(resolve)))
  const inner:any={...inertActions(),layout,indexedLayout:layout,model,options,pack,lookPack:null,lookEpoch:0,frameLookEpoch:-1,canvas:{dataset:{}},lookFrames:{select,release:()=>{}},closed:false,opening:false,camera:{left:0,top:0,width:100,height:100},sizePlane:()=>{},paint:()=>{},dynamic}
  const update=()=>{(OfficeMap.prototype as any).update.call(inner,layout,model,options,inner.pack)}
  update();inner.pack={};update();resolvers[0]!(true);await Promise.resolve();expect(inner.canvas.dataset.lookState).toBe('loading');expect(dynamic).not.toHaveBeenCalled()
  resolvers[1]!(false);await Promise.resolve();expect(inner.canvas.dataset.lookState).toBe('failed');expect(inner.canvas.dataset.lookReady).toBe('false')
  inner.pack={};update();inner.closed=true;resolvers[2]!(true);await Promise.resolve();expect(inner.canvas.dataset.lookState).toBe('loading');expect(dynamic).not.toHaveBeenCalled()
})
