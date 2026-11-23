// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STEP THAT STARTS A WORKER FILES ITS RUN, AND THE OFFICE'S CHECK CAN BE ASKED FOR IT.
 *
 * Problem `LSsiTg0XZfKq`, option A of a decision: the step that starts a worker writes servingAgent, the workspace and
 * the worktree's HEAD into the session record, so the check can run.
 * Until now a supervisor starting a dsh or opencode worker filed the session record by hand, and a
 * by-hand record missing one of the keys the check reads made GET /api/checks/<run> answer
 * "No check was asked for" for good — 1,386 of 1,475 runs that said finished were never released
 * for exactly that (the steward's report jDwkhne4tDWR, finding 2).
 *
 * WHAT IS BEING HELD, end to end over real HTTP:
 *
 *   - The office is started for the test, an agent is registered through the office's own
 *     registration door, and tools/register-a-run.mjs — run as a child process, as a caller would
 *     run it — files the session record against that server. The record id is printed on its own
 *     line, and the exact keys the check reads are on it.
 *   - The run is patched to state finished. A worker's seal may leave its round note and ask for no
 *     check, so the person then asks for it explicitly, and GET /api/checks/<run> answers with the
 *     check asked — the office asked the inspector — and NOT "No check was asked for".
 *   - The run a supervisor still files by hand, missing cutFrom or ranAs, is not eligible, so its
 *     seal stores the office's refusal and GET /api/checks/<run> reads it — which is the tool being
 *     what makes the difference, not a softening of the check.
 *
 * THE MUTATIONS, each run after a control:
 *
 *   - Drop one key the tool writes — servingAgent, cutFrom, workingDirectory, ranAs — and the first
 *     test goes red: the office's own refusal comes back "No check was asked for".
 *   - Drop the runtime word refusal in the tool, and the unknown-runtime case goes red only for the
 *     silent-write reason; the wired cases stay green, so each tool-side refusal is held by its own case.
 *   - Drop `startedTime` from the tool's body, and the start case goes red: the run's start is then only words, which
 *     name two moments when the clocks go back (item 2n).
 *
 * THE SERVER IS REAL, because the subject is a child process talking over HTTP to the office.
 * A fastify `inject` would let the assertions pass without a single socket being opened.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiServerArguments } from './helpers.ts'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { createServer as createHttpServer, type Server } from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CHECKPOINT_RUNTIMES } from '../src/shared/worker-delivery/contract.mjs'

import { AGENT_RUNTIMES } from '../src/shared/participants.ts'
import { momentOfAnInstant } from '../src/shared/time.ts'
import { fileARun } from '../tools/file-a-run.mjs'
import Database from 'better-sqlite3'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { stopTheGroups } from './the-runtimes-a-test-office-started.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url)) // the checkout this run works in, itself a git worktree
const TOOL = 'tools/register-a-run.mjs'
/** The HEAD of REPO read with git, the same fact read from inside a test-run server is read from disk. */
function headAt(directory: string): string {
  return execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
const configureGit = (dir: string): void => {
  git(dir, 'config', 'user.email', 'a-test@example.invalid')
  git(dir, 'config', 'user.name', 'A test')
  git(dir, 'config', 'commit.gpgsign', 'false')
}
const commitIn = (dir: string, message: string): void => {
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', message)
}

/**
 * A scratch checkout shaped like a real worker's: `main` holds one commit, the work branch holds a
 * second. Everything in the run's tip is committed, which is what the office seals from, and the
 * fork point against `main` is the one commit behind it. Built under the scratch so no checkout of
 * the search is walked up to.
 */
function aWorktree(): { dir: string; tip: string } {
  const made = mkdtempSync(join(dir0, 'worktree-'))
  git(made, 'init', '-q', '-b', 'main')
  configureGit(made)
  writeFileSync(join(made, 'setup.txt'), 'before\n')
  commitIn(made, 'the base the work was cut from')
  git(made, 'switch', '-q', '-c', 'the-labour')
  writeFileSync(join(made, 'work.txt'), 'the work\n')
  commitIn(made, 'the work')
  return { dir: made, tip: headAt(made) }
}

const WORKSPACE = 'default'
const CUT_FROM = 'main'
const WORKER = 'dsh-labourer'
const STARTER = 'the-supervisor'
const INSPECTOR = 'the-appointed-inspector'

let dir0 = ''
let port = 0
let api = ''
let filerSession = ''
let worker: ChildProcess | undefined

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const chosen = probe.address()
      if (chosen === null || typeof chosen === 'string') {
        probe.close(() => fail(new Error('the probe socket reported no port')))
        return
      }
      const taken = chosen.port
      probe.close(() => ok(taken))
    })
  })
}

async function startTheOffice(): Promise<void> {
  port = await freePort()
  api = `http://127.0.0.1:${String(port)}`
  worker = spawn(join(REPO, 'node_modules/.bin/tsx'), apiServerArguments(), {
    cwd: REPO,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      LOG_LEVEL: 'warn',
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_DB: join(dir0, 'runs.db'),
      MOLE_OFFICE_WORKSPACE: WORKSPACE,
      MOLE_OFFICE_MESSAGE_WORKER: 'off',
    },
  })
  for (let tries = 0; tries < 180; tries += 1) {
    try {
      const answered = await fetch(`${api}/api/health`, { headers: { 'x-mole-office-workspace': WORKSPACE } })
      if (answered.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`the server never answered ${api}/api/health`)
}

/**
 * STOP THE OFFICE'S GROUP AND WAIT UNTIL IT HAS ENDED. An office still shutting down writes its database files in the
 * test's folder, so a removal started before it ended failed with ENOTEMPTY in the whole suite.
 */
async function stopTheOffice(): Promise<void> {
  if (worker?.pid === undefined || worker.pid === null) return
  await stopTheGroups(new Set([worker.pid]))
}

async function ask(method: string, path: string, actor: { type: string; id: string; session?: string; key?: string }, body?: unknown): Promise<Response> {
  return fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': actor.type,
      'x-mole-office-actor-id': actor.id,
      ...(actor.session === undefined ? {} : { 'x-mole-office-session': actor.session }),
      ...(actor.key === undefined ? {} : { 'x-mole-office-key': actor.key }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

/** How many session records the test office holds, read through the door. */
async function sessionsFiled(): Promise<number> {
  const read = await ask('GET', '/api/records?kind=session', { type: 'agent', id: STARTER })
  const body = await read.text()
  expect(read.status, body).toBe(200)
  return (JSON.parse(body) as { records: unknown[] }).records.length
}

/** Run the tool the way a caller runs it, and take what it printed. */
function runTheTool(arguments_: string[]): { status: number; out: string; err: string } {
  const ran = spawnSync('node', [TOOL, ...arguments_], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_WORKSPACE: WORKSPACE },
  })
  return { status: ran.status ?? 1, out: ran.stdout ?? '', err: ran.stderr ?? '' }
}

/**
 * EACH AGENT'S OWN KEY, the one the office answered when the agent was registered. A run's own agent ends the run only
 * with a key, even while the key window is open, so the worker finishes its runs with it.
 */
const keys = new Map<string, string>()

/** Register an agent through the door, keep its key, and answer the registry id the door gave it. The id is not the handle. */
async function register(handle: string, name: string, role: string | undefined, by: { type: string; id: string }, workArea?: string[]): Promise<string> {
  const opened = await ask('POST', '/api/agents/started', by, {
    handle,
    name,
    ...(role === undefined ? {} : { role }),
    ...(workArea === undefined ? {} : { workArea }),
  })
  const said = (await opened.json().catch(() => undefined)) as { agent?: { id?: unknown }; whatToGiveIt?: { key?: unknown } } | undefined
  expect(opened.status, JSON.stringify(said)).toBe(201)
  expect(typeof said?.agent?.id, JSON.stringify(said)).toBe('string')
  expect(typeof said?.whatToGiveIt?.key, `the office answered ${handle} no key`).toBe('string')
  keys.set(handle, said!.whatToGiveIt!.key as string)
  return String(said!.agent!.id)
}

beforeAll(async () => {
  // OUTSIDE THE CHECKOUT: an office will not open a database inside a git worktree (problem nd7jOk5LCU4s).
  dir0 = aTestDatabaseFolder('register-a-run')
  await startTheOffice()
  // THE PERSON REGISTERS THE SUPERVISOR AND APPOINTS THE INSPECTOR; the supervisor registers the
  // worker. These are the same doors the registration tool uses.
  const asPerson = { type: 'human', id: THE_TEST_OFFICES_OWNER.id }
  await register(STARTER, 'The Supervisor', 'supervisor', asPerson)
  await register(INSPECTOR, 'The Inspector', 'inspector', asPerson)
  await register(WORKER, 'The Labourer', 'worker', { type: 'agent', id: STARTER }, ['src'])
  const mine = await ask('POST', '/api/records', { type: 'agent', id: STARTER, session: undefined }, {
    kind: 'session',
    title: 'the supervisor run',
    data: { state: 'running' },
  })
  const mineBody = await mine.json() as { record: { id: string } }
  expect(mine.status, JSON.stringify(mineBody)).toBeLessThan(300)
  filerSession = mineBody.record.id
}, 200_000)

// THE BOUND IS LONGER THAN stopTheGroups' FIFTEEN SECONDS BEFORE IT KILLS THE GROUP, so the folder is removed only after
// the office has ended.
afterAll(async () => {
  await stopTheOffice()
  rmSync(dir0, { recursive: true, force: true })
}, 60_000)

describe('the start step files a run the check can be asked about', () => {
  it('keeps a previously recorded cut when its name has moved and refuses an invalid recorded cut', async () => {
    const lab = mkdtempSync(join(dir0, 'recorded-cut-'))
    const runGit = (...args: string[]) => execFileSync('git', ['-C', lab, ...args], { encoding: 'utf8' }).trim()
    runGit('init', '-q', '-b', 'main')
    runGit('config', 'user.email', 'a-test@example.invalid')
    runGit('config', 'user.name', 'A test')
    writeFileSync(join(lab, 'one.txt'), 'one\n')
    runGit('add', 'one.txt')
    runGit('commit', '-qm', 'First')
    const previous = runGit('rev-parse', 'HEAD')
    writeFileSync(join(lab, 'one.txt'), 'two\n')
    runGit('commit', '-qam', 'Second')
    const args = ['--handle', WORKER, '--worktree', lab, '--cut-from', 'main', '--runtime', 'dsh', '--model', 'any', '--as', STARTER, '--session', filerSession, '--workspace', WORKSPACE, '--title', 'A recorded cut']
    const run = (recorded: unknown, given = args) => spawnSync('node', [TOOL, ...given, '--cut-from-commit', JSON.stringify(recorded)], {
      cwd: REPO, encoding: 'utf8', env: { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_WORKSPACE: WORKSPACE },
    })
    const recorded = { named: 'main', commit: previous }
    const filed = run(recorded)
    expect(filed.status, filed.stderr).toBe(0)
    const data = await theFiledRun(filed.stdout.trim().split('\n')[0]!)
    expect(data.cutFrom).toBe('main')
    expect(data.cutFromCommit).toEqual(recorded)
    const count = await sessionsFiled()
    for (const invalid of [{ named: 'another', commit: previous }, { named: 'main', commit: 'missing' }, { named: 'main', commit: 'f'.repeat(40) }]) {
      expect(run(invalid).status).not.toBe(0)
    }
    const unsafe = args.map((part, index) => args[index - 1] === '--cut-from' ? '-unsafe' : part)
    expect(run({ named: '-unsafe', commit: previous }, unsafe).status).not.toBe(0)
    expect(await sessionsFiled()).toBe(count)
  })

  // MUTATIONS: --parent ignored → both parent cases red; header written from --parent instead
  // of --session → both attribution assertions red. Default parent removed → the default case red.
  it('files --parent apart from the filer session and attributes the create to the filer session', async () => {
    const parent = await ask('POST', '/api/records', { type: 'agent', id: STARTER }, {
      kind: 'session', title: 'the supervisor run for a separate filer', data: { state: 'running' },
    })
    expect(parent.status).toBe(201)
    const parentId = ((await parent.json()) as { record: { id: string } }).record.id
    const lab = aWorktree()
    const printed = runTheTool([
      '--handle', WORKER, '--worktree', lab.dir, '--cut-from', CUT_FROM, '--runtime', 'dsh', '--model', 'any',
      '--as', STARTER, '--session', filerSession, '--parent', parentId, '--workspace', WORKSPACE,
    ])
    expect(printed.status, printed.err).toBe(0)
    const run = printed.out.trim().split('\n')[0] ?? ''
    expect((await theFiledRun(run)).parentAttachment).toBe(parentId)
    const db = new Database(join(dir0, 'runs.db'), { readonly: true })
    try {
      expect(db.prepare("SELECT session_id FROM changes WHERE record_id = ? AND op = 'create'").get(run)).toEqual({ session_id: filerSession })
    } finally { db.close() }
  })

  // MUTATIONS: fileARun drops --parent → parent assertion red; header written from --parent
  // instead of --session → attribution assertion red.
  it.each(['claude-code', 'dsh'] as const)('fileARun passes parent through and opts in only an approved checkpoint runtime: %s', async runtime => {
    const parent = await ask('POST', '/api/records', { type: 'agent', id: STARTER }, {
      kind: 'session', title: 'the parent of the fileARun worker', data: { state: 'running' },
    })
    expect(parent.status).toBe(201)
    const parentId = ((await parent.json()) as { record: { id: string } }).record.id
    const lab = aWorktree()
    const filed = fileARun({
      api, workspace: WORKSPACE, as: STARTER, session: filerSession, parent: parentId,
      handle: WORKER, worktree: lab.dir, cutFrom: CUT_FROM, runtime, model: 'any', title: 'the fileARun worker',
      sandbox: { template: 'test-template', container: 'test-container', folder: dir0 }, keyFolder: dir0,
    })
    expect(filed.ok, filed.says).toBe(true)
    if (!filed.ok) throw new Error(filed.says)
    const data = await theFiledRun(filed.id)
    expect(data.parentAttachment).toBe(parentId)
    const { aCheckpointRun } = await import('../src/shared/worker-delivery/contract.mjs')
    expect(aCheckpointRun(data)).toBe(CHECKPOINT_RUNTIMES.includes(runtime))
    const db = new Database(join(dir0, 'runs.db'), { readonly: true })
    try {
      expect(db.prepare("SELECT session_id FROM changes WHERE record_id = ? AND op = 'create'").get(filed.id)).toEqual({ session_id: filerSession })
    } finally { db.close() }
  })

  // MUTATION: default parentAttachment no longer --session → parent assertion red.
  it('files the record, prints its id on its own line, and the office asks the check', async () => {
    // ONE CHECK that walks the whole path, because the thing being proved is the path.
    const lab = aWorktree()
    const printed = runTheTool([
      '--handle', WORKER,
      '--worktree', lab.dir,
      '--cut-from', CUT_FROM,
      '--runtime', 'dsh',
      '--model', 'deepseek/deepseek-run',
      '--as', STARTER,
      // THE SUPERVISOR'S OWN FILED RUN. A run name nobody filed was sent here until the records door began refusing a
      // parent that is no session (problem NlOyicZP_Jjt); without --parent the tool names --session as the parent.
      '--session', filerSession,
      '--workspace', WORKSPACE,
      '--title', 'the labour run',
    ])
    expect(printed.err, printed.err).toBe('')
    expect(printed.status, printed.err).toBe(0)
    const lines = printed.out.trim().split('\n')
    const run = lines[0]
    expect(run, printed.out).toMatch(/^[A-Za-z0-9_-]+$/)

    const read = await ask('GET', `/api/records/${run}`, { type: 'agent', id: STARTER })
    const readBody = await read.text()
    expect(read.status, readBody).toBe(200)
    const record = (JSON.parse(readBody) as { record: { data: Record<string, unknown> } }).record
    expect(record.data['servingAgent']).toBe(WORKER)
    const roster = await ask('GET', '/api/participants', { type: 'agent', id: STARTER })
    const rosterBody = await roster.text()
    expect(roster.status, rosterBody).toBe(200)
    const recordId = (JSON.parse(rosterBody) as { agents: { handle: string; record: string | null }[] })
      .agents.find((one) => one.handle === WORKER)?.record
    expect(recordId, rosterBody).toBeTruthy()
    expect(record.data['ranAs']).toEqual([{ workspaceId: WORKSPACE, agentId: recordId }])
    expect(record.data['workingDirectory']).toBe(lab.dir)
    expect(record.data['cutFrom']).toBe(CUT_FROM)
    expect(record.data['tip']).toBe(lab.tip)
    expect(record.data['parentAttachment']).toBe(filerSession)
    expect(record.data['state']).toBe('running')
    expect(record.data['runtime']).toBe('dsh')
    expect(record.data['parentAttachment']).toBe(filerSession)
    // THE DECLARED TOOL, the field the usage page counts, for problem uh6-H72Zik9H.
    // MUTATION: delete `adaptedTool: chosen.runtime,` from the tool's body, and this line is red.
    expect(record.data['adaptedTool'], 'the run filed by the tool does not declare its tool').toBe('dsh')
    expect(record.data['model']).toBe('deepseek/deepseek-run')

    // AND THE RUN CARRIES ITS LABEL, written by the tool that filed it. Chapter 10 rule 3 asks every
    // record for one, and this record is not the worker's: it is filed before the worker starts, and
    // a check refuses the worker for it anyway (message KsSsRY6WH1Ea of 22 September 2026).
    const forms = await (await ask('GET', `/api/records/${run}/short-forms`, { type: 'agent', id: STARTER })).json() as {
      levels: { rung: string; state: string; text: string | null }[]
    }
    const label = forms.levels.find((one) => one.rung === 'label')
    expect(label?.state, JSON.stringify(label)).toBe('current')
    expect(label?.text).toBe(`Run of ${WORKER}`)

    const finished = await ask('PATCH', `/api/records/${run}`, { type: 'agent', id: WORKER, key: keys.get(WORKER) }, { dataPatch: { state: 'finished', doing: 'the work is done' } })
    expect(finished.status, JSON.stringify(await finished.json().catch(() => undefined))).toBe(200)
    // A worker's seal may leave its round note, so the person asks for the check explicitly.
    const sealed = await (await ask('GET', `/api/checks/${run}`, { type: 'agent', id: STARTER })).json() as { theCheck: { message?: string } | null }
    if (!sealed.theCheck?.message) {
      const again = await ask('POST', `/api/checks/${run}/ask-again`, { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, {})
      expect(again.status, await again.text()).toBe(200)
    }

    const asked = await (await ask('GET', `/api/checks/${run}`, { type: 'agent', id: STARTER })).json() as {
      theCheck: { says: string; askedOf?: string }
      stands: { standing: string; says: string }
    }
    expect(asked.theCheck.says).not.toContain('No check was asked for')
    expect(asked.theCheck.askedOf).toBe(INSPECTOR)
    expect(asked.stands.standing).toBe('inspecting')
  })

  it('refuses a directory that is not a git checkout, and writes nothing', async () => {
    // A directory that has stopped being a checkout: a `.git` file git cannot read, which is what
    // `git rev-parse HEAD` answers 128 to.
    const notACheckout = join(mkdtempSync(join(dir0, 'gone-')), 'no-repo')
    mkdirSync(notACheckout, { recursive: true })
    writeFileSync(join(notACheckout, '.git'), 'not a gitdir\n')
    const refused = runTheTool([
      '--handle', WORKER,
      '--worktree', notACheckout, // a directory whose .git is not a gitdir
      '--cut-from', CUT_FROM,
      '--runtime', 'dsh',
      '--model', 'any',
      '--as', STARTER,
      '--session', 'the-run-that-started-this-one',
      '--workspace', WORKSPACE,
    ])
    expect(refused.status).not.toBe(0)
    expect(refused.err).toContain('is not a git checkout')
    expect(refused.out).toBe('')
  })

  it('refuses a handle no registry row answers to, and writes nothing', async () => {
    const refused = runTheTool([
      '--handle', 'nobody-by-this-name',
      '--worktree', aWorktree().dir,
      '--cut-from', CUT_FROM,
      '--runtime', 'dsh',
      '--model', 'any',
      '--as', STARTER,
      '--session', 'the-run-that-started-this-one',
      '--workspace', WORKSPACE,
    ])
    expect(refused.status).not.toBe(0)
    expect(refused.err).toContain('No agent in the registry answers to the handle "nobody-by-this-name"')
    expect(refused.out).toBe('')
  })

  it('refuses a runtime word the office does not know, naming the words it does, and writes nothing', async () => {
    // THE WORDS ARE AGENT_RUNTIMES ITSELF, which the tool imports; the loop below reads the same list.
    const before = await sessionsFiled()
    const refused = runTheTool([
      '--handle', WORKER,
      '--worktree', aWorktree().dir,
      '--cut-from', CUT_FROM,
      '--runtime', 'codex-cli',
      '--model', 'any',
      '--as', STARTER,
      '--session', 'the-run-that-started-this-one',
      '--workspace', WORKSPACE,
    ])
    expect(refused.status).not.toBe(0)
    expect(refused.err).toContain('codex-cli')
    for (const word of AGENT_RUNTIMES) expect(refused.err, word).toContain(word)
    expect(refused.out).toBe('')
    expect(await sessionsFiled(), 'a refused run was written all the same').toBe(before)
  })

})

// ==================================================================== the agent the name resolves to
//
// Criterion I9: nothing running has to restart on the day. The tool takes `--handle`, and after the
// id is split from the handle that string may be an agent's id, its handle, or one of each on two
// different agents. It applies the office's own resolver order to the roster it already fetched,
// because a plain node script cannot call the resolver in the server. The mutations each case is
// written against are named in its own comment.

/**
 * An agent with a handle chosen here, registered through the door (which files its agent record and
 * the mapping the roster reads). The door gives it a registry id of its own, which is not the handle
 * it was registered under. Its handle is then set in the table to the one the case needs, which may
 * be another agent's id. The id does not change, so `agent_records` still points at its record.
 * Answers the registry id.
 */
async function anAgentWhoseIdIsNotItsHandle(registeredAs: string, handle: string, name: string): Promise<string> {
  const id = await register(registeredAs, name, undefined, { type: 'agent', id: STARTER })
  const Database = (await import('better-sqlite3')).default
  const db = new Database(join(dir0, 'runs.db'))
  const changed = db.prepare('UPDATE agents SET handle = ? WHERE id = ?').run(handle, id)
  db.close()
  expect(changed.changes, `no registry row has the id ${id}`).toBe(1)
  return id
}

/** The same, and retired, so a run may not serve it. Answers the registry id. */
async function aRetiredAgent(registeredAs: string, handle: string, name: string): Promise<string> {
  const id = await anAgentWhoseIdIsNotItsHandle(registeredAs, handle, name)
  const Database = (await import('better-sqlite3')).default
  const db = new Database(join(dir0, 'runs.db'))
  const changed = db.prepare('UPDATE agents SET retired = 1, retired_at = ? WHERE id = ?').run('2026-09-23 10:00:00', id)
  db.close()
  expect(changed.changes, `no registry row has the id ${id}`).toBe(1)
  return id
}

/** The one argument set every case below runs the tool with; only `--handle` changes. */
function runFor(handle: string, lab: { dir: string }): { status: number; out: string; err: string } {
  return runTheTool([
    '--handle', handle,
    '--worktree', lab.dir,
    '--cut-from', CUT_FROM,
    '--runtime', 'dsh',
    '--model', 'any',
    '--as', STARTER,
    // THE SUPERVISOR'S OWN FILED RUN, which the tool names as the parent (problem NlOyicZP_Jjt).
    '--session', filerSession,
    '--workspace', WORKSPACE,
  ])
}

/** The `data` of the run a successful call filed, read back from the office. */
async function theFiledRun(run: string): Promise<Record<string, unknown>> {
  const read = await ask('GET', `/api/records/${run}`, { type: 'agent', id: STARTER })
  const body = await read.text()
  expect(read.status, body).toBe(200)
  return (JSON.parse(body) as { record: { data: Record<string, unknown> } }).record.data
}

describe('the run is filed for the agent the handle resolves to, in the office’s own order', () => {
  it('picks the one live agent bearing the handle and writes its registry id beside the handle', async () => {
    // MUTATION: delete `servingAgentId: served.id` from the body. The handle is still written, but
    // the registry id beside it is gone, so this case is red.
    const minted = await anAgentWhoseIdIsNotItsHandle('i8-minted-reg', 'i8-live-handle', 'The Minted One')
    const printed = runFor('i8-live-handle', aWorktree())
    expect(printed.err, printed.err).toBe('')
    expect(printed.status, printed.err).toBe(0)
    const run = printed.out.trim().split('\n')[0] ?? ''
    const data = await theFiledRun(run)
    expect(data['servingAgent']).toBe('i8-live-handle')
    expect(data['servingAgentId']).toBe(minted)
  })

  it('picks the agent whose exact id is sent', async () => {
    // MUTATION: drop the exact-id step (`const byId = roster.find(...)`) and the handle step answers
    // nothing for an id, so the tool refuses a registered agent and this case is red.
    const exact = await anAgentWhoseIdIsNotItsHandle('i8-exact-reg', 'i8-exact-handle', 'The Exact One')
    const printed = runFor(exact, aWorktree())
    expect(printed.err, printed.err).toBe('')
    expect(printed.status, printed.err).toBe(0)
    const run = printed.out.trim().split('\n')[0] ?? ''
    const data = await theFiledRun(run)
    expect(data['servingAgentId']).toBe(exact)
  })

  it('picks the agent whose id is sent even when a retired agent bears that string as a handle', async () => {
    // The retired row is what a freed handle leaves behind. The live agent's id is the exact id, and
    // its handle is something else, so both the id step and the retired step are exercised at once.
    // MUTATION: look for the handle before the id (`roster.find((one) => one.handle === reference)`)
    // and the retired row answers, so the run is refused and this case is red.
    const shared = await anAgentWhoseIdIsNotItsHandle('i8-shared-reg', 'i8-shared-own-handle', 'The Live Id Bearer')
    await aRetiredAgent('i8-retired-other-reg', shared, 'The Retired Handle Bearer')
    const printed = runFor(shared, aWorktree())
    expect(printed.err, printed.err).toBe('')
    expect(printed.status, printed.err).toBe(0)
    const run = printed.out.trim().split('\n')[0] ?? ''
    const data = await theFiledRun(run)
    expect(data['servingAgentId']).toBe(shared)
  })

  it('stops with one sentence naming both agents when an id and a live handle name different agents', async () => {
    // MUTATION: delete the `byId !== null && liveByHandle !== null && byId.id !== liveByHandle.id`
    // refusal. The exact id then wins silently and this case is red for writing where it should stop.
    const collide = await anAgentWhoseIdIsNotItsHandle('i8-collide-reg', 'i8-collide-own-handle', 'The Id Bearer')
    const handleBearer = await anAgentWhoseIdIsNotItsHandle('i8-handle-bearer-reg', collide, 'The Handle Bearer')
    const refused = runFor(collide, aWorktree())
    expect(refused.status).not.toBe(0)
    expect(refused.out).toBe('')
    expect(refused.err).toContain('names two agents')
    expect(refused.err, 'the agent whose id it is is not named').toContain('The Id Bearer')
    expect(refused.err, 'the live agent whose handle it is is not named').toContain('The Handle Bearer')
    expect(refused.err, 'the id to send instead is not given').toContain(handleBearer)
  })

  it('never picks a retired agent, by its handle or by its id', async () => {
    // MUTATION: drop the two retired checks. A run is then filed for a retired agent and this case
    // is red, once for the handle and once for the id.
    const retired = await aRetiredAgent('i8-retired-reg', 'i8-retired-handle', 'The Retired One')
    const byHandle = runFor('i8-retired-handle', aWorktree())
    expect(byHandle.status).not.toBe(0)
    expect(byHandle.out).toBe('')
    expect(byHandle.err).toContain('retired')
    expect(byHandle.err).toContain('The Retired One')
    const byId = runFor(retired, aWorktree())
    expect(byId.status).not.toBe(0)
    expect(byId.out).toBe('')
    expect(byId.err).toContain('retired')
    expect(byId.err).toContain('The Retired One')
  })
})

describe('the run’s start is stored with the one moment it names (item 2n)', () => {
  it('writes startedTime beside startedAt: the same words, an instant with its offset, read while the tool ran', async () => {
    // MUTATION: drop `startedTime` from the tool's body. Only the words are left, which name two moments in the hour the
    // clocks go back and none in the hour they skip, and this case is red.
    await anAgentWhoseIdIsNotItsHandle('i8-start-reg', 'i8-start-handle', 'The Started One')
    const before = Date.now()
    const printed = runFor('i8-start-handle', aWorktree())
    const after = Date.now()
    expect(printed.status, printed.err).toBe(0)
    const data = await theFiledRun(printed.out.trim().split('\n')[0] ?? '')
    const time = data['startedTime'] as { stamp?: unknown; instant?: unknown; offset?: unknown; timeZone?: unknown } | undefined
    expect(time, JSON.stringify(data)).toBeDefined()
    expect(time?.stamp).toBe(data['startedAt'])
    expect(String(time?.instant).slice(0, 19)).toBe(String(data['startedAt']).replace(' ', 'T'))
    expect(time?.offset).toMatch(/^[+-]\d{2}:\d{2}$/)
    expect(time?.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
    const moment = momentOfAnInstant(String(time?.instant))
    expect(moment, String(time?.instant)).not.toBeNull()
    expect(moment).toBeGreaterThanOrEqual(before)
    expect(moment).toBeLessThanOrEqual(after)
  })
})

/** What a run the supervisor still files by hand reads as: the refusal the whole problem is about. */
async function aRunFiledByHand(data: Record<string, unknown>): Promise<string> {
  const opened = await ask('POST', '/api/records', { type: 'agent', id: STARTER }, {
    kind: 'session',
    title: 'the by-hand record',
    data: { state: 'running', runtime: 'dsh', model: 'deepseek/deepseek-run', servingAgent: WORKER, ...data },
  })
  const openedBody = JSON.stringify(await opened.json().catch(() => undefined))
  expect(opened.status, openedBody).toBeLessThan(300)
  return (JSON.parse(openedBody) as { record: { id: string } }).record.id
}

describe('the old by-hand record, missing a key, still gets the old refusal', () => {
  it('a record missing cutFrom and ranAs is a check nobody was asked for', async () => {
    const run = await aRunFiledByHand({})
    // HELD AS THE FIELD RUNS WERE: finished before the seal existed. Without the seal the finish is
    // read as an unsealed legacy tip, and its record is exactly what a supervisor used to file by
    // hand — a name, no cutFrom, no binding, no working directory.
    const Database = (await import('better-sqlite3')).default
    const db = new Database(join(dir0, 'runs.db'), { fileMustExist: true })
    db.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
    db.close()
    const finished = await ask('PATCH', `/api/records/${run}`, { type: 'agent', id: WORKER, key: keys.get(WORKER) }, { dataPatch: { state: 'finished' } })
    const finishedBody = await finished.text()
    expect(finished.status, finishedBody).toBe(200)
    const asked = (JSON.parse(await (await ask('GET', `/api/checks/${run}`, { type: 'agent', id: STARTER })).text())) as {
      theCheck: { says: string }
    }
    expect(asked.theCheck.says).toContain('No check was asked for')
    expect(asked.theCheck.says).toContain('resolvable submitted tip')
  })
})

// ==================================================================== an office that does not know the declared field
//
// The office a launcher files with may run older code than the checkout the tool is in, and an older record door
// refuses `adaptedTool` as a key it does not know. So the tool asks GET /api/kinds/session first, sends the field
// only to an office that declares it, and says in one line when it did not. These cases talk to a small office made
// here, which answers the four requests the tool makes and keeps the body it was sent; a real office of this checkout
// always knows the field, which is why it cannot stand in for the older one.
//
// MUTATION: send the field whatever the office says (`...(true ? { adaptedTool: chosen.runtime } : {})`), and the
// case of the office that does not know it is red.


/** A small office that knows, or does not know, the declared field. Answers the body it was sent. */
async function aSmallOffice(knowsTheField: boolean): Promise<{ api: string; filed: () => Record<string, unknown> | null; close: () => Promise<void> }> {
  let filed: Record<string, unknown> | null = null
  const server: Server = createHttpServer((req, res) => {
    const answer = (status: number, body: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.method === 'GET' && req.url === '/api/participants') {
      answer(200, { agents: [{ id: 'the-labourers-id', handle: WORKER, name: 'The Labourer', record: 'the-labourers-record' }] })
      return
    }
    if (req.method === 'GET' && req.url === '/api/kinds/session') {
      answer(200, { kind: { kind: 'session', fields: [{ key: 'state' }, { key: 'runtime' }, ...(knowsTheField ? [{ key: 'adaptedTool' }] : [])] } })
      return
    }
    if (req.method === 'POST' && req.url === '/api/records') {
      let text = ''
      req.on('data', (part: Buffer) => { text += part.toString('utf8') })
      req.on('end', () => {
        filed = JSON.parse(text) as Record<string, unknown>
        answer(201, { record: { id: 'the-filed-run' } })
      })
      return
    }
    answer(404, { error: 'this small office answers four requests only' })
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()))
  const where = server.address()
  if (where === null || typeof where === 'string') throw new Error('the small office has no port')
  return {
    api: `http://127.0.0.1:${String(where.port)}`,
    filed: () => filed,
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  }
}

/**
 * Run the tool against the small office WITHOUT BLOCKING this process: the small office answers from this same
 * process, and `spawnSync` would hold it still until the tool gave up waiting for an answer.
 */
function runAgainst(office: string): Promise<{ status: number; out: string; err: string }> {
  return runTheToolWhileThisProcessAnswers([
    '--handle', WORKER,
    '--worktree', aWorktree().dir,
    '--cut-from', CUT_FROM,
    '--runtime', 'dsh',
    '--model', 'any',
    '--as', STARTER,
    '--session', 'the-run-that-started-this-one',
    '--workspace', WORKSPACE,
    '--api', office,
  ])
}

function runTheToolWhileThisProcessAnswers(arguments_: string[]): Promise<{ status: number; out: string; err: string }> {
  return new Promise((ok, fail) => {
    const child = spawn('node', [TOOL, ...arguments_], {
      cwd: REPO,
      env: { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_WORKSPACE: WORKSPACE },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (part: Buffer) => { out += part.toString('utf8') })
    child.stderr.on('data', (part: Buffer) => { err += part.toString('utf8') })
    child.on('error', fail)
    child.on('close', (code) => ok({ status: code ?? 1, out, err }))
  })
}

describe('the declared field is sent only to an office that knows it', () => {
  it('files without it, and says so in one line, when the office does not declare it', async () => {
    const office = await aSmallOffice(false)
    try {
      const printed = await runAgainst(office.api)
      expect(printed.status, printed.err).toBe(0)
      expect(printed.out.trim().split('\n')[0]).toBe('the-filed-run')
      const data = office.filed()?.['data'] as Record<string, unknown> | undefined
      expect(data?.['runtime'], JSON.stringify(office.filed())).toBe('dsh')
      expect(data, 'the field was sent to an office that does not know it').not.toHaveProperty('adaptedTool')
      expect(printed.err).toContain('does not know the field adaptedTool yet')
      expect(printed.err).toContain('"not declared"')
    } finally {
      await office.close()
    }
  })

  it('sends it, and says nothing about it, when the office declares it', async () => {
    const office = await aSmallOffice(true)
    try {
      const printed = await runAgainst(office.api)
      expect(printed.status, printed.err).toBe(0)
      const data = office.filed()?.['data'] as Record<string, unknown> | undefined
      expect(data?.['adaptedTool'], JSON.stringify(office.filed())).toBe('dsh')
      expect(printed.err).not.toContain('does not know the field')
    } finally {
      await office.close()
    }
  })
})

describe('the base commit filed beside its name', () => {
  it('records the commit of master, even when the worktree HEAD is newer', async () => {
    const checkout = aWorktree().dir
    git(checkout, 'branch', '-m', 'main', 'master')
    const base = git(checkout, 'rev-parse', 'master')
    expect(base).not.toBe(headAt(checkout))
    const printed = runTheTool([
      '--handle', WORKER, '--worktree', checkout, '--cut-from', 'master', '--runtime', 'dsh', '--model', 'any',
      '--as', STARTER, '--session', filerSession, '--workspace', WORKSPACE,
    ])
    expect(printed.status, printed.err).toBe(0)
    const data = await theFiledRun(printed.out.trim().split('\n')[0]!)
    expect(data['cutFromCommit']).toEqual({ named: 'master', commit: base })
  })

  it('files without a commit and says the name and worktree once when the name cannot resolve', async () => {
    const checkout = aWorktree().dir
    git(checkout, 'branch', '-m', 'main', 'master')
    const printed = runTheTool([
      '--handle', WORKER, '--worktree', checkout, '--cut-from', 'main', '--runtime', 'dsh', '--model', 'any',
      '--as', STARTER, '--session', filerSession, '--workspace', WORKSPACE,
    ])
    expect(printed.status, printed.err).toBe(0)
    const data = await theFiledRun(printed.out.trim().split('\n')[0]!)
    expect(data).not.toHaveProperty('cutFromCommit')
    const matching = printed.err.trim().split('\n').filter((line) => line.includes('main') && line.includes(checkout))
    expect(matching).toHaveLength(1)
  })

  it('omits the commit when the office does not declare the field', async () => {
    const office = await aSmallOffice(false)
    try {
      const printed = await runAgainst(office.api)
      expect(printed.status, printed.err).toBe(0)
      const data = office.filed()?.['data'] as Record<string, unknown> | undefined
      expect(data).not.toHaveProperty('cutFromCommit')
    } finally {
      await office.close()
    }
  })
})
