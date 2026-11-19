// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECTION NAMES WHICH PARTS OF THE REPORT IT STANDS FOR, AND SAYS SO WHEN NOBODY RECORDED THEM.
 *
 * ---------------------------------------------------------------------------------------
 * CRITERION 18, AND WHAT WAS MEASURED ON 1 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * design/problem-03/ACCEPTANCE.md:324:
 *
 * > The projection names the source regions it stands for, by region id, and a reader can get from
 * > the projection to those regions. Where nobody recorded which regions a summary stands for, the
 * > product says nobody recorded it — it does not derive an answer and present it as recorded.
 *
 * Neither half was built. `GET /api/records/:id/short-forms` carried `madeFrom` — WHICH REVISION a
 * form was written from, a different fact — and the row in the *Shorter forms* panel drew the
 * length's noun, the words, the staleness mark and the override mark. About what the form stands
 * for it said NOTHING, which is the one answer the criterion forbids.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE ASSERTS, AND WHY IT RENDERS
 * ---------------------------------------------------------------------------------------
 *
 * The claim is about a SENTENCE A PERSON READS, and the surface that reads it moved on 2 September
 * 2026. It was the row of the *Shorter forms of this report* panel; that panel was removed because it
 * repeated what the page already showed above it, so the composer is the one place a
 * person meets the sentence, on right-click. **That surface is pressed, in a browser, in
 * `tests/the-composer-says-what-a-projection-stands-for.test.ts`**, which is where the person-facing
 * half of this criterion is guarded, including both arms of the way back to the parts.
 *
 * WHAT IS ASSERTED HERE IS THE SENTENCE ITSELF, over every case the server can produce, because a
 * browser test cannot reach fourteen shapes of one reply without fourteen fixtures. The two files
 * are one claim: this one says the sentence is right, that one says a person can read it.
 *
 * The server half is asserted through the running API, so the four sentences are the ones a browser
 * really receives.
 *
 * ---------------------------------------------------------------------------------------
 * A FORM WITH NO RECORDED SOURCES IS STILL A COMPLETE REPORT
 * ---------------------------------------------------------------------------------------
 *
 * Every short form in the corpus is in that state. Nothing here calls such a record incomplete and
 * nothing here derives the missing answer: the sentence says the form is whole and cannot say where
 * in the record it came from, which is the fifth invariant — *nothing is there* and *nobody has
 * looked* are different answers.
 *
 * ---------------------------------------------------------------------------------------
 * THE LENGTH THE SOURCES ARE RECORDED AGAINST IS THE LABEL, AND IT WAS THE GIST
 * ---------------------------------------------------------------------------------------
 *
 * Criterion A14b of design/pointing-reopened/ACCEPTANCE.md, 3 September 2026: reading length 2 IS
 * the record's own `title` column and length 3 IS its own `summary`. A column is not a form
 * somebody writes beside the record, so nothing records source parts for one, and the write door
 * takes `standsFor` only for the lengths still stored under `data.shortForms` — the label. So the
 * label is what this file writes and asks about, and the two columns appear here as lengths that
 * stand for the whole report by rule. Each case that moved says so above itself.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ShortFormReading, ShortFormsReading } from '../src/server/lib/zoom.ts'
import { SHORT_FORM_SPECS, whatItStandsFor, type ShortFormSpec, type StandsFor } from '../src/shared/zoom.ts'

const WORKSPACE = 'default'
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

const TITLE = 'What the bench said'
/**
 * THE REPORT THIS FILE SEEDS IS FILED WITH NO SUMMARY, WHICH IS DELIBERATE.
 *
 * Since criterion A14b of design/pointing-reopened/ACCEPTANCE.md, reading length 3 IS the record's own
 * `summary` column, so a report filed without one has no length 3. That is the length nobody has written
 * here, and it is what the two cases about the article are asked over. A twenty-nine-word `GIST` used
 * to be written as a stored form beside the label; no gist is written or stored any more.
 */
const LABEL = 'Bench, round eight'

type RecordPageModule = typeof import('../src/web/pages/RecordPage.tsx')

let t: TestDb
let app: FastifyInstance
let page: RecordPageModule
let reportId: string

/** Everything the page module reads at import time. Nothing here is under test. */
function shimTheBrowser(): void {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: () => null,
    length: 0,
  }
  const listeners = { addEventListener: () => {}, removeEventListener: () => {} }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '#/records', href: 'http://127.0.0.1/#/records' },
    matchMedia: () => ({ matches: false, ...listeners }),
    ...listeners,
  }
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = storage
  const element = (): Record<string, unknown> => ({
    style: { setProperty: () => {}, removeProperty: () => {} },
    dataset: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    appendChild: () => {},
    removeChild: () => {},
    append: () => {},
    remove: () => {},
    insertBefore: () => {},
    contains: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    ...listeners,
  })
  ;(globalThis as unknown as { document: unknown }).document = {
    documentElement: element(),
    head: element(),
    body: element(),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => element(),
    createTextNode: () => ({}),
    ...listeners,
  }
}

/** The newest revision, which is what a short form must name to be written at all. */
async function newestRevision(): Promise<{ seq: number; contentHash: string }> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${reportId}/revisions`, headers: HUMAN })
  const list = (read.json() as { revisions: { seq: number; contentHash: string }[] }).revisions
  // NEWEST FIRST OR OLDEST FIRST IS NOT ASSUMED: the newest is the highest seq, which is what
  // `checkMadeFrom` compares against, and the row carries more than the two fields a write sends.
  const newest = [...list].sort((a, b) => b.seq - a.seq)[0]
  expect(newest, 'the record has no revision for a short form to name').toBeDefined()
  return { seq: (newest as { seq: number }).seq, contentHash: (newest as { contentHash: string }).contentHash }
}

async function writeForms(payload: Record<string, unknown>): Promise<{ status: number; body: string }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/records/${reportId}/short-forms`,
    headers: HUMAN,
    payload: { madeFrom: await newestRevision(), ...payload },
  })
  return { status: res.statusCode, body: res.body }
}

async function reading(): Promise<ShortFormsReading> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${reportId}/short-forms`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as ShortFormsReading
}

/**
 * ONE LENGTH'S ROW, AND IT CARRIES A SENTENCE SAYING WHAT IT STANDS FOR.
 *
 * `ShortFormReading.standsFor` became nullable on 2 September 2026, because reading lengths 4, 5
 * and 6 are written by part and Full is the record itself: none of the four is one text about the
 * whole record, so a sentence about which parts a text stands for would be about nothing. Every
 * length this file asks about is one of the three that ARE one text, so a null here is the reading
 * having stopped answering, and it is failed rather than walked around.
 */
type StandsForRow = ShortFormReading & { standsFor: StandsFor }

const at = (all: ShortFormsReading, level: string): StandsForRow => {
  const one = all.levels.find((each) => each.level === level)
  expect(one, `the reading has no level "${level}"`).toBeDefined()
  const found = one as ShortFormReading
  expect(found.standsFor, `the reading says nothing about what the ${level} stands for`).not.toBeNull()
  return found as StandsForRow
}

/**
 * WHAT THE PRODUCT SAYS ABOUT ONE LENGTH: the server's sentence, which is the string the composer
 * prints unaltered.
 *
 * IT WAS THE MARKUP OF `StandsForLine`, the row the *Shorter forms* panel drew, until that panel was
 * removed on 2 September 2026. `whatItStandsFor` in src/shared/zoom.ts writes the sentence and the
 * composer draws it; a second wording anywhere is the defect this file's subject is about.
 */
const row = (level: StandsForRow): string => level.standsFor.says

/**
 * Whether the composer would offer the way back. Its own rule, in one place.
 *
 * A WHOLE-RECORD FORM WITH NO RECORDED PARTS STANDS FOR THE WHOLE RECORD, so it has a way back: to
 * the whole record. This read `parts !== null && ...`, which said a form nobody recorded sources for
 * had nowhere to go — the opposite of the owner's rule of 2 September 2026. The screen's own
 * decision is held in tests/a-form-with-no-recorded-parts-stands-for-the-whole-record.test.ts; this
 * is the same answer for the row this file renders.
 */
const offersTheWayBack = (level: StandsForRow): boolean =>
  level.standsFor.parts === null || level.standsFor.parts.some((one) => one.stillThere)

/** The markup with tags taken out, so an assertion is about words and not about elements. */
const words = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  shimTheBrowser()
  page = await import('../src/web/pages/RecordPage.tsx')

  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'report',
      title: TITLE,
      data: {
        blocks: [
          { id: 'b-para', type: 'text', text: 'The mount tolerance is 0.2 mm and nobody measured it.' },
          { id: 'b-head', type: 'text', heading: 'What the rig showed', text: 'Three of four printed mounts broke.' },
          {
            id: 'b-tab',
            type: 'table',
            columns: [{ label: 'Run' }, { label: 'Broke' }],
            rows: [{ cells: ['4', 'three'] }],
          },
        ],
      },
    },
  })
  expect(made.statusCode, made.body).toBe(201)
  reportId = (made.json() as { record: { id: string } }).record.id
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================================ 1. nobody recorded

describe('a form whose sources nobody recorded stands for the whole record', () => {
  /**
   * THIS WROTE A LABEL AND A GIST, and the four cases below asked about the gist. Criterion A14b
   * made reading length 3 the record's own `summary` column on 3 September 2026, so a gist is not
   * a form anybody writes beside the record and the write door refuses one by name. The label is
   * the whole-record form still stored under `data.shortForms`, so it is the one asked about. What
   * is asserted did not change: a form nobody recorded source parts for stands for the whole
   * record, by rule, and the product says so.
   */
  beforeAll(async () => {
    const wrote = await writeForms({ forms: { label: LABEL } })
    expect(wrote.status, wrote.body).toBe(200)
  })

  it('says what it stands for, in the product, rather than saying nothing', async () => {
    const said = words(row(at(await reading(), 'label')))
    expect(said, 'the row said nothing at all about what the label stands for').not.toBe('')
    expect(said).toContain('Stands for the whole report.')
  })

  it('does not call the record incomplete for it', async () => {
    const said = words(row(at(await reading(), 'label')))
    // THE RULE: a whole report's summary stands for the whole report. A form nobody
    // recorded source parts for stands for the whole report by rule, so the row says that and does
    // not report the missing source list as something the reader has to do anything about.
    expect(said).toContain('Stands for the whole report.')
    expect(said, 'the row still reports the missing source list as an absence').not.toContain('Nobody recorded')
  })

  it('offers the way back to the whole record, because that is what it stands for', async () => {
    // BEFORE THE CHANGE this read `toBe(false)`: a form nobody recorded sources for was read as a
    // form with nowhere to land. The owner's rule of 2 September 2026 says it stands for the whole
    // record, so the press is offered and it lands there.
    expect(offersTheWayBack(at(await reading(), 'label'))).toBe(true)
  })

  it('derives nothing and presents it as recorded', async () => {
    expect(at(await reading(), 'label').standsFor.parts).toBe(null)
  })

  /**
   * THE ARTICLE COMES OFF THE LENGTH AND IS NOT WORKED OUT IN THE SENTENCE.
   *
   * `ShortFormSpec.article` is declared beside every noun, and its own comment says why: choosing
   * between *a* and *an* by looking at the first letter is right for these words and wrong for
   * English. The sentence for a length nobody has written ignored it and read *a account*.
   *
   * CHANGED 2 September 2026, BECAUSE THE LENGTH THAT CAUGHT IT IS RETIRED. This case read the
   * `account` and the `brief`, and the three lengths left all declare `a` — so a sentence that went
   * back to guessing from the first letter would agree with the declaration on every one of them
   * and this case would pass with the fault back. So the rule is asked twice: of the running server,
   * over the length nobody wrote here, and of `whatItStandsFor` itself with a length declaring `an`,
   * which is the only place the guess can still be caught.
   *
   * THE LENGTH NOBODY WROTE WAS THE TITLE AND IS THE CONCLUSION NOW. Criterion A14b made reading
   * length 2 the record's own `title` column, and every record has one — so the title is always
   * written and can no longer be the length this asks about. This report is filed with no summary,
   * so length 3 is the one nobody has written. Nothing else in the case changed.
   */
  it('takes the article the length declares, and does not work it out from the noun', async () => {
    const all = await reading()
    // THE ONE LENGTH NOBODY WROTE IN THIS BLOCK. The other two are written, so their sentence says
    // what they stand for rather than that nobody has written one.
    const spec = SHORT_FORM_SPECS.gist
    expect(at(all, 'gist').standsFor.says).toBe(
      `Nobody has written ${spec.article} ${spec.noun} for this report, so there is nothing here to ` +
        'stand for any part of it.',
    )
    // AND THE GUESS, CAUGHT WHERE IT CAN STILL BE CAUGHT. `whatItStandsFor` is the one writer of
    // this sentence, so it is handed a length that declares `an` and asked what it says.
    const anAccount: ShortFormSpec = { ...spec, noun: 'account', article: 'an' }
    expect(whatItStandsFor(false, null, anAccount, 'report').says).toBe(
      'Nobody has written an account for this report, so there is nothing here to stand for any part of it.',
    )
  })

  /**
   * AND THE SAME ARTICLE IN THE OTHER SENTENCE THE SAME OBJECT CARRIES, which the repair above
   * missed. `standsFor.says` is written by `whatItStandsFor` in src/shared/zoom.ts and was fixed on
   * 1 September 2026. `says` — the state of the length, drawn on the same row — is written by
   * `saysOf` in src/server/lib/zoom.ts, and it hardcoded `a ${noun}` TWICE, in the same level
   * object, so one row read "an account" and "a account" at once.
   */
  it('takes it from the declaration in the state sentence too, and not only beside it', async () => {
    const all = await reading()
    // THE CONCLUSION, FOR THE REASON GIVEN ON THE CASE ABOVE: it is the one length this report has
    // nothing written at, since criterion A14b made the title column reading length 2.
    const spec = SHORT_FORM_SPECS.gist
    const said = at(all, 'gist').says
    // BOTH ARTICLES IN ONE SENTENCE, WHICH IS WHAT MADE THIS ITS OWN CASE. `saysOf` hardcoded
    // `a ${noun}` TWICE in the same string, so one row read "an account" and "a account" at once.
    // `saysOf` is not exported, so the sentence is read back off the running server; the length
    // that declares `an` is retired, so what is held here is that both halves are BUILT from the
    // declaration rather than typed, and neither may be spelled a second way.
    expect(said).toContain(`No ${spec.noun} has been written for this record`)
    expect(said, 'the second hardcoded article, in the same sentence').toContain(
      `a cut of the whole thing is not ${spec.article} ${spec.noun}`,
    )
  })
})

// ============================================================================ 2. recorded

describe('a form whose sources somebody recorded names them, in the reader’s words', () => {
  /**
   * THE SOURCES WERE RECORDED AGAINST THE GIST and are recorded against the label now. Criterion
   * A14b made reading length 3 the record's own `summary` column on 3 September 2026, and a column
   * is not a form anybody records source parts for: the write door takes `standsFor` for the
   * lengths still stored under `data.shortForms`, which is the label. Every claim below is about
   * how recorded parts are named and reached, and none of it moved with the length.
   */
  beforeAll(async () => {
    const wrote = await writeForms({
      forms: { label: LABEL },
      standsFor: { label: ['data.blocks[#b-tab]', 'section.openAround'] },
    })
    expect(wrote.status, wrote.body).toBe(200)
  })

  it('names the parts on the screen, and never as region ids', async () => {
    const said = words(row(at(await reading(), 'label')))
    // THE TABLE IS QUOTED BY WHAT IT HOLDS and the section by its declared title, because *the
    // table and the section* names a KIND and two parts of one report would read alike.
    // tests/a-projection-names-which-part.test.ts is where that claim is made and measured.
    expect(said).toContain('Stands for the table “4 three” and the section “What is still open around this”')
    // THE NAMES ARE THE ONES A COMMENT LEFT ON THOSE PARTS READS BACK WITH — `nameOfRegion`, the one
    // place — so a reader meets one vocabulary. An id on this row would be machinery on a page.
    expect(said, 'a region id was printed at a reader').not.toContain('data.blocks[#b-tab]')
  })

  it('offers the way back to those parts', async () => {
    expect(offersTheWayBack(at(await reading(), 'label')), 'no way back on a form with recorded sources').toBe(true)
  })

  it('keeps the ids on the answer, so the press has somewhere to go', async () => {
    const parts = at(await reading(), 'label').standsFor.parts
    expect(parts?.map((one) => one.regionId)).toEqual(['data.blocks[#b-tab]', 'section.openAround'])
    expect(parts?.every((one) => one.stillThere)).toBe(true)
  })

  /**
   * THE OTHER LENGTH USED TO BE THE LABEL, which the write above did not touch. Now the write above
   * IS the label, so the length left alone is the record's own title — reading length 2 since
   * criterion A14b. Nothing records source parts for a column and nothing has to: a whole-record
   * length stands for the whole record, which is the owner's own rule, and the reading says it.
   */
  it('leaves the other length alone, which nobody recorded sources for', async () => {
    const said = words(row(at(await reading(), 'title')))
    expect(said).toContain('Stands for the whole report.')
  })
})

// ============================================================================ 3. a part that went

describe('a recorded part the record no longer holds is counted, not quietly dropped', () => {
  it('says how many went, and still names the ones that are there', async () => {
    // THE TABLE IS TAKEN OUT OF THE REPORT, and the label goes on saying it stands for it. The
    // sources were recorded against the gist until criterion A14b made length 3 the record's own
    // summary column; the counting this asserts is the same.
    const removed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${reportId}`,
      headers: HUMAN,
      payload: {
        dataPatch: {
          blocks: [
            { id: 'b-para', type: 'text', text: 'The mount tolerance is 0.2 mm and nobody measured it.' },
            { id: 'b-head', type: 'text', heading: 'What the rig showed', text: 'Three of four printed mounts broke.' },
          ],
        },
      },
    })
    expect(removed.statusCode, removed.body).toBe(200)

    const said = words(row(at(await reading(), 'label')))
    expect(said).toContain('Stands for the section “What is still open around this”')
    expect(said, 'a part the record no longer holds was left out with nothing said').toContain(
      'One more part recorded here, this report no longer holds',
    )
  })
})

// ============================================================================ 4. the write door

describe('what may be recorded as a source, and what is refused', () => {
  it('refuses a part this record does not have, rather than storing a name nothing holds', async () => {
    const out = await writeForms({ forms: { label: LABEL }, standsFor: { label: ['data.blocks[#nope]'] } })
    expect(out.status, out.body).toBe(400)
    expect(out.body).toContain('has no such part')
  })

  /**
   * THE PAIR THIS SENDS CHANGED WITH THE DOOR, AND THE REFUSAL IT ASKS FOR DID NOT. It used to
   * write the label and record sources for the gist, which was a length the write was not writing.
   * Criterion A14b left one length written here, so the way to name a length whose words this write
   * does not write is to clear it: `forms` says the label is going and `standsFor` says what it
   * stands for. `checkStandsFor` in src/server/lib/zoom.ts refuses that in the same sentence.
   */
  it('refuses sources for a length this write is not writing', async () => {
    const out = await writeForms({ forms: { label: null }, standsFor: { label: ['section.openAround'] } })
    expect(out.status, out.body).toBe(400)
    expect(out.body).toContain('recorded when its words are written')
  })

  /**
   * AND THE OTHER HALF OF WHAT THE OLD PAIR ASKED, which is now a different refusal. A gist is not a
   * length written here at all since criterion A14b, so the door's own list of lengths turns it away
   * before `checkStandsFor` is reached, and the refusal names what may be sent instead.
   */
  it('refuses sources for a length that is not written here at all', async () => {
    const out = await writeForms({ forms: { label: LABEL }, standsFor: { gist: ['section.openAround'] } })
    expect(out.status, out.body).toBe(400)
    expect(out.body).toContain('standsFor is an object keyed by length: label')
  })

  it('refuses an empty list, which is a second spelling of "nobody recorded"', async () => {
    const out = await writeForms({ forms: { label: LABEL }, standsFor: { label: [] } })
    expect(out.status, out.body).toBe(400)
    expect(out.body).toContain('empty list')
  })

  it('does not carry a source list over onto words that replace the ones it was written for', async () => {
    const first = await writeForms({
      forms: { label: LABEL },
      standsFor: { label: ['section.openAround'] },
    })
    expect(first.status, first.body).toBe(200)
    expect(at(await reading(), 'label').standsFor.parts).toHaveLength(1)

    const again = await writeForms({ forms: { label: 'Bench, round nine' } })
    expect(again.status, again.body).toBe(200)
    const said = words(row(at(await reading(), 'label')))
    expect(
      said,
      'new words kept the source list of the words they replaced, which nobody said they stand for',
    ).toContain('Stands for the whole report.')
  })
})
