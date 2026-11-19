// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change: plan 7FEOshq3mBGG replaces ordinary empty sentences and hides machine details in normal mode.
/**
 * THE SIX SEMANTIC-FAMILY PAGES: what each of them leads with, and what each of them refuses to do.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE ARE FOR
 * ---------------------------------------------------------------------------------------
 * `#/work`, `#/structure`, `#/decisions`, `#/findings`, `#/ideas`, `#/notes` and `#/modules` were
 * one generic
 * catalogue with a filter on it. An independent audit drove the running product and found six
 * defects that were all the same defect: the page drew what every RECORD has — a state chip, a
 * kind, a title, a summary, a write stamp — instead of what that family's records actually store.
 *
 * Every test below pins one of the things that changed, and each was proved by reverting the change
 * and watching it go red. The pure readers in components/family/read.ts are called directly; the
 * pages are rendered to static markup with react-dom/server, which is what this runner can do
 * without a DOM. How it LOOKS — that the bands stack at 390 and that `--ask` reads in dark — is a
 * screenshot question and was answered that way.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NO LONGER TESTED HERE
 * ---------------------------------------------------------------------------------------
 * `#/notes` once counted the runs a second way and was tested here for it. Since 28 September 2026
 * it is the Reports page, which lists the reports and notes of every project and draws no runs at
 * all; tests/the-reports-page-lists-reports-and-notes-of-every-project.test.ts proves it on a real
 * page.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE TEST AUDIT OF 3 SEPTEMBER 2026 CHANGED
 * ---------------------------------------------------------------------------------------
 *
 * SEVEN TESTS WERE DELETED BECAUSE THE FUNCTIONS THEY TESTED ARE REACHED FROM NOWHERE. They drove
 * `readWork` and `compareWork`, which no file under `src/` calls any more. The block they were in
 * says what they were for and what is owed. Nothing a person can see lost a test.
 *
 * FOUR CASES ASSERTED AN EXACT CSS DECLARATION. Two of them are answered by rendering instead: a
 * family page's stored-word chip is compared with the one the shared component draws, attribute for
 * attribute. The other two are about how wide a box is, which is pixels, and they say so in their
 * own heading rather than reading as though a stylesheet were the screen.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { MODULE_STATES } from '../src/shared/kinds.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import type { RecordListItem, ReportsAndNotesReply } from '../src/web/api.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type Read = typeof import('../src/web/components/family/read.ts')
type Parts = typeof import('../src/web/components/family/parts.tsx')
type Ui = typeof import('../src/web/components/ui.tsx')
type Work = typeof import('../src/web/pages/family/WorkPage.tsx')
type Structure = typeof import('../src/web/pages/family/StructurePage.tsx')
type Findings = typeof import('../src/web/pages/family/FindingsPage.tsx')
type Ideas = typeof import('../src/web/pages/family/IdeasPage.tsx')
type Notes = typeof import('../src/web/pages/family/NotesPage.tsx')
type Modules = typeof import('../src/web/pages/family/ModulesPage.tsx')
// The one table that says what a kind is called on screen. The presses on #/ideas read it.
type Words = typeof import('../src/web/lib/words.ts')

let read: Read
let parts: Parts
let ui: Ui
let work: Work
let structure: Structure
let findings: Findings
let ideas: Ideas
let notes: Notes
let modules: Modules
let words: Words

beforeAll(async () => {
  // The pages reach src/web/api.ts and src/web/lib/mode.ts, both of which touch `window` at module
  // scope. This is the smallest stand-in that lets them load; nothing here is under test.
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
  words = await import('../src/web/lib/words.ts')
  read = await import('../src/web/components/family/read.ts')
  parts = await import('../src/web/components/family/parts.tsx')
  ui = await import('../src/web/components/ui.tsx')
  work = await import('../src/web/pages/family/WorkPage.tsx')
  structure = await import('../src/web/pages/family/StructurePage.tsx')
  findings = await import('../src/web/pages/family/FindingsPage.tsx')
  ideas = await import('../src/web/pages/family/IdeasPage.tsx')
  notes = await import('../src/web/pages/family/NotesPage.tsx')
  modules = await import('../src/web/pages/family/ModulesPage.tsx')
})

/** Markup with the hoisted <style> blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

let seq = 0
function record(over: Partial<RecordListItem> = {}): RecordListItem {
  seq += 1
  return {
    id: `rec-${seq}`,
    kind: 'task' as PanelRecord['kind'],
    workspaceId: 'w1',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title: `Record ${seq}`,
    summary: null,
    data: {},
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-02 09:00:00',
    deletedAt: null,
    incompleteCount: 0,
    ...over,
  }
}

const noop = () => {}

/** One page of the Reports page's reply holding these records, all filed earlier and none marked. */
function reportsReply(records: readonly RecordListItem[]): ReportsAndNotesReply {
  return {
    rows: records.map((one) => ({ ...one, group: 'earlier' as const, read: null })),
    show: 'both',
    groups: { 'needs-you': 0, 'this-week': 0, earlier: records.length },
    kinds: { report: records.filter((one) => one.kind === 'report').length, note: records.filter((one) => one.kind === 'note').length },
    matched: records.length,
    returned: records.length,
    offset: 0,
    limit: 50,
    left: 0,
  }
}
const NO_PROJECTS = { workspaces: [], current: { id: 'w1', stated: true } } as never
const NOW = Date.parse('2026-08-09T12:00:00')

// ============================================================================ work

/**
 * WHAT `#/work` DRAWS BEFORE IT HAS READ ANYTHING: its two presses, and its name said once.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS CUT FROM THIS BLOCK ON 3 SEPTEMBER 2026, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * SEVEN TESTS OF `readWork` AND `compareWork` WERE DELETED, BECAUSE NOTHING IN THE PRODUCT CALLS
 * EITHER FUNCTION. They banded a record as needing a person, told "put down on purpose" from
 * "stalled", and ordered a band by how late each row was. Every one of those was true of the page
 * `#/work` USED TO BE: one project drawn as four bands, sorted by write time until this file made
 * it sort by lateness.
 *
 * The page now reads `GET /api/work` — every piece of work in every project, each row carrying its
 * parent chain — and draws it as levels or as one flat list. `tests/work-page.test.ts` pins all of
 * that against `WorkList`. `readWork` and `compareWork` are still in
 * `src/web/components/family/read.ts` and are reached from nowhere but the tests that were here, so
 * the tests were proving that unreachable code still works.
 *
 * WHAT IS NOT LOST. `workBand`, which the deleted tests reached through `readWork`, is live:
 * `readRowDue` in WorkPage.tsx calls it, and `tests/work-page.test.ts` holds the rule those tests
 * were really about — a piece of work that is finished is not late, however long ago its date
 * passed. Nothing else the deleted tests asserted is a fact about anything a person can see.
 *
 * WHAT IS STILL OWED, and it is a product repair rather than a test one: `GET /api/work` carries no
 * due date on a row, so the lateness banding cannot run on it. Either the route carries each row's
 * date and the band comes back, or `readWork` and `compareWork` should be deleted with it.
 */
describe('#/work offers the two things to file, and says its own name once', () => {
  it('files a problem and adds a task, without asking which kind either of them is', () => {
    // "New record" on all six pages opened a sixteen-option select defaulting to `module`, so
    // filing a task from here began with knowing that a task is a record.
    const html = body(h(work.WorkPage, { onFiled: noop }))
    expect(html).toContain('File a problem')
    expect(html).toContain('Add a task')
    expect(html).not.toContain('New record')
  })

  it('does not print the page heading twice', () => {
    // <h1>Work</h1> and, three centimetres below it, a panel headed "Work · 53 RECORDS".
    const html = body(h(work.WorkPage, { onFiled: noop }))
    expect((html.match(/>Work to do</g) ?? []).length).toBe(1)
  })
})

// ============================================================================ structure

/**
 * THE DEFECT: `#/structure` WAS THREE-QUARTERS PIPELINE STEPS.
 *
 * 61 of the 81 rows in `robotics` were `block` records — a step already drawn inside its pipeline,
 * in order, with what it waits on, on a page built for exactly that. A block is never a row here.
 */
describe('#/structure is modules and pipelines, and never a pipeline step', () => {
  const pipeline = () =>
    record({ id: 'p1', kind: 'pipeline' as PanelRecord['kind'], title: 'Transplant v2', data: { blockIds: ['b1', 'b2', 'b3'] } })
  const block = (id: string, name: string, state: string) =>
    record({ id, kind: 'block' as PanelRecord['kind'], title: `Transplant v2 › ${name}`, data: { state } })

  it('draws no block row, and says where the steps went', () => {
    const html = body(
      h(structure.StructurePage, {
        records: [pipeline(), block('b1', 'Plan the approach', 'done'), block('b2', 'Grasp', 'blocked'), block('b3', 'Release', 'todo')],
        links: [],
        onFiled: noop,
      }),
    )
    expect(html).not.toContain('Plan the approach')
    // Not silently: the count of steps not listed is on the page, with the reason.
    expect(html).toContain('href="#/pipeline"')
  })

  it('counts the steps done and names the one the work is standing on, by its own name', () => {
    const reading = read.readPipeline(
      pipeline(),
      new Map([
        ['b1', block('b1', 'Plan the approach', 'done')],
        ['b2', block('b2', 'Grasp', 'blocked')],
        ['b3', block('b3', 'Release', 'todo')],
      ]),
    )
    expect(reading.done).toBe(1)
    expect(reading.steps).toBe(3)
    // The block's OWN name: its stored title is qualified by the pipeline, and printing the whole
    // thing on a row under that pipeline's name says the pipeline twice.
    expect(reading.standing?.name).toBe('Grasp')
    expect(reading.standing?.at).toBe(2)
    expect(reading.standing?.state).toBe('blocked')
  })

  it('counts EVERY stopped step, not only the one the order has reached', () => {
    // The rail counts what needs a person in each family and that count includes blocks. A page
    // with no block row that named only the first not-done step would leave the other two blocked
    // steps unreachable from the very count that sent the reader there.
    const reading = read.readPipeline(
      record({ id: 'p2', kind: 'pipeline' as PanelRecord['kind'], title: 'Transplant v2', data: { blockIds: ['b1', 'b2', 'b3'] } }),
      new Map([
        ['b1', block('b1', 'Plan the approach', 'blocked')],
        ['b2', block('b2', 'Grasp', 'failed')],
        ['b3', block('b3', 'Release', 'todo')],
      ]),
    )
    expect(reading.stopped).toBe(2)
    // `todo` has not stopped — nothing started — and counting it would make the number meaningless.
    expect(read.readPipeline(pipeline(), new Map([['b1', block('b1', 'Plan the approach', 'todo')]])).stopped).toBe(0)
  })

  it('never drops a missing block from the denominator, because the count would then be a lie', () => {
    const reading = read.readPipeline(pipeline(), new Map([['b1', block('b1', 'Plan the approach', 'done')]]))
    expect(reading.steps).toBe(3)
    expect(reading.missing).toBe(2)
  })

  it('counts a module’s checklist from its own parts, and an empty one as an answer', () => {
    const withItems = record({
      kind: 'module' as PanelRecord['kind'],
      data: { parts: [{ name: 'Mount', items: [{ text: 'a', state: 'done' }, { text: 'b', state: 'todo' }] }] },
    })
    expect(read.readModule(withItems, new Map()).checked).toBe(1)
    expect(read.readModule(withItems, new Map()).items).toBe(2)

    const html = body(h(structure.StructurePage, { records: [record({ kind: 'module' as PanelRecord['kind'], data: { parts: [] } })], links: [], onFiled: noop }))
    // NOT "0 / 0 checked". Sending `parts: []` is what kinds.ts asks for when there is nothing on
    // the list yet, and it counts as complete rather than as no progress.
    expect(html).toContain('class="px-absent"')
  })

  it('tells "no problem is linked to it" apart from "every linked problem is closed"', () => {
    // In `robotics` no problem is linked to any module at all, and printing "0 open problems" on
    // twelve rows there would read as twelve healthy subsystems.
    const module = record({ id: 'm1', kind: 'module' as PanelRecord['kind'] })
    const open = record({ id: 'x1', kind: 'problem' as PanelRecord['kind'], data: { state: 'open' } })
    const fixed = record({ id: 'x2', kind: 'problem' as PanelRecord['kind'], data: { state: 'fixed' } })

    // SAID ONCE WHEN IT IS TRUE OF EVERY MODULE, not once per row. In `robotics` that is all
    // twelve of them, and twelve identical tags is the common case repeated until it stops being
    // read — the failure that took the AUTHORED chip off every list in this product.
    const none = body(h(structure.StructurePage, { records: [module], links: [], onFiled: noop }))
    expect(none).toContain('class="px-absent"')
    expect(none).not.toContain('no problem is linked to it')

    const closed = body(
      h(structure.StructurePage, { records: [module, fixed], links: [{ fromId: 'm1', toId: 'x2' }], onFiled: noop }),
    )
    expect(closed).toContain('all 1 closed')

    const live = body(
      h(structure.StructurePage, {
        records: [module, open, fixed],
        links: [
          { fromId: 'm1', toId: 'x1' },
          { fromId: 'x2', toId: 'm1' },
        ],
        onFiled: noop,
      }),
    )
    expect(live).toContain('1 open of 2')
  })

  it('counts a problem once however many links join it to the module', () => {
    const counts = read.linkedProblemCounts(
      [record({ id: 'm1', kind: 'module' as PanelRecord['kind'] }), record({ id: 'x1', kind: 'problem' as PanelRecord['kind'], data: { state: 'open' } })],
      [
        { fromId: 'm1', toId: 'x1' },
        { fromId: 'x1', toId: 'm1' },
        { fromId: 'm1', toId: 'x1' },
      ],
    )
    expect(counts.get('m1')).toEqual({ open: 1, linked: 1 })
  })

  it('puts the COUNTED answer in the fixed left column, never a word no row has', () => {
    // The audit's fourth finding, measured: all twelve modules in `robotics` and all fifteen in
    // `panelx` carry no lifecycle word, so a column drawn from that field said NO STATE WRITTEN on
    // every row of both pages and could never tell one from another. The checklist can.
    const withItems = record({
      kind: 'module' as PanelRecord['kind'],
      data: { parts: [{ name: 'Mount', items: [{ text: 'a', state: 'done' }, { text: 'b', state: 'todo' }] }] },
    })
    const html = body(h(structure.StructurePage, { records: [withItems], links: [], onFiled: noop }))
    expect(html).toContain('1 / 2')
    expect(html).toContain('checked')
    // And the fact that no module has one is said ONCE, above the rows, rather than per row.
    // IT NO LONGER LISTS THE FOUR STORED WORDS. That was finding 30 of the language audit,
    // 19 August 2026: the stored union spelt out in the first sentence on the page, about something
    // nobody has to act on. One clause, not a menu of stored words.
    expect(html).toContain('class="px-absent"')
    expect(html).not.toContain('active, paused, stable or retired')
    expect(html).not.toContain('posture')
    expect(html).not.toContain('no state')
  })

  it('draws a module’s description as prose, not as a fact labelled "what it is"', () => {
    // Fifteen rows in `panelx` printed those three words down the left to introduce a sentence that
    // is plainly a description of the thing named on the line above it. A label earns its place
    // when it says which of several questions a clause answers; on this row there is only one.
    const html = body(
      h(structure.StructurePage, {
        records: [record({ kind: 'module' as PanelRecord['kind'], summary: 'the wrist camera and its mount' })],
        links: [],
        onFiled: noop,
      }),
    )
    expect(html).toContain('the wrist camera and its mount')
    expect(html).toContain('fam-body')
    expect(html).not.toContain('what it is')
  })

  it('sends a pipeline row into the pipeline page rather than into its record', () => {
    const html = body(h(structure.StructurePage, { records: [pipeline()], links: [], onFiled: noop }))
    expect(html).toContain('href="#/pipeline/p1"')
  })
})

// ============================================================================ what we believe

/**
 * `#/decisions` HAS NO FAMILY PAGE, AND THAT IS SETTLED RATHER THAN MISSING.
 *
 * There were two pages claiming that address: a family page listing one project's proposals and
 * decisions, and `src/web/pages/DecisionsPage.tsx`, which lists every decision in every project.
 * The router reads FLAT_ROUTES before family keys, so the family page was already unreachable.
 *
 * It is settled in favour of the cross-project page, because a person asks "what did I decide" and
 * not "what did this project decide" — settling a choice is refused to every agent, so a decision
 * belongs to a person. The family page is deleted; the `decisions` FAMILY stays, because it is what
 * files a proposal and a decision under one heading on the facet bar and what keeps `familyOf`
 * total. The tests for the surviving page are in tests/home-bands.test.ts, which is where the
 * components it draws are tested.
 */
describe('the decisions family is a grouping and not a place', () => {
  it('keeps the family, its label and its two kinds, none of which needed a page', async () => {
    const work = (await import('../src/shared/work.ts')) as typeof import('../src/shared/work.ts')
    expect([...work.KIND_FAMILIES.decisions.kinds]).toEqual(['proposal', 'decision'])
    expect(work.KIND_FAMILIES.decisions.label).toBe('Decisions')
    // `familyOf` answers for the kinds that have a family. It is not total: criterion E1 took
    // `message` out of `notes`, and `message` is read on its own page rather than grouped.
    expect(work.familyOf('proposal')).toBe('decisions')
    expect(work.familyOf('decision')).toBe('decisions')
  })

  it('is not one of the surfaces the family shell can draw', async () => {
    // The shell's `Body` switch is exhaustive over the families that have pages. If somebody adds
    // `decisions` back to it without adding a page, this fails rather than drawing a blank.
    const shell = (await import('../src/web/pages/family/FamilyPage.tsx')) as typeof import('../src/web/pages/family/FamilyPage.tsx')
    expect(shell.hasFamilyPage('decisions')).toBe(false)
    for (const other of ['work', 'structure', 'findings', 'ideas', 'notes'] as const) {
      expect(shell.hasFamilyPage(other), `${other} lost its page`).toBe(true)
    }
  })
})

// ============================================================================ what the notes list may hold

// ============================================================================ findings

/**
 * THE SECOND HALF OF THE PAGE THAT WAS `#/belief`. A measurement waits on nobody, so nothing on
 * this page carries `--ask`; the assertion for that is in the decisions block above, which renders a
 * claim beside a question and counts the marks.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE HERE IS THE SAME ONE. WHERE IT IS KEPT MOVED, ON 16 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * The rule this block has always guarded is at the top of this file: a family page draws what THAT
 * FAMILY'S records store, never the five things every record has — a state chip, a kind, a title, a
 * summary and a write stamp. The old assertion pinned it by finding a claim's `method`, `numbers`
 * and `measured_on` on the list row.
 *
 * Round five took the stored prose off the list rows: the owner used the page and asked for a clear
 * title, small state where it helps, a warning only where somebody must act, and more whitespace.
 * **Lists locate; detail pages explain** is in docs/UX-CONTRACT.md and applies to every list.
 *
 * SO THE RULE IS SATISFIED A DIFFERENT WAY, AND IT IS STILL SATISFIED — this was checked before the
 * test was touched. A claim row is drawn from the claim kind's own `state`, in the claim's own
 * vocabulary: `proposed` reads "not measured", which it means on no other kind. A direction row is
 * not given a claim's word at all — it is drawn from `depth`, which asks how far a line of
 * exploration has been taken, and from `blocked_on`, which is the one warning either kind carries.
 * Neither row is built from the summary. Two kinds, two different readings, from their own fields.
 *
 * AND NOTHING WAS DELETED. `numbers`, `measured_on`, `confidence` and `method` are drawn by the
 * record's own page, which is one press from the row — the second test below is that half, and
 * tests/record-tiers.test.ts owns how that page lays them out. tests/findings-list.test.ts owns the
 * counting of what a row draws.
 */
describe('#/findings gives a measurement the words its own kind uses', () => {
  const CLAIM_SUMMARY = 'The chest camera is accurate enough in depth for the handover reach.'
  const DIRECTION_SUMMARY = 'How much of a working week Mole Office can answer for on its own.'

  const claim = () =>
    record({
      kind: 'claim' as PanelRecord['kind'],
      title: 'Depth error on the chest camera is under 6mm at one metre',
      summary: CLAIM_SUMMARY,
      data: {
        // NOT `measured`, so the shown word and the stored word differ and the test can tell the
        // claim's own vocabulary from a word repeated off the record.
        state: 'proposed',
        method: 'a checkerboard sweep',
        // A NAMED MAP, which is what the kind declares. Read with `textField` this came back null
        // for every claim in the corpus — an object is not a string — so twelve of the seventeen
        // claims in `panelx` had no numbers drawn anywhere and nothing said so. `Figures` on the
        // record page is what draws them now, and the test below is that they arrive there.
        numbers: { sigma_z_mm: 5.8, trials: 240 },
        measured_on: 'the chest camera, 2026-07-30',
      },
    })

  const direction = (over: Record<string, unknown> = {}) =>
    record({
      kind: 'direction' as PanelRecord['kind'],
      title: 'Can a cold agent run the week off Mole Office alone',
      summary: DIRECTION_SUMMARY,
      data: { depth: 'measured', ...over },
    })

  it('reads a claim by its state and a direction by its depth, and neither by its summary', async () => {
    const html = body(h(findings.FindingsPage, { records: [claim(), direction()], onFiled: noop }))

    // THE CLAIM'S OWN WORD, IN THE CLAIM'S OWN VOCABULARY. `proposed` reads "not measured" on a
    // claim and means that on no other kind.
    expect(html, 'the claim row lost the word its own kind uses').toContain('not measured')
    expect(html, 'the claim row draws no stored state at all').toContain('px-chip-stored')
    // Developer mode keeps the stored word beside its reading.
    const { setMode } = await import('../src/web/lib/mode.ts')
    let developerHtml: string
    setMode('inspect')
    try {
      developerHtml = body(h(findings.FindingsPage, { records: [claim(), direction()], onFiled: noop }))
    } finally {
      setMode('normal')
    }
    expect(developerHtml, 'the word on screen no longer says what is stored behind it').toContain(
      'The stored state word is &quot;proposed&quot;',
    )

    // A DIRECTION IS NOT GIVEN A CLAIM'S WORD. Its own field is `depth`, and how far a line of
    // exploration has been taken is a different question from whether a claim was measured.
    expect(html, 'the direction row is not drawn from its own depth').toContain(
      'How far this line of exploration has been taken',
    )

    // NEITHER ROW IS BUILT FROM WHAT EVERY RECORD HAS. The summary is exactly the field the generic
    // catalogue printed on every row of every family, and it is the half of the old assertion that
    // got stricter this round rather than looser.
    expect(html, 'a claim row is drawn from its summary again').not.toContain(CLAIM_SUMMARY)
    expect(html, 'a direction row is drawn from its summary again').not.toContain(DIRECTION_SUMMARY)
  })

  it('warns from the direction’s own `blocked_on`, and says nothing where nobody is blocked', () => {
    // The one warning either kind carries, and it is a field only a direction has. A warning on
    // every row would mark nothing.
    const blocked = body(
      h(findings.FindingsPage, {
        records: [direction({ blocked_on: 'the source index has never been built in this workspace' })],
        onFiled: noop,
      }),
    )
    expect(blocked).toContain('Blocked')
    expect(blocked, 'the warning dragged the whole stored reason onto the row with it').not.toContain(
      'the source index has never been built',
    )
    expect(body(h(findings.FindingsPage, { records: [direction()], onFiled: noop }))).not.toContain('Blocked')
  })

  it('leaves the claim’s stored measurements to the record’s own page, which draws every one', async () => {
    // THE OTHER HALF OF "LISTS LOCATE, DETAIL PAGES EXPLAIN", and the half that makes taking them
    // off the row honest rather than a deletion. They are not on the list —
    const html = body(h(findings.FindingsPage, { records: [claim()], onFiled: noop }))
    for (const value of ['a checkerboard sweep', 'sigma_z_mm 5.8', 'trials 240', 'the chest camera, 2026-07-30']) {
      expect(html, `the list draws "${value}" again, which is a field that informs and does not identify`).not.toContain(
        value,
      )
    }

    // — and the record's own page is where each one is drawn, read from that page's own
    // declaration rather than from a sentence in a comment here. `numbers` and `measured_on` are
    // answered by its headline; `method` is a body section. tests/record-tiers.test.ts owns how
    // that page lays them out, and tests/sections.test.ts proves `IN_HEADLINE` names no key its
    // kind does not declare.
    const page = (await import('../src/web/pages/RecordPage.tsx')) as typeof import('../src/web/pages/RecordPage.tsx')
    const { IN_HEADLINE } = await import('../src/shared/sections.ts')
    expect(IN_HEADLINE.claim, 'the record page stopped answering a claim’s figures').toContain('numbers')
    expect(IN_HEADLINE.claim).toContain('measured_on')
    expect(IN_HEADLINE.claim).toContain('confidence')
    const sections = page.bodySections({
      id: 'rec-x',
      workspaceId: 'w1',
      kind: 'claim' as PanelRecord['kind'],
      ownerId: THE_TEST_OFFICES_OWNER.id,
      title: 'Depth error on the chest camera is under 6mm at one metre',
      summary: CLAIM_SUMMARY,
      data: { state: 'proposed', method: 'a checkerboard sweep', numbers: { sigma_z_mm: 5.8 } },
      createdAt: '2026-08-01 09:00:00',
      updatedAt: '2026-08-02 09:00:00',
      deletedAt: null,
    } as unknown as PanelRecord)
    expect(
      sections.map((s) => s.key),
      'the record page stopped drawing how a claim was measured',
    ).toContain('method')
  })
})

// ============================================================================ ideas

describe('#/ideas is a reading list: newest first, and one keystroke to file', () => {
  it('opens a single title field, and never a kind select', () => {
    const html = body(h(ideas.IdeasPage, { records: [], onFiled: noop }))
    expect(html).toContain('Add an idea')
    expect(html).not.toContain('New record')
  })

  it('has one press, "Add an idea", and no second press beside it', () => {
    // CRITERION CHANGE, wave 13j round 11. The two presses "Add an idea" and "Add something worth a
    // try" stood side by side, and a page has one primary press (rule R5 of report n9Mjk3c_sJRu). The
    // family lists' design, block b-17, was decided in a decision. A thing worth a try
    // is filed on All records, and its rows keep their own list here.
    const html = body(h(ideas.IdeasPage, { records: [], onFiled: noop }))
    expect(html).toContain('Add an idea')
    expect(html, 'the second press is back').not.toContain(`Add something ${words.kindWord('wanna_try').text}`)
    expect((html.match(/class="px-btn"/g) ?? []).length, 'the head holds more than one press').toBe(1)
  })

  it('reads a parked idea’s reason out of `parked_because`, where the kind keeps it', () => {
    // An idea does not carry the `paused` block, because that block requires the date it was put
    // down and an idea that was never picked up has no such date. A reader looking only at `paused`
    // reports "no reason was ever written" over a record that has one.
    const idea = record({
      kind: 'idea' as PanelRecord['kind'],
      data: { state: 'parked', parked_because: 'PETG has not arrived', would_need: ['a second ZED'] },
    })
    const reading = read.readMaybe(idea)
    expect(reading.band).toBe('parked')
    expect(reading.parkedBecause).toBe('PETG has not arrived')

    const html = body(h(ideas.IdeasPage, { records: [idea], onFiled: noop }))
    expect(html).toContain('PETG has not arrived')
    expect(html).toContain('a second ZED')
  })

  it('orders newest first, because nothing here is owed to anybody', () => {
    const html = body(
      h(ideas.IdeasPage, {
        records: [
          record({ kind: 'idea' as PanelRecord['kind'], title: 'older idea', createdAt: '2026-07-01 09:00:00', data: { state: 'new' } }),
          record({ kind: 'idea' as PanelRecord['kind'], title: 'newer idea', createdAt: '2026-08-08 09:00:00', data: { state: 'new' } }),
        ],
        onFiled: noop,
      }),
    )
    expect(html.indexOf('newer idea')).toBeLessThan(html.indexOf('older idea'))
  })

  it('bands a dropped idea away from a live one instead of leaving both in one list', () => {
    expect(read.readMaybe(record({ kind: 'idea' as PanelRecord['kind'], data: { state: 'dropped' } })).band).toBe('dropped')
    expect(read.readMaybe(record({ kind: 'idea' as PanelRecord['kind'], data: { state: 'active' } })).band).toBe('live')
    expect(read.readMaybe(record({ kind: 'wanna_try' as PanelRecord['kind'] })).band).toBe('want-to-try')
  })
})

// ============================================================================ notes and messages

/**
 * CRITERION CHANGE, 28 September 2026. The tests of `#/notes` that stood here are gone with what they
 * tested. The page no longer draws a line about the runs, is no longer handed one project's records,
 * and lists only reports and notes of every project, read from GET /api/records/reports-and-notes.
 * This answers question 9 of report n9Mjk3c_sJRu. What the page holds now is
 * proved by
 * tests/the-reports-page-lists-reports-and-notes-of-every-project.test.ts, on a real page. The reader
 * of when writing happened (`readHappened` and its bands) had no other caller, so it is deleted and
 * its tests with it.
 */

describe('the Reports page says why its list is empty in words true for the choice', () => {
  // THE COUNT IS OVER EVERY PROJECT AND ONLY OVER THE CHOSEN KINDS, so an empty list of notes says
  // that no project has a note, and never that no project has a report or a note.
  const empty = (show: 'both' | 'reports' | 'notes') =>
    body(h(notes.ReportsList, { reply: { ...reportsReply([]), show }, projects: NO_PROJECTS, onShow: noop, onGo: noop, onFiled: noop }))

  it('names the kind that is missing, and only that kind', () => {
    expect(empty('notes')).toContain('No project has a note yet.')
    expect(empty('reports')).toContain('No project has a report yet.')
    expect(empty('both')).toContain('No project has a report or a note yet.')
    expect(empty('notes')).not.toContain('a report or a note')
  })
})

// ============================================================================ modules

/**
 * THE DEFECT: `#/modules` MADE FOUR CLAIMS ABOUT ITSELF AND THEY DISAGREED.
 *
 * The h1 said "Modules", the panel said "Structure", and the tally said
 * `pipeline · none recorded / block · none recorded` — false, two pipelines exist, they were simply
 * never fetched.
 *
 * AND THE OWNER'S OWN FINDING, which is what the last three tests here are for: *"why is there a
 * 'Nobody has said ...' session — firstly there are a lot of line breaks, second it is kind of
 * nonsense what this is for users."* Every module in both live projects is in that one group, so
 * the page's only grouping was a group holding everything under a heading that apologises.
 */
describe('#/modules groups only when the groups separate something', () => {
  const module = (over: Record<string, unknown> = {}) =>
    record({ kind: 'module' as PanelRecord['kind'], data: over })

  it('makes no claim about a kind it did not fetch, and calls itself one thing', () => {
    const html = body(h(modules.ModulesPage, { records: [module()], links: [], onFiled: noop }))
    // The tally said `pipeline · none recorded / block · none recorded` on a page that had asked
    // the server for modules alone. Two pipelines existed.
    expect(html).not.toContain('none recorded')
    // And the panel under the h1 said "Structure" while the h1 said "Modules".
    expect(html).not.toMatch(/<h2[^>]*>Structure</)
    expect((html.match(/>Modules</g) ?? []).length).toBe(1)
  })

  it('draws ONE list and no group headings when nobody has marked any module', () => {
    // THIS IS THE OWNER'S FINDING, PINNED. Both live projects are this case: fifteen of fifteen and
    // twelve of twelve. Reverting the change puts every row back under "No state marked".
    const html = body(h(modules.ModulesPage, { records: [module(), module()], links: [], onFiled: noop }))
    expect(html).toContain('Every module')
    expect(html).not.toContain(englishWords()['g7a.modules.unsaid'])
    // The FACT survives the group. It is said once, in the count line — USER.md invariant 5:
    // absence is a real answer and is never dropped. It no longer lists the four stored words; see
    // finding 30.
    expect(html).toContain('class="px-absent"')
    expect(html).not.toContain('active, paused, stable or retired')
    // And nothing on the screen calls it a "posture", which is our word and not a reader's.
    expect(html).not.toContain('posture')
  })

  it('draws one list when every module carries the SAME word, for the same reason', () => {
    // A grouping that never separates anything is not a grouping, whichever group it is.
    const html = body(
      h(modules.ModulesPage, { records: [module({ state: 'active' }), module({ state: 'active' })], links: [], onFiled: noop }),
    )
    // CRITERION CHANGE, wave 13j round 11: the count sentence under the head is gone (report
    // n9Mjk3c_sJRu block b-17), so the one group's own heading says what every module is marked.
    expect(html).toMatch(/<h2[^>]*><span>Being worked on</)
    expect(html).not.toContain('Every module')
    expect(html).not.toContain('somebody is working on every one of them')
  })

  it('brings the groups back the moment two of them hold rows', () => {
    const html = body(
      h(modules.ModulesPage, { records: [module(), module(), module({ state: 'active' })], links: [], onFiled: noop }),
    )
    expect(html).toContain('Being worked on')
    expect(html).toContain(englishWords()['g7a.modules.unsaid'])
    expect(html).not.toContain('Every module')
    expect(html).toContain('class="px-absent"')
    expect(html).not.toContain('active, paused, stable or retired')
  })

  it('names each of the four declared words with a heading of its own', () => {
    for (const word of MODULE_STATES) {
      // A second module with no word, so more than one group holds rows and the headings are drawn.
      const html = body(h(modules.ModulesPage, { records: [module({ state: word }), module()], links: [], onFiled: noop }))
      expect(html, word).toContain(word === 'active' ? 'Being worked on' : word === 'paused' ? 'Put down on purpose' : word === 'stable' ? 'Good enough for now' : 'Out of use')
    }
  })

  it('keeps a stored word that is not one of the four OUT of "nobody has said"', () => {
    // Two different facts. A module marked with an unrecognised word has something stored that
    // nothing can honour, which is a repair job; a module marked with none has simply never been
    // marked. Folding the first into the second hides a stored value behind a sentence that is
    // untrue of it.
    const html = body(
      h(modules.ModulesPage, { records: [module({ state: 'mothballed' }), module()], links: [], onFiled: noop }),
    )
    expect(html).toContain('Marked with a word Mole Office does not know')
    expect(html).toContain('mothballed')
    // CRITERION CHANGE, wave 13j round 11: the group's hint is gone with the folds on the rows
    // (report n9Mjk3c_sJRu block b-17). Each row of the group says the word it is marked with.
    expect(html).toContain('marked “mothballed”')
    expect(html).not.toContain('px-hint-mark')
  })

  it('spends no hint on a group whose heading already says what it holds', () => {
    // Deletion is the first answer and the Hint is the exception. A page that grew a second one
    // would be answering bad headings with prose, which is the failed fix the contract names.
    const html = body(
      h(modules.ModulesPage, { records: [module({ state: 'active' }), module()], links: [], onFiled: noop }),
    )
    expect((html.match(/px-hint-mark/g) ?? []).length).toBe(0)
  })
})

// ============================================================================ across every one

/**
 * WHAT EVERY FAMILY PAGE OWES ITS READER, checked on all seven rather than on the one being edited.
 */
describe('every family page keeps the two marks a row may never fold away', () => {
  const fixture = () => record({ origin: 'fixture', incompleteCount: 2 })

  /**
   * `#/work` IS NOT IN THIS LIST ANY MORE, AND ITS ABSENCE IS ITSELF TESTED.
   *
   * The page now reads `GET /api/work` — every project at once — and that reply carries neither
   * `origin` nor `incompleteCount`. So the page CANNOT mark a made-up example or count unfilled
   * fields, and drawing rows that looked as though it had checked would be exactly the failure the
   * mark exists to prevent. It says so on the screen instead, and
   * tests/work-page.test.ts pins that sentence. The repair is on the route: `WorkRow` in
   * src/server/lib/worklist.ts has to carry both fields.
   */
  const pages: [string, () => string][] = [
    ['structure',() => body(h(structure.StructurePage, { records: [{ ...fixture(), kind: 'module' as PanelRecord['kind'] }], links: [], onFiled: noop }))],
    ['findings', () => body(h(findings.FindingsPage, { records: [{ ...fixture(), kind: 'claim' as PanelRecord['kind'], data: { state: 'measured' } }], onFiled: noop }))],
    ['ideas', () => body(h(ideas.IdeasPage, { records: [{ ...fixture(), kind: 'idea' as PanelRecord['kind'], data: { state: 'new' } }], onFiled: noop }))],
    ['notes', () => body(h(notes.ReportsList, { reply: reportsReply([{ ...fixture(), kind: 'note' as PanelRecord['kind'] }]), projects: NO_PROJECTS, onShow: noop, onGo: noop, onFiled: noop }))],
    ['modules', () => body(h(modules.ModulesPage, { records: [{ ...fixture(), kind: 'module' as PanelRecord['kind'] }], links: [], onFiled: noop }))],
  ]

  it.each(pages)('%s marks generated content and counts the unfilled fields', (_name, render) => {
    const html = render()
    // USER.md invariant 3: a placeholder is labelled, prominently, in the place it appears. 290 of the
    // 385 records in this workspace are generated fixture content.
    expect(html).toContain('data-origin="fixture"')
    // And how much of the record is not filled in, with the count the server sent.
    expect(html).toContain('px-inc-mark')
  })

  /**
   * THE OWNER'S RULE, APPLIED TO ALL SIX AT ONCE: *"These description or explanation of UIs are
   * literally not needed if we design our UI or UX good. Review panelx project for such
   * descriptions, we could either just remove them or add a small round '?' sign."*
   *
   * Every page but one now carries no lede at all. The exception is `#/ideas`, and what it carries
   * is a signpost to another page rather than an explanation of a concept — a cold reviewer asked
   * to find "future ideas and directions" opened that page, found no direction, and abandoned the
   * task, because directions are filed under Findings.
   */
  it.each(pages)('%s says its own name once and does not explain itself underneath', (name, render) => {
    const html = render()
    expect(html.includes('fam-lede'), `${name} carries a lede`).toBe(name === 'ideas')
  })
})

// ============================================================================ the shared drawing

/**
 * THE THREE TREATMENTS A STATE WORD GETS, and the one thing that must be true of all of them.
 *
 * The owner: *"06 need color design for things like open, blocked, fixture"*. On #/work in the
 * robotics project, "open", "blocked" and "todo" were three outlined boxes of one size, one ink and
 * one edge. Weight separates them now, because docs/UX-CONTRACT.md forbids a hue on `open` by
 * name and there is no fifth colour to spend.
 */
describe('a state word is drawn by what the reader should do about it', () => {
  /** Comments removed: one of them names every family, and would match every lookup below. */
  const bare = (sheet: string) => sheet.replace(/\/\*[\s\S]*?\*\//g, '')

  /**
   * The stored-word chip a page drew, as everything that decides how it is drawn and what it says.
   *
   * The tooltip is kept in: it is where the stored word is written out for a reader, and a page
   * that drew the right colours under the wrong sentence would still be answering differently.
   */
  const chipOn = (html: string): string => {
    const found = /<span class="px-chip px-chip-stored"([^>]*)>/.exec(html)
    if (found === null) throw new Error('that page drew no stored state word at all')
    return (found[1] ?? '').trim()
  }

  /**
   * ONE STORED WORD, ONE DRAWING, AND A FAMILY PAGE HOLDS NO OPINION ABOUT IT.
   *
   * SCOPING THE TREATMENTS TO SIX PAGES WAS THE DEFECT. A word stored on a record is a fact about
   * the record, not an opinion of the page it is drawn on. Measured in Chromium in `light` before
   * the move, "open" was white on a filled rgb(22,24,28) block on a family page, ink rgb(69,75,85)
   * on Home, and ink rgb(22,24,28) on #/records — one stored fact, three drawings.
   *
   * THIS USED TO ASSERT THE ABSENCE OF ONE STRING IN ONE SHEET AND THE PRESENCE OF ONE SELECTOR IN
   * ANOTHER. Both went red on a rename and neither said anything about what got drawn. What is
   * checked now is what a family page draws: the chip it puts on a row, attribute for attribute,
   * against the chip the shared component draws for the same record. Everything a browser paints it
   * from is in those attributes, and a page writing its own tag — which is what `#/notes` did, a
   * plain grey pill reading "note" — cannot produce them.
   */
  it('draws a stored word with the shared chip, and adds nothing of its own to it', () => {
    const dropped = record({ kind: 'idea' as PanelRecord['kind'], data: { state: 'dropped' } })
    const onFamily = chipOn(body(h(ideas.IdeasPage, { records: [dropped], onFiled: noop })))
    // The same record through the one component that draws a stored word, read through the one
    // reader that says what the word means. Neither is a second opinion written here.
    const shared = chipOn(
      renderToStaticMarkup(
        h(ui.StoredState, { state: 'dropped', progress: read.stateOf(dropped).progress, kind: 'idea' }),
      ),
    )
    expect(onFamily, 'a family page draws a stored word its own way').toBe(shared)
  })

  it('keeps one copy of that drawing, in the sheet every page reads', () => {
    // The same fact worked out in two places is this repository's recurring defect: a second ladder
    // written back into the family sheet would keep every test in ui.tsx passing while these six
    // pages quietly drew something else. This is the check that there is one copy, and it can only
    // be made against the sheets themselves — there is no second drawing to render and compare.
    expect(bare(parts.FAMILY_CSS), 'the family sheet draws the stored word a second time').not.toContain(
      'px-chip-stored',
    )
  })

  it('reaches these six pages without them declaring anything, which is the point of moving it', () => {
    // A ladder gated on `data-px-emphasis` would miss a page that declares none, and one scoped to
    // `.fam` would miss Home. Being gated on neither is what makes every page agree, and that is a
    // fact about the selectors themselves rather than about any one page's markup.
    const ladder = [...bare(ui.UI_CSS).matchAll(/([^{}]+)\{[^{}]*\}/g)]
      .map((m) => (m[1] ?? '').trim())
      .filter((s) => s.includes('.px-chip-stored[data-drawing='))
    expect(ladder.length, 'no stored word rules at all').toBeGreaterThanOrEqual(6)
    for (const selector of ladder) {
      expect(selector, 'the stored word ladder is gated, so it cannot reach a family page').not.toContain(
        'data-px-emphasis',
      )
      expect(selector, 'the stored word ladder is scoped back to the family pages').not.toContain('.fam')
    }
  })
})

// ============================================================================ the caps that broke

/**
 * *"firstly there are a lot of line breaks"* — said about `#/modules`, and true of every caption on
 * every one of these pages. `--measure` is a reading measure for a paragraph; a one-line count of
 * what is on screen is not a paragraph, and 88ch at 14px is 688px inside a 1146px panel.
 */
/**
 * The one round `?` in the six pages, and the defect opening it caused.
 *
 * `Hint` is new and a family page is its first caller. Its body is absolutely positioned at
 * `left: 0` with `width: max-content`, and the mark sits at the RIGHT edge of a panel header —
 * measured in Chromium, opening one took the document from 1440px to 1780px and from 390px to
 * 728px. Nothing in this product may scroll the body sideways.
 */
/**
 * THE TWO BLOCKS BELOW ARE STYLESHEET FACTS, AND THEY SAY SO.
 *
 * How wide an opened hint is, and how wide a line of prose reads, are pixels. Nothing in this
 * repository opens a family page in a browser, so a check here is the only thing standing between
 * the product and either regression, and deleting them would leave both rules unguarded.
 *
 * WHAT THE AUDIT OF 3 SEPTEMBER 2026 CHANGED. Each of them pinned an exact declaration —
 * `max-width: min(24rem, calc(100vw…`, and the word `max-width` — so a different but correct value
 * would have been reported as a failure. They ask the question the rule is about now: is the box
 * anchored on the side that keeps it inside the page, and is its cap measured against the screen or
 * against something 16 pixels wide.
 *
 * `tests/nothing-scrolls-in-silence-at-1440.test.ts` is the shape a replacement takes: it opens the
 * real page and measures `scrollWidth` against `clientWidth`. Extending it to open a hint is owed.
 */
describe('opening the question mark does not push the page sideways', () => {
  it('opens leftward and caps its width against the viewport, not against its own anchor', () => {
    // READ THE SHEET THE FIX IS IN. This first checked the FAMILY sheet, for a
    // `.px-panel-actions .px-hint-body` override — because a family page was where the overflow was
    // measured. The fix went into the base rule in UI_CSS instead, and the override was dropped: a
    // hint opening rightward is wrong everywhere Hint is used, so a family-only correction would
    // have left every other caller broken AND put one fact in two sheets that can disagree. So the
    // test follows the fix rather than pinning the place it was first seen.
    const sheet = ui.UI_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => (m[1] ?? '').trim() === '.px-hint-body')
    expect(rule, 'the correction is not in the sheet').toBeDefined()
    const body = (rule?.[2] ?? '').replace(/\s+/g, ' ')
    // ANCHORED ON THE RIGHT, so it grows into the page rather than off the edge of it.
    expect(body, 'the hint is not anchored on the side that keeps it inside the page').toMatch(/right:\s*0/)
    expect(body, 'the hint is still anchored on its left as well, so it opens rightward').toContain('left: auto')
    // AND CAPPED AGAINST THE SCREEN. 100% would be the 16px mark it hangs off, not the screen, and
    // a cap that resolves to 16px is a cap that does nothing. The width itself is a design choice
    // and is not pinned here; what is pinned is what it is measured against.
    const cap = /max-width:\s*([^;]+);/.exec(body)?.[1] ?? ''
    expect(cap, 'the hint has no width cap at all').not.toBe('')
    expect(cap, 'the hint is capped against its own anchor rather than against the screen').toContain('vw')
  })
})

describe('nothing on a family page is capped short of the container it sits in', () => {
  it.each(['.fam-lede', '.fam-arith', '.fam-what', '.fam-question'])('%s reads to the panel it sits in', (selector) => {
    // Comments come out first: a CSS comment sits between the previous rule's brace and this
    // rule's selector, so without stripping them the "selector" this reads is a paragraph of prose.
    //
    // `--measure` is a reading measure for a paragraph, and a one-line count of what is on screen
    // is not a paragraph: 88ch at 14px is 688px inside a 1146px panel, which is what made "12
    // modules and 8 pipelines. The 61 steps they are made of are not listed here" break in the
    // middle of its own clause. EVERY way of capping a line is asked about, not the one property
    // that happened to be used the day this was written.
    const sheet = parts.FAMILY_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) =>
      (m[1] ?? '')
        .split(',')
        .some((s) => s.trim() === selector),
    )
    expect(rule, `${selector} is not in the sheet`).toBeDefined()
    const declared = (rule?.[2] ?? '').replace(/\s+/g, ' ')
    for (const cap of ['max-width', 'max-inline-size', 'inline-size', 'width']) {
      expect(declared, `${selector} is capped short of the panel it sits in, by ${cap}`).not.toMatch(
        new RegExp(`(^|[;{\\s])${cap}\\s*:`),
      )
    }
  })
})

// ============================================================================ one fact, one drawing

/**
 * HOW FAR A DIRECTION HAS BEEN TAKEN IS ONE FIELD WITH ONE DRAWING.
 *
 * `#/findings` wrote its own phrase for the stored `depth` field — "taken to: measured" — while
 * `DepthLadder` in ui.tsx draws the same field everywhere else, with the rung's word, the fraction
 * and the ladder's own six words in its title. Two drawings of one stored field, free to disagree
 * the day the ladder gains a rung, and only one of them told "nobody wrote a depth" from "somebody
 * wrote a word the ladder has never heard of".
 */
describe('#/findings draws a direction’s depth as the ladder’s word and six marks', () => {
  const direction = (data: Record<string, unknown>) =>
    body(
      h(findings.FindingsPage, {
        records: [record({ kind: 'direction' as PanelRecord['kind'], title: 'Reading the repository cold', data })],
        onFiled: noop,
      }),
    )

  it('says which rung and how many, which the page’s own phrase never did', () => {
    // CRITERION CHANGE, wave 13j round 11: the depth box became a word and six small marks (report
    // n9Mjk3c_sJRu block b-17), four of them filled for the fourth rung.
    const html = direction({ depth: 'measured' })
    expect(html).toContain('measured')
    expect(html).toContain('data-rung="4"')
    expect((html.match(/class="fnd-depth-mark"/g) ?? []).length).toBe(6)
    expect((html.match(/class="fnd-depth-mark" data-on="1"/g) ?? []).length).toBe(4)
    expect(html).not.toContain('taken to')
  })

  it('tells a depth nobody wrote from a word the ladder does not hold', () => {
    // Two absences, two answers. The page's own phrase collapsed both into "how far: not said".
    expect(direction({})).toContain('No depth recorded')
    const strange = direction({ depth: 'nearly there' })
    expect(strange).toContain('Not on the ladder')
    expect(strange).toContain('nearly there')
  })
})
