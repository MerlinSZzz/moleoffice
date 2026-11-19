// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { ParticipantKind } from '@shared/participants.ts'
import type { ProfileReply } from '../api.ts'
import { placeOf } from './pagecache.ts'

export type PreparedProfile = { key:string; value:ProfileReply }
const prepared = new Map<string, PreparedProfile>()
// This is an internal identity key, not prose drawn on a page. The word gate inventories `kind` here.
const keyFor = (kind:ParticipantKind, id:string):string => placeOf(`profile:${kind}:${id}`).key

/** A prepared profile is usable only for the same participant, actor and project. */
export function peekPreparedProfile(kind:ParticipantKind, id:string, held?:PreparedProfile):PreparedProfile | undefined {
  const key=keyFor(kind,id)
  return held === undefined ? prepared.get(key) : held.key === key ? held : undefined
}

export function consumePreparedProfile(held:PreparedProfile):void {
  if(prepared.get(held.key)===held)prepared.delete(held.key)
}

export function prepareProfile(kind:ParticipantKind, id:string, key:string, value:ProfileReply):void {
  if(key!==keyFor(kind,id))return
  const answer={key,value}
  prepared.set(key,answer)
  window.setTimeout(()=>consumePreparedProfile(answer),30_000)
}

export function preparedProfileKey(kind:ParticipantKind, id:string):string { return keyFor(kind,id) }
