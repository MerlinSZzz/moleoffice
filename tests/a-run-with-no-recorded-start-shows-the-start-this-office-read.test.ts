// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN WHOSE RECORD HOLDS NO START TIME SHOWS THE START THIS OFFICE READ FROM ITS PROCESS. Wave 13y round 35, item 9.8 (c),
 * and round 37, cases (iv) and (v).
 *
 * Round 34 made the run's page say "Start time unknown." whenever the record holds no start time
 * (tests/a-run-with-no-recorded-start-says-its-start-time-is-unknown.test.ts). The answer to round 33's question was
 * that the server's own reading counts: when the record holds no start time but the server read one from the process,
 * the page shows that as the start and says where it came from.
 *
 * WHICH READING IS THE SERVER'S. A run's record names its process in `data.extra.discovered`, and more than one program
 * writes that block: the server for its own rows, and the session hook for an agent's run, with its own reading. The
 * ledger reads a process's start time itself when the process is registered, whoever asks. So the record's start time
 * for its process counts as the office's reading only when the ledger read the same start time for that process,
 * registered against this run. Two readings do not count (the secretary's answers of round 37): one from a row the run withdrew
 * as a mistake, and one for a run whose process mark says its process is not shown to be its own.
 *
 * WHAT THIS HOLDS, with this test's own process standing in for a run's process, because the ledger refuses a pid nothing
 * runs under. The runs say they are idle unless a case says otherwise, so the office reads no process mark for them: this
 * test's process is not the claude program, and a running run naming it is marked as not shown to be its own.
 *   1. a run with no start time whose record names its process, and the ledger read that process's start for this run:
 *      the door answers that time as `startThisOfficeRead`, and the page's "Started" fact says "Started <time>, as this
 *      office read it from the process." and not that the start is unknown, in one view at 1440, light;
 *      1b. the same when the ledger's row was given back: a process this test starts and stops by its own group, for a run
 *      that then crashed, whose row the run's end closed. The ledger keeps what it read on a row given back;
 *   2. a run with no start time whose record names its process with a start time the ledger did not read for it, as the
 *      session hook writes one: the door answers null, and the page says the start time is unknown;
 *   3. a run with no start time whose record names the process, and the ledger read another start time for that pid:
 *      the door answers null, and the page says the start time is unknown;
 *      3b. a run with no start time whose record names a pid nothing runs under, with the start time the ledger read
 *      for the other process registered against this run: the door answers null;
 *   4. a run with no start time whose record names no process, though a process is registered against it: the door
 *      answers null, and the page says the start time is unknown, because nothing says which process is the run's own;
 *   5. a run with a start time of its own whose process the ledger read: the page draws the run's own start time;
 *   6. in the test language the new sentence is marked, so it is not a literal in the page;
 *   7. (iv) a run whose only row for its process was withdrawn as a mistake: the door answers null, and the page says
 *      the start time is unknown. A row given back in any other way still counts, which is case 1b;
 *   8. (v) a running run whose process mark says its process is not shown to be its own: the door answers null, and the
 *      page says the start time is unknown beside that mark and never shows the reading, in one view at 1440, light;
 *      8b. a running run whose process mark says its process runs, an office row read by its start time: the reading
 *      counts, so only the mark that says "not shown to be its own" takes it away.
 *
 * WHAT IT DOES NOT HOLD. Whether the line "First recorded by this office at <time>" also stands under a start the
 * office read is asked, not decided, so neither answer is held here. Case 4 holds what is built, and whether a process
 * registered against a run that names none should count is asked as well.
 *
 * Every run here is made up and filed in this test's own office.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { THE_TERMINAL_HOLDER } from '../src/config/own-rows.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { sessionPath } from '../src/web/components/router.tsx'

const SHOTS = testShots('run-start-the-office-read')
const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const UNKNOWN = 'Start time unknown.'
const AS_READ = ', as this office read it from the process.'
const A_START_NOBODY_READ = '2026-01-01 00:00:00'
/** A pid nothing runs under, checked before it is used. */
const A_PID_NOTHING_RUNS_UNDER = 4_194_303

let app: LiveApp
let page: Page
/** When the ledger read this test's process as starting. */
let ledgerRead = ''
const runs = { read: '', givenBack: '', hookOnly: '', otherStart: '', otherPid: '', namesNone: '', ownStart: '', withdrawn: '', notItsOwn: '', seenRunning: '' }
/** The words the run page's process mark draws for a process not shown to be the run's own. */
const NOT_ITS_OWN = 'its process is not shown to be its own'
/** When the ledger read the process this test starts and stops, and the group that process leads. */
let givenBackRead = ''
let sleeper: ChildProcess | null = null
let sleepersGroup = 0

async function file(title: string, data: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify({ kind: 'session', title, data }) })
  expect(res.status, await res.clone().text()).toBe(201)
  return ((await res.json()) as { record: { id: string } }).record.id
}

/** Register a process against a run, this test's own unless another is named, and answer the start time the ledger read for it. */
async function register(sessionRecordId: string, pid = process.pid): Promise<string> {
  return (await registered(sessionRecordId, pid)).osStartedAt
}

/** Register a process against a run, and answer the ledger's row and the start time it read. */
async function registered(sessionRecordId: string, pid = process.pid): Promise<{ id: string; osStartedAt: string }> {
  const res = await fetch(`${app.api}/api/resources`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      sessionRecordId,
      type: 'process',
      key: String(pid),
      detail: 'made up: the test process stands in for the run',
      adopting: 'made up: a test registers its own process to stand in for a run',
    }),
  })
  expect(res.status, await res.clone().text()).toBe(201)
  const { resource } = (await res.json()) as { resource: { id: string; osStartedAt: string | null } }
  if (resource.osStartedAt === null) throw new Error('the ledger read no start time for this test process')
  return { id: resource.id, osStartedAt: resource.osStartedAt }
}

/** The run that registered a row takes it back as a mistake. It signals nothing. */
async function withdraw(rowId: string, sessionRecordId: string): Promise<void> {
  const res = await fetch(`${app.api}/api/resources/${rowId}/withdraw`, {
    method: 'POST',
    headers: { ...AS_THE_PERSON, 'x-mole-office-session': sessionRecordId },
    body: JSON.stringify({ because: 'made up: a test withdraws the row it registered' }),
  })
  expect(res.status, await res.clone().text()).toBe(200)
}

async function nameItsProcess(id: string, pidStartedAt: string, pid = process.pid): Promise<void> {
  await patch(id, { extra: { discovered: { pid, pidStartedAt } } })
}

/** A run's data is changed by the person only with their key, so every change sends the test office's key for the person. */
async function patch(id: string, dataPatch: Record<string, unknown>): Promise<void> {
  const key: Record<string, string> = { 'x-mole-office-key': (JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { person: string }).person }
  const res = await fetch(`${app.api}/api/records/${id}`, { method: 'PATCH', headers: { ...AS_THE_PERSON, ...key }, body: JSON.stringify({ dataPatch }) })
  expect(res.status, await res.clone().text()).toBe(200)
}

/** The ledger's rows for a run, given back or not. */
async function itsRows(id: string): Promise<{ key: string; osStartedAt: string | null; releasedAt: string | null }[]> {
  const res = await fetch(`${app.api}/api/resources?sessionRecordId=${id}&includeReleased=true`, { headers: AS_THE_PERSON })
  expect(res.status, await res.clone().text()).toBe(200)
  return ((await res.json()) as { resources: { key: string; osStartedAt: string | null; releasedAt: string | null }[] }).resources
}

async function theDoorsReading(id: string): Promise<unknown> {
  return (await theDoor(id))['startThisOfficeRead']
}

/** What the door says the office saw of the run's process: `running`, `none`, `not-its-own`, or null where it read none. */
async function theDoorsMark(id: string): Promise<unknown> {
  const { session } = (await theDoor(id)) as { session: { itsProcess: { seen: string } | null } }
  return session.itsProcess?.seen ?? null
}

async function theDoor(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}/api/sessions/${id}`, { headers: AS_THE_PERSON })
  expect(res.status, await res.clone().text()).toBe(200)
  return (await res.json()) as Record<string, unknown>
}

/** The process mark the run page draws beside the run's state, or null where it draws none. */
async function theProcessMark(): Promise<string | null> {
  const mark = page.locator('.sx-its-process')
  return (await mark.count()) === 0 ? null : ((await mark.first().textContent()) ?? '').trim()
}

async function open(id: string, width: number, theme: 'light' | 'dark', lang = 'en'): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/?lang=${lang}#${sessionPath(id)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.sp-facts').first().waitFor({ state: 'visible', timeout: 30_000 })
}

/** The "Started" fact: its label, its text and the times drawn in it. It is the fifth fact of the run's first panel. */
async function theStartedFact(): Promise<{ label: string; text: string; stamps: (string | null)[] }> {
  const fact = page.locator('.sp-facts').first().locator('.sp-fact').nth(4)
  return {
    label: ((await fact.locator('dt').textContent()) ?? '').trim(),
    text: ((await fact.locator('dd').textContent()) ?? '').trim(),
    stamps: await fact.locator('dd time').evaluateAll((times) => times.map((one) => one.getAttribute('datetime'))),
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'run-start-the-office-read', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  page = app.page
  const made = { state: 'idle', runtime: 'mole-office', doing: 'Made up: holds the lantern terminals.' }
  const running = { ...made, state: 'running' }

  runs.read = await file('Made-up holder of the lantern terminals', made)
  ledgerRead = await register(runs.read)
  await nameItsProcess(runs.read, ledgerRead)

  // 1b. A process in a group of its own, so this test stops it by that group and nothing else. The run's end closes its row.
  runs.givenBack = await file('Made-up run whose process was given back', running)
  sleeper = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' })
  if (sleeper.pid === undefined) throw new Error('the made-up process did not start')
  sleepersGroup = sleeper.pid
  const exited = new Promise((done) => sleeper!.once('exit', done))
  givenBackRead = await register(runs.givenBack, sleeper.pid)
  await nameItsProcess(runs.givenBack, givenBackRead, sleeper.pid)
  process.kill(-sleepersGroup, 'SIGTERM')
  await exited
  await patch(runs.givenBack, { state: 'crashed' })
  expect((await itsRows(runs.givenBack)).map((row) => [row.key, row.osStartedAt, row.releasedAt !== null])).toEqual([[String(sleeper.pid), givenBackRead, true]])

  runs.hookOnly = await file('Made-up run the session hook stamped', made)
  await nameItsProcess(runs.hookOnly, ledgerRead)

  runs.otherStart = await file('Made-up run whose process number came round again', made)
  await register(runs.otherStart)
  await nameItsProcess(runs.otherStart, A_START_NOBODY_READ)

  if (existsSync(`/proc/${A_PID_NOTHING_RUNS_UNDER}`)) throw new Error(`something runs as pid ${A_PID_NOTHING_RUNS_UNDER}`)
  runs.otherPid = await file('Made-up run that names a process the ledger never read', made)
  await register(runs.otherPid)
  await nameItsProcess(runs.otherPid, ledgerRead, A_PID_NOTHING_RUNS_UNDER)

  runs.namesNone = await file('Made-up run that names no process of its own', made)
  await register(runs.namesNone)

  runs.ownStart = await file('Made-up mending of the lantern scanner', { ...made, startedAt: '2026-09-29 17:00:00' })
  await register(runs.ownStart)
  await nameItsProcess(runs.ownStart, ledgerRead)

  // 7. The run's only row for its process, withdrawn by the run as a mistake.
  runs.withdrawn = await file('Made-up run that withdrew its row as a mistake', made)
  const mistaken = await registered(runs.withdrawn)
  await nameItsProcess(runs.withdrawn, mistaken.osStartedAt)
  await withdraw(mistaken.id, runs.withdrawn)
  expect((await itsRows(runs.withdrawn)).map((row) => [row.key, row.osStartedAt, row.releasedAt !== null])).toEqual([[String(process.pid), mistaken.osStartedAt, true]])

  // 8. A running run naming this test's process, which is not the claude program, so its process is not shown to be its own.
  runs.notItsOwn = await file('Made-up run whose process is not shown to be its own', running)
  await nameItsProcess(runs.notItsOwn, await register(runs.notItsOwn))

  // 8b. A running office row naming this test's process, which an office row is read by its start time alone.
  runs.seenRunning = await file(THE_TERMINAL_HOLDER, running)
  await nameItsProcess(runs.seenRunning, await register(runs.seenRunning))
}, 300_000)

afterAll(async () => {
  if (sleeper !== null && sleeper.exitCode === null && sleeper.signalCode === null) process.kill(-sleepersGroup, 'SIGTERM')
  await app?.stop()
}, 120_000)

it("1: the start the ledger read for the run's own process is the start, with where it came from", async () => {
  expect(await theDoorsReading(runs.read)).toBe(ledgerRead)
  const [, readAt] = /^\d{4}-\d\d-\d\d (\d\d:\d\d):\d\d$/.exec(ledgerRead) ?? []
  if (readAt === undefined) throw new Error(`the ledger's time ${ledgerRead} is not a local stamp`)
  // ONE VIEW. The start sentence does not change with the width or the theme.
  for (const theme of ['light'] as const) for (const width of [1440]) {
    await open(runs.read, width, theme)
    const fact = await theStartedFact()
    expect(fact.label).toBe('Started')
    expect(fact.text, `${theme} ${width}`).toMatch(new RegExp(`^Started .*${readAt}${AS_READ.replaceAll('.', '\\.')}`))
    expect(fact.text, `${theme} ${width}`).not.toContain(UNKNOWN)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${theme} ${width}`).toBeLessThanOrEqual(0)
    await page.screenshot({ path: join(SHOTS, `office-read-${width}-${theme}.png`), fullPage: true })
  }
}, 300_000)

it('1b: the start the ledger read stays the start when the row was given back', async () => {
  expect(await theDoorsReading(runs.givenBack)).toBe(givenBackRead)
  const [, readAt] = /^\d{4}-\d\d-\d\d (\d\d:\d\d):\d\d$/.exec(givenBackRead) ?? []
  if (readAt === undefined) throw new Error(`the ledger's time ${givenBackRead} is not a local stamp`)
  await open(runs.givenBack, 1440, 'light')
  const fact = await theStartedFact()
  expect(fact.text).toMatch(new RegExp(`^Started .*${readAt}${AS_READ.replaceAll('.', '\\.')}`))
  expect(fact.text).not.toContain(UNKNOWN)
}, 120_000)

it('2, 3, 3b and 4: a start the ledger did not read for this run is not the start, and the page says it is unknown', async () => {
  for (const [id, why] of [
    [runs.hookOnly, 'the record names a start time the ledger did not read for this run'],
    [runs.otherStart, 'the ledger read another start time for the pid the record names'],
    [runs.otherPid, 'the ledger read this start time for another process registered against this run'],
    [runs.namesNone, 'the record names no process of its own'],
  ] as const) {
    expect(await theDoorsReading(id), why).toBeNull()
    for (const [width, theme] of [[1440, 'light']] as const) {
      await open(id, width, theme)
      const fact = await theStartedFact()
      expect(fact.text, `${why}, ${theme} ${width}`).toMatch(new RegExp(`^${UNKNOWN.replaceAll('.', '\\.')}`))
      expect(fact.text, `${why}, ${theme} ${width}`).not.toContain(AS_READ)
      expect(fact.stamps, why).toEqual([])
    }
  }
}, 300_000)

it("5: a run's own start time is drawn, whatever the ledger read", async () => {
  expect(await theDoorsReading(runs.ownStart)).toBe(ledgerRead)
  await open(runs.ownStart, 1440, 'light')
  const fact = await theStartedFact()
  expect(fact.stamps).toEqual(['2026-09-29 17:00:00'])
  expect(fact.text).not.toContain(AS_READ)
  expect(fact.text).not.toContain(UNKNOWN)
}, 120_000)

it('6: in the test language the sentence comes from the word lists', async () => {
  await open(runs.read, 1440, 'light', 'xx')
  const marked = await page.locator('.sp-facts').first().locator('.sp-fact').nth(4).locator('dd > *').evaluateAll((parts) => parts.map((one) => (one.textContent ?? '').trim()))
  expect(marked.length, 'the fact draws a sentence').toBeGreaterThan(0)
  for (const one of marked) expect(one, 'a sentence on the run page did not come from the word lists').toMatch(/^⟦/)
  expect(marked.filter((one) => one.startsWith('⟦Started ') && one.includes(AS_READ)), 'the sentence of the start the office read').toHaveLength(1)
}, 120_000)

it('7: a start the ledger read on a row the run withdrew as a mistake is not the start', async () => {
  expect(await theDoorsReading(runs.withdrawn)).toBeNull()
  for (const [width, theme] of [[1440, 'light']] as const) {
    await open(runs.withdrawn, width, theme)
    const fact = await theStartedFact()
    expect(fact.text, `${theme} ${width}`).toMatch(new RegExp(`^${UNKNOWN.replaceAll('.', '\\.')}`))
    expect(fact.text, `${theme} ${width}`).not.toContain(AS_READ)
    expect(fact.stamps).toEqual([])
  }
}, 120_000)

it('8: a running run whose process is not shown to be its own says its start time is unknown, and never both', async () => {
  expect(await theDoorsMark(runs.notItsOwn)).toBe('not-its-own')
  expect(await theDoorsReading(runs.notItsOwn)).toBeNull()
  // ONE VIEW. The start sentence and the process mark do not change with the width or the theme.
  for (const theme of ['light'] as const) for (const width of [1440]) {
    await open(runs.notItsOwn, width, theme)
    expect(await theProcessMark(), `${theme} ${width}`).toContain(NOT_ITS_OWN)
    const fact = await theStartedFact()
    expect(fact.label).toBe('Started')
    expect(fact.text, `${theme} ${width}`).toMatch(new RegExp(`^${UNKNOWN.replaceAll('.', '\\.')}`))
    expect(fact.text, `${theme} ${width}`).not.toContain(AS_READ)
    expect(fact.stamps, `${theme} ${width}`).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${theme} ${width}`).toBeLessThanOrEqual(0)
    await page.screenshot({ path: join(SHOTS, `not-its-own-${width}-${theme}.png`), fullPage: true })
  }
}, 300_000)

it('8b: a running run whose process the office sees running keeps the start the ledger read', async () => {
  expect(await theDoorsMark(runs.seenRunning)).toBe('running')
  const reading = await theDoorsReading(runs.seenRunning)
  expect(reading).toBe(ledgerRead)
  const [, readAt] = /^\d{4}-\d\d-\d\d (\d\d:\d\d):\d\d$/.exec(ledgerRead) ?? []
  await open(runs.seenRunning, 1440, 'light')
  expect(await theProcessMark()).not.toContain(NOT_ITS_OWN)
  const fact = await theStartedFact()
  expect(fact.text).toMatch(new RegExp(`^Started .*${readAt ?? ''}${AS_READ.replaceAll('.', '\\.')}`))
  expect(fact.text).not.toContain(UNKNOWN)
}, 120_000)
