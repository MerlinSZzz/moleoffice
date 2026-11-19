// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THAT WOULD COMMIT AT THE PLACEHOLDER ADDRESS IS NOT STARTED.
 *
 * MOLE_OFFICE_COMMIT_EMAIL's declared default is an address that reaches nobody, and the merge queue refuses a commit
 * made at its domain only after a round's whole work. So a start that commits — exec --agent, worker and round —
 * must refuse it before anything is started, in one sentence naming the setting, where the launcher looked for it and
 * the way to set it. A check start (exec --plain-env) commits nothing and is not asked.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, and the launcher is the real
 * `node tools/sandbox.mjs`. The sandbox is a real sandbox folder made by that launcher from a synthetic checkout, with
 * the fake docker and devcontainer CLI the launcher tests use, so nothing runs in a real container. The runtime
 * programs are synthetic and labelled where they are written; no model runs.
 *
 * THE PRIOR RUN FOR THE ROUND is started with a test address, not the placeholder: it is the setup a round continues,
 * and the refused forms are the only ones given no address at all.
 */
import { spawn, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
import { ENV_FILE, settingNamed } from '../src/config/settings.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const NAME = 'placeholder-address'
const STARTER = 'placeholder-address-starter'
const EXEC_WORKER = 'placeholder-address-exec'
const WORKER = 'placeholder-address-worker'
const ROUND_WORKER = 'placeholder-address-round'
/** A model the launcher's compatibility data holds, so the setup and the red starts reach their own refusals. */
const A_KNOWN_MODEL = 'anthropic/claude-opus-5-5'
/** The address that reaches nobody, read from its one declaration, never typed here. */
const PLACEHOLDER = String(settingNamed('MOLE_OFFICE_COMMIT_EMAIL').fallback)
/** The first words of the refusal this file asks for. */
const THE_REFUSAL = 'would commit as the placeholder address'

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

/**
 * The tool as its own process, as the starter. The launcher child gets the test office's database and no commit
 * address, unless a setup start names a test one in `commitAddress`.
 */
async function sandbox(args: string[], { commitAddress = null, more = {} }: { commitAddress?: string | null; more?: Record<string, string> } = {}): Promise<{ status: number; out: string; err: string }> {
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
    FAKE_DOCKER_DIR: fakes,
    MOLE_OFFICE_AGENT: STARTER,
    MOLE_OFFICE_SESSION: starterSession,
    MOLE_OFFICE_DB: t.file,
  }
  for (const name of ['MOLE_AGENT_KEY', 'MOLE_OFFICE_API', 'MOLE_OFFICE_API_ROOT', 'MOLE_OFFICE_PORT', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_COMMIT_EMAIL']) delete env[name]
  for (const name of Object.keys(env)) if (name.startsWith('MOLE_OFFICE_COMMIT_')) delete env[name]
  if (commitAddress !== null) env['MOLE_OFFICE_COMMIT_EMAIL'] = commitAddress
  Object.assign(env, more)
  // THE TOOL'S OWN FLAGS COME BEFORE THE COMMAND, which follows `--`: after it they would be the command's words.
  const flags = ['--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE]
  const at = args.indexOf('--')
  const words = at === -1 ? [...args, ...flags] : [...args.slice(0, at), ...flags, ...args.slice(at)]
  return new Promise((done) => {
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

/** The one sentence a refused start prints: the setting, its placeholder, where it was looked for, and how to set it. */
function expectTheAddressRefusal(err: string): void {
  expect(err).toContain(THE_REFUSAL)
  expect(err).toContain('MOLE_OFFICE_COMMIT_EMAIL')
  expect(err).toContain(PLACEHOLDER)
  expect(err).toContain("the office's stored settings")
  expect(err).toContain('its own environment')
  expect(err).toContain(ENV_FILE)
  expect(err).toContain('Settings page')
}

/** Wait until the process a setup start left is gone, so the round's prior run is no longer running. */
async function untilGone(pid: number): Promise<void> {
  const until = Date.now() + 20_000
  while (Date.now() < until) {
    try {
      process.kill(pid, 0)
    } catch {
      return
    }
    await new Promise((later) => setTimeout(later, 50))
  }
  throw new Error(`the setup start's process ${String(pid)} did not end`)
}

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-placeholder-address-'))
  sandboxes = join(scratch, 'sandboxes')
  fakes = join(scratch, 'fakes')
  const secrets = join(scratch, 'sandbox-secrets.env')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  // A SYNTHETIC CLAUDE CODE: it reads the brief the helper gives it on its standard input and ends at once. No model
  // runs, and this file exists only so a worker or a round reaches its start on today's launcher.
  writeFileSync(join(fakes, 'bin', 'claude'), '#!/usr/bin/env node\nrequire("fs").readFileSync(0)\n', { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))
  // A SYNTHETIC Claude Code login, labelled here: the launcher refuses a claude-code start without one.
  writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=a-synthetic-login\n', { mode: 0o600 })

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
  writeFileSync(join(main, 'README.md'), 'a checkout for the placeholder address test\n')
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

  // THE STARTER AND THE WORKERS. The starter's run is filed with its own key, as its session hook files it.
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

  for (const handle of [EXEC_WORKER, WORKER, ROUND_WORKER]) {
    const worker = await ask('POST', '/api/agents/started', { handle, name: handle, role: 'worker', runtime: 'claude-code', workArea: ['src'] })
    expect(worker.status, JSON.stringify(worker.body)).toBe(201)
  }

  const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--no-dsh', '--json'])
  expect(up.status, up.err).toBe(0)
  dir = (JSON.parse(up.out.trim()) as { folder: string }).folder
  // THE ROUND'S RULE FILES, synthetic: the round delivers them before it starts, and this test is not about them.
  mkdirSync(join(dir, 'briefs'), { recursive: true })
  writeFileSync(join(dir, 'briefs', 'LINE-common.md'), '# A synthetic line\nSynthetic text only.\n')
  writeFileSync(join(dir, 'briefs', 'TERRITORIES.md'), '# Synthetic territories\nSynthetic text only.\n')

  // THE ROUND'S PRIOR RUN, at a test address so this setup starts under the fix too. It runs `true` in a worktree of its
  // own, not the sandbox's shared checkout, and ends at once; the round continues it from there.
  const brief = join(scratch, 'a-synthetic-brief.md')
  writeFileSync(brief, '# A synthetic brief\nSynthetic text only.\n')
  const prior = await sandbox(
    ['exec', NAME, '--agent', ROUND_WORKER, '--runtime', 'claude-code', '--model', A_KNOWN_MODEL, '--worktree', join(dir, 'worktrees', `${ROUND_WORKER}-prior`), '--', 'true'],
    { commitAddress: aTestAddress('fixture') },
  )
  expect(prior.status, prior.err).toBe(0)
  const start = startsOf(dir).at(-1)
  expect(start, 'the prior run left no start').toBeDefined()
  await untilGone(start!.hostPid)
}, 180_000)

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

describe('a run whose commit address is the placeholder', () => {
  it('refuses exec --agent before the sandbox starts anything or a run is filed', async () => {
    const worktree = join(dir, 'worktrees', EXEC_WORKER)
    const before = { calls: execCalls(), starts: startsOf(dir).length, runs: await theRuns() }
    const ran = await sandbox(['exec', NAME, '--agent', EXEC_WORKER, '--runtime', 'claude-code', '--model', A_KNOWN_MODEL, '--worktree', worktree, '--', 'true'])
    expect(ran.status, ran.err).toBe(2)
    expectTheAddressRefusal(ran.err)
    expect(execCalls(), 'something was started in the sandbox').toBe(before.calls)
    expect(startsOf(dir).length, 'a start was filed for the refused run').toBe(before.starts)
    expect(await theRuns(), 'a refused start filed a run').toEqual(before.runs)
    expect(existsSync(worktree), 'a worktree was made for the refused run').toBe(false)
  }, 60_000)

  it('refuses worker before the sandbox starts anything or a run is filed', async () => {
    const brief = join(scratch, 'a-worker-brief.md')
    writeFileSync(brief, '# A synthetic worker brief\nSynthetic text only.\n')
    const worktree = join(dir, 'worktrees', WORKER)
    const before = { calls: execCalls(), starts: startsOf(dir).length, runs: await theRuns() }
    const ran = await sandbox(['worker', NAME, '--agent', WORKER, '--runtime', 'claude-code', '--model', A_KNOWN_MODEL, '--brief', brief])
    expect(ran.status, ran.err).toBe(2)
    expectTheAddressRefusal(ran.err)
    expect(execCalls(), 'something was started in the sandbox').toBe(before.calls)
    expect(startsOf(dir).length, 'a start was filed for the refused worker').toBe(before.starts)
    expect(await theRuns(), 'a refused worker filed a run').toEqual(before.runs)
    expect(existsSync(worktree), 'a worktree was made for the refused worker').toBe(false)
  }, 60_000)

  it('refuses round before the sandbox starts anything or a run is filed', async () => {
    const brief = join(scratch, 'a-round-brief.md')
    writeFileSync(brief, '# A synthetic round brief\nSynthetic text only.\n')
    const worktree = join(dir, 'worktrees', ROUND_WORKER)
    const before = { calls: execCalls(), starts: startsOf(dir).length, runs: await theRuns() }
    const ran = await sandbox(['round', NAME, '--agent', ROUND_WORKER, '--runtime', 'claude-code', '--brief', brief])
    expect(ran.status, ran.err).toBe(2)
    expectTheAddressRefusal(ran.err)
    expect(execCalls(), 'something was started in the sandbox').toBe(before.calls)
    expect(startsOf(dir).length, 'a start was filed for the refused round').toBe(before.starts)
    expect(await theRuns(), 'a refused round filed a run').toEqual(before.runs)
    expect(existsSync(worktree), 'a worktree was made for the refused round').toBe(false)
  }, 60_000)

  it('does not refuse a check start: exec --plain-env is asked no address and runs its command', async () => {
    const before = execCalls()
    const ran = await sandbox(['exec', NAME, '--plain-env', '--wait', '--', 'sh', '-c', 'exit 0'])
    expect(ran.status, ran.err).toBe(0)
    expect(ran.out + ran.err).not.toContain(THE_REFUSAL)
    expect(ran.out + ran.err).not.toContain(PLACEHOLDER)
    expect(execCalls(), 'the check start was never run in the sandbox').toBeGreaterThan(before)
  }, 60_000)
})

/**
 * A COMMIT SETTING THE LAUNCHER DOES NOT KNOW IS NOT IGNORED (uiMd5pDXsO37 and AzZlT5JKDY-2, 8 November 2026). The secretary's
 * script set MOLE_OFFICE_COMMIT_NAME=the coordinator, and the runs it started committed as the agents they serve, the owner's rule of
 * 22 September 2026, while the name was dropped in silence. MOLE_OFFICE_COMMIT_EMAIL is the only commit setting, so a start
 * that commits refuses any other MOLE_OFFICE_COMMIT_ variable in its environment before anything is filed or started. A check
 * start commits nothing and is not asked. The address here is a test one, so the placeholder's refusal is not the one met.
 */
describe('a start that commits, with a commit variable the launcher does not know', () => {
  const UNKNOWN = { MOLE_OFFICE_COMMIT_NAME: 'quill' }
  const theUnknownRefusal = (err: string) => {
    // The launcher prints a refusal's first sentence, and it says all three: the variable, that nothing started, and the one setting.
    expect(err).toContain("MOLE_OFFICE_COMMIT_NAME is set in this launcher's environment, and the launcher knows no such setting, so nothing was started")
    expect(err).toContain('the only commit setting is MOLE_OFFICE_COMMIT_EMAIL')
    expect(err).not.toContain(THE_REFUSAL)
  }
  it.each([
    ['exec --agent', (worktree: string) => ['exec', NAME, '--agent', EXEC_WORKER, '--runtime', 'claude-code', '--model', A_KNOWN_MODEL, '--worktree', worktree, '--', 'true']],
    ['worker', () => ['worker', NAME, '--agent', WORKER, '--runtime', 'claude-code', '--model', A_KNOWN_MODEL, '--brief', join(scratch, 'a-worker-brief.md')]],
    ['round', () => ['round', NAME, '--agent', ROUND_WORKER, '--runtime', 'claude-code', '--brief', join(scratch, 'a-round-brief.md')]],
  ] as const)('refuses %s before the sandbox starts anything or a run is filed', async (_verb, words) => {
    for (const one of ['a-worker-brief.md', 'a-round-brief.md']) writeFileSync(join(scratch, one), '# A synthetic brief\nSynthetic text only.\n')
    const worktree = join(dir, 'worktrees', `${EXEC_WORKER}-unknown-variable`)
    const before = { calls: execCalls(), starts: startsOf(dir).length, runs: await theRuns() }
    const ran = await sandbox([...words(worktree)], { commitAddress: aTestAddress('unknown-variable'), more: UNKNOWN })
    expect(ran.status, ran.err).toBe(2)
    theUnknownRefusal(ran.err)
    expect(execCalls(), 'something was started in the sandbox').toBe(before.calls)
    expect(startsOf(dir).length, 'a start was filed for the refused run').toBe(before.starts)
    expect(await theRuns(), 'a refused start filed a run').toEqual(before.runs)
    expect(existsSync(worktree), 'a worktree was made for the refused run').toBe(false)
  }, 60_000)

  it('does not ask a check start: exec --plain-env runs its command with the variable set', async () => {
    const before = execCalls()
    const ran = await sandbox(['exec', NAME, '--plain-env', '--wait', '--', 'sh', '-c', 'exit 0'], { more: UNKNOWN })
    expect(ran.status, ran.err).toBe(0)
    expect(ran.out + ran.err).not.toContain('knows no such setting')
    expect(execCalls(), 'the check start was never run in the sandbox').toBeGreaterThan(before)
  }, 60_000)
})
