// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE PAGE, OPTION A, IN WAVE 13P ROUND 30.
 *
 * src/server/lib/merge-queue-page.ts works out what GET /api/merge-queue adds for the page; src/web/pages/MergeQueuePage.tsx
 * draws it. Every record here is a synthetic fixture in a throwaway database. An entry is moved to the front only by wave
 * 13t's own door, `moveToTheFront` in src/server/lib/merge-state-machine.ts, or POST /api/merge-queue/<id>/first, so
 * the move the page reads is the one the merge queue writes. The browser case is given a stand-in GET reply written in
 * this file, and its press reaches either a stand-in answer or this test's own server; nothing reaches the live server.
 *
 * WHAT IS PROVED
 *
 *   1. The speed line's counts: entries landed in the 24 hours, entries aboard each bus on average, and the median from
 *      verdict to landing, each leaving out what is outside the window. A landing, a bus end or a verdict whose stamp
 *      cannot be read is counted as unreadable and not as anything else.
 *   2. Nothing landed and no bus ran: the counts are 0 and the average and median are null, never 0.
 *   3. The landing order: the entry holding the lane first, then judged entries in the order the merge tool takes
 *      them (the lane's own order, moved entries first, with each held entry after the one it waits behind, so the
 *      bus's rider and the entry it passed over go before the moved entry), then the entries still being checked. The
 *      route hands this on in the same reply as the lanes, with each move as the entry holds it and who made it.
 *   4. The rows as the page draws them from that reply: numbered in that order, each with its state in plain words, who
 *      submitted it (the registry's handle, read on the server, or a sentence where no registry row answers), its tag,
 *      why it waits, and who moved it; the press is offered to the person only on the rows a move would put ahead of
 *      something, and to an agent on none. A reinspecting entry that let its lane go says so and not that it holds the
 *      lane, and a judged entry written before an entry back from its check says it waits behind that entry (wave 13u,
 *      item 53).
 *   5. A press through the real door, as the person: the route answers 200 in the door's words, and the next GET reads
 *      the entry as moved and puts it where the tool now takes it.
 *   6. The press, in the built page: it asks for a reason first, draws the door's answer and a refusal in the door's own
 *      words from a stand-in, and this server's own door's refusal of an entry it does not hold, by its refusal code.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   `within` in theQueuesSpeed lets in stamps older than 24 hours            → case 1
 *   `aboardEach` is 0 when no bus ran                                        → case 2
 *   theLandingOrder takes judged entries in the lane's order, ignoring holds → cases 3, 4 and 5
 *   theMovable leaves out the bus's seats from what stays ahead              → case 4
 *   ThePress draws its own sentence, with no fault, in place of the door's   → case 6
 *   theHandles shows the stored id where no registry row answers             → case 4 and the route case
 *   whyItWaits says a reinspecting entry holds the lane whatever it holds    → the check-again row case
 *   whyItWaits says nothing of 'a-returning-entry-goes-first'                → the check-again row case
 */
import type { Route } from 'playwright'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { MergeQueueReply } from '../src/shared/merge-queue-page.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { localStamp } from '../src/shared/time.ts'
import { englishWords } from '../src/shared/words/joined.ts'

// The page's English words: en.ts joined with every wave's file, where this wave's words are.
const en = englishWords()
const WORKSPACE = 'default'
const ROOT = '/synthetic/lane-of-the-page'
const office = { type: 'agent' as const, id: 'mole-office/the-message-worker' }
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** The synthetic agent that submits the rider. Every other entry names `synthetic-worker`, which no registry row answers. */
const SUBMITTER = { id: 'synthetic-wave-agent-id', handle: 'synthetic-wave-13p', name: 'Synthetic wave' }
const LIVE = 'submitted,pinned,judged,integrating,reinspecting,testing,landing,resolving'

describe('the server side', () => {
  let t: TestDb
  let page: typeof import('../src/server/lib/merge-queue-page.ts')
  let queue: typeof import('../src/server/lib/merge-queue.ts')
  let door: typeof import('../src/server/lib/merge-entry-door.ts')
  let machine: typeof import('../src/server/lib/merge-state-machine.ts')

  beforeEach(async () => {
    t = await freshDb()
    page = await import('../src/server/lib/merge-queue-page.ts')
    queue = await import('../src/server/lib/merge-queue.ts')
    door = await import('../src/server/lib/merge-entry-door.ts')
    machine = await import('../src/server/lib/merge-state-machine.ts')
  })

  afterEach(() => {
    vi.useRealTimers()
    t.close()
  })

  /** A merge entry in the shape the queue writes, written as the queue writes. Synthetic. */
  function anEntry(name: string, state: string, more: Record<string, unknown> = {}): string {
    return door.asTheMergeQueue(() =>
      t.api.createRecord({
        kind: 'merge_entry',
        title: `Synthetic merge entry ${name}`,
        workspaceId: WORKSPACE,
        actor: office,
        origin: 'fixture',
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

  /** A registry row for one synthetic agent, written straight into the throwaway database. */
  function aRegisteredAgent(who: { id: string; handle: string; name: string }): void {
    t.client.sqlite
      .prepare(
        'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
          "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated') ON CONFLICT(id) DO NOTHING",
      )
      .run(`avatar-default-agent-${who.id}`, '2026-09-01 08:00:00')
    t.client.sqlite
      .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) VALUES (?,?,?,?,0,NULL,?)')
      .run(who.id, who.name, who.handle, `avatar-default-agent-${who.id}`, '2026-09-01 08:00:00')
  }

  /** Moves an entry to judged at this moment, which writes its mark for the merge tool. */
  function markAt(id: string, at: Date): void {
    vi.setSystemTime(at)
    queue.moveEntry({ id, to: 'judged', actor: office })
  }

  const NOW = new Date(2026, 9, 8, 12, 0, 0)
  const before = (minutes: number): string => localStamp(new Date(NOW.getTime() - minutes * 60_000))

  it('counts what landed, who rode each bus and the median from verdict to landing, in the 24 hours', () => {
    anEntry('landed-60', 'merged', {
      verdict: { at: before(120) },
      integrated: { at: before(60) },
      tested: { at: before(70), green: true, testedWith: { bus: [{ entry: 'synthetic-a' }, { entry: 'synthetic-b' }] } },
    })
    anEntry('landed-30', 'merged', { verdict: { at: before(210) }, integrated: { at: before(180) }, tested: { at: before(190), testedWith: { bus: [] } } })
    anEntry('landed-120', 'merged', { verdict: { at: before(360) }, integrated: { at: before(240) } })
    anEntry('landed-no-verdict', 'merged', { integrated: { at: before(90) } })
    anEntry('landed-verdict-after', 'merged', { verdict: { at: before(10) }, integrated: { at: before(20) } })
    anEntry('landed-two-days-ago', 'merged', {
      verdict: { at: before(2 * 24 * 60 + 30) },
      integrated: { at: before(2 * 24 * 60) },
      tested: { at: before(2 * 24 * 60 + 10), testedWith: { bus: [{ entry: 'synthetic-c' }] } },
    })
    anEntry('merged-with-no-landing', 'merged', { verdict: { at: before(30) } })
    anEntry('merged-with-a-bad-landing', 'merged', { integrated: { at: 'not a time' } })
    anEntry('bus-with-no-end', 'reinspecting', { occupies: ROOT, tested: { at: 'not a time', testedWith: { bus: [{ entry: 'synthetic-d' }] } } })

    const speed = page.theQueuesSpeed(WORKSPACE, NOW)
    expect(speed).toEqual({
      at: localStamp(NOW),
      since: before(24 * 60),
      landed: 5,
      landedUnreadable: 2,
      buses: { ran: 2, aboardEach: 2, unreadable: 1 },
      judgedToLanded: { medianMinutes: 60, measured: 3, unreadable: 2 },
    })
  })

  it('says nothing landed and no bus ran with 0 and null, never 0 for a median or an average', () => {
    anEntry('only-waiting', 'submitted')
    anEntry('landed-long-ago', 'merged', { verdict: { at: before(3 * 24 * 60 + 5) }, integrated: { at: before(3 * 24 * 60) } })
    expect(page.theQueuesSpeed(WORKSPACE, NOW)).toEqual({
      at: localStamp(NOW),
      since: before(24 * 60),
      landed: 0,
      landedUnreadable: 0,
      buses: { ran: 0, aboardEach: null, unreadable: 0 },
      judgedToLanded: { medianMinutes: null, measured: 0, unreadable: 0 },
    })
  })

  /**
   * One lane: an entry submitted first that did not ride, a rider, an entry the bus passed over, an entry still being
   * checked, and an entry the person moved to the front through wave 13t's door. The rider was marked before the
   * passed-over entry.
   */
  function aLane(): Record<'notOnTheBus' | 'rider' | 'passedOver' | 'checking' | 'moved', string> {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 1, 9, 0, 0))
    aRegisteredAgent(SUBMITTER)
    const notOnTheBus = anEntry('not-on-the-bus', 'submitted')
    const rider = anEntry('rider', 'submitted', { submittedBy: { kind: 'agent', id: SUBMITTER.id } })
    const passedOver = anEntry('passed-over', 'submitted')
    const checking = anEntry('checking', 'submitted')
    const moved = anEntry('moved', 'judged', { verdict: { at: '2026-09-01 09:00:00' } })
    vi.setSystemTime(new Date(2026, 8, 1, 9, 30, 0))
    machine.moveToTheFront({ workspaceId: WORKSPACE, id: moved, because: 'it unblocks the release', actor: { type: 'human', id: THE_PERSON } })
    anEntry('driver', 'merged', {
      integrated: { at: '2026-09-01 09:20:00' },
      tested: { at: '2026-09-01 09:10:00', green: true, testedWith: { bus: [{ entry: rider }], passedForACheck: [passedOver] } },
    })
    markAt(rider, new Date(2026, 8, 1, 10, 0, 0))
    markAt(passedOver, new Date(2026, 8, 1, 10, 5, 0))
    markAt(notOnTheBus, new Date(2026, 8, 1, 10, 10, 0))
    vi.useRealTimers()
    return { notOnTheBus, rider, passedOver, checking, moved }
  }

  it('orders a lane: the judged entries as the merge tool takes them, the bus before a move, then those being checked', () => {
    const lane = aLane()
    const listed = queue.listMergeQueue({ workspaceId: WORKSPACE })
    const reading = page.theQueuePageReading({ workspaceId: WORKSPACE, lanes: listed.lanes, now: new Date(2026, 8, 1, 12, 0, 0) })
    expect(reading.page.lanes).toHaveLength(1)
    const [only] = reading.page.lanes
    const merged = listed.lanes[0]!.entries.filter((one) => one.state === 'merged').map((one) => one.id)
    expect(only!.order).toEqual([lane.rider, lane.passedOver, lane.moved, lane.notOnTheBus, lane.checking, ...merged])
    expect(only!.bus).toMatchObject({ riders: [lane.rider], passedForACheck: [lane.passedOver], green: true, at: '2026-09-01 09:10:00' })
    // THE MOVE IS THE ENTRY'S OWN, as the door wrote it, and the page is told who made it by handle.
    const moved = listed.lanes[0]!.entries.find((one) => one.id === lane.moved)!
    expect(moved.movedFirst).toMatchObject({ by: { kind: 'person', id: THE_PERSON }, at: '2026-09-01 09:30:00', because: 'it unblocks the release', turn: 1 })
    expect(Object.keys(reading.page.movers)).toEqual([lane.moved])
    // THE ORDER COMES FROM THE TOOL'S OWN RULE: the passed-over entry waits behind the rider, and the moved entry and the
    // one not on the bus wait behind the passed-over entry.
    const waits = Object.fromEntries(listed.lanes[0]!.entries.map((one) => [one.id, one.toolWaits?.because ?? null]))
    expect(waits[lane.passedOver]).toBe('a-rider-goes-first')
    expect(waits[lane.moved]).toBe('an-entry-passed-over-for-a-check-goes-first')
    expect(waits[lane.notOnTheBus]).toBe('an-entry-passed-over-for-a-check-goes-first')
    expect(waits[lane.rider]).toBeNull()
    // A PRESS ONLY WHERE IT PUTS THE ENTRY AHEAD OF SOMETHING: not the passed-over entry or the one not on the bus, which a
    // move would leave behind the bus's seats and the earlier move, nor the rider or the moved entry.
    expect(only!.movable).toEqual([lane.checking])
  })

  it('puts the entry holding the lane first', () => {
    const lane = aLane()
    const holder = anEntry('holder', 'testing', { occupies: ROOT })
    const listed = queue.listMergeQueue({ workspaceId: WORKSPACE, states: ['submitted', 'judged', 'testing'] })
    const reading = page.theQueuePageReading({ workspaceId: WORKSPACE, lanes: listed.lanes, now: new Date() })
    // WHILE THE LANE IS HELD, the tool's hold on every judged entry is the holder, so behind it the page has only the
    // lane's own order to go by, with the move first.
    expect(reading.page.lanes[0]!.order.slice(0, 2)).toEqual([holder, lane.moved])
    expect(reading.page.lanes[0]!.order.at(-1)).toBe(lane.checking)
  })

  it('hands the page its reading in the same GET reply, and reads a press through the real door in the next', async () => {
    const lane = aLane()
    const hourAgo = new Date(Date.now() - 60 * 60_000)
    anEntry('landed-an-hour-ago', 'merged', { verdict: { at: localStamp(new Date(hourAgo.getTime() - 60_000)) }, integrated: { at: localStamp(hourAgo) } })
    const app = (await apiApp()).app
    await app.ready()
    try {
      const reply = await app.inject({ method: 'GET', url: `/api/merge-queue?state=${LIVE}`, headers: AS_THE_PERSON })
      expect(reply.statusCode, reply.body).toBe(200)
      const body = reply.json() as MergeQueueReply
      expect(body.page.lanes.map((one) => one.lane)).toEqual([ROOT])
      expect(body.page.lanes[0]!.order).toEqual([lane.rider, lane.passedOver, lane.moved, lane.notOnTheBus, lane.checking])
      expect(body.page.lanes[0]!.movable).toEqual([lane.checking])
      // WHO SUBMITTED EACH ENTRY, read off the registry in the same reply: the handle, or null where no row answers.
      expect(body.page.submitters).toEqual({
        [lane.moved]: null,
        [lane.rider]: SUBMITTER.handle,
        [lane.passedOver]: null,
        [lane.notOnTheBus]: null,
        [lane.checking]: null,
      })
      // THE SPEED IS OVER EVERY LIVE ENTRY, though the request narrowed the lanes to entries still on their way in.
      expect(body.speed.landed).toBe(1)
      expect(body.speed.judgedToLanded).toEqual({ medianMinutes: 1, measured: 1, unreadable: 0 })
      expect(body.speed.buses).toEqual({ ran: 0, aboardEach: null, unreadable: 0 })
      // THE PRESS THE PAGE MAKES, through wave 13t's door as the person, and the GET after it.
      const first = await app.inject({ method: 'POST', url: `/api/merge-queue/${lane.checking}/first`, headers: AS_THE_PERSON, payload: { because: 'synthetic: the release waits on it' } })
      expect(first.statusCode, first.body).toBe(200)
      expect((first.json() as { says: string }).says).toMatch(/\S/u)
      const after = (await app.inject({ method: 'GET', url: `/api/merge-queue?state=${LIVE}`, headers: AS_THE_PERSON })).json() as MergeQueueReply
      const pressed = after.lanes[0]!.entries.find((one) => one.id === lane.checking)!
      expect(pressed.movedFirst).toMatchObject({ by: { kind: 'person', id: THE_PERSON }, because: 'synthetic: the release waits on it', turn: 2 })
      expect(Object.keys(after.page.movers).sort()).toEqual([lane.moved, lane.checking].sort())
      // STILL BEING CHECKED, it leads only those still being checked, and nothing is left for a press to move.
      expect(after.page.lanes[0]!.order).toEqual([lane.rider, lane.passedOver, lane.moved, lane.notOnTheBus, lane.checking])
      expect(after.page.lanes[0]!.movable).toEqual([])
      // A SECOND PRESS IS REFUSED BY THE DOOR, in its words, which the page draws as they are.
      const again = await app.inject({ method: 'POST', url: `/api/merge-queue/${lane.moved}/first`, headers: AS_THE_PERSON, payload: { because: 'synthetic' } })
      expect(again.statusCode, again.body).toBe(409)
      expect((again.json() as { error: string }).error).toMatch(/It cannot be moved again\. Nothing was written\.$/u)
    } finally {
      await app.close()
    }
  })

  describe('the rows as the page draws them', () => {
    let reply: MergeQueueReply
    let lane: ReturnType<typeof aLane>

    beforeEach(async () => {
      lane = aLane()
      const app = (await apiApp()).app
      await app.ready()
      try {
        const got = await app.inject({ method: 'GET', url: `/api/merge-queue?state=${LIVE}`, headers: AS_THE_PERSON })
        expect(got.statusCode, got.body).toBe(200)
        reply = got.json() as MergeQueueReply
      } finally {
        await app.close()
      }
    })

    /** The page module loaded under a window whose stored actor is `actor`, or the default (the person) for none. */
    async function thePageAs(actor: { type: string; id: string } | null): Promise<typeof import('../src/web/pages/MergeQueuePage.tsx')> {
      const store = new Map<string, string>()
      if (actor !== null) store.set('mole-office.actor', JSON.stringify(actor))
      const storage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      }
      ;(globalThis as unknown as { window: unknown }).window = {
        localStorage: storage,
        sessionStorage: storage,
        location: { hash: '', search: '' },
        addEventListener: () => {},
        removeEventListener: () => {},
      }
      vi.resetModules()
      const i18n = await import('../src/shared/i18n.ts')
      i18n.setWordLanguage('en')
      return import('../src/web/pages/MergeQueuePage.tsx')
    }

    /** Each row's id, its plain-words state, its tag, its text and whether it offers the press. */
    function rowsOf(html: string): { id: string; says: string; tag: string | null; text: string; press: boolean }[] {
      return [...html.matchAll(/<li class="mq-row" data-entry="([^"]+)" data-state="[^"]+" data-says="([^"]+)">([\s\S]*?)<\/li>/gu)].map((m) => ({
        id: m[1]!,
        says: m[2]!,
        tag: /data-tag="([^"]+)"/u.exec(m[3]!)?.[1] ?? null,
        text: m[3]!.replace(/<[^>]+>/gu, ' ').replace(/&#x27;/gu, "'").replace(/\s+/gu, ' '),
        press: m[3]!.includes(en['mergeQueuePage.press.open']),
      }))
    }

    it('numbers the rows in landing order, says each state and why it waits, and offers the person the press', async () => {
      const mod = await thePageAs(null)
      const html = renderToStaticMarkup(h(mod.TheMergeQueue, { reply, now: new Date(2026, 8, 1, 12, 0, 0) }))
      const rows = rowsOf(html)
      expect(rows.map((one) => one.id)).toEqual([lane.rider, lane.passedOver, lane.moved, lane.notOnTheBus, lane.checking])
      expect(rows.map((one) => one.says)).toEqual(['riding', 'waiting', 'waiting', 'waiting', 'checking'])
      expect(rows.map((one) => one.tag)).toEqual(['seat', 'passed-over', 'not-on-this-bus', 'not-on-this-bus', null])
      const [rider, passedOver, moved, notOnTheBus, checking] = rows
      // WHO MOVED IT is the person the door wrote on the entry, by the handle the server read for them.
      const mover = reply.page.movers[lane.moved]
      expect(mover).toEqual(expect.any(String))
      expect(moved!.text).toContain(`Moved to the front by ${mover!}, because it unblocks the release`)
      expect(moved!.text).toContain('Waits behind “Synthetic merge entry passed-over”, which the bus driven by')
      expect(rider!.text).toContain('seat 2 of 2')
      expect(rider!.text).toMatch(/riding the bus sent by synthetic-wave-13p “Synthetic merge entry rider” /u)
      expect(checking!.text).toContain(`checking ${en['mergeQueuePage.submitterUnknown']} “Synthetic merge entry checking” `)
      expect(passedOver!.text).toContain('Waits behind “Synthetic merge entry rider”, which rode the bus driven by “Synthetic merge entry driver”.')
      expect(passedOver!.text).toContain(
        sayInEnglish('mergeQueuePage.why.passedOver', { driver: sayInEnglish('mergeQueuePage.name.work', { work: 'Synthetic merge entry driver' }) }),
      )
      expect(notOnTheBus!.text).toContain('Waits behind “Synthetic merge entry passed-over”, which the bus driven by')
      expect(checking!.text).toContain('Just submitted.')
      // THE PRESS ONLY WHERE IT MOVES SOMETHING: not on the bus's seats, the moved entry, or the entry a move would
      // leave behind them all.
      expect(rows.filter((one) => one.press).map((one) => one.id)).toEqual([lane.checking])
      expect(html).toContain('In the last 24 hours: no entry landed')
      expect(html).toContain('no bus ran')
      expect(html).not.toMatch(/\b0 entries landed\b/u)
    })

    it('offers an agent no press', async () => {
      const mod = await thePageAs({ type: 'agent', id: 'synthetic-agent' })
      const html = renderToStaticMarkup(h(mod.TheMergeQueue, { reply, now: new Date(2026, 8, 1, 12, 0, 0) }))
      expect(rowsOf(html)).toHaveLength(5)
      expect(rowsOf(html).filter((one) => one.press)).toEqual([])
    })

    // A RE-CHECKED ENTRY LETS ITS LANE GO (wave 13u, item 53): its row says so, and not that it holds the lane, and a
    // judged entry written before an entry coming back from its check says it waits behind that entry. In a lane of its
    // own, so the lane the rows above are drawn from is not changed.
    it('says a reinspecting entry let its lane go, and that a judged entry waits behind an entry back from its check', async () => {
      const inItsOwnLane = { changeset: { adapter: 'files', root: '/synthetic/lane-of-a-check-again', operations: [] } }
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 8, 1, 11, 0, 0))
      const run = t.api.createRecord({ kind: 'session', title: 'Synthetic check-again run', workspaceId: WORKSPACE, actor: office, origin: 'fixture', data: { state: 'running' } }).id
      const letGo = anEntry('lets-its-lane-go', 'reinspecting', {
        ...inItsOwnLane,
        reinspection: { run, only: ['work/a.txt'], needsJudgment: [], askedAt: '2026-09-01 11:00:00', says: 'Synthetic: the office asked for this check.' },
      })
      const waiting = anEntry('written-before-the-return', 'submitted', inItsOwnLane)
      const returning = anEntry('back-from-its-check', 'submitted', { ...inItsOwnLane, returnsFirst: { run: 'synthetic-check-run-of-the-return', at: '2026-09-01 10:50:00', turn: 1 } })
      markAt(waiting, new Date(2026, 8, 1, 11, 5, 0))
      markAt(returning, new Date(2026, 8, 1, 11, 10, 0))
      vi.useRealTimers()
      const app = (await apiApp()).app
      await app.ready()
      let drawn: MergeQueueReply
      try {
        const got = await app.inject({ method: 'GET', url: `/api/merge-queue?state=${LIVE}`, headers: AS_THE_PERSON })
        expect(got.statusCode, got.body).toBe(200)
        drawn = got.json() as MergeQueueReply
      } finally {
        await app.close()
      }
      const mod = await thePageAs(null)
      const rows = rowsOf(renderToStaticMarkup(h(mod.TheMergeQueue, { reply: drawn, now: new Date(2026, 8, 1, 12, 0, 0) })))
      const row = (id: string) => rows.find((one) => one.id === id)!
      expect(row(letGo).text).toContain('Let the lane go while a check of work/a.txt runs, so other entries can land meanwhile.')
      expect(row(letGo).text).not.toContain('Holds the lane')
      expect(row(waiting).text).toContain('Waits behind “Synthetic merge entry back-from-its-check”, which let the lane go while it was checked again.')
      expect(row(returning).text).toContain(en['mergeQueuePage.why.next'])
      expect(rows.map((one) => one.id).filter((id) => id === waiting || id === returning)).toEqual([returning, waiting])
    })
  })
})

/** A stand-in reply of GET /api/merge-queue, synthetic, in the shape the server sends. */
function aStandInReply(): MergeQueueReply {
  const row = (id: string, state: string) => ({
    id,
    title: `Synthetic entry ${id}`,
    state,
    lane: '/synthetic/lane',
    occupies: null,
    submittedAt: '2026-10-08 09:00:00',
    submittedBy: { kind: 'agent', id: 'synthetic-worker' },
    machine: {},
  })
  return {
    lanes: [{ lane: '/synthetic/lane', occupiedBy: null, entries: [row('synthetic-two', 'judged'), row('synthetic-one', 'pinned')] }],
    // No emergency push in this lane (wave 13u round 82): the reply always carries the list, empty or not.
    emergencyPushes: [],
    says: '2 entries in 1 lane; 0 lanes are held right now.',
    workspaceId: WORKSPACE,
    speed: {
      at: '2026-10-08 12:00:00',
      since: '2026-10-07 12:00:00',
      landed: 0,
      landedUnreadable: 0,
      buses: { ran: 0, aboardEach: null, unreadable: 0 },
      judgedToLanded: { medianMinutes: null, measured: 0, unreadable: 0 },
    },
    page: {
      // THE PRESS IS ON THE SECOND ROW: the first is offered none (wave 13p round 31).
      lanes: [{ lane: '/synthetic/lane', bus: null, order: ['synthetic-two', 'synthetic-one'], movable: ['synthetic-one'] }],
      movers: {},
      pressers: {},
      submitters: { 'synthetic-one': 'synthetic-wave', 'synthetic-two': null },
      names: { 'synthetic-one': { wave: '13p', work: 'Synthetic work one' }, 'synthetic-two': { wave: null, work: 'Synthetic work two' } },
    },
  }
}

/**
 * A STAND-IN BODY UNDER THE SERVER'S OWN HEADERS. The browser refuses a reply that does not say which Mole Office it
 * came from (tests/a-page-that-rereads-keeps-what-it-has.test.ts says why), so the request really goes to this test's
 * server and only its status and body are replaced.
 */
async function theServersHeaders(route: Route, status: number, body: unknown): Promise<void> {
  const response = await route.fetch()
  const headers = response.headers()
  delete headers['content-length']
  await route.fulfill({ status, headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

describe('the press, in the built page, against a stand-in answer and the real door', () => {
  let app: LiveApp
  /** What the stand-in answers next: a status and body, or null to let the request reach this server's own door. */
  let door: { status: number; body: unknown } | null = null
  const sent: unknown[] = []
  let opened = 0

  beforeAll(async () => {
    app = await liveApp({ name: 'merge-queue-page', workspace: WORKSPACE, viewport: { width: 1024, height: 900 } })
    await app.page.route(
      (url) => url.pathname === '/api/merge-queue',
      (route) => theServersHeaders(route, 200, aStandInReply()),
    )
    await app.page.route(
      (url) => /^\/api\/merge-queue\/[^/]+\/first$/u.test(url.pathname),
      async (route) => {
        sent.push(route.request().postDataJSON())
        if (door === null) return route.fallback()
        return theServersHeaders(route, door.status, door.body)
      },
    )
  }, 180_000)

  afterAll(async () => {
    await app?.stop()
  })

  /** Opens the page, presses the first row's press, and sends `because`; returns what the row then says. */
  async function press(because: string): Promise<{ answered: string | null; refused: string | null }> {
    const page = app.page
    // A NEW DOCUMENT EACH TIME: a hash alone would keep the page that already drew the last answer.
    opened += 1
    await page.goto(`${app.site}/?opened=${opened}#/merge-queue`)
    await waitForThePage(page)
    const row = page.locator('li.mq-row[data-entry="synthetic-one"]')
    await row.waitFor({ timeout: 20_000 })
    await row.getByRole('button', { name: en['mergeQueuePage.press.open'] }).click()
    const send = row.getByRole('button', { name: en['mergeQueuePage.press.send'] })
    expect(await send.getAttribute('aria-disabled')).toBe('true')
    await row.locator('textarea').fill(because)
    expect(await send.getAttribute('aria-disabled')).toBeNull()
    await send.click()
    await row.locator('[data-press="answered"], [data-press="refused"]').first().waitFor({ timeout: 20_000 })
    const answered = row.locator('[data-press="answered"]')
    const refused = row.locator('[data-press="refused"]')
    return {
      answered: (await answered.count()) > 0 ? await answered.innerText() : null,
      refused: (await refused.count()) > 0 ? await refused.innerText() : null,
    }
  }

  it('draws the door answer and its refusal in its words, and the real door refusing an entry it does not hold', async () => {
    const page = app.page
    await page.goto(`${app.site}/#/merge-queue`)
    await waitForThePage(page)
    expect(await page.locator('h1.mq-title').innerText()).toBe(en['mergeQueuePage.nav'])
    await page.locator('li.mq-row').first().waitFor({ timeout: 20_000 }).catch(async () => {
      throw new Error(`The page drew no row. It says: ${await page.locator('main').innerText()}`)
    })
    expect(await page.locator('li.mq-row').count()).toBe(2)

    door = { status: 200, body: { entry: { id: 'synthetic-one' }, says: 'Synthetic: synthetic-one goes first in its lane.' } }
    expect(await press('the release waits on it')).toEqual({ answered: 'Synthetic: synthetic-one goes first in its lane.', refused: null })
    expect(sent.at(-1)).toEqual({ because: 'the release waits on it' })

    door = { status: 403, body: { error: 'Synthetic refusal: only the queue owner may move an entry first.' } }
    const forbidden = await press('please')
    expect(forbidden.answered).toBeNull()
    expect(forbidden.refused).toContain('Synthetic refusal: only the queue owner may move an entry first.')

    // THIS SERVER'S OWN DOOR, wave 13t's, holds no entry synthetic-one. Its refusal carries a code, and the page draws
    // the sentence the office keeps for that code in the reader's language, as every page draws a coded refusal.
    door = null
    const real = await app.page.request.post(`${app.api}/api/merge-queue/synthetic-one/first`, { headers: AS_THE_PERSON, data: { because: 'please' }, failOnStatusCode: false })
    expect(real.status(), await real.text()).toBe(404)
    const code = ((await real.json()) as { code?: string }).code
    expect(code).toBe('recordNotFound')
    const missing = await press('please')
    expect(missing.answered).toBeNull()
    expect(missing.refused).toContain(en['server.recordNotFound'])
  }, 180_000)
})
