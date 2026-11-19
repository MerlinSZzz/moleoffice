// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PROVENANCE ON THE SCREEN: is a fixture record unmistakable AS a fixture, wherever it is drawn?
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Decision 17 measured the working database and found 385 records, 290 of them written by the
 * generated fixture, with nothing marking which was which. `tests/vocab-provenance.test.ts` pins
 * the VOCABULARY and `tests/migration-origin.test.ts` pins the STORAGE. Both were done, and a
 * reader still could not tell the two apart, because storing a fact nobody draws is the same
 * silence in a different place. USER.md invariant 3 says where a placeholder is visible at all it is
 * labelled "prominently, IN THE PLACE IT APPEARS" — so this file is about the places.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE THINGS EVERY TEST BELOW IS REALLY CHECKING
 * ---------------------------------------------------------------------------------------
 *
 *   1. A fixture record says so on every surface that draws a record, not only on the page you
 *      have to open to find out.
 *   2. An authored record is never labelled fixture, and a record nobody has stamped is never
 *      labelled authored. The second is the direction that does the damage: it turns the absence
 *      of a judgement into a judgement, in the one direction that makes fixture read as real.
 *   3. "Nobody recorded an origin" and "this page was not sent one" are DIFFERENT FACTS. Today
 *      every record in the running product is in the second state — `toRecord` in
 *      src/server/lib/records.ts does not carry the column out to the API — and drawing that as
 *      the first would be a straight lie about 290 rows that are stamped `fixture` on disk.
 *
 * WHY THEY LOOK LIKE THIS. The runner's environment is `node`: no DOM, and adding one would be a
 * dependency this project has ruled out. So the components are rendered to static markup with
 * react-dom/server and the markup is read, which is exactly the right level for this question —
 * what must be IN the markup is a word a reader can see.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { ORIGIN_MEANINGS, RECORD_ORIGINS, unstampedOriginNote, type PanelRecord } from '../src/shared/types.ts'

type UI = typeof import('../src/web/components/ui.tsx')
type RecordsPage = typeof import('../src/web/pages/RecordsPage.tsx')
type RecordPage = typeof import('../src/web/pages/RecordPage.tsx')
type QueriesPage = typeof import('../src/web/pages/QueriesPage.tsx')

let ui: UI
let recordsPage: RecordsPage
let recordPage: RecordPage
let queriesPage: QueriesPage

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope and router.tsx reads
  // window.location; the pages reach both while they are being evaluated. This is the smallest
  // stand-in that lets them load, and nothing in it is under test.
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
  ui = await import('../src/web/components/ui.tsx')
  recordsPage = await import('../src/web/pages/RecordsPage.tsx')
  recordPage = await import('../src/web/pages/RecordPage.tsx')
  queriesPage = await import('../src/web/pages/QueriesPage.tsx')
})

/** Markup with the hoisted <style> blocks removed, so CSS cannot be mistaken for a rendered word. */
function body(el: ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

let seq = 0
function record(over: Partial<PanelRecord> = {}): PanelRecord {
  seq += 1
  return {
    id: `rec-${seq}`,
    kind: 'claim',
    workspaceId: 'w1',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title: `Record ${seq}`,
    summary: 'one line about it',
    data: {},
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-02 09:00:00',
    deletedAt: null,
    ...over,
  }
}

/**
 * A record with NO `origin` key at all, which is what the running server sends today.
 *
 * Spelled by deleting the key rather than by writing `origin: undefined`, because the difference
 * between the two is exactly what `originReading` is reading and a test that could not tell them
 * apart would be checking nothing.
 */
function unserved(over: Partial<PanelRecord> = {}): PanelRecord {
  const r = record(over)
  delete (r as { origin?: unknown }).origin
  return r
}

const listItem = (r: PanelRecord, incompleteCount = 0) => ({ ...r, incompleteCount })

// ============================================================================ the reading

describe('reading the origin FIELD, which is not the same as reading its value', () => {
  it('reads both stamped words back', () => {
    expect(ui.originReading({ origin: 'fixture' })).toEqual({ at: 'stamped', origin: 'fixture' })
    expect(ui.originReading({ origin: 'authored' })).toEqual({ at: 'stamped', origin: 'authored' })
  })

  it('SEPARATES "nobody recorded one" from "none was sent", because they are different facts', () => {
    // The one that matters most today. Every record the running product serves is in the second
    // state, and collapsing the two would have this interface report 385 records as unstamped
    // when 290 of them are stamped `fixture` in the database this minute.
    expect(ui.originReading({ origin: null })).toEqual({ at: 'unreadable', stored: null })
    expect(ui.originReading({})).toEqual({ at: 'unserved' })
    expect(ui.originReading({ origin: null })).not.toEqual(ui.originReading({}))
  })

  it('never answers "authored" for a record nobody has stamped', () => {
    for (const reading of [ui.originReading({}), ui.originReading({ origin: null }), ui.originReading({ origin: '' })]) {
      expect(reading.at, 'an unstamped record was read as a judgement somebody made').not.toBe('stamped')
    }
  })

  it('keeps a word this vocabulary has never heard of, rather than rounding it to the nearest one', () => {
    // Reachable: the column is a bare `text` with no CHECK behind it, and src/server/lib/import.ts
    // already counts and reports archive rows whose origin is outside RECORD_ORIGINS.
    expect(ui.originReading({ origin: 'seeded' })).toEqual({ at: 'unreadable', stored: 'seeded' })
    expect(ui.originReading({ origin: 'synthetic' })).toEqual({ at: 'unreadable', stored: 'synthetic' })
  })
})

describe('what each reading is allowed to say', () => {
  it('uses the shared contract\'s own sentence for a fixture record, not a second copy of it', () => {
    const said = ui.originSaid(ui.originReading({ origin: 'fixture' }))
    expect(said.key).toBe('fixture')
    expect(said.sentence).toContain(ORIGIN_MEANINGS.fixture)
  })

  it('never says a fixture record is false, because that is not what the mark claims', () => {
    const said = ui.originSaid(ui.originReading({ origin: 'fixture' }))
    expect(said.sentence).toContain('not about whether its content is true')
    expect(said.sentence.toLowerCase()).not.toContain('made up')
  })

  it('uses the shared unstamped sentence for a record nobody stamped', () => {
    const said = ui.originSaid(ui.originReading({ origin: null }))
    // Compared without case, because the shared function returns a CLAUSE and this raises it to a
    // sentence. The words have to be the shared ones; only the first letter is this file's.
    expect(said.sentence.toLowerCase()).toContain(unstampedOriginNote().toLowerCase())
  })

  it('says something ELSE when no origin was served, and does not claim nobody recorded one', () => {
    const said = ui.originSaid(ui.originReading({}))
    expect(said.key).toBe('unserved')
    expect(said.sentence.toLowerCase()).not.toContain('nobody has recorded')
    expect(said.sentence).toContain('No origin was sent')
  })

  it('prints an unreadable stored word instead of swallowing it, and names the two real ones', () => {
    const said = ui.originSaid(ui.originReading({ origin: 'seeded' }))
    expect(said.count).toBe('seeded')
    for (const word of RECORD_ORIGINS) expect(said.sentence).toContain(word)
  })
})

// ============================================================================ the mark

describe('the mark itself', () => {
  const mark = (origin: unknown): string =>
    body(h(ui.OriginMark, { record: origin === undefined ? {} : { origin } }))

  it('labels a made-up record with the word, not only with a colour or a tooltip', () => {
    const html = mark('fixture')
    // THE STORED WORD IS `fixture` AND IT DOES NOT CHANGE. The word a person READS is "Made-up
    // example", because "Fixture" is decodable on one table and this badge is on 290 of the 385
    // rows in this workspace. A mark nobody reads is not doing rule 3's job.
    expect(html).toContain('Made-up example')
    expect(html).toContain('data-origin="fixture"')
    // And the old word is gone from the screen, so nothing says it to a reader any more.
    expect(html).not.toMatch(/>Fixture</)
  })

  it('does NOT label an authored record as made up', () => {
    const html = mark('authored')
    expect(html).toContain('Authored')
    expect(html).not.toContain('data-origin="fixture"')
    expect(html).not.toContain('Made-up example')
  })

  it('draws the four readings as four different things', () => {
    const drawn = [mark('fixture'), mark('authored'), mark(null), mark(undefined)]
    expect(new Set(drawn).size, 'two readings render identical markup').toBe(4)
  })

  it('draws SOMETHING for every reading, including the good one', () => {
    // Every other mark in the library renders nothing for its good case, so that a page of
    // finished work stays quiet. This one must not: if `authored` drew nothing, it would be
    // indistinguishable from a record nothing has been said about, which is the whole defect.
    for (const origin of ['fixture', 'authored', null, undefined, 'seeded']) {
      expect(mark(origin), `nothing drawn for ${String(origin)}`).toContain('px-origin')
    }
  })
})

// ============================================================================ the surfaces

/**
 * WHEREVER A RECORD IS LISTED OR SHOWN.
 *
 * One test per surface, each rendering the real component from the real page with a real record.
 * A surface that loses the mark fails here rather than being noticed by somebody reading a
 * screenshot six weeks later.
 */
describe('authored marks stay quiet and exceptional marks remain visible', () => {
  /**
   * THE OWNER LOOKED AT A PHOTOGRAPH AND ASKED FOR THIS.
   *
   * Wave 4A put the provenance mark on every derived row, which the invariant requires: a row with
   * NO mark is not `authored`, it is a row nobody has said anything about, and reading an absence as
   * a judgement is what makes generated content read as real. Measured consequence on the real
   * corpus: about twenty-two AUTHORED chips on one screen and one or two FIXTURE ones — the common
   * case repeated until it stops being read.
   *
   * The direction, 2026-08-12: ordinary authored provenance need not repeat on every list row
   * PROVIDED THE DEFAULT IS UNAMBIGUOUS; exceptional provenance stays explicit; the truth stays in
   * detail, disclosure and the API. The owner later removed the unmarked-row sentence entirely;
   * the exceptional marks and the detail reading remain.
   */
  it('draws nothing for authored and everything else exactly as before', () => {
    const quiet = (origin: unknown) => body(h(ui.OriginMark, { record: { origin }, only: 'exceptions' as const }))

    // The one case that goes quiet.
    expect(quiet('authored')).toBe('')

    // AND NOT ONE OF THE OTHERS. `unrecorded` and `unserved` are the two that must never be
    // mistaken for authored — they are the absence of a judgement, not a judgement — and `fixture`
    // is the whole point of keeping any mark at all.
    expect(quiet('fixture')).toContain('data-origin="fixture"')
    expect(quiet(null)).toContain('data-origin="unrecorded"')
    expect(quiet('seeded')).toContain('data-origin="unknown-word"')
    expect(body(h(ui.OriginMark, { record: {}, only: 'exceptions' as const }))).toContain('data-origin="unserved"')

    // And the loud mode is untouched, because a record's own page is not a list.
    expect(body(h(ui.OriginMark, { record: { origin: 'authored' } }))).toContain('data-origin="authored"')
  })

  it('does not draw the removed unmarked-row notice', () => {
    expect(body(h(ui.UnmarkedRowsNote, { what: 'row' }))).toBe('')
  })
})

describe('every surface that draws a record draws how it got here', () => {
  const fixture = () => record({ origin: 'fixture', title: 'A robotics module written to exercise a layout' })

  it('the records list — the page whose lede says “everything this workspace holds”', () => {
    const html = body(
      h(recordsPage.RecordResults, {
        records: [listItem(fixture())],
        kind: '' as const,
        query: '',
        onClearKind: () => {},
        onClearQuery: () => {},
        onNew: () => {},
        now: Date.parse('2026-08-11T10:00:00'),
      }),
    )
    expect(html).toContain('A robotics module written to exercise a layout')
    expect(html).toContain('data-origin="fixture"')
  })

  it('the records list, on a row it cannot even file under a family', () => {
    // A kind nothing recognises is exactly what a stray fixture write looks like, so this row of
    // all rows must not be the one that loses the mark.
    const html = body(
      h(recordsPage.RecordResults, {
        records: [listItem(record({ origin: 'fixture', kind: 'telemetry' as PanelRecord['kind'] }))],
        kind: '' as const,
        query: '',
        onClearKind: () => {},
        onClearQuery: () => {},
        onNew: () => {},
        now: Date.parse('2026-08-11T10:00:00'),
      }),
    )
    expect(html).toContain('cannot file')
    expect(html).toContain('data-origin="fixture"')
  })

  it('the record page — with the whole sentence, not only the chip', () => {
    const html = body(h(recordPage.OriginSays, { record: fixture() }))
    expect(html).toContain('data-origin="fixture"')
    // READ OUT OF THE VISIBLE TEXT, not out of the markup as a whole. The chip carries the same
    // sentence in a `title` attribute, so a check against the whole string would go on passing
    // with the panel's own sentence deleted — and a tooltip is not a label a reader can see.
    const visible = /<span class="rp-fact-said">([\s\S]*?)<\/span>/.exec(html)?.[1] ?? ''
    expect(visible).toContain(ORIGIN_MEANINGS.fixture)
  })

  it('the queries page, on both lists', () => {
    const unconsumed = body(h(queriesPage.UnconsumedPanel, { records: [fixture()] }))
    expect(unconsumed).toContain('data-origin="fixture"')

    const unmet = body(
      h(queriesPage.UnmetPanel, { items: [{ consumer: fixture(), missingTitle: 'A result that was deleted' }] }),
    )
    expect(unmet).toContain('data-origin="fixture"')
  })

  it('the component sheet, so the treatment is on the page the review tool photographs', () => {
    const g = globalThis as unknown as Record<string, unknown>
    g['document'] = { documentElement: { getAttribute: () => null } }
    g['getComputedStyle'] = () => ({ getPropertyValue: () => 'a value' })
    try {
      const sheet = renderToStaticMarkup(h(ui.ComponentSheet))
      expect(sheet).toContain('data-origin="fixture"')
      expect(sheet).toContain('data-origin="unserved"')
    } finally {
      delete g['document']
      delete g['getComputedStyle']
    }
  })
})

describe('the state the running product is actually in', () => {
  it('a record served with no origin is not quietly called authored, on any surface', () => {
    // This is what `GET /api/records` sends today: `toRecord` in src/server/lib/records.ts builds
    // a PanelRecord field by field and does not carry the `origin` column out. Until it does,
    // every row on every screen is in this state, and none of them may read as project record.
    const surfaces = [
      body(
        h(recordsPage.RecordResults, {
          records: [listItem(unserved())],
          kind: '' as const,
          query: '',
          onClearKind: () => {},
          onClearQuery: () => {},
          onNew: () => {},
          now: Date.parse('2026-08-11T10:00:00'),
        }),
      ),
      body(h(recordPage.OriginSays, { record: unserved() })),
      body(h(queriesPage.UnconsumedPanel, { records: [unserved()] })),
    ]
    for (const html of surfaces) {
      expect(html).toContain('data-origin="unserved"')
      expect(html).not.toContain('data-origin="authored"')
      expect(html).not.toContain('data-origin="unrecorded"')
    }
  })

  it('says so as a fact about the request, and warns against reading it as project record', () => {
    const html = body(h(recordPage.OriginSays, { record: unserved() }))
    expect(html).toContain('No origin was sent')
    expect(html).toContain('do not read it as part of the project record')
  })
})
