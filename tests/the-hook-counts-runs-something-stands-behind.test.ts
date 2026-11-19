// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION HOOK COUNTS RUNS SOMETHING STANDS BEHIND, NOT ROWS THAT SAY RUNNING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The first line an agent reads at the start of a session said "N other agent runs are alive",
 * counted from session records whose stored state word was `running`. That word is whatever the
 * agent last wrote, and an agent that crashed wrote nothing, so it stays `running` for ever. On
 * 2 September 2026 the line said seven on a machine running one: six were hand-filed records last
 * active between 10 and 29 August, and the seventh was the hook's own record, filed a few lines
 * earlier and read back as somebody else. Problem `1Tn4k2vPx-Sm`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A row with a live resource row behind it is counted alive.
 *   2. A row with a fresh handle hold behind it is counted alive.
 *   3. A row with neither is not counted alive, and is reported as a row that says running with
 *      nothing behind it.
 *   4. This run's own record is never among the "other" runs.
 *
 * IT RUNS THE REAL HOOK, as `tests/the-hook-writes-down-which-conversation-this-is.test.ts` does:
 * `node tools/session-hook.mjs start` with a hook payload on stdin, against a listening server on
 * a throwaway database. What is under test is the line Claude Code really prints.
 *
 * ---------------------------------------------------------------------------------------
 * AND IT GIVES THE SERVER AN EMPTY HOME, WHICH IS THE WHOLE OF THE FIX OF 7 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/sessions` answers with two kinds of row: session RECORDS, and sessions swept off this
 * machine's disk by the runtime adapters, which carry `recordId: null` because no record names
 * them. `sweepSessions` looks under `env.homeDir`, and `defaultEnv()` takes that from `homedir()`
 * — so a live Claude Code session belonging to somebody else on this machine is a row that says
 * running, that no record names, and that nothing stands behind. Which is TRUE, and is exactly what
 * the hook's sentence is for: the counts below then read one higher than the records this file
 * filed, and the file goes red for a reason that has nothing to do with the hook.
 *
 * Measured on 7 September 2026: red at 67d9e388, at a429948e and on main alike, and green minutes
 * earlier on the same code — the difference was how many agent sessions were open on the machine.
 * Two builders working at once is enough to flip it.
 *
 * So the server is given a home of its own, empty, for the length of each case: the sweep finds no
 * transcripts, every row in the answer is a record this file filed, and the arithmetic under test is
 * the hook's rather than the machine's. NOTHING ABOUT THE HOOK IS RELAXED — the cases still assert
 * exact counts, and the mutation proof is that breaking the hook's own-record exclusion, or its
 * reading of handle holds, still turns them red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HOOK = fileURLToPath(new URL('../tools/session-hook.mjs', import.meta.url))
/** This case's own project, so the sessions a case files are the only ones the hook counts. */
let WORKSPACE = 'default'
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url: string
let scratch: string
/** A home with nothing in it, so the machine's own sessions are not in the answer. See the head. */
let emptyHome: string
let realHome: string | undefined
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
  // AN EMPTY HOME FOR THE SERVER IN THIS PROCESS, so `sweepSessions` finds no transcripts on this
  // machine and every row in `GET /api/sessions` is one this file filed. `homedir()` reads $HOME on
  // this platform, `defaultEnv()` reads `homedir()` per request, and the head of this file says why.
  // The hook child inherits it too, which is right: it should see the same machine the server does.
  emptyHome = mkdtempSync(join(tmpdir(), 'mole-office-hook-home-'))
  realHome = process.env['HOME']
  process.env['HOME'] = emptyHome
}, 60_000)

afterAll(async () => {
  await server.app.close()
  t.close()
  // PUT THE REAL HOME BACK, whatever happened above. A file that left $HOME pointing at a deleted
  // directory would break every test that ran after it in the same worker.
  if (realHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = realHome
  rmSync(emptyHome, { recursive: true, force: true })
})

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  const at = '2026-08-14 09:00:00'
  t.client.sqlite
    .prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(WORKSPACE, `A test project ${String(caseNumber)}`, at, at)
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-hook-alive-'))
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** The notes the hook leaves beside the checkout, removed so one test cannot see another's. */
const notesWritten: string[] = []
afterEach(() => {
  const stateDir = fileURLToPath(new URL('../.logs', import.meta.url))
  for (const name of notesWritten.splice(0)) rmSync(join(stateDir, name), { force: true })
})

function aSessionId(): string {
  const id = `test-${Math.random().toString(36).slice(2)}-${Date.now()}`
  notesWritten.push(`session-${id}.json`)
  return id
}

/** Run the hook the way Claude Code runs it. Never `execFileSync`: the server answers in this process. */
async function runHook(): Promise<string> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: WORKSPACE,
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
  }
  delete env['TMUX_PANE']
  return await new Promise<string>((resolve, reject) => {
    const child = execFile('node', [HOOK, 'start'], { encoding: 'utf8', env }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(JSON.stringify({ session_id: aSessionId(), cwd: scratch }))
  })
}

/** A session record somebody filed by hand, saying it is running. Nothing stands behind it. */
function aRunThatSaysRunning(title: string): string {
  return t.api.createRecord({
    kind: 'session',
    title,
    summary: `why ${title} was started`,
    data: { state: 'running', runtime: 'claude-code', doing: title },
    workspaceId: WORKSPACE,
    actor: PERSON,
  }).id
}

/**
 * A process really running on this machine, registered against that session.
 *
 * The pid is this test process's own, so the liveness reading is a real one: Mole Office looks the
 * process up and finds it. A made-up pid would be the fabricated evidence rule 3 forbids, and it
 * would read `gone` anyway.
 */
async function aLiveProcessBehind(sessionRecordId: string): Promise<void> {
  const res = await server.app.inject({
    method: 'POST',
    url: '/api/resources',
    headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code/the-test', 'x-mole-office-workspace': WORKSPACE },
    payload: { sessionRecordId, type: 'process', key: String(process.pid), detail: 'the test process itself', adopting: 'this test process started before the session the test filed for it' },
  })
  expect(res.statusCode, res.body).toBe(201)
}

/** A durable agent whose handle that session is holding, beating now. */
async function aFreshHoldBehind(sessionRecordId: string, handle: string): Promise<void> {
  t.api.createRecord({
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
    workspaceId: WORKSPACE,
    actor: PERSON,
  })
  const res = await server.app.inject({
    method: 'POST',
    url: `/api/handles/${handle}/hold`,
    headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code/the-test', 'x-mole-office-workspace': WORKSPACE },
    payload: { session: sessionRecordId, machine: 'a-machine', runtime: 'claude-code' },
  })
  expect(res.statusCode, res.body).toBe(201)
}

// ============================================================ nothing behind a row

describe('a row that says running with nothing behind it is not called alive', () => {
  it('says so in its own sentence, and counts no other run as alive', async () => {
    aRunThatSaysRunning('A run that was killed in August')
    aRunThatSaysRunning('Another run that was killed in August')

    const out = await runHook()
    expect(out).toContain('No other agent run is alive.')
    expect(out).toContain('2 rows say running with nothing behind them.')
  })

  it('does not count this run\'s own record, which it filed a moment earlier', async () => {
    const out = await runHook()
    expect(out).toContain('No other agent run is alive.')
    expect(out, 'the hook read back the record it had just filed as somebody else').not.toContain(
      '1 row says running with nothing behind',
    )
  })
})

// ============================================================ something behind a row

describe('a row a live process or a fresh hold stands behind is counted alive', () => {
  it('counts a run with a live resource row, and leaves the bare row in the other sentence', async () => {
    const real = aRunThatSaysRunning('A run with a process behind it')
    await aLiveProcessBehind(real)
    aRunThatSaysRunning('A run with nothing behind it')

    const out = await runHook()
    expect(out).toContain('1 other agent run is alive.')
    expect(out).toContain('1 row says running with nothing behind them.')
  })

  it('counts a run whose session is still beating a handle', async () => {
    const holding = aRunThatSaysRunning('A run answering as an agent')
    await aFreshHoldBehind(holding, 'open-in-a-terminal')

    const out = await runHook()
    expect(out).toContain('1 other agent run is alive.')
    expect(out).not.toContain('say running with nothing behind them')
  })
})
