// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `#/work` — the cross-project work list, at several levels.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ARE ABOUT
 * ---------------------------------------------------------------------------------------
 * The page they cover replaced one that showed ONE project as four bands and never said what any
 * row was part of. The owner: *"I need to move naturally between a high-level goal,
 * pipeline/module-level work, detailed tasks, and small operational items, and also flatten
 * relevant work into a dense table/checklist when planning or scheduling."*
 *
 * So seven things are pinned here, and each one is a way the page could quietly go back to being
 * the old page:
 *
 *   1. EVERY PROJECT, NAMED ON EVERY ROW. A work list that shows one project is a filter nobody
 *      asked for, and the project's own NAME is drawn, never its stored id.
 *   2. THE LEVELS. A row sits under what holds it, a level folds, and one press flattens the lot
 *      with the ancestor path in its own column.
 *   3. ABSENCE IS NEVER A BLANK CELL. Not one of the 219 pieces of work in the live corpus has an
 *      estimate, so the column is ABSENT and one sentence says why. `0h` and an empty cell are
 *      both claims that somebody looked.
 *   4. WHAT PANELX COULD NOT READ IS SAID. A row whose parent chain stopped is never drawn as a
 *      piece of work that sits under nothing, and a parent in another project is shown, not hidden.
 *   5. HOW EACH RECORD GOT HERE, IN THREE ANSWERS. A made-up example is marked, a row nobody has
 *      stamped is marked as that and NEVER as authored, and one sentence says what a row with no
 *      mark means.
 *   6. ONLY A DATE MAKES ANYTHING LATE. A kind with no date field is not a date nobody filled in,
 *      a condition in words is waiting rather than late, and finished work is not late at all.
 *   7. ONE CLASSIFIER FOR STATE. `progressOf` decides what a state word means on this page and on
 *      Home, so the two cannot classify one corpus two ways.
 *
 * The page fetches, so nothing here renders `WorkPage` itself: `WorkList` takes the two replies and
 * is the whole of what is drawn. `buildLevels`, `columnsFor`, `foldableKeys`, `projectName`,
 * `readRowDue`, `dueCensus` and `dueCensusSentences` are pure and are called directly.
 */

import { checkSubtraction } from '../src/shared/disclosure.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { WorkspacesReply } from '../src/server/api/workspaces.ts'
import type { WorkChainStep, WorkHours, WorkListReply, WorkRow } from '../src/server/lib/worklist.ts'

type Page = typeof import('../src/web/pages/family/WorkPage.tsx')
let page: Page
/**
 * Home, for one test only: it counts the same corpus with `progressOf` and this page must not
 * grow a second answer. Imported dynamically for the same reason the page is — both reach
 * `window` while they are being evaluated.
 */
let home: typeof import('../src/web/pages/HomePage.tsx')

beforeAll(async () => {
  // The page reaches src/web/api.ts and src/web/lib/mode.ts, both of which touch `window` at
  // module scope. The smallest stand-in that lets them load; nothing here is under test.
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
  page = await import('../src/web/pages/family/WorkPage.tsx')
  home = await import('../src/web/pages/HomePage.tsx')
})

/** Markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

// ---------------------------------------------------------------------------- fixtures

let seq = 0
/**
 * An ordinary row: authored, complete, and of a kind with no date field.
 *
 * `origin: 'authored'` AND NOT `null`, and the difference is the subject of a whole describe below.
 * A row nobody has stamped is an EXCEPTION the page marks; making it the fixture's default would
 * put the exception on every row of every other test and hide the one thing those tests are about.
 * `due: null` is the same choice: 210 of the 219 rows in the live corpus are of a kind with no date
 * field at all, so that is what an ordinary row looks like.
 */
function row(over: Partial<WorkRow> = {}): WorkRow {
  seq += 1
  const title = over.title ?? `Work ${seq}`
  return {
    id: `w-${seq}`,
    kind: 'task',
    title,
    name: title,
    within: null,
    summary: null,
    state: 'todo',
    workspaceId: 'robotics',
    above: [],
    aboveStopped: null,
    parentsInOtherProjects: [],
    estimateHours: null,
    hoursGiven: [],
    origin: 'authored',
    incompleteCount: 0,
    due: null,
    ...over,
  }
}

/** Midday on 14 August 2026, local, so every date below is a fixed number of days from it. */
const NOW = new Date(2026, 7, 14, 12, 0, 0).getTime()

function step(over: Partial<WorkChainStep> = {}): WorkChainStep {
  return {
    id: 'p-1',
    title: 'Transplant v2',
    kind: 'pipeline',
    workspaceId: 'robotics',
    via: 'pipeline order',
    position: 1,
    deleted: false,
    ...over,
  }
}

function reply(rows: WorkRow[], over: Partial<WorkListReply> = {}): WorkListReply {
  const leftOut = over.leftOut ?? 0
  const answer: WorkListReply = {
    rows,
    subtraction: { candidates: rows.length + leftOut, carried: rows.length, leftOut, shortened: 0 },
    leftOutGroups: [{ cause: 'budget', bucket: 'row_limit', count: leftOut, ids: Array.from({ length: leftOut }, (_, n) => `omitted-work-${n}`) }],
    counted: rows.length,
    returned: rows.length,
    cap: 2000,
    leftOut: 0,
    order: 'Rows are ordered by project, then by what each piece of work is part of.',
    kinds: ['block', 'direction', 'obligation', 'problem', 'purchase', 'task'],
    kindsBecause: 'Work here means the kinds a person reads under Work to do plus the kinds a plan may give hours to.',
    note: `${rows.length} pieces of work across every project.`,
    ...over,
  }
  checkSubtraction('work page fixture', answer.subtraction, answer.leftOutGroups)
  return answer
}

const PROJECTS: WorkspacesReply = {
  workspaces: [
    { id: 'robotics', title: 'Robotics', note: null, createdAt: '', updatedAt: '', records: 1, isDefault: false },
    { id: 'panelx', title: 'Mole Office', note: null, createdAt: '', updatedAt: '', records: 1, isDefault: false },
    { id: 'unassigned', title: 'Unassigned', note: null, createdAt: '', updatedAt: '', records: 1, isDefault: true },
  ],
} as unknown as WorkspacesReply

const list = (rows: WorkRow[], props: Record<string, unknown> = {}) =>
  body(h(page.WorkList, { reply: reply(rows), projects: PROJECTS, now: NOW, ...props }))

// ============================================================================ every project

describe('the work list is every project, and every row says which one owns it', () => {
  it('draws work from three projects on one page', () => {
    // THE DEFECT THIS REPLACES: the page took one project's records, so a person planning a week
    // across robotics, Mole Office and their own life saw a third of their work and no sign of the rest.
    const html = list([
      row({ title: 'Calibrate the bench', workspaceId: 'robotics' }),
      row({ title: 'Rebuild the table', workspaceId: 'panelx' }),
      row({ title: 'Renew the insurance', workspaceId: 'unassigned' }),
    ])
    expect(html).toContain('Calibrate the bench')
    expect(html).toContain('Rebuild the table')
    expect(html).toContain('Renew the insurance')
    // ONE GROUP PER PROJECT, each headed with its name. The sentence counting pieces of work and
    // projects above the list is gone (report n9Mjk3c_sJRu, block b-13).
    expect(html.match(/<section class="wk-group"/g)?.length, 'the list is not grouped by project').toBe(3)
  })

  it('draws the project NAME on the row, never the stored id', () => {
    const html = list([row({ workspaceId: 'robotics' })])
    expect(html).toContain('Robotics')
    expect(html, 'the stored id reached the screen where a name belongs').not.toContain('>robotics<')
  })

  it('calls the catch-all project what the rest of the product calls it', () => {
    // ONE BUCKET HAD THREE NAMES. The switcher said "Not in a project", this page headed the group
    // "Unassigned" because that is the stored title, and a decision card said "in unassigned". The
    // name comes from src/web/lib/projects.ts now, which is the one function in the browser that
    // names a project, so this page cannot answer differently from the switcher above it.
    //
    // WHICH WORD THAT IS CHANGED ON 16 AUGUST 2026. The owner settled decision `AtiSHfG00BVV`: the
    // project keeps the name Unassigned, that title is stored plainly, and the browser renames
    // nothing. So the name every surface prints is the stored title, and the thing that must never
    // reach a screen is the stored id.
    const html = list([row({ workspaceId: 'unassigned' })])
    expect(html).toContain('Unassigned')
    expect(html, 'the stored id reached the screen where a name belongs').not.toContain('>unassigned<')
  })

  it('says so when the stored project id names no project, instead of drawing the id as a name', () => {
    // An id drawn where a name belongs reads as a name, and the reader has no way to tell that
    // Mole Office has no project by that id — which is a real thing to go and fix.
    const named = page.projectName('robotics', new Map([['robotics', 'Robotics']]))
    expect(named).toEqual({ text: 'Robotics', unknown: false, why: '' })
    const missing = page.projectName('ghost', new Map([['robotics', 'Robotics']]))
    expect(missing.unknown).toBe(true)
    expect(missing.text).toBe('ghost')
    expect(missing.why).toContain('No name was found for project ghost')
  })
})

// ============================================================================ the levels

describe('a row sits under what holds it, and a level folds', () => {
  const pipeline = step({ id: 'p-1', title: 'Transplant v2' })

  it('puts a piece of work under its parent, and counts the work under that parent', () => {
    const built = page.buildLevels([
      row({ id: 'b-1', title: 'Grip the object', above: [pipeline] }),
      row({ id: 'b-2', title: 'Hand it over', above: [pipeline] }),
    ])
    expect(built.projects).toHaveLength(1)
    const roots = built.projects[0]!.roots
    expect(roots).toHaveLength(1)
    expect(roots[0]!.key).toBe('p-1')
    // THE PIPELINE IS NOT ITSELF WORK: it has no row, because GET /api/work returns the kinds a
    // person has to DO. It is a level over its parts and the tree says so.
    expect(roots[0]!.row).toBeNull()
    expect(roots[0]!.workCount).toBe(2)
    expect(roots[0]!.children.map((c) => c.row?.name)).toEqual(['Grip the object', 'Hand it over'])
  })

  it('nests a piece of work that is itself the parent of another', () => {
    // Measured in the live corpus: exactly one chain is two deep, and it is a block that holds a
    // task. A tree that could only do one level would draw it at the top.
    const inner = step({ id: 'b-1', title: 'Closeout', kind: 'block', via: 'part of link', position: null })
    const built = page.buildLevels([
      row({ id: 'b-1', title: 'Closeout', kind: 'block', above: [pipeline] }),
      row({ id: 't-1', title: 'Delete the dead panel grid', above: [pipeline, inner] }),
    ])
    const root = built.projects[0]!.roots[0]!
    expect(root.key).toBe('p-1')
    expect(root.workCount).toBe(2)
    const block = root.children[0]!
    expect(block.key).toBe('b-1')
    // It is a piece of work AND a level: it keeps its own row and gains a part.
    expect(block.row?.name).toBe('Closeout')
    expect(block.children.map((c) => c.key)).toEqual(['t-1'])
  })

  it('folding a level hides its parts and says how many are hidden', () => {
    const rows = [row({ id: 'b-1', title: 'Grip the object', above: [pipeline] })]
    const open = list(rows)
    expect(open).toContain('Grip the object')
    const shut = list(rows, { folded: ['p-1'] })
    expect(shut).toContain('Transplant v2')
    expect(shut).not.toContain('Grip the object')
    expect(shut).toContain('hidden')
  })

  it('draws one press for every level that has parts, and none when nothing has any', () => {
    const presses = (html: string) => (html.match(/<button type="button" class="wk-toggle"/g) ?? []).length
    expect(presses(list([row({ id: 'b-1', above: [pipeline] })]))).toBe(1)
    expect(presses(list([row()]))).toBe(0)
  })

  it('reports two stores disagreeing about what holds what, instead of drawing one of them as true', () => {
    // Containment is stored three ways. If two of them disagree, placing the level on first sight
    // and saying nothing would draw one answer as the truth. USER.md invariant 4.
    const other = step({ id: 'p-2', title: 'Another pipeline' })
    const contested = step({ id: 'b-1', title: 'Closeout', kind: 'block', via: 'part of link', position: null })
    const built = page.buildLevels([
      row({ id: 'x-1', above: [pipeline, contested] }),
      row({ id: 'x-2', above: [other, contested] }),
    ])
    expect(built.contradictions).toHaveLength(1)
    expect(built.contradictions[0]).toContain('was placed under both')
    expect(built.contradictions[0]).toContain('b-1')
  })
})

// ============================================================================ the flatten

describe('one press flattens everything, with the ancestor path in its own column', () => {
  const pipeline = step({ id: 'p-1', title: 'Transplant v2' })

  it('gives the path a column of its own, which the levels view does not have', () => {
    // The rule: relevant work is flattened into a dense table or checklist for planning and
    // scheduling. A path drawn under the title is not a column and cannot be scanned down a page.
    expect(page.columnsFor('levels', false, false, false).map((c) => c.key)).not.toContain('part')
    expect(page.columnsFor('flat', false, false, false).map((c) => c.key)).toContain('part')
  })

  it('draws the whole path, outermost first, on the row itself', () => {
    const inner = step({ id: 'b-1', title: 'Closeout', kind: 'block', via: 'part of link', position: null })
    const html = list([row({ title: 'Delete the dead panel grid', above: [pipeline, inner] })], { view: 'flat' })
    expect(html).toContain('Part of')
    expect(html).toContain('Transplant v2')
    expect(html).toContain('Closeout')
    expect(html.indexOf('Transplant v2')).toBeLessThan(html.indexOf('Closeout'))
  })

  it('draws the short mark when nothing holds a row', () => {
    // Plan 7FEOshq3mBGG: ordinary absence is the short mark.
    expect(list([row()], { view: 'flat' })).toContain('class="px-absent"')
  })

  it('offers both arrangements as one control, with the chosen one marked', () => {
    const html = list([row()])
    expect(html).toContain('By level')
    expect(html).toContain('One list')
    expect(html).toMatch(/aria-pressed="true"[^>]*>By level/)
  })
})

// ============================================================================ the fixed left edge

/**
 * EVERY TITLE AT ONE LEVEL STARTS AT ONE x, AND THE ONLY THING THAT MOVES IT IS THE LEVEL.
 *
 * THE DEFECT: measured on the page this replaces, the title's left edge landed anywhere from x=459
 * to x=708 down one screen, because the leading chips flowed with the title and their widths differ
 * per row.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS BLOCK READ UNTIL THE TEST AUDIT OF 3 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * It read four declarations out of `WORK_CSS` as text: the grid template, `width: 18px` on the fold
 * press, the `calc()` on the title cell and `flex-wrap: nowrap`. The audit's verdict was that this
 * goes red when somebody renames a class and stays green if the edges move, and both halves are
 * true — a stylesheet says what a rule was written to do, not where anything landed.
 *
 * WHAT IT READS NOW IS WHAT THE PAGE DRAWS. Two of the three things that decide a title's left edge
 * are in the markup, one value per row:
 *
 *   THE COLUMN TEMPLATE is `--wk-cols`, set once on each list. A row that laid itself out on its
 *   own template would carry one of its own, and none does.
 *   THE LEVEL is `--wk-in`, set on each title cell. Every rule in the sheet that offsets the title
 *   multiplies that number, so two rows at one level cannot start at two x values unless this
 *   number differs — and that is a fact this file can check on the rows themselves.
 *   THE FOLD PRESS is reserved on every row of the grouped arrangement, drawn or not. A row with no
 *   parts draws the gap that stands in for it.
 *
 * WHAT IS STILL UNMEASURED. That the press and its gap are the same width in pixels, and that a
 * long title does not drop onto a second line further left. Both are browser questions and nothing
 * in this repository opens this page in one. `tests/nothing-scrolls-in-silence-at-1440.test.ts`
 * shows the shape a replacement takes: open the page, measure the boxes, compare the numbers.
 */
describe('every title starts at the same x', () => {
  /** Every `--wk-cols` value on the page, one per list. */
  const templates = (html: string) => [...html.matchAll(/--wk-cols:([^";]+)/g)].map((m) => (m[1] ?? '').trim())

  /**
   * Each title cell, with the level it says it is at.
   *
   * The heading row uses the same cell classes and holds a column name rather than a title, so it
   * comes out first — the same thing the past-its-date block at the foot of this file does.
   */
  const titleCells = (html: string) =>
    [
      ...html
        .replace(/<div class="wk-row wk-heads">[\s\S]*?<\/div>/g, '')
        .matchAll(/<span class="wk-c wk-name"([^>]*)>((?:(?!<\/span>)[\s\S]){0,200})/g),
    ].map((found) => ({
      level: /--wk-in:(\d+)/.exec(found[1] ?? '')?.[1] ?? null,
      opens: found[2] ?? '',
    }))

  it('lays every row of the page on one column template, so a row cannot lay itself out differently', () => {
    const html = list([row({ title: 'Calibrate the bench' }), row({ title: 'Level it' })])
    const found = templates(html)
    expect(found.length, 'no list on the page declares a column template at all').toBeGreaterThan(0)
    expect(new Set(found).size, `the page draws its rows on ${new Set(found).size} different templates`).toBe(1)
    // AND NO ROW CARRIES ONE. A row with its own template is a row with its own left edge.
    expect(html.replace(/<div class="wk-list"[^>]*>/g, ''), 'a row declares a column template of its own').not.toContain(
      '--wk-cols',
    )
  })

  it('gives two rows at the same level the same offset, and a nested one one step in and never more', () => {
    const pipeline = step({ id: 'p-1', title: 'Transplant v2' })
    const inner = step({ id: 'b-1', title: 'Closeout', kind: 'block', via: 'part of link', position: null })
    const html = list([
      row({ id: 'b-1', title: 'Closeout', kind: 'block', above: [pipeline] }),
      row({ id: 't-1', title: 'Delete the dead panel grid', above: [pipeline, inner] }),
      row({ id: 't-2', title: 'Also under the pipeline', above: [pipeline] }),
    ])
    const levels = titleCells(html).map((cell) => cell.level)
    expect(levels.length, 'no title cell was found, so this test is asserting nothing').toBeGreaterThan(2)
    // Every cell says which level it is at. A cell with no level is a title the sheet cannot place.
    for (const level of levels) expect(level, 'a title cell says nothing about its level').not.toBeNull()
    // Closeout and "Also under the pipeline" are both one level in; the task under Closeout is two
    // levels in and is drawn at the same one step (shared rule R1: the margin and one step in).
    const [closeout, nested, sibling] = levels
    expect(closeout).toBe('1')
    expect(sibling, 'two rows at one level are drawn at two different offsets').toBe(closeout)
    expect(nested, 'a part of a part is stepped in more than once').toBe('1')
  })

  it('reserves the fold press on every row of the grouped arrangement, drawn or not', () => {
    // The gap is what keeps the title in line on a row that has no parts. Without it the title of
    // a childless row starts 18px left of its neighbour's.
    const html = list([row({ title: 'has no parts' }), row({ title: 'also has none' })])
    const cells = titleCells(html)
    expect(cells.length, 'no title cell was found, so this test is asserting nothing').toBeGreaterThan(1)
    for (const cell of cells) {
      expect(cell.opens, 'a title cell starts with the title itself, so it sits 18px left of the rest').toMatch(
        /wk-toggle/,
      )
    }
    // A row with no parts draws the GAP and not the press: nothing to press, and the space kept.
    expect(html, 'a row with no parts reserves nothing where the press would be').toContain('wk-toggle-gap')
  })

  it('draws One list as a table, with no step in and no fold press', () => {
    const pipeline = step({ id: 'p-1', title: 'Transplant v2' })
    const inner = step({ id: 'b-1', title: 'Closeout', kind: 'block', via: 'part of link', position: null })
    const html = list(
      [row({ id: 'b-1', title: 'Closeout', above: [pipeline] }), row({ id: 't-1', title: 'Deep', above: [pipeline, inner] })],
      { view: 'flat' },
    )
    const table = /<table class="wk-table">[\s\S]*<\/table>/.exec(html)?.[0] ?? ''
    expect(table, 'One list is not drawn as a table').not.toBe('')
    expect(table.match(/<tr /g)?.length, 'the table does not hold one row per piece of work').toBe(2)
    expect(table, 'the table steps a row in by how deep it happens to be').not.toContain('--wk-in')
    expect(table, 'the table reserves a fold press nothing can fold').not.toMatch(/wk-toggle/)
  })
})

// ============================================================================ absence

describe('a column Mole Office cannot fill is absent, and nothing unknown is drawn as zero', () => {
  it('drops the size column when nobody has sized anything, and does not announce that it did', () => {
    // Not one of the 203 pieces of work in the live corpus has an estimate. A column of 203 empty
    // cells claims "nothing is there" when the truth is "nobody looked".
    expect(page.columnsFor('flat', false, true, false).map((c) => c.key)).not.toContain('size')
    const html = list([row()])
    expect(html).not.toContain('How big')
    // AND NO SENTENCE ABOUT THE MISSING COLUMN. It used to say "Nobody has sized any of this work,
    // so there is no size column." — a page explaining why one of its columns is absent, to a
    // reader who never saw the column. Finding 15 of the language audit, 19 August 2026.
    expect(html).not.toContain('Nobody has sized any of this work')
    expect(html).not.toContain('size column')
  })

  it('draws the size column as soon as one row has a size, and says the others are not sized', () => {
    expect(page.columnsFor('flat', true, false, false).map((c) => c.key)).toContain('size')
    const html = list([row({ title: 'sized', estimateHours: 4 }), row({ title: 'unsized' })], { view: 'flat' })
    expect(html).toContain('How big')
    expect(html).toContain('4h')
    // NEVER 0h. Zero would mean somebody looked and said it takes no time.
    expect(html).toContain('class="px-absent"')
    expect(html).not.toContain('not sized')
    expect(html).not.toContain('0h')
  })

  it('lists every period a row has hours in and never adds two horizons together', () => {
    // A month, a week inside it and a day inside that are three answers to three questions.
    const hours: WorkHours[] = [
      { horizon: 'month', period: '2026-08', plannedHours: 12, actualHours: null, state: 'planned' },
      { horizon: 'week', period: '2026-W33', plannedHours: 10, actualHours: null, state: 'planned' },
    ]
    const html = list([row({ hoursGiven: hours })])
    expect(html).toContain('12h')
    expect(html).toContain('2026-08')
    expect(html).toContain('10h')
    expect(html).toContain('2026-W33')
    expect(html).not.toContain('22h')
  })

  it('says an allocation with no hours on it is exactly that, and not zero', () => {
    const hours: WorkHours[] = [
      { horizon: 'week', period: '2026-W33', plannedHours: null, actualHours: null, state: 'planned' },
    ]
    expect(list([row({ hoursGiven: hours })])).toContain('class="px-absent"')
    expect(list([row({ hoursGiven: hours })])).not.toContain('>0h<')
  })

  it('tells a kind with no state field apart from a record nobody wrote a state on', () => {
    // Two different facts. One is a record somebody should go and finish; the other is a fact about
    // the kind and needs nothing at all.
    // A KIND WITH NO STATE FIELD IS THE SHORT MARK, with its reason on hover (plan 7FEOshq3mBGG,
    // block b-6, check 4). A record that could carry a state and has none is still said in words.
    const none = list([row({ kind: 'direction', state: null })])
    expect(none).not.toContain('No state field')
    expect(none).toContain('<span class="px-absent" title="Work of this kind has no state.">')
    expect(list([row({ kind: 'task', state: null })])).toContain('No state written')
  })
})

// ============================================================================ what it could not say

describe('the page says what it could not answer, rather than drawing a row as if it knew', () => {
  it('never files a row whose chain stopped under "nothing holds it"', () => {
    const stopped = row({
      title: 'the orphan',
      aboveStopped: 'The chain runs deeper than Mole Office walks, so this is not the whole of it.',
    })
    const html = list([stopped])
    expect(html).toContain('Mole Office could not read what these are part of')
    expect(html).not.toContain('nothing holds it')
  })

  it('marks an unreadable chain without exposing its stored detail in normal mode', () => {
    const said = 'The chain runs deeper than Mole Office walks, so this is not the whole of it.'
    const html = list([row({ aboveStopped: said })], { view: 'flat' })
    expect(html).toContain('Some containing records could not be read')
    expect(html).not.toContain(said)
  })

  it('marks a row whose chain is partly readable rather than dropping the warning', () => {
    const html = list([row({ above: [step()], aboveStopped: 'Two parents are stored for this record.' })])
    expect(html).toContain('chain incomplete')
  })

  it('names a parent that lives in another project instead of hiding it', () => {
    // Links may not cross a project boundary today, and rows written before that refusal existed
    // are still stored. A row that quietly dropped it would say the work sits under nothing.
    const html = list([
      row({
        workspaceId: 'robotics',
        above: [step({ workspaceId: 'panelx' })],
        parentsInOtherProjects: ['panelx'],
      }),
    ])
    expect(html).toContain('also in Mole Office')
  })

  it('no longer says it cannot mark a made-up example, because it now can', () => {
    // The page printed that sentence while `GET /api/work` carried no origin. The route carries it,
    // so the sentence is a document contradicting the product and it is deleted.
    const html = list([row({ origin: 'fixture' })])
    expect(html).not.toContain('cannot say which rows are made-up examples')
    expect(html).toContain('Made-up example')
  })

  it('counts the omitted work when the list has been cut', () => {
    const cut = reply([row()], { counted: 9, returned: 1, leftOut: 8, note: 'THIS LIST IS CUT: 8 are missing.' })
    const html = body(h(page.WorkList, { reply: cut, projects: PROJECTS, now: NOW }))
    expect(html).toContain('This list is cut')
    expect(html).toContain('8 pieces of work were left out of this list')
  })

  it('answers an empty corpus with the short mark', () => {
    const none = reply([], { note: 'No work is filed in any project. That is an answer rather than an empty list.' })
    expect(body(h(page.WorkList, { reply: none, projects: PROJECTS, now: NOW }))).toContain(
      'class="px-absent"',
    )
  })
})

// ============================================================================ how it got here

describe('how each record got here, in three answers drawn as three', () => {
  it('marks a made-up example on the row it appears on', () => {
    // USER.md invariant 3: a placeholder is labelled in the place it appears. 124 of the 219 pieces of
    // work in the live corpus are made-up examples.
    const html = list([row({ title: 'Grip the object', origin: 'fixture' })])
    expect(html).toContain('Made-up example')
    expect(html).toContain('data-origin="fixture"')
  })

  it('NEVER reads a row nobody has stamped as authored', () => {
    // THE ONE DIRECTION THAT DOES THE DAMAGE. `origin: null` is the absence of a judgement, and
    // drawing it as a judgement is what lets made-up content read as real project work.
    const html = list([row({ origin: null })])
    expect(html).toContain('data-origin="unrecorded"')
    expect(html).not.toContain('data-origin="authored"')
    expect(html).not.toContain('Made-up example')
  })

  it('draws nothing on an ordinary authored row, and says once what that absence means', () => {
    // The quiet case, paired with the sentence that gives it its one meaning. Without the sentence
    // the absence of a mark would say both "ordinary authored work" and "nobody has said".
    const html = list([row({ origin: 'authored' }), row({ origin: 'fixture' })])
    expect(html).not.toContain('data-origin="authored"')
    expect(html).not.toContain(sayInEnglish('sheet.origin.unmarked', { what: sayInEnglish('sheet.row') }))
  })

  it('marks each made-up row on the row, and says no sentence about them above the list', () => {
    // The sentence above the list that counted them is gone (report n9Mjk3c_sJRu, block b-13). Each
    // made-up row still carries its own mark, and the foot says what a row with no mark means.
    const html = list([row({ origin: 'fixture' }), row({ origin: 'fixture' }), row({ origin: 'authored' })])
    expect(html.match(/data-origin="fixture"/g)?.length).toBe(2)
    expect(html).not.toContain('are made-up examples')
  })

  it('says how many of a record’s own fields nobody has filled in, and nothing at zero', () => {
    expect(list([row({ incompleteCount: 2 })])).toContain('2 details missing')
    // A complete record renders no mark at all: the mark is the exception, so a page of finished
    // work stays quiet. 212 of the 219 rows in the live corpus are complete.
    expect(list([row({ incompleteCount: 0 })])).not.toContain('missing')
  })

  it('drops the marks column, and the sentence with it, when no row carries a mark', () => {
    const quiet = list([row({ origin: 'authored', incompleteCount: 0 })])
    expect(quiet).not.toContain('About the record')
    expect(quiet).not.toContain(sayInEnglish('sheet.origin.unmarked', { what: sayInEnglish('sheet.row') }))
    expect(page.columnsFor('flat', false, false, false).map((c) => c.key)).not.toContain('marks')
    expect(page.columnsFor('flat', false, false, true).map((c) => c.key)).toContain('marks')
  })
})

// ============================================================================ what is past its date

describe('only a date can make work late', () => {
  /** An obligation is the kind that has a date field. `due` is what the route read off the record. */
  const owed = (date: string, over: Partial<WorkRow> = {}) =>
    row({ kind: 'obligation', state: 'open', due: { when: 'date', date }, ...over })

  it('bands the work whose date has passed, and says how late it is on the row', () => {
    const html = list([owed('2026-08-10', { title: 'Return the force gauge' }), row({ title: 'Grip the object' })])
    expect(html).toContain('>Late<')
    expect(html).toContain('Return the force gauge')
    // Due 10 August, read on 14 August: 4 calendar days since the due date (round 31).
    expect(html).toContain('4 days late')
  })

  it('keeps a kind with no date field out of it, and never calls that an unreadable date', () => {
    // 210 of the 219 rows in the live corpus are of a kind with no `due` field at all. That is a
    // fact about the KIND. A page that handed it to the lateness reader as "a date nobody wrote"
    // would report it as a gap in the record.
    const read = page.readRowDue(row({ due: null }), NOW)
    expect(read).toEqual({ lateMs: null, said: null, late: false })
    // THE CENSUS STILL TELLS THE TWO APART. It is the sentence that stopped printing the
    // distinction, not the reading: `noDueField` is the kind having no date field at all, and it is
    // counted separately from a date nobody wrote. Finding 14, 19 August 2026.
    expect(page.dueCensus([row({ due: null })], NOW).noDueField).toBe(1)
    const html = list([row({ due: null })])
    expect(html).not.toContain('Past its date')
    expect(html).not.toContain('cannot read')
  })

  it('treats work owed on a condition as waiting, and never as late', () => {
    // The substitution this product bans: resolving a written condition into a date so the ranking
    // has a number to work with. `latenessMs` answers null for every form but a readable date.
    const waiting = owed('', { due: { when: 'condition', condition: 'when the reprint lands' } })
    expect(page.readRowDue(waiting, NOW).late).toBe(false)
    // The census counts it as waiting on a condition and NOT as late. The page's own sentence no
    // longer walks the standings one by one — see finding 14 — so the reading is asserted directly.
    expect(page.dueCensus([waiting], NOW).byStanding['waiting-on-a-condition']).toBe(1)
    expect(page.dueCensus([waiting], NOW).late).toBe(0)
    const html = list([waiting])
    expect(html).not.toContain('Past its date')
  })

  it('does NOT call finished work late, however long ago its date passed', () => {
    // `workBand` tests `finished` before lateness, and one of the four rows past its date in the
    // live corpus is a fulfilled obligation. Nobody is behind on a promise that was kept.
    const kept = owed('2026-08-05', { title: 'ESA report', state: 'fulfilled' })
    const read = page.readRowDue(kept, NOW)
    // The subtraction still says the date passed — that is arithmetic. What the page will not do is
    // call it late or print a phrase about it.
    expect(read.lateMs).toBeGreaterThan(0)
    expect(read.late).toBe(false)
    expect(read.said).toBeNull()
    const html = list([kept])
    expect(html).not.toContain('Past its date')
    expect(html).not.toContain('days late')
  })

  it('says what is still to come without calling it late', () => {
    // Six days, not five: a bare date is owed by the END of the 20th, which is the one reading
    // `parseDueStamp` has and the reason a thing due today is not overdue at one minute past
    // midnight.
    const html = list([owed('2026-08-20', { title: 'Safety refresher' })])
    expect(html).toContain('due in 6 days')
    expect(html).not.toContain('Past its date')
  })

  it('counts what could be late at all, so “nothing is past its date” can be checked', () => {
    const census = page.dueCensus(
      [row(), row(), owed('2026-08-20'), owed('', { due: { when: 'unstated' } })],
      NOW,
    )
    expect(census).toEqual({
      noDueField: 2,
      byStanding: {
        dated: 1,
        'date-unreadable': 0,
        'waiting-on-a-condition': 0,
        'waiting-on-a-record': 0,
        'no-due-recorded': 1,
      },
      late: 0,
    })
    // THE CENSUS IS STILL EXACT AND THE PARAGRAPH IS NOT. The language audit of 19 August 2026
    // found four sentences here, two of which were the field's name and the kind declaration spoken
    // aloud, about 236 records that need nobody to do anything. What is left is the one thing a
    // reader acts on: how many of the ones that CAN be late are, and that the rest carry no date.
    const said = page.dueCensusSentences(census).join(' ')
    expect(said).toBe('None of the 2 dated pieces of work are late.')
    expect(said).not.toContain('date field')
    expect(said).not.toContain('of a kind')
  })

  it('drops the “nothing is past its date” sentence when something is', () => {
    const said = page.dueCensusSentences(page.dueCensus([owed('2026-08-01')], NOW)).join(' ')
    expect(said).not.toContain('Nothing here is past its date')
  })
})

// ============================================================================ the page itself

describe('the page reads as one page', () => {
  it('says its own name once and does not explain itself underneath', () => {
    const html = list([row()])
    expect(html).not.toContain('fam-lede')
  })

  it('draws what the rows themselves say, using the shared classifier', () => {
    // `progressOf` is the same function the server ran to build the attention list, so this page
    // cannot come to disagree with Home about what `blocked` means. The count sentence above the
    // list is gone (report n9Mjk3c_sJRu, block b-13), so the classifier is read on the rows.
    const html = list([row({ state: 'blocked' }), row({ state: 'todo' }), row({ state: 'done' })])
    expect(html.match(/data-progress="stopped_short"/g)?.length).toBe(1)
    expect(html).not.toContain('stopped short')
  })

  it('classifies one corpus the same way Home does, because both ask `progressOf` and nothing else', async () => {
    // ONE CORPUS, TWO SCREENS. Home says "N pieces of work are not finished, in M projects" and
    // this page says how many carry a word that says they stopped short. Both readings have to come
    // from the same classifier, or the two screens will disagree about the same records — which is
    // the defect this repository names as its own.
    //
    // The three rows that decide it are the last three: no state at all, the word `unknown`, and a
    // word nobody has classified. All three are a THIRD answer — Mole Office cannot tell — and neither
    // rolling them into "not finished" nor into "finished" is honest.
    const rows = [
      row({ state: 'blocked' }),
      row({ state: 'todo' }),
      row({ state: 'done' }),
      row({ state: null }),
      row({ state: 'unknown' }),
      row({ state: 'wobble' }),
    ]
    const standing = home.workStanding(reply(rows))
    expect(standing).toMatchObject({ unfinished: 2, finished: 1, cannotSay: 3 })

    const html = list(rows)
    // ONE row carries the word that says the work stopped short, and the three rows Mole Office
    // cannot classify are not drawn as that.
    expect(html.match(/data-progress="stopped_short"/g)?.length).toBe(1)
    // And the page draws all three non-answers apart rather than as one.
    expect(html).toContain('No state written')
    expect(html).toContain('data-progress="unknown"')
    expect(html).toContain('data-progress="unclassified"')
    // The sentence about the unclassified word is developer detail since the sheet piece (plan
    // 7FEOshq3mBGG, G9); normal mode tells it apart by its drawing, checked above.
    const { setMode } = await import('../src/web/lib/mode.ts')
    setMode('inspect')
    try {
      expect(list(rows)).toContain((await import('../src/shared/work.ts')).unclassifiedNote('wobble').replaceAll('"', '&quot;'))
    } finally {
      setMode('normal')
    }
  })
})

// ============================================================================ said once, not per row

/**
 * THE PROJECT'S NAME IS SAID BY THE PANEL IT IS IN, OR BY THE ROW, NEVER BY BOTH.
 *
 * Measured in Chromium at 1440 on 15 August, on the live corpus, in the grouped arrangement: 103
 * tags reading "Mole Office" and 92 reading "Robotics", every one of them inside a panel whose title was
 * already that word. 195 repeats of two words, and the largest single group of repeated text on the
 * page.
 *
 * The flat arrangement really does mix projects into one list, so it keeps the column. This is the
 * test that stops the column coming back to the arrangement that groups by project.
 */
describe('the project is named once per group, not once per row', () => {
  it('drops the project column from the grouped arrangement and keeps it in the flat one', () => {
    expect(page.columnsFor('levels', false, false, false).map((c) => c.key)).not.toContain('project')
    expect(page.columnsFor('flat', false, false, false).map((c) => c.key)).toContain('project')
  })

  it('names the project once in the grouped arrangement, on the panel', () => {
    const html = list([row({ title: 'Calibrate the bench', workspaceId: 'robotics' }), row({ title: 'Level it', workspaceId: 'robotics' })])
    // The panel is still headed with the project's name — that is where the fact now lives.
    expect(html).toContain('Robotics')
    // ...and it is there ONCE, not once per row as well. Two rows in one project used to draw it
    // three times: the panel heading and a tag on each row.
    expect(html.match(/Robotics/g)?.length, 'the project name is drawn more than once per group').toBe(1)
    expect(html).not.toContain('Project')
  })

  it('still names every row’s project in the flat arrangement, where the panel cannot', () => {
    const html = list([row({ workspaceId: 'robotics' }), row({ workspaceId: 'panelx' })], { view: 'flat' })
    expect(html).toContain('Project')
    expect(html).toContain('Robotics')
    expect(html).toContain('Mole Office')
  })

  it('keeps the one thing a grouped row can say that its panel cannot', () => {
    // A parent in ANOTHER project is an exception about that row, not a fact about the group, so it
    // is drawn beside the title in both arrangements. Dropping the column must not drop this with
    // it: it is how a reader learns that a link crossing a project boundary is still stored.
    const html = list([row({ workspaceId: 'robotics', parentsInOtherProjects: ['panelx'] })])
    expect(html).toContain('also in')
    expect(html).toContain('Mole Office')
  })
})

/**
 * ONE DEPTH, ONE LEFT EDGE, ON ONE PAGE.
 *
 * The past-its-date band is one flat band whatever arrangement is chosen — that is what the band is
 * for. It was drawn with `view` written out as `flat`, and `view` also decides whether the 18px of
 * the fold press is reserved in front of the title. So with the grouped arrangement showing, the
 * three titles in that band sat at x=444 and the 130 titles of the same depth in the panels below
 * sat at x=465. Measured in Chromium at 1440 on 15 August.
 */
describe('the past-its-date band lines up with the rows below it', () => {
  const late = () =>
    row({ title: 'Return the borrowed force gauge', kind: 'obligation', state: 'open', due: { when: 'date', date: '2026-08-01' } })

  /** The heading row uses the same cell classes and holds no title, so it is taken out first. */
  const titleCells = (html: string) =>
    [...html
      .replace(/<div class="wk-row wk-heads">[\s\S]*?<\/div>/g, '')
      .matchAll(/<span class="wk-c wk-name"[^>]*>(.{0,40})/g)].map((m) => m[1] ?? '')

  it('reserves the fold press in front of every title when the arrangement is grouped', () => {
    const html = list([late()], { view: 'levels' })
    // Every title cell on the page opens with the press or with the gap that stands in for it. A
    // cell that opens with the anchor itself is a title 18px left of its neighbours.
    const cells = titleCells(html)
    expect(cells.length, 'no title cell was found, so this test is asserting nothing').toBeGreaterThan(1)
    for (const cell of cells) {
      expect(cell, 'a title cell starts with the title itself, so it sits 18px left of the rest').toMatch(/wk-toggle/)
    }
  })

  it('keeps the list edge in Needs you when the table is chosen, and reserves no press in the table', () => {
    // Needs you is a list whichever view All work shows, so its titles keep the list's edge. The
    // table below is compared column by column and has no press to reserve room for.
    const html = list([late()], { view: 'flat' })
    const cells = titleCells(html)
    expect(cells.length, 'Needs you draws no title cell').toBe(1)
    for (const cell of cells) expect(cell).toMatch(/wk-toggle/)
    const table = /<table class="wk-table">[\s\S]*<\/table>/.exec(html)?.[0] ?? ''
    expect(table).toContain('Return the borrowed force gauge')
    expect(table).not.toMatch(/wk-toggle/)
  })
})
