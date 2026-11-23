// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import Database from 'better-sqlite3'
import { renameSync, rmSync } from 'node:fs'
import { RECORD_TEXT_INDEX_TABLES, LEFT_OUT_OF_BACKUPS_AND_EXPORTS } from '../../src/server/db/schema.ts'
import { NAMES_A_PART_MAY_NOT_TAKE, everyPartTable } from '../../src/server/db/every-part-table.ts'
import { NOT_CARRIED_TABLES, COLUMNS_A_COPY_CLEARS, emptyAndScrub, hashesFoundInTheBytesOf } from '../../src/config/what-a-copy-must-not-carry.mjs'
import type { UploadPolicy } from '../../src/shared/storage/destinations.ts'
export const OPTIONAL_TABLES = {
 runHistory:['agent_runs','tool_uses','test_file_runs'],
 apiLog:['api_calls','header_only_calls','hourly_calls','outside_reads','usage_stretches','usage_checks'],
} as const
export const MAX_JSON_BYTES=4*1024*1024
const declaredTables=new Set([...NAMES_A_PART_MAY_NOT_TAKE,...everyPartTable().map(p=>p.name)])
const q=(name:string)=>'"'+name.replaceAll('"','""')+'"'
export type TableClass={name:string;category:string;before_rows:number;kept_rows:number;reason:string}
export function tables(db:Database.Database):string[]{return (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string}[]).map(x=>x.name)}
const count=(db:Database.Database,table:string)=>Number((db.prepare(`SELECT count(*) n FROM ${q(table)}`).get() as {n:number}).n)
const has=(db:Database.Database,table:string)=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)!==undefined
/** The entire SQLite schema is retained. Unknown future tables are explicitly core rather than silently lost. */
export function tableClass(name:string):{category:string;reason:string}{
 if((LEFT_OUT_OF_BACKUPS_AND_EXPORTS as readonly string[]).includes(name))return{category:'legacy-omission',reason:'canonical-backup-omission'}
 if((NOT_CARRIED_TABLES as readonly string[]).includes(name))return{category:'security',reason:'canonical-copy-scrubbing'}
 if(name==='records')return{category:'core',reason:'session-payloads-follow-run-history;identities-and-seals-remain-core'}
 if(name==='changes'||name==='revisions')return{category:'changeLog',reason:'pinned-history-and-governance-always-core'}
 for(const [category,list] of Object.entries(OPTIONAL_TABLES))if((list as readonly string[]).includes(name))return{category,reason:'saved-policy'}
 const declared=declaredTables.has(name)
 return{category:'core',reason:declared?'declared-schema-preserved':'unknown-schema-preserved-as-core'}
}
function jsonRows(db:Database.Database,table:string,column:string,where='1'){
 if(db.prepare(`SELECT 1 FROM ${q(table)} WHERE ${where} AND length(CAST(${q(column)} AS BLOB))>? LIMIT 1`).get(MAX_JSON_BYTES))throw new Error('A JSON row exceeds the bounded history reader limit.')
 return db.prepare(`SELECT ${q(column)} value FROM ${q(table)} WHERE ${where} AND ${q(column)} IS NOT NULL`).iterate() as Iterable<{value:string}>
}
/** Keep reference closure on disk. Nested pins inherit record context (target.record/id + revision.seq/hash). */
function historyPins(db:Database.Database):void {
 db.exec('CREATE TEMP TABLE folder_pins(id TEXT PRIMARY KEY); CREATE TEMP TABLE folder_changes(id TEXT PRIMARY KEY); CREATE TEMP TABLE folder_scanned(id TEXT PRIMARY KEY)')
 const pin=db.prepare('INSERT OR IGNORE INTO folder_pins SELECT id FROM revisions WHERE record_id=? AND (seq=? OR content_hash=?)')
 const byId=db.prepare('INSERT OR IGNORE INTO folder_pins SELECT id FROM revisions WHERE id=?')
 const change=db.prepare('INSERT OR IGNORE INTO folder_changes SELECT id FROM changes WHERE id=?')
 const identityKeys=['record','recordId','record_id','recordID']
 function visit(value:unknown,context?:string):void{
  if(typeof value==='string'){if(/^(message|comment):/.test(value)){
   const id=value.slice(value.indexOf(':')+1);db.prepare('INSERT OR IGNORE INTO folder_pins SELECT id FROM revisions WHERE record_id=? AND seq=1').run(id)
  }return}
  if(!value||typeof value!=='object')return
  if(Array.isArray(value)){for(const child of value)visit(child,context);return}
  const v=value as Record<string,unknown>
  // A record may be named by its id or by an object that carries the id, as in parent: {record: {id}, revision: {seq}}.
  let id=identityKeys.map(k=>v[k]).map(x=>typeof x==='string'?x:x&&typeof x==='object'?(x as Record<string,unknown>).id:undefined).find(x=>typeof x==='string') as string|undefined
  if(!id&&typeof v.id==='string')id=v.id
  if(!id&&v.target&&typeof v.target==='object'){const t=v.target as Record<string,unknown>;id=identityKeys.map(k=>t[k]).find(x=>typeof x==='string') as string|undefined; if(!id&&typeof t.id==='string')id=t.id}
  id??=context
  if(id&&(Number.isInteger(v.seq)||typeof v.contentHash==='string'||typeof v.hash==='string'))pin.run(id,Number.isInteger(v.seq)?v.seq:-1,v.contentHash??v.hash??'')
  for(const [key,child] of Object.entries(v)){
   if(typeof child==='string'&&/change.*id|lastChangeId/i.test(key))change.run(child)
   if(typeof child==='string'&&/revision.*id/i.test(key))byId.run(child)
   visit(child,id)
  }
 }
 const parse=(raw:string,context?:string)=>{try{visit(JSON.parse(raw),context)}catch(error){if(error instanceof SyntaxError)return;throw error}}
 // Current/baseline snapshots, governing history and all explicitly attributed acts stay in core.
 db.exec(`INSERT OR IGNORE INTO folder_pins SELECT id FROM revisions WHERE (kind!='session' AND (seq=1 OR seq=(SELECT max(b.seq) FROM revisions b WHERE b.record_id=revisions.record_id)))
 OR kind IN ('decision','seal','warrant','signature') OR warrant IS NOT NULL OR elevation IS NOT NULL OR signed_item IS NOT NULL OR revokes_seq IS NOT NULL;
 INSERT OR IGNORE INTO folder_pins SELECT b.id FROM revisions a JOIN revisions b ON b.record_id=a.record_id AND b.seq=a.seq-1 WHERE a.warrant IS NOT NULL OR a.elevation IS NOT NULL OR a.signed_item IS NOT NULL;
 INSERT OR IGNORE INTO folder_pins SELECT b.id FROM revisions a JOIN revisions b ON b.record_id=a.record_id AND b.seq=a.revokes_seq WHERE a.revokes_seq IS NOT NULL;
 INSERT OR IGNORE INTO folder_changes SELECT id FROM changes WHERE warrant IS NOT NULL OR elevation IS NOT NULL OR signed_item IS NOT NULL;
 INSERT OR IGNORE INTO folder_changes SELECT last_change_id FROM reader_anchors WHERE last_change_id IS NOT NULL;`)
 const reader=new Database(db.name,{readonly:true,fileMustExist:true})
 try {
 // Parse all JSON-bearing declared tables one bounded row at a time, except optional ledgers.
 for(const table of tables(reader)){
  if(['revisions','changes','records',...RECORD_TEXT_INDEX_TABLES].includes(table as never)||table.startsWith('sqlite_'))continue
  for(const c of reader.prepare(`PRAGMA table_info(${q(table)})`).all() as {name:string;type:string}[]){
   if(!/TEXT/i.test(c.type))continue
   for(const row of jsonRows(reader,table,c.name))if(/^[\s]*[\[{]/.test(row.value))parse(row.value)
  }
 }
 for(const row of reader.prepare('SELECT id,data FROM records').iterate() as Iterable<{id:string;data:string}>){if(Buffer.byteLength(row.data)>MAX_JSON_BYTES)throw new Error('A JSON row exceeds the bounded history reader limit.');parse(row.data,row.id)}
 }finally{reader.close()}
 for(;;){
  const row=db.prepare('SELECT r.* FROM revisions r JOIN folder_pins p ON p.id=r.id LEFT JOIN folder_scanned s ON s.id=r.id WHERE s.id IS NULL LIMIT 1').get() as Record<string,unknown>|undefined
  if(!row)break
  db.prepare('INSERT INTO folder_scanned VALUES(?)').run(row.id)
  for(const [key,value] of Object.entries(row))if(typeof value==='string'&&/data|warrant|elevation|signed_item/.test(key)){if(Buffer.byteLength(value)>MAX_JSON_BYTES)throw new Error('A JSON row exceeds the bounded history reader limit.');parse(value,String(row.record_id))}
 }
}
export function filterCopy(file:string,policy:UploadPolicy):TableClass[]{
 const db=new Database(file);const names=tables(db);const before=new Map(names.map(n=>[n,count(db,n)]))
 try{
  db.pragma('foreign_keys=OFF');emptyAndScrub(db)
  for(const table of LEFT_OUT_OF_BACKUPS_AND_EXPORTS)if(has(db,table))db.exec(`DELETE FROM ${q(table)}`)
  db.exec('BEGIN')
  historyPins(db)
  if(!policy.changeLog){
   db.exec('DELETE FROM revisions WHERE id NOT IN (SELECT id FROM folder_pins); DELETE FROM changes WHERE id NOT IN (SELECT id FROM folder_changes)')
  }
  for(const [category,list] of Object.entries(OPTIONAL_TABLES))if(!policy[category as 'runHistory'|'apiLog'])for(const table of [...list].reverse())if(has(db,table))db.exec(`DELETE FROM ${q(table)}`)
  if(!policy.runHistory){
   // A sealed session is governance evidence. Other sessions keep identity and typed state only.
   db.prepare(`UPDATE records SET data=json_object('state',coalesce(json_extract(data,'$.state'),'finished')) WHERE kind='session' AND json_extract(data,'$.sealedTip') IS NULL AND json_extract(data,'$.submission') IS NULL`).run()

  }
  // Triggers keep record-text derivatives consistent with the reduced session payloads.
  const foreign=db.pragma('foreign_key_check') as unknown[];if(foreign.length)throw new Error('The selected categories would break a foreign key.')
  if(db.pragma('integrity_check',{simple:true})!=='ok')throw new Error('SQLite integrity check failed.')
  const result=names.map(name=>({name,...tableClass(name),before_rows:before.get(name)!,kept_rows:count(db,name)}))
  db.exec('COMMIT')
  db.prepare('VACUUM INTO ?').run(file+'.clean')
  const final=new Database(file+'.clean',{readonly:true,fileMustExist:true});try{for(const row of result)row.kept_rows=count(final,row.name)}finally{final.close()}
  return result
 }finally{db.close();if(requireExists(file+'.clean')){rmSync(file);renameSync(file+'.clean',file)}}
}
import { existsSync as requireExists } from 'node:fs'
/** Whether file's bytes carry a usable key or token hash of source: the canonical byte search, with the hashes streamed in batches of 128. */
export function carriesAHeldHash(source:Database.Database,file:string):boolean{
 const columns=[{table:'held_keys',column:'key_hash'},{table:'run_tokens',column:'token_hash'},...COLUMNS_A_COPY_CLEARS]
 for(const {table,column} of columns){if(!has(source,table))continue;let batch:string[]=[]
  for(const r of source.prepare(`SELECT ${q(column)} hash FROM ${q(table)}`).iterate() as Iterable<{hash:string}>){if(/^[a-f0-9]{64}$/.test(r.hash))batch.push(r.hash);if(batch.length===128){if(hashesFoundInTheBytesOf(file,batch))return true;batch=[]}}
  if(batch.length&&hashesFoundInTheBytesOf(file,batch))return true
 }
 return false
}
export function assertScrubbed(source:Database.Database,file:string):void{if(carriesAHeldHash(source,file))throw new Error('The copy still carries a usable key or token hash.')}
