// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FINISHED RUN'S SCRATCH FOLDER THAT HOLDS A GIT WORKTREE WITH WORK ONLY THAT WORKTREE HOLDS IS KEPT AT THE RUN'S END.
 *
 * Step 7 of tools/sandbox-start.mjs removes a finished run's scratch folder, the command's TMPDIR, once the command has
 * ended. A git worktree put inside that folder may hold the only copy of some work, such as a HEAD at a commit that no
 * ref of its repository contains. Such a folder is kept, and the run's finish.log line names the worktree and the
 * commit. A worktree on a branch with nothing uncommitted does not keep the folder.
 *
 * THE CASES, numbered as in tests/the-scratch-sweep-keeps-a-folder-holding-an-unkept-worktree.test.ts
 *   1. A worktree detached at a commit no ref holds: the folder stays, and its line names the worktree and the commit.
 *   4. A worktree on a branch with nothing uncommitted: the folder is removed.
 *
 * WHAT IS REAL. The helper, started as its own process with --run, as a starter inside the sandbox starts a run, and
 * the background copy of itself that waits for the command to end and then runs step 7. The scratch folder it makes.
 * Git, and the repository the test makes with git init.
 *
 * WHAT IS MADE UP. The office: a stand-in that holds one run, answers its reads with the record as it is now and applies
 * each write's dataPatch. The test marks the run finished while the command waits, as an agent that finishes its own
 * run does. The process ledger's answers, because the helper registers its process in a container this test does not
 * have. The Codex program, which waits for the test's go and then exits 0. Every key. Every commit is under a made-up
 * name and address, the test's own git calls run with no GIT_* variable from the environment, and the commit a line
 * names is read with git rev-parse.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { readHostInstance, theFactsAStartIsGiven, THE_FACTS_VARIABLE, writeInstance } from '../tools/sandbox-common.mjs'
import { aTestAddress } from './the-test-commit-address.mjs'
import { withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { NAME_THE_PROCESS_THAT_LOADS_THIS, removeTheFolderOnceItsProcessesHaveEnded } from './the-processes-a-fixture-started.ts'

/** A made-up value, which only the stand-in office is sent. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_RUN_KEY = 'd4'.repeat(32)
const WORKSPACE = 'default'
const STARTER = 'worktree-keep-starter'
const WORKER = 'worktree-keep-codex-worker'

let root = ''
let instance = ''
let repository = ''

/** This process's environment with no GIT_* variable, for the test's own git calls. */
const withNoGitVariable = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
/** Git in `cwd`, committing as a made-up committer; answers what it printed, trimmed. */
const git = (cwd: string, ...args: string[]): string => execFileSync('git', [
  '-c', 'user.name=A made-up committer', '-c', 'user.email=made-up-committer@example.invalid', '-c', 'commit.gpgsign=false', ...args,
], { cwd, env: withNoGitVariable(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** A repository at `path` holding one commit on main. */
function aRepository(path: string): void {
  mkdirSync(path, { recursive: true })
  git(path, 'init', '-q', '-b', 'main')
  writeFileSync(join(path, 'notes.txt'), 'A made-up file\n')
  git(path, 'add', 'notes.txt')
  git(path, 'commit', '-q', '-m', 'A made-up first commit')
}

/** The ledger is made up; every other call goes to the stand-in office. */
const fixture = String.raw`
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
const root = process.env.WORKTREE_KEEP_FIXTURE
${NAME_THE_PROCESS_THAT_LOADS_THIS}
const original = globalThis.fetch
globalThis.fetch = async (address, init = {}) => {
  const url = new URL(address)
  if (url.origin !== 'http://synthetic.invalid') throw new Error('The made-up ledger refused a call outside the stand-in office')
  const path = url.pathname, method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : {}
  const answer = (value, status = 200) => new Response(JSON.stringify(value), { status })
  if (path === '/api/resources') return method === 'GET' ? answer({ resources: [], rows: [] }) : answer({ resource: { id: 'made-up-process-' + process.pid, key: String(body.pidInContainer), pgid: body.pidInContainer } }, 201)
  if (path.startsWith('/api/resources/') && path.endsWith('/release')) return answer({ released: true })
  return original(process.env.WORKTREE_KEEP_OFFICE + path + url.search, init)
}
`

/** A Codex program that runs no model: it waits for the file `go`, then exits 0, and gives up with 3 after a minute. */
const aProgramThatWaitsFor = (go: string): string => `#!${process.execPath}
const { existsSync } = require('node:fs')
const end = Date.now() + 60_000
const wait = () => existsSync(${JSON.stringify(go)}) ? process.exit(0) : Date.now() > end ? process.exit(3) : setTimeout(wait, 50)
wait()
`

/**
 * A STAND-IN OFFICE THAT HOLDS ONE RUN. It answers the run's reads with the record as it is now, applies each write's
 * dataPatch to it (null takes a key off), and answers the effort the run's agent is asked with none. Any other request
 * is answered 404.
 */
async function aStandInOffice(id: string): Promise<{ address: string; data: Record<string, unknown>; close: () => Promise<void> }> {
  const title = 'A run whose scratch folder holds a worktree'
  const held: Record<string, unknown> = { state: 'running', runtime: 'codex', servingAgent: WORKER }
  const server = createServer(async (req, reply) => {
    let text = ''
    for await (const chunk of req) text += String(chunk)
    const answer = (value: unknown, status = 200): void => { reply.statusCode = status; reply.setHeader('content-type', 'application/json'); reply.end(JSON.stringify(value)) }
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (path === `/api/records/${id}` && req.method === 'GET') return answer({ record: { id, kind: 'session', title, data: held } })
    if (path === `/api/records/${id}` && req.method === 'PATCH') {
      for (const [key, value] of Object.entries((JSON.parse(text) as { dataPatch?: Record<string, unknown> }).dataPatch ?? {})) {
        if (value === null) delete held[key]
        else held[key] = value
      }
      return answer({ record: { id, kind: 'session', title, data: held } })
    }
    if (path.startsWith('/api/office/run-models/for/') && req.method === 'GET') return answer({ model: null, effort: null, effortFrom: 'none' })
    return answer({ error: 'The stand-in office has no answer for this request.' }, 404)
  })
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  const port = (server.address() as AddressInfo).port
  expect(thePortsATestKeepsOff()).not.toContain(port)
  return { address: `http://127.0.0.1:${String(port)}`, data: held, close: () => new Promise<void>((done) => server.close(() => done())) }
}

/**
 * THE HELPER, started without --verbose, with --run by the starter inside the sandbox, asking the stand-in office at
 * `office`. `own` is the run's own folder here: its program, its go file, and the private temporary folder the helper
 * makes the run's scratch folder in and sweeps. Answers the helper's exit code, what it printed, and its start line.
 */
async function theHelperStarts(run: string, office: string, own: string): Promise<{ code: number | null; printed: string; start: Record<string, unknown> | null }> {
  const env = withAPrivateTmpToSweep({
    ...withoutInheritedEffort(), HOME: join(instance, 'home'), PATH: `${join(own, 'bin')}:${process.env['PATH'] ?? ''}`, TMPDIR: join(own, 'tmp'),
    WORKTREE_KEEP_FIXTURE: root, WORKTREE_KEEP_OFFICE: office, NODE_OPTIONS: `--import=${join(root, 'fetch.mjs')}`,
    MOLE_OFFICE_AGENT: STARTER, MOLE_OFFICE_SESSION: 'made-up-starter-session', MOLE_OFFICE_API: 'http://synthetic.invalid', MOLE_OFFICE_WORKSPACE: WORKSPACE,
    MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'), MOLE_AGENT_KEY: A_MADE_UP_RUN_KEY,
    [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(readHostInstance(instance)),
  }, own)
  const child = spawn(process.execPath, ['tools/sandbox-start.mjs', '--instance', instance, '--run', run, '--', join(own, 'bin', 'codex'), 'exec', '--json', '--', 'A made-up prompt'], { env })
  let printed = ''
  child.stdout.on('data', (chunk) => { printed += String(chunk) })
  child.stderr.on('data', (chunk) => { printed += String(chunk) })
  const code = await new Promise<number | null>((done) => child.on('close', done))
  const line = printed.split('\n').find((text) => text.startsWith('{'))
  return { code, printed, start: line === undefined ? null : JSON.parse(line) as Record<string, unknown> }
}

/**
 * ONE RUN, TO THE END OF STEP 7. The helper starts the run's command, which waits. `place` puts a worktree in the run's
 * scratch folder and answers what the case will look for. The run is then marked finished and its command let go.
 * Answers the scratch folder, what `place` answered, and the one line finish.log holds about the folder once step 7 has
 * written it.
 */
async function aFinishedRun<T>(run: string, place: (scratch: string) => T): Promise<{ scratch: string; placed: T; line: string }> {
  const own = join(root, run)
  mkdirSync(join(own, 'bin'), { recursive: true })
  const go = join(own, 'go')
  writeFileSync(join(own, 'bin', 'codex'), aProgramThatWaitsFor(go), { mode: 0o755 })
  const office = await aStandInOffice(run)
  try {
    const started = await theHelperStarts(run, office.address, own)
    expect(started.code, started.printed).toBe(0)
    const scratch = started.start?.['scratch']
    if (typeof scratch !== 'string') throw new Error(`The start line names no scratch folder:\n${started.printed}`)
    const placed = place(scratch)
    office.data['state'] = 'finished'
    writeFileSync(go, '')
    const log = join(instance, 'logs', run, 'finish.log')
    const lines = (): string[] => (existsSync(log) ? readFileSync(log, 'utf8').split('\n') : []).filter((line) => line.includes(`scratch folder ${scratch} `))
    await expect.poll(() => lines().length, { timeout: 40_000 }).toBeGreaterThan(0)
    expect(lines()).toHaveLength(1)
    return { scratch, placed, line: lines()[0] ?? '' }
  } finally { await office.close() }
}

beforeAll(() => {
  // THE SANDBOX: its facts, its clone with this checkout's own tools, and a home that holds a Codex login.
  root = mkdtempSync(join(tmpdir(), 'worktree-keep-start-'))
  instance = join(root, 'sandbox')
  for (const dir of ['repo', 'home/.codex', 'out', 'dsh/home']) mkdirSync(join(instance, dir), { recursive: true })
  const checkout = join(instance, 'repo')
  aRepository(checkout)
  for (const dir of ['tools', 'src', 'for-agents']) symlinkSync(join(process.cwd(), dir), join(checkout, dir))
  const template = join(root, 'template')
  mkdirSync(template)
  writeFileSync(join(template, 'devcontainer.json'), '{}')
  writeFileSync(join(template, 'sandbox.json'), '{}')
  writeInstance(instance, { instance: 'worktree-keep', template: 'worktree-keep', templateDir: template, workspace: WORKSPACE, from: checkout, ref: 'main', containerRow: 'made-up-container', container: { name: 'worktree-keep' } })
  writeFileSync(join(instance, 'home/.codex/auth.json'), '{}')
  writeFileSync(join(root, 'fetch.mjs'), fixture)
  // THE REPOSITORY THE CASES' WORKTREES BELONG TO.
  repository = join(root, 'repository')
  aRepository(repository)
})

afterAll(async () => {
  if (root !== '') await removeTheFolderOnceItsProcessesHaveEnded(root)
})

it('1: keeps the folder of a finished run while a worktree in it is detached at a commit no ref holds, naming both', async () => {
  const ran = await aFinishedRun('keep_wt_run1', (scratch) => {
    const worktree = join(scratch, 'worktree')
    git(repository, 'worktree', 'add', '-q', '--detach', worktree, 'main')
    git(worktree, 'commit', '-q', '--allow-empty', '-m', 'A made-up commit that no ref holds')
    return { worktree: realpathSync(worktree), commit: git(worktree, 'rev-parse', '--verify', 'HEAD') }
  })
  expect(existsSync(ran.scratch), ran.line).toBe(true)
  expect(ran.line).toContain(ran.placed.worktree)
  expect(ran.line).toContain(ran.placed.commit)
}, 90_000)

it('4: removes the folder of a finished run when its worktree is on a branch with nothing uncommitted', async () => {
  const ran = await aFinishedRun('keep_wt_run4', (scratch) => {
    git(repository, 'worktree', 'add', '-q', '-b', 'made-up-clean', join(scratch, 'worktree'), 'main')
  })
  expect(existsSync(ran.scratch), ran.line).toBe(false)
}, 90_000)
