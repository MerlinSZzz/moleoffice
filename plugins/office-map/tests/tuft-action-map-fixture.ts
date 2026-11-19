// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { vi } from 'vitest'
import { OfficeMap, type MapOptions } from '../src/map-view.ts'
import { LookFrames } from '../src/look-frames.ts'
import { NativeContacts } from '../src/action-contacts.ts'
import { pageActionPacks, type ActionClock } from '../src/action-runtime.ts'
import { pageCompositions } from '../src/action-resources.ts'
import { ActionTransportError } from '../src/action-data.ts'
import { TUFT_ACTION_VERSION } from '../src/action-version.ts'
import { portraitOf } from '../src/appearance.ts'
import type { Occupant,OfficeModel } from '../src/model.ts'
import type { Layout } from '../src/geometry.ts'
import type { ArtPack } from '../src/pack.ts'
import { data,readPixels,flush } from './tuft-action-fixture.ts'
export class ManualClock implements ActionClock {
  time=0;serial=0;pending=new Map<number,()=>void>();now=()=>this.time
  frame=(fn:()=>void)=>{const id=++this.serial;this.pending.set(id,fn);return id};cancelFrame=(id:number)=>{this.pending.delete(id)}
  turn(ms=0){this.time+=ms;const calls=[...this.pending.values()];this.pending.clear();calls.forEach(fn=>fn())}
}
export class Node extends EventTarget {
  dataset:Record<string,string>={};style={};width=800;height=600;clientWidth=800;clientHeight=600;scrollLeft=0;scrollTop=0;className='';children:Node[]=[];parent:Node|null=null
  append(...nodes:Node[]){for(const node of nodes){node.parent?.children.splice(node.parent.children.indexOf(node),1);node.parent=this;this.children.push(node)}}
  replaceChildren(...nodes:Node[]){this.children=[];this.append(...nodes)};remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null};setAttribute(){};querySelector(){return null};querySelectorAll(){return []}
  getContext(){return context}
}
export const draws:unknown[][]=[]
const context=new Proxy({drawImage:(...args:unknown[])=>draws.push(args),measureText:(text:string)=>({width:text.length*6}),createPattern:()=>({}),getImageData:()=>({data:new Uint8Array(4)})},{get:(object,key)=>key in object?object[key as keyof typeof object]:()=>{},set:()=>true})
export const ownLook=new Node()
export function mapFixture(success=false) {
  vi.useFakeTimers();draws.length=0;pageCompositions.clear()
  const paints=new ManualClock(),actions=new ManualClock()
  vi.stubGlobal('requestAnimationFrame',paints.frame);vi.stubGlobal('cancelAnimationFrame',paints.cancelFrame)
  vi.stubGlobal('ImageData',class{constructor(public data:Uint8ClampedArray,public width:number,public height:number){}})
  vi.stubGlobal('MessageChannel',class{timer:ReturnType<typeof setTimeout>|null=null;port1={onmessage:null as (()=>void)|null,close:()=>{if(this.timer!==null)clearTimeout(this.timer)}};port2={postMessage:()=>{this.timer=setTimeout(()=>this.port1.onmessage?.(),0)},close(){}}})
  vi.stubGlobal('document',{createElement:()=>new Node(),hidden:false});vi.stubGlobal('window',{devicePixelRatio:1,__officeMapScreenTest:{hold:false,selection:[]}});vi.stubGlobal('ResizeObserver',class{observe(){};disconnect(){}})
  vi.spyOn(LookFrames.prototype,'select').mockImplementation(async function(this:LookFrames){this.ready=true;return true})
  vi.spyOn(LookFrames.prototype,'original').mockReturnValue({width:128,height:128,channels:4,data:new Uint8Array(128*128*4)})
  vi.spyOn(LookFrames.prototype,'draw').mockImplementation((ctx)=>{ctx.drawImage(ownLook as unknown as HTMLCanvasElement,0,0);return true})
  vi.spyOn(NativeContacts.prototype,'select').mockImplementation(async function(this:NativeContacts){this.ready=true;return true})
  vi.spyOn(NativeContacts.prototype,'draw').mockReturnValue(true)
  const load=vi.fn(async()=>{if(success)return data;throw new ActionTransportError('generated unavailable source')})
  const pool=pageActionPacks as unknown as {registry:Map<string,unknown>;read:typeof readPixels;attempts:Map<string,unknown>;needNumber:Map<string,number>;needs:Set<string>}
  pool.registry.set('tuft',{version:TUFT_ACTION_VERSION,load});pool.read=readPixels;pool.attempts.clear();pool.needNumber.clear();pool.needs.clear()
  const actor={key:'generated-tuft',agent:{id:'generated-agent',scale:null,appearance:null,retired:false,name:'Generated Tuft',handle:'generated-tuft',projects:[]},standing:{look:'tuft',source:'stable-fallback',recipe:0},portrait:portraitOf(null),projects:[],work:[{id:'generated-work',project:'generated-project',agent:'generated-agent',title:'Generated reporting intent',detail:'completed',recordedState:null,doing:null,executing:false,association:'generated',runStanding:'closed',updatedAt:'fixture-intent'}]} as unknown as Occupant
  actor.facts={people:{status:'loaded',value:actor.agent,error:null,revision:1,pending:false},work:{status:'loaded',value:actor.work,error:null,revision:1,pending:false}} as Occupant['facts']
  const model={occupants:[actor],rosterOrder:[actor.agent.id],rooms:[],layoutRoster:{people:[],groups:[]}} as unknown as OfficeModel
  const layout={key:'generated-layout',ownership:true,bounds:{x:0,y:0,width:2200,height:1800},seats:{[actor.key]:{room:'generated-room',index:0,foot:{x:420,y:500},talk:{x:388,y:516},desk:{x:300,y:372,width:144,height:73},stool:{x:372,y:508,width:24,height:16},activity:'desk',cluster:'generated-desk'}},pieces:[{sprite:'worker-desk',x:300,y:372,width:144,height:73,depth:445,layer:'object',group:null}],houses:[],rooms:[],road:{rings:[]},square:{x:0,y:0,width:2200,height:1800},obstacles:[]} as unknown as Layout
  const frame={atlas:'generated-native',rect:[0,0,128,128],trim:[0,0],size:[128,128],anchor:[64,111]}
  const image={};const pack={sources:{sprites:{'stand-tuft':frame,'carry-tuft':frame,'wave-tuft':frame,'cheer-tuft':frame},scenery:{},portraits:{},dimensions:{}},images:new Map([['generated-native',image]]),bytes:65536} as unknown as ArtPack
  const options:MapOptions={project:null,search:'',language:'en',theme:'light',selected:null,workAvailable:true,still:false,wave:null}
  const view=new Node(),map=new OfficeMap(view as unknown as HTMLElement,()=>{},()=>{},()=>{},()=>{},()=>{},{actionClock:actions})
  map.setMotionActive(true)
  const update=()=>map.update(layout,model,options,pack)
  const drain=async()=>{for(let i=0;i<10;i++){await vi.runAllTimersAsync();await flush()}}
  return {map,view,paints,actions,load,actor,model,layout,pack,options,update,drain,image}
}
