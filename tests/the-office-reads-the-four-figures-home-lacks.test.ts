// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FOUR FIGURES THE HOME PAGE LACKS, EACH A READ ANY PAGE CAN ASK. Wave 13s round 281: packages per line by state,
 * packages done per day, each package's time from taken to live, and the whole suite's minutes per run.
 *
 * WHAT IS PROVED, in a test office with made-up packages, landings and receipts written straight into the records:
 *   1. Packages per line count each package by the state the delegation view gives it. A package with two lines counts in
 *      each, and the reply says how many do. A package with no line is in the no-line row, and an unreadable one is named.
 *      The header's project is read alone; ?projects=all reads every project together, and one project id reads that one.
 *   2. Packages done per day count a package on the day its state turned done: the day its last point was accepted, or
 *      the day its task was confirmed complete. A package accepted and later returned is not done. A day before the first
 *      package was made is not recorded, and says so; a covered day with none done is 0. The span defaults to the last 14
 *      days, and a day that is not a day, a span that runs backwards and a span longer than the most are refused.
 *   3. Time to live gives, for each package first taken inside the span, when it was handed back, when it reached main and
 *      when the live office ran it, each a time or the words for why it is not recorded. The median of each stage is over
 *      the packages that have both of its times, and says how many those are.
 *   4. The live office ran a landing at the first completed upgrade, at or after the landing, to main as that landing or a
 *      later one left it. An upgrade before the landing, or to another commit, did not run it.
 *   5. The whole suite's minutes are each receipt's minutes from start to end, in the span by the day it ended, with their
 *      median and its count. A receipt that ends before it starts has no minutes and says why. A span with no receipt says
 *      so, and names what the records hold.
 */
import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setWordLanguage, t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

/** The made-up projects: the second of case 1, and one each for cases 2, 3 and 5, so no case counts another's records. */
const SECOND = 'made-up-figures-second'
const DONE = 'made-up-figures-done'
const LIVE = 'made-up-figures-live'
const SUITE = 'made-up-figures-suite'

const LINE_A = 'made-up-line-a'
const LINE_B = 'made-up-line-b'
const POINT = 'made-up-point'
const MAKER = { actorType: 'agent', actorId: 'made-up-maker' }
const TAKER = { actorType: 'agent', actorId: 'made-up-taker' }

let t0: TestDb
let app: FastifyInstance
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The person's headers, in one project. */
const inProject = (project: string): Record<string, string> => ({ ...PERSON, 'x-mole-office-workspace': project })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function read(url: string, headers: Record<string, string>): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method: 'GET', url, headers })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

/** One record written straight into the table, with only the columns the table has. */
let made = 0
function aRecord(project: string, kind: string, title: string, data: Record<string, unknown>): string {
  made += 1
  const id = `made-up-figure-${String(made)}`
  const at = '2026-11-01 08:00:00'
  const row: Record<string, unknown> = { id, workspace_id: project, owner_id: 'owner', created_at: at, updated_at: at, kind, title, summary: null, data: JSON.stringify(data), deleted_at: null, origin: 'fixture' }
  const kept = new Set((t0.client.sqlite.prepare('PRAGMA table_info("records")').all() as { name: string }[]).map((one) => one.name))
  const columns = Object.keys(row).filter((one) => kept.has(one))
  t0.client.sqlite.prepare(`INSERT INTO "records" (${columns.map((one) => `"${one}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .run(...columns.map((one) => row[one] ?? null))
  return id
}

/** One act on an inside package, in the order written. */
type AnAct = { act: 'take' | 'handBack' | 'accept' | 'return'; at: string; run?: string }

/** A task holding an inside package of one point, made at `madeAt`, with its acts numbered in the order given. */
function anInsidePackage(project: string, lines: string[], madeAt: string, acts: AnAct[], readable = true): string {
  const takenInside: Record<string, unknown>[] = []
  const handedBack: Record<string, unknown>[] = []
  const acceptances: Record<string, unknown>[] = []
  acts.forEach((one, index) => {
    const order = index + 1
    if (one.act === 'take') takenInside.push({ by: TAKER, at: one.at, order })
    else if (one.act === 'handBack') handedBack.push({ by: TAKER, at: one.at, order, points: [{ pointId: POINT, outcome: 'done', words: 'Made up.' }], ...(one.run === undefined ? {} : { run: one.run }) })
    else acceptances.push({ by: MAKER, at: one.at, order, points: [{ pointId: POINT, answer: one.act === 'accept' ? 'accepted' : 'returned', words: 'Made up.' }] })
  })
  return aRecord(project, 'task', 'A made-up inside package', {
    package: {
      bundleId: 'made-up-bundle', forTheOutside: 'Made up.', acceptance: 'Made up.',
      // AN INSIDE PACKAGE WITH NO PARENT CANNOT BE READ, which is how case 1 makes its unreadable one.
      ...(readable ? { parent: { kind: 'task', id: 'made-up-parent' } } : {}),
      lines, pointIds: [POINT], takenInside, handedBack, acceptances, at: madeAt, by: MAKER,
    },
  })
}

/** A task holding an outside package, confirmed complete at `completedAt` unless that is null. */
function anOutsidePackage(project: string, madeAt: string, completedAt: string | null): string {
  return aRecord(project, 'task', 'A made-up outside package', {
    package: {
      bundleId: 'made-up-bundle', forTheOutside: 'Made up.', suits: 'desk_work', acceptance: 'Made up.',
      acceptanceSource: { file: 'made-up.md', criterion: 'Made up.', commit: 'made-up-commit' }, at: madeAt, by: MAKER,
    },
    ...(completedAt === null ? {} : { completed: { at: completedAt, by: MAKER } }),
  })
}

/** Every state at 0, with the counts given. */
async function byState(counts: Record<string, number>): Promise<Record<string, number>> {
  const { PACKAGE_STATES } = await import('../src/shared/delegation.ts')
  return Object.fromEntries(PACKAGE_STATES.map((state) => [state, counts[state] ?? 0]))
}

/** Each line's row of a reply: its line and its counts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowsOf = (body: any): { line: string | null; byState: Record<string, number>; total: number }[] =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body.lines.map((one: any) => ({ line: one.line, byState: one.byState, total: one.total }))

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t0 = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  setWordLanguage('en')
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t0.file), 'keys.json')))
  for (const project of [SECOND, DONE, LIVE, SUITE]) {
    const filed = await app.inject({ method: 'POST', url: '/api/workspaces', headers: PERSON, payload: { id: project, title: `The made-up project ${project}` } })
    expect(filed.statusCode, filed.body).toBe(201)
  }
}, 60_000)

afterAll(async () => {
  setWordLanguage('en')
  await app?.close()
  t0?.close()
})

describe('the four figures the home page lacks', () => {
  it('1. counts packages per line by the delegation state, twice for two lines, with a no-line row, per project and for all', async () => {
    anInsidePackage('default', [LINE_A], '2026-11-01 09:00:00', [])
    anInsidePackage('default', [LINE_A], '2026-11-01 09:00:00', [{ act: 'take', at: '2026-11-01 10:00:00' }])
    anInsidePackage('default', [LINE_A], '2026-11-01 09:00:00', [{ act: 'take', at: '2026-11-01 10:00:00' }, { act: 'handBack', at: '2026-11-01 11:00:00' }])
    anInsidePackage('default', [LINE_A], '2026-11-01 09:00:00', [
      { act: 'take', at: '2026-11-01 10:00:00' }, { act: 'handBack', at: '2026-11-01 11:00:00' }, { act: 'accept', at: '2026-11-01 12:00:00' },
    ])
    anInsidePackage('default', [LINE_A, LINE_B], '2026-11-01 09:00:00', [{ act: 'take', at: '2026-11-01 10:00:00' }])
    anOutsidePackage('default', '2026-11-01 09:00:00', '2026-11-01 13:00:00')
    const unreadable = anInsidePackage('default', [LINE_A], '2026-11-01 09:00:00', [], false)
    anInsidePackage(SECOND, [LINE_A], '2026-11-01 09:00:00', [])

    const own = await read('/api/figures/packages-by-line', PERSON)
    expect(own.status, own.raw).toBe(200)
    expect(own.body.projects).toEqual(['default'])
    expect(rowsOf(own.body)).toEqual([
      { line: LINE_A, byState: await byState({ to_do: 1, taken: 2, handed_back: 1, done: 1 }), total: 5 },
      { line: LINE_B, byState: await byState({ taken: 1 }), total: 1 },
      { line: null, byState: await byState({ done: 1 }), total: 1 },
    ])
    expect(own.body.packages).toBe(6)
    expect(own.body.inMoreThanOneLine).toBe(1)
    expect(own.body.says).toBe(t('figures.byLine.says', { n: 1 }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(own.body.couldNotRead.map((one: any) => [one.workspaceId, one.recordId])).toEqual([['default', unreadable]])

    const all = await read('/api/figures/packages-by-line?projects=all', PERSON)
    expect(all.status, all.raw).toBe(200)
    expect(all.body.projects).toEqual(expect.arrayContaining(['default', SECOND]))
    expect(rowsOf(all.body)).toEqual([
      { line: LINE_A, byState: await byState({ to_do: 2, taken: 2, handed_back: 1, done: 1 }), total: 6 },
      { line: LINE_B, byState: await byState({ taken: 1 }), total: 1 },
      { line: null, byState: await byState({ done: 1 }), total: 1 },
    ])
    expect(all.body.packages).toBe(7)

    const second = await read(`/api/figures/packages-by-line?projects=${SECOND}`, PERSON)
    expect(second.status, second.raw).toBe(200)
    expect(second.body.projects).toEqual([SECOND])
    expect(rowsOf(second.body)).toEqual([
      { line: LINE_A, byState: await byState({ to_do: 1 }), total: 1 },
      { line: null, byState: await byState({}), total: 0 },
    ])
    expect(second.body.inMoreThanOneLine).toBe(0)
    expect(second.body.couldNotRead).toEqual([])
  })

  it('2. counts packages done on the day they turned done, 0 on a covered day, not recorded before the first package', async () => {
    anInsidePackage(DONE, [LINE_A], '2026-11-03 08:00:00', [
      { act: 'take', at: '2026-11-03 09:00:00' }, { act: 'handBack', at: '2026-11-03 10:00:00' }, { act: 'accept', at: '2026-11-03 11:00:00' },
    ])
    anInsidePackage(DONE, [LINE_A], '2026-11-03 08:30:00', [{ act: 'take', at: '2026-11-03 09:00:00' }, { act: 'accept', at: '2026-11-03 15:00:00' }])
    anOutsidePackage(DONE, '2026-11-03 09:00:00', '2026-11-04 12:00:00')
    // Accepted and later returned: its state is returned, so it is not done on any day.
    anInsidePackage(DONE, [LINE_A], '2026-11-03 10:00:00', [
      { act: 'take', at: '2026-11-03 10:30:00' }, { act: 'accept', at: '2026-11-04 08:00:00' }, { act: 'return', at: '2026-11-04 13:00:00' },
    ])
    // Returned, handed back again, then accepted: done on the day of the acceptance that made it done.
    anInsidePackage(DONE, [LINE_A], '2026-11-03 10:00:00', [
      { act: 'take', at: '2026-11-03 10:30:00' }, { act: 'return', at: '2026-11-03 12:00:00' },
      { act: 'handBack', at: '2026-11-04 09:00:00' }, { act: 'accept', at: '2026-11-04 10:00:00' },
    ])
    // Done after the span ends.
    anInsidePackage(DONE, [LINE_A], '2026-11-03 10:30:00', [{ act: 'take', at: '2026-11-03 11:00:00' }, { act: 'accept', at: '2026-11-06 09:00:00' }])

    const span = await read('/api/figures/packages-done?from=2026-11-02&to=2026-11-05', inProject(DONE))
    expect(span.status, span.raw).toBe(200)
    expect(span.body.projects).toEqual([DONE])
    expect(span.body.from).toBe('2026-11-02')
    expect(span.body.to).toBe('2026-11-05')
    expect(span.body.recordedFrom).toBe('2026-11-03')
    expect(span.body.days).toEqual([
      { day: '2026-11-02', done: null, notRecorded: t('figures.done.beforeTheRecords', { day: '2026-11-03' }) },
      { day: '2026-11-03', done: 2, notRecorded: null },
      { day: '2026-11-04', done: 2, notRecorded: null },
      { day: '2026-11-05', done: 0, notRecorded: null },
    ])
    expect(span.body.total).toBe(4)
    expect(span.body.says).toBe(t('figures.done.says'))

    const { stampInZone, theClockZone, calendarDaysBetweenDayKeys } = await import('../src/shared/time.ts')
    const { FIGURES_SPAN_DAYS } = await import('../src/shared/figures.ts')
    const today = stampInZone(Date.now(), theClockZone()).slice(0, 10)
    const fallback = await read('/api/figures/packages-done', inProject(DONE))
    expect(fallback.status, fallback.raw).toBe(200)
    expect(fallback.body.to).toBe(today)
    expect(fallback.body.days).toHaveLength(FIGURES_SPAN_DAYS.default)
    expect(calendarDaysBetweenDayKeys(fallback.body.from, fallback.body.to)).toBe(FIGURES_SPAN_DAYS.default - 1)
    expect(fallback.body.days.at(-1)).toEqual({ day: today, done: 0, notRecorded: null })

    const notADay = await read('/api/figures/packages-done?from=2026-11-31&to=2026-12-01', inProject(DONE))
    expect(notADay.status, notADay.raw).toBe(400)
    expect(notADay.error).toBe(t('figures.span.notADay', { value: '2026-11-31' }))
    const backwards = await read('/api/figures/packages-done?from=2026-11-05&to=2026-11-02', inProject(DONE))
    expect(backwards.status, backwards.raw).toBe(400)
    expect(backwards.error).toBe(t('figures.span.backwards', { from: '2026-11-05', to: '2026-11-02' }))
    const tooLong = await read('/api/figures/packages-done?from=2026-08-01&to=2026-11-01', inProject(DONE))
    expect(tooLong.status, tooLong.raw).toBe(400)
    expect(tooLong.error).toBe(t('figures.span.tooLong', { most: FIGURES_SPAN_DAYS.most }))
    const unknownWord = await read('/api/figures/packages-done?line=made-up', inProject(DONE))
    expect(unknownWord.status, unknownWord.raw).toBe(400)
  })

  it('3. gives each package taken in the span its stages, each a time or not recorded, and the median of each stage', async () => {
    const { momentOfStampInZone, theClockZone } = await import('../src/shared/time.ts')
    const noRun = anInsidePackage(LIVE, [LINE_A], '2026-11-02 08:00:00', [{ act: 'take', at: '2026-11-03 09:00:00' }, { act: 'handBack', at: '2026-11-03 10:30:00' }])
    const landed = anInsidePackage(LIVE, [LINE_A], '2026-11-02 08:00:00', [
      { act: 'take', at: '2026-11-03 10:00:00' }, { act: 'handBack', at: '2026-11-03 12:00:00', run: 'made-up-run-1' }, { act: 'accept', at: '2026-11-03 12:30:00' },
    ])
    const notBack = anInsidePackage(LIVE, [LINE_A], '2026-11-02 08:00:00', [{ act: 'take', at: '2026-11-03 11:00:00' }])
    const notLanded = anInsidePackage(LIVE, [LINE_A], '2026-11-02 08:00:00', [{ act: 'take', at: '2026-11-03 14:00:00' }, { act: 'handBack', at: '2026-11-03 15:00:00', run: 'made-up-run-5' }])
    anInsidePackage(LIVE, [LINE_A], '2026-11-02 08:00:00', [{ act: 'take', at: '2026-11-04 09:00:00' }])
    const landedMs = momentOfStampInZone('2026-11-03 13:00:00', theClockZone())
    expect(landedMs).not.toBeNull()
    aRecord(LIVE, 'merge_entry', 'A made-up landing', {
      state: 'merged', run: 'made-up-run-1', changeset: { root: 'made-up-repository' },
      integrated: { at: '2026-11-03 13:00:00', time: { instant: new Date(landedMs!).toISOString() }, mainBefore: 'made-up-main-0', mainAfter: 'made-up-main-1' },
    })

    const reply = await read('/api/figures/time-to-live?from=2026-11-03&to=2026-11-03', inProject(LIVE))
    expect(reply.status, reply.raw).toBe(200)
    expect(reply.body.projects).toEqual([LIVE])
    const at = (stamp: string) => ({ at: stamp, notRecorded: null })
    const not = (words: string) => ({ at: null, notRecorded: words })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(reply.body.packages.map((one: any) => ({ recordId: one.recordId, taken: one.taken, handedBack: one.handedBack, onMain: one.onMain, live: one.live }))).toEqual([
      { recordId: noRun, taken: '2026-11-03 09:00:00', handedBack: at('2026-11-03 10:30:00'), onMain: not(t('figures.live.handBackNamesNoRun')), live: not(t('figures.live.notOnMain')) },
      { recordId: landed, taken: '2026-11-03 10:00:00', handedBack: at('2026-11-03 12:00:00'), onMain: at('2026-11-03 13:00:00'), live: not(t('figures.live.noUpgrade')) },
      { recordId: notBack, taken: '2026-11-03 11:00:00', handedBack: not(t('figures.live.noHandBack')), onMain: not(t('figures.live.noHandBack')), live: not(t('figures.live.noHandBack')) },
      {
        recordId: notLanded, taken: '2026-11-03 14:00:00', handedBack: at('2026-11-03 15:00:00'),
        onMain: not(t('figures.live.noLanding', { run: 'made-up-run-5' })), live: not(t('figures.live.notOnMain')),
      },
    ])
    expect(reply.body.medians).toEqual([
      { from: 'taken', to: 'handedBack', minutes: 90, over: 3 },
      { from: 'handedBack', to: 'onMain', minutes: 60, over: 1 },
      { from: 'onMain', to: 'live', minutes: null, over: 0 },
      { from: 'taken', to: 'live', minutes: null, over: 0 },
    ])
    expect(reply.body.says).toBe(t('figures.live.says'))
  })

  it('4. finds the first completed upgrade at or after a landing that ran main as that landing or a later one left it', async () => {
    const { theFirstUpgradeThatRanIt } = await import('../src/shared/figures.ts')
    const landings = [{ ms: 1_000, mainAfter: 'made-up-main-1' }, { ms: 2_000, mainAfter: 'made-up-main-2' }]
    const before = { ms: 900, toCommit: 'made-up-main-1', at: 'made-up-before' }
    const another = { ms: 1_500, toCommit: 'made-up-main-x', at: 'made-up-another' }
    const later = { ms: 2_500, toCommit: 'made-up-main-2', at: 'made-up-later' }
    const last = { ms: 3_000, toCommit: 'made-up-main-1', at: 'made-up-last' }
    expect(theFirstUpgradeThatRanIt(landings[0]!, landings, [before, another, later, last])).toEqual(later)
    expect(theFirstUpgradeThatRanIt(landings[1]!, landings, [before, another, last])).toBeNull()
    expect(theFirstUpgradeThatRanIt(landings[0]!, landings, [before, another])).toBeNull()
  })

  it('5. gives each whole-suite run its minutes and their median, and says plainly when a span holds none', async () => {
    const { WHOLE_SUITE_RECEIPT_EXAMPLE } = await import('../src/shared/whole-suite-receipt.ts')
    const aReceipt = (commit: string, startedAt: string, endedAt: string, green: boolean) =>
      aRecord(SUITE, 'whole_suite_receipt', 'A made-up whole-suite receipt', {
        ...WHOLE_SUITE_RECEIPT_EXAMPLE, commit, startedAt, endedAt,
        ...(green ? {} : { suiteExitCode: 1, failedFiles: ['tests/made-up.test.ts'] }),
      })
    const green = aReceipt('1'.repeat(40), '2026-11-02 10:00:00', '2026-11-02 10:24:00', true)
    const red = aReceipt('2'.repeat(40), '2026-11-03 09:00:00', '2026-11-03 09:40:00', false)
    const backwards = aReceipt('3'.repeat(40), '2026-11-04 12:00:00', '2026-11-04 11:00:00', true)
    aReceipt('4'.repeat(40), '2026-11-06 09:30:00', '2026-11-06 10:00:00', true)

    const reply = await read('/api/figures/suite-minutes?from=2026-11-02&to=2026-11-04', inProject(SUITE))
    expect(reply.status, reply.raw).toBe(200)
    expect(reply.body.projects).toEqual([SUITE])
    expect(reply.body.runs).toEqual([
      { workspaceId: SUITE, recordId: green, commit: '1'.repeat(40), green: true, startedAt: '2026-11-02 10:00:00', endedAt: '2026-11-02 10:24:00', minutes: 24, notRecorded: null },
      { workspaceId: SUITE, recordId: red, commit: '2'.repeat(40), green: false, startedAt: '2026-11-03 09:00:00', endedAt: '2026-11-03 09:40:00', minutes: 40, notRecorded: null },
      {
        workspaceId: SUITE, recordId: backwards, commit: '3'.repeat(40), green: true, startedAt: '2026-11-04 12:00:00', endedAt: '2026-11-04 11:00:00',
        minutes: null, notRecorded: t('figures.suite.endsBeforeStart'),
      },
    ])
    expect(reply.body.median).toEqual({ minutes: 32, over: 2 })
    expect(reply.body.says).toBe(t('figures.suite.says'))

    const none = await read('/api/figures/suite-minutes?from=2026-10-01&to=2026-10-02', inProject(SUITE))
    expect(none.status, none.raw).toBe(200)
    expect(none.body.runs).toEqual([])
    expect(none.body.median).toEqual({ minutes: null, over: 0 })
    expect(none.body.says).toBe(t('figures.suite.none', {
      from: '2026-10-01', to: '2026-10-02', held: t('figures.suite.heldLast', { n: 4, last: '2026-11-06 10:00:00' }),
    }))

    const empty = await read('/api/figures/suite-minutes?from=2026-10-01&to=2026-10-02', inProject(DONE))
    expect(empty.status, empty.raw).toBe(200)
    expect(empty.body.says).toBe(t('figures.suite.none', { from: '2026-10-01', to: '2026-10-02', held: t('figures.suite.heldNone') }))
  })
})
