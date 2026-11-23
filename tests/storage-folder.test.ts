// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { beforeAll, afterAll, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { join, dirname } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, statSync } from 'node:fs'
import { freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { DEFAULT_UPLOAD_POLICY, DESTINATION_SETTING, type Destination } from '../src/shared/storage/destinations.ts'
import { STORAGE_STORES } from '../src/shared/storage/categories.ts'
import { NAMES_A_PART_MAY_NOT_TAKE, everyPartTable } from '../src/server/db/every-part-table.ts'
let t:TestDb, folder:string, spool:string, upload:typeof import('../tools/storage/folder.ts')
let cumulativeBase:import('../src/config/storage/receipts.ts').UploadReceipt, firstChange:import('../src/config/storage/receipts.ts').UploadReceipt, secondChange:import('../src/config/storage/receipts.ts').UploadReceipt, limitedBase:import('../src/config/storage/receipts.ts').UploadReceipt
const now=new Date('2026-10-25T12:00:00Z')
const sha=(b:Buffer|string)=>import('node:crypto').then(({createHash})=>createHash('sha256').update(b).digest('hex'))
beforeAll(async()=>{t=await freshDb();folder=aTestDatabaseFolder('folder-destination');spool=aTestDatabaseFolder('folder-receipts');upload=await import('../tools/storage/folder.ts')})
afterAll(()=>{t?.close();if(folder)removeThisTestFolder(folder);if(spool)removeThisTestFolder(spool)})
const policy=()=>({...DEFAULT_UPLOAD_POLICY})
const dest=(name:string, limitBytes=100_000_000):Extract<Destination,{kind:'folder'}>=>({name,kind:'folder',target:{path:folder},policy:policy(),limitBytes,enabled:true})
async function file(path:string,body:string|Buffer,category='text'){
 const target=join(dirname(t.file),path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,body)
 const {registerStorageFile}=await import('../src/server/lib/storage/inventory.ts');registerStorageFile(t.client.sqlite,{path,category:category as never,bytes:Buffer.byteLength(body),fingerprint:await sha(body)});return target
}
const run=(d:Destination,day=now)=>upload.uploadFolder({database:t.file,destination:d,now:day,spool})
const manifest=(pack:string)=>new Database(join(pack,'manifest.sqlite'),{readonly:true})
it('publishes a weekly base and cumulative daily changes needing only base plus chosen change, with deletion and hash checks',async()=>{
 const p=await file('report-files/memo.txt','base memo');await file('report-files/deleted.txt','deleted later')
 cumulativeBase=await run(dest('cumulative'));expect(cumulativeBase.kind).toBe('base');expect(cumulativeBase.status).toBe('uploaded')
})
it('changes the first day relative to the weekly base',async()=>{
 const base=cumulativeBase,d=dest('cumulative')
 await file('report-files/memo.txt','changed memo');await file('report-files/first.txt','first day')
 firstChange=await run(d,new Date('2026-10-26T12:00:00Z'));expect(firstChange.base).toBe(base.pack)
})
it('publishes the second day as cumulative changes against the base',async()=>{
 const base=cumulativeBase,d=dest('cumulative')
 rmSync(join(dirname(t.file),'report-files/deleted.txt'));t.client.sqlite.prepare('DELETE FROM storage_files WHERE path=?').run('report-files/deleted.txt')
 await file('report-files/second.txt','second day')
 secondChange=await run(d,new Date('2026-10-27T12:00:00Z'));expect(secondChange.kind).toBe('change');expect(secondChange.base).toBe(base.pack)
})
it('restores the base plus the chosen change with deletions and every hash checked',()=>{
 const base=cumulativeBase,second=secondChange
 const into=join(spool,'restore-cumulative');const checked=upload.restoreFolder({base:base.pack!,change:second.pack!,into})
 expect(checked.files).toBeGreaterThan(0);expect(readFileSync(join(into,'report-files/first.txt'),'utf8')).toBe('first day');expect(readFileSync(join(into,'report-files/second.txt'),'utf8')).toBe('second day');expect(readFileSync(join(into,'report-files/memo.txt'),'utf8')).toBe('changed memo')
 expect(readdirSync(join(into,'report-files'))).not.toContain('deleted.txt')
 const db=new Database(join(into,'office.db'));expect(db.pragma('integrity_check',{simple:true})).toBe('ok');expect(db.pragma('foreign_key_check')).toEqual([]);db.close()

 const m=manifest(second.pack!);expect(m.prepare('SELECT path FROM files WHERE source=?').all('change').length).toBeGreaterThan(0);m.close()
})
it('starts a new weekly base on Sunday',async()=>{expect((await run(dest('cumulative'),new Date('2026-11-01T12:00:00Z'))).kind).toBe('base')})
it('preserves schema/core reports/chat/governance and pinned history, excludes optional payloads and carries no usable hashes',async()=>{
 const db=t.client.sqlite,stamp='2026-01-01 00:00:00'
 const record=db.prepare("INSERT INTO records(id,owner_id,workspace_id,kind,title,data,created_at,updated_at,origin) VALUES(?,'synthetic-owner','default',?,?,?, ?,?,'fixture')")
 record.run('synthetic-report','report','Synthetic report',JSON.stringify({blocks:[{id:'text',type:'text',text:'core report text'}],context:{target:{id:'synthetic-report'},revision:{seq:2,contentHash:'synthetic-hash-2'}}}),stamp,stamp)
 record.run('synthetic-session','session','Synthetic session',JSON.stringify({doing:'optional session payload',state:'finished'}),stamp,stamp)
 for(const seq of [1,2,3,4])db.prepare("INSERT INTO revisions(id,record_id,workspace_id,seq,content_hash,kind,title,data,op,actor_type,actor_id,at) VALUES(?,?,'default',?,?,'report','Synthetic report','{}','update','system','fixture',?)").run(`synthetic-revision-${seq}`,'synthetic-report',seq,`synthetic-hash-${seq}`,stamp)
 record.run('synthetic-chat','message','Synthetic chat',JSON.stringify({body:'core office chat'}),stamp,stamp)
 record.run('synthetic-governance','decision','Synthetic governance',JSON.stringify({seal:{after:{record:'synthetic-report',id:'synthetic-revision-2',seq:2,hash:'synthetic-hash-2'}},warrant:{where:'message:synthetic-chat'}}),stamp,stamp)
 const keyHash=await sha('synthetic-usable-key'),tokenHash=await sha('synthetic-usable-token')
 db.prepare("INSERT INTO held_keys(id,whose_kind,whose_id,key_hash,made_at) VALUES('synthetic-key','agent','synthetic-worker',?,?)").run(keyHash,stamp)
 db.prepare("INSERT INTO run_tokens(id,run_id,token_hash,allowed_pairs,spend_cap,issued_at,expires_at) VALUES('synthetic-token','synthetic-session',?,'[]',1,1,2)").run(tokenHash)
 const r=await run(dest('core-split'));const into=join(spool,'restore-core');upload.restoreFolder({base:r.pack!,into});const copy=new Database(join(into,'office.db'))
 try{
  const names=(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string}[]).map(x=>x.name)
  expect(copy.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()).toEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all())
  const inventory=manifest(r.pack!);try{const classified=inventory.prepare('SELECT name FROM tables').all() as {name:string}[];expect(classified.map(x=>x.name).sort()).toEqual(names);for(const declared of [...NAMES_A_PART_MAY_NOT_TAKE,...everyPartTable().map(x=>x.name)].filter(n=>names.includes(n)))expect(classified.some(x=>x.name===declared)).toBe(true)}finally{inventory.close()}
  expect(String((copy.prepare('SELECT data FROM records WHERE id=?').get('synthetic-report') as any).data)).toContain('core report text')
  expect(String((copy.prepare('SELECT data FROM records WHERE id=?').get('synthetic-session') as any).data)).not.toContain('optional session payload')
  expect(String((copy.prepare('SELECT data FROM records WHERE id=?').get('synthetic-chat') as any).data)).toContain('core office chat')
  expect(copy.prepare('SELECT id FROM records WHERE id=?').get('synthetic-governance')).toBeTruthy()
  expect(readFileSync(join(into,'office.db')).includes(Buffer.from(keyHash))).toBe(false);expect(readFileSync(join(into,'office.db')).includes(Buffer.from(tokenHash))).toBe(false)
  expect(copy.prepare('SELECT seq FROM revisions WHERE record_id=? ORDER BY seq').all('synthetic-report')).toEqual([{seq:1},{seq:2},{seq:4}])
  for(const table of ['held_keys','run_tokens'])expect(copy.prepare(`SELECT count(*) n FROM ${table}`).get()).toEqual({n:0})
 }finally{copy.close()}
})
it('retains optional history and run payloads when selected',async()=>{
 const all=dest('all-history');all.policy.runHistory=true;all.policy.changeLog=true;all.policy.apiLog=true
 const full=await run(all);const c=new Database(join(full.pack!,'office.db'));try{expect(String((c.prepare('SELECT data FROM records WHERE id=?').get('synthetic-session') as any).data)).toContain('optional session payload');expect(c.prepare('SELECT seq FROM revisions WHERE record_id=?').all('synthetic-report')).toHaveLength(4)}finally{c.close()}
})
it('uses stored media categories and threshold; role cards rather than misleading transcript paths decide defaults',async()=>{
 await file('report-files/disguised.txt','stored category remains pictures','pictures')
 await file('returned-files/legacy.zip',Buffer.from([80,75,3,4]),'other')
 const db=t.client.sqlite,stamp='2026-01-01 00:00:00'
 db.prepare("INSERT OR IGNORE INTO assets(id,kind,origin,mime,created_at) VALUES('synthetic-default-avatar','avatar','default','image/svg+xml',?)").run(stamp)
 for(const [id,role,path] of [['synthetic-secretary','secretary','worker-looking.jsonl'],['synthetic-worker','worker','supervisor-looking.jsonl']]){
  const target=join(spool,path!);writeFileSync(target,'synthetic transcript')
  db.prepare("INSERT INTO agents(id,name,handle,role,created_at,avatar_asset_id) VALUES(?,?,?,?,?,'synthetic-default-avatar')").run(id,id,id,role,stamp)
  db.prepare("INSERT INTO records(id,owner_id,workspace_id,kind,title,data,created_at,updated_at,origin) VALUES(?,'synthetic-owner','default','session','Synthetic session',?,?,?,'fixture')").run(`${id}-session`,JSON.stringify({servingAgentId:id,extra:{discovered:{logPath:target}}}),stamp,stamp)
 }
 const r=await run(dest('roles'));const m=manifest(r.pack!);try{
 expect(m.prepare('SELECT path FROM files WHERE path=?').get('report-files/disguised.txt')).toBeUndefined()
 expect(m.prepare('SELECT reason FROM omissions WHERE path=?').get('report-files/disguised.txt')).toEqual({reason:'policy'})
 expect(m.prepare('SELECT reason FROM omissions WHERE path=?').get('returned-files/legacy.zip')).toEqual({reason:'policy'})
 const transcripts=m.prepare("SELECT path,category FROM files WHERE path LIKE 'transcripts/%'").all() as {path:string;category:string}[]
 expect(transcripts).toHaveLength(1);expect(transcripts[0]!.category).toBe('secretaries')
 }finally{m.close()}
})
it('counts existing packs, retains core beyond the limit, gives exact omissions and journals every destination attempt',async()=>{
 limitedBase=await run(dest('limited'))
})
it('stops optional files while preserving core past a held limit and retaining a warning receipt',async()=>{
 const base=limitedBase,d=dest('limited');const before=upload.heldBytes(dirname(base.pack!));d.limitBytes=before+1
 const r=await run(d,new Date('2026-10-26T12:00:00Z'));expect(r.heldBytes).toBe(upload.heldBytes(dirname(base.pack!)));expect(r.heldBytes).toBeGreaterThan(d.limitBytes);expect(r.coreBytes).toBeGreaterThan(0);expect(r.omittedFiles).toBeGreaterThan(0);expect(r.warning).toBe(true)
 const m=manifest(r.pack!);try{expect(m.prepare("SELECT count(*) n FROM files WHERE source='change'").get()).toEqual({n:0});expect(m.prepare("SELECT count(*) n FROM omissions WHERE reason='limit'").get()).not.toEqual({n:0})}finally{m.close()}
 const receipt=upload.readReceipt({database:t.file,destination:d.name,spool});expect(receipt).toMatchObject({heldBytes:r.heldBytes,status:'uploaded',coreBytes:r.coreBytes})
 expect(Array.from(upload.readJournal({database:t.file,destination:d.name,spool})).length).toBeGreaterThan(1)
 expect(statSync(upload.receiptFolder({database:t.file,spool})).mode&0o777).toBe(0o700)
})
it('refuses unindexed, changed, linked source/destination files and corrupt restore packs without partial success',async()=>{
 const target=await file('report-files/changed.txt','original');writeFileSync(target,'changed without inventory')
 const d=dest('failure');await expect(run(d)).rejects.toThrow(/inventory|changed/i)
 expect(upload.readReceipt({database:t.file,destination:d.name,spool})).toMatchObject({status:'failed'})
 await file('report-files/changed.txt','changed without inventory')
 const outside=join(spool,'outside');writeFileSync(outside,'outside');symlinkSync(outside,join(dirname(t.file),'report-files/link.txt'))
 await expect(run(d)).rejects.toThrow(/link|inventory/i);rmSync(join(dirname(t.file),'report-files/link.txt'))
 const r=await run(dest('corruption'));writeFileSync(join(r.pack!,'office.db'),'corrupt')
 expect(()=>upload.restoreFolder({base:r.pack!,into:join(spool,'corrupt-restore')})).toThrow(/hash|integrity|manifest/i)
 const linked=join(folder,'linked');symlinkSync(spool,linked)
 await expect(run({...dest('linked'),target:{path:linked}})).rejects.toThrow(/link/i)

})

it('omits actual over-threshold files and refuses regular unindexed bytes',async()=>{
 const d=dest('threshold');d.policy.thresholdMB=1
 const body=Buffer.alloc(d.policy.thresholdMB*1_000_000+1,65);await file('report-files/large.txt',body)
 const r=await run(d);const m=manifest(r.pack!);try{expect(m.prepare('SELECT reason FROM omissions WHERE path=?').get('report-files/large.txt')).toEqual({reason:'threshold'})}finally{m.close()}
 const path=join(dirname(t.file),'report-files/unindexed.txt');writeFileSync(path,'no durable category')
 try{await expect(run(dest('unindexed'))).rejects.toThrow(/inventory/i)}finally{rmSync(path)}
})
