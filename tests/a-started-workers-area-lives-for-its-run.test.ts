// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STARTED WORKER'S WORK AREA LIVES FOR ITS RUN. A brief may declare the area its run works in, as `workArea` in
 * `<brief>.round.json`. The area is set when the start is asked or made, for that run, and the run's seal empties it
 * again, unless somebody changed the area since.
 *
 * WHERE IT IS SET.
 *   - Run by hand, the launcher (tools/sandbox.mjs worker) reads the declaration before anything is filed. A value that
 *     is not a work area stops the start. Once the run is filed, it asks the work-area door in the starter's name, with
 *     `forRun` naming the filed run, before the helper starts it.
 *   - At the two doors where a start is asked (worker-run and next-round), the door sets the declared area with the ask,
 *     in the asker's name. The door reads the declaration only from inside the sandbox folder, as it reads the brief.
 *   - Run by Mole Office, the launcher only compares the agent's area with the declaration, and stops on a difference.
 * WHERE IT IS EMPTIED. The seal of the run it was set for empties it, written by Mole Office's own row with how
 * `the-seal`. A start asked at a door that fails empties it with how `a-failed-start`. An area changed since is kept.
 * A RUN SEALED WITH ITS AREA keeps being checked by the area its seal stored, though the agent's own is now empty.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, with made-up keys. The launcher
 * is the real tools/sandbox.mjs, run as its own process. Docker and the devcontainer CLI are the stand-ins of
 * tests/sandbox-stand-ins.ts, and claude is a stand-in that reads its input and ends. The door cases use a made-up
 * sandbox folder (tests/a-made-up-sandbox-repo.ts) and its container row, and file every run the launcher would file
 * by hand. Each sealed run works in a tiny repository of its own. Every agent, brief, model and run is made up.
 *
 * MUTATIONS, each alone, after a control run, and put back:
 *   M1 the launcher does not ask the work-area door: the hand start's case goes red on the area.
 *   M2 the check of a declared area takes a `..` part: the bad-value case goes red on a run filed.
 *   M3 the seal does not empty the area: the hand-set seal case goes red on the area.
 *   M4 the seal empties the area without reading the last change: the changed-since case goes red on the area.
 *   M5 the door takes a run of another agent for `forRun`: the forRun case goes red on the status.
 *   And: the doors set no area (the two door cases); a failed start empties nothing (the failed-start case); the office's
 *   launcher does not compare (its case); the inspector reads the agent's own area (the inspector case); the doors set
 *   an area with no declaration (the no-declaration case); the door reads a declaration outside the sandbox folder (the
 *   link case).
 */
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { roundDeclaration } from '../src/shared/round-chapters/delivery.ts'
import { aMadeUpSandboxRepo } from './a-made-up-sandbox-repo.ts'
import { apiApp, freshDb, theOfficesOwnId, type TestDb, governsTheWholeProject } from './helpers.ts'
import { linkSourceWithLocalRoundRules, writeRoundStartRules } from './round-chapters-fixture.ts'
import { FAKE_DEVCONTAINER, FAKE_DF, FAKE_DOCKER, FAKE_DU, FAKE_FREE, startsOf, theFakeMachine } from './sandbox-stand-ins.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { THE_TEST_OFFICES_OWNER } from './the-test-offices-owner.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const NAME = 'wa'
const OFFICE_KEY = randomBytes(32).toString('hex')
const PERSON_KEY = randomBytes(32).toString('hex')
const UNSEEN = randomUUID().slice(0, 8)
/** The made-up model of this test's Casting row, and of every run it files for a door. */
const MODEL = `made-up-model-${UNSEEN}`
/** The person, as a write made in this process is attributed to them. */
const OWNER = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' } as const

type Ran = { status: number; out: string; err: string }
type Call = { tool: string; argv: string[] }
type Heard = { method: string; url: string; actor: string; calls: number }
type Caller = { agent: string; key: string; session: string }

let t: TestDb
let res: typeof import('../src/server/lib/resources.ts')
let app: FastifyInstance
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let workerModeBefore: string | undefined
const groups = new Set<number>()
/** Every request the office was sent over its port, in order: the launcher's. The test's own go through inject. */
const heard: Heard[] = []

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': PERSON_KEY }
const asAgent = (handle: string, key: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': key,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const AS_THE_WORKER = (session?: string): Record<string, string> => asAgent(THE_MESSAGE_WORKER_ID, OFFICE_KEY, session)

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const { 'content-type': _type, ...withoutAType } = headers
  const r = await app.inject({ method, url, headers: payload === undefined ? withoutAType : headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

const agents = new Map<string, { id: string; key: string; record: string }>()
/** Register an agent through the starter door, and keep its id, its key and its record. */
async function started(handle: string, by: Record<string, string>, more: Record<string, unknown> = {}): Promise<void> {
  const r = await call('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...more })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  agents.set(handle, { id: String(r.body['agent'].id), key: String(r.body['whatToGiveIt']?.key ?? ''), record: String(r.body['record']) })
}
const idOf = (handle: string): string => agents.get(handle)!.id
const asOne = (handle: string, session?: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key, session)

const dataOf = (id: string): Record<string, any> => JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, any>
/** The agent's work area and the mark of its last change, as its record keeps them. */
function theAreaOf(handle: string): { area: unknown; mark: Record<string, any> | undefined } {
  const data = dataOf(agents.get(handle)!.record)
  return { area: data['workArea'], mark: data['extra']?.workAreaChange }
}
/** How many rows the records and revisions hold: a write that writes nothing leaves them as they are. */
const written = (): number[] => ['records', 'revisions'].map((table) => (t.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n)
const sessions = (): number => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n

const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8', env: { ...process.env, HOME: at } }).trim()

/** A tiny repository a run works in and is sealed at: `main` with one commit, and a `worker` branch with work in src/. */
function aRepositoryToSeal(name: string): string {
  const root = join(scratch, 'sealed', name)
  mkdirSync(join(root, 'src'), { recursive: true })
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'config', 'user.email', 'a-test@example.invalid')
  git(root, 'config', 'user.name', 'A test')
  git(root, 'config', 'commit.gpgsign', 'false')
  writeFileSync(join(root, 'src', 'a.txt'), 'before\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'A made-up baseline')
  git(root, 'switch', '-q', '-c', 'worker')
  writeFileSync(join(root, 'src', 'a.txt'), 'after\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'A made-up piece of work')
  return root
}

/** The person seals the run at its repository's tip. The seal's id. */
function seal(run: string): string {
  t.api.patchRecord(run, { dataPatch: { state: 'finished', tip: git(dataOf(run)['workingDirectory'], 'rev-parse', 'HEAD') } }, OWNER)
  const id = dataOf(run)['sealedTip']
  expect(typeof id, `run ${run} was not sealed`).toBe('string')
  return String(id)
}

/** The area was emptied by Mole Office's own row at the seal of `run`. */
function emptiedAtTheSeal(handle: string, run: string, before: string[]): void {
  const { area, mark } = theAreaOf(handle)
  expect(area, `the seal of ${run} left ${handle}'s area`).toEqual([])
  expect(mark).toMatchObject({ how: 'the-seal', by: { type: 'agent', id: theOfficesOwnId(t) }, before, after: [], run })
  expect(typeof mark?.['at']).toBe('string')
  expect(typeof mark?.['because']).toBe('string')
}

// ============================================================================ the launcher

let folder = ''
let starter: Caller = { agent: 'wa-starter', key: '', session: '' }

function calls(): Call[] {
  return (JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8')) as { calls: Call[] }).calls
}
const execs = (): number => calls().filter((one) => one.tool === 'docker' && one.argv[0] === 'exec').length

/** The launcher as its own process, as `as`, with its key, and with the folders in `before` ahead of the stand-ins. */
function sandbox(args: string[], as: Caller = starter, before: string[] = []): Promise<Ran> {
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    PATH: [...before, join(fakes, 'bin'), process.env['PATH'] ?? ''].join(':'),
    FAKE_DOCKER_DIR: fakes,
    MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
    MOLE_SANDBOX_MEMORY_TEST_ROOT: join(fakes, 'memory-files'),
    MOLE_AGENT_KEY: as.key,
    MOLE_OFFICE_API: api,
  }
  delete env['MOLE_OFFICE_AGENT']
  delete env['MOLE_OFFICE_SESSION']
  const argv = [TOOL, ...args, '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE, '--as', as.agent, '--session', as.session]
  return new Promise((done) => {
    const child = spawn(process.execPath, argv, { env, detached: true })
    if (child.pid !== undefined) groups.add(child.pid)
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (c: Buffer) => out.push(c))
    child.stderr.on('data', (c: Buffer) => err.push(c))
    child.on('close', (code) => done({ status: code ?? 1, out: Buffer.concat(out).toString('utf8'), err: Buffer.concat(err).toString('utf8') }))
  })
}

async function until(what: string, check: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (check()) return
    await new Promise((go) => setTimeout(go, 50))
  }
  throw new Error(`waited ${String(ms)} ms for ${what}`)
}

/** Where the code reads a brief's declaration: worked out by the code while the brief has none yet, and kept. */
const declarationsAt = new Map<string, string>()
function theDeclarationFileOf(brief: string): string {
  if (!declarationsAt.has(brief)) declarationsAt.set(brief, roundDeclaration(brief).file)
  return declarationsAt.get(brief)!
}

/** A brief in the scratch folder, and beside it the declaration, when one is given. */
function aBrief(name: string, declaration?: unknown): string {
  const brief = join(scratch, 'briefs', `${name}.md`)
  mkdirSync(dirname(brief), { recursive: true })
  writeFileSync(brief, `# A made-up brief, ${name}\nRead the files.\n`)
  const at = theDeclarationFileOf(brief)
  if (declaration !== undefined) writeFileSync(at, JSON.stringify(declaration))
  return brief
}

/** The worker start, by hand, with the model named. */
const aWorkerStart = (handle: string, brief: string): string[] => ['worker', NAME, '--agent', handle, '--model', 'claude-opus-5-5', '--brief', brief, '--json']

/** The started run, its process group kept to be stopped, once its helper has ended. */
async function itEnds(ran: Ran): Promise<{ run: string }> {
  const start = JSON.parse(ran.out.trim()) as { run: string; hostPgid: number }
  groups.add(start.hostPgid)
  await until(`run ${start.run} to end`, () => existsSync(join(folder, 'logs', start.run, 'finish.log')))
  return start
}

beforeAll(async () => {
  // THE DOORS ASK WHETHER THE OFFICE'S WORKER IS ON. Set here, so the answer does not depend on a .env.
  workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: PERSON_KEY, office: OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  app.server.on('request', (req) => {
    heard.push({ method: String(req.method), url: String(req.url), actor: String(req.headers['x-mole-office-actor-id'] ?? ''), calls: fakes === '' ? 0 : calls().length })
  })
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'mo-wa-')))
  sandboxes = join(scratch, 's')
  fakes = join(scratch, 'fakes')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  // A STAND-IN claude: it reads the brief it is given and ends.
  writeFileSync(join(fakes, 'bin', 'claude'), `#!${process.execPath}\nrequire('fs').readFileSync(0)\n`, { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))

  // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/, as the launcher tests make it.
  const main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  linkSourceWithLocalRoundRules(REPO, main)
  writeFileSync(join(main, 'README.md'), 'a checkout for the work-area test\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's files, with a secrets file in this test's scratch that holds a made-up login.
  const template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8')) as { secrets: { hostFile: string } }
  office.secrets.hostFile = join(scratch, 'sandbox-secrets.env')
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))
  writeFileSync(office.secrets.hostFile, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })

  // THE STARTER, A SECRETARY THE PERSON REGISTERED, AND ITS OWN RUN. It files a run in a sandbox from the host with its key.
  await started(starter.agent, AS_THE_PERSON, { role: 'secretary' })
  const mine = await call('POST', '/api/records', asOne(starter.agent), { kind: 'session', title: 'the starter run', data: { state: 'running', servingAgent: starter.agent } })
  expect(mine.status, JSON.stringify(mine.body)).toBe(201)
  starter = { ...starter, key: agents.get(starter.agent)!.key, session: String(mine.body['record'].id) }
  for (const handle of ['wa-l1', 'wa-l2', 'wa-l3', 'wa-l4', 'wa-l5']) await started(handle, asOne(starter.agent), { role: 'worker', workArea: ['src'] })

  const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--no-dsh', '--json'])
  expect(up.status, up.err).toBe(0)
  folder = realpathSync((JSON.parse(up.out.trim()) as { folder: string }).folder)
  writeRoundStartRules(folder, join(folder, 'repo'))
}, 240_000)

afterAll(async () => {
  for (const one of (sandboxes !== '' && existsSync(sandboxes) ? readdirSync(sandboxes) : [])) {
    for (const start of startsOf(join(sandboxes, one))) groups.add(start.hostPgid)
  }
  for (const group of groups) {
    if (group <= 1 || group === process.pid) continue
    try {
      if (!readlinkSync(`/proc/${String(group)}/cwd`).startsWith(scratch)) continue
      process.kill(-group, 'SIGKILL')
    } catch {
      // gone
    }
  }
  res?.useOsProbe(res.LINUX_PROBE)
  await app?.close()
  t?.close()
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe('the launcher, run by hand', () => {
  // M1: the launcher does not ask the work-area door.
  it('a worker start with a declared area sends the work-area door in the starter\'s name, for the filed run, before the helper starts it', async () => {
    const declared = ['src', 'docs']
    const brief = aBrief('l1', { workArea: declared })
    const from = { heard: heard.length, calls: calls().length }
    const ran = await sandbox(aWorkerStart('wa-l1', brief))
    expect(ran.status, ran.err).toBe(0)
    const start = await itEnds(ran)
    const { area, mark } = theAreaOf('wa-l1')
    expect(area, 'the declared area was not set').toEqual(declared)
    expect(mark).toMatchObject({ how: 'a-starter', by: { type: 'agent', id: idOf(starter.agent) }, before: ['src'], after: declared, forRun: start.run })
    const asked = heard.slice(from.heard).filter((one) => one.method === 'POST' && one.url.split('?')[0] === '/api/participants/agent/wa-l1/work-area')
    expect(asked.map((one) => one.actor)).toEqual([starter.agent])
    const helper = calls().findIndex((one, at) => at >= from.calls && one.tool === 'docker' && one.argv[0] === 'exec' && one.argv.some((word) => word.endsWith('/sandbox-start.mjs')))
    expect(helper, 'the helper was never started').toBeGreaterThanOrEqual(0)
    expect(asked[0]!.calls, 'the area was asked for after the helper started the run').toBeLessThanOrEqual(helper)
  }, 240_000)

  // M2: the check of a declared area takes a `..` part.
  it('a declared area that is not one stops the start before anything is filed or sent', async () => {
    for (const [name, workArea] of [['abs', ['/src']], ['up', ['..']], ['up-inside', ['src/..']], ['none', []]] as const) {
      const brief = aBrief(`l2-${name}`, { workArea })
      const from = { heard: heard.length, sessions: sessions(), execs: execs(), area: theAreaOf('wa-l2') }
      const ran = await sandbox(aWorkerStart('wa-l2', brief))
      expect(ran.status, `${JSON.stringify(workArea)}: ${ran.err}`).toBe(2)
      expect(ran.err).toContain(theDeclarationFileOf(brief))
      expect(sessions(), `${JSON.stringify(workArea)} filed a run`).toBe(from.sessions)
      expect(heard.slice(from.heard).filter((one) => one.url.includes('/work-area')), `${JSON.stringify(workArea)} asked for an area`).toEqual([])
      expect(execs(), `${JSON.stringify(workArea)} ran in the sandbox`).toBe(from.execs)
      expect(theAreaOf('wa-l2')).toEqual(from.area)
    }
  }, 240_000)

  it('a worker start with no declared area sends no work-area request', async () => {
    const brief = aBrief('l3')
    const from = { heard: heard.length, area: theAreaOf('wa-l3') }
    const ran = await sandbox(aWorkerStart('wa-l3', brief))
    expect(ran.status, ran.err).toBe(0)
    await itEnds(ran)
    expect(heard.slice(from.heard).filter((one) => one.url.includes('/work-area'))).toEqual([])
    expect(theAreaOf('wa-l3')).toEqual(from.area)
  }, 240_000)

  // AND: a crashed run empties nothing.
  it('a start by hand whose area was set and which then failed reads the area empty', async () => {
    // A DOCKER THAT FAILS THE HELPER'S START ONLY, ahead of the stand-in, which it hands every other command to. The
    // helper's start comes after the area is set, and the launcher marks a run whose start failed as crashed.
    const failing = join(fakes, 'a-failing-start')
    mkdirSync(failing, { recursive: true })
    writeFileSync(join(failing, 'docker'), [
      `#!${process.execPath}`,
      'const argv = process.argv.slice(2)',
      "if (argv[0] === 'exec' && argv.some((word) => word.endsWith('/sandbox-start.mjs'))) {",
      "  process.stderr.write('Error: a made-up failure of the helper start\\n')",
      '  process.exit(1)',
      '}',
      `const ran = require('node:child_process').spawnSync(${JSON.stringify(join(fakes, 'bin', 'docker'))}, argv, { stdio: 'inherit' })`,
      'process.exit(ran.status ?? 1)',
      '',
    ].join('\n'), { mode: 0o755 })
    const declared = ['src', 'docs']
    const brief = aBrief('l5', { workArea: declared })
    const from = sessions()
    const ran = await sandbox(aWorkerStart('wa-l5', brief), starter, [failing])
    expect(ran.status, ran.err).not.toBe(0)
    expect(sessions(), 'the start filed no run').toBe(from + 1)
    const run = (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'session' AND json_extract(data, '$.servingAgent') = ?").get('wa-l5') as { id: string }).id
    expect(dataOf(run)['state']).toBe('crashed')
    const { area, mark } = theAreaOf('wa-l5')
    expect(area, 'the failed start left the area set for its run').toEqual([])
    expect(mark).toMatchObject({ how: 'a-crashed-run', by: { type: 'agent', id: theOfficesOwnId(t) }, before: declared, after: [], run })
  }, 240_000)
})

describe('the launcher, run by Mole Office', () => {
  // AND: the office's launcher does not compare.
  it('compares the agent\'s area with the declaration, and stops on a difference before anything is filed', async () => {
    const wrapper = await call('POST', '/api/records', AS_THE_WORKER(), {
      kind: 'session', title: 'A made-up launcher run of the office',
      data: { state: 'running', runtime: 'round-launcher', doing: 'starting a made-up worker run; this run runs no model', workingDirectory: scratch, startedByMoleOffice: true },
    })
    expect(wrapper.status, JSON.stringify(wrapper.body)).toBe(201)
    const office: Caller = { agent: THE_MESSAGE_WORKER_ID, key: OFFICE_KEY, session: String(wrapper.body['record'].id) }
    const brief = aBrief('l4', { workArea: ['docs'] })
    // THE LEDGER IS READ ONCE THE AREA IS FOUND THE SAME, and after the agent is read: a start that stops between the two
    // has stopped on the area. With no --model and no Casting row, the start that goes on stops at the model, unfiled.
    const theLedgerReadAfterTheAgent = (from: number): boolean => {
      const since = heard.slice(from)
      const agent = since.findIndex((one) => one.method === 'GET' && one.url.split('?')[0] === '/api/participants/agent/wa-l4')
      expect(agent, 'the launcher never read the agent').toBeGreaterThanOrEqual(0)
      return since.slice(agent).some((one) => one.method === 'GET' && one.url.split('?')[0] === '/api/resources')
    }
    for (const [declared, goesOn] of [[['docs'], false], [['src'], true]] as const) {
      writeFileSync(theDeclarationFileOf(brief), JSON.stringify({ workArea: declared }))
      const from = { heard: heard.length, sessions: sessions(), area: theAreaOf('wa-l4') }
      const ran = await sandbox(['worker', NAME, '--agent', 'wa-l4', '--brief', brief, '--json'], office)
      expect(ran.status, ran.err).toBe(2)
      expect(theLedgerReadAfterTheAgent(from.heard), `${JSON.stringify(declared)}: ${ran.err}`).toBe(goesOn)
      expect(sessions()).toBe(from.sessions)
      expect(heard.slice(from.heard).filter((one) => one.url.includes('/work-area'))).toEqual([])
      expect(theAreaOf('wa-l4')).toEqual(from.area)
    }
  }, 240_000)
})

// ============================================================================ the doors and the seal

describe('the doors and the seal', () => {
  const BOSS = 'door-boss'
  let door = { folder: '', container: '', repo: '' }
  let bossRun = ''
  let bossRunKey = ''

  /** A worker door-boss registered, with an area of its own. */
  const aWorker = (handle: string): Promise<void> => started(handle, asOne(BOSS), { role: 'worker', workArea: ['docs'] })
  /** A brief in the made-up sandbox folder, and beside it the declaration, when one is given. */
  function aBriefInside(name: string, declaration?: unknown): string {
    const brief = join(door.folder, `${name}.md`)
    writeFileSync(brief, `# A made-up brief, ${name}\nDo the made-up work.\n`)
    const at = theDeclarationFileOf(brief)
    if (declaration !== undefined) writeFileSync(at, JSON.stringify(declaration))
    return brief
  }
  const askAWorkerRun = (handle: string, brief: string) => call('POST', `/api/agents/${idOf(handle)}/worker-run`, asAgent(BOSS, bossRunKey, bossRun), { brief })
  const theWorkerRunOf = (handle: string): Record<string, any> | undefined => dataOf(bossRun)['workerRuns']?.[idOf(handle)]

  /** The message worker's launcher run for one start. Its id. */
  async function aLauncherRun(extra: Record<string, unknown>): Promise<string> {
    const r = await call('POST', '/api/records', AS_THE_WORKER(), {
      kind: 'session', title: 'A made-up launcher run',
      data: { state: 'running', runtime: 'round-launcher', doing: 'starting a made-up run; this run runs no model', workingDirectory: door.repo, startedByMoleOffice: true, extra },
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    return String(r.body['record'].id)
  }

  /** The asked worker run is started and filed, in a repository of its own, as the message worker starts one. Its run. */
  async function startTheWorkerRun(handle: string): Promise<string> {
    const wrapper = await aLauncherRun({ purpose: 'worker', run: bossRun, worker: idOf(handle) })
    const starting = await call('POST', `/api/worker/worker-runs/${bossRun}/starting`, AS_THE_WORKER(), { agent: idOf(handle), wrapper })
    expect(starting.status, JSON.stringify(starting.body)).toBe(200)
    const filed = await call('POST', '/api/records', AS_THE_WORKER(wrapper), {
      kind: 'session', title: `A made-up worker run of ${handle}`,
      data: { state: 'running', runtime: 'claude-code', model: MODEL, servingAgent: handle, servingAgentId: idOf(handle), workingDirectory: aRepositoryToSeal(handle), cutFrom: 'main', parentAttachment: bossRun },
    })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const run = String(filed.body['record'].id)
    expect(theWorkerRunOf(handle)).toMatchObject({ state: 'started', started: { run } })
    return run
  }

  /** An agent's last run, in the made-up sandbox, filed as a launcher files one. */
  function aLastRun(handle: string): string {
    return t.api.createRecord({
      workspaceId: WORKSPACE, kind: 'session', title: `A made-up round of ${handle}`, origin: 'fixture', actor: OWNER,
      data: {
        state: 'running', servingAgent: handle, servingAgentId: idOf(handle), runtime: 'claude-code', model: MODEL,
        workingDirectory: door.repo, cutFrom: 'main', sandbox: { template: 'mole-office-dev', container: door.container, folder: door.folder },
      },
    }).id
  }
  const askTheNextRound = (handle: string, brief: string) => call('POST', `/api/agents/${idOf(handle)}/next-round`, AS_THE_PERSON, { brief })

  /** The asked next round is started and filed, in a repository of its own, as the message worker starts one. Its run. */
  async function startTheNextRound(handle: string, last: string): Promise<string> {
    const wrapper = await aLauncherRun({ purpose: 'round', round: last })
    const starting = await call('POST', `/api/worker/rounds/${last}/starting`, AS_THE_WORKER(), { wrapper })
    expect(starting.status, JSON.stringify(starting.body)).toBe(200)
    const filed = await call('POST', '/api/records', AS_THE_WORKER(wrapper), {
      kind: 'session', title: `A made-up next round of ${handle}`,
      data: { state: 'running', runtime: 'claude-code', model: MODEL, servingAgent: handle, servingAgentId: idOf(handle), workingDirectory: aRepositoryToSeal(handle), cutFrom: 'main', parentAttachment: wrapper },
      links: [{ type: 'derived_from', toId: last }],
    })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const run = String(filed.body['record'].id)
    expect(dataOf(last)['nextRound']).toMatchObject({ state: 'started', started: { run } })
    return run
  }

  /** A running run of the agent, filed by hand, in a repository of its own. */
  function aRunByHand(handle: string, state = 'running'): string {
    return t.api.createRecord({
      workspaceId: WORKSPACE, kind: 'session', title: `A made-up run of ${handle} started by hand`, origin: 'fixture', actor: OWNER,
      data: { state, servingAgent: handle, servingAgentId: idOf(handle), runtime: 'claude-code', model: MODEL, workingDirectory: aRepositoryToSeal(`${handle}-${randomUUID().slice(0, 6)}`), cutFrom: 'main' },
    }).id
  }
  /** The starter sets the area through the work-area door, for a run when one is named. */
  const setByTheStarter = (handle: string, workArea: string[], forRun?: string) =>
    call('POST', `/api/participants/agent/${handle}/work-area`, asOne(BOSS), { workArea, because: 'A made-up start by hand.', ...(forRun === undefined ? {} : { forRun }) })

  beforeAll(async () => {
    // THE STARTERS: a secretary the person registered, and the supervisor it registered, which registers the workers.
    await started('door-quill', AS_THE_PERSON, { role: 'secretary' })
    await started(BOSS, asOne('door-quill'))
    // THE WORKER CARD'S CASTING ROW, cast by the person from a made-up decision.
    const decided = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'decision', title: 'The test casts the worker card', data: { ...governsTheWholeProject(), replaces: [] } })
    expect(decided.status, JSON.stringify(decided.body)).toBe(201)
    const decision = String(decided.body['record'].id)
    const cast = await call('POST', '/api/casting/worker', AS_THE_PERSON, { program: { value: 'claude-code', decision }, model: { value: MODEL, decision }, effort: { value: 'high', decision } })
    expect(cast.status, JSON.stringify(cast.body)).toBe(201)

    // A MADE-UP SANDBOX FOLDER, its repository, and the container row `tools/sandbox.mjs up` registers for it.
    const folder = join(scratch, 'sandboxes', 'door-sandbox')
    mkdirSync(folder, { recursive: true })
    const repo = aMadeUpSandboxRepo(folder, REPO)
    const container = `row-${randomBytes(5).toString('hex')}`
    t.client.sqlite
      .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-11-15 09:00:00', 'agent:fixture')")
      .run(container, 'mole-office-sandbox-door-sandbox', `Sandbox door-sandbox, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
    door = { folder, container, repo: repo.repo }

    // THE SUPERVISOR'S RUN, filed by the secretary from its own terminal, so the office mints the run its own key.
    const terminal = await call('POST', '/api/records', asOne('door-quill'), { kind: 'session', title: 'The secretary in a terminal', data: { state: 'running', runtime: 'claude-code' } })
    expect(terminal.status, JSON.stringify(terminal.body)).toBe(201)
    const run = await call('POST', '/api/records', asOne('door-quill', String(terminal.body['record'].id)), {
      kind: 'session', title: 'A made-up supervisor run',
      data: { state: 'running', servingAgent: BOSS, servingAgentId: idOf(BOSS), runtime: 'claude-code', model: MODEL, workingDirectory: door.repo, cutFrom: 'main', sandbox: { template: 'mole-office-dev', container, folder } },
    })
    expect(run.status, JSON.stringify(run.body)).toBe(201)
    bossRun = String(run.body['record'].id)
    bossRunKey = String(run.body['runKey']?.key)
  }, 120_000)

  // AND: the inspector reads the agent's own area.
  it('a git-sealed worker run whose live area was cleared at the seal is still eligible', async () => {
    await aWorker('door-h')
    const run = aRunByHand('door-h')
    const set = await setByTheStarter('door-h', ['src'], run)
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    seal(run)
    expect(theAreaOf('door-h').area).toEqual([])
    const { resolveCheckEligibilityFacts } = await import('../src/server/lib/inspection.ts')
    expect(resolveCheckEligibilityFacts(t.api.getRecord(run)!).registeredArea, 'the sealed run reads as having no area').toBe(true)
  })

  // AND: the doors set no area.
  it('the worker-run door sets the declared area in the asker\'s name, and the seal of the run that ask started empties it', async () => {
    await aWorker('door-a')
    const brief = aBriefInside('a', { workArea: ['src'] })
    const asked = await askAWorkerRun('door-a', brief)
    expect(asked.status, JSON.stringify(asked.body)).toBe(202)
    const askedAt = theWorkerRunOf('door-a')!['askedAt']
    expect(theAreaOf('door-a')).toEqual({ area: ['src'], mark: expect.objectContaining({
      how: 'a-starter', by: { type: 'agent', id: idOf(BOSS) }, before: ['docs'], after: ['src'], declared: { brief, door: 'worker-run', askedOn: bossRun, askedAt },
    }) })
    const run = await startTheWorkerRun('door-a')
    seal(run)
    emptiedAtTheSeal('door-a', run, ['src'])
  })

  // AND: the doors set no area.
  it('the next-round door sets the declared area in the asker\'s name, and the seal of the round that ask started empties it', async () => {
    await aWorker('door-b')
    const last = aLastRun('door-b')
    const brief = aBriefInside('b', { workArea: ['src'] })
    const asked = await askTheNextRound('door-b', brief)
    expect(asked.status, JSON.stringify(asked.body)).toBe(202)
    const askedAt = dataOf(last)['nextRound']['askedAt']
    expect(theAreaOf('door-b')).toEqual({ area: ['src'], mark: expect.objectContaining({
      how: 'the-owner', before: ['docs'], after: ['src'], declared: { brief, door: 'next-round', askedOn: last, askedAt },
    }) })
    const run = await startTheNextRound('door-b', last)
    seal(run)
    emptiedAtTheSeal('door-b', run, ['src'])
  })

  // AND: the doors set an area with no declaration.
  it('a brief with no declaration, or one with no workArea key, is asked at both doors as before and no area changes', async () => {
    const asks = [
      { handle: 'door-c1', declaration: undefined, door: 'worker-run' },
      { handle: 'door-c2', declaration: { kind: 'a-made-up-kind' }, door: 'worker-run' },
      { handle: 'door-c3', declaration: undefined, door: 'next-round' },
      { handle: 'door-c4', declaration: { kind: 'a-made-up-kind' }, door: 'next-round' },
    ] as const
    for (const one of asks) {
      await aWorker(one.handle)
      const before = theAreaOf(one.handle)
      const brief = aBriefInside(one.handle, one.declaration)
      if (one.door === 'worker-run') {
        const asked = await askAWorkerRun(one.handle, brief)
        expect(asked.status, `${one.handle}: ${JSON.stringify(asked.body)}`).toBe(202)
        expect(theWorkerRunOf(one.handle)).toBeDefined()
      } else {
        const last = aLastRun(one.handle)
        const asked = await askTheNextRound(one.handle, brief)
        expect(asked.status, `${one.handle}: ${JSON.stringify(asked.body)}`).toBe(202)
        expect(dataOf(last)['nextRound']).toMatchObject({ state: 'wanted' })
      }
      expect(theAreaOf(one.handle), `${one.handle}'s area changed`).toEqual(before)
    }
  })

  // AND: a failed start empties nothing.
  it('a worker run whose start fails empties the area its ask set', async () => {
    await aWorker('door-d')
    const brief = aBriefInside('d', { workArea: ['src'] })
    const asked = await askAWorkerRun('door-d', brief)
    expect(asked.status, JSON.stringify(asked.body)).toBe(202)
    const askedAt = theWorkerRunOf('door-d')!['askedAt']
    expect(theAreaOf('door-d').area).toEqual(['src'])
    // THE BRIEF CHANGES AFTER THE ASK, so the start fails.
    writeFileSync(brief, '# A made-up brief, changed after it was asked for\n')
    const wrapper = await aLauncherRun({ purpose: 'worker', run: bossRun, worker: idOf('door-d') })
    const starting = await call('POST', `/api/worker/worker-runs/${bossRun}/starting`, AS_THE_WORKER(), { agent: idOf('door-d'), wrapper })
    expect(starting.status, JSON.stringify(starting.body)).toBe(409)
    expect(theWorkerRunOf('door-d')).toMatchObject({ state: 'failed' })
    const { area, mark } = theAreaOf('door-d')
    expect(area, 'the failed start left the area').toEqual([])
    expect(mark).toMatchObject({ how: 'a-failed-start', by: { type: 'agent', id: theOfficesOwnId(t) }, before: ['src'], after: [], ask: { door: 'worker-run', askedOn: bossRun, askedAt } })
  })

  // AND: the door reads a declaration outside the sandbox folder.
  it('a declaration that links to a file outside the sandbox folder is refused at the worker-run door, and the refusal quotes nothing of it', async () => {
    await aWorker('door-s')
    const outside = join(scratch, 'outside', 'the-declaration.json')
    mkdirSync(dirname(outside), { recursive: true })
    const secret = `outside-${UNSEEN}`
    writeFileSync(outside, JSON.stringify({ workArea: [secret] }))
    const brief = aBriefInside('s')
    symlinkSync(outside, theDeclarationFileOf(brief))
    const before = { area: theAreaOf('door-s'), written: written() }
    const asked = await askAWorkerRun('door-s', brief)
    expect(asked.status, JSON.stringify(asked.body)).toBe(409)
    expect(JSON.stringify(asked.body)).not.toContain(secret)
    expect(theAreaOf('door-s')).toEqual(before.area)
    expect(theWorkerRunOf('door-s')).toBeUndefined()
    expect(written()).toEqual(before.written)
  })

  // M5: the door takes a run of another agent for `forRun`.
  it('the door refuses a forRun naming another agent\'s run, a run that is not running, or no run, and writes nothing', async () => {
    await aWorker('door-e')
    const ended = aRunByHand('door-e', 'crashed')
    for (const [forRun, status] of [[bossRun, 409], [ended, 409], [`no-such-run-${UNSEEN}`, 404]] as const) {
      const before = { area: theAreaOf('door-e'), written: written() }
      const r = await setByTheStarter('door-e', ['src'], forRun)
      expect(r.status, `${forRun}: ${JSON.stringify(r.body)}`).toBe(status)
      expect(theAreaOf('door-e')).toEqual(before.area)
      expect(written()).toEqual(before.written)
    }
  })

  // M3: the seal does not empty the area.
  it('an area set for a run by hand is emptied by that run\'s seal, by Mole Office, with the run named', async () => {
    await aWorker('door-f')
    const run = aRunByHand('door-f')
    const set = await setByTheStarter('door-f', ['src'], run)
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    expect(theAreaOf('door-f')).toEqual({ area: ['src'], mark: expect.objectContaining({ how: 'a-starter', forRun: run }) })
    seal(run)
    emptiedAtTheSeal('door-f', run, ['src'])
  })

  // M4: the seal empties the area without reading the last change.
  it('an area the starter changed after it was set for a run is kept at the seal', async () => {
    await aWorker('door-g')
    const run = aRunByHand('door-g')
    expect((await setByTheStarter('door-g', ['src'], run)).status).toBe(200)
    expect((await setByTheStarter('door-g', ['src', 'docs'])).status).toBe(200)
    const changed = theAreaOf('door-g')
    seal(run)
    expect(theAreaOf('door-g'), 'the seal emptied an area changed since').toEqual(changed)
    expect(changed.area).toEqual(['src', 'docs'])
  })
})
