// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { pixelHash } from './action-pixels.ts'
import type { WorkRow } from './model.ts'
export const ACTION_INTENT_IDENTITIES = 4096
export const ACTION_INTENT_ROWS = 4096
export const ACTION_INTENT_UNITS = 65536
export const ACTION_ACTOR_UNITS = 2048
type Tuple = [string,string,string|null,string]
const compareField=(a:string|null,b:string|null):number=>a===b?0:a===null?-1:b===null?1:a<b?-1:1
const compareTuples=(a:Tuple,b:Tuple):number=>compareField(a[0],b[0])||compareField(a[1],b[1])||compareField(a[2],b[2])||compareField(a[3],b[3])
const hash=(text:string):string=>pixelHash(new TextEncoder().encode(text))
export function workIntent(rows: readonly WorkRow[]): string | null {
  if(rows.length>ACTION_INTENT_ROWS)return null
  let units=0
  for(const row of rows){units+=row.id.length+row.detail.length+(row.runStanding?.length??0)+row.updatedAt.length;if(units>ACTION_INTENT_UNITS)return null}
  const tuples:Tuple[]=rows.map(row=>[row.id,row.detail,row.runStanding,row.updatedAt])
  return hash(JSON.stringify(tuples.sort(compareTuples)))
}
const actorKey=(key:string):string|null=>key.length>ACTION_ACTOR_UNITS?null:hash(JSON.stringify(key))
/** Page lifetime, never LRU: saturation keeps new identities in their own still. */
export class PageIntents {
  private entries=new Map<string,string|null>()
  private admit(key:string):string|null {
    const id=actorKey(key);if(id===null)return null
    if(this.entries.has(id))return id
    if(this.entries.size>=ACTION_INTENT_IDENTITIES)return null
    this.entries.set(id,null);return id
  }
  canPlay(key:string,token:string):boolean {if(!/^[a-f0-9]{64}$/.test(token))return false;const id=this.admit(key);return id!==null&&this.entries.get(id)!==token}
  remember(key:string,token:string):void {if(!/^[a-f0-9]{64}$/.test(token))return;const id=this.admit(key);if(id!==null)this.entries.set(id,token)}
  consumed(key:string,token:string):boolean {const id=actorKey(key);return id!==null&&this.entries.get(id)===token}
  snapshot(){return {count:this.entries.size,capacity:ACTION_INTENT_IDENTITIES,saturated:this.entries.size===ACTION_INTENT_IDENTITIES,representation:'SHA256 actor and canonical work tuple hashes',fallback:'own-still-no-demand',maxActorUnits:ACTION_ACTOR_UNITS,maxWorkRows:ACTION_INTENT_ROWS,maxTupleUnits:ACTION_INTENT_UNITS}}
}
