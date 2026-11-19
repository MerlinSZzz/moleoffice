// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON CAN FIND WHAT A RECORD HELD, COMPARE TWO VERSIONS, AND PUT ONE BACK.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office kept every version of every record and no screen ever asked for one. Four routes answered
 * — list, open one, compare two, put one back — and the browser wrapped only the first, calling it
 * to stamp a number on its own write. Measured 20 August 2026: a crawl of 24 pages pressed 1,696
 * controls and made zero requests to any of them.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR THINGS ASSERTED HERE, AND WHY EACH ONE FAILS QUIETLY WITHOUT A TEST
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE BROWSER ASKS FOR THE RIGHT ROUTES. `POST /api/records/:id/restore` is the UNDELETE and it
 *    is called from the browser already, so a grep for `restore` in `src/web` looks positive and
 *    means nothing. The put-back is `POST /api/records/:id/revisions/:seq/restore`. The two are
 *    asserted apart, by URL, from the real wrappers rather than from the source text.
 *
 * 2. THE VERSION LIST'S SHAPE IS WHAT THE SHORT-FORM EDITOR READS. That editor takes `seq` and
 *    `contentHash` off the newest entry and sends the pair, and the write route checks the pair
 *    against the ledger. So a change to the list route's field names, or to its order, breaks
 *    saving a short form — in the browser, at the moment somebody presses Save, with nothing
 *    failing before that. THIS TEST LANDED BEFORE THE HISTORY PANEL WAS BUILT, because that panel
 *    is the second caller of the same route.
 *
 * 3. WHAT A READER IS TOLD ABOUT ONE VERSION. 539 of 617 rows in the corpus are migration
 *    baselines, which hold what a record contained on the day the ledger was built and NOT what it
 *    held when it was created. A history that presents one as the original invents a past.
 *
 * 4. TWO TEXTS LINED UP WORD BY WORD really are the two texts. A diff that drops or joins words is
 *    a wrong answer that looks like a right one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, at, freshDb, one, type TestDb } from './helpers.ts'

const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

/** The office is made once for the file; each case files the records whose versions it reads. */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

interface Entry {
  seq: number
  contentHash: string
  op: string
  changed: { path: string }[] | null
}

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function versions(id: string): Promise<{ count: number; revisions: Entry[] }> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}/revisions`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as { count: number; revisions: Entry[] }
}

// ============================================================ 1. the routes the browser asks for

/**
 * THE REAL WRAPPERS, WITH A STAND-IN FOR `fetch`, so the URL asserted is the URL the browser builds.
 *
 * Reading `src/web/api.ts` as text would prove that a string is in a file. Calling the function and
 * catching the request proves what would leave the browser.
 */
describe('the browser asks for the four version routes, and not for the undelete', () => {
  interface Asked {
    path: string
    method: string
  }

  async function watch(call: (browser: typeof import('../src/web/api.ts').api) => Promise<unknown>): Promise<Asked> {
    const store = new Map<string, string>()
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      location: { hash: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    const asked: Asked[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = ((path: string, init: RequestInit = {}) => {
      asked.push({ path, method: init.method ?? 'GET' })
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    }) as typeof fetch
    try {
      const { api } = await import('../src/web/api.ts')
      await call(api)
    } finally {
      globalThis.fetch = realFetch
      delete (globalThis as unknown as { window?: unknown }).window
    }
    return one(asked, 'requests made by that one call')
  }

  it('lists the versions of one record', async () => {
    const asked = await watch(async (api) => await api.revisions('rec1'))
    expect(asked).toEqual({ path: '/api/records/rec1/revisions', method: 'GET' })
  })

  it('opens one version whole', async () => {
    const asked = await watch(async (api) => await api.revision('rec1', 3))
    expect(asked).toEqual({ path: '/api/records/rec1/revisions/3', method: 'GET' })
  })

  it('compares two versions, in the order asked', async () => {
    const asked = await watch(async (api) => await api.compareRevisions('rec1', 2, 5))
    expect(asked).toEqual({ path: '/api/records/rec1/revisions/2/compare/5', method: 'GET' })
  })

  /**
   * THE ONE THE OWNER'S FINDING IS ABOUT. If this asserts anything looser than the whole path, it
   * passes against the undelete below, which is a different act on a different object.
   */
  it('puts one version back, at the route that writes it forward as a new one', async () => {
    const asked = await watch(async (api) => await api.putRevisionBack('rec1', 3, { note: 'the numbers were right before' }))
    expect(asked).toEqual({ path: '/api/records/rec1/revisions/3/restore', method: 'POST' })
  })

  it('and the undelete is a different route, so a search for the word proves nothing', async () => {
    const asked = await watch(async (api) => await api.restoreRecord('rec1'))
    expect(asked.path).toBe('/api/records/rec1/restore')
    expect(asked.path).not.toContain('/revisions/')
  })
})

// ============================================================ 2. the shape the short forms read

describe('the version list is the shape a short form is written from', () => {
  /**
   * THE REGRESSION GUARD. The short-form editor reads `revisions[0]` and sends its `seq` and
   * `contentHash` together; the write route checks that pair against the ledger. Rename either
   * field, or list the oldest first, and saving a short form starts failing in the browser only.
   */
  it('answers newest first, with the seq and hash a short form must name', async () => {
    const id = await file('report', 'Round nine, what the versions are for', { blocks: [] })
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN,
      payload: { summary: 'A second write, so there are two versions to tell apart.' },
    })
    expect(patched.statusCode, patched.body).toBe(200)

    const list = await versions(id)
    expect(list.count).toBe(2)
    const newest = at(list.revisions, 0, 'the newest version')
    const older = at(list.revisions, 1, 'the version before it')
    expect(newest.seq).toBeGreaterThan(older.seq)
    expect(typeof newest.contentHash).toBe('string')
    expect(newest.contentHash.length).toBeGreaterThan(0)

    const saved = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/short-forms`,
      headers: HUMAN,
      payload: {
        madeFrom: { seq: newest.seq, contentHash: newest.contentHash },
        forms: { label: 'Versions, reachable' },
      },
    })
    expect(saved.statusCode, saved.body).toBe(200)
  })

  it('and a number from one entry beside a hash from another is refused', async () => {
    const id = await file('report', 'Round nine, a pair nobody wrote', { blocks: [] })
    await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN,
      payload: { summary: 'A second write.' },
    })
    const list = await versions(id)
    const newest = at(list.revisions, 0, 'the newest version')
    const older = at(list.revisions, 1, 'the version before it')

    const refused = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/short-forms`,
      headers: HUMAN,
      payload: {
        madeFrom: { seq: older.seq, contentHash: newest.contentHash },
        forms: { label: 'A pair nobody wrote' },
      },
    })
    expect(refused.statusCode).toBe(400)
  })
})

// ============================================================ 3. putting one back, through the route the browser calls

describe('putting a version back writes it forward and rewrites nothing', () => {
  it('keeps the old version exactly where it was and adds a new one', async () => {
    const id = await file('note', 'What the mount was measured at', { body: 'The bracket is 40 mm.' })
    await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN,
      payload: { data: { body: 'The bracket is 60 mm.' } },
    })
    const before = await versions(id)
    expect(before.count).toBe(2)
    const first = at(before.revisions, 1, 'the first version')

    const put = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/revisions/${String(first.seq)}/restore`,
      headers: HUMAN,
      payload: { note: 'The 60 was a typo.' },
    })
    expect(put.statusCode, put.body).toBe(200)
    const reply = put.json() as { putBack: number; newSeq: number | null }
    expect(reply.putBack).toBe(first.seq)
    expect(reply.newSeq).toBe(3)

    const after = await versions(id)
    expect(after.count).toBe(3)
    // The version that was put back is untouched: same number, same content hash.
    const stillThere = one(
      after.revisions.filter((r) => r.seq === first.seq),
      'the version that was put back',
    )
    expect(stillThere.contentHash).toBe(first.contentHash)

    const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
    expect((read.json() as { record: { data: { body: string } } }).record.data.body).toBe('The bracket is 40 mm.')
  })
})

// ============================================================ 4. what a reader is told

type History = typeof import('../src/web/components/RecordHistory.tsx')
const history = async (): Promise<History> => await import('../src/web/components/RecordHistory.tsx')

describe('what a person is told about one version', () => {
  it('says a migration baseline is not the record as it was written', async () => {
    const { whatThisVersionIs } = await history()
    const said = whatThisVersionIs({ op: 'baseline', at: '2026-08-14 10:00:00' })
    expect(said.warn).toBe(true)
    expect(said.told).toContain('started keeping versions')
  })

  it('does not call an ordinary write a baseline', async () => {
    const { whatThisVersionIs } = await history()
    expect(whatThisVersionIs({ op: 'update', at: '2026-08-20 10:00:00' }).warn).toBe(false)
    expect(whatThisVersionIs({ op: 'restore', at: '2026-08-20 10:00:00' }).told).toContain('put back')
  })

  /**
   * NOBODY COULD LOOK versus SOMEBODY LOOKED AND FOUND NOTHING. The two come back as different
   * answers, because drawing the first as the second is a clean bill of health nobody established.
   */
  it('tells nothing to compare with apart from nothing having changed', async () => {
    const { whatMovedHere } = await history()
    const noEarlier = whatMovedHere(null)
    const noDifference = whatMovedHere([])
    expect(noEarlier.at).toBe('nothing-earlier')
    expect(noDifference.at).toBe('nothing-differs')
    expect(noEarlier.said).not.toBe(noDifference.said)
    expect(whatMovedHere([{ path: 'title', before: 'a', after: 'b', kind: 'changed' }]).at).toBe('moved')
  })

  it('names the first four fields that moved and counts the rest', async () => {
    const { whatMovedHere } = await history()
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((path) => ({
      path,
      before: '1',
      after: '2',
      kind: 'changed' as const,
    }))
    // Criterion change: 7FEOshq3mBGG reserves stored paths for developer mode.
    const said = whatMovedHere(many, 'inspect').said
    expect(said).toContain('a, b, c, d')
    expect(said).toContain('2 more')
    expect(said).not.toContain('e, f')
  })
})

describe('two texts lined up word by word', () => {
  it('puts each side back together exactly as it was', async () => {
    const { lineUpWords } = await history()
    const before = 'The mount was measured at 40 mm on the bench, twice.'
    const after = `The mount was measured at 60 mm on the bench, twice, by ${THE_TEST_OFFICES_OWNER.name}.`
    const runs = lineUpWords(before, after)
    expect(runs).not.toBeNull()
    const older = (runs ?? []).filter((r) => r.at !== 'new').map((r) => r.text).join('')
    const newer = (runs ?? []).filter((r) => r.at !== 'gone').map((r) => r.text).join('')
    expect(older).toBe(before)
    expect(newer).toBe(after)
  })

  it('marks what moved rather than redrawing the whole sentence', async () => {
    const { lineUpWords } = await history()
    const runs = lineUpWords('the bracket is 40 mm', 'the bracket is 60 mm') ?? []
    const moved = runs.filter((r) => r.at !== 'same').map((r) => r.text.trim())
    expect(moved).toContain('40')
    expect(moved).toContain('60')
    expect(runs.some((r) => r.at === 'same' && r.text.includes('bracket'))).toBe(true)
  })

  it('refuses to line up two very long texts instead of crawling', async () => {
    const { lineUpWords, WORD_LIMIT } = await history()
    const long = new Array(WORD_LIMIT + 1).fill('word').join(' ')
    expect(lineUpWords(long, `${long} more`)).toBeNull()
  })
})

// ============================================================ 5. where a person meets it

