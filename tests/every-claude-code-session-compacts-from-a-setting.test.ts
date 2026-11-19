// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY CLAUDE CODE SESSION THE OFFICE STARTS COMPACTS WHEN AN OFFICE SETTING SAYS, in wave 13q
 * round 58. The secretary's answer is ANcJzwNZ__lo. There are two
 * settings, both on the Settings page, both used from the next start with no restart:
 *   - MOLE_OFFICE_CLAUDE_COMPACTS_AT_ON_THE_HOST, for a conversation the message worker starts on this computer
 *     (startModelRun in src/worker/runtimes/common.ts);
 *   - MOLE_OFFICE_CLAUDE_COMPACTS_AT_IN_A_SANDBOX, as since 4 October 2026 (hzskk7OFphee), for every command
 *     tools/sandbox.mjs starts in a sandbox. Before this round that number was written in tools/sandbox.mjs itself.
 * Since wave 13q round 64 the dispatch worker, tools/agent-worker.mjs, gives its Claude Code runs the host setting as the
 * message worker does, and its words name that setting when a Casting row's selection words its start as well. A
 * sandbox start's words name the sandbox setting, not only "the command's environment".
 * Their defaults, their names, the variable and the refusal's sentence are read from the code, never
 * copied here, by the owner's rule. The numbers this
 * test sets are made up.
 * Claude Code 2.1.281 reads the variable CLAUDE_CODE_AUTO_COMPACT_WINDOW, and the env of a --settings it is given beats
 * its home settings.json and the environment it was started with. So a host start has the window in its first
 * --settings and in its environment, and a sandbox start has it in its environment and in the sandbox's own Claude Code
 * settings, which each start brings up to date. A Casting row that names env.CLAUDE_CODE_AUTO_COMPACT_WINDOW in its own
 * settings keeps its number. A conversation started by a message worker that runs in a sandbox keeps the window the
 * sandbox gave the worker. Codex and OpenCode are given nothing. A value Claude Code does not take, 100,000 to 1,000,000
 * tokens in its own words, is refused at the settings door, and refused at a start, where nothing is started and no run
 * is filed.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database. Every setting and Casting row
 * is written through its doors as the person, and the launcher reaches it through a relay on a free port, as in
 * tests/a-conversation-is-given-its-casting-rows-selection.test.ts. The host starts are the real startModelRun, and the
 * sandbox starts are the real tools/sandbox.mjs and tools/sandbox-start.mjs through the shared docker stand-in, with a
 * stand-in office for the sandbox's calls, as in tests/a-sandbox-run-has-the-harness-subagents-off.test.ts. The sandbox
 * launcher reads the settings from the same test database, named to it by MOLE_OFFICE_DB. The dispatch worker is the real
 * tools/agent-worker.mjs, taking a run queued through the real doors from the same office, listening on a free port, and
 * reading the settings from the same database. Each program is a stand-in
 * that writes down its words and the window in its environment, and ends. No model runs. Every number is made up.
 *
 * THE MUTATIONS, EACH TRIED ALONE AFTER A CONTROL RUN, each turning a case red:
 *   - a conversation on the host given the sandbox's setting (the host's default case);
 *   - startModelRun given no window (the host's default case);
 *   - the window given to every runtime's start on the host (the case of Codex and OpenCode);
 *   - a conversation in a sandbox given the host setting (the case of a worker in a sandbox);
 *   - a row's own number in --settings refused as another number (the Casting row's case);
 *   - the selection's words not told where the window came from (the Casting row's case);
 *   - the sandbox's -e given a fixed number and not the setting (the sandbox's changed case);
 *   - the sandbox's own Claude Code settings brought up to date only at up (the sandbox's changed case);
 *   - the sandbox's start helper not told where the window came from, as before wave 13q round 64 (the sandbox's changed
 *     case);
 *   - the worker command's window read after its run is filed (the sandbox's refusal case);
 *   - whatIsWrongWithACompactionWindow taking every value (the door's case and both refusals at a start);
 *   - the dispatch worker's start given no window, as before wave 13q round 64 (the dispatch worker's host case);
 *   - the dispatch worker's start given the host setting in a sandbox too (the dispatch worker's sandbox case);
 *   - the dispatch worker's start words not told where the window came from (the dispatch worker's Casting row case);
 *   - the dispatch worker starting a run when the window is refused (the dispatch worker's refusal case).
 */
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { claudeCodeGuard } from '../src/config/main-world-guard.mjs'
import { IN_A_SANDBOX as THE_SANDBOX_VARIABLE } from '../src/config/run-permissions.mjs'
import { settingNamed } from '../src/config/settings.mjs'
import { A_SANDBOX_STARTS_WINDOW_FROM, THE_COMPACTION_SETTINGS, THE_COMPACTION_VARIABLE, whatIsWrongWithACompactionWindow } from '../src/config/the-compaction-window.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { startModelRun } from '../src/worker/runtimes/common.ts'
import { THE_FACTS_VARIABLE, theFactsAStartIsGiven, writeInstance } from '../tools/sandbox-common.mjs'
import { LEGACY_ROUND_CHAPTERS, writeRoundStartRules } from './round-chapters-fixture.ts'
import { FAKE_DOCKER } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const HOST = THE_COMPACTION_SETTINGS.host
const SANDBOX = THE_COMPACTION_SETTINGS.sandbox
const VARIABLE = THE_COMPACTION_VARIABLE
/** The two defaults, as src/config/settings.mjs declares them. */
const ON_THE_HOST = String(settingNamed(HOST).fallback)
const IN_A_SANDBOX = String(settingNamed(SANDBOX).fallback)
const WORKSPACE = 'default'
const AGENT = 'synthetic-compacting-one'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
/** The sentence that says which windows Claude Code takes, as the code words it. */
const THE_WINDOWS_IT_TAKES = whatIsWrongWithACompactionWindow(HOST, 'auto') ?? 'no sentence, since the code took "auto" as a window'
const REFUSAL = `${THE_WINDOWS_IT_TAKES} Nothing was changed.`

let t: TestDb
let app: FastifyInstance
let relay: Server
let api = ''
let root = ''
let sequence = 0
/** The record of AGENT, as the office registered it. */
let agentRecord = ''

/** What a stand-in program writes down: the words it was started with, and the window in its environment. */
interface Seen { argv: string[]; window: string | null }
const STAND_IN = `#!${process.execPath}
require('fs').writeFileSync(process.env.SEEN_FILE, JSON.stringify({ argv: process.argv.slice(2), window: process.env.${VARIABLE} ?? null }))
process.stdout.write('{}')
`

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: AGENT, name: 'Synthetic Compacting One', role: THE_WORKER, runtime: 'claude-code', workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  agentRecord = (made.json() as { record: string }).record
  relay = createServer((request, response) => {
    const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => name.startsWith('x-mole-office-'))) as Record<string, string>
    void app.inject({ method: request.method as 'GET', url: request.url ?? '/', headers }).then((reply) => {
      response.writeHead(reply.statusCode, { 'content-type': 'application/json' })
      response.end(reply.body)
    })
  })
  await new Promise<void>((done) => relay.listen(0, '127.0.0.1', done))
  api = `http://127.0.0.1:${String((relay.address() as AddressInfo).port)}`
  root = mkdtempSync(join(tmpdir(), 'mole-compaction-window-'))
  mkdirSync(join(root, 'bin'))
  for (const name of ['claude', 'codex', 'opencode']) {
    writeFileSync(join(root, 'bin', name), STAND_IN)
    chmodSync(join(root, 'bin', name), 0o755)
  }
}, 60_000)
afterAll(async () => {
  await new Promise<void>((done) => relay.close(() => done()))
  await app.close()
  t.close()
  rmSync(root, { recursive: true, force: true })
})
afterEach(() => {
  t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name IN (?, ?)').run(HOST, SANDBOX)
  delete process.env[HOST]
  delete process.env[SANDBOX]
})

/** A setting changed on the Settings page, as the person changes it. */
async function setTo(name: string, value: string) {
  return app.inject({ method: 'POST', url: '/api/office/settings', headers: AS_THE_PERSON, payload: { changes: [{ name, value }], because: 'A made-up reason for a test office' } })
}

/** The setting's line on the Settings page. */
async function theLine(name: string) {
  const settings = (await app.inject({ method: 'GET', url: '/api/office/settings', headers: AS_THE_PERSON })).json().settings as { name: string }[]
  return settings.find((one) => one.name === name) as Record<string, unknown> | undefined
}

async function until(check: () => boolean, what: string) {
  const end = Date.now() + 10_000
  while (Date.now() < end) { if (check()) return; await new Promise((done) => setTimeout(done, 20)) }
  throw new Error(`Waited ten seconds for ${what}`)
}

/**
 * ONE START ON THIS COMPUTER of `runtime`, through the real startModelRun, of the command its adapter begins with. A
 * Claude Code command carries the guard's --settings, as ClaudeCodeAdapter.commandFor gives it. The office is the relay,
 * or none when `asksTheOffice` is false. What the program was started with, and the start's words.
 */
async function aHostStart(runtime: 'claude-code' | 'codex' | 'opencode', model: string | null, asksTheOffice = true, from: Record<string, string> = {}) {
  const label = `host-${String(++sequence)}`
  const seenFile = join(root, `${label}.json`)
  const args = runtime === 'claude-code' ? ['-p', 'Synthetic: a made-up message.', '--output-format', 'json', ...(model === null ? [] : ['--model', model]), ...claudeCodeGuard(AGENT)]
    : runtime === 'codex' ? ['exec', '-m', model ?? 'gpt-6.1-sol', 'Synthetic: a made-up message.'] : ['run', 'Synthetic: a made-up message.']
  const command = runtime === 'claude-code' ? 'claude' : runtime
  const said = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const handle = await startModelRun({ runtime, commandFor: () => ({ command, args }) },
      { session: label, agent: AGENT, cwd: root, api: asksTheOffice ? api : '', workspace: WORKSPACE, outputPath: join(root, `${label}.out`) },
      { PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}`, HOME: root, SEEN_FILE: seenFile, ...from })
    await until(() => existsSync(seenFile) && existsSync(handle.exitCodePath!), `the stand-in ${command} to finish`)
    return { seen: JSON.parse(readFileSync(seenFile, 'utf8')) as Seen, words: handle.startWords ?? '' }
  } finally { said.mockRestore() }
}

/** The env of the first --settings of a Claude Code command, and the rest of that --settings. */
function theFirstSettings(argv: string[]) {
  const at = argv.indexOf('--settings')
  expect(at, JSON.stringify(argv)).toBeGreaterThanOrEqual(0)
  return JSON.parse(argv[at + 1]!) as { env?: Record<string, string>; hooks?: unknown }
}

/** The worker card's row in force, written as the person: a Claude Code row with its own settings, if any. */
async function aClaudeCodeRow(settings?: { name: string; value: unknown }[]) {
  const key = `${String(++sequence)}-${String(Date.now())}`
  const made = { model: `office-compacting-${key}`, native: `native-compacting-${key}`, effort: `effort-${key}` }
  const row = { program: { value: 'claude-code' }, model: { value: made.model }, effort: { value: made.effort },
    native: { model: made.native, provider: null, variant: null, ...(settings === undefined ? {} : { settings }) } }
  const taken = (await app.inject({ method: 'GET', url: `/api/casting/for/${THE_WORKER}?project=${WORKSPACE}`, headers: AS_THE_PERSON })).json() as { casting: { id: number } | null }
  const written = taken.casting === null
    ? await app.inject({ method: 'POST', url: `/api/casting/${THE_WORKER}`, headers: AS_THE_PERSON, payload: row })
    : await app.inject({ method: 'PATCH', url: `/api/casting/rows/${String(taken.casting.id)}`, headers: AS_THE_PERSON, payload: row })
  expect([200, 201], written.body).toContain(written.statusCode)
  const own = await app.inject({ method: 'POST', url: `/api/office/run-models/agent/${AGENT}`, headers: AS_THE_PERSON, payload: { model: made.model } })
  expect(own.statusCode, own.body).toBe(200)
  return { ...made, id: (written.json() as { casting: { id: number } }).casting.id }
}

describe('the two settings', () => {
  it('are on the Settings page, changed there with no restart, at their declared defaults', async () => {
    expect(ON_THE_HOST, 'the two defaults differ, or a start given the other place\'s setting could not be told').not.toBe(IN_A_SANDBOX)
    expect(await theLine(HOST)).toMatchObject({ writable: true, restartRequired: false, value: ON_THE_HOST })
    expect(await theLine(SANDBOX)).toMatchObject({ writable: true, restartRequired: false, value: IN_A_SANDBOX })
    const saved = await setTo(HOST, '650000')
    expect(saved.statusCode, saved.body).toBe(200)
    expect(await theLine(HOST)).toMatchObject({ value: '650000', source: 'the office database' })
    expect(await theLine(SANDBOX)).toMatchObject({ value: IN_A_SANDBOX })
  })

  it('refuse a number Claude Code does not take, in a plain sentence, and keep nothing', async () => {
    for (const name of [HOST, SANDBOX]) {
      for (const value of ['99999', '1000001', 'auto', '250000.5', '-300000']) {
        const refused = await setTo(name, value)
        expect(refused.statusCode, `${name} ${value}`).toBe(400)
        expect(refused.json().error, `${name} ${value}`).toBe(REFUSAL)
      }
      expect((await theLine(name))?.['source'], name).not.toBe('the office database')
      for (const value of ['100000', '1000000']) expect((await setTo(name, value)).statusCode, `${name} ${value}`).toBe(200)
    }
  })
})

describe('a Claude Code conversation started on this computer', () => {
  it('is given the host setting in its first --settings and its environment, from the next start after a change', async () => {
    const first = await aHostStart('claude-code', 'claude-opus-5-5', false)
    expect(first.seen.window).toBe(ON_THE_HOST)
    const settings = theFirstSettings(first.seen.argv)
    expect(settings.env).toEqual({ [VARIABLE]: ON_THE_HOST })
    // The guard's hook is still in the same --settings, and there is only the one.
    expect(settings.hooks).toEqual(JSON.parse(claudeCodeGuard(AGENT)[1]!).hooks)
    expect(first.seen.argv.filter((word) => word === '--settings')).toHaveLength(1)
    expect(first.words).toContain(`; compaction window ${ON_THE_HOST}, from ${HOST} (the built-in default)`)

    expect((await setTo(HOST, '650000')).statusCode).toBe(200)
    const next = await aHostStart('claude-code', 'claude-opus-5-5', false)
    expect(next.seen.window).toBe('650000')
    expect(theFirstSettings(next.seen.argv).env).toEqual({ [VARIABLE]: '650000' })
    expect(next.words).toContain(`; compaction window 650000, from ${HOST} (the office database)`)
    // The sandbox's setting is another one.
    expect((await setTo(SANDBOX, '300000')).statusCode).toBe(200)
    expect((await aHostStart('claude-code', 'claude-opus-5-5', false)).seen.window).toBe('650000')
  }, 30_000)

  it("keeps the number a Casting row names in its own settings, and otherwise says the host setting gave it", async () => {
    const plain = await aClaudeCodeRow()
    const given = await aHostStart('claude-code', plain.model)
    expect(given.seen.argv).toContain(plain.native)
    expect(given.seen.window).toBe(ON_THE_HOST)
    expect(theFirstSettings(given.seen.argv).env).toEqual({ [VARIABLE]: ON_THE_HOST })
    expect(given.words).toContain(`; compaction window ${ON_THE_HOST}, from ${HOST} (the built-in default)`)

    const own = await aClaudeCodeRow([{ name: `env.${VARIABLE}`, value: '400000' }])
    expect((await setTo(HOST, '650000')).statusCode).toBe(200)
    const kept = await aHostStart('claude-code', own.model)
    expect(kept.seen.argv).toContain(own.native)
    expect(theFirstSettings(kept.seen.argv).env).toEqual({ [VARIABLE]: '400000' })
    expect(kept.words).toContain(`; compaction window "400000", set by Casting row ${String(own.id)}`)
  }, 30_000)

  it("keeps the sandbox's window when the message worker that starts it runs in a sandbox", async () => {
    // tools/sandbox.mjs gave the worker SANDBOX_DIR and the sandbox's window. This office's host setting is another one.
    expect((await setTo(HOST, '650000')).statusCode).toBe(200)
    const inside = await aHostStart('claude-code', 'claude-opus-5-5', false, { SANDBOX_DIR: join(root, 'sandboxes'), [VARIABLE]: '210000' })
    expect(inside.seen.window).toBe('210000')
    expect(theFirstSettings(inside.seen.argv).env).toBeUndefined()
    expect(inside.words).not.toContain(HOST)
  }, 30_000)

  it('gives a Codex or an OpenCode conversation nothing', async () => {
    for (const runtime of ['codex', 'opencode'] as const) {
      const { seen, words } = await aHostStart(runtime, null, false)
      expect(seen.window, runtime).toBeNull()
      expect(seen.argv.join(' '), runtime).not.toContain(VARIABLE)
      expect(words, runtime).not.toContain('compaction window')
    }
  }, 30_000)

  it('is not started on a value Claude Code does not take, and no other number is used', async () => {
    process.env[HOST] = '99999'
    await expect(aHostStart('claude-code', 'claude-opus-5-5', false)).rejects.toThrow(
      `${HOST} is "99999", from the environment. ${THE_WINDOWS_IT_TAKES} No other number was used in its place. Nothing was started.`)
  })
})

describe('a Claude Code run in a sandbox', () => {
  const agent = 'synthetic-compacting-worker'
  const key = 'c5'.repeat(32)
  const starterKey = 'da'.repeat(32)
  let dir = '', worktree = '', officeApi = ''
  let office: Server
  const runs = new Map<string, { reads: number; title?: string; data?: Record<string, unknown> }>()
  const facts = () => ({
    instance: 'synthetic', template: 'synthetic', templateDir: join(dir, '..', 'template'),
    containerRow: 'synthetic-container', container: { name: 'synthetic-container', id: 'synthetic-container' },
    ref: 'main', from: worktree, workspace: WORKSPACE,
  })

  beforeAll(async () => {
    const sandboxes = join(root, 'sandboxes')
    dir = join(sandboxes, 'synthetic')
    worktree = join(dir, 'worktrees', agent)
    mkdirSync(worktree, { recursive: true })
    writeRoundStartRules(dir, worktree)
    for (const folder of ['bin', 'home', 'tmp', 'repo', 'briefs']) mkdirSync(join(dir, folder), { recursive: true })
    symlinkSync(join(process.cwd(), 'src'), join(dir, 'repo', 'src'))
    const tools = join(process.cwd(), 'tools'), theClones = join(dir, 'repo', 'tools')
    mkdirSync(theClones)
    for (const name of readdirSync(tools)) symlinkSync(join(tools, name), join(theClones, name))
    execFileSync('git', ['init', '-q', '-b', 'main', worktree])
    execFileSync('git', ['-C', worktree, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'synthetic'])
    mkdirSync(join(sandboxes, 'template'))
    writeFileSync(join(sandboxes, 'template', 'devcontainer.json'), '{}')
    writeFileSync(join(sandboxes, 'template', 'sandbox.json'), JSON.stringify({ template: 'synthetic' }))
    writeInstance(dir, facts())
    writeFileSync(join(dir, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
    writeFileSync(join(dir, 'bin', 'claude'), STAND_IN, { mode: 0o755 })
    // THE SANDBOX'S OWN CLAUDE CODE SETTINGS, as up wrote them before this round, with a window of its own and a
    // setting of the sandbox's own.
    mkdirSync(join(dir, 'home', '.claude'))
    writeFileSync(join(dir, 'home', '.claude', 'settings.json'), JSON.stringify({ env: { CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0', [VARIABLE]: '190000', SYNTHETIC_OWN: 'kept' }, synthetic: true }, null, 2))
    office = createServer(async (req, res) => {
      res.setHeader('content-type', 'application/json')
      const run = runs.get(req.url?.split('/').pop() ?? '')
      if (req.url === '/api/participants') {
        res.end(JSON.stringify({ agents: [{ id: agent, handle: agent, name: agent, record: 'synthetic-agent-record' }] }))
      } else if (req.method === 'GET' && req.url?.startsWith('/api/office/run-models/for/')) {
        const query = new URL(req.url, 'http://synthetic.invalid').searchParams
        const model = query.get('model') ?? 'synthetic-model'
        res.end(JSON.stringify({ model, effort: null, effortFrom: 'none', ...(query.has('model') ? {
          selection: { runtime: 'claude-code', model, native: { model, provider: null, variant: null, effort: null }, casting: null },
        } : {}) }))
      } else if (req.url === `/api/participants/agent/${agent}`) {
        res.end(JSON.stringify({ participant: { id: agent, handle: agent } }))
      } else if (req.url === '/api/kinds/session') {
        res.end(JSON.stringify({ kind: { fields: [{ key: 'adaptedTool' }] } }))
      } else if (req.method === 'POST' && req.url === '/api/records') {
        let body = ''
        for await (const chunk of req) body += String(chunk)
        const { title, data } = JSON.parse(body) as { title?: string; data?: Record<string, unknown> }
        const id = `verb-${String(++sequence)}`
        runs.set(id, { reads: 0, title, data })
        res.statusCode = 201
        res.end(JSON.stringify({ record: { id }, runKey: { key } }))
      } else if (req.method === 'POST' && req.url === `/api/agents/${agent}/hand-run`) {
        res.end('{"cut":null}')
      } else if (req.method === 'GET' && req.url === '/api/resources') {
        res.end('{"resources":[]}')
      } else if (req.url === '/api/toolset/uses') {
        res.statusCode = 201
        res.end('{}')
      } else if (req.method === 'GET' && req.url?.startsWith('/api/checks/')) {
        res.end(JSON.stringify(LEGACY_ROUND_CHAPTERS))
      } else if (req.method === 'PATCH' && run) {
        let body = ''
        for await (const chunk of req) body += String(chunk)
        run.data = { ...(run.data ?? {}), ...(JSON.parse(body) as { dataPatch: Record<string, unknown> }).dataPatch }
        res.end(JSON.stringify({ record: { kind: 'session', data: run.data } }))
      } else if (req.method === 'GET' && run) {
        const priorReads = run.reads
        if (req.headers['x-mole-office-session'] === req.url?.split('/').pop()) run.reads++
        res.end(JSON.stringify({ record: { kind: 'session', title: run.title, data: {
          ...run.data, state: run.data?.['state'] ?? (priorReads < (run.data ? 2 : 1) ? 'running' : 'finished'), servingAgent: agent, runtime: 'claude-code',
          workingDirectory: worktree, cutFrom: 'main', model: run.data?.['model'] ?? 'opus', served: { model: 'synthetic' },
          sandbox: { template: 'synthetic', container: 'synthetic-container', folder: dir },
        } } }))
      } else if (req.method === 'POST' && req.url === '/api/resources') {
        let body = ''
        for await (const chunk of req) body += String(chunk)
        const pgid = (JSON.parse(body) as { pidInContainer: number }).pidInContainer
        res.statusCode = 201
        res.end(JSON.stringify({ resource: { id: 'synthetic-process', key: String(pgid), pgid } }))
      } else if (req.url === '/api/health') res.end('{"synthetic":true}')
      else {
        res.statusCode = 404
        res.end('{"error":"No synthetic route"}')
      }
    })
    await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
    officeApi = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
    expect(thePortsATestKeepsOff()).not.toContain(Number(new URL(officeApi).port))
  }, 60_000)
  afterAll(async () => {
    await new Promise<void>((done) => office.close(() => done()))
  })

  /**
   * A worker started by the real host launcher through the docker stand-in, reading its settings from the test
   * database, or from its environment as well when `env` names one. How it ended, what it said, and what the stand-in
   * claude was started with.
   */
  async function aSandboxStart(env: Record<string, string> = {}) {
    const seenFile = join(dir, `sandbox-${String(++sequence)}.json`)
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ containers: {
      'synthetic-container': { Id: 'synthetic-container', State: { Running: true }, Mounts: [], Config: { Env: [
        `HOME=${join(dir, 'home')}`, `SEEN_FILE=${seenFile}`, `TMPDIR=${join(dir, 'tmp')}`,
        'CLAUDE_CODE_OAUTH_TOKEN=synthetic-login-for-the-stand-in-only',
      ] } },
    }, calls: [], bugs: {} }))
    writeFileSync(join(dir, 'brief.md'), 'Synthetic brief. No model call.\n')
    const child = spawn(process.execPath, ['tools/sandbox.mjs', 'worker', 'synthetic',
      '--sandboxes', join(root, 'sandboxes'), '--api', officeApi, '--workspace', WORKSPACE,
      '--as', 'synthetic-starter', '--session', 'synthetic-starter-session',
      '--agent', agent, '--brief', join(dir, 'brief.md'), '--runtime', 'claude-code', '--model', 'opus', '--json',
    ], { env: { ...withoutInheritedEffort(), HOME: join(dir, 'home'), MOLE_AGENT_KEY: starterKey,
      MOLE_OFFICE_COMMIT_EMAIL: 'synthetic@example.invalid', FAKE_DOCKER_DIR: dir, MOLE_OFFICE_DB: process.env['MOLE_OFFICE_DB']!,
      PATH: `${join(dir, 'bin')}:${process.env['PATH'] ?? ''}`, [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(facts()), ...env,
    } })
    let out = '', err = ''
    child.stdout.on('data', (chunk) => { out += String(chunk) })
    child.stderr.on('data', (chunk) => { err += String(chunk) })
    const code = await new Promise<number | null>((done) => child.on('close', done))
    if (code !== 0) return { code, err, started: existsSync(seenFile), seen: null, settings: null }
    const record = JSON.parse(out.trim()) as { run: string }
    const finished = join(dir, 'logs', record.run, 'finish.log')
    await expect.poll(() => existsSync(finished) && readFileSync(finished, 'utf8').includes('with no report'), { timeout: 20_000 }).toBe(true)
    const settings = JSON.parse(readFileSync(join(dir, 'home', '.claude', 'settings.json'), 'utf8')) as { env: Record<string, string>; synthetic?: boolean }
    // THE START'S WORDS, as the helper wrote them into the run's start.json.
    const words = (JSON.parse(readFileSync(join(dir, 'logs', record.run, 'start.json'), 'utf8')) as { startWords?: string }).startWords ?? ''
    return { code, err, started: true, seen: JSON.parse(readFileSync(seenFile, 'utf8')) as Seen, settings, words }
  }

  it("is given the sandbox setting in its environment and in the sandbox's own settings, from the next start after a change", async () => {
    const first = await aSandboxStart()
    expect(first.code, first.err).toBe(0)
    expect(first.seen!.window).toBe(IN_A_SANDBOX)
    expect(first.settings!.env[VARIABLE]).toBe(IN_A_SANDBOX)
    // The start's words name the sandbox setting, which the launcher read on the host, and not the host's.
    expect(A_SANDBOX_STARTS_WINDOW_FROM.startsWith(`${SANDBOX}, `), A_SANDBOX_STARTS_WINDOW_FROM).toBe(true)
    expect(first.words).toContain(`; compaction window ${IN_A_SANDBOX}, from ${A_SANDBOX_STARTS_WINDOW_FROM}`)
    expect(first.words).not.toContain("the command's environment")

    expect((await setTo(SANDBOX, '300000')).statusCode).toBe(200)
    expect((await setTo(HOST, '650000')).statusCode).toBe(200)
    const next = await aSandboxStart()
    expect(next.code, next.err).toBe(0)
    expect(next.seen!.window).toBe('300000')
    expect(next.words).toContain(`; compaction window 300000, from ${A_SANDBOX_STARTS_WINDOW_FROM}`)
    // Brought up to date at this start, with no up, and nothing else in the file changed.
    expect(next.settings).toMatchObject({ env: { CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0', [VARIABLE]: '300000', SYNTHETIC_OWN: 'kept' }, synthetic: true })
  }, 90_000)

  it('is not started on a value Claude Code does not take, no other number is used, and no run is filed', async () => {
    const filed = runs.size
    const refused = await aSandboxStart({ [SANDBOX]: 'auto' })
    expect(refused.code, refused.err).toBe(1)
    expect(refused.started).toBe(false)
    expect(runs.size).toBe(filed)
    // The launcher prints the first sentence, and the whole of it is in the start's details.
    const said = /^sandbox: (.*) Details: (\S+)$/m.exec(refused.err.split('\n').find((line) => line.includes(SANDBOX)) ?? '')
    expect(said?.[1], refused.err).toBe(`${SANDBOX} is "auto", from the environment.`)
    expect(readFileSync(said![2]!, 'utf8')).toContain(`sandbox: ${SANDBOX} is "auto", from the environment. ${THE_WINDOWS_IT_TAKES} No other number was used in its place. Nothing was started.\n`)
  }, 60_000)
})

describe('a Claude Code run the dispatch worker starts', () => {
  let served = ''
  beforeAll(async () => {
    // The worker sends bodies, which the relay does not carry, so the office listens on a free port of its own.
    await app.listen({ host: '127.0.0.1', port: 0 })
    served = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
    expect(thePortsATestKeepsOff()).not.toContain(Number(new URL(served).port))
  })

  /** As the person, through the office's doors. */
  async function asThePerson(url: string, payload?: unknown) {
    const reply = await app.inject({ method: 'POST', url, headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, ...(payload === undefined ? {} : { payload: payload as never }) })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBeLessThan(300)
    return reply.json() as Record<string, any>
  }

  /**
   * ONE RUN QUEUED for `recipient`, a new agent unless it names one, and taken once by the real tools/agent-worker.mjs,
   * started with --model `model`, which reads the settings from the test database. Its environment is the test's,
   * without the sandbox this test may itself run in, and with `from` over it. How the worker ended, what it said, how
   * the run ended, and what the stand-in claude was started with.
   */
  async function aWorkerStart(from: Record<string, string> = {}, model = 'claude-opus-5-5', recipient: Record<string, string> = { kind: 'new' }) {
    const seenFile = join(root, `worker-${String(++sequence)}.json`)
    const thread = (await asThePerson('/api/agent/threads', { title: 'Synthetic: a made-up thread', mode: 'direct' }))['thread'].id as string
    await asThePerson(`/api/agent/threads/${thread}/messages`, { intent: 'discuss', body: 'Synthetic: a made-up message.', recipient })
    const run = ((await asThePerson(`/api/agent/threads/${thread}/dispatch`))['runs'] as { id: string }[])[0]!.id
    // A made-up HOSTNAME, since the worker names itself by it in what it prints.
    const env: NodeJS.ProcessEnv = { ...withoutInheritedEffort(), HOME: root, HOSTNAME: 'synthetic-host', PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}`, SEEN_FILE: seenFile }
    for (const name of [THE_SANDBOX_VARIABLE, VARIABLE, HOST, SANDBOX]) delete env[name]
    const child = spawn(process.execPath, ['tools/agent-worker.mjs', '--once', '--api', served, '--model', model, '--limit', '20000'],
      { env: { ...env, ...from }, stdio: ['ignore', 'pipe', 'pipe'] })
    let said = ''
    child.stdout.on('data', (chunk) => { said += String(chunk) })
    child.stderr.on('data', (chunk) => { said += String(chunk) })
    const code = await new Promise<number | null>((done) => child.on('close', done))
    const row = t.client.sqlite.prepare('SELECT state, error FROM agent_runs WHERE id = ?').get(run) as { state: string; error: string | null }
    return { code, said, row, seen: existsSync(seenFile) ? JSON.parse(readFileSync(seenFile, 'utf8')) as Seen : null }
  }

  it('is given the host setting in its first --settings and its environment, and its words say where it came from', async () => {
    const first = await aWorkerStart()
    expect(first.code, first.said).toBe(0)
    expect(first.row.state, `${String(first.row.error)}\n${first.said}`).toBe('finished')
    expect(first.seen!.window).toBe(ON_THE_HOST)
    expect(theFirstSettings(first.seen!.argv).env).toEqual({ [VARIABLE]: ON_THE_HOST })
    expect(first.said).toContain(`; compaction window ${ON_THE_HOST}, from ${HOST} (the built-in default)`)

    expect((await setTo(HOST, '650000')).statusCode).toBe(200)
    expect((await setTo(SANDBOX, '300000')).statusCode).toBe(200)
    const next = await aWorkerStart()
    expect(next.row.state, `${String(next.row.error)}\n${next.said}`).toBe('finished')
    expect(next.seen!.window).toBe('650000')
    expect(theFirstSettings(next.seen!.argv).env).toEqual({ [VARIABLE]: '650000' })
    expect(next.said).toContain(`; compaction window 650000, from ${HOST} (the office database)`)
  }, 60_000)

  it("says the host setting gave the window when a Casting row's selection words its start", async () => {
    // The row names no window of its own, so its selection's words name the window by where the worker says it came from.
    const row = await aClaudeCodeRow()
    expect((await setTo(HOST, '650000')).statusCode).toBe(200)
    const cast = await aWorkerStart({}, row.model, { kind: 'agent', agentId: agentRecord })
    expect(cast.row.state, `${String(cast.row.error)}\n${cast.said}`).toBe('finished')
    expect(cast.seen!.argv).toContain(row.native)
    expect(cast.seen!.window).toBe('650000')
    expect(theFirstSettings(cast.seen!.argv).env).toEqual({ [VARIABLE]: '650000' })
    expect(cast.said).toContain(`; compaction window 650000, from ${HOST} (the office database)`)
  }, 60_000)

  it("keeps the sandbox's window when the worker runs in a sandbox", async () => {
    expect((await setTo(HOST, '650000')).statusCode).toBe(200)
    const inside = await aWorkerStart({ [THE_SANDBOX_VARIABLE]: join(root, 'sandboxes'), [VARIABLE]: '210000' })
    expect(inside.row.state, `${String(inside.row.error)}\n${inside.said}`).toBe('finished')
    expect(inside.seen!.window).toBe('210000')
    expect(inside.seen!.argv).not.toContain('--settings')
    expect(inside.said).not.toContain(HOST)
  }, 60_000)

  it('does not start a run on a value Claude Code does not take, and the run says why', async () => {
    const refused = await aWorkerStart({ [HOST]: '99999' })
    expect(refused.code, refused.said).toBe(0)
    expect(refused.seen).toBeNull()
    expect(refused.row.state).toBe('failed')
    expect(refused.row.error).toBe(`${HOST} is "99999", from the environment. ${THE_WINDOWS_IT_TAKES} No other number was used in its place. Nothing was started.`)
  }, 60_000)
})
