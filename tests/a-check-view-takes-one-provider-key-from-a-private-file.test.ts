// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK VIEW TAKES ONE PROVIDER KEY FROM A PRIVATE FILE, AND THE KEY IS NEVER ON AN ARGUMENT LIST, IN AN ENVIRONMENT
 * OUTSIDE THE VIEW, OR IN ANYTHING THE VIEW LEAVES.
 *
 * A dsh check whose Casting row names a provider row is handed that provider's key and base address alone. The
 * inspector writes them into a file of its own (tools/inspector-sandbox.mjs, runInside), and the launcher reads that
 * file once and removes it (tools/sandbox.mjs, --provider-key-file).
 *
 * WHAT IS PROVED HERE
 *
 *   A. runInside, with tests/inspector-view-stand-in.ts as its launcher:
 *      V1a. The launcher is handed the path of the file alone, and no --secret. The file is a new regular file of mode
 *           600 in a folder of mode 700, outside every folder the view mounts or writes, holding the key and the base
 *           address. It is gone once the launcher has ended, and the umask is as it was.
 *      V1b. It is gone when the launcher fails, too.
 *      V1c. Leaving the sandbox removes this check's file and the file of a check that is gone.
 *      V1d. A start that does not say what a key file handed is refused, and so is one that says it when no file was handed.
 *      V2.  A provider key for anything but the dsh model of its own native provider is refused before the launcher is
 *           called. dsh is signed in from a provider row without the template; Claude Code and OpenCode are refused one.
 *           A Codex check's is tests/a-codex-check-takes-its-one-key-from-a-provider-row.test.ts's.
 *      V3.  The key is masked, under its own name, in what the view answers and in what it leaves.
 *   B. the launcher, tools/sandbox.mjs exec --check-view, with the check-view docker stand-in, each case once with dsh's
 *      two names and once with a Codex check's (THE_CODEX_PROVIDER_VARIABLES), except that V6a runs on the none network
 *      alone under a Codex check's names:
 *      V4.  The command sees the key and the base address and no other key-like name. The file is gone before docker
 *           runs, the env file holds each name once and is gone after, and the start names the address and not the key.
 *           The value is in no file the run leaves and in no request to the ledger.
 *      V5.  Each fault in the file is refused before docker runs, the file is left, and no refusal holds the value. A file
 *           reached through a linked folder is refused before it is read. The provider router being on is a fault for a
 *           Codex check's names as for dsh's: while it is on, only the router holds a provider's API key.
 *      V6.  A loopback base address is refused on docker's none, bridge and default networks, by the network's name,
 *           and taken on the host's network, where the start says it is this machine.
 *
 * WHAT IS REAL AND WHAT IS NOT. runInside, aLoginForTheModel, leaveTheSandbox, maskedOfWhatTheViewIsHanded and the
 * launcher are the real ones. In A the launcher is a labelled stand-in that writes the receipt a launcher would. In B
 * docker is the stand-in of tests/check-view-stand-ins.ts, behind a wrapper that notes what docker run was handed, and
 * the ledger is that file's stand-in. No container starts and no model runs. Every key here is a made-up value this
 * test writes in its own folder.
 *
 * MUTATIONS, and the cases each turns red:
 *   tools/inspector-sandbox.mjs
 *     the key file written at 0644 with no umask: V1a.
 *     runInside's finally removes no key file: V1a, V1b.
 *     the template's secrets asked for beside a provider key: V1a.
 *     maskedOfWhatTheViewIsHanded leaves out the provider key: V3.
 *     runInside leaves the provider key out of what it masks: V3.
 *     the refusal of a provider key for another label, runtime or native provider taken out: V2.
 *     aLoginForTheModel's provider branch taken out: V2.
 *     leaveTheSandbox removes no key file: V1c.
 *     a gone check's key file is left: V1c.
 *     the start's provider words not checked: V1d.
 *   tools/sandbox.mjs
 *     remove:true not honoured: V4.
 *     the image's own lines for the provider's names kept: V4.
 *     the start carries no provider words: V4.
 *     the parent folder's link check taken out: V5, the linked folder.
 *     the router checks taken out, the check view's and the key file's together: V5, the router.
 *     the mode and owner check taken out: V5, mode 644.
 *     aLoopbackHost always false: V6.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_ROUTER_SETTING } from '../src/config/provider-router-settings.mjs'
import * as inspectorSandbox from '../tools/inspector-sandbox.mjs'
import { DSH_CHECK_ENV, aLoginForTheModel, leaveTheSandbox, maskedOfWhatTheViewIsHanded, runInside, theDshProviderVariables } from '../tools/inspector-sandbox.mjs'
import { THE_CHECKS_FOLDER, THE_KEYS_A_MODEL_NEVER_GETS, theChecksMarker, writeInstance } from '../tools/sandbox-common.mjs'
import { checkViewLedger, writeCheckViewDocker } from './check-view-stand-ins.ts'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'
import { FAKE_DF, FAKE_FREE } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

/** The one native provider a dsh check maps a key for, and the two variables it is handed under. */
const NATIVE = 'deepseek-official'
const NAMES = theDshProviderVariables(NATIVE)
const VALUE = `made-up-provider-key-${Math.random().toString(36).slice(2)}`
const TEMPLATE_VALUE = `made-up-template-key-${Math.random().toString(36).slice(2)}`
const ADDRESS = 'https://provider.example.invalid/v1'
const PROVIDER_KEY = { value: VALUE, baseAddress: ADDRESS, native: NATIVE }
const FLAG = '--provider-key-file'
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/** The array the inspector sends for a dsh check, as tools/the-inspector.mjs writes it; the client's path is not exported. */
const dshArgv = (provider = NATIVE) => ['env', ...Object.entries(DSH_CHECK_ENV).map(([name, value]) => `${name}=${value}`),
  'node', '/inputs/commands/inspector-dsh-acp.mjs', '--provider', provider, '--model', 'a-made-up-model']

/** Every file under `dir` whose bytes hold `text`, read whole. A link is not followed. */
function filesHolding(dir: string, text: string): string[] {
  const found: string[] = []
  const walk = (at: string): void => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      const kind = lstatSync(path)
      if (kind.isDirectory()) walk(path)
      else if (kind.isFile() && readFileSync(path).includes(text)) found.push(path)
    }
  }
  if (existsSync(dir)) walk(dir)
  return found
}

const within = (path: string, dir: string) => path === dir || path.startsWith(`${dir}/`)
const realOrAsIs = (path: string) => { try { return realpathSync(path) } catch { return path } }

// ============================================================================ A. what runInside hands its launcher

type View = ReturnType<typeof inspectorViewStandIn>
const views: View[] = []
afterEach(() => { for (const view of views.splice(0)) view.close() })

/**
 * What the launcher was handed, read when it was called: its words, the umask it was called under, and the key file
 * the words name, with its folder, as they then were. The file is read whole.
 */
function whatTheLauncherIsHanded(words: string[], umask: number) {
  const at = words.indexOf(FLAG)
  const file = at < 0 ? null : words[at + 1]!
  const held = file === null ? null : lstatSync(file), folder = file === null ? null : lstatSync(dirname(file))
  const lines: Record<string, string> = file === null ? {} : Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter(line => line !== '')
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
  return { words, umask, secrets: words.filter((_, i) => words[i - 1] === '--secret'), file, flags: words.filter(word => word === FLAG).length,
    isFile: held?.isFile() ?? false, mode: held === null ? null : held.mode & 0o777, uid: held?.uid ?? null,
    folderIsADirectory: folder?.isDirectory() ?? false, folderMode: folder === null ? null : folder.mode & 0o777, lines }
}

/**
 * A stand-in view whose template sets a made-up DEEPSEEK_API_KEY, with the inspector's own folder for the instance
 * and the check's marker in it, as aSandboxForThisCheck sets them. Its launcher notes what it is handed, and its start
 * says what a key file handed exactly when it was handed one. `says` is written as the command's output. The stand-in
 * is called under umask 022, because it writes its evidence under the umask it is called with and runInside refuses
 * evidence a group may write; the umask it was called under is noted first.
 */
function aView({ says = null as string | null } = {}) {
  const view = inspectorViewStandIn({ secrets: { [NAMES.key]: TEMPLATE_VALUE } })
  views.push(view)
  const sandbox: any = view.sandbox
  sandbox.hostOnly = join(view.root, THE_CHECKS_FOLDER, sandbox.instance)
  sandbox.marker = theChecksMarker(view.root, sandbox.instance, sandbox.asked.check)
  mkdirSync(dirname(sandbox.marker), { recursive: true, mode: 0o700 })
  const seen: ReturnType<typeof whatTheLauncherIsHanded>[] = []
  let handed = false
  view.changeStart((start: any) => {
    if (handed) start.provider = 'The stand-in launcher was handed a provider key file.'
    if (says !== null) writeFileSync(start.out, says)
  })
  const launcher = async (asked: any, words: string[], command: any = null) => {
    handed = words.includes(FLAG)
    seen.push(whatTheLauncherIsHanded(words, process.umask(0o022)))
    return view.launcher(asked, words, command)
  }
  return { ...view, sandbox, seen, launcher }
}

const aDshRun = (view: ReturnType<typeof aView>, more: Record<string, unknown> = {}) =>
  runInside(view.sandbox, { label: 'dsh', runtime: 'dsh', cwd: view.work, argv: dshArgv(), limitMs: 5_000, providerKey: PROVIDER_KEY,
    launcher: view.launcher, ...more })

describe('A. runInside hands a dsh model the provider key in a private file', () => {
  it('V1a. hands only the path of a new file of mode 600, in a folder of mode 700 outside every mount, and removes it when the launcher ends', async () => {
    const view = aView()
    // A UMASK THAT LETS A GROUP READ AND WRITE, so the file's mode is the inspector's own and not the test's.
    const was = process.umask(0o002)
    let ran: Awaited<ReturnType<typeof runInside>>
    try {
      ran = await aDshRun(view)
    } finally {
      process.umask(was)
    }
    expect(ran.code, ran.why).toBe(0)
    expect(view.seen).toHaveLength(1)
    const at = view.seen[0]!
    expect(at.umask, 'the umask is as it was once the file is written').toBe(0o002)
    expect(at.flags).toBe(1)
    expect(at.secrets, 'no template secret is asked for beside the provider key').toEqual([])
    expect(at.words.join('\n').includes(VALUE), 'the value is on an argument list').toBe(false)
    expect(at).toMatchObject({ isFile: true, mode: 0o600, uid: process.getuid!(), folderIsADirectory: true, folderMode: 0o700 })
    expect(Object.keys(at.lines).sort(), 'the names the key file holds').toEqual([NAMES.key, NAMES.baseAddress].sort())
    expect(at.lines[NAMES.key] === VALUE, "the key's line holds the value").toBe(true)
    expect(at.lines[NAMES.baseAddress]).toBe(ADDRESS)
    const spec = view.calls[0]!.spec
    for (const dir of [...spec.readOnly, ...spec.private].map((mount: any) => mount.host).concat(spec.outputs.dir)) {
      expect(within(at.file!, dir) || within(at.file!, realOrAsIs(dir)), `${at.file} is inside ${dir}`).toBe(false)
    }
    expect(Object.values(process.env).includes(VALUE), 'the value is in an environment of this process').toBe(false)
    expect(existsSync(at.file!), 'the file is gone once the launcher has ended').toBe(false)
  }, 30_000)

  it('V1b. removes the file when the launcher fails', async () => {
    const view = aView()
    let file: string | null = null
    const ran = await aDshRun(view, { launcher: async (_asked: unknown, words: string[]) => {
      file = whatTheLauncherIsHanded(words, process.umask(0o022)).file
      throw new Error('The stand-in launcher failed after it was handed the file.')
    } })
    expect(ran.code).toBeNull()
    expect(ran.why).toContain('The stand-in launcher failed')
    expect(file, 'the launcher was handed a file').not.toBeNull()
    expect(existsSync(file!)).toBe(false)
  }, 30_000)

  it("V1c. leaving the sandbox removes this check's key file and the key file of a check that is gone", async () => {
    const view = aView()
    // AS A CHECK THAT DIED WOULD LEAVE THEM: its own file, and a gone check's marker and file.
    const handed = join(view.sandbox.hostOnly, 'handed')
    mkdirSync(handed, { recursive: true, mode: 0o700 })
    const own = join(handed, `${view.sandbox.asked.check}.env`), gone = join(handed, 'gone-check.env')
    const goneMarker = join(dirname(view.sandbox.marker), 'gone-check.json')
    for (const file of [own, gone]) writeFileSync(file, `${NAMES.key}=${VALUE}\n${NAMES.baseAddress}=${ADDRESS}\n`, { mode: 0o600 })
    writeFileSync(goneMarker, JSON.stringify({ pid: 2147483600, started: 'a start time no process has' }))
    const left = leaveTheSandbox(view.sandbox, { delivered: false })
    expect(left.ok, left.says).toBe(true)
    expect(existsSync(own), "this check's key file").toBe(false)
    expect(existsSync(goneMarker), "the gone check's marker").toBe(false)
    expect(existsSync(gone), "the gone check's key file").toBe(false)
  }, 30_000)

  it('V1d. refuses a start that does not say what a key file handed, and one that says it when none was handed', async () => {
    const view = aView()
    expect((await aDshRun(view)).code, 'a key file, and a start that says so').toBe(0)
    expect((await aDshRun(view, { providerKey: null })).code, 'no key file, and a start that says none').toBe(0)
    view.changeStart((start: any) => { delete start.provider })
    const unsaid = await aDshRun(view)
    expect(unsaid.code).toBeNull()
    expect(unsaid.why).toMatch(/descriptor.*provider key file/)
    expect(existsSync(view.seen.at(-1)!.file!)).toBe(false)
    view.changeStart((start: any) => { start.provider = 'A start that says it was handed a key file it was not.' })
    const said = await aDshRun(view, { providerKey: null })
    expect(said.code).toBeNull()
    expect(said.why).toMatch(/descriptor.*provider key file/)
  }, 30_000)

  it.each([
    ['a label and runtime that are not dsh', { label: 'build', runtime: 'claude-code', argv: ['true'] }],
    ["a native provider that is not the route's", { providerKey: { ...PROVIDER_KEY, native: 'another-provider' } }],
  ])('V2a. refuses a provider key for %s before the launcher is called, and starts the same command without one', async (_what, change) => {
    const view = aView()
    const refused = await aDshRun(view, change)
    expect(refused.code).toBeNull()
    expect(refused.why).toMatch(/provider row's key.*dsh/)
    expect(view.calls).toHaveLength(0)
    expect(readdirSync(view.root, { recursive: true }).filter(name => String(name).endsWith('.env'))).toEqual([])
    const plain = await aDshRun(view, { ...change, providerKey: null })
    expect(plain.code, plain.why).toBe(0)
    expect(view.calls).toHaveLength(1)
  }, 30_000)

  it('V2b. signs dsh in from a provider row without reading the template, and refuses a provider row to Claude Code and OpenCode', () => {
    const view = aView()
    const home = join(view.root, 'a-home-of-its-own')
    rmSync(join(view.sandbox.templateDir, 'sandbox.json'))
    const provider = { id: 'a-made-up-provider', native: NATIVE }
    const said = aLoginForTheModel(view.sandbox, { minutes: 5, runtime: 'dsh', provider, home })
    for (const part of [provider.id, NAMES.key, NAMES.baseAddress]) expect(said).toContain(part)
    expect(view.sandbox.loginSeeds).toEqual([])
    // WITHOUT A PROVIDER ROW, dsh reads the template, which is gone, so the sign-in above did not read it.
    expect(() => aLoginForTheModel(view.sandbox, { minutes: 5, runtime: 'dsh', home })).toThrow(/template/)
    for (const runtime of ['claude-code', 'opencode']) {
      expect(() => aLoginForTheModel(view.sandbox, { minutes: 5, runtime, model: 'deepseek/a-made-up-model', provider, home }), runtime).toThrow(/provider row/)
      expect(() => aLoginForTheModel(view.sandbox, { minutes: 5, runtime, model: 'deepseek/a-made-up-model', home }), runtime).not.toThrow(/provider row/)
    }
  })

  it('V3. masks the provider key under its own name, in what the view answers and in what it leaves', async () => {
    const view = aView({ says: `The command said ${VALUE} once.` })
    const ran = await aDshRun(view)
    expect(ran.code, ran.why).toBe(0)
    expect(ran.out.includes(VALUE), 'the value is in what the view answers').toBe(false)
    expect(ran.out).toContain(NAMES.key)
    expect(ran.masked).toEqual({ [NAMES.key]: 1 })
    const text = `A transcript with ${VALUE} and ${VALUE} in it.`
    const masked = maskedOfWhatTheViewIsHanded(view.sandbox, [], text, { providerKey: PROVIDER_KEY })
    expect(masked.text.includes(VALUE), 'the value is in the masked text').toBe(false)
    expect(masked.masked).toEqual({ [NAMES.key]: 2 })
    expect(maskedOfWhatTheViewIsHanded(view.sandbox, [], text), 'without the provider key nothing is masked')
      .toEqual({ text, masked: {} })
  }, 30_000)
})

// ============================================================================ B. what the launcher does with the file

const TOOL = resolve('tools/sandbox.mjs')
let root: string, instance: string, work: string, home: string, specFile: string, spec: any
/** The two names the key file of a B case holds: dsh's or a Codex check's, set by the B block's beforeEach. */
let handedNames: { key: string, baseAddress: string } = NAMES
let office: Awaited<ReturnType<typeof checkViewLedger>>
const groups = new Set<number>()

/**
 * THE LAUNCHER'S MODULES ARE COMPILED ONCE FOR THE WHOLE FILE. Each B case starts tools/sandbox.mjs several times, and a
 * good start loads it again for its controller. Node keeps the compiled code in a folder that is made empty for each run
 * of this file and removed after it. Node compiles a changed module again, and no case reads the folder.
 */
let compileCache = ''
beforeAll(() => { compileCache = mkdtempSync(join(tmpdir(), 'mole-office-provider-key-file-compiled-')) })
afterAll(() => rmSync(compileCache, { recursive: true, force: true }))

/**
 * DOCKER, BEHIND A WRAPPER: for a `run`, bin/at-run.cjs reads <root>/at-run.json and the env file docker run is handed,
 * and notes in <root>/at-run.jsonl whether the key file at-run.json names is there, the env file's path, and how many
 * of the env file's lines set each name at-run.json lists. It notes no value. Then the stand-in runs as it would have.
 * The wrapper starts bin/at-run.cjs for a `run` alone, because it does nothing for any other docker command.
 */
const AT_RUN = String.raw`const fs = require('fs'), path = require('path')
const root = process.env.CHECK_VIEW_FAKE, argv = process.argv.slice(2)
if (argv[0] === 'run') {
  const asked = JSON.parse(fs.readFileSync(path.join(root, 'at-run.json'), 'utf8'))
  const envFile = argv[argv.indexOf('--env-file') + 1]
  const lines = fs.readFileSync(envFile, 'utf8').split('\n')
  const counts = Object.fromEntries(asked.names.map(name => [name, lines.filter(line => line.startsWith(name + '=')).length]))
  fs.appendFileSync(path.join(root, 'at-run.jsonl'), JSON.stringify({ keyFileThere: asked.keyFile !== null && fs.existsSync(asked.keyFile), envFile, counts }) + '\n')
}
`

/** What bin/at-run.cjs noted, one entry per docker run, read from <root>/at-run.jsonl. */
function atRuns(): { keyFileThere: boolean; envFile: string; counts: Record<string, number> }[] {
  const file = join(root, 'at-run.jsonl')
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
}
/** The docker runs the stand-in logged in <root>/calls.jsonl. */
function runs(): any[] {
  const file = join(root, 'calls.jsonl')
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(call => call.argv[0] === 'run') : []
}

/** The command the view runs: what it was handed, by a hash of the key, the base address and its key-like names. */
const whatItWasHanded = () => ['node', '-e', `const key = process.env[${JSON.stringify(handedNames.key)}]
console.log(JSON.stringify({ keySha256: key === undefined ? null : require('crypto').createHash('sha256').update(key).digest('hex'),
  baseAddress: process.env[${JSON.stringify(handedNames.baseAddress)}] ?? null,
  keyLikeNames: Object.keys(process.env).filter(name => /KEY|TOKEN|SECRET|PASSWORD/i.test(name)).sort() }))`]

/**
 * A key file of the inspector's shape: a folder of `folderMode` and a file of `mode`, holding `text`. The wrapper is
 * told its path. Answers the path.
 */
function aKeyFile({ folder = join(root, 'handed'), name = 'a-check.env', mode = 0o600, folderMode = 0o700, address = ADDRESS,
  text = `${handedNames.key}=${VALUE}\n${handedNames.baseAddress}=${address}\n` }:
  { folder?: string, name?: string, mode?: number, folderMode?: number, address?: string, text?: string } = {}): string {
  mkdirSync(folder, { recursive: true })
  chmodSync(folder, folderMode)
  const file = join(folder, name)
  rmSync(file, { force: true })
  writeFileSync(file, text, { mode })
  chmodSync(file, mode)
  writeFileSync(join(root, 'at-run.json'), JSON.stringify({ keyFile: file, names: [handedNames.key, handedNames.baseAddress] }))
  return file
}

async function launch({ command = ['node', '-e', 'console.log("own work")'], flags = [] as string[], more = {} as NodeJS.ProcessEnv, view = true } = {}) {
  writeFileSync(specFile, JSON.stringify(spec))
  const env = { ...withoutInheritedEffort(), PATH: `${root}/bin:${process.env.PATH}`, CHECK_VIEW_FAKE: root, NODE_COMPILE_CACHE: compileCache,
    MOLE_OFFICE_API: office.api, MOLE_OFFICE_AGENT: 'synthetic-controller', MOLE_OFFICE_SESSION: 'synthetic-run',
    MOLE_AGENT_KEY: 'synthetic-controller-key', MOLE_OFFICE_WORKSPACE: 'default', [THE_ROUTER_SETTING]: 'off', ...more }
  const child = spawn(process.execPath, [TOOL, 'exec', 'inspector', '--sandboxes', join(root, 'sandboxes'), '--api', office.api,
    '--as', 'synthetic-controller', '--session', 'synthetic-run', ...(view ? ['--check-view', specFile] : []), '--cwd', work,
    '--json', '--no-office-variables', ...flags, '--', ...command], { env })
  let out = '', err = ''
  child.stdout.on('data', chunk => out += chunk); child.stderr.on('data', chunk => err += chunk)
  const code = await new Promise<number>(done => child.on('close', exit => done(exit ?? 1)))
  const descriptor = out.trim().startsWith('{') ? JSON.parse(out.trim()) : null
  if (descriptor?.hostPgid) groups.add(descriptor.hostPgid)
  return { code, out, err, descriptor }
}
/** The instance's network as docker answers it, written in <root>/docker.json. */
function onTheNetwork(mode: string) {
  const config = JSON.parse(readFileSync(join(root, 'docker.json'), 'utf8'))
  config.instance.HostConfig.NetworkMode = mode
  writeFileSync(join(root, 'docker.json'), JSON.stringify(config))
}
/** The receipt of a started command, read from the path its start names once the controller has written it. */
async function completed(started: Awaited<ReturnType<typeof launch>>) {
  expect(started.code, started.err).toBe(0)
  const end = Date.now() + 15_000
  while (!existsSync(started.descriptor.receipt)) {
    if (Date.now() > end) throw new Error('No receipt was written within 15 seconds.')
    await new Promise(done => setTimeout(done, 5))
  }
  return JSON.parse(readFileSync(started.descriptor.receipt, 'utf8'))
}

// A CODEX CHECK'S NAMES are read from the module's namespace and not by name, so that where they are not there only the
// cases with them fail.
describe.each([['dsh', NAMES], ['a Codex check', inspectorSandbox.THE_CODEX_PROVIDER_VARIABLES]] as const)('B. with the two names of %s, the launcher reads the provider key file once, refuses a wrong one, and leaves the value nowhere', (who, NAMES) => {
  beforeEach(async () => {
    handedNames = NAMES
    root = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-provider-key-file-')))
    instance = join(root, 'sandboxes/inspector')
    work = join(instance, 'check-views/check-a/work')
    home = join(instance, 'check-views/check-a/home')
    for (const folder of [work, home, join(instance, 'check-views/check-a/tmp'), join(root, 'records'), join(root, 'bin')]) mkdirSync(folder, { recursive: true, mode: 0o700 })
    execFileSync('git', ['init', '-q', work])
    // Both copies of the facts, as up writes them: the launcher reads the host's, the helper the folder's.
    writeInstance(instance, { instance: 'inspector', workspace: 'default', container: { name: 'mole-office-sandbox-inspector' }, office: { secrets: { names: [] } } })
    writeCheckViewDocker(root, instance)
    renameSync(join(root, 'bin/docker'), join(root, 'bin/docker-stand-in'))
    writeFileSync(join(root, 'bin/at-run.cjs'), AT_RUN)
    writeFileSync(join(root, 'bin/docker'), `#!/bin/sh\ncase "$1" in run) '${process.execPath}' "$CHECK_VIEW_FAKE/bin/at-run.cjs" "$@" || exit 97;; esac\nexec "$CHECK_VIEW_FAKE/bin/docker-stand-in" "$@"\n`, { mode: 0o755 })
    writeFileSync(join(root, 'at-run.json'), JSON.stringify({ keyFile: null, names: [NAMES.key, NAMES.baseAddress] }))
    // THE IMAGE SETS BOTH NAMES ITSELF, as an image could; the launcher must hand the file's lines alone.
    const config = JSON.parse(readFileSync(join(root, 'docker.json'), 'utf8'))
    config.instance.Config.Env.push(`${NAMES.key}=${TEMPLATE_VALUE}`, `${NAMES.baseAddress}=https://image.example.invalid/v1`)
    writeFileSync(join(root, 'docker.json'), JSON.stringify(config))
    writeFileSync(join(root, 'bin/df'), FAKE_DF, { mode: 0o755 })
    writeFileSync(join(root, 'bin/free'), FAKE_FREE, { mode: 0o755 })
    writeFileSync(join(root, 'state.json'), JSON.stringify({ freeBytes: 200_000_000_000, memoryAvailable: 200_000_000_000, calls: [], bugs: {} }))
    // FAKE_DF/FREE share the stand-ins' state; this is a synthetic measurement.
    process.env['FAKE_DOCKER_DIR'] = root
    office = await checkViewLedger(root)
    specFile = join(root, 'spec.json')
    spec = { check: 'check-a', instance: 'inspector', readOnly: [{ host: join(root, 'records'), container: '/inputs/records' }],
      private: [{ host: work, container: '/work' }, { host: home, container: '/check/home' },
        { host: join(instance, 'check-views/check-a/tmp'), container: '/check/tmp' }], outputs: { dir: join(root, 'outputs') } }
  })
  afterEach(async () => {
    for (const group of groups) { try { process.kill(-group, 'SIGTERM') } catch {} }
    groups.clear()
    await office.close()
    delete process.env['FAKE_DOCKER_DIR']
    rmSync(root, { recursive: true, force: true })
  })

  it('V4. hands the command the key and the address alone, removes the file before docker runs, and leaves the value nowhere', async () => {
    const file = aKeyFile()
    const started = await launch({ command: whatItWasHanded(), flags: [FLAG, file] })
    const receipt = await completed(started)
    expect(receipt.code, receipt.why).toBe(0)
    expect(JSON.parse(readFileSync(started.descriptor.out, 'utf8'))).toEqual({ keySha256: sha256(VALUE), baseAddress: ADDRESS, keyLikeNames: [NAMES.key] })
    const noted = atRuns()
    expect(noted).toHaveLength(1)
    expect(noted[0]!.keyFileThere, 'the key file when docker ran').toBe(false)
    expect(noted[0]!.counts, "the env file sets each name once, the image's lines left out").toEqual({ [NAMES.key]: 1, [NAMES.baseAddress]: 1 })
    expect(existsSync(noted[0]!.envFile), 'the env file after the command').toBe(false)
    expect(existsSync(file)).toBe(false)
    expect(started.descriptor.provider).toContain(`${NAMES.baseAddress}=${ADDRESS}`)
    expect(started.descriptor.provider).toContain(NAMES.key)
    expect(started.descriptor.provider).toContain('none')
    expect((started.out + started.err).includes(VALUE), 'the value is in what the launcher printed').toBe(false)
    expect(filesHolding(root, VALUE), 'files that hold the value').toEqual([])
    expect(JSON.stringify(office.requests).includes(VALUE), 'the value is in a request to the office').toBe(false)
  }, 60_000)

  const FAULTS: [string, () => { file: string; more?: NodeJS.ProcessEnv }, RegExp][] = [
    ['a link to a good file', () => {
      const good = aKeyFile({ name: 'good.env' }), link = join(dirname(good), 'a-link.env')
      symlinkSync(good, link)
      return { file: link }
    }, /opened.*link/],
    ['a file of mode 644', () => ({ file: aKeyFile({ mode: 0o644 }) }), /600/],
    ['a folder of mode 755', () => ({ file: aKeyFile({ folderMode: 0o755 }) }), /700/],
    ['a file in a folder the view mounts', () => ({ file: aKeyFile({ folder: join(work, 'handed') }) }), /mounts or writes/],
    ['a file in the outputs folder', () => ({ file: aKeyFile({ folder: join(spec.outputs.dir, 'handed') }) }), /mounts or writes/],
    ['three lines', () => ({ file: aKeyFile({ text: `${NAMES.key}=${VALUE}\n${NAMES.baseAddress}=${ADDRESS}\nA_THIRD=line\n` }) }), /two lines/],
    ['a value with a space', () => ({ file: aKeyFile({ text: `${NAMES.key}=${VALUE} more\n${NAMES.baseAddress}=${ADDRESS}\n` }) }), /space/],
    ['two keys', () => ({ file: aKeyFile({ text: `${NAMES.key}=${VALUE}\nANOTHER_API_KEY=${VALUE}\n` }) }), /one key/],
    ['an office key', () => ({ file: aKeyFile({ text: `${THE_KEYS_A_MODEL_NEVER_GETS[0]}=${VALUE}\n${NAMES.baseAddress}=${ADDRESS}\n` }) }), /office/],
    ['a base address that is not one', () => ({ file: aKeyFile({ address: 'not-an-address' }) }), /not an address/],
  ]
  // WHILE THE PROVIDER ROUTER IS ON, EVERY KEY FILE IS REFUSED, whatever its key's name: only the router holds a key then.
  FAULTS.push(['the provider router on', () => ({ file: aKeyFile(), more: { [THE_ROUTER_SETTING]: 'on' } }), /router/])

  it('V5a. refuses each fault in the file before docker runs, leaves the file, and names no value; the same file with no fault starts', async () => {
    for (const [what, make, words] of FAULTS) {
      const { file, more = {} } = make()
      const before = readFileSync(file)
      const ran = await launch({ flags: [FLAG, file], more })
      expect(ran.code, what).not.toBe(0)
      expect(ran.err, what).toMatch(words)
      expect(ran.err.includes(VALUE), what).toBe(false)
      expect(runs(), what).toEqual([])
      expect(readFileSync(file), `${what}: the file is left as it was`).toEqual(before)
    }
    const good = await launch({ flags: [FLAG, aKeyFile()] })
    await completed(good)
    expect(runs()).toHaveLength(1)
  }, 120_000)

  it('V5b. refuses a key file reached through a linked folder before reading it, and the same file by its own path for its mount', async () => {
    // THE FILE WOULD BE REFUSED FOR ITS MODE AND ITS LINES if it were opened, so a refusal for the link says it was not.
    const kept = join(work, 'kept-keys')
    const file = aKeyFile({ folder: kept, mode: 0o644, text: `${NAMES.key}=${VALUE}\n${NAMES.baseAddress}=${ADDRESS}\nA_THIRD=line\n` })
    const link = join(root, 'a-link-to-kept-keys')
    symlinkSync(kept, link)
    const before = readFileSync(file)
    const through = await launch({ flags: [FLAG, join(link, 'a-check.env')] })
    expect(through.code).not.toBe(0)
    // A REFUSAL ENDS WITH THE PATH OF ITS DETAILS, which holds a millisecond stamp and a process id, so "600" or "link"
    // can stand in it by chance. Every word is looked for with that path taken out, so the path can neither fail the
    // case nor pass it.
    const words = (err: string): string => err.replace(/Details: \S+/g, 'Details: <path>')
    expect(words(through.err)).toMatch(/folder.*link/)
    expect(words(through.err)).not.toMatch(/600|two lines|mounts or writes/)
    const direct = await launch({ flags: [FLAG, file] })
    expect(direct.code).not.toBe(0)
    expect(words(direct.err)).toMatch(/mounts or writes/)
    expect(words(direct.err)).not.toMatch(/link/)
    expect(readFileSync(file)).toEqual(before)
    expect(runs()).toEqual([])
  }, 60_000)

  it('V5c. takes the key file only for a check view, and never beside --secret', async () => {
    const file = aKeyFile()
    const alone = await launch({ view: false, flags: [FLAG, file] })
    expect(alone.code).not.toBe(0)
    expect(alone.err).toMatch(/only for exec --check-view/)
    const both = await launch({ flags: [FLAG, file, '--secret', NAMES.key] })
    expect(both.code).not.toBe(0)
    expect(both.err).toMatch(/--secret or --provider-key-file/)
    expect(existsSync(file)).toBe(true)
    expect(runs()).toEqual([])
  }, 60_000)

  const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]']

  // UNDER A CODEX CHECK'S NAMES V6a RUNS ON THE NONE NETWORK ALONE. The launcher finds the base address by its _BASE_URL
  // ending and refuses a loopback host by the network alone, so bridge and default would repeat dsh's runs. The none run
  // stays, so a run with these names still shows that its base address is found and refused at all.
  const NETWORKS: [string, RegExp][] = [['none', /none/], ['bridge', /bridge/], ['default', /bridge/]]
  it.each(who === 'dsh' ? NETWORKS : NETWORKS.slice(0, 1))("V6a. refuses a loopback base address on docker's %s network, naming the network, and takes another", async (mode, network) => {
    onTheNetwork(mode)
    for (const host of LOOPBACK) {
      const file = aKeyFile({ address: `http://${host}:8080/v1` })
      const ran = await launch({ flags: [FLAG, file] })
      expect(ran.code, host).not.toBe(0)
      expect(ran.err, host).toMatch(/loopback/)
      expect(ran.err, host).toMatch(network)
      expect(ran.err, host).toContain(host)
      expect(existsSync(file), host).toBe(true)
    }
    expect(runs()).toEqual([])
    const elsewhere = await launch({ flags: [FLAG, aKeyFile()] })
    await completed(elsewhere)
    expect(elsewhere.descriptor.provider).toMatch(network)
    expect(elsewhere.descriptor.provider).not.toMatch(/this machine/)
  }, 60_000)

  it("V6b. takes a loopback base address on the host's network, and the start says the address is this machine", async () => {
    onTheNetwork('host')
    for (const host of LOOPBACK) {
      const address = `http://${host}:8080/v1`
      const started = await launch({ flags: [FLAG, aKeyFile({ address })] })
      await completed(started)
      expect(started.descriptor.provider, host).toContain(`${NAMES.baseAddress}=${address}`)
      expect(started.descriptor.provider, host).toMatch(/this machine/)
      expect(started.descriptor.provider.includes(VALUE), host).toBe(false)
    }
    const elsewhere = await launch({ flags: [FLAG, aKeyFile()] })
    await completed(elsewhere)
    expect(elsewhere.descriptor.provider).not.toMatch(/this machine/)
    expect(runs()).toHaveLength(LOOPBACK.length + 1)
  }, 60_000)
})
