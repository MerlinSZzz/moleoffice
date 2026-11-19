// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { MEETING_DURATION, MEETING_PHASES } from '@shared/office-map.ts'
import { useEffect, useId, useState } from 'react'
import { PIXEL_EXPRESSIONS, PIXEL_FURS, type LegacyPixelAppearance } from '@shared/pixel-office.ts'

const FUR = {slate:'#525b70',cocoa:'#705248',chestnut:'#966545',sand:'#ac8f63',silver:'#98a4aa',cream:'#c6b899'}
export const CLOTH = {blue:'#347fc2',green:'#719764',ochre:'#c49942',rose:'#be7388',plum:'#876497',cream:'#e5d3a8',charcoal:'#4b5360'}
export type MoleAction = 'rest'|'type'|'read'|'wave'|'tea'|'look'|'walk'|'report'|'talk'|'wait'
const R=({x,y,w,h,c}:{x:number;y:number;w:number;h:number;c:string})=><rect x={x} y={y} width={w} height={h} fill={c}/>
/** Adopted generated head art, with independently animated body, clothes and accessories. */
export function MoleSprite({appearance:a,action='rest',label='',direction='right'}:{appearance:LegacyPixelAppearance;action?:MoleAction;label?:string;direction?:'left'|'right'|'back'}){
 const clip=useId().replace(/:/g,''),fur=FUR[a.fur],ink='#192432',skin='#eab47e'
 const colour=(slot:typeof a.top)=>slot?CLOTH[slot.colour]:fur
 const bodyWidth=a.build==='broad'?1.07:a.build==='slim'?.95:1
 const bodyHeight=a.height==='short'?.96:a.height==='tall'?1.04:1
 const headColumn=direction==='back'?7:PIXEL_EXPRESSIONS.indexOf(a.expression),furRow=PIXEL_FURS.indexOf(a.fur)
 const legs=[{side:'back',x:22},{side:'front',x:43}] as const
 const arms=[{side:'back',x:13},{side:'front',x:57}] as const
 return <svg viewBox="0 0 80 112" role={label?'img':undefined} aria-label={label||undefined} aria-hidden={!label} className={'px-mole-art px-action-'+action} data-direction={direction} shapeRendering="crispEdges">
  <defs><clipPath id={clip}><rect width="64" height="64"/></clipPath></defs>
  <ellipse cx="40" cy="104" rx="28" ry="4" fill="#192432" opacity=".16"/>
  <g transform={direction==='left'?'translate(80 0) scale(-1 1)':undefined}>
  <g className="om-body-bob" style={{transformOrigin:'40px 104px'}}>
  <g transform={`translate(40 104) scale(${bodyWidth} ${bodyHeight}) translate(-40 -104)`}>
   {legs.map(({side,x})=><g key={side} className={'om-leg om-leg-'+side} style={{transformOrigin:`${x+7}px 88px`}}>
    <path d={`M${x} 83h15v17h-2v4h-19v-8h6z`} fill={ink}/>
    <R x={x+1} y={85} w={12} h={13} c={a.trousers?colour(a.trousers):fur}/>
    <path d={`M${x-2} 98h13v5h-16v-3h3z`} fill={a.shoes?colour(a.shoes):skin}/>
    {a.trousers?.item==='shorts'?<R x={x+1} y={93} w={12} h={5} c={fur}/>:null}
    {a.trousers?.item==='patchwork'?<R x={x+4} y={89} w={7} h={5} c="#c1a580"/>:null}
    {a.shoes?.item==='boots'||a.shoes?.item==='flower-boots'?<R x={x} y={95} w={14} h={6} c={colour(a.shoes)}/>:null}
    {a.shoes?.item==='trainers'?<path d={`M${x-3} 102h16M${x+1} 99h5`} stroke="#e9dfc7" strokeWidth="1"/>:null}
    {a.shoes?.item==='flower-boots'?<path d={`M${x+4} 95v5m-2-3h4`} stroke="#efd36c" strokeWidth="2"/>:null}
    {!a.shoes?<path d={`M${x+1} 100v3m5-3v3`} stroke="#b87e5a"/>:null}
   </g>)}
   <path d="M24 51h28v4h7v7h4v21h-4v9H21v-5h-5V62h4v-7h4z" fill={ink}/>
   <path d="M25 54h26v4h7v22h-3v9H23v-6h-4V63h6z" fill={a.top?colour(a.top):fur}/>
   <path d="M22 76h34v10H24z" fill="#000" opacity=".10"/>
   {direction!=='back'?<>
   {a.top?.item==='hoodie'?<><path d="M23 54 38 66 56 54M24 56l13 10h4l14-10" stroke={ink} strokeWidth="3" fill="none"/><path d="M33 62v10m10-10v10" stroke="#e6ebed" strokeWidth="2"/><path d="M30 80h19v6H30z" fill="#000" opacity=".13"/></>:null}
   {a.top?.item==='shirt'?<><path d="m25 55 12 8-5 5-9-11m19 5 7 5 6-11" fill="#e8dfca"/><path d="M39 64v24" stroke={ink}/>{[70,77,84].map(y=><R key={y} x={40} y={y} w={2} h={2} c="#e8dfca"/>)}</>:null}
   {a.top?.item==='knit'?[66,73,80].map(y=><path key={y} d={`M23 ${y}h32`} stroke="#e7d5b8" strokeWidth="2"/>):null}
   {a.top?.item==='vest'?<path d="m30 54 10 25 11-25h-8l-3 11-3-11z" fill="#e6d4b7"/>:null}
   {a.top?.item==='apron'?<><path d="M29 56h20v9h5v23H25V65h4z" fill="#e8d8b3"/><R x={32} y={76} w={14} h={7} c={colour(a.top)}/></>:null}
   {a.top?.item==='star-coat'?<><path d="M39 57v33" stroke={ink} strokeWidth="2"/>{[27,49].map((x,i)=><path key={x} d={`m${x} ${72+i*8} 1-4 1 4 4 1-4 1-1 4-1-4-4-1z`} fill="#f3d590"/>)}</>:null}
   {a.trousers?.item==='overalls'?<><path d="M26 60v28h27V60h-4v16H30V60z" fill={colour(a.trousers)}/><path d="M30 79h18v8H30z" stroke={ink} fill="none"/></>:null}
   </>:a.top?.item==='hoodie'?<path d="M24 55h29v13l-6 6H31l-7-6z" fill="#000" opacity=".15"/>:a.top?.item==='apron'?<path d="M22 79h34m-17-2-7 8m7-8 7 8" stroke="#e8d8b3" strokeWidth="2"/>:null}
   <g className="om-head" style={{transformOrigin:'40px 53px'}}>
    <svg x="8" y="0" width="64" height="64" viewBox="0 0 64 64" overflow="visible"><g clipPath={`url(#${clip})`}><image href="/office-map/heads.webp" x={-headColumn*64} y={-furRow*64} width="512" height="384"/></g></svg>
    {direction!=='back'?<>
     {a.age==='elder'?<path d="M18 32h5m-7 4h5m-2 5h4" stroke="#d9d4c8" strokeWidth="2"/>:a.age==='young'?<path d="M28 42h4m26 1h3" stroke="#e5aa8a" strokeWidth="2"/>:null}
     {a.presentation==='feminine'?<path d="m38 32-2-2m19 1 1-2" stroke={ink}/>:a.presentation==='masculine'?<path d="M37 30h4" stroke={fur} strokeWidth="2"/>:null}
     {a.face && a.face.item!=='headphones'?<g stroke={colour(a.face)} fill="none" strokeWidth="1.5"><rect x="33" y="30" width="13" height="13" rx={a.face.item==='round-glasses'?6:1}/><rect x="53" y="29" width="8" height="10" rx={a.face.item==='round-glasses'?4:1}/><path d="M46 34h7M33 33l-12-5"/>{a.face.item==='star-glasses'?<path d="m39 27 2 3-2 2-2-2zm18 0 2 3-2 2-2-2z"/>:null}</g>:null}
    </>:null}
    {a.face?.item==='headphones'?<><path d="M17 36V20l9-8h27l8 9v13" fill="none" stroke={colour(a.face)} strokeWidth="4"/><R x={13} y={31} w={7} h={13} c={colour(a.face)}/><R x={60} y={29} w={5} h={12} c={colour(a.face)}/></>:null}
    {a.head?.item==='flower'?<><path d="M22 19v-9m-4 4h9" stroke={colour(a.head)} strokeWidth="5"/><R x={21} y={13} w={3} h={3} c="#f3d479"/></>:a.head?<><path d="M21 20v-7h6V8h23v5h7v8z" fill={colour(a.head)} stroke={ink} strokeWidth="2"/><path d={a.head.item==='cap'?'M20 21h46v3H20z':'M20 19h38v4H20z'} fill={colour(a.head)}/>{a.head.item==='helmet'?<circle cx="46" cy="15" r="5" fill="#f7df8b" stroke={ink}/>:a.head.item==='beanie'?<R x={34} y={3} w={8} h={5} c={colour(a.head)}/>:a.head.item==='moon-hat'?<path d="m27 9 11-8 13 8z" fill={colour(a.head)}/>:null}</>:null}
   </g>
   {a.neck?<><path d="M26 56h26v5H26z" fill={colour(a.neck)}/><path d={a.neck.item==='bow'?'m34 58-7-4v10l7-4 9 4v-10z':'M46 59h6v17h-6z'} fill={colour(a.neck)}/>{a.neck.item==='star-scarf'?<path d="M47 68h4m-2-2v4" stroke="#f4d788"/>:null}</>:null}
   {a.badge&&direction!=='back'?<g><path d="M28 65h8v9h-8z" fill={colour(a.badge)} stroke={ink}/><path d={a.badge.item==='name-tag'?'M30 68h4m-4 3h4':a.badge.item==='leaf-pin'?'m31 67 3 3-3 2z':'m30 66 3 2-1 4-2-2z'} stroke="#eee0b9"/></g>:null}
   {arms.map(({side,x})=><g key={side} className={'om-arm om-arm-'+side} style={{transformOrigin:`${x+5}px 65px`}}>
    <path d={`M${x} 62h10v5h4v13h-3v7h-11v-4h-4V70h4z`} fill={ink}/>
    <path d={`M${x+1} 64h8v6h3v8h-12v-6h-2v-4h3z`} fill={a.top&&a.top.item!=='vest'?colour(a.top):fur}/>
    <path d={`M${x} 78h10v7h-10v-2h-2v-3h2z`} fill={skin}/><path d={`M${x+3} 82v3m4-3v3`} stroke="#b67a51"/>
   </g>)}
   {action==='read'||action==='report'?<g className="om-held-paper"><path d="M26 73h13l2 2 2-2h17v18H43l-2 2-2-2H26z" fill="#f0dfb9" stroke={ink} strokeWidth="2"/><path d="M41 76v15m-11-13h7m-7 4h7m10-4h9m-9 4h9" stroke="#b39a72"/>{action==='report'?<path d="M47 87h8" stroke="#71966e" strokeWidth="3"/>:null}</g>:null}
   {action==='tea'?<g className="om-cup"><path d="M57 48h13v14H57z" fill="#efdfbc" stroke={ink} strokeWidth="2"/><path d="M70 50h5v8h-5" fill="none" stroke={ink} strokeWidth="2"/><path d="M60 41v4m5-6v6" stroke="#eee7d6" strokeWidth="2"/></g>:null}
  </g></g></g>
 </svg>
}

/** These times follow the outbound, meeting and return phases of px-meeting (nine seconds). */
export function MeetingMole({appearance,left}:{appearance:LegacyPixelAppearance;left:boolean}){
 const [phase,setPhase]=useState<'rest'|'out'|'talk'|'back'|'home'>('rest')
 useEffect(()=>{const timers=MEETING_PHASES.slice(1).map(({at,phase})=>setTimeout(()=>setPhase(phase),MEETING_DURATION*at/100));return()=>timers.forEach(clearTimeout)},[])
 const returning=phase==='back'||phase==='home'
 return <MoleSprite appearance={appearance} action={phase==='out'||phase==='back'?'walk':phase==='talk'?'talk':'rest'} direction={left!==returning?'left':'right'}/>
}
