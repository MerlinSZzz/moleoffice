// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK THAT HITS THE 5-HOUR LIMIT HOLDS NEW CHECKS ON ITS LOGIN UNTIL THE RESET (wave 13j, point 1b of the check
 * line's brief). The line's words: "When the Claude login answers that its 5-hour
 * limit is hit, no new check starts until the reset time it names, then checks go on by themselves. The switch's
 * reading says so." The secretary's answer, message GXMkpz0shxx0: hold only the login that answered the limit, and say which
 * login in the switch's reading; tell the person nothing; give the secretary of the check line one office line when the
 * hold starts, with the reset time, and one when it ends.
 *
 * WHAT IS PROVED HERE, against a real database, the real server and the real worker pass:
 *
 *   1. THE READER. The real sample, copied unchanged into tests/fixtures/a-check-that-hit-the-5-hour-limit.txt, reads as
 *      a session limit that resets at 7:10pm (Europe/London). A Claude result that is no error, and an error that names
 *      no limit, read as no cause.
 *   2. THE DAY. The sample names a clock time and a zone, and no date. A 5-hour limit resets within five hours of the
 *      moment it is hit, so the reset is the next time that clock time comes, if it comes within five hours (and a
 *      minute, for the words' rounding). When it does not, or the words cannot be read, the answer says so and gives no
 *      time.
 *   3. THE WORKER. A real pass runs a stand-in check tool that prints the sample with its reset moved to two hours from
 *      now, and exits 1. The check's session record carries the stop cause, and no closedHow or closedBecause, so the
 *      office's limit notice to the person is not sent and the casting roll counts no limit.
 *   4. THE HOLD. With that stop cause, a new check on Claude Code waits with the hold's sentence, and one pass holds it.
 *      The switch's reading carries the same sentence, which names the login and the reset. The secretary is told once.
 *      The line stores the reset as an instant with its offset, written by `clockStamp`, and a start line that holds its
 *      reset in UTC words, as lines did before, names the same moment and is not said again.
 *   5. ANOTHER LOGIN. With the inspector cast on Codex, the same check does not wait.
 *   6. AFTER THE RESET. The secretary is told once that the hold ended. Once the reset has passed, the check does not
 *      wait, the switch's reading no longer says it, and the next pass starts it. The end line finds a start line that holds
 *      its reset in UTC words by its moment, and stores its own reset with its offset.
 *   7. ONE OPEN. The worker reads the words of a limit and the time its output was last written from one open of the
 *      file, and writes that time as an instant with its offset. A second look at the file's path is never taken.
 *   8. NO MOMENT. A limit whose cause carries no `at` holds nothing and is not said, however recently its record was
 *      written. A record's last write is not the moment of the limit (wave 13n round AB, item 2s).
 *   9. THE REPEATED HOUR. A limit hit at 01:30 GMT on 25 October 2026, the second time that hour came in London, is said
 *      from its instant for exactly as long as a 5-hour limit can last: five hours, and the minute Claude's words round to.
 *  10. WORDS ARE NO MOMENT. An `at` written as a time in words, with no offset, is read as no moment.
 *  11. NOBODY HOLDS THE CARD. While a hold is owed and no agent holds the secretary card, the office says once that
 *      nobody was told, and says nothing on the calls after. A second hold owed makes it say so once more. No line is
 *      written. When an agent holds the card again, the owed lines are written to it, and the answer says what was said.
 *
 * WHAT WOULD MAKE EACH CASE GO RED is in the commit that adds the code, with the control run and the restore.
 *
 * Every fixture here is synthetic and says so, except the sample, which is a real answer captured from a check
 * and gave the round as its fixture (a file under briefs/ in the round's sandbox). The git trees and the worker's output folder are made under
 * the system's temporary folder and removed after; the check tools are tests/fake-check-that-hit-the-5-hour-limit.mjs and
 * tests/fake-inspection-tool.mjs; nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { theStopCauseInAClaudeResult } from '../src/config/stopped-run-cause.mjs'
import { A_FIVE_HOUR_LIMIT_RESETS_WITHIN_MS, theResetOfAFiveHourLimit } from '../src/shared/checks-in-merges-only.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { clockStamp, localStamp, stampInZone } from '../src/shared/time.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { INSPECTION_RUNTIME, type RunHandle } from '../src/worker/runtimes/adapter.ts'
import { InspectionAdapter, theStopCauseInACheck } from '../src/worker/runtimes/inspection.ts'

/**
 * A PATH LOOKED AT A SECOND TIME FINDS NO FILE, while a case names it here: its words read by the path, or its time
 * asked of the path, throw as if the file had gone. An open of the path, and what is read through that open, are not
 * touched. With no path named, every call is the real one.
 */
const aSecondLook = vi.hoisted(() => ({ finds: null as string | null }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const gone = (path: unknown) => Object.assign(new Error(`Synthetic: ${String(path)} was looked at by its path a second time.`), { code: 'ENOENT' })
  const readFileSync = ((path: unknown, ...rest: unknown[]) => {
    if (aSecondLook.finds !== null && path === aSecondLook.finds) throw gone(path)
    return (actual.readFileSync as (...args: unknown[]) => unknown)(path, ...rest)
  }) as typeof actual.readFileSync
  const statSync = ((path: unknown, ...rest: unknown[]) => {
    if (aSecondLook.finds !== null && path === aSecondLook.finds) throw gone(path)
    return (actual.statSync as (...args: unknown[]) => unknown)(path, ...rest)
  }) as typeof actual.statSync
  return { ...actual, default: { ...actual, readFileSync, statSync }, readFileSync, statSync }
})

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
const made: string[] = []
const watching: Parameters<typeof onePass>[1] = []

const WORKSPACE = 'default'
const THE_WORKER = 'mole-office/the-message-worker'
const THE_OFFICE = { type: 'agent' as const, id: 'mole-office/the-api-server' }
const LIVE = new Set(['submitted', 'pinned', 'judged', 'integrating', 'reinspecting', 'testing', 'landing'])
const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_PERSON)
const asSupervisor = as('agent', 'super-r')
const asWorker = as('agent', 'worker-w')
const asStranger = as('agent', 'a-stranger')
const theWorker = { type: 'agent' as const, id: 'worker-w' }

const SAMPLE = readFileSync(join(process.cwd(), 'tests/fixtures/a-check-that-hit-the-5-hour-limit.txt'), 'utf8')
const THE_SAMPLES_WORDS = "You've hit your session limit · resets 7:10pm (Europe/London)"
const LIMIT_TOOL = join(process.cwd(), 'tests/fake-check-that-hit-the-5-hour-limit.mjs')
const PLAIN_TOOL = join(process.cwd(), 'tests/fake-inspection-tool.mjs')
const A = 'work/a.txt'
const HOUR = 3_600_000

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory under the system's temporary folder, removed after the file. */
function scratch(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `five-hour-limit-${prefix}-`)))
  made.push(dir)
  return dir
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/** The clock time a Claude limit names, as Claude Code writes it: `7:10pm (Europe/London)`. */
function aClaudeClock(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/London', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(ms))
  const part = (type: string) => parts.find((one) => one.type === type)?.value ?? ''
  return `${part('hour')}:${part('minute')}${part('dayPeriod').toLowerCase()} (Europe/London)`
}

/**
 * A finished run of the worker, sealed at its own tree's tip: a synthetic main holding work/a.txt, and one commit on a
 * branch `work` that changes it. If sealing asks for no check, the person explicitly asks through ask-again.
 * Returns the run id and its real check message; the assertions about holding and pacing stay the same.
 */
async function aSealedRun(): Promise<{ run: string; check: string }> {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic five-hour-limit fixture')
  mkdirSync(dirname(join(dir, A)), { recursive: true })
  writeFileSync(join(dir, A), `${A} before.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic five-hour-limit run',
    workspaceId: WORKSPACE,
    actor: theWorker,
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'worker-w', cutFrom: 'main', workingDirectory: dir, doing: 'Synthetic: the run changes work/a.txt.' },
  }).id
  writeFileSync(join(dir, A), `${A} changed by ${dir}.\n`)
  git(dir, 'commit', '-q', '-am', 'Synthetic work of the run')
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
  if (!(t.api.getRecord(run)!.data['theCheck'] as { message?: string } | undefined)?.message) {
    const asked = await call('POST', `/api/checks/${run}/ask-again`, asPerson, {})
    expect(asked.status, asked.raw).toBe(200)
  }
  const check = (t.api.getRecord(run)!.data['theCheck'] as { message?: string } | undefined)?.message ?? ''
  expect(check, `the office asked for no check of ${run}`).not.toBe('')
  return { run, check }
}

interface TheRow { messageId: string; to: { kind: string; id: string }; inspection: { run: string; waits?: string } }

/** The worker's queue row for a check's message, read through the real door. */
async function theRowOf(message: string): Promise<TheRow> {
  const r = await call('GET', '/api/worker/queue', {})
  expect(r.status, r.raw).toBe(200)
  const queue = r.body['queue'] as (TheRow & { handle: string; inspection?: TheRow['inspection'] })[]
  const row = queue.find((one) => one.messageId === message && one.inspection !== undefined)
  expect(row?.inspection, `no check row for ${message}`).toBeDefined()
  return row as TheRow
}

/** Whether a check of the run has started: the office wrote its execution on the run. */
function itStarted(run: string): boolean {
  return (t.api.getRecord(run)!.data['theCheck'] as { execution?: unknown } | undefined)?.execution !== undefined
}

/** The registry id of an agent, by its handle. */
function theIdOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent ${handle}`).toBeDefined()
  return row!.id
}

/** The office's lines about the hold, oldest first. */
function theLinesAboutTheHold(): { notice: string; body: string; said: string; to: { kind: string; id: string }[]; until: unknown }[] {
  const rows = t.client.sqlite
    .prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.notice') IN ('checksAreHeldForALimit', 'checksGoOnAfterALimit') ORDER BY rowid")
    .all() as { data: string }[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as { notice: string; body: string; saidInFull?: string; to: { kind: string; id: string }[]; extra?: { checksHeld?: { until?: unknown } } }
    return { notice: data.notice, body: data.body, said: data.saidInFull ?? '', to: data.to, until: data.extra?.checksHeld?.until }
  })
}

/** The worker's sentence for a check this pass held, as the inspector's delivery row holds it. */
function heldBecause(pass: Awaited<ReturnType<typeof onePass>>, message: string): string {
  expect(pass.held.some((one) => one.messageId === message), `the pass did not hold ${message}: ${JSON.stringify(pass.held)}`).toBe(true)
  expect(pass.started.some((one) => one.messageId === message), `the pass started ${message}`).toBe(false)
  const delivery = t.client.sqlite
    .prepare('SELECT mark, because FROM message_delivery WHERE message_id = ? AND recipient_id = ?')
    .get(message, theIdOf('inspector-one')) as { mark: string; because: string | null } | undefined
  expect(delivery?.mark, `the check ${message} is not queued for inspector-one`).toBe('queued')
  return delivery!.because ?? ''
}

/** Let every check this file started end, so nothing outlives the case that started it. */
async function untilTheStartedChecksEnd(): Promise<void> {
  const until = Date.now() + 30_000
  while (watching.length > 0 && Date.now() < until) {
    await new Promise((go) => setTimeout(go, 100))
    await onePass(settings, watching)
  }
  expect(watching, 'a started check did not end').toEqual([])
}

/** The inspector's Casting row, put on a program and a model. */
async function castTheInspector(program: string, model: string): Promise<void> {
  const cells = { program: { value: program }, model: { value: model }, effort: { value: null } }
  const marked = (await call('GET', '/api/casting/for/inspector', asPerson)).body['casting'] as { id: number } | null
  if (marked === null) {
    const added = await call('POST', '/api/casting/inspector', asPerson, cells)
    expect(added.status, added.raw).toBe(201)
  } else {
    const changed = await call('PATCH', `/api/casting/rows/${String(marked.id)}`, asPerson, cells)
    expect(changed.status, changed.raw).toBe(200)
  }
}

let theLimitedCheck = ''
let theHeldCheck = { run: '', check: '' }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  const register = async (by: Record<string, string>, payload: Record<string, unknown>) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload })
    expect(r.statusCode, r.body).toBe(201)
  }
  await register(asPerson, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asPerson, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asPerson, { handle: 'super-r', name: 'Super R', role: 'supervisor' })
  await register(asSupervisor, { handle: 'worker-w', name: 'Worker W', role: 'worker', workArea: ['work'] })
  await register(asPerson, { handle: 'a-stranger', name: 'A Stranger' })
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-main', root: scratch('main'), actor: { type: 'human', id: THE_PERSON } })
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: WORKSPACE,
    session: null,
    stopWithPid: null,
    checkout: process.cwd(),
    runs: 9,
    hops: 3,
    outputRoot: scratch('worker'),
    env: {
      ...withoutInheritedEffort(),
      MOLE_OFFICE_FAKE_INSPECTION_TOOL: LIMIT_TOOL,
      MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs'),
      MOLE_OFFICE_INSPECTION_MODEL: 'sonnet',
    },
  }
}, 60_000)

afterEach(async () => {
  await untilTheStartedChecksEnd()
  const listed = await call('GET', '/api/merge-queue', asStranger)
  for (const one of (listed.body['lanes'] ?? []) as { entries: { id: string; state: string }[] }[]) {
    for (const entry of one.entries) {
      if (LIVE.has(entry.state)) await call('POST', `/api/merge-queue/${entry.id}/withdraw`, asPerson, { because: 'the case is over' })
    }
  }
}, 60_000)

afterAll(async () => {
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The five-hour-limit test ended.')
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
}, 60_000)

// ============================================================================ 1. the reader

describe('the answer of a check whose Claude login hit its 5-hour limit', () => {
  it("reads the coordinator's sample as a session limit with the reset time it names", () => {
    const at = '2026-10-15T15:52:00.000Z'
    expect(theStopCauseInACheck(SAMPLE, at)).toEqual({ kind: 'session-limit', said: THE_SAMPLES_WORDS, at, resetsAt: '7:10pm (Europe/London)' })
    const envelope = JSON.parse((JSON.parse(SAMPLE.slice(SAMPLE.indexOf('{'))) as { output: string }).output) as Record<string, unknown>
    expect(theStopCauseInAClaudeResult(envelope)).toEqual({ kind: 'session-limit', said: THE_SAMPLES_WORDS, resetsAt: '7:10pm (Europe/London)' })
  })

  it('reads no cause in a result that is no error, or an error that names no limit', () => {
    expect(theStopCauseInAClaudeResult({ type: 'result', is_error: false, result: THE_SAMPLES_WORDS })).toBeNull()
    expect(theStopCauseInAClaudeResult({ type: 'result', is_error: true, result: 'The tool call failed.' })).toBeNull()
    expect(theStopCauseInACheck('Synthetic: a check that printed no model line.\n', '2026-10-15T15:52:00.000Z')).toBeUndefined()
  })
})

// ============================================================================ 2. the day

describe('the reset of a 5-hour limit, from words that name no date', () => {
  // 16 October 2026 is in British Summer Time: 16:00 in London is 15:00 UTC.
  const at = (hour: number, minute = 0) => Date.UTC(2026, 9, 16, hour, minute)

  it('is the next time the clock time comes, when that is within five hours of the limit', () => {
    expect(theResetOfAFiveHourLimit('7:10pm (Europe/London)', at(15), 'UTC')).toEqual({ until: at(18, 10), zone: 'Europe/London' })
    expect(theResetOfAFiveHourLimit('7:10pm (Europe/London)', at(13, 10), 'UTC')).toEqual({ until: at(18, 10), zone: 'Europe/London' })
  })

  it('says which day cannot be told when that time comes more than five hours after the limit, and gives no time', () => {
    const tooEarly = theResetOfAFiveHourLimit('7:10pm (Europe/London)', at(11), 'UTC')
    expect(tooEarly).not.toHaveProperty('until')
    expect((tooEarly as { cannot: string }).cannot).toContain('which day')
    // After the reset time has passed that day, its next coming is the next day, 23 hours and 40 minutes away.
    const after = theResetOfAFiveHourLimit('7:10pm (Europe/London)', at(18, 30), 'UTC')
    expect(after).not.toHaveProperty('until')
    expect((after as { cannot: string }).cannot).toContain('which day')
  })

  it('says so when the words name no reset, or one that cannot be read', () => {
    expect((theResetOfAFiveHourLimit(null, at(15), 'UTC') as { cannot: string }).cannot).toContain('no reset time')
    expect((theResetOfAFiveHourLimit('soon', at(15), 'UTC') as { cannot: string }).cannot).toContain('"soon" could not be read')
  })
})

// ============================================================================ 3 to 6. the worker, the hold and its end

describe('a check whose login hit its 5-hour limit', () => {
  it('3: leaves the stop cause on its session record, and nothing that tells the person or changes the casting roll', async () => {
    const { run } = await aSealedRun()
    const pass = await onePass(settings, watching)
    expect(pass.started.length, JSON.stringify(pass)).toBeGreaterThan(0)
    await untilTheStartedChecksEnd()
    theLimitedCheck = String((t.api.getRecord(run)!.data['theCheck'] as { execution?: { session?: string } }).execution?.session ?? '')
    expect(theLimitedCheck).not.toBe('')
    const data = t.api.getRecord(theLimitedCheck)!.data
    const cause = data['stopCause'] as { kind: string; said: string; at: string; resetsAt: string }
    expect(cause).toMatchObject({ kind: 'session-limit' })
    expect(cause.said).toMatch(/^You've hit your session limit · resets \d{1,2}:\d{2}(am|pm) \(Europe\/London\)$/u)
    expect(cause.resetsAt).toMatch(/^\d{1,2}:\d{2}(am|pm) \(Europe\/London\)$/u)
    expect(Math.abs(Date.parse(cause.at) - Date.now())).toBeLessThan(5 * 60_000)
    expect(data['usageReceipt']).toMatchObject({ runtime: 'claude-code' })
    // NOTHING FOR THE PERSON: the office's limit notice reads only a run with closedBecause, and the casting roll only one
    // closed by a provider event.
    expect(data['closedBecause']).toBeUndefined()
    expect(data['closedHow']).toBeUndefined()
    const { theModelsLimitedAt } = await import('../src/server/lib/casting-roll.ts')
    expect(theModelsLimitedAt(Date.now()).limited.find((one) => one.run === theLimitedCheck)).toBeUndefined()
  })

  it('4: holds a new check on Claude Code until the reset, says so in the switch\'s reading, and tells the secretary once', async () => {
    expect(theLimitedCheck, 'case 3 filed no limited check').not.toBe('')
    const cause = t.api.getRecord(theLimitedCheck)!.data['stopCause'] as { at: string; resetsAt: string }
    const reset = theResetOfAFiveHourLimit(cause.resetsAt, Date.parse(cause.at), 'UTC') as { until: number; zone: string }
    expect(reset.until).toBeGreaterThan(Date.now())
    const until = `${stampInZone(reset.until, 'Europe/London').slice(0, 16)} Europe/London`

    settings.env = { ...settings.env, MOLE_OFFICE_FAKE_INSPECTION_TOOL: PLAIN_TOOL }
    theHeldCheck = await aSealedRun()
    const waits = (await theRowOf(theHeldCheck.check)).inspection.waits ?? ''
    expect(waits).toContain('Claude Code')
    expect(waits).toContain(`held until ${until}`)
    expect(waits).toContain(theLimitedCheck)
    expect(waits).toContain('A check on another login is not held')

    const pass = await onePass(settings, watching)
    expect(heldBecause(pass, theHeldCheck.check)).toBe(waits)
    expect(itStarted(theHeldCheck.run)).toBe(false)

    // ONE SENTENCE IN TWO PLACES: the switch's reading carries the queue row's sentence.
    const reading = await call('GET', '/api/office/checks-in-merges-only', asPerson)
    expect(reading.status, reading.raw).toBe(200)
    expect(reading.body['says']).toContain(waits)

    // THE SECRETARY HEARS ONE LINE, with the reset time, addressed to the card's holder alone.
    const { tellTheSecretaryOfTheHold } = await import('../src/server/lib/checks-held-for-a-limit.ts')
    tellTheSecretaryOfTheHold(Date.now(), THE_OFFICE)
    tellTheSecretaryOfTheHold(Date.now(), THE_OFFICE)
    const told = theLinesAboutTheHold()
    expect(told.map((one) => one.notice)).toEqual(['checksAreHeldForALimit'])
    expect(told[0]!.to).toEqual([{ kind: 'agent', id: theIdOf(THE_TEST_OFFICES_SECRETARY.handle) }])
    expect(told[0]!.said).toContain(until)
    expect(told[0]!.said).toContain('Claude Code')
    expect(told[0]!.said).toContain(theLimitedCheck)

    // THE RESET IS STORED AS LOCAL WALL-CLOCK WITH ITS OFFSET, by the one writer in src/shared/time.ts, and not in UTC.
    expect(told[0]!.until).toBe(clockStamp(() => new Date(reset.until)).instant)
    // A LINE WRITTEN BEFORE THE RESET WAS STORED WITH ITS OFFSET holds it in UTC words. It names the same moment, so the
    // hold is not said again. Case 6 then finds this line by its moment when the hold ends.
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.extra.checksHeld.until', ?) WHERE kind = 'message' AND json_extract(data, '$.notice') = 'checksAreHeldForALimit'")
      .run(new Date(reset.until).toISOString())
    tellTheSecretaryOfTheHold(Date.now(), THE_OFFICE)
    expect(theLinesAboutTheHold().map((one) => one.notice)).toEqual(['checksAreHeldForALimit'])
  })

  it('5: does not hold a check that runs on another login', async () => {
    expect(theHeldCheck.check, 'case 4 filed no held check').not.toBe('')
    await castTheInspector('codex', 'gpt-6.1-sol')
    try {
      expect((await theRowOf(theHeldCheck.check)).inspection.waits).toBeUndefined()
    } finally {
      await castTheInspector('claude-code', 'claude-sonnet-5')
    }
    expect((await theRowOf(theHeldCheck.check)).inspection.waits ?? '').toContain('Claude Code')
  })

  it('6: tells the secretary once that the hold ended, and once the reset has passed the check starts', async () => {
    expect(theHeldCheck.check, 'case 4 filed no held check').not.toBe('')
    const cause = t.api.getRecord(theLimitedCheck)!.data['stopCause'] as { at: string; resetsAt: string }
    const reset = theResetOfAFiveHourLimit(cause.resetsAt, Date.parse(cause.at), 'UTC') as { until: number; zone: string }
    const until = `${stampInZone(reset.until, 'Europe/London').slice(0, 16)} Europe/London`

    const { tellTheSecretaryOfTheHold } = await import('../src/server/lib/checks-held-for-a-limit.ts')
    tellTheSecretaryOfTheHold(reset.until + 60_000, THE_OFFICE)
    tellTheSecretaryOfTheHold(reset.until + 120_000, THE_OFFICE)
    const told = theLinesAboutTheHold()
    expect(told.map((one) => one.notice)).toEqual(['checksAreHeldForALimit', 'checksGoOnAfterALimit'])
    expect(told[1]!.to).toEqual([{ kind: 'agent', id: theIdOf(THE_TEST_OFFICES_SECRETARY.handle) }])
    expect(told[1]!.said).toContain(until)
    expect(told[1]!.said).toContain('Claude Code')
    // THE START LINE CASE 4 LEFT HOLDS ITS RESET IN UTC WORDS; the end line found it by its moment, and is written once,
    // with its own reset stored with its offset.
    expect(told[0]!.until).toBe(new Date(reset.until).toISOString())
    expect(told[1]!.until).toBe(clockStamp(() => new Date(reset.until)).instant)

    // THE RESET HAS PASSED: the fixture moves the limit three hours back, with a reset one hour ago.
    const now = Date.now()
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.stopCause.at', ?, '$.stopCause.resetsAt', ?), updated_at = ? WHERE id = ?")
      .run(new Date(now - 3 * HOUR).toISOString(), aClaudeClock(now - HOUR), localStamp(new Date(now)), theLimitedCheck)
    expect((await theRowOf(theHeldCheck.check)).inspection.waits).toBeUndefined()
    const reading = await call('GET', '/api/office/checks-in-merges-only', asPerson)
    expect(reading.body['says']).not.toContain('held until')
    const pass = await onePass(settings, watching)
    expect(pass.started.find((one) => one.messageId === theHeldCheck.check), JSON.stringify(pass.held)).toBeDefined()
    expect(itStarted(theHeldCheck.run)).toBe(true)
  })
})

// ============================================================================ 7 to 10. the moment a limit is said from

describe('the moment a limit is said from', () => {
  // 01:30 GMT on 25 October 2026: London's clocks went back at 02:00 BST, so 01:00 to 02:00 came twice that night.
  const IN_THE_REPEATED_HOUR = Date.UTC(2026, 9, 25, 1, 30, 0)

  /** A synthetic check session that stopped on a 5-hour limit, on the Claude Code login, with this `at`. */
  function aLimitedCheck(at: string | null): string {
    return t.api.createRecord({
      kind: 'session',
      title: 'Synthetic check that stopped on a 5-hour limit',
      workspaceId: WORKSPACE,
      actor: THE_OFFICE,
      origin: 'fixture',
      data: {
        state: 'finished',
        runtime: INSPECTION_RUNTIME,
        stopCause: { kind: 'session-limit', said: THE_SAMPLES_WORDS, at, resetsAt: null },
        usageReceipt: { runtime: 'claude-code' },
      },
    }).id
  }

  /** Whether the hold on new checks at this moment says the session, and whether it holds anything for it. */
  async function whatTheHoldSaysOf(session: string, nowMs: number): Promise<{ said: boolean; holds: boolean }> {
    const { theHoldOnNewChecks } = await import('../src/server/lib/checks-in-merges-only.ts')
    const hold = theHoldOnNewChecks(nowMs)
    return {
      said: hold.untold.some((one) => one.includes(session)) || (hold.says ?? '').includes(session),
      holds: [...hold.held.values(), ...hold.ended].some((one) => one.session === session),
    }
  }

  it('7: takes the words and the time of a limit from one open of the output, and writes the time with its offset', () => {
    const dir = scratch('one-open')
    const outputPath = join(dir, 'output.txt')
    writeFileSync(outputPath, SAMPLE)
    const written = new Date(IN_THE_REPEATED_HOUR)
    utimesSync(outputPath, written, written)
    const handle = { runtime: INSPECTION_RUNTIME, pid: 999_999_999, pgid: 999_999_999, startedAt: '2026-10-25 01:00:00', providerSession: null, outputPath, exitCodePath: join(dir, 'exit-code') } as RunHandle
    // ONLY A READER THAT OPENS THE FILE ONCE, reads its words through that open and asks that open for its time sees both:
    // a read of the words by the path, or a look at its time by the path, finds no file.
    aSecondLook.finds = outputPath
    let cause
    try {
      cause = new InspectionAdapter({ run: 'synthetic-check', checkout: null }, {}).readResult(handle).stopCause
    } finally {
      aSecondLook.finds = null
    }
    expect(cause).toMatchObject({ kind: 'session-limit', said: THE_SAMPLES_WORDS, resetsAt: '7:10pm (Europe/London)' })
    expect(cause!.at).toMatch(/[+-]\d{2}:\d{2}$/u)
    expect(cause!.at).toBe(clockStamp(() => written).instant)
    expect(Date.parse(cause!.at!)).toBe(IN_THE_REPEATED_HOUR)
  })

  it('8: holds nothing and says nothing for a limit whose cause carries no moment, however recently its record was written', async () => {
    const now = Date.now()
    const session = aLimitedCheck(null)
    for (const later of [0, HOUR, A_FIVE_HOUR_LIMIT_RESETS_WITHIN_MS - 60_000]) {
      expect(await whatTheHoldSaysOf(session, now + later), `${String(later / 60_000)} minutes after the record was written`).toEqual({ said: false, holds: false })
    }
  })

  it('9: says a limit hit in the repeated hour from its instant for exactly as long as a 5-hour limit can last', async () => {
    const session = aLimitedCheck(clockStamp(() => new Date(IN_THE_REPEATED_HOUR)).instant)
    expect(await whatTheHoldSaysOf(session, IN_THE_REPEATED_HOUR)).toEqual({ said: true, holds: false })
    expect(await whatTheHoldSaysOf(session, IN_THE_REPEATED_HOUR + A_FIVE_HOUR_LIMIT_RESETS_WITHIN_MS)).toEqual({ said: true, holds: false })
    expect(await whatTheHoldSaysOf(session, IN_THE_REPEATED_HOUR + A_FIVE_HOUR_LIMIT_RESETS_WITHIN_MS + 1)).toEqual({ said: false, holds: false })
  })

  it('10: reads an `at` written as a time in words, with no offset, as no moment', async () => {
    const now = Date.now()
    const session = aLimitedCheck(localStamp(new Date(now)))
    expect(await whatTheHoldSaysOf(session, now + HOUR)).toEqual({ said: false, holds: false })
  })
})

// ============================================================================ 11. while nobody holds the secretary card

describe('the hold on new checks while nobody holds the secretary card', () => {
  const NOBODY_WAS_TOLD = 'Nobody holds the secretary card, so nobody was told that new checks are held for a 5-hour limit or start again.'

  /** A synthetic check session that stopped on the 5-hour limit of this login ten minutes before `nowMs`, with a reset two hours after it. */
  function aCheckThatHitTheLimitOf(login: string, nowMs: number): string {
    return t.api.createRecord({
      kind: 'session',
      title: 'Synthetic check that stopped on a 5-hour limit',
      workspaceId: WORKSPACE,
      actor: THE_OFFICE,
      origin: 'fixture',
      data: {
        state: 'finished',
        runtime: INSPECTION_RUNTIME,
        stopCause: { kind: 'session-limit', said: THE_SAMPLES_WORDS, at: clockStamp(() => new Date(nowMs - 10 * 60_000)).instant, resetsAt: aClaudeClock(nowMs + 2 * HOUR) },
        usageReceipt: { runtime: login },
      },
    }).id
  }

  /**
   * THE CARD IS MOVED THROUGH THE PERSON'S CARD DOOR, which writes the agent's record, so the registry that
   * `whoHoldsTheSecretaryCard` reads moves with it. The worker card takes the secretary card away; the secretary card
   * gives it back.
   */
  async function theSecretaryCardTo(role: 'secretary' | 'worker'): Promise<void> {
    const given = await call('POST', `/api/roles/card/${THE_TEST_OFFICES_SECRETARY.handle}`, asPerson, { role })
    expect(given.status, given.raw).toBe(201)
  }

  it('11: says once that nobody was told, says it once more when another hold is owed, and writes the lines when a holder is back', async () => {
    const { tellTheSecretaryOfTheHold } = await import('../src/server/lib/checks-held-for-a-limit.ts')
    const { whoHoldsTheSecretaryCard } = await import('../src/server/lib/inspection.ts')
    const before = theLinesAboutTheHold().length
    const now = Date.now()
    await theSecretaryCardTo('worker')
    try {
      expect(whoHoldsTheSecretaryCard()).toBeNull()
      aCheckThatHitTheLimitOf('codex', now)
      // ONE HOLD IS OWED. The first call says that nobody was told; the next finds the same line owed and says nothing.
      expect(tellTheSecretaryOfTheHold(now, THE_OFFICE)).toEqual([NOBODY_WAS_TOLD])
      expect(tellTheSecretaryOfTheHold(now + 60_000, THE_OFFICE)).toEqual([])
      // A SECOND HOLD IS OWED, so the owed lines have changed and it is said once more.
      aCheckThatHitTheLimitOf('opencode', now)
      expect(tellTheSecretaryOfTheHold(now + 120_000, THE_OFFICE)).toEqual([NOBODY_WAS_TOLD])
      expect(tellTheSecretaryOfTheHold(now + 180_000, THE_OFFICE)).toEqual([])
      expect(theLinesAboutTheHold()).toHaveLength(before)
    } finally {
      await theSecretaryCardTo('secretary')
    }

    // A HOLDER IS BACK: both owed lines are written to it, and the answer says what was said, one sentence for each line.
    const told = tellTheSecretaryOfTheHold(now + 240_000, THE_OFFICE)
    expect(told.map((one) => one.slice(0, one.indexOf(' (reset ')))).toEqual([
      `${THE_TEST_OFFICES_SECRETARY.handle} was told that new checks on Codex are held`,
      `${THE_TEST_OFFICES_SECRETARY.handle} was told that new checks on OpenCode are held`,
    ])
    const written = theLinesAboutTheHold().slice(before)
    expect(written.map((one) => one.notice)).toEqual(['checksAreHeldForALimit', 'checksAreHeldForALimit'])
    for (const one of written) expect(one.to).toEqual([{ kind: 'agent', id: theIdOf(THE_TEST_OFFICES_SECRETARY.handle) }])
    expect(written[0]!.said).toContain('Codex')
    expect(written[1]!.said).toContain('OpenCode')
  })
})
