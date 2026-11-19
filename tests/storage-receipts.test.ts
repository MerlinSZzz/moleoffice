// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { beforeAll,afterAll,it,expect,vi } from 'vitest'
import { join } from 'node:path'
import { readFileSync,readdirSync } from 'node:fs'
import { freshDb,apiApp,type TestDb } from './helpers.ts'
import { aTestDatabaseFolder,removeThisTestFolder } from './a-test-folder.ts'
import { recordAttempt,type UploadReceipt } from '../src/config/storage/receipts.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { DEFAULT_UPLOAD_POLICY,DESTINATION_SETTING } from '../src/shared/storage/destinations.ts'
let t:TestDb,spool:string
beforeAll(async()=>{t=await freshDb();spool=aTestDatabaseFolder('receipt-ingestion');const app=(await apiApp()).app;try{const registered=await app.inject({method:'POST',url:'/api/agents/started',headers:{'x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON,'x-mole-office-workspace':'default'},payload:{handle:'synthetic-storage-secretary',name:'Synthetic storage secretary',role:'secretary'}});expect(registered.statusCode,registered.body).toBe(201)}finally{await app.close()}})
afterAll(()=>{t?.close();if(spool)removeThisTestFolder(spool)})
it('reads bounded receipt metadata and idempotently ingests a retained C notice plus one secretary line',async()=>{
 const receipt:UploadReceipt={version:1,attempt:'synthetic-attempt',destination:'synthetic-folder',at:'2026-01-01 00:00:00',status:'uploaded',kind:'base',pack:'/synthetic/pack',base:null,sentBytes:900,heldBytes:900,coreBytes:500,omittedFiles:2,omittedRows:3,warning:true,error:null}
 const location={database:t.file,spool};recordAttempt(location,receipt,[{path:'report-files/omitted.png',category:'pictures',bytes:100,reason:'policy'}])
 t.client.sqlite.prepare('INSERT INTO runtime_settings(name,value) VALUES(?,?)').run(DESTINATION_SETTING,JSON.stringify([{name:receipt.destination,kind:'folder',target:{path:'/synthetic/archive'},policy:DEFAULT_UPLOAD_POLICY,enabled:true,limitBytes:1000}]))
 const settings=await import('../src/server/lib/storage/destinations.ts')
 expect(settings.destinationSettingsReading(true,spool).destinations[0]).toMatchObject({heldBytes:receipt.heldBytes,lastUpload:receipt.at,coreBytes:receipt.coreBytes,omittedFiles:receipt.omittedFiles,lastError:null})
 const ingestion=await import('../src/server/lib/storage/receipts.ts')
 const original=t.client.sqlite.prepare.bind(t.client.sqlite)
 const spy=vi.spyOn(t.client.sqlite,'prepare').mockImplementation(((sql:string)=>{if(/FROM records/i.test(sql)&&sql.includes('storageUpload')&&!/WHERE id\s*=/i.test(sql))throw new Error('Receipt identity must use the record primary key.');return original(sql)}) as typeof t.client.sqlite.prepare)
 try{expect(ingestion.ingestStorageReceipts(location).ingested).toBe(1)}finally{spy.mockRestore()}
 expect(ingestion.ingestStorageReceipts(location).ingested).toBe(0)
 const rows=t.client.sqlite.prepare("SELECT kind,data FROM records WHERE json_extract(data,'$.extra.storageUpload.attempt')=? ORDER BY kind").all(receipt.attempt) as {kind:string;data:string}[]
 expect(rows.filter(r=>r.kind==='report')).toHaveLength(1);expect(rows.filter(r=>r.kind==='note')).toHaveLength(1);expect(rows.filter(r=>r.kind==='message')).toHaveLength(1)
 const reportData=JSON.parse(rows.find(r=>r.kind==='report')!.data);expect(reportData.date).toBe(receipt.at.slice(0,10));expect(reportData.for).toBeTruthy()
 const notice=JSON.parse(rows.find(r=>r.kind==='note')!.data);expect(notice.extra.storageUpload.noticeClass).toBe('C')
 expect(JSON.stringify(rows)).not.toContain('key_hash')
})
