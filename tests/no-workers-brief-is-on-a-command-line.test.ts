// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO WORKER'S BRIEF IS ON A COMMAND LINE. The launcher gave a Codex or OpenCode worker its brief's whole text as the last
 * word of the command it started, so any listing of the computer's processes showed the brief. Claude Code already read
 * its brief on its standard input. Now the launcher passes the helper --stdin with the brief's file for every runtime,
 * and the helper makes that file the command's standard input: Codex is told to read its prompt there with `-`, and
 * OpenCode is given no message word. A helper too old for --stdin cannot start a Codex or OpenCode worker, and the
 * launcher refuses before anything is filed, with no other way of giving the brief.
 *
 * WHAT THIS FILE PROVES, through the real launcher and the real helper, with made-up programs in place of claude, codex
 * and opencode that record the words they were given and their standard input:
 *   1. A worker of each runtime: a made-up marker sentence in its brief is in no word of the command, and is on the
 *      command's standard input. Codex is told to read its prompt from standard input.
 *   2. A Codex round that resumes its thread, and an OpenCode round that continues its session, the same.
 *   3. A helper too old for --stdin: a Codex worker is refused, nothing is written to the office, and the helper is never
 *      run.
 *
 * Every program, office answer and sandbox here is synthetic. The office is a stand-in loaded into each process of the
 * launcher, and it refuses any other address, so nothing reaches a server. The sandbox's home, with the Codex and
 * OpenCode folders a start looks for, is a made-up folder inside this fixture; no real one is read or written.
 *
 * The fixture is copied from tests/the-launcher-passes-the-owners-effort.test.ts, cut down to what these cases start.
 */
import { spawn, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_OPENCODE_DATABASE_VARIABLE, writeInstance } from '../tools/sandbox-common.mjs'
import { expectRoundRulesSaved, LEGACY_ROUND_CHAPTERS, linkSourceWithLocalRoundRules, writeRoundStartRules } from './round-chapters-fixture.ts'
import { CONTAINER_TMP_LOADER, withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { NAME_THE_PROCESS_THAT_LOADS_THIS, removeTheFolderOnceItsProcessesHaveEnded } from './the-processes-a-fixture-started.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

let root = ''
let instance = ''
let env: NodeJS.ProcessEnv
const groups = new Set<number>()
const thread = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
const session = 'ses_syntheticOwned01'
const repo = process.cwd()
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

/** The made-up sentence each brief carries. A word of a command that holds it would show it in a process listing. */
const MARKER = 'Made-up marker sentence: the heron counted eleven grey stones before noon.'
const MODELS = { 'claude-code': 'claude-opus-5-5', codex: 'openai/gpt-6.1-sol', opencode: 'opencode-go/deepseek-v4.1-flash' } as const
type Runtime = keyof typeof MODELS

// Every request is answered from synthetic files. An unexpected address or door throws instead of reaching a server.
const office = String.raw`
import { readFileSync, writeFileSync, existsSync, appendFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
const root = process.env.BRIEF_FIXTURE
${NAME_THE_PROCESS_THAT_LOADS_THIS}
// A run file is published whole, so a reader in another process never sees half of it.
const writeWhole = (file, text) => {
  const temporary = file + '.' + Math.random().toString(16).slice(2) + '.writing'
  writeFileSync(temporary, text, { flag: 'wx' })
  renameSync(temporary, file)
}
globalThis.fetch = async (address, init = {}) => {
  const url = new URL(address)
  if (url.origin !== 'http://synthetic.invalid') throw new Error('test refused network: ' + url.origin)
  const path = url.pathname, method = init.method ?? 'GET'
  if (path.startsWith('/api/office/run-models/for/')) return new Response('{}', { status: 503, headers: { 'x-mole-office-stand-in': 'synthetic' } })
  const body = init.body ? JSON.parse(init.body) : {}
  appendFileSync(join(root, 'requests'), JSON.stringify({ path, method, body }) + '\n')
  const answer = (value, status = 200) => new Response(JSON.stringify(value), { status })
  if (method === 'GET' && path.startsWith('/api/checks/')) return answer(${JSON.stringify(LEGACY_ROUND_CHAPTERS)})
  if (method === 'POST' && path.startsWith('/api/agents/') && path.endsWith('/hand-run')) return answer({ cut: null })
  if (path === '/api/participants') return answer({ agents: ['synthetic-claude', 'synthetic-codex', 'synthetic-opencode'].map(handle => ({ id: handle, handle, record: handle, name: handle, retired: false })) })
  if (path === '/api/kinds/session') return answer({ kind: { fields: [{ key: 'adaptedTool' }, { key: 'effort' }] } })
  if (path.startsWith('/api/participants/agent/')) return answer({ participant: { retired: false } })
  if (path === '/api/resources' && method === 'GET') return answer({ resources: [], rows: [] })
  if (path === '/api/resources' && method === 'POST') return answer({ resource: { id: 'synthetic-process-' + process.pid, key: String(body.pidInContainer), pgid: body.pidInContainer } }, 201)
  if (path.startsWith('/api/resources/') && path.endsWith('/release')) return answer({ released: true })
  if (path === '/api/toolset/uses') return answer({ written: true }, 201)
  if (path === '/api/records' && method === 'GET') return answer({ records: [] })
  if (path === '/api/records' && method === 'POST') {
    const id = (body.kind === 'message' ? 'synthetic-message-' : 'synthetic-run-') + process.pid
    const record = { ...body, id }
    writeWhole(join(root, id + '.json'), JSON.stringify(record))
    return answer({ record }, 201)
  }
  const id = path.slice('/api/records/'.length)
  const file = join(root, id + '.json')
  if (path.startsWith('/api/records/') && existsSync(file)) {
    const record = JSON.parse(readFileSync(file, 'utf8'))
    if (method === 'PATCH') { record.data = { ...record.data, ...body.dataPatch }; writeWhole(file, JSON.stringify(record)) }
    return answer({ record })
  }
  throw new Error('No synthetic reply for ' + method + ' ' + path)
}
`

const docker = String.raw`#!/usr/bin/env node
const fs = process.getBuiltinModule('node:fs'), path = process.getBuiltinModule('node:path'), cp = process.getBuiltinModule('node:child_process')
const args = process.argv.slice(2), root = process.env.BRIEF_FIXTURE
if (args[0] === 'inspect') {
  const instance = JSON.parse(fs.readFileSync(path.join(root, 'sandboxes/synthetic/instance.json')))
  console.log(JSON.stringify([{ State: { Running: true }, Config: { Env: [] }, Mounts: [], HostConfig: {}, ...instance.container }]))
} else if (args[0] === 'exec') {
  const env = { ...process.env }
  delete env.MOLE_AGENT_KEY // Docker does not inherit the host starter's key.
  let i = 1, cwd = root
  while (args[i].startsWith('-')) {
    const flag = args[i++], value = args[i++]
    if (flag === '-e') { const at = value.indexOf('='); env[value.slice(0, at)] = value.slice(at + 1) }
    else if (flag === '--env-file') {
      const lines = fs.readFileSync(value, 'utf8').trim().split('\n')
      for (const line of lines) { const at = line.indexOf('='); env[line.slice(0, at)] = line.slice(at + 1) }
    }
    else if (flag === '-w') cwd = value
    else throw new Error('Unknown synthetic docker flag ' + flag)
  }
  i++
  const containerTmp = path.join(root, 'tmp'); fs.mkdirSync(containerTmp, { recursive: true })
  if (!env.TMPDIR) env.TMPDIR = containerTmp
  const loader = path.join(root, 'container-tmp.mjs'); fs.writeFileSync(loader, ${JSON.stringify(CONTAINER_TMP_LOADER)})
  env.NODE_OPTIONS = [env.NODE_OPTIONS, '--import=' + process.getBuiltinModule('node:url').pathToFileURL(loader).href].filter(Boolean).join(' ')
  const child = cp.spawn(args[i], args.slice(i + 1), { cwd, env, stdio: 'inherit' })
  child.on('close', code => process.exit(code ?? 1))
} else throw new Error('Unknown synthetic docker command ' + args[0])
`

/**
 * A MADE-UP claude, codex or opencode. It runs no model. It records the words it was given and its standard input in
 * seen-<run>.json. The helper gives a command its brief as a file on its standard input, so anything else there (the
 * helper's own exhausted pipe) is recorded as no standard input at all, and is never waited on. codex and opencode
 * print the thread and the session a round continues.
 */
const aProgram = (program: string) => `#!${process.execPath}
const fs = process.getBuiltinModule('node:fs'), path = process.getBuiltinModule('node:path')
const file = path.join(process.env.BRIEF_FIXTURE, 'seen-' + process.env.MOLE_OFFICE_SESSION + '.json')
const stdin = fs.fstatSync(0).isFile() ? fs.readFileSync(0, 'utf8') : null
fs.writeFileSync(file + '.part', JSON.stringify({ argv: process.argv.slice(2), stdin }))
fs.renameSync(file + '.part', file)
${program === 'codex' ? `console.log(JSON.stringify({ type: 'thread.started', thread_id: '${thread}' }))` : ''}
${program === 'opencode' ? `console.log(JSON.stringify({ type: 'step_start', sessionID: '${session}' })); console.log(JSON.stringify({ type: 'step_finish', sessionID: '${session}', part: { tokens: { input: 1, output: 2 }, cost: 0 } }))` : ''}
`

/**
 * A HELPER FROM BEFORE --stdin, as an older sandbox clone holds it. It takes the permissions contract and files nothing
 * itself. It never runs the command: it notes that it was asked to start one, and answers a start line.
 */
const A_HELPER_FROM_BEFORE_STDIN = String.raw`
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
export const PERMISSIONS_CONTRACT = 2
const args = process.argv.slice(2), flag = name => args[args.indexOf('--' + name) + 1]
appendFileSync(join(process.env.BRIEF_FIXTURE, 'old-helper-calls'), JSON.stringify(args) + '\n')
const run = flag('filed'), agent = flag('agent'), cwd = flag('worktree'), logs = join(process.env.SANDBOX_DIR, 'logs', String(run))
console.log(JSON.stringify({ instance: 'synthetic', run, agent, owner: run, runtime: 'codex', cwd, command: ['codex'], out: join(logs, 'out'), details: join(logs, 'launch.txt'), hostPid: process.pid, hostPgid: process.pid, processRow: 'synthetic-old-row', startWords: 'Synthetic helper from before --stdin' }))
`

beforeAll(() => {
  mkdirSync(join(repo, '.logs'), { recursive: true })
  root = mkdtempSync(join(repo, '.logs/brief-by-path-fixture-'))
  instance = join(root, 'sandboxes', 'synthetic')
  for (const dir of ['repo', 'home/.codex', 'out', 'briefs']) mkdirSync(join(instance, dir), { recursive: true })
  const checkout = join(instance, 'repo')
  git(checkout, 'init', '-q', '-b', 'main')
  git(checkout, 'config', 'user.name', 'Synthetic test')
  git(checkout, 'config', 'user.email', aTestAddress('fixture'))
  git(checkout, 'config', 'commit.gpgsign', 'false')
  for (const dir of ['tools', 'for-agents']) symlinkSync(join(repo, dir), join(checkout, dir))
  linkSourceWithLocalRoundRules(repo, checkout)
  writeRoundStartRules(instance, checkout)
  git(checkout, 'add', '.')
  git(checkout, 'commit', '-qm', 'Synthetic checkout')
  git(checkout, 'remote', 'add', 'origin', checkout)
  const template = join(root, 'template')
  mkdirSync(template)
  writeFileSync(join(template, 'devcontainer.json'), '{}')
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify({ template: 'synthetic', secrets: { hostFile: join(root, 'secrets'), names: [{ name: 'CLAUDE_CODE_OAUTH_TOKEN', readBy: ['claude'] }] } }))
  writeFileSync(join(root, 'secrets'), 'CLAUDE_CODE_OAUTH_TOKEN=synthetic-token\n', { mode: 0o600 })
  // THE MADE-UP LOGIN AND CONVERSATIONS, in this fixture's own sandbox home: a Codex login file a start looks for, the
  // thread's rollout a Codex round resumes, named after the thread as Codex names it, and an OpenCode database with the
  // session an OpenCode round continues. Each is synthetic and says so.
  writeFileSync(join(instance, 'home/.codex/auth.json'), '{}')
  const day = join(instance, 'home/.codex/sessions/2026/10/17')
  mkdirSync(day, { recursive: true })
  writeFileSync(join(day, `rollout-2026-10-17T00-00-00-${thread}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { id: thread, synthetic: true } }) + '\n')
  mkdirSync(join(instance, 'home/.local/share/opencode'), { recursive: true })
  execFileSync(process.execPath, ['--no-warnings', '-e', String.raw`
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[1])
db.exec('CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT NOT NULL)')
db.prepare('INSERT INTO session (id, title) VALUES (?, ?)').run(process.argv[2], 'synthetic session of this test')
db.close()
`, join(instance, 'home/.local/share/opencode/opencode.db'), session])
  // Both copies of the facts, as up writes them: the launcher reads the host's, the helper the folder's.
  writeInstance(instance, { instance: 'synthetic', template: 'synthetic', templateDir: template, workspace: 'default', from: checkout, ref: 'main', containerRow: 'synthetic-container', container: { name: 'synthetic-container' } })
  mkdirSync(join(root, 'bin'))
  writeFileSync(join(root, 'office.mjs'), office)
  writeFileSync(join(root, 'bin/docker'), docker, { mode: 0o755 })
  for (const program of ['claude', 'codex', 'opencode']) writeFileSync(join(root, 'bin', program), aProgram(program), { mode: 0o755 })
  env = withAPrivateTmpToSweep({ ...withoutInheritedEffort(), HOME: join(instance, 'home'), PATH: join(root, 'bin') + ':' + process.env['PATH'], BRIEF_FIXTURE: root, NODE_OPTIONS: '--import=' + join(root, 'office.mjs'), MOLE_OFFICE_AGENT: 'synthetic-starter', MOLE_OFFICE_SESSION: 'synthetic-starter-run', MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'), MOLE_OFFICE_API: 'http://synthetic.invalid', MOLE_OFFICE_WORKSPACE: 'default' }, root)
  delete env['MOLE_AGENT_KEY']
  delete env['CLAUDE_CODE_EFFORT_LEVEL']
  delete env['OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX']
  delete env[THE_OPENCODE_DATABASE_VARIABLE]
  env['CLAUDE_CODE_OAUTH_TOKEN'] = 'synthetic-token'
})

// THE FOLDER GOES ONLY AFTER EVERY PROCESS THAT LOADED THE FIXTURE HAS ENDED, as in the fixture this is copied from.
afterAll(async () => {
  for (const group of groups) {
    try { process.kill(-group, 'SIGTERM') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  await removeTheFolderOnceItsProcessesHaveEnded(root)
})

async function launch(args: string[]) {
  const child = spawn(process.execPath, ['tools/sandbox.mjs', ...args, '--sandboxes', join(root, 'sandboxes'), '--api', 'http://synthetic.invalid', '--workspace', 'default'], { env })
  let out = '', err = ''
  child.stdout.on('data', chunk => { out += chunk })
  child.stderr.on('data', chunk => { err += chunk })
  const code = await new Promise<number | null>(done => child.on('close', done))
  return { code, out, err }
}

async function until(check: () => boolean, what = 'the synthetic program to finish') {
  const end = Date.now() + 10_000
  while (Date.now() < end) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  throw new Error('Waited ten seconds for ' + what)
}

/** A start through the launcher, and what its made-up program recorded once the helper has finished with it. */
async function started(args: string[]) {
  const ran = await launch(args)
  expect(ran.code, ran.err).toBe(0)
  const start = JSON.parse(ran.out.trim())
  groups.add(start.hostPgid)
  const file = join(root, 'seen-' + start.run + '.json')
  await until(() => existsSync(file) && existsSync(join(instance, 'logs', start.run, 'finish.log')) && readFileSync(join(instance, 'logs', start.run, 'finish.log'), 'utf8').includes("run's scratch folder")).catch(error => {
    const diagnostics = ['finish.log', 'helper.log', 'out'].map(name => { const path = join(instance, 'logs', start.run, name); return name + ': ' + (existsSync(path) ? readFileSync(path, 'utf8').slice(-2000) : '(missing)') }).join('\n')
    throw new Error(String(error) + '\n' + diagnostics)
  })
  if (args[0] === 'round') expectRoundRulesSaved(JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8')).data)
  return { start, seen: JSON.parse(readFileSync(file, 'utf8')) as { argv: string[]; stdin: string | null } }
}

const worker = (runtime: Runtime) => ['worker', 'synthetic', '--agent', 'synthetic-' + (runtime === 'claude-code' ? 'claude' : runtime), '--runtime', runtime, '--model', MODELS[runtime], '--brief', join(root, 'brief'), '--json']

/** A brief that carries the marker, under a heading of its own so each start's brief differs. */
const aBrief = (heading: string) => writeFileSync(join(root, 'brief'), `# ${heading}\n\n${MARKER}\n`)

/** The marker is in no word of the command, and the command's standard input holds it. */
function expectTheBriefOnStandardInputOnly(seen: { argv: string[]; stdin: string | null }) {
  expect(seen.argv.filter(word => word.includes(MARKER)), 'a word of the command holds the brief').toEqual([])
  expect(seen.stdin, 'the command was given no brief on its standard input').toContain(MARKER)
}

describe('a worker of each runtime gets its brief on its standard input, and no word of its command holds it', () => {
  it.each(['claude-code', 'codex', 'opencode'] as const)('a %s worker', async runtime => {
    aBrief(`A made-up ${runtime} worker brief`)
    const { seen } = await started(worker(runtime))
    expectTheBriefOnStandardInputOnly(seen)
    if (runtime === 'codex') expect(seen.argv.at(-1), 'Codex was not told to read its prompt from standard input').toBe('-')
  }, 60_000)

  it('a Codex round that resumes its thread', async () => {
    aBrief('A made-up Codex round brief')
    const { seen } = await started(['round', ...worker('codex').slice(1)])
    expect(seen.argv.slice(seen.argv.indexOf('resume'), seen.argv.indexOf('resume') + 2)).toEqual(['resume', thread])
    expectTheBriefOnStandardInputOnly(seen)
    expect(seen.argv.at(-1), 'Codex was not told to read its prompt from standard input').toBe('-')
  }, 60_000)

  it('an OpenCode round that continues its session', async () => {
    aBrief('A made-up OpenCode first run before a round')
    const first = await started(worker('opencode'))
    aBrief('A made-up OpenCode round brief')
    const { seen } = await started(['round', ...worker('opencode').slice(1), '--continues', first.start.run])
    expect(seen.argv.slice(seen.argv.indexOf('--session'), seen.argv.indexOf('--session') + 2)).toEqual(['--session', session])
    expectTheBriefOnStandardInputOnly(seen)
  }, 60_000)
})

// A HELPER TOO OLD FOR --stdin CANNOT GIVE CODEX ITS BRIEF on standard input, and there is no other way the launcher
// gives it. So the start is refused before the run is filed: nothing is written to the office and the helper never runs.
it('a helper too old for --stdin refuses a Codex worker, and nothing is filed', async () => {
  const tools = join(instance, 'repo/tools')
  aBrief('A made-up Codex brief for a helper from before --stdin')
  rmSync(tools); cpSync(join(repo, 'tools'), tools, { recursive: true })
  writeFileSync(join(tools, 'sandbox-start.mjs'), A_HELPER_FROM_BEFORE_STDIN)
  try {
    const before = readFileSync(join(root, 'requests'), 'utf8')
    const ran = await launch(worker('codex'))
    expect(ran.code, ran.out + ran.err).not.toBe(0)
    expect(ran.out).toBe('')
    const writes = readFileSync(join(root, 'requests'), 'utf8').slice(before.length).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(call => call.method !== 'GET')
    expect(writes).toEqual([])
    expect(existsSync(join(root, 'old-helper-calls')), 'the helper from before --stdin was run').toBe(false)
  } finally {
    rmSync(tools, { recursive: true }); symlinkSync(join(repo, 'tools'), tools)
  }
}, 60_000)
