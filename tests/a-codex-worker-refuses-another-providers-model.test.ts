// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CODEX WORKER REFUSES ANOTHER PROVIDER'S MODEL IN ITS WHOLE RUN.
 *
 * The owner's goal is that any model, variant and thinking level works from Casting data, with no code change. A start
 * with no native selection goes by src/config/launcher-model-compatibility.json, whose aliases are not per runtime, so
 * `anthropic/claude-opus-5-5` passes the compatibility check for a Codex start. The launcher itself then refuses it, with
 * exit 2, in theNameCodexTakes: a Codex worker refuses a model that is not under the provider its data file names. This
 * file runs the real `worker` command as far as that refusal, and shows that nothing was started and no run was filed.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database. The sandbox is a real sandbox
 * folder made by the real launcher from a synthetic checkout, with the fake docker and devcontainer CLI the launcher
 * tests use, so nothing runs in a real container. The brief and the sandbox's Codex login are synthetic files, labelled
 * where they are written.
 */
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { FAKE_DEVCONTAINER, FAKE_DF, FAKE_DOCKER, FAKE_DU, FAKE_FREE, startsOf, theFakeMachine, theFakeState } from './sandbox-stand-ins.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { aTestAddress } from './the-test-commit-address.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const NAME = 'codex-refusal'
const STARTER = 'codex-refusal-starter'
const WORKER = 'codex-refusal-worker'
/** In the compatibility list's aliases, which are not per runtime. */
const MODEL = 'anthropic/claude-opus-5-5'

/** The provider Codex's own program runs, read from the one data file that says it. */
function theProviderOfCodex(): string {
  const runtimes = JSON.parse(readFileSync(join(REPO, 'src/config/runtime-native-providers.json'), 'utf8')) as Record<string, { provider?: unknown }>
  const provider = runtimes['codex']?.provider
  expect(typeof provider, 'the provider of codex in runtime-native-providers.json').toBe('string')
  return provider as string
}

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

let t: TestDb
let res: ResourcesLib
let app: FastifyInstance
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let dir = ''
let starterSession = ''

/** Every process group a test started, stopped at the end if its leader still works in the scratch. */
const groups = new Set<number>()

const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()

/** The tool as its own process, as the starter, with only the caller's own settings cleared, asking the office at `office`. */
async function sandbox(args: string[], office = api): Promise<{ status: number; out: string; err: string }> {
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
    FAKE_DOCKER_DIR: fakes,
    MOLE_OFFICE_AGENT: STARTER,
    MOLE_OFFICE_SESSION: starterSession,
    MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
  }
  delete env['MOLE_AGENT_KEY']
  return new Promise((done) => {
    // THE OFFICE OPTIONS GO BEFORE A COMMAND AFTER `--`, which is the command's own.
    const own = ['--sandboxes', sandboxes, '--api', office, '--workspace', WORKSPACE]
    const at = args.indexOf('--')
    const words = at < 0 ? [...args, ...own] : [...args.slice(0, at), ...own, ...args.slice(at)]
    const child = spawn(process.execPath, [TOOL, ...words], { env, detached: true })
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
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

/** Every run this office holds, by id, in a stable order. */
async function theRuns(): Promise<string[]> {
  const read = await ask('GET', '/api/records?kind=session&limit=1000')
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return (read.body.records as { id: string }[]).map((one) => one.id).sort()
}

/** How many times the stand-in docker was asked to exec something. Nothing is filed or started without one. */
function execCalls(): number {
  return theFakeState(fakes).calls.filter((call) => call.tool === 'docker' && call.argv[0] === 'exec').length
}

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-codex-refusal-'))
  sandboxes = join(scratch, 'sandboxes')
  fakes = join(scratch, 'fakes')
  const secrets = join(scratch, 'sandbox-secrets.env')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))

  // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/, as the launcher tests make it.
  const main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  cpSync(join(REPO, 'src'), join(main, 'src'), { recursive: true })
  writeFileSync(join(main, 'src/config/rules/CODE.md'), '# Synthetic code\n\n## Chapter 5 — Synthetic tests\nSynthetic chapter text.\n')
  writeFileSync(join(main, 'README.md'), 'a checkout for the Codex refusal test\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's files, with the secrets file in this test's scratch.
  const template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8')) as { secrets: { hostFile: string } }
  office.secrets.hostFile = secrets
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))
  writeFileSync(secrets, '', { mode: 0o600 })

  // THE STARTER AND THE WORKER. The starter's run is filed with its own key, as its session hook files it.
  const made = await ask('POST', '/api/agents/started', { handle: STARTER, name: STARTER, role: 'secretary' }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const starterKey = String(made.body.whatToGiveIt?.key ?? '')
  expect(starterKey).not.toBe('')
  const mine = await fetch(`${api}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': STARTER, 'x-mole-office-key': starterKey },
    body: JSON.stringify({ kind: 'session', title: 'the starter run', data: { state: 'running' } }),
  })
  expect(mine.status).toBe(201)
  starterSession = ((await mine.json()) as { record: { id: string } }).record.id

  const worker = await ask('POST', '/api/agents/started', { handle: WORKER, name: WORKER, role: 'worker', runtime: 'codex', workArea: ['src'] })
  expect(worker.status, JSON.stringify(worker.body)).toBe(201)

  const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--no-dsh', '--json'])
  expect(up.status, up.err).toBe(0)
  dir = (JSON.parse(up.out.trim()) as { folder: string }).folder
  // A SYNTHETIC Codex login. No login is performed, and no model runs.
  mkdirSync(join(dir, 'home', '.codex'), { recursive: true })
  writeFileSync(join(dir, 'home', '.codex', 'auth.json'), '{}\n')
}, 120_000)

afterAll(async () => {
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

describe('a Codex worker whose --model names another provider', () => {
  // MUTATION: theNameCodexTakes hands every model on; this case goes red on the exit code and the missing refusal.
  it('reaches the launcher\'s own refusal with exit 2, starting nothing and filing no run', async () => {
    const brief = join(scratch, 'a-synthetic-brief.md')
    writeFileSync(brief, '# A synthetic brief\nSynthetic text only.\n')

    // THE PREMISE, checked before the start relies on it: this office's answer for the named model on Codex carries
    // no native selection, so the start reads the compatibility list and reaches the launcher's refusal.
    const answered = await ask('GET', `/api/office/run-models/for/${WORKER}?place=builder&runtime=codex&model=${encodeURIComponent(MODEL)}`)
    expect(answered.status, JSON.stringify(answered.body)).toBe(200)
    expect(answered.body?.selection).toBeUndefined()

    const before = { calls: execCalls(), starts: startsOf(dir).length, runs: await theRuns() }
    const ran = await sandbox(['worker', NAME, '--agent', WORKER, '--runtime', 'codex', '--model', MODEL, '--brief', brief, '--verbose'])
    expect(ran.status, ran.err).toBe(2)
    const provider = theProviderOfCodex()
    expect(ran.err).toContain(`--model names the model ${MODEL}, which Codex cannot run here: a Codex worker requires a model of provider ${provider}, named ${provider}/<model>. Nothing was started.`)
    expect(execCalls(), 'something was started in the sandbox').toBe(before.calls)
    expect(startsOf(dir).length).toBe(before.starts)
    expect(await theRuns(), 'a refused command filed a run').toEqual(before.runs)
    expect(existsSync(join(dir, 'worktrees', WORKER)), 'a worktree was made for the refused worker').toBe(false)
  }, 60_000)
})

/**
 * A START GIVEN --selection, refused before anything is filed or started. The office rechecks the selection at its
 * Casting row's revision, and a refusal, another answer or no answer refuses the start; a --model the selection does not
 * name is refused before that. The row is this test's own, a Codex worker row with made-up native data.
 */
describe('a start given --selection', () => {
  let office: Server | null = null
  let silent = ''
  let row = 0
  let selection: { runtime: string; model: string; native: Record<string, string | null>; casting: { id: number; revision: string } }
  const brief = (): string => {
    const at = join(scratch, 'a-synthetic-selection-brief.md')
    writeFileSync(at, '# A synthetic brief\nSynthetic text only.\n')
    return at
  }
  /** The command for one of the two paths, given this selection as JSON. */
  const theStart = (verb: 'worker' | 'exec', given: unknown, model: string): string[] => verb === 'worker'
    ? ['worker', NAME, '--agent', WORKER, '--runtime', 'codex', '--model', model, '--selection', JSON.stringify(given), '--brief', brief(), '--verbose']
    : ['exec', NAME, '--agent', WORKER, '--runtime', 'codex', '--model', model, '--selection', JSON.stringify(given), '--worktree', join(dir, 'worktrees', WORKER), '--verbose', '--', 'codex', 'exec', '--json', '-m', model, '--', 'A synthetic prompt.']

  beforeAll(async () => {
    const key = randomUUID()
    const made = await ask('POST', '/api/casting/worker', { program: { value: 'codex' }, model: { value: `office-${key}` }, effort: { value: `effort-${key}` }, native: { model: `native-${key}`, provider: null, variant: null } }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    row = made.body.casting.id as number
    const read = await ask('GET', `/api/casting/rows/${row}/selection`)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    selection = read.body.selection
    // A STAND-IN OFFICE THAT ANSWERS NOTHING FOR THE RECHECK: every other request goes on to the real test office.
    office = createServer(async (req, res) => {
      if (req.url?.startsWith(`/api/casting/rows/${row}/selection`)) { req.socket.destroy(); return }
      const pieces: Buffer[] = []
      for await (const piece of req) pieces.push(piece as Buffer)
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) => !['host', 'content-length', 'connection'].includes(name)).map(([name, value]) => [name, String(value)]))
      const answer = await fetch(`${api}${req.url ?? '/'}`, { method: req.method ?? 'GET', headers, ...(pieces.length === 0 ? {} : { body: Buffer.concat(pieces) }) })
      res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/json' })
      res.end(Buffer.from(await answer.arrayBuffer()))
    })
    await new Promise<void>((done) => office!.listen(0, '127.0.0.1', done))
    silent = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
  }, 60_000)

  afterAll(async () => {
    if (office !== null) await new Promise<void>((done) => office!.close(() => done()))
  })

  /** Runs one start and shows that it was refused with exit 2 in these words, and that nothing was filed or started. */
  async function refusedBeforeAnything(args: string[], words: string, at = api): Promise<void> {
    const before = { calls: execCalls(), starts: startsOf(dir).length, runs: await theRuns() }
    const ran = await sandbox(args, at)
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain(words)
    expect(execCalls(), 'something was started in the sandbox').toBe(before.calls)
    expect(startsOf(dir).length).toBe(before.starts)
    expect(await theRuns(), 'a refused start filed a run').toEqual(before.runs)
    expect(existsSync(join(dir, 'worktrees', WORKER)), 'a worktree was made for the refused start').toBe(false)
  }

  // MUTATION: aCommandsStartFromTheOffice in src/config/sandbox-start-values.mjs uses a given selection without the
  // office's recheck. These cases and the next go red on both paths, because the sandbox is asked to exec. A changed
  // native model takes the same recheck, which tests/the-launcher-names-an-effort-in-place-of-the-rows.test.ts refuses.
  it.each([
    { verb: 'worker', what: 'another revision' },
    { verb: 'exec', what: 'another revision' },
  ] as const)('$verb: a selection the office answers differently for ($what) is refused', async ({ verb }) => {
    const given = { ...selection, casting: { id: row, revision: `another-${randomUUID()}` } }
    await refusedBeforeAnything(theStart(verb, given, selection.model), 'The selected Casting row could not be rechecked (')
  }, 60_000)

  it.each(['worker', 'exec'] as const)('%s: a selection whose recheck the office does not answer is refused', async (verb) => {
    await refusedBeforeAnything(theStart(verb, selection, selection.model), 'The selected Casting row could not be rechecked (', silent)
  }, 60_000)

  it.each(['worker', 'exec'] as const)('%s: a selection and another --model are refused', async (verb) => {
    const other = `another-${randomUUID()}`
    await refusedBeforeAnything(theStart(verb, selection, other), `--selection is for the model ${selection.model}, and --model names ${other}. Nothing was started.`)
  }, 60_000)
})
