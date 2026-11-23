// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE LAUNCHER ASKS THE LEDGER AGAIN WHILE THE OFFICE RESTARTS, AND ONLY THEN. Wave 13k's report (fLO2mRF38b9C, block
 * b-8, first point; message iGIO8xL2Mw78): tools/sandbox.mjs and tools/sandbox-start.mjs asked the ledger once
 * to register a command's process row, and gave up at once on a refused connection, so a build or a suite that started
 * while the office restarted never ran. askTheOfficeWhileItRestarts in tools/sandbox-common.mjs asks again, and only
 * while the connection is refused: then the request never reached the office, so asking again cannot write twice.
 *
 * The office is a real one on a port of its own (the whole API over a throwaway database). A restart is a relay that
 * starts listening late: until it listens, a connection to its port is refused, which is what an office that is
 * restarting looks like to a caller. Docker and the devcontainer CLI are the stand-ins of tests/sandbox-stand-ins.ts.
 *
 * A RESTART IS TIMED FROM THE LAUNCHER'S FIRST REQUEST, never from the moment the test starts the launcher. So a case
 * measures how the launcher asks again, and not how long the launcher took to start. The launcher's start loads its
 * modules before it asks anything: about 110 ms on an idle machine, and far more on a busy one. On a clock that started
 * when the launcher was spawned, the start ate into the restart, and on a machine at a load average of about 30 the
 * restart had ended before the launcher asked, so cases 5 and 7 went red with nothing wrong in the launcher. A refused
 * connection never reaches a listener, so the first request is heard where the launcher says it: the restart starts at
 * the first line on its standard error that says the office was out. Every launcher started through a restart starts
 * A_SLOW_START_MS late, longer than a whole restart, as a busy machine makes its start slow: a module this file
 * preloads waits that long, using no processor, before the launcher's own modules load. No load is made for this.
 *
 * What this pins:
 *
 *   1. a refused connection is asked again, and the answer that comes once the office listens is the one answered;
 *   2. an answer, a refusal included, is answered at once, after one request;
 *   3. once nothing waits for the answer, it stops asking;
 *   4. a connection that broke after the request went out is not asked again, because the write may have happened;
 *   5. the launcher on the host registers a build's process row through a restart, and the build runs;
 *   6. the helper registers its command's process row through a restart, and the command starts. That command is the
 *      caller's own, no run, so its row is not marked as started by the product;
 *   7. a restart as the dev supervisor runs one, whose stand-in answers the registration first, still registers the
 *      build's row, and exactly once (wave 13x, round 8). The stand-in is the real tools/serve-dev-stand-in.mjs on a
 *      socket held as tools/serve-dev.mjs holds it, and the office then takes the same socket. The stand-in answers
 *      during every restart after a landing, while the new server checks its migrations, and says that nothing was
 *      read or written, so the registration is asked again.
 *   8. an agent's run started while the office refuses the connection waits at the hand-run ask, then files its run
 *      and starts, once the office listens;
 *   9. the same start through the real stand-in waits through its answers, and its run is filed exactly once;
 *  10. a worker start waits at the registered-agent ask as well as the hand-run ask, and goes on;
 *  11. a start that still cannot reach the office after the wait keeps today's sentence and says how long it asked
 *      again for, and makes no worktree and files no run;
 *  12. a start through a stand-in that answers past the wait refuses, and its words name how long it asked again for.
 *  13. a worker start, whose first ask is the registered-agent ask, against an address where nothing listens refuses
 *      with the reason said once: the office's words and how long it asked again for each appear exactly once, and no
 *      worktree is made and no run filed;
 *  14. the same worker start through a stand-in that answers past the wait refuses the same way, with the reason said
 *      once.
 *
 * MUTATION PROOF, 26 September 2026, each alone after a green control, in the acc-assets sandbox (the logs are named in
 * the report of the run that added this file):
 *   - askTheOfficeWhileItRestarts asks once: cases 1, 3, 5 and 6 go red (3 because nothing then says why it stopped);
 *   - it asks again whatever went wrong, not only on a refused connection: case 4 goes red;
 *   - it ignores stillWanted: case 3 goes red;
 *   - the host's registration asks once (askTheOffice): case 5 goes red;
 *   - the helper's registration asks once (askTheOffice): case 6 goes red;
 *   - the helper marks every row it registers as started by the product, the caller's own command's too: case 6 goes red.
 *
 * MUTATION PROOF of case 7, 9 October 2026, in the w13x sandbox (logs named in the report of the run that added it):
 *   - askTheOfficeWhileItRestarts answers the stand-in's 503 instead of asking again: case 7 goes red.
 *
 * MUTATION PROOF of cases 8 to 12, 16 October 2026, in the w13j sandbox (the logs are named in the report of the run
 * that added them):
 *   - the hand-run ask goes back to askTheOffice: cases 8, 9, 11 and 12 go red (11 and 12 wait at that same ask);
 *   - theAgentIsRegistered goes back to askTheOffice: case 10 goes red;
 *   - the refusal after the wait keeps today's sentence alone: cases 11 and 12 go red;
 *   - the shortened wait is ignored when SANDBOX_HAND_START_WAIT_MS names one: cases 11 and 12 each go red on their own
 *     60000 ms timeout, because a wait of 180 seconds outlives the case.
 *
 * PROOF OF THE TIMING, 30 October 2026, each alone after a green control, in the w13m sandbox (the logs are named in
 * the report of the run that made it). The slow start replaces a processor burner as the proof, because no load is
 * made on this machine while ordinary tests run on it:
 *   - with the slow start, each restart's clock starts when the test makes it, as before: cases 5 to 10 go red,
 *     because the restart has ended by the time the launcher asks;
 *   - askTheOfficeWhileItRestarts asks once, with the restarts timed from the first request: cases 1, 3 and 5 to 14 go
 *     red.
 *
 * THE SLOW START SHORTENED FROM 2 S TO 1 S, 14 November 2026, still longer than the 600 ms restart. Both mutations
 * together, in one run after a green control, with the changed cases alone, in the w13n sandbox (the logs are named in
 * the report of the run that made it):
 *   - each restart's clock starts when the test makes it: cases 5 to 10 go red, because the restart has ended by the
 *     time the launcher asks;
 *   - the refusal after the wait keeps today's sentence alone: cases 12 and 14 go red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aRelayThatNamesTheOffice } from './a-relay-that-names-the-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { FAKE_DF, FAKE_FREE, FAKE_DU, FAKE_DEVCONTAINER, FAKE_DOCKER, startsOf, theFakeMachine, withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { askTheOfficeWhileItRestarts, readHostInstance, THE_FACTS_VARIABLE, theFactsAStartIsGiven } from '../tools/sandbox-common.mjs'
import { holdThePort } from '../tools/serve-dev.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const THE_STAND_IN = join(REPO, 'tools', 'serve-dev-stand-in.mjs')
const WORKSPACE = 'default'
const STARTER = 'restart-starter'
const NAME = 'restarts'
/** How long a restart lasts from the first request; the relay listens just after the direct retry case's 500 ms interval. */
const A_RESTART_MS = 600
/** How much later than its own start every launcher started through a restart asks anything, longer than a whole restart. */
const A_SLOW_START_MS = 1_000
/** The module that makes a launcher's start slow, preloaded before the launcher's own modules: it waits, using no processor. */
const A_SLOW_START = `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${String(A_SLOW_START_MS)})\n`
/** The workers the starter registered, one for each new case. */
const AGENT_WORKER = 'restart-exec-worker'
const STANDIN_WORKER = 'restart-standin-worker'
const WORKER_START = 'restart-worker'
const UNREACHED_WORKER = 'restart-unreached-worker'
const OUTLASTED_WORKER = 'restart-outlasted-worker'
/** The model this file's Casting row names, so a worker start takes its selection from the office. */
const MODEL = 'a-model-of-this-test'
/** How long the shortened wait of cases 11 and 12 asks again for, in milliseconds. */
const A_SHORTENED_WAIT_MS = 3_000
/** How long the stand-in of case 12 answers, longer than the shortened wait. */
const A_STAND_IN_PAST_THE_WAIT_MS = 30_000
/** A `claude` that runs no model: it reads its brief from its standard input and exits, so a worker start runs whole. */
const FAKE_CLAUDE = String.raw`#!/usr/bin/env node
require('fs').readFileSync(0, 'utf8')
`

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

let t: TestDb
let res: ResourcesLib
let app: FastifyInstance
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let slowStart = ''
let dir = ''
let starterKey = ''
let starterSession = ''
const groups = new Set<number>()
const closers: (() => void)[] = []

interface Ran {
  status: number
  out: string
  err: string
}

/** A port nothing listens on at this moment. */
async function aFreePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((ok) => probe.listen(0, '127.0.0.1', ok))
  const port = (probe.address() as AddressInfo).port
  await new Promise<void>((ok) => probe.close(() => ok()))
  return port
}

/**
 * A RESTART, TIMED FROM THE FIRST REQUEST. `heard` is given everything the caller has said so far, each time it says
 * more, and the restart's clock starts at the first line that says the office was out.
 */
interface ARestart {
  port: number
  heard: (said: string) => void
}

/** What a caller says when its first request was refused, and when the stand-in answered it. */
const THE_OFFICE_REFUSED = 'the office refused the connection'
const THE_STAND_IN_ANSWERED = 'the dev supervisor answered for the office that no server is running'

/**
 * AN OFFICE THAT RESTARTS: a port that refuses every connection until `ms` after the first request, then relays each
 * one to the test's office. A refused connection reaches no listener, so the first request is heard from the caller.
 */
async function aRelayThatStartsLate(ms: number): Promise<ARestart> {
  const port = await aFreePort()
  const target = (app.server.address() as AddressInfo).port
  const relay = aRelayThatNamesTheOffice(target)
  let listen: NodeJS.Timeout | undefined
  closers.push(() => {
    clearTimeout(listen)
    relay.close()
  })
  const heard = (said: string): void => {
    if (listen === undefined && said.includes(THE_OFFICE_REFUSED)) listen = setTimeout(() => relay.listen(port, '127.0.0.1'), ms)
  }
  return { port, heard }
}

/**
 * AN OFFICE THAT RESTARTS AS THE DEV SUPERVISOR RESTARTS IT: a socket held as tools/serve-dev.mjs holds one, the real
 * stand-in answering on it until `ms` after the first request, then a relay to the test's office listening on the same
 * socket once the stand-in has exited, as a new server does.
 */
async function aRestartWithTheStandIn(ms: number): Promise<ARestart> {
  const port = await aFreePort()
  const held = holdThePort(port)
  const target = (app.server.address() as AddressInfo).port
  // The handle is passed as serve-dev passes one; the types know only streams.
  const standIn = spawn(process.execPath, [THE_STAND_IN, `--supervisor-pid=${String(process.pid)}`, '--reason=A test restarts the office.'], {
    stdio: ['ignore', 'pipe', 'inherit', held as any],
  })
  const gone = new Promise<void>((ok) => standIn.once('exit', () => ok()))
  const relay = aRelayThatNamesTheOffice(target)
  let giveWay: NodeJS.Timeout | undefined
  const heard = (said: string): void => {
    if (giveWay !== undefined || !said.includes(THE_STAND_IN_ANSWERED)) return
    giveWay = setTimeout(() => {
      standIn.kill('SIGTERM')
      void gone.then(() => relay.listen(held))
    }, ms)
  }
  closers.push(() => {
    // A stand-in still answering when the tests are over is stopped, and the timer that would give way to a relay
    // is cleared with it, so a long stand-in never listens on a socket this file has closed.
    clearTimeout(giveWay)
    standIn.kill('SIGKILL')
    relay.close()
    held.close()
  })
  return { port, heard }
}

/**
 * Run tools/sandbox.mjs as its own process, as the starter, asking the office at `office`, with `more` in its env. A
 * launcher started through a restart starts late, and the restart hears what it says.
 */
function sandbox(args: string[], office: string, more: NodeJS.ProcessEnv = {}, restart?: ARestart): Promise<Ran> {
  const env: NodeJS.ProcessEnv = { ...withoutInheritedEffort(), PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`, FAKE_DOCKER_DIR: fakes, MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'), ...more }
  delete env['MOLE_OFFICE_AGENT']
  delete env['MOLE_OFFICE_SESSION']
  delete env['MOLE_AGENT_KEY']
  const cut = args.indexOf('--')
  const before = cut === -1 ? args : args.slice(0, cut)
  const after = cut === -1 ? [] : args.slice(cut)
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [...(restart === undefined ? [] : ['--import', slowStart]), TOOL, ...before, '--sandboxes', sandboxes, '--api', office, '--workspace', WORKSPACE, '--as', STARTER, '--session', starterSession, ...after],
      { env, detached: true },
    )
    if (child.pid !== undefined) groups.add(child.pid)
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => {
      err += c
      restart?.heard(err)
    })
    child.on('close', (code) => done({ status: code ?? 1, out, err }))
  })
}

async function ask(method: string, path: string, body?: unknown, actor: { type: string; id: string; key?: string } = { type: 'agent', id: STARTER }): Promise<{ status: number; body: any }> {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': actor.type,
      'x-mole-office-actor-id': actor.id,
      ...(actor.type === 'agent' && starterSession !== '' ? { 'x-mole-office-session': starterSession } : {}),
      ...(actor.key === undefined ? {} : { 'x-mole-office-key': actor.key }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

/** How many times one string appears in another. */
function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/** How many runs the office holds that serve one agent. */
function runsOf(handle: string): number {
  return (
    t.client.sqlite
      .prepare("SELECT count(*) AS n FROM records WHERE kind = 'session' AND json_extract(data, '$.servingAgent') = ?")
      .get(handle) as { n: number }
  ).n
}

const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-restarts-'))
  sandboxes = join(scratch, 'sandboxes')
  fakes = join(scratch, 'fakes')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  // A WORKER START RUNS A COMMAND: `claude` is this file's own stand-in, so the fixture can run one whole.
  writeFileSync(join(fakes, 'bin', 'claude'), FAKE_CLAUDE, { mode: 0o755 })
  const slowStartFile = join(scratch, 'a-slow-start.mjs')
  writeFileSync(slowStartFile, A_SLOW_START)
  slowStart = pathToFileURL(slowStartFile).href
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))

  // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/, so the clone inside runs the helper under
  // test, and the two folders the template covers.
  const main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  symlinkSync(join(REPO, 'src'), join(main, 'src'))
  writeFileSync(join(main, 'README.md'), 'a checkout for the restart test\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's files, with a secrets file of this test's own. It names the Claude Code login so a
  // worker start passes the login check; no model ever runs, because `claude` here is this file's stand-in.
  const template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8'))
  office.secrets.hostFile = join(scratch, 'sandbox-secrets.env')
  writeFileSync(join(office.secrets.hostFile), 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))

  // THE STARTER IS THE OFFICE'S SECRETARY, which starts sandboxes on the live office. The launcher here holds no key. On a
  // run's own facts an agent's name with no key counts for the secretary, and not for the agent that started or filed the
  // run (`mayEndARun` in src/server/lib/records.ts).
  const made = await ask('POST', '/api/agents/started', { handle: STARTER, name: STARTER, role: 'secretary' }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  starterKey = String(made.body?.whatToGiveIt?.key ?? '')
  expect(starterKey, 'the person\'s start of the starter answered no key').toMatch(/\S/)
  // FILED WITH THE STARTER'S OWN KEY, as its session hook files it. Every write below names this run with that key, and
  // a key holds only a run its agent filed for itself with a key (src/server/lib/the-run-a-key-holds.ts).
  const mine = await ask('POST', '/api/records', { kind: 'session', title: 'the starter run', data: { state: 'running' } }, { type: 'agent', id: STARTER, key: starterKey })
  expect(mine.status, JSON.stringify(mine.body)).toBe(201)
  starterSession = mine.body.record.id
  // THE WORKERS THE NEW HAND STARTS SERVE, registered by the starter proving itself with its own key, so each has a
  // key of its own and the hand-run check asks nothing of them but their being registered.
  for (const handle of [AGENT_WORKER, STANDIN_WORKER, WORKER_START, UNREACHED_WORKER, OUTLASTED_WORKER]) {
    const worker = await ask(
      'POST',
      '/api/agents/started',
      { handle, name: handle, role: 'worker', runtime: 'claude-code', workArea: ['src'] },
      { type: 'agent', id: STARTER, key: starterKey },
    )
    expect(worker.status, JSON.stringify(worker.body)).toBe(201)
  }

  // THE WORKER START'S CASTING ROW: this office attaches the launcher's native selection only from a
  // row whose program and model are the run's, so the model this file invented is now data on the row.
  const cast = await ask('POST', '/api/casting/worker', {
    program: { value: 'claude-code' },
    model: { value: MODEL },
    native: { model: MODEL, provider: null, variant: null },
  }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  expect(cast.status, JSON.stringify(cast.body)).toBe(201)

  const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--no-dsh', '--json'], api)
  expect(up.status, up.err).toBe(0)
  dir = JSON.parse(up.out.trim()).folder
}, 180_000)

afterAll(async () => {
  for (const close of closers) close()
  // ONLY THE GROUPS THIS FILE STARTED: each case adds the group it started or its start answered, and the helper's
  // start.json names the rest. No list of every process on this machine is read for more (the owner, 26 October 2026).
  if (dir !== '') for (const start of startsOf(dir)) groups.add(start.hostPgid)
  for (const group of groups) {
    // Only a group whose leader still works in this test's scratch; a number read earlier may belong to somebody
    // else's program by now, and that is never signalled.
    try {
      if (!readlinkSync(`/proc/${group}/cwd`).startsWith(scratch)) continue
      process.kill(-group, 'SIGKILL')
    } catch {
      // gone
    }
  }
  res?.useOsProbe(res.LINUX_PROBE)
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe('askTheOfficeWhileItRestarts', () => {
  it('1: asks again while the connection is refused, and answers what comes once the office listens', async () => {
    const relay = await aRelayThatStartsLate(A_RESTART_MS)
    const said: string[] = []
    const reply = await askTheOfficeWhileItRestarts(`http://127.0.0.1:${String(relay.port)}`, '/api/health', {}, {
      betweenMs: 500,
      saying: (line) => {
        said.push(line)
        relay.heard(said.join('\n'))
      },
    })
    expect(reply.status, JSON.stringify(reply)).toBe(200)
    expect(said.length, 'it never asked again').toBeGreaterThan(0)
    expect(said[0]).toContain('the office refused the connection')
  }, 30_000)

  it('2: answers an answer at once, a refusal included, after one request', async () => {
    let asked = 0
    const refusing: HttpServer = createHttpServer((_req, reply) => {
      asked += 1
      reply.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'no' }))
    })
    await new Promise<void>((ok) => refusing.listen(0, '127.0.0.1', ok))
    closers.push(() => refusing.close())
    const reply = await askTheOfficeWhileItRestarts(`http://127.0.0.1:${String((refusing.address() as AddressInfo).port)}`, '/anything', {}, { betweenMs: 200 })
    expect(reply.status).toBe(403)
    expect(asked).toBe(1)
  }, 30_000)

  it('3: stops asking once nothing waits for the answer', async () => {
    const port = await aFreePort()
    let wanted = true
    setTimeout(() => (wanted = false), 700)
    const started = Date.now()
    const reply = await askTheOfficeWhileItRestarts(`http://127.0.0.1:${String(port)}`, '/api/health', {}, { betweenMs: 200, stillWanted: () => wanted })
    expect(reply.status).toBeNull()
    expect(String(reply.why)).toContain('nothing waits for the answer any more')
    expect(Date.now() - started).toBeLessThan(10_000)
  }, 30_000)

  it('4: does not ask again when the connection broke after the request went out', async () => {
    let connections = 0
    const breaking: Server = createServer((socket) => {
      connections += 1
      socket.once('data', () => socket.destroy())
    })
    await new Promise<void>((ok) => breaking.listen(0, '127.0.0.1', ok))
    closers.push(() => breaking.close())
    const reply = await askTheOfficeWhileItRestarts(`http://127.0.0.1:${String((breaking.address() as AddressInfo).port)}`, '/api/resources', { method: 'POST', body: {} }, { betweenMs: 200, longestMs: 5_000 })
    expect(reply.status).toBeNull()
    expect(connections, 'a write that may have happened was sent again').toBe(1)
  }, 30_000)
})

describe('the process row, registered through a restart', () => {
  it("5: the launcher on the host registers a build's row once the office listens again, and the build runs", async () => {
    const relay = await aRelayThatStartsLate(A_RESTART_MS)
    const marker = join(dir, 'out', 'the-build-ran')
    const ran = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'sh', '-c', `touch ${marker}`], `http://127.0.0.1:${String(relay.port)}`, {}, relay)
    expect(ran.status, ran.err).toBe(0)
    expect(ran.err).toContain('the office refused the connection')
    expect(readdirSync(join(dir, 'out'))).toContain('the-build-ran')
  }, 90_000)

  it("6: the helper registers its command's row once the office listens again, and the command starts", async () => {
    const relay = await aRelayThatStartsLate(A_RESTART_MS)
    const helper = join(dir, 'repo', 'tools', 'sandbox-start.mjs')
    const marker = join(dir, 'out', 'the-command-ran')
    // THE SANDBOX'S FACTS, as a command in it holds them: the launcher gave its helper them from the host's copy.
    const env: NodeJS.ProcessEnv = {
      PATH: process.env['PATH'],
      HOME: process.env['HOME'],
      SANDBOX_DIR: dir,
      [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(readHostInstance(dir)),
      MOLE_OFFICE_API: `http://127.0.0.1:${String(relay.port)}`,
      MOLE_OFFICE_WORKSPACE: WORKSPACE,
      MOLE_OFFICE_AGENT: STARTER,
      MOLE_OFFICE_SESSION: starterSession,
    }
    // THE FAKE CONTAINER'S /tmp, as its docker exec gives a command (withAPrivateTmpToSweep): the helper's sweep stays in
    // this test's folder, so its background copy, in a group of its own that no start.json names, ends soon after the
    // command does instead of sweeping this machine's /tmp.
    const ran: Ran = await new Promise((done) => {
      const child = spawn(process.execPath, ['--import', slowStart, helper, '--', 'sh', '-c', `touch ${marker}`], { env: withAPrivateTmpToSweep(env, fakes), cwd: dir, detached: true })
      if (child.pid !== undefined) groups.add(child.pid)
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => {
        err += c
        relay.heard(err)
      })
      child.on('close', (code) => done({ status: code ?? 1, out, err }))
    })
    expect(ran.status, ran.err).toBe(0)
    expect(ran.err).toContain('the office refused the connection')
    const start = JSON.parse(ran.out.trim().split('\n').pop() ?? '{}')
    groups.add(start.hostPgid)
    expect(start.processRow, 'the helper printed no process row').toMatch(/\S/)
    const rows = (await ask('GET', '/api/resources')).body.resources as { id: string; startedByTheProduct: boolean | null }[]
    const row = rows.find((one) => one.id === start.processRow)
    expect(row, 'the helper\'s row is not in the ledger').toBeDefined()
    expect(row?.startedByTheProduct, 'the caller\'s own command was marked as the product\'s start').not.toBe(true)
  }, 90_000)

  it("7: a restart whose stand-in answers the registration first registers the build's row, exactly once", async () => {
    const rows = (): number =>
      (t.client.sqlite.prepare("SELECT count(*) AS n FROM session_resources WHERE type = 'process'").get() as { n: number }).n
    const before = rows()
    const restart = await aRestartWithTheStandIn(A_RESTART_MS)
    const marker = join(dir, 'out', 'the-build-ran-through-the-stand-in')
    const ran = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'sh', '-c', `touch ${marker}`], `http://127.0.0.1:${String(restart.port)}`, {}, restart)
    expect(ran.status, ran.err).toBe(0)
    expect(ran.err).toContain('the dev supervisor answered for the office that no server is running')
    expect(readdirSync(join(dir, 'out'))).toContain('the-build-ran-through-the-stand-in')
    expect(rows() - before, 'the build\'s process row was not written exactly once').toBe(1)
  }, 90_000)
})

describe('a hand start made while the office restarts', () => {
  it('8: an agent run waits at the hand-run ask and starts once the office listens', async () => {
    const relay = await aRelayThatStartsLate(A_RESTART_MS)
    const before = runsOf(AGENT_WORKER)
    const ran = await sandbox(
      ['exec', NAME, '--agent', AGENT_WORKER, '--runtime', 'claude-code', '--model', MODEL, '--worktree', join(dir, 'worktrees', AGENT_WORKER), '--cut-from', 'main', '--json', '--', 'true'],
      `http://127.0.0.1:${String(relay.port)}`,
      {},
      relay,
    )
    expect(ran.status, ran.err).toBe(0)
    expect(ran.err, 'the hand-run ask never said the office refused the connection').toContain('the office refused the connection')
    const start = JSON.parse(ran.out.trim()) as { run: string; hostPgid: number }
    groups.add(start.hostPgid)
    const run = await ask('GET', `/api/records/${String(start.run)}`)
    expect((run.body?.record ?? run.body).data.servingAgent, 'the office holds no run serving the worker').toBe(AGENT_WORKER)
    expect(runsOf(AGENT_WORKER) - before, 'the run was not filed exactly once').toBe(1)
  }, 90_000)

  it('9: the same run through the stand-in waits through its answers, and is filed exactly once', async () => {
    const restart = await aRestartWithTheStandIn(A_RESTART_MS)
    const before = runsOf(STANDIN_WORKER)
    const ran = await sandbox(
      ['exec', NAME, '--agent', STANDIN_WORKER, '--runtime', 'claude-code', '--model', MODEL, '--worktree', join(dir, 'worktrees', STANDIN_WORKER), '--cut-from', 'main', '--json', '--', 'true'],
      `http://127.0.0.1:${String(restart.port)}`,
      {},
      restart,
    )
    expect(ran.status, ran.err).toBe(0)
    expect(ran.err, 'the hand-run ask never said the stand-in was answering').toContain('the dev supervisor answered for the office that no server is running')
    const start = JSON.parse(ran.out.trim()) as { run: string; hostPgid: number }
    groups.add(start.hostPgid)
    const run = await ask('GET', `/api/records/${String(start.run)}`)
    expect((run.body?.record ?? run.body).data.servingAgent, 'the office holds no run serving the worker').toBe(STANDIN_WORKER)
    expect(runsOf(STANDIN_WORKER) - before, 'the run was not filed exactly once').toBe(1)
  }, 90_000)

  it('10: a worker start waits at the registered-agent ask as well, and goes on', async () => {
    const relay = await aRelayThatStartsLate(A_RESTART_MS)
    const brief = join(scratch, 'a-workers-brief.md')
    writeFileSync(brief, '# A worker that waits through a restart\n')
    const ran = await sandbox(
      ['worker', NAME, '--agent', WORKER_START, '--brief', brief, '--model', MODEL, '--json'],
      `http://127.0.0.1:${String(relay.port)}`,
      {},
      relay,
    )
    expect(ran.status, ran.err).toBe(0)
    expect(ran.err, 'the registered-agent ask never said the office refused the connection').toContain('the office refused the connection')
    expect(ran.err, 'the registered-agent ask refused').not.toContain('could not say whether')
    expect(ran.err, 'the hand-run ask refused').not.toContain('could not answer the hand-start check')
    const start = JSON.parse(ran.out.trim()) as { run: string; hostPgid: number }
    groups.add(start.hostPgid)
    const run = await ask('GET', `/api/records/${String(start.run)}`)
    expect((run.body?.record ?? run.body).data.servingAgent, 'the office holds no run serving the worker').toBe(WORKER_START)
  }, 120_000)

  it('11: a start that still cannot reach the office after the wait says so, and makes or files nothing', async () => {
    const port = await aFreePort()
    const before = runsOf(UNREACHED_WORKER)
    const worktree = join(dir, 'worktrees', UNREACHED_WORKER)
    const ran = await sandbox(
      ['exec', NAME, '--agent', UNREACHED_WORKER, '--runtime', 'claude-code', '--model', MODEL, '--worktree', worktree, '--cut-from', 'main', '--json', '--verbose', '--', 'true'],
      `http://127.0.0.1:${String(port)}`,
      { SANDBOX_HAND_START_WAIT_MS: String(A_SHORTENED_WAIT_MS) },
    )
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err, 'today\'s sentence is not there').toContain('Mole Office could not answer the hand-start check, so nothing was started.')
    expect(ran.err, 'the refusal does not say how long it asked again for').toContain(`after asking again for ${String(A_SHORTENED_WAIT_MS / 1000)} seconds`)
    expect(existsSync(worktree), 'a refused hand start left a worktree').toBe(false)
    expect(runsOf(UNREACHED_WORKER), 'a refused hand start filed a run').toBe(before)
  }, 60_000)

  it('12: a start through a stand-in that answers past the wait refuses and says how long it waited', async () => {
    const restart = await aRestartWithTheStandIn(A_STAND_IN_PAST_THE_WAIT_MS)
    const before = runsOf(OUTLASTED_WORKER)
    const worktree = join(dir, 'worktrees', OUTLASTED_WORKER)
    const ran = await sandbox(
      ['exec', NAME, '--agent', OUTLASTED_WORKER, '--runtime', 'claude-code', '--model', MODEL, '--worktree', worktree, '--cut-from', 'main', '--json', '--verbose', '--', 'true'],
      `http://127.0.0.1:${String(restart.port)}`,
      { SANDBOX_HAND_START_WAIT_MS: String(A_SHORTENED_WAIT_MS) },
      restart,
    )
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err, 'it never said the stand-in was answering').toContain('the dev supervisor answered for the office that no server is running')
    expect(ran.err, 'the refusal does not say how long it asked again for').toContain(`after asking again for ${String(A_SHORTENED_WAIT_MS / 1000)} seconds`)
    expect(existsSync(worktree), 'a refused hand start left a worktree').toBe(false)
    expect(runsOf(OUTLASTED_WORKER), 'a refused hand start filed a run').toBe(before)
  }, 60_000)

  it('13: a worker start that still cannot reach the office refuses, and the reason is said once', async () => {
    const port = await aFreePort()
    const before = runsOf(UNREACHED_WORKER)
    const worktree = join(dir, 'worktrees', UNREACHED_WORKER)
    const brief = join(scratch, 'a-workers-brief-for-the-unreached-office.md')
    writeFileSync(brief, '# A worker whose office cannot be reached\n')
    const ran = await sandbox(
      ['worker', NAME, '--agent', UNREACHED_WORKER, '--brief', brief, '--model', MODEL, '--json', '--verbose'],
      `http://127.0.0.1:${String(port)}`,
      { SANDBOX_HAND_START_WAIT_MS: String(A_SHORTENED_WAIT_MS) },
    )
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err, 'the registered-agent ask never said it could not say whether').toContain('could not say whether')
    expect(countOf(ran.err, 'could not say whether'), 'the reason is said more than once').toBe(1)
    expect(
      countOf(ran.err, `after asking again for ${String(A_SHORTENED_WAIT_MS / 1000)} seconds`),
      'how long it asked again for is said more than once',
    ).toBe(1)
    expect(existsSync(worktree), 'a refused hand start left a worktree').toBe(false)
    expect(runsOf(UNREACHED_WORKER), 'a refused hand start filed a run').toBe(before)
  }, 60_000)

  it('14: a worker start through a stand-in that answers past the wait refuses, and the reason is said once', async () => {
    const restart = await aRestartWithTheStandIn(A_STAND_IN_PAST_THE_WAIT_MS)
    const before = runsOf(OUTLASTED_WORKER)
    const worktree = join(dir, 'worktrees', OUTLASTED_WORKER)
    const brief = join(scratch, 'a-workers-brief-for-the-stand-in.md')
    writeFileSync(brief, '# A worker whose office answers through the stand-in past the wait\n')
    const ran = await sandbox(
      ['worker', NAME, '--agent', OUTLASTED_WORKER, '--brief', brief, '--model', MODEL, '--json', '--verbose'],
      `http://127.0.0.1:${String(restart.port)}`,
      { SANDBOX_HAND_START_WAIT_MS: String(A_SHORTENED_WAIT_MS) },
      restart,
    )
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err, 'the stand-in never said it was answering').toContain('the dev supervisor answered for the office that no server is running')
    expect(ran.err, 'the registered-agent ask never said it could not say whether').toContain('could not say whether')
    expect(countOf(ran.err, 'could not say whether'), 'the reason is said more than once').toBe(1)
    // A 503 carries the office's words in its body, and the wait's reason says them again: count the words themselves.
    expect(countOf(ran.err, '503: '), 'the office\'s own words are said more than once').toBe(1)
    expect(
      countOf(ran.err, `after asking again for ${String(A_SHORTENED_WAIT_MS / 1000)} seconds`),
      'how long it asked again for is said more than once',
    ).toBe(1)
    expect(existsSync(worktree), 'a refused hand start left a worktree').toBe(false)
    expect(runsOf(OUTLASTED_WORKER), 'a refused hand start filed a run').toBe(before)
  }, 60_000)
})
