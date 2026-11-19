// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SANDBOX START RECHECKS ITS CASTING ROW AS THE RUN, AFTER THE KEY WINDOW CLOSED. Problem HUBtjOo-nUOJ.
 *
 * A round the launcher on the host starts is filed there, with the starter's key, and the office answers a key of the
 * run's own agent. The host rechecks the run's native Casting selection with the caller's key, and hands it to the
 * helper, tools/sandbox-start.mjs, as SANDBOX_START_SELECTION, with --filed and the run's key as SANDBOX_RUN_KEY. The
 * helper rechecks the row again before it makes anything. That recheck went with the starter's name and no key,
 * because no starter's key goes into a container, and since the key window closed the office refuses such a read. So a
 * round the message worker started on a native row was refused 403 and written crashed. The recheck now goes as the
 * run: the run's agent, the run's session and the run's key, as the helper's calls at the gate go.
 *
 * WHAT IS REAL. A test office over a throwaway database, on a free port, holding a made-up person's key, which closes
 * its key window. A starter registered as the secretary, and a Codex worker it registered. A native Casting row for the
 * worker's model. Each run is filed with fileARun, the launcher's own filing function, with the starter's key, as the
 * host files it. The helper runs as its own process with no MOLE_AGENT_KEY, and every other call it makes goes to the
 * test office with the headers it chose.
 *
 * WHAT IS MADE UP. The process ledger's answers, because the helper registers its process in a container this test
 * does not have. The Codex program, which writes down what it was given and exits. Every key.
 *
 * THE CASES
 *   1. With the run's key, the preflight's recheck reaches the office as the run and is answered, and the start goes
 *      on: the program runs and exits 0. It files no report, so the helper writes the run orphaned, as it writes any
 *      run whose command ended with no report.
 *   2. With no run key, the recheck goes with the starter's name and no key, as before. The office refuses it, and the
 *      refusal says the start holds no key to recheck the row with. The helper prints a refusal's first sentence and
 *      writes the whole of it in the launch details it names, so the sentence is read there.
 *
 * MUTATIONS. The preflight's recheck sent with headers(starterSession) again: case 1 goes red. The sentence about the
 * missing key taken out of the refusal: case 2 goes red.
 */
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { NAME_THE_PROCESS_THAT_LOADS_THIS, removeTheFolderOnceItsProcessesHaveEnded } from './the-processes-a-fixture-started.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'
import { readHostInstance, theFactsAStartIsGiven, theSandboxField, THE_FACTS_VARIABLE, writeInstance } from '../tools/sandbox-common.mjs'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = 'e5'.repeat(32)
const A_MADE_UP_OFFICE_KEY = 'f6'.repeat(32)
const A_KEY = /^[0-9a-f]{64}$/

const WORKSPACE = 'default'
const STARTER = 'recheck-secretary'
const WORKER = 'recheck-codex-worker'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }

/** The words the helper's refusal adds when the start held no key to recheck the row with. */
const NO_KEY_TO_RECHECK_WITH = 'This start holds no key to recheck the row with: no run key came from the host, and this helper holds no MOLE_AGENT_KEY.'

let t: TestDb
let app: FastifyInstance
let api = ''
let root = ''
let instance = ''
let starterKey = ''
let starterSession = ''
let model = ''
/** The selection the office answers for the worker's Casting row, as the host hands it in. */
let selection: { casting: { id: number } | null } & Record<string, unknown>

/** The ledger is made up; every other call goes to the test office with the headers the helper chose. */
const fixture = String.raw`
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
const root = process.env.RECHECK_FIXTURE
${NAME_THE_PROCESS_THAT_LOADS_THIS}
const original = globalThis.fetch
globalThis.fetch = async (address, init = {}) => {
  const url = new URL(address)
  if (url.origin !== 'http://synthetic.invalid') throw new Error('The made-up ledger refused a call outside the test office')
  const path = url.pathname, method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : {}
  const answer = (value, status = 200) => new Response(JSON.stringify(value), { status })
  if (path === '/api/resources') return method === 'GET' ? answer({ resources: [], rows: [] }) : answer({ resource: { id: 'made-up-process-' + process.pid, key: String(body.pidInContainer), pgid: body.pidInContainer } }, 201)
  if (path.startsWith('/api/resources/') && path.endsWith('/release')) return answer({ released: true })
  return original(process.env.RECHECK_OFFICE + path + url.search, init)
}
`

/** A Codex program that runs no model: it writes down what it was given, and exits 0. */
const program = `#!${process.execPath}
const fs = require('fs'), path = require('path')
fs.writeFileSync(path.join(process.env.RECHECK_FIXTURE, 'seen-' + process.env.MOLE_OFFICE_SESSION), JSON.stringify({ argv: process.argv.slice(2), agent: process.env.MOLE_OFFICE_AGENT }))
`

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; json: any }> {
  const reply = await app.inject({ method, url, headers: { 'x-mole-office-workspace': WORKSPACE, ...headers }, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: any = null
  try { json = reply.json() } catch { json = null }
  return { status: reply.statusCode, json }
}

const asTheStarter = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': STARTER, 'x-mole-office-session': starterSession, 'x-mole-office-key': starterKey })

/** The repo folder the helper takes as the worktree when it is given none. */
const theWorktree = (): string => join(instance, 'repo')

/**
 * FILED AS THE HOST FILES A RUN: through fileARun, with the starter's own key in the environment register-a-run.mjs
 * reads it from, and the sandbox's own field. fileARun waits for its filing synchronously, and the test office answers
 * in this process, so it is called in a process of its own. Answers the run and the key the office answered for it.
 */
async function aRunTheHostFiled(): Promise<{ id: string; key: string }> {
  const asked = {
    api, workspace: WORKSPACE, as: STARTER, session: starterSession, handle: WORKER, worktree: theWorktree(), cutFrom: 'main',
    runtime: 'codex', model, title: 'A round on a native Casting row', sandbox: theSandboxField(readHostInstance(instance), realpathSync(instance)),
    continues: null, flow: null, keyFolder: root,
  }
  const env = { ...withoutInheritedEffort(), MOLE_AGENT_KEY: starterKey, RECHECK_FILING: JSON.stringify(asked) }
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    `import { fileARun } from ${JSON.stringify(pathToFileURL(join(process.cwd(), 'tools', 'file-a-run.mjs')).href)}; process.stdout.write(JSON.stringify(fileARun(JSON.parse(process.env.RECHECK_FILING))))`], { env })
  let out = ''
  let err = ''
  child.stdout.on('data', (chunk) => { out += String(chunk) })
  child.stderr.on('data', (chunk) => { err += String(chunk) })
  const code = await new Promise<number | null>((done) => child.on('close', done))
  expect(code, err).toBe(0)
  const filed = JSON.parse(out) as { ok: boolean; id: string; key: string | null; says: string }
  expect(filed.ok, filed.says).toBe(true)
  expect(filed.key, 'the office answered no key for the run').toMatch(A_KEY)
  return { id: filed.id, key: String(filed.key) }
}

/** The helper, started as tools/sandbox.mjs starts it in the container for a run it filed, with the run's key or none. */
async function theHelperStarts(run: string, runKey: string | null): Promise<{ code: number | null; err: string; start: Record<string, any> | null }> {
  const env = withAPrivateTmpToSweep({
    ...withoutInheritedEffort(), HOME: join(instance, 'home'), PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}`,
    RECHECK_FIXTURE: root, RECHECK_OFFICE: api, NODE_OPTIONS: `--import=${join(root, 'fetch.mjs')}`,
    MOLE_OFFICE_AGENT: STARTER, MOLE_OFFICE_SESSION: starterSession, MOLE_OFFICE_API: 'http://synthetic.invalid', MOLE_OFFICE_WORKSPACE: WORKSPACE,
    MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
    SANDBOX_START_SELECTION: JSON.stringify(selection), [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(readHostInstance(instance)),
    ...(runKey === null ? {} : { SANDBOX_RUN_KEY: runKey }),
  }, root)
  delete env['MOLE_AGENT_KEY']
  const child = spawn(process.execPath, ['tools/sandbox-start.mjs', '--instance', instance, '--agent', WORKER, '--runtime', 'codex', '--model', model,
    '--cut-from', 'main', '--filed', run, '--brief', join(root, 'brief'), '--', join(root, 'bin', 'codex'), 'exec', '--json', '--', 'A made-up prompt'], { env })
  let out = ''
  let err = ''
  child.stdout.on('data', (chunk) => { out += String(chunk) })
  child.stderr.on('data', (chunk) => { err += String(chunk) })
  const code = await new Promise<number | null>((done) => child.on('close', done))
  const line = out.trim().split('\n').find((text) => text.startsWith('{'))
  return { code, err, start: line === undefined ? null : JSON.parse(line) }
}

/** The office's own log of the rechecks of the row: who it read each as, on what proof, and what it answered. */
function theRechecks(): { actor_id: string; session_id: string; identity_source: string; status: number }[] {
  return t.client.sqlite
    .prepare("SELECT actor_id, session_id, identity_source, status FROM api_calls WHERE method = 'GET' AND route LIKE '/api/casting/rows/%/selection' ORDER BY at_ms ASC")
    .all() as { actor_id: string; session_id: string; identity_source: string; status: number }[]
}

beforeAll(async () => {
  delete process.env['MOLE_OFFICE_WORLD_STARTED_BY']
  delete process.env['MOLE_OFFICE_WORLD_SECRETARIES']
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(join(t.file, '..', 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  const port = (app.server.address() as AddressInfo).port
  expect(thePortsATestKeepsOff()).not.toContain(port)
  api = `http://127.0.0.1:${String(port)}`

  // THE STARTER IS THE SECRETARY, because only the secretary's own key files a run from the host with a sandbox on it,
  // and it registers the worker, so it is the worker's registered starter and the office answers the run a key.
  const made = await ask('POST', '/api/agents/started', { 'content-type': 'application/json', ...PERSON }, { handle: STARTER, name: STARTER, role: 'secretary' })
  expect(made.status, JSON.stringify(made.json)).toBe(201)
  starterKey = String(made.json?.whatToGiveIt?.key ?? '')
  expect(starterKey, 'the registration answered no key').toMatch(A_KEY)
  const mine = await ask('POST', '/api/records', { 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': STARTER, 'x-mole-office-key': starterKey },
    { kind: 'session', title: 'the secretary run', data: { state: 'running' } })
  expect(mine.status, JSON.stringify(mine.json)).toBe(201)
  starterSession = mine.json.record.id
  const worker = await ask('POST', '/api/agents/started', { 'content-type': 'application/json', ...asTheStarter() }, { handle: WORKER, name: WORKER, role: 'worker', runtime: 'codex', workArea: ['src'] })
  expect(worker.status, JSON.stringify(worker.json)).toBe(201)

  // A NATIVE CASTING ROW FOR THE WORKER'S MODEL, and the selection the office answers for it.
  const id = randomUUID()
  model = `office-${id}`
  const row = await ask('POST', '/api/casting/worker', { 'content-type': 'application/json', ...PERSON },
    { program: { value: 'codex' }, model: { value: model }, effort: { value: `effort-${id}` }, native: { model: `native-${id}`, provider: null, variant: null } })
  expect(row.status, JSON.stringify(row.json)).toBe(201)
  const read = await ask('GET', `/api/casting/rows/${String(row.json.casting.id)}/selection`, PERSON)
  expect(read.status, JSON.stringify(read.json)).toBe(200)
  selection = read.json.selection
  expect(selection.casting, 'the selection names no Casting row').not.toBeNull()

  // THE SANDBOX: its facts, its clone with this checkout's own tools, and a home that holds a Codex login.
  root = mkdtempSync(join(tmpdir(), 'recheck-as-the-run-'))
  instance = join(root, 'sandbox')
  for (const dir of ['repo', 'home/.codex', 'out', 'dsh/home', 'bin']) mkdirSync(join(instance, dir), { recursive: true })
  const git = (...args: string[]): void => { execFileSync('git', ['-C', theWorktree(), ...args], { stdio: 'ignore' }) }
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'A test'); git('config', 'user.email', 'a-test@example.invalid'); git('config', 'commit.gpgsign', 'false')
  writeFileSync(join(theWorktree(), 'README'), 'a checkout for the recheck test\n'); git('add', '.'); git('commit', '-qm', 'the checkout')
  for (const dir of ['tools', 'src', 'for-agents']) symlinkSync(join(process.cwd(), dir), join(theWorktree(), dir))
  const template = join(root, 'template')
  mkdirSync(template)
  writeFileSync(join(template, 'devcontainer.json'), '{}')
  writeFileSync(join(template, 'sandbox.json'), '{}')
  writeInstance(instance, { instance: 'recheck', template: 'recheck', templateDir: template, workspace: WORKSPACE, from: theWorktree(), ref: 'main', containerRow: 'made-up-container', container: { name: 'recheck' } })
  writeFileSync(join(instance, 'home/.codex/auth.json'), '{}')
  writeFileSync(join(root, 'brief'), 'A made-up prompt')
  writeFileSync(join(root, 'fetch.mjs'), fixture)
  mkdirSync(join(root, 'bin'), { recursive: true })
  writeFileSync(join(root, 'bin', 'codex'), program, { mode: 0o755 })

  // THE PERSON CLOSES THE WINDOW WITH THEIR KEY, through a listener, as they closed the office's on 28 September 2026.
  const closed = await fetch(`${api}/api/office/key-window/close`, { method: 'POST', headers: PERSON })
  expect(closed.status, await closed.text()).toBe(200)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (root !== '') await removeTheFolderOnceItsProcessesHaveEnded(root)
})

describe("a sandbox start's preflight rechecks its Casting row", () => {
  it("1: as the run, with the run's key from the host, and the start goes on", async () => {
    const run = await aRunTheHostFiled()
    const before = theRechecks().length
    const ran = await theHelperStarts(run.id, run.key)
    expect(ran.code, ran.err).toBe(0)
    expect(ran.start?.run, ran.err).toBe(run.id)
    // THE PREFLIGHT'S RECHECK AND THE GATE'S BOTH WENT AS THE RUN, and the office answered both.
    expect(theRechecks().slice(before)).toEqual([
      { actor_id: WORKER, session_id: run.id, identity_source: 'key', status: 200 },
      { actor_id: WORKER, session_id: run.id, identity_source: 'key', status: 200 },
    ])
    // THE PROGRAM RAN AND EXITED 0, and with no report the run is written orphaned.
    await expect.poll(async () => (await ask('GET', `/api/records/${run.id}`, asTheStarter())).json?.record?.data?.state, { timeout: 20_000 }).toBe('orphaned')
    expect((await ask('GET', `/api/records/${run.id}`, asTheStarter())).json?.record?.data?.commandEnded?.code).toBe(0)
    const seen = JSON.parse(readFileSync(join(root, `seen-${run.id}`), 'utf8')) as { agent: string }
    expect(seen.agent).toBe(WORKER)
  }, 60_000)

  it('2: with no run key, as the starter with no key, as before, and the refusal says the start holds none', async () => {
    const run = await aRunTheHostFiled()
    const before = theRechecks().length
    const ran = await theHelperStarts(run.id, null)
    expect(ran.code, ran.err).toBe(2)
    expect(ran.err).toContain('The selected Casting row could not be rechecked (')
    const details = [...ran.err.matchAll(/Details: (\S+)/g)].map((match) => match[1]!)
    expect(details.length, ran.err).toBeGreaterThan(0)
    expect(details.map((file) => (existsSync(file) ? readFileSync(file, 'utf8') : '')).join('')).toContain(NO_KEY_TO_RECHECK_WITH)
    // THE RECHECK STILL WENT, with the starter's name and its session, and the office refused it.
    expect(theRechecks().slice(before)).toMatchObject([{ actor_id: STARTER, session_id: starterSession, status: 403 }])
  }, 60_000)
})
