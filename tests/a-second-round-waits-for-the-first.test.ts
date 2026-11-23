// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { deliveredRoundBrief, RULE_FILES } from '../src/shared/round-chapters/manifest.ts'
import { ROUND_START_RULES } from './round-chapters-fixture.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * Worker and round start paths, using a throwaway office and synthetic container and runtime programs.
 * Successful starts check direct runtime commands, copied briefs, run identity, worktrees and continuation links.
 * A second start stays held while the agent's earlier run is alive, including a run absent from the host's list.
 * Unsafe secrets files are refused before filing or starting a worker. Key and runtime login cases keep their starts.
 * Brief, provider and thread-output variants call the actual checks directly, compiled by name without the CLI.
 * A forged start file cannot choose a continuation from the host's list. Integration cases still verify that the
 * selected run belongs to this agent, runtime and sandbox, and that its native conversation is held there.
 * Main refresh cases use separate fixture clones. Every runtime is synthetic; no model or real container starts.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { runInNewContext } from 'node:vm'
import { createHash, randomUUID } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { constants as fsConstants, openSync, closeSync, fstatSync, statSync, readSync, chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { theCodexRolloutFor } from '../src/config/codex-log.mjs'
import { CODEX_SHELL_SNAPSHOT_OFF } from '../src/config/run-permissions.mjs'
import { spoolAGateMet } from '../src/config/gate-count-spool.mjs'
import { clockStamp, momentOfAnInstant, nowStamp } from '../src/shared/time.ts'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'
import { FAKE_DF, FAKE_FREE, FAKE_DU, FAKE_DEVCONTAINER, FAKE_DOCKER, aFakeNpm, aMadeUpPackage, startsOf, theFakeMachine, theFakeState, theNpmCalls } from './sandbox-stand-ins.ts'
import { LAUNCHER_MODEL_COMPATIBILITY, THE_MODELS_START_VALUES, THE_RUNTIMES_FAST_MODE } from '../src/config/model-efforts.mjs'
import { CLAUDE_CODE_FEATURES_OFF, CODEX_FEATURES_OFF, THE_STARTING_WORDS } from '../tools/harness-features-off.mjs'
import { theHostOnlyFolder } from '../tools/sandbox-common.mjs'
import * as sandboxGit from '../tools/sandbox-git.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
/** The provider each runtime's own program runs, read from the one data file that says it. */
const THE_DATA = JSON.parse(readFileSync(join(REPO, 'src/config/runtime-native-providers.json'), 'utf8')) as Record<string, { provider: string | null }>
const THE_PROVIDERS = Object.fromEntries(Object.entries(THE_DATA).flatMap(([runtime, entry]) => (typeof entry.provider === 'string' ? [[runtime, entry.provider]] : []))) as Record<string, string>

// THE OFFICE TOOL'S FLAG (problem rgAmP45EklqO): the configuration lies in a folder made for it alone in the helper's
// temporary directory, so its name is new on every start, and it is never under logs/.
const AN_MCP_FLAG = expect.stringMatching(/^--mcp-config=\/.+\/office-mcp-[^/]+\/office-mcp\.json$/)
// A worker's or a round's brief starts with the words that say the harness's own subagents and workflows are off.
const withTheStartingWords = (brief: string) => `${THE_STARTING_WORDS}\n\n---\n\n${brief}`
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const STARTER = 'round-starter'
const WORKER = 'round-worker'
const NOBODY = 'round-nobody-registered'
/** The model the office gives the worker, set on its profile. A name of this test's own, so no default can match it. */
const OFFICE_MODEL = 'the-workers-own-model'
/** A model the compatibility list holds, for the old-helper start a shell cannot give a selection. */
const A_KNOWN_MODEL = Object.keys(THE_MODELS_START_VALUES)[0]!
const NAME = 'rounds'
const CODEX_WORKER = 'codex-round-worker'
const CODEX_MODEL = 'openai/the-codex-model'
const CODEX_THREAD = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
const CODEX_SECOND_THREAD = '11111111-2222-4333-8444-555555555555'
const CODEX_UNHELD_THREAD = '33333333-4444-4555-8666-777777777777'
const codexIsFast = THE_RUNTIMES_FAST_MODE.codex
const theFastFlag = codexIsFast ? ['-c', 'service_tier=fast'] : []

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

let t: TestDb
let res: ResourcesLib
let app: FastifyInstance
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let secrets = ''
let dir = ''
let starterSession = ''
let starterKey = ''
/** The worker's first run, filed by `worker` in case 3. */
let firstRun = ''
/** The worker's second run, filed by `round` in case 5. */
let secondRun = ''

/** Every process group a test started, stopped at the end if its leader still works in the scratch. */
const groups = new Set<number>()

/**
 * THE FIRST LINE OF EVERY COMMAND A CASE STARTS. The command writes down its own pid and its parent's in the fakes
 * folder. The gate keeps its pid when it becomes the command, so the first number is the host pid that start.json
 * names. The second is the background copy of tools/sandbox-start.mjs that waits on the command, which no file names.
 * afterAll stops that copy by this line, so it need not read the machine's other processes to find it.
 */
const RECORDS_ITS_PARENT = String.raw`require('fs').appendFileSync(require('path').join(__dirname, '..', 'parents'), process.pid + ' ' + process.ppid + '\n')`
/** A command that does nothing else and ends at once, as `true` does. */
const ENDS_AT_ONCE = 'ends-at-once'

/**
 * A `claude` THAT RUNS NO MODEL. It writes what it was given (its arguments, its environment, its folder and the brief
 * on its standard input) into the sandbox's out/, named after its run, and keeps running when the brief says so.
 *
 * IT PUTS THAT RECORD IN PLACE WHOLE (problem GdygGA7oIR0k). On 30 September 2026 a whole-tree run under load read the
 * file while the stand-in was still writing it, and failed on "Unexpected end of JSON input". So the record is written
 * under a name nothing reads, in two halves 200 ms apart, as a slow disk would write it, and only then renamed to its
 * own name. The pause is what makes the proof certain: it is ten of until()'s polls, so a stand-in writing straight to
 * its own name is caught half-way.
 */
const FAKE_CLAUDE = String.raw`#!/usr/bin/env node
${RECORDS_ITS_PARENT}
const fs = require('fs')
const brief = fs.readFileSync(0, 'utf8')
const record = process.env.SANDBOX_DIR + '/out/claude-' + process.env.MOLE_OFFICE_SESSION + '.json'
const whole = JSON.stringify({ argv: process.argv.slice(2), env: process.env, cwd: process.cwd(), brief })
const half = Math.floor(whole.length / 2)
fs.writeFileSync(record + '.part', whole.slice(0, half))
setTimeout(() => {
  fs.appendFileSync(record + '.part', whole.slice(half))
  fs.renameSync(record + '.part', record)
  if (brief.includes('KEEP RUNNING')) setInterval(() => {}, 1000)
}, 200)
`

/**
 * Synthetic Codex events and a record of its argv and of the brief on its standard input; this program never calls a model. Like Codex, it leaves the thread's
 * rollout in the sandbox's own Codex home, `.codex/sessions/<Y>/<M>/<D>/` in the sandbox's home, named after the thread.
 * The rollout is synthetic and says so in its one line. A brief that says UNHELD THREAD gets a thread of its own and
 * leaves no rollout for it, as a thread kept in some other home would be.
 */
const FAKE_CODEX = String.raw`#!/usr/bin/env node
${RECORDS_ITS_PARENT}
const fs = require('fs')
const argv = process.argv.slice(2)
const brief = fs.fstatSync(0).isFile() ? fs.readFileSync(0, 'utf8') : ''
const record = process.env.SANDBOX_DIR + '/out/codex-' + process.env.MOLE_OFFICE_SESSION + '.json'
fs.writeFileSync(record + '.part', JSON.stringify({ argv, brief, cwd: process.cwd(), env: process.env }))
fs.renameSync(record + '.part', record)
const thread = brief.includes('UNHELD THREAD') ? '33333333-4444-4555-8666-777777777777' : brief.includes('SECOND THREAD') ? '11111111-2222-4333-8444-555555555555' : '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
if (!brief.includes('UNHELD THREAD')) {
  const day = require('path').join(process.env.SANDBOX_DIR, 'home', '.codex', 'sessions', '2026', '10', '17')
  fs.mkdirSync(day, { recursive: true })
  fs.writeFileSync(day + '/rollout-2026-10-17T00-00-00-' + thread + '.jsonl', JSON.stringify({ type: 'session_meta', payload: { id: thread, synthetic: true } }) + '\n')
}
process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: thread }) + '\n')
if (brief.includes('KEEP RUNNING')) setInterval(() => {}, 1000)
else process.stdout.write(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 7, cached_input_tokens: 2, output_tokens: 3 } }) + '\n')
`

interface Ran {
  status: number
  out: string
  err: string
}

/**
 * THE CASTING ROW THE NEXT START NEEDS. This office attaches the launcher's native selection only from a row whose
 * program and model are the run's, so the models this test invented are now data on the marked worker row. A known
 * model keeps the compatibility data. When the row already names the start's program and model, only its native data
 * changes, so the decision behind the model stays.
 */
async function keepTheCastingRowFor(runtime: string, model: string): Promise<void> {
  if (Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, model)) return
  // A Codex command takes an OpenAI model and one word after the provider, and the test's refusal of another
  // provider's model on Codex must stay a refusal, not become a row the office can select.
  if (runtime === 'codex' && !/^openai\/[^/]+$/.test(model)) return
  const native = { model: model.slice(model.lastIndexOf('/') + 1), provider: null, variant: null }
  const asThePerson = { type: 'human', id: THE_TEST_OFFICES_OWNER.id }
  const current = await ask('GET', `/api/casting/for/worker?project=${WORKSPACE}`, undefined, asThePerson)
  expect(current.status, JSON.stringify(current.body)).toBeLessThan(300)
  const row = current.body?.casting as { id: number; cells?: { program?: { value: string | null }; model?: { value: string | null } } } | null
  if (row === null || row === undefined) {
    const made = await ask('POST', '/api/casting/worker', { program: { value: runtime }, model: { value: model }, native }, asThePerson)
    expect(made.status, JSON.stringify(made.body)).toBe(201)
  } else if (row.cells?.program?.value === runtime && row.cells?.model?.value === model) {
    const changed = await ask('PATCH', `/api/casting/rows/${String(row.id)}`, { native }, asThePerson)
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
  } else {
    const changed = await ask('PATCH', `/api/casting/rows/${String(row.id)}`, { program: { value: runtime }, model: { value: model }, native }, asThePerson)
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
  }
}

/** The runtime a start names, from --runtime or the agent's own row. */
async function theStartsRuntime(args: string[]): Promise<string> {
  const at = args.indexOf('--runtime')
  if (at !== -1) return args[at + 1]!
  const agent = args[args.indexOf('--agent') + 1]!
  const listed = await ask('GET', '/api/participants')
  const row = ((listed.body?.agents ?? []) as { handle: string; runtime: string | null }[]).find((one) => one.handle === agent)
  return row?.runtime ?? 'claude-code'
}

/**
 * The model a start names, or the one the office says the agent gets for that runtime. An answer the office
 * merely falls back to (its settings file, or no model at all) is not a choice for the start, so it names none.
 */
async function theStartsModel(args: string[], runtime: string): Promise<string | null> {
  const at = args.indexOf('--model')
  if (at !== -1) return args[at + 1]!
  const agent = args[args.indexOf('--agent') + 1]!
  const read = await ask('GET', `/api/office/run-models/for/${encodeURIComponent(agent)}?place=builder&runtime=${encodeURIComponent(runtime)}`)
  if (read.status !== 200) return null
  if (read.body?.from !== 'the agent' && read.body?.from !== 'the role') return null
  return typeof read.body?.model === 'string' && read.body.model !== '' ? read.body.model : null
}

/**
 * RUN THE TOOL AS ITS OWN PROCESS, WITHOUT BLOCKING, as the starter. Who is asking comes from the environment, as it
 * does for an agent at its terminal: MOLE_OFFICE_AGENT and MOLE_OFFICE_SESSION are the starter's. `more` is added last,
 * for a wait a case shortens. `keepsTheRow` false leaves the casting row as a start before this one kept it.
 */
async function sandbox(args: string[], key: string | null = null, more: NodeJS.ProcessEnv = {}, keepsTheRow = true): Promise<Ran> {
  // A round with no --model continues the run before, whose start already put its model on the row.
  if (keepsTheRow && args.includes('--agent') && !(args[0] === 'round' && !args.includes('--model'))) {
    const runtime = await theStartsRuntime(args)
    const model = await theStartsModel(args, runtime)
    if (model !== null) await keepTheCastingRowFor(runtime, model)
  }
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
    FAKE_DOCKER_DIR: fakes,
    MOLE_OFFICE_AGENT: STARTER,
    MOLE_OFFICE_SESSION: starterSession,
    MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
    ...more,
  }
  if (key === null) delete env['MOLE_AGENT_KEY']
  else env['MOLE_AGENT_KEY'] = key
  const cut = args.indexOf('--')
  const before = cut === -1 ? args : args.slice(0, cut)
  const after = cut === -1 ? [] : args.slice(cut)
  return new Promise((done) => {
    const child = spawn(process.execPath, [TOOL, ...before, '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE, ...after], { env, detached: true })
    if (child.pid !== undefined) groups.add(child.pid)
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('close', (code) => done({ status: code ?? 1, out, err }))
  })
}

async function ask(method: string, path: string, body?: unknown, actor: { type: string; id: string } = { type: 'agent', id: STARTER }): Promise<{ status: number; body: any }> {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': actor.type,
      'x-mole-office-actor-id': actor.id,
      ...(actor.type === 'agent' && starterSession !== '' ? { 'x-mole-office-session': starterSession } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

async function until(what: string, check: () => boolean | Promise<boolean>, ms = 20_000): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`waited ${ms} ms for ${what}`)
}

/** Release a process row as its starter: force, because its run is running, and the sentence sent back. */
async function releaseRow(id: string): Promise<{ status: number; body: any }> {
  const first = await ask('POST', `/api/resources/${id}/release`, { force: true })
  if (first.status !== 400) return first
  const phrase = /Send the sentence back as \{"expect": "\.\.\."\}: "([\s\S]+)"$/.exec(String(first.body.error))?.[1]
  return ask('POST', `/api/resources/${id}/release`, { force: true, expect: phrase })
}

/** How many times the fake docker was asked to exec something. Nothing is filed or started without one. */
function execCalls(): number {
  return theFakeState(fakes).calls.filter((c) => c.tool === 'docker' && c.argv[0] === 'exec').length
}

/** What the stand-in claude of one run wrote down, once it has. */
async function whatClaudeWasGiven(run: string): Promise<{ argv: string[]; env: Record<string, string>; cwd: string; brief: string }> {
  const file = join(dir, 'out', `claude-${run}.json`)
  await until(`the stand-in claude of run ${run} to write what it was given`, () => existsSync(file))
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** The data of a run's record as it was created, its first revision, and who filed it, before anything else wrote to it. */
async function theRunAsFiled(run: string): Promise<{ data: Record<string, unknown>; by: unknown }> {
  const first = await ask('GET', `/api/records/${run}/revisions/1`)
  expect(first.status, JSON.stringify(first.body)).toBe(200)
  const data = (first.body?.content?.data ?? {}) as Record<string, unknown>
  expect(data['servingAgent'], `the first revision of run ${run} holds no run: ${JSON.stringify(first.body).slice(0, 500)}`).toBe(WORKER)
  // THE SESSION THE CREATE WAS FILED UNDER, said as which one it is, so three runs can be compared.
  const who = first.body?.who ?? {}
  const session = who.sessionId === run ? 'the run itself' : who.sessionId === starterSession ? "the starter's" : who.sessionId
  return { data, by: { actorType: who.actorType, actor: who.actorId, session } }
}

/** The use lines on the starter's run, as the use door wrote them, oldest first. Read with the uses door (round 33). */
async function theStartersUseLines(): Promise<{ tool: string; said: string }[]> {
  const page = await ask('GET', `/api/toolset/runs/${starterSession}/uses?limit=500`)
  expect(page.status, JSON.stringify(page.body)).toBe(200)
  return ((page.body?.uses ?? []) as { tool: string; said: string }[]).map(({ tool, said }) => ({ tool, said })).reverse()
}

/** A keyless starter prints its exact line in the launch log, and the office has no such use. */
async function expectAnUnsentUse(run: string, said: string): Promise<void> {
  const details = readFileSync(join(dir, 'logs', run, 'launch.txt'), 'utf8')
  expect(details).toContain('Nothing was sent.')
  expect(details).toContain('POST /api/toolset/uses')
  const bodies = details.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line) as unknown)
  expect(bodies).toContainEqual({ tool: 'sandbox', said })
  expect(await theStartersUseLines()).not.toContainEqual({ tool: 'sandbox', said })
}

let fixtureOrigin = ''
let fixtureTemplate = ''

const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-second-round-'))
  sandboxes = join(scratch, 'sandboxes')
  fakes = join(scratch, 'fakes')
  secrets = join(scratch, 'sandbox-secrets.env')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'npm'), aFakeNpm(fakes), { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'claude'), FAKE_CLAUDE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'codex'), FAKE_CODEX, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'dsh'), '#!/usr/bin/env node\n' + RECORDS_ITS_PARENT + '\nprocess.stdout.write("Synthetic dsh ended.\\n")\n', { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', ENDS_AT_ONCE), '#!/usr/bin/env node\n' + RECORDS_ITS_PARENT + '\n', { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))

  // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/, so the clone inside runs the helper under
  // test, and the two folders the template covers.
  const main = join(scratch, 'main')
  fixtureOrigin = main
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  // Round CODE is genuinely in its checkout: a source symlink would resolve outside this sandbox. So src/config is
  // copied, and the other src folders are linked as tools/ is, since a start reads nothing else of a checkout's src.
  mkdirSync(join(main, 'src'))
  cpSync(join(REPO, 'src', 'config'), join(main, 'src', 'config'), { recursive: true })
  for (const name of readdirSync(join(REPO, 'src'))) {
    if (name !== 'config') symlinkSync(join(REPO, 'src', name), join(main, 'src', name))
  }
  writeFileSync(join(main, 'src/config/rules/CODE.md'), '# Synthetic code\n\n## Chapter 5 — Synthetic tests\nSynthetic chapter text.\n')
  writeFileSync(join(main, 'README.md'), 'a checkout for the second-round test\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's files, with the secrets file in this test's scratch.
  const template = join(scratch, 'template')
  fixtureTemplate = template
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8'))
  office.secrets.hostFile = secrets
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))

  // THE PEOPLE: the secretary who starts the worker from the host, and the worker it registered. NOBODY is never
  // registered. Only the secretary names a sandbox on a run filed from the host
  // (tests/a-run-names-only-the-sandbox-it-was-filed-from.test.ts).
  const made = await ask('POST', '/api/agents/started', { handle: STARTER, name: STARTER, role: 'secretary' }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  starterKey = String(made.body.whatToGiveIt?.key ?? '')
  expect(starterKey).not.toBe('')
  const worker = await ask('POST', '/api/agents/started', { handle: WORKER, name: WORKER, role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  expect(worker.status, JSON.stringify(worker.body)).toBe(201)
  const codexWorker = await ask('POST', '/api/agents/started', { handle: CODEX_WORKER, name: CODEX_WORKER, role: 'worker', runtime: 'codex', workArea: ['src'] })
  expect(codexWorker.status, JSON.stringify(codexWorker.body)).toBe(201)
  const codexModel = await ask('POST', `/api/office/run-models/agent/${CODEX_WORKER}`, { model: CODEX_MODEL }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  expect(codexModel.status, JSON.stringify(codexModel.body)).toBeLessThan(300)
  // THE WORKER'S OWN MODEL, set on its profile through the office's door (criterion U2). worker is given no
  // --model below, so the model on its command line can only have come from the office.
  const model = await ask('POST', `/api/office/run-models/agent/${WORKER}`, { model: OFFICE_MODEL }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  expect(model.status, JSON.stringify(model.body)).toBeLessThan(300)
  // FILED WITH THE STARTER'S OWN KEY, as its session hook files it. The keyed cases send this run with that key, and a
  // key holds only a run its agent filed for itself with a key (src/server/lib/the-run-a-key-holds.ts).
  const mine = await fetch(`${api}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': STARTER, 'x-mole-office-key': starterKey },
    body: JSON.stringify({ kind: 'session', title: 'the supervisor run', data: { state: 'running' } }),
  })
  expect(mine.status).toBe(201)
  starterSession = ((await mine.json()) as { record: { id: string } }).record.id
  // THE TOOL ENTRY A USE LINE NAMES. The use door refuses a slug no live tool in the project has.
  const category = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'tool_category', title: 'Developing the office', data: { says: 'Builders.' }, actor: { type: 'agent', id: STARTER } }).id
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'tool',
    title: 'Sandbox containers',
    data: { entry: 'tool', slug: 'sandbox', forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' },
    actor: { type: 'agent', id: STARTER },
  })

  const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--no-dsh', '--json'])
  expect(up.status, up.err).toBe(0)
  dir = JSON.parse(up.out.trim()).folder
  writeFileSync(join(dir, 'briefs/LINE-common.md'), '# Synthetic common\nSynthetic local rules.\n')
  writeFileSync(join(dir, 'briefs/TERRITORIES.md'), '# Synthetic territories\nSynthetic territory rules.\n')
}, 120_000)

afterAll(async () => {
  // ONLY WHAT THIS FILE STARTED IS STOPPED, by the groups it recorded, and no other process on the machine is read to
  // find them. They are the tool's own groups (sandbox() above), the command of every start.json in the sandboxes this
  // file made, and the background copy that waits on each of those commands, as the command wrote it down
  // (RECORDS_ITS_PARENT). A command can be stopped before its first line has run, so that line is waited for a while.
  // A start whose command never wrote it fails the file, because its background copy may still be running.
  const starts = (sandboxes !== '' && existsSync(sandboxes) ? readdirSync(sandboxes) : []).flatMap((one) => startsOf(join(sandboxes, one)))
  const parents = (): Map<number, number> =>
    new Map((existsSync(join(fakes, 'parents')) ? readFileSync(join(fakes, 'parents'), 'utf8') : '').split('\n').filter((line) => line !== '')
      .map((line) => line.split(' ').map(Number) as [number, number]))
  const unwritten = (): number[] => starts.map((start) => start.hostPid).filter((pid) => !parents().has(pid))
  for (const end = Date.now() + 5_000; unwritten().length > 0 && Date.now() < end;) await new Promise((r) => setTimeout(r, 200))
  const neverWritten = unwritten()
  for (const start of starts) {
    groups.add(start.hostPgid)
    const parent = parents().get(start.hostPid)
    if (parent !== undefined) groups.add(parent)
  }
  for (const group of groups) {
    if (group <= 1 || group === process.pid) continue
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
  expect(neverWritten, 'a started command never wrote down its parent, so its background copy may still be running').toEqual([])
})

describe('worker and round', () => {
  it('worker refuses a handle that is not a registered agent, names the tool that registers one, and files nothing', async () => {
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    const brief = join(scratch, 'nobody.md')
    writeFileSync(brief, '# A brief for nobody\n')
    const before = execCalls()
    const ran = await sandbox(['worker', NAME, '--verbose', '--agent', NOBODY, '--brief', brief])
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain(`No agent is registered as "${NOBODY}"`)
    expect(ran.err).toContain('node tools/register-a-started-agent.mjs --handle round-nobody-registered')
    expect(execCalls(), 'something was started in the sandbox').toBe(before)
    expect(existsSync(join(dir, 'worktrees', NOBODY))).toBe(false)
  }, 60_000)

  it('worker refuses a sandbox with no Claude Code login, and files nothing', async () => {
    rmSync(secrets, { force: true })
    const brief = join(scratch, 'first.md')
    writeFileSync(brief, '# The first round\nKEEP RUNNING until you are stopped.\n')
    const before = execCalls()
    const ran = await sandbox(['worker', NAME, '--verbose', '--agent', WORKER, '--brief', brief])
    expect(ran.status, ran.err).toBe(1)
    expect(ran.err).toContain(`The sandbox ${NAME} has no Claude Code login`)
    expect(ran.err).toContain('CLAUDE_CODE_OAUTH_TOKEN')
    expect(execCalls(), 'something was started in the sandbox').toBe(before)
    expect(existsSync(join(dir, 'worktrees', WORKER))).toBe(false)
  }, 60_000)

  it("worker starts claude directly with MCP, the model and the permission mode in its own worktree, with its run's identity and not the starter's", async () => {
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    const ran = await sandbox(['worker', NAME, '--agent', WORKER, '--brief', join(scratch, 'first.md'), '--json'])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    firstRun = start.run
    expect(firstRun).toMatch(/\S/)
    expect(firstRun).not.toBe(starterSession)

    // THE COMMAND, in its own worktree, with the brief copied into the sandbox.
    const worktree = join(dir, 'worktrees', WORKER)
    expect(start.agent).toBe(WORKER)
    expect(start.cwd).toBe(worktree)
    expect(start.startedBy).toEqual({ agent: STARTER, session: starterSession })
    const brief = String(start.stdin)
    expect(brief.startsWith(join(dir, 'briefs'))).toBe(true)
    expect(start.command).toEqual(['claude', AN_MCP_FLAG, ...CLAUDE_CODE_FEATURES_OFF, '--permission-mode', 'bypassPermissions', '-p', '--model', OFFICE_MODEL, '--output-format', 'json'])
    const given = await whatClaudeWasGiven(firstRun)
    expect(given.argv).toEqual(start.command.slice(1))
    expect(given.brief).toBe(withTheStartingWords('# The first round\nKEEP RUNNING until you are stopped.\n'))
    expect(given.cwd).toBe(worktree)
    expect(git(worktree, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(WORKER)

    // ITS OWN IDENTITY: the run's agent and the run's session, and nothing of the starter's.
    expect(given.env['MOLE_OFFICE_AGENT']).toBe(WORKER)
    expect(given.env['MOLE_OFFICE_SESSION']).toBe(firstRun)
    for (const [name, value] of Object.entries(given.env)) {
      expect(value, `${name} carries the starter's session`).not.toBe(starterSession)
      expect(value, `${name} carries the starter's name`).not.toBe(STARTER)
    }

    // THE RUN: filed by the starter, as its child, serving the worker, in this sandbox.
    const record = (await ask('GET', `/api/records/${firstRun}`)).body.record
    expect(record.data).toMatchObject({
      state: 'running',
      runtime: 'claude-code',
      model: OFFICE_MODEL,
      servingAgent: WORKER,
      parentAttachment: starterSession,
      workingDirectory: worktree,
      cutFrom: 'main',
    })
    expect(record.data.sandbox?.folder).toBeDefined()
    // WHAT IT DID, in words.
    expect(readFileSync(join(dir, 'logs', firstRun, 'launch.txt'), 'utf8')).toContain(`worker: run ${firstRun} of ${WORKER} is started in sandbox ${NAME}`)
    await expectAnUnsentUse(firstRun, `worker: run ${firstRun} was filed for ${WORKER} in sandbox ${NAME}; it continues no run.`)
    expect(await theStartersUseLines()).toEqual([])
  }, 60_000)

  it('round refuses while the run before still has a live process, and names the run and the process; so does a second worker', async () => {
    const start = startsOf(dir).find((one: any) => one.run === firstRun) as any
    expect(start, 'no start of the first run').toBeDefined()
    const brief = join(scratch, 'second.md')
    writeFileSync(brief, '# The second round\nCarry on.\n')
    const before = execCalls()
    const refused = await sandbox(['round', NAME, '--agent', WORKER, '--brief', brief])
    expect(refused.status, refused.err).toBe(1)
    expect(refused.err).toContain(`run ${firstRun} of ${WORKER}, process row ${start.processRow}, host pid ${start.hostPid} group ${start.hostPgid}, is still running`)
    const again = await sandbox(['worker', NAME, '--agent', WORKER, '--brief', brief])
    expect(again.status, again.err).toBe(1)
    expect(again.err).toContain(`run ${firstRun} of ${WORKER}, process row ${start.processRow}`)
    expect(execCalls(), 'something was started while the first round ran').toBe(before)
  }, 60_000)

  it('round starts once the run before has ended: the same worktree, direct claude with MCP and --continue on the same model, and a new run linked to it', async () => {
    const start = startsOf(dir).find((one: any) => one.run === firstRun) as any
    expect((await releaseRow(start.processRow)).status).toBe(200)
    await until('the first round to have ended', () => {
      try {
        process.kill(start.hostPid, 0)
        return false
      } catch {
        return true
      }
    })
    // A LOGIN OF EACH KIND FOR THIS ROUND: a round is a claude-code run, so it holds the Claude login and not
    // OpenRouter's key, which only opencode reads (the template's readBy).
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\nOPENROUTER_API_KEY=not-a-real-key\n', { mode: 0o600 })
    let ran: Ran
    try {
      ran = await sandbox(['round', NAME, '--agent', WORKER, '--brief', join(scratch, 'second.md'), '--json'])
    } finally {
      writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    }
    expect(ran.status, ran.err).toBe(0)
    const next = JSON.parse(ran.out.trim())
    groups.add(next.hostPgid)
    secondRun = next.run
    expect(secondRun).toMatch(/\S/)
    expect(secondRun).not.toBe(firstRun)
    expect(next.cwd).toBe(start.cwd)
    expect(next.command).toEqual(['claude', AN_MCP_FLAG, ...CLAUDE_CODE_FEATURES_OFF, '--permission-mode', 'bypassPermissions', '-p', '--continue', '--model', OFFICE_MODEL, '--output-format', 'json'])
    const given = await whatClaudeWasGiven(secondRun)
    expect(given.argv).toEqual(next.command.slice(1))
    expect(given.brief).toContain('# The second round\nCarry on.\n')
    expect(given.env['MOLE_OFFICE_AGENT']).toBe(WORKER)
    expect(given.env['MOLE_OFFICE_SESSION']).toBe(secondRun)
    for (const [name, value] of Object.entries(given.env)) expect(value, `${name} carries the starter's session`).not.toBe(starterSession)
    expect(given.env).toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN')
    expect(given.env, "a round holds OpenRouter's key").not.toHaveProperty('OPENROUTER_API_KEY')

    // A NEW RUN, derived from the one it continues, in the same worktree and on the same model.
    const record = (await ask('GET', `/api/records/${secondRun}`)).body
    expect(given.brief).toBe(withTheStartingWords(deliveredRoundBrief(record.record.data.extra.roundChapters)))
    expect(record.record.data.extra.roundChapters.brief.text).toBe('# The second round\nCarry on.\n')
    expect(record.record.data).toMatchObject({ servingAgent: WORKER, model: OFFICE_MODEL, workingDirectory: start.cwd, parentAttachment: starterSession })
    const links = record.links as { type: string; other?: { id?: string }; toId?: string; fromId?: string }[]
    expect(
      links.some((one) => one.type === 'derived_from' && (one.other?.id === firstRun || one.toId === firstRun)),
      `no derived_from link to ${firstRun}: ${JSON.stringify(links)}`,
    ).toBe(true)
    expect(readFileSync(join(dir, 'logs', secondRun, 'launch.txt'), 'utf8')).toContain(`round: run ${secondRun} of ${WORKER} is started in sandbox ${NAME}, continuing run ${firstRun}`)
    await expectAnUnsentUse(secondRun, `round: run ${secondRun} was filed for ${WORKER} in sandbox ${NAME}; it continues run ${firstRun}.`)
    expect(await theStartersUseLines()).toEqual([])
  }, 60_000)

  it('exec --agent, worker and round file their runs the same way, by the starter, through the one filing function', async () => {
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'claude-code', '--model', 'claude-opus-5-5',
      '--worktree', join(dir, 'worktrees', WORKER), '--cut-from', 'main', '--json', '--', ENDS_AT_ONCE,
    ])
    expect(ran.status, ran.err).toBe(0)
    const byExec = JSON.parse(ran.out.trim())
    groups.add(byExec.hostPgid)
    const filed = await Promise.all([byExec.run, firstRun, secondRun].map((run) => theRunAsFiled(run)))
    const shape = (one: { data: Record<string, unknown> }): string[] => Object.keys(one.data).sort()
    expect(shape(filed[1]!), 'worker filed another shape of run than exec --agent').toEqual(shape(filed[0]!))
    expect(shape(filed[2]!), 'round filed another shape of run than exec --agent').toEqual(shape(filed[0]!))
    for (const one of filed) expect(one.by).toEqual({ actorType: 'agent', actor: STARTER, session: "the starter's" })
    rmSync(secrets, { force: true })
  }, 60_000)

  it("worker and round give direct claude with MCP its own name for an Anthropic model, and refuse another provider's before anything starts", async () => {
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    const worktree = join(dir, 'worktrees', WORKER)
    const brief = join(scratch, 'third.md')
    writeFileSync(brief, '# Another round\nCarry on.\n')
    const ended = (hostPid: number): Promise<void> =>
      until(`host pid ${String(hostPid)} to have ended`, () => {
        try {
          process.kill(hostPid, 0)
          return false
        } catch {
          return true
        }
      })
    /** A run exec --agent files with `model`, in the word tools/register-a-run.mjs takes, whose command ends at once. */
    const anExecRun = async (model: string): Promise<string> => {
      const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'claude-code', '--model', model, '--worktree', worktree, '--cut-from', 'main', '--json', '--', ENDS_AT_ONCE])
      expect(ran.status, ran.err).toBe(0)
      const start = JSON.parse(ran.out.trim())
      groups.add(start.hostPgid)
      await ended(start.hostPid)
      return String(start.run)
    }
    /** A start that goes through: the run it filed, what it said, and what its claude was given, once it has ended. */
    const started = async (args: string[]): Promise<{ run: string; err: string; argv: string[] }> => {
      const ran = await sandbox([...args, '--verbose', '--json'])
      expect(ran.status, ran.err).toBe(0)
      const start = JSON.parse(ran.out.trim())
      groups.add(start.hostPgid)
      const given = await whatClaudeWasGiven(start.run)
      await ended(start.hostPid)
      return { run: String(start.run), err: ran.err, argv: given.argv }
    }
    /** The runs the office holds for the worker, as their ids. */
    const theWorkersRuns = async (): Promise<string[]> => {
      const listed = await ask('GET', '/api/records?kind=session&limit=1000')
      expect(listed.status, JSON.stringify(listed.body)).toBe(200)
      return (listed.body.records as { id: string; data: Record<string, unknown> }[])
        .filter((one) => one.data['servingAgent'] === WORKER)
        .map((one) => one.id)
        .sort()
    }
    /** A start refused with `words`, before anything was started or filed. */
    const refused = async (words: string, model: string, whence: string): Promise<void> => {
      const before = execCalls()
      const starts = startsOf(dir).length
      const runs = await theWorkersRuns()
      const ran = checked(() => launcherCheck('theNameClaudeTakes', { refuse: checkRefusal, say: () => { throw new Error('A refused provider must not be accepted') }, THE_PROVIDER_A_RUNTIME_RUNS: THE_PROVIDERS })(model, whence))
      expect(ran.status, ran.err).toBe(2)
      expect(ran.err).toContain(words)
      expect(ran.err).toContain('Nothing was started.')
      expect(execCalls(), 'something was started in the sandbox').toBe(before)
      expect(startsOf(dir).length, 'a start was written').toBe(starts)
      expect(await theWorkersRuns(), 'a run was filed for the refused start').toEqual(runs)
    }

    // THE ROUND AFTER A RUN exec --agent FILED AS anthropic/<name>: claude is given <name>, and the round's run holds it.
    const byExec = await anExecRun(`anthropic/${OFFICE_MODEL}`)
    const round = await started(['round', NAME, '--agent', WORKER, '--brief', brief])
    expect(round.argv, 'claude was not given its own name').toEqual([AN_MCP_FLAG, ...CLAUDE_CODE_FEATURES_OFF, '--permission-mode', 'bypassPermissions', '-p', '--continue', '--model', OFFICE_MODEL, '--output-format', 'json'])
    // WITH A CASTING SELECTION THE LAUNCHER NAMES THE NATIVE MODEL FROM THE ROW, rather than stripping the
    // provider from the model it was given, so its line says both names.
    expect(round.err).toContain(`Model anthropic/${OFFICE_MODEL}; Office model anthropic/${OFFICE_MODEL}; native model ${OFFICE_MODEL};`)
    // The run holds the Office model the row selected; the native model it runs is the plain name in argv above.
    expect((await ask('GET', `/api/records/${round.run}`)).body.record.data.model).toBe(`anthropic/${OFFICE_MODEL}`)

    // A WORKER GIVEN --model anthropic/<name>, the same way.
    const worker = await started(['worker', NAME, '--agent', WORKER, '--brief', brief, '--model', `anthropic/${OFFICE_MODEL}`])
    expect(worker.argv, 'claude was not given its own name').toEqual([AN_MCP_FLAG, ...CLAUDE_CODE_FEATURES_OFF, '--permission-mode', 'bypassPermissions', '-p', '--model', OFFICE_MODEL, '--output-format', 'json'])

    // ANOTHER PROVIDER'S MODEL, recorded by exec or typed: refused with the reason, and nothing is started or filed.
    const elsewhere = await anExecRun('openrouter/some-other-model')
    await refused(`Run ${elsewhere} of ${WORKER} names the model openrouter/some-other-model, which claude cannot run`, 'openrouter/some-other-model', `Run ${elsewhere} of ${WORKER}`)
    await refused('--model names the model moonshot/kimi-k2, which claude cannot run', 'moonshot/kimi-k2', '--model')
    rmSync(secrets, { force: true })
  }, 120_000)

  // MUTATION: the anthropic literal comes back; this case goes red on the accepted made-up route and the refused old one.
  it('reads the Claude Code provider from the data module, not from the literal anthropic', () => {
    const provider = `made-up-claude-provider-${randomUUID()}`
    const providers = { codex: `made-up-codex-provider-${randomUUID()}`, 'claude-code': provider }
    const model = `made-up-claude-model-${randomUUID()}`
    const read = launcherCheck('theNameClaudeTakes', {
      refuse: checkRefusal,
      say: () => {},
      THE_PROVIDER_A_RUNTIME_RUNS: providers,
    })
    expect(read(`${provider}/${model}`, '--model')).toBe(model)
    const oldProvider = checked(() => read(`anthropic/${model}`, '--model'))
    expect(oldProvider.status).toBe(2)
    expect(oldProvider.err).toContain(`takes a model of provider ${provider} under its own name`)
    const another = checked(() => read(`elsewhere/${model}`, '--model'))
    expect(another.status).toBe(2)
    expect(another.err).toContain(`takes a model of provider ${provider} under its own name`)
  })

  it('direct worker with MCP takes the casting marked for the role card of an agent with no model of its own, names it, and refuses when none is marked', async () => {
    // THE ORDER EVERY TOOL FOLLOWS (message MqebF8x7juih, on wave 13p's round 2): a named --model, the agent's own
    // model on its profile (case 3), the casting the Casting table marks for its role card, and else a refusal. The
    // office's .env default is never taken.
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    const CASTER = 'round-caster'
    const made = await ask('POST', '/api/agents/started', { handle: CASTER, name: CASTER, role: 'worker', runtime: 'claude-code', workArea: ['src'] })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const brief = join(scratch, 'cast.md')
    writeFileSync(brief, '# A worker the Casting table casts\n')
    // THE TABLE STARTS EMPTY HERE, so the step below tests a role card with no casting marked, whatever rows the
    // earlier cases made for their own invented models.
    t.client.sqlite.prepare('DELETE FROM casting_rows').run()

    // NO CASTING MARKED FOR ITS ROLE CARD, AND NO MODEL OF ITS OWN: refused with the reason, and nothing is started.
    const before = execCalls()
    const refused = await sandbox(['worker', NAME, '--verbose', '--agent', CASTER, '--brief', brief])
    expect(refused.status, refused.err).toBe(2)
    expect(refused.err).toContain(`neither ${CASTER}'s own profile nor a casting marked for its role card in ${WORKSPACE} names a model for claude-code`)
    // WHAT TO DO NEXT, as asked in message pqrjrpv36GOp: name --model, or ask the person to mark a casting.
    expect(refused.err).toContain('name --model, or ask the person to mark a casting for its role card on the Casting page')
    // AND ONCE: the inspector's note on the release of this case's first entry (message NX1pzEZ4J48Q).
    expect(refused.err, 'the refusal names --model twice').not.toContain('Give --model')
    expect(refused.err).toContain('Nothing was started.')
    expect(execCalls(), 'something was started in the sandbox').toBe(before)

    // THE PERSON MARKS A CASTING FOR THE ROLE CARD: claude is given its model, and the line names the casting and its decision.
    const asThePerson = { type: 'human', id: THE_TEST_OFFICES_OWNER.id }
    const decided = await ask('POST', '/api/records', { kind: 'decision', title: 'The test casts the worker role', data: { ...governsTheWholeProject(), replaces: [] } }, asThePerson)
    expect(decided.status, JSON.stringify(decided.body)).toBe(201)
    const decision = String(decided.body.record.id)
    const cast = await ask('POST', '/api/casting/worker', { program: { value: 'claude-code', decision }, model: { value: 'the-cast-model', decision } }, asThePerson)
    expect(cast.status, JSON.stringify(cast.body)).toBeLessThan(300)
    const casting = Number(cast.body.casting.id)
    const ran = await sandbox(['worker', NAME, '--verbose', '--agent', CASTER, '--brief', brief, '--json'])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    const given = await whatClaudeWasGiven(start.run)
    expect(given.argv, 'claude was not given the casting model').toEqual([AN_MCP_FLAG, ...CLAUDE_CODE_FEATURES_OFF, '--permission-mode', 'bypassPermissions', '-p', '--model', 'the-cast-model', '--output-format', 'json'])
    expect(ran.err).toContain(`the model is the-cast-model, from casting ${String(casting)} of the Casting table, the every-project casting, from decision ${decision}.`)
    rmSync(secrets, { force: true })
  }, 120_000)

  it('worker --parent files its run as a child of the run named, filed by the starter as before; round takes no --parent', async () => {
    // THE MESSAGE WORKER STARTS A SUPERVISOR'S WORKER THIS WAY (wave 13j round loop-3): `worker --parent <the
    // supervisor's run>`, so the worker's end wakes the supervisor and not the run that filed it.
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    const UNDER = 'round-under-a-parent'
    const made = await ask('POST', '/api/agents/started', { handle: UNDER, name: UNDER, runtime: 'claude-code', workArea: ['src'] })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const parent = await ask('POST', '/api/records', { kind: 'session', title: 'A made-up run the worker is filed under', data: { state: 'running' } })
    expect(parent.status, JSON.stringify(parent.body)).toBe(201)
    const parentId = String(parent.body.record.id)
    const brief = join(scratch, 'under.md')
    writeFileSync(brief, '# A worker filed under a parent run\n')

    const ran = await sandbox(['worker', NAME, '--agent', UNDER, '--brief', brief, '--model', 'the-parent-model', '--parent', parentId, '--json'])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    expect(start.startedBy).toEqual({ agent: STARTER, session: starterSession })
    const record = (await ask('GET', `/api/records/${start.run}`)).body.record
    expect(record.data).toMatchObject({ state: 'running', servingAgent: UNDER, model: 'the-parent-model', parentAttachment: parentId })
    const first = await ask('GET', `/api/records/${start.run}/revisions/1`)
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect({ actor: first.body.who?.actorId, session: first.body.who?.sessionId }).toEqual({ actor: STARTER, session: starterSession })
    expect((await whatClaudeWasGiven(start.run)).env['MOLE_OFFICE_SESSION']).toBe(start.run)

    const refused = await sandbox(['round', NAME, '--agent', UNDER, '--parent', parentId])
    expect(refused.status, refused.err).toBe(2)
    expect(refused.err).toContain('--parent is only for exec --agent and worker, which file a run under a supervisor run.')
    rmSync(secrets, { force: true })
  }, 120_000)

  it('mutation OLD_HELPER_GETS_STDIN: a sandbox whose helper is from before --stdin starts its worker through sh -c as before, passes no --stdin, and says why it gets no office tool', async () => {
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    // A CHECKOUT WHOSE HELPER IS AN OLD ONE, made as tests/a-sandbox-run-holds-its-own-key.test.ts case 7 makes it: every
    // tool is this checkout's own except tools/sandbox-start.mjs, a stand-in that knows 'filed' and nothing of the newer
    // option, and writes down what it was asked. A sandbox keeps the clone it was started from, so after the change lands
    // such sandboxes still exist, and their helper would refuse the option (problem rgAmP45EklqO).
    const oldMain = join(scratch, 'old-main')
    mkdirSync(join(oldMain, 'tools'), { recursive: true })
    git(oldMain, 'init', '-q', '-b', 'main')
    git(oldMain, 'config', 'user.email', 'a-test@example.invalid')
    git(oldMain, 'config', 'user.name', 'A test')
    git(oldMain, 'config', 'commit.gpgsign', 'false')
    for (const name of readdirSync(join(REPO, 'tools'))) {
      if (name !== 'sandbox-start.mjs') symlinkSync(join(REPO, 'tools', name), join(oldMain, 'tools', name))
    }
    writeFileSync(
      join(oldMain, 'tools', 'sandbox-start.mjs'),
      "export const PERMISSIONS_CONTRACT = 2\n" +
        "// A helper from before: it takes 'filed', and writes down what it was asked.\n" +
        "import { writeFileSync } from 'node:fs'\n" +
        "if (process.argv.includes('--verbose')) process.exit(22)\n" +
        "process.stderr.write('sandbox-start: synthetic legacy helper explanation\\n')\n" +
        "writeFileSync(process.env.SANDBOX_DIR + '/out/old-helper.json', JSON.stringify({ argv: process.argv.slice(2) }))\n" +
        "const start = JSON.stringify({ run: null, instance: 'old', processRow: null, hostPid: null, hostPgid: null, out: null, command: [] })\n" +
        "if (process.argv.includes('--wait')) process.stderr.write('sandbox-start: started ' + start + '\\n'); else process.stdout.write(start + '\\n')\n",
    )
    symlinkSync(join(REPO, 'src'), join(oldMain, 'src'))
    writeFileSync(join(oldMain, 'README.md'), 'a checkout whose helper is an old one\n')
    git(oldMain, 'add', '-A')
    git(oldMain, 'commit', '-q', '-m', 'the checkout')
    mkdirSync(join(oldMain, 'node_modules', '.vite-temp'), { recursive: true })
    mkdirSync(join(oldMain, 'data'))
    const up = await sandbox(['up', join(scratch, 'template'), '--name', 'rounds-old', '--from', oldMain, '--no-dsh', '--json'])
    expect(up.status, up.err).toBe(0)
    const oldDir = JSON.parse(up.out.trim()).folder
    writeFileSync(join(oldMain, 'tools', 'sandbox-start.mjs'), readFileSync(join(REPO, 'tools', 'sandbox-start.mjs')))
    git(oldMain, 'add', 'tools/sandbox-start.mjs')
    git(oldMain, 'commit', '-q', '-m', 'a current fixture helper')
    // A LOCAL COMMIT KEEPS THE OLD HELPER CHECKED OUT: a main that has diverged is left as it is, and the start goes on.
    // A change in the working tree no longer does, since such a start is refused (the "local main before a run" cases).
    git(join(oldDir, 'repo'), '-c', 'user.email=a-test@example.invalid', '-c', 'user.name=A test', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'a synthetic local commit')
    const brief = join(scratch, 'old.md')
    writeFileSync(brief, '# A brief for an old sandbox\n')
    // AN OLD HELPER STARTS THROUGH sh -c, WHICH CANNOT CARRY A NATIVE SELECTION, so this start names a model
    // the compatibility list holds and takes the legacy path.
    const ran = await sandbox(['worker', 'rounds-old', '--agent', WORKER, '--brief', brief, '--model', A_KNOWN_MODEL, '--json', '--verbose'])
    expect(ran.status, ran.err).toBe(0)
    expect(ran.err).toContain(
      'is from before --stdin, so this worker starts through sh -c with its brief on its standard input, as before, and gets ' +
        'no office_request. This repo has not checked out the updated helper from origin/main at this start; see the main ' +
        'refresh details for why. The next agent start where checked-out main can follow origin/main uses the updated helper.',
    )
    const stdinLine = ran.err.split('\n').find(line => line.includes('is from before --stdin'))
    expect(stdinLine).toContain('Details: ')
    const given = JSON.parse(readFileSync(join(oldDir, 'out', 'old-helper.json'), 'utf8')) as { argv: string[] }
    expect(given.argv).not.toContain('--stdin')
    expect(given.argv).not.toContain('--verbose')
    const oldHelperLine = ran.err.split('\n').find(line => line.includes('is older than this launcher'))
    expect(oldHelperLine).toContain('this repo has not checked out the updated helper from origin/main at this start')
    expect(oldHelperLine).toContain('the next agent start where checked-out main can follow origin/main uses the updated helper')
    expect(oldHelperLine).toContain('Details: ')
    expect(oldHelperLine).not.toContain('Start the sandbox again')
    expect(ran.err).toContain('have diverged')
    expect(ran.err).toContain('synthetic legacy helper explanation')
    const details = JSON.parse(ran.out.trim()).details as string
    expect(readFileSync(details, 'utf8')).toContain('synthetic legacy helper explanation')
    const waited = await sandbox(['exec', 'rounds-old', '--wait', '--verbose', '--', ENDS_AT_ONCE])
    expect(waited.status, waited.err).toBe(0)
    expect(waited.err).toContain('sandbox-start: started {')
    const warningDetails = waited.err.match(/Details: (.+)/)?.[1]
    expect(warningDetails).toBeDefined()
    expect(readFileSync(warningDetails!, 'utf8')).toContain('synthetic legacy helper explanation')
    const oldHelper = join(oldDir, 'repo', 'tools', 'sandbox-start.mjs')
    const oldSource = readFileSync(oldHelper, 'utf8')
    writeFileSync(oldHelper, oldSource.replace("'filed'", "'legacy-filed'"))
    try {
      const parent = await sandbox(['exec', 'rounds-old', '--agent', WORKER, '--runtime', 'claude-code', '--parent', starterSession, '--', 'true'])
      expect(parent.status, parent.err).toBe(2)
      expect(parent.err).toContain('this helper has no --filed support')
      expect(parent.err).toContain('once checked-out main follows origin/main containing a helper with --filed support')
      expect(parent.err).not.toContain('Start the sandbox again from the current template')
    } finally { writeFileSync(oldHelper, oldSource) }
    const command = given.argv.slice(given.argv.indexOf('--') + 1)
    expect(command.slice(0, 2)).toEqual(['sh', '-c'])
    expect(command[2]).toMatch(new RegExp(`^exec claude -p --model ${A_KNOWN_MODEL} --output-format json --permission-mode bypassPermissions < '${join(oldDir, 'briefs')}/[^']+'$`))
    rmSync(secrets, { force: true })
  }, 120_000)
})

/** The first worktree stays checked out while an ended worker starts again elsewhere. */
describe('a second worktree of the same agent', () => {
  // Mutation: the occupied branch is reused under the agent's name alone.
  it('keeps the first worker on its handle branch and starts exec on a branch named for its own run', async () => {
    const agent = 'two-worktrees-worker'
    expect((await ask('POST', '/api/agents/started', { handle: agent, name: agent, role: 'worker', runtime: 'claude-code', workArea: ['src'] })).status).toBe(201)
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    const brief = join(scratch, 'two-worktrees.md')
    writeFileSync(brief, '# A synthetic worker that ends\n')
    try {
      const ran = await sandbox(['worker', NAME, '--agent', agent, '--model', 'anthropic/claude-opus-5-5', '--brief', brief, '--json'])
      expect(ran.status, ran.err).toBe(0)
      const first = JSON.parse(ran.out.trim())
      groups.add(first.hostPgid)
      const firstDir = join(dir, 'worktrees', agent)
      expect(first.cwd).toBe(firstDir)
      expect(git(firstDir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(agent)
      await codexEnded(first)

      const secondDir = join(scratch, 'second-worktree')
      const next = await sandbox(['exec', NAME, '--agent', agent, '--runtime', 'claude-code', '--model', 'anthropic/claude-opus-5-5', '--worktree', secondDir, '--json', '--', ENDS_AT_ONCE])
      expect(next.status, next.err).toBe(0)
      const second = JSON.parse(next.out.trim())
      groups.add(second.hostPgid)
      expect(existsSync(secondDir)).toBe(true)
      expect(git(secondDir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(`${agent}-${second.run}`)
      expect(git(firstDir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(agent)
      expect(readFileSync(second.details, 'utf8')).toContain(`--worktree ${secondDir}`)
      expect(readFileSync(second.details, 'utf8')).toContain(`on branch ${agent}-${second.run}`)
      await codexEnded(second)
    } finally {
      rmSync(secrets, { force: true })
    }
  }, 60_000)
})

/** Read only a named declaration, leaving the launcher's top-level program unexecuted. */
function launcherCheck(name: string, globals: Record<string, unknown>): (...args: any[]) => any {
  const source = readFileSync(TOOL, 'utf8')
  let start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\n}\n', start)
  if (source.slice(start - 6, start) === 'async ') start -= 6
  if (start < 0 || end < 0) throw new Error(`The launcher check ${name} was not found`)
  return runInNewContext(`(${source.slice(start, end + 2)})`, globals, { filename: TOOL })
}
const checkRefusal = (sentence: string, status = 1): never => { throw Object.assign(new Error(sentence), { status }) }
function checked(read: () => unknown): Ran {
  try { read(); return { status: 0, out: '', err: '' } }
  catch (error) {
    if (error instanceof Error && 'status' in error) return { status: Number(error.status), out: '', err: error.message }
    throw error
  }
}
/** Constants come from the same source as the reader, so changing a limit changes this test too. */
function launcherConstant(name: string): unknown {
  const line = readFileSync(TOOL, 'utf8').split('\n').find(one => one.startsWith(`const ${name} = `))
  if (line === undefined) throw new Error(`The launcher constant ${name} was not found`)
  return runInNewContext(`(${line.slice(line.indexOf(' = ') + 3)})`, {})
}
function readThread(run: string): unknown {
  const eachEventLineOf = launcherCheck('eachEventLineOf', {
    join, openSync, closeSync, readSync, realpathSync, fstatSync, statSync, fsConstants, Buffer,
    refuse: checkRefusal,
    A_PIECE_OF_THE_OUTPUT: launcherConstant('A_PIECE_OF_THE_OUTPUT'),
    AN_EVENT_LINE_AT_MOST: launcherConstant('AN_EVENT_LINE_AT_MOST'),
  })
  return launcherCheck('theCodexThreadOf', {
    join, realpathSync, theCodexRolloutFor, eachEventLineOf, spoolAGateMet,
    A_CODEX_THREAD_ID: launcherConstant('A_CODEX_THREAD_ID'), refuse: checkRefusal,
  })({ name: NAME, dir }, run)
}

/** Every refusal leaves the starts, exec calls and filed runs unchanged. */
async function codexRefused(args: string[], words: string, status = 1, read?: () => unknown): Promise<Ran> {
  const runs = async () => {
    const read = await ask('GET', '/api/records?kind=session&limit=1000')
    expect(read.status).toBe(200)
    return read.body.records.map((r: { id: string }) => r.id).sort()
  }
  const before = { calls: execCalls(), starts: startsOf(dir).length, runs: await runs() }
  const ran = read === undefined ? await sandbox([...args, '--verbose']) : checked(read)
  expect(ran.status, ran.err).toBe(status)
  expect(ran.err).toContain(words)
  expect(execCalls()).toBe(before.calls)
  expect(startsOf(dir).length).toBe(before.starts)
  expect(await runs(), 'a refused command filed a run').toEqual(before.runs)
  return ran
}

/** Wait for an actual recorded child to exit, rather than assuming its output means it ended. */
async function codexEnded(start: { hostPid: number }): Promise<void> {
  await until('the synthetic Codex command to end', () => {
    try { process.kill(start.hostPid, 0); return false } catch { return true }
  })
}

/** Ignore only MCP, shell policy and shell snapshot overrides. Effort and tier remain in the exact argv check. */
function withoutCodexOverrides(command: string[]): string[] {
  const override = (word: string | undefined) => /^(mcp_servers\.|shell_environment_policy\.|features\.shell_snapshot=false$)/.test(word ?? '')
  return command.filter((word, i) => !(word === '-c' && override(command[i + 1])) && !(command[i - 1] === '-c' && override(word)))
}

describe('Codex worker and round', () => {
  let first: any
  let second: any
  const flags = (verb: string, brief: string, agent = CODEX_WORKER) => [verb, NAME, '--agent', agent, '--brief', join(scratch, brief), '--runtime', 'codex']

  // Mutation: theSandboxHasACodexLogin returns without checking auth.json.
  it('refuses a worker with no Codex login before filing or starting anything', async () => {
    writeFileSync(join(scratch, 'codex-first.md'), '# A synthetic Codex brief\nKEEP RUNNING\n')
    const ran = await codexRefused(flags('worker', 'codex-first.md'), 'has no Codex login')
    expect(ran.err).toContain('device-code login')
    expect(existsSync(join(dir, 'worktrees', CODEX_WORKER))).toBe(false)
    mkdirSync(join(dir, 'home', '.codex'), { recursive: true })
    writeFileSync(join(dir, 'home', '.codex', 'auth.json'), '{}') // Synthetic file; no login is performed.
  }, 60_000)

  // Mutation: theNameCodexTakes hands any model on without its provider check.
  it('refuses another provider or a bare model, including the model the office supplies', async () => {
    const provider = THE_PROVIDERS['codex']!
    for (const model of ['anthropic/claude-opus-5-5', 'the-codex-model']) {
      await codexRefused([], `requires a model of provider ${provider}, named ${provider}/<model>`, 2, () => launcherCheck('theNameCodexTakes', { refuse: checkRefusal, THE_PROVIDER_A_RUNTIME_RUNS: THE_PROVIDERS })(model, '--model'))
    }
    const asThePerson = { type: 'human', id: THE_TEST_OFFICES_OWNER.id }
    expect((await ask('POST', `/api/office/run-models/agent/${CODEX_WORKER}`, { model: 'anthropic/claude-opus-5-5' }, asThePerson)).status).toBeLessThan(300)
    try {
      await codexRefused(
        flags('worker', 'codex-first.md'),
        'The office gave no native selection for model openai/anthropic/claude-opus-5-5',
        2,
      )
    } finally {
      expect((await ask('POST', `/api/office/run-models/agent/${CODEX_WORKER}`, { model: CODEX_MODEL }, asThePerson)).status).toBeLessThan(300)
    }
  }, 60_000)

  // MUTATION: the openai literal comes back; this case goes red on the accepted made-up route and the refused old one.
  it('reads the Codex provider from the data module, not from the literal openai', () => {
    const provider = `made-up-codex-provider-${randomUUID()}`
    const providers = { codex: provider, 'claude-code': `made-up-claude-provider-${randomUUID()}` }
    const model = `made-up-codex-model-${randomUUID()}`
    const read = launcherCheck('theNameCodexTakes', { refuse: checkRefusal, THE_PROVIDER_A_RUNTIME_RUNS: providers })
    expect(read(`${provider}/${model}`, '--model')).toBe(model)
    const oldProvider = checked(() => read(`openai/${model}`, '--model'))
    expect(oldProvider.status).toBe(2)
    expect(oldProvider.err).toContain(`a Codex worker requires a model of provider ${provider}, named ${provider}/<model>`)
    const another = checked(() => read(`elsewhere/${model}`, '--model'))
    expect(another.status).toBe(2)
    expect(another.err).toContain(`a Codex worker requires a model of provider ${provider}, named ${provider}/<model>`)
  })

  // Mutation: theCodexCommand puts Codex behind sh -c.
  it('starts Codex directly with JSON and its own model name, using the office model, with the brief on its standard input', async () => {
    const ran = await sandbox(flags('worker', 'codex-first.md'))
    expect(ran.status, ran.err).toBe(0)
    first = startsOf(dir).map(one => one as any).find(one => one.agent === CODEX_WORKER || one.command?.[0] === 'codex')
    groups.add(first.hostPgid)
    // This model has no effort row. Fast mode follows the data file for the runtime, and -- ends the options before the
    // - that tells Codex to read its prompt from standard input.
    expect(withoutCodexOverrides(first.command)).toEqual(['codex', ...CODEX_FEATURES_OFF, '-s', 'danger-full-access', '-a', 'never', 'exec', '--json', '-m', 'the-codex-model', ...theFastFlag, '--', '-'])
    // The helper gives the command a copied brief file as its standard input. Its launch line names that file and its size.
    expect(readdirSync(join(dir, 'briefs')).map(name => join(dir, 'briefs', name))).toContain(first.stdin)
    expect(readFileSync(first.stdin, 'utf8')).toBe(withTheStartingWords('# A synthetic Codex brief\nKEEP RUNNING\n'))
    expect(ran.out + ran.err).not.toContain('# A synthetic Codex brief')
    expect(ran.out + ran.err).toContain(first.stdin)
    expect(ran.out + ran.err).toContain(`${statSync(first.stdin).size} bytes`)

    expect(first.cwd).toBe(join(dir, 'worktrees', CODEX_WORKER))
    const seen = join(dir, 'out', 'codex-' + first.run + '.json')
    await until('the stand-in Codex argv record', () => existsSync(seen))
    const given = JSON.parse(readFileSync(seen, 'utf8'))
    // The sandbox's codex (tools/codex-in-a-sandbox.mjs) puts the snapshot switch in front of the command's words.
    expect(given.argv).toEqual([...CODEX_SHELL_SNAPSHOT_OFF, ...first.command.slice(1)])
    expect(given.env.MOLE_OFFICE_AGENT).toBe(CODEX_WORKER)
    expect(given.env.MOLE_OFFICE_SESSION).toBe(first.run)
    expect(given.cwd).toBe(first.cwd)
    expect(first.command).toContain('mcp_servers.mole_office.enabled=true')
    const record = (await ask('GET', '/api/records/' + first.run)).body.record
    expect(record.data).toMatchObject({ runtime: 'codex', model: CODEX_MODEL, servingAgent: CODEX_WORKER, parentAttachment: starterSession, workingDirectory: first.cwd })
    expect(given.brief).toBe(readFileSync(first.stdin, 'utf8'))
    await expectAnUnsentUse(first.run, `worker: run ${first.run} was filed for ${CODEX_WORKER} in sandbox ${NAME}; it continues no run.`)
  }, 60_000)

  // Mutation: nothingOfItStillRuns returns without reading liveness.
  it('refuses a Codex round and another worker while an agent process still runs', async () => {
    writeFileSync(join(scratch, 'codex-next.md'), '# Continue the synthetic conversation\n')
    for (const verb of ['round', 'worker']) {
      await codexRefused(flags(verb, 'codex-next.md'), 'is still running')
    }
    expect((await releaseRow(first.processRow)).status).toBe(200)
    await codexEnded(first)
  }, 60_000)

  // Mutation: theCodexCommand omits the thread after resume.
  it('resumes the thread from the previous output in the same worktree, files its derived link and prints its unsent use', async () => {
    expect(readFileSync(first.out, 'utf8')).toContain('"thread_id":"' + CODEX_THREAD + '"')
    const ran = await sandbox([...flags('round', 'codex-next.md'), '--json'])
    expect(ran.status, ran.err).toBe(0)
    second = JSON.parse(readFileSync(join(dir, 'logs', JSON.parse(ran.out.trim()).run, 'start.json'), 'utf8'))
    const display = JSON.parse(ran.out.trim())
    expect(display.command).toEqual(second.command)
    expect(display.brief).toBe(join(scratch, 'codex-next.md'))
    expect(display.briefBytes).toBe(statSync(second.stdin).size)
    expect(ran.out.trim().split('\n')).toHaveLength(1)
    expect(ran.out + ran.err).not.toContain('# Continue the synthetic conversation')
    groups.add(second.hostPgid)
    const saved = (await ask('GET', '/api/records/' + second.run)).body.record.data.extra.roundChapters
    expect(saved.brief.text).toBe('# Continue the synthetic conversation\n')
    // A fast-mode value, where the data file gives one, goes before resume, where a resumed thread keeps the office tool's overrides too.
    expect(withoutCodexOverrides(second.command)).toEqual(['codex', ...CODEX_FEATURES_OFF, '-s', 'danger-full-access', '-a', 'never', 'exec', '--json', ...theFastFlag, 'resume', CODEX_THREAD, '-m', 'the-codex-model', '--', '-'])
    expect(readFileSync(second.stdin, 'utf8')).toBe(withTheStartingWords(deliveredRoundBrief(saved)))
    expect(second.cwd).toBe(first.cwd)
    expect(second.run).not.toBe(first.run)
    const seen = join(dir, 'out', 'codex-' + second.run + '.json')
    await until('the resumed stand-in argv record', () => existsSync(seen))
    // The sandbox's codex puts the snapshot switch in front of a resumed thread's words too.
    expect(JSON.parse(readFileSync(seen, 'utf8'))).toMatchObject({ argv: [...CODEX_SHELL_SNAPSHOT_OFF, ...second.command.slice(1)], brief: readFileSync(second.stdin, 'utf8') })
    await codexEnded(second)
    const record = (await ask('GET', '/api/records/' + second.run)).body
    expect(record.record.data).toMatchObject({ runtime: 'codex', model: CODEX_MODEL, workingDirectory: first.cwd })
    expect(record.links.some((l: any) => l.type === 'derived_from' && (l.other?.id === first.run || l.toId === first.run))).toBe(true)
    await expectAnUnsentUse(second.run, `round: run ${second.run} was filed for ${CODEX_WORKER} in sandbox ${NAME}; it continues run ${first.run}.`)
  }, 60_000)

  // ITS RECEIPT IS NOT THE THREAD'S TOTAL (wave 13s round 42, fault 1). `codex exec resume` reports the thread's totals
  // so far. The run before was stopped before Codex reported any, so the thread's total at its end is unknown, and the
  // round's receipt gives the totals Codex printed as the thread's, in words, with no number as its own. MUTATION,
  // after a control run: theRunItContinues in tools/sandbox-start.mjs answers null, the receipt holds 7, 2 and 3 as the
  // round's own, and this goes red.
  it("gives the round's receipt no number of the thread's total as its own when the run before reported none", async () => {
    const theReceipt = async () => (await ask('GET', '/api/records/' + second.run)).body.record.data.usageReceipt
    await until("the round's usage receipt", async () => (await theReceipt()) !== undefined)
    const receipt = await theReceipt()
    for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens']) expect(receipt).not.toHaveProperty(key)
    expect(receipt.says).toBe(
      `This run continues run ${first.run}, whose output holds no turn.completed event, so the thread's total at its end is unknown. ` +
        "So the figures Codex gave are the thread's total so far, over every round of it, and not this run's own: tokens in 7, cached tokens 2, tokens out 3. " +
        "None of them is kept on this receipt as a number of this run's. Codex reports no cost.",
    )
  }, 60_000)

  // A round on a runtime the agent has no start on starts a new conversation since round 54 of 13q, and is no longer
  // refused here: tests/a-round-starts-fresh-on-another-runtime.test.ts holds its cases.

  // Mutation: the shape check of the thread id taken out of theCodexThreadOf. The run can rewrite its own output, so a
  // thread id that is not a UUID would otherwise reach Codex's command line as an option or another conversation.
  // NOTHING OF THE OUTPUT'S FREE TEXT IS IN THE REFUSAL: it names the file and the rule, never the words the run wrote.
  // Mutation: the refusal quotes the id again: red.
  it('refuses a thread id that is not the shape Codex gives a thread, without filing or starting a round', async () => {
    for (const id of ['--last', '-c model=other', 'two words', 'not-a-thread-id']) {
      writeFileSync(second.out, JSON.stringify({ type: 'thread.started', thread_id: id }) + '\n')
      const ran = await codexRefused([], `names a Codex thread that is not the shape Codex gives a thread (a UUID)`, 1, () => readThread(second.run))
      expect(ran.err).toContain(second.out)
      expect(ran.err).not.toContain(id)
    }
  }, 60_000)

  // Mutation: theCodexThreadOf returns a guessed thread when no event names one.
  it('refuses missing or unreadable thread output without filing or starting a round', async () => {
    writeFileSync(second.out, 'synthetic non-event line\n' + JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1 } }) + '\n')
    await codexRefused([], 'holds no thread.started event', 1, () => readThread(second.run))
    writeFileSync(second.out, JSON.stringify({ type: 'thread.started', thread_id: '' }) + '\n')
    await codexRefused([], 'holds no thread.started event', 1, () => readThread(second.run))
    rmSync(second.out)
    await codexRefused([], 'could not be read', 1, () => readThread(second.run))
  }, 60_000)

  // AN OUTPUT LONGER THAN THE LONGEST STRING NODE MAKES (problem J0YjXZvQg7EU): run lz68jpaKnEBW printed
  // 2.59 GB, the round read the whole file into one string, and the next-round door failed with ERR_STRING_TOO_LONG.
  // Each output here is a sparse file of 600 MiB, past that longest string (about 512 MiB), that takes almost no disk:
  // what follows its lines is a hole that reads as zeros. The thread it names has the right shape but is not in this
  // sandbox's Codex home, so each round is refused there, which shows its line was read, and nothing is filed or
  // started. MUTATIONS, after a control run: the whole output read as one string again (all three red: the round fails
  // on the string); the unfinished line at a piece's end not carried into the next piece (the second red: its thread
  // line crosses the end of the first piece of 1 MiB); no bound on an event line (the third red).
  it('reads the thread from an output past the longest string Node makes, line by line, and refuses an event line too long to read whole', async () => {
    const unheld = '01a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b'
    const MiB = 1024 * 1024
    const anOutput = (lines: string): void => {
      writeFileSync(second.out, lines)
      truncateSync(second.out, 600 * MiB)
    }
    const notHere = "names a Codex thread that is not in this sandbox's own Codex home"
    anOutput(JSON.stringify({ type: 'thread.started', thread_id: unheld }) + '\n')
    await codexRefused([], notHere, 1, () => readThread(second.run))
    anOutput('x'.repeat(MiB - 20) + '\n' + JSON.stringify({ type: 'thread.started', thread_id: unheld }) + '\n')
    await codexRefused([], notHere, 1, () => readThread(second.run))
    anOutput('{"type":"turn.started","synthetic":"')
    const ran = await codexRefused([], 'an event line longer than 64 MiB', 1, () => readThread(second.run))
    expect(ran.err).toContain(second.out)
    rmSync(second.out)
  }, 120_000)

  it('prints one line for a keyed Codex worker with a device login and absent alternative keys', async () => {
    const templateFile = join(scratch, 'template', 'sandbox.json')
    const original = readFileSync(templateFile, 'utf8')
    const template = JSON.parse(original)
    expect(template.secrets.names.filter((one: { name: string; readBy: string[] }) => one.readBy.includes('codex')).map((one: { name: string }) => one.name)).toEqual(expect.arrayContaining(['OPENAI_API_KEY', 'CODEX_API_KEY']))
    writeFileSync(templateFile, JSON.stringify(template))
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=synthetic-token\nOPENROUTER_API_KEY=synthetic-key\n', { mode: 0o600 })
    writeFileSync(join(scratch, 'codex-healthy.md'), 'Synthetic healthy worker brief.\n')
    const before = new Set(startsOf(dir).map(one => one.processRow))
    try {
      const ran = await sandbox(flags('worker', 'codex-healthy.md'), starterKey)
      expect(ran.status, ran.err).toBe(0)
      const start = startsOf(dir).find(one => !before.has(one.processRow)) as any
      groups.add(start.hostPgid)
      expect((ran.out + ran.err).trim().split('\n')).toHaveLength(1)
      expect(ran.out + ran.err).not.toMatch(/Left out|Secrets named but not passed/)
      const details = readFileSync(join(dir, 'logs', start.run, 'launch.txt'), 'utf8')
      expect(details).toContain('Left out')
      expect(details).toContain('CLAUDE_CODE_OAUTH_TOKEN')
      expect(details).toContain('OPENROUTER_API_KEY')
      expect(details).toContain('OPENAI_API_KEY')
      expect(details).toContain('CODEX_API_KEY')
      expect(details).toContain('holds a key')
      await codexEnded(start)
      const given = JSON.parse(readFileSync(join(dir, 'out', 'codex-' + start.run + '.json'), 'utf8'))
      expect(given.env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN')
      expect(given.env).not.toHaveProperty('OPENROUTER_API_KEY')
    } finally {
      writeFileSync(templateFile, original)
      rmSync(secrets, { force: true })
    }
  }, 60_000)

  it('prints one line for a keyed Claude worker with its token and an absent alternative key', async () => {
    const agent = 'claude-login-worker'
    const made = await ask('POST', '/api/agents/started', { handle: agent, name: agent, role: 'worker', runtime: 'claude-code', workArea: ['src'] })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    expect((await ask('POST', `/api/office/run-models/agent/${agent}`, { model: OFFICE_MODEL }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })).status).toBeLessThan(300)
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=synthetic-token\n', { mode: 0o600 })
    writeFileSync(join(scratch, 'claude-healthy.md'), 'Synthetic healthy Claude worker brief.\n')
    const before = new Set(startsOf(dir).map(one => one.processRow))
    try {
      const ran = await sandbox(['worker', NAME, '--agent', agent, '--brief', join(scratch, 'claude-healthy.md')], starterKey)
      expect(ran.status, ran.err).toBe(0)
      const start = startsOf(dir).find(one => !before.has(one.processRow)) as any
      groups.add(start.hostPgid)
      expect((ran.out + ran.err).trim().split('\n')).toHaveLength(1)
      expect(ran.out + ran.err).not.toMatch(/Left out|Secrets named but not passed/)
      const details = readFileSync(join(dir, 'logs', start.run, 'launch.txt'), 'utf8')
      expect(details).toContain('ANTHROPIC_API_KEY')
      expect(details).toContain('holds a key')
      const seen = join(dir, 'out', 'claude-' + start.run + '.json')
      await until('the synthetic Claude argv record', () => existsSync(seen))
      const given = JSON.parse(readFileSync(seen, 'utf8'))
      expect(given.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('synthetic-token')
      expect(given.env).not.toHaveProperty('ANTHROPIC_API_KEY')
      await codexEnded(start)
    } finally {
      rmSync(secrets, { force: true })
    }
  }, 60_000)

  it('refuses an unsafe secrets file before filing or starting a Codex worker with a device login', async () => {
    expect(existsSync(join(dir, 'home', '.codex', 'auth.json'))).toBe(true)
    writeFileSync(join(scratch, 'codex-unsafe.md'), 'Synthetic unsafe-file fixture.\n')
    writeFileSync(secrets, 'OPENROUTER_API_KEY=synthetic-key\n', { mode: 0o600 })
    chmodSync(secrets, 0o644)
    try {
      await codexRefused(flags('worker', 'codex-unsafe.md'), `${secrets} can be read by others (mode 644); make it 600 (chmod 600 ${secrets}). No secret was passed and nothing was started.`)
    } finally {
      rmSync(secrets, { force: true })
    }
  }, 60_000)

})


describe('a round chooses the start it continues', () => {
  const mixedAgent = 'mixed-runtime-round-worker'
  const olderAgent = 'older-start-round-worker'
  let mixedFirst: any
  let olderFirst: any

  const flags = (agent: string, brief: string) => ['round', NAME, '--agent', agent, '--runtime', 'codex', '--brief', join(scratch, brief), '--json']

  async function worker(agent: string, brief: string, register = true): Promise<any> {
    if (register) expect((await ask('POST', '/api/agents/started', { handle: agent, name: agent, role: 'worker', runtime: 'codex', workArea: ['src'] })).status).toBe(201)
    const ran = await sandbox(['worker', NAME, '--agent', agent, '--runtime', 'codex', '--model', CODEX_MODEL, '--brief', join(scratch, brief), '--json'])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    await codexEnded(start)
    return start
  }

  async function dsh(agent: string): Promise<any> {
    const ran = await sandbox(['exec', NAME, '--agent', agent, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--worktree', join(dir, 'worktrees', agent), '--json', '--', 'dsh'])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    expect(start.runtime).toBe('dsh')
    await codexEnded(start)
    return start
  }

  async function round(args: string[]): Promise<any> {
    const ran = await sandbox(args)
    expect(ran.status, ran.err).toBe(0)
    const display = JSON.parse(ran.out.trim())
    groups.add(display.hostPgid)
    await codexEnded(display)
    return JSON.parse(readFileSync(join(dir, 'logs', display.run, 'start.json'), 'utf8'))
  }

  async function expectContinued(start: any, previous: any, thread: string): Promise<void> {
    const resume = start.command.indexOf('resume')
    expect(resume).toBeGreaterThan(0)
    expect(start.command[resume + 1]).toBe(thread)
    expect(start.cwd).toBe(previous.cwd)
    const read = await ask('GET', `/api/records/${start.run}`)
    expect(read.status).toBe(200)
    expect(read.body.links.some((link: any) => link.type === 'derived_from' && (link.other?.id === previous.run || link.toId === previous.run))).toBe(true)
    await expectAnUnsentUse(start.run, `round: run ${start.run} was filed for ${start.agent} in sandbox ${NAME}; it continues run ${previous.run}.`)
  }

  // Mutation: choose the last start regardless of its recorded runtime.
  it('resumes and links the last Codex start after a newer dsh start, reading an older start runtime from the office', async () => {
    writeFileSync(join(scratch, 'mixed-first.md'), 'Synthetic first Codex thread.\n')
    writeFileSync(join(scratch, 'mixed-round.md'), 'Synthetic Codex continuation.\n')
    mixedFirst = await worker(mixedAgent, 'mixed-first.md')
    const file = join(dir, 'logs', mixedFirst.run, 'start.json')
    const legacy = JSON.parse(readFileSync(file, 'utf8'))
    expect(legacy.runtime).toBe('codex')
    delete legacy.runtime // A start written before runtime was recorded locally.
    writeFileSync(file, JSON.stringify(legacy))
    await dsh(mixedAgent)
    const next = await round(flags(mixedAgent, 'mixed-round.md'))
    await expectContinued(next, mixedFirst, CODEX_THREAD)
  }, 60_000)

  // Mutation: ignore --continues and take the last start of the requested runtime.
  it('resumes and links the older Codex start named by --continues instead of the newer thread', async () => {
    writeFileSync(join(scratch, 'older-first.md'), 'Synthetic older Codex thread.\n')
    writeFileSync(join(scratch, 'older-second.md'), 'Synthetic SECOND THREAD.\n')
    writeFileSync(join(scratch, 'older-round.md'), 'Synthetic explicitly chosen continuation.\n')
    olderFirst = await worker(olderAgent, 'older-first.md')
    const newer = await worker(olderAgent, 'older-second.md', false)
    expect(readFileSync(newer.out, 'utf8')).toContain(CODEX_SECOND_THREAD)
    const next = await round([...flags(olderAgent, 'older-round.md'), '--continues', olderFirst.run])
    await expectContinued(next, olderFirst, CODEX_THREAD)
  }, 60_000)

  // ANOTHER AGENT'S RUN THE LIST DOES NOT HOLD is refused by its record, by its id. Mutation: the record's agent not asked
  // of a run the list does not hold: red, the round continues the other agent's thread. A run --continues names that ran
  // on another runtime is not refused: the round starts a new conversation after it, as
  // tests/a-round-starts-fresh-on-another-runtime.test.ts shows.
  it('refuses --continues for another agent on the list or off it, a run outside the sandbox, and worker, without filing', async () => {
    await codexRefused([...flags(olderAgent, 'older-round.md'), '--continues', mixedFirst.run], `is a start of ${mixedAgent}`)
    const theirs = join(sandboxes, '.run', NAME, 'runs', `${mixedFirst.run}.json`)
    const kept = readFileSync(theirs)
    rmSync(theirs)
    try {
      await codexRefused(
        [...flags(olderAgent, 'older-round.md'), '--continues', mixedFirst.run],
        `Run ${mixedFirst.run}, which --continues names, is not on the host's list of sandbox ${NAME}, and its record says it serves ${JSON.stringify(mixedAgent)}, not ${olderAgent}. Nothing was started.`,
      )
    } finally {
      writeFileSync(theirs, kept, { mode: 0o600 })
    }
    await codexRefused(
      [...flags(olderAgent, 'older-round.md'), '--continues', starterSession],
      `Run ${starterSession}, which --continues names, is not on the host's list of sandbox ${NAME}, and its record says it serves null, not ${olderAgent}. Nothing was started.`,
    )
    await codexRefused(['worker', NAME, '--agent', olderAgent, '--runtime', 'codex', '--brief', join(scratch, 'older-round.md'), '--continues', olderFirst.run], 'worker does not take --continues', 2)
    await codexRefused(['exec', NAME, '--agent', olderAgent, '--runtime', 'codex', '--continues', olderFirst.run, '--', 'true'], 'I do not know the option --continues', 2)
  }, 60_000)

  /** A forged sandbox file cannot choose a continuation from the host's own list. */
  async function aForgedSelection(name: string, forged: Record<string, unknown>): Promise<void> {
    const folder = join(scratch, name), host = join(scratch, `${name}-host`, 'runs')
    mkdirSync(join(folder, 'logs', 'forged'), { recursive: true }); mkdirSync(host, { recursive: true })
    const entry = { run: 'synthetic-own-run', agent: 'synthetic-selected-agent', runtime: 'codex', filedAt: '2026-10-17T10:00:00.000+00:00', started: '2026-10-17T10:00:01.000+00:00', neverStarted: null, containerSession: null }
    writeFileSync(join(host, `${entry.run}.json`), JSON.stringify(entry))
    const forgedFile = join(folder, 'logs', 'forged', 'start.json')
    const bytes = JSON.stringify({ ...forged, startedAt: '9999-12-31 23:59:59' })
    writeFileSync(forgedFile, bytes)
    const theHostsList = launcherCheck('theHostsList', {
      theHostsRunsFolder: () => host, existsSync, readdirSync, readFileSync, join, momentOfAnInstant,
      A_RUN_ID: launcherConstant('A_RUN_ID'), refuse: checkRefusal,
    })
    const asked: string[] = []
    const data = { servingAgent: entry.agent, runtime: entry.runtime, sandbox: { folder } }
    const select = launcherCheck('theRunARoundContinues', {
      theHostsList, refuse: checkRefusal, api: 'http://synthetic.invalid',
      officeHeaders: () => ({}),
      askTheOffice: async (_api: string, path: string) => {
        asked.push(path)
        if (path !== `/api/records/${entry.run}`) throw new Error(`Unexpected record read: ${path}`)
        return { status: 200, body: { record: { data } } }
      },
      theOfficeSaid: () => { throw new Error('The selected synthetic record is readable') },
      theHostsRunsFolder: () => host,
      NOT_ON_THE_HOSTS_LIST: 'Only a run filed on the host list may be chosen implicitly.',
    })
    const selected = await select({ name, dir: folder, workspace: WORKSPACE }, { agent: STARTER, session: starterSession }, entry.agent, 'codex', undefined)
    expect(selected).toEqual({ run: entry.run, data, entry })
    expect(asked).toEqual([`/api/records/${entry.run}`])
    expect(readFileSync(forgedFile, 'utf8')).toBe(bytes)
  }

  it("a forged start.json naming another agent's live run changes nothing round does, and does not hold it back", async () => {
    await aForgedSelection('forged-agent-selection', { run: 'synthetic-other-live-run', agent: 'another-synthetic-agent', runtime: 'codex', hostPid: process.pid, hostPgid: process.pid })
  })

  function aForgedStart(folder: string, start: Record<string, unknown>): void {
    mkdirSync(join(dir, 'logs', folder), { recursive: true })
    writeFileSync(join(dir, 'logs', folder, 'start.json'), JSON.stringify({ ...start, startedAt: '9999-12-31 23:59:59' }))
  }


  it("a forged start.json naming the agent's live run in another sandbox changes nothing round does", async () => {
    const agent = 'forged-sandbox-round-worker'
    const otherName = 'rounds-other'
    const up = await sandbox(['up', fixtureTemplate, '--name', otherName, '--from', fixtureOrigin, '--no-dsh', '--json'])
    expect(up.status, up.err).toBe(0)
    const otherDir = JSON.parse(up.out.trim()).folder as string
    mkdirSync(join(otherDir, 'home', '.codex'), { recursive: true })
    writeFileSync(join(otherDir, 'home', '.codex', 'auth.json'), '{}') // Synthetic file; no login is performed.
    writeFileSync(join(scratch, 'forged-sandbox-first.md'), 'Synthetic first thread of the forged sandbox case.\n')
    writeFileSync(join(scratch, 'forged-sandbox-there.md'), 'Synthetic SECOND THREAD, in the other sandbox. KEEP RUNNING\n')
    writeFileSync(join(scratch, 'forged-sandbox-round.md'), 'Synthetic round of the forged sandbox case.\n')
    const own = await worker(agent, 'forged-sandbox-first.md')
    const there = await aWorkerStillRunning(agent, 'forged-sandbox-there.md', otherName, otherDir)
    try {
      aForgedStart('forged-another-sandbox', there)
      const next = await round(flags(agent, 'forged-sandbox-round.md'))
      await expectContinued(next, own, CODEX_THREAD)
      // NAMED OUTRIGHT, it is refused by its id: this sandbox's list does not hold it, and its record names the other
      // sandbox's folder. Mutation: the folder and the container row not asked of a run the list does not hold: red,
      // the round goes on past the record, to the run's process in the other sandbox.
      await codexRefused(
        [...flags(agent, 'forged-sandbox-round.md'), '--continues', there.run],
        `Run ${there.run} of ${agent}, which --continues names, is not on the host's list of sandbox ${NAME}, and its record says it was filed in the sandbox folder ${JSON.stringify(realpathSync(otherDir))}, not ${realpathSync(dir)}. Nothing was started.`,
      )
    } finally {
      await itEnds(there)
    }
    // THE OTHER SANDBOX'S ENTRY ON THIS SANDBOX'S LIST, as one left there or copied, is refused by the run's record,
    // which names the other sandbox. Mutation: the record's sandbox folder and container row not compared: red.
    const copied = join(sandboxes, '.run', NAME, 'runs', `${there.run}.json`)
    copyFileSync(join(sandboxes, '.run', otherName, 'runs', `${there.run}.json`), copied)
    try {
      await codexRefused(
        [...flags(agent, 'forged-sandbox-round.md'), '--continues', there.run],
        `Run ${there.run} of ${agent} is on the host's list of sandbox ${NAME}, but its record says it was filed in the sandbox folder ${JSON.stringify(realpathSync(otherDir))}`,
      )
    } finally {
      rmSync(copied)
    }
  }, 60_000)


  /** A worker that keeps running; each case releases its recorded row. */
  async function aWorkerStillRunning(agent: string, brief: string, sandboxName = NAME, folder = dir): Promise<any> {
    const ran = await sandbox(['worker', sandboxName, '--agent', agent, '--runtime', 'codex', '--model', CODEX_MODEL, '--brief', join(scratch, brief), '--json'])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(readFileSync(join(folder, 'logs', JSON.parse(ran.out.trim()).run, 'start.json'), 'utf8'))
    groups.add(start.hostPgid)
    return start
  }
  async function itEnds(start: any): Promise<void> {
    expect((await releaseRow(start.processRow)).status).toBe(200)
    await codexEnded(start)
  }

  // Mutation: the check against this sandbox's own Codex home taken out: red, the round started on a thread the
  // sandbox does not hold.
  it("refuses a thread that is not in this sandbox's own Codex home, without filing or starting a round", async () => {
    const agent = 'unheld-thread-round-worker'
    writeFileSync(join(scratch, 'unheld-first.md'), 'Synthetic UNHELD THREAD, kept in no home of this sandbox.\n')
    writeFileSync(join(scratch, 'unheld-round.md'), 'Synthetic round of the unheld thread case.\n')
    const earlier = await worker(agent, 'unheld-first.md')
    expect(readFileSync(join(dir, 'logs', earlier.run, 'out'), 'utf8')).toContain(CODEX_UNHELD_THREAD)
    const sessions = join(dir, 'home', '.codex', 'sessions')
    const ran = await codexRefused(flags(agent, 'unheld-round.md'), `names a Codex thread that is not in this sandbox's own Codex home, ${sessions}`)
    expect(ran.err).not.toContain(CODEX_UNHELD_THREAD)
    // A SESSIONS FOLDER THAT IS A LINK OUT OF THE SANDBOX is not its own home, whatever it holds. Mutation: the folder
    // taken by its path, with no check of its real path: red, the round started on the thread the link's folder holds.
    const away = join(scratch, 'unheld-sessions-away')
    renameSync(sessions, away)
    writeFileSync(join(away, '2026', '10', '17', `rollout-2026-10-17T00-00-00-${CODEX_UNHELD_THREAD}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { id: CODEX_UNHELD_THREAD, synthetic: true } }) + '\n')
    symlinkSync(away, sessions)
    try {
      await codexRefused(flags(agent, 'unheld-round.md'), `The Codex home of sandbox ${NAME}, ${sessions}, is not that folder by its real path`)
    } finally {
      rmSync(sessions)
      rmSync(join(away, '2026', '10', '17', `rollout-2026-10-17T00-00-00-${CODEX_UNHELD_THREAD}.jsonl`))
      renameSync(away, sessions)
    }
  }, 60_000)

  // Mutation: the output read by the path its start.json names, with no check of its real path: red, the round
  // started on what the link points at.
  it("refuses a run's output that is a link out of the sandbox's logs folder, naming the file and the rule", async () => {
    const agent = 'linked-out-round-worker'
    writeFileSync(join(scratch, 'linked-out-first.md'), 'Synthetic first thread of the linked output case.\n')
    writeFileSync(join(scratch, 'linked-out-round.md'), 'Synthetic round of the linked output case.\n')
    const earlier = await worker(agent, 'linked-out-first.md')
    const out = join(dir, 'logs', earlier.run, 'out')
    const elsewhere = join(scratch, 'linked-out-elsewhere.out')
    writeFileSync(elsewhere, readFileSync(out))
    rmSync(out)
    symlinkSync(elsewhere, out)
    await codexRefused(flags(agent, 'linked-out-round.md'), `Run ${earlier.run}'s output ${out} is not a file in ${join(dir, 'logs', earlier.run)} by its real path`)
  }, 60_000)

  // A RUN THE HOST'S LIST DOES NOT HOLD, as a run filed before the list was kept, or the first run of a line, started
  // from inside the sandbox, still holds a second start back while it runs: the ledger's open process row is of it, and
  // its record says it is this agent's, in this sandbox. Named by --continues, its own open process row holds the round
  // back with no start.json at all. Once it has ended, a round without --continues still chooses from the list alone,
  // and refuses; named by --continues, as the next-round door names the run it follows, it is continued. Mutations: the
  // liveness check reads the host's list alone: red, a second worker started beside the live run. A run the list does
  // not hold refused when --continues names it, as before round 62's fix round: red, at the last round.
  it("holds a second start back while a run the host's list does not hold still runs, and continues it once --continues names it", async () => {
    const agent = 'unlisted-round-worker'
    writeFileSync(join(scratch, 'unlisted-first.md'), 'Synthetic run of the unlisted case. KEEP RUNNING\n')
    writeFileSync(join(scratch, 'unlisted-next.md'), 'Synthetic next start of the unlisted case.\n')
    expect((await ask('POST', '/api/agents/started', { handle: agent, name: agent, role: 'worker', runtime: 'codex', workArea: ['src'] })).status).toBe(201)
    const earlier = await aWorkerStillRunning(agent, 'unlisted-first.md')
    const runs = join(sandboxes, '.run', NAME, 'runs')
    const entry = join(runs, `${earlier.run}.json`)
    const startFile = join(dir, 'logs', earlier.run, 'start.json')
    try {
      expect(existsSync(entry), "the host's list holds the run it filed").toBe(true)
      rmSync(entry)
      await codexRefused(['worker', NAME, '--agent', agent, '--runtime', 'codex', '--model', CODEX_MODEL, '--brief', join(scratch, 'unlisted-next.md')], `run ${earlier.run} of ${agent}, process row ${earlier.processRow}`)
      await codexRefused(flags(agent, 'unlisted-next.md'), 'is still running')
      const said = readFileSync(startFile)
      rmSync(startFile)
      try {
        const held = await codexRefused([...flags(agent, 'unlisted-next.md'), '--continues', earlier.run], `run ${earlier.run} of ${agent}, process row ${earlier.processRow}, host pid`)
        expect(held.err).toContain('is still running')
      } finally {
        writeFileSync(startFile, said)
      }
    } finally {
      await itEnds(earlier)
    }
    const ran = await codexRefused(flags(agent, 'unlisted-next.md'), `${agent} has no run in sandbox ${NAME} to continue`)
    expect(ran.err).toContain('round continues such a run only when --continues names it')
    expect(ran.err).toContain('node tools/sandbox.mjs worker')
    const listed = readdirSync(runs).filter((file) => file.endsWith('.json')).map((file) => JSON.parse(readFileSync(join(runs, file), 'utf8')) as { agent: string })
    expect(listed.filter((one) => one.agent === agent), "the host's list holds a run of the agent").toEqual([])
    const next = await round([...flags(agent, 'unlisted-next.md'), '--continues', earlier.run])
    await expectContinued(next, earlier, CODEX_THREAD)
  }, 60_000)

  // A RUN FILED BEFORE THE HOST'S LIST WAS KEPT is found from the office's own records: the ledger's open process rows,
  // and the record of each row's run, which says the agent and this sandbox's folder. No start.json is read, so one the
  // sandbox took away, or rewrote to name another agent and another row, changes nothing: the live run still holds a
  // second worker and a round back, named by its run and its process row (round 63, item 4). Mutation: the run found
  // from its start.json again: red, a second worker started beside the live run once its start.json was taken away.
  it("finds a live run the host's list does not hold from its record and the ledger, whatever its start.json says", async () => {
    const agent = 'pre-list-round-worker'
    writeFileSync(join(scratch, 'pre-list-first.md'), 'Synthetic run of the pre-list case. KEEP RUNNING\n')
    writeFileSync(join(scratch, 'pre-list-next.md'), 'Synthetic next start of the pre-list case.\n')
    expect((await ask('POST', '/api/agents/started', { handle: agent, name: agent, role: 'worker', runtime: 'codex', workArea: ['src'] })).status).toBe(201)
    const earlier = await aWorkerStillRunning(agent, 'pre-list-first.md')
    const entry = join(sandboxes, '.run', NAME, 'runs', `${earlier.run}.json`)
    const startFile = join(dir, 'logs', earlier.run, 'start.json')
    const said = readFileSync(startFile)
    const held = `run ${earlier.run} of ${agent}, process row ${earlier.processRow}, host pid`
    const aSecondWorker = ['worker', NAME, '--agent', agent, '--runtime', 'codex', '--model', CODEX_MODEL, '--brief', join(scratch, 'pre-list-next.md')]
    try {
      expect(existsSync(entry), "the host's list holds the run it filed").toBe(true)
      rmSync(entry)
      rmSync(startFile)
      expect((await codexRefused(aSecondWorker, held)).err).toContain('is still running')
      expect((await codexRefused(flags(agent, 'pre-list-next.md'), held)).err).toContain('is still running')
      writeFileSync(startFile, JSON.stringify({ ...JSON.parse(said.toString('utf8')), agent: 'somebody-else-round-worker', processRow: 'aRowNobodyHolds' }))
      expect((await codexRefused(aSecondWorker, held)).err).toContain('is still running')
      expect((await codexRefused(flags(agent, 'pre-list-next.md'), held)).err).toContain('is still running')
    } finally {
      writeFileSync(startFile, said)
      await itEnds(earlier)
    }
  }, 60_000)

  // ANOTHER AGENT'S LIVE RUN THE HOST'S LIST DOES NOT HOLD, filed in this sandbox, holds nothing of this agent's back:
  // the ledger's open process row is of it, and its record names this sandbox's folder, but another agent. This agent's
  // worker and its round both start while it runs (round 63's fix round). Mutation: the record's agent not asked of a
  // run the list does not hold: red, the other agent's live run holds this agent's worker back.
  it("another agent's live run in this sandbox that the host's list does not hold holds back neither this agent's worker nor its round", async () => {
    const agent = 'beside-unlisted-round-worker'
    const another = 'unlisted-other-round-worker'
    writeFileSync(join(scratch, 'beside-unlisted-other.md'), "Synthetic run of another agent, off the host's list. KEEP RUNNING\n")
    writeFileSync(join(scratch, 'beside-unlisted-first.md'), "Synthetic first thread beside another agent's unlisted run.\n")
    writeFileSync(join(scratch, 'beside-unlisted-round.md'), "Synthetic round beside another agent's unlisted run.\n")
    expect((await ask('POST', '/api/agents/started', { handle: another, name: another, role: 'worker', runtime: 'codex', workArea: ['src'] })).status).toBe(201)
    const theirs = await aWorkerStillRunning(another, 'beside-unlisted-other.md')
    const entry = join(sandboxes, '.run', NAME, 'runs', `${theirs.run}.json`)
    const kept = readFileSync(entry)
    try {
      rmSync(entry)
      const record = (await ask('GET', `/api/records/${theirs.run}`)).body.record.data
      expect([record.servingAgent, record.sandbox.folder]).toEqual([another, realpathSync(dir)])
      const row = (await ask('GET', `/api/resources?sessionRecordId=${encodeURIComponent(theirs.run)}`)).body.resources.find((one: any) => one.id === theirs.processRow)
      expect([row?.releasedAt, row?.liveness?.state]).toEqual([null, 'alive'])
      const own = await worker(agent, 'beside-unlisted-first.md')
      const next = await round(flags(agent, 'beside-unlisted-round.md'))
      await expectContinued(next, own, CODEX_THREAD)
    } finally {
      writeFileSync(entry, kept, { mode: 0o600 })
      await itEnds(theirs)
    }
  }, 60_000)

  // A RUN THE HOST'S LIST DOES NOT HOLD WHOSE RECORD CANNOT BE READ refuses a worker and a round: nobody can say whether
  // it is this agent's run in this sandbox. The open process row of a live run is made to name a run no record holds,
  // in this test's own database, since no door registers such a row (round 63's fix round). Mutation: that run skipped
  // instead of refused: red, a second worker started beside the live process.
  it("refuses a worker and a round while the run of an open process row, off the host's list, cannot be read", async () => {
    const agent = 'unreadable-run-round-worker'
    const nobodys = 'aRunNoRecordHolds'
    writeFileSync(join(scratch, 'unreadable-run-first.md'), 'Synthetic run of the unreadable record case. KEEP RUNNING\n')
    writeFileSync(join(scratch, 'unreadable-run-next.md'), 'Synthetic next start of the unreadable record case.\n')
    expect((await ask('POST', '/api/agents/started', { handle: agent, name: agent, role: 'worker', runtime: 'codex', workArea: ['src'] })).status).toBe(201)
    const earlier = await aWorkerStillRunning(agent, 'unreadable-run-first.md')
    const theRowNames = (run: string) => t.client.sqlite.prepare('UPDATE session_resources SET session_record_id = ? WHERE id = ?').run(run, earlier.processRow)
    const refused = `Run ${nobodys}, which the ledger's open process row ${earlier.processRow} is of, could not be read (`
    const why = `so nobody can say whether it is a run of ${agent} in sandbox ${NAME} that still runs. Nothing was started.`
    try {
      expect(theRowNames(nobodys).changes).toBe(1)
      expect((await ask('GET', `/api/records/${nobodys}`)).status).toBe(404)
      expect((await codexRefused(['worker', NAME, '--agent', agent, '--runtime', 'codex', '--model', CODEX_MODEL, '--brief', join(scratch, 'unreadable-run-next.md')], refused)).err).toContain(why)
      expect((await codexRefused(flags(agent, 'unreadable-run-next.md'), refused)).err).toContain(why)
    } finally {
      theRowNames(earlier.run)
      await itEnds(earlier)
    }
  }, 60_000)

  // THE HOST'S LIST IS IN THE ORDER ITS RUNS WERE FILED, by the moment and not by the words. An entry says when its run
  // was filed as the local time with its offset, and when the clocks go back a later run's words sort first: 01:10 at
  // +00:00 is 40 minutes after 01:30 at +01:00. An entry that does not say it with an offset is refused, never sorted.
  // Both entries are synthetic, and no run of them was filed. Mutations: the list sorted by the words of filedAt: red,
  // the round goes on to read the earlier run; the offset not asked of filedAt: red, the bare stamp is not refused.
  it("takes the run filed last by the moment it was filed, across the clocks going back", async () => {
    const agent = 'clock-change-round-worker'
    writeFileSync(join(scratch, 'clock-change-round.md'), 'Synthetic round of the clock change case.\n')
    expect((await ask('POST', '/api/agents/started', { handle: agent, name: agent, role: 'worker', runtime: 'codex', workArea: ['src'] })).status).toBe(201)
    const runs = join(sandboxes, '.run', NAME, 'runs')
    mkdirSync(runs, { recursive: true, mode: 0o700 })
    const entry = (run: string, filedAt: string, started: string | null): string => {
      const file = join(runs, `${run}.json`)
      writeFileSync(file, `${JSON.stringify({ run, agent, runtime: 'codex', filedAt, started, neverStarted: null, containerSession: null }, null, 2)}\n`, { mode: 0o600 })
      return file
    }
    const files = [
      entry('clockChangeEarlier', '2026-10-25T01:30:00.000+01:00', '2026-10-25T01:30:05.000+01:00'),
      entry('clockChangeLater', '2026-10-25T01:10:00.000+00:00', null),
    ]
    try {
      await codexRefused(flags(agent, 'clock-change-round.md'), `Run clockChangeLater, the last run of ${agent} on runtime codex in sandbox ${NAME}, was filed at 2026-10-25T01:10:00.000+00:00, and the host's list does not say the helper started it.`)
      files.push(entry('clockChangeBare', '2026-10-25 01:40:00', null))
      await codexRefused(flags(agent, 'clock-change-round.md'), `holds ${files[2]!}, which does not say the agent, the runtime and when the run was filed, as a local time with its offset.`)
    } finally {
      for (const file of files) rmSync(file, { force: true })
    }
  }, 60_000)

  // Mutation: status says nothing of where its processes come from: red.
  it("status gives the start.json files it lists as the runs' own words", async () => {
    const json = await sandbox(['status', NAME, '--json'])
    expect(json.status, json.err).toBe(0)
    const report = JSON.parse(json.out).reports[0]
    expect(report.processes.length).toBeGreaterThan(0)
    expect(report.processesFrom).toBe(
      `the start.json files under ${join(dir, 'logs')}: each is the run's own words, which a program in the sandbox can write. ` +
        "The ledger and liveness beside each are the office's own reading.",
    )
    const text = await sandbox(['status', NAME])
    expect(text.status, text.err).toBe(0)
    expect(text.out).toContain(`  processes, from ${report.processesFrom}`)
  }, 60_000)

  // A CONTAINER MADE AGAIN is registered under a new row, and the runs filed before it keep the old one: 40 rounds in
  // the office continued such a run by 17 October 2026. Mutation: only the current container row taken: red, this
  // round refused. Mutation: an older row of any container taken: red, the other sandbox's row taken.
  it("continues a run filed before the sandbox's container was made again, and refuses a row of another sandbox's container", async () => {
    const agent = 'recreated-round-worker'
    const otherName = 'rounds-elsewhere'
    writeFileSync(join(scratch, 'recreated-first.md'), 'Synthetic first thread of the recreated container case.\n')
    writeFileSync(join(scratch, 'recreated-round.md'), 'Synthetic round of the recreated container case.\n')
    const own = await worker(agent, 'recreated-first.md')
    const before = JSON.parse(readFileSync(join(dir, 'instance.json'), 'utf8')).containerRow as string
    const down = await sandbox(['down', NAME, '--json'])
    expect(down.status, down.err).toBe(0)
    const again = await sandbox(['up', fixtureTemplate, '--name', NAME, '--from', fixtureOrigin, '--no-dsh', '--json'])
    expect(again.status, again.err).toBe(0)
    const now = JSON.parse(again.out.trim()).resource as string
    expect(now).not.toBe(before)
    const rows = await ask('GET', `/api/resources?sessionRecordId=${encodeURIComponent(starterSession)}&includeReleased=true`)
    expect(rows.body.resources.find((row: any) => row.id === before)?.releasedAt).toEqual(expect.any(String))
    expect((await ask('GET', `/api/records/${own.run}`)).body.record.data.sandbox.container).toBe(before)

    const next = await round(flags(agent, 'recreated-round.md'))
    await expectContinued(next, own, CODEX_THREAD)

    // THE SAME RUN OFF THE LIST, named by --continues: its older row is looked for under the session that registered
    // this sandbox's current container, which registered the earlier one too. Mutation: the older row of a run the list
    // does not hold looked for under no session: red, this round refused.
    const ownEntry = join(sandboxes, '.run', NAME, 'runs', `${own.run}.json`)
    const keptEntry = readFileSync(ownEntry)
    rmSync(ownEntry)
    try {
      const offTheList = await round([...flags(agent, 'recreated-round.md'), '--continues', own.run])
      await expectContinued(offTheList, own, CODEX_THREAD)
    } finally {
      writeFileSync(ownEntry, keptEntry, { mode: 0o600 })
    }

    // ANOTHER SANDBOX'S CONTAINER ROW, released as the old row here is, on the same run's record, as the person may
    // correct it. The folder is still this sandbox's.
    const up = await sandbox(['up', fixtureTemplate, '--name', otherName, '--from', fixtureOrigin, '--no-dsh', '--json'])
    expect(up.status, up.err).toBe(0)
    const elsewhere = JSON.parse(up.out.trim()).resource as string
    expect((await sandbox(['down', otherName, '--json'])).status).toBe(0)
    const read = await ask('GET', `/api/records/${own.run}`)
    const corrected = await ask('PATCH', `/api/records/${own.run}`, { dataPatch: { sandbox: { ...read.body.record.data.sandbox, container: elsewhere } } }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    expect(corrected.status, JSON.stringify(corrected.body)).toBe(200)
    await codexRefused(
      [...flags(agent, 'recreated-round.md'), '--continues', own.run],
      `Run ${own.run} of ${agent} is on the host's list of sandbox ${NAME}, but its record says it was filed with the container row ${JSON.stringify(elsewhere)}, ` +
        `which is not this sandbox's current row ${JSON.stringify(now)}, and that row is the ledger row of the container mole-office-sandbox-${otherName}, ` +
        `not of this sandbox's container mole-office-sandbox-${NAME}. Nothing was started.`,
    )
    // AND OFF THE LIST, the same row is refused, by the run's id.
    rmSync(ownEntry)
    try {
      await codexRefused(
        [...flags(agent, 'recreated-round.md'), '--continues', own.run],
        `Run ${own.run} of ${agent}, which --continues names, is not on the host's list of sandbox ${NAME}, and its record says it was filed with the container row ${JSON.stringify(elsewhere)}, ` +
          `which is not this sandbox's current row ${JSON.stringify(now)}, and that row is the ledger row of the container mole-office-sandbox-${otherName}, ` +
          `not of this sandbox's container mole-office-sandbox-${NAME}. Nothing was started.`,
      )
    } finally {
      writeFileSync(ownEntry, keptEntry, { mode: 0o600 })
    }
  }, 120_000)
})

// Each case uses an origin and an instance clone of its own. Docker and the model remain stand-ins.
describe('local main before a run', () => {
  async function fixture(name: string, oldHelper = false): Promise<{ origin: string; folder: string; repo: string; old: string; next: string }> {
    const origin = join(scratch, `origin-${name}`)
    git(scratch, 'clone', '-q', fixtureOrigin, origin)
    git(origin, 'config', 'user.email', 'a-test@example.invalid')
    git(origin, 'config', 'user.name', 'A test')
    git(origin, 'config', 'commit.gpgsign', 'false')
    if (oldHelper) {
      rmSync(join(origin, 'tools'))
      mkdirSync(join(origin, 'tools'))
      for (const entry of readdirSync(join(REPO, 'tools'))) {
        if (entry !== 'sandbox-start.mjs') symlinkSync(join(REPO, 'tools', entry), join(origin, 'tools', entry))
      }
      writeFileSync(join(origin, 'tools', 'sandbox-start.mjs'), readFileSync(join(REPO, 'tools', 'sandbox-start.mjs'), 'utf8').replaceAll("'verbose'", "'legacy-verbose'").replaceAll("'stdin'", "'legacy-stdin'"))
    }
    writeFileSync(join(origin, '.gitignore'), 'node_modules\n')
    git(origin, 'add', '-A')
    git(origin, 'commit', '-q', '-m', 'ignore fixture dependencies')
    mkdirSync(join(origin, 'data'))
    mkdirSync(join(origin, 'node_modules', '.vite-temp'), { recursive: true })
    const up = await sandbox(['up', fixtureTemplate, '--name', name, '--from', origin, '--no-dsh', '--json'])
    expect(up.status, up.err).toBe(0)
    const folder = JSON.parse(up.out).folder as string
    const repo = join(folder, 'repo')
    const old = git(repo, 'rev-parse', 'refs/heads/main')
    writeFileSync(join(origin, 'ahead.txt'), 'synthetic origin change\n')
    if (oldHelper) writeFileSync(join(origin, 'tools', 'sandbox-start.mjs'), readFileSync(join(REPO, 'tools', 'sandbox-start.mjs')))
    git(origin, 'add', '-A')
    git(origin, 'commit', '-q', '-m', 'advance the fixture origin')
    return { origin, folder, repo, old, next: git(origin, 'rev-parse', 'refs/heads/main') }
  }

  /** A worker start in sandbox `name`, by default the worker's, with a brief named after the sandbox. */
  async function attempt(name: string, as: { agent?: string; brief?: string; env?: NodeJS.ProcessEnv; keepsTheRow?: boolean } = {}): Promise<Ran> {
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    const brief = join(scratch, `${as.brief ?? name}.md`)
    writeFileSync(brief, 'Synthetic fixture brief.\n')
    return sandbox(['worker', name, '--agent', as.agent ?? WORKER, '--model', OFFICE_MODEL, '--brief', brief, '--json'], null, as.env, as.keepsTheRow)
  }

  async function start(name: string): Promise<Ran> {
    const ran = await attempt(name)
    expect(ran.status, ran.err).toBe(0)
    expect(JSON.parse(ran.out).run).toEqual(expect.any(String))
    return ran
  }

  /** A refusal's first sentence is on stderr and the whole of it is in the details file that line names. */
  function theWholeRefusal(ran: Ran): string {
    const files = [...ran.err.matchAll(/Details: ([^\n]+)/g)].map((match) => match[1]!)
    return ran.err + files.map((file) => readFileSync(file, 'utf8')).join('\n')
  }

  /** Every run the made-up office holds, as their ids. */
  async function theRuns(): Promise<string[]> {
    const listed = await ask('GET', '/api/records?kind=session&limit=1000')
    expect(listed.status).toBe(200)
    return listed.body.records.map((r: { id: string }) => r.id).sort()
  }

  /**
   * AN EXPORTED NAME OR BOUND OF THE LAUNCHER, worked out from its own line, as launcherConstant does for a const: the
   * launcher runs its command when it is imported. A name the line is made of is read the same way, or taken from the
   * git helper's exports, which import as a module.
   */
  function launcherExport(name: string): unknown {
    const line = readFileSync(TOOL, 'utf8').split('\n').find((one) => one.startsWith(`export const ${name} = `) || one.startsWith(`const ${name} = `))
    if (line === undefined) throw new Error(`The launcher constant ${name} was not found`)
    const expression = line.slice(line.indexOf(' = ') + 3)
    const names = [...new Set(expression.match(/\b[A-Z][A-Z0-9_]+\b/g) ?? [])]
    const theirs = sandboxGit as Record<string, unknown>
    return runInNewContext(`(${expression})`, Object.fromEntries(names.map((one) => [one, Object.hasOwn(theirs, one) ? theirs[one] : launcherExport(one)])))
  }

  /** The last line of a refusal's details that names `what`: the refusal itself, which the launcher writes there whole. */
  function theRefusalNaming(ran: Ran, what: string): string {
    const files = new Set([...ran.err.matchAll(/Details: ([^\n]+)/g)].map((match) => match[1]!))
    const lines = [...files].flatMap((file) => readFileSync(file, 'utf8').split('\n')).filter((line) => line.includes(what))
    expect(lines, `no line of the details names ${what}: ${ran.err}`).not.toHaveLength(0)
    return lines.at(-1)!
  }

  /** Whether `text` names a wait of `ms` as a number of its own, in seconds or in milliseconds; no words are pinned. */
  function namesTheWait(text: string, ms: number): boolean {
    return [String(ms / 1000), String(ms)].some((number) => new RegExp(`(?<![\\d.])${number.replace('.', '\\.')}(?!\\.?\\d)`).test(text))
  }

  /** The waits the cases below shorten to, each below the launcher's own, which each case checks. */
  const A_SHORTENED_INDEX_LOCK_WAIT_MS = 1_200
  const A_SHORTENED_REFRESH_LOCK_WAIT_MS = 1_200
  /**
   * HOW LONG THE HELD FAST-FORWARD GOES ON after the second start copied its brief in, when that start has not ended by
   * then. Its refresh comes right after that copy, so this is far longer than the second start takes to reach its own
   * fast-forward without a refresh lock, and to be refused there after its shortened wait for git's index lock.
   */
  const THE_HOLD_AFTER_THE_SECOND_ARRIVES_MS = 3_000

  /**
   * A SMUDGE FILTER THAT HOLDS THE FIRST CHECKOUT OF ITS FILE, so a fast-forward keeps git's index lock while a case
   * starts a second start. Its first run makes the marker and waits, by Atomics.wait and not by load, until the release
   * file is there or a minute has gone. Every later run, as a worktree's checkout, passes the file through at once.
   */
  const HOLDS_THE_FAST_FORWARD = String.raw`const fs = require('fs')
const [marker, release] = process.argv.slice(2)
const bytes = fs.readFileSync(0)
let first = true
try { fs.writeFileSync(marker, String(process.pid), { flag: 'wx' }) } catch { first = false }
const pause = new Int32Array(new SharedArrayBuffer(4))
for (const end = Date.now() + 60_000; first && !fs.existsSync(release) && Date.now() < end;) Atomics.wait(pause, 0, 0, 50)
process.stdout.write(bytes)
`

  // Mutation: move the worker's refresh after the helper capability checks.
  it('uses the updated helper at the same start that fast-forwards main', async () => {
    const f = await fixture('main-helper', true)
    const helper = join(f.repo, 'tools', 'sandbox-start.mjs')
    expect(readFileSync(helper, 'utf8')).not.toContain("'verbose'")
    const ran = await start('main-helper')
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.next)
    expect(readFileSync(helper, 'utf8')).toBe(readFileSync(join(REPO, 'tools', 'sandbox-start.mjs'), 'utf8'))
    expect(ran.err).not.toContain('is older than this launcher')
    expect(ran.err).not.toContain('from before launch details')
    expect(ran.err).not.toContain('is from before --stdin')
    const run = JSON.parse(ran.out).run as string
    const details = readFileSync(join(f.folder, 'logs', run, 'launch.txt'), 'utf8')
    expect(details).toContain('was fast-forwarded')
    expect(details).not.toContain('is older than this launcher')
  })

  // Mutation: skip the fetch or skip the move.
  it('fetches and advances main quietly before a worker starts', async () => {
    const f = await fixture('main-ahead')
    // Exercise the update-ref path: main is not checked out in repo/.
    git(f.repo, 'checkout', '-q', '--detach')
    const ran = await start('main-ahead')
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.next)
    expect(git(f.repo, 'rev-parse', 'origin/main')).toBe(f.next)
    expect(git(f.repo, 'rev-parse', 'HEAD')).toBe(f.old)
    expect(ran.err).not.toContain('local main')
    const run = JSON.parse(ran.out).run as string
    expect(readFileSync(join(f.folder, 'logs', run, 'launch.txt'), 'utf8')).toContain('was fast-forwarded')
  })

  // Mutation: move main even when the two histories diverged.
  it('leaves diverged main unchanged and says so once while starting the worker', async () => {
    const f = await fixture('main-diverged')
    git(f.repo, 'config', 'user.email', 'a-test@example.invalid')
    git(f.repo, 'config', 'user.name', 'A test')
    git(f.repo, 'config', 'commit.gpgsign', 'false')
    writeFileSync(join(f.repo, 'local.txt'), 'synthetic local commit\n')
    git(f.repo, 'add', 'local.txt')
    git(f.repo, 'commit', '-q', '-m', 'a local fixture change')
    const local = git(f.repo, 'rev-parse', 'refs/heads/main')
    const ran = await start('main-diverged')
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(local)
    expect(ran.err.split('\n').filter((line) => line.includes('local main'))).toHaveLength(1)
    expect(ran.err).toContain('have diverged')
  })

  // A CHECKED-OUT MAIN WITH A CHANGE TO A TRACKED FILE CANNOT MOVE, and a start on it would run the older helper against
  // the office as it is now. A worker's start and an agent's exec are refused before a run is filed, and say why.
  // Mutation MAIN_STUCK_STARTS: main left as it is and the start going on, as before, and this goes red.
  it('refuses an agent start before a run is filed while checked-out main has a change to a tracked file, and says why', async () => {
    const f = await fixture('main-dirty')
    writeFileSync(join(f.repo, 'README.md'), 'synthetic uncommitted change\n')
    const before = await theRuns()
    const first = `local main in ${f.repo} cannot be moved to main of ${f.origin}: its working tree changes files main tracks: README.md.`
    const because = `${first} This start would run the helper of ${f.old}, one commit behind it, so nothing was started or filed. ` +
      `Move, commit or remove what stops it in ${f.repo}, then start again.`
    const ran = await attempt('main-dirty')
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain(first)
    expect(theWholeRefusal(ran)).toContain(because)
    const asAnAgent = await sandbox(['exec', 'main-dirty', '--agent', WORKER, '--runtime', 'claude-code', '--', 'true'])
    expect(asAnAgent.status, asAnAgent.err).toBe(2)
    expect(asAnAgent.err).toContain(first)
    expect(theWholeRefusal(asAnAgent)).toContain(because)
    expect(await theRuns()).toEqual(before)
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.old)
    expect(readFileSync(join(f.repo, 'README.md'), 'utf8')).toBe('synthetic uncommitted change\n')
  })

  // AN UNTRACKED FOLDER THAT MAIN DOES NOT TRACK IS NO CHANGE for this purpose, so main moves past it and the start goes
  // on, on the current helper. Mutation UNTRACKED_STOPS_MAIN: untracked paths counted as changes, and this goes red.
  it('fast-forwards checked-out main past an untracked folder that main does not track', async () => {
    const f = await fixture('main-untracked')
    mkdirSync(join(f.repo, 'made-up-notes'))
    writeFileSync(join(f.repo, 'made-up-notes', 'notes.txt'), 'synthetic untracked notes\n')
    const ran = await start('main-untracked')
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.next)
    expect(readFileSync(join(f.repo, 'made-up-notes', 'notes.txt'), 'utf8')).toBe('synthetic untracked notes\n')
    expect(ran.err).not.toContain('local main')
  })

  // AN UNTRACKED FILE WHERE MAIN ADDS ONE is git's to refuse: the fast-forward would write over it. The start is refused
  // before a run is filed, with git's own words, and the file is kept. Mutation MAIN_STUCK_STARTS turns this red too.
  it('refuses an agent start before a run is filed when git will not write over an untracked file, and says what git said', async () => {
    const f = await fixture('main-in-the-way')
    writeFileSync(join(f.repo, 'ahead.txt'), 'a synthetic untracked file where main adds one\n')
    const before = await theRuns()
    const ran = await attempt('main-in-the-way')
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain(`local main in ${f.repo} cannot be moved to main of ${f.origin}: the fast-forward in its container was refused (`)
    expect(ran.err).toMatch(/would be overwritten by merge: ahead\.txt /)
    expect(theWholeRefusal(ran)).toContain(`This start would run the helper of ${f.old}, one commit behind it, so nothing was started or filed.`)
    expect(await theRuns()).toEqual(before)
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.old)
    expect(readFileSync(join(f.repo, 'ahead.txt'), 'utf8')).toBe('a synthetic untracked file where main adds one\n')
  })

  // Mutation: proceed after a failed fetch, using the commit read in the checkout the sandbox was made from.
  it('leaves main unchanged after a failed fetch and says so once', async () => {
    const f = await fixture('main-unreachable')
    // The fetch must move origin/main, and git cannot take the lock of that ref, so the fetch fails.
    mkdirSync(join(f.repo, '.git', 'refs', 'remotes', 'origin'), { recursive: true })
    writeFileSync(join(f.repo, '.git', 'refs', 'remotes', 'origin', 'main.lock'), '')
    const ran = await start('main-unreachable')
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.old)
    expect(ran.err.split('\n').filter((line) => line.includes('local main'))).toHaveLength(1)
    expect(ran.err).toContain(`the fetch of main from ${f.origin} failed`)
  })

  /** Another repository, with the fixture's history and one commit of its own past main: a folder the sandbox may name. */
  function elsewhere(f: { origin: string }, name: string): { folder: string; theirs: string } {
    const folder = join(scratch, `elsewhere-${name}`)
    git(scratch, 'clone', '-q', f.origin, folder)
    git(folder, 'config', 'user.email', 'a-test@example.invalid')
    git(folder, 'config', 'user.name', 'A test')
    git(folder, 'config', 'commit.gpgsign', 'false')
    writeFileSync(join(folder, 'elsewhere.txt'), 'a commit only the other folder has\n')
    git(folder, 'add', '-A')
    git(folder, 'commit', '-q', '-m', 'a commit only the other folder has')
    return { folder, theirs: git(folder, 'rev-parse', 'refs/heads/main') }
  }

  // THE CLONE'S CONFIG IS THE SANDBOX'S TO WRITE, so its origin may name any folder on the host. Mutation: fetch the
  // clone's origin, as before; origin/main and the other folder's commit go red.
  it("fetches main from the checkout the sandbox was made from, never from the folder the clone's origin names", async () => {
    const f = await fixture('main-elsewhere')
    const other = elsewhere(f, 'main-elsewhere')
    git(f.repo, 'remote', 'set-url', 'origin', other.folder)
    const ran = await start('main-elsewhere')
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.next)
    expect(git(f.repo, 'rev-parse', 'refs/remotes/origin/main')).toBe(f.next)
    expect(() => git(f.repo, 'cat-file', '-e', `${other.theirs}^{commit}`)).toThrow()
    expect(ran.err).not.toContain('local main')
  })

  // AND A REWRITE OF THE ADDRESS IN THE CLONE'S CONFIG, which git applies to an address given by its path too. Mutation:
  // the address check taken out; the fetch goes to the other folder and main moves.
  it("leaves main as it is, and fetches nothing, when the clone's config rewrites the checkout's address", async () => {
    const f = await fixture('main-rewritten')
    const other = elsewhere(f, 'main-rewritten')
    git(f.repo, 'config', `url.${other.folder}.insteadOf`, f.origin)
    const ran = await start('main-rewritten')
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.old)
    expect(() => git(f.repo, 'cat-file', '-e', `${other.theirs}^{commit}`)).toThrow()
    expect(ran.err.split('\n').filter((line) => line.includes('local main'))).toHaveLength(1)
    expect(ran.err).toContain(`the clone's config rewrites the address ${f.origin} to ${other.folder}, so nothing was fetched`)
  })

  // Mutation: refresh for plain exec too.
  it('does not fetch for a plain exec command', async () => {
    const f = await fixture('main-plain')
    const ran = await sandbox(['exec', 'main-plain', '--wait', '--plain-env', '--', ENDS_AT_ONCE])
    expect(ran.status, ran.err).toBe(0)
    expect(git(f.repo, 'rev-parse', 'origin/main')).toBe(f.old)
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.old)
    expect(ran.err).not.toContain('local main')
  })

  // Mutation: skip creating a missing main.
  it('creates missing main at the fetched origin tip before a worker starts', async () => {
    const f = await fixture('main-missing')
    git(f.repo, 'worktree', 'add', '-q', '-b', WORKER, join(f.folder, 'worktrees', WORKER), 'HEAD')
    git(f.repo, 'checkout', '-q', '--detach')
    git(f.repo, 'branch', '-D', 'main')
    const ran = await start('main-missing')
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.next)
    expect(ran.err).not.toContain('local main')
  })

  // Mutation: omit the merge on the checked-out, clean path.
  it('fast-forwards checked-out clean main before a worker starts', async () => {
    const f = await fixture('main-clean')
    const ran = await start('main-clean')
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.next)
    expect(readFileSync(join(f.repo, 'ahead.txt'), 'utf8')).toBe('synthetic origin change\n')
    expect(ran.err).not.toContain('local main')
  })

  // TWO STARTS AT ONCE ON ONE SANDBOX'S MAIN, by two agents, while main is checked out and behind. The first start's
  // fast-forward is held inside git, with git's index lock taken, by a smudge filter on the file main adds: a wait, not
  // load. The second start is started only once that filter runs, and the filter lets go once the second start has
  // ended, or a while after it copied its brief in. Both are given a shortened wait for git's index lock, so without the
  // refresh lock the second meets the first's index lock, waits less than the hold, and is refused.
  // Mutation: the refresh lock never taken, and the second start is refused.
  it("lets two starts that refresh one sandbox's main at once both go on, one refresh after the other", async () => {
    const name = 'main-together'
    const f = await fixture(name)
    const beside = 'round-worker-beside'
    const registered = await ask('POST', '/api/agents/started', { handle: beside, name: beside, role: 'worker', runtime: 'claude-code', workArea: ['src'] })
    expect(registered.status, JSON.stringify(registered.body)).toBe(201)
    const holds = join(scratch, `${name}-holds`)
    mkdirSync(holds)
    const marker = join(holds, 'held')
    const release = join(holds, 'let-go')
    const filter = join(holds, 'hold.cjs')
    writeFileSync(filter, HOLDS_THE_FAST_FORWARD)
    git(f.repo, 'config', 'filter.hold-the-fast-forward.smudge', [process.execPath, filter, marker, release].map((word) => JSON.stringify(word)).join(' '))
    writeFileSync(join(f.repo, '.git', 'info', 'attributes'), 'ahead.txt filter=hold-the-fast-forward\n')
    const env = { SANDBOX_INDEX_LOCK_WAIT_MS: String(A_SHORTENED_INDEX_LOCK_WAIT_MS) }
    const before = await theRuns()
    const startedBefore = new Set(groups)
    const startedAt = Date.now()
    const first = attempt(name, { brief: `${name}-first`, env })
    await until("the first start's fast-forward to reach the held file", () => existsSync(marker), 60_000)
    const firstPids = [...groups].filter((one) => !startedBefore.has(one))
    // THE REFRESH LOCK WHILE THE FIRST START HOLDS IT. A failure to read it is kept and thrown after the two starts'
    // outcomes, so that a red run says first which start failed and how.
    let held: { mode: number; bytes: string } | Error
    try {
      const file = join(theHostOnlyFolder(f.folder), String(launcherExport('THE_REFRESH_LOCK')))
      held = { mode: statSync(file).mode & 0o777, bytes: readFileSync(file, 'utf8') }
    } catch (error) {
      held = error instanceof Error ? error : new Error(String(error))
    }
    let secondEnded = false
    // The second start leaves the casting row as the first start's keep left it, at the same runtime and model: a
    // change to the row after the first start selected it would refuse the first start's recheck of it.
    const second = attempt(name, { agent: beside, brief: `${name}-second`, env, keepsTheRow: false }).then((ran) => {
      secondEnded = true
      return ran
    })
    await until('the second start to copy its brief in, right before its refresh', () => readdirSync(join(f.folder, 'briefs')).some((one) => one.endsWith(`-${name}-second.md`)), 60_000)
    const arrived = Date.now()
    await until('the second start to end, or the hold to go on a while', () => secondEnded || Date.now() - arrived >= THE_HOLD_AFTER_THE_SECOND_ARRIVES_MS, 60_000)
    writeFileSync(release, '')
    const [ranFirst, ranSecond] = await Promise.all([first, second])
    expect(ranSecond.status, theWholeRefusal(ranSecond)).toBe(0)
    expect(ranFirst.status, theWholeRefusal(ranFirst)).toBe(0)
    const runs = [ranFirst, ranSecond].map((ran) => JSON.parse(ran.out).run as string)
    expect(runs[0]).not.toBe(runs[1])
    expect((await theRuns()).filter((one) => !before.includes(one)).sort()).toEqual([...runs].sort())
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.next)
    expect(readFileSync(join(f.repo, 'ahead.txt'), 'utf8')).toBe('synthetic origin change\n')
    // The lock was made by the first start, with mode 600, and held its process number and the time it was made alone.
    if (held instanceof Error) throw held
    expect(held.mode.toString(8)).toBe('600')
    expect(firstPids).toHaveLength(1)
    const lock = JSON.parse(held.bytes) as Record<string, unknown>
    expect(Object.keys(lock)).toHaveLength(2)
    expect(Object.values(lock)).toContain(firstPids[0])
    const made = momentOfAnInstant(String(Object.values(lock).find((one) => one !== firstPids[0])))
    expect(made).not.toBeNull()
    expect(made!).toBeGreaterThanOrEqual(startedAt - 1_000)
    expect(made!).toBeLessThanOrEqual(Date.now())
    // Neither start left a lock behind.
    expect(existsSync(join(theHostOnlyFolder(f.folder), String(launcherExport('THE_REFRESH_LOCK'))))).toBe(false)
    expect(existsSync(join(f.repo, '.git', 'index.lock'))).toBe(false)
    expect(A_SHORTENED_INDEX_LOCK_WAIT_MS).toBeLessThan(Number(launcherExport('THE_INDEX_LOCK_WAIT_MS')))
  }, 120_000)

  // GIT'S INDEX LOCK LEFT IN repo/ by something else, while main is checked out and behind: the start waits for it the
  // shortened while, never removes it, and is refused before a run is filed, naming the lock and the wait.
  // Mutation: no wait for git's index lock, and the refusal names no wait.
  it("refuses a start before a run is filed when git's index lock stays past the wait, and leaves the lock", async () => {
    const f = await fixture('main-index-locked')
    const lock = join(f.repo, '.git', 'index.lock')
    writeFileSync(lock, '')
    const before = await theRuns()
    const startedAt = Date.now()
    const ran = await attempt('main-index-locked', { env: { SANDBOX_INDEX_LOCK_WAIT_MS: String(A_SHORTENED_INDEX_LOCK_WAIT_MS) } })
    const took = Date.now() - startedAt
    expect(ran.status, ran.err).toBe(2)
    expect(await theRuns()).toEqual(before)
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.old)
    expect(readFileSync(lock, 'utf8')).toBe('')
    const refusal = theRefusalNaming(ran, lock)
    expect(namesTheWait(refusal, A_SHORTENED_INDEX_LOCK_WAIT_MS), refusal).toBe(true)
    expect(took).toBeGreaterThanOrEqual(A_SHORTENED_INDEX_LOCK_WAIT_MS)
    expect(A_SHORTENED_INDEX_LOCK_WAIT_MS).toBeLessThan(Number(launcherExport('THE_INDEX_LOCK_WAIT_MS')))
  }, 60_000)

  // A REFRESH LOCK NOBODY LETS GO OF, made here as a start that was stopped in its refresh would leave it: a start waits
  // the shortened while, is refused before a run is filed, and leaves the file as it was. Once the lock names a process
  // that runs, this test's own, and once a process this test started and saw end. Which of the two it is, is told apart
  // by comparing the two refusals with every number taken out of each: they must differ, so no words are pinned, and
  // only words can make them differ. Both locks hold the same time, so that a refusal that names it reads alike.
  // Mutations: the refusal says nothing of the process, and red; the waiting start removes the file, and red.
  it('refuses a start before a run is filed while a refresh lock stays past the wait, says whose it is, and leaves it', async () => {
    const name = 'main-refresh-held'
    const f = await fixture(name)
    const folder = theHostOnlyFolder(f.folder)
    mkdirSync(folder, { recursive: true, mode: 0o700 })
    const file = join(folder, String(launcherExport('THE_REFRESH_LOCK')))
    const ended = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
    const endedPid = ended.pid!
    await new Promise((done) => ended.on('exit', done))
    const endedIs = (() => { try { process.kill(endedPid, 0); return 'running' } catch (error) { return (error as NodeJS.ErrnoException).code } })()
    expect(endedIs).toBe('ESRCH')
    const said: string[] = []
    const madeAt = clockStamp().instant
    for (const pid of [process.pid, endedPid]) {
      const bytes = JSON.stringify({ pid, madeAt }) + '\n'
      writeFileSync(file, bytes, { mode: 0o600 })
      const before = await theRuns()
      const ran = await attempt(name, { env: { SANDBOX_REFRESH_LOCK_WAIT_MS: String(A_SHORTENED_REFRESH_LOCK_WAIT_MS) } })
      expect(ran.status, ran.err).toBe(2)
      expect(await theRuns()).toEqual(before)
      expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.old)
      expect(readFileSync(file, 'utf8')).toBe(bytes)
      const refusal = theRefusalNaming(ran, file)
      expect(refusal).toMatch(new RegExp(`(?<!\\d)${String(pid)}(?!\\d)`))
      expect(namesTheWait(refusal, A_SHORTENED_REFRESH_LOCK_WAIT_MS), refusal).toBe(true)
      said.push(refusal.replace(/\d+/g, '#'))
    }
    expect(said[0], 'the two refusals do not tell a process that runs from one that has ended').not.toBe(said[1])
    expect(A_SHORTENED_REFRESH_LOCK_WAIT_MS).toBeLessThan(Number(launcherExport('THE_REFRESH_LOCK_WAIT_MS')))
  }, 60_000)
})

// 'forward' has the named-worktree prior, so a named-worktree prior and a changed lockfile run together in one case.
// 'source-already-at-cut' runs a changed lockfile after a worktree prior.
for (const scenario of [
  { name: 'forward', prior: 'named-worktree', installed: '1.0.0', cut: '2.0.0' },
  { name: 'unchanged', prior: 'named-worktree', installed: '1.0.0', cut: '1.0.0' },
  { name: 'source-already-at-cut', prior: 'worktree', installed: '1.0.0', cut: '2.0.0' },
  { name: 'missing-install-marker', prior: 'named-worktree', installed: '1.0.0', cut: '1.0.0' },
]) it(`starts a fresh repair with ${scenario.name} packages and preserves its sealed ${scenario.prior} directory`, async () => {
  const { prior } = scenario
  const source = join(scratch, `package-source-${scenario.name}`)
  git(fixtureOrigin, 'clone', '-q', '--no-hardlinks', fixtureOrigin, source)
  mkdirSync(join(source, 'data'))
  mkdirSync(join(source, 'node_modules', '.vite-temp'), { recursive: true })
  git(source, 'config', 'user.name', 'Synthetic fixture')
  git(source, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(source, '.gitignore'), 'node_modules\n')
  for (const [file, text] of Object.entries(aMadeUpPackage(scenario.installed))) writeFileSync(join(source, file), text)
  git(source, 'add', '.'); git(source, 'commit', '-qm', 'Synthetic installed packages')
  const name = `package-repair-${scenario.name}`
  const up = await sandbox(['up', fixtureTemplate, '--name', name, '--from', source, '--no-dsh', '--json'])
  expect(up.status, up.err).toBe(0)
  const dir = JSON.parse(up.out.trim()).folder as string
  // The round start reads the line's two rule files from this sandbox's briefs folder, and beforeAll writes them only
  // into the shared sandbox. A fresh round checks CODE.md against its own new worktree, made at its cut.
  for (const file of RULE_FILES.filter(one => one !== 'CODE.md')) writeFileSync(join(dir, 'briefs', file), ROUND_START_RULES[file])
  const repo = join(dir, 'repo')
  const installedCopy = dirname(realpathSync(join(repo, 'node_modules')))
  const installedHash = basename(installedCopy)
  const installedLock = readFileSync(join(installedCopy, 'package-lock.json'), 'utf8')
  expect(installedLock).toBe(aMadeUpPackage(scenario.installed)['package-lock.json'])
  expect(existsSync(join(installedCopy, 'installed'))).toBe(true)

  const ended = (hostPid: number) => until('the synthetic runtime to exit', () => { try { process.kill(hostPid, 0); return false } catch { return true } })
  const handle = `fresh-repair-${scenario.name}`
  expect((await ask('POST', '/api/agents/started', { handle, name: 'Synthetic repair line', role: 'worker', runtime: 'claude-code', workArea: ['src'] })).status).toBe(201)
  writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=synthetic-token\n', { mode: 0o600 })
  const brief = join(scratch, 'fresh-repair.md'); writeFileSync(brief, 'Synthetic fresh repair.\n')
  // A run started by hand works in a worktree it names, never in the sandbox's shared checkout.
  const first = await sandbox(prior === 'named-worktree'
    ? ['exec', name, '--agent', handle, '--runtime', 'claude-code', '--model', OFFICE_MODEL, '--worktree', join(dir, 'worktrees', `${handle}-named`), '--cut-from', 'main', '--json', '--', ENDS_AT_ONCE]
    : ['worker', name, '--agent', handle, '--model', OFFICE_MODEL, '--brief', brief, '--json'])
  expect(first.status, first.err).toBe(0)
  const old = JSON.parse(first.out.trim()); groups.add(old.hostPgid); await ended(old.hostPid)
  const record = (await ask('GET', `/api/records/${old.run}`)).body.record
  const sealed = record.data.workingDirectory
  const snap = () => ({ head: git(sealed, 'rev-parse', 'HEAD'), status: git(sealed, 'status', '--porcelain=v1', '--untracked-files=all'), bytes: readFileSync(join(sealed, 'README.md'), 'utf8'), lockfile: readFileSync(join(sealed, 'package-lock.json'), 'utf8'), manifest: readFileSync(join(sealed, 'package.json'), 'utf8'), packages: realpathSync(join(sealed, 'node_modules')), packageLink: readlinkSync(join(sealed, 'node_modules')) })
  t.api.patchRecord(old.run, { dataPatch: { state: 'finished' } }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  expect(t.api.getRecord(old.run)!.data.sealedTip).toEqual(expect.any(String))
  const checker = `pending-checker-${scenario.name}`
  const registered = await ask('POST', '/api/agents/started', { handle: checker, name: 'Synthetic pending inspector', role: 'inspector' }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
  const message = t.api.createRecord({ kind: 'message', title: 'Synthetic pending check', workspaceId: WORKSPACE, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, origin: 'fixture', data: { body: 'Synthetic check request awaiting a verdict.', to: [{ kind: 'agent', id: registered.body.agent.id }] } }).id
  const pendingCheck = { askedAt: nowStamp(), askedOf: checker, message, checkout: { directory: sealed, cutFrom: record.data.cutFrom }, says: 'Synthetic check request awaiting a verdict.' }
  t.client.sqlite.prepare("UPDATE records SET data=json_set(data, '$.theCheck', json(?)) WHERE id=?").run(JSON.stringify(pendingCheck), old.run)
  expect((await import('../src/server/lib/inspection.ts')).theCheckAskedFor(t.api.getRecord(old.run)!)).toEqual(pendingCheck)
  // Source files can already match the cut while node_modules still comes from an older install.
  // The installed marker is also required: a matching directory name alone proves no successful install.
  if (scenario.name === 'source-already-at-cut') {
    for (const [file, text] of Object.entries(aMadeUpPackage(scenario.cut))) writeFileSync(join(repo, file), text)
  }
  if (scenario.name === 'missing-install-marker') rmSync(join(installedCopy, 'installed'))
  const before = snap()
  const repoBefore = { head: git(repo, 'rev-parse', 'HEAD'), status: git(repo, 'status', '--porcelain=v1', '--untracked-files=all'), lockfile: readFileSync(join(repo, 'package-lock.json'), 'utf8'), packages: readlinkSync(join(repo, 'node_modules')) }
  const copyBefore = { lockfile: installedLock, bytes: readFileSync(join(installedCopy, 'node_modules', 'a-made-up-package', 'index.js'), 'utf8') }
  const mirror = git(repo, 'config', '--get', 'remote.origin.url')
  const mirrorBefore = git(mirror, 'rev-parse', 'refs/heads/main')
  const callsBefore = theNpmCalls(fakes).length
  // Replay a separate original tip onto main after another main change; the repair must use the replay.
  git(source, 'switch', '-qc', `synthetic-original-repair-${prior}`)
  writeFileSync(join(source, 'repair-original.txt'), `synthetic original ${prior}\n`); git(source, 'add', '.'); git(source, 'commit', '-qm', 'Original entry')
  const original = git(source, 'rev-parse', 'HEAD')
  git(source, 'switch', '-q', 'main');
  for (const [file, text] of Object.entries(aMadeUpPackage(scenario.cut))) writeFileSync(join(source, file), text)
  writeFileSync(join(source, 'repair-main.txt'), `synthetic main ${prior}\n`); git(source, 'add', '.'); git(source, 'commit', '-qm', 'Main before landing')
  git(source, 'cherry-pick', original); const landed = git(source, 'rev-parse', 'HEAD')
  expect(landed).not.toBe(original)
  const fresh = join(dir, 'worktrees', `synthetic-fresh-repair-${prior}`)
  const args = ['round', name, '--agent', handle, '--model', OFFICE_MODEL, '--brief', brief, '--continues', old.run, '--worktree', fresh, '--cut-from', landed, '--json']
  const started = await sandbox(args)
  expect(started.status, started.err).toBe(0)
  const round = JSON.parse(started.out.trim()); groups.add(round.hostPgid); await ended(round.hostPid)
  const data = (await ask('GET', `/api/records/${round.run}`)).body.record.data
  expect(round.run).not.toBe(old.run)
  expect(data.workingDirectory).toBe(fresh)
  expect(data.cutFrom).toBe(landed)
  expect(git(fresh, 'rev-parse', 'HEAD')).toBe(landed)
  const supplied = JSON.parse(readFileSync(join(dir, 'out', `claude-${round.run}.json`), 'utf8'))
  expect(supplied.argv).not.toContain('--continue')
  const cutLock = aMadeUpPackage(scenario.cut)['package-lock.json']
  const cutHash = createHash('sha256').update(cutLock).digest('hex').slice(0, installedHash.length)
  const calls = theNpmCalls(fakes).slice(callsBefore)
  const refresh = scenario.installed !== scenario.cut || scenario.name === 'missing-install-marker'
  expect(calls).toHaveLength(refresh ? 1 : 0)
  if (refresh) {
    // The exact length assertion guarantees this call; its matcher does not narrow indexed reads.
    expect(calls[0]!.lockfile).toBe(cutLock)
    expect(calls[0]!.cwd).toBe(join(dirname(installedCopy), cutHash))
    expect(calls[0]!.home).toBe(join(dir, 'home'))
  }
  const selected = dirname(realpathSync(join(fresh, 'node_modules')))
  expect(basename(selected)).toBe(cutHash)
  expect(readFileSync(join(selected, 'package-lock.json'), 'utf8')).toBe(cutLock)
  expect(existsSync(join(selected, 'installed'))).toBe(true)
  const startLine = readFileSync(join(dir, 'logs', round.run, 'launch.txt'), 'utf8').split('\n').find(line => line.startsWith('sandbox: round:'))
  expect(startLine).toMatch(refresh ? /packages refreshed/ : /packages skipped/)
  expect(startLine).toContain(cutHash)
  expect(git(mirror, 'rev-parse', 'refs/heads/main')).toBe(mirrorBefore)
  expect({ head: git(repo, 'rev-parse', 'HEAD'), status: git(repo, 'status', '--porcelain=v1', '--untracked-files=all'), lockfile: readFileSync(join(repo, 'package-lock.json'), 'utf8'), packages: readlinkSync(join(repo, 'node_modules')) }).toEqual(repoBefore)
  expect({ lockfile: readFileSync(join(installedCopy, 'package-lock.json'), 'utf8'), bytes: readFileSync(join(installedCopy, 'node_modules', 'a-made-up-package', 'index.js'), 'utf8') }).toEqual(copyBefore)
  expect(snap()).toEqual(before)
  expect(t.api.getRecord(old.run)!.data.theCheck).toEqual(pendingCheck)
  const refused = await sandbox(args.map(word => word === fresh ? sealed : word))
  expect(refused.status).not.toBe(0)
  expect(snap()).toEqual(before)
  const notMain = await sandbox(args.map(word => word === fresh ? fresh + '-off-main' : word === landed ? original : word))
  expect(notMain.status).not.toBe(0)
  expect(existsSync(fresh + '-off-main')).toBe(false)
  expect(snap()).toEqual(before)
  console.info('REPAIR_LAUNCH_PROOF ' + JSON.stringify({ path: `real-round-cli-${scenario.name}`, installedHash, cutHash, selected, packageCalls: calls, startLine, mirrorBefore, mirrorAfter: git(mirror, 'rev-parse', 'refs/heads/main'), repoBefore, repoAfter: { head: git(repo, 'rev-parse', 'HEAD'), status: git(repo, 'status', '--porcelain=v1', '--untracked-files=all'), lockfile: readFileSync(join(repo, 'package-lock.json'), 'utf8'), packages: readlinkSync(join(repo, 'node_modules')) }, originalTip: original, landed, run: round.run, worktree: data.workingDirectory, cutFrom: data.cutFrom, head: git(fresh, 'rev-parse', 'HEAD'), sealedBefore: before, sealedAfter: snap(), pendingCheckPreserved: JSON.stringify(t.api.getRecord(old.run)!.data.theCheck) === JSON.stringify(pendingCheck) }))
}, 120_000)
