// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Tests for src/web/lib/attention.ts and the four new clients in src/web/api.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE USED TO TEST, AND WHY IT DOES NOT ANY MORE
 * ---------------------------------------------------------------------------------------
 *
 * It used to check six hard-coded conditions — crashed session, failed item, stale `doing` item,
 * obligation due inside 48 hours, broken link, unreviewed agent write — a fixed tier order and a
 * cap of seven rows. Every one of those tests passed, and the panel they described was still
 * wrong: the corpus held exactly SEVEN crashed sessions, `crashed` was the first tier, and the cap
 * was seven, so the panel was seven crashes at every setting of every input and an obligation six
 * days past its date sat at row fourteen. A green suite over a rule nobody had measured.
 *
 * The rule now lives in src/shared/attention.ts, and it is tested there and against the database in
 * tests/attention-rule.test.ts and tests/reading-api.test.ts. What is left for THIS file is what
 * the browser still owns:
 *
 *   1. THE READERS. `data` is an open JSON bag the database does not check, so something has to
 *      turn it into typed values — and it must do that without inventing defaults. The half of
 *      these worth reading is the negative half: a session with no state is REPORTED, never quietly
 *      treated as finished. Home draws the pipelines reader; scripts/seed.ts calls the sessions and
 *      obligations readers. The modules reader and the sorting and cutting of sessions had no
 *      caller and were removed with their tests (plan 7FEOshq3mBGG, row F1).
 *   2. THE STAMP READERS. Local time, never UTC, and a bare due date meaning the END of that day.
 *      `parseDueStamp` is imported by the SERVER, so these tests guard both ends.
 *   3. THE TWO READINGS OVER THE SERVER'S REPLY, both of which exist to stop an empty answer and a
 *      missing answer being drawn the same way.
 *   4. THE FOUR NEW CLIENTS, against real routes and a real database. Not one of them may narrow
 *      what the server sent. That is the expensive failure in this codebase — three times the
 *      server got more honest and the browser went on drawing the old answer with nothing failing
 *      — and a narrowed attention reply is the worst version of it, because the count a caller
 *      would check against gets narrowed along with the rows.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { pipelinePosition } from '../src/shared/blocks.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { Change, PanelRecord } from '../src/shared/types.ts'
import {
  DAY_MS,
  HOUR_MS,
  OPENED_KEY,
  anchorState,
  formatDuration,
  lastTouchedItem,
  machineSummary,
  markOpened,
  parseDueStamp,
  parseLocalStamp,
  readObligations,
  readOpened,
  readPipelines,
  readSessions,
  recordIdFromHash,
  relativeToNow,
  stampFrom,
  type KeyValueStore,
} from '../src/web/lib/attention.ts'
import type { AnchorReading, AttentionReply } from '../src/web/api.ts'

// ---------------------------------------------------------------------------- fixtures

/** A fixed "now" so every duration in the expectations is a constant, not a race. */
const NOW = new Date(2026, 7, 7, 18, 0, 0).getTime() // 2026-08-07 18:00 local

const ago = (ms: number) => stampFrom(NOW - ms)

function record(over: Partial<PanelRecord> & Pick<PanelRecord, 'id' | 'kind' | 'title'>): PanelRecord {
  return {
    workspaceId: 'default',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    summary: null,
    data: {},
    createdAt: ago(30 * DAY_MS),
    updatedAt: ago(1 * HOUR_MS),
    deletedAt: null,
    ...over,
  }
}

function change(over: Partial<Change> & Pick<Change, 'id' | 'recordId' | 'at'>): Change {
  return {
    origin: 'authored',
    op: 'update',
    actorType: 'human',
    actorId: THE_TEST_OFFICES_OWNER.id,
    sessionId: null,
    field: 'data',
    oldValue: null,
    newValue: null,
    ...over,
  }
}

/** A module with one part and the items given, in the shape lib/records.ts stores. */
function moduleRecord(id: string, title: string, items: { id: string; text: string; state: string; note?: string }[]) {
  return record({
    id,
    kind: 'module',
    title,
    data: { context: 'why it exists', paths: [], parts: [{ id: `${id}-p1`, name: 'Part 1', items }] },
  })
}

function memoryStore(seed: Record<string, string> = {}): KeyValueStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed))
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

// ---------------------------------------------------------------------------- time

describe('local timestamps', () => {
  it('reads the stored format as local time, not UTC', () => {
    // The server writes local time (src/server/lib/records.ts `now()`), so reading it back has
    // to produce the same wall clock. An off-by-a-timezone here is an hour of wrong on "due in".
    expect(parseLocalStamp('2026-08-07 18:00:00')).toBe(new Date(2026, 7, 7, 18, 0, 0).getTime())
    expect(parseLocalStamp('2026-08-07T18:00')).toBe(new Date(2026, 7, 7, 18, 0, 0).getTime())
    expect(parseLocalStamp('2026-08-07')).toBe(new Date(2026, 7, 7, 0, 0, 0).getTime())
  })

  it('refuses anything that is not a timestamp instead of guessing one', () => {
    expect(parseLocalStamp('soon')).toBeNull()
    expect(parseLocalStamp('')).toBeNull()
    expect(parseDueStamp('next tuesday')).toBeNull()
  })

  it('treats a bare due date as the end of that day', () => {
    // "due 2026-08-03" must not be overdue at 00:01 on the 3rd. THE SERVER READS THIS FUNCTION:
    // src/server/lib/records.ts hands it to the shared rule as `dueMs`, so this one assertion is
    // what stops the browser and the server disagreeing about whether a record is late today.
    const endOfDay = parseDueStamp('2026-08-03')
    expect(endOfDay).toBeGreaterThan(new Date(2026, 7, 3, 23, 0, 0).getTime())
    expect(endOfDay).toBeLessThan(new Date(2026, 7, 4, 0, 0, 0).getTime())
  })

  it('formats durations as the shortest true thing', () => {
    expect(formatDuration(30_000)).toBe('just now')
    expect(formatDuration(12 * 60_000)).toBe('12m')
    expect(formatDuration(31 * HOUR_MS)).toBe('31h')
    expect(formatDuration(4 * DAY_MS)).toBe('4d')
  })

  it('says which side of now a time is on', () => {
    expect(relativeToNow(ago(3 * HOUR_MS), NOW)).toBe('3h ago')
    expect(relativeToNow(stampFrom(NOW + 31 * HOUR_MS), NOW)).toBe('in 31h')
    expect(relativeToNow('not a time', NOW)).toContain('unreadable')
  })

  it('round-trips a stamp through the server format', () => {
    expect(parseLocalStamp(stampFrom(NOW))).toBe(NOW)
  })
})

// ---------------------------------------------------------------------------- readers

describe('reading sessions', () => {
  const good = record({
    id: 's1',
    kind: 'session',
    title: 'baseline',
    data: { state: 'running', runtime: 'claude-code', doing: 'trial 14/20', lastOutputAt: ago(3 * 60_000) },
  })

  it('reads the four states', () => {
    const states = ['running', 'idle', 'finished', 'crashed']
    const records = states.map((s, i) => record({ id: `s${i}`, kind: 'session', title: s, data: { state: s } }))
    const { sessions, problems } = readSessions(records)
    expect(problems).toHaveLength(0)
    expect(sessions.map((s) => s.state)).toEqual(states)
  })

  it('reports a session with no state instead of assuming one', () => {
    const { sessions, problems } = readSessions([good, record({ id: 's2', kind: 'session', title: 'mystery' })])
    expect(sessions).toHaveLength(1)
    expect(problems).toHaveLength(1)
    expect(problems[0]?.problem).toContain('no `state`')
  })

  it('reports an unknown state rather than dropping the session', () => {
    // A word no session may hold. It was `paused` until criterion W6 made that one of the states.
    const odd = record({ id: 's3', kind: 'session', title: 'zombie', data: { state: 'zombified' } })
    const { sessions, problems } = readSessions([odd])
    expect(sessions).toHaveLength(0)
    expect(problems[0]?.problem).toContain('"zombified"')
  })
})

describe('reading obligations', () => {
  it('reads a due date and who it is owed to', () => {
    const { obligations, problems } = readObligations([
      record({ id: 'o1', kind: 'obligation', title: 'ESA milestone 2', data: { due: '2026-08-03', owedTo: 'ESA' } }),
    ])
    expect(problems).toHaveLength(0)
    expect(obligations[0]?.owedTo).toBe('ESA')
    expect(obligations[0]?.done).toBe(false)
  })

  it('reports an obligation with no date, because it can never come due', () => {
    const { problems } = readObligations([record({ id: 'o2', kind: 'obligation', title: 'someday' })])
    expect(problems[0]?.problem).toContain('no `due`')
  })

  it('reports a date it cannot read rather than treating it as today', () => {
    const { problems } = readObligations([
      record({ id: 'o3', kind: 'obligation', title: 'vague', data: { due: 'after the demo' } }),
    ])
    expect(problems[0]?.problem).toContain('not a date')
  })
})

describe('reading pipelines', () => {
  /** A block record of "Handover", named the way the server would title it. */
  const block = (id: string, name: string, state: string) =>
    record({ id, kind: 'block', title: `Handover \u203a ${name}`, data: { state } })

  const blocks = [block('a', 'detect', 'done'), block('b', 'grasp', 'doing'), block('c', 'hand over', 'todo')]

  it('reads the blocks in the pipeline\'s own order and finds where it is standing', () => {
    // THE ORDER COMES FROM THE PIPELINE, not from the order the records happen to arrive in. The
    // blocks are handed over shuffled here so that a reader taking the record list's order rather
    // than `blockIds` fails this test.
    const { pipelines, problems } = readPipelines([
      record({ id: 'p1', kind: 'pipeline', title: 'Handover', data: { blockIds: ['a', 'b', 'c'] } }),
      ...[...blocks].reverse(),
    ])
    expect(problems).toHaveLength(0)
    expect(pipelines[0]?.blocks.map((b) => b.name)).toEqual(['detect', 'grasp', 'hand over'])
    expect(pipelinePosition(pipelines[0]?.blocks ?? [])?.name).toBe('grasp')
  })

  it('puts a failed block ahead of a doing one when saying where it is', () => {
    const { pipelines } = readPipelines([
      record({ id: 'p2', kind: 'pipeline', title: 'Handover', data: { blockIds: ['a', 'b', 'c', 'd'] } }),
      ...blocks,
      block('d', 'release', 'failed'),
    ])
    expect(pipelinePosition(pipelines[0]?.blocks ?? [])?.name).toBe('release')
  })

  it('reports a pipeline with no blocks, one whose order names nothing, and one with a bad state', () => {
    const { pipelines, problems } = readPipelines([
      record({ id: 'p3', kind: 'pipeline', title: 'empty' }),
      record({ id: 'p4', kind: 'pipeline', title: 'bad', data: { blockIds: ['x'] } }),
      block('x', 'grasp', 'nearly'),
      record({ id: 'p5', kind: 'pipeline', title: 'a hole in the order', data: { blockIds: ['gone'] } }),
    ])
    expect(pipelines).toHaveLength(0)
    expect(problems).toHaveLength(3)
    expect(problems[0]?.problem).toContain('no `blockIds`')
    expect(problems[1]?.problem).toContain('"nearly"')
    // An id naming nothing is a hole in a stored order, and it is reported by position rather than
    // being skipped: a list with a gap in it is a fact about the archive.
    expect(problems[2]?.problem).toContain('no record has that id')
  })
})

// ---------------------------------------------------------------------------- item history

describe('dating one checklist item out of the change log', () => {
  const withState = (state: string) => ({
    parts: [{ id: 'p', items: [{ id: 'i1', text: 'reprint', state }, { id: 'i2', text: 'other', state: 'todo' }] }],
  })
  const mod = moduleRecord('m1', 'Tray clamp', [{ id: 'i1', text: 'reprint', state: 'doing' }])

  it('finds the newest change that actually moved this item', () => {
    const changes = [
      // Newest first, as the API returns them. The newest change touched a DIFFERENT item, so
      // it must not be mistaken for this one moving.
      change({
        id: 'c3',
        recordId: 'm1',
        at: ago(1 * HOUR_MS),
        oldValue: JSON.stringify(withState('doing')),
        newValue: JSON.stringify({
          parts: [{ id: 'p', items: [{ id: 'i1', text: 'reprint', state: 'doing' }, { id: 'i2', text: 'other', state: 'done' }] }],
        }),
      }),
      change({
        id: 'c2',
        recordId: 'm1',
        at: ago(5 * DAY_MS),
        oldValue: JSON.stringify(withState('todo')),
        newValue: JSON.stringify(withState('doing')),
      }),
    ]
    const touch = lastTouchedItem(changes, mod, 'i1', { complete: true, oldestSeen: ago(5 * DAY_MS) })
    expect(touch).toEqual({ at: ago(5 * DAY_MS), exact: true })
  })

  it('falls back to the record creation date when the whole log is in hand', () => {
    const touch = lastTouchedItem([], mod, 'i1', { complete: true, oldestSeen: null })
    expect(touch).toEqual({ at: mod.createdAt, exact: true })
  })

  it('answers with a lower bound, marked as one, when the log window does not reach back', () => {
    const oldest = ago(2 * DAY_MS)
    const touch = lastTouchedItem([change({ id: 'c1', recordId: 'other', at: oldest })], mod, 'i1', {
      complete: false,
      oldestSeen: oldest,
    })
    // The record was created 30 days ago, well before the window, so all we know is "at least
    // as long as the window". Saying "30d" would be a guess dressed as a measurement.
    expect(touch).toEqual({ at: oldest, exact: false })
  })
})

// ------------------------------------------------------------- readings over the server's reply

describe('which of three answers the anchor gave', () => {
  /** An anchor reading in the shape GET /api/anchor really sends. */
  function reading(over: Partial<AnchorReading> = {}): AnchorReading {
    return {
      reader: `human:${THE_TEST_OFFICES_OWNER.id}`,
      anchor: { reader: `human:${THE_TEST_OFFICES_OWNER.id}`, lastSeenAt: ago(18 * HOUR_MS), lastChangeId: 'c1' },
      changes: [],
      counts: { sinceAnchor: 0, returned: 0, everything: 12 },
      truncated: false,
      note: 'the server wrote this sentence',
      ...over,
    }
  }

  it('says NOBODY HAS LOOKED YET rather than showing an empty list', () => {
    // This is the whole reason the three are three. An empty list beside a cheerful 200 reads as
    // "nothing happened", and that is the one answer this feature must never give by mistake.
    const state = anchorState(
      reading({ anchor: null, changes: null, counts: { sinceAnchor: null, returned: 0, everything: 12 } }),
    )
    expect(state.answer).toBe('never-looked')
    expect(state.changes).toBeNull()
    expect(state.sinceAnchor).toBeNull()
  })

  it('tells that apart from having looked and nothing having happened', () => {
    expect(anchorState(reading()).answer).toBe('nothing-since')
    expect(anchorState(reading()).changes).toEqual([])
  })

  it('and from having looked and something having happened', () => {
    const state = anchorState(
      reading({
        changes: [change({ id: 'c9', recordId: 'r1', at: ago(2 * HOUR_MS) })],
        counts: { sinceAnchor: 4, returned: 1, everything: 16 },
        truncated: true,
      }),
    )
    expect(state.answer).toBe('changes-since')
    // The COUNT is the true number even when fewer rows came back. A surface that printed
    // `changes.length` would say one thing happened while four did.
    expect(state.sinceAnchor).toBe(4)
    expect(state.changes).toHaveLength(1)
    expect(state.truncated).toBe(true)
  })

  it('carries the server’s own sentence rather than writing a second one', () => {
    expect(anchorState(reading()).sentence).toBe('the server wrote this sentence')
  })
})

describe('whether this machine was actually looked at', () => {
  const reply = (over: Partial<AttentionReply>): Pick<AttentionReply, 'machine' | 'machineSweep'> =>
    ({
      machine: [],
      machineSweep: { swept: false, searched: [], unchecked: [], note: 'nobody looked' },
      ...over,
    }) as Pick<AttentionReply, 'machine' | 'machineSweep'>

  it('answers NULL, not zero, when the sweep did not run', () => {
    // An empty `machine` list from a sweep that never ran is the clean bill of health nobody
    // checked. An eleven-day-old simulator once sat holding this machine's GPU.
    const summary = machineSummary(reply({}))
    expect(summary.swept).toBe(false)
    expect(summary.count).toBeNull()
    expect(summary.sentence).toBe('nobody looked')
  })

  it('answers zero when the sweep ran and found nothing', () => {
    const summary = machineSummary(
      reply({ machineSweep: { swept: true, searched: ['ports'], unchecked: [], note: 'nothing unclaimed' } }),
    )
    expect(summary.swept).toBe(true)
    expect(summary.count).toBe(0)
  })
})

// ---------------------------------------------------------------------------- opened records

describe('which records you have opened', () => {
  it('remembers an open, keyed by record', () => {
    const store = memoryStore()
    markOpened(store, 'r1', NOW)
    expect(readOpened(store)).toEqual({ r1: stampFrom(NOW) })
  })

  it('keeps the newest open of a record', () => {
    const store = memoryStore()
    markOpened(store, 'r1', NOW - HOUR_MS)
    markOpened(store, 'r1', NOW)
    expect(readOpened(store).r1).toBe(stampFrom(NOW))
  })

  it('clears a corrupt store instead of pretending it is empty on purpose', () => {
    const store = memoryStore({ [OPENED_KEY]: 'not json' })
    expect(readOpened(store)).toEqual({})
    expect(store.map.has(OPENED_KEY)).toBe(false)
  })

  it('drops entries that are not timestamps', () => {
    const store = memoryStore({ [OPENED_KEY]: JSON.stringify({ r1: 'whenever', r2: stampFrom(NOW) }) })
    expect(readOpened(store)).toEqual({ r2: stampFrom(NOW) })
  })

  it('reads a record id out of a hash address, and nothing out of any other route', () => {
    expect(recordIdFromHash('#/r/abc123')).toBe('abc123')
    expect(recordIdFromHash('/r/abc123')).toBe('abc123')
    expect(recordIdFromHash('#/r/a%20b')).toBe('a b')
    expect(recordIdFromHash('#/queries')).toBeNull()
    expect(recordIdFromHash('#/')).toBeNull()
  })
})

// ============================================================ the clients, against real routes

/**
 * WHY THIS HALF TALKS TO A REAL SERVER.
 *
 * The four clients below are the whole of the browser's new data layer, and the only failure they
 * can have is a silent one: handing back less than the server sent. A hand-written fixture cannot
 * catch that, because a fixture is written from the same stale idea of the reply that the wrapper
 * is. So `fetch` is pointed at the real Fastify routes over a real SQLite file, and the assertions
 * are made against the bytes the server actually wrote.
 *
 * The environment is `node` — no DOM, and adding one would be a dependency this project has ruled
 * out — so the smallest stand-in for a window goes in before src/web/api.ts is imported, the same
 * way tests/panels-follow.test.ts does it.
 */
describe('the clients in src/web/api.ts', () => {
  type WebApi = typeof import('../src/web/api.ts')

  let db: TestDb
  let app: FastifyInstance
  let webApi: WebApi
  /** The body of the last reply the app sent, exactly as the wrapper received it. */
  let lastReply: unknown = null

  beforeAll(async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: storage,
      sessionStorage: storage,
      location: { hash: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }

    db = await freshDb()

    const { recordRoutes } = await import('../src/server/api/records.ts')
    const { linkRoutes } = await import('../src/server/api/links.ts')
    const { queryRoutes } = await import('../src/server/api/queries.ts')
    const { installErrorHandling } = await import('../src/server/lib/http.ts')

    app = Fastify()
    installErrorHandling(app)
    await app.register(recordRoutes, { prefix: '/api' })
    await app.register(linkRoutes, { prefix: '/api' })
    await app.register(queryRoutes, { prefix: '/api' })
    await app.ready()

    ;(globalThis as unknown as { fetch: unknown }).fetch = async (
      input: unknown,
      init: { method?: string; headers?: HeadersInit; body?: string } = {},
    ) => {
      const res = await app.inject({
        method: (init.method ?? 'GET') as 'GET',
        url: String(input),
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        ...(init.body === undefined ? {} : { payload: init.body }),
      })
      lastReply = res.body.length === 0 ? null : (JSON.parse(res.body) as unknown)
      return {
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        text: async () => res.body,
      }
    }

    webApi = await import('../src/web/api.ts')
    webApi.setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  })

  afterAll(async () => {
    await app.close()
    db.close()
  })

  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v)

  /** Every key the server sent, present on what the wrapper handed back, with the same value. */
  function keptEverything(sent: unknown, got: unknown): { missing: string[]; changed: string[] } {
    if (!isObj(sent) || !isObj(got)) throw new Error('both sides have to be JSON objects to compare')
    const missing = Object.keys(sent).filter((k) => !Object.prototype.hasOwnProperty.call(got, k))
    const changed = Object.keys(sent).filter(
      (k) =>
        Object.prototype.hasOwnProperty.call(got, k) && JSON.stringify(got[k]) !== JSON.stringify(sent[k]),
    )
    return { missing, changed }
  }

  /** Every row of a paged list: its first page, then each continuation. Each page states the same total, and the rows number it. */
  async function allRows<R>(page: { rows: R[]; total: number; next: string | null }): Promise<R[]> {
    const rows = [...page.rows]
    let next = page.next
    while (next !== null) {
      const res = await app.inject({ method: 'GET', url: next })
      expect(res.statusCode, res.body).toBe(200)
      const continued = res.json() as { rows: R[]; total: number; next: string | null }
      expect(continued.total).toBe(page.total)
      rows.push(...continued.rows)
      next = continued.next
    }
    expect(rows).toHaveLength(page.total)
    return rows
  }

  // ---- GET /api/attention -------------------------------------------------------------------

  describe('what needs a person today', () => {
    it('hands back the whole reply, every key, unchanged', async () => {
      const reply = await webApi.api.attention()
      const audit = keptEverything(lastReply, reply)
      expect(audit.missing, `attention() dropped ${audit.missing.join(', ')}`).toEqual([])
      expect(audit.changed, `attention() changed ${audit.changed.join(', ')}`).toEqual([])
    })

    it('carries the three groups that are questions rather than verdicts', async () => {
      // `unclassified`, `noState` and `paused` are the reason a narrowed reply is expensive here.
      // Each is a question for a person, and a wrapper that kept only `visible` would silently
      // answer all three with "nothing".
      const reply = await webApi.api.attention()
      expect(Array.isArray(reply.unclassified.rows)).toBe(true)
      expect(Array.isArray(reply.noState.rows)).toBe(true)
      expect(Array.isArray(reply.paused.rows)).toBe(true)
      expect(Array.isArray(reply.passedOver.rows)).toBe(true)
      expect(reply.read.records).toBeGreaterThanOrEqual(0)
    })

    it('says nobody swept the machine, rather than sending an empty list that looks clean', async () => {
      const reply = await webApi.api.attention()
      expect(reply.machineSweep.swept).toBe(false)
      expect(machineSummary({ machine: reply.machine.rows, machineSweep: reply.machineSweep }).count).toBeNull()
      expect(reply.machineSweep.note).toContain('NOT swept')
    })

    it('brings back EVERY ROW’S OWN REASON, with the factors and their points', async () => {
      // The one thing the interface is forbidden to work out for itself. A problem whose state
      // word is `open` stopped short, and the row has to say so in words the screen can print.
      const created = await webApi.api.createRecord({
        kind: 'problem',
        title: 'The E-stop path in the demo launcher is a no-op',
        data: {
          state: 'open',
          symptom: 'the rig keeps moving after the stop button is pressed',
          why_it_hurts: 'it is the only stop control at the bench',
          consequence: { bearer: 'person', what: 'somebody stands next to the arm during transplant trials' },
        },
      })
      const reply = await webApi.api.attention()
      const row = [...reply.visible, ...await allRows(reply.remainder)].find((r) => r.recordId === created.id)
      expect(row, 'the open problem is on the attention list').toBeDefined()
      expect(row?.reason.because).toContain('stopped short')
      expect(row?.reason.consequence?.bearer).toBe('person')
      // Safety is a rank floor age cannot move, and it is the row that says so.
      expect(row?.safety).toBe(true)
      expect(row?.reason.safetyFloor).toBe(true)
      const harm = row?.reason.factors.find((f) => f.name === 'harm')
      expect(harm?.points).toBeGreaterThan(0)
      expect(harm?.why).toContain('a person could be hurt')
      // A factor that scored NOTHING is still reported, with the reason it scored nothing.
      const sat = row?.reason.factors.find((f) => f.name === 'sat')
      expect(sat?.why.length ?? 0).toBeGreaterThan(0)
    })

    it('counts the whole list, not the part that is shown', async () => {
      const reply = await webApi.api.attention()
      expect(reply.total).toBe(reply.visible.length + reply.remainder.total)
      // Every row the caps moved says WHICH cap moved it; a visible row says nothing moved it.
      for (const row of reply.visible) expect(row.displacedBy).toBeNull()
      for (const row of await allRows(reply.remainder)) expect(['group-cap', 'row-cap']).toContain(row.displacedBy)
    })

    it('names what the remainder is made of instead of counting it', async () => {
      // Approved decision 7 depends on this being on the reply: a screen cannot say what it is
      // hiding if the wrapper handed back a number.
      const reply = await webApi.api.attention()
      const counted = reply.remainderByGroup.reduce((sum, group) => sum + group.count, 0)
      expect(counted).toBe((await allRows(reply.remainder)).length)
      for (const group of reply.remainderByGroup) expect(group.label).not.toBe('')
    })

    it('asks for the machine sweep only when told to', async () => {
      const reply = await webApi.api.attention({ machine: 'include' })
      expect(reply.machineSweep.swept).toBe(true)
      const machine = await allRows(reply.machine)
      expect(machine).toHaveLength(reply.machine.total)
      expect(machineSummary({ machine, machineSweep: reply.machineSweep }).count).toBe(reply.machine.total)
    })
  })

  // ---- GET / PUT /api/anchor ----------------------------------------------------------------

  describe('the anchor, which is on the server and not in this browser', () => {
    it('says a reader who has never looked has no anchor, and sends no empty list', async () => {
      // Something IS in the log. That is what makes this test worth writing: the reader has no
      // anchor while the workspace has history, and the two must not produce the same screen.
      webApi.setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
      await webApi.api.createRecord({ kind: 'note', title: 'a write that predates anybody looking' })

      webApi.setActor({ type: 'human', id: 'nobody-has-looked' })
      const reading = await webApi.api.anchor()
      const audit = keptEverything(lastReply, reading)
      expect(audit.missing).toEqual([])
      expect(audit.changed).toEqual([])

      expect(reading.anchor).toBeNull()
      expect(reading.changes).toBeNull()
      const state = anchorState(reading)
      expect(state.answer).toBe('never-looked')
      expect(state.sentence).toContain('No anchor is recorded')
      // The log is NOT empty; it is the anchor that is missing. Those two must not draw the same.
      expect(reading.counts.everything).toBeGreaterThan(0)
    })

    it('moves on request, and then answers the question it could not answer before', async () => {
      webApi.setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
      const moved = await webApi.api.markReadTo()
      const auditMove = keptEverything(lastReply, moved)
      expect(auditMove.missing).toEqual([])
      expect(auditMove.changed).toEqual([])
      expect(moved.anchor.lastSeenAt).not.toBe('')
      expect(moved.previous).toBeNull() // the owner had never looked either

      const quiet = await webApi.api.anchor()
      expect(anchorState(quiet).answer).toBe('nothing-since')
      expect(quiet.counts.sinceAnchor).toBe(0)

      // Something happens while the person is away, and the anchor is what turns it into an answer.
      await webApi.api.createRecord({ kind: 'note', title: 'an agent wrote this overnight' })
      const busy = await webApi.api.anchor()
      const state = anchorState(busy)
      expect(state.answer).toBe('changes-since')
      expect(state.sinceAnchor ?? 0).toBeGreaterThan(0)
      expect(state.changes?.length ?? 0).toBeGreaterThan(0)
    })

    it('belongs to the PERSON, so a second browser reads the same bookmark', async () => {
      // THE WHOLE POINT. The phone is always the second browser. With the mark in localStorage the
      // phone could never answer "what happened while I was away"; here it reads what the desk set.
      webApi.setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
      const fromTheDesk = await webApi.api.markReadTo()
      // A different browser is a different actor OBJECT, not a different person.
      webApi.setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id, sessionId: 'the-phone' })
      const fromThePhone = await webApi.api.anchor()
      expect(fromThePhone.anchor?.reader).toBe(fromTheDesk.anchor.reader)
      expect(fromThePhone.anchor?.lastSeenAt).toBe(fromTheDesk.anchor.lastSeenAt)
      webApi.setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    })

    it('refuses to anchor on a change row that does not exist, rather than moving anyway', async () => {
      await expect(webApi.api.markReadTo({ lastChangeId: 'no-such-row' })).rejects.toThrow(/no change row/i)
    })
  })

  // ---- POST /api/records/:id/fulfil ----------------------------------------------------------

  describe('discharging an obligation', () => {
    it('writes the field nothing ever wrote, and hands back the whole reply', async () => {
      const owed = await webApi.api.createRecord({
        kind: 'obligation',
        title: '把借来的 SoilPen Mini 还给湿度组',
        data: { due: '2026-08-06', owedTo: '触觉组 (Ke 那边)', state: 'open', what_proves_it_done: 'Ke has it back' },
      })

      const before = await webApi.api.attention()
      expect(before.visible.concat(await allRows(before.remainder)).some((r) => r.recordId === owed.id)).toBe(true)

      const done = await webApi.api.fulfilObligation(owed.id, { note: 'Handed it back on the bench, Ke signed for it.' })
      const audit = keptEverything(lastReply, done)
      expect(audit.missing).toEqual([])
      expect(audit.changed).toEqual([])
      expect(done.fulfilment.done).toBe(true)
      expect(done.fulfilment.note).toContain('Ke signed for it')
      expect(done.alreadyDischarged).toBe(false)

      // And it stops being owed, which is the only proof that matters.
      const after = await webApi.api.attention()
      expect(after.visible.concat(await allRows(after.remainder)).some((r) => r.recordId === owed.id)).toBe(false)
    })

    it('says so and writes nothing when the promise was already kept', async () => {
      const owed = await webApi.api.createRecord({
        kind: 'obligation',
        title: 'Return the borrowed force gauge',
        data: { due: '2026-08-10 17:00', owedTo: 'the metrology lab', state: 'open' },
      })
      await webApi.api.fulfilObligation(owed.id, { note: 'Back in the metrology lab drawer.' })
      const again = await webApi.api.fulfilObligation(owed.id, { note: 'Back again?' })
      // Not an error and not a second write. Moving `fulfilledAt` to today for a promise kept last
      // week would quietly rewrite when it happened.
      expect(again.alreadyDischarged).toBe(true)
      expect(again.dataPatch).toBeUndefined()
      expect(again.dischargeNote).not.toBe('')
    })

    it('refuses a discharge with no note, because nobody can reconstruct it later', async () => {
      const owed = await webApi.api.createRecord({
        kind: 'obligation',
        title: 'Return the bench computer dev kit to the airflow mapping group',
        data: { due: '2026-09-15', owedTo: 'the SLAM group', state: 'open' },
      })
      await expect(webApi.api.fulfilObligation(owed.id, { note: '   ' })).rejects.toThrow(/what settled it/i)
    })
  })

  // ---- POST /api/links, with a gate ----------------------------------------------------------

  describe('creating a link that says how much it blocks', () => {
    it('stores a hard gate and a partial one, and shows the gate on the blocked record', async () => {
      const print = await webApi.api.createRecord({ kind: 'task', title: '重印 v3 #4 (setting 13, 壁厚 2.0 mm)' })
      const report = await webApi.api.createRecord({ kind: 'obligation', title: 'ESA report: grip-force section' })
      const twin = await webApi.api.createRecord({ kind: 'module', title: 'YuMi digital twin' })
      const arm = await webApi.api.createRecord({ kind: 'module', title: 'The real arm' })

      await webApi.api.createLink({ fromId: print.id, toId: report.id, type: 'blocks', gate: { kind: 'hard' } })
      await webApi.api.createLink({
        fromId: arm.id,
        toId: twin.id,
        type: 'blocks',
        gate: { kind: 'partial', upTo: 'bench tuning without the arm' },
      })

      // The blocked record is the one that has to say what it is waiting for, and it is the end
      // that stores nothing — the gate is served on both ends from the one stored row.
      const blocked = await webApi.api.getRecord(twin.id)
      const edge = blocked.links.find((l) => l.type === 'blocks')
      expect(JSON.stringify(edge)).toContain('bench tuning without the arm')
    })

    it('refuses a partial gate that does not say how far, rather than storing it half-written', async () => {
      const a = await webApi.api.createRecord({ kind: 'task', title: 'gate refusal A' })
      const b = await webApi.api.createRecord({ kind: 'task', title: 'gate refusal B' })
      // Stored half-written it would read as "blocked as far as (unstated)", which is worse than
      // the hard gate it would otherwise have been.
      await expect(
        webApi.api.createLink({ fromId: a.id, toId: b.id, type: 'blocks', gate: { kind: 'partial' } }),
      ).rejects.toThrow(/upTo/i)
    })

    it('refuses a gate on a link type that states no dependency', async () => {
      const a = await webApi.api.createRecord({ kind: 'task', title: 'gate refusal C' })
      const b = await webApi.api.createRecord({ kind: 'task', title: 'gate refusal D' })
      await expect(
        webApi.api.createLink({ fromId: a.id, toId: b.id, type: 'relates_to', gate: { kind: 'hard' } }),
      ).rejects.toThrow(/blocks/i)
    })

    it('leaves a link with no gate saying nothing, which is not the same as "hard"', async () => {
      const a = await webApi.api.createRecord({ kind: 'task', title: 'ungated A' })
      const b = await webApi.api.createRecord({ kind: 'task', title: 'ungated B' })
      const link = await webApi.api.createLink({ fromId: a.id, toId: b.id, type: 'blocks' })
      expect(typeof link.id).toBe('string')
      const blocked = await webApi.api.getRecord(b.id)
      const edge = blocked.links.find((l) => l.type === 'blocks')
      expect(edge).toBeDefined()
      // Every `blocks` link written before gates existed holds NULL here, and reading NULL as
      // `hard` would make work that is mostly doable look completely stuck.
      expect(JSON.stringify(edge)).not.toContain('must finish first')
    })
  })
})
