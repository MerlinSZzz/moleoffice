// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START THAT WRITES A RUN'S DOING LINE PRINTS NO LINE FOR IT, without --verbose.
 *
 * tools/sandbox-start.mjs writes the doing line of a run that holds none, both for a run named with --run and for a run
 * the host filed and names with --filed. A doing line written or kept is a launch detail: it goes in the launch
 * details file and is not printed. Only a refused write is said aloud. Every line the helper prints is counted, on
 * standard output and standard error together, as a caller sees them through the helper's front.
 *
 * THE CASES
 *   1. --run. Every --run start also says aloud that the run holds no key of its own, so a start that writes the line
 *      (A) is compared with a start that keeps the line the run already holds (B). Both print two lines: that notice
 *      and the start line. A sends one doing-line write, whose value is the launcher's own line for the run; B sends
 *      none.
 *   2. --filed, with the run's key from the host: the start prints only its start line, and the run holds the doing line
 *      the launcher makes for it after.
 *
 * WHY CASE 1 RUNS AGAINST A STAND-IN OFFICE. A --run start writes about the run as the starter, with the run as the
 * session. Against the test office, after the person closed the key window, those writes were refused with every key a
 * --run start could hold here, and the start never came to its start line. So case 1 runs against a stand-in office in
 * this file, which holds one run and answers its reads and writes.
 *
 * WHAT IS REAL IN CASE 2. A test office over a throwaway database, on a free port, holding a made-up person's key,
 * which closes its key window. A starter registered as the secretary, and a Codex worker it registered. A native
 * Casting row for the worker's model. The run is filed with fileARun, the launcher's own filing function, with the
 * starter's key, and its doing line is then taken off, so the start finds none. The run is read back after the start.
 *
 * WHAT IS MADE UP. Case 1's office. The process ledger's answers, because the helper registers its process in a
 * container this test does not have. The Codex program, which exits at once. Every key. In both cases the helper runs
 * as its own process.
 *
 * MUTATIONS. The --run block's say() of the doing line made to print a written line aloud and keep a kept one quiet
 * (say(written.says, written.kept)): case 1 goes red, case 2 stays green. The same in the --filed block: case 2 goes
 * red, case 1 stays green.
 */
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { theDoingLineOfARun } from '../tools/file-a-run.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { NAME_THE_PROCESS_THAT_LOADS_THIS, removeTheFolderOnceItsProcessesHaveEnded } from './the-processes-a-fixture-started.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'
import { readHostInstance, theFactsAStartIsGiven, theSandboxField, THE_FACTS_VARIABLE, writeInstance } from '../tools/sandbox-common.mjs'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = 'a7'.repeat(32)
const A_MADE_UP_OFFICE_KEY = 'b8'.repeat(32)
/** The key an agent inside the sandbox holds as MOLE_AGENT_KEY, which only the stand-in office is sent. */
const A_MADE_UP_RUN_KEY = 'c9'.repeat(32)
const A_KEY = /^[0-9a-f]{64}$/

const WORKSPACE = 'default'
const STARTER = 'doing-line-secretary'
const WORKER = 'doing-line-codex-worker'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }

let t: TestDb
let app: FastifyInstance
let api = ''
let root = ''
let instance = ''
let starterKey = ''
let starterSession = ''
let model = ''
/** The selection the office answers for the worker's Casting row, as the host hands it in. */
let selection: Record<string, unknown>

/** The ledger is made up; every other call goes to the test office with the headers the helper chose. */
const fixture = String.raw`
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
const root = process.env.DOING_LINE_FIXTURE
${NAME_THE_PROCESS_THAT_LOADS_THIS}
const original = globalThis.fetch
globalThis.fetch = async (address, init = {}) => {
  const url = new URL(address)
  if (url.origin !== 'http://synthetic.invalid') throw new Error('The made-up ledger refused a call outside the test office')
  const path = url.pathname, method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : {}
  const answer = (value, status = 200) => new Response(JSON.stringify(value), { status })
  if (path === '/api/resources') return method === 'GET' ? answer({ resources: [], rows: [] }) : answer({ resource: { id: 'made-up-process-' + process.pid, key: String(body.pidInContainer), pgid: body.pidInContainer } }, 201)
  if (path.startsWith('/api/resources/') && path.endsWith('/release')) return answer({ released: true })
  return original(process.env.DOING_LINE_OFFICE + path + url.search, init)
}
`

/** A Codex program that runs no model: it exits 0 at once. */
const program = `#!${process.execPath}
process.exit(0)
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

/** The run as the office holds it now. */
async function theRun(id: string): Promise<{ title: string; data: Record<string, unknown> }> {
  const read = await ask('GET', `/api/records/${id}`, asTheStarter())
  expect(read.status, JSON.stringify(read.json)).toBe(200)
  return read.json.record
}

/**
 * A RUN FILED AS THE HOST FILES ONE, WITH NO DOING LINE: through fileARun, with the starter's own key, from the starter's
 * session. fileARun always gives the run a doing line, so the starter takes it off after, and the run is read
 * back to show it holds none. fileARun waits for its filing synchronously, and the test office answers in this process,
 * so it is called in a process of its own. Answers the run and its key.
 */
async function aRunWithNoDoingLine(title: string): Promise<{ id: string; key: string }> {
  const asked = {
    api, workspace: WORKSPACE, as: STARTER, session: starterSession, handle: WORKER, worktree: theWorktree(), cutFrom: 'main',
    runtime: 'codex', model, title, sandbox: theSandboxField(readHostInstance(instance), realpathSync(instance)),
    continues: null, flow: null, keyFolder: root,
  }
  const env = { ...withoutInheritedEffort(), MOLE_AGENT_KEY: starterKey, DOING_LINE_FILING: JSON.stringify(asked) }
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    `import { fileARun } from ${JSON.stringify(pathToFileURL(join(process.cwd(), 'tools', 'file-a-run.mjs')).href)}; process.stdout.write(JSON.stringify(fileARun(JSON.parse(process.env.DOING_LINE_FILING))))`], { env })
  let out = ''
  let err = ''
  child.stdout.on('data', (chunk) => { out += String(chunk) })
  child.stderr.on('data', (chunk) => { err += String(chunk) })
  const code = await new Promise<number | null>((done) => child.on('close', done))
  expect(code, err).toBe(0)
  const filed = JSON.parse(out) as { ok: boolean; id: string; key: string | null; says: string }
  expect(filed.ok, filed.says).toBe(true)
  expect(filed.key, 'the office answered no key for the run').toMatch(A_KEY)
  const cleared = await ask('PATCH', `/api/records/${filed.id}`, { 'content-type': 'application/json', ...asTheStarter() }, { dataPatch: { doing: null } })
  expect(cleared.status, JSON.stringify(cleared.json)).toBe(200)
  expect((await theRun(filed.id)).data.doing, 'the run still holds a doing line before the start').toBeUndefined()
  return { id: filed.id, key: String(filed.key) }
}

/**
 * A STAND-IN OFFICE THAT HOLDS ONE RUN, for a start with --run. It answers the run's reads with the record as it is now,
 * applies each write's dataPatch to it (null takes a key off), answers the effort the run's agent is asked with none, and
 * keeps every write it was sent. Any other request is answered 404.
 */
async function aStandInOffice(id: string, title: string, data: Record<string, unknown>): Promise<{
  address: string; data: Record<string, unknown>; writes: Array<Record<string, any>>; close: () => Promise<void>
}> {
  const writes: Array<Record<string, any>> = []
  const held: Record<string, unknown> = { ...data }
  const server = createServer(async (req, reply) => {
    let text = ''
    for await (const chunk of req) text += String(chunk)
    const answer = (value: unknown, status = 200): void => { reply.statusCode = status; reply.setHeader('content-type', 'application/json'); reply.end(JSON.stringify(value)) }
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (path === `/api/records/${id}` && req.method === 'GET') return answer({ record: { id, kind: 'session', title, data: held } })
    if (path === `/api/records/${id}` && req.method === 'PATCH') {
      const body = JSON.parse(text) as Record<string, any>
      writes.push(body)
      for (const [key, value] of Object.entries(body.dataPatch ?? {})) {
        if (value === null) delete held[key]
        else held[key] = value
      }
      return answer({ record: { id, kind: 'session', title, data: held } })
    }
    if (path.startsWith('/api/office/run-models/for/') && req.method === 'GET') return answer({ model: null, effort: null, effortFrom: 'none' })
    // The finish's search for records that name the run's scratch folder comes here: unanswered, the folder is kept,
    // and the private temporary folder the helper is given is swept after.
    return answer({ error: 'The stand-in office has no answer for this request.' }, 404)
  })
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  const port = (server.address() as AddressInfo).port
  expect(thePortsATestKeepsOff()).not.toContain(port)
  return {
    address: `http://127.0.0.1:${String(port)}`, data: held, writes,
    close: () => new Promise<void>((done) => server.close(() => done())),
  }
}

/**
 * THE HELPER, started without --verbose: with --run by the starter inside the sandbox, holding a key of its own and
 * asking the stand-in office at `office`, or with --filed and the run's key, as tools/sandbox.mjs starts it for a run it
 * filed on the host. Answers its exit code and every line it printed, on standard output and on standard error together.
 */
async function theHelperStarts(how: { run: string; office: string } | { filed: string; runKey: string }): Promise<{ code: number | null; lines: string[]; start: Record<string, any> | null }> {
  const env = withAPrivateTmpToSweep({
    ...withoutInheritedEffort(), HOME: join(instance, 'home'), PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}`,
    DOING_LINE_FIXTURE: root, DOING_LINE_OFFICE: 'filed' in how ? api : how.office, NODE_OPTIONS: `--import=${join(root, 'fetch.mjs')}`,
    MOLE_OFFICE_AGENT: STARTER, MOLE_OFFICE_SESSION: starterSession, MOLE_OFFICE_API: 'http://synthetic.invalid', MOLE_OFFICE_WORKSPACE: WORKSPACE,
    MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
    [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(readHostInstance(instance)),
    // The host hands a Casting selection and a run key only to a start of a run it filed (tools/sandbox.mjs takes no
    // --selection with --run).
    ...('filed' in how ? { SANDBOX_START_SELECTION: JSON.stringify(selection), SANDBOX_RUN_KEY: how.runKey } : { MOLE_AGENT_KEY: A_MADE_UP_RUN_KEY }),
  }, root)
  if ('filed' in how) delete env['MOLE_AGENT_KEY']
  const which = 'filed' in how
    ? ['--agent', WORKER, '--runtime', 'codex', '--model', model, '--cut-from', 'main', '--filed', how.filed, '--brief', join(root, 'brief')]
    : ['--run', how.run]
  const child = spawn(process.execPath, ['tools/sandbox-start.mjs', '--instance', instance, ...which, '--', join(root, 'bin', 'codex'), 'exec', '--json', '--', 'A made-up prompt'], { env })
  let printed = ''
  child.stdout.on('data', (chunk) => { printed += String(chunk) })
  child.stderr.on('data', (chunk) => { printed += String(chunk) })
  const code = await new Promise<number | null>((done) => child.on('close', done))
  const lines = printed.split('\n').filter((line) => line !== '')
  const line = lines.find((text) => text.startsWith('{'))
  return { code, lines, start: line === undefined ? null : JSON.parse(line) }
}

/** The background copy of a start stays until its command ends and it has written the run's end. */
async function theRunEnds(id: string): Promise<void> {
  await expect.poll(async () => (await theRun(id)).data.state, { timeout: 20_000 }).not.toBe('running')
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

  // THE SANDBOX: its facts, its clone with this checkout's own tools, and a home that holds a Codex login.
  root = mkdtempSync(join(tmpdir(), 'doing-line-one-line-'))
  instance = join(root, 'sandbox')
  for (const dir of ['repo', 'home/.codex', 'out', 'dsh/home', 'bin']) mkdirSync(join(instance, dir), { recursive: true })
  const git = (...args: string[]): void => { execFileSync('git', ['-C', theWorktree(), ...args], { stdio: 'ignore' }) }
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'A test'); git('config', 'user.email', 'a-test@example.invalid'); git('config', 'commit.gpgsign', 'false')
  writeFileSync(join(theWorktree(), 'README'), 'a checkout for the doing line test\n'); git('add', '.'); git('commit', '-qm', 'the checkout')
  for (const dir of ['tools', 'src', 'for-agents']) symlinkSync(join(process.cwd(), dir), join(theWorktree(), dir))
  const template = join(root, 'template')
  mkdirSync(template)
  writeFileSync(join(template, 'devcontainer.json'), '{}')
  writeFileSync(join(template, 'sandbox.json'), '{}')
  writeInstance(instance, { instance: 'doing-line', template: 'doing-line', templateDir: template, workspace: WORKSPACE, from: theWorktree(), ref: 'main', containerRow: 'made-up-container', container: { name: 'doing-line' } })
  writeFileSync(join(instance, 'home/.codex/auth.json'), '{}')
  writeFileSync(join(root, 'brief'), '# A made-up brief\n\nA made-up prompt\n')
  writeFileSync(join(root, 'fetch.mjs'), fixture)
  mkdirSync(join(root, 'bin'), { recursive: true })
  writeFileSync(join(root, 'bin', 'codex'), program, { mode: 0o755 })

  // THE PERSON CLOSES THE WINDOW WITH THEIR KEY, through a listener.
  const closed = await fetch(`${api}/api/office/key-window/close`, { method: 'POST', headers: PERSON })
  expect(closed.status, await closed.text()).toBe(200)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (root !== '') await removeTheFolderOnceItsProcessesHaveEnded(root)
})

describe('a start without --verbose that writes the doing line', () => {
  it('1: of a run named with --run, prints as many lines as a start that keeps the line, and writes the line once', async () => {
    const title = 'A run named with --run'
    const data = { state: 'running', runtime: 'codex', servingAgent: WORKER }
    // A: the run holds no doing line, so the start writes one.
    const a = await aStandInOffice('a-made-up-run-a', title, data)
    let written: Awaited<ReturnType<typeof theHelperStarts>>
    try {
      written = await theHelperStarts({ run: 'a-made-up-run-a', office: a.address })
      await expect.poll(() => a.data['state'], { timeout: 20_000 }).not.toBe('running')
    } finally { await a.close() }
    expect(written.code, written.lines.join('\n')).toBe(0)
    expect(written.start?.run, written.lines.join('\n')).toBe('a-made-up-run-a')
    const doingWrites = a.writes.filter((body) => Object.hasOwn(body.dataPatch ?? {}, 'doing'))
    expect(doingWrites, JSON.stringify(a.writes)).toHaveLength(1)
    expect(doingWrites[0]?.dataPatch.doing).toBe(theDoingLineOfARun(WORKER, title, undefined))
    // B: the run already holds a doing line, so the start keeps it and writes none.
    const b = await aStandInOffice('a-made-up-run-b', title, { ...data, doing: 'a doing line the run already holds' })
    let kept: Awaited<ReturnType<typeof theHelperStarts>>
    try {
      kept = await theHelperStarts({ run: 'a-made-up-run-b', office: b.address })
      await expect.poll(() => b.data['state'], { timeout: 20_000 }).not.toBe('running')
    } finally { await b.close() }
    expect(kept.code, kept.lines.join('\n')).toBe(0)
    expect(kept.start?.run, kept.lines.join('\n')).toBe('a-made-up-run-b')
    expect(b.writes.filter((body) => Object.hasOwn(body.dataPatch ?? {}, 'doing')), JSON.stringify(b.writes)).toHaveLength(0)
    // The doing line adds no printed line: A prints as many lines as B, the run's key notice and the start line.
    expect(written.lines, `${written.lines.join('\n')}\n----\n${kept.lines.join('\n')}`).toHaveLength(kept.lines.length)
    expect(written.lines, written.lines.join('\n')).toHaveLength(2)
  }, 90_000)

  it('2: of a run the host filed, named with --filed, prints one line, and the run holds the line after', async () => {
    const title = 'A run the host filed'
    const run = await aRunWithNoDoingLine(title)
    const ran = await theHelperStarts({ filed: run.id, runKey: run.key })
    expect(ran.code, ran.lines.join('\n')).toBe(0)
    expect(ran.start?.run, ran.lines.join('\n')).toBe(run.id)
    expect(ran.lines, ran.lines.join('\n')).toHaveLength(1)
    expect((await theRun(run.id)).data.doing).toBe(theDoingLineOfARun(WORKER, title, join(root, 'brief')))
    await theRunEnds(run.id)
  }, 60_000)
})
