// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { RecordPageData } from '../pages/RecordPage.tsx'
import { keptAnswer, placeOf } from './pagecache.ts'

export type PreparedRecord = { key:string; value:RecordPageData }
const prepared = new Map<string, PreparedRecord>()
/** The name the record page keeps its answer under in the page cache. */
export const recordPageKeepName = (id:string, editing:boolean):string => `record:${id}:${editing ? 'edit' : 'view'}`
const keyFor = (id:string, editing:boolean, workspace?:string):string => placeOf(recordPageKeepName(id,editing),workspace).key

/** Whether the record page holds an answer kept from before for this record, actor and project. */
export function theRecordPageKept(id:string, editing:boolean):boolean {
  return keptAnswer(recordPageKeepName(id,editing)) !== undefined
}

/** A prepared answer is usable only for the same record, actor and project. */
export function peekPreparedRecord(id:string, editing:boolean, held?:PreparedRecord):PreparedRecord | undefined {
  const key=keyFor(id,editing)
  return held === undefined ? prepared.get(key) : held.key === key ? held : undefined
}

export function consumePreparedRecord(held:PreparedRecord):void {
  if(prepared.get(held.key)===held)prepared.delete(held.key)
}

/** Keep one answer until the page's first load takes it. */
export function prepareRecord(id:string, editing:boolean, key:string, value:RecordPageData, workspace?:string):void {
  if(key!==keyFor(id,editing,workspace))return
  const answer={key,value}
  prepared.set(key,answer)
  window.setTimeout(()=>consumePreparedRecord(answer),30_000)
}

export function preparedRecordKey(id:string, editing:boolean, workspace?:string):string { return keyFor(id,editing,workspace) }
