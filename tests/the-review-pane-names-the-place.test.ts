// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANE NAMES THE PLACE, AND SEVEN DIFFERENT PLACES READ AS SEVEN DIFFERENT SENTENCES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED ON 1 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * `leftOn` in src/server/lib/annotations.ts named the KIND of part a comment was left on — nine
 * places, six distinguishable sentences — and it is what the RECORD PAGE draws. The REVIEW PANE
 * draws something else: `reading.about`, which is `TargetText.about` out of src/server/lib/
 * targets.ts, put through `withoutIds` so a reader is not shown a region id. That sentence was
 *
 *   `the part ${region.id} of the report "…"`
 *
 * so with the id taken out, a paragraph, a table, a headed block, three different declared sections
 * and a stored short form — every different place on one report — all read
 *
 *   the part of the report "…"
 *
 * character for character, and expanding More added only the identical *Part of a record*. One fact
 * worked out in two places, and the weaker of the two was on the surface the owner's review flow uses.
 *
 * ---------------------------------------------------------------------------------------
 * ONE PLACE WAS CUT ON 3 SEPTEMBER 2026, AND HERE IS WHICH ONE
 * ---------------------------------------------------------------------------------------
 *
 * This file used to walk EIGHT places. The eighth was `section.shortForms`, asserted to read *the
 * section "Shorter forms of this report"*. That panel was removed from the record page on
 * a ruling that it repeated the content above it and was not normal UI, and it was to go
 * — which retired criteria A10 and A13 of design/pointing-reopened/ACCEPTANCE.md and is section
 * C-3Sept of design/problem-02/ACCEPTANCE.md. The sentence this file pinned named a box no reader
 * can open, so that row is gone and the other seven stand.
 *
 * NOTHING ABOUT SHORT FORMS IS LOST BY THE CUT. The stored forms, the route that writes them and
 * the door that checks them are unchanged, `data.shortForms.label.text` is still one of the seven
 * places below, and `tests/the-record-page-has-no-shorter-forms-panel.test.ts` is what holds the
 * panel’s absence.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS EVIDENCE FOR — READ THIS FIRST
 * ---------------------------------------------------------------------------------------
 *
 * IT IS EVIDENCE FOR THE SERVER’S ANSWER: seven places of seven different kinds, written through
 * the API against a real region tree, read back, and asserted off the markup the pane’s own
 * component makes of them.
 *
 * IT IS NOT THE EVIDENCE FOR CRITERION D-R1 OR D-R2, which were raised on 2 September 2026 and ask
 * for MORE than seven kinds: over every part of one record, no two of the pane’s where sentences
 * are the same string. `tests/the-review-pane-names-which-part.test.ts` opens the pane in a real
 * browser on a record built to hold the pairs, and that file is what those two are measured by.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE RENDERS `PaneWhole` AND NOT SOMETHING THAT RESEMBLES IT
 * ---------------------------------------------------------------------------------------
 *
 * `tests/a-comment-says-where-it-was-left.test.ts` renders `RecordPage`’s `CommentTarget`, and its
 * own header says so. That file is evidence about the record page and about `leftOn`. It is not
 * evidence about the pane, and while it was the only guard the pane was unguarded — which is how
 * eight identical sentences survived a pass that repaired the other surface.
 *
 * So this renders the pane's own component, and it renders it from a `ReviewDetail`
 * READ BACK OUT OF THE RUNNING SERVER. Nothing here writes an `about` sentence: the seven comments
 * are written through the API, a review collects them, and the sentences asserted are the ones the
 * server worked out for a real region tree of a real record. A fixture with a typed sentence in it
 * would pass whatever the server did.
 *
 * AND THE PANE IS HANDED A REAL VALUE FOR `showing` NOW. It was `{ state: ‘none’ } as never` — a
 * fixture cast past the type that describes it, which is a component handed a world the product
 * does not put it in. `{ state: ‘none’ }` is the first arm of `Showing` in src/web/components/
 * agent/MarkLayer.tsx and is what the pane holds while nobody has pressed a comment, so the cast
 * was never needed and only hid whether the value was honest.
 *
 * WHY `PaneWhole` AND NOT `PaneBody`, SINCE SHAPE B. On a collecting review `PaneBody` draws *Your
 * review* first, which says what each comment is on and not where it was left, and the rows with
 * their where sentences sit behind "More about this review". Closed, that section draws nothing, so
 * `PaneBody` rendered here has no where sentence in it at all. `PaneWhole` is the component that
 * More opens, and the one a finished review draws without it; it is exported for this. The browser
 * file named above opens More with a press.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ReviewDetail } from '../src/server/lib/reviews.ts'
import type { Showing } from '../src/web/components/agent/MarkLayer.tsx'

/**
 * WHAT THE PANE HOLDS WHILE NOBODY HAS PRESSED A COMMENT, which is the state it opens in.
 *
 * It is the first arm of `Showing`, spelt out and typed rather than cast past. The old line here
 * was `showing: { state: 'none' } as never`, and the cast said nothing about whether the value was
 * one the product ever holds. It is: `useShowing` answers this until somebody presses a row.
 */
const NOBODY_HAS_PRESSED_A_COMMENT: Showing = { state: 'none' }

const WORKSPACE = 'default'
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

const TITLE = 'What the bench said'
const GIST =
  'Three of the four printed wrist mounts broke below the load the handover trials need, so the ' +
  'aluminium version is now the only one worth testing at all.'

type Bar = typeof import('../src/web/components/agent/ReviewBar.tsx')

let t: TestDb
let app: FastifyInstance
let bar: Bar
let reportId: string
let detail: ReviewDetail

/** Everything the pane's module tree reads at import time. Nothing here is under test. */
function shimTheBrowser(): void {
  const store = new Map<string, string>()
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
}

/**
 * THE SEVEN PLACES, BY REGION ID, AND WHAT A READER MUST BE ABLE TO READ ABOUT EACH.
 *
 * The ids are not invented: they were read off `recordRegionsOf` for the record built below, which
 * is the same derivation the server resolves against and the same one the page draws from.
 */
const PLACES: readonly { what: string; regionId: string; reads: string }[] = [
  {
    what: 'a paragraph',
    regionId: 'data.blocks[#b-para].text@0',
    // A PART IS NAMED BY THE WORDS IT HOLDS AND NOT BY ITS KIND. Before 2 September 2026 these
    // three read *the paragraph*, *the table* and *the section* — true of every paragraph, every
    // table and every headed block of every report, and therefore no use for finding one.
    reads: 'the paragraph “The mount tolerance is 0.2 mm and nobody measured it.”',
  },
  { what: 'a table', regionId: 'data.blocks[#b-tab]', reads: 'the table “4 three”' },
  { what: 'a headed block', regionId: 'data.blocks[#b-head]', reads: 'the section “What the rig showed”' },
  { what: 'the openAround section', regionId: 'section.openAround', reads: 'the section “What is still open around this”' },
  { what: 'the history section', regionId: 'section.history', reads: 'the section “How this record got here”' },
  { what: 'the stored label', regionId: 'data.shortForms.label.text', reads: 'the label' },
  // THE RECORD'S OWN SUMMARY, WHICH IS READING LENGTH 3 SINCE 3 SEPTEMBER 2026, criterion A14b.
  // This row was `data.shortForms.gist.text`, reading *the gist*; that key is retired, nothing
  // reads it back, and the region is not in the tree. The pane reads the summary as the section it
  // is declared as, because a pane reading a comment away from the page has no drawing to ask which
  // of the two things that string is — the record's one-line summary or the report's conclusion.
  { what: 'the record’s own summary', regionId: 'section.summaryLine', reads: 'the section “Summary”' },
]

beforeAll(async () => {
  shimTheBrowser()
  t = await freshDb()
  app = (await apiApp()).app
  bar = await import('../src/web/components/agent/ReviewBar.tsx')

  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'report',
      title: TITLE,
      // READING LENGTH 3 IS THE RECORD'S OWN SUMMARY since 3 September 2026, criterion A14b, so the
      // words that were written as a stored `gist` are filed with the record.
      summary: GIST,
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

  // THE TWO STORED SHORT FORMS, THROUGH THE DOOR THAT WRITES THEM, which checks the revision they
  // say they were made from. Writing them into `data` at create time is refused, and rightly:
  // a record being filed has no revisions for a short form to name.
  const revisions = (
    await app.inject({ method: 'GET', url: `/api/records/${reportId}/revisions`, headers: HUMAN })
  ).json() as { revisions: { seq: number; contentHash: string }[] }
  const newest = revisions.revisions[revisions.revisions.length - 1]
  expect(newest, 'the record was filed with no revision to write a short form against').toBeDefined()
  const forms = await app.inject({
    method: 'POST',
    url: `/api/records/${reportId}/short-forms`,
    headers: HUMAN,
    payload: {
      madeFrom: { seq: newest?.seq, contentHash: newest?.contentHash },
      // THE LABEL ALONE, since 3 September 2026: reading length 3 is the record's own `summary`
      // column (criterion A14b) and `data.shortForms.gist` is retired. The words GIST holds are on
      // the record itself, filed with it above.
      forms: { label: 'Bench, round eight' },
    },
  })
  expect(forms.statusCode, forms.body).toBe(200)

  // THE REVIEW FIRST, THEN THE COMMENTS, because a review collects what is written while it is
  // collecting. Started at the record so all eight parts of it fall inside.
  const started = await app.inject({
    method: 'POST',
    url: '/api/reviews',
    headers: HUMAN,
    payload: { entry: { target: { kind: 'record', recordId: reportId, workspaceId: WORKSPACE } } },
  })
  expect(started.statusCode, started.body).toBe(201)
  const reviewId = (started.json() as { review: { id: string } }).review.id

  for (const place of PLACES) {
    const written = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: {
        kind: 'annotation',
        title: `on ${place.what}`,
        data: {
          body: `A remark about ${place.what}.`,
          context: { target: { kind: 'region', recordId: reportId, regionId: place.regionId } },
        },
      },
    })
    expect(written.statusCode, written.body).toBe(201)
  }

  const read = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}`, headers: HUMAN })
  expect(read.statusCode, read.body).toBe(200)
  detail = read.json() as ReviewDetail
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** The pane, drawn from the server's own answer. */
const pane = (): string =>
  renderToStaticMarkup(
    h(bar.PaneWhole, { detail, notes: null, showing: NOBODY_HAS_PRESSED_A_COMMENT }),
  )

/** Every *where* sentence the pane drew, in the order it drew them. */
function whereSentences(html: string): string[] {
  const out: string[] = []
  const pattern = /<span class="px-rev-where">([^<]*)<\/span>/g
  let found = pattern.exec(html)
  while (found !== null) {
    const text = (found[1] ?? '').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
    // A ROW DRAWS ITS DATE IN THE SAME CLASS. The place sentence is the one that names the report.
    if (text.includes(TITLE)) out.push(text)
    found = pattern.exec(html)
  }
  return out
}

describe('the review pane names the place a comment was left', () => {
  it('collects all seven comments, so the pane really is drawing seven rows', () => {
    expect(detail.members, 'the review did not collect the seven comments').toHaveLength(PLACES.length)
  })

  it('draws a different sentence for every one of the seven places', () => {
    const said = whereSentences(pane())
    expect(said, 'the pane drew a different number of place sentences than there are comments').toHaveLength(
      PLACES.length,
    )
    const distinct = new Set(said)
    expect(
      distinct.size,
      `seven places read as ${String(distinct.size)} sentences: ${[...distinct].join(' | ')}`,
    ).toBe(PLACES.length)
  })

  it('names each place the way a reader would name it', () => {
    const said = whereSentences(pane())
    for (const place of PLACES) {
      expect(
        said.some((one) => one.startsWith(`${place.reads} in the report`)),
        `no row read "${place.reads} in the report …" for ${place.what}. What was drawn: ${said.join(' | ')}`,
      ).toBe(true)
    }
  })

  it('never falls back to the sentence that said nothing', () => {
    const said = whereSentences(pane())
    for (const one of said) {
      expect(one, 'a row still read "the part of the report", which names no place').not.toMatch(
        /^the part (of|in) the report/,
      )
    }
  })

  it('keeps the region id, so Developer detail still shows which one it was', () => {
    // THE ID IS IN THE SERVER'S SENTENCE AND THE PANE TAKES IT OUT FOR A READER. Taking it out on
    // the server would take it off both, and two headed blocks are told apart by nothing else.
    for (const place of PLACES) {
      const member = detail.members.find(
        (one) => 'context' in one && JSON.stringify(one.context).includes(place.regionId),
      )
      expect(member, `no member was collected for ${place.what}`).toBeDefined()
      const about = member !== undefined && 'reading' in member ? member.reading.about : ''
      expect(about, `the server's sentence lost the id of ${place.what}`).toContain(place.regionId)
    }
  })
})
