// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { beforeAll, afterAll, it, expect } from 'vitest'
import { dirname, join } from 'node:path'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { freshDb, type TestDb } from './helpers.ts'
import { avatarPng } from './avatar-upload-fixtures.ts'
import { DEFERRED_STORAGE_STORES } from '../src/shared/storage/categories.ts'
let t: TestDb
let avatars: typeof import('../src/server/lib/avatars.ts')
let reports: typeof import('../src/server/lib/reportfiles.ts')
beforeAll(async()=>{ t=await freshDb(); process.env.MOLE_OFFICE_PREVIEW_ROOTS=dirname(t.file); avatars=await import('../src/server/lib/avatars.ts');reports=await import('../src/server/lib/reportfiles.ts') })
afterAll(()=>t?.close())
function physical(){return ['avatars','report-files'].flatMap(store=>{const folder=join(dirname(t.file),store);return existsSync(folder)?readdirSync(folder,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>join(e.parentPath,e.name)):[]})}
function prove(){
 const expected=physical().map(path=>({path:path.slice(dirname(t.file).length+1),bytes:statSync(path).size,fingerprint:createHash('sha256').update(readFileSync(path)).digest('hex')})).sort((a,b)=>a.path.localeCompare(b.path))
 const rows=t.client.sqlite.prepare("SELECT path,bytes,fingerprint FROM storage_files WHERE path LIKE 'avatars/%' OR path LIKE 'report-files/%' ORDER BY path").all() as typeof expected
 expect(rows.sort((a,b)=>a.path.localeCompare(b.path))).toEqual(expected)
 const sums=t.client.sqlite.prepare('SELECT sum(bytes) bytes,sum(files) files FROM storage_totals').get() as {bytes:number;files:number}
 expect(sums).toEqual({bytes:expected.reduce((n,f)=>n+f.bytes,0),files:expected.length})
}
it('inventories actual compressed blobs, original manifests, repeat receipts and report files exactly once per physical path',()=>{
 const bytes=avatarPng(79,512,512)
 const one=avatars.storeAvatarUpload(bytes,{kind:'agent',id:'synthetic-uploader'})
 const two=avatars.storeAvatarUpload(bytes,{kind:'agent',id:'synthetic-repeat'})
 expect(two.assetId).toBe(one.assetId)
 const image=join(dirname(t.file),one.upload.path)
 expect(statSync(image).size).toBe(one.upload.storedBytes)
 expect(statSync(image).size).toBeLessThan(bytes.length)
 const description=JSON.parse(readFileSync(join(avatars.avatarDirectory(),`${one.upload.originalHash}.json`),'utf8'))
 expect(description).toEqual(one.upload)
 for(const result of [one,two])expect(JSON.parse(readFileSync(join(avatars.avatarDirectory(),'receipts',`${result.receipt}.json`),'utf8'))).toMatchObject({assetId:one.assetId,storedHash:one.upload.storedHash})
 reports.storeAReportFile(Buffer.from('%PDF-1.7 synthetic'),'report.pdf','default')
 reports.storeAReportFile(Buffer.from('synthetic memo'),'memo.txt','default')
 prove()
 expect(DEFERRED_STORAGE_STORES).toEqual([])
 const row=t.client.sqlite.prepare('SELECT path FROM storage_files WHERE path=?').get(one.upload.path) as {path:string}
 t.client.sqlite.prepare("UPDATE storage_files SET category='other' WHERE path=?").run(row.path)
 avatars.storeAvatarUpload(bytes,{kind:'agent',id:'synthetic-repeat'})
 expect(t.client.sqlite.prepare('SELECT category FROM storage_files WHERE path=?').get(row.path)).toEqual({category:'other'})
 prove()
})
it('keeps preview and format refusals before writes and removes a report if its inventory write fails',()=>{
 const before=physical()
 expect(()=>reports.storeAReportFile(Buffer.from('wrong format'),'bad.mp4','default')).toThrow()
 const roots=process.env.MOLE_OFFICE_PREVIEW_ROOTS;process.env.MOLE_OFFICE_PREVIEW_ROOTS='/synthetic-unreadable'
 expect(()=>reports.storeAReportFile(Buffer.from('memo'),'memo.txt','default')).toThrow()
 process.env.MOLE_OFFICE_PREVIEW_ROOTS=roots
 expect(physical()).toEqual(before)
 t.client.sqlite.exec("CREATE TRIGGER synthetic_storage_failure BEFORE INSERT ON storage_files BEGIN SELECT RAISE(ABORT,'synthetic inventory failure'); END")
 try{expect(()=>reports.storeAReportFile(Buffer.from('memo'),'memo.txt','default')).toThrow('synthetic inventory failure')}finally{t.client.sqlite.exec('DROP TRIGGER synthetic_storage_failure')}
 expect(physical()).toEqual(before);prove()
})
