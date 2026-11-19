// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic HTTP/SQLite fixtures for the authoritative repair problem and ordinary queue correlations.
 * Criterion: existing problem.cause stays prose. New machine state is strict and own-run proved;
 * original creates survive edits/deletes for uniqueness, and waiting-only withdrawal refuses testing.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb, app: FastifyInstance, root: string, evidenceDir: string, controller: string, controllerKey: string, controllerAgent: string, secretaryKey: string
let base: string, causalCommit: string, tree: string, causalEntry: string
const officeKey = randomBytes(32).toString('hex')
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const headers = (id: string, key?: string, run?: string) => ({
  'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id,
  ...(key ? { 'x-mole-office-key': key } : {}), ...(run ? { 'x-mole-office-session': run } : {}),
})
const asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const own = () => headers('repair-secretary', controllerKey, controller)
async function call(method: 'GET'|'POST'|'PATCH'|'DELETE', url: string, payload?: unknown, who:Record<string,string> = own()) {
  const r = await app.inject({ method, url, headers: who, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: r.statusCode, body: r.json() as Record<string, any> }
}
function git(...args: string[]) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, HOME: root } }).trim() }
function corpus() { return JSON.stringify(['records','changes','revisions','links'].map(table => t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())) }
function rawData(id: string, data: Record<string, unknown>) { t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id) }
function receipt(endedAt = '2026-10-15 09:20:00', commit = causalCommit, receiptTree = tree) {
  return t.api.createRecord({ kind: 'whole_suite_receipt', title: 'Synthetic original red receipt', workspaceId: 'default', actor: person, origin: 'fixture', data: {
    version: 1, repository: root, clone: `${root}/synthetic-clone`, commit, tree:receiptTree,
    startedAt: '2026-10-15 09:00:00', endedAt, where: 'cloud box', buildExitCode: 0, suiteExitCode: 1,
    failedFiles: ['work/a.txt'], failedTests: [{file:'work/a.txt',name:'Synthetic failing test'}],
    coverage: {expectedCount:1,observedCount:1,missing:[],unexpected:[]},
    artifacts: ['log','report','manifest','reads'].map(name=>({name,path:`${root}/${name}`,sha256Base64:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='})),
  } })
}
function namespace(endedAt = '2026-10-15 09:20:00') {
  const r = receipt(endedAt)
  return { receipt:{recordId:r.id,seq:1,contentHash:t.api.versionOf(r)}, repository:root,commit:causalCommit,tree,
    failedFiles:['work/a.txt'],failedTests:[{file:'work/a.txt',name:'Synthetic failing test'}],
    originalEndedAt:endedAt,timeZone:'UTC',endedAtMs:Date.UTC(2026,9,15,9,20),deadlineMs:Date.UTC(2026,9,15,10,20),
    cause:[{entry:causalEntry,commits:[causalCommit],how:'only-change'}],fixRound:{run:null,startedAt:null,deadline:'2026-10-15 10:20:00'},claim:{agent:controllerAgent,run:controller},
  }
}
async function problem(ns = namespace()) {
  return call('POST','/api/records',{kind:'problem',title:'Synthetic main suite repair',data:{cause:'Existing prose remains.',mainSuiteFix:ns}})
}
async function freshController() {
  const made=await call('POST','/api/records',{kind:'session',title:'Synthetic original Office-minted controller',data:{state:'running',runtime:'mole-office',servingAgentId:controllerAgent,servingAgent:'repair-secretary',startedByMoleOffice:true}},headers('mole-office/the-message-worker',officeKey))
  expect(made.status).toBe(201);expect(typeof made.body.runKey?.key).toBe('string')
  controller=made.body.record.id;controllerKey=made.body.runKey.key
}
async function read(id: string) { return call('GET',`/api/records/${id}`) }
async function patch(id: string, ns: unknown, version?: string) {
  return call('PATCH',`/api/records/${id}`,{dataPatch:{mainSuiteFix:ns},...(version ? {ifVersion:version}: {})})
}
async function sealedRun() {
  const run=t.api.createRecord({kind:'session',title:'Synthetic checked repair author',workspaceId:'default',actor:person,origin:'fixture',data:{state:'running',servingAgent:'repair-author',workingDirectory:root,cutFrom:base}})
  t.api.patchRecord(run.id,{dataPatch:{state:'finished'}},person)
  const sealId=t.api.getRecord(run.id)!.data['sealedTip'] as string
  const seal=t.api.getRecord(sealId)!.data['seal'] as {hash:string,git:{commit:string}}
  writeAVerdictAsItsDoorWould(t,run.id,{released:{by:{kind:'agent',id:'synthetic-inspector'},at:'2026-10-15 09:30:00',how:'an inspector',check:'synthetic-check',read:{sealId,sealHash:seal.hash,worktree:root,tip:seal.git.commit,ofItsOwn:true,says:'Synthetic check fixture.'}}})
  return run.id
}
async function submit(run: string, extra: Record<string, unknown> = {}) {
  return call('POST','/api/merge-queue',{run,changeset:{adapter:'git',repository:'repair-fixture'},...extra})
}
beforeAll(async()=>{
  t=await freshDb()
  writeFileSync(join(dirname(t.file),'keys.json'),JSON.stringify({person:randomBytes(32).toString('hex'),office:officeKey,providers:{}}),{mode:0o600})
  app=(await apiApp()).app
  const registered=await call('POST','/api/agents/started',{handle:'repair-secretary',name:'Synthetic secretary',role:'secretary',runtime:'codex'},asPerson)
  expect(registered.status).toBe(201)
  secretaryKey=registered.body.whatToGiveIt.key
  controllerAgent=(t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('repair-secretary') as {id:string}).id
  await freshController()
  expect((await call('POST','/api/agents/started',{handle:'repair-author',name:'Synthetic code author',workArea:['work']},own())).status).toBe(201)
  mkdirSync('.logs',{recursive:true});root=mkdtempSync(join(process.cwd(),'.logs','main-suite-fix-'))
  // Retained synthetic probes have their own temporary folder, separate from the fixture git tree.
  evidenceDir=mkdtempSync(join(process.cwd(),'.logs','main-suite-fix-evidence-'))
  git('init','-q','-b','main');git('config','user.name','Synthetic repair fixture');git('config','user.email','fixture@example.invalid')
  mkdirSync(join(root,'work'));writeFileSync(join(root,'work/a.txt'),'before\n');git('add','.');git('commit','-qm','Synthetic baseline');base=git('rev-parse','HEAD')
  writeFileSync(join(root,'work/a.txt'),'causal change\n');git('add','.');git('commit','-qm','Synthetic causal change');causalCommit=git('rev-parse','HEAD');tree=git('rev-parse','HEAD^{tree}')
  git('switch','-q','-c','author')
  const repositories=await import('../src/server/lib/repositories.ts');repositories.registerRepository({workspaceId:'default',name:'repair-fixture',root,actor:person})
  const runId=await sealedRun();const normal=await submit(runId);expect(normal.status,JSON.stringify(normal.body)).toBe(201);causalEntry=normal.body.entry.id
  const data=t.api.getRecord(causalEntry)!.data
  rawData(causalEntry,{...data,state:'merged',toolWanted:null,integrated:{entry:causalEntry,mainBefore:base,mainAfter:causalCommit,rebasedTip:causalCommit,at:'2026-10-15 09:00:00'}})
},60_000)
beforeEach(async()=>{await freshController()})
afterAll(async()=>{await app?.close();t?.close();if(root)rmSync(root,{recursive:true,force:true})})

it('strictly stores the namespace without changing prose and rejects invented fields or a reset deadline',async()=>{
  const ns=namespace();const good=await problem(ns);expect(good.status,JSON.stringify(good.body)).toBe(201);expect(good.body.record.data.cause).toBe('Existing prose remains.')
  for(const change of [{...namespace(),surprise:true},{...namespace(),deadlineMs:ns.deadlineMs+1},{...namespace(),cause:[],causeUnknown:undefined}]) {
    const before=corpus();const bad=await problem(change as typeof ns);expect(bad.status).toBe(400);expect(corpus()).toBe(before)
  }
})
it('requires the actual normalized own run key and current secretary card before namespace writes',async()=>{
  const ns=namespace()
  const traced=vi.spyOn(t.client.sqlite,'prepare')
  let ordinary:Awaited<ReturnType<typeof call>>,queries:string[]=[]
  try {
    ordinary=await call('GET',`/api/records/${ns.receipt.recordId}`)
    queries=traced.mock.calls.map(([sql])=>String(sql))
  } finally {traced.mockRestore()}
  const lookups=queries.filter(sql=>sql.includes("FROM revisions WHERE json_extract(data, '$.extra.runKeyId')"))
  const keyId=(t.api.getRecord(controller)!.data['extra'] as {runKeyId:string}).runKeyId
  const plans=lookups.map(sql=>({sql,explain:t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(keyId)}))
  writeFileSync(join(evidenceDir,'ordinary-own-key-lookups.json'),JSON.stringify({synthetic:true,request:`GET /api/records/${ns.receipt.recordId}`,status:ordinary!.status,preparedStatements:queries.length,provenanceLookups:lookups.length,plans},null,2))
  expect(ordinary!.status).toBe(200);expect(lookups).toHaveLength(0)
  const precedence={
    queueUnregisteredMalformed:await call('POST','/api/merge-queue',{run:null},headers('synthetic-unregistered-caller')),
    queuePartialMalformed:await call('POST','/api/merge-queue',{run:null},{'x-mole-office-workspace':'default','x-mole-office-actor-type':'agent'}),
    missingRecordBadWarrant:await call('PATCH','/api/records/synthetic-missing-record',{title:'Synthetic precedence probe',warrant:{}}),
  }
  writeFileSync(join(evidenceDir,'ordinary-precedence.json'),JSON.stringify({synthetic:true,...precedence},null,2))
  expect(precedence.queueUnregisteredMalformed.status).toBe(400)
  expect(precedence.queuePartialMalformed.status).toBe(400);expect(precedence.queuePartialMalformed.body.error).toContain('x-mole-office-actor-id is missing')
  expect(precedence.missingRecordBadWarrant.status).toBe(403);expect(precedence.missingRecordBadWarrant.body.error).toContain('A warrant needs saidBy, words, where, when')
  const other=t.api.createRecord({kind:'session',title:'Synthetic other continuing secretary run',workspaceId:'default',actor:person,origin:'fixture',data:{state:'running',servingAgent:'repair-secretary'}})
  const before=corpus()
  for(const who of [headers('repair-secretary'),headers('repair-secretary',secretaryKey,controller),asPerson,headers('mole-office/the-message-worker',officeKey),headers('repair-secretary',controllerKey,'some-other-run')]) {
    const bad=await call('POST','/api/records',{kind:'problem',title:'Synthetic forged claim',data:{mainSuiteFix:ns}},who)
    expect(bad.status,JSON.stringify(bad.body)).toBe(403);expect(corpus()).toBe(before)
  }
  const forged=await call('POST','/api/records',{kind:'problem',title:'Synthetic forged own run header',data:{mainSuiteFix:{...ns,claim:{...ns.claim,run:other.id}}}},headers('repair-secretary',controllerKey,other.id))
  expect(forged.status).toBe(403);expect(corpus()).toBe(before)
  t.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run('worker',controllerAgent)
  expect((await problem(ns)).status).toBe(403)
  t.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run('secretary',controllerAgent)
  expect((await problem(ns)).status).toBe(201)
})
it('reserves one original problem across concurrent creates retries edits and deletion',async()=>{
  const ns=namespace();const both=await Promise.all([problem(ns),problem(ns)])
  expect(both.map(r=>r.status).sort()).toEqual([201,409])
  const first=both.find(r=>r.status===201)!.body.record.id as string
  expect((await call('PATCH',`/api/records/${first}`,{title:'Synthetic ordinary edited problem',dataPatch:{cause:'Edited prose.'}})).status).toBe(200)
  expect((await call('DELETE',`/api/records/${first}`)).status).toBe(200)
  const before=corpus(),retry=await problem(ns);expect(retry.status).toBe(409);expect(JSON.stringify(retry.body)).toContain(first);expect(corpus()).toBe(before)
  await freshController()
  const crossBefore=corpus(),crossRun=await problem({...ns,claim:{agent:controllerAgent,run:controller}})
  expect(crossRun.status).toBe(409);expect(JSON.stringify(crossRun.body)).toContain(first);expect(corpus()).toBe(crossBefore)
})
it('keeps an own run key bound to its original mint when another run copies its public key row ID',async()=>{
  const ns=namespace()
  const created=await call('POST','/api/records',{kind:'session',title:'Synthetic copied key metadata run',data:{state:'running',servingAgent:'repair-secretary'}})
  expect(created.status).toBe(201);expect(created.body.runKey).toBeUndefined()
  const other=created.body.record as {id:string,data:Record<string,unknown>,createdAt:string}
  const keyId=(t.api.getRecord(controller)!.data['extra'] as {runKeyId:string}).runKeyId
  expect((await call('PATCH',`/api/records/${other.id}`,{dataPatch:{extra:{runKeyId:keyId}}})).status).toBe(200)
  // Synthetic ordering makes the editable metadata reader choose this later row deterministically.
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run('2099-01-01 00:00:00',other.id)
  const before=corpus()
  try {
    const copied=await call('POST','/api/records',{kind:'problem',title:'Synthetic copied metadata claim',data:{mainSuiteFix:{...ns,claim:{...ns.claim,run:other.id}}}},headers('repair-secretary',controllerKey,other.id))
    expect(copied.status).toBe(403);expect(corpus()).toBe(before)
  } finally {
    rawData(other.id,other.data);t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(other.createdAt,other.id)
  }
  expect((await problem(ns)).status).toBe(201)
})
it('refuses static keys copied into original or later run metadata and accepts the registered starters actual mint',async()=>{
  const staticId=(t.client.sqlite.prepare('SELECT id FROM held_keys WHERE key_hash = ?').get((await import('node:crypto')).createHash('sha256').update(secretaryKey).digest('hex')) as {id:string}).id
  for(const onCreate of [true,false]) {
    const created=await call('POST','/api/records',{kind:'session',title:'Synthetic static key copy',data:{state:'running',servingAgent:'repair-secretary',...(onCreate?{extra:{runKeyId:staticId}}:{})}})
    expect(created.status).toBe(201);expect(created.body.runKey).toBeUndefined()
    const id=created.body.record.id as string
    if(!onCreate) expect((await call('PATCH',`/api/records/${id}`,{dataPatch:{extra:{runKeyId:staticId}}})).status).toBe(200)
    const ns=namespace(),before=corpus(),bad=await call('POST','/api/records',{kind:'problem',title:'Synthetic static metadata authority',data:{mainSuiteFix:{...ns,claim:{agent:controllerAgent,run:id}}}},headers('repair-secretary',secretaryKey,id))
    expect(bad.status).toBe(403);expect(corpus()).toBe(before)
  }
  const child=await call('POST','/api/agents/started',{handle:'repair-child-secretary',name:'Synthetic starter-minted secretary',runtime:'codex'})
  expect(child.status,JSON.stringify(child.body)).toBe(201)
  const agent=(t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('repair-child-secretary') as {id:string}).id
  const appointed=await call('POST','/api/roles/card/repair-child-secretary',{role:'secretary'},asPerson)
  expect(appointed.status,JSON.stringify(appointed.body)).toBe(201)
  const childKey=child.body.whatToGiveIt.key as string,childStatic=(t.client.sqlite.prepare('SELECT id FROM held_keys WHERE key_hash = ?').get((await import('node:crypto')).createHash('sha256').update(childKey).digest('hex')) as {id:string}).id
  for(const copiedOnCreate of [true,false]) {
    const created=await call('POST','/api/records',{kind:'session',title:'Synthetic starter static lookalike',data:{state:copiedOnCreate?'running':'idle',servingAgent:'repair-child-secretary',...(copiedOnCreate?{extra:{runKeyId:childStatic}}:{})}})
    expect(created.status).toBe(201)
    if(copiedOnCreate) expect(typeof created.body.runKey?.key).toBe('string')
    else expect(created.body.runKey).toBeUndefined()
    const run=created.body.record.id as string
    expect((await call('PATCH',`/api/records/${run}`,{dataPatch:{state:'running',extra:{runKeyId:childStatic}}})).status).toBe(200)
    const ns=namespace(),before=corpus(),bad=await call('POST','/api/records',{kind:'problem',title:'Synthetic starter static assertion',data:{mainSuiteFix:{...ns,claim:{agent,run}}}},headers('repair-child-secretary',childKey,run))
    expect(bad.status).toBe(403);expect(corpus()).toBe(before)
  }
  const minted=await call('POST','/api/records',{kind:'session',title:'Synthetic registered starter actual mint',data:{state:'running',servingAgent:'repair-child-secretary'}})
  expect(minted.status).toBe(201);expect(typeof minted.body.runKey?.key).toBe('string')
  const ns=namespace(),run=minted.body.record.id as string
  // Synthetic history: a starter's mint filed before the door stored the starter's key on it holds no holder.
  t.client.sqlite.prepare('UPDATE revisions SET proved_holder = NULL WHERE record_id = ? AND seq IN (1,2)').run(run)
  const missing=await call('POST','/api/records',{kind:'problem',title:'Synthetic unrecorded starter provenance',data:{mainSuiteFix:{...ns,claim:{agent,run}}}},headers('repair-child-secretary',minted.body.runKey.key,run))
  expect(missing.status).toBe(403);expect(missing.body.error).toContain('original mint provenance')
  // Synthetic historical proof stand-in: the holder the door stores on a starter's mint, written back by hand.
  t.client.sqlite.prepare('UPDATE revisions SET proved_holder = ? WHERE record_id = ? AND seq IN (1,2)').run(JSON.stringify({id:controllerAgent,how:'an-agent-key',claimed:'repair-secretary'}),run)
  expect((await call('POST','/api/records',{kind:'problem',title:'Synthetic explicitly recorded starter mint',data:{mainSuiteFix:{...ns,claim:{agent,run}}}},headers('repair-child-secretary',minted.body.runKey.key,run))).status).toBe(201)
  const victim=await call('POST','/api/agents/started',{handle:'repair-collision-secretary',name:'Synthetic copied static holder'})
  expect(victim.status).toBe(201)
  const victimAgent=(t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('repair-collision-secretary') as {id:string}).id
  expect((await call('POST','/api/roles/card/repair-collision-secretary',{role:'secretary'},asPerson)).status).toBe(201)
  // Synthetic legacy registry ID deliberately has the shape an arriving handle may have.
  const legacy='synthetic-legacy-starter'
  const legacyRow:Record<string,unknown>={...(t.client.sqlite.prepare('SELECT * FROM agents WHERE id = ?').get(controllerAgent) as Record<string,unknown>),id:legacy,handle:'synthetic-collision-parent',name:'Synthetic legacy parent'}
  const columns=Object.keys(legacyRow)
  t.client.sqlite.prepare(`INSERT INTO agents (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(key=>legacyRow[key]))
  t.client.sqlite.prepare('UPDATE agents SET started_by_id = ? WHERE id = ?').run(legacy,victimAgent)
  try {
  const alias=await call('POST','/api/agents/started',{handle:legacy,name:'Synthetic handle colliding with starter ID'},asPerson)
  expect(alias.status,JSON.stringify(alias.body)).toBe(201)
  const asAlias=headers(legacy,alias.body.whatToGiveIt.key)
  const victimKey=victim.body.whatToGiveIt.key as string
  const victimStatic=(t.client.sqlite.prepare('SELECT id FROM held_keys WHERE key_hash = ?').get((await import('node:crypto')).createHash('sha256').update(victimKey).digest('hex')) as {id:string}).id
  const before=corpus(),fake=await call('POST','/api/records',{kind:'session',title:'Synthetic collision mint lookalike',data:{state:'running',servingAgent:'repair-collision-secretary',extra:{runKeyId:victimStatic}}},asAlias)
  writeFileSync(join(evidenceDir,'static-alias-arrival.json'),JSON.stringify({synthetic:true,registrationStatus:alias.status,arrivalStatus:fake.status,refusal:fake.body.error},null,2))
  expect(fake.status,JSON.stringify(fake.body)).toBe(403);expect(corpus()).toBe(before)
  } finally {
    t.client.sqlite.prepare('UPDATE agents SET started_by_id = ? WHERE id = ?').run(controllerAgent,victimAgent)
  }
})
it('requires same-claim CAS transitions and refuses original receipt or operational drift',async()=>{
  const ns=namespace(),p=await problem(ns);expect(p.status).toBe(201);const id=p.body.record.id as string
  const initial=await read(id),before=corpus()
  expect((await patch(id,{pending:{phase:'dispatch',says:'Synthetic pending.'}})).status).toBe(409);expect(corpus()).toBe(before)
  expect((await patch(id,{pending:{phase:'dispatch',says:'Synthetic pending.'}},initial.body.version)).status).toBe(200)
  expect((await patch(id,{pending:{phase:'dispatch',says:'Synthetic stale.'}},initial.body.version)).status).toBe(409)
  const current=await read(id);expect((await patch(id,{claim:{...ns.claim,run:'other-run'}},current.body.version)).status).toBe(403)
  expect((await patch(id,{commit:'e'.repeat(40)},current.body.version)).status).toBe(409)
  const held=t.api.getRecord(id)!;rawData(id,{...held.data,mainSuiteFix:{...ns,commit:'d'.repeat(40)}})
  const drift=await read(id);expect((await patch(id,{pending:{phase:'dispatch',says:'Synthetic drift.'}},drift.body.version)).status).toBe(409)
  rawData(id,held.data)
  const wrong=namespace();wrong.receipt.contentHash='0'.repeat(16);expect((await problem(wrong)).status).toBe(409)
})
it('derives one original deadline and keeps ambiguous local time explicitly blocked',async()=>{
  const modulePath='../src/shared/'+'main-suite-fix.ts'
  const contract=await import(modulePath) as {mainSuiteFixDeadline:(stamp:string|null,zone:string)=>{endedAtMs:number|null,deadlineMs:number|null,deadline:string|null}}
  expect(contract.mainSuiteFixDeadline('2026-10-25 01:30:00','Europe/London')).toEqual({endedAtMs:null,deadlineMs:null,deadline:null})
  const result=contract.mainSuiteFixDeadline('2026-10-25 00:30:00','Europe/London')
  expect(result.deadlineMs! - result.endedAtMs!).toBe(3_600_000)
  const ns=namespace('2026-10-25 01:30:00');Object.assign(ns,{timeZone:'Europe/London',endedAtMs:null,deadlineMs:null});ns.fixRound.deadline=null as never;ns.cause=[];Object.assign(ns,{causeUnknown:'No verified cause.'})
  const p=await problem(ns);expect(p.status,JSON.stringify(p.body)).toBe(201)
  const run=await sealedRun(),current=await read(p.body.record.id)
  expect((await patch(p.body.record.id,{takeout:{run}},current.body.version)).status).toBe(200)
  const attempted=await submit(run,{fixRound:{problem:p.body.record.id,kind:'takeout',reason:'hour expired'},takesOut:[causalEntry]});expect(attempted.status).toBe(409);expect(attempted.body.error).toContain('unambiguous original deadline')
})
it('correlates one checked own submission to the authoritative problem and actual causal commits',async()=>{
  const ns=namespace(),p=await problem(ns);expect(p.status).toBe(201);const id=p.body.record.id as string
  const run=await sealedRun(),current=await read(id)
  expect((await patch(id,{repair:{run}},current.body.version)).status).toBe(200)
  const heldRun=t.api.getRecord(run)!.data
  rawData(run,{...heldRun,released:undefined});expect((await submit(run,{fixRound:{problem:id,kind:'repair'}})).status).toBe(409);rawData(run,heldRun)
  expect((await call('POST','/api/merge-queue',{run,changeset:{adapter:'git',repository:'repair-fixture'},fixRound:{problem:id,kind:'repair'}},asPerson)).status).toBe(403)
  const repair=await submit(run,{fixRound:{problem:id,kind:'repair'}});expect(repair.status,JSON.stringify(repair.body)).toBe(201)
  expect(repair.body.entry.fixRound).toEqual({problem:id,kind:'repair'});expect(repair.body.entry.takesOut).toBeUndefined()
  expect((await call('POST',`/api/merge-queue/${repair.body.entry.id}/withdraw`,{because:'Synthetic waiting repair expiry.',waitingOnly:true})).status).toBe(200)
  const takeoutRun=await sealedRun()
  const next=await read(id);expect((await patch(id,{takeout:{run:takeoutRun}},next.body.version)).status).toBe(200)
  const originalController={run:controller,key:controllerKey};await freshController()
  const wrong=namespace();wrong.cause[0]!.commits=['e'.repeat(40)]
  const wrongProblem=await problem(wrong),wrongId=wrongProblem.body.record.id as string
  const wrongCurrent=await read(wrongId);expect((await patch(wrongId,{takeout:{run:takeoutRun}},wrongCurrent.body.version)).status).toBe(200)
  const beforeWrong=corpus();expect((await submit(takeoutRun,{fixRound:{problem:wrongId,kind:'takeout',reason:'hour expired'},takesOut:[causalEntry]})).status).toBe(409);expect(corpus()).toBe(beforeWrong)
  controller=originalController.run;controllerKey=originalController.key
  for(const takesOut of [[],[causalEntry,causalEntry],['not-causal']]) {
    const before=corpus();expect((await submit(takeoutRun,{fixRound:{problem:id,kind:'takeout',reason:'hour expired'},takesOut})).status).toBeGreaterThanOrEqual(400);expect(corpus()).toBe(before)
  }
  const takeout=await submit(takeoutRun,{fixRound:{problem:id,kind:'takeout',reason:'hour expired'},takesOut:[causalEntry]});expect(takeout.status,JSON.stringify(takeout.body)).toBe(201)
  expect(takeout.body.entry.takesOut).toEqual([causalEntry]);expect(t.api.getRecord(takeout.body.entry.id)!.data['mainSuiteFix']).toBeUndefined()
})
it.each([
  ['repair','repair'],
  ['takeout','take-out'],
] as const)('refuses duplicate %s submissions with a readable purpose and no writes',async(kind,purpose)=>{
  const p=await problem(),id=p.body.record.id as string,run=await sealedRun()
  const current=await read(id)
  expect((await patch(id,{[kind]:{run}},current.body.version)).status).toBe(200)
  const submission=kind==='repair'?{fixRound:{problem:id,kind}}:{fixRound:{problem:id,kind,reason:'hour expired'},takesOut:[causalEntry]}
  const queued=await submit(run,submission);expect(queued.status,JSON.stringify(queued.body)).toBe(201)
  const entry=queued.body.entry.id as string
  expect((await call('POST',`/api/merge-queue/${entry}/withdraw`,{because:'Synthetic duplicate retry after withdrawal.',waitingOnly:true})).status).toBe(200)
  const before=corpus(),duplicate=await submit(run,submission)
  expect(duplicate.status).toBe(409)
  expect(duplicate.body.error).toBe(`Merge entry ${entry} already carries this problem's ${purpose}. Reconcile that entry; nothing was written.`)
  expect(corpus()).toBe(before)
})
it('records returned only after the correlated takeout actually landed',async()=>{
  const ns=namespace(),p=await problem(ns),id=p.body.record.id as string,run=await sealedRun()
  let current=await read(id);expect((await patch(id,{takeout:{run}},current.body.version)).status).toBe(200)
  const queued=await submit(run,{fixRound:{problem:id,kind:'takeout',reason:'hour expired'},takesOut:[causalEntry]});expect(queued.status,JSON.stringify(queued.body)).toBe(201)
  const entry=queued.body.entry.id as string
  current=await read(id);expect((await patch(id,{takeout:{entry}},current.body.version)).status).toBe(200)
  current=await read(id);const before=corpus();expect((await patch(id,{outcome:{returned:entry}},current.body.version)).status).toBe(409);expect(corpus()).toBe(before)
  const data=t.api.getRecord(entry)!.data;rawData(entry,{...data,state:'merged',toolWanted:null,integrated:{entry,mainBefore:causalCommit,mainAfter:causalCommit,rebasedTip:causalCommit,at:'2026-10-15 10:25:00'}})
  expect((await patch(id,{outcome:{returned:entry}},current.body.version)).status).toBe(200)
})
it('records fixed only after repair landing and a later pinned original green main receipt',async()=>{
  const ns=namespace(),p=await problem(ns),id=p.body.record.id as string,run=await sealedRun()
  let current=await read(id);expect((await patch(id,{repair:{run}},current.body.version)).status).toBe(200)
  const queued=await submit(run,{fixRound:{problem:id,kind:'repair'}});expect(queued.status).toBe(201);const entry=queued.body.entry.id as string
  current=await read(id);expect((await patch(id,{repair:{entry}},current.body.version)).status).toBe(200)
  const original=receipt()
  function green(endedAt:string) {return t.api.createRecord({kind:'whole_suite_receipt',title:'Synthetic original green verification',workspaceId:'default',actor:person,origin:'fixture',data:{...original.data,startedAt:'2026-10-15 09:21:00',endedAt,suiteExitCode:0,failedFiles:[],failedTests:[]}})}
  const later=green('2026-10-15 10:30:00'),pin={recordId:later.id,seq:1,contentHash:t.api.versionOf(later)}
  current=await read(id);const before=corpus();expect((await patch(id,{fixedReceipt:pin,outcome:{fixed:causalCommit}},current.body.version)).status).toBe(409);expect(corpus()).toBe(before)
  const data=t.api.getRecord(entry)!.data;rawData(entry,{...data,state:'merged',toolWanted:null,integrated:{entry,mainBefore:base,mainAfter:causalCommit,rebasedTip:causalCommit,at:'2026-10-15 09:30:00'}})
  const early=green('2026-10-15 09:25:00');expect((await patch(id,{fixedReceipt:{recordId:early.id,seq:1,contentHash:t.api.versionOf(early)},outcome:{fixed:causalCommit}},current.body.version)).status).toBe(409)
  writeFileSync(join(root,'work/verified.txt'),'Synthetic later main.\n');git('add','.');git('commit','-qm','Synthetic later main');const target=git('rev-parse','HEAD');git('branch','-f','main',target)
  const advanced=t.api.createRecord({kind:'whole_suite_receipt',title:'Synthetic original later main green',workspaceId:'default',actor:person,origin:'fixture',data:{...later.data,commit:target,tree:git('rev-parse','HEAD^{tree}')}})
  expect((await patch(id,{fixedReceipt:{recordId:advanced.id,seq:1,contentHash:t.api.versionOf(advanced)},outcome:{fixed:target}},current.body.version)).status).toBe(200)
})
it('atomically refuses waiting-only withdrawal after testing begins and preserves ordinary withdrawal',async()=>{
  const made=await submit(await sealedRun());expect(made.status).toBe(201);const id=made.body.entry.id as string
  const old=t.api.getRecord(id)!.data;rawData(id,{...old,state:'judged'})
  expect((await call('GET',`/api/merge-queue/${id}`)).body.entry.state).toBe('judged')
  rawData(id,{...old,state:'testing',occupies:root})
  const before=corpus(),race=await call('POST',`/api/merge-queue/${id}/withdraw`,{because:'Synthetic expiry.',waitingOnly:true})
  expect(race.status).toBe(409);expect(corpus()).toBe(before)
  expect(race.body.error).toBe(`Merge entry ${id} is testing, so the waiting-only withdrawal did not write anything. Read the entry again and honor its current state.`)
  expect((await call('POST',`/api/merge-queue/${id}/withdraw`,{because:'Synthetic ordinary withdrawal.'})).status).toBe(200)
  for(const state of ['submitted','pinned','judged','integrating','reinspecting']) {
    const waiting=await submit(await sealedRun());expect(waiting.status).toBe(201)
    const waitingId=waiting.body.entry.id as string,data=t.api.getRecord(waitingId)!.data
    rawData(waitingId,{...data,state,toolWanted:undefined,occupies:['integrating','reinspecting'].includes(state)?root:undefined})
    const withdrew=await call('POST',`/api/merge-queue/${waitingId}/withdraw`,{because:'Synthetic waiting expiry.',waitingOnly:true})
    expect(withdrew.status,JSON.stringify(withdrew.body)).toBe(200)
  }
})
it('reads the state in a waiting-only withdrawal refusal through the central vocabulary',async()=>{
  const made=await submit(await sealedRun());expect(made.status).toBe(201)
  const id=made.body.entry.id as string,old=t.api.getRecord(id)!.data
  rawData(id,{...old,state:'testing',occupies:root})
  const words=await import('../src/shared/words.ts'),original=words.stateWord
  // Every current queue state reads like its stored spelling. This synthetic reading makes a
  // missing call observable over HTTP without adding or changing any production vocabulary.
  const reading=vi.spyOn(words,'stateWord').mockImplementation((value,mode)=>{
    const result=original(value,mode)
    return value==='testing'?{...result,text:'synthetic checks in progress'}:result
  })
  try {
    const before=corpus(),refused=await call('POST',`/api/merge-queue/${id}/withdraw`,{because:'Synthetic reading-boundary probe.',waitingOnly:true})
    expect(refused.status).toBe(409)
    expect(refused.body.error).toBe(`Merge entry ${id} is synthetic checks in progress, so the waiting-only withdrawal did not write anything. Read the entry again and honor its current state.`)
    expect(corpus()).toBe(before)
  } finally {reading.mockRestore()}
})
it('reserves one verification attempt for an actually landed repair and derives its original receipt result',async()=>{
  const p=await problem(),id=p.body.record.id as string,run=await sealedRun()
  let current=await read(id);expect((await patch(id,{repair:{run}},current.body.version)).status).toBe(200)
  const queued=await submit(run,{fixRound:{problem:id,kind:'repair'}});expect(queued.status,JSON.stringify(queued.body)).toBe(201);const entry=queued.body.entry.id as string
  current=await read(id);expect((await patch(id,{repair:{entry}},current.body.version)).status).toBe(200)
  const repairCommit=queued.body.entry.changeset.commit as string
  const planned={repairCommit,targetCommit:repairCommit,state:'planned'}
  current=await read(id);expect((await patch(id,{verification:planned},current.body.version)).status).toBe(409)
  const held=t.api.getRecord(entry)!.data;rawData(entry,{...held,state:'merged',toolWanted:null,integrated:{entry,mainBefore:base,mainAfter:repairCommit,rebasedTip:repairCommit,at:'2026-10-15 09:30:00'}})
  expect((await patch(id,{verification:planned},current.body.version)).status).toBe(200)
  current=await read(id);expect((await patch(id,{verification:{state:'attempted',attempt:'synthetic-attempt'}},current.body.version)).status).toBe(200)
  current=await read(id);const before=corpus();expect((await patch(id,{verification:{attempt:'replacement-attempt'}},current.body.version)).status).toBe(409);expect(corpus()).toBe(before)
  const red=receipt('2026-10-15 10:30:00',repairCommit,git('rev-parse',`${repairCommit}^{tree}`)),pin={recordId:red.id,seq:1,contentHash:t.api.versionOf(red)}
  current=await read(id);expect((await patch(id,{verification:{state:'complete',receipt:pin,outcome:'green'}},current.body.version)).status).toBe(409)
  expect((await patch(id,{verification:{state:'complete',receipt:pin,outcome:'red'}},current.body.version)).status).toBe(200)
})
it('admits a checked takeout after the same landed repair has original nongreen or unavailable verification',async()=>{
  for(const result of ['missing','planned','attempted','green','red','unavailable','drift','testing','landing']) {
    await freshController()
    const p=await problem(),id=p.body.record.id as string,run=await sealedRun()
    let current=await read(id);expect((await patch(id,{repair:{run}},current.body.version)).status).toBe(200)
    const queued=await submit(run,{fixRound:{problem:id,kind:'repair'}});expect(queued.status).toBe(201)
    const entry=queued.body.entry.id as string,repairCommit=queued.body.entry.changeset.commit as string
    current=await read(id);expect((await patch(id,{repair:{entry}},current.body.version)).status).toBe(200)
    const data=t.api.getRecord(entry)!.data
    rawData(entry,{...data,state:'merged',toolWanted:null,integrated:{entry,mainBefore:base,mainAfter:repairCommit,rebasedTip:repairCommit,at:'2026-10-15 09:30:00'}})
    if(result!=='missing') {
      current=await read(id);expect((await patch(id,{verification:{repairCommit,targetCommit:repairCommit,state:'planned'}},current.body.version)).status).toBe(200)
      if(result!=='planned') {
        current=await read(id);expect((await patch(id,{verification:{state:'attempted',attempt:`synthetic-${result}`}},current.body.version)).status).toBe(200)
        if(result==='unavailable') {
          current=await read(id);expect((await patch(id,{verification:{state:'unavailable',says:'Synthetic producer unavailable.'}},current.body.version)).status).toBe(200)
        } else if(result!=='attempted') {
          const red=receipt('2026-10-15 10:30:00',repairCommit,git('rev-parse',`${repairCommit}^{tree}`))
          const observed=result==='green'?t.api.createRecord({kind:'whole_suite_receipt',title:'Synthetic original green takeout refusal',workspaceId:'default',actor:person,origin:'fixture',data:{...red.data,suiteExitCode:0,failedTests:[],failedFiles:[]}}):red
          current=await read(id);expect((await patch(id,{verification:{state:'complete',outcome:result==='green'?'green':'red',receipt:{recordId:observed.id,seq:1,contentHash:t.api.versionOf(observed)}}},current.body.version)).status).toBe(200)
        }
      }
    }
    const takeoutRun=await sealedRun();current=await read(id);expect((await patch(id,{takeout:{run:takeoutRun}},current.body.version)).status).toBe(200)
    if(result==='drift') {
      const held=t.api.getRecord(id)!.data,fix=held['mainSuiteFix'] as Record<string,unknown>
      rawData(id,{...held,mainSuiteFix:{...fix,verification:{...(fix['verification'] as Record<string,unknown>),repairCommit:base}}})
    }
    if(result==='testing'||result==='landing') rawData(entry,{...t.api.getRecord(entry)!.data,state:result,toolWanted:undefined,occupies:root})
    const before=corpus(),takeout=await submit(takeoutRun,{fixRound:{problem:id,kind:'takeout',reason:result==='unavailable'?'verification unavailable':'repair not green'},takesOut:[causalEntry]})
    expect(takeout.status,`${result}: ${JSON.stringify(takeout.body)}`).toBe(result==='red'||result==='unavailable'?201:409)
    if(takeout.status!==201) expect(corpus()).toBe(before)
  }
})
it('reserves one original red for a controllers whole lifetime and stores one unique recipient array per notice',async()=>{
  const ns=namespace(),first=await problem(ns);expect(first.status).toBe(201);const id=first.body.record.id as string
  const second=namespace()
  let before=corpus(),refused=await problem(second);expect(refused.status).toBe(409);expect(refused.body.error).toContain(id);expect(corpus()).toBe(before)
  const sent=await call('POST','/api/records',{kind:'message',title:'Synthetic one-phase notice',data:{to:[{kind:'agent',id:controllerAgent}],body:'Synthetic fixture one-phase notice.',sendId:'synthetic-one-phase'}})
  // Nothing holds the controller's agent in the test office, so the office stores the notice, routes it and answers 409.
  // The notice is stored all the same, and its record id is the one the notices below name.
  expect(sent.status).toBe(409)
  let current=await read(id)
  const notice={sendId:'synthetic-one-phase',to:[controllerAgent],phase:'start',message:sent.body.record.id as string}
  expect((await patch(id,{notices:[notice]},current.body.version)).status).toBe(200)
  current=await read(id)
  for(const to of [controllerAgent,[],[controllerAgent,controllerAgent],['repair-secretary'],['not-a-canonical-agent']]) {
    before=corpus();expect((await patch(id,{notices:[{...notice,to}]},current.body.version)).status).toBe(400);expect(corpus()).toBe(before)
  }
  before=corpus();refused=await problem(second);expect(refused.status).toBe(409);expect(refused.body.error).toContain(id);expect(corpus()).toBe(before)
  expect((await call('DELETE',`/api/records/${id}`)).status).toBe(200)
  before=corpus();refused=await problem(second);expect(refused.status).toBe(409);expect(refused.body.error).toContain(id);expect(corpus()).toBe(before)
  await freshController();const next=namespace();expect((await problem(next)).status).toBe(201)
  // Receipt uniqueness remains independent of which actual controller retries it.
  await freshController()
  before=corpus();expect((await problem({...ns,claim:{agent:controllerAgent,run:controller}})).status).toBe(409);expect(corpus()).toBe(before)
})

it('accepts an original own-run mint across a clock second while refusing invalid rebound and reissued keys',async()=>{
  for(const boundary of [false,true]) {
    const label=boundary?'second-boundary':'same-second',start=Date.UTC(2026,9,16)+(boundary?999:100)
    let advances=0
    t.client.sqlite.function('main_suite_fix_mint_clock',()=>{advances++;vi.setSystemTime(start+1);return 1})
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(start)
    try {
      t.client.sqlite.exec("CREATE TEMP TRIGGER main_suite_fix_mint_clock AFTER INSERT ON held_keys WHEN NEW.whose_kind = 'agent' BEGIN SELECT main_suite_fix_mint_clock(); END")
      // This is the actual original session mint; the callback changes only Date between its two writes.
      await freshController()
    } finally {
      t.client.sqlite.exec('DROP TRIGGER IF EXISTS main_suite_fix_mint_clock');vi.useRealTimers()
    }
    const originalData=t.api.getRecord(controller)!.data,heldId=(originalData['extra'] as {runKeyId:string}).runKeyId
    const held=t.client.sqlite.prepare('SELECT id,whose_id,made_at,mint_proved_by,revoked_at FROM held_keys WHERE id = ?').get(heldId) as {id:string,whose_id:string,made_at:string,mint_proved_by:string,revoked_at:string|null}
    const revisions=t.client.sqlite.prepare('SELECT seq,op,at,actor_type,actor_id,proved_by,proved_holder,session_id,data FROM revisions WHERE record_id = ? ORDER BY seq').all(controller) as {seq:number,op:string,at:string,actor_type:string,actor_id:string,proved_by:string,proved_holder:string|null,session_id:string|null,data:string}[]
    const ns=namespace(),body={kind:'problem',title:'Synthetic mint-clock protected write',data:{mainSuiteFix:ns}}
    const refused:Record<string,unknown>[]=[]
    let before=corpus()
    const invalid=await call('POST','/api/records',body,headers('repair-secretary',randomBytes(32).toString('hex'),controller))
    refused.push({label:'invalid key',...invalid});expect(corpus()).toBe(before)
    const copied=await call('POST','/api/records',{kind:'session',title:'Synthetic copied mint-clock metadata',data:{state:'running',servingAgent:'repair-secretary'}})
    expect(copied.status).toBe(201);expect(copied.body.runKey).toBeUndefined()
    const other=copied.body.record.id as string
    expect((await call('PATCH',`/api/records/${other}`,{dataPatch:{extra:{runKeyId:heldId}}})).status).toBe(200)
    before=corpus()
    const rebound=await call('POST','/api/records',{...body,data:{mainSuiteFix:{...ns,claim:{...ns.claim,run:other}}}},headers('repair-secretary',controllerKey,other))
    refused.push({label:'rebound key metadata',...rebound});expect(corpus()).toBe(before)
    const keys=await import('../src/server/lib/keys.ts'),reissued=keys.makeARunKey(controllerAgent,null)
    try {
      rawData(controller,{...originalData,extra:{...(originalData['extra'] as Record<string,unknown>),runKeyId:reissued.heldKeyId}})
      before=corpus()
      const later=await call('POST','/api/records',body,headers('repair-secretary',reissued.key,controller))
      refused.push({label:'terminal reissue without original mint',...later});expect(corpus()).toBe(before)
    } finally {rawData(controller,originalData)}
    const accepted=await problem(ns)
    writeFileSync(join(evidenceDir,`original-mint-clock-${label}.json`),JSON.stringify({synthetic:true,label,sourceScenario:'actual original session mint; Date-only 1ms advance after held-key INSERT',advances,held,revisions,
      request:{method:'POST',path:'/api/records',actor:'repair-secretary',session:controller,body},accepted,refused},null,2))
    expect(advances).toBe(1)
    expect(revisions.slice(0,2).map(one=>({seq:one.seq,op:one.op}))).toEqual([{seq:1,op:'create'},{seq:2,op:'update'}])
    for(const field of ['actor_type','actor_id','proved_by','proved_holder','session_id'] as const) expect(revisions[1]![field]).toBe(revisions[0]![field])
    expect(held.whose_id).toBe(controllerAgent);expect(held.revoked_at).toBeNull()
    expect(refused.map(one=>one.status)).toEqual([403,403,403])
    expect(accepted.status,`${label}: ${JSON.stringify(accepted.body)}`).toBe(201)
    // The initial mint is one event. Its key row and original mint revision retain that same event time.
    expect(revisions[1]!.at).toBe(held.made_at)
  }
})
it('refuses a malformed later-sequence mint revision and accepts the normal seq2 mint',async()=>{
  await freshController()
  const heldId=(t.api.getRecord(controller)!.data['extra'] as {runKeyId:string}).runKeyId
  const heldBefore=t.client.sqlite.prepare('SELECT * FROM held_keys WHERE id = ?').get(heldId)
  const revisionsBefore=t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY rowid').all(controller) as {seq:number}[]
  // The actual mint is the first key-row occurrence: a seq2 update beside the seq1 create (keys.ts theOwnRunThisRequestKeyProves).
  const mint=t.client.sqlite.prepare("SELECT seq, op, kind FROM revisions WHERE record_id = ? AND json_extract(data, '$.extra.runKeyId') = ? ORDER BY rowid LIMIT 1").get(controller,heldId) as {seq:number,op:string,kind:string}
  expect({seq:mint.seq,op:mint.op,kind:mint.kind}).toEqual({seq:2,op:'update',kind:'session'})
  // Synthetic malformed history, fixture SQLite only: this is not a supported mint or reissue path.
  // Terminal reissue can write a later mint, but its actor/proof differs and other guards refuse it.
  // Here only the original mint revision's sequence moves to 3. The seq1 create, the live key row, its mint timestamp, the proof, the service
  // identity and the current binding stay exactly as minted.
  const laterSeq=Math.max(...revisionsBefore.map(row=>row.seq))+1
  expect(laterSeq).toBe(3)
  t.client.sqlite.prepare('UPDATE revisions SET seq = ? WHERE record_id = ? AND seq = 2').run(laterSeq,controller)
  const malformed=t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY rowid').all(controller)
  expect(JSON.stringify(malformed)).toBe(JSON.stringify(revisionsBefore.map(row=>({...row,seq:row.seq===2?laterSeq:row.seq}))))
  const ns=namespace(),before=corpus(),refused=await problem(ns)
  expect(refused.status,JSON.stringify(refused.body)).toBe(403)
  expect(refused.body.error).toContain('own proved continuing run key')
  expect(corpus()).toBe(before)
  // Restoring the actual seq2 mint accepts the same protected POST, and loosens no other guard.
  t.client.sqlite.prepare('UPDATE revisions SET seq = 2 WHERE record_id = ? AND seq = ?').run(controller,laterSeq)
  expect(JSON.stringify(t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY rowid').all(controller))).toBe(JSON.stringify(revisionsBefore))
  // Every key fact stays as minted. last_used_at is the authentication's own touch of any request and is not compared.
  const keyFacts=(row:Record<string,unknown>)=>Object.fromEntries(Object.entries(row).filter(([name])=>name!=='last_used_at'))
  const heldAfter=t.client.sqlite.prepare('SELECT * FROM held_keys WHERE id = ?').get(heldId) as Record<string,unknown>
  expect(JSON.stringify(keyFacts(heldAfter))).toBe(JSON.stringify(keyFacts(heldBefore as Record<string,unknown>)))
  const accepted=await problem(ns)
  expect(accepted.status,JSON.stringify(accepted.body)).toBe(201)
  writeFileSync(join(evidenceDir,'malformed-later-sequence-mint.json'),JSON.stringify({synthetic:true,
    note:'fixture SQLite only; the original mint proof is intact and only its revision sequence changes',
    heldId,mint,keyLastUsedAt:heldAfter['last_used_at'],refusal:{status:refused.status,error:refused.body.error},acceptedStatus:accepted.status},null,2))
})
