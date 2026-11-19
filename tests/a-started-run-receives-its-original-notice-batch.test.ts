// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { moleOffice } from '../src/shared/participants.ts'
let db:TestDb,app:FastifyInstance
beforeAll(async()=>{db=await freshDb();app=(await apiApp()).app;await app.ready();await app.listen({host:'127.0.0.1',port:0})},60_000)
afterAll(async()=>{vi.restoreAllMocks();await app?.close();db?.close()})
it('keeps a failed launch queued and gives the next successful launch every frozen original in its initial prompt',async()=>{
  const owner={'x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_TEST_OFFICES_OWNER.id}
  const registered=await app.inject({method:'POST',url:'/api/agents/started',headers:owner,payload:{handle:'batch-launch-reader',name:'Made-up launch reader',role:'worker',runtime:'codex'}})
  expect(registered.statusCode,registered.body).toBe(201)
  const {agentByHandle}=await import('../src/server/lib/participants.ts'),{makeAnAgentKey}=await import('../src/server/lib/keys.ts')
  const who={kind:'agent' as const,id:agentByHandle('batch-launch-reader')!.id}
  const headers={...owner,'x-mole-office-actor-type':'agent','x-mole-office-actor-id':'batch-launch-reader','x-mole-office-key':makeAnAgentKey(who.id,null)}
  const saved=await app.inject({method:'PUT',url:'/api/messages/notice-rules',headers,payload:{mutedKinds:[],batchedKinds:['theBroadcastIsDue'],because:'Made-up launch batch',ifVersion:null}})
  expect(saved.statusCode,saved.body).toBe(200)
  db.client.sqlite.prepare("UPDATE message_delivery SET mark='delivered'").run()
  const {writeASystemLineToOne}=await import('../src/server/lib/groups.ts')
  const notice=()=>writeASystemLineToOne(who,'default',SYSTEM_LINES.theBroadcastIsDue('Made-up launch report'),{type:'system',id:moleOffice().id})
  const first=notice()
  const trigger=db.api.createRecord({kind:'message',workspaceId:'default',title:'Made-up work request',data:{body:'Made-up independent work request',to:[who]},actor:{type:'human',id:THE_TEST_OFFICES_OWNER.id}})
  const {theQueue}=await import('../src/server/lib/worker.ts'),{startOne}=await import('../src/worker/index.ts'),{FakeAdapter}=await import('../src/worker/runtimes/fake.ts')
  const row=theQueue('default').find(one=>one.messageId===trigger.id)!
  const settings={api:'http://127.0.0.1:'+String((app.server.address() as AddressInfo).port),workspace:'default',session:null,stopWithPid:null,checkout:aCheckoutForATestRun(),runs:2,hops:3,outputRoot:dirname(db.file),env:{...withoutInheritedEffort(),MOLE_OFFICE_FAKE_RUNTIME:fileURLToPath(new URL('./fake-runtime.mjs',import.meta.url)),MOLE_OFFICE_AGENT_MODEL:'made-up-model'}}
  const watching:Parameters<typeof startOne>[2]=[]
  const realFetch=globalThis.fetch
  const preparationRefused=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    if(String(input).endsWith('/taken') && typeof init?.body==='string' && JSON.parse(init.body).prepareOnly) return new Response(JSON.stringify({error:'Made-up batch preparation refusal'}),{status:403,headers:{'content-type':'application/json'}})
    return realFetch(input,init)
  })
  try {
    expect(await startOne({...row,body:String(trigger.data['body'])},settings,watching)).toMatchObject({ok:false,because:expect.stringContaining('Made-up batch preparation refusal')})
    expect(watching).toHaveLength(0)
  } finally {preparationRefused.mockRestore()}
  const failed=vi.spyOn(FakeAdapter.prototype,'start').mockImplementation(()=>{throw new Error('Made-up failed launch')})
  const failure=await startOne({...row,body:String(trigger.data['body'])},settings,watching)
  expect(failure.ok).toBe(false);expect(watching).toHaveLength(0)
  const delivery=(id:string)=>(db.client.sqlite.prepare('SELECT mark FROM message_delivery WHERE message_id=? AND recipient_id=?').get(id,who.id) as {mark:string}).mark
  expect(delivery(first.id)).toBe('queued');failed.mockRestore()
  const second=notice()
  let prompt=''
  const original=FakeAdapter.prototype.start
  const launched=vi.spyOn(FakeAdapter.prototype,'start').mockImplementation(function(this:InstanceType<typeof FakeAdapter>,run){prompt=run.prompt;return original.call(this,run)})
  try {
    const result=await startOne({...row,body:String(trigger.data['body'])},settings,watching)
    expect(result.ok,JSON.stringify(result)).toBe(true)
    expect(prompt).toContain(first.id);expect(prompt).toContain(second.id)
    expect(prompt).toContain(String(db.api.getRecord(first.id)!.data['body']));expect(prompt).toContain(String(db.api.getRecord(second.id)!.data['body']))
    expect([first,second].map(n=>delivery(n.id))).toEqual(['delivered','delivered'])
  } finally {launched.mockRestore();for(const run of watching)if(run.adapter.alive(run.handle))run.adapter.stop(run.handle,'The made-up launch test finished.')}
},60_000)
