// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE MEASURES ITS LAST DAYS, ONE DAY AT A TIME, FROM ITS OWN RECORDS.
 *
 * GET /api/merge-queue/measures?days=N reads the merge entries, the change log of their fix rounds, the main-suite
 * receipts and the stable upgrade notices, and answers per calendar day in the office's zone, with the moments each day
 * starts and ends. It writes nothing. Every figure says where it comes from, the one estimate says it is one, and the
 * figures the office cannot give are named in words. The merge queue page draws the answer as one small table.
 *
 * WHAT IS PROVED, against a throwaway database and HOME, with this process's zone set to Europe/London and its clock at
 * noon on 26 October 2026. The clocks went back at 02:00 summer time on 25 October, so that day had 25 hours. Every
 * record here is a made-up fixture whose answer is worked out by hand below.
 *
 *   1. Per day, for the seven days 20 to 26 October: the entries landed; the median and the 90th percentile of the wait
 *      from submitted to landed and from judged to landed, measured between moments, with one entry that waited across
 *      the hour that came twice; the tests by their kept choice and the whole-suite reasons by case; hand-backs; the fix
 *      rounds the office opened, exact, from the change log, counting one whose entry bounced after it opened and leaving
 *      out one its starter already had going; take-backs; bounces by cause; receipts with their red files; and the hours
 *      main was red, green or not known by those receipts. A landing one second before the window is left out, and one
 *      at its first second is counted. With no upgrade notice, every day says in words that the stable office's commit
 *      is not known.
 *   2. The days asked for: 2 gives 25 and 26 October; 0, 31, 1.5, words and an unknown key are refused with 400.
 *   3. The door writes nothing, and the same records give the same answer.
 *   4. Stable against main: commits behind, read from git in the pair's two checkouts; unknown in words when this
 *      process has no pair, or when the stable commit is not in the development checkout.
 *   5. The page draws one column a day, the figures, where each comes from, the estimate as an estimate, the fix rounds
 *      as an exact count, absence in words, the stable office at each day's end, and stable against main.
 *   6. The stable office at each day's end, from the upgrade notices: a day before any notice says so in words; a day
 *      with no notice of its own keeps the commit of the last one; a refused upgrade leaves the earlier commit; a
 *      completed one puts its own commit live; an upgrade not ended by the day's end leaves the day unknown. Main at
 *      the day's end is the commit its last landing made, and the commits between are counted by git. With no landing
 *      yet, or no checkout to count in, the day says so in words. The same records give the same answer.
 *
 * MUTATION PROOF (each after a green control; each turns the cases named red, and restoring it turns them green):
 *
 *   - In src/server/lib/merge-queue-measures.ts, read the landing's stamp alone, without the clock observation beside
 *     it. Case 1 goes red: the entry that waited across the repeated hour is unmeasured, because its stamp alone names
 *     two moments.
 *   - In the same file, take the median in place of the 90th percentile. Case 1 goes red.
 *   - In the same file, count an entry's whole-suite reasons once, whatever their cases. Case 1 goes red.
 *   - In the same file, count a hand-back with no fix round as a fix round. Case 1 goes red.
 *   - In the same file, count the fix rounds from the landed entries alone, as round 91 did. Case 1 goes red: the entry
 *     that bounced after its round opened is not counted.
 *   - In the same file, count a round opened for the entry's starter. Case 1 goes red.
 *   - In the same file, date a take-back by its bounce. Case 1 goes red.
 *   - In the same file, count every receipt as red. Case 1 goes red.
 *   - In the same file, start main's red at the receipt's end and not at the landing of the commit it tested. Case 1
 *     goes red.
 *   - In the same file, give each day 24 hours. Case 1 goes red.
 *   - In the same file, count commits ahead in place of behind. Case 4 goes red.
 *   - In the same file, read a refused upgrade as its new commit. Case 6 goes red.
 *   - In the same file, read only the notices filed on the day itself. Case 6 goes red.
 *   - In src/server/api/merge-queue.ts, let ?days go to 31. Case 2 goes red.
 *   - In src/web/components/MergeQueueMeasures.tsx, leave out where each figure comes from. Case 5 goes red.
 *   - In the same file, leave out the row of the stable office at each day's end. Case 5 goes red.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { Actor } from '../src/server/lib/records.ts'

const WORKSPACE = 'default'
const ROOT = '/synthetic/lane-of-the-measures'
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const headers = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
/** The person's key in the throwaway office, so the person can register the agents that file upgrade notices. */
const personKey = randomBytes(32).toString('hex')

/** Noon winter time, 26 October 2026: the moment every case asks at. */
const NOW = Date.UTC(2026, 9, 26, 12, 0, 0)
/** 01:50 summer time, 25 October 2026, in the first pass of the hour that came twice. */
const FIRST_PASS = Date.UTC(2026, 9, 25, 0, 50, 0)
/** 01:10 winter time, twenty minutes later, in the second pass. */
const SECOND_PASS = Date.UTC(2026, 9, 25, 1, 10, 0)
const MINUTE = 60_000

/** Commits main became, or a receipt tested. Made up. */
const C0 = '1'.repeat(40)
const C1 = '2'.repeat(40)
const C2 = '3'.repeat(40)
const CB = '4'.repeat(40)

/** The seven days of the window, oldest first. */
const SEVEN_DAYS = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']

/** Every figure the reply says the source of. */
const FIGURES = ['landed', 'submittedToLanded', 'judgedToLanded', 'tested', 'handBacks', 'fixRounds', 'takeBacks', 'bounced', 'receipts', 'mainRed', 'stableAtDayEnd', 'stable']

/** A wait figure with nothing measured. */
const NO_WAIT = { measured: 0, unmeasured: 0, medianMinutes: null, p90Minutes: null }

/** A day on which the office opened no fix round. */
const NO_ROUND = { total: 0, line: 0, sheriff: 0 }

type Reply = Record<string, any>
type Say = (key: string, values?: Record<string, string | number>) => string

/** Where a module the change adds is, read by path so this file type-checks before it exists. */
const modulePath = (relative: string): string => new URL(relative, import.meta.url).pathname

/** The text React writes for words, so a sentence can be found in the markup. */
const escaped = (words: string): string => words.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#x27;')

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** A made-up commit in the throwaway checkout `dir`. */
function aCommit(dir: string, words: string): string {
  writeFileSync(join(dir, 'file.txt'), `${words}\n`)
  git(dir, 'add', 'file.txt')
  git(dir, '-c', 'user.name=Synthetic fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', words)
  return git(dir, 'rev-parse', 'HEAD')
}

describe('the merge queue measures its days', () => {
  let t: TestDb
  let app: FastifyInstance
  let door: typeof import('../src/server/lib/merge-entry-door.ts')
  let time: typeof import('../src/shared/time.ts')
  let receipts: typeof import('../src/shared/whole-suite-receipt.ts')
  let home: string
  const saved = { TZ: process.env.TZ, HOME: process.env.HOME }

  beforeEach(async () => {
    process.env.TZ = 'Europe/London'
    home = mkdtempSync(join(tmpdir(), 'queue-measures-days-'))
    process.env.HOME = home
    t = await freshDb()
    writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
    app = (await apiApp()).app
    await app.ready()
    door = await import('../src/server/lib/merge-entry-door.ts')
    time = await import('../src/shared/time.ts')
    receipts = await import('../src/shared/whole-suite-receipt.ts')
    // The clock starts before every moment a fixture sets, so each fixture only moves it forward.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 19, 12, 0, 0) })
  }, 60_000)

  afterEach(async () => {
    vi.useRealTimers()
    await app?.close()
    t?.close()
    delete (globalThis as { window?: unknown }).window
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(home, { recursive: true, force: true })
  })

  /** A stored stamp and the clock observation beside it, as the queue writes them at `ms`. */
  function observed(ms: number): { at: string; time: unknown } {
    const seen = time.clockStamp(() => new Date(ms))
    return { at: seen.stamp, time: seen }
  }

  /** A merge entry written at `submitted`, as the queue writes one, with the fields given. Synthetic. */
  function anEntry(name: string, state: string, submitted: number, more: Record<string, unknown>, withObservation = true): string {
    vi.setSystemTime(submitted)
    return door.asTheMergeQueue(() =>
      t.api.createRecord({
        kind: 'merge_entry',
        title: `Synthetic entry ${name}`,
        workspaceId: WORKSPACE,
        origin: 'fixture',
        actor: person,
        data: {
          run: `synthetic-run-${name}`,
          seal: { id: `synthetic-seal-${name}`, hash: `synthetic-hash-${name}` },
          changeset: { adapter: 'files', root: ROOT, operations: [] },
          state,
          submittedBy: { kind: 'agent', id: 'synthetic-worker' },
          ...(withObservation ? { submittedTime: time.clockStamp(() => new Date(submitted)) } : {}),
          ...more,
        },
      }),
    ).id
  }

  type LandingAt = { submitted: number; judged: number; landed: number; tested?: number }
  type LandingMore = { tested?: Record<string, unknown>; tests?: Record<string, unknown>; mainAfter?: string }

  /** The fields of a landed entry: judged, tested when `tested` is given, and landed, each at its moment. */
  function theLanding(name: string, at: LandingAt, more: LandingMore): { verdict: unknown; tested?: unknown; integrated: unknown } {
    const landed = observed(at.landed)
    return {
      verdict: { ...observed(at.judged), how: 'synthetic' },
      ...(at.tested === undefined ? {} : { tested: { ...observed(at.tested), green: true, log: '/synthetic/log', ...more.tested } }),
      integrated: { ...landed, entry: name, mainBefore: '0'.repeat(40), mainAfter: more.mainAfter ?? `${name}`.padEnd(40, '0'), ...(more.tests === undefined ? {} : { tests: { log: '/synthetic/log', ...more.tests } }) },
    }
  }

  /** A landed entry, written as one record at its submission. */
  function aLanding(name: string, at: LandingAt, more: LandingMore = {}): string {
    return anEntry(name, 'merged', at.submitted, theLanding(name, at, more))
  }

  /** A wait for a fix round started at `ms`, five minutes long, with the line's supervisor asked, as the office stores one. */
  function aFixRoundWait(ms: number): Record<string, unknown> {
    const since = time.clockStamp(() => new Date(ms))
    const due = time.clockStamp(() => new Date(ms + 5 * MINUTE))
    const ask = { for: 'line', agent: 'synthetic-line', at: since.stamp, brief: '/synthetic/briefs/fix-round.md', status: 202, said: 'Synthetic: the next round is asked for.', holder: 'synthetic-holder' }
    return { since: since.stamp, time: since, until: due.stamp, dueAt: due.instant, timeZone: 'Europe/London', minutes: 5, asks: [ask] }
  }

  /** The fix round opens at `ms`, written onto the wait as the office writes it: a merge of `opened` alone. */
  function aFixRoundOpens(id: string, ms: number, whose: 'line' | 'sheriff' | 'starter', run: string): void {
    vi.setSystemTime(ms)
    const opened = { at: observed(ms).at, for: whose, agent: `synthetic-${whose}`, run }
    door.asTheMergeQueue(() => t.api.patchRecord(id, { dataPatch: { waitsForAFixRound: { opened } } }, person))
  }

  /** The entry moves on at `ms` with `fields`, and the wait goes, as it does on every arrival. */
  function movesOn(id: string, ms: number, fields: Record<string, unknown>): void {
    vi.setSystemTime(ms)
    door.asTheMergeQueue(() => t.api.patchRecord(id, { dataPatch: { ...fields, waitsForAFixRound: null } }, person))
  }

  /** An entry that waited for a fix round, whose round opened at `opens` for `whose`, and which then landed. */
  function aLandingAfterAFixRound(name: string, at: LandingAt & { opens: number }, whose: 'line' | 'starter', more: LandingMore): string {
    const { integrated, ...beforeLanding } = theLanding(name, at, more)
    const id = anEntry(name, 'testing', at.submitted, { ...beforeLanding, waitsForAFixRound: aFixRoundWait(at.tested ?? at.judged) })
    aFixRoundOpens(id, at.opens, whose, `synthetic-fix-run-${name}`)
    movesOn(id, at.landed, { state: 'merged', integrated })
    return id
  }

  /** A bounced entry, bounced at the stored stamp `at`, which is all a bounce keeps. */
  function aBounce(name: string, submitted: number, reason: string, at: string, more: Record<string, unknown> = {}): string {
    return anEntry(name, 'bounced', submitted, { bounced: { reason, at, files: [] }, ...more })
  }

  /** A main-suite receipt for `commit`, ended at the stored stamp `endedAt`. Version 1 red names `red`; version 2 runs `alone`. */
  function aReceipt(name: string, commit: string, endedAt: string, shape: { red?: string[]; alone?: { file: string; outcome: 'green' | 'red' }[] }): { id: string; data: unknown } {
    const ended = time.momentOfStampInZone(endedAt, 'UTC')!
    const report = (name: 'log' | 'report') => ({ name, path: `/srv/example/receipts/alone/${name}.txt`, sha256Base64: receipts.WHOLE_SUITE_RECEIPT_EXAMPLE.artifacts[0]!.sha256Base64 })
    const failed = shape.red ?? shape.alone?.map((one) => one.file) ?? []
    const data = {
      ...receipts.WHOLE_SUITE_RECEIPT_EXAMPLE,
      repository: ROOT,
      commit,
      startedAt: time.stampInZone(ended - 20 * MINUTE, 'UTC'),
      endedAt,
      ...(failed.length === 0 ? {} : { suiteExitCode: 1, failedFiles: failed, failedTests: failed.map((file) => ({ file, name: 'Synthetic failing test' })) }),
      ...(shape.alone === undefined ? {} : { version: 2, errorsOutsideTests: 0, aloneRuns: shape.alone.map((one) => ({ file: one.file, outcome: one.outcome, exitCode: one.outcome === 'green' ? 0 : 1, artifacts: [report('log'), report('report')] })) }),
    }
    const id = t.api.createRecord({ kind: 'whole_suite_receipt', title: `Synthetic receipt ${name}`, workspaceId: WORKSPACE, data, actor: person }).id
    return { id, data }
  }

  /**
   * THE FIXTURES, AND THE ANSWER WORKED OUT BY HAND. Times are UTC in the code and said in the office's wall time here.
   *
   *   E00   submitted 19 Oct 23:00, judged 23:30, landed 20 Oct 00:00 summer time: 60 and 30 minutes, on 20 October.
   *   E0    landed 19 Oct 23:59:59 summer time, one second before the window: not counted.
   *   E6    submitted 24 Oct 17:00, judged 17:30, landed 18:00 summer time as C1: 60 and 30 minutes.
   *   E1    submitted 25 Oct 01:50 summer time, judged 01:55, tested 01:58 with the whole suite (case 5), landed 01:10
   *         winter time: 20 and 15 minutes, across the hour that came twice.
   *   E2    25 Oct, submitted 09:00, judged 09:40, tested 09:45 with related tests only, landed 10:00: 60 and 20.
   *   E3    25 Oct, submitted 10:00, judged 11:00, tested 11:30 with the whole suite (cases 1 and 2), waited for a fix
   *         round, which the office opened with the line's supervisor at 11:40, landed 12:00 as C2, handed back to that
   *         round: 120 and 60.
   *   E4    25 Oct, submitted 13:20, judged 13:30, tested 13:40 with no choice kept, waited for a fix round, which
   *         opened at 13:45 because its starter had a run of its own going, landed 14:00, handed back to that run:
   *         40 and 30. The office did not open that round, so it is not counted.
   *   E5    submitted 25 Oct 00:30 summer time, landed at the stamp 01:30, written before the observation was kept, so
   *         its landing names two moments: counted as landed on 25 October, its waits unmeasured.
   *   So 25 October: 5 landed; submitted to landed 20, 40, 60, 120 and one unmeasured, median 50 and 90th percentile
   *   120; judged to landed 15, 20, 30, 60 and one unmeasured, median 25 and 90th percentile 60.
   *
   *   Bounces: two on 22 October (red, conflict), one on 23 October (red), one on 24 October (red), one at the stamp
   *   25 Oct 01:20 (red). The one on 24 October is a take-back, submitted at 10:00 the day before, so it counts as a
   *   take-back on 23 October and as a bounce on 24 October.
   *
   *   Fix rounds the office opened, by the day each opened: FB waited on 23 October, the office opened its round with
   *   the build sheriff at 14:00, and FB bounced at 16:00, so it never landed; E3's round with the line's supervisor
   *   on 25 October. So one on 23 October (the sheriff's), one on 25 October (the line's), none on the other days.
   *
   *   Receipts: R0 green at C0, ended 21 Oct 12:00 summer time, C0 not a landing. R1 red (a) at C1, ended 24 Oct 20:00.
   *   R1b red (b) at CB, not a landing, ended at the stamp 25 Oct 01:40, which names two moments: listed, not placed.
   *   R2 at C2, version 2, red (c) in the whole run and green alone, so green, ended 25 Oct 13:00.
   *   Main by those receipts: not known until R0 at 21 Oct 12:00; green until C1 landed at 24 Oct 18:00; red until C2
   *   landed at 25 Oct 12:00; green since. In hours: 20 Oct 24 not known; 21 Oct 12 not known and 12 green; 22 and 23
   *   Oct 24 green; 24 Oct 18 green and 6 red; 25 Oct 13 red and 12 green, of 25; 26 Oct 12 green, to noon.
   */
  function theFixtures(): { r0: string; r1: string; r1b: string; r2: string } {
    aLanding('E00', { submitted: Date.UTC(2026, 9, 19, 22, 0), judged: Date.UTC(2026, 9, 19, 22, 30), landed: Date.UTC(2026, 9, 19, 23, 0) })
    aLanding('E0', { submitted: Date.UTC(2026, 9, 19, 22, 0), judged: Date.UTC(2026, 9, 19, 22, 30), landed: Date.UTC(2026, 9, 19, 22, 59, 59) })
    const r0 = aReceipt('R0', C0, '2026-10-21 12:00:00', {}).id
    aBounce('B1', Date.UTC(2026, 9, 22, 7, 0), 'red', '2026-10-22 09:00:00')
    aBounce('B2', Date.UTC(2026, 9, 22, 7, 30), 'conflict', '2026-10-22 11:00:00')
    aBounce('TB', Date.UTC(2026, 9, 23, 9, 0), 'red', '2026-10-24 09:00:00', { takeBackOf: { problem: 'synthetic-problem', entry: 'synthetic-entry', commits: [C0], paths: ['src/synthetic.ts'], hours: 24 } })
    const fb = anEntry('FB', 'testing', Date.UTC(2026, 9, 23, 11, 0), { waitsForAFixRound: aFixRoundWait(Date.UTC(2026, 9, 23, 12, 0)) })
    aFixRoundOpens(fb, Date.UTC(2026, 9, 23, 13, 0), 'sheriff', 'synthetic-sheriff-run')
    movesOn(fb, Date.UTC(2026, 9, 23, 15, 0), { state: 'bounced', bounced: { reason: 'red', at: '2026-10-23 16:00:00', files: [] } })
    aLanding('E6', { submitted: Date.UTC(2026, 9, 24, 16, 0), judged: Date.UTC(2026, 9, 24, 16, 30), landed: Date.UTC(2026, 9, 24, 17, 0) }, { mainAfter: C1 })
    const r1 = aReceipt('R1', C1, '2026-10-24 20:00:00', { red: ['tests/a.test.ts'] }).id
    aBounce('B3', Date.UTC(2026, 9, 24, 22, 0), 'red', '2026-10-25 01:20:00')
    anEntry('E5', 'merged', Date.UTC(2026, 9, 24, 23, 30), { integrated: { at: '2026-10-25 01:30:00', entry: 'E5', mainBefore: '0'.repeat(40), mainAfter: '5'.repeat(40) } }, false)
    const r1b = aReceipt('R1b', CB, '2026-10-25 01:40:00', { red: ['tests/b.test.ts'] }).id
    aLanding('E1', { submitted: FIRST_PASS, judged: FIRST_PASS + 5 * MINUTE, tested: FIRST_PASS + 8 * MINUTE, landed: SECOND_PASS }, { tested: { wholeSuiteBecause: [{ case: 5, says: 'Synthetic: a server start path changed.' }] } })
    aLanding('E2', { submitted: Date.UTC(2026, 9, 25, 9, 0), judged: Date.UTC(2026, 9, 25, 9, 40), tested: Date.UTC(2026, 9, 25, 9, 45), landed: Date.UTC(2026, 9, 25, 10, 0) }, { tested: { relatedOnly: { files: ['src/synthetic.ts'], related: 1, every: 10, leftOutSlow: [], says: 'Synthetic.' } } })
    aLandingAfterAFixRound('E3', { submitted: Date.UTC(2026, 9, 25, 10, 0), judged: Date.UTC(2026, 9, 25, 11, 0), tested: Date.UTC(2026, 9, 25, 11, 30), opens: Date.UTC(2026, 9, 25, 11, 40), landed: Date.UTC(2026, 9, 25, 12, 0) }, 'line', {
      mainAfter: C2,
      tested: { wholeSuiteBecause: [{ case: 1, says: 'Synthetic.' }, { case: 2, paths: ['src/synthetic.ts'], says: 'Synthetic.' }] },
      tests: { mergeClass: { class: 2, roundOpen: { open: true, starter: 'synthetic-starter', run: 'synthetic-fix-run-E3', fixRound: { agent: 'synthetic-line', as: 'line' } } } },
    })
    aLandingAfterAFixRound('E4', { submitted: Date.UTC(2026, 9, 25, 13, 20), judged: Date.UTC(2026, 9, 25, 13, 30), tested: Date.UTC(2026, 9, 25, 13, 40), opens: Date.UTC(2026, 9, 25, 13, 45), landed: Date.UTC(2026, 9, 25, 14, 0) }, 'starter', {
      tests: { mergeClass: { class: 2, roundOpen: { open: true, starter: 'synthetic-starter', run: 'synthetic-fix-run-E4' } } },
    })
    const r2 = aReceipt('R2', C2, '2026-10-25 13:00:00', { alone: [{ file: 'tests/c.test.ts', outcome: 'green' }] })
    // The receipt rule itself says R2 is green: red in the whole run, green alone.
    expect(receipts.wholeSuiteReceiptIsGreen(r2.data)).toBe(true)
    vi.setSystemTime(NOW)
    return { r0, r1, r1b, r2: r2.id }
  }

  async function measures(query = ''): Promise<{ status: number; body: Reply }> {
    const got = await app.inject({ method: 'GET', url: `/api/merge-queue/measures${query}`, headers })
    return { status: got.statusCode, body: got.json() as Reply }
  }

  /** The figures of one day, by its date. */
  const dayOf = (reply: Reply, day: string): Reply => {
    const found = (reply['measures'] as Reply[]).find((one) => one['day'] === day)
    expect(found, day).toBeDefined()
    return found!
  }

  it('1. answers each of the seven days from the entries and the receipts', async () => {
    const { r0, r1, r1b, r2 } = theFixtures()
    const got = await measures()
    expect(got.status, JSON.stringify(got.body)).toBe(200)
    const reply = got.body
    expect(reply['days']).toBe(7)
    expect(reply['timeZone']).toBe('Europe/London')
    expect((reply['measures'] as Reply[]).map((one) => one['day'])).toEqual(SEVEN_DAYS)
    expect(reply['from']).toBe('2026-10-20T00:00:00.000+01:00')
    expect(reply['until']).toBe('2026-10-26T12:00:00.000+00:00')

    // Each day's edges are moments, and the day the clocks went back had 25 hours.
    expect(dayOf(reply, '2026-10-25')).toMatchObject({ from: '2026-10-25T00:00:00.000+01:00', until: '2026-10-26T00:00:00.000+00:00', hours: 25 })
    expect(dayOf(reply, '2026-10-26')).toMatchObject({ from: '2026-10-26T00:00:00.000+00:00', until: '2026-10-26T12:00:00.000+00:00', hours: 12 })
    expect((reply['measures'] as Reply[]).map((one) => one['hours'])).toEqual([24, 24, 24, 24, 24, 25, 12])

    // Landings, and the two waits, between moments.
    expect((reply['measures'] as Reply[]).map((one) => one['landed'])).toEqual([1, 0, 0, 0, 1, 5, 0])
    expect(dayOf(reply, '2026-10-20')['submittedToLanded']).toEqual({ measured: 1, unmeasured: 0, medianMinutes: 60, p90Minutes: 60 })
    expect(dayOf(reply, '2026-10-20')['judgedToLanded']).toEqual({ measured: 1, unmeasured: 0, medianMinutes: 30, p90Minutes: 30 })
    expect(dayOf(reply, '2026-10-24')['submittedToLanded']).toEqual({ measured: 1, unmeasured: 0, medianMinutes: 60, p90Minutes: 60 })
    expect(dayOf(reply, '2026-10-24')['judgedToLanded']).toEqual({ measured: 1, unmeasured: 0, medianMinutes: 30, p90Minutes: 30 })
    expect(dayOf(reply, '2026-10-25')['submittedToLanded']).toEqual({ measured: 4, unmeasured: 1, medianMinutes: 50, p90Minutes: 120 })
    expect(dayOf(reply, '2026-10-25')['judgedToLanded']).toEqual({ measured: 4, unmeasured: 1, medianMinutes: 25, p90Minutes: 60 })
    for (const day of ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26']) {
      expect(dayOf(reply, day)['submittedToLanded'], day).toEqual(NO_WAIT)
      expect(dayOf(reply, day)['judgedToLanded'], day).toEqual(NO_WAIT)
    }

    // The tests, by the choice each entry kept, on the day it was tested.
    expect(dayOf(reply, '2026-10-25')['tested']).toEqual({ relatedOnly: 1, wholeSuite: 2, wholeSuiteCases: { 1: 1, 2: 1, 5: 1 }, noChoiceRecorded: 1 })
    expect(dayOf(reply, '2026-10-24')['tested']).toEqual({ relatedOnly: 0, wholeSuite: 0, wholeSuiteCases: {}, noChoiceRecorded: 0 })

    // Hand-backs, and the fix rounds the office opened, exact, on the day each opened: the bounced entry's too, and
    // not the round its starter already had going.
    expect((reply['measures'] as Reply[]).map((one) => one['handBacks'])).toEqual([0, 0, 0, 0, 0, 2, 0])
    expect((reply['measures'] as Reply[]).map((one) => one['fixRounds'])).toEqual([
      NO_ROUND,
      NO_ROUND,
      NO_ROUND,
      { total: 1, line: 0, sheriff: 1 },
      NO_ROUND,
      { total: 1, line: 1, sheriff: 0 },
      NO_ROUND,
    ])

    // Take-backs by the day they were submitted, and bounces by cause.
    expect((reply['measures'] as Reply[]).map((one) => one['takeBacks'])).toEqual([0, 0, 0, 1, 0, 0, 0])
    expect(dayOf(reply, '2026-10-22')['bounced']).toEqual({ total: 2, byCause: { red: 1, conflict: 1 }, noCause: 0 })
    expect(dayOf(reply, '2026-10-24')['bounced']).toEqual({ total: 1, byCause: { red: 1 }, noCause: 0 })
    expect(dayOf(reply, '2026-10-25')['bounced']).toEqual({ total: 1, byCause: { red: 1 }, noCause: 0 })
    expect(dayOf(reply, '2026-10-23')['bounced']).toEqual({ total: 1, byCause: { red: 1 }, noCause: 0 })
    expect(dayOf(reply, '2026-10-21')['bounced']).toEqual({ total: 0, byCause: {}, noCause: 0 })

    // Receipts by the day they ended, each with its red files. Version 1 cannot say which were red alone.
    expect(dayOf(reply, '2026-10-21')['receipts']).toEqual([{ id: r0, commit: C0, green: true, failedFiles: [], redAlone: null }])
    expect(dayOf(reply, '2026-10-24')['receipts']).toEqual([{ id: r1, commit: C1, green: false, failedFiles: ['tests/a.test.ts'], redAlone: null }])
    expect(dayOf(reply, '2026-10-25')['receipts']).toEqual([
      { id: r1b, commit: CB, green: false, failedFiles: ['tests/b.test.ts'], redAlone: null },
      { id: r2, commit: C2, green: true, failedFiles: ['tests/c.test.ts'], redAlone: [] },
    ])
    expect(dayOf(reply, '2026-10-23')['receipts']).toEqual([])
    expect(reply['receiptsNotPlaced']).toEqual([r1b])

    // The hours main was red, green, or not known, by those receipts.
    expect((reply['measures'] as Reply[]).map((one) => one['mainRed'])).toEqual([
      { red: 0, green: 0, unknown: 24 },
      { red: 0, green: 12, unknown: 12 },
      { red: 0, green: 24, unknown: 0 },
      { red: 0, green: 24, unknown: 0 },
      { red: 6, green: 18, unknown: 0 },
      { red: 13, green: 12, unknown: 0 },
      { red: 0, green: 12, unknown: 0 },
    ])

    // With no upgrade notice, no day can say which commit the stable office ran, and each says so in the same words.
    const atDayEnd = (reply['measures'] as Reply[]).map((one) => one['stableAtDayEnd'] as Reply)
    for (const one of atDayEnd) expect(one['state']).toBe('unknown')
    expect(typeof atDayEnd[0]!['why'] === 'string' && atDayEnd[0]!['why'].length > 0).toBe(true)
    expect(new Set(atDayEnd.map((one) => one['why'])).size).toBe(1)

    // Where each figure comes from, which are estimates, and what the office cannot give, in words.
    for (const figure of FIGURES) expect(typeof reply['sources'][figure] === 'string' && reply['sources'][figure].length > 0, figure).toBe(true)
    expect(Object.keys(reply['sources']).sort()).toEqual([...FIGURES].sort())
    expect(reply['estimated']).toEqual(['mainRed'])
    expect(reply['notGiven']).toHaveLength(3)
    for (const words of reply['notGiven'] as unknown[]) expect(typeof words === 'string' && words.length > 0).toBe(true)
    expect(new Set(reply['notGiven']).size).toBe(3)
  })

  it('2. answers the days asked for, and refuses any other number of days', async () => {
    theFixtures()
    const two = await measures('?days=2')
    expect(two.status, JSON.stringify(two.body)).toBe(200)
    expect((two.body['measures'] as Reply[]).map((one) => one['day'])).toEqual(['2026-10-25', '2026-10-26'])
    expect(two.body['from']).toBe('2026-10-25T00:00:00.000+01:00')
    expect(two.body['days']).toBe(2)
    const thirty = await measures('?days=30')
    expect(thirty.status, JSON.stringify(thirty.body)).toBe(200)
    expect(thirty.body['measures']).toHaveLength(30)
    expect((thirty.body['measures'] as Reply[])[0]!['day']).toBe('2026-09-27')
    for (const query of ['?days=0', '?days=31', '?days=1.5', '?days=a-week', '?week=1']) {
      const refused = await measures(query)
      expect(refused.status, query).toBe(400)
    }
  })

  it('3. writes nothing, and gives the same answer for the same records', async () => {
    theFixtures()
    const count = () => ({
      records: (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n,
      changes: (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes').get() as { n: number }).n,
    })
    const before = count()
    const first = await measures()
    const second = await measures()
    expect(first.status).toBe(200)
    expect(second.body).toEqual(first.body)
    expect(count()).toEqual(before)
  })

  describe('4. stable against main', () => {
    const theReader = async () => Reflect.get(await import(/* @vite-ignore */ modulePath('../src/server/lib/merge-queue-measures.ts')), 'theStableAgainstMain') as ((pair: { serving: string; development: string } | null) => Reply) | undefined

    it('counts the commits main is ahead of the stable checkout, from git in the two checkouts', async () => {
      const read = await theReader()
      expect(read).toBeDefined()
      const development = mkdtempSync(join(home, 'development-'))
      git(development, 'init', '-q', '-b', 'main')
      const stableAt = aCommit(development, 'one')
      const serving = join(home, 'serving')
      execFileSync('git', ['clone', '-q', development, serving], { stdio: 'ignore' })
      aCommit(development, 'two')
      aCommit(development, 'three')
      const mainAt = aCommit(development, 'four')
      // A branch ahead of main is not counted: the figure is main's.
      git(development, 'checkout', '-q', '-b', 'side')
      aCommit(development, 'five')
      expect(read!({ serving, development })).toEqual({ state: 'read', serving: stableAt, main: mainAt, behind: 3 })
    }, 60_000)

    it('says in words that it is not known with no pair, or when the stable commit is not in the development checkout', async () => {
      const read = await theReader()
      expect(read).toBeDefined()
      const none = read!(null)
      expect(none['state']).toBe('unknown')
      expect(typeof none['why'] === 'string' && none['why'].length > 0).toBe(true)
      const development = mkdtempSync(join(home, 'development-'))
      git(development, 'init', '-q', '-b', 'main')
      aCommit(development, 'one')
      const serving = mkdtempSync(join(home, 'elsewhere-'))
      git(serving, 'init', '-q', '-b', 'main')
      aCommit(serving, 'another history')
      const apart = read!({ serving, development })
      expect(apart['state']).toBe('unknown')
      expect(typeof apart['why'] === 'string' && apart['why'].length > 0).toBe(true)
      expect(apart['why']).not.toBe(none['why'])
    }, 60_000)

    it('the door answers what the reader says of this process\'s own pair', async () => {
      const read = await theReader()
      expect(read).toBeDefined()
      const { thePairOfThisProcess } = await import('../src/config/the-office-tool-environment.mjs')
      vi.setSystemTime(NOW)
      const got = await measures()
      expect(got.status, JSON.stringify(got.body)).toBe(200)
      expect(got.body['stable']).toEqual(read!(thePairOfThisProcess()))
    }, 60_000)
  })

  it('5. the page draws one column a day, each figure with where it comes from, and absence in words', async () => {
    theFixtures()
    const got = await measures()
    expect(got.status, JSON.stringify(got.body)).toBe(200)
    const listed = await app.inject({ method: 'GET', url: '/api/merge-queue', headers })
    expect(listed.statusCode, listed.body).toBe(200)
    ;(globalThis as { window?: unknown }).window = {
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      location: { hash: '', search: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    vi.resetModules()
    const i18n = await import('../src/shared/i18n.ts')
    i18n.setWordLanguage('en')
    const say = i18n.t as unknown as Say
    const section = await import(/* @vite-ignore */ modulePath('../src/web/components/MergeQueueMeasures.tsx'))
    const Table = Reflect.get(section, 'TheMeasuresTable') as ((props: { measures: Reply }) => unknown) | undefined
    expect(Table).toBeDefined()
    const draw = (measures: Reply) => renderToStaticMarkup(h(Table as never, { measures }))
    const reply: Reply = { ...got.body, stable: { state: 'unknown', why: 'Synthetic: this office has no stable checkout.' } }
    const html = draw(reply)

    // One column a day, oldest first.
    expect([...html.matchAll(/<th scope="col" data-day="([^"]+)"/gu)].map((one) => one[1])).toEqual(SEVEN_DAYS)
    const cell = (day: string, figure: string): string | undefined => {
      const found = new RegExp(`<td data-day="${day}" data-figure="${figure}"[^>]*>([\\s\\S]*?)</td>`, 'u').exec(html)?.[1]
      return found?.replace(/<[^>]+>/gu, '')
    }
    expect(cell('2026-10-25', 'landed')).toBe('5')
    expect(cell('2026-10-21', 'landed')).toBe('0')
    // Absence in words: a day with no landing has no wait.
    expect(cell('2026-10-21', 'submittedToLanded')).toBe(escaped(say('mergeQueueMeasures.noWait')))
    expect(cell('2026-10-21', 'judgedToLanded')).toBe(escaped(say('mergeQueueMeasures.noWait')))
    // The fix rounds are an exact count, with whose round each was; the estimate says it is one, beside its figure.
    expect(cell('2026-10-25', 'fixRounds')).toBe(`1${escaped(say('mergeQueueMeasures.fixRoundsBy', { line: 1, sheriff: 0 }))}`)
    expect(cell('2026-10-23', 'fixRounds')).toBe(`1${escaped(say('mergeQueueMeasures.fixRoundsBy', { line: 0, sheriff: 1 }))}`)
    expect(cell('2026-10-24', 'fixRounds')).toBe('0')
    expect(html).toContain(`<th scope="row">${escaped(say('mergeQueueMeasures.row.fixRounds'))}</th>`)
    expect(html).toContain(`<th scope="row">${escaped(say('mergeQueueMeasures.isEstimate', { figure: say('mergeQueueMeasures.row.mainRed') }))}</th>`)
    expect(cell('2026-10-25', 'mainRed')).toContain('13')
    // The stable office at each day's end: unknown in words, and read as commits behind main.
    expect(cell('2026-10-20', 'stableAtDayEnd')).toBe(escaped((reply['measures'] as Reply[])[0]!['stableAtDayEnd']['why']))
    // Every figure has a row, with where it comes from.
    for (const figure of FIGURES.filter((one) => one !== 'stable')) {
      expect(html, figure).toContain(`data-figure="${figure}"`)
      expect(html, figure).toContain(escaped(reply['sources'][figure]))
    }
    for (const words of reply['notGiven'] as string[]) expect(html).toContain(escaped(words))
    // Stable against main: unknown in words, and read as commits behind.
    expect(html).toContain(escaped('Synthetic: this office has no stable checkout.'))
    expect(html).toContain(escaped(reply['sources']['stable']))
    const read = draw({ ...reply, stable: { state: 'read', serving: 'a'.repeat(40), main: 'b'.repeat(40), behind: 3 } })
    expect(read).toContain(escaped(say('mergeQueueMeasures.stableBehind', { behind: 3, serving: 'aaaaaaa', main: 'bbbbbbb' })))
    const days = (reply['measures'] as Reply[]).map((one) => (one['day'] === '2026-10-25' ? { ...one, stableAtDayEnd: { state: 'read', serving: 'c'.repeat(40), main: 'd'.repeat(40), behind: 2 } } : one))
    const dayRead = draw({ ...reply, measures: days })
    const dayCell = new RegExp('<td data-day="2026-10-25" data-figure="stableAtDayEnd"[^>]*>([\\s\\S]*?)</td>', 'u').exec(dayRead)?.[1]?.replace(/<[^>]+>/gu, '')
    expect(dayCell).toBe(`${escaped(say('mergeQueueMeasures.stableDayBehind', { n: 2, behind: 2 }))}${escaped(say('mergeQueueMeasures.stableDayCommits', { serving: 'ccccccc', main: 'ddddddd' }))}`)

    // The merge queue page holds the section.
    const page = await import('../src/web/pages/MergeQueuePage.tsx')
    const drawn = renderToStaticMarkup(h(page.TheMergeQueue, { reply: listed.json(), now: new Date(NOW) }))
    expect(drawn).toContain('class="mq-measures"')
  })
  describe("6. the stable office at each day's end, from the upgrade notices", () => {
    /** The agent that files the notices and the secretary who approves them, registered by the person, each with a run going. */
    async function theNoticeWriters(): Promise<{ controller: Actor; secretary: Actor }> {
      const writers: Record<string, Actor> = {}
      for (const who of ['controller', 'secretary'] as const) {
        const payload = { handle: `measures-${who}`, name: `Synthetic ${who}`, role: who === 'secretary' ? 'secretary' : 'worker' }
        const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-key': personKey }, payload })
        expect(made.statusCode, made.body).toBe(201)
        const id = (made.json() as { agent: { id: string } }).agent.id
        const sessionId = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'session', title: `Synthetic ${who} run`, data: { state: 'running', servingAgent: id }, actor: t.api.HUMAN }).id
        writers[who] = { type: 'agent', id, keyHolder: id, provedBy: 'an-agent-key', sessionId }
      }
      return { controller: writers['controller']!, secretary: writers['secretary']! }
    }

    /** The first version of a record, as a notice names it. */
    function reference(id: string): { id: string; seq: 1; contentHash: string } {
      const row = t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? AND seq = 1').get(id) as { content_hash: string }
      return { id, seq: 1, contentHash: row.content_hash }
    }

    /**
     * THE FIXTURES, AND THE ANSWER WORKED OUT BY HAND. Five made-up commits c1 to c5 follow one another on main in a
     * throwaway checkout. Times are UTC in the code and said in the office's wall time here.
     *
     *   22 Oct 10:00   an upgrade from c1 to c2 begins; it completes at 10:05. The stable office runs c2.
     *   23 Oct 12:00   L1 lands, main becomes c3.
     *   24 Oct 09:00   an upgrade from c2 to c3 begins; it is refused at 09:10. The stable office still runs c2.
     *   24 Oct 15:00   L2 lands, main becomes c4.
     *   25 Oct 10:00   an upgrade from c2 to c4 begins; it completes at 10:30. The stable office runs c4.
     *   25 Oct 12:00   L3 lands, main becomes c5.
     *   26 Oct 09:00   an upgrade from c4 to c5 begins, and has not ended at noon, when the door is asked.
     *
     *   So: 20 and 21 Oct have no notice before their end. 22 Oct ends on c2 with nothing landed yet. 23 Oct ends on
     *   c2 against c3, 1 behind, with no notice that day. 24 Oct ends on c2 against c4, 2 behind. 25 Oct ends on c4
     *   against c5, 1 behind. 26 Oct is in the middle of an upgrade, so the commit is not known.
     */
    it('reads the commit the stable office ran at each day\'s end, and how far main was ahead of it', async () => {
      const writers = await theNoticeWriters()
      const notices = await import('../src/server/lib/stable-upgrade-notices.ts')
      const { STABLE_UPGRADE_PUBLIC_REASONS } = await import('../src/shared/stable-upgrade-notices.ts')
      const development = mkdtempSync(join(home, 'development-'))
      git(development, 'init', '-q', '-b', 'main')
      const [c1, c2, c3, c4, c5] = ['one', 'two', 'three', 'four', 'five'].map((words) => aCommit(development, words)) as [string, string, string, string, string]
      const serving = (commit: string) => ({ commit, repository: development, database: t.file, port: 12345 })
      let n = 0
      /** An upgrade from `from` to `to` begins at `ms`: its BEFORE notice, approved by the secretary, with a green receipt. */
      const begins = (ms: number, from: string, to: string) => {
        vi.setSystemTime(ms)
        n += 1
        const notice = `Synthetic upgrade notice ${n}.`
        const note = t.api.createRecord({ kind: 'note', title: `Synthetic approval ${n}`, workspaceId: WORKSPACE, data: { body: notice }, actor: writers.secretary })
        const evidence = t.api.createRecord({ kind: 'whole_suite_receipt', title: `Synthetic upgrade receipt ${n}`, workspaceId: WORKSPACE, data: { ...receipts.WHOLE_SUITE_RECEIPT_EXAMPLE, commit: to }, actor: writers.controller })
        const announcement = {
          candidateTag: `stable-${time.stampInZone(ms, 'Europe/London').slice(0, 10)}-fixture-${n}`,
          baselineTag: `fixture-baseline-${n}`,
          fromCommit: from,
          toCommit: to,
          tree: receipts.WHOLE_SUITE_RECEIPT_EXAMPLE.tree,
          notice,
          evidence: reference(evidence.id),
          noticeApproval: reference(note.id),
        }
        const filed = notices.fileStableUpgradeNotice(WORKSPACE, { stage: 'before', sendId: `before-${n}`, announcement }, writers.controller, () => serving(from))
        return { original: filed.original, announcement }
      }
      /** The upgrade `begun` ends at `ms`, completed or refused. */
      const ends = (ms: number, begun: ReturnType<typeof begins>, how: 'completed' | 'refused'): void => {
        vi.setSystemTime(ms)
        const to = serving(begun.announcement.toCommit)
        const outcome = how === 'refused'
          ? { state: 'refused' as const, reason: STABLE_UPGRADE_PUBLIC_REASONS[0] }
          : { state: 'completed' as const, verification: { result: 'completed' as const, evidence: begun.announcement.evidence, serving: to } }
        notices.fileStableUpgradeNotice(WORKSPACE, { stage: 'after', sendId: `after-${begun.original.id}`, before: begun.original, outcome }, writers.controller, () => to)
      }

      ends(Date.UTC(2026, 9, 22, 9, 5), begins(Date.UTC(2026, 9, 22, 9, 0), c1, c2), 'completed')
      aLanding('L1', { submitted: Date.UTC(2026, 9, 23, 10, 0), judged: Date.UTC(2026, 9, 23, 10, 30), landed: Date.UTC(2026, 9, 23, 11, 0) }, { mainAfter: c3 })
      ends(Date.UTC(2026, 9, 24, 8, 10), begins(Date.UTC(2026, 9, 24, 8, 0), c2, c3), 'refused')
      aLanding('L2', { submitted: Date.UTC(2026, 9, 24, 13, 0), judged: Date.UTC(2026, 9, 24, 13, 30), landed: Date.UTC(2026, 9, 24, 14, 0) }, { mainAfter: c4 })
      ends(Date.UTC(2026, 9, 25, 10, 30), begins(Date.UTC(2026, 9, 25, 10, 0), c2, c4), 'completed')
      aLanding('L3', { submitted: Date.UTC(2026, 9, 25, 11, 0), judged: Date.UTC(2026, 9, 25, 11, 30), landed: Date.UTC(2026, 9, 25, 12, 0) }, { mainAfter: c5 })
      begins(Date.UTC(2026, 9, 26, 9, 0), c4, c5)
      vi.setSystemTime(NOW)

      type Input = { workspaceId: string; now: Date; days: number; pair: { serving: string; development: string } | null }
      const theMeasures = Reflect.get(await import(/* @vite-ignore */ modulePath('../src/server/lib/merge-queue-measures.ts')), 'theQueuesMeasures') as (input: Input) => Reply
      const say = (await import('../src/shared/i18n.ts')).sayInEnglish as unknown as Say
      const short = (commit: string): string => commit.slice(0, 7)
      const unknown = (key: string, values?: Record<string, string>) => ({ state: 'unknown', why: say(`mergeQueueMeasures.stableDay.${key}`, values) })
      const input: Input = { workspaceId: WORKSPACE, now: new Date(NOW), days: 7, pair: { serving: development, development } }

      const answer = theMeasures(input)
      expect((answer['measures'] as Reply[]).map((one) => one['day'])).toEqual(SEVEN_DAYS)
      expect((answer['measures'] as Reply[]).map((one) => one['stableAtDayEnd'])).toEqual([
        unknown('noNotice'),
        unknown('noNotice'),
        unknown('noLanding', { serving: short(c2) }),
        { state: 'read', serving: c2, main: c3, behind: 1 },
        { state: 'read', serving: c2, main: c4, behind: 2 },
        { state: 'read', serving: c4, main: c5, behind: 1 },
        unknown('upgrading', { at: '2026-10-26 09:00:00' }),
      ])
      // The same records give the same answer.
      expect(theMeasures(input)).toEqual(answer)

      // With no checkout to count in, a day that knows both commits says so in words, and names them.
      const noPair = theMeasures({ ...input, pair: null })
      expect(dayOf(noPair, '2026-10-23')['stableAtDayEnd']).toEqual(unknown('noPair', { serving: short(c2), main: short(c3) }))
      expect(dayOf(noPair, '2026-10-20')['stableAtDayEnd']).toEqual(unknown('noNotice'))
    }, 60_000)
  })
})
