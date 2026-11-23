// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A WORKER'S SHELL SENDS ITS OWN USE LINE (wave 13n round R, item 2h; problem r9ob5kZmvzyV).
 *
 * A Codex worker's shell and a dsh worker's commands hold no MOLE_AGENT_KEY. Codex's shell policy takes it out
 * (aCommandsOfficeTool in src/config/run-permissions.mjs), and dsh keeps it out of every command it runs
 * (tools/dsh-hooks/install-profile.mjs). So tools/run-named-tests.mjs found no key there and printed the body for the
 * worker to send by hand. The launcher's helper, tools/sandbox-start.mjs, now gives such a run the kind of file a
 * Claude Code run's shell has, and MOLE_OFFICE_TOOL_CONFIGURATION names it. The key itself stays out of the shell.
 *
 * HOW A WORKER IS STARTED HERE. tools/sandbox.mjs worker files the run on the host and starts this same helper in the
 * container with --agent, --runtime, --filed and the run's key in SANDBOX_RUN_KEY. This test starts the real helper
 * the same way, from a starter that holds a key of its own, with a stand-in office on loopback.
 *
 * THE STAND-IN PROGRAMS. Each runs one command the way its real program does, with the variables the real program
 * keeps out of a command taken out. The stand-in Codex reads its own `-c shell_environment_policy.exclude=[...]`. The
 * stand-in dsh takes out MOLE_AGENT_KEY, as dsh's own filter is said to in install-profile.mjs; that filter was read,
 * not measured, because dsh is not installed here. The command is tools/run-named-tests.mjs with a stand-in vitest,
 * so the use line goes through the tool. The command's shell does not get MOLE_OFFICE_API_ROOT, and only because the
 * tools run here are this checkout's, outside the stand-in instance; in a sandbox they are the instance's own.
 *
 * WHAT IS PROVED
 *   1. Codex: the shell holds no MOLE_AGENT_KEY, and no variable holds the run's key or the starter's. The variable
 *      names a file of mode 600, alone in a folder of mode 700 in the helper's temporary folder, not under logs/ and not
 *      in the worktree, and never the starter's own file, which the starter's environment names. The file names the worker's agent and run, and holds the run's own key and not the starter's.
 *      The office hears the use line under the worker's run, agent and key, and the tool says it was written. The
 *      folder is gone when the run has ended. The run's launch details name the file and hold no key.
 *   2. dsh, through tools/dsh-hooks/run-agent.sh, as a dsh worker starts: the same.
 *   3. A run named with --run holds no key, and its launch details say so. Its shell gets no key and no file, not even
 *      the starter's, and the test batch stops before starting without a seat.
 *   4. --starts-runs: a Codex shell keeps the run's key and gets no file.
 * Every key, login and office here is made up; only loopback and temporary folders are used.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OFFICE_TOOL_CONFIGURATION } from '../src/config/run-permissions.mjs'
import { syntheticDshReader } from './dsh-native-stand-in.ts'
import { FAKE_DOCKER, withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { THE_FACTS_VARIABLE, theFactsAStartIsGiven, writeInstance } from '../tools/sandbox-common.mjs'

const REPO = join(import.meta.dirname, '..')
const key = 'd4'.repeat(32)
const starterKey = 'b9'.repeat(32)
const agent = 'synthetic-worker'
const starterSession = 'synthetic-starter-session'
let root = ''
let dir = ''
let worktree = ''
let api = ''
let office: Server
let sequence = 0
const runs = new Map<string, { runtime: string; reads: number }>()
/** Every use line the stand-in office heard: its headers and its body. */
const uses: { session: unknown; agent: unknown; key: unknown; body: { tool?: string; said?: string } }[] = []

/** What the stand-in program saw and what its one command did. */
interface Capture {
  program: string
  /** The variables of the command's shell, by name. */
  names: string[]
  /** Whether any variable of the command's shell holds the run's key, or the starter's, under any name. */
  holdsTheRunsKey: boolean
  holdsTheStartersKey: boolean
  /** Whether the program itself holds the run's key, for office_request. */
  programHoldsTheRunsKey: boolean
  path: string | null
  mode: number | null
  folderMode: number | null
  folderHolds: string[]
  configuration: { mcpServers?: { mole_office?: { env?: Record<string, string> } } } | null
  /** What tools/run-named-tests.mjs printed, and its exit code. */
  said: string
  exited: number | null
}

/**
 * THE ONE COMMAND A STAND-IN RUNS, in the shell its program gives it: it reads the file the shell names while the run
 * is alive, then runs tools/run-named-tests.mjs with a stand-in vitest, and writes what it saw. IT READS ITS PATHS FROM
 * THE FILE BESIDE IT, which each start writes (theStandInIsTold), and not from its environment: a Codex is given only
 * the names its list keeps (src/config/the-environment-a-codex-gets.mjs), and none of this test's own names is on it.
 */
const SHELL = String.raw`
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process')
module.exports = function runOneCommand(program, shellEnv) {
  const told = JSON.parse(fs.readFileSync(path.join(__dirname, 'told.json'), 'utf8'))
  const values = Object.values(shellEnv)
  // THE TWO KEYS ARE READ FROM A FILE, so that no variable of the test's own holds one.
  const keys = JSON.parse(fs.readFileSync(told.keys, 'utf8'))
  const where = shellEnv[${JSON.stringify(OFFICE_TOOL_CONFIGURATION)}] ?? null
  const there = where !== null && fs.existsSync(where)
  const work = fs.mkdtempSync(path.join(told.scratch, 'named-'))
  fs.mkdirSync(path.join(work, 'tests'))
  fs.writeFileSync(path.join(work, 'tests', 'one.test.ts'), "test('x', () => {})\n")
  const vitest = path.join(work, 'stand-in-vitest.mjs')
  fs.writeFileSync(vitest, "import { writeFileSync } from 'node:fs'\n" +
    "const out = process.argv.find((word) => word.startsWith('--outputFile.json='))\n" +
    'writeFileSync(out.slice(18), JSON.stringify({ testResults: [{ name: ' + JSON.stringify(path.join(work, 'tests', 'one.test.ts')) + ", status: 'passed' }] }))\n")
  const toolEnv = { ...shellEnv }
  delete toolEnv.MOLE_OFFICE_API_ROOT
  const ran = spawnSync(process.execPath, [path.join(told.repo, 'tools', 'run-named-tests.mjs'), '--root', work, '--vitest', vitest, 'tests/one.test.ts'],
    { cwd: work, env: toolEnv, encoding: 'utf8' })
  const capture = {
    program, names: Object.keys(shellEnv),
    holdsTheRunsKey: values.includes(keys.run), holdsTheStartersKey: values.includes(keys.starter),
    programHoldsTheRunsKey: Object.values(process.env).includes(keys.run),
    path: where, mode: there ? fs.statSync(where).mode & 0o777 : null,
    folderMode: there ? fs.statSync(path.dirname(where)).mode & 0o777 : null,
    folderHolds: there ? fs.readdirSync(path.dirname(where)) : [],
    configuration: there ? JSON.parse(fs.readFileSync(where, 'utf8')) : null,
    said: String(ran.stdout) + String(ran.stderr), exited: ran.status,
  }
  fs.writeFileSync(told.capture + '.part', JSON.stringify(capture))
  fs.renameSync(told.capture + '.part', told.capture)
}
`

/**
 * The stand-in Codex: its shell policy's exclude list, read from its own arguments, is taken out of the command's shell.
 * `theShell`, the path of the command's module, is written into its text (beforeAll).
 */
const CODEX = String.raw`
const argv = process.argv.slice(2)
const excluded = []
argv.forEach((word, at) => {
  const named = 'shell_environment_policy.exclude='
  if (argv[at - 1] === '-c' && word.startsWith(named)) excluded.push(...JSON.parse(word.slice(named.length)))
})
const shellEnv = { ...process.env }
for (const name of excluded) delete shellEnv[name]
require(theShell)('codex', shellEnv)
process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: 'synthetic-thread' }) + '\n')
`

/** The stand-in dsh: MOLE_AGENT_KEY is taken out of the command, as dsh's own filter is said to do. `theShell` as for Codex. */
const DSH = String.raw`
const shellEnv = { ...process.env }
delete shellEnv.MOLE_AGENT_KEY
require(theShell)('dsh', shellEnv)
`

/**
 * THE STARTER'S ENVIRONMENT, with none of this machine's office or sandbox variables: the test sets the starter's own
 * below. A starter in a Claude Code run names its own office tool configuration, which holds its own key, so this one
 * does too (startersFile), and no worker's shell may name it.
 */
function theStartersOwnEnvironment(): NodeJS.ProcessEnv {
  const env = withoutInheritedEffort()
  for (const name of Object.keys(env)) {
    if (name.startsWith('MOLE_OFFICE_') || name.startsWith('SANDBOX_') || name === 'MOLE_AGENT_KEY') delete env[name]
  }
  return env
}
let startersFile = ''

/** The stand-in sandbox's facts, as up writes them and as the launcher gives them to the helper. */
const facts = () => ({
  instance: 'synthetic', template: 'synthetic', templateDir: join(root, 'template'),
  containerRow: 'synthetic-container', container: { name: 'synthetic-container', id: 'synthetic-container' },
  ref: 'main', from: worktree, workspace: 'default', api,
})

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mole-workers-shell-'))
  dir = join(root, 'synthetic')
  worktree = join(dir, 'worktrees', agent)
  mkdirSync(worktree, { recursive: true })
  for (const folder of ['bin', 'home', 'tmp', 'repo', 'briefs', 'scratch', 'dsh/npm/node_modules/.bin']) mkdirSync(join(dir, folder), { recursive: true })
  for (const name of ['tools', 'src']) symlinkSync(join(REPO, name), join(dir, 'repo', name))
  execFileSync('git', ['init', '-q', '-b', 'main', worktree])
  execFileSync('git', ['-C', worktree, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'synthetic'])
  mkdirSync(join(root, 'template'))
  writeFileSync(join(root, 'template', 'devcontainer.json'), '{}')
  writeFileSync(join(root, 'template', 'sandbox.json'), JSON.stringify({ template: 'synthetic' }))
  writeFileSync(join(dir, 'briefs', 'brief.md'), 'A synthetic brief for a stand-in worker.\n')
  writeFileSync(join(dir, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(dir, 'shell.cjs'), SHELL)
  writeFileSync(join(dir, 'the-keys.json'), JSON.stringify({ run: key, starter: starterKey }))
  // THE STARTER'S OWN FILE, as the launcher writes one for a Claude Code run: its key, its agent and its run.
  mkdirSync(join(root, 'starter'), { mode: 0o700 })
  startersFile = join(root, 'starter', 'office-mcp.json')
  writeFileSync(startersFile, JSON.stringify({ mcpServers: { mole_office: { env: {
    MOLE_OFFICE_AGENT: 'synthetic-starter', MOLE_OFFICE_SESSION: starterSession, MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_API: 'http://127.0.0.1:9', MOLE_AGENT_KEY: starterKey,
  } } } }), { mode: 0o600 })
  const theShell = `const theShell = ${JSON.stringify(join(dir, 'shell.cjs'))}\n`
  writeFileSync(join(dir, 'bin', 'codex'), `#!${process.execPath}\n${theShell}${CODEX}`, { mode: 0o755 })
  writeFileSync(join(dir, 'bin', 'dsh'), `#!${process.execPath}\n${theShell}${DSH}`, { mode: 0o755 })
  symlinkSync(join(dir, 'bin', 'dsh'), join(dir, 'dsh/npm/node_modules/.bin/dsh'))
  office = createServer(async (req, res) => {
    let text = ''
    for await (const chunk of req) text += String(chunk)
    res.setHeader('content-type', 'application/json')
    const url = new URL(req.url ?? '/', 'http://synthetic')
    const run = runs.get(url.pathname.split('/').pop() ?? '')
    if (url.pathname === '/api/participants') {
      res.end(JSON.stringify({ agents: [{ id: agent, handle: agent, name: agent, record: 'synthetic-agent-record' }] }))
    } else if (req.method === 'GET' && url.pathname.startsWith('/api/office/run-models/for/')) {
      // THIS BRANCH'S OFFICE ANSWERS THE SELECTION ITS CASTING ROW GIVES. The stand-in has no Casting
      // table, so it makes the selection itself, with no row behind it. A dsh worker's command is a
      // shell, which cannot carry a selection, so dsh keeps the compatibility data its model has.
      const runtime = url.searchParams.get('runtime') ?? 'codex'
      const model = url.searchParams.get('model') ?? 'synthetic-model'
      res.end(JSON.stringify({
        model, effort: null, effortFrom: 'none',
        ...(runtime === 'dsh' ? {} : { selection: { runtime, model, native: { model, provider: null, variant: null, effort: null }, casting: null } }),
      }))
    } else if (url.pathname === `/api/participants/agent/${agent}`) {
      res.end(JSON.stringify({ participant: { id: agent, handle: agent } }))
    } else if (req.method === 'POST' && url.pathname === '/api/slots/acquire') {
      res.end(JSON.stringify({ slot: { id: 'synthetic-seat', state: 'granted' }, asked: 'new', says: 'Synthetic seat granted.' }))
    } else if (req.method === 'POST' && url.pathname === '/api/slots/synthetic-seat/release') {
      res.end(JSON.stringify({ released: true, id: 'synthetic-seat' }))
    } else if (req.method === 'POST' && url.pathname === '/api/toolset/uses') {
      const session = req.headers['x-mole-office-session']
      uses.push({ session, agent: req.headers['x-mole-office-actor-id'], key: req.headers['x-mole-office-key'], body: JSON.parse(text) })
      res.statusCode = 201
      res.end(JSON.stringify({ run: session, files: 1 }))
    } else if (req.method === 'GET' && url.pathname === '/api/resources') {
      res.end('{"resources":[]}')
    } else if (req.method === 'POST' && url.pathname === '/api/resources') {
      res.statusCode = 201
      res.end(JSON.stringify({ resource: { id: 'synthetic-process', key: String(JSON.parse(text).pidInContainer), pgid: JSON.parse(text).pidInContainer } }))
    } else if (req.method === 'GET' && run) {
      res.end(JSON.stringify({ record: { kind: 'session', data: {
        state: run.reads++ < 1 ? 'running' : 'finished', servingAgent: agent, runtime: run.runtime,
        workingDirectory: worktree, cutFrom: 'main', model: run.runtime === 'dsh' ? 'deepseek-v4.1-flash' : 'synthetic-model',
        sandbox: { template: 'synthetic', container: 'synthetic-container', folder: dir },
      } } }))
    } else if (req.method === 'PATCH' && url.pathname.startsWith('/api/records/')) {
      // The helper records the selection on the run, and marks the run at its end, through this door.
      res.end(JSON.stringify({ record: { kind: 'session', data: { state: 'running' } } }))
    } else if (url.pathname === '/api/health') res.end('{"synthetic":true}')
    else {
      res.statusCode = 404
      res.end('{"error":"No synthetic route"}')
    }
  })
  await new Promise<void>(resolve => office.listen(0, '127.0.0.1', resolve))
  api = `http://127.0.0.1:${(office.address() as AddressInfo).port}`
  // WRITTEN ONCE THE STAND-IN OFFICE HAS ITS ADDRESS: up writes into every sandbox's facts the office it writes to,
  // and the live-office guard reads the port it must refuse there.
  writeInstance(dir, facts())
})
afterAll(async () => {
  await new Promise<void>(resolve => office.close(() => resolve()))
  rmSync(root, { recursive: true, force: true })
})

/** Tells the command's module where this start's capture goes and where the rest is, in the file beside it. */
function theStandInIsTold(capturePath: string) {
  writeFileSync(join(dir, 'told.json'), JSON.stringify({ capture: capturePath, repo: REPO, scratch: join(dir, 'scratch'), keys: join(dir, 'the-keys.json') }))
}

/**
 * The real helper, started as tools/sandbox.mjs worker starts it in the container (`filed`), or with --run for a run
 * filed before (`existing`). It answers what the stand-in program saw, the run's launch details, and the run's label.
 */
async function started(runtime: 'codex' | 'dsh', options: { existing?: boolean; flags?: string[] } = {}) {
  const label = `synthetic-run-${++sequence}`
  const capturePath = join(dir, `${label}.json`)
  runs.set(label, { runtime, reads: 0 })
  const model = runtime === 'dsh' ? 'deepseek-v4.1-flash' : 'synthetic-model'
  const flags = options.existing
    ? ['--run', label]
    : ['--agent', agent, '--runtime', runtime, '--model', model, '--worktree', worktree, '--cut-from', 'main', '--filed', label,
        ...(runtime === 'dsh' ? ['--brief', join(dir, 'briefs', 'brief.md')] : [])]
  // A dsh worker's command is run-agent.sh, which the helper chooses itself; a dsh round named with --run says dsh's own.
  const command = runtime === 'dsh' && !options.existing ? [] : runtime === 'dsh' ? ['dsh', '--profile', 'office', join(dir, 'briefs', 'brief.md')] : ['codex', 'exec', '--json', '-m', model, '--', 'a synthetic brief']
  theStandInIsTold(capturePath)
  const child = spawn(process.execPath, [
    'tools/sandbox-start.mjs', '--in-background', '--instance', dir, '--cwd', worktree,
    '--as', 'synthetic-starter', '--session', starterSession, '--workspace', 'default', '--api', api,
    ...flags, ...(options.flags ?? []), ...(command.length === 0 ? [] : ['--', ...command]),
  ], { cwd: REPO, env: withAPrivateTmpToSweep({
    ...theStartersOwnEnvironment(),
    MOLE_OFFICE_AGENT: 'synthetic-starter', MOLE_OFFICE_SESSION: starterSession, MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_API: api,
    [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(facts()),
    MOLE_AGENT_KEY: starterKey,
    [OFFICE_TOOL_CONFIGURATION]: startersFile,
    SANDBOX_RUN_KEY: options.existing ? undefined : key,
    HOME: join(dir, 'home'),
    MOLE_OFFICE_COMMIT_EMAIL: 'synthetic@example.invalid',
    DEEPSEEK_API_KEY: 'synthetic-deepseek-key-for-the-stand-in-only',
    SANDBOX_DSH_NATIVE_READER: syntheticDshReader(join(root, 'reader')),
    PATH: join(dir, 'bin') + ':' + process.env['PATH'],
    TMPDIR: join(dir, 'tmp'),
  }, join(dir, 'a-private-tmp')) })
  let out = ''
  let err = ''
  child.stdout.on('data', chunk => { out += String(chunk) })
  child.stderr.on('data', chunk => { err += String(chunk) })
  const code = await new Promise<number | null>(resolve => child.on('close', resolve))
  expect(code, err).toBe(0)
  expect(out + err).not.toContain(key)
  const logs = join(dir, 'logs', label)
  const diagnostics = () => ['launch.txt', 'helper.log', 'dsh.log', 'out'].map(name => `${name}: ${existsSync(join(logs, name)) ? readFileSync(join(logs, name), 'utf8').slice(-3000) : '(missing)'}`).join('\n')
  await expect.poll(() => existsSync(capturePath), { timeout: 30_000, message: diagnostics() }).toBe(true)
  const capture = JSON.parse(readFileSync(capturePath, 'utf8')) as Capture
  // THE RUN HAS ENDED when the stand-in office has been asked for its state after the command, and the helper wrote its finish.
  await expect.poll(() => existsSync(join(logs, 'finish.log')), { timeout: 30_000, message: diagnostics() }).toBe(true)
  return { capture, label, err, launch: readFileSync(join(logs, 'launch.txt'), 'utf8'), logs }
}

/** What proves a worker's own shell sent its own line, for either runtime. */
async function theWorkersShellSendsItsOwnLine(runtime: 'codex' | 'dsh') {
  const before = uses.length
  const { capture, label, launch, logs } = await started(runtime)
  expect(capture.program).toBe(runtime)
  // THE KEY IS NOT IN THE SHELL, under its own name or any other, and neither is the starter's.
  expect(capture.names).not.toContain('MOLE_AGENT_KEY')
  expect(capture.holdsTheRunsKey).toBe(false)
  expect(capture.holdsTheStartersKey).toBe(false)
  // The program itself still holds the run's key, which its office_request uses.
  expect(capture.programHoldsTheRunsKey).toBe(true)
  // THE FILE THE SHELL NAMES: the run's own, kept from everyone else, in a folder of its own in the helper's temporary folder.
  expect(capture.names).toContain(OFFICE_TOOL_CONFIGURATION)
  expect(capture.path).not.toBeNull()
  expect(capture.path).not.toBe(startersFile)
  const path = capture.path!
  expect(dirname(dirname(path))).toBe(join(dir, 'tmp'))
  expect(path.startsWith(join(dir, 'logs'))).toBe(false)
  expect(path.startsWith(worktree)).toBe(false)
  expect(capture.mode).toBe(0o600)
  expect(capture.folderMode).toBe(0o700)
  expect(capture.folderHolds).toEqual([path.split('/').pop()])
  const given = capture.configuration?.mcpServers?.mole_office?.env
  expect(given?.['MOLE_AGENT_KEY']).toBe(key)
  expect(given?.['MOLE_AGENT_KEY']).not.toBe(starterKey)
  expect(given?.['MOLE_OFFICE_SESSION']).toBe(label)
  expect(given?.['MOLE_OFFICE_AGENT']).toBe(agent)
  // THE LINE WENT THROUGH THE TOOL, under the worker's own run, agent and key.
  expect(capture.said).toContain(`The use was written on the run ${label}, with 1 test file result.`)
  expect(capture.exited).toBe(0)
  const sent = uses.slice(before)
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ session: label, agent, key })
  expect(sent[0]!.body.tool).toBe('named-tests')
  // THE FILE GOES WITH THE RUN.
  await expect.poll(() => existsSync(dirname(path)), { timeout: 15_000 }).toBe(false)
  // THE RUN'S LAUNCH DETAILS NAME THE FILE, and no log of the run holds a key.
  expect(launch).toContain(`${OFFICE_TOOL_CONFIGURATION} names ${path} (mode 600, in a folder made for it alone), which holds this run's own key`)
  for (const name of readdirSync(logs)) {
    const text = readFileSync(join(logs, name), 'utf8')
    expect(text, name).not.toContain(key)
    expect(text, name).not.toContain(starterKey)
  }
}

describe("a worker's shell sends its named test's use line with the worker's own run key", () => {
  it("a Codex worker's shell holds no key, names its run's file, and the tool sends the line under the worker's run", async () => {
    await theWorkersShellSendsItsOwnLine('codex')
  }, 90_000)

  it("a dsh worker's commands hold no key, name the run's file, and the tool sends the line under the worker's run", async () => {
    await theWorkersShellSendsItsOwnLine('dsh')
  }, 90_000)

  it.each(['codex', 'dsh'] as const)("a %s run named with --run holds no key, and its launch details say so", async runtime => {
    const before = uses.length
    const { capture, label, launch, err } = await started(runtime, { existing: true })
    expect(capture.names).not.toContain('MOLE_AGENT_KEY')
    expect(capture.names).not.toContain(OFFICE_TOOL_CONFIGURATION)
    expect(capture.programHoldsTheRunsKey).toBe(false)
    expect(capture.exited).toBe(1)
    expect(capture.said).toContain('cannot start without a test-batches seat: this shell holds no key and names no office tool configuration.')
    expect(uses.slice(before)).toEqual([])
    const sentence = `The run ${label} was named with --run, and the host gives a run's key only to the start that filed it (--filed). ` +
      "So this run's command and its shell hold no key of the run's, and a tool's use line from its shell is not sent: " +
      'tools/use-line.mjs prints the body to send through office_request instead.'
    expect(launch).toContain(sentence)
    expect(err).toContain(sentence)
  }, 90_000)

  it('--starts-runs: a Codex shell keeps the run\'s key and gets no file', async () => {
    const before = uses.length
    const { capture, label } = await started('codex', { flags: ['--starts-runs'] })
    expect(capture.names).toContain('MOLE_AGENT_KEY')
    expect(capture.holdsTheRunsKey).toBe(true)
    expect(capture.holdsTheStartersKey).toBe(false)
    expect(capture.names).not.toContain(OFFICE_TOOL_CONFIGURATION)
    expect(uses.slice(before)).toEqual([expect.objectContaining({ session: label, agent, key })])
  }, 90_000)
})
