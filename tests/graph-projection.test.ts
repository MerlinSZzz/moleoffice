// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CANVAS DRAWS A PROJECTION OF THE GRAPH. THE READING LAYER DRAWS ALL OF IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `StructureView.tsx` used to state an invariant in its own header: the canvas and the outline
 * render the same `StructureGraph`, so "if a fact is not in that object it is in neither, and if it
 * is in that object it is in both". That invariant has been RETIRED, on purpose, by a resolved
 * product decision — design/DECISIONS-PENDING.md §11, written up in
 * design/wave3/11-canvas-projection.md. The canvas may now show a selective projection.
 *
 * The invariant was worth having, and what it made impossible is worth naming: A CANVAS THAT QUIETLY
 * SHOWS LESS THAN THE PROJECT. Four things replace it, and every one of them is a test below:
 *
 *   1. THE COUNT IS EXACT. `projectForCanvas` hands back the nodes it left out, not an estimate of
 *      how many, and everything printed on screen is `omitted.length`.
 *   2. THE CARDS ARE NAMED. The page prints every one of them, so a reader can get from "17 are not
 *      drawn" to the actual 17.
 *   3. `Show all` DRAWS THEM. Every card, on the canvas, with the strip that costs.
 *   4. A PROJECTION WITH NOTHING TO DRAW SAYS SO IN WORDS. A workspace whose modules are real and
 *      not yet linked is the worst first run this rule has, and it must never be an empty box.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIXTURE IS THE MEASUREMENT
 * ---------------------------------------------------------------------------------------
 *
 * 27 modules with 5 links between them is not an invented shape: it is the workspace the decision
 * was measured on, where ELK produced 7,924 × 364 px — six windows across, 17% of it in the window,
 * one row tall. Ten of those 27 are on the ends of a line and seventeen are on the ends of nothing.
 * The numbers in these tests are those numbers.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE READS SOURCE ANY MORE, AND THIS SAYS WHAT REPLACED IT
 * ---------------------------------------------------------------------------------------
 *
 * Four cases used to read `StructureView.tsx` and `Canvas.tsx` as text. Two of them sliced between
 * sentences of those files' own COMMENTS, so rewording a comment reddened the suite while every
 * drawing was correct — which is the defect this file exists to catch, happening in this file.
 *
 * All four are drawn now. `Canvas.tsx` turned out to render perfectly well without a DOM: React
 * Flow needs one for its effects, not for its markup, so the canvas can be imported directly and
 * asked what it puts on the screen. `StructureView` loads it through `React.lazy`, which is why a
 * static render of the whole page never contains it and why the canvas is imported on its own here.
 *
 * WHAT IS STILL OUT OF REACH, named rather than left to look like coverage: the state AFTER a
 * layout has run. A card has no measured size outside a browser, so the canvas here is always in
 * the state before it has worked the positions out. What the foot says once the cards are placed,
 * and whether it is drawn outside the box that clips it, are browser facts —
 * `node tools/review.mjs` photographs the page and tests/graph-presence-in-the-browser.test.ts
 * drives it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AttentionResult } from '../src/shared/attention.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { GraphLink, Scope, StructureGraph } from '../src/web/components/graph/model.ts'
import { englishWords } from '../src/shared/words/joined.ts'

const en = englishWords()

type Model = typeof import('../src/web/components/graph/model.ts')
type OutlineModule = typeof import('../src/web/components/graph/Outline.tsx')
type View = typeof import('../src/web/components/graph/StructureView.tsx')
type CanvasModule = typeof import('../src/web/components/graph/Canvas.tsx')

let model: Model
let outline: OutlineModule
let view: View
/**
 * THE CANVAS ITSELF, WHICH THIS FILE USED TO READ AS TEXT INSTEAD OF DRAWING.
 *
 * `StructureView` loads it through `React.lazy`, so a static render of the page gets the waiting
 * state and never the canvas. Imported directly it renders, which is what three cases below now
 * use. What it cannot reach without a browser is the state AFTER a layout has run — the cards have
 * no measured size here — and each of those cases says which half it is holding.
 */
let canvas: CanvasModule

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope to restore who you are acting as, and
  // every module here reaches it through the component library. `matchMedia` answers "this is NOT a
  // phone", so `StructureView` is composing for a CANVAS — which is what these tests are about.
  // Nothing in this stand-in is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  model = await import('../src/web/components/graph/model.ts')
  outline = await import('../src/web/components/graph/Outline.tsx')
  view = await import('../src/web/components/graph/StructureView.tsx')
  canvas = await import('../src/web/components/graph/Canvas.tsx')
})

// ============================================================================ fixtures

const STAMP = '2026-08-01 09:00:00'
const NOW = Date.parse('2026-08-09T12:00:00')

function record(over: Partial<PanelRecord> & Pick<PanelRecord, 'id' | 'kind' | 'title'>): PanelRecord {
  return {
    workspaceId: 'default',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    summary: null,
    data: {},
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
    ...over,
  }
}

function link(over: Partial<GraphLink> & Pick<GraphLink, 'linkId' | 'fromId' | 'toId'>): GraphLink {
  return { type: 'relates_to', inferred: false, broken: false, gate: { at: 'not-a-dependency' }, ...over }
}

/** A minimal attention reply: only the two lists the drawing reads. */
const ATTENTION = {
  visible: [],
  remainder: [],
  total: 0,
} as unknown as AttentionResult

/** Twenty-seven modules, titled so a title cannot be a substring of another one. */
const MODULES: PanelRecord[] = Array.from({ length: 27 }, (_, n) =>
  record({
    id: `m${String(n).padStart(2, '0')}`,
    kind: 'module',
    title: `module-${String(n).padStart(2, '0')}`,
    data: { context: 'why this module exists', parts: [] },
  }),
)

/**
 * Five links between ten of the twenty-seven. The other seventeen are on the end of nothing, which
 * is the shape the decision measured and the reason it was taken.
 */
const FIVE_LINKS: GraphLink[] = [
  link({ linkId: 'L1', fromId: 'm00', toId: 'm01', type: 'blocks', gate: { at: 'gate', gate: { kind: 'hard' } } }),
  link({ linkId: 'L2', fromId: 'm02', toId: 'm03', type: 'consumes' }),
  link({ linkId: 'L3', fromId: 'm04', toId: 'm05', type: 'measures' }),
  link({ linkId: 'L4', fromId: 'm06', toId: 'm07', type: 'relates_to' }),
  link({ linkId: 'L5', fromId: 'm08', toId: 'm09', type: 'relates_to' }),
]

/** One pipeline: three blocks, one dependency, one module carrying one of them. */
const PIPELINE: PanelRecord[] = [
  record({ id: 'p1', kind: 'pipeline', title: 'Transplant v2', data: { blockIds: ['b1', 'b2', 'b3'] } }),
  record({ id: 'b1', kind: 'block', title: 'Transplant v2 › Detect the hand', data: { state: 'done' } }),
  record({ id: 'b2', kind: 'block', title: 'Transplant v2 › Track it', data: { state: 'todo' } }),
  // NOTHING JOINS THIS ONE. No dependency and no module carries it, so it is exactly the card the
  // projection rule would drop — except that it is inside a box, which is why it is not dropped.
  record({ id: 'b3', kind: 'block', title: 'Transplant v2 › Score it', data: { state: 'todo' } }),
]

const PIPELINE_LINKS: GraphLink[] = [
  link({ linkId: 'PL1', fromId: 'b1', toId: 'b2', type: 'blocks', gate: { at: 'gate', gate: { kind: 'hard' } } }),
  link({ linkId: 'PL2', fromId: 'm00', toId: 'b1', type: 'implements' }),
]

function build(records: readonly PanelRecord[], links: readonly GraphLink[], scope: Scope = { at: 'modules' }): StructureGraph {
  return model.buildStructureGraph({ records, links, attention: ATTENTION, scope, now: NOW })
}

const drawOutline = (graph: StructureGraph): string => renderToStaticMarkup(h(outline.Outline, { graph }))

function structureView(links: readonly GraphLink[], scope: Scope = { at: 'modules' }): string {
  return renderToStaticMarkup(
    h(view.StructureView, {
      records: MODULES,
      links,
      attention: ATTENTION,
      scope,
      hrefFor: () => '#/pipeline',
      onChanged: async () => {},
      now: NOW,
    }),
  )
}

/**
 * The page's markup with its stylesheets taken out.
 *
 * THE STYLESHEET THE PAGE CARRIES NAMES EVERY CLASS IN IT, and its comments name the controls those
 * classes are about, so without this every class and every control in the product is "on the page".
 * A rule about where a refusal is drawn mentioned `Show all` in its comment and a test asking
 * whether the page OFFERS Show all read it as an offer.
 */
const withoutStyles = (html: string): string => html.replace(/<style[\s\S]*?<\/style>/g, '')

/** The canvas on its own, drawn from a projection, without the page around it. */
function drawCanvas(links: readonly GraphLink[], mode: 'joined' | 'all' = 'joined'): string {
  const projection = model.projectForCanvas(build(MODULES, links), mode)
  return renderToStaticMarkup(h(canvas.default, { projection, onOpen: () => {}, onIntentChanged: () => {} }))
}

/**
 * What a reader sees WITHOUT PRESSING ANYTHING: `<summary>` kept, `<details>` body dropped.
 *
 * THIS IS THE BAR THE PROJECTION'S COUNTS HAVE TO CLEAR, and it is why this helper exists. A canvas
 * is allowed to draw fewer cards than the graph holds only while it says so, exactly, on screen. A
 * count moved into the body of a fold would still be "on the page" to a substring search and would
 * be invisible to a reader, so the assertions below run against this rather than against the whole
 * markup. A summary is not behind the fold — it is the fold — so it counts as visible.
 */
function defaultVisible(html: string): string {
  let out = ''
  let at = 0
  for (;;) {
    const open = html.indexOf('<details', at)
    if (open < 0) return out + html.slice(at)
    const summary = html.indexOf('</summary>', open)
    const close = html.indexOf('</details>', open)
    expect(summary, 'a <details> with no </summary>').toBeGreaterThan(-1)
    expect(close, 'a <details> with no </details>').toBeGreaterThan(-1)
    out += html.slice(at, summary + '</summary>'.length)
    at = close + '</details>'.length
  }
}

// ============================================================================ the rule

describe('the canvas draws the cards a line touches, and counts the rest exactly', () => {
  const graph = () => build(MODULES, FIVE_LINKS)

  it('draws ten of the twenty-seven, and leaves out seventeen — the exact number, not a rounding', () => {
    const complete = graph()
    expect(complete.nodes).toHaveLength(27)
    expect(complete.edges).toHaveLength(5)

    const canvas = model.projectForCanvas(complete, 'joined')
    expect(canvas.graph.nodes).toHaveLength(10)
    expect(canvas.omitted).toHaveLength(17)
    expect(canvas.total).toBe(27)
    // The count a reader is shown is this list's own length and never a second sum: 10 + 17 = 27,
    // and there is no arithmetic anywhere else that could make it 26 or 28.
    expect(canvas.graph.nodes.length + canvas.omitted.length).toBe(canvas.total)
    expect(canvas.omission?.count).toBe(17)
    expect(canvas.empty).toBe(false)
  })

  it('says the numbers in words, so the sentence under the drawing can be acted on', () => {
    const canvas = model.projectForCanvas(graph(), 'joined')
    expect(canvas.sentence).toContain('10 of 27 cards')
    expect(canvas.sentence).toContain('17')
    // The way out is named, not implied.
    expect(canvas.sentence).toContain('Show all')
    expect(canvas.sentence).toContain('are listed below')
  })

  it('drops only cards that no line touches, at either end', () => {
    const canvas = model.projectForCanvas(graph(), 'joined')
    const touched = new Set(canvas.graph.edges.flatMap((edge) => [edge.from, edge.to]))
    for (const node of canvas.omitted) {
      expect(touched.has(node.id), `${node.title} is on the end of a line and was dropped`).toBe(false)
    }
    // And the other direction: every card a line touches is drawn.
    for (const id of touched) {
      expect(canvas.graph.nodes.some((node) => node.id === id), `${id} is on a line and is not drawn`).toBe(true)
    }
    // Every line still has both its ends, so nothing on the canvas points at a card that is not there.
    const drawn = new Set(canvas.graph.nodes.map((node) => node.id))
    for (const edge of canvas.graph.edges) {
      expect(drawn.has(edge.from) && drawn.has(edge.to), `line ${edge.id} lost an end`).toBe(true)
    }
  })

  it('takes cards away and never adds or edits one', () => {
    const complete = graph()
    const canvas = model.projectForCanvas(complete, 'joined')
    const byId = new Map(complete.nodes.map((node) => [node.id, node]))
    for (const node of canvas.graph.nodes) {
      // The same object, not a copy with something quietly recomputed on it.
      expect(byId.get(node.id)).toBe(node)
    }
    expect(canvas.graph.edges).toBe(complete.edges)
    expect(canvas.graph.walls).toBe(complete.walls)
    expect(canvas.graph.report).toBe(complete.report)
    expect(canvas.graph.title).toBe(complete.title)
  })

  it('counts what is DRAWN in the drawing’s own heading, not what the graph holds', () => {
    // Two numbers about cards on one page have to reconcile without the reader doing arithmetic. A
    // heading reading "27 cards" over a canvas drawing 10 is true and, read alone, contradicts the
    // drawing under it. The heading is a count and not a sentence now — "10 of 27 cards drawn"
    // became "10 / 27 drawn" — because the fold under the drawing carries the same two numbers and
    // the naming, and the page was saying it twice in words.
    const html = structureView(FIVE_LINKS)
    expect(html).toContain('10 / 27 drawn')
    expect(html).not.toContain('>27 cards<')
  })

  it('keeps a pipeline drawing whole: the box, and everything inside it', () => {
    const complete = build([...MODULES, ...PIPELINE], PIPELINE_LINKS, { at: 'pipeline', recordId: 'p1' })
    const canvas = model.projectForCanvas(complete, 'joined')
    // A pipeline is one connected chain plus the modules its lines reach, so the rule has nothing to
    // drop — including `b3`, which no line touches at all and is drawn because it is inside the box.
    expect(canvas.omitted).toEqual([])
    expect(canvas.graph.nodes).toHaveLength(complete.nodes.length)
    expect(canvas.sentence).toBeNull()
    expect(canvas.omission).toBeNull()
    expect(complete.nodes.some((node) => node.stepId === 'b3')).toBe(true)
    expect(canvas.graph.nodes.some((node) => node.stepId === 'b3')).toBe(true)
  })
})

// ============================================================================ nothing linked yet

describe('a workspace whose cards are real and not yet linked', () => {
  const graph = () => build(MODULES, [])

  it('says so in words instead of drawing an empty box', () => {
    const complete = graph()
    expect(complete.nodes).toHaveLength(27)
    expect(complete.edges).toEqual([])

    const canvas = model.projectForCanvas(complete, 'joined')
    expect(canvas.empty).toBe(true)
    expect(canvas.graph.nodes).toEqual([])
    expect(canvas.omitted).toHaveLength(27)
    // The two facts a reader needs and cannot get from a blank frame: nothing is linked, and every
    // card is in the list below. THE OTHER THIRTY WORDS WENT. The sentence used to spend most of
    // itself denying charges nobody had made — "That is what is on file, not a failed layout and
    // not an empty project" — in the vocabulary of the implementation: "the reading layer below",
    // "the strip a layout makes of cards that join nothing". Finding 31, 19 August 2026. The two
    // facts survive; the defence and the internal words do not. A THIRD FACT JOINED THEM on
    // 5 September 2026: what would draw a card. Criterion D2 of design/drawings/ACCEPTANCE.md — an
    // empty drawing that says only that it is empty leaves the reader nothing to do about it. The
    // sentence it names is asserted in tests/a-drawing-control-is-never-silent.test.ts.
    expect(canvas.sentence).toContain('None of these 27 modules is linked to another')
    expect(canvas.sentence).toContain('They are all listed below')
    expect(canvas.sentence).not.toContain('reading layer')
    expect(canvas.sentence).not.toContain('not a failed layout')
    // AND A FOURTH FACT, the same day: Show all is beside that sentence and puts every card on the
    // canvas in one press, and the sentence did not name it. Problem igS-XA9B7ejS.
    expect(canvas.sentence).toContain('Show all 27 draws the cards without lines')
  })

  it('says why it is empty at two lengths, and they are one fact', () => {
    // ONE FACT, TWO LENGTHS. The paragraph where the drawing would be gets the whole account; a
    // control refusing 52 pixels from that paragraph gets the short line, because the long one
    // printed twice is what problem f43ANgTxSkST measured. Both are built together in model.ts, and
    // `sentence` IS the long form rather than a third copy of it.
    const canvas = model.projectForCanvas(graph(), 'joined')
    expect(canvas.nothingToDraw?.long).toBe(canvas.sentence)

    // THE SHORT FORM SAYS THE TWO THINGS A READER ACTS ON: why there is nothing, and the button that
    // fills it. Under 90 characters, because it is drawn beside three buttons rather than instead of
    // them — measured at 86 for a workspace of 16 modules, at four widths in both themes.
    for (const total of [1, 4, 16, 27, 1080]) {
      for (const at of ['modules', 'pipeline'] as const) {
        const words = model.whyNothingIsDrawn(at, total)
        expect(words.short.length, `the short form for ${at} at ${String(total)} is: ${words.short}`).toBeLessThan(90)
        expect(words.short.length, 'the short form says nothing').toBeGreaterThan(20)
        expect(words.long.length, 'the long form is not longer than the short one').toBeGreaterThan(words.short.length)
        expect(words.long, 'the long form does not say what Show all draws').toContain(`Show all ${String(total)}`)
      }
    }
    expect(model.whyNothingIsDrawn('modules', 27).short).toContain('Show all 27')
    expect(model.whyNothingIsDrawn('pipeline', 1).long).toContain('Show all 1 draws the card without lines')
  })

  it('is a different answer from a workspace with nothing on file', () => {
    // Nothing to draw and nothing filed must never look alike. An empty graph is not a projection:
    // there is nothing to project and nothing is left out.
    const nothing = model.projectForCanvas(build([], []), 'joined')
    expect(nothing.empty).toBe(false)
    expect(nothing.omitted).toEqual([])
    expect(nothing.sentence).toBeNull()
  })

  it('is composed as a sentence on the page and not as an empty drawing', () => {
    // `StructureView` must not mount the drawing at all in this case: fetching React Flow and elkjs
    // to show a blank frame is the empty box with a delay in front of it.
    //
    // THIS USED TO SLICE StructureView.tsx BETWEEN TWO PIECES OF ITS OWN JSX and compare where two
    // strings sat. Moving a line of markup broke it with nothing wrong, and it could say nothing
    // about what a person gets. The page is drawn instead, with nothing on file, and what it does
    // and does not mount is read off the markup.
    // The stylesheets come out before anything is looked for — see `withoutStyles` above.
    const emptyPage = withoutStyles(
      renderToStaticMarkup(
        h(view.StructureView, {
          records: [],
          links: [],
          attention: ATTENTION,
          scope: { at: 'modules' } as Scope,
          hrefFor: () => '#/pipeline',
          onChanged: async () => {},
          now: NOW,
        }),
      ),
    )
    expect(emptyPage, 'a project with nothing on file mounts a drawing anyway').not.toContain('gx-stage-canvas')
    expect(emptyPage, 'a project with nothing on file counts cards it does not have').not.toMatch(/\d+ \/ \d+ drawn/)
    expect(emptyPage.length, 'nothing at all is on the page').toBeGreaterThan(0)
    // And a project that DOES hold something mounts the drawing, so the case above is a difference
    // between two states and not the page never mounting a canvas at all.
    expect(withoutStyles(structureView(FIVE_LINKS)), 'the page never mounts a drawing at all').toMatch(
      /\d+ \/ \d+ drawn/,
    )
  })
})

// ============================================================================ show all

describe('Show all', () => {
  it('draws every card, and leaves nothing out to report', () => {
    const complete = build(MODULES, FIVE_LINKS)
    const all = model.projectForCanvas(complete, 'all')
    expect(all.graph.nodes).toHaveLength(27)
    // The complete object itself, so there is nothing for a projection to have changed.
    expect(all.graph).toBe(complete)
    expect(all.omitted).toEqual([])
    expect(all.omission).toBeNull()
    expect(all.sentence).toBeNull()
    expect(all.empty).toBe(false)
  })

  it('is offered on the page, with the exact number of cards it would add', () => {
    const html = structureView(FIVE_LINKS)
    expect(html).toContain('Show all 27')
    // What it costs, on the control itself rather than after it is pressed.
    expect(html).toContain('17 that no line touches')
    expect(html).toContain('strip')
  })

  it('is not offered where it would do nothing', () => {
    // Every card of this drawing is on the end of a line, so there is nothing to show that is not
    // shown. A control that changes nothing is worse than no control.
    const html = structureView([
      ...FIVE_LINKS,
      ...MODULES.slice(10).map((module, n) =>
        link({ linkId: `X${n}`, fromId: 'm00', toId: module.id, type: 'relates_to' }),
      ),
    ])
    // WITHOUT THE STYLESHEETS: the rule that keeps a refusal out of the button row names Show all in
    // its own comment, and a comment in a stylesheet is not the page offering a control.
    expect(withoutStyles(html)).not.toContain('Show all')
  })
})

// ============================================================================ an arranged card that is not drawn

/**
 * A LANE AND AN ORDER STORED FOR A CARD THIS CANVAS IS NOT DRAWING.
 *
 * This is the collision between the two halves of this file's subject. A projection may take a card
 * off the canvas — settled, rule (b) — and presentation intent may be stored for any card in the
 * scope. Put the two together and the reader gets the worst screen in the product: they arrange
 * something, the server answers 200 and reports it honoured, the drawing does not move, and nothing
 * anywhere says why. src/shared/presentation.ts is explicit that a hint the drawing could not honour
 * must be reported and never quietly dropped, and this was the last way one could be dropped.
 *
 * MEASURED RATHER THAN IMAGINED. `tools/review.mjs` photographed it eight times in eighty-five runs
 * between 13 and 19 August 2026: its presentation-intent proof arranged three modules chosen by
 * sorted record id, and on the runs where all three were cards no line touched it reported that a
 * stored lane and order reach nothing. They reach every card the canvas draws; they reached nothing
 * because the canvas was drawing none of the three.
 */
describe('an arrangement stored for a card the canvas is not drawing', () => {
  // m10 is one of the seventeen that no line touches, so this arrangement can only ever apply on
  // "Show all" and in the reading layer.
  const ARRANGED = {
    nodes: {
      m10: { lane: 'the arm', order: 1, emphasis: 'safety' as const },
    },
  }
  const arrangedGraph = (): StructureGraph =>
    model.buildStructureGraph({
      records: MODULES,
      links: FIVE_LINKS,
      attention: ATTENTION,
      scope: { at: 'modules' },
      now: NOW,
      intent: ARRANGED,
    })

  it('is applied by the model, because the model is complete', () => {
    const complete = arrangedGraph()
    const node = complete.nodes.find((n) => n.recordId === 'm10')
    expect(node?.presentation.lane).toBe('the arm')
    expect(node?.presentation.order).toBe(1)
    expect(node?.presentation.stored).toEqual(['lane', 'order', 'emphasis'])
    // Nothing is unhonoured about the SCOPE: every hint names a card that is in this drawing.
    expect(complete.report.unhonoured).toEqual([])
    expect(complete.report.honoured.length).toBe(3)
  })

  it('is reported by the canvas as a hint it could not apply, naming the card and why', () => {
    const canvas = model.projectForCanvas(arrangedGraph(), 'joined')
    expect(canvas.graph.nodes.some((n) => n.recordId === 'm10')).toBe(false)
    expect(canvas.graph.report.unhonoured).toHaveLength(1)
    const [entry] = canvas.graph.report.unhonoured
    expect(entry?.target).toBe('m10')
    // One entry for one card, worded the way `applyIntent` words a target with no card at all — so
    // the count the canvas prints is a count of cards and never argues with the names beside it.
    expect(entry?.hint).toBe('all of it')
    // Every hint stored for it is named, in the sentence, where no number is claimed.
    expect(entry?.because).toContain('(lane, order, emphasis)')
    expect(entry?.because).toContain('module-10')
    expect(entry?.because).toContain('no line on it touches')
    // The way to see it honoured is named rather than left to be worked out.
    expect(entry?.because).toContain('Show all')
  })

  it('is not also counted as applied on the same canvas, because it was not', () => {
    const canvas = model.projectForCanvas(arrangedGraph(), 'joined')
    expect(canvas.graph.report.honoured).toEqual([])
  })

  it('leaves the complete graph’s own report alone, so the reading layer still says it was applied', () => {
    const complete = arrangedGraph()
    model.projectForCanvas(complete, 'joined')
    expect(complete.report.unhonoured).toEqual([])
    expect(complete.report.honoured.length).toBe(3)
  })

  it('is applied, and reported applied, the moment “Show all” draws the card', () => {
    const all = model.projectForCanvas(arrangedGraph(), 'all')
    expect(all.graph.nodes.some((n) => n.recordId === 'm10')).toBe(true)
    expect(all.graph.report.unhonoured).toEqual([])
    expect(all.graph.report.honoured.length).toBe(3)
  })

  it('says nothing at all when the cards it is not drawing were never arranged', () => {
    // The ordinary state, and it has to stay silent: seventeen cards are not drawn here and nobody
    // arranged any of them, so there is nothing about an arrangement to report.
    const complete = build(MODULES, FIVE_LINKS)
    const canvas = model.projectForCanvas(complete, 'joined')
    expect(canvas.graph.report.unhonoured).toEqual([])
    expect(canvas.graph.report.honoured).toEqual([])
    // The graph's own report object, not a copy made for nothing — which is also what the test
    // above about taking cards away and never editing one asserts.
    expect(canvas.graph.report).toBe(complete.report)
  })
})

// ============================================================================ the reading layer

describe('the reading layer keeps every card the canvas drops', () => {
  it('prints all of them, and a projected outline would not', () => {
    const complete = build(MODULES, FIVE_LINKS)
    const canvas = model.projectForCanvas(complete, 'joined')
    expect(canvas.omitted).toHaveLength(17)

    const whole = drawOutline(complete)
    // What the reading layer WOULD print if it were ever handed the projection. This is the failure
    // the test below pins the wiring against: rendered from the canvas's graph, seventeen records
    // are gone from the only composition that was holding them.
    const projected = drawOutline(canvas.graph)

    for (const node of canvas.omitted) {
      expect(whole, `${node.title} is not in the reading layer`).toContain(node.title)
      expect(projected).not.toContain(node.title)
    }
    // And the reading order still covers the whole graph, so the omitted cards are placed rather
    // than appended.
    expect(model.readingOrder(complete).order).toHaveLength(27)
  })

  it('gives the reading layer every card while the drawing keeps only the projection', () => {
    // ONE LINE OF WIRING IS THE WHOLE OF THE NEW BOUNDARY. If the outline is ever given
    // `canvas.graph`, every count on the page stays right and seventeen records leave the product
    // without a word — which is the exact failure the retired invariant used to make impossible.
    //
    // THIS USED TO SEARCH StructureView.tsx FOR THE EXACT TEXT `<Outline graph={graph} />`. Renaming
    // either variable turned it red with nothing broken, and it could not tell whether a card
    // reached a reader. The two objects are compared through what each one puts on the page.
    const page = structureView(FIVE_LINKS)
    const complete = build(MODULES, FIVE_LINKS)
    const projected = model.projectForCanvas(complete, 'joined')
    expect(complete.nodes.length, 'the fixture no longer has cards the canvas leaves out').toBeGreaterThan(
      projected.graph.nodes.length,
    )
    // NOT ONE OF THEM LEAVES THE PRODUCT WITHOUT A WORD. Every card the canvas dropped is named on
    // the page, by its own title, in the composition that dropped it.
    for (const node of projected.omitted) {
      expect(page, `${node.title} was dropped and is nowhere on the page`).toContain(node.title)
    }
    // And the page says how many of them the drawing has, which is the projection's count and not
    // the graph's.
    expect(page).toContain(`${String(projected.graph.nodes.length)} / ${String(complete.nodes.length)} drawn`)
    // The reading layer is handed the COMPLETE graph. Handed the projection instead, seventeen
    // cards would be gone from the only composition holding them, and every count would stay right.
    const wholeOutline = drawOutline(complete)
    const projectedOutline = drawOutline(projected.graph)
    for (const node of projected.omitted) {
      expect(wholeOutline, `${node.title} is not in the reading layer`).toContain(node.title)
      expect(projectedOutline, `${node.title} survived a projected reading layer`).not.toContain(node.title)
    }
  })

  it('names every card the canvas is not drawing, on the page, with a way to each one', () => {
    const html = structureView(FIVE_LINKS)
    const complete = build(MODULES, FIVE_LINKS)
    const canvas = model.projectForCanvas(complete, 'joined')
    expect(canvas.omitted).toHaveLength(17)
    // The fold that gets a reader from the count to the cards, named rather than called "more".
    expect(html).toContain('why these are not on the canvas, and each one named')
    expect(html).toContain('10 / 27 drawn')
    expect(html).toContain('>17<')
    // And each of the seventeen by name, each a link to its own record.
    for (const node of canvas.omitted) {
      expect(html, `${node.title} is counted and not named`).toContain(node.title)
      expect(html).toContain(`#/r/${node.recordId}`)
    }
  })

  it('says it once, not twice: the projection is not also an entry in the scope’s omitted list', () => {
    // `canvas.omission` used to be appended to `graph.omitted` and printed as a list entry —
    // "17 cards no line on this canvas touches — A canvas of boxes and lines is a picture of…" —
    // directly under the canvas's own sentence saying the same thing in different words. It was a
    // duplicate 100% of the time it appeared: `omission` is non-null exactly when `sentence` is.
    // The MODEL still carries the field (the assertions above), and the count is still on the page
    // three times over; what is gone is one paragraph.
    const html = structureView(FIVE_LINKS)
    expect(html).not.toContain('no line on this canvas touches')
    expect(html).not.toContain('A canvas of boxes and lines is a picture of what depends on what')
  })

  it('never says "nothing is left out" over a canvas that is leaving 17 cards out', () => {
    // THE HONEST ZERO CASE. This scope's own `omitted` list is empty, so with the projection entry
    // gone the page would have printed "Nothing is left out of this drawing." beside a heading
    // reading "10 of 27 cards drawn". The sentence is kept for the drawing it is true of.
    const complete = build(MODULES, FIVE_LINKS)
    expect(complete.omitted).toHaveLength(0)
    expect(structureView(FIVE_LINKS)).not.toContain('Nothing is left out of this drawing')

    // And where every card really is drawn, the zero case is said out loud, exactly as before.
    const everythingJoined = structureView([
      ...FIVE_LINKS,
      ...MODULES.slice(10).map((module, n) =>
        link({ linkId: `X${n}`, fromId: 'm00', toId: module.id, type: 'relates_to' }),
      ),
    ])
    expect(everythingJoined).toContain('Every card in this drawing is drawn.')
  })

  it('states both counts where a reader can see them without pressing anything', () => {
    /*
     * WHAT REPLACED A SOURCE READ, AND WHY IT IS STRONGER.
     *
     * This used to read `Canvas.tsx` and check that `projection.sentence` — four sentences saying
     * how many cards were drawn, how many joined nothing, where they were named and what "Show all"
     * would do — was printed under the drawing. That paragraph has gone; the two COUNTS it carried
     * are one clause of the fold under the drawing, and the sentences are that fold's body.
     *
     * The rule the paragraph existed to satisfy has not moved an inch: a canvas may draw fewer
     * cards than the graph holds only while it says exactly how many, on screen. So this asserts
     * the rule directly, on rendered markup, against what a reader can actually see — which the
     * source read could not do, because a substring in a file says nothing about whether it is
     * behind a `<details>`.
     */
    const html = structureView(FIVE_LINKS)
    const visible = defaultVisible(html)
    // TWO SURFACES, ONE NUMBER EACH, AND THEY ADD UP. The heading carries what is drawn out of what
    // there is; the fold under the drawing carries what is left out. Putting the pair in both was
    // tried and printed "10 / 27 drawn" twice, a panel apart.
    expect(visible).toContain('10 / 27 drawn')
    expect(visible).toContain('isolated')
    expect(visible).toContain('>17<')
    expect(visible.match(/10 \/ 27 drawn/g), 'the same count is on the page twice').toHaveLength(1)

    // And the bargain that makes the fold allowed: the exact count is on screen, the seventeen
    // cards themselves are one press away, and they really are behind the press rather than in it.
    const dropped = model.projectForCanvas(build(MODULES, FIVE_LINKS), 'joined').omitted
    const first = dropped[0]
    expect(first, 'the fixture dropped nothing, so this test proves nothing').toBeDefined()
    expect(html).toContain(first!.title)
    expect(visible).not.toContain(first!.title)
  })

  it('shows nothing until it has worked the positions out, and says so instead', () => {
    /*
     * THIS USED TO SLICE Canvas.tsx BETWEEN TWO SENTENCES OF ITS OWN COMMENTS and look for the
     * variable names inside. Rewording a comment reddened the suite while the drawing was correct,
     * which is the defect this file exists to catch, in this file.
     *
     * The canvas is drawn instead. `StructureView` loads it lazily, so it is imported directly.
     *
     * WHAT THIS REACHES AND WHAT IT DOES NOT. A card has no measured size outside a browser, so the
     * canvas here is in the state BEFORE a layout — which is the state worth holding, because an
     * empty picture and a picture still being worked out are the two answers that must never look
     * alike. What the foot says once the layout HAS run, and whether it is drawn outside the box
     * that clips it, are browser facts: `node tools/review.mjs` photographs the page and
     * tests/graph-presence-in-the-browser.test.ts drives it.
     */
    const html = drawCanvas(FIVE_LINKS)
    expect(html, 'the canvas shows a heap of cards at the origin before it has laid them out').toContain(
      'data-shows="0"',
    )
    // AND IT SAYS WHAT IS HAPPENING, with the count so far, rather than standing blank.
    const status = /<p class="gx-canvas-state"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? ''
    expect(status, 'a canvas with nothing on it yet says nothing about why').not.toBe('')
    expect(status.replace(/<[^>]*>/g, ''), 'the waiting line does not say what it is waiting for').toContain(
      'Measuring the cards',
    )
    expect(status, 'the waiting line counts nothing, so a stuck canvas looks like a working one').toMatch(/\d/)
  })
})

// ============================================================================ derived, not stored

describe('normal mode leaves the drawing storage explanation to inspection', () => {
  // Plan 7FEOshq3mBGG replaces the earlier normal-mode storage explanation.
  it('keeps storage mechanics off the normal drawing and its folds', () => {
    const page = structureView(FIVE_LINKS)
    expect(defaultVisible(page)).not.toContain(en['g7b.StructureView.layout_derived_except_where_somebody_moved_a'])
    expect(page).not.toContain('what is stored and what is not')
  })

  it('does not repeat the storage explanation on the normal canvas', () => {
    const page = structureView(FIVE_LINKS)
    expect(page).not.toContain(en['g7b.StructureView.layout_derived_except_where_somebody_moved_a'])
    const onCanvas = drawCanvas(FIVE_LINKS).replace(/<style[\s\S]*?<\/style>/g, '')
    expect(onCanvas).not.toContain('No position here is stored')
    expect(onCanvas).not.toContain('worked out again on every draw')
  })
})

/*
 * WHAT IS NOT TESTED HERE, AND WHY IT IS NOT.
 *
 * That nothing about the projection is STORED. It is a derived rendering — src/shared/presentation.ts
 * layer 3 — and the vocabulary that decides what may be stored is a closed list in that file, which
 * already refuses every key it does not name. A test asserting that would pass with every line of
 * this pass deleted, so it is not one: it is the shared contract's own test, and it is already in
 * tests/presentation-api.test.ts. What this pass promises instead is that it added no field, and the
 * evidence for that is the diff.
 */
