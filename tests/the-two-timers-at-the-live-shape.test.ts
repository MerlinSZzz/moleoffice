// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOW REMINDERS AND THE PRESENCE CLOCK, ON AN OFFICE OF 22 OCTOBER'S SHAPE: THE SAME ANSWERS, IN SHORT RUNS.
 *
 * On 22 October 2026 the live server's log named the two timers that held its thread longest. The flow reminders ran
 * 1,087 times for about 3.3 s each, and the presence clock 278 times for up to 4.7 s. Wave 13q made both short and
 * changed no answer. This file holds both halves of that.
 *
 * THE OFFICE is tests/the-office-on-22-october.ts: the live counts of that day, with the clock pinned. A server starts
 * on it, and for 120 minutes each minute writes what the live office's minutes after a start wrote. A person's page is
 * open, as one was on the live server, so the presence clock looks.
 *
 * THE TIMERS ARE THE SERVER'S OWN. `startTheReminders` and `eventRoutes` are called as the server calls them, while
 * `setInterval` is caught, and the callbacks they hand it are called once each fixture minute. Only Date is moved.
 * Each callback is given the thread until it has been quiet for a moment, so work a timer hands to later turns of the
 * loop is done and counted in its minute. After the start, the timers are given up to a minute, the time before the
 * flow reminders' first run on a server.
 *
 * THE SAME ANSWERS, AND ONLY WHAT THE TWO TIMERS DECIDE. For the start and for each minute, the test takes:
 * - for each message a timer wrote, its recipients, its kind (the notice it is), its text and the minute;
 * - for each event the page was sent, its type (the event's name), its target (who it names) and the minute.
 * In a message's text, each card's duties are taken as the card's name and not as its words. The idle reminder says
 * the duties of the card its agent holds, and those words are the card's, not the timers'. The test reads them where
 * the cards keep them, so a card given new duties does not move the hash, and a reminder that says another card's
 * duties, or only part of them, does.
 * What is compared is a SHA-256 of that, taken at the code before wave 13q changed the timers, with two counts beside
 * it so a failure says something. The hash is narrow so that a change elsewhere on main does not move it. It holds no
 * row id, no column a timer does not set and no row whole, so a column main adds to a message or to its delivery, a
 * table main fills with each record written, or a field main adds to an event, is not in it. So it does not see the
 * delivery, revision and change rows the office writes with each message, nor a row a timer changes in place. Every
 * id made after the office is built is made in turn and not at random (`idsInTurn`), so an id a message's text names
 * is the same in every run.
 *
 * SHORT RUNS, HELD TO A GENEROUS CEILING. No single named run of either timer, from the start to the last minute, holds
 * the thread longer than `A_RUN_CEILING_MS`, 2,000 ms. And in each of the 120 minutes, the flow reminders' runs add up
 * to no more than that. What the start itself does before the first minute is in the first case and not in the second;
 * its total is printed. A time moves with the load on the machine. Held to `A_LONG_RUN_MS`, the 250 ms past which the
 * server names a run as long, these two cases failed in three runs out of three under an outside load of 9 to 14. So
 * the runs and minutes past 250 ms are printed and not asserted. The ceiling is a gross check only. It sees a return to
 * the 3 to 5 s of the live server before wave 13q. It does not see the code before wave 13q on this office, whose
 * longest run here was 1,826 ms. Nor does it see a presence look that reads the project's session rows once for each
 * of its two readings, which took under 1 s each here. Which is why the answers and the two counts below are the guard.
 *
 * LESS WORK, COUNTED AS THE SERVER COUNTS A REQUEST'S. A time moves with the load on the machine, and a count does not.
 * So two pieces of work are also counted by lib/slow-requests.ts:
 * - The flow reminders' pass at minute 120. The rows its statements give or change are at most `THE_LAST_PASS_ROWS`.
 *   Its statements are printed and not held to a number, because wave 13q made more of them: the reply reminder now
 *   asks two short questions about each delivery where it asked one long one.
 * - The presence clock's look in each of the 120 minutes. The rows its statements give or change are at most
 *   `A_LOOKS_ROWS` in every one of them. Its statements are printed. Most of its rows are the project's session rows,
 *   which the look reads once and hands to both of its readings, the presence and who is answering as each agent.
 * The count does not see the rows SQLite reads inside one statement, because this build of SQLite has no counter for
 * them. Those rows were most of the reply reminder's time before wave 13q, 961 ms at minute 120. The ceiling does not
 * see that, and the printed minutes past 250 ms show it. Nor does it see how much of each session row is read: the
 * look reads only the fields its readers use, and a look that read every field would give the same count.
 *
 * WHAT IS PINNED, besides the clock: each setting the two timers read, at its built-in value, whatever the .env of
 * the checkout says. A test office reads the .env of its checkout, or the main checkout's when a worktree has none.
 * The message worker is off, so no pass starts a run.
 *
 * When an answer is changed on purpose, the hash here is changed with the reason in the commit's message, in a commit
 * of its own before the code that changes the answer.
 */
import { createHash, type Hash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { settingNamed } from '../src/config/settings.mjs'
import type { ANamedRun } from '../src/server/lib/named-timers.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_MEASURED_NOW } from './the-office-of-the-slowest-reads.ts'
import { buildTheOfficeOn22October, theMinutesAfterAStart } from './the-office-on-22-october.ts'

const MINUTE = 60_000
const MINUTES = 120
/**
 * The most rows the flow reminders' statements may give or change in the pass at minute 120. The code before wave 13q
 * goes past it, and wave 13q's stays under it; the test prints the count of each run. Most of the fall is in the
 * broadcasts, which read each secretary's messages again every minute before.
 */
const THE_LAST_PASS_ROWS = 15_000
/**
 * The most rows the presence clock's statements may give or change in any one minute's look. It is just above the most
 * of wave 13q's code. A look whose two readings each read the session rows for themselves goes past it, as the code
 * before wave 13q does. The test prints the count of each run.
 */
const A_LOOKS_ROWS = 27_000
/** The longest one run of either timer may hold the thread, and the longest the flow reminders may hold it in a minute. */
const A_RUN_CEILING_MS = 2_000

/** Each setting the two timers read. Listed by watching what one pass and one look read on this office. */
const THE_SETTINGS_THEY_READ = [
  'MOLE_OFFICE_ALIVE_WITHIN_MINUTES',
  'MOLE_OFFICE_BROADCAST_LEAD_MINUTES',
  'MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES',
  'MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE',
  'MOLE_OFFICE_BROADCAST_TIMES',
  'MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT',
  'MOLE_OFFICE_EVENT_RING',
  'MOLE_OFFICE_IDLE_REMINDER_HOURS',
  'MOLE_OFFICE_MAIN_WORLD_SUPERVISORS',
  'MOLE_OFFICE_MAIN_WORLD_WORKERS',
  'MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS',
  'MOLE_OFFICE_MODULE_REMINDER_SECRETARIES',
  'MOLE_OFFICE_PERSON_ALIVE_WITHIN_SECONDS',
  'MOLE_OFFICE_REPLY_REMINDER_MINUTES',
  'MOLE_OFFICE_RUN_WAITS_MINUTES',
] as const

/**
 * What the two timers wrote and told, at the code before wave 13q: the hash, the messages the timers wrote, and the
 * events the page was sent. The hash is of what the timers decide and nothing else, so that a change elsewhere on main
 * does not move it. A hash of every row whole was moved twice by main, and neither time had anything the timers decide
 * changed. Then new duties on the cards moved it a third time, because the hash held each card's duties word for word.
 * So the duties are taken as the card's name, and the hash was taken again at main ad7612efc. There the hash of the
 * words was still the one taken at main 2f681e43f, before wave 13q, so the lines of both are the same.
 */
const BEFORE = { hash: '7ac318232c21c4560b2340e336865e7193d8d901213ee51aa3adc731f8b4b664', messagesWritten: 94, eventsSent: 94 }

/** One of the two timers' turns in one minute, or the start. */
interface ATurn {
  minute: number
  timer: 'the flow reminders' | 'the presence clock' | 'the start'
  runs: ANamedRun[]
}

let t: TestDb
let app: FastifyInstance
const turns: ATurn[] = []
let answers = { hash: '', messagesWritten: 0, eventsSent: 0 }
/** What the flow reminders' pass at the last minute did inside SQLite. */
let theLastPassDid = { statements: 0, rows: 0 }
/** What the presence clock's look did inside SQLite, minute by minute. */
const theLooksDid: { minute: number; statements: number; rows: number }[] = []

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: THE_MEASURED_NOW })
  // EACH SETTING AT ITS BUILT-IN VALUE. The two with none mean the same empty as unset.
  for (const name of THE_SETTINGS_THEY_READ) vi.stubEnv(name, settingNamed(name).fallback ?? '')
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  const sqlite = t.client.sqlite
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  const { readTheRoleCards, theRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  const { readTheOfficeOwner } = await import('../src/server/db/owner-setting.ts')
  const person = readTheOfficeOwner(sqlite)?.id
  if (person === undefined) throw new Error('The test office has no owner, so there is nobody whose page is open.')
  buildTheOfficeOn22October(sqlite, person, THE_MEASURED_NOW)
  // IDS MADE IN TURN FROM HERE ON, so the secretariat group, which the fixture's minutes write to, has the same id in every run.
  const { idsInTurn } = await import('../src/server/lib/ids.ts')
  const endTheTurn = idsInTurn('the two timers at the live shape')
  // WHAT A SERVER'S START MAKES BEFORE ITS TIMERS: the secretariat group and each secretary's broadcast schedule.
  const { syncTheSecretariatGroup } = await import('../src/server/lib/secretariat.ts')
  syncTheSecretariatGroup()
  const { syncTheBroadcastSchedules } = await import('../src/server/lib/broadcast.ts')
  syncTheBroadcastSchedules()
  // A TEST OFFICE IS NOT THE OFFICE, so the flow reminders read none of this machine's sandboxes.
  const { theOfficeIsInThisDatabase } = await import('../src/server/lib/office.ts')
  expect(theOfficeIsInThisDatabase()).toBe(false)

  const timers = await import('../src/server/lib/named-timers.ts')
  const reminders = await import('../src/server/lib/reminders.ts')
  const { eventRoutes, presenceMayHaveChanged } = await import('../src/server/api/events.ts')
  const { answeringLookNow } = await import('../src/server/lib/answering-told.ts')
  const events = await import('../src/server/lib/events.ts')
  const { aFreshCount, countedTo, measureTheStatementsOf } = await import('../src/server/lib/slow-requests.ts')
  // EVERY STATEMENT IS WRAPPED AS THE SERVER'S START WRAPS IT, and counted only inside `countedTo`.
  measureTheStatementsOf(sqlite)
  timers.forgetTheNamedRuns()

  /**
   * Give the thread to the timers until no named run has ended for `quietMs`, or for `atMostMs` at most, and return
   * every named run since `began`, the moment before the timer was called.
   */
  const letTheThreadRun = async (began: number, quietMs: number, atMostMs: number): Promise<ANamedRun[]> => {
    const seen: ANamedRun[] = []
    for (;;) {
      await new Promise((done) => setTimeout(done, 5))
      const now = performance.now()
      for (const run of timers.theNamedRunsAcross(began, now)) if (!seen.includes(run)) seen.push(run)
      const lastEnded = seen.reduce((latest, run) => Math.max(latest, run.endedAt), began)
      if (now - lastEnded >= quietMs || now - began >= atMostMs) return seen
    }
  }

  // THE PAGE, opened as the stream route opens one: its first reading is taken and nothing is announced.
  const told: string[] = []
  const page = events.pageOpened({ workspaceId: 'default', who: { kind: 'person', id: person }, send: (one) => told.push(JSON.stringify(one)) })
  presenceMayHaveChanged([])
  presenceMayHaveChanged([{ kind: 'person', id: person }])
  answeringLookNow([])
  told.length = 0

  // WHAT THE TWO TIMERS DECIDE, written to the hash with the minute: of each message, its recipients, its kind and its
  // text; of each event, its type and its target. A message a timer wrote is a message record added in its turn.
  const hash: Hash = createHash('sha256')
  const write = (line: string): void => {
    hash.update(line)
    hash.update('\n')
  }
  // EACH CARD'S DUTIES AS THE CARD'S NAME, read as the idle reminder reads them, from the card's words in this office.
  // The longest first, so that duties holding another card's are taken whole.
  const { theCardInTheOfficesWords } = await import('../src/server/lib/card-words.ts')
  const theCardsInTheText = (text: unknown): unknown => {
    if (typeof text !== 'string') return text
    const cards = theRoleCards()
      .cards.map((card) => ({ name: card.name, duties: theCardInTheOfficesWords(card).duties }))
      .filter((card) => card.duties !== '')
      .sort((a, b) => b.duties.length - a.duties.length)
    return cards.reduce((said, card) => said.split(card.duties).join(`<the duties of the ${card.name} card>`), text)
  }
  const theNewestRecord = (): number => (sqlite.prepare('SELECT coalesce(max(rowid), 0) AS n FROM records').get() as { n: number }).n
  const theTargetOf = (event: { name: string; to?: unknown; who?: unknown }): unknown => {
    if (event.to !== undefined) return event.to
    if (event.who !== undefined) return event.who
    throw new Error(`The test cannot tell whom a ${event.name} event names, so it cannot take that event's target.`)
  }
  const takeWhatTheyDecided = (minute: number, newestBefore: number): void => {
    const messages = sqlite.prepare("SELECT title, data FROM records WHERE rowid > ? AND kind = 'message' ORDER BY rowid").all(newestBefore) as { title: string; data: string }[]
    for (const { title, data } of messages) {
      const message = JSON.parse(data) as { to?: unknown; notice?: unknown; body?: unknown; saidInFull?: unknown }
      const text = [title, message.body ?? null, message.saidInFull ?? null].map(theCardsInTheText)
      write(JSON.stringify({ minute, recipients: message.to ?? null, kind: message.notice ?? null, text }))
    }
    for (const one of told) {
      const { event } = JSON.parse(one) as { event: { name: string; to?: unknown; who?: unknown } }
      write(JSON.stringify({ minute, type: event.name, target: theTargetOf(event) }))
    }
    answers.messagesWritten += messages.length
    answers.eventsSent += told.length
  }

  // THE SERVER'S START: its two timers, with the callbacks they hand to setInterval caught.
  const newestBeforeTheStart = theNewestRecord()
  const caught: (() => unknown)[] = []
  const interval = vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => unknown) => {
    caught.push(callback)
    return { unref() {}, ref() {} } as unknown as NodeJS.Timeout
  }) as typeof setInterval)
  const start = new Date(THE_MEASURED_NOW.getTime())
  const started = performance.now()
  try {
    reminders.startTheReminders('default', () => undefined)
    const reminded = caught.length
    app = Fastify()
    await eventRoutes(app)
    // THE FIRST INTERVAL EACH STARTS IS THE ONE NAMED HERE: the pass, and then the presence look.
    caught.splice(1, reminded - 1)
  } finally {
    interval.mockRestore()
  }
  const [flowReminders, presenceClock] = caught
  if (flowReminders === undefined || presenceClock === undefined) throw new Error('The server started fewer than two timers.')
  turns.push({ minute: 0, timer: 'the start', runs: await letTheThreadRun(started, 200, MINUTE) })
  takeWhatTheyDecided(0, newestBeforeTheStart)

  // A TIMER'S TURN. What the fixture's minute wrote before it, and told the page, is not the timer's.
  const aTurn = async (minute: number, timer: ATurn['timer'], callback: () => unknown): Promise<void> => {
    const newestBefore = theNewestRecord()
    told.length = 0
    const began = performance.now()
    callback()
    turns.push({ minute, timer, runs: await letTheThreadRun(began, 20, MINUTE) })
    takeWhatTheyDecided(minute, newestBefore)
  }

  const minute = theMinutesAfterAStart(sqlite, person, start)
  for (let m = 1; m <= MINUTES; m++) {
    vi.setSystemTime(start.getTime() + m * MINUTE)
    minute(m)
    if (m < MINUTES) await aTurn(m, 'the flow reminders', flowReminders)
    else {
      const did = aFreshCount()
      await aTurn(m, 'the flow reminders', () => countedTo(did, flowReminders))
      theLastPassDid = { statements: did.statements, rows: did.rows }
    }
    const looked = aFreshCount()
    await aTurn(m, 'the presence clock', () => countedTo(looked, presenceClock))
    theLooksDid.push({ minute: m, statements: looked.statements, rows: looked.rows })
  }
  answers = { ...answers, hash: hash.digest('hex') }
  events.pageClosed(page)
  endTheTurn()
}, 1_800_000)

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await app?.close()
  t?.close()
})

describe('the flow reminders and the presence clock, on an office of 22 October', () => {
  // NARROW ON PURPOSE: the hash holds only what the two timers decide, so that a change elsewhere on main does not move it.
  it('write and tell the page what they wrote and told before wave 13q, minute by minute', () => {
    expect(answers).toEqual(BEFORE)
  })

  it(`hold the thread no longer than ${String(A_RUN_CEILING_MS)} ms in any one run`, async () => {
    const { A_LONG_RUN_MS } = await import('../src/server/lib/named-timers.ts')
    const runs = turns.flatMap((turn) =>
      turn.runs.map((run) => ({ ms: run.endedAt - run.startedAt, said: `minute ${String(turn.minute)}, ${run.name}: ${(run.endedAt - run.startedAt).toFixed(0)} ms` })),
    )
    const start = turns.find((turn) => turn.timer === 'the start')?.runs ?? []
    console.log(`The start held the thread ${start.reduce((sum, run) => sum + run.endedAt - run.startedAt, 0).toFixed(0)} ms in ${String(start.length)} runs.`)
    const long = runs.filter((run) => run.ms > A_LONG_RUN_MS).map((run) => run.said)
    console.log(`Runs longer than ${String(A_LONG_RUN_MS)} ms: ${long.length === 0 ? 'none' : long.join('; ')}.`)
    expect(runs.filter((run) => run.ms > A_RUN_CEILING_MS).map((run) => run.said)).toEqual([])
  })

  it(`as the flow reminders, hold the thread no longer than ${String(A_RUN_CEILING_MS)} ms in each minute`, async () => {
    const { A_LONG_RUN_MS } = await import('../src/server/lib/named-timers.ts')
    const minutes = turns
      .filter((turn) => turn.timer === 'the flow reminders')
      .map((turn) => ({ minute: turn.minute, ms: turn.runs.reduce((sum, run) => sum + run.endedAt - run.startedAt, 0) }))
    const said = (one: { minute: number; ms: number }): string => `minute ${String(one.minute)}: ${one.ms.toFixed(0)} ms`
    const long = minutes.filter((one) => one.ms > A_LONG_RUN_MS).map(said)
    console.log(`Minutes in which the flow reminders held the thread longer than ${String(A_LONG_RUN_MS)} ms: ${long.length === 0 ? 'none' : long.join('; ')}.`)
    expect(minutes.filter((one) => one.ms > A_RUN_CEILING_MS).map(said)).toEqual([])
  })

  it(`at minute ${String(MINUTES)}, as the flow reminders, give or change at most ${String(THE_LAST_PASS_ROWS)} rows`, () => {
    console.log(`At minute ${String(MINUTES)} the flow reminders ran ${String(theLastPassDid.statements)} statements, which gave or changed ${String(theLastPassDid.rows)} rows.`)
    // A PASS COUNTED AS NOTHING WAS NOT COUNTED: every pass reads the office's rows at least once.
    expect(theLastPassDid.statements, 'statements counted at all').toBeGreaterThan(0)
    expect(theLastPassDid.rows, 'rows given or changed').toBeLessThanOrEqual(THE_LAST_PASS_ROWS)
  })

  it(`as the presence clock, give or change at most ${String(A_LOOKS_ROWS)} rows in each minute's look`, () => {
    const said = (one: (typeof theLooksDid)[number]): string => `minute ${String(one.minute)}: ${String(one.rows)} rows in ${String(one.statements)} statements`
    const most = theLooksDid.reduce((a, b) => (b.rows > a.rows ? b : a), { minute: 0, statements: 0, rows: 0 })
    const fewest = theLooksDid.reduce((a, b) => (b.statements < a.statements ? b : a), { minute: 0, statements: Infinity, rows: 0 })
    const rows = theLooksDid.map((one) => one.rows)
    console.log(
      `The presence clock's ${String(theLooksDid.length)} looks each gave or changed from ${String(Math.min(...rows))} to ${String(Math.max(...rows))} rows. ` +
        `The first with the most, ${said(most)}. The fewest statements in one look, ${said(fewest)}.`,
    )
    expect(theLooksDid.map((one) => one.minute), 'a look counted in every minute').toEqual(Array.from({ length: MINUTES }, (_, at) => at + 1))
    // A LOOK COUNTED AS NOTHING WAS NOT COUNTED: with a page open, every look reads the project's session rows.
    expect(fewest.statements, 'statements counted in every look').toBeGreaterThan(0)
    expect(theLooksDid.filter((one) => one.rows > A_LOOKS_ROWS).map(said), 'looks past the bound').toEqual([])
  })
})
