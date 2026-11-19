// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECTION NAMES WHICH PART OF THE RECORD IT STANDS FOR, NOT WHAT KIND OF PART IT IS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A READER GOT, MEASURED THROUGH A RUNNING SERVER ON 1 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * On the owner's own report `OOOt4Kouc5dT`, a stored gist recorded as standing for two of its
 * headed blocks drew, in the *Shorter forms* panel and in the composer:
 *
 *   Stands for the section and the section.
 *
 * and a label recorded as standing for three parts drew *the paragraph, the paragraph and the
 * heading*. Every name in those sentences is a KIND. A reader cannot get from one to a part, and
 * two different parts of one report read the same.
 *
 * The cause was that `sourcesOf` named each part with `nameOfRegion`, which answers what KIND of
 * part something is — the right answer for the review pane, which prints the part's id beside it,
 * and the wrong one for a sentence that has to say which. Over the 488 parts of that report the
 * kind alone takes 27 distinct values, 260 of them the identical *cell of a table*.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE ASSERTS
 * ---------------------------------------------------------------------------------------
 *
 * `design/problem-03/WHAT-A-READER-MUST-BE-ABLE-TO-READ.md`, E-R1 to E-R3, written before the code.
 *
 *   1. THE SENTENCE, off the row the panel draws, read out of a running server: two headed blocks
 *      are named by the headings their author wrote, and three parts of one report are three
 *      different phrases.
 *   2. NO TWO PARTS OF ONE RECORD READ ALIKE, over every part of a record built to be hard: two
 *      blocks with the same heading, two paragraphs opening with the same words, a table of
 *      repeated cells, and a row of figures that hold no words at all.
 *   3. NOTHING IS INVENTED. A part the record no longer holds is still said to be one, and no
 *      region id reaches the sentence.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY FORM HERE IS WRITTEN AT THE LABEL, AND THEY USED TO BE WRITTEN AT THE GIST
 * ---------------------------------------------------------------------------------------
 *
 * Criterion A14b of design/pointing-reopened/ACCEPTANCE.md, 3 September 2026: reading length 2 IS
 * the record's own `title` column and length 3 IS its own `summary`. Neither is a form somebody
 * writes beside the record, so neither records the parts it stands for, and both write doors refuse
 * a new one by name. The label is the whole-record form still stored under `data.shortForms`, so it
 * is the length this file records source parts against. Nothing that is asserted moved with it:
 * these are claims about how a PART is named, and the namer is handed a region tree rather than a
 * length. Each case that moved says so above itself.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAKES EACH GO RED
 * ---------------------------------------------------------------------------------------
 *
 * Run on 1 September 2026, each against a control run of the same command:
 *
 *   name every part by its kind alone                        → 2 of 8 red
 *   never name the holder, only number                       → 1 of 8 red (the two cells)
 *   never number, only name the holder                       → 3 of 8 red (the two paragraphs, the
 *                                                              three figures, and the sweep)
 *   quote the body instead of the heading                    → 1 of 8 red (the two headed blocks)
 *
 * Control: 8 of 8 green, before and after.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { flatten, namesOfParts, recordRegionsOf, whereAPartIs, type Region } from '../src/shared/regions.ts'
import type { ShortFormReading, ShortFormsReading } from '../src/server/lib/zoom.ts'

const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

/**
 * A REPORT BUILT TO BE HARD TO NAME, and every difficulty in it is one that was measured on the
 * owner's corpus rather than imagined.
 *
 *   two headed blocks                 the case that read *the section and the section*
 *   two paragraphs opening alike      the first 60 characters are identical, so a quotation of the
 *                                     opening words alone cannot tell them apart
 *   a table whose cells repeat        260 of the owner's report's parts are cells and eight of them read `3`
 *   a row of figures                  parts that hold no words at all and share one holder
 */
const BLOCKS = [
  { id: 'b-one', type: 'text', heading: 'What the rig showed', text: 'Three of four printed mounts broke at the thin section.' },
  { id: 'b-two', type: 'text', heading: 'What nobody has measured', text: 'The tolerance on the bolt circle was never measured.' },
  {
    id: 'b-same',
    type: 'text',
    text:
      'The bench jig was checked against a hanging mass on the morning of the test and the reading was written down by hand.\n\n' +
      'The bench jig was checked against a hanging mass on the morning of the test and the load was raised by hand instead.',
  },
  {
    id: 'b-tab',
    type: 'table',
    columns: [{ label: 'Run' }, { label: 'Broke' }],
    rows: [{ cells: ['3', 'yes'] }, { cells: ['3', 'no'] }],
  },
  {
    id: 'b-fig',
    type: 'metrics',
    items: [
      { id: 'm-1', label: 'Samples', value: '4' },
      { id: 'm-2', label: 'Broke', value: '3' },
      { id: 'm-3', label: 'Newtons', value: '15' },
    ],
  },
]

/**
 * WHAT THIS REPORT IS CALLED. The two parts that ARE the record are named by it — see
 * `namesOfParts` — so the fixture holds it once and both the record it files and the namer it asks
 * are handed the same string.
 */
const TITLE = 'What the bench said, twice'

let t: TestDb
let app: FastifyInstance
let reportId: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: { kind: 'report', title: TITLE, data: { blocks: BLOCKS } },
  })
  expect(made.statusCode, made.body).toBe(201)
  reportId = (made.json() as { record: { id: string } }).record.id
})

afterAll(async () => {
  await app.close()
  t.close()
})

async function newestRevision(): Promise<{ seq: number; contentHash: string }> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${reportId}/revisions`, headers: HUMAN })
  const list = (read.json() as { revisions: { seq: number; contentHash: string }[] }).revisions
  const newest = [...list].sort((a, b) => b.seq - a.seq)[0]
  expect(newest, 'the record has no revision for a short form to name').toBeDefined()
  // ONLY THE TWO FIELDS THE DOOR TAKES. A revision row carries who wrote it and what changed as
  // well, and the write door refuses a key it did not declare rather than ignoring it.
  const one = newest as { seq: number; contentHash: string }
  return { seq: one.seq, contentHash: one.contentHash }
}

/** Write one length's words with the parts they stand for, through the one write door. */
async function standingFor(level: string, text: string, parts: string[]): Promise<void> {
  const wrote = await app.inject({
    method: 'POST',
    url: `/api/records/${reportId}/short-forms`,
    headers: HUMAN,
    payload: { madeFrom: await newestRevision(), forms: { [level]: text }, standsFor: { [level]: parts } },
  })
  expect(wrote.statusCode, wrote.body).toBe(200)
}

/** The parts one length was recorded as standing for, named — what *View original* presses. */
async function partsOf(level: string): Promise<readonly { regionId: string; name: string }[]> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${reportId}/short-forms`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  const one = (res.json() as ShortFormsReading).levels.find((each) => each.level === level)
  expect(one, `the reading has no level "${level}"`).toBeDefined()
  // `standsFor` IS NULL AT THE FOUR POSITIONS THAT ARE NOT ONE TEXT ABOUT THE WHOLE RECORD —
  // reading lengths 4, 5 and 6, which are written by part, and Full, which is the record. Every
  // length asked about here is one of the three that are, so a null is the reading having stopped
  // answering rather than a shape to read around.
  const stands = (one as ShortFormReading).standsFor
  if (stands === null) throw new Error(`the reading says nothing about what the ${level} stands for`)
  const parts = stands.parts
  expect(parts, `nothing was recorded as the source of the ${level}`).not.toBeNull()
  return parts as readonly { regionId: string; name: string }[]
}

/** The sentence the server writes for one length, which both the panel and the composer draw. */
async function says(level: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${reportId}/short-forms`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  const one = (res.json() as ShortFormsReading).levels.find((each) => each.level === level)
  expect(one, `the reading has no level "${level}"`).toBeDefined()
  const stands = (one as ShortFormReading).standsFor
  if (stands === null) throw new Error(`the reading says nothing about what the ${level} stands for`)
  return stands.says
}

// ============================================================ 1. the sentence names which part

describe('a form standing for two parts of one kind says which two', () => {
  it('names two headed blocks by the headings their author wrote', async () => {
    await standingFor('label', LABEL, ['data.blocks[#b-one]', 'data.blocks[#b-two]'])
    const said = await says('label')
    expect(
      said,
      'two different parts of one report were named by their kind, so both read the same',
    ).toBe(
      'Stands for the section “What the rig showed” and the section “What nobody has measured”.',
    )
  })

  it('never prints a region id at a reader', async () => {
    expect(await says('label')).not.toContain('data.blocks')
  })

  it('tells two paragraphs apart that open with the same 60 characters', async () => {
    // THE TWO IDS COME OFF THE DERIVATION, not off a count of characters done by hand: where the
    // second paragraph starts is the derivation's answer and nothing here holds a second one.
    const two = [...namesOfThisReport().keys()].filter((id) => id.startsWith('data.blocks[#b-same].text@'))
    expect(two, 'the block with two paragraphs derived something else').toHaveLength(2)
    await standingFor('label', 'Bench, round eight', two)
    const said = await says('label')
    // THE QUOTATION CANNOT TELL THEM APART, and that is the case this is here for: both paragraphs
    // open with the same 116 characters and both are in the same block, so there is no holder to
    // name either. What separates them is where each comes, said in the sentence.
    const named = said.replace(/^Stands for /, '').replace(/\.$/, '').split(' and ')
    expect(named, 'the sentence named something other than the two paragraphs').toHaveLength(2)
    expect(named[0], 'two different paragraphs read exactly alike').not.toBe(named[1])
    expect(said).toContain('the 1st paragraph')
    expect(said).toContain('the 2nd paragraph')
  })
})

/**
 * THE TWO PARTS THAT ARE THE RECORD ARE NAMED BY THE RECORD, AND NOT BY THE WORDS UNDER THEM.
 *
 * `data` IS the record and `data.blocks` IS the body of its report, so there is nothing "inside"
 * either of them to quote: the words underneath are the record's whole content. Measured through
 * the running API on 2 September 2026, on 754 of the 759 records stored, both read as a quotation
 * of the record's own prose in a reader's title marks:
 *
 *   the record “The short answer How to read the words below What you can…”
 *
 * on a record titled *Round ten: what was built, what was not, and what is waiting on you*. The
 * review pane read correctly ONLY because `whereAPartIs` throws that name away and substitutes the
 * title; the *Shorter forms* panel and the landing sentence of *View original* both read it raw and
 * both drew the prose. So it is fixed where the name is made, and this presses the panel's own
 * sentence and the parts *View original* is handed, which are the two surfaces that read it raw.
 */
describe('the two wholes are named by the record’s title', () => {
  /**
   * WRITTEN AT THE LABEL, AND IT HAS MOVED DOWN THE LADDER TWICE.
   *
   * It was the `card` until 2 September 2026, when the `card`, the `brief` and the `account` were
   * retired: lengths 4, 5 and 6 are written by part now and a part stands for the blocks it covers,
   * so the two wholes could only be recorded against a length that is one text about the whole
   * record. It moved to the gist. Criterion A14b of design/pointing-reopened/ACCEPTANCE.md moved it
   * again on 3 September, when reading length 2 became the record's own `title` column and length 3
   * its own `summary`: neither is a form anybody writes source parts for, and the label is the one
   * whole-record form left that records them. The claim is unchanged both times — it is about how
   * the two wholes are NAMED, not about which length names them.
   *
   * SO THE FORM IS A LABEL'S LENGTH NOW, two to five words. What it used to say about itself is in
   * the case below instead.
   */
  const THE_FORM = 'Both wholes at once'

  it('names the whole record and the body of its report by the title', async () => {
    // The two parts of a record that ARE the record have no words of their own, so one form stands
    // for both of them at once and the sentence is read off a running server.
    await standingFor('label', THE_FORM, ['data', 'data.blocks'])
    expect(await says('label')).toBe(
      `Stands for the record “${TITLE}” and the body of the report “${TITLE}”.`,
    )
  })

  it('does not put the record’s own prose in a reader’s title marks', async () => {
    const named = (await partsOf('label')).map((one) => one.name).join(' ')
    // THE OPENING OF THE RECORD'S OWN WRITING, which is what both names used to quote.
    expect(named, 'the record’s heading is being drawn as though it were its title').not.toContain(
      'What the rig showed',
    )
    expect(named, 'the record’s prose is being drawn as though it were its title').not.toContain(
      'Three of four printed mounts broke',
    )
  })

  it('leaves the two wholes named by what they are when nobody hands over a title', () => {
    // A SURFACE WITH A TREE AND NO RECORD — the module panel — announces no title. The honest
    // answer is the part's own word with nothing in quotation marks, and never the words beneath.
    const root = recordRegionsOf({ kind: 'report', data: { blocks: BLOCKS }, title: TITLE, summary: null, relations: [] })
    const names = namesOfParts(root, 'report', null)
    expect(names.get('data')).toBe('record')
    expect(names.get('data.blocks')).toBe('body of the report')
  })

  it('agrees with whereAPartIs about which two parts those are', () => {
    // ONE ANSWER, TWO READERS. `namesOfParts` names these two by the title; `whereAPartIs` leaves
    // the holder off the sentence for exactly the same two, because otherwise it says the record
    // twice. If either list of roles moves without the other, this goes red.
    const root = recordRegionsOf({ kind: 'report', data: { blocks: BLOCKS }, title: TITLE, summary: null, relations: [] })
    const names = namesOfParts(root, 'report', TITLE)
    const holder = { word: 'report', title: TITLE, recordId: null }
    const said = `the report “${TITLE}”`
    const disagreed: string[] = []
    for (const one of flatten(root)) {
      const name = names.get(one.id) ?? ''
      const byTheTitle = name.endsWith(`“${TITLE}”`)
      const sentence = whereAPartIs({ name, role: one.role, regionId: null }, holder)
      const absorbed = sentence === `the whole of ${said}` || sentence === `the body of ${said}`
      if (byTheTitle !== absorbed) disagreed.push(`${one.id}: named "${name}" and said "${sentence}"`)
    }
    expect(disagreed, 'the namer and the assembly disagree about which parts ARE the record').toEqual([])
  })
})

// ============================================================ 2. no two parts read alike

/** Every part of the record the server would name, out of the same derivation the server reads. */
function namesOfThisReport(): ReadonlyMap<string, string> {
  const root = recordRegionsOf({ kind: 'report', data: { blocks: BLOCKS }, title: TITLE, summary: null, relations: [] })
  return namesOfParts(root, 'report', TITLE)
}

describe('no two parts of one record are called the same thing', () => {
  it('gives every part of a record built to be hard a name of its own', () => {
    const names = namesOfThisReport()
    const together = new Map<string, string[]>()
    for (const [id, name] of names) {
      const same = together.get(name)
      if (same === undefined) together.set(name, [id])
      else same.push(id)
    }
    const alike = [...together.entries()].filter(([, ids]) => ids.length > 1)
    expect(alike.length, `these parts read alike: ${JSON.stringify(alike)}`).toBe(0)
    expect(names.size, 'the record derived no parts, so nothing was measured').toBeGreaterThan(20)
  })

  it('says where a cell sits when its own words do not tell it from another cell', () => {
    const names = namesOfThisReport()
    const cells = [...names.entries()].filter(([id]) => /rows\[\d+\]\.cells\[0\]$/.test(id))
    expect(cells.length, 'the table derived no first-column cells').toBe(2)
    // Both hold the characters `3`. The name has to carry the row as well, and it says so in
    // words a reader can follow rather than in the stored path.
    for (const [, name] of cells) expect(name).toContain('in the row of a table')
    expect(cells[0]?.[1]).not.toBe(cells[1]?.[1])
  })

  it('numbers parts that hold no words at all and share one holder', () => {
    const names = namesOfThisReport()
    const figures = [...names.values()].filter((name) => name.endsWith('figure'))
    expect(figures.length, 'the row of figures derived no figures').toBe(3)
    expect(new Set(figures).size, 'three figures with no words read alike').toBe(3)
    expect(figures).toContain('2nd figure')
  })

  /**
   * THE STORED FORM THIS ASKS ABOUT WAS A GIST until criterion A14b of
   * design/pointing-reopened/ACCEPTANCE.md made reading length 3 the record's own `summary` column
   * on 3 September 2026. `readStoredShortForms` hands back nothing under a retired key now, so a
   * record carrying a stored gist derives no region for it and there is no name to ask about. The
   * label is the whole-record form still stored under `data.shortForms`, and the claim is the one
   * it always was.
   */
  it('does not quote a part that already carries a name somebody wrote', () => {
    // A stored short form is *the label*; a declared section is *the section “…”*. Quoting the text
    // underneath as well gives one part two names in one phrase.
    const root = recordRegionsOf({
      kind: 'report',
      data: {
        blocks: BLOCKS,
        shortForms: { label: { text: LABEL, writtenBy: 'human', madeFrom: { seq: 1, contentHash: 'x' } } },
      },
      title: TITLE,
      summary: null,
      relations: [],
    })
    const names = namesOfParts(root, 'report', TITLE)
    const label = [...names.entries()].find(([id]) => id.includes('shortForms.label'))
    expect(label?.[1], 'the stored label was not named at all').toBe('label')
  })
})

// ============================================================ 3. nothing is invented

describe('a part the record no longer holds is still said to be one', () => {
  /**
   * THIS WAS WRITTEN AT THE TITLE and is written at the label now. Criterion A14b of
   * design/pointing-reopened/ACCEPTANCE.md made reading length 2 the record's own `title` column on
   * 3 September 2026, so no title form is written and no source parts are recorded against one. The
   * sentence names whichever length it is asked about, so the only thing that changed in what is
   * expected below is that noun.
   */
  it('does not name a part that is gone as though it were there', async () => {
    await standingFor('label', 'The bench, again', ['data.blocks[#b-fig]'])
    const removed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${reportId}`,
      headers: HUMAN,
      payload: { dataPatch: { blocks: BLOCKS.filter((one) => one.id !== 'b-fig') } },
    })
    expect(removed.statusCode, removed.body).toBe(200)
    const said = await says('label')
    // THE SENTENCE COUNTS THEM RATHER THAN POINTING AT THEM. It read "This report no longer holds
    // any of them." until 1 September 2026 — *them* with nothing in front of it, because the clause
    // that named the parts is built only from the parts still there and went with them. A pronoun
    // whose antecedent was deleted is a sentence a reader cannot finish.
    expect(said, 'the sentence still points at parts it never named').not.toContain('any of them')
    expect(said).toBe('This report no longer holds the one part recorded as what this label stands for.')
    expect(said, 'a part that is gone was given a name off the record').not.toContain('row of figures')
  })
})

/**
 * THREE WORDS, WHICH IS INSIDE THE LABEL BUDGET OF TWO TO FIVE.
 *
 * IT WAS A TWENTY-NINE-WORD GIST until criterion A14b of design/pointing-reopened/ACCEPTANCE.md
 * made reading length 3 the record's own `summary` column on 3 September 2026. The label is the
 * whole-record form still written under `data.shortForms`, so it is the one this file writes, and
 * a label is a few words rather than a paragraph.
 */
const LABEL = 'Bench, round eight'

/** Kept beside the file so a reader can see the tree these names are worked out over. */
export type { Region }
