// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { beforeEach,afterEach,expect,it } from 'vitest'
import { apiApp,freshDb,type TestDb } from './helpers.ts'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
let t:TestDb,app:FastifyInstance
const headers={'x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_TEST_OFFICES_OWNER.id,'x-mole-office-workspace':'default'}
beforeEach(async()=>{t=await freshDb();app=(await apiApp()).app;await app.ready()})
afterEach(async()=>{await app.close();t.close()})
async function change(changes:object[]){return app.inject({method:'POST',url:'/api/office/settings',headers,payload:{changes,because:'Made-up running choice'}})}
it('reads the stored edit window once per message pool, and a later press changes every expiry',async()=>{
 const name='MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS'
 expect((await change([{name,value:'60'}])).statusCode).toBe(200)
 const ids:string[]=[]
 const add=async(count:number)=>{for(let n=0;n<count;n++){
  const r=await app.inject({method:'POST',url:'/api/records',headers,payload:{kind:'message',title:'Made-up pool message',data:{body:'Made-up pool message',to:[{kind:'person',id:THE_TEST_OFFICES_OWNER.id}]}}})
  expect(r.statusCode,r.body).toBe(201);ids.push(r.json().record.id)
 }}
 const {EVERY_PROJECT,everyMessageOfTheProjects}=await import('../src/server/lib/messages.ts')
 const {aFreshCount,countedTo}=await import('../src/server/lib/slow-requests.ts')
 const read=()=>{const count=aFreshCount();const pool=countedTo(count,()=>everyMessageOfTheProjects(EVERY_PROJECT));return {count,rows:pool.filter(r=>ids.includes(r.id))}}
 await add(4);const first=read();expect(first.rows).toHaveLength(4);expect(first.count.statements).toBeGreaterThan(0)
 await add(16);const bigger=read();expect(bigger.rows).toHaveLength(20);expect(bigger.count.statements).toBe(first.count.statements)
 expect((await change([{name,value:'120'}])).statusCode).toBe(200)
 const next=read()
 for(const row of bigger.rows){const later=next.rows.find(r=>r.id===row.id)!;expect(row.wordsMayChangeUntil).not.toBeNull();expect(Date.parse(later.wordsMayChangeUntil!)-Date.parse(row.wordsMayChangeUntil!)).toBe(60_000)}
})

function realBudget(){
 // The reader checks both runner files before the cap. These synthetic ones pass that check; nothing runs them or calls Modal.
 const dir=t.file.slice(0,t.file.lastIndexOf('/')),token=dir+'/made-up-token.toml',python=dir+'/made-up-python'
 writeFileSync(token,'Synthetic token; never a credential or a real observation.',{mode:0o600});writeFileSync(python,'#!/bin/sh\nexit 1\n',{mode:0o700})
 const script="process.argv=['node','made-up-reader','--entry','made-up-entry','--session','made-up-run','--api','http://127.0.0.1:0','--workdir',process.env.MADE_UP_BUDGET_DIR]; const {THE_MODAL_PARTS}=await import('./tools/merge-tool/arguments.mjs'); const {modalRunnerFiles}=await import('./tools/modal-tests.mjs'); const {whetherASecondOpinionCanBeTaken}=await import('./tools/merge-tool/second-opinion.mjs'); const read=name=>name==='MOLE_OFFICE_MODAL_TOKEN_FILE'?process.env.MADE_UP_TOKEN_FILE:name==='MOLE_OFFICE_MODAL_PYTHON'?process.env.MADE_UP_PYTHON:undefined; console.log(JSON.stringify(whetherASecondOpinionCanBeTaken({runner:'made-up-runner',theRealRunner:'not-used-real-runner',env:{},modal:{...THE_MODAL_PARTS,runnerFiles:()=>modalRunnerFiles(read)}})))"
 return JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,MOLE_OFFICE_DB:t.file,MOLE_OFFICE_MODAL_MONTHLY_CAP_USD:'3',MADE_UP_TOKEN_FILE:token,MADE_UP_PYTHON:python,MADE_UP_BUDGET_DIR:dir},timeout:15_000,encoding:'utf8'}).trim().split('\n').at(-1)!)
}
it('protects the decimal spending number and applies it in the real budget reader without calling Modal',async()=>{
 const name='MOLE_OFFICE_MODAL_MONTHLY_CAP_USD'
 const saved=await change([{name,value:'43.21'}]);expect(saved.statusCode,saved.body).toBe(200)
 expect(saved.json().settings.find((s:{name:string})=>s.name===name)).toMatchObject({value:'43.21',shippedValue:'42.5',ownerDecided:true,source:'the office database',restartRequired:false})
 expect(realBudget()).toEqual({off:null,cap:43.21})
 for(const value of ['-1','lots','0.001','Infinity','900719925474099.99']){
  expect((await change([{name,value}])).statusCode,value).toBe(400);expect(realBudget().cap).toBe(43.21)
 }
 expect((await change([{name,value:'0.29'}])).statusCode).toBe(200);expect(realBudget().cap).toBe(0.29)
 expect((await change([{name,value:'42.5'}])).statusCode).toBe(200);expect(realBudget().cap).toBe(42.5)
 const made=await app.inject({method:'POST',url:'/api/agents/started',headers,payload:{handle:'budget-clerk',name:'Made-up budget clerk',role:'secretary'}});expect(made.statusCode).toBe(201)
 const {agentByHandle}=await import('../src/server/lib/participants.ts'),{makeAnAgentKey}=await import('../src/server/lib/keys.ts'),clerk=agentByHandle('budget-clerk')!
 const asClerk={...headers,'x-mole-office-actor-type':'agent','x-mole-office-actor-id':clerk.handle,'x-mole-office-key':makeAnAgentKey(clerk.id,null)}
 const press=(value:string,warrant?:object)=>app.inject({method:'POST',url:'/api/office/settings',headers:asClerk,payload:{changes:[{name,value}],because:'Made-up spending choice',...(warrant?{warrant}:{})}})
 expect((await press('43.21')).statusCode).toBe(403)
 const warrant={saidBy:THE_TEST_OFFICES_OWNER.id,words:'Made-up words: use a cap of 43.21 dollars.',where:'terminal',when:'2026-10-12 10:00',for:['office.set-settings:'+JSON.stringify([{name,value:'43.21',effective:'43.21',decision:null}])]}
 expect((await press('43.22',warrant)).statusCode).toBe(403);expect((await press('43.21',warrant)).statusCode).toBe(200)
 expect(realBudget().cap).toBe(43.21)
})
