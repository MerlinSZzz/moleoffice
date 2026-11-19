// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change: plan 7FEOshq3mBGG replaces ordinary empty sentences and hides machine details in normal mode.
/**
 * ONE ROW GEOMETRY on the family pages, and the checklist counts that used to be hidden.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHY EACH TEST BELOW EXISTS
 * ---------------------------------------------------------------------------------------
 * In Chromium at 1440 on 14 August, before this file existed:
 *
 *   THE TITLE'S LEFT EDGE MOVED DOWN THE PAGE. x=600.5 on one row of `#/modules` and x=708 on the
 *   next, because the row's marks were drawn in front of the title and how wide they are depends on
 *   which marks that row carries. A column of titles that do not start at the same x cannot be
 *   scanned. `#/notes` had two edges, `#/structure` had two, `#/queries` had eight.
 *
 *   ONE COLUMN HAD FOUR WIDTHS. 130px on `#/ideas` and `#/notes`, 140px on `#/structure` and
 *   `#/modules`, 150px on `#/findings`, 9.5rem on `#/work` — five pages doing one job.
 *
 *   THE PAGE DREW ITS OWN NAME BESIDE THE ROW THAT OPENED IT. 43px of heading at 32px, on every
 *   family page, saying the same word as the navigation row two centimetres to its left. THAT WAS
 *   FIXED BY CLIPPING THE HEADING TO ONE PIXEL, AND THE FIX WAS WORSE THAN THE DEFECT: six pages
 *   then named themselves nowhere in the content area, and four testers each said so. The heading
 *   is drawn again, at the size Plans and Everything are drawn at.
 *
 *   A MODULE REPORTED ONLY WHAT FINISHED. The twelve modules in `robotics` hold 9 blocked and 6
 *   failed checklist items and every row said "N / M checked" and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE READS, AFTER THE TEST AUDIT OF 3 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 * IT READS WHAT THE PAGES DRAW. Every claim about a row is made against the markup a page produces:
 * the grid each row is laid on, the order of the title and the marks, the words on a fold, the
 * counts on a module. Three things changed in that pass:
 *
 *   1. THE COLUMN WIDTH IS READ OFF THE ROWS, not out of four page files. The audit's complaint was
 *      that a test scanning source goes red when somebody renames a constant and stays green when
 *      a page draws the wrong width from the right name. Every row on every page is now checked
 *      against `famCols()` itself.
 *   2. THE FOLD MARKERS ARE THE ONES A PAGE DRAWS, not the ones written as `summary="…"` in a file.
 *      That matters: `MoreFacts` falls back to joining the stored field names when no phrase is
 *      given, so a page can draw a marker that no file contains. The 22-character limit is gone —
 *      nobody decided it — and what is checked is the property it stood for: a marker is a few
 *      words naming what is inside, and never a sentence.
 *   3. THE MARK-NOT-BEHIND-A-PRESS TEST NOW RUNS. It compared two positions in the markup and
 *      returned early when no page drew a fold, which was every page these fixtures built, so it
 *      asserted nothing. The fixtures draw a fold now and the check is the real one: no mark is
 *      inside the `details` element.
 *
 * WHAT IS STILL A STYLESHEET FACT, AND WHY. Where a page's name STARTS is pixels, and pixels need a
 * browser. Nothing in this repository opens a family page in one, so deleting the check would leave
 * the rule unguarded. What is checked instead is the sheet the shell actually serves — the string a
 * browser is handed — and the check is that the three page-level objects AGREE with one another on
 * every horizontal offset in it, rather than that one rule reads `padding: 0`. A browser test that
 * measures the three left edges at 1440 would replace it, and is owed.
 *
 * Each test was proved by reverting the change and watching it go red, after a control run of this
 * same file with nothing reverted.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PanelRecord } from '../src/shared/types.ts'
import type { RecordListItem, ReportsAndNotesReply } from '../src/web/api.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type Rows = typeof import('../src/web/pages/family/rows.tsx')
type Structure = typeof import('../src/web/pages/family/StructurePage.tsx')
type Findings = typeof import('../src/web/pages/family/FindingsPage.tsx')
type Ideas = typeof import('../src/web/pages/family/IdeasPage.tsx')
type Notes = typeof import('../src/web/pages/family/NotesPage.tsx')
type Modules = typeof import('../src/web/pages/family/ModulesPage.tsx')
type ModuleView = typeof import('../src/web/components/ModuleView.tsx')
type Shell = typeof import('../src/web/pages/family/FamilyPage.tsx')

let rows: Rows
let structure: Structure
let findings: Findings
let ideas: Ideas
let notes: Notes
let modules: Modules
let moduleView: ModuleView
/** The shell, because it is what serves the stylesheet a browser is given. */
let shell: Shell

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
  rows = await import('../src/web/pages/family/rows.tsx')
  structure = await import('../src/web/pages/family/StructurePage.tsx')
  findings = await import('../src/web/pages/family/FindingsPage.tsx')
  ideas = await import('../src/web/pages/family/IdeasPage.tsx')
  notes = await import('../src/web/pages/family/NotesPage.tsx')
  modules = await import('../src/web/pages/family/ModulesPage.tsx')
  moduleView = await import('../src/web/components/ModuleView.tsx')
  shell = await import('../src/web/pages/family/FamilyPage.tsx')
})

/** Markup with the hoisted <style> blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** The words a reader sees, with the tags taken out and the entities put back. */
function wordsOf(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * THE STYLESHEET A BROWSER IS ACTUALLY HANDED for a family page.
 *
 * `FamilyPage` joins four sheets in a fixed order into one `<style>` element and serves that. A
 * rule written in one of them and never joined here would be a rule nobody's browser sees, so this
 * takes the served string rather than any of the parts.
 */
function servedSheet(): string {
  const markup = renderToStaticMarkup(h(shell.FamilyPage, { surface: 'modules' }))
  const found = /<style[^>]*>([\s\S]*?)<\/style>/.exec(markup)
  if (found === null) throw new Error('the family shell served no stylesheet at all')
  return found[1] ?? ''
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

/** A module whose checklist holds one item in each of the states this test is about. */
function moduleWith(states: readonly string[], over: Partial<RecordListItem> = {}): RecordListItem {
  return record({
    kind: 'module' as PanelRecord['kind'],
    data: { parts: [{ name: 'Mount', items: states.map((state, at) => ({ text: `item ${at}`, state })) }] },
    ...over,
  })
}

/** Every family page, rendered with one row that carries both marks. */
const pages: [string, () => string][] = [
  [
    'structure',
    () =>
      body(
        h(structure.StructurePage, {
          records: [moduleWith(['done', 'todo'], { origin: 'fixture', incompleteCount: 2 })],
          links: [],
          onFiled: noop,
        }),
      ),
  ],
  [
    'findings',
    () =>
      body(
        h(findings.FindingsPage, {
          records: [record({ kind: 'claim' as PanelRecord['kind'], data: { state: 'measured' }, origin: 'fixture', incompleteCount: 2 })],
          onFiled: noop,
        }),
      ),
  ],
  [
    'ideas',
    () =>
      body(
        h(ideas.IdeasPage, {
          records: [record({ kind: 'idea' as PanelRecord['kind'], data: { state: 'new' }, origin: 'fixture', incompleteCount: 2 })],
          onFiled: noop,
        }),
      ),
  ],
  [
    'notes',
    () =>
      body(
        h(notes.ReportsList, {
          reply: reportsReply([record({ kind: 'note' as PanelRecord['kind'], origin: 'fixture', incompleteCount: 2 })]),
          projects: NO_PROJECTS,
          onShow: noop,
          onGo: noop,
          onFiled: noop,
        }),
      ),
  ],
  [
    'modules',
    () =>
      body(
        h(modules.ModulesPage, {
          records: [moduleWith(['done', 'todo'], { origin: 'fixture', incompleteCount: 2 })],
          links: [],
          onFiled: noop,
        }),
      ),
  ],
]

/**
 * The same pages, given records rich enough that every fold those pages can draw IS drawn.
 *
 * A page only folds when it has something to put behind the fold, so the fixtures above draw none
 * at all. Two of the tests below are about folds and both were silently asserting nothing.
 */
const pagesWithFolds: [string, () => string][] = [
  [
    'structure',
    () =>
      body(
        h(structure.StructurePage, {
          records: [
            record({
              id: 'p1',
              kind: 'pipeline' as PanelRecord['kind'],
              title: 'Transplant v2',
              summary: 'the reach, the grasp and the release',
              data: { blockIds: [] },
              origin: 'fixture',
              incompleteCount: 2,
            }),
          ],
          links: [],
          onFiled: noop,
        }),
      ),
  ],
  // IDEAS FOLDS NOTHING ANY MORE. Criterion change, wave 13j round 11: the family lists' design
  // (report n9Mjk3c_sJRu block b-17) takes the fold off every row of Findings, Ideas, Shelved,
  // Modules and Pipelines. What the fold held is on the record's own page.
]

// ============================================================================ the fixed left edge

describe('nothing of variable width is drawn in front of a row title', () => {
  /**
   * THE MARKS ARE AFTER THE TITLE IN THE MARKUP, which is what makes the title's left edge a
   * constant. `Row` puts `leading` in front of the title and `right` after it, so the order of the
   * two strings in the markup IS the order on the row.
   *
   * A mark of variable width in front of the title is the whole defect: measured at x=600.5 and
   * x=708 on two rows of one screen of `#/modules`.
   */
  // THE FAMILY LISTS SAY "Made-up example" ONCE, AT THE HEADING, when every row of the list carries it.
  // Criterion change, wave 13j round 11, on question 5 of report n9Mjk3c_sJRu.
  // Every page here has one made-up row, so on Findings, Ideas and Modules the mark is beside the
  // heading, once, and the row carries only the unfilled-field mark, after its title.
  const LISTS = ['findings', 'ideas', 'modules']
  it.each(pages.filter(([name]) => LISTS.includes(name)))('%s says the made-up mark once at the heading, and the other mark after the title', (name, render) => {
    const html = render()
    const title = html.indexOf('flst-title')
    const heading = html.indexOf('class="flst-head"')
    const origin = html.indexOf('data-origin="fixture"')
    expect(title, `${name} drew no row title`).toBeGreaterThan(-1)
    expect((html.match(/data-origin="fixture"/g) ?? []).length, `${name} does not say the made-up mark exactly once`).toBe(1)
    expect(origin, `${name} does not put the made-up mark beside its heading`).toBeGreaterThan(heading)
    expect(origin, `${name} does not put the made-up mark beside its heading`).toBeLessThan(title)
    expect(html.indexOf('px-inc-mark'), `${name} draws the unfilled-field mark in front of the title`).toBeGreaterThan(title)
  })

  it.each(pages.filter(([name]) => !LISTS.includes(name)))('%s draws both marks after the title, not in front of it', (name, render) => {
    const html = render()
    // THE REPORTS PAGE DRAWS ITS OWN ROWS, whose title is `rpts-title` (criterion change, 28 September
    // 2026: the approved redesign of block b-5 of report n9Mjk3c_sJRu). The marks must still follow it.
    const title = name === 'notes' ? html.indexOf('rpts-title') : html.indexOf('px-row-title')
    const origin = html.indexOf('data-origin="fixture"')
    const incomplete = html.indexOf('px-inc-mark')
    expect(title, `${name} drew no row title`).toBeGreaterThan(-1)
    expect(origin, `${name} drew no made-up-example mark`).toBeGreaterThan(-1)
    expect(incomplete, `${name} drew no unfilled-field mark`).toBeGreaterThan(-1)
    expect(origin, `${name} draws the made-up-example mark in front of the title`).toBeGreaterThan(title)
    expect(incomplete, `${name} draws the unfilled-field mark in front of the title`).toBeGreaterThan(title)
  })

  /**
   * USER.md invariant 3. Moving a mark out of the way must not become moving it out of sight, and the
   * fold on these rows is a `details`, so a mark inside one would be hidden until pressed.
   *
   * IT USED TO COMPARE TWO POSITIONS IN THE MARKUP AND RETURN EARLY WHEN THERE WAS NO FOLD. Every
   * page it was given drew no fold, so it never reached its own assertion — and the comparison it
   * would have made was wrong anyway, because the marks are in the row's right-hand cell, which
   * comes after the cell the fold is in. Being after a fold is not being inside one. What is
   * checked now is the thing the rule is about: the mark is not within the `details` element.
   */
  it.each(pagesWithFolds)('%s keeps both marks at rest on the row, never behind a press', (name, render) => {
    const html = render()
    const folds = [...html.matchAll(/<details[^>]*class="fam-more"[^>]*>[\s\S]*?<\/details>/g)].map((m) => m[0])
    expect(folds.length, `${name} drew no fold, so this test is asserting nothing`).toBeGreaterThan(0)
    expect(html, `${name} drew no made-up-example mark`).toContain('data-origin="fixture"')
    expect(html, `${name} drew no unfilled-field mark`).toContain('px-inc-mark')
    for (const fold of folds) {
      expect(fold, `${name} folded the made-up-example mark away`).not.toContain('data-origin="fixture"')
      expect(fold, `${name} folded the unfilled-field mark away`).not.toContain('px-inc-mark')
    }
  })
})

// ============================================================================ one column width

describe('the fixed first column is one width on every family page', () => {
  it('puts the width first in the grid, so it is the column the severity cell sits in', () => {
    expect(rows.famCols()).toBe(`${rows.FAMILY_SEV} minmax(0, 1fr) fit-content(40%)`)
    expect(rows.famCols('12rem')).toBe(`${rows.FAMILY_SEV} minmax(0, 1fr) 12rem`)
  })

  /**
   * EVERY ROW A FAMILY PAGE DRAWS IS ON THE ONE GRID, AND THE VALUE ON IT IS `famCols()` ITSELF.
   *
   * This used to read the four page files and check that each declared `famCols()` on the
   * right-hand side of its own constant. That goes red when somebody renames the constant and stays
   * green when a page draws a different width from the right name — and the defect it exists to
   * catch was FOUR DIFFERENT WIDTHS on screen: 130px, 140px, 150px and 9.5rem for a column doing one
   * job, in four files, with nothing that would fail when one of them changed.
   *
   * So the widths are read off the rows themselves. A page writing its own width fails here whatever
   * it calls the constant it wrote it in.
   */
  // THE REPORTS PAGE IS NOT ON THIS GRID. Criterion change, 28 September 2026: its approved redesign
  // (report n9Mjk3c_sJRu, block b-5) takes away the kind column this first column held, and puts a
  // row's facts in columns at its right. Its rows share one grid of their own.
  // NOR ARE FINDINGS, IDEAS AND MODULES. Criterion change, wave 13j round 11: the family lists' design
  // (report n9Mjk3c_sJRu block b-17) draws their rows as plain lists with the facts at the right, on
  // the one grid of components/family/list.tsx, which the test below holds them to.
  it.each(pages.filter(([name]) => name !== 'notes' && !['findings', 'ideas', 'modules'].includes(name)))('%s lays every one of its rows on that one grid', (name, render) => {
    const drawn = [...render().matchAll(/--cols:([^";]+)/g)].map((found) => (found[1] ?? '').trim())
    expect(drawn.length, `${name} drew no row on any grid`).toBeGreaterThan(0)
    for (const cols of drawn) {
      expect(cols, `${name} drew a row on a grid of its own instead of the shared one`).toBe(rows.famCols())
    }
  })

  it.each(pages.filter(([name]) => ['findings', 'ideas', 'modules'].includes(name)))('%s draws every row as a row of the family lists, on no grid of its own', (name, render) => {
    const html = render()
    expect((html.match(/<li class="flst-row"/g) ?? []).length, `${name} drew no row of the family lists`).toBeGreaterThan(0)
    expect(html, `${name} drew a row on a grid of its own`).not.toMatch(/--cols:/)
  })
})

// ============================================================================ the page name

describe('a family page names itself once, and the navigation row is where it is drawn', () => {
  it.each(pages)('%s keeps its heading in the document, so the page can still be announced', (name, render) => {
    // It is not deleted. A screen reader needs a level-one heading to announce the page and to
    // jump to, and this is the same thing HomePage does with a screen-reader-only heading.
    expect(render(), `${name} has no level-one heading at all`).toContain('<h1')
  })

  /**
   * THE NAME IS WORDS INSIDE THAT HEADING, NOT AN EMPTY ELEMENT.
   *
   * IT USED TO TAKE THE HEADING OFF THE SCREEN AND THAT WAS THE DEFECT. The rows sheet clipped
   * `.fam-title` to one pixel, so six pages opened with nothing in the content area saying what they
   * were, while Plans, Everything, Pipelines and Agent runs all drew theirs. Four testers, given the
   * product and no documents, each named it as what slowed them down on every page.
   *
   * The argument for clipping it was that the rail row already says the name. That is true and it is
   * not enough: a reader who has scrolled, or who is on a phone where the rail is two letters wide,
   * then has the name nowhere.
   */
  it.each(pages)('%s writes its own name inside that heading', (name, render) => {
    const heading = /<h1[^>]*class="fam-title"[^>]*>([\s\S]*?)<\/h1>/.exec(render())
    expect(heading, `${name} draws no page heading at all`).not.toBeNull()
    expect(wordsOf(heading?.[1] ?? '').length, `${name} draws an empty page heading`).toBeGreaterThan(0)
  })

  /**
   * AND THE SHEET A BROWSER IS SERVED DOES NOT TAKE IT BACK OFF THE SCREEN.
   *
   * This is a stylesheet fact and it is written as one, because whether 32px of heading is painted
   * is pixels and nothing in this repository opens a family page in a browser. What it reads is the
   * string the shell serves, in the order it serves it, so the LAST rule to set the heading's size
   * is the one that wins — which is the thing the old check was really trying to say when it
   * asserted that one of the four sheets held no rule for it.
   */
  it('serves a sheet whose last word on the page heading is the size the other pages use', () => {
    const sheet = servedSheet().replace(/\/\*[\s\S]*?\*\//g, '')
    const sizes = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => (m[1] ?? '').split(',').some((s) => s.trim().endsWith('.fam-title')))
      .flatMap((m) => [...(m[2] ?? '').matchAll(/font-size:\s*([^;]+);/g)].map((d) => (d[1] ?? '').trim()))
    expect(sizes.length, 'nothing in the served sheet sets the page heading’s size').toBeGreaterThan(0)
    expect(sizes[sizes.length - 1], 'the page name is not drawn at the size Plans and Everything use').toBe(
      'var(--fs-6)',
    )
    // AND NOTHING HIDES IT. These are the four ways the old rule took it off the screen while
    // leaving it in the document, which is what made the defect invisible to every other test.
    const heading = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => (m[1] ?? '').split(',').some((s) => s.trim().endsWith('.fam-title')))
      .map((m) => (m[2] ?? '').replace(/\s+/g, ' '))
      .join(' ')
    for (const hidden of ['clip-path', 'display: none', 'visibility: hidden', 'height: 1px']) {
      expect(heading, `the served sheet hides the page name with ${hidden}`).not.toContain(hidden)
    }
  })

  it('serves the row rules with the rest, or they are written and never reach a browser', () => {
    // A rule written in rows.tsx and never joined into the served sheet is a rule nobody sees. This
    // used to read the shell's source for the name of the constant; it now reads what it serves.
    expect(servedSheet()).toContain(rows.FAMILY_ROWS_CSS.trim())
  })
})

// ============================================================================ what stopped

describe('a module reports what stopped, not only what finished', () => {
  it('counts every item word in one walk of the checklist', () => {
    const parsed = moduleView.parseModule({
      parts: [
        {
          name: 'Mount',
          items: [
            { text: 'a', state: 'done' },
            { text: 'b', state: 'done' },
            { text: 'c', state: 'blocked' },
            { text: 'd', state: 'failed' },
            { text: 'e', state: 'todo' },
          ],
        },
      ],
    })
    const condition = moduleView.moduleCondition(parsed.parts)
    expect(condition.byState).toEqual({ todo: 1, doing: 0, done: 2, failed: 1, blocked: 1 })
    // AND EVERY WORD IS PRESENT AT ZERO. `undefined` and `0` read the same in a template and only
    // one of them is an answer.
    expect(Object.keys(condition.byState).sort()).toEqual(['blocked', 'doing', 'done', 'failed', 'todo'])
  })

  for (const [name, page] of [
    ['modules', () => modules.ModulesPage],
    ['structure', () => structure.StructurePage],
  ] as const) {
    it(`${name} prints the blocked and the failed counts beside the done count`, () => {
      const html = body(
        h(page() as never, {
          records: [moduleWith(['done', 'done', 'blocked', 'blocked', 'failed', 'todo'])],
          links: [],
          onFiled: noop,
        }),
      )
      // Criterion change, wave 13j round 11: the Modules page says "2 of 6 checked" at the row's right
      // (report n9Mjk3c_sJRu block b-17); the structure page keeps "2 / 6".
      expect(html).toContain(name === 'modules' ? '2 of 6 checked' : '2 / 6')
      expect(html).toContain('2 blocked')
      expect(html).toContain('1 failed')
    })

    it(`${name} prints neither when the checklist holds no stopped item`, () => {
      // A zero on every row is the mark-on-everything this product keeps having to undo, and it is
      // not an absence being hidden: the done count and its denominator are both on the row, so
      // "4 / 4 checked" already says that nothing stopped.
      const html = body(
        h(page() as never, {
          records: [moduleWith(['done', 'done', 'done', 'done'])],
          links: [],
          onFiled: noop,
        }),
      )
      expect(html).toContain(name === 'modules' ? '4 of 4 checked' : '4 / 4')
      expect(html).not.toContain('blocked')
      expect(html).not.toContain('failed')
    })
  }

  it('still calls an empty checklist an answer rather than drawing it as 0 / 0', () => {
    const html = body(h(modules.ModulesPage, { records: [moduleWith([])], links: [], onFiled: noop }))
    expect(html).toContain('class="px-absent"')
    expect(html).not.toContain('0 / 0')
  })
})

// ============================================================================ emphasis and folds

describe('bold and the fold marker each carry a fact, or they are not drawn', () => {
  it('spends no bold on an empty state, which carries no number and no comparison', () => {
    const html = body(h(findings.FindingsPage, { records: [], onFiled: noop }))
    expect(html).toContain('<span class="px-absent">—</span>')
    expect(html).not.toContain('<b>Nothing has been measured yet.</b>')
  })

  it('spends no bold tag on a timestamp that is drawn at normal weight anyway', () => {
    // `.fam-when b` sets font-weight: 400, so the tag was carrying a colour and no emphasis at all.
    const html = body(
      h(findings.FindingsPage, {
        records: [record({ kind: 'claim' as PanelRecord['kind'], data: { state: 'measured' } })],
        onFiled: noop,
      }),
    )
    // Criterion change, wave 13j round 11: the timestamp is in the family lists' own date column
    // (report n9Mjk3c_sJRu block b-17), which is drawn at normal weight.
    expect(html).toMatch(/<span class="flst-when"><time/)
    expect(html).not.toMatch(/<b><time/)
  })

  /**
   * A FOLD MARKER IS A NAME FOR WHAT IS INSIDE IT, AND NEVER A SENTENCE.
   *
   * Measured: "How this was measured, and how sure we are" stood on all nine rows of `#/findings` —
   * nine words, nine times, on one screen. A marker still says what is inside it, because a fold
   * whose label does not say what it holds is a fold nobody opens.
   *
   * IT READS THE MARKERS THE PAGES DRAW, WHICH IS MORE THAN THE ONES ANYBODY TYPED. `MoreFacts`
   * falls back to joining the stored field names when a caller gives no phrase — that fallback is
   * what produced "measured on, method, confidence, what it is" — so a page can draw a marker that
   * appears in no file. Scanning the files for `summary="…"` could not see one.
   *
   * FIVE WORDS, AND WHERE THAT LINE COMES FROM. The old limit was 22 characters and nobody decided
   * it. The sentence that was deleted is nine words; the two markers in the product are four each.
   * Five is the line between them, and what it stands for is the rule in the heading: a name, not a
   * sentence.
   */
  it.each(pagesWithFolds)('%s marks its folds with a name and not a sentence', (name, render) => {
    const markers = [...render().matchAll(/<summary[^>]*class="fam-more-sum"[^>]*>([\s\S]*?)<\/summary>/g)].map(
      (found) => wordsOf(found[1] ?? ''),
    )
    expect(
      markers.length,
      `${name} folds nothing any more, so this test is asserting nothing — point it at whatever ` +
        'folds now, or take the rule to the surface that has the folds',
    ).toBeGreaterThan(0)
    for (const marker of markers) {
      const said = marker.split(' ').filter((word) => /\p{Letter}/u.test(word))
      expect(said.length, `the fold marker "${marker}" is a sentence, not a name`).toBeLessThanOrEqual(5)
      expect(marker, `the fold marker "${marker}" ends as a sentence does`).not.toMatch(/\.$/)
      expect(marker, `the fold marker "${marker}" does not say what is inside it`).not.toMatch(/^(more|details)$/i)
    }
  })
})

// ============================================================================ one left edge

/**
 * THE PAGE'S OWN TEXT STARTS WHERE ITS PANELS START, AND WHERE EVERY OTHER PAGE'S NAME STARTS.
 *
 * Measured in Chromium at 1440 on 15 August, on the live corpus. The page title sat at x=270 on
 * Work to do, Modules, Findings, Ideas and Reports and notes, and at x=262 on Home, Plans,
 * Decisions, Pipelines, Agent runs, Everything and Missing and unused. Seven pages against five,
 * for one object that does one job.
 *
 * The 8px came from three rules in two files giving the head, the count line and the foot a left
 * and right pad of one unit each. 262 is where the panels between them start, so with the pad gone
 * the title, the count line, every panel edge and the foot make one straight edge down the page.
 *
 * WHAT DOES NOT LOSE ITS STEP, AND THIS IS THE HALF THAT IS EASY TO BREAK NEXT. `.fam-what` and
 * `.fam-fold` sit INSIDE a panel, and their pad is what puts them on the same edge as the rows they
 * are about — x=279, not x=271. A step into a panel is what says the rows belong to it.
 *
 * THIS IS A STYLESHEET CHECK AND IT SAYS SO. Three left edges being equal is a fact about pixels,
 * and nothing in this repository opens a family page in a browser. Two things changed after the
 * audit of 3 September 2026, and both make it harder to pass while the edges are wrong:
 *
 *   IT READS THE SHEET THE SHELL SERVES, not one of the four files that go into it. A rule written
 *   in either file, in any order, is in what this reads.
 *   IT READS EVERY HORIZONTAL OFFSET, not the one `padding` declaration it happened to find first.
 *   A margin, a padding-inline or a left border moves an edge exactly as a padding does, and the
 *   old check would have stayed green through any of them.
 *
 * WHAT WOULD REPLACE IT is a browser test that opens a family page at 1440 and measures the left
 * edge of the page name, the count line, the foot and the first panel. That is owed.
 */
describe('a family page draws its name where its panels start', () => {
  /** Comments come out first: one sits between the previous brace and the next selector. */
  const bare = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

  /**
   * EVERY DECLARATION IN THE SERVED SHEET THAT MOVES THIS SELECTOR SIDEWAYS, in the order the
   * browser reads them. A shorthand is reduced to the side it sets: `padding: 0 var(--pad)` sets
   * the sides to `var(--pad)`, `padding: 0` sets them to `0`.
   */
  const sideways = (selector: string): string[] => {
    const found: string[] = []
    for (const rule of bare(servedSheet()).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const heads = (rule[1] ?? '').split(',').map((s) => s.trim())
      if (!heads.some((s) => s === selector || s.endsWith(` ${selector}`))) continue
      const declared = rule[2] ?? ''
      for (const one of declared.split(';')) {
        const pair = /^\s*(padding|margin|border-left-width|padding-left|margin-left|padding-inline|margin-inline|padding-inline-start|margin-inline-start)\s*:\s*(.+)$/.exec(
          one,
        )
        if (pair === null) continue
        const property = pair[1] ?? ''
        const value = (pair[2] ?? '').trim()
        if (property === 'padding' || property === 'margin') {
          // The sides of a two- to four-part shorthand, and the single value of a one-part one.
          const parts = value.split(/\s+(?![^(]*\))/)
          found.push((parts.length === 1 ? parts[0] : parts[3] ?? parts[1]) ?? '')
        } else {
          found.push(value.split(/\s+(?![^(]*\))/)[0] ?? '')
        }
      }
    }
    return found
  }

  it('starts the page name, the count line and the foot at the page’s own left edge', () => {
    // Deleting the pad on the head alone would move the misalignment down rather than end it: a
    // count line at 270 under a title at 262 is the same defect with a different pair of objects.
    for (const selector of ['.fam-head', '.fam-arith', '.fam-foot']) {
      const offsets = sideways(selector)
      expect(offsets.length, `nothing in the served sheet says where ${selector} starts`).toBeGreaterThan(0)
      for (const offset of offsets) {
        expect(offset, `${selector} is indented past the panels it sits between`).toBe('0')
      }
    }
  })

  it('gives the three of them one answer, so they cannot disagree with each other', () => {
    // The rule is that they line up, and that is the claim, not that any one of them reads zero.
    const answers = ['.fam-head', '.fam-arith', '.fam-foot'].map((selector) => [...new Set(sideways(selector))].join(' '))
    expect(new Set(answers).size, `the page name, the count line and the foot start at ${answers.join(' / ')}`).toBe(1)
  })

  it('keeps the step INTO a panel, because that is what says the rows belong to it', () => {
    // The band's own line and its fold marker are about the rows below them and line up with them,
    // at one pad in from the panel body. This is not the same rule and must not be flattened with
    // the three above.
    for (const selector of ['.fam-what', '.fam-fold']) {
      const offsets = sideways(selector)
      expect(offsets.length, `nothing in the served sheet says where ${selector} starts`).toBeGreaterThan(0)
      expect(offsets, `${selector} no longer lines up with the rows it is about`).toContain('var(--pad)')
    }
  })
})
