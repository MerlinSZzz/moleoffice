// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Tests for the viz components Chart.tsx and SummaryBlocks.tsx. MathText.tsx, the third, has files
 * of its own now, and the note where its cases stood says which.
 *
 * WHY THEY LOOK LIKE THIS. The test runner has no DOM -- the environment is `node`, there is no
 * jsdom, and adding one would be a new dependency this project has ruled out. So there are two
 * kinds of test here:
 *
 *   - the layout logic is pure and is called directly. `geometry()` decides which tick labels
 *     can be drawn at a given pixel width. It is the whole substance of its component, and it is
 *     checkable without a browser.
 *   - the components themselves are rendered to static markup with react-dom/server, which is
 *     enough to check what must be IN the markup: the text alternative, the visible failure
 *     boxes, the copyable path.
 *
 * What they do NOT cover: how it looks. Whether a fraction sits on the right baseline and
 * whether an annotation label is legible where it crosses a gridline are screenshot questions,
 * and they were checked that way (_viz_demo/shots) rather than papered over with a test that
 * only pretends to look.
 *
 * AND THEY NO LONGER COVER HOW WIDE PROSE READS. Six cases about the reading measure stood at the
 * foot of this file and matched the stylesheet as text. Every rule they were about is a width the
 * browser decides, so they are measurements in `tests/report-document.test.ts` now, in the describe
 * called *a document is set to be read*. The note where they stood says what each of them was.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  Chart,
  describeChart,
  formatTick,
  geometry,
  keepMask,
  niceScale,
  normalizeSpec,
  ticksIn,
  truncateTo,
  type ChartSpec,
} from '../src/web/components/Chart.tsx'

// SummaryBlocks reaches ui.tsx for the read-only StateChip, and ui.tsx imports api.ts, which
// reads window.localStorage at module scope. This is the smallest stand-in that lets the module
// load; nothing here is under test.
type SB = typeof import('../src/web/components/SummaryBlocks.tsx')
let sb: SB

beforeAll(async () => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  sb = await import('../src/web/components/SummaryBlocks.tsx')
  // THE PERSON'S MEDIA-LOAD CHOICE HAS BEEN READ, AND IT IS NO CHOICE. Criterion U5 makes whether
  // media are fetched the person's own setting, and NOTHING LOADS UNTIL THEIR ROW HAS BEEN READ —
  // otherwise a person who chose never would be fetched once while the answer was on its way. This
  // says the row was read and holds no choice, which is read as loading with the page, exactly what
  // every report drew before that criterion existed. Without it every case here would draw a held
  // picture and none of them would be about what they say they are about.
  const { sayMediaLoad } = await import('../src/web/lib/mediaload.ts')
  sayMediaLoad(null)
})

const render = (el: React.ReactElement): string => renderToStaticMarkup(el)

/**
 * The markup with the hoisted <style> removed.
 *
 * These components carry their own stylesheet in the tree (React 19 hoists and de-duplicates a
 * <style> that has an href and a precedence). A class name mentioned in that stylesheet is not
 * evidence that anything USES the class, so any assertion about what was rendered has to look
 * at the elements only.
 */
const body = (html: string): string => html.replace(/<style[\s\S]*?<\/style>/g, '')

/**
 * The pixel size of --fs-1, READ OUT OF tokens.css rather than copied from it.
 *
 * The chart measures the real computed size from a probe span in the browser and this is the
 * number that stands in for it here. It used to be written out as `12` with a comment saying
 * tokens.css set it to 0.75rem — and when the type scale was raised to a 13px floor, the comment
 * became false and every geometry assertion below went on exercising a size the app no longer
 * draws at, with nothing failing. Derived, so there is one place that says how big --fs-1 is.
 */
const FS = (() => {
  const css = readFileSync(new URL('../src/web/tokens.css', import.meta.url), 'utf8')
  // TWO FORMS, BECAUSE --fs-1 CARRIES A FLOOR. It is `max(13px, 0.8125rem)`: the rem half is what
  // the text-size control scales, the px half is what stops Small taking a sentence to 12.19px.
  // At the 16px root this file measures against, the answer is whichever is bigger. A bare rem is
  // still read, because --fs-4 and up have no floor and this shape may come back.
  const clamped = /--fs-1:\s*max\(\s*([\d.]+)px\s*,\s*([\d.]+)rem\s*\)/.exec(css)
  if (clamped?.[1] !== undefined && clamped[2] !== undefined) {
    return Math.max(Number(clamped[1]), Number(clamped[2]) * 16)
  }
  const found = /--fs-1:\s*([\d.]+)rem/.exec(css)
  if (found?.[1] === undefined) {
    throw new Error('tokens.css declares no --fs-1 this test can read, so it cannot size a label.')
  }
  return Number(found[1]) * 16
})()

function norm(spec: ChartSpec) {
  const r = normalizeSpec(spec)
  if (!r.ok) throw new Error(`spec did not normalise: ${r.reason}`)
  return r.chart
}

// ============================================================================ scales

describe('chart scales', () => {
  it('rounds a domain out to ticks a human can read', () => {
    const s = niceScale(0.037, 4.912, 5)
    expect(s.lo).toBe(0)
    expect(s.hi).toBe(5)
    expect(s.ticks).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('does not produce float dust in the tick values', () => {
    // 0.1 + 0.1 + 0.1 is the classic; ticks built by repeated addition print 0.30000000000000004.
    for (const t of niceScale(0, 1, 10).ticks) {
      expect(String(t).length).toBeLessThan(6)
    }
    expect(ticksIn(0, 1, 0.1)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
  })

  it('gives a flat series a range, so the line is not drawn on the floor', () => {
    const s = niceScale(5, 5, 4)
    expect(s.lo).toBeLessThan(5)
    expect(s.hi).toBeGreaterThan(5)
  })

  it('formats ticks with the decimals the step needs, and no more', () => {
    expect(formatTick(0.5, 0.5)).toBe('0.5')
    expect(formatTick(2, 1)).toBe('2')
    expect(formatTick(-0, 1)).toBe('0')
    expect(formatTick(120000, 20000)).toBe('1.2e5')
  })

  it('refuses a domain it cannot scale rather than producing NaN pixels', () => {
    expect(() => niceScale(NaN, 4, 5)).toThrow(/finite/)
  })
})

// ============================================================================ collisions

describe('tick label collisions', () => {
  it('keeps labels that clear each other and drops the ones that do not', () => {
    expect(keepMask([0, 50, 100], [20, 20, 20], 8)).toEqual([true, true, true])
    expect(keepMask([0, 10, 100], [20, 20, 20], 8)).toEqual([true, false, true])
  })

  /**
   * The requirement that made this component measure itself. A chart at 320px has room for
   * about four x labels; drawing eight is the bug.
   */
  it('never overlaps two x labels at 320px, for any of the demo charts', () => {
    const specs: ChartSpec[] = [
      {
        kind: 'line',
        xLabel: 'printer effort setting',
        y: { label: 'grip force', unit: 'N', min: 0, max: 18 },
        series: [{ name: 'v3', points: [[9, 7.4], [12, 11.2], [15, 15.9]] }],
        annotations: [{ y: 12, label: '12 N needed' }],
      },
      {
        kind: 'line',
        xLabel: 'time since grasp (s)',
        yLabel: 'round trip (ms)',
        series: [{ name: 'right', points: Array.from({ length: 60 }, (_, i): [number, number] => [i * 0.25, 4 + (i % 7)]) }],
      },
      {
        kind: 'bar',
        x: { label: 'module', categories: ['Tray clamp', 'Chest cam', 'EGM', '夹具标定', 'Twin'] },
        y: { label: 'items', min: 0 },
        series: [{ name: 'open', points: [[0, 5], [1, 1], [2, 3], [3, 6], [4, 2]] }],
      },
    ]

    for (const spec of specs) {
      const g = geometry(norm(spec), 320, 180, FS)
      let lastRight = -Infinity
      g.x.ticks.forEach((_, i) => {
        if (!g.xKeep[i]) return
        // Turned 35 degrees, a label's horizontal footprint is its line height over sin(35);
        // flat, it is the width of the text.
        const w = g.xRotate ? (FS + 2) / Math.sin((35 * Math.PI) / 180) : textWidth(g.xLabels[i] ?? '', FS)
        const left = g.sx(g.x.ticks[i] as number) - w / 2
        expect(left).toBeGreaterThanOrEqual(lastRight)
        lastRight = left + w
      })
      // A chart with no x labels at all is not a fix for overlap.
      expect(g.xKeep.filter(Boolean).length).toBeGreaterThanOrEqual(2)
    }
  })

  /**
   * Every category must be labelled when there is room for it. A bar chart with five columns
   * and only four names is worse than a crowded axis: the reader silently mis-attributes a bar.
   */
  it('labels every column of a bar chart, turning the names when they will not fit flat', () => {
    const spec: ChartSpec = {
      kind: 'bar',
      x: { label: 'module', categories: ['Tray clamp', 'Chest cam', 'EGM', '夹具标定', 'Twin'] },
      y: { label: 'items', min: 0 },
      series: [{ name: 'open', points: [[0, 5], [1, 1], [2, 3], [3, 6], [4, 2]] }],
    }

    // Wide enough for flat labels.
    const wide = geometry(norm(spec), 900, 320, FS)
    expect(wide.xRotate).toBe(false)
    expect(wide.xKeep).toEqual([true, true, true, true, true])

    // In a panel-sized card "Chest cam" no longer fits in its slot. Every column must still be
    // named -- an unlabelled bar cannot be attributed at all -- so the row turns instead.
    const narrow = geometry(norm(spec), 366, 190, FS)
    expect(narrow.xRotate).toBe(true)
    expect(narrow.xKeep).toEqual([true, true, true, true, true])
    expect(narrow.xLabels).toContain('Chest cam')
    // Turning the labels costs bottom margin, and that has to be reserved, not overflowed.
    expect(narrow.mb).toBeGreaterThan(FS + 8)
    expect(narrow.mt + narrow.plotH + narrow.mb).toBeLessThanOrEqual(190)
  })

  it('truncates a column name it cannot fit, visibly, rather than running it off the chart', () => {
    expect(truncateTo('a very long module name indeed', 40, FS)).toMatch(/…$/)
    expect(textWidth(truncateTo('a very long module name indeed', 40, FS), FS)).toBeLessThanOrEqual(40)
    expect(truncateTo('EGM', 40, FS)).toBe('EGM')
  })

  it('measures a CJK title as full width, so 夹具标定 cannot be drawn over its neighbour', () => {
    // Latin glyphs are about 0.62em; a Han glyph is a full em. Estimating them the same way
    // under-measures a Chinese label by 40% and puts it under the next one.
    expect(textWidth('夹具标定', FS)).toBeGreaterThan(textWidth('abcd', FS) * 1.5)
  })
})

/** The same estimator geometry() uses, duplicated here so the test measures independently. */
function textWidth(s: string, size: number): number {
  let w = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6)
    w += wide ? size : size * 0.62
  }
  return w
}

// ============================================================================ annotations

describe('reference lines', () => {
  it('never draws two annotation labels on top of each other', () => {
    // 12 N and 14 N on an 18 N axis are about 25px apart at this height: closer than one line
    // of text, so the two labels have to be placed on opposite sides of their lines.
    const g = geometry(
      norm({
        kind: 'line',
        y: { label: 'force', unit: 'N', min: 0, max: 18 },
        series: [{ name: 'v3', points: [[9, 7.4], [15, 15.9]] }],
        annotations: [
          { axis: 'y', value: 12, label: '12 N needed for a handover pull' },
          { axis: 'y', value: 14, label: 'v3 shell cracks above 14 N' },
        ],
      }),
      620,
      310,
      FS,
    )
    expect(g.annotations).toHaveLength(2)
    const [a, b] = g.annotations
    if (!a || !b) throw new Error('both annotations should have been placed')
    expect(overlaps(a.box, b.box)).toBe(false)
  })

  it('places a limit label even when every candidate position is taken', () => {
    // Five limits within a hair of each other cannot all be given clear air. They must still
    // all be drawn: a limit line with no label is a line nobody can read.
    const g = geometry(
      norm({
        kind: 'line',
        series: [{ name: 's', points: [[0, 0], [1, 10]] }],
        annotations: [1, 2, 3, 4, 5].map((n) => ({ axis: 'y' as const, value: 5 + n * 0.05, label: `limit ${n}` })),
      }),
      620,
      310,
      FS,
    )
    expect(g.annotations).toHaveLength(5)
    for (const a of g.annotations) expect(a.label).toMatch(/limit/)
  })

  /**
   * A limit worth drawing is often a whole sentence. Laid across a phone-width plot that
   * sentence covers the data it is a limit on, so it becomes a letter plus a key underneath.
   */
  it('turns a sentence-length limit label into a keyed footnote on a narrow chart', () => {
    const spec: ChartSpec = {
      kind: 'line',
      y: { label: 'force', unit: 'N', min: 0, max: 18 },
      series: [{ name: 'v3', points: [[9, 7.4], [15, 15.9]] }],
      annotations: [
        { axis: 'y', value: 12, label: '12 N needed to hold the 50 mm cube through a handover pull' },
      ],
    }

    const narrow = geometry(norm(spec), 320, 180, FS)
    const a = narrow.annotations[0]
    if (!a) throw new Error('the annotation should have been placed')
    expect(a.key).toBe('A')
    expect(a.drawn).toBe('A')
    // The words are not lost -- they move to the key, which is what the caller renders below.
    expect(a.label).toContain('handover pull')
    expect(a.box.w).toBeLessThan(narrow.plotW * 0.2)

    // Given room, the same label is written out on the line.
    const wide = geometry(norm(spec), 1100, 320, FS)
    expect(wide.annotations[0]?.key).toBeUndefined()
    expect(wide.annotations[0]?.drawn).toContain('handover pull')
  })

  it('widens the axis so a limit above the data is still on the chart', () => {
    const g = geometry(
      norm({
        kind: 'scatter',
        series: [{ name: 's', points: [[1, 3.1], [3, 22]] }],
        annotations: [{ y: 33, label: 'baseline error' }],
      }),
      620,
      310,
      FS,
    )
    expect(g.y.hi).toBeGreaterThanOrEqual(33)
  })
})

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

// ============================================================================ tolerant reader

describe('the two chart spec spellings', () => {
  it('reads {x, y} points, axis objects, units and series states', () => {
    const c = norm({
      kind: 'line',
      y: { label: 'grip force', unit: 'N', min: 0, max: 18 },
      x: { label: 'effort' },
      series: [{ name: 'v3', state: 'failed', dashed: true, points: [{ x: 9, y: 7.4 }, { x: 12, y: 11.2 }] }],
      annotations: [{ axis: 'y', value: 12, label: 'needed' }],
    })
    expect(c.yLabel).toBe('grip force (N)')
    expect(c.series[0]?.token).toBe('--st-failed')
    expect(c.series[0]?.points).toEqual([[9, 7.4], [12, 11.2]])
    expect(c.annotations[0]?.y).toBe(12)
    expect(c.yMin).toBe(0)
  })

  it('reads tuple points and flat labels', () => {
    const c = norm({
      kind: 'line',
      xLabel: 'time (s)',
      yLabel: 'ms',
      series: [{ name: 'a', points: [[0, 1], [1, 2]] }],
      annotations: [{ y: 10, label: 'deadline' }],
    })
    expect(c.xLabel).toBe('time (s)')
    expect(c.annotations[0]?.y).toBe(10)
  })

  it('never invents a colour: a series without a state still gets a token, never a hex', () => {
    const c = norm({ kind: 'line', series: [{ name: 'a', points: [[0, 1]] }, { name: 'b', points: [[0, 2]] }] })
    for (const s of c.series) expect(s.token).toMatch(/^--/)
    // Colour is not the only channel: the two series differ in dash and in marker as well.
    expect(c.series[0]?.dash).not.toBe(c.series[1]?.dash)
    expect(c.series[0]?.marker).not.toBe(c.series[1]?.marker)
  })

  it('counts the points it cannot plot instead of dropping them quietly', () => {
    const c = norm({
      kind: 'line',
      series: [{ name: 'load cell', points: [[0, 1.2], [1, NaN], [2, 3.4], [3, Infinity]] }],
    })
    expect(c.dropped).toBe(2)
    expect(c.series[0]?.points).toHaveLength(2)
  })

  it('drops a category index that is off the end, and says so', () => {
    const c = norm({
      kind: 'bar',
      x: { categories: ['a', 'b'] },
      series: [{ name: 's', points: [[0, 1], [5, 2], [1.5, 3]] }],
    })
    expect(c.dropped).toBe(2)
  })

  it('refuses a spec it cannot draw, naming what is wrong', () => {
    expect(normalizeSpec({ kind: 'line', series: [] })).toEqual({ ok: false, reason: expect.stringMatching(/no series/) })
    expect(normalizeSpec({ kind: 'pie' as 'line', series: [{ name: 'a', points: [[0, 1]] }] })).toEqual({
      ok: false,
      reason: expect.stringMatching(/Unknown chart kind "pie"/),
    })
    expect(normalizeSpec({ kind: 'line', series: [{ name: 'a', points: [[0, 1]] }], annotations: [{ label: 'x' }] })).toEqual({
      ok: false,
      reason: expect.stringMatching(/neither an x nor a y/),
    })
  })

  it('refuses an inverted axis range instead of drawing the chart upside down', () => {
    expect(() =>
      geometry(norm({ kind: 'line', y: { min: 10, max: 2 }, series: [{ name: 'a', points: [[0, 5]] }] }), 620, 310, FS),
    ).toThrow(/is not below/)
  })
})

// ============================================================================ chart markup

describe('<Chart/> markup', () => {
  it('carries a text alternative that states the axes, the series and the limits', () => {
    const html = render(
      h(Chart, {
        spec: {
          kind: 'line',
          title: 'Grip force',
          y: { label: 'grip force', unit: 'N' },
          xLabel: 'effort',
          series: [{ name: 'v3', points: [[9, 7.4], [15, 15.9]] }],
          annotations: [{ axis: 'y', value: 12, label: '12 N needed' }],
        },
      }),
    )
    expect(html).toContain('role="img"')
    expect(html).toMatch(/<desc[^>]*>[^<]*grip force \(N\)/)
    expect(html).toContain('Series v3')
    expect(html).toContain('Reference line at y 12: 12 N needed')
  })

  it('says a chart is not drawn instead of rendering an empty box', () => {
    const html = render(h(Chart, { spec: { kind: 'line', series: [] } }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('Chart not drawn')
    expect(html).toContain('no series')
    expect(html).not.toContain('<svg class="pxc-svg"')
  })

  it('uses only tokens for colour, so a theme swap reaches every mark', () => {
    const html = render(
      h(Chart, { spec: { kind: 'bar', series: [{ name: 'a', points: [[0, 1], [1, 2]] }] } }),
    )
    // No hex, no rgb(), no named colour anywhere in the markup.
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(html).not.toMatch(/rgba?\(/)
    expect(html).toContain('var(--st-')
  })
})

// ============================================================================ maths

/*
 * THE MATHTEXT CASES THAT STOOD HERE ARE IN THREE FILES OF THEIR OWN NOW, SINCE 14 NOVEMBER 2026.
 *
 * WHAT THEY WERE. Two describes about the home-made drawing MathText had before it drew with KaTeX.
 * *The supported subset* asked `parseTex()` to accept nineteen expressions, to read `$$...$$` and
 * `\[...\]` as a display and `$...$` as inline, and asked the drawing to put a sum's limits above
 * and below only in a display. *What it refuses* asked `parseTex()` to refuse twelve expressions
 * with a reason, and asked the marked box to hold the tag word, the reason and the source.
 *
 * WHY THEY MOVED. `parseTex()` is gone: KaTeX reads the LaTeX now, and MathText keeps only the
 * reading of the delimiters. A case that asked a parser which no longer exists would ask nothing.
 *
 * WHERE EACH WENT.
 *   - The nineteen are the first family of `tests/common-latex-from-papers-and-notes.ts`, word for
 *     word, and `tests/common-latex-is-drawn.test.ts` draws them with the rest of that corpus.
 *   - The delimiters are that file's describe *the delimiters decide the mode*, with `\(...\)`
 *     as well.
 *   - The limits case is not kept. Its class names were the old drawing's own. Whether a formula
 *     is a display is asked of every expression in the corpus, and where KaTeX puts a limit is
 *     seen in the pictures and compared against MathJax.
 *   - Of the twelve refused, six are still refused and are in
 *     `tests/latex-that-cannot-be-drawn-shows-its-source-and-the-reason.test.ts`, with the box
 *     cases. The other six are common LaTeX that KaTeX draws, as LaTeX itself does: a pmatrix,
 *     `\binom`, `\oiint`, `\mathbb{W}`, the line break `x \\ y`, and `^2` with nothing before it.
 *     Each of those six is in the corpus now.
 */

// ============================================================================ summary blocks

describe('<SummaryBlocks/>', () => {
  it('renders a designed empty state, not a blank region', () => {
    const html = render(h(sb.SummaryBlocks, { blocks: [] }))
    // THE SENTENCE THE COMPONENT ACTUALLY USES, not a phrase copied out of it. This asked for "No
    // curated summary yet" — `curated` was the storage layer's word for hand-written blocks as
    // against derived ones, and finding 21 of the language audit had it changed to plain words.
    expect(html).toContain(sb.NO_SUMMARY)
  })

  /**
   * ONE SPELLING OF A BLOCK, AND IT IS THE ONE THAT CAN BE STORED.
   *
   * This component used to read `md` as well as `text`, `headers` as well as `columns`, and a row
   * written as a bare array as well as one written as an object with `cells`. Every one of those
   * was drawn here and refused by the write path, so somebody could see on screen a shape they
   * could never save. Measured on a copy of the owner's corpus before deleting them: of its 54
   * stored blocks, none used any of the loose spellings.
   */
  it('draws the shape the write path stores', () => {
    const html = render(
      h(sb.SummaryBlocks, { blocks: [{ type: 'text', id: 't', heading: 'H', text: 'from **text**' }] }),
    )
    expect(html).toContain('<strong>text</strong>')
    expect(html).toContain('>H<')
  })

  it('right-aligns a column of numbers and gives a row state its own column', () => {
    const columns = render(
      h(sb.SummaryBlocks, {
        blocks: [
          {
            type: 'table',
            id: 'tb',
            columns: [{ label: 'print' }, { label: 'effort', align: 'right' }],
            rows: [{ state: 'failed', cells: ['v3 #1', 9] }],
          },
        ],
      }),
    )
    expect(columns).toContain('print')
    expect(columns).toContain('text-align:right')
    // A row state becomes a word in its own column, never a tint on its own.
    expect(columns.toLowerCase()).toContain('failed')
  })

  it('refuses a ragged table, naming the rows', () => {
    const html = render(
      h(sb.SummaryBlocks, {
        blocks: [
          {
            type: 'table',
            id: 'tb',
            columns: [{ label: 'a' }, { label: 'b' }, { label: 'c' }],
            rows: [{ cells: ['1', '2', '3'] }, { cells: ['4', '5'] }],
          },
        ],
      }),
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('Block 0 not shown')
    expect(html).toContain('row 1')
  })

  it('shows a block type it has never heard of as a visible refusal', () => {
    const html = render(h(sb.SummaryBlocks, { blocks: [{ type: 'sparkline' } as unknown as import('../src/web/components/SummaryBlocks.tsx').SummaryBlock] }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('sparkline')
  })

  it('shows a person the picture\'s description and not its archive path, and never puts a local path in an <img>', () => {
    // THE PATH AND ITS COPY PRESS ARE A DEVELOPER'S since wave 13s round 12; developer mode draws them,
    // which tests/a-picture-in-a-report-opens-large.test.ts holds in a browser. This render is a person's.
    const path = `${THE_TEST_FIXTURE_ROOT}/PROJECTS/proj_1st_baseline/docs/overlay_05.png`
    const html = body(render(h(sb.SummaryBlocks, { blocks: [{ type: 'image', id: 'i', path, alt: 'the bench' }] })))
    expect(html).not.toContain(path)
    expect(html).not.toContain('copy path')
    expect(html).not.toContain('<img')
    // The alt text is the only description of a picture nobody can see, so it is shown.
    expect(html).toContain('the bench')
  })

  it('does display an image the browser can actually load', () => {
    const html = render(h(sb.SummaryBlocks, { blocks: [{ type: 'image', id: 'i', path: 'https://example.org/a.png', alt: 'a' }] }))
    expect(html).toContain('<img')
    expect(html).toContain('https://example.org/a.png')
  })

  it('treats an absolute path as a file on a machine, not as a URL this server hosts', () => {
    // "/srv/project/x.png" and "/static/x.png" are the same kind of string. Mole Office never copies
    // media and therefore never serves any, so a leading slash means the filesystem.
    expect(sb.isBrowserLoadable(`${THE_TEST_FIXTURE_ROOT}/PROJECTS/x/overlay.png`)).toBe(false)
    expect(sb.isBrowserLoadable('./shots/overlay.png')).toBe(true)
    expect(sb.isBrowserLoadable('https://example.org/a.png')).toBe(true)
  })

  it('shows a path block as a copyable pointer, never as a copy of the file', () => {
    const html = render(
      h(sb.SummaryBlocks, {
        blocks: [{ type: 'path', id: 'p', label: 'Full report', path: `${THE_TEST_FIXTURE_ROOT}/PROJECTS/x/docs/`, kind: 'dir' }],
      }),
    )
    expect(html).toContain('Full report')
    expect(html).toContain(`${THE_TEST_FIXTURE_ROOT}/PROJECTS/x/docs/`)
    expect(html).toContain('copy path')
  })

  it('builds markdown as elements, so text in a record can never become markup', () => {
    const html = body(
      render(h(sb.SummaryBlocks, { blocks: [{ type: 'text', id: 't', text: 'a <script>alert(1)</script> b' }] })),
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('links only what a browser can follow, and shows the rest as text', () => {
    const web = render(h(sb.SummaryBlocks, { blocks: [{ type: 'text', id: 't', text: '[docs](https://example.org)' }] }))
    expect(web).toContain('href="https://example.org"')
    expect(web).toContain('rel="noreferrer noopener"')

    const local = render(h(sb.SummaryBlocks, { blocks: [{ type: 'text', id: 't', text: `[report](file://${THE_TEST_FIXTURE_ROOT}/r.md)` }] }))
    expect(local).not.toContain('href="file:')
    expect(local).toContain(`file://${THE_TEST_FIXTURE_ROOT}/r.md`)
  })

  /*
   * A CASE CALLED *draws a table typed into the words as a real table* STOOD HERE UNTIL
   * 3 SEPTEMBER 2026, and it was the same three assertions on the same three lines of markdown as
   * `tests/summary-markdown.test.ts > draws a table typed into the words as a real table, through
   * the one pipe reader`, which also names the one reader the rule is about. A third copy is in
   * `tests/report-document.test.ts`, on a real review rather than on three typed lines. The
   * refusal below is this file's own subject and stays.
   */

  it('prints pipe lines it cannot read as a table exactly as they were typed, and says why', () => {
    // No row of dashes, so there is no way to tell which line is the heading. plandoc's own
    // sentence is shown, which is the one this product uses for a plan as well.
    const html = render(h(sb.SummaryBlocks, { blocks: [{ type: 'text', id: 't', text: '| a | b |\n| 1 | 2 |' }] }))
    expect(html).not.toContain('<table')
    expect(html).toContain('no row of dashes')
    expect(html).toContain('| a | b |')
  })

  it('renders maths inside a sentence', () => {
    const html = render(h(sb.SummaryBlocks, { blocks: [{ type: 'text', id: 't', text: 'about $12\\,\\mathrm{N}$ is needed' }] }))
    expect(html).toContain('role="math"')
    expect(html).toContain('is needed')
  })
})

// ==================================================== where prose wraps: moved, on 3 September 2026

/*
 * THE SIX READING-MEASURE CASES THAT STOOD HERE ARE IN tests/report-document.test.ts NOW.
 *
 * WHAT THEY WERE. A describe called *prose has one wrap column, and it is not counted in
 * characters*: that `tokens.css` states `--measure` in a root-relative length and never in `em`;
 * that no rule caps prose with a character count or with a maximum of its own; that a list marker,
 * a quote rail and a callout rail are added outside the measure rather than taken out of it; that a
 * caption and an empty stand take their component's width; that a list, a quote, a callout and a
 * finding carry no width of their own; that every box holding a run of markdown lays its own
 * children out; and that a nested box resolves the measure against itself.
 *
 * WHY THEY MOVED. Both auditors of the 3 September test audit named this file and
 * tests/report-document.test.ts as covering the same reading-measure rules, and two of these cases
 * were the same two rules that file already matched. Every one of them was a string match against
 * `SUMMARY_CSS` or `tokens.css`, and every rule they are about is a drawn width — which a
 * declaration cannot answer, because a later rule of the same weight overrides it. That is not a
 * hypothesis: it is how `.sb-section-body` lost its tracks, with the stylesheet still saying the
 * right thing.
 *
 * SO ALL SIX ARE MEASUREMENTS NOW, in a browser, on a report written to hold one block of each kind
 * they are about, in the describe called *a document is set to be read*. Nothing was dropped in the
 * move; each case there says which rule it carries and what it used to be.
 *
 * WHAT THIS FILE KEEPS is what it is named for and what it can answer without a browser: the chart
 * geometry and what the block renderer puts in its markup. The maths cases moved on 14 November
 * 2026, and the note where they stood says where.
 */

/**
 * WHAT A NEWLINE IN A STORED PARAGRAPH MEANS, in both scripts this corpus is written in.
 *
 * One rule, decided in `joinWrapped` and read by both `renderMarkdown` and `paragraphsOf`: a single
 * newline is whitespace, a blank line is a paragraph break, and the whitespace is a space unless the
 * characters on both sides of it are CJK. The strings below are the shapes already in the corpus --
 * 187 stored strings contain CJK and 109 of them mix it with Latin -- rather than invented ones.
 */
describe('a soft-wrapped paragraph is joined back the way it was written', () => {
  const paragraphs = (md: string): string[] => {
    const html = body(render(h(sb.SummaryBlocks, { blocks: [{ type: 'text', id: 't', text: md }] })))
    return [...html.matchAll(/<p class="sb-p"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1] ?? '')
  }

  it('joins two Chinese fragments with nothing, because 视觉组 is one word', () => {
    expect(paragraphs('视觉\n组')).toEqual(['视觉组'])
    expect(sb.joinWrapped(['视觉', '组'])).toBe('视觉组')
  })

  it('joins two English fragments with exactly one space', () => {
    expect(paragraphs('the wrist\ncamera')).toEqual(['the wrist camera'])
  })

  it('keeps one space at a script boundary, in both directions', () => {
    // The case a naive "no space when EITHER side is CJK" gets wrong: it would fuse the Latin word
    // to the Chinese one and produce a word neither script has.
    expect(paragraphs('GelSight Mini\n还给触觉组')).toEqual(['GelSight Mini 还给触觉组'])
    expect(paragraphs('把借来的\nGelSight Mini')).toEqual(['把借来的 GelSight Mini'])
  })

  it('still makes two paragraphs out of a blank line, in either script', () => {
    expect(paragraphs('第一段。\n\n第二段。')).toEqual(['第一段。', '第二段。'])
    expect(paragraphs('One thing.\n\nAnother thing.')).toEqual(['One thing.', 'Another thing.'])
  })

  it('reads a whole record body: wrapped lines rejoin, blank lines divide', () => {
    const stored = `重新测 0.9 m 的深度\n误差，用 ${THE_TEST_FIXTURE_ROOT}/PROJECTS/proj_1st_baseline/docs 里的那组图。\n\nThe wrist\ncamera was not moved between the two runs.`
    expect(paragraphs(stored)).toEqual([
      `重新测 0.9 m 的深度误差，用 ${THE_TEST_FIXTURE_ROOT}/PROJECTS/proj_1st_baseline/docs 里的那组图。`,
      'The wrist camera was not moved between the two runs.',
    ])
  })

  it('splits a stored field the same way, through the same rule', () => {
    // `paragraphsOf` is what the record page's stored-field view uses. It is the same two rules as
    // the markdown reader above; a second opinion about what a paragraph is would show up here.
    expect(sb.paragraphsOf('第一段。\n\n第二段。')).toEqual(['第一段。', '第二段。'])
    expect(sb.paragraphsOf('the wrist\ncamera')).toEqual(['the wrist camera'])
    expect(sb.paragraphsOf('视觉\n组')).toEqual(['视觉组'])
  })
})

describe('markdown structure survives the wrapping rules', () => {
  it('draws a quoted line as a quote instead of printing the > it was written with', () => {
    // It used to fall through to the paragraph arm, which rendered a literal ">" and lost the fact
    // that the words were somebody else's. Structure deleted in silence is the one thing this
    // renderer may not do.
    const html = body(render(h(sb.SummaryBlocks, { blocks: [{ type: 'text', id: 't', text: '> the gripper stalls at 12 N\n> every time' }] })))
    expect(html).toContain('<blockquote')
    expect(html).toContain('the gripper stalls at 12 N every time')
    expect(html).not.toContain('&gt;')
  })

  it('keeps a list, a fence and an equation as themselves', () => {
    const html = body(
      render(
        h(sb.SummaryBlocks, {
          blocks: [{ type: 'text', id: 't', text: '- one\n- two\n\n```\nmake run\n```\n\nabout $12\\,\\mathrm{N}$' }],
        }),
      ),
    )
    expect(html).toContain('<ul')
    expect(html).toContain('<pre')
    expect(html).toContain('make run')
    expect(html).toContain('role="math"')
  })
})
