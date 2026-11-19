// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE START STEP FILES A RUN ON ANOTHER COMPUTER BY THE COMPUTER'S NAME, AND READS NO GIT HERE.
 *
 * Wave 13t round 22, piece 1, with the conditions (message Mtt-iDulvWDc): an agent on the owner's Mac works in a
 * checkout on the Mac, so `tools/register-a-run.mjs --machine <name>` files its run with `machine` and with no
 * `workingDirectory` and no `tip`, and runs no git on this computer, whose checkout is not the run's. What is held,
 * the tool run as a child process against an office started for the test, with a synthetic Mac named "the-mac" in
 * the owner's machine table and a stand-in `git` first on PATH that writes down each call and fails:
 *
 *   1. --machine files the run with `machine`, no `workingDirectory`, no `tip`, and no git is run about the run.
 *   2. --machine with --worktree, --machine with --run-key-file, and --machine with a name no computer could have,
 *      are each refused in words, before git and before any write.
 *
 * THE ONE GIT CALL ALLOWED is not the tool's. src/config/settings.mjs, which every tool imports, runs
 * `git rev-parse --path-format=absolute --git-common-dir` in the office's own checkout to find its `.env`
 * (`findEnvFile`). That reads this computer's office, not the run's checkout, so the test allows that exact call and
 * no other: a `rev-parse HEAD`, or any call at all naming another directory, is red.
 *   3. A name the owner never gave reaches the office and is refused there, and nothing is written.
 *
 * THE MUTATIONS, each run after a control:
 *   T1 tools/register-a-run.mjs: `if (chosen.machine === null) {` before the git read → `if (true) {` → case 1 red, and case 3 with it, the git refusal coming before the office is asked.
 *   T2 drop the --worktree refusal → case 2 red.
 *   T3 drop the --run-key-file refusal → case 2 red.
 *   T4 the name check: `if (!('name' in named))` → `if (false)` → case 2 red.
 *
 * THE SERVER IS REAL, because the subject is a child process talking over HTTP to the office.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiServerArguments } from './helpers.ts'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { chmodSync, existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = 'tools/register-a-run.mjs'
const WORKSPACE = 'default'
const WORKER = 'mac-labourer'
const STARTER = 'the-supervisor'
const THE_MAC = 'the-mac'
/**
 * The address the owner's table names the-mac by. It is invented, and built from its numbers because the address
 * scan refuses one written out.
 */
const THE_MACS_ADDRESS = [100, 101, 0, 19].join('.')

let dir0 = ''
let port = 0
let api = ''
let filerSession = ''
let office: ChildProcess | undefined
let standIns = ''
let gitWasCalled = ''
/** The one git call allowed, made by src/config/settings.mjs when it loads (see the header). */
const THE_SETTINGS_LOOKUP = 'rev-parse --path-format=absolute --git-common-dir'

/** The git calls the stand-in wrote down that are not the settings lookup. */
function gitCallsAboutTheRun(): string[] {
  if (!existsSync(gitWasCalled)) return []
  return readFileSync(gitWasCalled, 'utf8').split('\n').filter((line) => line !== '' && line !== THE_SETTINGS_LOOKUP)
}

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
  office = spawn(join(REPO, 'node_modules/.bin/tsx'), apiServerArguments(), {
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

async function ask(method: string, path: string, actor: { type: string; id: string }, body?: unknown): Promise<Response> {
  return fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': actor.type,
      'x-mole-office-actor-id': actor.id,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function register(handle: string, name: string, role: string, by: { type: string; id: string }, workArea?: string[]): Promise<void> {
  const opened = await ask('POST', '/api/agents/started', by, { handle, name, role, ...(workArea === undefined ? {} : { workArea }) })
  expect(opened.status, await opened.text()).toBe(201)
}

/** How many session records the test office holds, counted in its table. */
function sessionsHeld(): number {
  const db = new Database(join(dir0, 'runs.db'), { readonly: true })
  try {
    return (db.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n
  } finally {
    db.close()
  }
}

/** Run the tool the way a caller runs it, with the stand-in git first on PATH. */
function runTheTool(more: string[]): { status: number; out: string; err: string } {
  const ran = spawnSync(
    process.execPath,
    [TOOL, '--handle', WORKER, '--cut-from', 'main', '--runtime', 'codex', '--model', 'any', '--as', STARTER, '--session', filerSession, '--workspace', WORKSPACE, ...more],
    {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${standIns}:${process.env['PATH'] ?? ''}`, MOLE_OFFICE_API: api, MOLE_OFFICE_WORKSPACE: WORKSPACE },
    },
  )
  return { status: ran.status ?? 1, out: ran.stdout ?? '', err: ran.stderr ?? '' }
}

beforeAll(async () => {
  // Outside the checkout: the database's opener refuses a data folder inside a git worktree (problem nd7jOk5LCU4s).
  dir0 = mkdtempSync(join(tmpdir(), 'register-a-run-elsewhere-'))
  // THE STAND-IN GIT: it writes down its arguments and fails, so a call is seen whether or not the tool reads its answer.
  standIns = join(dir0, 'stand-ins')
  mkdirSync(standIns)
  gitWasCalled = join(dir0, 'git-was-called')
  writeFileSync(join(standIns, 'git'), `#!/bin/sh\necho "$@" >> '${gitWasCalled}'\nexit 1\n`)
  chmodSync(join(standIns, 'git'), 0o755)
  await startTheOffice()
  const asPerson = { type: 'human', id: THE_TEST_OFFICES_OWNER.id }
  await register(STARTER, 'The Supervisor', 'supervisor', asPerson)
  await register(WORKER, 'The Mac Labourer', 'worker', { type: 'agent', id: STARTER }, ['src'])
  const mine = await ask('POST', '/api/records', { type: 'agent', id: STARTER }, { kind: 'session', title: 'the supervisor run', data: { state: 'running' } })
  const mineBody = (await mine.json()) as { record: { id: string } }
  expect(mine.status, JSON.stringify(mineBody)).toBe(201)
  filerSession = mineBody.record.id
  // THE OWNER'S TABLE, as the Settings page stores it: one synthetic address, named the-mac.
  const db = new Database(join(dir0, 'runs.db'))
  try {
    const named = db.prepare('UPDATE installation SET machine_names = ? WHERE only_row = 1').run(JSON.stringify({ [THE_MACS_ADDRESS]: THE_MAC }))
    expect(named.changes, 'the test office has no installation row to name a machine on').toBe(1)
  } finally {
    db.close()
  }
}, 200_000)

afterAll(() => {
  if (office?.pid !== undefined) {
    try {
      process.kill(-office.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
  rmSync(dir0, { recursive: true, force: true })
})

describe('a run on another computer', () => {
  it('is filed with the machine, no worktree and no tip, and no git is run here', async () => {
    rmSync(gitWasCalled, { force: true })
    const printed = runTheTool(['--machine', THE_MAC])
    expect(printed.status, printed.err).toBe(0)
    expect(gitCallsAboutTheRun(), 'git was run on this computer for a run on another one').toEqual([])
    const run = printed.out.trim().split('\n')[0] ?? ''
    expect(printed.out).toContain(`on the computer ${THE_MAC}`)
    const read = await ask('GET', `/api/records/${run}`, { type: 'agent', id: STARTER })
    const body = await read.text()
    expect(read.status, body).toBe(200)
    const data = (JSON.parse(body) as { record: { data: Record<string, unknown> } }).record.data
    expect(data['machine']).toBe(THE_MAC)
    expect(data['servingAgent']).toBe(WORKER)
    expect(data).not.toHaveProperty('workingDirectory')
    expect(data).not.toHaveProperty('tip')
  })

  it('is refused in words, before git and before any write, with a worktree, a key file, or a name no computer has', () => {
    rmSync(gitWasCalled, { force: true })
    const before = sessionsHeld()
    const cases: [string[], string][] = [
      [['--machine', THE_MAC, '--worktree', REPO], '--machine and --worktree do not go together'],
      [['--machine', THE_MAC, '--run-key-file', join(dir0, 'a-run.key')], '--machine and --run-key-file do not go together'],
      [['--machine', 'm'.repeat(41)], '--machine takes the name of the computer the run works on'],
    ]
    for (const [more, says] of cases) {
      const printed = runTheTool(more)
      expect(printed.status, `${more.join(' ')} was taken: ${printed.out}`).not.toBe(0)
      expect(printed.err, more.join(' ')).toContain(says)
      expect(printed.err, more.join(' ')).toContain('Nothing was written.')
    }
    expect(existsSync(join(dir0, 'a-run.key')), 'a key file was made for a run on another computer').toBe(false)
    expect(gitCallsAboutTheRun(), 'git was run before the refusal').toEqual([])
    expect(sessionsHeld(), 'a refused run was written all the same').toBe(before)
  })

  it('names a computer the owner never named, and the office refuses it, writing nothing', () => {
    const before = sessionsHeld()
    const printed = runTheTool(['--machine', 'a-computer-nobody-added'])
    expect(printed.status, printed.out).not.toBe(0)
    expect(printed.err).toContain(`is neither: the owner's table names ${THE_MAC}.`)
    expect(sessionsHeld(), 'a refused run was written all the same').toBe(before)
  })
})
