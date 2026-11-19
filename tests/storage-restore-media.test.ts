// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { hashOfBytes } from '../src/server/lib/version.ts'
import Database from 'better-sqlite3'
import { beforeAll,afterAll,it,expect } from 'vitest'
import { join,dirname,relative } from 'node:path'
import { writeFileSync } from 'node:fs'
import { freshDb,apiApp,type TestDb } from './helpers.ts'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13u } from '../src/shared/words/en-wave-13u.ts'
let t:TestDb,app:FastifyInstance
beforeAll(async()=>{t=await freshDb();process.env.MOLE_OFFICE_PREVIEW_ROOTS=dirname(t.file);app=(await apiApp()).app})
afterAll(async()=>{await app?.close();t?.close()})
it('explains only declared restore omissions for report file image video and audio blocks',async()=>{
 const omissions=new Database(join(dirname(t.file),'storage-omissions.sqlite'));omissions.exec('CREATE TABLE omissions(path TEXT PRIMARY KEY,category TEXT,bytes INTEGER,reason TEXT)')
 const blocks=['file','image','video','audio'].map((type,i)=>({id:`synthetic-${i}`,type,path:join(dirname(t.file),'report-files',`synthetic-${i}.${['pdf','png','mp4','wav'][i]}`),...(type==='image'?{alt:'Synthetic attachment'}:type==='file'?{name:'Synthetic attachment',size:100,hash:hashOfBytes(Buffer.from('synthetic omitted bytes'))}:{name:'Synthetic attachment',size:100,hash:hashOfBytes(Buffer.from('synthetic omitted bytes')),alt:'Synthetic attachment'})}))
 for(const block of blocks)omissions.prepare('INSERT INTO omissions VALUES(?,?,?,?)').run(relative(dirname(t.file),block.path),'other',100,'policy');omissions.close()
 const records=await import('../src/server/lib/records.ts');records.createRecord({kind:'report',title:'Synthetic restored report',workspaceId:'default',actor:{type:'human',id:THE_PERSON},data:{blocks}})
 const {previewRefusal,previewStand}=await import('../src/web/components/SummaryBlocks.tsx')
 for(const block of blocks){const r=await app.inject({method:'GET',url:'/api/file?path='+encodeURIComponent(block.path)});expect(r.statusCode,r.body).toBe(404);expect(r.json().code).toBe('storageMediaOmitted');const out=previewRefusal(r.statusCode,r.body);expect(out.phase).toBe('omitted');expect(previewStand(out).said).toBe(enWave13u['storageDestinations.mediaOmitted'])}
 const missing=join(dirname(t.file),'report-files','unexpected.bin');records.createRecord({kind:'report',title:'Synthetic unexpectedly missing attachment',workspaceId:'default',actor:{type:'human',id:THE_PERSON},data:{blocks:[{id:'unexpected',type:'image',path:missing,alt:'Synthetic missing attachment'}]}})
 const r=await app.inject({method:'GET',url:'/api/file?path='+encodeURIComponent(missing)});expect(r.statusCode).toBe(404);expect(r.json().code).not.toBe('storageMediaOmitted');expect(previewRefusal(r.statusCode,r.body).phase).toBe('missing')
})
