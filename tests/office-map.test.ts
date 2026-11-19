// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic occupants exercise the real layout. None of these rows are office observations. */
import { describe, expect, it } from 'vitest'
import { arrangeOfficeMap, meetingRoute, MAP_ROOM, type MapOccupant, type MapPoint } from '../src/shared/office-map.ts'
import { DEFAULT_PIXEL_SCENE, pixelSceneSettingsSchema } from '../src/shared/pixel-office.ts'
const settings = {language:'en' as const,scene:'woodland' as const,grouping:'shared' as const,workspaceScenes:{}}
const occupants = (count:number):MapOccupant[] => Array.from({length:count},(_,i)=>({id:`synthetic-${String(i).padStart(5,'0')}`,name:`Synthetic ${i}`,zone:i===0?'secretary':'team',team:'synthetic-supervisor',projects:[{id:i%2?'alpha':'beta',name:i%2?'Alpha':'Beta'}]}))
function crossesRoom(a:MapPoint,b:MapPoint,r:{x:number;y:number;width:number;height:number}) {
  if(a.x===b.x) return a.x>r.x&&a.x<r.x+r.width&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.height
  if(a.y===b.y) return a.y>r.y&&a.y<r.y+r.height&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.width
  throw Error('A road is not horizontal or vertical')
}
describe('Office Map',()=>{
 it('keeps the central secretary room when the world or project is empty',()=>{
  const map=arrangeOfficeMap([],settings)
  expect(map.rooms).toHaveLength(1);expect(map.rooms[0]?.zone).toBe('secretary')
  expect(map.rooms[0]?.occupants).toEqual([])
  expect(map.center).toEqual({x:map.rooms[0]!.x+MAP_ROOM.width/2,y:map.rooms[0]!.y+MAP_ROOM.height/2})
 })
 it('expands for 1,000 distinct agents without duplicate desks, overlapping rooms or disconnected roads',()=>{
  const input=occupants(1000),map=arrangeOfficeMap(input,settings)
  expect(map.seats.size).toBe(input.length)
  const ids=map.rooms.flatMap(r=>r.occupants)
  expect(ids.slice().sort()).toEqual(input.map(m=>m.id).sort());expect(new Set(ids).size).toBe(1000)
  for(const room of map.rooms){
   expect(room.occupants.length).toBeLessThanOrEqual(8)
   for(const other of map.rooms.filter(r=>r!==room)) expect(room.x+room.width<=other.x||other.x+other.width<=room.x||room.y+room.height<=other.y||other.y+other.height<=room.y).toBe(true)
  }
  for(const road of map.roads){
   expect(road.at(-1)).toEqual(map.rooms[0]!.door)
   for(let i=1;i<road.length;i++)for(const room of map.rooms)expect(crossesRoom(road[i-1]!,road[i]!,room)).toBe(false)
  }
  expect(arrangeOfficeMap(input.slice().reverse(),settings)).toEqual(map)
 })
 it('uses project scenes only when project areas are selected, and draws multi-project agents once',()=>{
  const input=occupants(20);input[1]!.projects.push({id:'beta',name:'Beta'})
  const scenes={alpha:'cavern',beta:'high-rise'} as const
  const shared=arrangeOfficeMap(input,{...settings,workspaceScenes:scenes})
  expect(shared.rooms.every(r=>r.scene==='woodland')).toBe(true)
  const split=arrangeOfficeMap(input,{...settings,grouping:'workspace',workspaceScenes:scenes})
  expect(split.rooms.filter(r=>r.workspaceId==='alpha').every(r=>r.scene==='cavern')).toBe(true)
  expect(split.rooms.some(r=>r.workspaceId==='beta'&&r.scene==='high-rise')).toBe(true)
  expect(split.rooms.flatMap(r=>r.occupants).filter(id=>id===input[1]!.id)).toHaveLength(1)
  const filtered=arrangeOfficeMap([input[1]!],{...settings,grouping:'workspace',workspaceScenes:scenes,selectedProject:'beta'})
  expect(filtered.rooms[1]).toMatchObject({workspaceId:'beta',scene:'high-rise'})
  expect(split.rooms[0]).toMatchObject({zone:'secretary',workspaceId:null,scene:'woodland'})
 })
 it('walks through room doors and the connecting road, anchored at both original seats',()=>{
  const map=arrangeOfficeMap(occupants(20),settings),a=map.rooms[1]!,b=map.rooms[2]!
  const from=map.seats.get(a.occupants[0]!)!,to=map.seats.get(b.occupants[0]!)!
  const route=meetingRoute(from,to,a,b,map.spineX)
  expect(route[0]).toEqual(from);expect(route.at(-1)).toEqual(to)
  const feet=route.map(p=>({x:p.x+58,y:p.y+180}))
  expect(feet).toContainEqual(a.door);expect(feet).toContainEqual(b.door)
  expect(feet).toContainEqual({x:map.spineX,y:a.door.y});expect(feet).toContainEqual({x:map.spineX,y:b.door.y})
  for(let i=1;i<feet.length;i++)expect(feet[i]!.x===feet[i-1]!.x||feet[i]!.y===feet[i-1]!.y).toBe(true)
 })
 it('reads previous saved scene settings without inventing project overrides',()=>{
  const {grouping,workspaceScenes,...old}=DEFAULT_PIXEL_SCENE
  expect(pixelSceneSettingsSchema.parse(old)).toEqual({...old,grouping:'shared',workspaceScenes:{}})
  expect(pixelSceneSettingsSchema.safeParse({...old,workspaceScenes:{alpha:'missing-scene'}}).success).toBe(false)
 })
})
