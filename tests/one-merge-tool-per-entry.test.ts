// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * ONE MERGE TOOL RUN PER ENTRY, AND NO MERGE SANDBOX LEFT UP AFTER ITS ENTRY ENDED.
 *
 * Acceptance finding 80: on 25 September 2026 a second merge tool run started for entry c_Y0JSgLT6Y6 while the first
 * was still running. The second brought the entry's sandbox down and up again, which killed the first run's reruns, and
 * then the first run's ending brought down the sandbox the second had started. Problem JyLatHZdiDM5: a sandbox whose
 * down failed as its run ended stayed up for 72 minutes, because nothing tried the down again.
 *
 * tools/the-merger.mjs is run here as a separate process, as the message worker runs it, against the real app on a
 * loopback port of its own and a throwaway database, through a proxy that changes nothing but can slow one answer
 * down. Its sandboxes are the stand-in launcher's (tests/stand-in-sandbox-tool.mjs), which starts no container.
 *
 * WHAT IS PROVED, each by running the real tool:
 *
 *   1. A second run started while a first holds the entry stops with ok false, names the first run, makes no launcher
 *      call, reports no step and leaves the state file as it was; the first then finishes as it would alone.
 *   2. Of tools started together on one entry, exactly one holds it.
 *   3. A stale hold, whose pid is gone or now belongs to another process, is taken over, kept, and the log says so.
 *   4. A run that did not bring the entry's sandbox up does not bring it down, and says so; a run whose own down fails
 *      says a later run brings it down.
 *   5. The sweep: a running sandbox of an ended entry that no live run holds is brought down by the next run of another
 *      entry; one of an entry still testing, or of an entry a live run holds, is left alone; a down that fails is
 *      logged and the run goes on.
 *
 * Every fixture is synthetic and says so: the repositories are made under `.logs/` in this checkout and removed after,
 * and the records are filed as fixtures.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { aTestAddress, aTestIdentity, THE_MERGE_TOOLS_TEST_ADDRESS } from './the-test-commit-address.mjs'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
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

const PASSING_TEST = `import { expect, it } from 'vitest'
it('passes', () => { expect(1).toBe(1) })
`

/**
 * tools/build.mjs of the fixture: SYNTHETIC. It waits until the file <main>.go exists, so a test can keep a merge tool
 * run alive inside a long exec of the stand-in launcher for as long as it needs.
 */
const buildThatWaitsFor = (flag: string) => `import { existsSync } from 'node:fs'
while (!existsSync(${JSON.stringify(flag)})) await new Promise((resolve) => setTimeout(resolve, 100))
`

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
    'tools/build.mjs': build === 'pass' ? '// Synthetic fixture: the build succeeds.\n' : build === 'wait' ? buildThatWaitsFor(`${dir}.go`) : `import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
// Synthetic fixture: integration builds once; the later testing build waits.
const first = '.logs/first-build-finished'
if (!existsSync(first)) { mkdirSync('.logs', { recursive: true }); writeFileSync(first, '') }
else while (!existsSync(${JSON.stringify(`${dir}.go`)})) await new Promise((resolve) => setTimeout(resolve, 100))
`,
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

function stateOf(entry: string): string {
  return String(t.api.getRecord(entry)!.data['state'])
}

/** The inspector releases the run that submitted the entry, through the real check doors, as tests/the-merger.test.ts does. */
async function released(entry: string): Promise<void> {
  expect(stateOf(entry)).toBe('pinned')
  const run = String(t.api.getRecord(entry)!.data['run'])
  const sealId = String(t.api.getRecord(run)!.data['sealedTip'])
  const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: { path: string }[] } }
  const read = { sealId, sealHash: seal.hash, worktree: String(t.api.getRecord(run)!.data['workingDirectory']), tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.' }
  const assembled = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}/assembled`,
    headers: asInspector,
    payload: { changes: seal.git.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })), base: { ref: seal.git.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' }, read },
  })
  expect(assembled.statusCode, assembled.body).toBe(201)
  const verdict = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asInspector, payload: { verdict: 'released', traced: syntheticTrace(t, seal.git.files.map((one) => one.path)), check: 'Synthetic: read the changes and found nothing missing.', chaptersRead: [], read } })
  expect(verdict.statusCode, verdict.body).toBe(201)
  expect(stateOf(entry)).toBe('judged')
}

async function withdrawn(entry: string): Promise<void> {
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
/** Entries whose GET the proxy holds back, by a delay in milliseconds or by a gate, so the run reading it stays alive. */
const slowEntries = new Map<string, number | (() => Promise<void>)>()
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
    // THE BUS LEAVES AT ONCE in this test: its 30-minute wait for riders is not what this file is about.
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
    const stepMatch = /^\/api\/merge-queue\/([^/?]+)\/step$/.exec(url)
    const readMatch = /^\/api\/merge-queue\/([^/?]+)$/.exec(url)
    const slow = readMatch === null ? undefined : slowEntries.get(decodeURIComponent(readMatch[1]!))
    if (req.method === 'GET' && slow !== undefined) await (typeof slow === 'function' ? slow() : sleep(slow))
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
  base = realpathSync(mkdtempSync(join(REPO, '.logs', 'one-merge-tool-per-entry-')))
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
afterEach((context) => {
  if (context.task.result?.state === 'fail') keepTheFixtures = true
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
  else if (base !== undefined) process.stderr.write(`tests/one-merge-tool-per-entry.test.ts: a test failed, so the fixtures and the tool's logs are kept under ${base}\n`)
})

// ============================================================================ 1. a second run beside a live one

describe('a second merge tool run while a first holds the entry (acceptance finding 80)', () => {
  it('stops with ok false, names the first run, touches neither the entry nor its sandbox, and the first finishes as it would alone', async () => {
    const main = mainCheckout('second', 'wait')
    const entry = await submitGit(main, 'second', { 'src/a.txt': 'a1\na2\na3\na4\n' })
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)

    // THE FIRST RUN IS KEPT ALIVE inside the stand-in's exec of the build, which waits for <main>.go.
    const first = startTheTool(entry)
    await until('the first run to start the build in its sandbox', () => startedTheBuild(entry))
    const name = sandboxOf(entry)
    expect(isRunning(name)).toBe(true)
    const callsBefore = callLines().length
    const stateBefore = readFileSync(join(workdirOf(entry), 'state.json'), 'utf8')
    const toolBefore = t.api.getRecord(entry)!.data['tool'] as { session: string }
    expect(toolBefore.session).toBe(first.session)

    const second = await runTheTool(entry)
    expect(second.code, second.out + second.err).toBe(1)
    expect(endingOf(second)).toEqual({
      ok: false,
      says: `The merge tool could not go on: Merge tool run ${first.session} (process ${String(first.child.pid)}) holds merge entry ${entry} and is still running, so this run touched neither the entry nor its sandbox.`,
    })
    // NOTHING WENT THROUGH THE LAUNCHER, no step was reported, the state is as it was, and the entry's tool is still the first run.
    expect(callsSince(callsBefore)).toEqual([])
    expect(second.steps).toEqual([])
    expect(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8')).toBe(stateBefore)
    expect((t.api.getRecord(entry)!.data['tool'] as { session: string; endedAt?: string }).session).toBe(first.session)
    expect(isRunning(name)).toBe(true)

    writeFileSync(`${main}.go`, '')
    const firstRun = await first.done
    expect(firstRun.code, firstRun.out + firstRun.err).toBe(0)
    expect(firstRun.steps).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    expect(stateOf(entry)).toBe('merged')
    expect(callsSince(callsBefore).filter((one) => one['name'] === name).map((one) => one['verb'])).toEqual(['status', 'down', 'up', 'exec', 'exec', 'down', 'clear'])
    expect(isRunning(name)).toBe(false)
  }, 240_000)
})

// ============================================================================ 2. tools started together

describe('merge tool runs started together on one entry', () => {
  it('lets exactly one of them hold the entry', async () => {
    // SYNTHETIC ENTRY IDS the office does not hold: the hold is taken before the entry is read, and the office
    // holds each read until the twenty runs that do not hold have stopped, so the run that holds the entry is
    // still alive while they look.
    //
    // A LONG HISTORY OF STALE HOLDS, SYNTHETIC, each naming a process that has ended, written once and copied
    // by hard link into each entry. A run reads the whole folder before it makes the next number, which takes
    // some milliseconds here, so runs started together overlap between reading and making. Without the history
    // they do not: 120 runs, 6 at once on each of 20 entries, never overlapped under a plain write (25 September
    // 2026), because a read takes far less time than the spread of their start times.
    const HISTORY = 20_000
    const gone = spawn('true', [], { stdio: 'ignore' })
    await new Promise((resolve) => gone.on('exit', resolve))
    const stale = JSON.stringify({ session: 'synthetic-gone', pid: gone.pid, startedAt: '2026-01-01 00:00:00', at: '2026-01-01 00:00:00' })
    const template = join(base, 'stale-holds')
    mkdirSync(template, { recursive: true })
    for (let n = 1; n <= HISTORY; n += 1) writeFileSync(join(template, `${String(n)}.json`), stale)
    const entries = Array.from({ length: 4 }, (_, i) => `together-${String(i)}-${String(Date.now())}`)
    let started: { entry: string; child: ChildProcess; done: Promise<Run> }[] = []
    // THE FOUR HOLDERS ARE ANSWERED only once the other twenty runs have exited, so the holder stays alive
    // exactly as long as they need, rather than a fixed four seconds.
    const theOthersStopped = new Promise<void>((resolve) => {
      const from = Date.now()
      const tick = (): void => {
        const stopped = started.filter((one) => one.child.exitCode !== null || one.child.signalCode !== null).length
        if ((started.length === entries.length * 6 && stopped >= entries.length * 5) || Date.now() - from > 60_000) resolve()
        else setTimeout(tick, 10)
      }
      tick()
    })
    for (const entry of entries) {
      slowEntries.set(entry, () => theOthersStopped)
      mkdirSync(workdirOf(entry), { recursive: true })
    }
    await Promise.all(entries.map((entry) => new Promise<void>((resolve, reject) => {
      const copy = spawn('cp', ['-al', template, join(workdirOf(entry), 'holds')], { stdio: 'ignore' })
      copy.on('error', reject)
      copy.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`cp -al exited ${String(code)} for ${entry}`)))
    })))
    started = entries.flatMap((entry) => [0, 1, 2, 3, 4, 5].map(() => {
      const tool = startTheTool(entry)
      return { entry, child: tool.child, done: tool.done }
    }))
    const runs = await Promise.all(started.map((one) => one.done.then((run) => ({ entry: one.entry, run }))))
    for (const entry of entries) {
      const mine = runs.filter((one) => one.entry === entry).map((one) => one.run)
      const holders = mine.filter((run) => run.out.includes(`this run took over the hold of merge entry ${entry} from run synthetic-gone`))
      const stopped = mine.filter((run) => endingOf(run).says.includes(`holds merge entry ${entry} and is still running, so this run touched neither the entry nor its sandbox.`))
      expect(holders.length, `${entry}:\n${mine.map((run) => run.out).join('\n---\n')}`).toBe(1)
      expect(stopped.length).toBe(5)
      expect(holdsOf(entry).slice(HISTORY)).toEqual([`${String(HISTORY + 1)}.json`])
      expect(holdOf(entry, `${String(HISTORY + 1)}.json`)).toMatchObject({ session: holders[0]!.session, pid: holders[0]!.pid })
      // THE HOLDER WENT ON, and found no such entry.
      expect(endingOf(holders[0]!).says).toContain(`The office would not give merge entry ${entry}`)
    }
  }, 180_000)
})

// ============================================================================ 3. a stale hold

describe('a stale hold', () => {
  it('is taken over when its pid is gone, or now belongs to a process that began at another time, and the old hold is kept', async () => {
    const main = mainCheckout('stale')
    const entry = await submitGit(main, 'stale', { 'src/a.txt': 'a1 stale\na2\na3\n' })
    // SYNTHETIC: a hold naming a process that has ended.
    const gone = spawn('true', [], { stdio: 'ignore' })
    await new Promise((resolve) => gone.on('exit', resolve))
    mkdirSync(join(workdirOf(entry), 'holds'), { recursive: true })
    writeFileSync(join(workdirOf(entry), 'holds', '1.json'), JSON.stringify({ session: 'synthetic-gone', pid: gone.pid, startedAt: '2026-01-01 00:00:00', at: '2026-01-01 00:00:00' }))
    const first = await runTheTool(entry)
    expect(first.code, first.out + first.err).toBe(0)
    expect(first.steps).toEqual(['pinned'])
    expect(logOf(entry)).toContain(`this run took over the hold of merge entry ${entry} from run synthetic-gone, because its process ${String(gone.pid)} is gone; the old hold ${join(workdirOf(entry), 'holds', '1.json')} is kept`)
    expect(holdsOf(entry)).toEqual(['1.json', '2.json'])
    expect(holdOf(entry, '2.json')).toMatchObject({ session: first.session, pid: first.pid })

    // SYNTHETIC: a hold naming a live pid, this test's own, with a start time that is not that process's.
    writeFileSync(join(workdirOf(entry), 'holds', '3.json'), JSON.stringify({ session: 'synthetic-reused', pid: process.pid, startedAt: '2026-01-01 00:00:00', at: '2026-01-01 00:00:00' }))
    const second = await runTheTool(entry)
    expect(second.code, second.out + second.err).toBe(0)
    expect(logOf(entry)).toContain(`this run took over the hold of merge entry ${entry} from run synthetic-reused, because its process ${String(process.pid)} is now a process that began at ${localStamp(startTimeOf(process.pid)!)}, not at 2026-01-01 00:00:00`)
    expect(holdsOf(entry)).toEqual(['1.json', '2.json', '3.json', '4.json'])
    expect(holdOf(entry, '4.json')).toMatchObject({ session: second.session, pid: second.pid })
    await withdrawn(entry)
  }, 120_000)
})

// ============================================================================ 4. the ending brings down only its own sandbox

describe('the ending of a run', () => {
  it('does not bring down a sandbox another run brought up, and a failed down of its own says a later run brings it down', async () => {
    const main = mainCheckout('not-mine')
    // A PROTECTED PATH: the integrate run hands it to the inspector, so the entry waits in reinspecting.
    const entry = await submitGit(main, 'not-mine', { 'design/notes.md': 'A note a program cannot judge.\n' })
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    // THE RUN THAT BRINGS THE SANDBOX UP CANNOT BRING IT DOWN: the stand-in's down fails as it did with a stalled office.
    const integrating = await runTheTool(entry, { STAND_IN_SANDBOX_DOWN_FAILS: '1' })
    expect(integrating.code, integrating.out + integrating.err).toBe(0)
    expect(integrating.steps).toEqual(['integrating', 'integrated'])
    expect(stateOf(entry)).toBe('reinspecting')
    const name = sandboxOf(entry)
    expect(isRunning(name)).toBe(true)
    expect(logOf(entry)).toContain(`sandbox ${name} could not be brought down (exit 1)`)
    expect(logOf(entry)).toContain(`A later run of the merge tool, for this entry or another, brings it down once merge entry ${entry} has ended (merged, bounced, withdrawn or superseded) and no live run holds it.`)

    // THE NEXT RUN FINDS THE ENTRY WAITING ON THE INSPECTOR, and did not bring the sandbox up, so it leaves it.
    const before = callLines().length
    const waiting = await runTheTool(entry)
    expect(waiting.code, waiting.out + waiting.err).toBe(0)
    expect(waiting.steps).toEqual([])
    expect(callsSince(before).filter((one) => one['name'] === name)).toEqual([])
    expect(isRunning(name)).toBe(true)
    expect(logOf(entry)).toContain(`sandbox ${name} was brought up by session ${integrating.session}, not by this run, so this run did not bring it down`)
    await withdrawn(entry)
  }, 180_000)
})

// ============================================================================ 5. the sweep

describe('sandboxes that ended entries left up (problem JyLatHZdiDM5)', () => {
  it('are brought down by the next run of another entry, unless the entry is still going or a live run holds it; a failed down is logged and the run goes on', async () => {
    // EVERY RUN THAT SETS THE SCENE HAS ITS DOWNS FAIL, or its own sweep would bring down what the scene leaves up.
    const downsFail = { STAND_IN_SANDBOX_DOWN_FAILS: '1' }
    // ENDED: a text conflict bounces the entry, and the run's own down fails, so its sandbox stays up.
    const mainEnded = mainCheckout('ended')
    const ended = await submitGit(mainEnded, 'ended', { 'src/a.txt': 'a1 by the worker\na2\na3\n' })
    // MAIN MOVES AFTER THE PIN, so the rebase finds the conflict: one already there at the pin bounces it there (round 15).
    expect((await runTheTool(ended, downsFail)).code).toBe(0)
    write(mainEnded, { 'src/a.txt': 'a1 by main\na2\na3\n' })
    git(mainEnded, 'commit', '-q', '-am', 'Main moves first')
    await released(ended)
    const bounced = await runTheTool(ended, downsFail)
    expect(bounced.steps).toEqual(['integrating', 'conflict'])
    expect(stateOf(ended)).toBe('bounced')
    const endedSandbox = sandboxOf(ended)
    expect(isRunning(endedSandbox)).toBe(true)

    // HELD: another ended entry whose sandbox stayed up the same way, and which a live run holds. SYNTHETIC: the hold
    // names a live `sleep` of this test, with its real start time.
    const mainHeld = mainCheckout('held')
    const held = await submitGit(mainHeld, 'held', { 'src/a.txt': 'a1 held\na2\na3\n' })
    expect((await runTheTool(held, downsFail)).code).toBe(0)
    write(mainHeld, { 'src/a.txt': 'a1 by main too\na2\na3\n' })
    git(mainHeld, 'commit', '-q', '-am', 'Main moves first')
    await released(held)
    expect((await runTheTool(held, downsFail)).steps).toEqual(['integrating', 'conflict'])
    expect(stateOf(held)).toBe('bounced')
    const heldSandbox = sandboxOf(held)
    expect(isRunning(heldSandbox)).toBe(true)
    const sleeper = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' })
    groups.add(sleeper.pid!)
    const next = String(holdsOf(held).length + 1)
    writeFileSync(join(workdirOf(held), 'holds', `${next}.json`), JSON.stringify({ session: 'synthetic-live', pid: sleeper.pid, startedAt: localStamp(startTimeOf(sleeper.pid!)!), at: localStamp(new Date()) }))

    // STILL TESTING: the run is killed inside its build, as a crash would leave it, so no live run holds the entry.
    const mainTesting = mainCheckout('testing', 'wait-after-first')
    const testing = await submitGit(mainTesting, 'testing', { 'src/a.txt': 'a1 testing\na2\na3\n' })
    expect((await runTheTool(testing, downsFail)).code).toBe(0)
    await released(testing)
    const crashing = startTheTool(testing, downsFail)
    await until('the crashing run to start its testing build', () => stateOf(testing) === 'testing' && startedTheBuild(testing, 2))
    process.kill(-crashing.child.pid!, 'SIGKILL')
    await crashing.done
    // The separate cleanup process tries the deliberately failing down before this fixture measures another run's sweep.
    await until('the killed run to finish its cleanup attempt', () => logOf(testing).includes('merge cleanup: merge tool process ended'))
    writeFileSync(`${mainTesting}.go`, '')
    expect(stateOf(testing)).toBe('testing')
    const testingSandbox = sandboxOf(testing)
    expect(isRunning(testingSandbox)).toBe(true)

    // A RUN OF ANOTHER ENTRY, WHILE DOWNS FAIL: the ended entry's down is tried, fails, is logged, and the run goes on.
    const mainOther = mainCheckout('other')
    const other = await submitGit(mainOther, 'other', { 'src/a.txt': 'a1 other\na2\na3\n' })
    const before = callLines().length
    const failing = await runTheTool(other, downsFail)
    expect(failing.code, failing.out + failing.err).toBe(0)
    expect(failing.steps).toEqual(['pinned'])
    expect(logOf(other)).toContain(`sandbox ${endedSandbox} of merge entry ${ended}, which is bounced, was running, and the launcher could not bring it down (exit 1)`)
    expect(logOf(other)).toContain('The next run of the merge tool tries again.')
    expect(logOf(other)).toContain(`sandbox ${heldSandbox} of merge entry ${held} was left as it is: merge tool run synthetic-live (process ${String(sleeper.pid)}) holds that entry and is still running`)
    const downsWhileFailing = callsSince(before).filter((one) => one['verb'] === 'down').map((one) => one['name'])
    expect(downsWhileFailing).toContain(endedSandbox)
    expect(downsWhileFailing).not.toContain(heldSandbox)
    expect(downsWhileFailing).not.toContain(testingSandbox)
    expect(isRunning(endedSandbox)).toBe(true)

    // THE NEXT RUN, WITH DOWNS WORKING: the ended entry's sandbox goes down; the other two stay up.
    const again = callLines().length
    const sweeping = await runTheTool(other)
    expect(sweeping.code, sweeping.out + sweeping.err).toBe(0)
    expect(logOf(other)).toContain(`sandbox ${endedSandbox} of merge entry ${ended}, which is bounced, was still running and no live run holds that entry; the launcher brought it down, and its folder is kept.`)
    const downs = callsSince(again).filter((one) => one['verb'] === 'down').map((one) => one['name'])
    expect(downs).toContain(endedSandbox)
    expect(downs).not.toContain(heldSandbox)
    expect(downs).not.toContain(testingSandbox)
    expect(isRunning(endedSandbox)).toBe(false)
    expect(isRunning(heldSandbox)).toBe(true)
    expect(isRunning(testingSandbox)).toBe(true)
    expect(existsSync(join(sandboxesOf(), endedSandbox))).toBe(true)

    process.kill(-sleeper.pid!, 'SIGKILL')
    groups.delete(sleeper.pid!)
    await withdrawn(other)
  }, 360_000)
})


// ============================================================================ final cleanup (decision KTy-tBdinBQe)

describe('a final merge sandbox', () => {
  const savedSandbox = (entry: string) => JSON.parse(readFileSync(join(workdirOf(entry), 'state.json'), 'utf8')).sandbox

  async function bouncedSandbox(name: string, env: Record<string, string> = {}): Promise<string> {
    const main = mainCheckout(name)
    const entry = await submitGit(main, name, { 'src/a.txt': 'a1 by worker\na2\na3\n' })
    // MAIN MOVES AFTER THE PIN, so the rebase finds the conflict: one already there at the pin bounces it there (round 15).
    expect((await runTheTool(entry, env)).code).toBe(0)
    write(main, { 'src/a.txt': 'a1 by main\na2\na3\n' })
    git(main, 'commit', '-q', '-am', 'Synthetic conflict on main')
    await released(entry)
    expect((await runTheTool(entry, env)).code).toBe(0)
    expect(stateOf(entry)).toBe('bounced')
    return entry
  }

  // Mutation: never clear at the run's end.
  it("is cleared at the holding run's end after it becomes final", async () => {
    const entry = await bouncedSandbox('final-clear')
    const sandbox = savedSandbox(entry)
    expect(sandbox.clearWhenFinal).toBe(true)
    expect(sandbox.clearedAt).toEqual(expect.any(String))
    expect(sandbox.bytesFreed).toBeGreaterThan(0)
    expect(logOf(entry)).toContain(`sandbox ${sandbox.name} of final merge entry ${entry} was cleared at`)
    expect(logOf(entry)).toContain(`freed ${String(sandbox.bytesFreed)} bytes`)
    expect(existsSync(join(sandbox.folder, 'work/clone'))).toBe(false)
    expect(callsSince(0).filter((one) => one.name === sandbox.name).map((one) => one.verb).slice(-2)).toEqual(['down', 'clear'])
  }, 120_000)

  // Mutation: clear while a check goes.
  it('keeps the clone while its scoped re-check is going and clears it after the check ends', async () => {
    const main = mainCheckout('scoped-clear')
    const entry = await submitGit(main, 'scoped-clear', { 'design/notes.md': 'Synthetic protected change.\n' })
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    expect((await runTheTool(entry)).code).toBe(0)
    expect(stateOf(entry)).toBe('reinspecting')
    const scoped = String((t.api.getRecord(entry)!.data['reinspection'] as any).run)
    activeChecks.add(scoped)
    await withdrawn(entry)
    try {
      const before = callLines().length
      // The office refuses tool-started on a final entry; cleanup still runs under the hold.
      expect((await runTheTool(entry)).code).toBe(1)
      const sandbox = savedSandbox(entry)
      expect(sandbox.clearedAt).toBeUndefined()
      expect(existsSync(join(sandbox.folder, 'work/clone'))).toBe(true)
      expect(callsSince(before).filter((one) => one.verb === 'clear' && one.name === sandbox.name)).toEqual([])
      expect(logOf(entry)).toContain(`the check of run ${scoped} is still going`)
    } finally { activeChecks.delete(scoped) }
    expect((await runTheTool(entry)).code).toBe(1)
    expect(savedSandbox(entry).clearedAt).toEqual(expect.any(String))
  }, 120_000)

  it('retains a final clone when the office cannot read a check, then the sweep tries again', async () => {
    const main = mainCheckout('unknown-clear')
    const entry = await submitGit(main, 'unknown-clear', { 'design/notes.md': 'Synthetic protected change.\n' })
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    expect((await runTheTool(entry)).code).toBe(0)
    const run = String(t.api.getRecord(entry)!.data['run'])
    await withdrawn(entry)
    unreadChecks.add(run)
    try {
      // The office refuses tool-started on a final entry; cleanup still runs under the hold.
      expect((await runTheTool(entry)).code).toBe(1)
      expect(savedSandbox(entry).clearedAt).toBeUndefined()
      expect(logOf(entry)).toContain('Synthetic: check state unavailable.')
    } finally { unreadChecks.delete(run) }
    const other = await submitGit(mainCheckout('unknown-sweeper'), 'unknown-sweeper', { 'src/a.txt': 'a1 changed\na2\na3\n' })
    expect((await runTheTool(other)).code).toBe(0)
    expect(savedSandbox(entry).clearedAt).toEqual(expect.any(String))
    await withdrawn(other)
  }, 120_000)

  // Mutation: omit hand-run and replaced checker sessions from the office reads.
  it('retains the clone for a hand-run checker whose office-observed process is still running', async () => {
    const main = mainCheckout('manual-check-clear')
    const entry = await submitGit(main, 'manual-check-clear', { 'design/notes.md': 'Synthetic protected change.\n' })
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    expect((await runTheTool(entry)).code).toBe(0)
    const scoped = String((t.api.getRecord(entry)!.data['reinspection'] as any).run)
    const checker = t.api.createRecord({ kind: 'session', title: 'Synthetic hand-run checker', workspaceId: 'default', origin: 'fixture', actor: { type: 'agent', id: 'mq-inspector' }, data: { state: 'running', servingAgent: 'mq-inspector', extra: { purpose: 'inspection', inspectionRun: scoped } } }).id
    const child = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' })
    groups.add(child.pid!)
    try {
      const registered = await app.inject({ method: 'POST', url: '/api/resources', headers: { ...asInspector, 'x-mole-office-session': checker }, payload: { type: 'process', key: String(child.pid), sessionRecordId: checker, detail: 'Synthetic hand-run check' } })
      expect(registered.statusCode, registered.body).toBe(201)
      const observed = await app.inject({ method: 'GET', url: `/api/sessions/${checker}`, headers: asWorker })
      expect(observed.statusCode, observed.body).toBe(200)
      expect(observed.json().session.state).toBe('running')
      await withdrawn(entry)
      expect((await runTheTool(entry)).code).toBe(1)
      expect(savedSandbox(entry).clearedAt).toBeUndefined()
      expect(existsSync(join(savedSandbox(entry).folder, 'work/clone'))).toBe(true)
      expect(logOf(entry)).toContain(`the office has not shown checker ${checker} ended (running)`)
    } finally {
      const ended = new Promise<void>((go) => child.once('close', () => go()))
      process.kill(-child.pid!, 'SIGKILL')
      await ended
      groups.delete(child.pid!)
    }
    const data = t.api.getRecord(checker)!.data
    writeDataBypassingTheGate(t, checker, { ...data, state: 'finished', extra: { ...(data['extra'] as Record<string, unknown>), inspectionEnding: { at: localStamp(new Date()) } } })
    expect((await runTheTool(entry)).code).toBe(1)
    expect(savedSandbox(entry).clearedAt).toEqual(expect.any(String))
  }, 120_000)

  // Mutations, each alone: clear the unmarked one too; skip the marked one.
  it('the sweep clears a marked final sandbox already down and leaves an unmarked folder with one log line', async () => {
    const marked = await bouncedSandbox('marked-sweep', { STAND_IN_SANDBOX_CLEAR_FAILS: '1' })
    const old = await bouncedSandbox('unmarked-sweep', { STAND_IN_SANDBOX_CLEAR_FAILS: '1' })
    const file = join(workdirOf(old), 'state.json')
    const state = JSON.parse(readFileSync(file, 'utf8'))
    delete state.sandbox.clearWhenFinal
    writeFileSync(file, JSON.stringify(state))
    const other = await submitGit(mainCheckout('clear-sweeper'), 'clear-sweeper', { 'src/a.txt': 'a1 other\na2\na3\n' })
    const before = callLines().length
    const ran = await runTheTool(other)
    expect(ran.code, ran.out + ran.err).toBe(0)
    expect(savedSandbox(marked).clearedAt).toEqual(expect.any(String))
    expect(savedSandbox(marked).bytesFreed).toBeGreaterThan(0)
    expect(savedSandbox(old).clearedAt).toBeUndefined()
    expect(existsSync(join(savedSandbox(old).folder, 'work/clone'))).toBe(true)
    expect(callsSince(before).filter((one) => one.verb === 'clear').map((one) => one.name)).toContain(savedSandbox(marked).name)
    expect(callsSince(before).filter((one) => one.verb === 'clear').map((one) => one.name)).not.toContain(savedSandbox(old).name)
    const message = '1 merge sandbox with no clearWhenFinal mark, started before the merge tool cleared its sandboxes, was left as found; that cleanup is decided separately'
    expect(ran.out.split(message)).toHaveLength(2)
    await withdrawn(other)
  }, 180_000)
})
