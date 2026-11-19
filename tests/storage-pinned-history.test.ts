// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import Database from 'better-sqlite3'
import { beforeAll,afterAll,it,expect } from 'vitest'
import { join } from 'node:path'
import { freshDb,type TestDb } from './helpers.ts'
import { aTestDatabaseFolder,removeThisTestFolder } from './a-test-folder.ts'
import { DEFAULT_UPLOAD_POLICY } from '../src/shared/storage/destinations.ts'
let t:TestDb,out:string
beforeAll(async()=>{t=await freshDb();out=aTestDatabaseFolder('pinned-history')})
afterAll(()=>{t?.close();if(out)removeThisTestFolder(out)})
it('keeps independent parent-target nested pins, sealed revision IDs and reader-anchor changes with their closure',async()=>{
 const db=t.client.sqlite,stamp='2026-01-01 00:00:00',targets=['synthetic-context-target','synthetic-seal-target','synthetic-object-target']
 const add=db.prepare("INSERT INTO records(id,owner_id,workspace_id,kind,title,data,created_at,updated_at,origin) VALUES(?,'synthetic-owner','default','report','Synthetic pinned report',?,?,?,'fixture')")
 const revision=db.prepare("INSERT INTO revisions(id,record_id,workspace_id,seq,content_hash,kind,title,data,op,actor_type,actor_id,at) VALUES(?,?,'default',?,?,'report','Synthetic revision','{}','update','system','fixture',?)")
 for(const target of targets){add.run(target,'{}',stamp,stamp);for(const seq of [1,2,3,4])revision.run(`${target}-${seq}`,target,seq,`${target}-hash-${seq}`,stamp)}
 add.run('synthetic-references',JSON.stringify({context:{target:{id:targets[0]},revision:{seq:2,contentHash:`${targets[0]}-hash-2`}},seal:{after:{record:targets[1],id:`${targets[1]}-2`,seq:2,hash:`${targets[1]}-hash-2`}},parent:{record:{id:targets[2]},revision:{seq:2,contentHash:`${targets[2]}-hash-2`}}}),stamp,stamp)
 db.prepare("INSERT INTO changes(id,record_id,workspace_id,op,actor_type,actor_id,at) VALUES('synthetic-anchor-change',?,'default','update','system','fixture',?)").run(targets[0],stamp)
 db.prepare("INSERT INTO reader_anchors(workspace_id,reader,last_seen_at,last_change_id) VALUES('default','synthetic-reader',?,'synthetic-anchor-change')").run(stamp)
 const file=join(out,'copy.db');db.prepare('VACUUM INTO ?').run(file);const {filterCopy}=await import('../tools/storage/records.ts');filterCopy(file,{...DEFAULT_UPLOAD_POLICY})
 const copy=new Database(file);try{for(const target of targets)expect(copy.prepare('SELECT seq FROM revisions WHERE record_id=? ORDER BY seq').all(target),target).toEqual([{seq:1},{seq:2},{seq:4}]);expect(copy.prepare("SELECT id FROM changes WHERE id='synthetic-anchor-change'").get()).toBeTruthy();expect(copy.pragma('foreign_key_check')).toEqual([])}finally{copy.close()}
})
