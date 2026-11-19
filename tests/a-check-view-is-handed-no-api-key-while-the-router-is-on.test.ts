// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK VIEW IS HANDED NO API KEY WHILE THE PROVIDER ROUTER IS ON, and one that asks for a key is refused in the
 * router's words while the router does not answer.
 *
 * OLD: with MOLE_OFFICE_PROVIDER_ROUTER on, a check view still took a provider key file whose key the router did not hold
 * by name (a Codex check's), --secret CODEX_API_KEY, and every API key line of the inspector's own image.
 * NEW: while it is on, the launcher (tools/sandbox.mjs exec --check-view) hands a check view none of THE_API_KEY_NAMES:
 *   1. a provider key file is refused unread, whatever its key's name, and is left as it was;
 *   2. --secret naming any of them is refused;
 *   3. the image's own lines for them are left out, and a check that asks for no key starts as before, router or none;
 *   4. a check that asks for a key, by a key file or by --secret, is refused with the one sentence that says the router
 *      does not answer, when no control socket is there and when nothing answers on it, and nothing is run or written
 *      to the ledger;
 *   5. a check whose private home holds an API key in a login file, or whose login seed copied into it does, is refused,
 *      naming the file, the entry and the key's mark and never the key, and nothing is run, written to the ledger or
 *      changed.
 * With the setting off, the image's lines are handed as before.
 *
 * WHAT IS REAL AND WHAT IS NOT. The launcher is the real tools/sandbox.mjs, run as its own process. Docker and the
 * ledger are the stand-ins of tests/check-view-stand-ins.ts, so no container starts and no model runs. The router is a
 * stand-in on the real control socket's path: one that answers GET /slots, or one that takes a connection and never
 * answers. Every key is a made-up value this test writes in its own folder, and none reaches a provider.
 *
 * MUTATIONS, each alone and put back:
 *   M1. whatTheProviderKeyFileHands takes a key file while the router is on: case 1 goes red, docker runs.
 *   M2. theRoutedKeysLeftOut leaves out the routed providers' keys alone, not CODEX_API_KEY: case 2 goes red on that name.
 *   M3. controlCheckView keeps the image's API key lines: case 3 goes red on the names docker was handed.
 *   M4. commandCheckView does not ask whether the router answers: case 4 goes red on the sentence.
 *   M5. commandCheckView does not look in the check's login files: case 5 goes red, docker runs.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer as anHttpServer, type Server as HttpServer } from 'node:http'
import { createServer as aNetServer, type Server as NetServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_API_KEY_NAMES, THE_ROUTER_SETTING, aSecretsMark, theRouterControlSocket } from '../src/config/provider-router.mjs'
import { theRouterIsDown } from '../tools/provider-router-host.mjs'
import { writeInstance } from '../tools/sandbox-common.mjs'
import { CHECK_VIEW_DOCKER, checkViewLedger, writeCheckViewDocker } from './check-view-stand-ins.ts'
import { FAKE_DF, FAKE_FREE } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const FLAG = '--provider-key-file'
const made = Math.random().toString(36).slice(2)
/** A made-up value for each API key name, and for the one subscription login the template declares beside them. */
const MADE_UP: Record<string, string> = Object.fromEntries([...THE_API_KEY_NAMES, 'CLAUDE_CODE_OAUTH_TOKEN'].map((name) => [name, `made-up-${name.toLowerCase()}-${made}`]))
/** The two pairs of names a provider key file holds: dsh's, and a Codex check's. */
const KEY_FILE_NAMES = [['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL'], ['PROVIDER_ROW_API_KEY', 'PROVIDER_ROW_BASE_URL']] as const

let root = ''
let sandboxes = ''
let work = ''
let specFile = ''
let office: Awaited<ReturnType<typeof checkViewLedger>>
let router: { close: () => Promise<void> } | null = null

beforeEach(async () => {
  // A SHORT FOLDER, so the control socket's path stays under the 108 bytes Linux allows.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'mo-cvk-')))
  sandboxes = join(root, 'sandboxes')
  const instance = join(sandboxes, 'inspector')
  work = join(instance, 'check-views/check-a/work')
  const home = join(instance, 'check-views/check-a/home')
  for (const folder of [work, home, join(instance, 'check-views/check-a/tmp'), join(root, 'bin')]) mkdirSync(folder, { recursive: true, mode: 0o700 })
  execFileSync('git', ['init', '-q', work])
  // THE TEMPLATE declares every API key name and the Claude Code token, and its secrets file of mode 600 sets each.
  const template = join(root, 'template')
  mkdirSync(template)
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(REPO, 'sandboxes', 'mole-office-dev', 'devcontainer.json')))
  const secrets = join(root, 'secrets.env')
  writeFileSync(secrets, Object.entries(MADE_UP).map(([name, value]) => `${name}=${value}\n`).join(''), { mode: 0o600 })
  const names = Object.keys(MADE_UP).map((name) => ({ name, readBy: [] }))
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify({ template: 'Synthetic', secrets: { hostFile: secrets, names } }))
  writeInstance(instance, { instance: 'inspector', workspace: 'default', templateDir: template, container: { name: 'mole-office-sandbox-inspector' }, office: { secrets: { names } } })
  writeCheckViewDocker(root, instance)
  // THE INSPECTOR'S IMAGE SETS EVERY API KEY ITSELF, as an image could.
  const config = JSON.parse(readFileSync(join(root, 'docker.json'), 'utf8'))
  config.instance.Config.Env.push(...THE_API_KEY_NAMES.map((name) => `${name}=${MADE_UP[name]}`))
  writeFileSync(join(root, 'docker.json'), JSON.stringify(config))
  writeFileSync(join(root, 'bin/df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(root, 'bin/free'), FAKE_FREE, { mode: 0o755 })
  // FAKE_DF and FAKE_FREE read this state: a synthetic measurement with room for a check.
  writeFileSync(join(root, 'state.json'), JSON.stringify({ freeBytes: 200_000_000_000, memoryAvailable: 200_000_000_000, calls: [], bugs: {} }))
  process.env['FAKE_DOCKER_DIR'] = root
  office = await checkViewLedger(root)
  specFile = join(root, 'spec.json')
  writeFileSync(specFile, JSON.stringify({ check: 'check-a', instance: 'inspector', readOnly: [],
    private: [{ host: work, container: '/work' }, { host: home, container: '/check/home' }, { host: join(instance, 'check-views/check-a/tmp'), container: '/check/tmp' }],
    outputs: { dir: join(root, 'outputs') } }))
})

afterEach(async () => {
  await router?.close()
  router = null
  await office.close()
  delete process.env['FAKE_DOCKER_DIR']
  rmSync(root, { recursive: true, force: true })
})

/** A stand-in router on the control socket's path that answers GET /slots with no slots. */
async function aRouterThatAnswers(): Promise<void> {
  const control = theRouterControlSocket(sandboxes)
  mkdirSync(dirname(control), { recursive: true, mode: 0o700 })
  const server: HttpServer = anHttpServer((_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{"slots":[]}'))
  await new Promise<void>((done) => server.listen(control, done))
  router = { close: () => new Promise<void>((done) => server.close(() => done())) }
}

/** A stand-in on the control socket's path that takes each connection and never answers. */
async function aSocketNothingAnswersOn(): Promise<void> {
  const control = theRouterControlSocket(sandboxes)
  mkdirSync(dirname(control), { recursive: true, mode: 0o700 })
  const held: Socket[] = []
  const server: NetServer = aNetServer((socket) => { held.push(socket) })
  await new Promise<void>((done) => server.listen(control, done))
  router = { close: () => new Promise<void>((done) => { for (const socket of held) socket.destroy(); server.close(() => done()) }) }
}

/** A provider key file of the inspector's shape, in a folder of mode 700 outside every mount, holding a made-up key. */
function aKeyFile([key, address]: readonly [string, string]): string {
  const folder = join(root, 'handed')
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const file = join(folder, `a-check-${key}.env`)
  writeFileSync(file, `${key}=${MADE_UP['OPENAI_API_KEY']}\n${address}=https://provider.example.invalid/v1\n`, { mode: 0o600 })
  return file
}

type Launched = { code: number; out: string; err: string; descriptor: any }

async function launch({ flags = [] as string[], setting = 'on' } = {}): Promise<Launched> {
  const env = { ...withoutInheritedEffort(), PATH: `${root}/bin:${process.env['PATH'] ?? ''}`, CHECK_VIEW_FAKE: root,
    MOLE_OFFICE_API: office.api, MOLE_OFFICE_AGENT: 'synthetic-controller', MOLE_OFFICE_SESSION: 'synthetic-run',
    MOLE_AGENT_KEY: 'synthetic-controller-key', MOLE_OFFICE_WORKSPACE: 'default', [THE_ROUTER_SETTING]: setting }
  const child = spawn(process.execPath, [TOOL, 'exec', 'inspector', '--sandboxes', sandboxes, '--api', office.api,
    '--as', 'synthetic-controller', '--session', 'synthetic-run', '--check-view', specFile, '--cwd', work,
    '--json', '--no-office-variables', ...flags, '--', 'node', '-e', 'console.log("own work")'], { env })
  let out = '', err = ''
  child.stdout.on('data', (chunk) => out += chunk)
  child.stderr.on('data', (chunk) => err += chunk)
  const code = await new Promise<number>((done) => child.on('close', (exit) => done(exit ?? 1)))
  return { code, out, err, descriptor: out.trim().startsWith('{') ? JSON.parse(out.trim()) : null }
}

/** Waits for a started check's receipt, so the docker run it made is noted. */
async function completed(started: Launched): Promise<void> {
  expect(started.code, started.err).toBe(0)
  const end = Date.now() + 15_000
  while (!existsSync(started.descriptor.receipt)) {
    if (Date.now() > end) throw new Error('No receipt was written within 15 seconds.')
    await new Promise((done) => setTimeout(done, 30))
  }
}

/** Every docker run the stand-in was asked for, with the names of the environment it was handed. */
function runs(): { envNames: string[] }[] {
  const file = join(root, 'calls.jsonl')
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((call) => call.argv[0] === 'run') : []
}

const noValueIn = (ran: Launched) => { for (const value of Object.values(MADE_UP)) expect(ran.out + ran.err).not.toContain(value) }

describe('a check view while the provider router is on', () => {
  // M1.
  it('1. refuses a provider key file unread, under dsh\'s names and under a Codex check\'s, and leaves it as it was', async () => {
    await aRouterThatAnswers()
    for (const names of KEY_FILE_NAMES) {
      const file = aKeyFile(names)
      const before = readFileSync(file)
      const ran = await launch({ flags: [FLAG, file] })
      expect(ran.code, names[0]).not.toBe(0)
      expect(ran.err, names[0]).toContain(THE_ROUTER_SETTING)
      expect(runs(), names[0]).toEqual([])
      expect(readFileSync(file), `${names[0]}: the file is left as it was`).toEqual(before)
      noValueIn(ran)
    }
  }, 60_000)

  // M2.
  it('2. refuses --secret for each API key name before docker runs, and names the key it refused', async () => {
    await aRouterThatAnswers()
    for (const name of THE_API_KEY_NAMES) {
      const ran = await launch({ flags: ['--secret', name] })
      expect(ran.code, name).toBe(2)
      expect(ran.err, name).toContain(name)
      expect(runs(), name).toEqual([])
      noValueIn(ran)
    }
  }, 120_000)

  // M3.
  it("3. leaves the image's own API key lines out of a check that asks for no key, which starts with no router; with the setting off they are handed as before", async () => {
    const on = await launch()
    await completed(on)
    const [handed] = runs()
    expect(handed, 'docker was not run').toBeDefined()
    for (const name of THE_API_KEY_NAMES) expect(handed!.envNames, name).not.toContain(name)
    noValueIn(on)
    const off = await launch({ setting: 'off' })
    await completed(off)
    const [, handedOff] = runs()
    for (const name of THE_API_KEY_NAMES) expect(handedOff!.envNames, name).toContain(name)
  }, 60_000)

  // M4.
  for (const [what, routerIs] of [['no control socket', async () => {}], ['a control socket nothing answers on', aSocketNothingAnswersOn]] as const) {
    it(`4. with ${what}, refuses a key file and a --secret API key in the router's one sentence, and runs and writes nothing`, async () => {
      await routerIs()
      const file = aKeyFile(KEY_FILE_NAMES[1])
      const before = readFileSync(file)
      for (const flags of [[FLAG, file], ['--secret', 'OPENAI_API_KEY']]) {
        const ran = await launch({ flags })
        expect(ran.code, flags[0]).toBe(2)
        expect(ran.err, flags[0]).toContain(theRouterIsDown(sandboxes))
        noValueIn(ran)
      }
      expect(runs()).toEqual([])
      expect(office.requests, 'what the launcher asked of the ledger').toEqual([])
      expect(readFileSync(file)).toEqual(before)
    }, 60_000)
  }

  // M5.
  it("5. refuses a check whose private home, or a login seed copied into it, holds an API key, names the file, the entry and the mark, and runs, writes and changes nothing", async () => {
    const key = MADE_UP['OPENAI_API_KEY']!
    const inApiKeyMode = JSON.stringify({ OPENAI_API_KEY: key, tokens: null })
    // IN THE PRIVATE HOME.
    const inTheHome = join(sandboxes, 'inspector', 'check-views/check-a/home', '.codex', 'auth.json')
    mkdirSync(dirname(inTheHome), { mode: 0o700 })
    writeFileSync(inTheHome, inApiKeyMode, { mode: 0o600 })
    const fromTheHome = await launch()
    expect(readFileSync(inTheHome, 'utf8'), 'the private home is left as it was').toBe(inApiKeyMode)
    rmSync(dirname(inTheHome), { recursive: true })
    // IN A LOGIN SEED, outside every check-private tree.
    const seed = join(root, 'seeds', 'codex.json')
    mkdirSync(dirname(seed), { mode: 0o700 })
    writeFileSync(seed, inApiKeyMode, { mode: 0o600 })
    const spec = JSON.parse(readFileSync(specFile, 'utf8'))
    writeFileSync(specFile, JSON.stringify({ ...spec, loginSeeds: [{ host: seed, container: '/login/codex.json', target: '.codex/auth.json' }] }))
    const fromASeed = await launch()
    for (const [what, ran] of [['the private home', fromTheHome], ['a login seed', fromASeed]] as const) {
      expect(ran.code, `${what}: ${ran.err}`).toBe(2)
      for (const named of ['.codex/auth.json', 'OPENAI_API_KEY', aSecretsMark(key)]) expect(ran.err, what).toContain(named)
      noValueIn(ran)
    }
    expect(runs()).toEqual([])
    expect(office.requests, 'what the launcher asked of the ledger').toEqual([])
    expect(readFileSync(seed, 'utf8'), 'the seed is left as it was').toBe(inApiKeyMode)
  }, 60_000)
})


it('scans a check view environment and its mounts without finding an API key', async () => {
  const docker = join(root, 'bin/docker'), capture = join(root, 'check-environment')
  const needle = "fs.appendFileSync(calls, JSON.stringify({ argv, mounts, name, image, envNames: Object.keys(env) }) + '\\n')"
  expect(CHECK_VIEW_DOCKER.includes(needle)).toBe(true)
  const captureEnv = `fs.writeFileSync(${JSON.stringify(capture)}, Object.entries({ ...config.imageEnv, ...env }).map(([k,v]) => k + '=' + v).join('\\n'))\n`
  const envFileNeedle = "    if (a === '--env-file') for (const line of fs.readFileSync(v, 'utf8').split('\\n')) {"
  expect(CHECK_VIEW_DOCKER.includes(envFileNeedle)).toBe(true)
  const captureFile = `    if (a === '--env-file') fs.copyFileSync(v, ${JSON.stringify(capture + '-file')})\n`
  writeFileSync(docker, CHECK_VIEW_DOCKER.replace(needle, captureEnv + needle).replace(envFileNeedle, captureFile + envFileNeedle), { mode: 0o755 })
  const started = await launch()
  await completed(started)
  const calls = readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const run = calls.find((one) => one.argv[0] === 'run')
  expect(run).toBeDefined()
  const mounts = (run.mounts as string[]).map((one) => Object.fromEntries(one.split(',').map((part) => { const i = part.indexOf('='); return i < 0 ? [part, ''] : [part.slice(0, i), part.slice(i + 1)] })))
    .filter((one) => one.type === 'bind' && one.source && existsSync(one.source)).map((one) => one.source!)
  const scan = join(root, 'scan'), proc = join(scan, 'proc'), files = join(scan, 'files')
  mkdirSync(join(proc, '123'), { recursive: true }); mkdirSync(files, { recursive: true })
  writeFileSync(join(proc, '123', 'environ'), readFileSync(capture, 'utf8').replace(/\n/g, '\0'))
  const folders: string[] = []
  if (existsSync(capture + '-file')) mounts.push(capture + '-file')
  for (const path of new Set(mounts)) {
    const under = relative(root, path)
    expect(under === '' || (!under.startsWith('..') && !isAbsolute(under))).toBe(true)
    if (statSync(path).isDirectory()) folders.push(path); else copyFileSync(path, join(files, `file-${Math.random()}`))
  }
  const hashes = Object.entries(MADE_UP).filter(([name]) => name !== 'CLAUDE_CODE_OAUTH_TOKEN').map(([, value]) => createHash('sha256').update(value).digest('hex'))
  for (const path of [files, ...folders]) {
    const result = spawnSync(process.execPath, [join(REPO, 'tools/key-router/scan-inside.mjs'), '--root', path, '--proc', proc], { input: JSON.stringify(hashes), encoding: 'utf8' })
    expect(result.status, result.stdout + result.stderr).toBe(0)
  }
}, 120_000)
