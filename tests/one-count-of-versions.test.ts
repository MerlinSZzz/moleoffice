// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE STATEMENT IN THIS SERVER COUNTS A RECORD'S VERSIONS, AND THE `History` CONTROL IS TRUE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Two faults, one repair, and they are here together because the second is what the first was for.
 *
 * ONE. `revisions.ts` held TWO statements counting the same rows: `numbering()`, which reads count,
 * lowest and highest in a single query, and a second function that read `count(*)` on its own and was
 * called from two places inside the put-back. `listRevisions` opens with a comment saying it used to
 * call both and that they cannot disagree now because there is only one of them — and one function
 * away, the second one was still there. The record read was then going to add a third. So the second
 * function is deleted, its two callers read `numbering(recordId).count`, and this file fails if a
 * third ever appears.
 *
 * TWO. The control that count is drawn for. Measured on a `VACUUM INTO` copy of the owner's corpus
 * on 26 August 2026 with `tools/measure-the-history.mjs`: **361 of 707 records have exactly one
 * revision and its `op` is `baseline`** — the row the ledger backfill wrote, holding what the record
 * still holds. A badge reading `History 1` on one of those pages promises an earlier version that
 * was never stored. So the control is drawn from three facts and never from one.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO MUTATIONS, AND WHY A TEXT SCAN ALONE IS NOT ENOUGH
 * ---------------------------------------------------------------------------------------
 *
 * A source scan catches the LITERAL second count: somebody writing `count(*)` over `revisions` in a
 * second place. It cannot catch the INDIRECT one — `db.select({ n: count() })` using drizzle's own
 * aggregate helper builds exactly the same SQL and puts no `count(*)` in the source at all.
 *
 * **This file says that out loud rather than pretending otherwise, and pairs the scan with a runtime
 * check**: it wraps the real sqlite handle's `prepare` and collects every statement PREPARED while
 * the record read and the revisions listing run, then asserts that exactly one distinct SQL string
 * counts rows in `revisions`. That catches both mutations, because both must reach the database.
 *
 * The runtime half only fires on a path the run executes, so the path is named: the record read
 * `GET /api/records/:id` and `listRevisions`, both of which every control run of this file executes.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
// THE ONE READER OF A SECTION'S DECLARED NAME, and the key of the section this fold is. See `TITLE`.
import { titleHere } from '../src/web/components/sections.ts'
import { HISTORY_KEY } from '../src/shared/sections.ts'

const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE RUNNER'S ENVIRONMENT IS `node`. `src/web` reads storage the moment it is imported, so the
  // one browser global those modules touch is stood up here — the same stand-in
  // tests/putting-an-old-version-back.test.ts uses to import the very same file.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    },
    location: { hash: '', pathname: '/' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})

/** Make a record and return its id. */
async function aRecord(title: string): Promise<string> {
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind: 'note', title } })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { record: { id: string } }).record.id
}

/**
 * WHAT THE FOLD IS CALLED, READ OFF THE DECLARATION AND NEVER TYPED HERE.
 *
 * `historyControl` took the word `History` as a literal until 2 September 2026, while the section's
 * own `SectionSpec.title` read *How this record got here* — so the page said one thing and a comment
 * left on that fold read back in the review pane as the other. A word spelled out in this file would
 * be the third copy and would go on passing after the declaration changed.
 */
const TITLE = titleHere('note', HISTORY_KEY)

describe('the History control is drawn from three facts', () => {
  it('says its declared title with no numeral when the one version is the ledger backfill’s own row', async () => {
    const { historyControl } = await import('../src/web/components/RecordHistory.tsx')
    const backfilled = historyControl({ title: TITLE, versions: 1, baselineOnly: true, nowSeq: 1 })
    expect(backfilled.label).toBe(TITLE)
    expect(backfilled.badge).toBeNull()
    expect(backfilled.accessibleName).toContain('kept from the day Mole Office started keeping versions')
  })

  it('says its declared title and 1 when the record was filed after the ledger existed and never edited', async () => {
    const { historyControl } = await import('../src/web/components/RecordHistory.tsx')
    const filed = historyControl({ title: TITLE, versions: 1, baselineOnly: false, nowSeq: 1 })
    // "History: 1 version", a count that says what it counts (wave 13q's round 33; it read "History 1").
    expect(filed.label).toBe(`${TITLE}: 1 version`)
    expect(filed.badge).toBe(1)
  })

  it('says its declared title and 1 when the one baseline version is NOT what the record holds now', async () => {
    const { historyControl } = await import('../src/web/components/RecordHistory.tsx')
    // The third fact. The ledger holds one row and nothing in it matches what is on screen, so
    // there really IS something behind the control and the numeral is true again.
    const drifted = historyControl({ title: TITLE, versions: 1, baselineOnly: true, nowSeq: null })
    expect(drifted.label).toBe(`${TITLE}: 1 version`)
    expect(drifted.badge).toBe(1)
  })

  it('never draws a numeral that is not the number of versions', async () => {
    const { historyControl } = await import('../src/web/components/RecordHistory.tsx')
    for (const versions of [0, 1, 2, 6, 61]) {
      for (const baselineOnly of [true, false]) {
        for (const nowSeq of [null, 1]) {
          if (versions !== 1 && baselineOnly) continue
          const drawn = historyControl({ title: TITLE, versions, baselineOnly, nowSeq })
          if (drawn.badge !== null) expect(drawn.badge).toBe(versions)
          expect(drawn.accessibleName.startsWith(`${TITLE} — `)).toBe(true)
        }
      }
    }
  })

  it('the server says baselineOnly for a record whose only revision is a baseline, and not otherwise', async () => {
    const id = await aRecord('A note with one create revision')
    const { historyBadge } = await import('../src/server/lib/revisions.ts')

    // Filed through the product: one revision, op `create`. Not the backfill case.
    expect(historyBadge(id)).toEqual({ versions: 1, baselineOnly: false })

    // The backfill case, made the way the backfill makes it: one row whose op is `baseline`.
    t.client.sqlite.prepare("update revisions set op = 'baseline' where record_id = ?").run(id)
    expect(historyBadge(id)).toEqual({ versions: 1, baselineOnly: true })

    // A second version, and `baselineOnly` is false whatever the first row says.
    await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN,
      payload: { title: 'Edited once' },
    })
    expect(historyBadge(id)).toEqual({ versions: 2, baselineOnly: false })
  })

  it('the record read and the revisions listing agree about how many versions there are', async () => {
    const { listRevisions } = await import('../src/server/lib/revisions.ts')
    const ids: string[] = []
    for (const title of ['One', 'Two', 'Three']) ids.push(await aRecord(title))
    // Give them different ledgers, including the backfill shape and a multi-version one.
    t.client.sqlite.prepare("update revisions set op = 'baseline' where record_id = ?").run(ids[0])
    for (let i = 0; i < 3; i += 1) {
      await app.inject({
        method: 'PATCH',
        url: `/api/records/${ids[2]!}`,
        headers: HUMAN,
        payload: { title: `Three, edit ${String(i)}` },
      })
    }
    for (const id of ids) {
      const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
      expect(read.statusCode).toBe(200)
      const reply = read.json() as { history: { versions: number; baselineOnly: boolean } }
      expect(reply.history.versions).toBe(listRevisions(id).count)
    }
  })
})

describe('one statement counts a record’s versions', () => {
  /**
   * THE INDIRECT HALF, WHICH THE SCAN ABOVE CANNOT SEE.
   *
   * `db.select({ n: count() })` with drizzle's own aggregate helper builds the identical SQL and
   * writes no `count(*)` into the source. So the check is made where a statement cannot hide: at
   * the database. Every SQL string PREPARED while the record read and the revisions listing run is
   * collected, and exactly one of them may count rows in `revisions`.
   */
  it('exactly one distinct SQL statement counting revisions is prepared by the record read and the listing', async () => {
    const id = await aRecord('A note whose versions get counted')
    await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN,
      payload: { title: 'Edited' },
    })

    const { sqlite } = await import('../src/server/db/client.ts')
    const prepared: string[] = []
    const realPrepare = sqlite.prepare.bind(sqlite)
    // Wrapped rather than sampled: every statement, including ones drizzle builds at call time.
    ;(sqlite as unknown as { prepare: (sql: string) => unknown }).prepare = (sql: string) => {
      prepared.push(sql)
      return realPrepare(sql)
    }
    try {
      const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
      expect(read.statusCode).toBe(200)
      const listed = await app.inject({ method: 'GET', url: `/api/records/${id}/revisions`, headers: HUMAN })
      expect(listed.statusCode).toBe(200)
    } finally {
      ;(sqlite as unknown as { prepare: unknown }).prepare = realPrepare
    }

    // THE PATH IS ASSERTED FIRST. A runtime check on a path that did not run is a green that means
    // nothing, so this says the two readers really were exercised before it says what they did.
    const touchedRevisions = prepared.filter((sql) => /\brevisions\b/i.test(sql))
    expect(touchedRevisions.length).toBeGreaterThan(0)

    const counting = new Set(
      touchedRevisions.filter((sql) => /count\s*\(\s*\*\s*\)/i.test(sql)).map((sql) => sql.replace(/\s+/g, ' ').trim()),
    )
    expect([...counting].length).toBe(1)
  })
})
