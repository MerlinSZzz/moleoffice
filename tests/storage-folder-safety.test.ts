// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { beforeAll,afterAll,it,expect,vi } from 'vitest'
import * as fs from 'node:fs'
import { join,dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { freshDb,type TestDb } from './helpers.ts'
import { aTestDatabaseFolder,removeThisTestFolder } from './a-test-folder.ts'
import { DEFAULT_UPLOAD_POLICY,type Destination } from '../src/shared/storage/destinations.ts'
let t:TestDb,folder:string,spool:string,lib:typeof import('../tools/storage/folder.ts')
const d=(name:string):Destination=>({name,kind:'folder',target:{path:folder},policy:{...DEFAULT_UPLOAD_POLICY},limitBytes:100_000_000,enabled:true})
const run=(destination:Destination)=>lib.uploadFolder({database:t.file,destination,spool,now:new Date('2026-10-25T12:00:00Z')})
beforeAll(async()=>{t=await freshDb();folder=aTestDatabaseFolder('safe-folder');spool=aTestDatabaseFolder('safe-spool');lib=await import('../tools/storage/folder.ts');const path=join(dirname(t.file),'report-files','trigger.txt');fs.mkdirSync(join(dirname(path),'empty'),{recursive:true});fs.writeFileSync(path,'synthetic file');const {registerStorageFile}=await import('../src/server/lib/storage/inventory.ts');registerStorageFile(t.client.sqlite,{path:'report-files/trigger.txt',category:'text',bytes:fs.statSync(path).size,fingerprint:createHash('sha256').update(fs.readFileSync(path)).digest('hex')})})
afterAll(()=>{vi.restoreAllMocks();t?.close();if(folder)removeThisTestFolder(folder);if(spool)removeThisTestFolder(spool)})
it('streams pack directories without materializing a filename array',async()=>{
 const spy=vi.spyOn(fs,'readdirSync').mockImplementation(()=>{throw new Error('Unbounded directory listing')})
 try{expect((await run(d('streamed'))).status).toBe('uploaded')}finally{spy.mockRestore()}
})
it('refuses a new unindexed file inserted in an initially empty directory after its walk',async()=>{
 const io=await import('../tools/storage/io.ts'),original=io.transfer,newPath=join(dirname(t.file),'report-files','empty','new.txt');let injected=false
 const spy=vi.spyOn(io,'transfer').mockImplementation((path,to)=>{const result=original(path,to);if(to&&path.endsWith('trigger.txt')&&!injected){injected=true;fs.writeFileSync(newPath,'concurrent unindexed bytes')}return result})
 try{await expect(run(d('directory-change'))).rejects.toThrow(/changed/i);expect(injected).toBe(true)}finally{spy.mockRestore();fs.rmSync(newPath,{force:true})}
})
it('refuses a database write during the file copy before publishing a snapshot',async()=>{
 const io=await import('../tools/storage/io.ts'),original=io.transfer;let injected=false
 const spy=vi.spyOn(io,'transfer').mockImplementation((path,to)=>{const result=original(path,to);if(to&&path.endsWith('trigger.txt')&&!injected){injected=true;t.client.sqlite.prepare("INSERT INTO runtime_settings(name,value) VALUES('synthetic:concurrent','1') ON CONFLICT(name) DO UPDATE SET value='2'").run()}return result})
 try{await expect(run(d('database-change'))).rejects.toThrow(/database changed/i)}finally{spy.mockRestore()}
})
