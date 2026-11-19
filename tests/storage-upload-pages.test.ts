// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { hashOfBytes } from '../src/server/lib/version.ts'
import Database from 'better-sqlite3'
import { beforeAll,afterAll,it,expect } from 'vitest'
import { mkdirSync,rmSync } from 'node:fs'
import { join,relative } from 'node:path'
import { liveApp,waitForThePage,type LiveApp } from './helpers.ts'
import { aTestDatabaseFolder,removeThisTestFolder } from './a-test-folder.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { DEFAULT_UPLOAD_POLICY,DESTINATION_SETTING } from '../src/shared/storage/destinations.ts'
import { recordAttempt,type UploadReceipt } from '../src/config/storage/receipts.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { englishWords } from '../src/shared/words/joined.ts'
const words=englishWords() as unknown as Record<string,string>,w=(key:string)=>words[`storageDestinations.${key}`]!
let app:LiveApp,home:string,oldHome:string|undefined,report:string
const receipt:UploadReceipt={version:1,attempt:'synthetic-browser-receipt',destination:'synthetic-archive',at:'2026-01-01 10:30:00',status:'failed',kind:'change',pack:null,base:'/synthetic/base',sentBytes:0,heldBytes:850_000,coreBytes:200_000,omittedFiles:4,omittedRows:3,warning:true,error:'Synthetic destination is unavailable.'}
beforeAll(async()=>{
 home=aTestDatabaseFolder('upload-pages-home');oldHome=process.env.HOME;process.env.HOME=home
 app=await liveApp({name:'storage-upload-pages',opensAt:'full',viewport:{width:1440,height:1000},theDevServerBecause:'The changed receipt and restore-omission components must be served before the joined build.'})
 const db=new Database(join(app.dir,'panelx.db'))
 try{db.prepare('INSERT INTO runtime_settings(name,value) VALUES(?,?)').run(DESTINATION_SETTING,JSON.stringify([{name:receipt.destination,kind:'folder',target:{path:'/synthetic/archive'},policy:DEFAULT_UPLOAD_POLICY,limitBytes:1_000_000,enabled:true}]))}finally{db.close()}
 recordAttempt({database:join(app.dir,'panelx.db')},receipt)
 const omission=new Database(join(app.dir,'storage-omissions.sqlite'));omission.exec('CREATE TABLE omissions(path TEXT PRIMARY KEY,category TEXT,bytes INTEGER,reason TEXT)')
 const blocks=['file','image','video','audio'].map((type,i)=>({id:`synthetic-${i}`,type,path:join(app.dir,'report-files',`synthetic-${i}.${['pdf','png','mp4','wav'][i]}`),...(type==='image'?{alt:'Synthetic restored picture'}:type==='file'?{name:'Synthetic document',size:100,hash:hashOfBytes(Buffer.from('synthetic omitted bytes'))}:{name:`Synthetic ${type}`,size:100,hash:hashOfBytes(Buffer.from('synthetic omitted bytes')),alt:`Synthetic ${type}`})}))
 for(const block of blocks)omission.prepare('INSERT INTO omissions VALUES(?,?,?,?)').run(relative(app.dir,block.path),'other',100,'policy');omission.close()
 const headers={'content-type':'application/json','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON,'x-mole-office-workspace':'default'}
 const r=await fetch(app.api+'/api/records',{method:'POST',headers,body:JSON.stringify({kind:'report',title:'Synthetic restored report',data:{blocks:[{id:'intro',type:'text',text:'Synthetic report text remains available. Attached files were deliberately omitted from this backup.'},...blocks]}})});expect(r.status,await r.clone().text()).toBe(201);report=(await r.json() as {record:{id:string}}).record.id
 const load=await fetch(app.api+`/api/participants/person/${THE_PERSON}`,{method:'PATCH',headers,body:JSON.stringify({mediaLoad:'with-page'})});expect(load.status,await load.text()).toBe(200)
})
afterAll(async()=>{await app?.stop();if(oldHome===undefined)delete process.env.HOME;else process.env.HOME=oldHome;if(home)removeThisTestFolder(home)})
async function pictures(kind:string,selector:string){const out=process.env.STORAGE_UPLOAD_SHOTS;if(!out)return;mkdirSync(out,{recursive:true});await putTheMadeUpLabelIn(app.page,'Synthetic office — receipt sizes and omitted attachments are made up',app.page.locator(selector),'storage upload evidence');for(const width of [1440,990,660,390])for(const theme of ['light','dark'] as const){await app.page.setViewportSize({width,height:1000});await app.page.emulateMedia({colorScheme:theme});await app.page.evaluate(()=>window.scrollTo(0,0));expect(await app.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await app.page.screenshot({path:join(out,`${kind}-${width}-${theme}.png`),fullPage:true})}}
it('shows the last receipt held/core size exact omission count and error on settings',async()=>{
 await app.page.goto(app.site+'/?lang=en#/settings/storage');await waitForThePage(app.page,30_000);await app.page.getByRole('button',{name:receipt.destination,exact:true}).click()
 const panel=app.page.locator('[data-storage-destinations]');expect(await panel.locator('[data-storage-upload]').textContent()).toContain(receipt.at);expect(await panel.locator('[data-storage-held]').textContent()).toContain(`${receipt.heldBytes!/1_000_000} MB`);expect(await panel.locator('[data-storage-core]').textContent()).toContain(`${receipt.coreBytes!/1_000_000} MB`);expect(await panel.locator('[data-storage-omissions]').textContent()).toContain(String(receipt.omittedFiles));expect(await panel.locator('[data-storage-error]').textContent()).toContain(receipt.error!);expect(await panel.textContent()).toContain(w('capacityNotice'))
 await pictures('settings','[data-settings-panel="settings.storage"]')
})
it('shows declared omissions for all report attachment renderers and offers no broken player',async()=>{
 await app.page.goto(app.site+`/?lang=en#/r/${report}`);await waitForThePage(app.page,30_000)
 await app.page.locator('.sb-image-stand[data-preview="omitted"]').first().waitFor({timeout:30_000})
 expect(await app.page.locator('.sb-image-stand[data-preview="omitted"]').count()).toBe(4)
 expect(await app.page.locator('video,audio').count()).toBe(0)
 await pictures('report','.rp')
})
