// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY OFFICE TOOL READS THE PAIRED OFFICE'S SETTINGS, OR IT REFUSES TO START (wave 13q, the main round).
 *
 * The stable office serves from a stable checkout and reads the development checkout's settings, because its
 * processes carry MOLE_OFFICE_DEVELOPMENT_CHECKOUT. A tool of the office that starts without that variable reads the
 * stable checkout's own defaults: another database, another key file and another port. One helper,
 * theOfficeToolEnvironment (src/config/the-office-tool-environment.mjs), now gives every starter the checkout and the
 * environment. Every tool on the first list refuses to start unpaired at a dated stable tag.
 *
 * THE FIXTURE is made under the temporary directory, and it has three checkouts:
 *   - a stable-like checkout, on branch stable at a dated stable tag, with no .env;
 *   - a development-like checkout, whose .env names a free port, an absolute database under its data folder, the
 *     stable-like checkout, and a commit address that only this file gives;
 *   - a clone of the stable-like checkout, on main at the tag's commit, with a .env of its own.
 * The database holds one runtime choice that only it gives (73 seconds) and turns the terminal holder off. A key file
 * is beside it.
 *
 * THE READINGS. Each tool's real entry file runs under `--import` of a reporter. The reporter imports the same
 * settings.mjs, and at exit it writes what the process reads: its code, its .env, its data folder, its database, its
 * key file, its backups folder, its port, the database's choice and the file's commit address. It records and refuses
 * every process the tool starts, except node_modules programs and the stable tool a relay names. It does the same for
 * every fetch and every connection, except to the fixture's own port, and for every listen. Each tool's own command
 * line ends early. The office's own reading is taken in the stable-like checkout with the pairing, the production
 * setting and the absolute database, as the service command starts it. Each tool started through the helper must
 * read exactly that.
 *
 * WHAT IS PROVED, by case:
 *   - the helper: from the stable office and from the development checkout, the serving checkout gets the pairing,
 *     the development checkout gets none, and a third checkout is refused with the three folders named; unpaired,
 *     it changes nothing;
 *   - the worker's starts (A): the merge tool, the check tool and the sandbox launcher run in the stable checkout
 *     with the office's readings. The merge tool gets past its start check. That is the case that keeps the merge
 *     queue running after an upgrade;
 *   - the late guards (A, at an entry's turn): the owner-content gate and the address gate, which the merge tool
 *     loads only when it integrates an entry, run in the stable checkout with the test files they read from it;
 *   - MOLE_OFFICE_WORKER_CHECKOUT (B): the development checkout gives no pairing; a third checkout refuses the
 *     office's own tools, and the worker's start line says so; an agent's run is unchanged;
 *   - the service command (D, rows 14 and 15): from the development checkout, and as a restart inside the paired
 *     office, it starts serve-dev in the stable checkout, paired with the development checkout;
 *   - the start-at-login unit (E, row 16), proved in this fixture only;
 *   - the copy wrapper and the command form (F and item 5), and the command form's refusal of a tool not on its list;
 *   - the run-output folder (H), from the worker and from tools/queue-history.mjs;
 *   - the start check (item 2): each of the eleven tools of the first list, started unpaired in the stable-like
 *     checkout, exits 2 with the sentence and starts, fetches and listens to nothing; the merge tool reads no entry;
 *   - what is not refused: the clone on main, the development checkout, and the stable code that the upgrade and
 *     the bootstrap start without the pairing;
 *   - the database jobs (d): db:backup and db:prune-backups run through the stable checkout, and a backup says which
 *     checkout and commit made it; db:migrate, db:seed and db:rewrite-a-backup refuse with the way for each, and
 *     change nothing; the server starts refuse, naming `npm run mole-office start`. db:reset is never run here: only
 *     its way is read.
 *
 * The hook guard's row is proved by tests/the-guard-is-told-the-offices-paths.test.ts.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run, each restored after
 * ---------------------------------------------------------------------------------------
 *
 *   envFor gives the merge tool its environment without the helper → the worker's starts case is red.
 *   withThePairing is dropped from the launcher calls                 → the merge tool's own starts case is red.
 *   the start check is removed from one tool                          → the start check case is red.
 *   the merge tool's start check reads process.env after its imports  → the worker's starts case is red.
 *   the paired start names this checkout as the development one again → the service command case is red.
 *   the run-output folder is under DATA_ROOT again                    → the run-output case is red.
 *   a test file the late guards read is left out of COPIED            → the late guards case is red.
 *   the cleanup watcher is handed process.env, not withThePairing(process.env) → the cleanup watcher case is red.
 */
import Database from 'better-sqlite3'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb } from './helpers.ts'
import { THE_TEST_MARK, THE_TEST_RUN_FLAG } from '../src/config/the-test-mark.mjs'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))
/**
 * What each checkout holds: the code, each test file that a tool this file starts imports, LICENSE, from which
 * tests/the-copyright-line.ts reads the copyright line's holder, and the clean version's mark, which tells that reader
 * which form of the line this tree carries.
 */
const COPIED = [
  'src', 'scripts', 'tools', 'for-agents', 'held-migrations', 'drizzle', 'package.json', 'tsconfig.json', 'LICENSE',
  '.mole-office/clean-version.json',
  'tests/applied-mutations.ts', 'tests/the-copyright-line.ts', 'tests/the-names-the-gates-refuse.ts', 'tests/the-owners-content-list.ts',
  'tests/the-owners-copyright-line.ts', 'tests/the-pieces-of-a-source.ts',
  'tests/the-timing-tests.ts', 'tests/the-whole-suite-is-asked-for-by-name.ts', 'tests/the-window-display.ts',
]
const TAG = 'stable-2026-10-21-every-office-tool'
const THE_OFFICE_KEY = 'feedface'.repeat(8)
const A_RUNS_KEY = 'c0ffee00'.repeat(8)
const THE_FILES_ADDRESS = 'from-the-env-file@example.invalid'
const THE_START_CHECK_SAYS = 'and it was started without MOLE_OFFICE_DEVELOPMENT_CHECKOUT'
const THE_PAIRING = 'MOLE_OFFICE_DEVELOPMENT_CHECKOUT'
const THE_REFUSAL_CODE = 'OFFICE_TOOL_CHECKOUT_INVALID'
const THE_HELPER = 'src/config/the-office-tool-environment.mjs'
const THE_SERVICE_COMMAND = 'src/config/the-service-command.mjs'

/** The first list: each tool with a command line that ends early, and whether it runs through tsx. */
function theFirstList(workdir: string): Array<{ tool: string, words: string[], tsx?: boolean }> {
  return [
    { tool: 'tools/the-merger.mjs', words: theMergersWords(workdir) },
    { tool: 'tools/the-inspector.mjs', words: ['--help'] },
    { tool: 'tools/modal-tests.mjs', words: [] },
    { tool: 'tools/run-named-tests.mjs', words: ['--no-such-option'] },
    { tool: 'tools/checks/git-changeset.mjs', words: [] },
    { tool: 'tools/office-copy.mjs', words: ['--help'] },
    { tool: 'scripts/backup.ts', words: ['--help'], tsx: true },
    { tool: 'scripts/prune-backups.ts', words: ['--help'], tsx: true },
    { tool: 'tools/run-the-timing-job.mjs', words: [] },
    { tool: 'tools/run-the-login-reading.mjs', words: [] },
    { tool: 'tools/run-the-test-catches-job.mjs', words: [] },
    { tool: 'tools/periodic-main-suite.mjs', words: [] },
  ]
}

/** The command form's list, each with a command line that ends early. */
const THE_COMMAND_FORMS_LIST: Array<{ tool: string, words: string[] }> = [
  { tool: 'tools/office-copy.mjs', words: ['--help'] },
  { tool: 'scripts/backup.ts', words: ['--help'] },
  { tool: 'tools/sandbox.mjs', words: ['--help'] },
  { tool: 'tools/the-inspector.mjs', words: ['--help'] },
  { tool: 'tools/run-the-timing-job.mjs', words: [] },
  { tool: 'tools/run-the-login-reading.mjs', words: [] },
  { tool: 'tools/run-the-test-catches-job.mjs', words: [] },
  { tool: 'tools/periodic-main-suite.mjs', words: [] },
]

function theMergersWords(workdir: string) {
  return ['--entry', 'fixture-entry', '--session', 'fixture-session', '--workdir', workdir]
}

let root: string, home: string, dev: string, stable: string, clone: string, database: string
let port: number, clonePort: number, reporter: string, probeFile: string, stableCommit: string, runs = 0
let files: string[]
let office: Record<string, unknown>
let officeEnv: NodeJS.ProcessEnv

type Spawned = { how: string, command: string, args: string[], cwd: string, env: Record<string, string> | null }
type Line = {
  entry: string, checkout: string, spawned: Spawned[], fetched: string[], connected: string[], listened: string[]
  readings: Record<string, string | null> | null, settingsError: { code: string | null, message: string } | null
}
type Ran = { status: number | null, signal: string | null, stdout: string, stderr: string, said: string, lines: Line[] }

/** An environment with nothing of this session's office, sandbox or tools in it. */
function base(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(env)) {
    const dropped = ['MOLE_', 'VITEST', 'SANDBOX_', 'XDG_', 'GIT_'].some((prefix) => key.startsWith(prefix))
    if (dropped || key === 'NODE_OPTIONS' || key === 'NODE_ENV') delete env[key]
  }
  return { ...env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
}

function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', ['-c', 'user.name=Synthetic office fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, env: base(), encoding: 'utf8', timeout: 60_000 })
  expect(result.status, result.stderr).toBe(0)
  return result.stdout.trim()
}

async function aFreePort(): Promise<number> {
  const listener = createServer()
  await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done))
  const chosen = (listener.address() as { port: number }).port
  await new Promise<void>((done) => listener.close(() => done()))
  return chosen
}

function hashOf(file: string) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

/** What every process the reporter watches reads, and what it tried to start. */
const THE_REPORTER = `
import childProcess from 'node:child_process'
import { appendFileSync, realpathSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import { join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isMainThread } from 'node:worker_threads'

export function theReadingsOf(s) {
  const merged = s.mergedEnvironment()
  return {
    code: realpathSync(s.REPO_ROOT),
    envFile: s.ENV_FILE ?? null,
    dataRoot: s.DATA_ROOT,
    database: s.databasePathFrom(merged),
    keys: s.keysPathFrom(merged),
    backups: s.backupsDirectoryFrom(merged),
    port: s.readSetting('MOLE_OFFICE_PORT', merged).value,
    registerTimeout: s.readSettingHere('MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS').value,
    commitEmail: s.readSettingHere('MOLE_OFFICE_COMMIT_EMAIL').value,
  }
}

const checkouts = JSON.parse(process.env.EVERY_TOOL_CHECKOUTS ?? '[]')
const first = process.argv[1] === undefined ? null : resolve(process.argv[1])
const inside = first === null || first.includes(sep + 'node_modules' + sep) ? undefined : checkouts.find((one) => first.startsWith(one + sep))
if (isMainThread && inside !== undefined && process.env.EVERY_TOOL_READINGS !== undefined) {
  const file = process.env.EVERY_TOOL_READINGS
  const exiting = process.env.EVERY_TOOL_AT_A_START === 'exit'
  const passes = JSON.parse(process.env.EVERY_TOOL_PASSES ?? '[]')
  const port = String(process.env.EVERY_TOOL_PORT)
  const line = { entry: relative(inside, first), checkout: inside, spawned: [], fetched: [], connected: [], listened: [], readings: null, settingsError: null }
  process.on('exit', () => appendFileSync(file, JSON.stringify(line) + '\\n'))
  const refuse = (what) => {
    if (exiting) process.exit(97)
    throw Object.assign(new Error('The criterion refuses to ' + what + '.'), { code: 'EVERY_TOOL_REFUSED' })
  }
  const passing = (command, args) => command.includes(sep + 'node_modules' + sep) || [command, ...args].some((word) => passes.includes(word))
  const shapes = { spawn: 'args', spawnSync: 'args', execFile: 'args', execFileSync: 'args', exec: 'line', execSync: 'line', fork: 'module' }
  for (const [name, shape] of Object.entries(shapes)) {
    const original = childProcess[name]
    childProcess[name] = function (...words) {
      const listed = shape !== 'line' && Array.isArray(words[1])
      const given = listed ? words[1].map(String) : []
      const options = (shape === 'line' ? words[1] : listed ? words[2] : words[1]) ?? {}
      const command = shape === 'module' ? process.execPath : String(words[0])
      const args = shape === 'module' ? [String(words[0]), ...given] : given
      if (passing(command, args)) return original.apply(this, words)
      const env = typeof options === 'object' && options.env !== undefined ? { ...options.env } : null
      const cwd = typeof options === 'object' && options.cwd !== undefined ? String(options.cwd) : process.cwd()
      line.spawned.push({ how: name, command, args, cwd, env })
      return refuse('start ' + command)
    }
  }
  syncBuiltinESMExports()
  const realFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    line.fetched.push(url)
    if (!exiting && new URL(url).host === '127.0.0.1:' + port) return realFetch(input, init)
    return refuse('fetch ' + url)
  }
  const realConnect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function (...words) {
    const given = Array.isArray(words[0]) ? words[0][0] : words[0]
    const options = typeof given === 'object' && given !== null ? given : { port: given, host: typeof words[1] === 'string' ? words[1] : undefined }
    if (options.path === undefined && options.port !== undefined && String(options.port) !== port) {
      line.connected.push(String(options.host ?? 'localhost') + ':' + String(options.port))
      return refuse('connect to port ' + String(options.port))
    }
    return realConnect.apply(this, words)
  }
  net.Server.prototype.listen = function (...words) {
    line.listened.push(JSON.stringify(words[0] ?? null))
    return refuse('listen')
  }
  if (process.env.EVERY_TOOL_READ !== '0') {
    try {
      line.readings = theReadingsOf(await import(pathToFileURL(join(inside, 'src', 'config', 'settings.mjs')).href))
    } catch (error) {
      line.settingsError = { code: error?.code ?? null, message: String(error?.message ?? error) }
    }
  }
}
`

/** What one side reads and gives: the office in the stable checkout, the merge tool in it, or another checkout. */
const THE_PROBE = `
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const places = JSON.parse(process.env.EVERY_TOOL_PLACES)
const side = process.env.EVERY_TOOL_SIDE
const officeEnv = { ...process.env }
const here = side === 'development' ? places.dev : side === 'clone' ? places.clone : places.stable
const at = (file) => pathToFileURL(join(here, file)).href
const out = {}
const attempt = async (name, work) => {
  try {
    const value = await work()
    out[name] = value === undefined ? null : value
  } catch (error) {
    out[name] = { failed: { code: error?.code ?? null, message: String(error?.message ?? error) } }
  }
}
const { theReadingsOf } = await import('./reporter.mjs')
const s = await import(at('src/config/settings.mjs'))
await attempt('readings', () => theReadingsOf(s))
const helper = () => import(at('${THE_HELPER}'))
await attempt('helper, serving', async () => (await helper()).theOfficeToolEnvironment({ PATH: 'kept', NODE_ENV: 'kept' }, places.stable))
await attempt('helper, development', async () => (await helper()).theOfficeToolEnvironment({ PATH: 'kept', ${THE_PAIRING}: places.dev }, places.dev))
await attempt('helper, third', async () => (await helper()).theOfficeToolEnvironment({ PATH: 'kept' }, side === 'clone' ? places.stable : places.clone))
await attempt('helper, by default', async () => (await helper()).theOfficeToolEnvironment({ PATH: 'kept' }))

if (side === 'office') {
  const api = 'http://127.0.0.1:' + places.port
  const run = (cwd) => ({ cwd, api, workspace: 'panelx', key: '${A_RUNS_KEY}' })
  const adapter = await import(at('src/worker/runtimes/adapter.ts'))
  for (const runtime of ['merge-tool', 'inspection-tool', 'round-launcher', 'claude-code']) {
    for (const [where, cwd] of [['stable', places.stable], ['development', places.dev], ['clone', places.clone]]) {
      await attempt('envFor ' + runtime + ' ' + where, () => adapter.envFor(run(cwd), officeEnv, {}, runtime))
    }
  }
  const worker = await import(at('src/worker/index.ts'))
  await attempt('worker line, clone', () => worker.whatItWillDo(worker.workerSettingsFrom(['--api', api], { ...officeEnv, MOLE_OFFICE_WORKER_CHECKOUT: places.clone })))
  await attempt('worker line, development', () => worker.whatItWillDo(worker.workerSettingsFrom(['--api', api], { ...officeEnv, MOLE_OFFICE_WORKER_CHECKOUT: places.dev })))
  await attempt('worker line, stable', () => worker.whatItWillDo(worker.workerSettingsFrom(['--api', api], officeEnv)))
  await attempt('worker output', () => worker.workerSettingsFrom(['--api', api], officeEnv).outputRoot)
  await attempt('run output folder', () => s.THE_RUN_OUTPUT_FOLDER ?? null)
  await attempt('queue history', async () => (await import(at('tools/queue-history.mjs'))).logRoots({}).runsRoot)
  const login = await import(at('src/config/start-at-login.mjs'))
  await attempt('unit', () => login.theStartAtLoginUnit(login.theOfficeThisServerIs(officeEnv)))
}

if (side === 'merge-tool') {
  process.argv = [process.argv[0], join(places.stable, 'tools', 'the-merger.mjs'), '--entry', 'probe-entry', '--session', 'probe-session', '--workdir', join(places.root, 'probe-merge-work')]
  const pairing = await import(at('tools/merge-tool/arguments.mjs'))
  const gitTools = await import(at('tools/merge-tool/git.mjs'))
  await attempt('the checks', () => pairing.withThePairing(gitTools.cleanEnvironment({})))
  await attempt('the launcher calls', async () => (await import(at('tools/merge-tool/office-keeper.mjs'))).theLaunchersEnvironment())
  await attempt('the stable tools', async () => (await import(at('tools/merge-tool/testing.mjs'))).theStableToolsEnvironment())
  await attempt('the cleanup watcher', async () => {
    const realSpawn = childProcess.spawn
    let recorded = null
    childProcess.spawn = function (command, args, options) {
      const words = Array.isArray(args) ? args.map(String) : []
      if (words.length < 2 || !words[words.length - 2].endsWith('cleanup.mjs') || words[words.length - 1] !== '--watch') {
        throw new Error('The probe starts no process: ' + String(command))
      }
      const settings = options !== null && typeof options === 'object' ? options : {}
      const environment = settings.env !== null && typeof settings.env === 'object' ? settings.env : {}
      recorded = {
        command: String(command),
        args: words,
        detached: settings.detached === true,
        pairing: environment['${THE_PAIRING}'] === undefined ? null : environment['${THE_PAIRING}'],
      }
      return { pid: 0, once() {}, send() {} }
    }
    try {
      syncBuiltinESMExports()
      await (await import(at('tools/merge-tool/office-keeper.mjs'))).watchMergeCleanup()
      return recorded
    } finally {
      childProcess.spawn = realSpawn
      syncBuiltinESMExports()
    }
  })
}

process.stdout.write(JSON.stringify(out))
`

/** Run one tool's real entry file under the reporter, in its own process group, and read what it wrote. */
function aTool(
  cwd: string,
  tool: string,
  words: string[],
  env: NodeJS.ProcessEnv,
  options: { mode?: 'throw' | 'exit', read?: boolean, passes?: string[], tsx?: boolean, port?: number } = {},
): Promise<Ran> {
  runs += 1
  const readings = join(root, 'readings', `${String(runs)}.jsonl`)
  writeFileSync(readings, '')
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, [...(options.tsx === true ? ['--import', 'tsx'] : []), tool, ...words], {
      cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...env,
        NODE_OPTIONS: `--import=${pathToFileURL(reporter).href}`,
        EVERY_TOOL_READINGS: readings,
        EVERY_TOOL_CHECKOUTS: JSON.stringify([dev, stable, clone]),
        EVERY_TOOL_AT_A_START: options.mode ?? 'throw',
        EVERY_TOOL_PASSES: JSON.stringify(options.passes ?? []),
        EVERY_TOOL_READ: options.read === false ? '0' : '1',
        EVERY_TOOL_PORT: String(options.port ?? port),
      },
    })
    let stdout = '', stderr = ''
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    const group = child.pid
    // The group is this child's own, so a tool that hangs is stopped with everything it started.
    const timer = setTimeout(() => { if (group !== undefined) process.kill(-group, 'SIGKILL') }, 90_000)
    child.on('error', (error) => { clearTimeout(timer); failed(error) })
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      const lines = readFileSync(readings, 'utf8').split('\n').filter((one) => one !== '').map((one) => JSON.parse(one) as Line)
      done({ status, signal, stdout, stderr, said: `${stdout}${stderr}`, lines })
    })
  })
}

/** One side's probe: what it reads, and what the helper and its callers give it. */
async function theProbe(side: 'office' | 'merge-tool' | 'development' | 'clone', env: NodeJS.ProcessEnv, tsx: boolean): Promise<Record<string, unknown>> {
  const cwd = side === 'development' ? dev : side === 'clone' ? clone : stable
  const result = spawnSync(process.execPath, [...(tsx ? ['--import', 'tsx'] : []), probeFile], {
    cwd,
    env: { ...env, EVERY_TOOL_PLACES: JSON.stringify({ root, dev, stable, clone, port }), EVERY_TOOL_SIDE: side },
    // @ts-expect-error Node accepts detached for spawnSync, and it makes the merge-tool probe lead its own group so watchMergeCleanup can read its leader.
    detached: side === 'merge-tool',
    encoding: 'utf8',
    timeout: 90_000,
  })
  try {
    return JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    return { probeFailed: `${String(result.status)} ${result.stdout}${result.stderr}` }
  }
}

function theReadingsOfTheOffice() {
  return {
    code: stable,
    envFile: join(dev, '.env'),
    dataRoot: `${dev}/`,
    database,
    keys: join(dev, 'data', 'keys.json'),
    backups: join(dev, 'data', 'backups'),
    port: String(port),
    registerTimeout: '73',
    commitEmail: THE_FILES_ADDRESS,
  }
}

function theLineOf(ran: Ran, checkout: string, entry: string): Line {
  const found = ran.lines.filter((one) => one.checkout === checkout && one.entry === entry)
  expect(found.length, `${entry} in ${checkout} wrote ${String(found.length)} readings, and it said: ${ran.said}`).toBe(1)
  return found[0] as Line
}

/** A tool started through the helper: it reads the office, and its start check let it start. */
function expectTheOffice(ran: Ran, entry: string): Line {
  const line = theLineOf(ran, stable, entry)
  expect(line.settingsError, `${entry}: ${ran.said}`).toBeNull()
  expect(line.readings, `${entry}: ${ran.said}`).toEqual(theReadingsOfTheOffice())
  expect(ran.said, entry).not.toContain(THE_START_CHECK_SAYS)
  return line
}

function theSentence() {
  return `This is the stable checkout ${stable}, at ${TAG}, and it was started without MOLE_OFFICE_DEVELOPMENT_CHECKOUT, so it would read its own defaults and not the office's settings. Start it through theOfficeToolEnvironment (src/config/the-office-tool-environment.mjs), or run it from the development checkout with node tools/through-the-stable-checkout.mjs. Nothing was started.`
}

function anEnvironment(value: unknown, what: string): NodeJS.ProcessEnv {
  expect(value, `${what} gave no environment`).toBeTypeOf('object')
  expect(value, `${what} failed`).not.toHaveProperty('failed')
  return value as NodeJS.ProcessEnv
}

function theStartOf(line: Line, ran: Ran): Spawned {
  const serveDev = line.spawned.filter((one) => one.args.some((word) => word.endsWith('tools/serve-dev.mjs')))
  expect(serveDev.length, `the service command started ${JSON.stringify(line.spawned.map((one) => [one.command, ...one.args]))}, and it said: ${ran.said}`).toBe(1)
  const start = serveDev[0] as Spawned
  // The script is named relative to the stable checkout it starts in, as every other start names it, so the stop
  // after it finds serve-dev as the second word even when the checkout's path has a space. The start carries the suite's
  // mark, so serve-dev is told to end with the test run the mark names (src/config/the-test-mark.mjs).
  expect({ command: start.command, args: start.args, cwd: start.cwd }).toEqual({
    command: process.execPath,
    args: ['tools/serve-dev.mjs', '--built', '--prepared', `${THE_TEST_RUN_FLAG}=${String(process.env[THE_TEST_MARK])}`],
    cwd: stable,
  })
  expect({
    pairing: start.env?.[THE_PAIRING],
    production: start.env?.['NODE_ENV'],
    database: start.env?.['MOLE_OFFICE_DB'],
    port: start.env?.['MOLE_OFFICE_PORT'],
  }).toEqual({ pairing: dev, production: 'production', database, port: String(port) })
  return start
}

/** The process a recorded start would have been: the same file, words, folder and environment. */
function theHop(start: Spawned): Promise<Ran> {
  const [entry, ...words] = start.args
  return aTool(start.cwd, String(entry), words, start.env ?? {}, { mode: 'exit' })
}

/** The words of a unit's command line, each unquoted as systemd reads it. */
function unquotedWords(text: string): string[] {
  return [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) =>
    String(match[1]).replace(/\\(.)/g, '$1').replace(/%%/g, '%').replace(/\$\$/g, () => '$'))
}

function listed(): string[] {
  const result = spawnSync('git', ['-C', SOURCE, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...COPIED], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  expect(result.status, result.stderr).toBe(0)
  return [...new Set(result.stdout.split('\0').filter((one) => one !== '' && existsSync(join(SOURCE, one))))]
}

function aCheckout(checkout: string) {
  for (const file of files) {
    mkdirSync(dirname(join(checkout, file)), { recursive: true })
    copyFileSync(join(SOURCE, file), join(checkout, file))
  }
  symlinkSync(join(SOURCE, 'node_modules'), join(checkout, 'node_modules'))
}

function leaveOutNodeModules(checkout: string) {
  writeFileSync(join(checkout, '.git', 'info', 'exclude'), 'node_modules\n')
}

beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'every-office-tool-')))
  home = join(root, 'home')
  mkdirSync(home)
  mkdirSync(join(root, 'readings'))
  dev = join(root, 'development')
  stable = join(root, 'stable')
  clone = join(root, 'clone')
  files = listed()
  aCheckout(stable)
  aCheckout(dev)

  git(stable, 'init', '--quiet', '-b', 'stable')
  leaveOutNodeModules(stable)
  git(stable, 'add', '-A')
  git(stable, 'commit', '--quiet', '-m', 'Synthetic stable office')
  git(stable, 'tag', TAG)
  stableCommit = git(stable, 'rev-parse', 'HEAD')
  git(dev, 'init', '--quiet', '-b', 'main')
  leaveOutNodeModules(dev)
  git(dev, 'add', '-A')
  git(dev, 'commit', '--quiet', '-m', 'Synthetic development office')
  git(root, 'clone', '--quiet', stable, clone)
  git(clone, 'checkout', '--quiet', '-b', 'main')
  leaveOutNodeModules(clone)
  symlinkSync(join(SOURCE, 'node_modules'), join(clone, 'node_modules'))

  port = await aFreePort()
  clonePort = await aFreePort()
  database = join(dev, 'data', 'office.sqlite')
  mkdirSync(join(dev, 'data'), { recursive: true })
  const made = await freshDb()
  await made.client.sqlite.backup(database)
  made.close()
  const db = new Database(database)
  try {
    const choose = db.prepare('INSERT OR REPLACE INTO runtime_settings (name, value) VALUES (?, ?)')
    choose.run('MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS', '73')
    choose.run('MOLE_OFFICE_TERMINAL_HOLDER', 'off')
  } finally {
    db.close()
  }
  writeFileSync(join(dev, 'data', 'keys.json'), `${JSON.stringify({ office: THE_OFFICE_KEY })}\n`, { mode: 0o600 })
  writeFileSync(
    join(dev, '.env'),
    `MOLE_OFFICE_PORT=${String(port)}\nMOLE_OFFICE_DB=${database}\nMOLE_OFFICE_STABLE_CHECKOUT=${stable}\nMOLE_OFFICE_COMMIT_EMAIL=${THE_FILES_ADDRESS}\n`,
  )
  writeFileSync(join(clone, '.env'), `MOLE_OFFICE_PORT=${String(clonePort)}\nMOLE_OFFICE_DB=${join(clone, 'data', 'clone.sqlite')}\n`)

  reporter = join(root, 'reporter.mjs')
  writeFileSync(reporter, THE_REPORTER)
  probeFile = join(root, 'office-probe.mjs')
  writeFileSync(probeFile, THE_PROBE)
  officeEnv = { ...base(), [THE_PAIRING]: dev, NODE_ENV: 'production', MOLE_OFFICE_DB: database, MOLE_OFFICE_PORT: String(port) }
  office = await theProbe('office', officeEnv, true)
}, 180_000)

afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }) })

it('the helper gives the serving checkout the pairing, the development checkout none, and refuses a third', async () => {
  expect(office, String(office['probeFailed'])).not.toHaveProperty('probeFailed')
  expect(office['readings']).toEqual(theReadingsOfTheOffice())
  for (const [name, value] of Object.entries(office['readings'] as Record<string, unknown>)) expect(value, name).not.toBeNull()
  const fromDevelopment = await theProbe('development', base(), false)
  for (const [side, probe] of [['the office', office], ['the development checkout', fromDevelopment]] as const) {
    expect(probe['helper, serving'], side).toEqual({ checkout: stable, env: { PATH: 'kept', NODE_ENV: 'kept', [THE_PAIRING]: dev } })
    expect(probe['helper, development'], side).toEqual({ checkout: dev, env: { PATH: 'kept' } })
    expect(probe['helper, by default'], side).toEqual({ checkout: stable, env: { PATH: 'kept', [THE_PAIRING]: dev } })
    const third = probe['helper, third'] as { failed?: { code: string, message: string } }
    expect(third.failed?.code, `${side}: ${JSON.stringify(third)}`).toBe(THE_REFUSAL_CODE)
    for (const folder of [stable, dev, clone]) expect(third.failed?.message, side).toContain(folder)
    expect(third.failed?.message, side).toContain('Nothing was started.')
  }
  const unpaired = await theProbe('clone', base(), false)
  expect(unpaired['helper, third']).toEqual({ checkout: stable, env: { PATH: 'kept' } })
  expect(unpaired['helper, by default']).toEqual({ checkout: clone, env: { PATH: 'kept' } })
}, 120_000)

it('A: the merge tool, the check tool and the launcher the worker starts read the office, and the merge tool gets past its start check', async () => {
  const forThe = (runtime: string) => anEnvironment(office[`envFor ${runtime} stable`], `envFor for ${runtime}`)
  for (const runtime of ['merge-tool', 'inspection-tool', 'round-launcher']) {
    expect(forThe(runtime)[THE_PAIRING], runtime).toBe(dev)
    expect(forThe(runtime)['MOLE_AGENT_KEY'], runtime).toBe(A_RUNS_KEY)
  }
  expect(forThe('inspection-tool')['MOLE_OFFICE_DB']).toBe(database)
  expect(forThe('merge-tool')).not.toHaveProperty('MOLE_OFFICE_DB')
  const workdir = join(root, 'merge-work-paired')
  const [merger, inspector, launcher] = await Promise.all([
    aTool(stable, 'tools/the-merger.mjs', theMergersWords(workdir), forThe('merge-tool'), { mode: 'exit' }),
    aTool(stable, 'tools/the-inspector.mjs', ['--help'], forThe('inspection-tool')),
    aTool(stable, 'tools/sandbox.mjs', ['--help'], forThe('round-launcher')),
  ])
  // THE CASE THAT KEEPS THE QUEUE RUNNING: with the pairing as the worker gives it, the merge tool goes on past its
  // start check and tries to reach the office or start its cleanup watcher, and the reporter stops it there.
  expect(merger.status, merger.said).not.toBe(2)
  const line = expectTheOffice(merger, 'tools/the-merger.mjs')
  expect(line.spawned.length + line.fetched.length, merger.said).toBeGreaterThan(0)
  for (const watcher of line.spawned.filter((one) => one.args.some((word) => word.endsWith('cleanup.mjs')))) {
    expect(watcher.env?.[THE_PAIRING], 'the cleanup watcher').toBe(dev)
  }
  expectTheOffice(inspector, 'tools/the-inspector.mjs')
  expectTheOffice(launcher, 'tools/sandbox.mjs')
}, 120_000)

it('A, at an entry\'s turn: the owner-content gate and the address gate, which the merge tool loads only then, run in the stable checkout', () => {
  // integrate.mjs imports these two guards when an entry's turn comes, not when the merge tool starts, so case A never
  // reaches them. The owner-content gate reads its copyright line and its comment reader from test files in the
  // checkout it runs in, and the address gate imports the owner-content gate. Each screens an empty range here. The
  // owner-content gate is given no patterns, so it looks for no name; what this case proves is that both load.
  const guards = ['tools/merge-tool/owner-content.mjs', 'tools/merge-tool/addresses.mjs'].map((guard) => pathToFileURL(join(stable, guard)).href)
  const range = { repo: stable, base: stableCommit, head: stableCommit }
  const script = `
const said = []
for (const guard of ${JSON.stringify(guards)}) {
  const { screenTheAddedLines, theRefusalSaid } = await import(guard)
  said.push(theRefusalSaid(screenTheAddedLines(${JSON.stringify(range)})))
}
process.stdout.write(JSON.stringify(said))
`
  const ran = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: stable, env: base(), encoding: 'utf8', timeout: 60_000 })
  expect(ran.status, `${ran.stdout}${ran.stderr}`).toBe(0)
  expect(JSON.parse(ran.stdout)).toEqual([null, null])
}, 120_000)

it('B: a worker checkout that is the development checkout gets no pairing, and a third one refuses the office\'s own tools', () => {
  for (const runtime of ['merge-tool', 'inspection-tool', 'round-launcher']) {
    const inDevelopment = anEnvironment(office[`envFor ${runtime} development`], `envFor for ${runtime} in the development checkout`)
    expect(inDevelopment, runtime).not.toHaveProperty(THE_PAIRING)
    const third = office[`envFor ${runtime} clone`] as { failed?: { code: string, message: string } }
    expect(third.failed?.code, `${runtime}: ${JSON.stringify(third)}`).toBe(THE_REFUSAL_CODE)
    for (const named of ['MOLE_OFFICE_WORKER_CHECKOUT', stable, dev, clone]) expect(third.failed?.message, runtime).toContain(named)
  }
  for (const where of ['stable', 'development', 'clone']) {
    expect(anEnvironment(office[`envFor claude-code ${where}`], `an agent's run in ${where}`), where).not.toHaveProperty(THE_PAIRING)
  }
  const refusal = (office['envFor merge-tool clone'] as { failed: { message: string } }).failed.message
  const said = refusal.replace(/ Nothing was started\.$/, '')
  expect(office['worker line, clone']).toBeTypeOf('string')
  expect(office['worker line, clone']).toContain(said)
  for (const quiet of ['worker line, development', 'worker line, stable']) {
    expect(office[quiet], quiet).toBeTypeOf('string')
    expect(office[quiet], quiet).not.toContain('MOLE_OFFICE_WORKER_CHECKOUT')
  }
})

// GETCONF IS LET THROUGH in cases D and E. A start that carries the test suite's mark reads when the test run began,
// before it starts anything. On Linux that asks `getconf CLK_TCK` for the clock tick, which starts nothing of the
// office's. A child let through is not recorded, so the one start the case reads is still serve-dev's.
it('D, rows 14 and 15: the service command starts serve-dev in the stable checkout paired with the development checkout, from it and as a restart inside the office', async () => {
  const [fromDevelopment, asARestart] = await Promise.all([
    aTool(dev, THE_SERVICE_COMMAND, ['start'], base(), { passes: ['getconf'] }),
    aTool(stable, THE_SERVICE_COMMAND, ['restart'], officeEnv, { passes: ['getconf'] }),
  ])
  const firstStart = theStartOf(theLineOf(fromDevelopment, dev, THE_SERVICE_COMMAND), fromDevelopment)
  const secondStart = theStartOf(theLineOf(asARestart, stable, THE_SERVICE_COMMAND), asARestart)
  const [first, second] = await Promise.all([theHop(firstStart), theHop(secondStart)])
  expectTheOffice(first, 'tools/serve-dev.mjs')
  expectTheOffice(second, 'tools/serve-dev.mjs')
}, 120_000)

it('E, row 16: the start-at-login unit runs the development checkout\'s service command, which starts the office paired', async () => {
  const unit = office['unit']
  expect(unit, JSON.stringify(unit)).toBeTypeOf('string')
  const lines = String(unit).split('\n')
  const words = unquotedWords(String(lines.find((one) => one.startsWith('ExecStart='))))
  expect(words.slice(1)).toEqual([join(dev, THE_SERVICE_COMMAND), 'watch'])
  const environment = Object.fromEntries(
    lines.filter((one) => one.startsWith('Environment=')).map((one) => {
      const word = String(unquotedWords(one)[0])
      return [word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1)]
    }),
  )
  expect(Object.keys(environment).sort()).toEqual(['MOLE_OFFICE_DB', 'MOLE_OFFICE_PORT', 'PATH'])
  // A user unit with no WorkingDirectory runs in the home folder. getconf is let through for the reason above case D.
  const started = await aTool(home, String(words[1]), ['start'], { ...base(), ...environment }, { passes: ['getconf'] })
  const start = theStartOf(theLineOf(started, dev, THE_SERVICE_COMMAND), started)
  expectTheOffice(await theHop(start), 'tools/serve-dev.mjs')
}, 120_000)

it('F and item 5: the copy wrapper and the command form run each listed tool in the stable checkout with the office\'s readings, and refuse any other', async () => {
  const relay = (tool: string) => ({ passes: [join(stable, tool)] })
  const [wrapper, ...forms] = await Promise.all([
    aTool(dev, 'tools/office-copy-through-the-stable-checkout.mjs', ['--help'], base(), relay('tools/office-copy.mjs')),
    ...THE_COMMAND_FORMS_LIST.map(({ tool, words }) => aTool(dev, 'tools/through-the-stable-checkout.mjs', [tool, ...words], base(), relay(tool))),
  ])
  expectTheOffice(wrapper as Ran, 'tools/office-copy.mjs')
  THE_COMMAND_FORMS_LIST.forEach(({ tool }, at) => {
    const ran = forms[at] as Ran
    expectTheOffice(ran, tool)
    expect(ran.said, tool).not.toContain('Nothing was run.')
  })
  // NO RELAY IS GIVEN HERE, so a tool the command form wrongly ran would be stopped by the reporter and seen.
  for (const notListed of ['scripts/reset.ts', 'tools/queue-history.mjs']) {
    const ran = await aTool(dev, 'tools/through-the-stable-checkout.mjs', [notListed], base())
    expect(ran.status, ran.said).toBe(2)
    expect(ran.stderr).toContain(notListed)
    expect(ran.stderr).toContain('Nothing was run.')
    expect(ran.lines.filter((one) => one.checkout === stable)).toEqual([])
    expect(theLineOf(ran, dev, 'tools/through-the-stable-checkout.mjs').spawned).toEqual([])
  }
}, 120_000)

it('H: the runs\' output folder is the serving install\'s, for the worker and for the queue history', () => {
  const folder = join(stable, '.logs', 'runs')
  expect(office['worker output']).toBe(folder)
  expect(office['run output folder']).toBe(folder)
  expect(office['queue history']).toBe(folder)
})

it('item 2: each tool of the first list, started unpaired in the stable checkout, exits 2 with the sentence and starts nothing', async () => {
  const workdir = join(root, 'merge-work-unpaired')
  const list = theFirstList(workdir)
  const ran = await Promise.all(list.map(({ tool, words, tsx }) => aTool(stable, tool, words, base(), { read: false, ...(tsx === true ? { tsx } : {}) })))
  list.forEach(({ tool }, at) => {
    const one = ran[at] as Ran
    expect(one.status, `${tool}: ${one.said}`).toBe(2)
    expect(one.stderr, tool).toContain(theSentence())
    expect(one.stdout, tool).toBe('')
    const line = theLineOf(one, stable, tool)
    expect({ spawned: line.spawned, fetched: line.fetched, connected: line.connected, listened: line.listened }, tool)
      .toEqual({ spawned: [], fetched: [], connected: [], listened: [] })
  })
  // The merge tool read no entry: it wrote nothing into its work folder.
  expect(existsSync(workdir) ? readdirSync(workdir) : []).toEqual([])
}, 120_000)

it('a clone on main at the tag\'s commit, and the development checkout, are not refused', async () => {
  expect(git(clone, 'rev-parse', 'HEAD')).toBe(stableCommit)
  expect(git(clone, 'symbolic-ref', 'HEAD')).toBe('refs/heads/main')
  const [inTheClone, inDevelopment] = await Promise.all([
    aTool(clone, 'tools/the-inspector.mjs', ['--help'], base(), { port: clonePort }),
    aTool(dev, 'tools/the-inspector.mjs', ['--help'], base()),
  ])
  for (const [ran, checkout] of [[inTheClone, clone], [inDevelopment, dev]] as const) {
    // Past the start check, the inspector prints its own usage for --help.
    expect(ran.said).toContain('node tools/the-inspector.mjs --run <session id>')
    expect(ran.said).not.toContain(THE_START_CHECK_SAYS)
    expect(theLineOf(ran, checkout, 'tools/the-inspector.mjs').readings?.['code']).toBe(checkout)
  }
}, 120_000)

it('the upgrade and the bootstrap still run the stable code without the pairing', async () => {
  const checked = files.filter((file) => /\.(mjs|ts)$/.test(file) && !file.startsWith('tests/') && file !== THE_HELPER)
    .filter((file) => readFileSync(join(SOURCE, file), 'utf8').includes('stopAnUnpairedStableStart('))
  expect(checked.sort()).toEqual(theFirstList('').map(({ tool }) => tool).sort())
  const copy = join(root, 'upgrade-copy.sqlite')
  copyFileSync(database, copy)
  const alone = { ...base(), MOLE_OFFICE_DB: copy, MOLE_OFFICE_PORT: String(clonePort) }
  const [migrated, served] = await Promise.all([
    aTool(stable, 'src/server/db/migrate.ts', [], alone, { tsx: true, read: false }),
    aTool(stable, 'tools/serve-dev.mjs', ['--built', '--prepared'], alone, { mode: 'exit', port: clonePort }),
  ])
  expect(migrated.status, migrated.said).toBe(0)
  for (const ran of [migrated, served]) expect(ran.said).not.toContain(THE_START_CHECK_SAYS)
  expect(served.status, served.said).not.toBe(2)
}, 120_000)

it('(d): db:backup and db:prune-backups run through the stable checkout, and a backup says which checkout and commit made it', async () => {
  const relay = (tool: string) => ({ tsx: true, passes: [join(stable, tool)] })
  const madeBy = `backup: made by the code of the checkout ${stable} at commit ${stableCommit}, paired with the development checkout ${dev}.`
  const told = await aTool(dev, 'scripts/backup.ts', [], base(), relay('scripts/backup.ts'))
  expect(told.status, told.said).toBe(0)
  expect(told.stdout.split('\n')[0]).toBe(madeBy)
  expectTheOffice(told, 'scripts/backup.ts')
  expect(readdirSync(join(dev, 'data', 'backups')).length).toBeGreaterThan(0)
  const asJson = await aTool(dev, 'scripts/backup.ts', ['--json'], base(), relay('scripts/backup.ts'))
  expect(asJson.status, asJson.said).toBe(0)
  expect((JSON.parse(asJson.stdout) as { madeBy?: unknown }).madeBy).toEqual({ checkout: stable, commit: stableCommit })
  const pruned = await aTool(dev, 'scripts/prune-backups.ts', ['--say-only'], base(), relay('scripts/prune-backups.ts'))
  expect(pruned.status, pruned.said).toBe(0)
  expectTheOffice(pruned, 'scripts/prune-backups.ts')
}, 120_000)

it('(d): db:migrate, db:seed and db:rewrite-a-backup refuse with the way for each, the server starts name the service command, and nothing changes', async () => {
  const before = hashOf(database)
  const ways = {
    migrate: 'The stable office migrates its database when it starts, so db:migrate is not run on it from here.',
    seed: 'db:seed is never run on the office\'s database.',
    rewrite: `To rewrite a backup of the office, run db:rewrite-a-backup from the stable checkout ${stable}, with MOLE_OFFICE_DEVELOPMENT_CHECKOUT set to ${dev}.`,
    reset: 'db:reset is never run on the office\'s database.',
    server: `Start the office with npm run mole-office start, which starts it from the stable checkout ${stable}.`,
  }
  const [migrated, seeded, rewritten, server, serve, devServer] = await Promise.all([
    aTool(dev, 'src/server/db/migrate.ts', [], base(), { tsx: true }),
    aTool(dev, 'scripts/seed.ts', [], base(), { tsx: true }),
    aTool(dev, 'scripts/rewrite-a-backup.ts', [join(dev, 'data', 'backups')], base(), { tsx: true }),
    aTool(dev, 'src/server/index.ts', [], { ...base(), NODE_ENV: 'production' }, { tsx: true, mode: 'exit' }),
    aTool(dev, 'tools/serve-dev.mjs', ['--built'], base(), { mode: 'exit' }),
    aTool(dev, 'tools/serve-dev.mjs', [], base(), { mode: 'exit' }),
  ])
  for (const [ran, way] of [[migrated, ways.migrate], [seeded, ways.seed], [rewritten, ways.rewrite], [server, ways.server], [serve, ways.server], [devServer, ways.server]] as const) {
    expect(ran.status, ran.said).not.toBe(0)
    expect(ran.status, `${way}\n${ran.said}`).not.toBe(97)
    expect(ran.stderr, ran.said).toContain(way)
    for (const line of ran.lines.filter((one) => one.checkout === dev)) {
      expect({ spawned: line.spawned, listened: line.listened }, `${line.entry}: ${ran.said}`).toEqual({ spawned: [], listened: [] })
    }
  }
  // db:reset is never run, here or anywhere an agent works. Its way is read from the one table, and its file uses it.
  const { THE_WAYS_FOR_THE_JOBS } = await import(`../${THE_HELPER}`) as { THE_WAYS_FOR_THE_JOBS: Record<string, string> }
  expect(THE_WAYS_FOR_THE_JOBS['scripts/reset.ts']).toBe(ways.reset)
  expect(readFileSync(join(SOURCE, 'scripts', 'reset.ts'), 'utf8')).toContain('withTheWayForThisJob(')
  expect(hashOf(database)).toBe(before)
}, 120_000)
