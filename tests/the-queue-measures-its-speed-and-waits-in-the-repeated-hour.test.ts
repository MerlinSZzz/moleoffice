// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUEUE'S SPEED, HOW LONG AN ENTRY HAS WAITED, AND THE QUEUE'S HISTORY ARE MEASURED BETWEEN MOMENTS, IN THE HOUR THE
 * CLOCKS GO BACK.
 *
 * A stored stamp is the office's local time in words, with no offset. On 25 October 2026 the hour from 01:00 comes twice
 * in Europe/London: 01:50 summer time is followed, twenty minutes later, by 01:10 winter time. Three places measured
 * between such stamps as if each named one moment, the first of the two:
 *
 *   - the queue's speed on its page, from a landing's `integrated.at`, its release's `verdict.at` and a bus's `tested.at`;
 *   - the line on the page that says how long an entry has been in the queue, from the record's `createdAt`;
 *   - tools/queue-history.mjs, from the time at the start of each log line and the window it is given.
 *
 * The office now keeps the clock observation beside each stamp it writes for these: `tested.time`, `integrated.time` on
 * the entry and on the run, and `submittedTime`. The speed and the entry's reading take the moment from it. A stamp with
 * none beside it, written before it was kept, is read as its one moment in the office's zone, and in the hour the clocks
 * go back or the hour they skip it has none: the speed counts it as one that cannot be read, and the page says the wait
 * cannot be read. The history tool cannot store anything beside a log line, so it leaves such a line out of every count
 * and lists it, and it refuses a window that starts or ends in that hour.
 *
 * WHAT IS PROVED, against a throwaway database and HOME, with this process's zone set to Europe/London and its clock set
 * here:
 *
 *   1. The shared rule: a stored stamp's moment is the instant beside it; an observation whose instant cannot be read
 *      gives none, whatever the words beside it say; a stamp with none beside it is its one moment, and has none in the
 *      repeated hour or the skipped one. Controls one second either side of both hours.
 *   2. Released at 01:50 summer time and landed at 01:10 winter time, an entry waited 20 minutes, through the real tested,
 *      landing and landed steps, which keep the clock observation on the entry and on the run.
 *   3. Released at 01:10 summer time and landed at 01:20 winter time, it waited 70 minutes, not 10.
 *   4. Over the 24 hours to 01:15 winter time on 26 October, a landing and a bus at 01:20 winter time the day before are
 *      counted. Controls: a release, a landing and buses across the skipped hour of 28 March 2027, and landings one second
 *      either side of the start of an ordinary window.
 *   5. A landing, a release or a bus recorded before the observation was kept, in the repeated hour or the skipped one,
 *      is counted as one that cannot be read. Outside them it is read.
 *   6. An entry submitted at 01:10 winter time is read as submitted then, through the real submission and the real reply
 *      of GET /api/merge-queue, and the page draws it as in the queue for 10 minutes ten minutes later. An entry
 *      submitted before the observation was kept, in the repeated hour, is drawn as one whose wait cannot be read. Control:
 *      one submitted on an ordinary day.
 *   7. tools/queue-history.mjs leaves a bus whose line falls in the repeated hour out of its counts, lists the line with
 *      the reason, and its command exits 1 for it. It refuses a window bound in the repeated hour and one in the skipped
 *      hour. Control: a bus and its landing across the skipped hour, one second apart, are read and ordered.
 *
 * MUTATION PROOF (each after a green control; each turns the cases named red, and restoring it turns them green):
 *
 *   - In src/server/lib/merge-queue-page.ts, `msOf`, read the stamp alone as local time again. Cases 2 to 5 go red.
 *   - In src/server/lib/merge-state-machine.ts, the tested step keeps no clock observation. Cases 2 and 4 go red.
 *   - In the same file, the landing's receipt keeps no clock observation. Cases 2 to 4 go red.
 *   - In src/server/lib/merge-queue.ts, the submission keeps no clock observation. Case 6 goes red.
 *   - In the same file, `readMergeEntry` reads `createdAt` as local time again. Case 6 goes red.
 *   - In src/web/pages/MergeQueuePage.tsx, `howLongItWaited` reads `submittedAt` as local time again. Case 6 goes red.
 *   - In tools/queue-history.mjs, read a time in the repeated hour as its first moment again. Case 7 goes red.
 *   - In src/shared/time.ts, `momentOfAStoredStamp` reads the stamp as local time whatever is beside it. Case 1 goes red,
 *     with the cases that read through it.
 *
 * Every record here is a synthetic fixture in a throwaway database. Entries that stand for records written before the
 * observation was kept are written with their fields in the create, as the queue would have written them then.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { MergeQueueReply } from '../src/shared/merge-queue-page.ts'

const WORKSPACE = 'default'
const ROOT = '/synthetic/lane-of-the-repeated-hour'
const MINUTE = 60_000
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const headers = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

/** 01:50 summer time, 25 October 2026, in the first pass of the repeated hour. */
const FIRST_PASS = Date.UTC(2026, 9, 25, 0, 50, 0)
/** 01:10 winter time, twenty minutes later, in the second pass. */
const SECOND_PASS = Date.UTC(2026, 9, 25, 1, 10, 0)
/** 00:59:59 winter time, 28 March 2027, the last second before the skipped hour. */
const BEFORE_THE_GAP = Date.UTC(2027, 2, 28, 0, 59, 59)
/** 02:00:00 summer time, one second later. */
const AFTER_THE_GAP = Date.UTC(2027, 2, 28, 1, 0, 0)
/** Noon summer time on an ordinary day, the day before the clocks go back. */
const AN_ORDINARY_NOON = Date.UTC(2026, 9, 24, 11, 0, 0)

describe('the queue measures in the hour the clocks go back', () => {
  let t: TestDb
  let app: FastifyInstance
  let door: typeof import('../src/server/lib/merge-entry-door.ts')
  let machine: typeof import('../src/server/lib/merge-state-machine.ts')
  let queue: typeof import('../src/server/lib/merge-queue.ts')
  let page: typeof import('../src/server/lib/merge-queue-page.ts')
  let time: typeof import('../src/shared/time.ts')
  let worker: string
  let home: string
  const saved = { TZ: process.env.TZ, HOME: process.env.HOME }

  beforeEach(async () => {
    process.env.TZ = 'Europe/London'
    home = mkdtempSync(join(tmpdir(), 'queue-measures-'))
    process.env.HOME = home
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    door = await import('../src/server/lib/merge-entry-door.ts')
    machine = await import('../src/server/lib/merge-state-machine.ts')
    queue = await import('../src/server/lib/merge-queue.ts')
    page = await import('../src/server/lib/merge-queue-page.ts')
    time = await import('../src/shared/time.ts')
    // The clock starts before every moment a case sets, so each case only moves it forward.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 20, 12, 0, 0) })
    const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: `worker-${home.split('/').at(-1)}`.toLowerCase(), name: 'Synthetic worker', role: 'worker', workArea: ['work'] } })
    expect(started.statusCode, started.body).toBe(201)
    worker = String(started.json().agent.id)
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

  function git(dir: string, ...args: string[]): string {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  }

  /** A repository with a main and a commit on top, and a finished run sealed at that commit. Synthetic. */
  function aSealedRun(): { dir: string; run: string; seal: string; sealHash: string; tip: string; mainAt: string } {
    const dir = mkdtempSync(join(home, 'tree-'))
    git(dir, 'init', '-q', '-b', 'main')
    git(dir, 'config', 'user.name', 'Synthetic fixture')
    git(dir, 'config', 'user.email', 'fixture@example.invalid')
    mkdirSync(join(dir, 'work'))
    writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
    git(dir, 'add', '.')
    git(dir, 'commit', '-qm', 'Synthetic main')
    const mainAt = git(dir, 'rev-parse', 'HEAD')
    git(dir, 'switch', '-q', '-c', 'work')
    writeFileSync(join(dir, 'work', 'a.txt'), 'after\n')
    git(dir, 'add', '.')
    git(dir, 'commit', '-qm', 'Synthetic work')
    const tip = git(dir, 'rev-parse', 'HEAD')
    const run = t.api.createRecord({ kind: 'session', title: 'Synthetic run of the repeated hour', workspaceId: WORKSPACE, origin: 'fixture', actor: person, data: { state: 'running', servingAgentId: worker, workingDirectory: dir, cutFrom: 'main', submission: { kind: 'git' } } }).id
    t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, person)
    const seal = t.api.getRecord(run)!.data.sealedTip as string
    const sealHash = (t.api.getRecord(seal)!.data.seal as { hash: string }).hash
    return { dir, run, seal, sealHash, tip, mainAt }
  }

  /**
   * An entry released at the clock's time now, waiting for its suite: its verdict carries the release's clock
   * observation, as the queue copies it. Synthetic.
   */
  function anEntryReleasedNow(): { id: string; run: string; tip: string; mainAt: string } {
    const one = aSealedRun()
    const released = time.clockStamp()
    const id = door.asTheMergeQueue(() =>
      t.api.createRecord({
        kind: 'merge_entry',
        title: 'Synthetic entry of the repeated hour',
        workspaceId: WORKSPACE,
        origin: 'fixture',
        actor: person,
        data: {
          state: 'testing',
          run: one.run,
          seal: { id: one.seal, hash: one.sealHash },
          submittedBy: { kind: 'person', id: person.id },
          occupies: one.dir,
          changeset: { adapter: 'git', root: one.dir, repository: one.dir, branch: 'main', commit: one.tip, base: one.mainAt },
          integration: { mainAt: one.mainAt, result: one.tip, clone: one.dir, files: {}, at: released.stamp },
          judged: {},
          reinspected: [],
          verdict: { run: one.run, by: { kind: 'person', id: person.id }, at: released.stamp, time: released, how: 'Synthetic released fixture', message: null },
        },
      }),
    ).id
    return { id, run: one.run, tip: one.tip, mainAt: one.mainAt }
  }

  async function step(id: string, name: string, facts: Record<string, unknown>) {
    return machine.stepAMergeEntry({ id, workspaceId: WORKSPACE, step: name as Parameters<typeof machine.stepAMergeEntry>[0]['step'], facts, actor: person })
  }

  /** The entry's green suite at `testedAt`, a bus when `bus` names riders, and its landing at `landedAt`. */
  async function itLands(one: ReturnType<typeof anEntryReleasedNow>, testedAt: number, landedAt: number, bus: string[] = []) {
    vi.setSystemTime(testedAt)
    const tested = await step(one.id, 'tested', {
      green: true,
      tip: one.tip,
      log: '/synthetic/green.log',
      ...(bus.length === 0 ? {} : { testedWith: { entry: bus[0], tree: 'synthetic-bus-tree', bus: bus.map((entry) => ({ entry })) } }),
    })
    expect(tested.entry.state, tested.decided).not.toBe('bounced')
    vi.setSystemTime(landedAt)
    await step(one.id, 'landing', { mainAt: one.mainAt })
    const landed = await step(one.id, 'landed', { mainAfter: one.tip })
    expect(landed.entry.state, landed.decided).toBe('merged')
    return landed.entry
  }

  /** An entry in the state given, with its fields written in the create, as the queue wrote them before it kept any clock observation. */
  function anOldEntry(name: string, state: string, more: Record<string, unknown>): string {
    return door.asTheMergeQueue(() =>
      t.api.createRecord({
        kind: 'merge_entry',
        title: `Synthetic old entry ${name}`,
        workspaceId: WORKSPACE,
        origin: 'fixture',
        actor: person,
        data: {
          run: `synthetic-run-${name}`,
          seal: { id: `synthetic-seal-${name}`, hash: `synthetic-hash-${name}` },
          changeset: { adapter: 'files', root: ROOT, operations: [] },
          state,
          submittedBy: { kind: 'agent', id: 'synthetic-worker' },
          ...more,
        },
      }),
    ).id
  }

  it('1. reads a stored stamp from the instant beside it, and an old one as its one moment or none', async () => {
    const read = Reflect.get(await import('../src/shared/time.ts'), 'momentOfAStoredStamp') as (at: unknown, time: unknown) => number | null
    expect(typeof read).toBe('function')
    // The instant beside the stamp, in either pass, whatever the words say.
    expect(read('2026-10-25 01:50:00', { stamp: '2026-10-25 01:50:00', instant: '2026-10-25T01:50:00.000+01:00' })).toBe(FIRST_PASS)
    expect(read('2026-10-25 01:10:00', { stamp: '2026-10-25 01:10:00', instant: '2026-10-25T01:10:00.000+00:00' })).toBe(SECOND_PASS)
    // An observation whose instant cannot be read gives no moment, and the good words beside it are not read in its place.
    expect(read('2026-10-24 12:00:00', { instant: 'not an instant' })).toBeNull()
    expect(read('2026-10-24 12:00:00', {})).toBeNull()
    expect(read('2026-10-24 12:00:00', 'not an observation')).toBeNull()
    // An old stamp, with nothing beside it: its one moment, and none in the repeated hour or the skipped one.
    expect(read('2026-10-24 12:00:00', undefined)).toBe(AN_ORDINARY_NOON)
    expect(read('2026-10-24 12:00:00', null)).toBe(AN_ORDINARY_NOON)
    expect(read('2026-10-25 01:30:00', undefined)).toBeNull()
    expect(read('2027-03-28 01:30:00', undefined)).toBeNull()
    expect(read(undefined, undefined)).toBeNull()
    // Controls: one second either side of both hours.
    expect(read('2026-10-25 00:59:59', undefined)).toBe(Date.UTC(2026, 9, 24, 23, 59, 59))
    expect(read('2026-10-25 02:00:00', undefined)).toBe(Date.UTC(2026, 9, 25, 2, 0, 0))
    expect(read('2027-03-28 00:59:59', undefined)).toBe(BEFORE_THE_GAP)
    expect(read('2027-03-28 02:00:00', undefined)).toBe(AFTER_THE_GAP)
  })

  it('2. counts a wait released in the first pass and landed in the second as twenty minutes, from what the steps keep', async () => {
    vi.setSystemTime(FIRST_PASS)
    const one = anEntryReleasedNow()
    const landed = await itLands(one, FIRST_PASS + 5 * MINUTE, SECOND_PASS)
    // What the steps keep beside their stamps, on the entry and on the run.
    const tested = landed.machine?.['tested'] as { at: string; time?: { instant: string } }
    expect(tested.at).toBe('2026-10-25 01:55:00')
    expect(tested.time?.instant).toBe('2026-10-25T01:55:00.000+01:00')
    const receipt = landed.machine?.['integrated'] as { at: string; time?: { instant: string } }
    expect(receipt.at).toBe('2026-10-25 01:10:00')
    expect(receipt.time?.instant).toBe('2026-10-25T01:10:00.000+00:00')
    expect((t.api.getRecord(one.run)!.data['integrated'] as { time?: { instant: string } }).time?.instant).toBe('2026-10-25T01:10:00.000+00:00')
    // Read as the first pass, the landing came forty minutes before the release, and its wait could not be read.
    const speed = page.theQueuesSpeed(WORKSPACE, new Date(SECOND_PASS + MINUTE))
    expect(speed.landed).toBe(1)
    expect(speed.landedUnreadable).toBe(0)
    expect(speed.judgedToLanded).toEqual({ medianMinutes: 20, measured: 1, unreadable: 0 })
  })

  it('3. counts a wait from 01:10 summer time to 01:20 winter time as seventy minutes, not ten', async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 25, 0, 10, 0))
    const one = anEntryReleasedNow()
    await itLands(one, Date.UTC(2026, 9, 25, 0, 30, 0), Date.UTC(2026, 9, 25, 1, 20, 0))
    expect(page.theQueuesSpeed(WORKSPACE, new Date(Date.UTC(2026, 9, 25, 2, 0, 0))).judgedToLanded).toEqual({ medianMinutes: 70, measured: 1, unreadable: 0 })
  })

  it('4. counts a landing and a bus in the second pass inside a window that starts in it', async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 25, 0, 40, 0))
    const rider = anOldEntry('rider', 'judged', {})
    const one = anEntryReleasedNow()
    const at = Date.UTC(2026, 9, 25, 1, 20, 0)
    await itLands(one, at, at, [rider])
    // The window is the 24 hours to 01:15 winter time on 26 October, and starts at 01:15 winter time on the 25th. Read as
    // the first pass, 01:20 is 00:20 winter time, before it, and neither was counted.
    const speed = page.theQueuesSpeed(WORKSPACE, new Date(Date.UTC(2026, 9, 26, 1, 15, 0)))
    expect(speed.landed).toBe(1)
    expect(speed.buses).toEqual({ ran: 1, aboardEach: 2, unreadable: 0 })
  })

  it('4. control: a release, a landing and buses across the skipped hour', async () => {
    vi.setSystemTime(Date.UTC(2027, 2, 28, 0, 30, 59))
    const acrossTheGap = anEntryReleasedNow()
    const later = anEntryReleasedNow()
    const rider = anOldEntry('rider', 'judged', {})
    await itLands(acrossTheGap, BEFORE_THE_GAP, AFTER_THE_GAP, [rider])
    await itLands(later, Date.UTC(2027, 2, 28, 1, 10, 0), Date.UTC(2027, 2, 28, 1, 30, 0), [rider])
    // Waits of 29 and 59 minutes, and a second.
    expect(page.theQueuesSpeed(WORKSPACE, new Date(Date.UTC(2027, 2, 28, 2, 0, 0)))).toMatchObject({
      landed: 2,
      landedUnreadable: 0,
      buses: { ran: 2, aboardEach: 2, unreadable: 0 },
      judgedToLanded: { medianMinutes: 44, measured: 2, unreadable: 0 },
    })
  })

  it('4. control: landings one second either side of the start of an ordinary window', async () => {
    // The window over the 24 hours to noon on 27 October starts at noon on the 26th, and does not include it.
    const window = Date.UTC(2026, 9, 26, 12, 0, 0)
    vi.setSystemTime(window - 10 * MINUTE)
    const atTheStart = anEntryReleasedNow()
    const aSecondLater = anEntryReleasedNow()
    await itLands(atTheStart, window - 5 * MINUTE, window)
    await itLands(aSecondLater, window, window + 1000)
    expect(page.theQueuesSpeed(WORKSPACE, new Date(window + 24 * 60 * MINUTE))).toMatchObject({ landed: 1, landedUnreadable: 0, judgedToLanded: { medianMinutes: 10, measured: 1, unreadable: 0 } })
  })

  it('5. counts what was recorded before the observation was kept, in either hour, as one that cannot be read', async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 25, 3, 0, 0))
    anOldEntry('landed-in-the-repeated-hour', 'merged', { verdict: { at: '2026-10-24 23:00:00' }, integrated: { at: '2026-10-25 01:30:00' } })
    anOldEntry('released-in-the-repeated-hour', 'merged', { verdict: { at: '2026-10-25 01:30:00' }, integrated: { at: '2026-10-25 02:30:00' } })
    anOldEntry('a-bus-in-the-repeated-hour', 'merged', { verdict: { at: '2026-10-25 00:10:00' }, integrated: { at: '2026-10-25 00:20:00' }, tested: { at: '2026-10-25 01:30:00', green: true, testedWith: { entry: 'synthetic', tree: 'synthetic-tree', bus: [{ entry: 'synthetic' }] } } })
    anOldEntry('a-bus-in-the-skipped-hour', 'testing', { tested: { at: '2027-03-28 01:30:00', green: true, testedWith: { entry: 'synthetic', tree: 'synthetic-tree', bus: [{ entry: 'synthetic' }] } } })
    // Control: outside both hours an old stamp is read, 00:30 summer time to 02:30 winter time being three hours.
    anOldEntry('outside-both', 'merged', { verdict: { at: '2026-10-25 00:30:00' }, integrated: { at: '2026-10-25 02:30:00' } })
    expect(page.theQueuesSpeed(WORKSPACE, new Date(Date.UTC(2026, 9, 25, 3, 0, 0)))).toMatchObject({
      landed: 3,
      landedUnreadable: 1,
      buses: { ran: 0, aboardEach: null, unreadable: 2 },
      judgedToLanded: { measured: 2, unreadable: 1 },
    })
  })

  it('6. reads an entry submitted in the second pass as submitted then, and the page draws how long it has waited', async () => {
    // Before the observation was kept: the control, one submitted on an ordinary day, and one submitted in the repeated hour.
    vi.setSystemTime(AN_ORDINARY_NOON)
    const onAnOrdinaryDay = anOldEntry('submitted-on-an-ordinary-day', 'submitted', {})
    const repositories = await import('../src/server/lib/repositories.ts')
    const one = aSealedRun()
    repositories.registerRepository({ workspaceId: WORKSPACE, name: 'synthetic-repeated-hour', root: one.dir, actor: { ...person, provedBy: 'the-person-key' } })
    vi.setSystemTime(FIRST_PASS)
    const inTheRepeatedHour = anOldEntry('submitted-in-the-repeated-hour', 'submitted', {})
    // Through the real submission, in the second pass.
    vi.setSystemTime(SECOND_PASS)
    const id = queue.submitAMergeEntry({ workspaceId: WORKSPACE, submission: { run: one.run, changeset: { adapter: 'git', repository: 'synthetic-repeated-hour' } }, actor: { ...person, provedBy: 'the-person-key' } }).entry.id
    expect((t.api.getRecord(id)!.data['submittedTime'] as { instant: string }).instant).toBe('2026-10-25T01:10:00.000+00:00')
    vi.setSystemTime(SECOND_PASS + 10 * MINUTE)
    const got = await app.inject({ method: 'GET', url: '/api/merge-queue?state=submitted', headers })
    expect(got.statusCode, got.body).toBe(200)
    const reply = got.json() as MergeQueueReply
    // Each row's `submittedInstant`, read by name because the field is new with the change.
    const instantOf = (entry: string): unknown => {
      const row = reply.lanes.flatMap((lane) => lane.entries).find((one) => one.id === entry)
      expect(row, entry).toBeDefined()
      return Reflect.get(row!, 'submittedInstant')
    }
    expect(instantOf(id)).toBe('2026-10-25T01:10:00.000+00:00')
    expect(instantOf(inTheRepeatedHour)).toBeUndefined()
    expect(instantOf(onAnOrdinaryDay)).toBe('2026-10-24T12:00:00.000+01:00')
    // The page, drawn from that reply ten minutes after the submission. Read as the first pass, the wait was 70
    // minutes, drawn as an hour.
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
    const mod = await import('../src/web/pages/MergeQueuePage.tsx')
    const { howLong } = await import('../src/web/pages/WorkingPage.tsx')
    const html = renderToStaticMarkup(h(mod.TheMergeQueue, { reply, now: new Date(SECOND_PASS + 10 * MINUTE) }))
    const waited = (entry: string) => new RegExp(`<li class="mq-row" data-entry="${entry}"[\\s\\S]*?<p class="mq-waited">([^<]*)</p>`, 'u').exec(html)?.[1]
    expect(waited(id)).toBe(i18n.t('mergeQueuePage.waited', { time: howLong(10) ?? '' }))
    expect(waited(inTheRepeatedHour)).toBe(i18n.t('mergeQueuePage.waitedUnknown'))
    expect(waited(onAnOrdinaryDay)).toBe(i18n.t('mergeQueuePage.waited', { time: howLong(14 * 60 + 20) ?? '' }))
  })

  describe('7. the queue history tool', () => {
    const leader = (stamp: string, landed: string) =>
      `${landed.slice(0, 10)} 00:40:00 merge entry leader (git) is testing; lane synthetic\n` +
      `${stamp} tested with merge entry rider in one suite, on the bus's tree abc123\n` +
      `${landed} the office answered: the entry is now merged\n`
    // The list of lines with two moments, read by name because the field is new with the change.
    const twoMoments = (out: { coverage: object }): unknown => Reflect.get(out.coverage, 'linesWithTwoMoments')

    it('leaves a line in the repeated hour out of its counts and lists it, and its command exits 1 for it', async () => {
      const tool = await import('../tools/queue-history.mjs')
      const twice = '2026-10-25 01:30:00'
      const out = tool.history([{ path: 'synthetic', text: leader(twice, '2026-10-25 02:10:00') }], '2026-10-25 00:30:00', '2026-10-25 03:00:00')
      expect(out.buses).toEqual([])
      expect(twoMoments(out)).toEqual([
        { source: 'synthetic', line: `${twice} tested with merge entry rider in one suite, on the bus's tree abc123`, because: `${twice} comes twice in Europe/London, in the hour the clocks go back, and the words do not say which of the two it was.` },
      ])
      // A line whose two moments are both after the window is not listed.
      expect(twoMoments(tool.history([{ path: 'synthetic', text: leader(twice, '2026-10-25 02:10:00') }], '2026-10-25 00:10:00', '2026-10-25 00:45:00'))).toEqual([])
      // The command reads a copy of the log from each of its two folders, and lists the line once for each copy.
      const root = mkdtempSync(join(home, 'history-'))
      const command = (stamp: string) => {
        for (const [folder, name] of [['queue', 'the-merger.log'], ['runs', 'said.txt']] as const) {
          mkdirSync(join(root, folder, 'entry'), { recursive: true })
          writeFileSync(join(root, folder, 'entry', name), leader(stamp, '2026-10-25 02:10:00'))
        }
        return spawnSync(process.execPath, ['tools/queue-history.mjs', '--from', '2026-10-25 00:30:00', '--to', '2026-10-25 03:00:00', '--queue-root', join(root, 'queue'), '--runs-root', join(root, 'runs')], { encoding: 'utf8', env: { ...process.env, HOME: root, TZ: 'Europe/London' } })
      }
      const listed = command(twice)
      expect(listed.status, listed.stderr).toBe(1)
      expect(JSON.parse(listed.stdout).coverage.linesWithTwoMoments.map((one: { source: string }) => one.source)).toEqual([join(root, 'queue', 'entry', 'the-merger.log'), join(root, 'runs', 'entry', 'said.txt')])
      expect(JSON.parse(listed.stdout).buses).toEqual([])
      // Control: the same logs with the bus at 00:50 summer time.
      const read = command('2026-10-25 00:50:00')
      expect(read.status, read.stderr).toBe(0)
      expect(JSON.parse(read.stdout).buses).toHaveLength(1)
    })

    it('refuses a window bound in the repeated hour or the skipped one', async () => {
      const tool = await import('../tools/queue-history.mjs')
      expect(() => tool.history([], '2026-10-25 01:30:00', '2026-10-25 03:00:00')).toThrow('2026-10-25 01:30:00 comes twice in Europe/London, in the hour the clocks go back, and the words do not say which of the two it was. Give a time outside that hour.')
      expect(() => tool.history([], '2026-10-25 00:30:00', '2026-10-25 01:30:00')).toThrow('comes twice in Europe/London')
      expect(() => tool.history([], '2027-03-28 01:30:00', '2027-03-28 03:00:00')).toThrow('Invalid local time: 2027-03-28 01:30:00')
    })

    it('control: reads and orders a bus and its landing across the skipped hour, one second apart', async () => {
      const tool = await import('../tools/queue-history.mjs')
      const out = tool.history([{ path: 'synthetic', text: leader('2027-03-28 00:59:59', '2027-03-28 02:00:00') }], '2027-03-28 00:30:00', '2027-03-28 03:00:00')
      expect(out.buses).toHaveLength(1)
      expect(out.buses[0]).toMatchObject({ declaredAt: '2027-03-28 00:59:59', riders: ['leader', 'rider'], leaderEnd: { outcome: 'landed', at: '2027-03-28 02:00:00' } })
      expect(tool.timeOf('2027-03-28 02:00:00') - tool.timeOf('2027-03-28 00:59:59')).toBe(1000)
      // The list is new with the change: before it, this line alone was red.
      expect(twoMoments(out)).toEqual([])
    })
  })
})
