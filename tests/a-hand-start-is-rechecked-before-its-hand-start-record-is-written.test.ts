// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HAND START RECHECKS ITS START VALUES BEFORE IT WRITES THE HAND-START RECORD. The infrastructure line's owner's
 * decision of 31 October 2026: the recheck comes first, so a refused recheck writes nothing.
 *
 * OLD: `exec --agent <worker> --asked-by <run>`, for a worker with no key of its own, asked the office's hand-run door
 * first. The door kept the hand-start record on the asking run (its `workerRuns` entry for the worker, state
 * "starting"), and only then did the launcher work out the run's model and start values, which recheck a --selection
 * against its Casting row. A recheck the office refused stopped the start, but the asking run kept a hand-start record
 * for a start that was never made.
 * NEW: the model and the start values are worked out before the hand-run ask, in the one function exec, worker and
 * round file through. A refused recheck stops the start in its own words, before the ask: nothing is filed, nothing is
 * written on the asking run, and nothing runs in the sandbox. A recheck that passes goes on to the ask, and the
 * hand-start record and the run are written as before.
 *
 * THE WAIT WHILE THE OFFICE RESTARTS IS KEPT. The hand-run ask waits while the office restarts, and it was an exec
 * --agent start's first ask. The model and start-value asks that now come first do not wait, so exec --agent first
 * makes one read that waits. A start with no --model, made while the office refuses connections, waits and then starts
 * as it did before. That case is green at the old code too, because there the hand-run ask came first and waited.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database. The launcher is the real
 * tools/sandbox.mjs, run as its own process, with the provider router off. Docker and the devcontainer CLI are the
 * stand-ins of tests/sandbox-stand-ins.ts, so nothing runs in a container, and opencode is a stand-in that does
 * nothing. The Casting row, its model and the brief are made up, and so is the key in the sandboxes' secrets file. An
 * office that restarts is a relay that starts listening late, as the launcher's restart test makes one
 * (tests/the-launcher-asks-again-while-the-office-restarts.test.ts): until it listens, a connection is refused.
 *
 * A WORKTREE THAT IS THERE IS FILED AT THE COMMIT IT STANDS AT. The hand-run door answers the launcher that commit, and
 * the launcher files the run at the cut it is answered, so a hand start into a worktree made beforehand is filed where
 * the worktree stands, and not at the commit the asking run stood at.
 *
 * MUTATIONS, each alone and put back:
 *   1. the recheck is worked out after the hand-run ask again: the refused case goes red on the hand-start record.
 *   2. the hand-run ask is sent without askedBy: the passing case goes red on the exit code, as the office refuses a
 *      hand start that names no asking run.
 *   3. exec --agent's first read, the one that waits, is taken out: the restart case goes red on the exit code, as the
 *      model ask is refused at once.
 *   4. the hand-run door answers the commit the ask chose again: the reused-worktree case goes red on the run's cutFrom.
 */
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { aRelayThatNamesTheOffice } from './a-relay-that-names-the-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { FAKE_DEVCONTAINER, FAKE_DF, FAKE_DOCKER, FAKE_DU, FAKE_FREE, startsOf, theFakeMachine } from './sandbox-stand-ins.ts'
import { linkSourceWithLocalRoundRules } from './round-chapters-fixture.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { aTestAddress } from './the-test-commit-address.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const STARTER = 'recheck-starter'
const WORKER = 'recheck-worker'
/** A worker with a key of its own, so it is started with no --asked-by and no --brief, whose read would wait first. */
const WAITING_WORKER = 'recheck-waiting-worker'
const NAME = 'rc'
const made = randomUUID().slice(0, 8)
/** The made-up native model of this test's own Casting row, and the office's name for it. */
const NATIVE = `made-up-model-${made}`
const MODEL = `made-up-provider-${made}/${NATIVE}`
/** A made-up key in the sandboxes' secrets file. It is no real key. */
const MADE_UP_SECRET = 'not-a-real-key-made-up-for-the-recheck-test'
const THE_SETTING = 'MOLE_OFFICE_PROVIDER_ROUTER'
/** What the launcher says when a request it asks again was refused, as a restarting office refuses it. */
const THE_OFFICE_REFUSED = 'the office refused the connection'
/** How long a restart lasts from the launcher's first refused request: shorter than the launcher's wait between asks. */
const A_RESTART_MS = 600

type Ran = { status: number; out: string; err: string }
type ARestart = { port: number; heard: (said: string) => void }
type Call = { tool: string; argv: string[] }
type Selection = { runtime: string; model: string; native: Record<string, string | null>; casting: { id: number; revision: string } }

let t: TestDb
let res: typeof import('../src/server/lib/resources.ts')
let app: FastifyInstance
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let folder = ''
let brief = ''
let starterKey = ''
let starterSession = ''
let asking = ''
let workerId = ''
let selection: Selection
const groups = new Set<number>()
const closers: (() => void)[] = []

const git =(at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()
const thePerson = { type: 'human', id: THE_PERSON }

/**
 * AN OFFICE THAT RESTARTS: a port that refuses every connection until A_RESTART_MS after the launcher first says the
 * office refused it, then relays each connection to the test's office. The restart is timed from that first line, so
 * it measures the launcher's asking again, not how long the launcher took to start.
 */
async function anOfficeThatRestarts(): Promise<ARestart> {
  const probe = createServer()
  await new Promise<void>((ok) => probe.listen(0, '127.0.0.1', ok))
  const port = (probe.address() as AddressInfo).port
  await new Promise<void>((ok) => probe.close(() => ok()))
  const target = (app.server.address() as AddressInfo).port
  const relay = aRelayThatNamesTheOffice(target)
  let listen: NodeJS.Timeout | undefined
  closers.push(() => {
    clearTimeout(listen)
    relay.close()
  })
  const heard = (said: string): void => {
    if (listen === undefined && said.includes(THE_OFFICE_REFUSED)) listen = setTimeout(() => relay.listen(port, '127.0.0.1'), A_RESTART_MS)
  }
  return { port, heard }
}

/** The tool as its own process, as the starter, with its key and the router off, asking the office through `restart` if given. */
async function sandbox(args: string[], restart?: ARestart): Promise<Ran> {
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
    FAKE_DOCKER_DIR: fakes,
    MOLE_OFFICE_AGENT: STARTER,
    MOLE_OFFICE_SESSION: starterSession,
    MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
    MOLE_AGENT_KEY: starterKey,
    [THE_SETTING]: 'off',
  }
  const end = args.includes('--') ? args.indexOf('--') : args.length
  const office = restart === undefined ? api : `http://127.0.0.1:${String(restart.port)}`
  const argv = [TOOL, ...args.slice(0, end), '--sandboxes', sandboxes, '--api', office, '--workspace', WORKSPACE, ...args.slice(end)]
  return new Promise((done) => {
    const child = spawn(process.execPath, argv, { env, detached: true })
    if (child.pid !== undefined) groups.add(child.pid)
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (c: Buffer) => out.push(c))
    child.stderr.on('data', (c: Buffer) => {
      err.push(c)
      restart?.heard(Buffer.concat(err).toString('utf8'))
    })
    child.on('close', (code) => done({ status: code ?? 1, out: Buffer.concat(out).toString('utf8'), err: Buffer.concat(err).toString('utf8') }))
  })
}

async function ask(method: string, path: string, body?: unknown, actor: { type: string; id: string } = { type: 'agent', id: STARTER }): Promise<{ status: number | null; body: any }> {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': actor.type,
      'x-mole-office-actor-id': actor.id,
      ...(actor.type === 'human' ? thePersonsKeyHeader() : { 'x-mole-office-key': starterKey }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

function calls(): Call[] {
  return (JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8')) as { calls: Call[] }).calls
}

/** A record's data, read straight from the test database. */
const dataOf = (run: string): Record<string, any> => JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data)
/** How many rows each table of the test database holds: a start that writes nothing leaves them as they are. */
const written = (): number[] => ['records', 'revisions', 'held_keys', 'session_resources'].map((table) => (t.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n)
/** How many runs the test database holds that serve one agent. */
const runsOf = (handle: string): number => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session' AND json_extract(data, '$.servingAgent') = ?").get(handle) as { n: number }).n

/** The hand start of the worker, asked by the asking run, on the given selection. */
const theHandStart = (given: Selection): string[] => [
  'exec', NAME, '--agent', WORKER, '--asked-by', asking, '--brief', brief, '--runtime', 'opencode', '--selection', JSON.stringify(given), '--json',
  '--', 'opencode', 'run', '--format', 'json', 'A made-up brief.',
]

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = mkdtempSync(join(tmpdir(), 'mo-rc-'))
  sandboxes = join(scratch, 's')
  fakes = join(scratch, 'fakes')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))
  // A STAND-IN opencode: it does nothing, so the start that goes on needs no real provider or key.
  writeFileSync(join(fakes, 'bin', 'opencode'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })

  // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/, as the launcher tests make it.
  const main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  linkSourceWithLocalRoundRules(REPO, main)
  writeFileSync(join(main, 'README.md'), 'a checkout for the hand-start recheck test\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's files, with a secrets file in this test's scratch that holds a made-up key.
  const template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8')) as { secrets: { hostFile: string } }
  office.secrets.hostFile = join(scratch, 'sandbox-secrets.env')
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))
  writeFileSync(office.secrets.hostFile, `OPENCODE_API_KEY=${MADE_UP_SECRET}\n`, { mode: 0o600 })

  // THE STARTER, ITS OWN RUN, AND ITS WORKER WITH NO KEY OF ITS OWN. A worker with no key is started by hand only with
  // --asked-by naming a live run of the starter that registered it. The starter is the secretary, as the one agent that
  // files a run in a sandbox from the host with its own key.
  const madeStarter = await ask('POST', '/api/agents/started', { handle: STARTER, name: STARTER, role: 'secretary' }, thePerson)
  expect(madeStarter.status, JSON.stringify(madeStarter.body)).toBe(201)
  starterKey = String(madeStarter.body.whatToGiveIt?.key ?? '')
  expect(starterKey).not.toBe('')
  const mine = await ask('POST', '/api/records', { kind: 'session', title: 'the starter run', data: { state: 'running', servingAgent: STARTER } })
  expect(mine.status, JSON.stringify(mine.body)).toBe(201)
  starterSession = mine.body.record.id as string
  const worker = await ask('POST', '/api/agents/started', { handle: WORKER, name: WORKER, role: 'worker', workArea: ['src'], noKey: true })
  expect(worker.status, JSON.stringify(worker.body)).toBe(201)
  workerId = String(worker.body.agent.id)
  const waiting = await ask('POST', '/api/agents/started', { handle: WAITING_WORKER, name: WAITING_WORKER, role: 'worker', workArea: ['src'] })
  expect(waiting.status, JSON.stringify(waiting.body)).toBe(201)

  // THE WORKER'S CASTING ROW, this test's own, and the selection a supervisor would be given for it.
  const row = await ask('POST', `/api/casting/${THE_WORKER}`, { program: { value: 'opencode' }, model: { value: MODEL }, effort: { value: 'high' }, native: { model: NATIVE, provider: null, variant: null } }, thePerson)
  expect(row.status, JSON.stringify(row.body)).toBe(201)
  const read = await ask('GET', `/api/casting/rows/${String(row.body.casting.id)}/selection`, undefined, thePerson)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  selection = read.body.selection as Selection

  // THE SANDBOX, and THE ASKING RUN in it: a running run of the starter whose sandbox field names the container row the
  // launcher registered, so the office vouches for the sandbox, and whose worktree is the sandbox's own repository.
  const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--no-dsh', '--json'])
  expect(up.status, up.err).toBe(0)
  folder = realpathSync((JSON.parse(up.out.trim()) as { folder: string }).folder)
  const instance = JSON.parse(readFileSync(join(folder, 'instance.json'), 'utf8')) as { containerRow: string; template: string }
  const run = await ask('POST', '/api/records', { kind: 'session', title: 'The asking run', data: {
    state: 'running', servingAgent: STARTER, runtime: 'claude-code', workingDirectory: join(folder, 'repo'),
    sandbox: { folder, container: instance.containerRow, template: instance.template },
  } }, thePerson)
  expect(run.status, JSON.stringify(run.body)).toBe(201)
  asking = run.body.record.id as string
  brief = join(folder, 'the-brief.md')
  writeFileSync(brief, '# A made-up brief\nRead the files.\n')
}, 240_000)

afterAll(async () => {
  for (const close of closers) close()
  for (const one of (sandboxes !== '' && existsSync(sandboxes) ? readdirSync(sandboxes) : [])) {
    for (const start of startsOf(join(sandboxes, one))) groups.add(start.hostPgid)
  }
  for (const group of groups) {
    if (group <= 1 || group === process.pid) continue
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

describe('a hand start of a worker with no key of its own', () => {
  // MUTATION 1: the recheck is worked out after the hand-run ask again.
  it('whose recheck the office refuses, is refused in words that say why, and writes no hand-start record and no run', async () => {
    const stale = { ...selection, casting: { ...selection.casting, revision: `another-${randomUUID()}` } }
    const from = { written: written(), calls: calls().length, starts: startsOf(folder).length }
    const ran = await sandbox(theHandStart(stale))
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain('The selected Casting row could not be rechecked (')
    expect(ran.err).toContain('changed after it was selected')
    expect(dataOf(asking).workerRuns?.[workerId], 'the asking run holds a hand-start record for a refused start').toBeUndefined()
    expect(written(), 'a refused start wrote to the office').toEqual(from.written)
    expect(calls().slice(from.calls).filter((one) => one.tool === 'docker' && one.argv[0] === 'exec'), 'a refused start ran in the sandbox').toEqual([])
    expect(startsOf(folder).length).toBe(from.starts)
    expect(existsSync(join(folder, 'worktrees', WORKER)), 'a worktree was made for the refused start').toBe(false)
    expect(ran.out.trim()).toBe('')
  }, 240_000)

  // MUTATION 2: the hand-run ask is sent without askedBy.
  it('whose recheck passes, writes the hand-start record on the asking run and files the run, as before', async () => {
    const ran = await sandbox(theHandStart(selection))
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim().split('\n').pop()!) as { run: string; hostPgid: number }
    groups.add(start.hostPgid)
    expect(dataOf(asking).workerRuns?.[workerId]).toMatchObject({ byHand: true, askedBy: { session: asking } })
    const filed = dataOf(start.run)
    expect(filed['servingAgent']).toBe(WORKER)
    expect(filed['runtime']).toBe('opencode')
    expect(filed['model']).toBe(MODEL)
  }, 240_000)

  // MUTATION 4: the hand-run door answers the commit the ask chose again.
  it('whose worktree is there already, files the run at the commit the worktree stands at', async () => {
    const handle = 'recheck-reused-worker'
    const registered = await ask('POST', '/api/agents/started', { handle, name: handle, role: 'worker', workArea: ['src'], noKey: true })
    expect(registered.status, JSON.stringify(registered.body)).toBe(201)
    const repo = join(folder, 'repo')
    const asked = git(repo, 'rev-parse', 'HEAD')
    const stands = git(repo, '-c', 'user.name=A test', '-c', 'user.email=a-test@example.invalid', 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'A made-up commit the worker’s worktree stands at')
    git(repo, 'worktree', 'add', '-q', '-b', handle, join(folder, 'worktrees', handle), stands)
    const ran = await sandbox(['exec', NAME, '--agent', handle, '--asked-by', asking, '--brief', brief, '--runtime', 'opencode', '--selection', JSON.stringify(selection), '--json',
      '--', 'opencode', 'run', '--format', 'json', 'A made-up brief.'])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim().split('\n').pop()!) as { run: string; hostPgid: number }
    groups.add(start.hostPgid)
    expect(dataOf(start.run)['cutFrom']).toBe(stands)
    const entry = dataOf(asking).workerRuns?.[String(registered.body.agent.id)]
    expect(entry).toMatchObject({ byHand: true, cut: { commit: asked, named: null } })
    const { theRunIsFiledWhereTheWorktreeStands } = await import('../src/server/lib/worker-runs.ts')
    expect(String(entry.starting.cutSays)).toContain(theRunIsFiledWhereTheWorktreeStands(stands))
  }, 240_000)
})

describe('an exec --agent start made while the office restarts', () => {
  // MUTATION 3: exec --agent's first read, the one that waits, is taken out.
  it('with no --model, waits until the office answers, then is filed with the model the office gives and starts', async () => {
    const restart = await anOfficeThatRestarts()
    const before = runsOf(WAITING_WORKER)
    const ran = await sandbox(['exec', NAME, '--agent', WAITING_WORKER, '--runtime', 'opencode', '--json', '--', 'opencode', 'run', '--format', 'json', 'A made-up brief.'], restart)
    expect(ran.status, ran.err).toBe(0)
    expect(ran.err, 'the launcher never said the office refused the connection').toContain(THE_OFFICE_REFUSED)
    const start = JSON.parse(ran.out.trim().split('\n').pop()!) as { run: string; hostPgid: number }
    groups.add(start.hostPgid)
    const filed = dataOf(start.run)
    expect(filed['servingAgent']).toBe(WAITING_WORKER)
    expect(filed['runtime']).toBe('opencode')
    expect(filed['model'], 'the run does not carry the model the office gives').toBe(MODEL)
    expect(runsOf(WAITING_WORKER) - before, 'the run was not filed exactly once').toBe(1)
  }, 240_000)
})
