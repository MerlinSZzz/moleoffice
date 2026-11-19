// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { beforeAll,afterAll,it,expect } from 'vitest'
import Database from 'better-sqlite3'
import { join,dirname } from 'node:path'
import { existsSync,mkdirSync,writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { freshDb,type TestDb } from './helpers.ts'
import { aTestDatabaseFolder,removeThisTestFolder } from './a-test-folder.ts'
import { DEFAULT_UPLOAD_POLICY,type Destination } from '../src/shared/storage/destinations.ts'
let t:TestDb,folder:string,spool:string,restored:string
const sha=(b:string)=>createHash('sha256').update(b).digest('hex')
beforeAll(async()=>{t=await freshDb();folder=aTestDatabaseFolder('unsafe-source');spool=aTestDatabaseFolder('unsafe-source-spool');restored=aTestDatabaseFolder('unsafe-source-restore')})
afterAll(()=>{t?.close();for(const f of [folder,spool,restored])if(f)removeThisTestFolder(f)})
it('leaves out and names a selected file and transcript that carry a usable key hash, and keeps the safe file',async()=>{
 const db=t.client.sqlite,stamp='2026-01-01 00:00:00',keyHash=sha('synthetic held key')
 db.prepare("INSERT INTO held_keys(id,whose_kind,whose_id,key_hash,made_at) VALUES('synthetic-unsafe-key','agent','synthetic-unsafe-secretary',?,?)").run(keyHash,stamp)
 const {registerStorageFile}=await import('../src/server/lib/storage/inventory.ts')
 for(const [path,body] of [['report-files/unsafe.txt',`a pasted line ${keyHash} in a note`],['report-files/safe.txt','an ordinary note']] as const){
  const target=join(dirname(t.file),path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,body)
  registerStorageFile(db,{path,category:'text',bytes:Buffer.byteLength(body),fingerprint:sha(body)})
 }
 db.prepare("INSERT OR IGNORE INTO assets(id,kind,origin,mime,created_at) VALUES('synthetic-default-avatar','avatar','default','image/svg+xml',?)").run(stamp)
 db.prepare("INSERT INTO agents(id,name,handle,role,created_at,avatar_asset_id) VALUES('synthetic-unsafe-secretary','synthetic-unsafe-secretary','synthetic-unsafe-secretary','secretary',?,'synthetic-default-avatar')").run(stamp)
 const log=join(spool,'unsafe-transcript.jsonl');writeFileSync(log,JSON.stringify({line:keyHash})+'\n')
 db.prepare("INSERT INTO records(id,owner_id,workspace_id,kind,title,data,created_at,updated_at,origin) VALUES('synthetic-unsafe-session','synthetic-owner','default','session','Synthetic session',?,?,?,'fixture')").run(JSON.stringify({servingAgentId:'synthetic-unsafe-secretary',extra:{discovered:{logPath:log}}}),stamp,stamp)
 const {uploadFolder,restoreFolder,receiptFolder}=await import('../tools/storage/folder.ts')
 const destination:Destination={name:'unsafe',kind:'folder',target:{path:folder},policy:{...DEFAULT_UPLOAD_POLICY},limitBytes:100_000_000,enabled:true}
 const receipt=await uploadFolder({database:t.file,destination,spool,now:new Date('2026-10-25T12:00:00Z')})
 expect(receipt.status).toBe('uploaded')
 const transcript=`transcripts/${sha(log)}.jsonl`,unsafe=[{path:'report-files/unsafe.txt',reason:'unsafe-source'},{path:transcript,reason:'unsafe-source'}]
 const m=new Database(join(receipt.pack!,'manifest.sqlite'),{readonly:true})
 try{
  expect(m.prepare('SELECT path FROM files WHERE path IN (?,?)').all('report-files/unsafe.txt',transcript)).toEqual([])
  expect(m.prepare('SELECT path FROM files WHERE path=?').get('report-files/safe.txt')).toBeTruthy()
  expect(m.prepare("SELECT path,reason FROM omissions WHERE reason='unsafe-source' ORDER BY path").all()).toEqual(unsafe)
 }finally{m.close()}
 const journal=new Database(join(receiptFolder({database:t.file,spool}),'journal.sqlite'),{readonly:true})
 try{expect(journal.prepare("SELECT path,reason FROM omissions WHERE attempt=? AND reason='unsafe-source' ORDER BY path").all(receipt.attempt)).toEqual(unsafe)}finally{journal.close()}
 const into=join(restored,'office');restoreFolder({base:receipt.pack!,into})
 expect(existsSync(join(into,'report-files','unsafe.txt'))).toBe(false);expect(existsSync(join(into,'report-files','safe.txt'))).toBe(true)
 const {declaredStorageOmission}=await import('../src/server/lib/storage/omissions.ts')
 expect(declaredStorageOmission(join(into,'office.db'),join(into,'report-files','unsafe.txt'))).toBe(true)
})
