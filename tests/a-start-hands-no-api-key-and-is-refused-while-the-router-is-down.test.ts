// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHILE THE PROVIDER ROUTER IS ON, A START HANDS A SANDBOX NO API KEY, AND A START THE ROUTER MUST CARRY IS REFUSED, IN
 * ONE SENTENCE AND BEFORE ANYTHING IS FILED, WHILE THE ROUTER DOES NOT ANSWER.
 *
 * OLD: with MOLE_OFFICE_PROVIDER_ROUTER on, the launcher left out only the routed providers' own key names, so a Codex
 * run was handed CODEX_API_KEY, and an isolated run was handed every API key line of the sandbox container's own
 * environment. A start on dsh with no router answering filed its run first and was refused after, or was held for ever
 * by a control socket that took the connection and never answered.
 * NEW, with the setting on and no router answering:
 *   1. Claude Code on its login, Codex on its login file and OpenCode on a model no route of the router names each
 *      start, and the program is handed none of THE_API_KEY_NAMES, by name or by value; Claude Code keeps its login.
 *   2. a command that names any of THE_API_KEY_NAMES with --secret is refused before docker exec.
 *   3. an isolated run is handed none of the API key lines of the sandbox container's own environment.
 *   4. with no control socket, and with one nothing answers on, a dsh run from its Casting row and an isolated dsh run
 *      are each refused with the one sentence that says the router does not answer; nothing is filed, nothing runs in
 *      the container, the office still answers, and Claude Code on its login still starts.
 *   5. a Codex run with no login of its own is refused in one sentence, worked out in one place, before anything is
 *      filed or runs, as the router does not carry Codex and Codex is handed no key: an ordinary run while the sandbox
 *      has no Codex login file, and an isolated run, whose home of its own holds none. With its login back, the ordinary
 *      run starts.
 *   6. while the Codex login file in the sandbox's home holds an API key, exec --agent, an isolated exec, a plain exec
 *      and up are each refused, naming the file, the entry and the key's mark and never the key; nothing is filed or
 *      runs, and the home is left as it was.
 * The Claude Code and OpenCode rows of case 1 were green before this change too, since the routed providers' own key
 * names were left out already. They stay, so that no runtime is handed one.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, with the setting on in its
 * process. The launcher is the real tools/sandbox.mjs, run as its own process with the setting on. Docker and the
 * devcontainer CLI are the stand-ins of tests/sandbox-stand-ins.ts, so nothing runs in a container. claude, codex and
 * opencode are stand-ins that write down the names of their environment and which of them hold one of this file's
 * made-up values, never a value. No router runs: where one is asked for, its control socket is absent, or is a stand-in
 * that takes each connection and never answers. Every key and login is made up for this file and reaches no provider.
 *
 * MUTATIONS, each alone and put back:
 *   M5. theRoutedKeysLeftOut leaves out the routed providers' key names alone, not CODEX_API_KEY: case 1's Codex row and
 *       case 2 go red on CODEX_API_KEY.
 *   M6. commandExecIsolated hands the container's own environment on whole: case 3 goes red on the names docker create
 *       was handed.
 *   M7. anAgentsRunFiledHere does not ask whether the router can carry a run before it files it: case 4 goes red on the
 *       records filed.
 *   M8. commandExecIsolated does not ask whether the router answers: case 4 goes red on the isolated run's sentence.
 *   M9. theSecretsFor does not refuse a Codex run with no login: case 5 goes red on the ordinary run's status.
 *   M10. commandExecIsolated does not refuse an isolated Codex run: case 5 goes red on the isolated run's status.
 *   M11. aSandboxToStartIn does not look in the login files: case 6 goes red on exec --agent's status.
 *   M12. commandUp does not look in the login files: case 6 goes red on up's status.
 */
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_API_KEY_NAMES, THE_ROUTER_FOLDER_INSIDE, THE_ROUTER_SOCKET_NAME, aSecretsMark, theRouterControlSocket } from '../src/config/provider-router.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { aCodexRunHasNoKeyThroughTheRouter, theRouterIsDown } from '../tools/provider-router-host.mjs'
import { createProviderRouter } from '../tools/provider-router.mjs'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { aGroupIsHere } from './a-group-is-here.ts'
import { FAKE_DEVCONTAINER, FAKE_DF, FAKE_DOCKER, FAKE_DU, FAKE_FREE, startsOf, theFakeMachine } from './sandbox-stand-ins.ts'
import { linkSourceWithLocalRoundRules } from './round-chapters-fixture.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { aTestAddress } from './the-test-commit-address.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const STARTER = 'no-key-starter'
const WORKER = 'no-key-worker'
const NAME = 'nk'
const THE_SETTING = 'MOLE_OFFICE_PROVIDER_ROUTER'
const made = randomUUID().slice(0, 8)
/** A made-up native model, which the worker's dsh row runs through DeepSeek. */
const NATIVE = `made-up-model-${made}`
const DSH_MODEL = `deepseek/${NATIVE}`
/** An OpenCode model named without its provider, which the launcher's table names and no route of the router does. */
const UNROUTED_MODEL = 'gpt-6-luna'
/** A made-up value for each API key name and for the Claude Code login, none of them a part of another. */
const MADE_UP: Record<string, string> = Object.fromEntries([...THE_API_KEY_NAMES, 'CLAUDE_CODE_OAUTH_TOKEN'].map((name) => [name, `made-up-${name.toLowerCase()}-${made}`]))

type Ran = { status: number; out: string; err: string }
type Call = { tool: string; argv: string[]; envNames?: string[] }
type Seen = { names: string[]; holding: string[] }

let t: TestDb
let res: typeof import('../src/server/lib/resources.ts')
let app: FastifyInstance
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let seen = ''
let main = ''
let template = ''
let dsh = ''
let folder = ''
let starterKey = ''
let starterSession = ''
let before: string | undefined
const groups = new Set<number>()

const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()
const thePerson = { type: 'human', id: THE_PERSON }

/** The tool as its own process, as the starter, with the setting on. */
async function sandbox(args: string[], withStarterKey = false): Promise<Ran> {
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
    FAKE_DOCKER_DIR: fakes,
    MOLE_OFFICE_AGENT: STARTER,
    MOLE_OFFICE_SESSION: starterSession,
    MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
    [THE_SETTING]: 'on',
  }
  if (withStarterKey) env['MOLE_AGENT_KEY'] = starterKey; else delete env['MOLE_AGENT_KEY']
  const end = args.includes('--') ? args.indexOf('--') : args.length
  const argv = [TOOL, ...args.slice(0, end), '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE, ...args.slice(end)]
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

async function ask(method: string, path: string, body?: unknown, actor: { type: string; id: string } = { type: 'agent', id: STARTER }): Promise<{ status: number; body: any }> {
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

function state(): { calls: Call[]; containers: Record<string, { Config: { Env: string[] } }> } {
  return JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8'))
}

/** The docker calls since `from` that run anything in a container or make one. */
function whatRan(from: number): Call[] {
  return state().calls.slice(from).filter((call) => call.tool === 'docker' && ['exec', 'create', 'start', 'run'].includes(call.argv[0]!))
}

/** The ids of the records the office holds now. */
function theRecords(): Set<string> {
  return new Set((t.client.sqlite.prepare('SELECT id FROM records').all() as { id: string }[]).map((one) => one.id))
}

/**
 * The kind and title of each record filed since `before`: a refused start files none. A notice the office writes by
 * itself is left out, as the office tells the starter that an earlier case's run finished when it sees it finish, which
 * can be after that run's process group has ended.
 */
function filedSince(before: Set<string>): string[] {
  return (t.client.sqlite.prepare('SELECT id, kind, title, data FROM records').all() as { id: string; kind: string; title: string; data: string }[])
    .filter((one) => !before.has(one.id) && !(one.kind === 'message' && typeof JSON.parse(one.data)?.notice === 'string'))
    .map((one) => `${one.kind}: ${one.title}`)
}

async function until(what: string, ok: () => boolean, ms = 60_000): Promise<void> {
  const by = Date.now() + ms
  while (!ok()) {
    if (Date.now() > by) throw new Error(`waited ${String(ms)} ms for ${what}`)
    await new Promise((done) => setTimeout(done, 100))
  }
}

/** What a stand-in program was handed, once it has written it down. */
async function whatWasHanded(program: string): Promise<Seen> {
  const file = join(seen, `${program}.json`)
  await until(`the stand-in ${program} to write down its environment`, () => existsSync(file))
  return JSON.parse(readFileSync(file, 'utf8')) as Seen
}

/** A run filed for an isolated command, as its starter files it. */
async function anIsolatedRun(): Promise<string> {
  const filed = await ask('POST', '/api/records', { kind: 'session', title: 'A synthetic isolated run', data: { state: 'running', servingAgent: WORKER } })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return filed.body.record.id as string
}

/** A stand-in on the control socket's path that takes each connection and never answers; answers how to close it. */
async function aSocketNothingAnswersOn(): Promise<() => Promise<void>> {
  const control = theRouterControlSocket(sandboxes)
  mkdirSync(dirname(control), { recursive: true, mode: 0o700 })
  const held: Socket[] = []
  const server: Server = createServer((socket) => { held.push(socket) })
  await new Promise<void>((done) => server.listen(control, done))
  return () => new Promise<void>((done) => { for (const socket of held) socket.destroy(); server.close(() => done()) })
}

beforeAll(async () => {
  before = process.env[THE_SETTING]
  process.env[THE_SETTING] = 'on'
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  // Short names, so the router's sockets stay under the 108 bytes Linux allows.
  scratch = mkdtempSync(join(tmpdir(), 'mo-nk-'))
  sandboxes = join(scratch, 's')
  fakes = join(scratch, 'fakes')
  seen = join(scratch, 'seen')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  mkdirSync(seen)
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))
  // THE STAND-IN PROGRAMS write down the names they were handed, and which of them hold a made-up value: no value.
  const madeUpFile = join(scratch, 'made-up-values.json')
  writeFileSync(madeUpFile, JSON.stringify(Object.values(MADE_UP)), { mode: 0o600 })
  for (const program of ['claude', 'codex', 'opencode']) {
    writeFileSync(join(fakes, 'bin', program), `#!/usr/bin/env node
const fs = require('fs')
const madeUp = JSON.parse(fs.readFileSync(${JSON.stringify(madeUpFile)}, 'utf8'))
const names = Object.keys(process.env).sort()
const holding = names.filter((name) => madeUp.some((value) => String(process.env[name]).includes(value)))
fs.writeFileSync(${JSON.stringify(join(seen, `${program}.json`))}, JSON.stringify({ names, holding }))
`, { mode: 0o755 })
  }

  // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/, as the launcher tests make it.
  main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  linkSourceWithLocalRoundRules(REPO, main)
  writeFileSync(join(main, 'README.md'), 'a checkout for the no-API-key test\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's files, with a secrets file in this test's scratch that sets every name it declares.
  template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8')) as { secrets: { hostFile: string; names: { name: string }[] } }
  office.secrets.hostFile = join(scratch, 'sandbox-secrets.env')
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))
  expect(office.secrets.names.map((one) => one.name).sort()).toEqual(Object.keys(MADE_UP).sort())
  writeFileSync(office.secrets.hostFile, Object.entries(MADE_UP).map(([name, value]) => `${name}=${value}\n`).join(''), { mode: 0o600 })

  // A DSH FOLDER of profiles only, as the launcher tests make it.
  dsh = join(scratch, 'dsh')
  mkdirSync(join(dsh, 'home', 'profiles', 'office'), { recursive: true })
  writeFileSync(join(dsh, 'home', 'profiles', 'office', 'cordis.patch.yml'), `configPath: "${main}/tools/dsh-hooks/hooks.json"\npluginRoot: "${main}"\n`)
  writeFileSync(join(dsh, 'home', 'profiles', 'office', 'office-tool.mjs'), `import { officeToolPlugin } from "${main}/tools/dsh-hooks/office-tool.mjs"\n`)

  // THE STARTER, THE WORKER AND THE WORKER'S DSH ROW in Casting, so a dsh run's model comes from a Casting row.
  const madeStarter = await ask('POST', '/api/agents/started', { handle: STARTER, name: STARTER, role: 'secretary' }, thePerson)
  expect(madeStarter.status, JSON.stringify(madeStarter.body)).toBe(201)
  starterKey = String(madeStarter.body.whatToGiveIt?.key ?? '')
  expect(starterKey).not.toBe('')
  const mine = await ask('POST', '/api/records', { kind: 'session', title: 'the starter run', data: { state: 'running', servingAgent: STARTER } })
  expect(mine.status, JSON.stringify(mine.body)).toBe(201)
  starterSession = mine.body.record.id as string
  const worker = await ask('POST', '/api/agents/started', { handle: WORKER, name: WORKER, role: 'worker', workArea: ['src'] })
  expect(worker.status, JSON.stringify(worker.body)).toBe(201)
  const row = await ask('POST', `/api/casting/${THE_WORKER}`, { program: { value: 'dsh' }, model: { value: DSH_MODEL }, effort: { value: 'high' }, native: { model: NATIVE, provider: 'deepseek-official', variant: null } }, thePerson)
  expect(row.status, JSON.stringify(row.body)).toBe(201)

  // THE SANDBOX, with the setting on, and a Codex login file of the subscription's shape, which holds no API key.
  const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--dsh', dsh, '--json'])
  expect(up.status, up.err).toBe(0)
  folder = (JSON.parse(up.out.trim()) as { folder: string }).folder
  mkdirSync(join(folder, 'home', '.codex'), { recursive: true })
  writeFileSync(join(folder, 'home', '.codex', 'auth.json'), JSON.stringify({ OPENAI_API_KEY: null, tokens: { id_token: 'made-up', access_token: 'made-up', refresh_token: 'made-up', account_id: 'made-up' }, last_refresh: '2026-11-17T00:00:00Z' }), { mode: 0o600 })
}, 240_000)

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
  if (before === undefined) delete process.env[THE_SETTING]; else process.env[THE_SETTING] = before
})

/**
 * Starts a run of the worker on this runtime and model, and answers what its program was handed once the run's process
 * group has ended: the helper tells the starter of the run's end in a message, which no later case may count as its own.
 */
async function aStartOn(runtime: string, model: string, command: string[]): Promise<Seen> {
  const program = command[0]!
  rmSync(join(seen, `${program}.json`), { force: true })
  const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', runtime, '--model', model, '--json', '--', ...command])
  expect(ran.status, ran.err).toBe(0)
  const group = (JSON.parse(ran.out.trim().split('\n').pop()!) as { hostPgid: number }).hostPgid
  groups.add(group)
  for (const text of [ran.out, ran.err]) for (const value of Object.values(MADE_UP)) expect(text).not.toContain(value)
  const handed = await whatWasHanded(program)
  await until(`the ${runtime} run's process group to end`, () => !aGroupIsHere(group))
  return handed
}

const A_CLAUDE_START = ['claude-code', 'claude-opus-5-5', ['claude', '-p', 'A made-up prompt.']] as const
const A_CODEX_START = ['codex', 'openai/gpt-6.1-sol', ['codex', '-s', 'danger-full-access', '-a', 'never', 'exec', 'A made-up prompt.']] as const
/** The sandbox's Codex login file, which beforeAll makes of the subscription's shape. */
const theCodexLogin = (): string => join(folder, 'home', '.codex', 'auth.json')

describe('while the router is on and does not answer, a run the router does not carry', () => {
  // Case 1. M5.
  it.each([
    A_CLAUDE_START,
    A_CODEX_START,
    ['opencode', UNROUTED_MODEL, ['opencode', 'run', 'A made-up prompt.']],
  ] as const)('on %s starts, and its program is handed no API key by name or by value', async (runtime, model, command) => {
    const handed = await aStartOn(runtime, model, [...command])
    for (const name of THE_API_KEY_NAMES) expect(handed.names, name).not.toContain(name)
    expect(handed.holding).toEqual(runtime === 'claude-code' ? ['CLAUDE_CODE_OAUTH_TOKEN'] : [])
  }, 120_000)

  // Case 2. M5.
  it('is refused before docker exec when its command names any API key with --secret', async () => {
    for (const name of THE_API_KEY_NAMES) {
      const from = state().calls.length
      const ran = await sandbox(['exec', NAME, '--wait', '--secret', name, '--', 'true'])
      expect(ran.status, `${name}: ${ran.err}`).toBe(2)
      expect(ran.err).toContain(name)
      expect(whatRan(from), name).toEqual([])
      expect(ran.err).not.toContain(MADE_UP[name])
    }
  }, 120_000)

  // Case 3. M6.
  it("is handed none of the API key lines of the sandbox container's own environment when it is isolated", async () => {
    const container = `mole-office-sandbox-${NAME}`
    const own = state()
    const kept = own.containers[container]!.Config.Env
    own.containers[container]!.Config.Env = [...kept, ...THE_API_KEY_NAMES.map((name) => `${name}=${MADE_UP[name]}`)]
    writeFileSync(join(fakes, 'state.json'), JSON.stringify(own))
    try {
      const from = state().calls.length
      const ran = await sandbox(['exec', NAME, '--isolated', '--run', await anIsolatedRun(), '--runtime', 'claude-code', '--cwd', folder, '--', 'true'])
      expect(ran.status, ran.err).toBe(0)
      const [created] = state().calls.slice(from).filter((call) => call.tool === 'docker' && call.argv[0] === 'create')
      expect(created?.envNames).toBeDefined()
      for (const name of THE_API_KEY_NAMES) expect(created!.envNames, name).not.toContain(name)
      expect(created!.envNames).toContain('CLAUDE_CODE_OAUTH_TOKEN')
      for (const value of Object.values(MADE_UP)) expect(ran.out + ran.err).not.toContain(value)
    } finally {
      const now = state()
      now.containers[container]!.Config.Env = kept
      writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
    }
  }, 120_000)
})

describe('while the router does not answer, a start the router must carry', () => {
  // Case 4. M7 and M8.
  it.each([['no control socket', false], ['a control socket nothing answers on', true]] as const)(
    'with %s, is refused in one sentence and files nothing, the office still answers, and Claude Code still starts',
    async (_what, silent) => {
      const close = silent ? await aSocketNothingAnswersOn() : async () => {}
      try {
        // AN ORDINARY DSH RUN, from its Casting row.
        let records = theRecords()
        let from = state().calls.length
        const run = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', DSH_MODEL, '--json', '--', 'dsh', 'A made-up prompt.'])
        expect(run.status, run.err).toBe(2)
        expect(run.err).toContain(theRouterIsDown(sandboxes))
        expect(run.out.trim()).toBe('')
        expect(filedSince(records)).toEqual([])
        expect(whatRan(from)).toEqual([])

        // AN ISOLATED DSH RUN, on a run its starter filed before.
        const isolatedRun = await anIsolatedRun()
        records = theRecords()
        from = state().calls.length
        const isolated = await sandbox(['exec', NAME, '--isolated', '--run', isolatedRun, '--runtime', 'dsh', '--cwd', folder, '--', 'dsh', 'A made-up prompt.'])
        expect(isolated.status, isolated.err).toBe(2)
        expect(isolated.err).toContain(theRouterIsDown(sandboxes))
        expect(filedSince(records)).toEqual([])
        expect(whatRan(from)).toEqual([])

        // THE OFFICE STILL ANSWERS, and a run the router does not carry still starts.
        expect((await ask('GET', `/api/records/${starterSession}`)).status).toBe(200)
        const [runtime, model, command] = A_CLAUDE_START
        const handed = await aStartOn(runtime, model, [...command])
        expect(handed.holding).toEqual(['CLAUDE_CODE_OAUTH_TOKEN'])
        for (const text of [run.out, run.err, isolated.out, isolated.err]) for (const value of Object.values(MADE_UP)) expect(text).not.toContain(value)
      } finally {
        await close()
      }
    },
    180_000,
  )
})

describe('while the router is on, a Codex run with no login of its own', () => {
  /** The words that end the one sentence, after the part that says which login is not there. */
  const theSentence = aCodexRunHasNoKeyThroughTheRouter('')

  // Case 5. M9.
  it('is refused in one sentence before anything is filed or runs, and with its login back it starts', async () => {
    const kept = readFileSync(theCodexLogin())
    rmSync(theCodexLogin())
    const records = theRecords()
    const from = state().calls.length
    const [runtime, model, command] = A_CODEX_START
    let ran: Ran
    try {
      ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', runtime, '--model', model, '--json', '--', ...command])
    } finally {
      writeFileSync(theCodexLogin(), kept, { mode: 0o600 })
    }
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain(theSentence)
    expect(ran.err).toContain(theCodexLogin())
    expect(ran.out.trim()).toBe('')
    expect(filedSince(records)).toEqual([])
    expect(whatRan(from)).toEqual([])
    for (const value of Object.values(MADE_UP)) expect(ran.out + ran.err).not.toContain(value)
    const handed = await aStartOn(runtime, model, [...command])
    expect(handed.holding).toEqual([])
  }, 180_000)

  // Case 5. M10.
  it('is refused in the same sentence when it is isolated, though the sandbox has its login', async () => {
    expect(existsSync(theCodexLogin())).toBe(true)
    const isolatedRun = await anIsolatedRun()
    const records = theRecords()
    const from = state().calls.length
    const [runtime, , command] = A_CODEX_START
    const ran = await sandbox(['exec', NAME, '--isolated', '--run', isolatedRun, '--runtime', runtime, '--cwd', folder, '--', ...command])
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain(theSentence)
    expect(filedSince(records)).toEqual([])
    expect(whatRan(from)).toEqual([])
    for (const value of Object.values(MADE_UP)) expect(ran.out + ran.err).not.toContain(value)
  }, 120_000)
})

describe('while the router is on, a sandbox whose Codex login file holds an API key', () => {
  // Case 6. M11 and M12.
  it('starts nothing, names the file, the entry and the mark and never the key, and leaves the home as it was', async () => {
    const kept = readFileSync(theCodexLogin())
    const key = MADE_UP['OPENAI_API_KEY']!
    const inApiKeyMode = JSON.stringify({ OPENAI_API_KEY: key, tokens: null, last_refresh: null })
    writeFileSync(theCodexLogin(), inApiKeyMode, { mode: 0o600 })
    const theHome = (): string[] => readdirSync(join(folder, 'home'), { recursive: true }).map(String).sort()
    const listed = theHome()
    const isolatedRun = await anIsolatedRun()
    const [runtime, model, command] = A_CLAUDE_START
    const starts: [string, string[]][] = [
      ['exec --agent', ['exec', NAME, '--agent', WORKER, '--runtime', runtime, '--model', model, '--json', '--', ...command]],
      ['an isolated exec', ['exec', NAME, '--isolated', '--run', isolatedRun, '--runtime', runtime, '--cwd', folder, '--', 'true']],
      ['a plain exec', ['exec', NAME, '--wait', '--', 'true']],
      ['up', ['up', template, '--name', NAME, '--from', main, '--dsh', dsh, '--json']],
    ]
    const records = theRecords()
    const from = state().calls.length
    try {
      for (const [what, args] of starts) {
        const ran = await sandbox(args)
        expect(ran.status, `${what}: ${ran.err}`).toBe(2)
        for (const named of ['home/.codex/auth.json', 'OPENAI_API_KEY', aSecretsMark(key)]) expect(ran.err, what).toContain(named)
        for (const value of Object.values(MADE_UP)) expect(ran.out + ran.err, what).not.toContain(value)
      }
      expect(filedSince(records)).toEqual([])
      expect(whatRan(from)).toEqual([])
      expect(theHome()).toEqual(listed)
      expect(readFileSync(theCodexLogin(), 'utf8')).toBe(inApiKeyMode)
    } finally {
      writeFileSync(theCodexLogin(), kept, { mode: 0o600 })
    }
    const handed = await aStartOn(runtime, model, [...command])
    expect(handed.holding).toEqual(['CLAUDE_CODE_OAUTH_TOKEN'])
  }, 240_000)
})


it('mounts only its own read-only router folder, which holds just the real router socket', async () => {
  const routerFolder = join(sandboxes, '.run', NAME, 'provider-router')
  const controlFolder = dirname(theRouterControlSocket(sandboxes))
  const slotsFile = join(scratch, 'router-slots.json')
  writeFileSync(slotsFile, JSON.stringify({ version: 1, slots: [] }), { mode: 0o600 })
  const router = createProviderRouter({ sandboxes, slots: [], office: { api, key: 'made-up-office-key' }, log: () => {} })
  try {
    await router.start()
    const socket = await router.open(NAME)
    expect(socket).toBe(join(routerFolder, THE_ROUTER_SOCKET_NAME))
    expect(readdirSync(routerFolder)).toEqual([THE_ROUTER_SOCKET_NAME])
    const container = state().containers[`mole-office-sandbox-${NAME}`] as unknown as { Mounts: { Type: string; Source: string; Destination: string; RW: boolean }[] }
    const binds = container.Mounts.filter((one) => one.Type === 'bind')
    const routerMounts = binds.filter((one) => one.Destination === THE_ROUTER_FOLDER_INSIDE || one.Source === routerFolder)
    expect(routerMounts).toEqual([{ Type: 'bind', Source: routerFolder, Destination: THE_ROUTER_FOLDER_INSIDE, RW: false }])
    const covers = (source: string, target: string) => { const under = relative(source, target); return under === '' || (!under.startsWith('..') && !isAbsolute(under)) }
    for (const mount of binds) {
      expect(covers(mount.Source, controlFolder)).toBe(false)
      expect(covers(mount.Source, slotsFile)).toBe(false)
    }
  } finally { await router.close() }
}, 60_000)


const requireDirectory = (path: string) => statSync(path).isDirectory()

/** Scans only scratch fixtures, with the stand-in process's actual environment copied to a synthetic proc. */
function scanTheHandoff(label: string, roots: string[], environment: string): void {
  const scanRoot = join(scratch, `scan-${label}`), proc = join(scanRoot, 'proc'), capture = join(scanRoot, 'capture')
  mkdirSync(join(proc, '123'), { recursive: true }); mkdirSync(capture, { recursive: true })
  writeFileSync(join(proc, '123', 'environ'), environment.replace(/\n/g, '\0'))
  const hashes = Object.entries(MADE_UP).filter(([name]) => name !== 'CLAUDE_CODE_OAUTH_TOKEN')
    .map(([, value]) => createHash('sha256').update(value).digest('hex'))
  const folders: string[] = []
  for (const path of new Set(roots)) {
    const under = relative(scratch, path)
    expect(under === '' || (!under.startsWith('..') && !isAbsolute(under)) || path === join(REPO, 'tools', 'isolated-gate.mjs')).toBe(true)
    if (requireDirectory(path)) folders.push(path); else copyFileSync(path, join(capture, `file-${folders.length}-${Math.random()}`))
  }
  for (const path of [capture, ...folders]) {
    const result = spawnSync(process.execPath, [join(REPO, 'tools/key-router/scan-inside.mjs'), '--root', path, '--proc', proc], { input: JSON.stringify(hashes), encoding: 'utf8' })
    expect(result.status, result.stdout + result.stderr).toBe(0)
  }
}

it('scans a routed OpenCode start and its sandbox mounts without finding an API key', async () => {
  const router = createProviderRouter({ sandboxes, slots: [], office: { api, key: 'made-up-office-key' }, log: () => {} })
  const capBefore = process.env['MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP']
  process.env['MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP'] = '1'
  const docker = join(fakes, 'bin', 'docker'), capture = join(scratch, 'ordinary-environment')
  const needle = "  const record = { tool: 'docker', argv, envFile, envFileMode: envFile ?"
  expect(FAKE_DOCKER.includes(needle)).toBe(true)
  const captureEnv = `  if (envFile) { fs.copyFileSync(envFile, ${JSON.stringify(capture + '-file')}); fs.writeFileSync(${JSON.stringify(capture)}, Object.entries(env).map(([k,v]) => k + '=' + v).join('\\n')) }\n`
  writeFileSync(docker, FAKE_DOCKER.replace(needle, captureEnv + needle), { mode: 0o755 })
  try {
    const casting = await ask('POST', `/api/casting/${THE_WORKER}`, { program: { value: 'opencode' }, model: { value: DSH_MODEL }, effort: { value: 'high' }, native: { model: NATIVE, provider: 'deepseek', variant: null } }, thePerson)
    expect(casting.status).toBe(201)
    const prices = await ask('POST', '/api/office/price-table', { table: { currency: 'USD', prices: { [NATIVE]: { input: 1000, cachedInput: 100, output: 2000 } } } }, thePerson)
    expect(prices.status).toBe(200)
    const marked = await ask('POST', `/api/casting/rows/${String(casting.body.casting.id)}/mark`, undefined, thePerson)
    expect(marked.status).toBe(200)
    await router.start()
    rmSync(join(seen, 'opencode.json'), { force: true })
    const started = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'opencode', '--json', '--', 'opencode', 'run', 'A made-up prompt.'], true)
    expect(started.status, started.err).toBe(0)
    const group = (JSON.parse(started.out.trim().split('\n').pop()!) as { hostPgid: number }).hostPgid
    groups.add(group)
    await whatWasHanded('opencode')
    await until('the OpenCode run to end', () => !aGroupIsHere(group))
    const container = state().containers[`mole-office-sandbox-${NAME}`] as any
    const mounts = (container.Mounts as any[]).filter((one) => one.Type === 'bind' && existsSync(one.Source)).map((one) => one.Source as string)
    scanTheHandoff('ordinary', [...mounts, capture + '-file'], readFileSync(capture, 'utf8'))
  } finally {
    await router.close(); writeFileSync(docker, FAKE_DOCKER, { mode: 0o755 })
    if (capBefore === undefined) delete process.env['MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP']; else process.env['MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP'] = capBefore
  }
}, 180_000)

it('scans an isolated start and its mounts without finding an API key', async () => {
  const docker = join(fakes, 'bin', 'docker'), capture = join(scratch, 'isolated-handoff.json')
  const needle = "  const image = argv[i]\n  const command = argv.slice(i + 1)"
  expect(FAKE_DOCKER.includes(needle)).toBe(true)
  const captureEnv = `  if (envFile) fs.copyFileSync(envFile, ${JSON.stringify(capture + '-file')}); fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({ env: opts.env, mounts: opts.mounts }))\n`
  writeFileSync(docker, FAKE_DOCKER.replace(needle, captureEnv + needle), { mode: 0o755 })
  try {
    const run = await anIsolatedRun()
    const started = await sandbox(['exec', NAME, '--isolated', '--run', run, '--runtime', 'claude-code', '--cwd', folder, '--', 'true'])
    expect(started.status, started.err).toBe(0)
    const handed = JSON.parse(readFileSync(capture, 'utf8')) as { env: string[]; mounts: string[] }
    const mounts = handed.mounts.map((one) => Object.fromEntries(one.split(',').map((part) => { const i = part.indexOf('='); return i < 0 ? [part, ''] : [part.slice(0, i), part.slice(i + 1)] })))
      .filter((one) => one.type === 'bind' && one.source && existsSync(one.source)).map((one) => one.source!)
    scanTheHandoff('isolated', [...mounts, capture + '-file'], handed.env.join('\n'))
  } finally { writeFileSync(docker, FAKE_DOCKER, { mode: 0o755 }) }
}, 180_000)
