// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SHORT FORM RECORDS WHICH AGENT OR PERSON WROTE IT AND WHEN, AND STANDS FOR THE WHOLE RECORD.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER'S TWO SENTENCES THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * The POINTING handback was rejected by hand. Two rules are
 * criteria A4 and C1 of `design/pointing-reopened/ACCEPTANCE.md`:
 *
 *   the summary of a whole report stands for the whole report, and records who produced it;
 *   no summary or lower level has to be mapped onto a set of particular paragraphs.
 *
 * So: a whole-record form stands for the whole record, and it records who produced it. Recording
 * which paragraphs it came from is optional provenance and its absence is not a gap.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY SOME OF IT RENDERS
 * ---------------------------------------------------------------------------------------
 *
 * The claim is about what a person reads, so the two screens are rendered and read: the row of the
 * *Shorter forms* panel, and the report body's own opening line. Asserting the API fields alone
 * would leave both free to go on drawing nothing, which is the state the panel was in for the whole
 * of the previous round while the machinery behind it was complete.
 *
 * The server half goes through the product's own server, so the values are the ones a browser
 * really receives.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * It writes no abstracts. Whether the words of a form say what a report is about is criterion A2
 * and is read by a person; nothing in this product can check it. This file checks who wrote them,
 * when, and what they stand for.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import type { ShortFormReading, ShortFormsReading } from '../src/server/lib/zoom.ts'
import { RUNGS, positionOf, type DetailSource, type Rung } from '../src/shared/detail.ts'
import { reportAt } from '../src/shared/reportrungs.ts'
import {
  PARTS_KEY,
  STORED_SHORT_FORM_LEVELS,
  whoWroteIt,
  type StandsFor,
} from '../src/shared/zoom.ts'
import type { SummaryBlock } from '../src/shared/types.ts'
import { STAMP_GRAMMAR } from '../src/shared/time.ts'

const WORKSPACE = 'default'

/** The three headers a write carries. `by` is read off the second of them and nowhere else. */
const THE_WRITER = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code/short-form-writer',
  'x-mole-office-session': 'sess-who-wrote-it',
  'x-mole-office-workspace': WORKSPACE,
}

/** A second agent, for the write that replaces the first one's words. */
const SOMEBODY_ELSE = {
  ...THE_WRITER,
  'x-mole-office-actor-id': 'claude-code/second-writer',
}

const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

/**
 * THE WHOLE-RECORD FORM THIS FILE WRITES, AND IT WAS A GIST UNTIL 3 SEPTEMBER 2026.
 *
 * Criterion A14b of design/pointing-reopened/ACCEPTANCE.md: reading length 2 IS the record's own
 * `title` column and length 3 IS its own `summary`, so neither is a form written beside the record
 * and both write doors refuse a new one by name. The label is the whole-record form still stored
 * under `data.shortForms`, so it is what every write here writes — and a label is two to five
 * words rather than a paragraph. Who wrote a form and what it stands for are the claims this file
 * makes, and neither of them moved with the length.
 */
const LABEL = 'Pulling the wrist mount'

/** The same length, written again by a second agent, so the two names can be told apart. */
const SECOND_LABEL = 'Printed mount, round eight'

type RecordPageModule = typeof import('../src/web/pages/RecordPage.tsx')
type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')

let t: TestDb
let app: FastifyInstance
let page: RecordPageModule
let sb: SummaryBlocksModule
let reportId: string

/** Everything the two page modules read at import time. Nothing here is under test. */
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
    location: { hash: '#/records', href: 'http://127.0.0.1/#/records', search: '' },
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

/** The newest entry of the ledger: the pair a write of short forms has to name. */
async function newestRevision(): Promise<{ seq: number; contentHash: string }> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${reportId}/revisions`, headers: HUMAN })
  const list = (read.json() as { revisions: { seq: number; contentHash: string }[] }).revisions
  const newest = [...list].sort((a, b) => b.seq - a.seq)[0]
  expect(newest, 'the record has no revision for a short form to name').toBeDefined()
  return { seq: (newest as { seq: number }).seq, contentHash: (newest as { contentHash: string }).contentHash }
}

async function writeForms(
  payload: Record<string, unknown>,
  headers: Record<string, string> = THE_WRITER,
): Promise<{ status: number; body: string }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/records/${reportId}/short-forms`,
    headers,
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
 * `ShortFormReading.standsFor` became nullable on 2 September 2026: reading lengths 4, 5 and 6 are
 * written by part and Full is the record itself, so none of those four is one text about the whole
 * record and a sentence about which parts a text stands for would be about nothing there. Every
 * length asked for here is one of the three that ARE one text, so a null is the reading having
 * stopped answering and is failed rather than read around.
 */
type StandsForRow = ShortFormReading & { standsFor: StandsFor }

const at = (all: ShortFormsReading, level: string): StandsForRow => {
  const one = all.levels.find((each) => each.level === level)
  expect(one, `the reading has no level "${level}"`).toBeDefined()
  const found = one as ShortFormReading
  expect(found.standsFor, `the reading says nothing about what the ${level} stands for`).not.toBeNull()
  return found as StandsForRow
}

/** What the record really holds under `data.shortForms`, read back through the API. */
async function stored(): Promise<Record<string, Record<string, unknown>>> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${reportId}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  const record = (res.json() as { record: { data: Record<string, unknown> } }).record
  return (record.data['shortForms'] ?? {}) as Record<string, Record<string, unknown>>
}

/** The markup with tags taken out, so an assertion is about words and not about elements. */
const words = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * THE PHRASE THE PRODUCT SAYS ABOUT WHO WROTE ONE LENGTH, or null where nobody recorded it.
 *
 * IT WAS THE MARKUP OF `WhoWroteThisForm`, the line in the *Shorter forms of this report* panel,
 * until the owner had that panel removed on 2 September 2026. The composer is the one place a
 * person meets it now, and it draws this exact phrase — `whoWroteIt` is the one function that
 * writes it, so the composer and this file cannot say one stored fact two ways.
 *
 * THE COMPOSER IS PRESSED, IN A BROWSER, in `tests/who-wrote-a-form-is-not-on-the-page.test.ts`:
 * once on a form a named agent wrote, and once on a form nobody recorded a writer for. That file is
 * where "a person can read it" is guarded; this one is where "what it says" is.
 */
const whoLine = (level: ShortFormReading): string | null => whoWroteIt(level.by, level.at)

/** What the product says one length stands for, which is the sentence the composer prints. */
const standsForRow = (level: StandsForRow): string => level.standsFor.says

const REPORT: SummaryBlock[] = [
  {
    id: 'b-open',
    type: 'text',
    heading: 'The short answer',
    text: 'Three of four printed wrist mounts broke below the load the trials need.',
  },
]

/**
 * The record as the resolver sees it, with the one stored whole-record length written by a named
 * agent. It took any of `label`, `title` and `gist` until criterion A14b left one of them stored.
 */
function sourceWith(level: 'label', text: string, by: string | null): DetailSource {
  return {
    title: 'Wrist mount pull test, round eight',
    summary: null,
    declaresShortForms: true,
    body: { field: 'data.blocks', written: true },
    shortForms: {
      [level]: {
        text,
        madeFrom: { seq: 6, contentHash: 'aaaa' },
        writtenBy: 'agent',
        ...(by === null ? {} : { by }),
      },
    },
  }
}

/** The report body as a reader meets it at one reading length. */
function body(source: DetailSource, rung: Rung): string {
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks: REPORT,
      layout: 'page',
      drawAt: rung,
      inRecord: { recordId: 'rec-1', kind: 'report', stored: source },
    } as never),
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  shimTheBrowser()
  page = await import('../src/web/pages/RecordPage.tsx')
  sb = await import('../src/web/components/SummaryBlocks.tsx')

  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'report',
      title: 'Wrist mount pull test, round eight',
      data: {
        blocks: [
          { id: 'b-para', type: 'text', text: 'The mount tolerance is 0.2 mm and nobody measured it.' },
          { id: 'b-head', type: 'text', heading: 'What the rig showed', text: 'Three of four printed mounts broke.' },
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

// ============================================================ 1. the write records who and when

describe('writing a short form records which writer wrote it and when', () => {
  it('stores the actor id from the request headers and a local wall-clock stamp', async () => {
    const wrote = await writeForms({ forms: { label: LABEL } })
    expect(wrote.status, wrote.body).toBe(200)

    const held = (await stored())['label']
    expect(held, 'the label was not stored at all').toBeDefined()
    // THE NAME COMES FROM THE HEADERS AND FROM NOWHERE ELSE. Nothing in the request body said it.
    expect(held?.['by']).toBe('claude-code/short-form-writer')
    const when = String(held?.['at'])
    // LOCAL WALL CLOCK, WHICH IS THE ONE STORED FORM IN THIS PRODUCT. A trailing `Z` once made a
    // fifty-minute silence read as "just now" here, so the absence of one is asserted, not assumed.
    expect(when, 'the stamp carries a timezone, so it is not the local wall clock').not.toMatch(/Z$/)
    expect(when).toMatch(new RegExp(`^${STAMP_GRAMMAR}$`))
  })

  it('hands both back on the reading a browser gets', async () => {
    const level = at(await reading(), 'label')
    expect(level.by).toBe('claude-code/short-form-writer')
    expect(level.at).not.toBeNull()
    // AND SAYS NOTHING ABOUT A LENGTH NOBODY WROTE. There is no writer of a form that was never
    // written, so the answer is null rather than the name of whoever wrote another length.
    //
    // THE LENGTH NOBODY WROTE WAS THE TITLE AND IS THE CONCLUSION NOW. Criterion A14b made reading
    // length 2 the record's own title column, and this report has one, so the title is written.
    // It was filed with no summary, so reading length 3 is the one nobody has written.
    const unwritten = at(await reading(), 'gist')
    expect(unwritten.state).toBe('none')
    expect(unwritten.by).toBeNull()
    expect(unwritten.at).toBeNull()
  })

  it('does not leave a second writer standing behind the first writer’s name', async () => {
    const again = await writeForms({ forms: { label: SECOND_LABEL } }, SOMEBODY_ELSE)
    expect(again.status, again.body).toBe(200)
    // THE TRAP THIS ASSERTION HOLDS OPEN. A short form is stored under a key inside `data`, and the
    // merge that writes it RECURSES into the object already there — so a name the write does not
    // say out loud is a name left standing. New words written by somebody else would go on saying
    // the first agent wrote them, on every screen, with nothing saying otherwise.
    expect((await stored())['label']?.['by']).toBe('claude-code/second-writer')
    expect(at(await reading(), 'label').by).toBe('claude-code/second-writer')
  })
})

// ============================================================ 2. a form written before this

describe('a form stored before Mole Office recorded either', () => {
  beforeAll(async () => {
    // AN OLD ROW, WRITTEN THE WAY THE OLD PRODUCT WROTE IT: text, the revision it was made from and
    // whether a person wrote it, and nothing else. Every short form in the live corpus is this
    // shape today. It goes in round the write gate because the gate is exactly what would add the
    // two fields, and then this would be testing a form that is not old.
    const record = await app.inject({ method: 'GET', url: `/api/records/${reportId}`, headers: HUMAN })
    const data = (record.json() as { record: { data: Record<string, unknown> } }).record.data
    writeDataBypassingTheGate(t, reportId, {
      ...data,
      shortForms: {
        // WHAT IS ALREADY THERE STAYS THERE, which is a habit rather than a need now: the label is
        // the only whole-record form stored under this field since criterion A14b, and this write
        // replaces it. It used to sit beside a gist a real write had stored, and that is why the
        // block below writes the label again rather than reading the one this leaves.
        ...((data['shortForms'] ?? {}) as Record<string, unknown>),
        label: { text: 'Wrist mount, round eight', madeFrom: await newestRevision(), writtenBy: 'agent' },
      },
    })
  })

  it('reads back, and says nobody recorded who wrote it or when', async () => {
    const level = at(await reading(), 'label')
    expect(level.state, 'an old form stopped being readable at all').not.toBe('none')
    expect(level.text).toBe('Wrist mount, round eight')
    // NOTHING IS INVENTED FOR IT. The record's own `updatedAt` is the time of the last write of any
    // kind, and filing that as the time these words were written would be a guess presented as a
    // measurement.
    expect(level.by).toBeNull()
    expect(level.at).toBeNull()
  })

  /**
   * NULL, NOT A STRING WITH A GAP IN IT.
   *
   * THE COMPOSER SAYS SO IN WORDS where this answers null, and that is where a person meets it now
   * that the *Shorter forms of this report* panel has been removed. It is pressed, in a browser, on
   * a record in exactly this state, in `tests/the-composer-says-who-wrote-a-form.test.ts`.
   */
  it('answers with no phrase at all, rather than a phrase with a hole where a name would go', () => {
    expect(whoLine({ by: null, at: null } as ShortFormReading)).toBeNull()
  })
})

// ============================================================ 3. the two screens

describe('who wrote a form is recorded, and the report body does not say it', () => {
  /**
   * THIS READ THE GIST A REAL WRITE HAD STORED, and it writes the label first now.
   *
   * Criterion A14b of design/pointing-reopened/ACCEPTANCE.md left one whole-record form under
   * `data.shortForms`, so the length a real write stores and the length the block above puts an
   * OLD-SHAPED form under are the same one — and that block took the writer's name off it, which is
   * what it is for. So this writes the label through the door before reading it back. What is
   * asserted is what it always was: the phrase the composer draws names the writer and the moment.
   */
  it('names the writer and the time, in the phrase the composer draws', async () => {
    const again = await writeForms({ forms: { label: SECOND_LABEL } }, SOMEBODY_ELSE)
    expect(again.status, again.body).toBe(200)
    const level = at(await reading(), 'label')
    const said = whoLine(level)
    expect(said, 'the product says nothing at all about who wrote the label').not.toBeNull()
    expect(said ?? '').toContain('Written by claude-code/second-writer on ')
    expect(said ?? '').toContain(String(level.at))
  })

  /**
   * THE REPORT BODY USED TO NAME THE WRITER AND NO LONGER DOES. It drew a mark under the form
   * reading *Written for this length by claude-code/short-form-writer*. That mark is
   * not for a person, and it is not shown to people,
   * so the body draws the form's words
   * and nothing about them, and who wrote it is in the composer on right-click (criterion A9).
   *
   * WHAT THE BODY STILL RECORDS is that the words were written for the length being read, in
   * `data-summary`, which is what the mark layer and a test read. That is a fact in the markup and
   * not a sentence on the screen.
   */
  it('draws the form’s words and no line naming its writer', () => {
    const html = body(sourceWith('label', LABEL, 'claude-code/short-form-writer'), 'label')
    expect(html).toContain('data-summary="written"')
    expect(words(html)).toContain(LABEL)
    expect(words(html), 'the writer line is back on the page').not.toContain('Written for')
    expect(words(html), 'the writer is named on the page').not.toContain('claude-code/short-form-writer')
  })

  it('draws no mark at all where the stored form carries no writer either', () => {
    const said = words(body(sourceWith('label', LABEL, null), 'label'))
    expect(said).toContain(LABEL)
    expect(said, 'a mark about the form is back on the page').not.toContain('Written for')
  })
})

// ============================================================ 4. what a whole-record form stands for

describe('a form nobody recorded source parts for stands for the whole record', () => {
  it('says so on the reading the composer and the panel both draw from', async () => {
    const level = at(await reading(), 'label')
    expect(level.standsFor.parts).toBeNull()
    // ONE SENTENCE, FROM THE SERVER, DRAWN BY BOTH SCREENS. The composer prints this string
    // unaltered; a second wording on either screen is the defect this file's subject is about.
    expect(level.standsFor.says).toBe('Stands for the whole report.')
  })

  it('says it in the sentence a reader is shown, and reports no absence for the missing sources', async () => {
    const said = standsForRow(at(await reading(), 'label'))
    expect(said).toContain('Stands for the whole report.')
    expect(said, 'the sentence still reports optional provenance as something nobody did').not.toContain('Nobody recorded')
  })
})

// ============================================================ 5. filing a report is told the lengths

describe('the reply to filing a record says which shorter forms are still unwritten', () => {
  it('names every length, its budget and the two requests that write them', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: {
        kind: 'report',
        title: 'A second report, filed with nothing shorter than itself',
        data: { blocks: [{ id: 'b-1', type: 'text', text: 'One paragraph, and no short forms at all.' }] },
      },
    })
    expect(made.statusCode, made.body).toBe(201)
    const reply = made.json() as {
      record: { id: string }
      incomplete: unknown[]
      shortForms?: { missing: { level: string }[]; write: string; madeFrom: string; note: string }
    }
    const owed = reply.shortForms
    expect(owed, 'the reply said nothing about the lengths still to write').toBeDefined()
    // THE WHOLE-RECORD LENGTHS THIS ROUTE WRITES AND THEN THE PARTS, WHICH ARE ONE THING TO WRITE
    // AND NOT THREE. Reading lengths 4, 5 and 6 share one stored structure, so a report has all
    // three or none of them, and the reply names that structure once rather than naming three
    // lengths a writer would go looking for three requests for.
    //
    // IT WAS ALL THREE WHOLE-RECORD LENGTHS AND IS ONE. Criterion A14b of
    // design/pointing-reopened/ACCEPTANCE.md made reading length 2 the record's own title and
    // length 3 its own summary on 3 September 2026, so neither is owed to this route: the record is
    // filed with them or without them, and a summary nobody wrote is `incomplete` on the record
    // itself. The list is read off `STORED_SHORT_FORM_LEVELS` so that it cannot be typed twice.
    expect(owed?.missing.map((one) => one.level)).toEqual([...STORED_SHORT_FORM_LEVELS, PARTS_KEY])
    expect(owed?.write).toBe(`POST /api/records/${reply.record.id}/short-forms`)
    expect(owed?.madeFrom).toBe(`GET /api/records/${reply.record.id}/revisions`)
    expect(owed?.note).toContain('POST /api/records/')
    // AVAILABILITY IS NOT COMPLETENESS, and the owner settled that on 29 August 2026. A report with
    // no short forms is a complete report as far as the short forms go, so no length may reach
    // `incomplete`. The report is short of other fields and that is a different answer, said in a
    // different place — which is the whole distinction being held here.
    const paths = reply.incomplete.map((one) => (one as { path: string }).path)
    expect(paths, 'a missing short form was reported as a field the record still needs').toEqual(
      paths.filter((path) => !path.includes('shortForms')),
    )
    expect(paths.length, 'this report is short of nothing, so the check above proves nothing').toBeGreaterThan(0)
  })

  it('asks a kind that holds no blocks for the level-1 name and for nothing written by part', async () => {
    // EVERY KIND CARRIES A LEVEL-1 NAME since a decision, so a note is asked for one exactly as a
    // report is. This used to assert that
    // a note was asked for nothing at all, because a note had no place for a short form.
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: { kind: 'note', title: 'A note has a title and one line, and a name to be listed under' },
    })
    expect(made.statusCode, made.body).toBe(201)
    const owed = (made.json() as { shortForms?: { missing: { level: string }[] } }).shortForms
    // AND NOT THE THREE WRITTEN BY PART. A part names the blocks it covers and a note holds none, so
    // naming them here would be work reported as owed that nobody can do.
    expect(owed?.missing.map((one) => one.level)).toEqual([...STORED_SHORT_FORM_LEVELS])
  })

  it('says it on filing and not on every write afterwards', async () => {
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/records/${reportId}`,
      headers: HUMAN,
      payload: { summary: 'One line about the wrist mounts.' },
    })
    expect(patched.statusCode, patched.body).toBe(200)
    // NOT ON EVERY REPLY, AND THAT IS MEASURED. Built into `recordReply` for one commit, it landed
    // on every PATCH of a module as well, and tests/checklist-item.test.ts — which measures what
    // ticking one checklist line costs against rewriting the whole array — went red by three
    // hundred bytes. Nine hundred bytes on every reply is a real cost to routes that have nothing
    // to do with short forms.
    expect((patched.json() as { shortForms?: unknown }).shortForms).toBeUndefined()
  })
})

// ============================================================ 6. the skill says to write them

// ============================================================ 7. the sixth length is still there

/**
 * REWRITTEN 2 September 2026, BECAUSE THE LENGTH IT WAS ABOUT IS RETIRED AND ITS SEAT IS NOT.
 *
 * It read a 420-word `account` off `data.shortForms.account` and drew it at position 6. The owner
 * retired the account with the card and the brief that evening and put the report's own parts in
 * those three seats, so the sixth position is the digest: each part of the report in at most 120
 * words, stored with the other two by-part lengths in one structure under `data.shortForms.parts`.
 * The claim is the one this block always made — the sixth position is still there, it is drawn from
 * its own stored field, and it is still the sixth — asked of the length that sits there now.
 */
const THE_PART = {
  id: 'p-open',
  heading: 'What the pull test showed about the printed mount',
  text30: 'Three of four printed mounts broke below the load the handover trials need, so the printed part is out.',
  text120:
    'Three of four printed wrist mounts broke between fourteen and sixteen newtons on the bench jig, below ' +
    'the twenty the handover trials need, so the printed part cannot be used for them and an aluminium ' +
    'mount of the same geometry has been ordered.',
  covers: ['b-open'],
}

/** The same record with the by-part structure written, which is what positions 4 to 6 draw. */
function sourceWithParts(by: string): DetailSource {
  return {
    title: 'Wrist mount pull test, round eight',
    summary: null,
    declaresShortForms: true,
    body: { field: 'data.blocks', written: true },
    shortForms: {
      parts: { madeFrom: { seq: 6, contentHash: 'aaaa' }, writtenBy: 'agent', by, parts: [THE_PART] },
    },
  }
}

describe('the sixth reading position is drawn from its own stored field', () => {
  it('reads the digest off data.shortForms.parts and draws it at position 6', () => {
    const source = sourceWithParts('claude-code/short-form-writer')
    const answer = reportAt(source, REPORT, 'digest').summary
    expect(answer.standing).toBe('written')
    expect(answer.field).toBe('data.shortForms.parts')
    expect(positionOf('digest')).toBe(6)
    // THE PART'S 120-WORD TEXT IS WHAT THE SIXTH POSITION DRAWS UNDER THE HEADING, and the heading
    // is the same sentence at all three by-part lengths, so both are looked for.
    expect(words(body(source, 'digest'))).toContain(THE_PART.heading)
    expect(words(body(source, 'digest'))).toContain(THE_PART.text120)
  })

  it('leaves all seven reading positions on the ladder the control draws', () => {
    expect([...RUNGS]).toEqual(['label', 'title', 'gist', 'outline', 'sketch', 'digest', 'full'])
    expect(RUNGS.map((rung) => positionOf(rung))).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})
