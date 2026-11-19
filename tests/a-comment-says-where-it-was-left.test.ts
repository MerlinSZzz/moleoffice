// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT SAYS WHERE IT WAS ACTUALLY LEFT, AND FIVE PLACES READ AS FIVE SENTENCES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED ON THE LIVE CORPUS ON 31 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * `src/web/pages/RecordPage.tsx` built the phrase under a comment out of `where.record` alone, so
 * every comment on a PART of a record read back as a comment on the WHOLE of it. Four comments,
 * read through the running API on the live office's port:
 *
 *   a comment      region  data.blocks[#b-pattern-table]           a table
 *   a comment      region  data.blocks[#b-pattern-table].rows[1]   one row of that table
 *   a comment      region  section.openAround                      a declared section
 *   a comment      record  m2Q0CybxoGNF                            the whole report
 *
 * All four printed, word for word:
 *
 *   Left on the whole of the report “Round eight: pointing at anything, saying what you mean, and
 *   the one act that was missing”, rather than on particular words.
 *
 * The pointing had been repaired at WRITE time and the READING still said the root, which is the
 * visible half of that work undone: a reader cannot tell a comment on a paragraph from a comment on
 * the report.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS, AND WHY IT RENDERS THE COMPONENT
 * ---------------------------------------------------------------------------------------
 *
 * The claim is about a SENTENCE A PERSON READS, so the sentence is what is asserted, drawn by
 * `CommentTarget` — the component whose own header says it is exported so a test can put every kind
 * of target through it without a browser. Asserting `where.leftOn` alone would leave the page free
 * to go on building its own phrase from the record, which is the exact defect.
 *
 * FIVE PLACES, FIVE SENTENCES, AND THE FIFTH IS THE WHOLE RECORD, which is the one that must NOT
 * gain a part: a comment on the report has to keep reading as a comment on the report.
 *
 * WHAT IT DOES NOT CLAIM. Two regions with one role read alike — a headed `text` block and a
 * declared section are both *the section* — and the exact stored id is one switch away in Developer
 * detail. The claim here is that the KIND of place is named, not that two sections are told apart.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, at, freshDb, type TestDb } from './helpers.ts'
import type { AnnotationView } from '../src/server/lib/annotations.ts'

const WORKSPACE = 'default'
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

const TITLE = 'Round eight, what the review found'
const PARAGRAPH = 'The mount holds calibration through a full handover.'
const SECOND = 'What moved was the mast, and nobody has measured it since.'
const QUOTE = 'holds calibration'
/** The one whole-record form still written beside a record, which is reading length 1. */
const LABEL = 'Bench, round eight'

const GIST =
  'Three of the four printed wrist mounts broke below the load the handover trials need, so the aluminium ' +
  'version is now the only one worth testing.'

type RecordPageModule = typeof import('../src/web/pages/RecordPage.tsx')

let t: TestDb
let app: FastifyInstance
let page: RecordPageModule
let reportId: string

/** Everything a browser needs to exist before the page module is imported. */
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
      // THE SUMMARY IS READING LENGTH 3 SINCE 3 SEPTEMBER 2026, criterion A14b, so the words this
      // file used to write as a stored `gist` are the record's own summary. That key is retired and
      // a new write to it is refused; nothing else about this fixture changed.
      summary: GIST,
      data: {
        for: `${THE_TEST_OFFICES_OWNER.name}, who asked for the review`,
        date: '2026-08-18',
        blocks: [
          { id: 'b-1', type: 'text', heading: 'What I found', text: `${PARAGRAPH}\n\n${SECOND}` },
          {
            id: 'b-2',
            type: 'table',
            columns: [{ label: 'Pattern' }, { label: 'Where it shows' }],
            rows: [{ cells: ['Cut mid-word', 'The review row'] }],
          },
        ],
      },
    },
  })
  expect(made.statusCode, made.body).toBe(201)
  reportId = (made.json() as { record: { id: string } }).record.id

  // THE LABEL IS WRITTEN THROUGH ITS OWN DOOR, which is where a short form has to be written: it
  // names the revision it was made from, and a record being filed for the first time has none.
  // It was the gist until 3 September 2026; the label is the one whole-record form still stored
  // beside a record, and one of the five places below is a comment left on it.
  const versions = await app.inject({ method: 'GET', url: `/api/records/${reportId}/revisions`, headers: HUMAN })
  expect(versions.statusCode, versions.body).toBe(200)
  const held = (versions.json() as { revisions: { seq: number; contentHash: string }[] }).revisions
  const newest = at(held, 0, 'the revision the report was just filed as')
  const wrote = await app.inject({
    method: 'POST',
    url: `/api/records/${reportId}/short-forms`,
    headers: HUMAN,
    payload: { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: LABEL } },
  })
  expect(wrote.statusCode, wrote.body).toBe(200)
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** One comment, written against one context, read back as the page reads it. */
async function commentOn(context: unknown): Promise<AnnotationView> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'annotation',
      title: 'A remark somebody left',
      data: { body: 'This needs checking before the supplier is told anything.', context },
    },
  })
  expect(made.statusCode, made.body).toBe(201)
  const id = (made.json() as { record: { id: string } }).record.id
  const read = await app.inject({ method: 'GET', url: `/api/annotations/${id}`, headers: HUMAN })
  expect(read.statusCode, read.body).toBe(200)
  return read.json() as AnnotationView
}

/** A comment on one part of the report, with nothing quoted inside it. */
const onRegion = (regionId: string): unknown => ({
  target: { kind: 'region', recordId: reportId, regionId },
})

/** The sentence a reader sees under the comment, with the markup taken off. */
function sentence(view: AnnotationView): string {
  const drawn = renderToStaticMarkup(h(page.CommentTarget, { view, inspect: false }))
  const words = drawn
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
  // THE WHOLE OF THE ONE PARAGRAPH THAT SAYS IT, read off its own element.
  //
  // IT USED TO BE `/Left on [^.]*\./` — everything up to the first full stop — and that stopped
  // being the sentence on 2 September 2026, when a part began to be named by the words it holds:
  // *the paragraph “The mount holds calibration through a full handover.”* has a full stop inside
  // it, so the extractor cut the sentence in half and the case comparing it went red about a
  // sentence the page had drawn correctly. A regex that reads a screen has to read the element the
  // screen draws.
  const said = /<p class="rd-lead">([\s\S]*?)<\/p>/.exec(drawn)
  expect(said, `nothing on the page says where this comment was left: ${words}`).not.toBeNull()
  return ((said as RegExpExecArray)[1] ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

// ============================================================================ 1

describe('five places produce five sentences a reader can tell apart', () => {
  let said: Record<string, string>

  beforeAll(async () => {
    said = {
      paragraph: sentence(await commentOn(onRegion('data.blocks[#b-1].text@0'))),
      block: sentence(await commentOn(onRegion('data.blocks[#b-2]'))),
      section: sentence(await commentOn(onRegion('section.openAround'))),
      // THE LABEL, WHICH IS THE ONE WHOLE-RECORD FORM STILL STORED BESIDE A RECORD. It was the
      // stored gist until 3 September 2026; reading length 3 is the record's own `summary` column
      // now (criterion A14b) and `data.shortForms.gist` is a retired key that nothing reads back,
      // so a comment anchored there names a part the tree no longer holds.
      shortForm: sentence(await commentOn(onRegion('data.shortForms.label.text'))),
      record: sentence(await commentOn({ target: { kind: 'record', recordId: reportId, workspaceId: WORKSPACE } })),
    }
    // PRINTED, BECAUSE THE CLAIM OF THIS FILE IS THAT A PERSON CAN READ THESE. A run of it is the
    // measurement, not a number derived from one.
    for (const [place, words] of Object.entries(said)) process.stdout.write(`${place.padEnd(10)} ${words}\n`)
  }, 120_000)

  it('names the part each comment was left on, and not only the record it is in', () => {
    expect(said['paragraph']).toContain('the paragraph')
    expect(said['block']).toContain('the table')
    expect(said['section']).toContain('the section')
    expect(said['shortForm']).toContain('the label')
  })

  /**
   * A DECLARED SECTION IS NAMED BY ITS TITLE, WHICH IS WHAT TELLS THREE OF THEM APART.
   *
   * The word *section* alone is shared with every headed `text` block on the page, so a record with
   * three declared sections in it read as three identical sentences until 1 September 2026. The
   * title comes from `SectionSpec.title` in src/shared/sections.ts — the one place a section's name
   * is written, and the one the panel on this page draws its heading from — through `nameOfRegion`
   * in src/shared/regions.ts, which is also what the REVIEW PANE calls. That is why it is asserted
   * on both surfaces: breaking the one function has to go red in both places, or the two are free
   * to disagree again. tests/the-review-pane-names-the-place.test.ts is the other half.
   */
  it('names a declared section by its title, so two sections do not read alike', () => {
    expect(said['section'], 'a declared section was named by its role and not by what it is called').toContain(
      'the section “What is still open around this”',
    )
  })

  it('still says the whole record when the comment IS about the whole record', () => {
    // AND SAYS IT ONCE. `the record in the report "…"` would be the same thing said twice, which is
    // what a rule that always adds a part would have produced.
    //
    // IT SAID "Left on the whole of the report …" UNTIL 2 SEPTEMBER 2026, and the words *the whole
    // of* were this page's rather than the server's. They were dropped from the page because the
    // page had no way of knowing whether the phrase it was handed already carried them — and on a
    // comment left on the record ROOT it did, which is the doubled sentence the case below holds.
    // Nothing is lost here: the end of the sentence is what says a comment is about the whole of a
    // thing rather than about particular words, and it says it once.
    expect(said['record']).toBe(`Left on the report “${TITLE}”, rather than on particular words.`)
  })

  it('names the record every one of them is in', () => {
    for (const [place, words] of Object.entries(said)) {
      expect(words, `${place} does not say which record it is in`).toContain(TITLE)
    }
  })

  /**
   * AND THE ONE THE PAGE SAID TWICE: A COMMENT LEFT ON THE RECORD ROOT.
   *
   * `data` IS the record, so `whereAPartIs` in @shared/regions.ts answers *the whole of the report
   * “…”* for it — and this page opened its own sentence with *Left on the whole of*, which is the
   * same fact worked out in two places with both of them applying it. Read in a browser at
   * 127.0.0.1:5195 on 2 September 2026, on a report of the owner's own corpus:
   *
   *   Left on the whole of the whole of the report “THROWAWAY: …”, rather than on particular words.
   *
   * The page says nothing about wholeness now. This is that sentence, off the component's markup.
   */
  it('does not say the whole of it twice for a comment left on the record root', async () => {
    const said = sentence(await commentOn(onRegion('data')))
    expect(said, 'the page is putting its own words in front of the server’s phrase again').not.toContain(
      'the whole of the whole of',
    )
    expect(said).toBe(`Left on the whole of the report “${TITLE}”, rather than on particular words.`)
  })

  it('gives five different sentences, which is the whole of the repair', () => {
    // THE DEFECT WAS THAT ALL FIVE WERE ONE STRING. This is that fact asserted directly, and it is
    // what goes red when the phrase is built from the record again.
    const all = Object.values(said)
    expect(new Set(all).size, `five places, ${String(new Set(all).size)} sentences: ${all.join(' | ')}`).toBe(5)
  })
})

// ============================================================================ 2

describe('the other arm of the sentence says the same place', () => {
  it('names the part the quoted words are in, rather than the whole record', async () => {
    const view = await commentOn({
      target: { kind: 'region', recordId: reportId, regionId: 'data.blocks[#b-1].text@0' },
      span: {
        quote: QUOTE,
        from: PARAGRAPH.indexOf(QUOTE),
        to: PARAGRAPH.indexOf(QUOTE) + QUOTE.length,
        field: 'data.blocks[#b-1].text',
      },
    })
    const words = sentence(view)
    process.stdout.write(`quoted     ${words}\n`)
    // THE PARAGRAPH IS NAMED BY THE WORDS IT HOLDS, which is which part rather than what kind of
    // part. Before 2 September 2026 this read *the paragraph*, one string for every paragraph of
    // every report.
    expect(words).toBe(
      `Left on those words, in the paragraph “${PARAGRAPH}” in the report “${TITLE}”.`,
    )
  })
})

// ============================================================================ 3

describe('the phrase is the server’s, and the page does not build a second one', () => {
  it('hands the page one phrase per comment, naming the part and the record', async () => {
    const view = await commentOn(onRegion('data.blocks[#b-2]'))
    expect(view.where.leftOn).toBe(`the table “Cut mid-word The review row” in the report “${TITLE}”`)
    // AND THE DRAWN SENTENCE IS THAT STRING, unchanged. A page that rebuilt the phrase could still
    // pass the assertion above while drawing something else, which is how this defect survived.
    expect(sentence(view)).toContain(view.where.leftOn)
  })
})
