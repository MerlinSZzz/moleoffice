// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { PixelScene, PixelZone } from './pixel-office.ts'
import { createI18n, type PageLanguage, type WordKey } from './i18n.ts'

export type MapZone = PixelZone
export interface MapOccupant { id: string; name: string; zone: MapZone; team: string | null; projects: {id:string;name:string}[]; createdAt?: string }
export interface MapPoint { x:number; y:number }
export interface MapRoom { id:string; zone:MapZone; title:string; workspaceId:string|null; scene:PixelScene; x:number; y:number; width:number; height:number; occupants:string[]; door:MapPoint }
export interface OfficeMapLayout { rooms:MapRoom[]; seats:Map<string,MapPoint>; width:number; height:number; center:MapPoint; roads:MapPoint[][]; spineX:number }
const ZONE_WORDS = {
 visitor:'g6c.pixel.office.zone.visitor',
 team:'g6c.pixel.office.zone.team',
 leadership:'g6c.pixel.office.zone.leadership',
 secretary:'g6c.pixel.office.zone.secretary',
 inspector:'g6c.pixel.office.zone.inspector',
 unassigned:'g6c.pixel.office.zone.unassigned',
} satisfies Record<MapZone, WordKey>
export const MAP_ROOM = {width:860,height:590,gapX:180,gapY:180,columns:4,capacity:8,seatX:48,seatY:90,stepX:190,stepY:220} as const

/** A connected ring expands around the secretary room. Every room has a free road along its south edge. */
function spiral(count:number): MapPoint[] {
  const points:MapPoint[]=[{x:0,y:0}]
  let x=0,y=0,length=1,direction=0
  const directions=[[1,0],[0,1],[-1,0],[0,-1]] as const
  while(points.length<count){
    for(let side=0;side<2;side++){
      const [dx,dy]=directions[direction++%4]!
      for(let step=0;step<length;step++){x+=dx;y+=dy;points.push({x,y})}
    }
    length++
  }
  return points.slice(0,count)
}
export function arrangeOfficeMap(moles:MapOccupant[], options:{language:PageLanguage; scene:PixelScene; grouping:'shared'|'workspace'; workspaceScenes:Record<string,PixelScene>; selectedProject?:string}):OfficeMapLayout {
  const { t } = createI18n(options.language)
  const byId=new Map(moles.map(m=>[m.id,m]))
  const groups=new Map<string,{zone:MapZone;workspaceId:string|null;title:string;moles:MapOccupant[]}>()
  groups.set('secretary',{zone:'secretary',workspaceId:null,title:t(ZONE_WORDS.secretary),moles:[]})
  for(const mole of [...moles].sort((a,b)=>(a.createdAt??'').localeCompare(b.createdAt??'')||a.id.localeCompare(b.id))){
    // Placement is decorative. A filtered project owns its view; the all-project view draws each agent once.
    const project=options.grouping==='workspace' && mole.zone!=='secretary' ? mole.projects.find(p=>p.id===options.selectedProject) ?? [...mole.projects].sort((a,b)=>a.id.localeCompare(b.id))[0] : undefined
    const team=mole.zone==='team' ? mole.team??'unassigned' : ''
    const id=mole.zone==='secretary' ? 'secretary' : [project?.id??'shared',mole.zone,team].join(':')
    const leader=byId.get(team)
    const title=[project?.name,leader ? t('g6c.pixel.office.teamGroup',{name:leader.name}) : t(ZONE_WORDS[mole.zone])].filter(Boolean).join(' · ')
    if(!groups.has(id))groups.set(id,{zone:mole.zone,workspaceId:project?.id??null,title,moles:[]})
    groups.get(id)!.moles.push(mole)
  }
  const chunks=[...groups].flatMap(([id,g])=>Array.from({length:Math.max(1,Math.ceil(g.moles.length/MAP_ROOM.capacity))},(_,i)=>({id:id+':'+i,...g,moles:g.moles.slice(i*MAP_ROOM.capacity,(i+1)*MAP_ROOM.capacity),title:g.title+(i?` · ${i+1}`:'')})))
  const cells=spiral(chunks.length),pitchX=MAP_ROOM.width+MAP_ROOM.gapX,pitchY=MAP_ROOM.height+MAP_ROOM.gapY
  const pad=180,minX=Math.min(...cells.map(p=>p.x)),minY=Math.min(...cells.map(p=>p.y))
  const seats=new Map<string,MapPoint>()
  const rooms=chunks.map((g,i):MapRoom=>{
    const x=(cells[i]!.x-minX)*pitchX+pad,y=(cells[i]!.y-minY)*pitchY+pad
    g.moles.forEach((m,index)=>seats.set(m.id,{x:x+MAP_ROOM.seatX+(index%MAP_ROOM.columns)*MAP_ROOM.stepX,y:y+MAP_ROOM.seatY+Math.floor(index/MAP_ROOM.columns)*MAP_ROOM.stepY}))
    return {id:g.id,zone:g.zone,title:g.title,workspaceId:g.workspaceId,scene:g.workspaceId?options.workspaceScenes[g.workspaceId]??options.scene:options.scene,x,y,width:MAP_ROOM.width,height:MAP_ROOM.height,occupants:g.moles.map(m=>m.id),door:{x:x+MAP_ROOM.width/2,y:y+MAP_ROOM.height+MAP_ROOM.gapY/2}}
  })
  const hub=rooms[0]!.door,spineX=rooms[0]!.x-MAP_ROOM.gapX/2
  const roads=rooms.map(room=>[{x:room.door.x,y:room.y+room.height},room.door,{x:spineX,y:room.door.y},{x:spineX,y:hub.y},hub])
  return {rooms,seats,roads,spineX,width:(Math.max(...cells.map(p=>p.x))-minX)*pitchX+MAP_ROOM.width+pad*2,height:(Math.max(...cells.map(p=>p.y))-minY)*pitchY+MAP_ROOM.height+pad*2,center:{x:rooms[0]!.x+MAP_ROOM.width/2,y:rooms[0]!.y+MAP_ROOM.height/2}}
}
/** Route along exterior roads and the free aisle on the right of each desk. */
export function meetingRoute(from:MapPoint,to:MapPoint,source:MapRoom,target:MapRoom,spineX:number):MapPoint[]{
 const feet=(point:MapPoint)=>({x:point.x+58,y:point.y+180})
 const lane=(point:MapPoint,room:MapRoom)=>[{x:point.x+140,y:point.y+180},{x:point.x+140,y:room.y+room.height-40},{x:room.door.x,y:room.y+room.height-40},room.door]
 return [feet(from),...lane(from,source),{x:spineX,y:source.door.y},{x:spineX,y:target.door.y},...lane(to,target).reverse(),feet(to)].map(p=>({x:p.x-58,y:p.y-180}))
}

export const MEETING_DURATION = 9000
export const MEETING_PHASES = [
 {at:0,distance:0,phase:'rest'}, {at:8,distance:0,phase:'out'},
 {at:35,distance:100,phase:'talk'}, {at:65,distance:100,phase:'back'},
 {at:93,distance:0,phase:'home'}, {at:100,distance:0,phase:'home'},
] as const
export const MEETING_KEYFRAMES = '@keyframes px-meeting {' + MEETING_PHASES.map(p=>`${p.at}% {offset-distance:${p.distance}%;}`).join('') + '}'
