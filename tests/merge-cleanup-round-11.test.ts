// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/** Real cleanup watcher wiring with small sleeping groups and stand-in office replies.
 * Conflict probes use real Git; the pin-only case still runs the merge tool without a suite. */
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { aTestAddress, aTestIdentity, THE_MERGE_TOOLS_TEST_ADDRESS } from './the-test-commit-address.mjs'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { probeWaitingEntries } from '../tools/merge-tool/early-conflicts.mjs'
import { theProcessReader } from '../src/config/process-reader.mjs'
import { startTimeOf } from '../src/config/session-process.mjs'
import { localStamp } from '../src/shared/time.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'the-merger.mjs')
const SANDBOX_TOOL = join(REPO, 'tests', 'stand-in-sandbox-tool.mjs')
const THE_WORKER = 'mole-office/the-message-worker'
const ENDED = 'MOLE-OFFICE-MERGE-TOOL-ENDED '

type Repositories = typeof import('../src/server/lib/repositories.ts')

let t: TestDb
let app: FastifyInstance
let repositories: Repositories
let api: string
let proxy: Server
let proxyApi: string
let base: string
/** Every process group this file started, so none outlives it whatever a test did. */
const groups = new Set<number>()
const repositoryOf = new Map<string, string>()

const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asWorker = as('agent', 'mq-worker')
const asInspector = as('agent', 'mq-inspector')
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function write(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(what: string, check: () => boolean, ms = 60_000): Promise<void> {
  const from = Date.now()
  while (!check()) {
    if (Date.now() - from > ms) throw new Error(`waited ${String(ms)} ms for ${what}`)
    await sleep(100)
  }
}

// ============================================================================ fixtures

const PASSING_TEST = `import { expect, it } from 'vitest'\nit('passes', () => { expect(1).toBe(1) })\n`

/** A synthetic main checkout. Only tests that hold a build request a wait. */
function mainCheckout(name: string, build: 'pass' | 'wait' | 'wait-after-first' = 'pass'): string {
  const dir = realpathSync(mkdtempSync(join(base, `main-${name}-`)))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', aTestAddress('fixture'))
  git(dir, 'config', 'user.name', 'Synthetic merger fixture')
  write(dir, {
    'package.json': JSON.stringify({ name: 'synthetic-one-tool-fixture', private: true, type: 'module', scripts: { build: 'node tools/build.mjs', test: 'vitest run' } }, null, 2),
    '.gitignore': 'node_modules\n.logs\n',
    'vitest.config.mjs': "export default { test: { include: ['tests/**/*.test.ts'] } }\n",
    'tools/build.mjs': '// Synthetic fixture: the build succeeds.\n',
    '.mole-office/protected.json': JSON.stringify({ protected: ['design/'], generated: [] }, null, 2),
    'tests/one.test.ts': PASSING_TEST,
    'src/a.txt': 'a1\na2\na3\n',
  })
  symlinkSync(realpathSync(join(REPO, 'node_modules')), join(dir, 'node_modules'))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  const registered = repositories.registerRepository({ workspaceId: 'default', name: `fixture-${name}`, root: dir, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  repositoryOf.set(dir, registered.id)
  return dir
}

async function submitGit(main: string, name: string, files: Record<string, string>): Promise<string> {
  const dir = join(base, `worker-${name}`)
  execFileSync('git', ['clone', '-q', main, dir], { stdio: 'ignore' })
  git(dir, 'switch', '-q', '-c', 'work')
  write(dir, files)
  git(dir, 'add', '-A')
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', `Synthetic submission ${name}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...aTestIdentity('Synthetic worker', 'worker') },
  })
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic merger run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'mq-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'mq-worker', cutFrom: 'main', workingDirectory: realpathSync(dir) },
  }).id
  theRunReportsForTheQueue(t, run, { type: 'agent', id: 'mq-worker' })
  const finished = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asWorker, payload: { dataPatch: { state: 'finished' } } })
  expect(finished.statusCode, finished.body).toBe(200)
  const r = await app.inject({ method: 'POST', url: '/api/merge-queue', headers: asWorker, payload: { run, changeset: { adapter: 'git', repository: repositoryOf.get(main)!, branch: 'work' } } })
  expect(r.statusCode, r.body).toBe(201)
  return String(r.json().entry.id)
}

const cleanupStates = new Map<string, { state: string; held: boolean }>()

function stateOf(entry: string): string {
  if (cleanupStates.has(entry)) return cleanupStates.get(entry)!.state
  return String(t.api.getRecord(entry)!.data['state'])
}

async function withdrawn(entry: string): Promise<void> {
  if (cleanupStates.has(entry)) { cleanupStates.get(entry)!.state = 'withdrawn'; return }
  const r = await app.inject({ method: 'POST', url: `/api/merge-queue/${entry}/withdraw`, headers: asPerson, payload: { because: 'Synthetic: this test is done with it.' } })
  expect(r.statusCode, r.body).toBe(200)
}

// ============================================================================ the tool, run for real

interface Run {
  code: number | null
  signal: NodeJS.Signals | null
  out: string
  err: string
  steps: string[]
  session: string
  pid: number
}

const reported: { entry: string; step: string }[] = []
/** Entries whose GET the proxy answers only after this many milliseconds, so the run reading it stays alive. */
const slowEntries = new Map<string, number>()
/** Synthetic unfinished execution served by the test proxy for exactly these target runs. */
const activeChecks = new Set<string>()
const unreadChecks = new Set<string>()

const workdirOf = (entry: string) => join(base, 'work', entry)
const sandboxesOf = () => join(base, 'sandboxes')
const logOf = (entry: string) => readFileSync(join(workdirOf(entry), 'the-merger.log'), 'utf8')
const callsFile = () => join(sandboxesOf(), 'calls.jsonl')
const callLines = () => (existsSync(callsFile()) ? readFileSync(callsFile(), 'utf8').split('\n').filter((one) => one !== '') : [])
const callsSince = (from: number) => callLines().slice(from).map((one) => JSON.parse(one) as Record<string, any>)
const holdsOf = (entry: string) =>
  existsSync(join(workdirOf(entry), 'holds')) ? readdirSync(join(workdirOf(entry), 'holds')).filter((one) => /^[0-9]+\.json$/.test(one)).sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10)) : []
const holdOf = (entry: string, file: string) => JSON.parse(readFileSync(join(workdirOf(entry), 'holds', file), 'utf8')) as { session: string; pid: number; startedAt: string }

/** The name of the entry's sandbox, as the tool wrote it into the entry's state when it brought the sandbox up. */
function sandboxOf(entry: string): string {
  const state = JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8')) as { sandbox?: { name?: string } }
  expect(state.sandbox?.name, `no sandbox in the state of ${entry}`).toEqual(expect.any(String))
  return state.sandbox!.name!
}

/** Whether the stand-in has written down the exec of `npm run build` in the entry's sandbox, which it does as the exec starts. */
function startedTheBuild(entry: string, ordinal = 1): boolean {
  const file = join(workdirOf(entry), 'state.json')
  if (!existsSync(file)) return false
  const name = (JSON.parse(readFileSync(file, 'utf8')) as { sandbox?: { name?: string } }).sandbox?.name
  return callsSince(0).filter((one) => one['verb'] === 'exec' && one['name'] === name && Array.isArray(one['command']) && one['command'].join(' ').endsWith('npm run build')).length >= ordinal
}

/** Whether the stand-in says the sandbox's "container" is running. */
function isRunning(name: string): boolean {
  return (JSON.parse(readFileSync(join(sandboxesOf(), name, 'instance.json'), 'utf8')) as { running: boolean }).running
}

function endingOf(run: Run): { ok: boolean; says: string } {
  const last = run.out.trim().split('\n').at(-1) ?? ''
  expect(last.startsWith(ENDED), `exit ${String(run.code)}, signal ${String(run.signal)}:\n${run.out}${run.err}`).toBe(true)
  return JSON.parse(last.slice(ENDED.length)) as { ok: boolean; says: string }
}

function startTheTool(entry: string, env: Record<string, string> = {}): { child: ChildProcess; session: string; done: Promise<Run> } {
  const session = t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run', workspaceId: 'default', actor: { type: 'agent', id: THE_WORKER }, origin: 'fixture', data: { state: 'running', runtime: 'merge-tool' } }).id
  const child = spawn(
    process.execPath,
    [
      TOOL, '--entry', entry, '--session', session, '--api', proxyApi, '--workspace', 'default', '--workdir', workdirOf(entry), '--slot-every', '1', '--health-for', '30', '--office-for', '30',
      '--sandbox-tool', SANDBOX_TOOL, '--sandboxes', sandboxesOf(),
    ],
    // The fixture's bus leaves at once; this file checks cleanup rather than the wait for riders.
    { cwd: REPO, env: { ...process.env, MOLE_OFFICE_API: proxyApi, MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS: '0', MOLE_OFFICE_COMMIT_EMAIL: THE_MERGE_TOOLS_TEST_ADDRESS, ...env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  groups.add(child.pid!)
  let out = ''
  let err = ''
  child.stdout!.on('data', (chunk: Buffer) => (out += chunk.toString()))
  child.stderr!.on('data', (chunk: Buffer) => (err += chunk.toString()))
  const before = reported.length
  const done = new Promise<Run>((resolve) => {
    // 'close', NOT 'exit': 'exit' may come before the child's output is all read, which with many runs at once lost a
    // whole run's output here (25 September 2026).
    child.on('close', (code, signal) => {
      groups.delete(child.pid!)
      resolve({ code, signal, out, err, steps: reported.slice(before).filter((one) => one.entry === entry).map((one) => one.step), session, pid: child.pid! })
    })
  })
  return { child, session, done }
}

const runTheTool = (entry: string, env: Record<string, string> = {}) => startTheTool(entry, env).done

/** A proxy that changes nothing: it writes down each step the office accepted, and holds back the answer for a slow entry. */
async function startTheProxy(): Promise<void> {
  proxy = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks)
    const url = req.url ?? '/'
    const poolEntry = new URL(url, 'http://fixture').searchParams.get('cleanup-entry')
    if (req.method === 'GET' && url.startsWith('/api/slots?') && poolEntry && cleanupStates.has(poolEntry)) {
      const held = cleanupStates.get(poolEntry)!.held
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({pools:[{held:held?[{state:'granted'}]:[]}]}))
      return
    }
    const cleanupRead = /^\/api\/merge-queue\/([^/]+)$/.exec(url)
    const cleanupRelease = /^\/api\/slots\/([^/]+)\/release$/.exec(url)
    const cleanupEntry = cleanupRead?.[1] ?? cleanupRelease?.[1]
    if (cleanupEntry && cleanupStates.has(cleanupEntry)) {
      const fixture = cleanupStates.get(cleanupEntry)!
      if (cleanupRelease) fixture.held = false
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(cleanupRead ? {entry: {state: fixture.state}} : {released: true}))
      return
    }
    const stepMatch = /^\/api\/merge-queue\/([^/?]+)\/step$/.exec(url)
    const readMatch = /^\/api\/merge-queue\/([^/?]+)$/.exec(url)
    if (req.method === 'GET' && readMatch !== null && slowEntries.has(decodeURIComponent(readMatch[1]!))) await sleep(slowEntries.get(decodeURIComponent(readMatch[1]!))!)
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(req.headers)) {
      if (['host', 'content-length', 'connection', 'transfer-encoding'].includes(key) || typeof value !== 'string') continue
      headers[key] = value
    }
    const upstream = await fetch(`${api}${url}`, { method: req.method, headers, ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body }) })
    let bytes = Buffer.from(await upstream.arrayBuffer())
    const checkMatch = /^\/api\/checks\/([^/?]+)$/.exec(url)
    if (req.method === 'GET' && checkMatch !== null && activeChecks.has(decodeURIComponent(checkMatch[1]!)) && upstream.status === 200) {
      const answer = JSON.parse(bytes.toString('utf8'))
      answer.theCheck = { ...(answer.theCheck ?? {}), execution: { session: 'synthetic-going-check', log: 'synthetic.log', model: 'synthetic', minutes: 1 } }
      bytes = Buffer.from(JSON.stringify(answer))
    }
    if (req.method === 'GET' && checkMatch !== null && unreadChecks.has(decodeURIComponent(checkMatch[1]!))) {
      res.writeHead(503, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Synthetic: check state unavailable.' }))
      return
    }
    if (req.method === 'POST' && stepMatch !== null && upstream.status === 200) reported.push({ entry: decodeURIComponent(stepMatch[1]!), step: (JSON.parse(body.toString('utf8')) as { step: string }).step })
    const out: Record<string, string> = {}
    upstream.headers.forEach((value, key) => {
      if (!['content-length', 'transfer-encoding', 'content-encoding', 'connection'].includes(key)) out[key] = value
    })
    res.writeHead(upstream.status, out)
    res.end(bytes)
  })
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  proxyApi = `http://127.0.0.1:${String((proxy.address() as AddressInfo).port)}`
}

// ============================================================================ set-up

beforeAll(async () => {
  t = await freshDb()
  mkdirSync(join(REPO, '.logs'), { recursive: true })
  base = realpathSync(mkdtempSync(join(REPO, '.logs', 'merge-cleanup-round-11-')))
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${REPO.replace(/\/$/, '')}:${base}`
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  repositories = await import('../src/server/lib/repositories.ts')
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle: 'mq-worker', name: 'Synthetic mq-worker', workArea: ['src', 'tests', 'design'] } })
  expect(worker.statusCode, worker.body).toBe(201)
  const inspector = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle: 'mq-inspector', name: 'Synthetic mq-inspector', role: 'inspector' } })
  expect(inspector.statusCode, inspector.body).toBe(201)
  await startTheProxy()
}, 60_000)

let keepTheFixtures = false
afterEach(async (context) => {
  if (context.task.result?.state !== 'fail') return
  keepTheFixtures = true
  for (const group of groups) { try { process.kill(-group, 'SIGTERM') } catch {} }
  await sleep(1500)
  for (const group of groups) { try { process.kill(-group, 'SIGKILL') } catch {} }
  groups.clear()
})

afterAll(async () => {
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Gone already.
    }
  }
  await new Promise<void>((resolve) => proxy?.close(() => resolve()))
  await app?.close()
  t?.close()
  delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  if (base !== undefined && !keepTheFixtures) rmSync(base, { recursive: true, force: true })
  else if (base !== undefined) process.stderr.write(`tests/merge-cleanup-round-11.test.ts: a test failed, so the fixtures and the tool's logs are kept under ${base}\n`)
})


async function cleanupPool(entry: string) {
  const response = await fetch(`${proxyApi}/api/slots?cleanup-entry=${encodeURIComponent(entry)}`)
  return { statusCode: response.status, body: await response.text() }
}

// The owner uses the real watcher API; its child sleeps in a separately recorded group.
async function waitingSuite(name: string) {
  const entry = `synthetic-${name}`, folder = workdirOf(entry), sandbox = `synthetic-${name}`
  mkdirSync(folder, {recursive:true}); mkdirSync(join(sandboxesOf(),sandbox), {recursive:true})
  writeFileSync(join(sandboxesOf(),sandbox,'instance.json'),JSON.stringify({running:true}))
  writeFileSync(join(folder,'state.json'),JSON.stringify({sandbox:{name:sandbox}}))
  const launcher = join(folder,'sandbox.mjs')
  writeFileSync(launcher, `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(join(sandboxesOf(),sandbox,'instance.json'))},JSON.stringify({running:false}))`)
  cleanupStates.set(entry,{state:'testing',held:true})
  const owner = join(folder,'owner.mjs')
  writeFileSync(owner, `
    import {spawn} from 'node:child_process'
    import {startCleanup,keepForCleanup} from ${JSON.stringify(join(REPO,'tools/merge-tool/cleanup.mjs'))}
    import {theProcessAt} from ${JSON.stringify(join(REPO,'src/config/session-process.mjs'))}
    const child=spawn(process.execPath,['-e','setTimeout(()=>{},120000)'],{detached:true,stdio:'ignore'})
    const own=theProcessAt(process.pid), held=theProcessAt(child.pid)
    const watcher=startCleanup({...JSON.parse(process.argv[2]),ownerGroup:process.pid,ownerGroupStartedAt:own.startedAt}, process.env)
    keepForCleanup({type:'group',pid:child.pid,startedAt:held.startedAt})
    keepForCleanup({type:'sandbox',name:${JSON.stringify(sandbox)}})
    keepForCleanup({type:'seat',id:${JSON.stringify(entry)}})
    process.send({pid:child.pid,watcher})
    setTimeout(()=>{},120000)
  `)
  const config={api:proxyApi,entry,headers:{'content-type':'application/json'},log:join(folder,'the-merger.log'),launcher,identity:[],environment:{PATH:process.env.PATH,HOME:base}}
  const child=spawn(process.execPath,['--import','tsx',owner,JSON.stringify(config)],{cwd:REPO,env:{...process.env},detached:true,stdio:['ignore','pipe','pipe','ipc']})
  groups.add(child.pid!)
  let error='';child.stderr!.on('data',b=>error+=String(b))
  const ready=await new Promise<{pid:number;watcher:number}>((ok,fail)=>{
    const timer=setTimeout(()=>fail(Error('The synthetic owner did not record its child: '+error)),15000)
    child.once('message',message=>{clearTimeout(timer);ok(message as {pid:number;watcher:number})})
    child.once('error',fail)
  })
  groups.add(ready.pid);groups.add(ready.watcher)
  const done=new Promise<void>(ok=>child.once('close',()=>ok()))
  const tool={child,done}
  const held = await cleanupPool(entry)
  expect(held.statusCode,held.body).toBe(200)
  expect(held.body).toContain('\"state\":\"granted\"')
  return {entry,tool,pid:ready.pid,name:sandbox}
}
async function cleanupReturned(entry: string, name: string, pid: number, why = 'merge tool process ended') {
  await until('cleanup watcher to finish', () => existsSync(join(workdirOf(entry),'the-merger.log')) && logOf(entry).includes('merge cleanup: '+why), 55000)
  expect(isRunning(name)).toBe(false)
  const process = theProcessReader().processAt(pid)
  expect(process.here === false || ('state' in process && ['Z','X'].includes(process.state))).toBe(true)
  const pool = await cleanupPool(entry)
  expect(pool.statusCode,pool.body).toBe(200)
  expect(pool.body).not.toContain('\"state\":\"granted\"')
}
it('withdrawal during the suite stops its group and sandbox and returns the seat within a minute', async () => {
  const run = await waitingSuite('withdraw-suite')
  await withdrawn(run.entry)
  await cleanupReturned(run.entry,run.name,run.pid, 'entry '+run.entry+' is withdrawn')
  await run.tool.done
  expect(stateOf(run.entry)).toBe('withdrawn')
  expect(logOf(run.entry)).toContain('is withdrawn')
}, 90000)
it('a merge tool killed during the suite leaves no seat held or sandbox running', async () => {
  const run = await waitingSuite('kill-suite')
  // startTheTool recorded this detached child's process group when it spawned.
  process.kill(-run.tool.child.pid!, 'SIGKILL')
  await cleanupReturned(run.entry,run.name,run.pid)
  await run.tool.done
}, 90000)

// Probe real git objects, and use the real office message writer in this throwaway office.
async function conflictProbe(conflicts: boolean) {
  const root = mainCheckout(conflicts ? 'conflict-probe' : 'clean-probe')
  const entry = await submitGit(root, 'probe-'+String(conflicts), { 'src/a.txt': conflicts ? 'rider\n' : 'a1\na2\na3\n', 'src/rider.txt': 'rider\n' })
  const data = t.api.getRecord(entry)!.data
  const workerRoot = String(t.api.getRecord(String(data['run']))!.data['workingDirectory'])
  writeDataBypassingTheGate(t, entry, { ...data, state: 'judged', changeset: { ...(data['changeset'] as object), root, commit: git(workerRoot, 'rev-parse', 'HEAD') } })
  const run = String(t.api.getRecord(entry)!.data['run'])
  const { participantForActor } = await import('../src/server/lib/participants.ts')
  const starter = participantForActor({type:'agent',id:'mq-worker'})!
  const parent = t.api.createRecord({kind:'session',title:'Synthetic starter',workspaceId:'default',origin:'fixture',actor:{type:'agent',id:'mq-worker'},data:{state:'finished',servingAgentId:starter.id}}).id
  const patched = await app.inject({method:'PATCH',url:`/api/records/${run}`,headers:asWorker,payload:{dataPatch:{parentAttachment:parent}}})
  expect(patched.statusCode,patched.body).toBe(200)
  const branch = String((t.api.getRecord(entry)!.data['changeset'] as {branch:string}).branch)
  const worker = String(t.api.getRecord(run)!.data['workingDirectory'])
  const tip = git(worker,'rev-parse',branch)
  git(root,'fetch','--no-write-fetch-head',worker,tip)
  write(root,{'src/a.txt':'new main\n'})
  git(root,'add','-A');git(root,'commit','-q','-m','Synthetic landing')
  const main = git(root,'rev-parse','HEAD')
  const refsBefore = [git(root,'show-ref'),git(worker,'show-ref')]
  const sent: Record<string,any>[] = []
  const remembered: string[] = []
  const check = () => probeWaitingEntries({root,main,entries:[{id:entry,run,state:'judged',changeset:{adapter:'git',root,commit:tip}}],remembered,
    probe:(cwd: string,args: string[]) => {const r=spawnSync('git',['-C',cwd,...args],{encoding:'utf8'});return {status:r.status,stdout:r.stdout,stderr:r.stderr}},
    notify:async(warning: {entry:string;tip:string;files:string[]}) => {const {tellEarlyConflicts}=await import('../src/server/lib/merge-conflict-notices.ts');const said=tellEarlyConflicts('default',root,main,[warning,warning]);expect(said).toHaveLength(1);const match=/Early conflict notice (\S+) named/.exec(said[0]!);expect(match,said.join(' ')).not.toBeNull();sent.push(t.api.getRecord(match![1]!)!)},
    remember:(_key: string) => {},log:(_text: string) => {},
    tryTheRebase:() => {throw Error('the early rebase is tried only for a conflict in migration or list files, and this one is in neither')},
  })
  await check(); await check()
  expect([git(root,'show-ref'),git(worker,'show-ref')]).toEqual(refsBefore)
  expect(stateOf(entry)).toBe('judged')
  return {sent,starter:starter.id,entry}
}
it('a clean judged entry gets no early conflict warning', async () => {
  expect((await conflictProbe(false)).sent).toEqual([])
}, 60000)
it('a conflicting entry’s starter gets one message naming files, and no branch moves', async () => {
  const {sent,starter,entry} = await conflictProbe(true)
  expect(sent).toHaveLength(1)
  expect(sent[0]!.data.to).toEqual([{kind:'agent',id:starter}])
  expect(sent[0]!.data.body).toContain(entry)
  expect(sent[0]!.data.body).toContain('src/a.txt')
  expect(sent[0]!.data.notice).toBe('aQueuedEntryConflicts')
  const {whyThisWakesNoWaiter}=await import('../src/server/lib/notices.ts')
  expect(whyThisWakesNoWaiter({kind:'agent',id:'mole-office'},sent[0]!.data.notice)).toBeNull()
}, 60000)

it('a normal pin records absent resources instead of claiming a cleanup action', async () => {
  const main = mainCheckout('pin-no-resources')
  const entry = await submitGit(main, 'pin-no-resources', { 'src/only-pin.txt': 'Synthetic pin only.\n' })
  const result = await runTheTool(entry)
  expect(result.code, result.out + result.err).toBe(0)
  expect(result.steps).toEqual(['pinned'])
  expect(JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8')).sandbox).toBeUndefined()
  const pool = await app.inject({ method: 'GET', url: '/api/slots', headers: asWorker })
  expect(pool.statusCode, pool.body).toBe(200)
  expect(pool.json().pools.flatMap((one: { held: unknown[] }) => one.held)).toEqual([])
  expect(logOf(entry)).toContain('no sandbox recorded; no seat recorded')
}, 60000)
