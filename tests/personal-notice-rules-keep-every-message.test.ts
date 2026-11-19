// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type {AddressInfo} from 'node:net'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
let t:TestDb, app:FastifyInstance
const owner={'x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_TEST_OFFICES_OWNER.id,'x-mole-office-workspace':'default'}
beforeAll(async()=>{t=await freshDb();app=(await apiApp()).app;await app.ready()},60_000)
afterAll(async()=>{await app?.close();t?.close()})
async function agent(handle:string){
  const r=await app.inject({method:'POST',url:'/api/agents/started',headers:owner,payload:{handle,name:'Made-up '+handle,role:'worker'}})
  expect(r.statusCode,r.body).toBe(201)
  const {agentByHandle}=await import('../src/server/lib/participants.ts'), {makeAnAgentKey}=await import('../src/server/lib/keys.ts')
  const who=agentByHandle(handle)!
  return {who,headers:{...owner,'x-mole-office-actor-type':'agent','x-mole-office-actor-id':handle,'x-mole-office-key':makeAnAgentKey(who.id,null)}}
}
it('keeps one recipient’s rules and history, refuses every other writer, and restores only its own version',async()=>{
  const a=await agent('notice-reader-a'),b=await agent('notice-reader-b')
  const read=async(headers= a.headers)=>(await app.inject({method:'GET',url:'/api/messages/notice-rules',headers})).json()
  const save=async(payload:object,headers=a.headers)=>app.inject({method:'PUT',url:'/api/messages/notice-rules',headers,payload})
  const first=await read();expect(first.recipient.id).toBe(a.who.id);expect(first.mutedKinds).toEqual([])
  const saved=await save({mutedKinds:['theBroadcastIsDue'],because:'Made-up personal choice',ifVersion:null})
  expect(saved.statusCode,saved.body).toBe(200);const chosen=saved.json();expect(chosen.mutedKinds).toEqual(['theBroadcastIsDue']);expect(chosen.history).toHaveLength(1)
  expect((await read(b.headers)).mutedKinds).toEqual([])
  expect((await save({mutedKinds:[],because:'Made-up forged target',ifVersion:chosen.version,recipient:b.who.id})).statusCode).toBe(400)
  expect((await save({mutedKinds:['not-a-notice'],because:'Made-up bad choice',ifVersion:chosen.version})).statusCode).toBe(400)
  expect((await app.inject({method:'PATCH',url:'/api/records/'+chosen.recordId,headers:b.headers,payload:{dataPatch:{mutedKinds:[]}}})).statusCode).toBe(403)
  expect((await app.inject({method:'DELETE',url:'/api/records/'+chosen.recordId,headers:owner})).statusCode).toBe(403)
  expect((await app.inject({method:'POST',url:'/api/records',headers:b.headers,payload:{kind:'notice_rules',title:'Forged rules',data:{recipient:{kind:'agent',id:a.who.id},mutedKinds:[],because:'Forged'}}})).statusCode).toBe(403)
  const missing=await app.inject({method:'POST',url:'/api/messages/notice-rules/restore',headers:a.headers,payload:{seq:999,because:'Made-up missing version',ifVersion:chosen.version}})
  expect(missing.statusCode,missing.body).toBe(404);expect(missing.json().code).toBe('noticeRulesRefused')
  const defaults=await save({mutedKinds:[],because:'Made-up explicit default',ifVersion:chosen.version});expect(defaults.statusCode,defaults.body).toBe(200)
  expect((await save({mutedKinds:[],because:'Made-up stale choice',ifVersion:chosen.version})).statusCode).toBe(409)
  const restored=await app.inject({method:'POST',url:'/api/messages/notice-rules/restore',headers:a.headers,payload:{seq:1,because:'Made-up restore',ifVersion:defaults.json().version}})
  expect(restored.statusCode,restored.body).toBe(200);expect(restored.json().mutedKinds).toEqual(['theBroadcastIsDue']);expect(restored.json().history).toHaveLength(3)
})
it('holds a waking notice for its recipient at once, including offline worker reads, while keeping it visible and queued',async()=>{
  const a=await agent('notice-waiter-a'), b=await agent('notice-waiter-b')
  const saved=await app.inject({method:'PUT',url:'/api/messages/notice-rules',headers:a.headers,payload:{mutedKinds:['theBroadcastIsDue'],because:'Made-up quiet choice',ifVersion:null}})
  expect(saved.statusCode,saved.body).toBe(200)
  const {writeASystemLineToOne}=await import('../src/server/lib/groups.ts')
  t.client.sqlite.prepare("UPDATE message_delivery SET mark='delivered'").run()
  const line=SYSTEM_LINES.theBroadcastIsDue('Made-up report time')
  const sent=writeASystemLineToOne({kind:'agent',id:a.who.id},'default',line,{type:'system',id:moleOffice().id})
  writeASystemLineToOne({kind:'agent',id:b.who.id},'default',line,{type:'system',id:moleOffice().id})
  const {everythingWaitingFor}=await import('../src/server/lib/handles.ts')
  expect(everythingWaitingFor(a.who.id).find(r=>r.messageId===sent.id)?.wakesNoWaiter).toContain('Your notice wake rule')
  expect(everythingWaitingFor(b.who.id).some(r=>r.wakesNoWaiter!==undefined)).toBe(false)
  const waiting=await app.inject({method:'GET',url:'/api/handles/notice-waiter-a/waiting',headers:a.headers})
  expect(waiting.statusCode,waiting.body).toBe(200);expect(waiting.json().waiting).toEqual([])
  const {theQueue}=await import('../src/server/lib/worker.ts')
  const row=theQueue('default').find(r=>r.messageId===sent.id)!
  expect(row.heldByNoticeRule).toContain('Your notice wake rule');expect(row.needsNoRun).toBeNull()
  const {whyNotNow}=await import('../src/worker/index.ts')
  // The worker's real hold decision must precede its absent-runtime and no-run paths.
  expect(whyNotNow(row as never,{} as never,0)).toMatchObject({because:expect.stringContaining('Your notice wake rule')})
  await app.listen({host:'127.0.0.1',port:0})
  const {onePass}=await import('../src/worker/index.ts')
  const report=await onePass({api:'http://127.0.0.1:'+String((app.server.address() as AddressInfo).port),workspace:'default',session:null,stopWithPid:null,checkout:aCheckoutForATestRun(),runs:2,hops:3,outputRoot:t.file.slice(0,t.file.lastIndexOf('/')),env:{...process.env}},[])
  expect(report.started).toEqual([])
  expect(t.client.sqlite.prepare('SELECT mark FROM message_delivery WHERE message_id=? AND recipient_id=?').get(sent.id,a.who.id)).toEqual({mark:'queued'})
  expect((await app.inject({method:'GET',url:'/api/records/'+sent.id,headers:a.headers})).statusCode).toBe(200)
  const restored=await app.inject({method:'PUT',url:'/api/messages/notice-rules',headers:a.headers,payload:{mutedKinds:[],because:'Made-up wake again',ifVersion:saved.json().version}})
  expect(restored.statusCode,restored.body).toBe(200)
  expect(everythingWaitingFor(a.who.id).find(r=>r.messageId===sent.id)?.wakesNoWaiter).toBeUndefined()
})

it('keeps recipient-bound rules out of generic kind changes in both directions, without losing stored values',async()=>{
  const a=await agent('notice-kind-reader')
  const chosen=await app.inject({method:'PUT',url:'/api/messages/notice-rules',headers:a.headers,payload:{mutedKinds:['theBroadcastIsDue'],because:'Made-up protected choice',ifVersion:null}})
  expect(chosen.statusCode,chosen.body).toBe(200)
  const id=chosen.json().recordId
  const note=t.api.createRecord({workspaceId:'default',kind:'note',title:'Made-up ordinary note',data:{body:'Made-up kept body'},actor:{type:'human',id:THE_TEST_OFFICES_OWNER.id,sessionId:null}})
  for(const [recordId,kind] of [[id,'note'],[note.id,'notice_rules']]){
    const before=t.api.getRecord(recordId)!
    const refused=await app.inject({method:'PATCH',url:'/api/records/'+recordId,headers:owner,payload:{kind}})
    expect(refused.statusCode,refused.body).toBe(403)
    expect(t.api.getRecord(recordId)).toEqual(before)
  }
})
