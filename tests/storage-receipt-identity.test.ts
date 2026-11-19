// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { beforeAll,afterAll,it,expect,vi } from 'vitest'
import { join } from 'node:path'
import { freshDb,apiApp,type TestDb } from './helpers.ts'
import { aTestDatabaseFolder,removeThisTestFolder } from './a-test-folder.ts'
import { recordAttempt,readJournal,type UploadReceipt } from '../src/config/storage/receipts.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
let t:TestDb,spool:string
// The app is built once because it is what reads the role cards that the secretary lookup needs.
beforeAll(async()=>{t=await freshDb();spool=aTestDatabaseFolder('receipt-identity');await (await apiApp()).app.close()})
afterAll(()=>{vi.restoreAllMocks();t?.close();if(spool)removeThisTestFolder(spool)})
const receipt=(attempt:string,over:Partial<UploadReceipt>={}):UploadReceipt=>({version:1,attempt,destination:'synthetic-folder',at:'2026-01-02 00:00:00',status:'uploaded',kind:'base',pack:'/synthetic/pack',base:null,sentBytes:10,heldBytes:10,coreBytes:5,omittedFiles:0,omittedRows:0,warning:false,error:null,...over})
/** The record of one kind for one attempt is stored under the first id of the turn named by the attempt and the kind. */
async function theIdOf(attempt:string,kind:'report'|'note'|'message'):Promise<string>{const ids=await import('../src/server/lib/ids.ts'),{receiptTurn}=await import('../src/server/lib/storage/receipts.ts');const end=ids.idsInTurn(receiptTurn(attempt,kind));try{return ids.anOfficeId()}finally{end()}}
async function theTurnIsFree():Promise<void>{const ids=await import('../src/server/lib/ids.ts');ids.idsInTurn('synthetic probe')()}
const pending=(location:{database:string;spool:string})=>[...readJournal({...location,pendingOnly:true})].map(r=>r.attempt)
it('files a failed upload as a complete report that says it failed and why',async()=>{
 const location={database:t.file,spool:join(spool,'failed')}
 recordAttempt(location,receipt('synthetic-failed',{status:'failed',kind:null,pack:null,sentBytes:0,heldBytes:null,error:'Synthetic refusal before publication.'}))
 const {ingestStorageReceipts}=await import('../src/server/lib/storage/receipts.ts')
 expect(ingestStorageReceipts(location).ingested).toBe(1)
 const row=t.client.sqlite.prepare('SELECT kind,data FROM records WHERE id = ?').get(await theIdOf('synthetic-failed','report')) as {kind:string;data:string}|undefined
 expect(row?.kind).toBe('report')
 const data=JSON.parse(row!.data) as {for?:string;date?:string;blocks:{text:string}[]}
 expect(data.for).toBeTruthy();expect(data.date).toBe('2026-01-02')
 expect(data.blocks[0]!.text).toBe(sayInEnglish('storageDestinations.receiptFailedBody',{destination:'synthetic-folder',error:'Synthetic refusal before publication.'}))
})
it('refuses an id already held by another kind or attempt, writes nothing and leaves the receipt pending',async()=>{
 const location={database:t.file,spool:join(spool,'occupied')},stamp='2026-01-02 00:00:00',occupant=await theIdOf('synthetic-occupied','report')
 t.client.sqlite.prepare("INSERT INTO records(id,owner_id,workspace_id,kind,title,data,created_at,updated_at,origin) VALUES(?,'synthetic-owner','default','note','Synthetic occupant','{}',?,?,'fixture')").run(occupant,stamp,stamp)
 recordAttempt(location,receipt('synthetic-occupied'))
 const {ingestStorageReceipts}=await import('../src/server/lib/storage/receipts.ts')
 expect(()=>ingestStorageReceipts(location)).toThrow(/already held/)
 expect(t.client.sqlite.prepare('SELECT kind,data FROM records WHERE id = ?').get(occupant)).toEqual({kind:'note',data:'{}'})
 expect(pending(location)).toEqual(['synthetic-occupied'])
 await theTurnIsFree()
})
it('ends the id turn when the create throws, then writes the report on the next reading',async()=>{
 const location={database:t.file,spool:join(spool,'throws')}
 recordAttempt(location,receipt('synthetic-throws'))
 const records=await import('../src/server/lib/records.ts')
 const spy=vi.spyOn(records,'createRecord').mockImplementationOnce(()=>{throw new Error('Synthetic create refusal.')})
 const {ingestStorageReceipts}=await import('../src/server/lib/storage/receipts.ts')
 try{expect(()=>ingestStorageReceipts(location)).toThrow('Synthetic create refusal.')}finally{spy.mockRestore()}
 await theTurnIsFree()
 expect(pending(location)).toEqual(['synthetic-throws'])
 expect(ingestStorageReceipts(location).ingested).toBe(1)
 expect(t.client.sqlite.prepare('SELECT kind FROM records WHERE id = ?').get(await theIdOf('synthetic-throws','report'))).toEqual({kind:'report'})
})
