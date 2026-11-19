// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Real throwaway Casting routes and sandbox-start; every native program and ledger answer is synthetic.
 *
 * THE OFFICE'S WORD IS KEPT THROUGH THE RECHECK. A start's fixed selection is rechecked against its Casting row. The
 * start says the effort is the agent's own only when the office's first answer said so, and that word now survives the
 * recheck. The case is red before the code.
 *
 * THE MUTATIONS. Piece 7's first case is red before the code. Its second case is red when the model door's source is
 * used for the effort's (given.from at the model door) instead of the effort's own source. Piece 8's case is red when
 * the notHeld branch is taken out so the hold is posted.
 *
 * CASE 3'S WIRING IS PROVED BY ITS MUTATION. A native option refusal of an effort that is not the row's own posts no
 * hold, and the crash detail says why. The case is green at the base. Take the notHeld branch out so the hold is
 * posted, and it turns red.
 *
 * A CODEX STOP NAMES THE NATIVE MODEL (wave 13n round CA, 1 November 2026). A Codex run of any model that ends at capacity
 * or at a usage limit asks the office to tell its starter, and names the model the row's native selection ran. Where to
 * ask again after a usage limit is read only for that native model, from the compatibility table's
 * askAgainAfterACodexUsageLimit, and never for the Office label. Mutations: name the start's Office label instead of the
 * native model, and the case of a known label over an unknown native model goes red; read no entry, and the case of a
 * known native model under an unrelated label goes red.
 */
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { writeInstance, readHostInstance, theFactsAStartIsGiven, THE_FACTS_VARIABLE } from '../tools/sandbox-common.mjs'
import { syntheticDshReader, CAPTURE_DSH_SELECTION } from './dsh-native-stand-in.ts'
import { withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { NAME_THE_PROCESS_THAT_LOADS_THIS, removeTheFolderOnceItsProcessesHaveEnded } from './the-processes-a-fixture-started.ts'
import { UNKNOWN_STOP_CAUSE } from '../tools/sandbox-common.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_AGENTS_OWN_EFFORT, THE_OFFICE_SAYS_THE_AGENTS_OWN } from '../src/config/launcher-selection.mjs'

const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
const programs = { codex: 'codex', 'claude-code': 'claude', opencode: 'opencode', dsh: 'dsh' } as const
let db: TestDb, app: Awaited<ReturnType<typeof apiApp>>['app'], root: string, instance: string, origin: string, parentRun: string
let changeAfterRead: number | null = null
let nativeNotices: unknown[][] = []
// THE TWO CODEX STOPS AND THEIR SENTENCES, with one model of the table's askAgainAfterACodexUsageLimit, read here so the
// cases follow the table. A usage limit on that model says where to ask again; any other stop says nothing was started.
type WhereToAskAgain = { runtime: string; model: string }
const askAgainEntries = (LAUNCHER_MODEL_COMPATIBILITY as { askAgainAfterACodexUsageLimit?: Record<string, WhereToAskAgain> }).askAgainAfterACodexUsageLimit
const [advisedModel, advice] = Object.entries(askAgainEntries ?? {})[0] ?? []
const NOTHING_STARTED_AGAIN = 'so this run has ended. Nothing was started again on another model; its supervisor chooses what comes next.'
const nativeStops = [
  { kind: 'codex-capacity', outcome: 'capacity', plain: (model: string) => `The model ${model} answered at capacity, ${NOTHING_STARTED_AGAIN}`,
    advised: (model: string) => `The model ${model} answered at capacity, ${NOTHING_STARTED_AGAIN}` },
  { kind: 'codex-usage-limit', outcome: 'limit', plain: (model: string) => `Codex rate-limited ${model}, ${NOTHING_STARTED_AGAIN}`,
    advised: (model: string) => `Codex rate-limited ${model}, so ask again with runtime ${advice?.runtime} and model ${advice?.model}.` },
] as const
const proxy = createServer(async (req, res) => {
  try {
    const pieces: Buffer[] = []; for await (const piece of req) pieces.push(piece)
    const text = Buffer.concat(pieces).toString()
    const payload = text === '' ? undefined : JSON.parse(text)
    // The ledger is synthetic, so this in-process Office record makes no claim to a real container.
    if (req.method === 'POST' && req.url === '/api/records' && payload?.kind === 'session') delete payload.data.sandbox
    // The ledger is a stand-in, so capture the requested Office notice and the model it names while the real Office stores
    // the crash detail.
    if(req.method==='PATCH' && req.url?.startsWith('/api/records/') && (payload?.tellTheStarter !== undefined || payload?.theModelItRanOn !== undefined)) {
      nativeNotices.push([payload.tellTheStarter, payload.theModelItRanOn]);delete payload.tellTheStarter;delete payload.theModelItRanOn
    }
    const answer = await app.inject({ method: req.method as 'GET', url: req.url!, headers: { ...person, ...(req.headers['x-mole-office-session'] ? { 'x-mole-office-session': String(req.headers['x-mole-office-session']) } : {}) }, ...(payload === undefined ? {} : { payload }) })
    if(changeAfterRead !== null && req.method==='GET' && req.url?.startsWith(`/api/casting/rows/${changeAfterRead}/selection`)) {
      const id=changeAfterRead;changeAfterRead=null
      const changed=await call('PATCH',`/api/casting/rows/${id}`,{effort:{value:'changed-after-preflight-'+randomUUID()}})
      if(changed.statusCode!==200) throw new Error('The synthetic row change failed')
    }
    res.writeHead(answer.statusCode, { 'content-type': 'application/json' }); res.end(answer.body)
  } catch { res.writeHead(500).end('{}') }
})
const fixture = String.raw`
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
const root = process.env.SELECTION_FIXTURE
${NAME_THE_PROCESS_THAT_LOADS_THIS.replaceAll('EFFORT_FIXTURE', 'SELECTION_FIXTURE')}
const original = globalThis.fetch
globalThis.fetch = async (address, init = {}) => {
  const url = new URL(address)
  if (url.origin !== 'http://synthetic.invalid') throw new Error('Synthetic launcher fixture refused network')
  const path = url.pathname, method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : {}
  appendFileSync(join(root, 'requests'), JSON.stringify({path,method,body})+'\n')
  const answer = (value, status=200) => new Response(JSON.stringify(value), {status})
  if (path === '/api/resources') return method === 'GET' ? answer({resources:[],rows:[]}) : answer({resource:{id:'synthetic-process-'+process.pid,key:String(body.pidInContainer),pgid:body.pidInContainer}},201)
  if (path.startsWith('/api/resources/') && path.endsWith('/release')) return answer({released:true})
  if (path.startsWith('/api/agents/') && path.endsWith('/hand-run')) return answer({cut:null})
  if (path.startsWith('/api/participants/agent/')) return answer({participant:{retired:false}})
  if (path === '/api/records' && method === 'GET') return answer({records:[]})
  // MADE UP FOR ONE CASE: the real run-models door puts the agent's effort into the selection only when effortFrom is 'the agent', so it never gives this pair.
  if (process.env.SELECTION_EFFORT_FROM !== undefined && path === '/api/office/run-models/for/native-opencode') {
    const real = await original(process.env.SELECTION_OFFICE+path+url.search,init)
    const given = await real.json()
    return new Response(JSON.stringify({...given, effortFrom: process.env.SELECTION_EFFORT_FROM}), {status: real.status, headers: {'content-type': 'application/json'}})
  }
  return original(process.env.SELECTION_OFFICE+path+url.search,init)
}
`
async function call(method: 'GET'|'POST'|'PATCH', url: string, payload?: unknown) {
  return app.inject({ method, url, headers: person, ...(payload === undefined ? {} : {payload: payload as never}) })
}
async function add(runtime: keyof typeof programs) {
  db.client.sqlite.prepare('DELETE FROM casting_rows').run()
  const key = randomUUID(), model = `office-${key}`, native = { model: `native-${key}`, provider: runtime === 'opencode' ? `provider-${key}` : runtime === 'dsh' ? 'deepseek-official' : null, variant: null }
  const response = await call('POST', '/api/casting/worker', {program:{value:runtime},model:{value:model},effort:{value:`effort-${key}`},native})
  expect(response.statusCode,response.body).toBe(201)
  const row = response.json().casting
  const read = await call('GET', `/api/casting/rows/${row.id}/selection`)
  expect(read.statusCode,read.body).toBe(200)
  return {row,selection:read.json().selection}
}
async function launch(selection: any, outcome = 'ok', environment: Record<string, string> = {}, { nameTheModel = true, passSelection = true }: { nameTheModel?: boolean; passSelection?: boolean } = {}) {
  const env = withAPrivateTmpToSweep({ ...withoutInheritedEffort(), HOME:join(instance,'home'), PATH:join(root,'bin')+':'+process.env.PATH,
    SELECTION_FIXTURE:root, SELECTION_OFFICE:origin, SELECTION_OUTCOME:outcome, SELECTION_RUNTIME:selection.runtime, NODE_OPTIONS:'--import='+join(root,'fetch.mjs'),
    MOLE_OFFICE_AGENT:'synthetic-starter',MOLE_OFFICE_SESSION:parentRun, MOLE_OFFICE_API:'http://synthetic.invalid',MOLE_OFFICE_WORKSPACE:'default',
    CLAUDE_CODE_OAUTH_TOKEN:'synthetic-token', SANDBOX_DSH_NATIVE_READER:join(root,'synthetic-dsh-reader.mjs'),
    ...(passSelection ? { SANDBOX_START_SELECTION: JSON.stringify(selection) } : {}), [THE_FACTS_VARIABLE]:theFactsAStartIsGiven(readHostInstance(instance)), ...environment,
  }, root)
  delete env.MOLE_AGENT_KEY
  const child = spawn(process.execPath, ['tools/sandbox-start.mjs','--instance',instance,'--agent','native-'+selection.runtime,'--runtime',selection.runtime,...(nameTheModel?['--model',selection.model]:[]),
    '--cut-from','main','--brief',join(root,'brief'),'--',join(root,'bin',programs[selection.runtime as keyof typeof programs]), ...(selection.runtime === 'codex' ? ['exec','--json'] : []),'--','Synthetic prompt'],{env})
  let out='',err=''; child.stdout.on('data',x=>out+=x); child.stderr.on('data',x=>err+=x)
  const code = await new Promise(resolve=>child.on('close',resolve))
  const line = out.trim().split('\n').find(x=>x.startsWith('{'))
  return {code,err,start:line ? JSON.parse(line) : null}
}
async function ended(run: string) {
  await expect.poll(async () => {
    const read = await call('GET','/api/records/'+run)
    return read.json().record.data.state
  }, {timeout:15_000}).not.toBe('running')
}
beforeAll(async () => {
  db=await freshDb(); app=(await apiApp()).app; await app.ready()
  for (const [runtime] of Object.entries(programs)) {
    const registered=await call('POST','/api/agents/started',{handle:'native-'+runtime,name:'Synthetic '+runtime,runtime,role:'worker'})
    expect(registered.statusCode,registered.body).toBe(201)
  }
  const parent = await call('POST','/api/records',{kind:'session',title:'Synthetic launcher parent',data:{state:'running',runtime:'codex'}})
  expect(parent.statusCode,parent.body).toBe(201); parentRun=parent.json().record.id
  await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done)); const port=(proxy.address() as AddressInfo).port; expect(thePortsATestKeepsOff()).not.toContain(port); origin='http://127.0.0.1:'+port
  root=mkdtempSync(join(tmpdir(),'native-selection-launch-')); instance=join(root,'sandbox')
  for(const dir of ['repo','home/.codex','out','dsh/home','bin']) mkdirSync(join(instance,dir),{recursive:true})
  const repo=join(instance,'repo'); const git=(...args:string[])=>execFileSync('git',['-C',repo,...args],{stdio:'ignore'})
  git('init','-q','-b','main');git('config','user.name','Synthetic fixture');git('config','user.email','fixture@example.invalid');git('config','commit.gpgsign','false')
  writeFileSync(join(repo,'README'),'Synthetic checkout');git('add','.');git('commit','-qm','Synthetic checkout')
  for(const dir of ['tools','src','for-agents'])symlinkSync(join(process.cwd(),dir),join(repo,dir))
  const template=join(root,'template');mkdirSync(template);writeFileSync(join(template,'devcontainer.json'),'{}');writeFileSync(join(template,'sandbox.json'),'{}')
  writeInstance(instance,{instance:'synthetic',template:'synthetic',templateDir:template,workspace:'default',from:repo,ref:'main',containerRow:'synthetic-container',container:{name:'synthetic'}})
  writeFileSync(join(instance,'home/.codex/auth.json'),'{}');writeFileSync(join(root,'brief'),'Synthetic prompt');writeFileSync(join(root,'fetch.mjs'),fixture);syntheticDshReader(root)
  mkdirSync(join(root,'bin'))
  for(const program of Object.values(programs))writeFileSync(join(root,'bin',program),`#!${process.execPath}\n${CAPTURE_DSH_SELECTION}\nconst fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path');const args=process.argv.slice(2);const at=args.lastIndexOf('--patch');let native=null;if(at>=0){const patch=JSON.parse(fs.readFileSync(args[at+1]));native=captureDshSelection(fs.readFileSync(patch[0].config.path,'utf8'))}\nfs.writeFileSync(path.join(process.env.SELECTION_FIXTURE,'seen-'+process.env.MOLE_OFFICE_SESSION),JSON.stringify({argv:args,effort:process.env.CLAUDE_CODE_EFFORT_LEVEL,native}));\nconst outcome=process.env.SELECTION_OUTCOME;if(outcome==='refusal'){const runtime=process.env.SELECTION_RUNTIME;if(runtime==='dsh')console.error('dsh: UNSUPPORTED_REASONING_EFFORT: Synthetic native option refusal');else if(runtime==='claude-code')console.log(JSON.stringify({type:'result',is_error:true,subtype:'error_during_execution',errors:['API Error: 404 '+JSON.stringify({error:{type:'not_found_error',message:'model: synthetic-native'}})]}));else if(runtime==='opencode')console.log(JSON.stringify({type:'error',error:{name:'ProviderModelNotFoundError',data:{providerID:'synthetic-provider',modelID:'synthetic-native',suggestions:[]}}}));else console.log(JSON.stringify({type:'turn.failed',error:{code:'model_not_found',message:'Synthetic native model refusal'}}));}else if(outcome==='capacity')console.log(JSON.stringify({type:'turn.failed',error:{message:'Selected model is at capacity. Please try a different model.'}}));else if(outcome==='limit')console.log(JSON.stringify({type:'turn.failed',error:{code:'usage_limit_exceeded',message:'Synthetic usage limit'}}));else if(outcome==='unknown')console.log(JSON.stringify({type:'turn.failed',error:{code:'transport_error',message:'Synthetic unknown native stop'}}));process.exit(outcome==='ok'?0:1)\n`,{mode:0o755})
},90_000)
afterAll(async()=>{await new Promise<void>(done=>proxy.close(()=>done()));await app?.close();db?.close();if(root)await removeTheFolderOnceItsProcessesHaveEnded(root)})

describe('an added Casting row crosses the real launcher start path',()=>{
  it.each(nativeStops)('$kind names the native model, not a known Office label, and borrows no advice from the label',async stop=>{
    expect(advisedModel, 'a model in askAgainAfterACodexUsageLimit').toBeTypeOf('string')
    const {row,selection}=await add('codex')
    const changed=await call('PATCH',`/api/casting/rows/${row.id}`,{model:{value:advisedModel}})
    expect(changed.statusCode,changed.body).toBe(200)
    const chosen=(await call('GET',`/api/casting/rows/${row.id}/selection`)).json().selection
    expect(chosen.native.model).toBe(selection.native.model)
    nativeNotices=[]
    const ran=await launch(chosen,stop.outcome);expect(ran.code,ran.err).toBe(0);await ended(ran.start.run)
    const detail=(await call('GET','/api/records/'+ran.start.run)).json().record.data.detail
    expect(detail.split(stop.plain(selection.native.model))).toHaveLength(2)
    expect(detail).not.toContain('ask again')
    expect(nativeNotices).toEqual([[stop.kind, selection.native.model]])
    expect((await call('GET',`/api/casting/rows/${row.id}/selection`)).statusCode).toBe(200)
  },30_000)
  it.each(nativeStops)('$kind follows the known native model under an unrelated Office label',async stop=>{
    expect(advisedModel, 'a model in askAgainAfterACodexUsageLimit').toBeTypeOf('string')
    const {row,selection}=await add('codex')
    const changed=await call('PATCH',`/api/casting/rows/${row.id}`,{native:{model:advisedModel,provider:null,variant:null}})
    expect(changed.statusCode,changed.body).toBe(200)
    const chosen=(await call('GET',`/api/casting/rows/${row.id}/selection`)).json().selection
    expect(chosen.model).toBe(selection.model)
    nativeNotices=[]
    const ran=await launch(chosen,stop.outcome);expect(ran.code,ran.err).toBe(0);await ended(ran.start.run)
    const detail=(await call('GET','/api/records/'+ran.start.run)).json().record.data.detail
    expect(detail.split(stop.advised(advisedModel!))).toHaveLength(2)
    expect(nativeNotices).toEqual([[stop.kind, advisedModel]])
    expect((await call('GET',`/api/casting/rows/${row.id}/selection`)).statusCode).toBe(200)
  },30_000)
  it('a row changed after preflight refuses before the native program starts',async()=>{
    const {row,selection}=await add('codex')
    changeAfterRead=row.id
    try {
      const ran=await launch(selection)
      expect(changeAfterRead).toBeNull()
      expect(ran.code).not.toBe(0)
      expect(ran.err).toMatch(/changed|rechecked/i)
    } finally {changeAfterRead=null}
  },30_000)
  it.each(Object.keys(programs) as (keyof typeof programs)[])('%s starts unseen names from the actual row',async runtime=>{
    const {selection}=await add(runtime);const ran=await launch(selection)
    expect(ran.code,ran.err).toBe(0);expect(ran.start?.run,ran.err).toBeTruthy();await ended(ran.start.run)
    const seen=JSON.parse(readFileSync(join(root,'seen-'+ran.start.run),'utf8'))
    if(runtime==='dsh')expect(seen.native['agent-default-model']).toMatchObject({provider:selection.native.provider,model:selection.native.model,reasoningEffort:selection.native.effort})
    else expect(seen.argv).toContain(runtime==='opencode'?selection.native.provider+'/'+selection.native.model:selection.native.model)
    expect(ran.start.model).toBe(selection.model)
  },30_000)
  it.each(Object.keys(programs) as (keyof typeof programs)[])('%s native refusal holds this row and the next start refuses it without a reroll',async runtime=>{
    const {row,selection}=await add(runtime);const ran=await launch(selection,'refusal');expect(ran.code,ran.err).toBe(0);await ended(ran.start.run)
    const held=await call('GET',`/api/casting/rows/${row.id}/selection`);expect(held.statusCode,held.body).toBe(409)
    const again=await launch(selection);expect(again.code).not.toBe(0);expect(again.err).toMatch(/held|refus/i)
  },30_000)
  it("keeps the office's word that the effort is the agent's own through the recheck",async()=>{
    const {selection}=await add('opencode')
    const own=`own-effort-${randomUUID()}`
    const wrote=await call('POST','/api/office/run-models/agent/native-opencode',{model:selection.model,variant:own})
    expect(wrote.statusCode,wrote.body).toBe(200)
    const ran=await launch(selection,'ok',{}, {nameTheModel:false,passSelection:false})
    expect(ran.code,ran.err).toBe(0);expect(ran.start?.run,ran.err).toBeTruthy();await ended(ran.start.run)
    expect(ran.start.selection.native.effort).toBe(own)
    expect(ran.start.effortFrom).toBe(THE_AGENTS_OWN_EFFORT)
    expect(ran.start.startWords).toContain(THE_OFFICE_SAYS_THE_AGENTS_OWN)
  },30_000)
  it("does not name the agent when only the model came from its profile",async()=>{
  // MADE UP FOR ONE CASE: the real run-models door puts the agent's effort into the selection only when effortFrom is 'the agent', so it never gives this pair.
    const {selection}=await add('opencode')
    const own=`own-effort-${randomUUID()}`
    const wrote=await call('POST','/api/office/run-models/agent/native-opencode',{model:selection.model,variant:own})
    expect(wrote.statusCode,wrote.body).toBe(200)
    const ran=await launch(selection,'ok',{SELECTION_EFFORT_FROM:"the owner's rule"}, {nameTheModel:false,passSelection:false})
    expect(ran.code,ran.err).toBe(0);expect(ran.start?.run,ran.err).toBeTruthy();await ended(ran.start.run)
    expect(ran.start.effortFrom).not.toBe(THE_AGENTS_OWN_EFFORT)
    expect(ran.start.startWords).not.toContain(THE_OFFICE_SAYS_THE_AGENTS_OWN)
  },30_000)
  it("does not hold a dsh row when the native program refuses an effort that is not the row's own",async()=>{
    const {row,selection}=await add('dsh')
    const other={...selection,native:{...selection.native,effort:`other-effort-${randomUUID()}`}}
    const ran=await launch(other,'refusal');expect(ran.code,ran.err).toBe(0);await ended(ran.start.run)
    expect((await call('GET',`/api/casting/rows/${row.id}/selection`)).statusCode).toBe(200)
    const detail=(await call('GET','/api/records/'+ran.start.run)).json().record.data.detail
    expect(detail).toContain('The row is not held, because its own effort was not tried.')
  },30_000)
  it.each(['capacity','limit','unknown'])('%s does not hold the selected row',async outcome=>{
    const {row,selection}=await add('codex');const ran=await launch(selection,outcome);expect(ran.code,ran.err).toBe(0);await ended(ran.start.run)
    expect((await call('GET',`/api/casting/rows/${row.id}/selection`)).statusCode).toBe(200)
    const detail=(await call('GET','/api/records/'+ran.start.run)).json().record.data.detail
    if(outcome==='unknown') expect(detail).toContain(UNKNOWN_STOP_CAUSE)
    else if(outcome==='limit') expect(detail).not.toContain(UNKNOWN_STOP_CAUSE)
  },30_000)
  it('a differing effort variable is refused in words naming its source, the selected effort and the row',async()=>{
    const {row,selection}=await add('claude-code')
    const value='another-effort-'+randomUUID()
    const before=readdirSync(root).filter(file=>file.startsWith('seen-'))
    const ran=await launch(selection,'ok',{CLAUDE_CODE_EFFORT_LEVEL:value})
    expect(ran.code).not.toBe(0)
    expect(ran.err).toContain('CLAUDE_CODE_EFFORT_LEVEL')
    expect(ran.err).toContain(value)
    expect(ran.err).toContain('the environment this run was started with in the container')
    expect(ran.err).toContain(selection.native.effort)
    expect(ran.err).toContain(String(row.id))
    const details=[...ran.err.matchAll(/Details: (\S+)/g)].map(match=>match[1]!)
    expect(ran.err+details.map(file=>existsSync(file)?readFileSync(file,'utf8'):'').join('')).toContain('Nothing was started.')
    expect(readdirSync(root).filter(file=>file.startsWith('seen-'))).toEqual(before)
  },30_000)
})
