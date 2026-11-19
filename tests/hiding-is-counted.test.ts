// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HIDING ONE BLOCK CHANGES A NUMBER THE READER CAN SEE. THAT IS THE WHOLE SAFETY OF PROJECTIONS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE MUST NOT BE NARROWED
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/projections.md` §8.4 names this file and says it is the one test in that
 * design that must not be narrowed. The mechanism it guards is a way of taking a paragraph of
 * somebody's writing off a normal reader's screen. The owner's brief forbids *classifying away the
 * original words*; what makes a fold different from a classification is that the reader is told,
 * on the page they were reading, that something is not being shown and how much.
 *
 * SO IT IS STATED AS A PROPERTY OF SURFACES rather than of a component: for each surface that draws
 * blocks, render, read the count OFF THE DRAWN MARKUP, mark one block, render again, and assert the
 * number went up. It reads what is drawn and never what a function returned, because the fault this
 * whole campaign exists to break is a mechanism that works and reaches no screen.
 *
 * THE TWO SURFACES ARE THE TWO BRANCHES OF `SummaryBlocks`, and they are genuinely different code:
 * the report body goes through `reportAt` and draws only the blocks a reading length chose, and the
 * module summary draws all of them and has no length control at all. §8.1(c) measured that the
 * module page never draws the existing not-drawn count, which is why a count living inside that
 * control could not have been this one.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hiddenFromReader } from '../src/shared/audience.ts'
import { detailKeyForSurface } from '../src/shared/detail.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')

let sb: SummaryBlocksModule
let mode: ModeModule
let store: Map<string, string>

beforeAll(async () => {
  store = new Map<string, string>()
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
  sb = await import('../src/web/components/SummaryBlocks.tsx')
  mode = await import('../src/web/lib/mode.ts')
})

beforeEach(() => {
  store.clear()
  // THE REPORT BODY IS READ AT FULL HERE, AND THIS FILE NOW SAYS SO RATHER THAN INHERITING IT.
  // The owner's act 3a of 15 September 2026 made a record page open at the conclusion, where the body
  // holds the summary and none of the blocks this file marks and counts.
  // The choice is written the way a reader's own is, through the same key function the page reads,
  // so this file is about hiding and counting again and not about the level a page opens at. That
  // level has its own test in tests/a-reader-goes-no-lower-than-conclusion.test.ts, which stores
  // nothing. The module branch below draws no reading length and is unaffected either way.
  store.set(detailKeyForSurface('reportContent'), 'full')
  // The mode is read once at import time and kept in a module variable, so a test asks for a
  // reader by calling the same function the switch calls rather than by writing the stored word.
  mode.setMode('normal')
})

// ------------------------------------------------------------------------------- the record
//
// A tree, not a list, because §8.1(b) measured that the existing count sees only the top level.
// One block is nested inside a section and one is behind the SECOND tab of a tabs block, which is
// not in the DOM on first paint at all.

const BLOCKS: SummaryBlock[] = [
  { id: 'b-open', type: 'text', text: 'What this report is about, in the words somebody wrote.' },
  {
    id: 'b-part',
    type: 'section',
    title: 'How it was measured',
    blocks: [
      { id: 'b-part-lead', type: 'text', text: 'Every number below was counted from the running server.' },
      { id: 'b-part-deep', type: 'code', language: 'bash', code: 'sqlite3 data/panelx.db "select count(*) from records"' },
    ],
  },
  {
    id: 'b-tabs',
    type: 'tabs',
    tabs: [
      { id: 't-what', label: 'What happened', blocks: [{ id: 'b-t1', type: 'text', text: 'The shell cracked on the third print.' }] },
      { id: 't-how', label: 'How it is wired', blocks: [{ id: 'b-t2', type: 'text', text: 'The resolver reads the ladder and hands back a rung.' }] },
    ],
  },
  { id: 'b-close', type: 'text', text: 'What is left to do, and who it is waiting on.' },
]

const STORED = {
  title: 'A report with machinery in it',
  summary: 'One sentence a person wrote about what this says.',
  body: { field: 'data.blocks', written: true },
}

// `wholeRecord: null` IS THIS FIXTURE SAYING IT ANNOUNCES NO TREE, rather than an `as never` on the
// props hiding the fact that it never decided. The field is required and nullable so that a caller
// has to answer; these blocks are stored nowhere and this file has no links to derive relation
// sections from, so null is the true answer. See `BlocksInRecord.wholeRecord`.
const REPORT = { recordId: 'rec-machinery', kind: 'report', stored: STORED, wholeRecord: null }
const MODULE = { recordId: 'rec-machinery', kind: 'module', wholeRecord: null }

/**
 * Mark one block of the tree, by id, wherever it is. Returns a NEW tree; nothing is mutated.
 *
 * `block.type !== 'quote'` IS THE TYPE DOING ITS JOB, not a convenience. `QuoteBlock` narrows
 * `audience` to `'everyone'`, so spreading `'developers'` over the whole union does not compile —
 * which is §9.2 rule 2 enforced by the compiler before any checker runs. This test does not mark
 * quotes, and `tests/audience.test.ts` is where the refusal itself is proved.
 */
function mark(blocks: readonly SummaryBlock[], id: string): SummaryBlock[] {
  return blocks.map((block): SummaryBlock => {
    const marked =
      block.id === id && block.type !== 'quote' ? { ...block, audience: 'developers' as const } : block
    if (marked.type === 'section' || marked.type === 'grid') return { ...marked, blocks: mark(marked.blocks, id) }
    if (marked.type === 'columns') return { ...marked, columns: marked.columns.map((c) => mark(c, id)) }
    if (marked.type === 'tabs') return { ...marked, tabs: marked.tabs.map((t) => ({ ...t, blocks: mark(t.blocks, id) })) }
    return marked
  })
}

/** Draw the report body — the branch that goes through a reading length. */
function drawReport(blocks: readonly SummaryBlock[]): string {
  return renderToStaticMarkup(
    // SEE tests/a-report-says-less-by-showing-fewer-things.test.ts FOR WHAT THIS CAST HIDES: an
    // `editorial` layout this component has no case for and a `stored` missing
    // `declaresShortForms`. Measured with the compiler on 2 September 2026 and reported;
    // `wholeRecord` is answered above rather than left to the cast.
    h(sb.SummaryBlocks, { blocks, layout: 'editorial', inRecord: REPORT } as never),
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

/** Draw a module's curated summary — the branch with no length control and no `only` set. */
function drawModule(blocks: readonly SummaryBlock[]): string {
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, { blocks, layout: 'panel', inRecord: MODULE } as never),
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

/**
 * THE NUMBER A READER CAN SEE, READ OFF THE DRAWN PAGE.
 *
 * Null when the page says nothing about hidden blocks at all — which is what "the block is gone and
 * there is no number anywhere" looks like, and is the state this whole file exists to make
 * impossible. It reads the count out of the element's own attribute rather than out of the sentence
 * so that rewording the button is not a test failure, and the sentence is asserted separately.
 */
function countOnPage(html: string): number | null {
  const m = /class="sb-fordev[^"]*"[^>]*data-count="(\d+)"/.exec(html)
  return m === null ? null : Number(m[1])
}

/** The words a reader sees, with the markup taken out. */
function readable(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('a block that is not shown is counted, on the page it left', () => {
  it('says nothing at all when nothing is marked, on both surfaces', () => {
    // Absence gets no weight. A permanent "0 for developers" would be furniture on 531 records.
    expect(countOnPage(drawReport(BLOCKS))).toBe(null)
    expect(countOnPage(drawModule(BLOCKS))).toBe(null)
  })

  for (const [surface, draw] of [
    ['the report body', drawReport],
    ['a module summary', drawModule],
  ] as const) {
    it(`counts a marked TOP-LEVEL block on ${surface}, and stops drawing it`, () => {
      const before = draw(BLOCKS)
      expect(readable(before)).toContain('What is left to do')
      const after = draw(mark(BLOCKS, 'b-close'))
      expect(countOnPage(after)).toBe(1)
      expect(readable(after)).not.toContain('What is left to do')
    })

    it(`counts a marked NESTED block on ${surface}, which a top-level count cannot see`, () => {
      const after = draw(mark(BLOCKS, 'b-part-deep'))
      expect(countOnPage(after)).toBe(1)
      expect(after).not.toContain('sqlite3')
      // The section it lived in is still drawn, and so is its sibling: one block left, not a branch.
      expect(readable(after)).toContain('How it was measured')
      expect(readable(after)).toContain('counted from the running server')
    })

    it(`counts a marked block BEHIND A CLOSED TAB on ${surface}, which is not in the DOM either way`, () => {
      const before = draw(BLOCKS)
      // The second tab's block is not drawn before the mark, so a count read off the DOM would say
      // nothing changed. §8.2 counts over the record's block tree for exactly this case.
      expect(before).not.toContain('hands back a rung')
      const after = draw(mark(BLOCKS, 'b-t2'))
      expect(countOnPage(after)).toBe(1)
    })

    it(`counts a marked CONTAINER and everything under it on ${surface}`, () => {
      const after = draw(mark(BLOCKS, 'b-part'))
      // The section, its lead and its code block: three blocks are off the page, not one.
      expect(countOnPage(after)).toBe(3)
      expect(readable(after)).not.toContain('How it was measured')
    })

    it(`moves the number by exactly one when one more block is marked on ${surface}`, () => {
      const one = countOnPage(draw(mark(BLOCKS, 'b-close')))
      const two = countOnPage(draw(mark(mark(BLOCKS, 'b-close'), 'b-open')))
      expect(one).toBe(1)
      expect(two).toBe(2)
    })
  }

  it('agrees with an independent walk of the tree, which is not the function the page calls', () => {
    // THE COUNT IS RIGHT AGAINST A SOURCE THAT IS NOT THE FUNCTION UNDER TEST. This walk is written
    // here, flattens the tree by hand, and knows nothing of rungs or containers-take-their-children.
    const flatten = (blocks: readonly SummaryBlock[]): SummaryBlock[] =>
      blocks.flatMap((b) => [
        b,
        ...(b.type === 'section' || b.type === 'grid'
          ? flatten(b.blocks)
          : b.type === 'columns'
            ? b.columns.flatMap(flatten)
            : b.type === 'tabs'
              ? b.tabs.flatMap((t) => flatten(t.blocks))
              : []),
      ])
    const marked = mark(BLOCKS, 'b-part')
    const expected = (() => {
      // Everything at or under a marked block, counted by walking the flat list of the SUBTREE.
      const top = flatten(marked)
      const hidden = new Set<string>()
      const bury = (b: SummaryBlock): void => {
        hidden.add(b.id)
        for (const one of flatten([b]).slice(1)) hidden.add(one.id)
      }
      for (const b of top) if (b.audience === 'developers') bury(b)
      return hidden.size
    })()
    expect(expected).toBe(3)
    expect(countOnPage(drawModule(marked))).toBe(expected)
    expect(hiddenFromReader(marked, null, 'normal')).toBe(expected)
  })

  it('draws the count for a normal reader and never for a developer', () => {
    const marked = mark(BLOCKS, 'b-close')
    mode.setMode('inspect')
    const asDeveloper = drawModule(marked)
    expect(countOnPage(asDeveloper)).toBe(null)
    expect(readable(asDeveloper)).toContain('What is left to do')
    // And the developer is told which paragraph is not on everybody's page.
    expect(readable(asDeveloper)).toContain('Machinery')
  })

  it('names the record rather than the page, because one of the blocks may be behind a tab', () => {
    const html = drawModule(mark(BLOCKS, 'b-t2'))
    const label = /aria-label="([^"]*for developers[^"]*|[^"]*written for developers[^"]*)"/.exec(html)
    expect(label, 'the count must carry an accessible name').not.toBe(null)
    expect(label?.[1]).toContain('in this record')
    expect(label?.[1]).not.toContain('on this page')
  })

  it('says the number in words a reader can act on, not only in an attribute', () => {
    const html = drawModule(mark(BLOCKS, 'b-close'))
    expect(readable(html)).toContain('1 for developers')
  })
})

describe('pressing the count shows the blocks, for this visit and this record only', () => {
  it('shows a marked block once the visit has revealed this record, and marks it as machinery', () => {
    const marked = mark(BLOCKS, 'b-close')
    expect(readable(drawModule(marked))).not.toContain('What is left to do')
    store.set('mole-office.here.machinery.rec-machinery', '1')
    const shown = drawModule(marked)
    expect(readable(shown)).toContain('What is left to do')
    expect(readable(shown)).toContain('Machinery')
    // The number does not go away when the blocks are shown; it says they are shown.
    expect(countOnPage(shown)).toBe(1)
    expect(readable(shown)).toContain('shown')
  })

  it('is keyed to one record, so revealing one report does not open the next', () => {
    store.set('mole-office.here.machinery.some-other-record', '1')
    expect(readable(drawModule(mark(BLOCKS, 'b-close')))).not.toContain('What is left to do')
  })

  it('marks the tab that holds a revealed block, so the press is never one that changes nothing', () => {
    const marked = mark(BLOCKS, 'b-t2')
    const before = drawModule(marked)
    expect(before).not.toContain('sb-machinery-tab')
    store.set('mole-office.here.machinery.rec-machinery', '1')
    const after = drawModule(marked)
    // The block itself is behind a closed tab and still is not drawn. What changed is the tab.
    expect(after).not.toContain('hands back a rung')
    expect(after).toContain('sb-machinery-tab')
  })
})
