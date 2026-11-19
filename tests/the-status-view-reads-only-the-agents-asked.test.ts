// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Scoped status: independent presence and personal words; every unsettled run with observed flow evidence. */
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { seedStatusOffice, STATUS_FIXTURE as F, STATUS_PERSON } from './status-office.ts'
import { AGENTS_LIMIT } from '../src/shared/plugin-read.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
const get = (ids: string, headers = STATUS_PERSON) => app.inject({method:'GET',url:`/api/plugin-read/v1/status?agents=${encodeURIComponent(ids)}`,headers})
beforeAll(async () => { t=await freshDb(); app=(await apiApp()).app; await app.ready(); await seedStatusOffice(t,app) })
afterAll(async () => {
  await app?.close()
  if(t&&process.env.W13Y_STATUS_EVIDENCE)cpSync(dirname(t.file),join(process.env.W13Y_STATUS_EVIDENCE,`database-${process.env.W13Y_STATUS_PHASE??'after'}`),{recursive:true})
  t?.close()
})

it('measures the new read and the unchanged neighbours sequentially on invented data', async () => {
  const paths=[`/api/plugin-read/v1/people?agents=${F.all}`,`/api/plugin-read/v1/work?agents=${F.all}`,'/api/messages/contacts',`/api/presence/agent/${F.all}`,`/api/messages/conversation?kind=agent&id=${F.all}`,`/api/plugin-read/v1/status?agents=${F.all}`,`/api/plugin-read/v1/status?agents=${[F.all,F.presence,F.unrecorded].join(',')}`]
  const results=[]
  for (const path of paths) {
    const samples=[]
    const replies=[]
    let firstBody=''
    for(let i=0;i<7;i++) { const start=performance.now(); const reply=await app.inject({method:'GET',url:path,headers:STATUS_PERSON}); samples.push(performance.now()-start); if(i===0)firstBody=reply.body;replies.push({status:reply.statusCode,hash:createHash('sha256').update(reply.body).digest('hex'),bytes:Buffer.byteLength(reply.body)}) }
    results.push({path,samples,replies,firstBody})
  }
  if(process.env.W13Y_STATUS_EVIDENCE) {mkdirSync(process.env.W13Y_STATUS_EVIDENCE,{recursive:true});writeFileSync(join(process.env.W13Y_STATUS_EVIDENCE,`measure-${process.env.W13Y_STATUS_PHASE??'after'}.json`),JSON.stringify({roster: t.client.sqlite.prepare('SELECT count(*) n FROM agents').get(),newReadHadNoBeforeEndpoint:true,results},null,2))}
  expect(results.slice(0,3).every(r=>r.replies.every(x=>x.status===200))).toBe(true)
})

it('keeps personal words and their setter apart from presence, and carries both unsettled runs and entered flows', async () => {
  const reply=await get(`${F.all},${F.presence},${F.unrecorded},${F.retired},missing,${F.all}`)
  expect(reply.statusCode,reply.body).toBe(200)
  const body=reply.json()
  expect(body.notAgents).toEqual(['missing'])
  expect(body.agents.map((a:any)=>a.id)).toEqual([F.all,F.presence,F.unrecorded,F.retired])
  const keeper=body.agents[0]
  expect(keeper.personal).toMatchObject({text:F.personal,setBy:{kind:'person',id:THE_PERSON}})
  expect(keeper.presence.available).toBe(true)
  expect(keeper.flow.available).toBe(true)
  expect(keeper.flow.value.runs.map((r:any)=>r.run.id).sort()).toEqual(['status-run-one','status-run-two'])
  expect(keeper.flow.value.runs.find((r:any)=>r.run.id==='status-run-one').run).toMatchObject({startedAt:F.latestStart,startedAtMs:expect.any(Number)})
  expect(keeper.flow.value.runs.find((r:any)=>r.run.id==='status-run-two').run.startedAtMs).toBeLessThan(keeper.flow.value.runs.find((r:any)=>r.run.id==='status-run-one').run.startedAtMs)
  expect(keeper.flow.value.runs[0].flows.map((f:any)=>f.record.id)).toContain('status-entered')
  expect(keeper.flow.value.runs.flatMap((r:any)=>r.flows).some((f:any)=>f.lastStep?.does===F.step)).toBe(true)
  expect(body.agents[1].flow).toEqual({available:true,value:{runs:[]}})
  expect(body.agents[2].flow.value.runs[0].flows).toEqual([])
  expect(body.agents[3].retired).toBe(true)
  expect(body.agents[3].presence.value.colour).toBe('red')
  expect(JSON.stringify(body)).not.toContain('status-other-project')
})

it('requires an explicit bounded selection and rejects other query keys',async()=>{
  expect((await app.inject({method:'GET',url:'/api/plugin-read/v1/status',headers:STATUS_PERSON})).statusCode).toBe(400)
  for(const ids of ['bad/id','x'.repeat(AGENTS_LIMIT.idLength+1),Array.from({length:AGENTS_LIMIT.most+1},(_,i)=>`x${i}`).join(',')])expect((await get(ids)).statusCode).toBe(400)
  expect((await get('')).json()).toMatchObject({agents:[],notAgents:[]})
  expect((await app.inject({method:'GET',url:'/api/plugin-read/v1/status?agents=&profiles=all',headers:STATUS_PERSON})).statusCode).toBe(400)
})

it('does not carry a registry identity linked only to another project',async()=>{
  t.client.sqlite.prepare('UPDATE records SET workspace_id=? WHERE id=?').run('message-centre',`${F.presence}-record`)
  const reply=await get(F.presence)
  expect(reply.statusCode,reply.body).toBe(200)
  expect(reply.json()).toMatchObject({agents:[],notAgents:[F.presence]})
})

it('uses the body ETag and does not change domain tables',async()=>{
  const tables=t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[]
  const hash=()=>Object.fromEntries(tables.map(({name})=>[name,createHash('sha256').update(JSON.stringify(t.client.sqlite.prepare(`SELECT * FROM "${name}"`).all())).digest('hex')]))
  const reader=await import('../src/server/lib/messages/status.ts')
  const before=hash()
  reader.readAgentStatus('default',{type:'human',id:THE_PERSON},[F.all])
  expect(hash()).toEqual(before)
  const first=await get(F.all)
  const second=await app.inject({method:'GET',url:`/api/plugin-read/v1/status?agents=${F.all}`,headers:{...STATUS_PERSON,'if-none-match':String(first.headers.etag)}})
  expect(second.statusCode).toBe(304)
})

it('reports a failed flow read as unavailable while preserving personal words and presence',async()=>{
  const flows=await import('../src/server/lib/flow-runs.ts')
  const broken=vi.spyOn(flows,'theFlowRunsOf').mockImplementation(()=>{throw new Error('invented flow read failure')})
  try {const body=(await get(F.all)).json();expect(body.agents[0].flow).toEqual({available:false});expect(body.agents[0].personal.text).toBe(F.personal);expect(body.agents[0].presence.available).toBe(true)} finally{broken.mockRestore()}
})


it('never presents the title of an unrelated, deleted or missing record as the named flow',async()=>{
  const sql=t.client.sqlite
  for(const damage of ['wrong-kind','deleted','missing']) {
    const before=sql.prepare('SELECT * FROM records WHERE id=?').get('status-flow') as Record<string,unknown>
    try {
      if(damage==='wrong-kind')sql.prepare("UPDATE records SET kind='note',title='An unrelated private note' WHERE id=?").run('status-flow')
      else if(damage==='deleted')sql.prepare('UPDATE records SET deleted_at=? WHERE id=?').run(F.at,'status-flow')
      else sql.prepare('DELETE FROM records WHERE id=?').run('status-flow')
      const reply=await get(F.all)
      expect(reply.statusCode,reply.body).toBe(200)
      const body=reply.json()
      expect(body.agents[0].flow.available).toBe(true)
      for(const log of body.agents[0].flow.value.runs.flatMap((r:any)=>r.flows))expect(log.flow).toEqual({id:'status-flow',title:null})
      expect(JSON.stringify(body)).not.toContain('An unrelated private note')
      expect(body.agents[0].flow.value.runs.flatMap((r:any)=>r.flows).some((f:any)=>f.lastStep?.does===F.step)).toBe(true)
    }finally{
      const columns=Object.keys(before)
      sql.prepare(`INSERT OR REPLACE INTO records (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>before[c]))
    }
  }
})

it('carries a run stored under an old id that is filed as an alias of the agent asked about',async()=>{
  const anOldId='an-old-registry-id-of-the-ledger-keeper'
  const {fileRegistryAliases}=await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite,[{namespace:'agent-registry',aliasId:anOldId,canonicalId:F.all}])
  // Written past the door, as a run filed before the agent's id changed would be stored: the old id, and no ranAs.
  t.client.sqlite.prepare("INSERT INTO records (id,workspace_id,owner_id,kind,title,data,origin,created_at,updated_at) VALUES (?,?,?,?,?,?,'fixture',?,?)")
    .run('status-run-under-an-old-id','default',THE_PERSON,'session','Ledger run under an old id',JSON.stringify({state:'running',startedAt:F.olderStart,servingAgentId:anOldId}),F.at,F.at)
  const reply=await get(F.all)
  expect(reply.statusCode,reply.body).toBe(200)
  const runs=reply.json().agents[0].flow.value.runs.map((r:any)=>r.run.id)
  expect(runs).toContain('status-run-under-an-old-id')
  expect(runs).toEqual(expect.arrayContaining(['status-run-one','status-run-two']))
})
