// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LAUNCHER READS THE PROVIDER A RUNTIME RUNS FROM ITS DATA FILE.
 *
 * tools/sandbox.mjs wrote the provider in code twice: openai/ in theNameCodexTakes and anthropic in theNameClaudeTakes.
 * The provider a runtime's own program runs is one fact, in src/config/runtime-native-providers.json, read through
 * src/config/runtime-native-providers.mjs. This file copies this checkout's tools/, src/ and for-agents/ into a synthetic checkout,
 * gives the copy a data file with providers made up for the run, and runs the copy's real worker command as far as the
 * two checks. The checkout itself is untouched, and no model runs.
 *
 * The copy's compatibility list also gains an alias for each made-up model name. That is fixture data: the launcher's
 * start-values reader refuses a named model no alias holds before either check is reached.
 *
 * WHAT GOES RED WHEN THE LITERALS COME BACK:
 *   - a model under the old provider is refused with the old provider's sentence, so the case that expects a model
 *     under the made-up provider to pass the check goes red;
 *   - the other-provider refusal names the old provider and not the made-up one.
 */
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { FAKE_DEVCONTAINER, FAKE_DF, FAKE_DOCKER, FAKE_DU, FAKE_FREE, startsOf, theFakeMachine } from './sandbox-stand-ins.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { aTestAddress } from './the-test-commit-address.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const WORKSPACE = 'default'
const NAME = 'provider-from-data'
const STARTER = 'provider-from-data-starter'
const CODEX_WORKER = 'provider-from-data-codex'
const CLAUDE_WORKER = 'provider-from-data-claude'
const made = {
  codex: `codex-provider-${randomUUID()}`,
  claude: `claude-provider-${randomUUID()}`,
  other: `other-provider-${randomUUID()}`,
  native: `native-${randomUUID()}`,
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
let tool = ''
let providers: Record<string, { provider: string | null }> = {}

/** Every process group a case started, stopped at the end if its leader still works in the scratch. */
const groups = new Set<number>()
const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()

/** A tool of the synthetic checkout, as its own process, as the starter, with only the caller's own settings cleared. */
async function sandboxed(at: string, args: string[]): Promise<{ status: number; out: string; err: string }> {
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
    const child = spawn(process.execPath, [at, ...args, '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE], { env, detached: true })
    if (child.pid !== undefined) groups.add(child.pid)
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('close', (code) => done({ status: code ?? 1, out, err }))
  })
}

async function ask(
  method: string,
  path: string,
  body?: unknown,
  actor: { type: string; id: string } = { type: 'agent', id: STARTER },
): Promise<{ status: number; body: any }> {
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

/** The one sentence each runtime refuses another provider's model with, with this run's made-up provider in it. */
function anotherProvidersModel(runtime: 'codex' | 'claude-code', provider: string, model: string): string {
  return runtime === 'codex'
    ? `--model names the model ${model}, which Codex cannot run here: a Codex worker requires a model of provider ${provider}, named ${provider}/<model>. Nothing was started.`
    : `--model names the model ${model}, which claude cannot run: a worker here holds the Claude login only, so claude takes a model of provider ${provider} under its own name (claude-opus-5-5). Give --model <model>. Nothing was started.`
}

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  expect(thePortsATestKeepsOff()).not.toContain(Number(new URL(api).port))
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-provider-from-data-'))
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
  writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })

  // THE CHECKOUT A SANDBOX IS MADE FROM: a copy of this checkout's tools/ and src/, with node_modules linked.
  const main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  cpSync(join(REPO, 'tools'), join(main, 'tools'), { recursive: true })
  cpSync(join(REPO, 'src'), join(main, 'src'), { recursive: true })
  cpSync(join(REPO, 'for-agents'), join(main, 'for-agents'), { recursive: true })
  const dataFile = JSON.parse(readFileSync(join(REPO, 'src/config/runtime-native-providers.json'), 'utf8')) as Record<string, { program: string; provider: string | null; fastMode: boolean }>
  dataFile['codex'] = { ...dataFile['codex']!, provider: made.codex }
  dataFile['claude-code'] = { ...dataFile['claude-code']!, provider: made.claude }
  writeFileSync(join(main, 'src/config/runtime-native-providers.json'), `${JSON.stringify(dataFile, null, 2)}\n`)
  // THE START-VALUES READER REFUSES A MODEL NO ALIAS HOLDS BEFORE EITHER CHECK, so the copy's compatibility list knows
  // this run's made-up names. This is fixture data in the copy, and the checkout's own list is untouched.
  const compatibilityPath = join(main, 'src/config/launcher-model-compatibility.json')
  const compatibility = JSON.parse(readFileSync(compatibilityPath, 'utf8')) as { aliases: Record<string, string> }
  for (const provider of [made.codex, made.claude, made.other]) compatibility.aliases[`${provider}/${made.native}`] = made.native
  writeFileSync(compatibilityPath, `${JSON.stringify(compatibility, null, 2)}\n`)
  writeFileSync(join(main, 'src/config/rules/CODE.md'), '# Synthetic code\n\n## Chapter 5 — Synthetic tests\nSynthetic chapter text.\n')
  writeFileSync(join(main, 'README.md'), 'a checkout for the provider-from-data test\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  symlinkSync(join(REPO, 'node_modules'), join(main, 'node_modules'))
  mkdirSync(join(main, 'data'))
  tool = join(main, 'tools', 'sandbox.mjs')
  providers = JSON.parse(readFileSync(join(main, 'src/config/runtime-native-providers.json'), 'utf8')) as Record<string, { provider: string | null }>

  // THE TEMPLATE: the real one's files, with the secrets file in this test's scratch.
  const template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8')) as { secrets: { hostFile: string } }
  office.secrets.hostFile = secrets
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))

  // THE STARTER AND THE TWO WORKERS. The starter's run is filed with its own key, as its session hook files it.
  const started = await ask('POST', '/api/agents/started', { handle: STARTER, name: STARTER, role: 'secretary' }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  expect(started.status, JSON.stringify(started.body)).toBe(201)
  const starterKey = String(started.body.whatToGiveIt?.key ?? '')
  expect(starterKey).not.toBe('')
  const mine = await fetch(`${api}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': STARTER, 'x-mole-office-key': starterKey },
    body: JSON.stringify({ kind: 'session', title: 'the starter run', data: { state: 'running' } }),
  })
  expect(mine.status).toBe(201)
  starterSession = ((await mine.json()) as { record: { id: string } }).record.id
  for (const [handle, runtime] of [[CODEX_WORKER, 'codex'], [CLAUDE_WORKER, 'claude-code']] as const) {
    const worker = await ask('POST', '/api/agents/started', { handle, name: handle, role: 'worker', runtime, workArea: ['src'] })
    expect(worker.status, JSON.stringify(worker.body)).toBe(201)
  }

  const up = await sandboxed(tool, ['up', template, '--name', NAME, '--from', main, '--no-dsh', '--json'])
  expect(up.status, up.err).toBe(0)
  dir = (JSON.parse(up.out.trim()) as { folder: string }).folder
  // A SYNTHETIC Codex login. No login is performed, and no model runs.
  mkdirSync(join(dir, 'home', '.codex'), { recursive: true })
  writeFileSync(join(dir, 'home', '.codex', 'auth.json'), '{}\n')
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

describe('the launcher reads the provider the data file names', () => {
  const cases = [
    { runtime: 'codex' as const, worker: CODEX_WORKER, provider: () => providers['codex']!.provider! },
    { runtime: 'claude-code' as const, worker: CLAUDE_WORKER, provider: () => providers['claude-code']!.provider! },
  ]

  // MUTATION: the literal provider comes back in either check; red on the pass-through and on the sentence.
  it.each(cases)('$runtime takes a model under the made-up provider and refuses another provider by that name', async ({ runtime, worker, provider }) => {
    const own = provider()
    const missing = join(scratch, `no-such-brief-${runtime}.md`)
    const accepted = await sandboxed(tool, [
      'worker', NAME, '--agent', worker, '--runtime', runtime, '--model', `${own}/${made.native}`, '--brief', missing, '--verbose',
    ])
    expect(accepted.status, accepted.err).toBe(2)
    expect(accepted.err).toContain('there is no file there')
    expect(accepted.err).not.toContain('cannot run')

    const brief = join(scratch, `brief-${runtime}.md`)
    writeFileSync(brief, `# A synthetic brief for ${runtime}\nSynthetic text only.\n`)
    const refusedModel = `${made.other}/${made.native}`
    const refused = await sandboxed(tool, [
      'worker', NAME, '--agent', worker, '--runtime', runtime, '--model', refusedModel, '--brief', brief, '--verbose',
    ])
    expect(refused.status, refused.err).toBe(2)
    expect(refused.err).toContain(anotherProvidersModel(runtime, own, refusedModel))
  }, 120_000)
})
