// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { beforeAll,afterAll,it,expect,vi } from 'vitest'
import * as fs from 'node:fs'
import { dirname,join } from 'node:path'
import { createHash } from 'node:crypto'
import { freshDb,type TestDb } from './helpers.ts'
import { aTestDatabaseFolder,removeThisTestFolder } from './a-test-folder.ts'
import { DEFAULT_UPLOAD_POLICY,type Destination } from '../src/shared/storage/destinations.ts'
let t:TestDb,folder:string,spool:string,lib:typeof import('../tools/storage/folder.ts'),full:import('../src/config/storage/receipts.ts').UploadReceipt
const d=(name:string):Destination=>({name,kind:'folder',target:{path:folder},policy:{...DEFAULT_UPLOAD_POLICY},limitBytes:100_000_000,enabled:true})
const run=(destination:Destination)=>lib.uploadFolder({database:t.file,destination,spool,now:new Date('2026-10-25T12:00:00Z')})
beforeAll(async()=>{t=await freshDb();folder=aTestDatabaseFolder('atomic-folder');spool=aTestDatabaseFolder('atomic-spool');lib=await import('../tools/storage/folder.ts')})
afterAll(()=>{vi.restoreAllMocks();t?.close();if(folder)removeThisTestFolder(folder);if(spool)removeThisTestFolder(spool)})
it('keeps another uploader lock intact on an EEXIST refusal',async()=>{
 const identity=(t.client.sqlite.prepare('SELECT id FROM installation WHERE only_row=1').get() as {id:string}).id
 const root=join(folder,createHash('sha256').update(identity).digest('hex'),'locked'),lock=join(root,'.upload-lock')
 fs.mkdirSync(lock,{recursive:true});fs.writeFileSync(join(lock,'owner'),'another uploader')
 await expect(run(d('locked'))).rejects.toThrow()
 expect(fs.readFileSync(join(lock,'owner'),'utf8')).toBe('another uploader')
})
it('measures a populated optional database separately from its core',async()=>{
 const stamp='2026-01-01 00:00:00'
 t.client.sqlite.prepare("INSERT INTO records(id,owner_id,workspace_id,kind,title,data,created_at,updated_at,origin) VALUES('synthetic-bulk-run','synthetic-owner','default','session','Synthetic bulk run',?,?,?,'fixture')").run(JSON.stringify({state:'finished',doing:'synthetic optional payload '.repeat(4000)}),stamp,stamp)
 const selected=d('full');selected.policy.runHistory=true;full=await run(selected)
 expect(fs.statSync(join(full.pack!,'office.db')).size).toBeGreaterThan(full.coreBytes!)
})
it('includes metadata in the limit before admitting optional database rows',async()=>{
 const selected=d('metadata-limit');selected.policy.runHistory=true;selected.limitBytes=fs.statSync(join(full.pack!,'office.db')).size+1
 const receipt=await run(selected)
 const Database=(await import('better-sqlite3')).default,db=new Database(join(receipt.pack!,'office.db'))
 try{expect(String((db.prepare("SELECT data FROM records WHERE id='synthetic-bulk-run'").get() as {data:string}).data)).not.toContain('synthetic optional payload')}finally{db.close()}
})
it('a journal refusal before publication leaves no successful destination pack',async()=>{
 const receipts=await import('../src/config/storage/receipts.ts'),original=receipts.recordAttempt
 const spy=vi.spyOn(receipts,'recordAttempt').mockImplementation((location,receipt,omissions)=>{if(receipt.status==='prepared')throw new Error('synthetic journal failure');return original(location,receipt,omissions)})
 try{await expect(run(d('journal-failure'))).rejects.toThrow('synthetic journal failure')}finally{spy.mockRestore()}
 const last=lib.readReceipt({database:t.file,destination:'journal-failure',spool});expect(last?.status).toBe('failed');expect(last?.pack).toBeNull()
})
it('a publication refusal retains a failed receipt and no published pack',async()=>{
 const original=fs.renameSync
 const spy=vi.spyOn(fs,'renameSync').mockImplementation((from,to)=>{if(String(from).includes('.partial-'))throw new Error('synthetic publication failure');return original(from,to)})
 try{await expect(run(d('publication-failure'))).rejects.toThrow('synthetic publication failure')}finally{spy.mockRestore()}
 const last=lib.readReceipt({database:t.file,destination:'publication-failure',spool});expect(last?.status).toBe('failed');expect(last?.pack).toBeNull()
})
