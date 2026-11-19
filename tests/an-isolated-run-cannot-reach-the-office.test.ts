// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * One full isolated-launch contract and the OpenCode login guard run through the real launcher.
 * Synthetic commands exit on ledger or diagnostic handshakes instead of fixed lifetimes. Direct
 * secret-reader cases cover the runtime selection matrix. Every command and container is a stand-in.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { networkInterfaces, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { FAKE_DF, FAKE_FREE, FAKE_DU, FAKE_DEVCONTAINER, FAKE_DOCKER, startsOf, theFakeMachine, theFakeState } from './sandbox-stand-ins.ts'
import { THE_OPENCODE_DATABASE_VARIABLE, theDeclaredSecrets as declaredSecrets } from '../tools/sandbox-common.mjs'
import { FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'
import { CODEX_FEATURES_OFF } from '../tools/harness-features-off.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
// sandbox-common.mjs declares no types, so tsc reads theDeclaredSecrets' optional runtime as undefined only. The
// secret reader cases below pass runtimes.
const theDeclaredSecrets = declaredSecrets as (office: unknown, home?: string, runtime?: string) => ReturnType<typeof declaredSecrets>
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const STARTER = 'isolated-starter'
const NAME = 'isolated'
/** The inside ranges tools/sandbox.mjs blackholes, written out again here so a range dropped there turns this red. */
const INSIDE = ['10.0.0.0/8', '100.64.0.0/10', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16']
/**
 * DOCUMENTATION ADDRESSES THE LAUNCHER IS TOLD ARE THIS MACHINE'S TOO (SANDBOX_ISOLATED_ALSO_OWN, which can only add):
 * the queue's container has no network and no address but loopback, and these prove each address is blackholed and
 * checked wherever this runs.
 */
const ALSO_OWN = ['192.0.2.10', '198.51.100.7']

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
let starterKey = ''
let starterSession = ''

/**
 * THE READ RECORDER'S OWN TWO VARIABLES, TEST_READ_ROOT and TEST_READ_RECORD. The merge queue's suite run loads
 * tools/record-what-tests-read.mjs into every node process, with these two set. When a node process starts a child with
 * an environment of its own, the recorder adds these two back to that environment. The stand-in docker is a node
 * program, so the command it starts holds them in the suite run and in no other. Real docker is not a node program, so a
 * real container never gets them from the recorder. They are not office variables: they name a checkout and a folder,
 * not the office or a key. Until 1 October 2026 they were named MOLE_OFFICE_READ_ROOT and MOLE_OFFICE_READ_RECORD, and
 * case 1 had to let those two names past its MOLE_OFFICE_ filter. Since main 12d1f12 that filter cannot catch them, so
 * case 1 excepts no name. Case 1 still checks that where the command holds them, they carry this test's own values.
 */

/** Every process group a test started, stopped at the end if its leader still works in the scratch. */
const groups = new Set<number>()

interface Ran {
  status: number
  out: string
  err: string
}

/** Run tools/sandbox.mjs as its own process, as the starter, with the starter's key, and `more` in its environment. */
function sandbox(args: string[], more: NodeJS.ProcessEnv = {}, handshake?: { file: string; run?: string; line?: string }): Promise<Ran> {
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
    FAKE_DOCKER_DIR: fakes,
    MOLE_OFFICE_AGENT: STARTER,
    MOLE_OFFICE_SESSION: starterSession,
    MOLE_AGENT_KEY: starterKey,
    SANDBOX_ISOLATED_ALSO_OWN: ALSO_OWN.join(','),
    ...more,
  }
  const cut = args.indexOf('--')
  const before = cut === -1 ? args : args.slice(0, cut)
  const after = cut === -1 ? [] : args.slice(cut)
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [TOOL, ...before, '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE, ...after], { env, detached: true, cwd: scratch })
    if (child.pid !== undefined) groups.add(child.pid)
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    let timer: ReturnType<typeof setTimeout> | undefined
    child.on('close', (code) => { clearTimeout(timer); done({ status: code ?? 1, out, err }) })
    if (handshake !== undefined) {
      const deadline = Date.now() + 20_000
      const poll = () => {
        const registered = handshake.run !== undefined && t.client.sqlite.prepare(
          "SELECT 1 FROM session_resources WHERE session_record_id = ? AND type = 'process'",
        ).get(handshake.run) !== undefined
        if (registered || (handshake.line !== undefined && err.includes(handshake.line))) {
          writeFileSync(handshake.file, 'the launcher reached the expected state\n')
          return
        }
        if (Date.now() >= deadline) { fail(new Error(`The isolated command reached no handshake: ${err}`)); return }
        timer = setTimeout(poll, 10)
      }
      poll()
    }
  })
}

/** A bounded command lifetime controlled by the host's observed ledger or diagnostic state. */
function untilReleased(file: string, code = 0): string {
  return `const fs = require('node:fs'); const waiting = setInterval(() => {
    if (fs.existsSync(${JSON.stringify(file)})) { clearInterval(waiting); process.exit(${code}) }
  }, 10); setTimeout(() => { throw new Error('No host handshake arrived') }, 25_000)`
}

async function ask(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': STARTER,
      ...(starterSession === '' ? {} : { 'x-mole-office-session': starterSession }),
      ...(starterKey === '' ? {} : { 'x-mole-office-key': starterKey }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

/** A running run for the isolated command, filed as the T6 supervisor files one. */
async function aRunningRun(title: string): Promise<string> {
  const made = await ask('POST', '/api/records', { kind: 'session', title, data: { state: 'running' } })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return String(made.body.record.id)
}

async function theRun(run: string): Promise<Record<string, any>> {
  const read = await ask('GET', `/api/records/${run}`)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return (read.body?.record ?? read.body) as Record<string, any>
}

/** The stand-in docker's calls since `from`, of one verb. */
function dockerCalls(verb: string, from = 0): { argv: string[]; envFile?: string | null; envFileMode?: number | null; envNames?: string[]; gate?: string[] | null }[] {
  return (theFakeState(fakes).calls as { tool: string; argv: string[] }[]).slice(from).filter((c) => c.tool === 'docker' && c.argv[0] === verb)
}

/** Every IPv4 address this machine's interfaces carry, loopback left out: what the launcher reads at run time. */
function thisMachinesAddresses(): string[] {
  return Object.values(networkInterfaces()).flatMap((one) => (one ?? []).filter((e) => e.family === 'IPv4' && !e.internal).map((e) => e.address))
}

/** Turns one of the stand-in docker's bugs on or off, in its state file. */
function setBug(name: string, on: boolean): void {
  const now = JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8')) as { bugs: Record<string, boolean> }
  now.bugs[name] = on
  writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
}

/** The values that follow each `flag` in `argv`. */
const valuesOf = (argv: string[], flag: string): string[] => argv.flatMap((word, i) => (word === flag && argv[i + 1] !== undefined ? [argv[i + 1] as string] : []))

const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-isolated-'))
  sandboxes = join(scratch, 'sandboxes')
  fakes = join(scratch, 'fakes')
  secrets = join(scratch, 'sandbox-secrets.env')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))
  // A LOGIN OF EACH KIND: the Claude login, which only claude reads, and OpenRouter's key, which only opencode reads.
  writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\nOPENROUTER_API_KEY=not-a-real-key\n', { mode: 0o600 })

  // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/, and the two folders the template covers.
  const main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  symlinkSync(join(REPO, 'src'), join(main, 'src'))
  writeFileSync(join(main, 'README.md'), 'a checkout for the isolated-run test\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's files, with the secrets file in this test's scratch.
  const template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  // AN OFFICE VARIABLE AND A GIT IDENTITY PLANTED IN THE SANDBOX'S OWN ENVIRONMENT, which an isolated run's container
  // must not inherit: the only git identity it gets is the one its run's agent is given (case 7).
  const devcontainer = JSON.parse(readFileSync(join(real, 'devcontainer.json'), 'utf8'))
  devcontainer.containerEnv = {
    ...(devcontainer.containerEnv ?? {}),
    MOLE_OFFICE_WORKSPACE: 'a-planted-office-variable',
    GIT_AUTHOR_NAME: 'a-planted-identity',
  }
  writeFileSync(join(template, 'devcontainer.json'), JSON.stringify(devcontainer, null, 2))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8'))
  office.secrets.hostFile = secrets
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))

  // THE STARTER, started by the person and handed its own key.
  const made = await fetch(`${api}/api/agents/started`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    body: JSON.stringify({ handle: STARTER, name: STARTER, role: 'supervisor' }),
  })
  const madeBody = (await made.json()) as { whatToGiveIt?: { key?: string } }
  expect(made.status).toBe(201)
  starterKey = String(madeBody.whatToGiveIt?.key ?? '')
  const mine = await ask('POST', '/api/records', { kind: 'session', title: 'the supervisor run', data: { state: 'running' } })
  starterSession = mine.body.record.id

  const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--no-dsh', '--json'])
  expect(up.status, up.err).toBe(0)
  dir = JSON.parse(up.out.trim()).folder
  mkdirSync(join(dir, 'worktrees', 'source-only'), { recursive: true })
}, 180_000)

afterAll(async () => {
  // ONLY THE GROUPS THIS FILE STARTED: the group of each tool a case started, and each group a start.json in the
  // instance's logs names. No list of every process on this machine is read for more (the owner, 26 October 2026).
  if (dir !== '') for (const start of startsOf(dir)) groups.add(start.hostPgid)
  for (const group of groups) {
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
})

describe('exec --isolated', () => {
  it.each([
    ['claude-code', ['CLAUDE_CODE_OAUTH_TOKEN']],
    ['opencode', ['OPENROUTER_API_KEY']],
    ['codex', []],
    ['dsh', []],
    ['unknown-runtime', []],
  ] as const)('the secret reader gives %s only its declared login', (runtime, names) => {
    const declared = JSON.parse(readFileSync(join(REPO, 'sandboxes/mole-office-dev/sandbox.json'), 'utf8'))
    declared.secrets.hostFile = secrets
    const read = theDeclaredSecrets(declared, scratch, runtime)
    expect(read.unsafe).toBeNull()
    expect(read.names).toEqual([...names])
    expect(read.lines.map((line: string) => line.slice(0, line.indexOf('=')))).toEqual([...names])
  })

  // Synthetic runtime commands only. Mutations RUN_HOME_UP_ONLY and RUN_HOME_OVERWRITE must fail these checks.
  it.each([false, true])('prepares only the isolated OpenCode home, keeping existing keys: existing=%s', async existing => {
    const run = await aRunningRun('Synthetic isolated OpenCode preparation')
    const home = join(dir, 'out', 'isolated', run, 'home')
    const folder = join(home, '.config', 'opencode'), file = join(folder, 'opencode.json')
    const ordinary = join(dir, 'home', '.config', 'opencode', 'opencode.json')
    const before = readFileSync(ordinary, 'utf8')
    const held = { $schema: 'https://opencode.ai/config.json', theme: 'synthetic-theme', permission: { edit: 'ask', external_directory: 'ask' } }
    if (existing) { mkdirSync(folder, { recursive: true }); writeFileSync(file, JSON.stringify(held)) }
    const args = ['exec', NAME, '--isolated', '--runtime', 'opencode', '--run', run, '--cwd', dir, '--', 'true']
    const ran = await sandbox(args)
    expect(ran.status, ran.err).toBe(0)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(existing ? { ...held, permission: { ...held.permission, external_directory: 'allow' } } : { permission: { external_directory: 'allow' } })
    expect(ran.err.split('OpenCode config now allows external-directory permission.')).toHaveLength(2)
    expect(ran.err.split('\n').find(line => line.includes('host pid'))).toContain('OpenCode config now allows external-directory permission.')
    const next = await sandbox(args)
    expect(next.status, next.err).toBe(0)
    expect(next.err).not.toContain('OpenCode config now allows external-directory permission.')
    expect(readFileSync(ordinary, 'utf8')).toBe(before)
  }, 30_000)

  // Mutation RUN_HOME_EVERY_RUNTIME must fail both negative runtime checks.
  it.each(['claude-code', 'codex'])('an isolated %s run does not create OpenCode config', async runtime => {
    const run = await aRunningRun('Synthetic other runtime isolated preparation')
    const codex = join(fakes, 'bin', 'codex')
    writeFileSync(codex, '#!/bin/sh\nprintf synthetic-codex-stand-in\n', { mode: 0o755 })
    const command = runtime === 'codex' ? [codex, ...FULL_PERMISSIONS.codex!.args, 'exec', '--', 'synthetic task'] : ['true']
    const ran = await sandbox(['exec', NAME, '--isolated', '--runtime', runtime, '--run', run, '--cwd', dir, '--', ...command])
    expect(ran.status, ran.err).toBe(0)
    expect(existsSync(join(dir, 'out', 'isolated', run, 'home', '.config', 'opencode', 'opencode.json'))).toBe(false)
    expect(ran.err).not.toContain('OpenCode config now allows external-directory permission.')
  })

  it('a malformed isolated OpenCode config refuses before any resource or record write', async () => {
    const run = await aRunningRun('Synthetic malformed isolated OpenCode preparation')
    const folder = join(dir, 'out', 'isolated', run, 'home', '.config', 'opencode')
    mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, 'opencode.json'), '[]')
    const before = await theRun(run), calls = theFakeState(fakes).calls.length
    const rows = (await ask('GET', '/api/resources?includeReleased=true')).body.resources.map((row: { id: string }) => row.id)
    const ran = await sandbox(['exec', NAME, '--isolated', '--runtime', 'opencode', '--run', run, '--cwd', dir, '--', 'true'])
    expect(ran.status).not.toBe(0)
    expect(ran.err).toContain('must hold a JSON object')
    expect((await theRun(run)).data).toEqual(before.data)
    expect((await ask('GET', '/api/resources?includeReleased=true')).body.resources.map((row: { id: string }) => row.id)).toEqual(rows)
    expect(dockerCalls('create', calls)).toEqual([])
  })

  it('1: makes the container unable to reach this machine, runs the command, files and closes its rows, and leaves the run to its supervisor', async () => {
    const run = await aRunningRun('a source-only run')
    const cwd = join(dir, 'worktrees', 'source-only')
    const seen = join(dir, 'out', 'isolated-env.json')
    const itsPid = join(dir, 'out', 'isolated-pid.txt')
    const released = join(dir, 'out', 'isolated-release')
    const before = theFakeState(fakes).calls.length
    // The host releases this command once its own process row has been filed.
    const ran = await sandbox(['exec', NAME, '--isolated', '--runtime', 'claude-code', '--run', run, '--cwd', cwd, '--', process.execPath, '-e', `const e = process.env; require('fs').writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ names: Object.keys(e), read: [e.TEST_READ_ROOT ?? null, e.TEST_READ_RECORD ?? null] })); require('fs').writeFileSync(${JSON.stringify(itsPid)}, String(process.pid)); ${untilReleased(released)}`], {}, { file: released, run })
    expect(ran.status, ran.err).toBe(0)
    const details = join(dir, 'logs', run, 'launch.txt')
    expect(ran.err).toContain(`details ${details}`)
    expect(ran.err).toContain('starts in its own container')
    expect(ran.err).not.toContain('networks blackholed')
    expect(ran.err).not.toContain('isolated command ended: it exited 0')
    expect(readFileSync(details, 'utf8')).toContain(`run ${run} starts in its own container`)
    expect(readFileSync(details, 'utf8')).toContain('isolated command ended: it exited 0')

    // HOW THE CONTAINER IS MADE.
    const [create] = dockerCalls('create', before)
    expect(create, 'no container was made').toBeDefined()
    const argv = create!.argv
    expect(valuesOf(argv, '--network')).toEqual(['bridge'])
    expect(valuesOf(argv, '--cap-add')).toEqual(['NET_ADMIN'])
    expect(valuesOf(argv, '--user')).toEqual(['0'])
    // IPv6 OFF, AND THE REVERSE-PATH FILTER OFF (problem roHECcQU9Fmq), written out here so a list emptied there turns this red.
    expect(valuesOf(argv, '--sysctl')).toEqual(['net.ipv6.conf.all.disable_ipv6=1', 'net.ipv4.conf.all.rp_filter=0', 'net.ipv4.conf.default.rp_filter=0'])
    expect(valuesOf(argv, '--dns')).toEqual(['1.1.1.1', '8.8.8.8'])
    expect(argv).toContain('--init')
    expect(argv).toContain('--rm')
    // HELD TO THE SANDBOX DEFAULTS the owner set: 16 GB with swap counted in, 8 cores below the desktop's priority,
    // 2000 processes. This follows problem TotXlPFHFduz as well. Mutation ISOLATED_LIMITS:
    // the create made without them, red here.
    expect(argv).toEqual(expect.arrayContaining(['--memory=16g', '--memory-swap=16g', '--cpus=8', '--cpu-shares=256', '--pids-limit=2000']))
    // ROOM FOR PICTURES (problem TKH0KMph-bMR), as every sandbox container has. Mutation ISOLATED_SHM: not given, red here.
    expect(argv.filter((a) => a.startsWith('--shm-size'))).toEqual(['--shm-size=1g'])
    expect(valuesOf(argv, '--entrypoint')).toEqual(['node'])
    expect(valuesOf(argv, '-w')).toEqual([cwd])
    const mounts = valuesOf(argv, '--mount')
    expect(mounts).toContain(`type=bind,source=${join(REPO, 'tools', 'isolated-gate.mjs')},target=/opt/mole-office/isolated-gate.mjs,readonly`)
    const sandboxMounts = (theFakeState(fakes).containers[`mole-office-sandbox-${NAME}`] as { Mounts: { Destination: string }[] }).Mounts
    for (const m of sandboxMounts) expect(mounts.some((one) => one.includes(`target=${m.Destination}`)), `the sandbox's mount at ${m.Destination} is not copied`).toBe(true)

    // WHAT THE GATE IS ASKED TO DO.
    const gate = argv.slice(argv.indexOf('/opt/mole-office/isolated-gate.mjs') + 1, argv.lastIndexOf('--'))
    expect(valuesOf(gate, '--as')).toEqual(['1000:1000'])
    const blackholes = valuesOf(gate, '--blackhole')
    for (const range of INSIDE) expect(blackholes, `${range} is not blackholed`).toContain(range)
    const port = new URL(api).port
    const own = [...new Set([...thisMachinesAddresses(), ...ALSO_OWN])]
    for (const address of own) {
      expect(blackholes, `this machine's ${address} is not blackholed`).toContain(`${address}/32`)
      expect(valuesOf(gate, '--unreachable'), `this machine's ${address} is not checked`).toContain(`${address}:${port}`)
    }
    expect(valuesOf(gate, '--resolve')).toEqual(['api.anthropic.com'])
    // A HOME OF ITS OWN, made before the container starts, and never the sandbox's, which holds the other runs'
    // settings and conversations and the session hook that brings Mole Office in (message 87T4xUjQgCp3).
    const itsHome = join(dir, 'out', 'isolated', run, 'home')
    expect(valuesOf(gate, '--home'), "the gate is not handed a home of the run's own").toEqual([itsHome])
    // The switch that turns the harness's own subagents and workflows off is the only thing in it: Claude Code's denied
    // tools and Codex's features, as a harness started inside a shell's words reads them.
    expect(readdirSync(itsHome).sort(), "the run's home holds more than the switch").toEqual(['.claude', '.codex'])
    expect(readdirSync(join(itsHome, '.claude'))).toEqual(['settings.json'])
    expect(JSON.parse(readFileSync(join(itsHome, '.claude', 'settings.json'), 'utf8')), "the run's Claude Code settings hold more than the switch").toEqual({
      permissions: { deny: expect.arrayContaining(['Agent', 'Task', 'Workflow', 'ListAgents', 'SendMessage']) },
    })
    expect(readdirSync(join(itsHome, '.codex'))).toEqual(['config.toml'])
    expect(readFileSync(join(itsHome, '.codex', 'config.toml'), 'utf8')).toBe('[features]\nmulti_agent = false\nmulti_agent_v2 = false\n')
    const sandboxEnv = (theFakeState(fakes).containers[`mole-office-sandbox-${NAME}`] as unknown as { Config: { Env: string[] } }).Config.Env
    const sandboxHome = (sandboxEnv.find((line) => line.startsWith('HOME=')) ?? '').slice('HOME='.length)
    expect(sandboxHome, 'the sandbox names no home of its own').toMatch(/\/home$/)
    expect(valuesOf(gate, '--home'), "the gate is handed the sandbox's own home").not.toContain(sandboxHome)

    // WHAT REACHES THE CONTAINER, and the file that carried it.
    expect(create!.envFileMode).toBe(0o600)
    expect(existsSync(String(create!.envFile)), 'the env file is still there').toBe(false)
    const names = create!.envNames ?? []
    expect(names).toContain('CLAUDE_CODE_OAUTH_TOKEN')
    expect(names, "a claude-code run was given OpenRouter's key").not.toContain('OPENROUTER_API_KEY')
    expect(names).toContain('SANDBOX_DIR')
    expect(names.filter((one) => one.startsWith('MOLE_OFFICE_') || one === 'MOLE_AGENT_KEY' || one === 'SANDBOX_RUN_KEY'), 'an office variable or a key reached the container').toEqual([])
    // A RUN THAT SERVES NO AGENT GETS NO GIT IDENTITY, not even the one planted in the sandbox's own environment, and
    // the tool says so. Case 7 is a run that serves one.
    expect(names.filter((one) => one.startsWith('GIT_')), 'a git identity reached a run that serves no agent').toEqual([])
    expect(ran.err).toContain(`the run ${run} names no agent that serves it, so its command gets no git identity`)
    const inside = JSON.parse(readFileSync(seen, 'utf8')) as { names: string[]; read: [string | null, string | null] }
    expect(inside.names.filter((one) => one.startsWith('MOLE_OFFICE_') || one === 'MOLE_AGENT_KEY'), 'the command holds an office variable or a key').toEqual([])
    // THE READ RECORDER'S TWO, where the command holds them, carry this test's own values, as the recorder resolves them.
    const [readRoot, readRecord] = inside.read
    if (readRoot !== null) expect(readRoot, 'the command holds a TEST_READ_ROOT the recorder did not give it').toBe(resolve(String(process.env['TEST_READ_ROOT'])))
    if (readRecord !== null) expect(readRecord, 'the command holds a TEST_READ_RECORD the recorder did not give it').toBe(resolve(String(process.env['TEST_READ_RECORD'])))

    // THE ROWS, filed by the host and closed at the end: the container's, and its first process's as the run's own.
    const rows = (await ask('GET', '/api/resources?includeReleased=true')).body.resources as { type: string; key: string; detail?: string; sessionRecordId?: string; releasedAt: string | null; startedByTheProduct?: boolean | null }[]
    const ofTheRun = rows.filter((r) => r.sessionRecordId === run)
    const box = ofTheRun.find((r) => r.type === 'container')
    const proc = ofTheRun.find((r) => r.type === 'process')
    expect(box?.key).toMatch(/^mole-office-isolated-isolated-/)
    expect(box?.releasedAt, 'the container row is still open').toEqual(expect.any(String))
    // THE PROCESS ROW NAMES THE COMMAND BY ITS PID ON THIS MACHINE, and says the container it runs in; the container's
    // own first processes run as root in a real one, and the office cannot read those (problem HqDLmh0yFT4G).
    expect(proc?.key, "the process row does not name the command's own pid").toBe(readFileSync(itsPid, 'utf8'))
    expect(String(proc?.detail)).toContain(`isolated in ${String(box?.key)}`)
    // NOT THROUGH THE CONTAINER DOOR: the office writes "inside container" into a row it found by container and pid.
    expect(String(proc?.detail), 'the process row was filed as the container and its pid, not as the command').not.toContain('inside container')
    expect(proc?.startedByTheProduct).toBe(true)
    expect(proc?.releasedAt, 'the process row is still open').toEqual(expect.any(String))

    // THE RUN, left running for its supervisor, with its end written on it.
    const record = await theRun(run)
    expect(record.data.state).toBe('running')
    expect(String(record.data.detail)).toContain('with exit 0')
    expect(String(record.data.detail)).toContain('left running for its supervisor')
  }, 120_000)

  it('2: a command that exits 3 ends the tool with 3, and the run is marked crashed', async () => {
    const run = await aRunningRun('a source-only run that fails')
    const ran = await sandbox(['exec', NAME, '--isolated', '--runtime', 'claude-code', '--run', run, '--cwd', join(dir, 'worktrees', 'source-only'), '--', process.execPath, '-e', 'process.exit(3)'])
    expect(ran.status, ran.err).toBe(3)
    const record = await theRun(run)
    expect(record.data.state).toBe('crashed')
    expect(String(record.data.detail)).toContain('it exited 3')
  }, 120_000)

  it('3: needs a runtime it knows, a running run and a working folder inside the sandbox, takes no agent option, and makes nothing when it refuses', async () => {
    const run = await aRunningRun('a run for the refusals')
    const inside = join(dir, 'worktrees', 'source-only')
    const before = theFakeState(fakes).calls.length
    const noRuntime = await sandbox(['exec', NAME, '--isolated', '--run', run, '--cwd', inside, '--', 'true'])
    expect(noRuntime.status).toBe(2)
    expect(noRuntime.err).toContain('--isolated needs --runtime')
    const unknown = await sandbox(['exec', NAME, '--isolated', '--runtime', 'a-runtime-nobody-knows', '--run', run, '--cwd', inside, '--', 'true'])
    expect(unknown.status).toBe(2)
    expect(unknown.err).toContain('--isolated knows the runtimes')
    const noRun = await sandbox(['exec', NAME, '--isolated', '--runtime', 'claude-code', '--cwd', inside, '--', 'true'])
    expect(noRun.status).toBe(2)
    expect(noRun.err).toContain('name it with --run')
    const noCwd = await sandbox(['exec', NAME, '--isolated', '--runtime', 'claude-code', '--run', run, '--', 'true'])
    expect(noCwd.status).toBe(2)
    expect(noCwd.err).toContain('--isolated needs --cwd')
    const outside = await sandbox(['exec', NAME, '--isolated', '--runtime', 'claude-code', '--run', run, '--cwd', scratch, '--', 'true'])
    expect(outside.status).not.toBe(0)
    expect(outside.err).toContain('is not a folder inside the sandbox folder')
    const agent = await sandbox(['exec', NAME, '--isolated', '--runtime', 'claude-code', '--run', run, '--cwd', inside, '--agent', STARTER, '--', 'true'])
    expect(agent.status).toBe(2)
    expect(agent.err).toContain('--isolated does not take --agent')
    const ended = await aRunningRun('a run that ended')
    expect((await ask('PATCH', `/api/records/${ended}`, { dataPatch: { state: 'crashed', detail: 'ended before' } })).status).toBe(200)
    const over = await sandbox(['exec', NAME, '--isolated', '--runtime', 'claude-code', '--run', ended, '--cwd', inside, '--', 'true'])
    expect(over.status).not.toBe(0)
    expect(over.err).toContain('is not a running run')
    expect(dockerCalls('create', before), 'a refusal made a container').toEqual([])
  }, 120_000)

  it('4: a first process that has ended before its pid is read gets no process row, and the rest is done as always', async () => {
    const run = await aRunningRun('a source-only run whose first process is gone when the launcher looks')
    const released = join(dir, 'out', 'gone-release')
    setBug('firstProcessGone', true)
    let ran: Ran
    try {
      // The command waits for the launcher's unreadable-pid diagnostic.
      ran = await sandbox(['exec', NAME, '--isolated', '--runtime', 'claude-code', '--run', run, '--cwd', join(dir, 'worktrees', 'source-only'), '--', process.execPath, '-e', untilReleased(released, 4)], {}, { file: released, line: 'could not be read in /proc' })
    } finally {
      setBug('firstProcessGone', false)
    }
    expect(ran.status, ran.err).toBe(4)
    expect(ran.err).toContain('could not be read in /proc')
    const rows = (await ask('GET', '/api/resources?includeReleased=true')).body.resources as { type: string; sessionRecordId?: string; releasedAt: string | null }[]
    const ofTheRun = rows.filter((r) => r.sessionRecordId === run)
    expect(ofTheRun.filter((r) => r.type === 'process'), 'a process row was filed for a pid that could not be read').toEqual([])
    expect(ofTheRun.find((r) => r.type === 'container')?.releasedAt, 'the container row is still open').toEqual(expect.any(String))
    const record = await theRun(run)
    expect(record.data.state).toBe('crashed')
    expect(String(record.data.detail)).toContain('it exited 4')
  }, 120_000)

  it('5: asks docker again when it cannot answer about the running container, and files the first process row all the same', async () => {
    const run = await aRunningRun('a source-only run while docker cannot answer at first')
    rmSync(join(fakes, 'inspect-failures'), { force: true })
    const released = join(dir, 'out', 'retry-release')
    setBug('inspectFailsThrice', true)
    let ran: Ran
    try {
      // The command waits until its row is filed after the three unanswered questions.
      ran = await sandbox(['exec', NAME, '--isolated', '--runtime', 'claude-code', '--run', run, '--cwd', join(dir, 'worktrees', 'source-only'), '--', process.execPath, '-e', untilReleased(released)], {}, { file: released, run })
    } finally {
      setBug('inspectFailsThrice', false)
    }
    expect(ran.status, ran.err).toBe(0)
    expect(readFileSync(join(fakes, 'inspect-failures'), 'utf8'), 'docker was not left unanswered three times').toBe('xxx')
    const rows = (await ask('GET', '/api/resources?includeReleased=true')).body.resources as { type: string; sessionRecordId?: string; releasedAt: string | null; startedByTheProduct?: boolean | null }[]
    const ofTheRun = rows.filter((r) => r.sessionRecordId === run)
    const proc = ofTheRun.find((r) => r.type === 'process')
    expect(proc?.startedByTheProduct, 'no process row was filed once docker answered').toBe(true)
    expect(proc?.releasedAt, 'the process row is still open').toEqual(expect.any(String))
    expect(ofTheRun.find((r) => r.type === 'container')?.releasedAt, 'the container row is still open').toEqual(expect.any(String))
    expect((await theRun(run)).data.state).toBe('running')
  }, 120_000)

  it("6: an opencode run holds OpenRouter's key and never the Claude login", async () => {
    const run = await aRunningRun('a source-only run of opencode')
    const seen = join(dir, 'out', 'isolated-opencode-env.json')
    const before = theFakeState(fakes).calls.length
    const ran = await sandbox(['exec', NAME, '--isolated', '--runtime', 'opencode', '--run', run, '--cwd', join(dir, 'worktrees', 'source-only'), '--', process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(seen)}, JSON.stringify(Object.keys(process.env)))`])
    expect(ran.status, ran.err).toBe(0)
    const [create] = dockerCalls('create', before)
    expect(create, 'no container was made').toBeDefined()
    const names = create!.envNames ?? []
    expect(names).toContain('OPENROUTER_API_KEY')
    expect(names, 'an opencode run was given the Claude login').not.toContain('CLAUDE_CODE_OAUTH_TOKEN')
    const inside = JSON.parse(readFileSync(seen, 'utf8')) as string[]
    expect(inside).toContain('OPENROUTER_API_KEY')
    expect(inside, 'the command holds the Claude login').not.toContain('CLAUDE_CODE_OAUTH_TOKEN')
    // AN ISOLATED RUN KEEPS OPENCODE'S DEFAULT DATABASE FILE, in a home of its own, and is given no agent's file.
    expect(names, 'an isolated run was given an OpenCode database file').not.toContain(THE_OPENCODE_DATABASE_VARIABLE)
    expect(inside, 'the command holds an OpenCode database file').not.toContain(THE_OPENCODE_DATABASE_VARIABLE)
    // AND IT SAYS WHAT IT LEFT OUT.
    expect(readFileSync(join(dir, 'logs', run, 'launch.txt'), 'utf8')).toContain('Left out, because opencode does not read them: CLAUDE_CODE_OAUTH_TOKEN')
    expect(ran.err).not.toMatch(/Left out|Secrets named but not passed|no secret was passed|sets none of the names/)
  }, 120_000)

  it('7: gives a run that serves an agent the git identity an ordinary run gets, and not the one planted in the sandbox', async () => {
    // AN AGENT THE STARTER STARTED, and a running run that serves it, as T6's supervisor files one.
    const agent = await ask('POST', '/api/agents/started', { handle: 'a-source-only-agent', name: 'A source-only agent', role: 'worker' })
    expect(agent.status, JSON.stringify(agent.body)).toBe(201)
    const made = await ask('POST', '/api/records', { kind: 'session', title: 'a source-only run that serves an agent', data: { state: 'running', servingAgent: 'a-source-only-agent' } })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const run = String(made.body.record.id)
    const seen = join(dir, 'out', 'isolated-identity.json')
    const before = theFakeState(fakes).calls.length
    const ran = await sandbox(
      ['exec', NAME, '--isolated', '--runtime', 'claude-code', '--run', run, '--cwd', join(dir, 'worktrees', 'source-only'), '--', process.execPath, '-e',
        `const e = process.env; require('fs').writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ an: e.GIT_AUTHOR_NAME, ae: e.GIT_AUTHOR_EMAIL, cn: e.GIT_COMMITTER_NAME, ce: e.GIT_COMMITTER_EMAIL }))`],
      // THE OFFICE'S COMMIT ADDRESS, as the tool reads it: a documentation address here, never a real one.
      { MOLE_OFFICE_COMMIT_EMAIL: 'agents@example.test' },
    )
    expect(ran.status, ran.err).toBe(0)
    expect(ran.err).not.toContain('names no agent that serves it')
    expect(JSON.parse(readFileSync(seen, 'utf8'))).toEqual({
      an: 'a-source-only-agent',
      ae: 'agents@example.test',
      cn: 'a-source-only-agent',
      ce: 'agents@example.test',
    })
    // ONE OF EACH NAME in the env file, so the command cannot pick up the sandbox's planted one instead.
    const names = dockerCalls('create', before)[0]?.envNames ?? []
    for (const one of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) {
      expect(names.filter((name) => name === one), `${one} is not in the env file exactly once`).toHaveLength(1)
    }
  }, 120_000)

  it('8: says so when the look finds no process of the sandbox’s user, whether the container ended first or the time ran out', async () => {
    const cwd = join(dir, 'worktrees', 'source-only')
    setBug('neverSeenRunning', true)
    try {
      // THE CONTAINER ENDS FIRST: a command that ends at once, in a container never seen running.
      const quick = await aRunningRun('a source-only run whose container ends before it is seen')
      const first = await sandbox(['exec', NAME, '--isolated', '--runtime', 'claude-code', '--run', quick, '--cwd', cwd, '--', process.execPath, '-e', ''])
      expect(first.status, first.err).toBe(0)
      expect(first.err).toContain(`run ${quick}'s container ended before any process of the sandbox's user was seen in it, so no process row was filed`)
      // THE TIME RUNS OUT: a command that outlasts a look shortened for this test.
      const slow = await aRunningRun('a source-only run whose command is not seen in time')
      const released = join(dir, 'out', 'unseen-release')
      const second = await sandbox(
        ['exec', NAME, '--isolated', '--runtime', 'claude-code', '--run', slow, '--cwd', cwd, '--', process.execPath, '-e', untilReleased(released)],
        { SANDBOX_ISOLATED_LOOK_MS: '300' }, { file: released, line: 'within 300 milliseconds' },
      )
      expect(second.status, second.err).toBe(0)
      expect(second.err).toContain(`no process of the sandbox's user (1000:1000) appeared in run ${slow}'s container within 300 milliseconds, so no process row was filed`)
      // NEITHER RUN HAS A PROCESS ROW, and each container's row is closed.
      const rows = (await ask('GET', '/api/resources?includeReleased=true')).body.resources as { type: string; sessionRecordId?: string; releasedAt: string | null }[]
      for (const run of [quick, slow]) {
        expect(rows.filter((r) => r.sessionRecordId === run && r.type === 'process'), `run ${run} has a process row`).toEqual([])
        expect(rows.find((r) => r.sessionRecordId === run && r.type === 'container')?.releasedAt, `run ${run}'s container row is still open`).toEqual(expect.any(String))
      }
    } finally {
      setBug('neverSeenRunning', false)
    }
  }, 120_000)

  it('9: refuses an empty commit address in the settings reader’s own words, before anything is made', async () => {
    // A RUN THAT SERVES AN AGENT, so the tool reads the office's commit address for it.
    const agent = await ask('POST', '/api/agents/started', { handle: 'a-run-with-no-address', name: 'A run with no address', role: 'worker' })
    expect(agent.status, JSON.stringify(agent.body)).toBe(201)
    const made = await ask('POST', '/api/records', { kind: 'session', title: 'a source-only run with an empty commit address', data: { state: 'running', servingAgent: 'a-run-with-no-address' } })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const run = String(made.body.record.id)
    const before = theFakeState(fakes).calls.length
    const ran = await sandbox(
      ['exec', NAME, '--isolated', '--runtime', 'claude-code', '--run', run, '--cwd', join(dir, 'worktrees', 'source-only'), '--', process.execPath, '-e', ''],
      { MOLE_OFFICE_COMMIT_EMAIL: '' },
    )
    expect(ran.status, ran.err).not.toBe(0)
    expect(ran.err).toContain('MOLE_OFFICE_COMMIT_EMAIL is set to an empty value')
    // NOTHING WAS MADE: no container, no row for one, and the run is as it was.
    expect(dockerCalls('create', before)).toEqual([])
    const rows = (await ask('GET', '/api/resources?includeReleased=true')).body.resources as { sessionRecordId?: string }[]
    expect(rows.filter((r) => r.sessionRecordId === run)).toEqual([])
    expect((await theRun(run)).data.state).toBe('running')
    // THE SHARED FUNCTION REFUSES ONE ITSELF, whoever hands it the address, and gives a run that serves no agent nothing.
    const { theGitIdentity } = (await import('../tools/sandbox-common.mjs')) as {
      theGitIdentity: (servedAgent: string | null, address: string | null) => { env: Record<string, string> | null; says: string | null }
    }
    expect(() => theGitIdentity('a-run-with-no-address', '')).toThrow('MOLE_OFFICE_COMMIT_EMAIL has no value')
    expect(theGitIdentity(null, '').env).toBeNull()
  }, 120_000)

  // A FLAGLESS CODEX COMMAND ARRIVES WITH THE SHARED ARGUMENTS. On the isolated path tools/sandbox.mjs checks a Codex
  // command's argv with aCodexContainerCommand and passes the checked argv to theStartValues, whose command the
  // container is made with, so the container carries -s danger-full-access -a never between the program and exec.
  // Mutation ISOLATED_CODEX_PRE_CHECK_ARGV must fail this case: handing the pre-check argv to theStartValues instead of
  // the checked one leaves those arguments out. The stand-in is named codex, so the launcher reads it as the tool by its
  // base name, and it accepts any argv, so a fault reads as the permission assertion below and never as an execution
  // failure.
  it('10: an isolated flagless Codex command carries the shared permission arguments before exec in the container it is made with', async () => {
    const run = await aRunningRun('Synthetic isolated Codex permission handoff')
    const codex = join(fakes, 'bin', 'codex')
    const seen = join(dir, 'out', 'isolated-codex-argv.json')
    writeFileSync(codex, `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(seen)}\n`, { mode: 0o755 })
    const before = theFakeState(fakes).calls.length
    const ran = await sandbox(['exec', NAME, '--isolated', '--runtime', 'codex', '--run', run, '--cwd', join(dir, 'worktrees', 'source-only'), '--', codex, 'exec', '--', 'synthetic task'])
    expect(ran.status, ran.err).toBe(0)

    // THE CREATE ARGV, AFTER THE GATE'S "--": the command the container runs, exactly as docker create was handed it.
    const [create] = dockerCalls('create', before)
    expect(create, 'no container was made').toBeDefined()
    const argv = create!.argv
    const after = argv.slice(argv.indexOf('/opt/mole-office/isolated-gate.mjs') + 1)
    const separator = after.indexOf('--')
    expect(separator, 'the gate was asked to run no command').toBeGreaterThan(-1)
    const command = after.slice(separator + 1)
    expect(command[0]).toBe(codex)
    const exec = command.indexOf('exec')
    expect(exec, 'the handoff has no exec subcommand').toBeGreaterThan(0)
    // Codex's switch that turns its subagents off comes first (tools/harness-features-off.mjs), then the permissions.
    const given = [...CODEX_FEATURES_OFF, ...FULL_PERMISSIONS.codex!.args]
    expect(command.slice(1, exec), 'the switch and the shared permission arguments are not between the program and exec').toEqual(given)

    // AND THE COMMAND RAN WITH THEM: the stand-in records the argv it was executed with.
    const executed = readFileSync(seen, 'utf8').trim().split('\n')
    expect(executed.slice(0, given.length)).toEqual(given)
  }, 120_000)
})
