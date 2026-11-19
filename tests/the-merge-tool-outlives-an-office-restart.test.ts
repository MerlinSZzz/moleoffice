// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE MERGE TOOL OUTLIVES AN OFFICE RESTART IN THE MIDDLE OF ITS SUITE. Wave 13k, finding 80 of
 * report EnJvvsDTF_Dx.
 *
 * On 25 September 2026 the office restarted while merge tool run W_b7Dour1ayt ran the whole suite for
 * merge entry c_Y0JSgLT6Y6. The suite's own command had a process row under the tool's session, and
 * the new worker followed that row, because it was the newest live one. When the suite ended, the
 * worker took the tool for crashed and started a second tool for the same entry. This file does the
 * same thing on a test office, end to end, and says whether the tool now lives through it.
 *
 * THE OFFICE IS A REAL SERVER PROCESS, started three times on one database and one port of its own,
 * never the live office's port. Each start is a new process, so each has its own load time (THIS_SERVER_LOADED_AT in
 * src/server/lib/worker.ts) and runs its own start-up work, as a restart on the owner's machine does.
 * A stop is a SIGTERM to the server's process group, and the test waits until the port refuses. The
 * worker is this file's calls to `onePass`, as tests/the-worker-runs-the-merge-tool-in-its-own-slot
 * does, in merges-only mode. Each server gets a new, empty list of merge runs, because a new server
 * starts a new worker, and a new worker knows only what the office tells it.
 *
 * WHAT IS PROVED, in order, on one entry:
 *
 *   1. The worker starts the real tools/the-merger.mjs for a submitted entry. It pins it, and the
 *      worker closes that run as finished.
 *   2. After the inspector's release, the worker starts the tool again. The tool integrates and waits
 *      in line for the full-suite seat, which a synthetic holder has.
 *   3. FIRST RESTART, while the tool waits for the seat. The tool's request for the seat meets no
 *      office. The tool waits it out and asks again, and the new office answers. The new worker picks
 *      the run up.
 *   4. The holder gives the seat back. The tool builds, and starts the suite. The suite's command has
 *      a process row of its own under the tool's session, as with tools/sandbox.mjs exec.
 *   5. SECOND RESTART, in the middle of the suite. The new worker picks the run up.
 *   6. The suite's command ends. The worker does not close the run, and starts no second tool. The
 *      tool reports `tested`, green, lands the entry, and prints its ending line. Only then does the
 *      worker close the run, as finished. The entry is merged, as it would be with no restart.
 *   7. Office 1 was first given a port this file held on purpose, and that start was refused with
 *      EADDRINUSE. Office 1 answered on another port, and both restarts came back on that one.
 *
 * WHAT IS NOT REAL. The worker starts tests/the-real-merge-tool-in-test-folders.mjs, named by
 * MOLE_OFFICE_FAKE_MERGE_TOOL. It runs the real tools/the-merger.mjs with this test's folders and
 * with tests/stand-in-sandbox-tool-that-files-rows.mjs in place of tools/sandbox.mjs, so nothing runs
 * in a container. The lane is a synthetic git repository made under `.logs/` in this checkout. Its
 * suite has one test that waits until this file writes a file, so the suite ends when this file
 * says. The submitting run and the seat holder are filed as fixtures. The inspector's release goes
 * through the real check doors, as tests/the-merger.test.ts does it.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aTestAddress, aTestIdentity } from './the-test-commit-address.mjs'

import { KEY_HEADER } from '../src/config/key-header.mjs'
import { readTheMergeToolEnding } from '../src/config/merge-tool.mjs'
import { theOfficeKey } from '../src/config/office-key.mjs'
import { onePass, type PassReport, type WorkerSettings } from '../src/worker/index.ts'
import { apiServerArguments, apiApp, freshDb, retryWhenAPortWasTaken, saysThePortWasTaken, ThePortWasTaken, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const WRAPPER = join(CHECKOUT, 'tests', 'the-real-merge-tool-in-test-folders.mjs')
const THE_WORKER = 'mole-office/the-message-worker'

const as = (type: 'agent' | 'human', id: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asWorker = as('agent', 'rs-worker')
const asInspector = as('agent', 'rs-inspector')
/**
 * THE INSPECTOR AS THE REAL CHECK TOOL KNOCKS: its name, and the office's own key (tools/the-inspector.mjs,
 * theOfficeKeyHeader). The door that takes a verdict refuses one that comes with no key (acceptance finding 79). The key
 * is the one this test's office made beside its own database, found the way every tool of the office finds it.
 */
function asTheCheckTool(): Record<string, string> {
  const held = theOfficeKey({ ...withoutInheritedEffort(), MOLE_OFFICE_DB: t.file })
  if (held.key === null) throw new Error(`this test's office has no key of its own: ${held.says}`)
  return { ...asInspector, [KEY_HEADER]: held.key }
}

let t: TestDb
let base = ''
let outputs = ''
let lane = ''
let entry = ''
let holder = ''
/** The full-suite seat the synthetic holder took. */
let holderSeat = ''
let port = 0
let api = ''
let settings: WorkerSettings
/**
 * THE PORT OFFICE 1 IS GIVEN FIRST, HELD ON PURPOSE BY A LISTENER OF THIS FILE'S.
 *
 * On 26 October 2026, in the merge queue's run of many files at once, office 1 never answered. This
 * file had asked for a free port and let it go, and the office binds its port only once tsx has
 * loaded the server, seconds later. In that gap something else took the port. The office refused to
 * start with EADDRINUSE, and the wait went on for its whole 150 seconds. So every run meets that case
 * now: the first port office 1 is given is held until office 1 is up, and office 1 must answer on
 * another one. The two restarts must come back on office 1's port, because the merge tool the worker
 * started knows the office only by that address.
 */
let heldOnPurpose = 0
/** Every process group this file started, so none outlives it whatever a test did. */
const groups = new Set<number>()
/** Every start of an office process, in order, with the port it was given and its log, the ones that never answered too. */
const starts: { port: number; log: string }[] = []
/** The servers, in the order they were started. */
const servers: { pgid: number; log: string; pid: number; port: number }[] = []
/** The worker's list of merge runs. A new server starts a new worker, so each restart replaces it with an empty one. */
let merges: NonNullable<Parameters<typeof onePass>[2]> = []
/** Every pass's report, with which server it ran against. */
const passes: { server: number; report: PassReport }[] = []
/** The tool run the second start made, and the process the worker started for it. */
let toolSession = ''
let toolPid = 0

const gate = () => join(base, 'the-suite-may-end')
const suiteIsRunning = () => join(base, 'the-suite-is-running')
const toolLog = () => join(base, 'work', entry, 'the-merger.log')

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function write(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise((go) => setTimeout(go, ms))

async function until(what: string, limitMs: number, done: () => Promise<boolean> | boolean): Promise<void> {
  const deadline = Date.now() + limitMs
  while (!(await done())) {
    if (Date.now() > deadline) throw new Error(`${what} did not happen within ${String(limitMs / 1000)} seconds.`)
    await sleep(250)
  }
}

async function call(method: 'GET' | 'POST', path: string, headers: Record<string, string>, body?: unknown) {
  const r = await fetch(`${api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const raw = await r.text()
  return { status: r.status, body: (raw === '' ? {} : JSON.parse(raw)) as Record<string, any>, raw }
}

async function theEntry(): Promise<Record<string, any>> {
  const r = await call('GET', `/api/merge-queue/${entry}`, asPerson)
  expect(r.status, r.raw).toBe(200)
  return r.body['entry'] as Record<string, any>
}

async function theRecord(id: string): Promise<Record<string, any>> {
  const r = await call('GET', `/api/records/${id}`, asPerson)
  expect(r.status, r.raw).toBe(200)
  return r.body['record'] as Record<string, any>
}

/** The process rows of one session, open and released, newest first as the ledger lists them. */
async function processRowsOf(session: string): Promise<Record<string, any>[]> {
  const r = await call('GET', `/api/resources?sessionRecordId=${session}&includeReleased=true`, asPerson)
  expect(r.status, r.raw).toBe(200)
  return (r.body['resources'] as Record<string, any>[]).filter((row) => row.type === 'process')
}

// ============================================================================ the office, as a process

const freePort = (): Promise<number> =>
  new Promise((ok, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address() as AddressInfo
      probe.close(() => ok(address.port))
    })
  })

/** A listener on a free port that drops every connection at once: the other program that took office 1's port. */
const aStrangerOnAFreePort = (): Promise<{ port: number; close: () => Promise<void> }> =>
  new Promise((ok, fail) => {
    const stranger = createServer((socket) => socket.destroy())
    stranger.on('error', fail)
    stranger.listen(0, '127.0.0.1', () => {
      const address = stranger.address() as AddressInfo
      ok({ port: address.port, close: () => new Promise<void>((done) => stranger.close(() => done())) })
    })
  })

async function answers(): Promise<boolean> {
  try {
    const r = await fetch(`${api}/api/health`, { headers: asPerson, signal: AbortSignal.timeout(5_000) })
    await r.arrayBuffer()
    return true
  } catch {
    return false
  }
}

/**
 * Start the office on the test's database and port, and wait until it answers. A new worker comes with it.
 *
 * THE WAIT ENDS WHEN THE OFFICE EXITS, and the failure quotes its log. On 26 October 2026 an office
 * that had refused its port was gone in seconds, and the wait still went on for its whole 150
 * seconds. When the log says the port was taken, office 1 throws `ThePortWasTaken`, so
 * `startTheFirstOffice` can start it again on another port. A restart throws a plain failure: it
 * must come back on office 1's port, so it is never moved.
 */
async function startTheOffice(): Promise<void> {
  const number = servers.length + 1
  const log = join(base, `office-start-${String(starts.length + 1)}.log`)
  starts.push({ port, log })
  const out = openSync(log, 'a')
  const child: ChildProcess = spawn(join(CHECKOUT, 'node_modules/.bin/tsx'), apiServerArguments(), {
    cwd: CHECKOUT,
    detached: true,
    stdio: ['ignore', out, out],
    env: {
      ...withoutInheritedEffort(),
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_WEB_PORT: String(await freePort()),
      MOLE_OFFICE_DB: t.file,
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none',
      // THIS FILE IS THE WORKER, so the server starts none of its own.
      MOLE_OFFICE_MESSAGE_WORKER: 'off',
      LOG_LEVEL: 'warn',
    },
  })
  closeSync(out)
  groups.add(child.pid!)
  let exited = ''
  child.once('exit', (code, signal) => {
    exited = signal === null ? `exited with code ${String(code)}` : `was ended by ${signal}`
  })
  await until(`office ${String(number)} answering on port ${String(port)}`, 150_000, async () => exited !== '' || (await answers())).catch((err: Error) => {
    throw new Error(`${err.message} Its log: ${readFileSync(log, 'utf8').slice(-2000)}`)
  })
  if (exited !== '') {
    groups.delete(child.pid!)
    const said = readFileSync(log, 'utf8')
    const why = `Office ${String(number)}, started on port ${String(port)}, ${exited} before it answered. Its log: ${said.slice(-2000)}`
    if (!saysThePortWasTaken(said, port)) throw new Error(why)
    if (number === 1) throw new ThePortWasTaken(port, true, why)
    throw new Error(
      `Something else took port ${String(port)} while office ${String(number - 1)} was down. A restart keeps office 1's port, ` +
        `because the merge tool the worker started knows the office only by that address, so nothing was retried.\n\n${why}`,
    )
  }
  // THE PROCESS THAT ANSWERS, by its own word, so a restart is shown to be a new process on the same port.
  const runtime = await call('GET', '/api/runtime', asPerson)
  expect(runtime.status, runtime.raw).toBe(200)
  servers.push({ pgid: child.pid!, log, pid: Number(runtime.body['process'].pid), port })
  merges = []
}

/**
 * Start office 1 on `first`, and again on a free port each time something else had taken the one it
 * was given. Four attempts, because the first port is held on purpose, so three are left for a busy
 * machine, as many as tests/helpers.ts gives a server.
 */
async function startTheFirstOffice(first: number): Promise<void> {
  let given = first
  await retryWhenAPortWasTaken('office 1', async () => {
    port = given === 0 ? await freePort() : given
    given = 0
    api = `http://127.0.0.1:${String(port)}`
    await startTheOffice()
  }, 4)
}

/** Stop the office by its process group, and wait until its port refuses. */
async function stopTheOffice(): Promise<void> {
  const { pgid } = servers.at(-1)!
  process.kill(-pgid, 'SIGTERM')
  groups.delete(pgid)
  await until(`office ${String(servers.length)} closing port ${String(port)}`, 60_000, async () => !(await answers()))
}

async function pass(): Promise<PassReport> {
  const report = await onePass(settings, [], merges)
  passes.push({ server: servers.length, report })
  return report
}

async function passUntil(what: string, limitMs: number, done: () => Promise<boolean> | boolean): Promise<void> {
  await until(what, limitMs, async () => {
    await pass()
    return done()
  })
}

const everyPassSince = (index: number) => passes.slice(index).map((one) => one.report.merges)

// ============================================================================ fixtures

/**
 * THE LANE: a synthetic main checkout. Its suite has two files. One passes. The other writes a file
 * to say it is running, then waits until this test writes the gate, for ten minutes at most.
 */
function theLane(): string {
  const dir = realpathSync(mkdtempSync(join(base, 'main-')))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', aTestAddress('fixture'))
  git(dir, 'config', 'user.name', 'Synthetic restart fixture')
  write(dir, {
    'package.json': JSON.stringify(
      {
        name: 'synthetic-restart-fixture',
        private: true,
        type: 'module',
        scripts: { build: 'node -e "process.exit(0)"', test: 'vitest run', 'db:backup': 'node tools/backup.mjs', 'db:migrate': 'node -e "process.exit(0)"' },
      },
      null,
      2,
    ),
    '.gitignore': 'node_modules\n',
    'tools/backup.mjs': "// Synthetic backup answer for this restart fixture.\nconsole.log(JSON.stringify({ from: 'synthetic-source.db', to: 'synthetic-backup.db', ms: 1 }, null, 2))\n",
    'vitest.config.mjs': "export default { test: { include: ['tests/**/*.test.ts'] } }\n",
    'tests/one.test.ts': "import { expect, it } from 'vitest'\nit('passes', () => { expect(1).toBe(1) })\n",
    'tests/waits.test.ts': [
      "import { existsSync, writeFileSync } from 'node:fs'",
      "import { expect, it } from 'vitest'",
      "it('waits until the restart test lets it end', async () => {",
      `  writeFileSync(${JSON.stringify(suiteIsRunning())}, String(process.pid))`,
      '  const deadline = Date.now() + 600_000',
      `  while (!existsSync(${JSON.stringify(gate())}) && Date.now() < deadline) await new Promise((go) => setTimeout(go, 200))`,
      `  expect(existsSync(${JSON.stringify(gate())})).toBe(true)`,
      '}, 660_000)',
      '',
    ].join('\n'),
    'src/a.txt': 'a1\n',
  })
  symlinkSync(realpathSync(join(CHECKOUT, 'node_modules')), join(dir, 'node_modules'))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  return dir
}

/** A worker's clone of the lane with one commit on `work`, changing one file no generator reads. */
function theWorkersClone(): string {
  const dir = join(base, 'worker')
  execFileSync('git', ['clone', '-q', lane, dir], { stdio: 'ignore' })
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'src', 'a.txt'), 'a1\na2\n')
  git(dir, 'add', '-A')
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'Synthetic submission'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...withoutInheritedEffort(), ...aTestIdentity('Synthetic worker', 'worker') },
  })
  return realpathSync(dir)
}

/**
 * EVERYTHING BEFORE THE OFFICE PROCESS STARTS, written in this process on the test's own database:
 * the two agents, the lane, the submitting run, sealed, the entry, and the seat holder's session.
 * Then this process closes the database, and only the office process opens it after.
 */
async function theEntryAndItsRun(): Promise<void> {
  const app = (await apiApp()).app
  await app.ready()
  const inject = async (method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload: Record<string, unknown>) => {
    const r = await app.inject({ method, url, headers, payload })
    expect(r.statusCode, r.body).toBeLessThan(300)
    return r.json() as Record<string, any>
  }
  await inject('POST', '/api/agents/started', asPerson, { handle: 'rs-worker', name: 'Synthetic rs-worker', workArea: ['src', 'tests'] })
  await inject('POST', '/api/agents/started', asPerson, { handle: 'rs-inspector', name: 'Synthetic rs-inspector', role: 'inspector' })
  const repositories = await import('../src/server/lib/repositories.ts')
  const repository = repositories.registerRepository({ workspaceId: 'default', name: 'fixture-restart', root: lane, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } }).id
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run that submits to the merge queue',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'rs-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'rs-worker', cutFrom: 'main', workingDirectory: theWorkersClone() },
  }).id
  theRunReportsForTheQueue(t, run, { type: 'agent', id: 'rs-worker' })
  await inject('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
  entry = String((await inject('POST', '/api/merge-queue', asWorker, { run, changeset: { adapter: 'git', repository, branch: 'work' } }))['entry'].id)
  holder = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic holder of the full-suite seat',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'rs-worker' },
    origin: 'fixture',
    data: { state: 'running' },
  }).id
  await app.close()
  t.client.sqlite.close()
}

/** The inspector releases the submitting run through the real check doors, as tests/the-merger.test.ts does. */
async function theInspectorReleasesIt(): Promise<void> {
  const run = String((await theEntry())['run'])
  const runData = (await theRecord(run))['data'] as Record<string, any>
  const sealId = String(runData['sealedTip'])
  const seal = ((await theRecord(sealId))['data'] as Record<string, any>)['seal'] as { hash: string; git: { commit: string; forkBase: string; files: { path: string }[] } }
  const read = { sealId, sealHash: seal.hash, worktree: String(runData['workingDirectory']), tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.' }
  const assembled = await call('POST', `/api/checks/${run}/assembled`, asTheCheckTool(), {
    changes: seal.git.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })),
    base: { ref: seal.git.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' },
    read,
  })
  expect(assembled.status, assembled.raw).toBe(201)
  const paths = seal.git.files.map((one) => one.path)
  const said = `Synthetic permission for the test to change ${paths.join(', ')}.`
  const permission = await call('POST', '/api/records', asPerson, { kind: 'note', title: 'Synthetic permission for restart fixture', summary: said, data: {} })
  expect(permission.status, permission.raw).toBe(201)
  const verdict = await call('POST', `/api/checks/${run}`, asTheCheckTool(), { verdict: 'released',
    traced: [{ paths, to: permission.body['record'].id, how: "the person's word", said }],
    check: 'Synthetic: read the change and found nothing missing.', chaptersRead: [], read })
  expect(verdict.status, verdict.raw).toBe(201)
}

// ============================================================================ set-up

beforeAll(async () => {
  t = await freshDb()
  mkdirSync(join(CHECKOUT, '.logs'), { recursive: true })
  base = realpathSync(mkdtempSync(join(CHECKOUT, '.logs', 'the-merge-tool-outlives-an-office-restart-')))
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-restart-outputs-'))
  lane = theLane()
  await theEntryAndItsRun()
  // THE FIRST PORT OFFICE 1 IS GIVEN IS HELD UNTIL OFFICE 1 IS UP. `heldOnPurpose` says why.
  const stranger = await aStrangerOnAFreePort()
  heldOnPurpose = stranger.port
  try {
    await startTheFirstOffice(heldOnPurpose)
  } finally {
    await stranger.close()
  }
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: CHECKOUT,
    runs: 1,
    hops: 3,
    outputRoot: outputs,
    mergesOnly: true,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_MERGE_TOOL: WRAPPER, RESTART_TEST_BASE: base, RESTART_TEST_DB: t.file },
  }
}, 360_000)

let keepTheFixtures = false

afterAll(async () => {
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Gone already.
    }
  }
  for (const run of merges) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle)
  if (toolPid !== 0 && alive(toolPid)) process.kill(-toolPid, 'SIGKILL')
  await sleep(500)
  try {
    t?.close()
  } catch {
    // The database was closed already; its folder is removed all the same by the test helpers.
  }
  if (outputs !== '' && !keepTheFixtures) rmSync(outputs, { recursive: true, force: true })
  if (base !== '' && !keepTheFixtures) rmSync(base, { recursive: true, force: true })
  else if (base !== '') process.stderr.write(`the-merge-tool-outlives-an-office-restart: a test failed, so the lane, the tool's logs and the office logs are kept under ${base}, and the worker's output under ${outputs}\n`)
}, 60_000)

function keepOnFailure<T>(body: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      return await body()
    } catch (err) {
      keepTheFixtures = true
      throw err
    }
  }
}

// ============================================================================ the tests, in order

describe('the merge tool across two office restarts', () => {
  it('pins the entry in a first tool run that the worker starts and closes as finished', keepOnFailure(async () => {
    await passUntil('the pin run closed', 120_000, () => passes.some((one) => one.report.merges.ended.length > 0))
    const started = passes.flatMap((one) => one.report.merges.started)
    const ended = passes.flatMap((one) => one.report.merges.ended)
    expect(started).toHaveLength(1)
    expect(ended.map((one) => one.session)).toEqual([started[0]!.session])
    expect((await theEntry())['state']).toBe('pinned')
    expect(((await theRecord(started[0]!.session))['data'] as Record<string, any>)['state']).toBe('finished')
  }), 180_000)

  it('starts the tool again after the release, and the tool waits in line for the full-suite seat', keepOnFailure(async () => {
    // THE SEAT IS TAKEN FIRST, by a synthetic holder with a sleeping process of its own.
    const sleeper = spawn('sleep', ['900'], { detached: true, stdio: 'ignore' })
    groups.add(sleeper.pid!)
    const seat = await call('POST', '/api/slots/acquire', as('agent', 'rs-worker', holder), { pool: 'full-suite', pid: sleeper.pid, sessionRecordId: holder, detail: 'a synthetic suite' })
    expect(seat.status, seat.raw).toBe(200)
    expect(seat.body['slot'].state).toBe('granted')
    holderSeat = String(seat.body['slot'].id)

    await theInspectorReleasesIt()
    expect((await theEntry())['state']).toBe('judged')
    const from = passes.length
    await passUntil('the second tool run to wait for the seat', 180_000, () => existsSync(toolLog()) && readFileSync(toolLog(), 'utf8').includes('waiting for the full-suite seat'))
    const started = everyPassSince(from).flatMap((one) => one.started)
    expect(started).toHaveLength(1)
    toolSession = started[0]!.session
    toolPid = merges.find((run) => run.session === toolSession)!.handle.pid
    expect((await theEntry())['state']).toBe('testing')
  }), 240_000)

  it('waits out the office while it restarts, and the new worker picks the run up', keepOnFailure(async () => {
    await stopTheOffice()
    // THE TOOL ASKS FOR ITS SEAT EVERY SECOND, so within a few seconds it has met the closed port.
    await until('the tool meeting a closed office', 60_000, () => readFileSync(toolLog(), 'utf8').includes('the office did not answer POST /api/slots/acquire'))
    await sleep(3_000)
    await startTheOffice()
    expect(servers[1]!.pid).not.toBe(servers[0]!.pid)
    const from = passes.length
    await pass()
    expect(everyPassSince(from).flatMap((one) => one.pickedUp)).toEqual([toolSession])
    expect(alive(toolPid)).toBe(true)
  }), 240_000)

  it('takes the seat once it is free, builds, and runs its suite with a process row of its own', keepOnFailure(async () => {
    const back = await call('POST', `/api/slots/${holderSeat}/release`, as('agent', 'rs-worker', holder), { note: 'the synthetic suite is over' })
    expect(back.status, back.raw).toBe(200)
    const from = passes.length
    await passUntil('the suite running', 180_000, async () => existsSync(suiteIsRunning()) && (await processRowsOf(toolSession)).some((row) => row.releasedAt === null && String(row.detail).includes('npm test')))
    expect(readFileSync(toolLog(), 'utf8')).toContain('holding the full-suite seat')
    expect(everyPassSince(from).flatMap((one) => [...one.ended, ...one.started])).toEqual([])
    const rows = await processRowsOf(toolSession)
    // THE NEWEST OPEN ROW OF THE TOOL'S SESSION IS THE SUITE'S, not the tool's own, which is what finding 80 needs.
    expect(String(rows.find((row) => row.releasedAt === null)!.detail)).toContain('npm test')
    expect(rows.some((row) => row.releasedAt === null && Number(row.key) === toolPid)).toBe(true)
  }), 240_000)

  it('restarts in the middle of the suite, and the new worker picks the run up', keepOnFailure(async () => {
    await stopTheOffice()
    await sleep(3_000)
    await startTheOffice()
    expect(servers[2]!.pid).not.toBe(servers[1]!.pid)
    expect(existsSync(suiteIsRunning())).toBe(true)
    expect(existsSync(gate())).toBe(false)
    const from = passes.length
    await pass()
    await pass()
    expect(everyPassSince(from).flatMap((one) => one.pickedUp)).toEqual([toolSession])
    expect(everyPassSince(from).flatMap((one) => [...one.ended, ...one.started])).toEqual([])
  }), 240_000)

  it("does not close the run when the suite's command ends, and starts no second tool", keepOnFailure(async () => {
    writeFileSync(gate(), 'the restart test lets the suite end\n')
    const from = passes.length
    // PASSES UNTIL THE TOOL ITSELF HAS ENDED, and one more, which is when a close is right.
    await passUntil('the tool ending', 240_000, () => !alive(toolPid))
    const whileAlive = everyPassSince(from).slice(0, -1)
    expect(whileAlive.flatMap((one) => one.ended), 'the worker closed the run while the tool was still running').toEqual([])
    expect(everyPassSince(from).flatMap((one) => one.started), 'the worker started a second tool for the entry').toEqual([])
    const rows = await processRowsOf(toolSession)
    expect(rows.filter((row) => String(row.detail).includes('npm test')).every((row) => row.releasedAt !== null)).toBe(true)
  }), 300_000)

  it('the tool reported tested and its ending line, the worker closed it as finished, and the entry is merged', keepOnFailure(async () => {
    // THE CLOSE MAY HAVE COME IN THE PASS THAT FOUND THE TOOL GONE, so every pass is read.
    const closes = () => passes.flatMap((one) => one.report.merges.ended).filter((one) => one.session === toolSession)
    if (closes().length === 0) await passUntil('the worker closing the run', 60_000, () => closes().length > 0)
    expect(closes()).toHaveLength(1)
    expect(closes()[0]!.because).toMatch(/^The merge tool finished: the entry is merged/)
    const final = await theEntry()
    expect(readFileSync(toolLog(), 'utf8')).toContain('step tested:')
    expect(final['machine']?.tested?.green, JSON.stringify(final['machine']?.tested)).toBe(true)
    const ending = readTheMergeToolEnding(readFileSync(String(final['tool'].log), 'utf8'))
    expect(ending, 'the tool printed no ending line').not.toBeNull()
    expect(ending!.ok).toBe(true)
    expect(((await theRecord(toolSession))['data'] as Record<string, any>)['state']).toBe('finished')
    expect(final['state']).toBe('merged')
    expect(final['tool'].session).toBe(toolSession)
    // NO THIRD TOOL RUN FOR A MERGED ENTRY, and the lane is at what the entry landed.
    await pass()
    expect(passes.flatMap((one) => one.report.merges.started)).toHaveLength(2)
    expect(git(lane, 'show', 'HEAD:src/a.txt')).toBe('a1\na2')
  }), 120_000)

  it('office 1 answered on another port when its first was held, and both restarts came back on its port', keepOnFailure(async () => {
    // THE FIRST START WAS GIVEN THE HELD PORT, and the office said it could not take it.
    expect(starts[0]!.port).toBe(heldOnPurpose)
    expect(saysThePortWasTaken(readFileSync(starts[0]!.log, 'utf8'), heldOnPurpose), readFileSync(starts[0]!.log, 'utf8')).toBe(true)
    // OFFICE 1 IS UP ON ANOTHER PORT, and the two restarts kept that one.
    expect(servers).toHaveLength(3)
    expect(servers[0]!.port).not.toBe(heldOnPurpose)
    expect(servers.map((one) => one.port)).toEqual(servers.map(() => servers[0]!.port))
  }))
})

