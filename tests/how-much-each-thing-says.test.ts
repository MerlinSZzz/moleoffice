// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `How much each thing says` — THE SETTINGS GRID, THE COUNTER ROW AND THE PREVIEW.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE CLAIMS WORTH A TEST
 * ---------------------------------------------------------------------------------------
 *
 * 1. NO WORD ON THE SCREEN NAMES THE AXIS. The ladder has SEVEN positions, and the header above
 *    them reads `Level 1  Level 2  Conclusion  Level 4  Level 5  Level 6  Full` — the words the
 *    report's own level control uses, which is criterion A18. Only `Conclusion` and `Full` are
 *    words; the other five are numbered.
 *    The internal name of a length and the phrase explaining it are NOT drawn:
 *    they live in accessible names, which is a different channel and is allowed. That half is
 *    checked against the WORDS A READER SEES, with the markup stripped.
 *
 *    THE HEADER OF THIS FILE SAID SIX POSITIONS READING `1 2 3 4 5 Full` UNTIL 3 SEPTEMBER 2026,
 *    and the case under it looked for those single characters anywhere in the page text. Six was
 *    one short — a sixth authored length was declared on 30 August 2026 — and a search for `1`
 *    anywhere in a grid full of counts cannot go red. Both are repaired below.
 *
 * 2. THE COUNTER ROW IS COMPUTED BY THE SAME RESOLVER THE SCREEN USES. This is the campaign's own
 *    honesty gate: a repair that wires every reader up and moves no supply has to leave the number
 *    where the owner can see it. So the numbers are checked against `detailOf` walked by hand over
 *    the same records, not against a constant.
 *
 * 3. A COUNT IS NEVER A PERCENTAGE AND NEVER A GUESS. A record whose kind has no place for a length
 *    is out of that position's denominator; a record that has a place and nothing written is in the
 *    denominator and out of the numerator. Both cases are checked with real kinds.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PREVIEW IS TESTED AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Because it is the whole point of the control. A person must SEE what a position means rather
 * than read about it, so a preview drawing an invented example would be worse than no preview: it
 * would teach the wrong thing convincingly. `previewRecord` picks a real record and picks the same
 * one every time, and that is checked here.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { detailOf, levelLabel, RUNGS, RUNG_SPECS } from '../src/shared/detail.ts'
import { isByPartLevel } from '../src/shared/zoom.ts'
import { formsWrittenIn } from '../src/shared/reportrungs.ts'
import { detailSupplyOf } from '../src/shared/detailsupply.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { setMode } from '../src/web/lib/mode.ts'

type Says = typeof import('../src/web/components/DetailSays.tsx')
type Source = typeof import('../src/shared/detailsource.ts')

let says: Says
let source: Source
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
  says = await import('../src/web/components/DetailSays.tsx')
  source = await import('../src/shared/detailsource.ts')
})

beforeEach(() => {
  store.clear()
})

/** A record of a kind that declares short forms and one that does not, plus a body and no body. */
function record(over: Partial<PanelRecord> & { id: string; kind: string }): PanelRecord {
  return {
    workspaceId: 'w',
    ownerId: 'o',
    title: 'A title somebody wrote',
    summary: null,
    data: {},
    createdAt: '2026-08-20T09:00:00',
    updatedAt: '2026-08-20T09:00:00',
    ...over,
  } as PanelRecord
}

const CORPUS: PanelRecord[] = [
  // A report: declares short forms, holds blocks, and has one written.
  record({
    id: 'r-1',
    kind: 'report',
    title: 'The shell cracked on the third print',
    summary: 'Three runs, one crack, always the same corner.',
    data: { blocks: [{ id: 'b', type: 'text', text: 'hello' }], shortForms: { label: { text: 'Shell crack', writtenBy: 'human', madeFrom: { seq: 3, contentHash: 'abc' } } } },
  }),
  // A module: declares short forms, holds a curated summary, and nobody has written one.
  record({ id: 'r-2', kind: 'module', title: 'The gripper', summary: 'What the gripper does.' }),
  // A problem: no short forms, no blocks. Two rungs and no more.
  record({ id: 'r-3', kind: 'problem', title: 'The mount slips' }),
]

/** What a reader sees: the markup with its tags and escapes taken out. */
function readable(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * THE GRID, DRAWN. `DetailGrid` takes what the server counts and nothing else, and
 * `detailSupplyOf` is the server's own counting, so the props are written as they are rather than
 * cast past the type that describes them.
 */
function draw(records: readonly PanelRecord[] = CORPUS): string {
  return renderToStaticMarkup(h(says.DetailGrid, { answer: detailSupplyOf(records) }))
}

describe('the grid names no position after what it is', () => {
  it('really drew the grid, so a search of an empty string cannot pass quietly', () => {
    const html = draw()
    expect(html).toContain('Everywhere')
    expect(html).toContain('Report content')
  })

  /**
   * THE HEADER DRAWS ONE COLUMN PER POSITION, IN LADDER ORDER, IN THE CONTROL'S OWN WORDS.
   *
   * WHAT THIS ASSERTED UNTIL 3 SEPTEMBER 2026, AND WHY IT COULD NOT GO RED. It read the whole grid
   * as one run of text and asked whether the characters `1 2 3 4 5 Full` were somewhere in it. The
   * grid is full of counts, so `1` is in it whatever the header draws; the sixth position was not
   * in the list at all; and a header that drew nothing would still pass on the counter row's
   * numbers. It could not fail, and it never looked at position 6.
   *
   * WHAT IT ASSERTS NOW is the drawn header itself, read off the cells the header is made of: one
   * per rung, in the ladder's order, each carrying the words the report's own level control uses.
   * A position dropped, added, reordered or renamed differently from the control fails here.
   */
  it('draws one column header per position, in order, in the words the level control uses', () => {
    const drawn = [...draw().matchAll(/<span class="dsay-col">([^<]*)<\/span>/g)].map((m) => m[1] ?? '')
    expect(drawn, 'the grid drew a different number of column headers than the ladder has positions')
      .toEqual(RUNGS.map((rung) => levelLabel(rung)))
  })

  /**
   * AND THE WORDS THEMSELVES ARE THE ONES THE RULE NAMES. Two positions are words and the other five
   * are numbered, so a bare numeral never stands
   * alone as the name of a length and no other length gains a word of its own.
   *
   * WITHOUT THIS THE CASE ABOVE IS A TAUTOLOGY: it compares the header against the same function
   * the header is drawn from, so it holds the count and the order and says nothing about the words.
   */
  it('names only the conclusion and the whole report in words, and numbers the other five', () => {
    const drawn = [...draw().matchAll(/<span class="dsay-col">([^<]*)<\/span>/g)].map((m) => m[1] ?? '')
    const words = drawn.filter((one) => !/^Level \d+$/.test(one))
    expect(words, 'a position other than the conclusion and the whole report is named in words')
      .toEqual(['Conclusion', 'Full'])
    expect(drawn.filter((one) => /^Level \d+$/.test(one)).length, 'the numbered positions are not five')
      .toBe(RUNGS.length - 2)
  })

  /**
   * THE RULE THE CONTRACT STATES AS "NO WORD ON SCREEN NAMES THE AXIS". The internal names for the
   * seven lengths — and the phrases that explain them — are a screen reader's business and a hover's,
   * and they may not be printed.
   */
  it('prints no rung name and no phrase where a reader would read it', () => {
    const text = readable(draw()).toLowerCase()
    for (const rung of RUNGS) {
      const spec = RUNG_SPECS[rung]
      if (rung !== 'full') {
        expect(text, `the grid prints the rung name "${rung}"`).not.toContain(` ${rung} `)
      }
      expect(text, `the grid prints the phrase "${spec.phrase}"`).not.toContain(spec.phrase.toLowerCase())
    }
    expect(text, 'the grid prints the word this axis is deliberately not called').not.toContain('detail')
  })

  it('puts every phrase in an accessible name, so nothing is lost by not printing it', () => {
    // THE ENTITIES COME BACK OUT AND THE TAGS STAY IN. A phrase is the accessible name of an
    // element, so it lives inside an attribute and the markup cannot be stripped to read it. Three
    // of the seven phrases hold an apostrophe — *the report's outline, one line per part* — which
    // React writes as `&#x27;`, so a search of the raw markup for the declared phrase fails on
    // those three while the name is on the element. Decoding is the reader catching up with the
    // renderer; nothing about what is asserted changes.
    const html = draw().replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    for (const rung of RUNGS) {
      expect(html, `nothing says what position ${rung} is`).toContain(RUNG_SPECS[rung].phrase)
    }
  })

  it('gives every row a radio group named after the thing it sets', () => {
    const html = draw()
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('aria-label="Everywhere"')
    expect(html).toContain('aria-label="Review pane"')
    // Eleven rows: the one they inherit from and the ten surfaces.
    expect((html.match(/role="radiogroup"/g) ?? []).length).toBe(11)
  })
})

describe('the counter row is computed by the readers the screen uses', () => {
  /**
   * THE DENOMINATOR IS THE RESOLVER'S AND IT IS WALKED BY HAND HERE.
   *
   * THE NUMERATOR IS NOT THE RESOLVER'S AT ALL SINCE 3 SEPTEMBER 2026. It walked `detailOf` and
   * counted every position whose `drew` was the position asked for, which counted the record's own
   * `title` column as position 2 and its `summary` column as position 3. But a
   * column is not a form written for a length (criterion A14a), so what is counted is what is
   * stored under `data.shortForms` — which is what `formsWrittenIn` answers, and it is asked here
   * rather than re-derived.
   */
  it('counts what is written, of what could be, position by position', () => {
    const supply = says.supplyOf(CORPUS)
    for (const position of supply) {
      let written = 0
      let possible = 0
      for (const rec of CORPUS) {
        // THE LABEL AND THE THREE BY-PART LENGTHS ARE COUNTED OVER THE REPORTS, criterion A14b: a
        // label is what a report is drawn as in a list and the by-part structure is what a report
        // is written in, so a module in that denominator is work nobody means to do. Positions 2
        // and 3 are the record's own columns, which every kind has, so they are not filtered.
        // Stated here rather than imported, because a walk that borrowed the grid's own rule would
        // agree with the grid whatever either of them said.
        const reportsOnly = position.rung !== 'full' && position.rung !== 'title' && position.rung !== 'gist'
        if (reportsOnly && rec.kind !== 'report') continue
        const answer = detailOf(source.detailSourceOf(rec), position.rung)
        if (answer.kind === 'nothing' || answer.gap === 'notOnThisKind') continue
        possible += 1
        // FULL IS THE RECORD ITSELF, so what is written there is the body and not a short form.
        const has =
          position.rung === 'full'
            ? answer.drew === 'full'
            : formsWrittenIn(source.detailSourceOf(rec)).some((one) => one.rung === position.rung)
        if (has) written += 1
      }
      expect(position.written, `position ${position.rung} counts a different number of written`).toBe(written)
      expect(position.possible, `position ${position.rung} counts a different denominator`).toBe(possible)
    }
  })

  it('counts nothing written at the three lengths written by part, on a fixture where none are', () => {
    // The other side of the line above: no record here carries parts, so all three read zero, and a
    // counter that called them written would be claiming a structure that is not stored.
    for (const position of says.supplyOf(CORPUS)) {
      if (!isByPartLevel(position.rung)) continue
      expect(position.written, `position ${position.rung}`).toBe(0)
    }
  })

  /**
   * THE TWO CASES A COUNT MUST TELL APART, and the reason the denominator is not just the number of
   * records: a problem has no place for a label, so nobody should write one, and counting it as
   * missing would turn a design decision into a debt.
   *
   * THE DENOMINATOR WAS TWO AND IS ONE FROM 3 SEPTEMBER 2026, criterion A14b. It was every kind
   * that declares short forms, which is the module as well as the report. Nobody writes a label of
   * a module: a label is what a report is drawn as in a list. On the live corpus that put 27
   * modules into the denominator and offered every one of them as work, so the denominator at
   * position 1 is the reports.
   */
  it('leaves out the records whose kind has no place for a length', () => {
    const supply = says.supplyOf(CORPUS)
    const label = supply.find((s) => s.rung === 'label')
    // One of the three records is a report, and it has a label written.
    expect(label?.possible).toBe(1)
    expect(label?.written).toBe(1)
    // Nothing is offered as work: the module and the problem are not in this count at all.
    expect(label?.unwritten.map((r) => r.id)).toEqual([])
  })

  /**
   * REVERSED TWICE IN TWO DAYS AND THIS IS WHERE IT LANDED.
   *
   * It asserted `written` = `CORPUS.length` at position 2 and 2 of 3 at position 3, because the
   * record's own columns supplied those two positions through the resolver. On 3 September 2026
   * criterion A14a took the columns out of the ladder and this became *counts no record's title
   * column*, 0 of 3 at both. Criterion A14b, the same day, made the columns BE positions 2 and 3 —
   * a title of at most 15 words and a summary of 20 to 60 — so a record with a title has position 2
   * and a record with a summary has position 3.
   *
   * THE DENOMINATOR HAS NOT MOVED THROUGH ANY OF IT. Every kind has both columns, so every record
   * has a place for both positions.
   */
  it('counts every record’s own title as the second position', () => {
    const title = says.supplyOf(CORPUS).find((s) => s.rung === 'title')
    expect(title?.possible).toBe(CORPUS.length)
    expect(title?.written).toBe(CORPUS.length)
    expect(title?.unwritten.map((r) => r.id)).toEqual([])
  })

  /** And a record with a blank summary has no position 3, which two of these three do have. */
  it('counts the record’s own summary as the third, and offers the one without as work', () => {
    const gist = says.supplyOf(CORPUS).find((s) => s.rung === 'gist')
    const withOne = CORPUS.filter((r) => (r.summary ?? '').trim() !== '')
    expect(gist?.possible).toBe(CORPUS.length)
    expect(gist?.written).toBe(withOne.length)
    expect(gist?.unwritten.map((r) => r.id)).toEqual(
      CORPUS.filter((r) => (r.summary ?? '').trim() === '').map((r) => r.id),
    )
  })

  it('draws those numbers on the screen', () => {
    const html = draw()
    const gist = says.supplyOf(CORPUS).find((s) => s.rung === 'gist')
    expect(html).toContain(`${String(gist?.written)} written of ${String(gist?.possible)} that could be`)
  })
})

describe('the preview draws a real record and always the same one', () => {
  it('picks the record whose positions differ most, and picks it every time', () => {
    const first = says.previewRecord(CORPUS, 'everywhere')
    expect(first?.id).toBe('r-1')
    expect(says.previewRecord([...CORPUS].reverse(), 'everywhere')?.id).toBe('r-1')
  })

  it('answers with nothing when there is nothing to draw, rather than inventing an example', () => {
    expect(says.previewRecord([], 'everywhere')).toBe(null)
  })

  /**
   * THE ROW NAMES A SURFACE, SO THE RECORD HAS TO BE ONE THAT SURFACE DRAWS.
   *
   * One record stood for all eleven rows on the day the panel shipped, so `Module cards` previewed
   * a report. The heading said one thing and the box below it showed another.
   */
  it('previews each row with a record that row\'s surface actually draws', () => {
    expect(says.previewRecord(CORPUS, 'moduleCards')?.kind).toBe('module')
    expect(says.previewRecord(CORPUS, 'reportContent')?.kind).toBe('report')
    expect(says.previewRecord(CORPUS, 'reportIndex')?.kind).toBe('report')
  })

  it('says nothing rather than borrowing another kind when the corpus holds none of them', () => {
    const noModules = CORPUS.filter((r) => r.kind !== 'module')
    expect(says.previewRecord(noModules, 'moduleCards')).toBe(null)
  })

  it('draws stored words rather than a description of a length', () => {
    const html = draw()
    // Position 3 is what the grid shows before the pointer has been anywhere, and r-1's summary is
    // what the resolver answers there. It is drawn byte for byte.
    expect(readable(html)).toContain('Three runs, one crack, always the same corner.')
  })
})

describe('what a row draws when the position asked for is the whole thing', () => {
  /**
   * A ROW IS A LINE OF TEXT AND `Full` IS NOT ONE. The rule is that the row draws the longest form
   * anybody WROTE, and never a cut of the body. This is the case that would otherwise be answered
   * by cutting.
   */
  it('falls to the longest written form and never cuts the body', () => {
    const report = CORPUS[0] as PanelRecord
    const answer = source.wordsAt(report, 'full')
    expect(answer.kind).toBe('text')
    if (answer.kind !== 'text') return
    // The summary, byte for byte — not the first n characters of the blocks.
    expect(answer.text).toBe(report.summary)
    expect(answer.field).toBe('summary')
  })

  it('answers with the title where a kind has no shorter form written at all', () => {
    const problem = CORPUS[2] as PanelRecord
    const answer = source.wordsAt(problem, 'full')
    expect(answer.kind === 'text' ? answer.text : null).toBe(problem.title)
  })
})

// ============================================================ the preview draws the real thing

/**
 * WHAT THIS BLOCK IS ABOUT.
 *
 * A first-time user hovered position 4, 5 and Full on `Report content` and read the characters
 * `data.blocks` — a stored field path, in monospace, offered as the answer to "what will this look
 * like". Problem `vu4nvxDnl1fA`. The repair is that the preview asks the SURFACE'S OWN accessor:
 * a row of a list asks `wordsAt`, which is what Home's rows ask, and a surface that draws a
 * record's own content is drawn by `SummaryBlocks`, told which position to draw at. So these tests
 * assert the two things that were wrong: what comes back, and that a field path never does.
 */
describe('the preview shows what the surface would draw', () => {
  const report = CORPUS[0] as PanelRecord

  it('gives a row of a list the words somebody wrote, at every one of the seven positions', () => {
    for (const rung of RUNGS) {
      const shown = says.previewAt(report, 'home', rung)
      expect(shown.shows).toBe('words')
      if (shown.shows !== 'words') continue
      // Byte-equal to a stored field, and the field is named.
      const stored: Record<string, unknown> = {
        title: report.title,
        summary: report.summary,
        'data.shortForms.label': 'Shell crack',
      }
      expect(Object.values(stored)).toContain(shown.text)
    }
  })

  it('gives a surface that draws a record’s own content the blocks themselves', () => {
    const shown = says.previewAt(report, 'reportContent', 'full')
    expect(shown.shows).toBe('content')
    if (shown.shows !== 'content') return
    expect(shown.blocks).toEqual((report.data as { blocks: unknown[] }).blocks)
  })

  it('never draws the name of a stored field as the words a position would say', () => {
    for (const row of ['home', 'reportContent', 'reportIndex', 'moduleCards', 'tables'] as const) {
      const sample = says.previewRecord(CORPUS, row)
      if (sample === null) continue
      for (const rung of RUNGS) {
        const shown = says.previewAt(sample, row, rung)
        if (shown.shows !== 'words') continue
        expect(shown.text).not.toMatch(/^data\./)
      }
    }
  })
})

// ================================================= the two shapes give different numbers of answers

/**
 * HOW MANY OF THE SEVEN POSITIONS SAY SOMETHING DIFFERENT ON ONE RECORD, AND WHY.
 *
 * Measured over the live corpus on 20 August 2026: `label`, `card` and `brief` have a place on 33
 * of 563 records and are written 1, 0 and 0 times. So a row of a list collapses to the title at
 * positions 1 and 2 and to the summary at 3, 4, 5 and Full: TWO answers, honestly.
 *
 * A surface that draws a record's own content has more to work with, because positions 4, 5 and 6
 * are made of the record's own blocks rather than of a short form nobody wrote — headings, then the
 * opening of each part, then everything. How many answers that gives depends on what the record
 * holds, and `src/shared/reportrungs.ts` is where it is decided.
 *
 * A COUNT BELOW SEVEN IS NOT A FAULT. It is the corpus saying nobody wrote that length and this
 * record has no heading to draw instead. The grid dims the positions that coincide, and the counter
 * row says how many records have each length written.
 */
describe('how many of the seven positions genuinely differ', () => {
  /**
   * `reader` joined `drawnAt` in round ten wave 14, because the page draws a report through two
   * filters — how much it says and who each block was written for — and this key only applied the
   * first. `normal` here is the ordinary reader, which is who the grid is dimmed for by default.
   */
  function distinct(row: 'home' | 'reportContent', record: PanelRecord): number {
    const seen = new Set<string>()
    for (const rung of RUNGS) {
      const shown = says.previewAt(record, row, rung)
      seen.add(
        shown.shows === 'words'
          ? shown.text
          : says.drawnAt(record, shown.shows === 'content' ? shown.blocks : [], rung, 'normal'),
      )
    }
    return seen.size
  }

  it('gives a list row two answers on a record with a summary and no written short form', () => {
    expect(distinct('home', CORPUS[1] as PanelRecord)).toBe(2)
  })

  it('gives a module with no written form three, because two of its positions are its own columns', () => {
    // WAS TWO, THEN ONE, AND IS THREE FROM 3 SEPTEMBER 2026.
    //
    // TWO was its title at 1 and 2, and its title and its summary at 3 to Full — the columns
    // supplying two of the positions through the resolver's walk. ONE was criterion A14a, which
    // took the columns off the ladder: this record then had no form anywhere and no blocks at Full.
    // THREE is criterion A14b: the columns ARE positions 2 and 3, so this module answers with its
    // title at 1 and 2, its summary at 3 and above, and nothing at Full, where it has no blocks.
    expect(distinct('reportContent', CORPUS[1] as PanelRecord)).toBe(3)
  })

  it('gives three on a report with a written label and one paragraph of its own', () => {
    // WAS FOUR, THEN TWO, THEN THREE, THEN TWO, AND IS THREE AGAIN FROM 3 SEPTEMBER 2026.
    //
    // FOUR was before the page above the writing said what it had drawn: its label at 1; its title
    // at 2; its summary at 3 and 4, because it holds no heading for 4 to draw; its one paragraph at
    // 5 and 6. TWO was after: the title and the summary are the two the page above draws, so what
    // was left was the LABEL at 1 to 4 — nobody else draws a label — and the label and the
    // paragraph at 5 and 6. THREE was that afternoon, when the outline's `opening` rank moved to
    // reading length 4. TWO was a later rule: nothing is drawn under the written
    // form, so this record drew its LABEL at 1 to 6 and its paragraph at Full.
    //
    // THREE was criterion A14a: the label at 1, the line saying the level
    // has not been written at 2 to 6, and the paragraph at Full.
    //
    // FIVE IS CRITERION A14b, THE SAME DAY. Positions 2 and 3 are the record's own title and its own
    // summary, so this report answers with its label at 1, its title at 2, its summary at 3, the
    // line saying the level has not been written at 4 to 6 — nobody wrote its parts — and its
    // paragraph at Full.
    expect(distinct('reportContent', CORPUS[0] as PanelRecord)).toBe(5)
  })
})

// ======================================================= a row nothing reads says so, on the row

/**
 * THE ANSWER TO A CONTROL THAT DOES NOTHING.
 *
 * Nine of the ten surfaces had no reader anywhere in `src/web` on the day the panel shipped, and
 * nothing on the panel said so. A person setting `Report index` to 1 and measuring three pages got
 * nine identical numbers and no way to tell a dead control from a corpus with nothing more to say.
 * Problem `wPCV80MuhqJX`.
 *
 * THE LIST IS CHECKED AGAINST THE SOURCE, IN BOTH DIRECTIONS. A surface wired up and left on the
 * list is a row that lies about being dead; a surface with no reader and no entry is the defect
 * coming back. There is deliberately no script that regenerates the list — the cheapest way past a
 * red would then be to regenerate it, which the deleted sentence gate taught.
 *
 * ---------------------------------------------------------------------------------------
 * THIS SCAN IS A CHEAP EXTRA CHECK AND IT IS NEVER SUFFICIENT. SAID HERE, WHERE IT IS DONE.
 * ---------------------------------------------------------------------------------------
 *
 * It is a text match for two literals, and the corpus it matches against is smaller than it looks.
 * Neither literal carries the closing bracket: both functions take the kind of record being drawn
 * as well as the surface, since 3 September 2026. There are exactly THREE literal `useDetail('...'`
 * call sites in all of `src/web`, and
 * `src/web/lib/detailchoice.ts` already calls `detailFor(s)` for every surface through a variable
 * and is excluded here by filename. So the day somebody wires a surface up through a prop, a
 * constant or a loop, this scan reads zero for a control that works.
 *
 * WHAT THAT MEANS FOR THIS TEST. The scan may say a surface should be ON the list. It may never be
 * what takes one OFF. Coming off the list needs a behaviour proof — set the level, render, show
 * the drawing differs — and that lives in `tests/a-detail-control-changes-what-is-drawn.test.ts`,
 * which fails when a surface leaves the list with nothing showing the control works. Adding a
 * `useDetail('x'` literal to a file is enough to satisfy the assertion below and is not enough to
 * satisfy that one.
 */
describe('a row nothing reads says so', () => {
  it('draws the row and its cells as reading nothing, where nothing reads them', () => {
    // THE WORDS ARE DEVELOPER MODE'S. Normal mode draws the short mark with the same reason on hover
    // the cell's accessible name carries the words in both modes.
    setMode('inspect')
    let html: string
    try {
      html = draw()
    } finally {
      setMode('normal')
    }
    // AND IN NORMAL MODE, WHAT A PERSON SEES: the count, the short mark with the row's reason on it,
    // and the cell's accessible name. Only the visible words are developer mode's.
    const normal = draw()
    expect(readable(normal)).not.toContain('nothing reads this yet')
    expect(readable(normal)).toContain('Report index read by 0')
    expect(readable(normal)).toContain('Home cards read by 1')
    // The short mark on THIS row carries the row's reason on hover.
    expect(normal).toContain('title="No screen reads Report index yet."')
    expect(normal).toContain(`Report index, ${levelLabel('label')}, a few words, nothing reads this yet`)
    // ROUND TEN WAVE 14 PUT A NUMBER BETWEEN THE TWO. The row now says how many places ask it how
    // much to say, and the mark saying nothing reads it follows on the next line. Both are still
    // there and both are still about this row, so the assertion is on the pair rather than on a
    // run of text that only held together while nothing sat between them.
    expect(readable(html)).toContain('Report index read by 0')
    expect(readable(html)).toContain('nothing reads this yet')
    // The two that ARE read carry no such mark.
    expect(readable(html)).toContain('Home cards read by 1 ·')
    // THE POSITION IS NAMED THE WAY THE PAGE NAMES IT, and that word is read off the declaration
    // rather than typed here. It was typed here as `1`, and when the grid started naming positions
    // the way the report's own level control names them — `Level 1`, `Conclusion` — this assertion
    // failed for having a second copy of a label rather than for anything about what it proves,
    // which is that the mark saying nothing reads this row reaches the cell's accessible name.
    expect(html).toContain(`Report index, ${levelLabel('label')}, a few words, nothing reads this yet`)
  })
})

// ======================================================= a report drawn below the whole report

/**
 * `Report content` IS THE SURFACE THE DOGFOOD MEASURED AND IT NOW ANSWERS.
 *
 * `reportAt` in `src/shared/reportrungs.ts` is the one function the report page and the preview
 * both reach. It answers with two things at once: the report's own opening lines, and which of its
 * blocks this position draws. `tests/a-report-says-less-by-showing-fewer-things.test.ts` proves the
 * whole ladder on a drawn page; these two hold the shape of the answer.
 */
describe('what a record’s own content draws at each position', () => {
  /**
   * NOTHING ABOVE THESE BLOCKS HAS DRAWN ANYTHING, and that is what these cases are asking about.
   *
   * `reportAt` takes the stored fields the surface above the writing has already drawn, so the
   * writing does not draw them a second time at a different width. These cases hold the SHAPE of
   * the ladder — one stored line added per position, none invented — which is a fact about the
   * ladder and not about any one surface's furniture. So they hand it an empty list and the ladder
   * answers in full.
   *
   * IT IS SPELT OUT HERE RATHER THAN WRITTEN INLINE FOUR TIMES so that a reader meeting
   * `reportAt(from, blocks, 'label', [])` cannot mistake the empty list for an oversight. What the
   * record page passes is `DRAWN_ABOVE_THE_WRITING`, and the case below this one is where the
   * difference between the two is asserted.
   */

  /**
   * CHANGED 2 September 2026 with the criterion. It used to be called *adds one stored line at a
   * time and never invents one*, and it asserted the trail:
   *
   *   'label' → ['Shell crack']
   *   'title' → ['Shell crack', report.title]
   *   'gist'  → ['Shell crack', report.title, report.summary]
   *
   * The trail was the design for a corpus where hardly any length had a form of its own, so a
   * length drawing only its own would have drawn nothing. The rule is that every advertised level is
   * ONE short abstract, and the details are read at Full.
   * A length draws its own form and nothing above it, and the shorter forms stay readable
   * in the *Shorter forms of this report* panel.
   *
   * NOTHING IS INVENTED AND NOTHING IS LIFTED, which is the half of the old case that still holds:
   * the line drawn at each length is the words stored for that length, byte for byte.
   *
   * AND EACH LENGTH DRAWS ITS OWN WORDS. This asserted that lengths 2 and 3 drew NO line at all,
   * because a column was not a form written for a length (criterion A14a, 3 September 2026). The
   * same day, criterion A14b made the columns BE those two lengths — a title of at most 15 words, a summary of 20 to 60
   * — so length 2 draws the record's own title, byte for byte, and length 3 its own summary, and
   * each line says which of the two columns it came from.
   */
  it('draws the length’s own stored line, one line, and never invents or lifts one', async () => {
    const { reportAt } = await import('../src/shared/reportrungs.ts')
    const { detailSourceOf } = source
    const report = CORPUS[0] as PanelRecord
    const from = detailSourceOf(report)
    const blocks = (report.data as { blocks: never[] }).blocks

    expect(reportAt(from, blocks, 'label').lines.map((l) => l.text)).toEqual(['Shell crack'])
    expect(reportAt(from, blocks, 'label').summary.standing).toBe('written')
    // LENGTH 2 IS THE RECORD'S OWN TITLE AND LENGTH 3 IS ITS OWN SUMMARY, and each says so.
    expect(reportAt(from, blocks, 'title').lines.map((l) => [l.text, l.field])).toEqual([[report.title, 'title']])
    expect(reportAt(from, blocks, 'title').summary.standing).toBe('written')
    expect(reportAt(from, blocks, 'gist').lines.map((l) => [l.text, l.field])).toEqual([[report.summary, 'summary']])
    expect(reportAt(from, blocks, 'gist').summary.standing).toBe('written')
    // AND A LENGTH NOBODY WROTE STILL SAYS SO: nobody wrote this report's parts.
    expect(reportAt(from, blocks, 'outline').lines).toEqual([])
    expect(reportAt(from, blocks, 'outline').summary.standing).toBe('missing')
  })

  it('draws every block at Full and none of them at the first position', async () => {
    const { reportAt } = await import('../src/shared/reportrungs.ts')
    const { detailSourceOf } = source
    const report = CORPUS[0] as PanelRecord
    const from = detailSourceOf(report)
    const blocks = (report.data as { blocks: never[] }).blocks

    expect(reportAt(from, blocks, 'full').blocks).toEqual(blocks.map((_, i) => i))
    expect(reportAt(from, blocks, 'full').notDrawn).toBe(0)
    expect(reportAt(from, blocks, 'label').blocks).toEqual([])
    expect(reportAt(from, blocks, 'label').notDrawn).toBe(blocks.length)
  })

})

// ============================== the call sites that draw a record's content and do not say so yet

