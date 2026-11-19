// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT MAY NOT BE CLAIMED HERE, ON A GRAPH CARD — read out of the markup, and read out of the one
 * table that declares it.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO FAULTS THIS FILE EXISTS TO CATCH
 * ---------------------------------------------------------------------------------------
 *
 * 1. A SEVERITY WITH NO ENTRY. `RESTRICTION_SEVERITY` and `RESTRICTION_MARKS` are two lists that
 *    have to agree, and nothing else makes them agree. Somebody adds a fourth severity, nobody adds
 *    a row, and the card draws it as whatever the lookup falls through to — likeliest the harmless
 *    weight, which is the one outcome the owner named by hand: *do not make harmless placeholders
 *    visually equivalent to production-blocking ones*. So one test walks the list.
 *
 * 2. A CARD THAT KEEPS ITS OWN COPY OF THE TABLE. The card takes two of the four channels — `glyph`
 *    and `edge` — because the other two are about a left margin the graph has already spent twice.
 *    Every assertion below reads the expected value FROM `RESTRICTION_MARKS` rather than from a
 *    literal here, so editing the table moves the card and this file together and a copy in either
 *    place fails.
 *
 * IT ASSERTS ON MARKUP, NOT ON A RETURN VALUE. `restrictionOnCard` deciding the right thing and the
 * card drawing something else is the exact shape of the fault this whole wave exists to remove, one
 * field along, so every claim below is made against the string `CardFace` renders.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'
import { freshDb, type TestDb } from './helpers.ts'
import { computeAttention } from '../src/shared/attention.ts'
import { parseDueStamp } from '../src/web/lib/attention.ts'
import {
  RESTRICTION_MARKS,
  RESTRICTION_SEVERITY,
  restrictionMarkKey,
  type RestrictionSeverity,
} from '../src/shared/restriction.ts'
import { COMPOSITION_MARKS, EVOLUTION_MARKS, markPairs } from '../src/shared/composition.ts'
import { withoutHue } from '../src/shared/states.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { GraphNode, StructureGraph } from '../src/web/components/graph/model.ts'

type CardModule = typeof import('../src/web/components/graph/card.ts')
type Model = typeof import('../src/web/components/graph/model.ts')
type Face = typeof import('../src/web/components/graph/CardFace.tsx')

let t: TestDb
let card: CardModule
let model: Model
let face: Face
let graph: StructureGraph

/** One reading, in the shape the read hands back. Only the two fields the card looks at. */
const reading = (severity: RestrictionSeverity, state = 'active') => ({ severity, standing: { state } })

beforeAll(async () => {
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
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  t = await freshDb()
  await import('../scripts/seed.ts')
  card = await import('../src/web/components/graph/card.ts')
  model = await import('../src/web/components/graph/model.ts')
  face = await import('../src/web/components/graph/CardFace.tsx')
  const records = t.api.listRecords({ workspaceId: 'default' }) as PanelRecord[]
  const links = model.graphLinks(t.api.allGatedLinks('default'))
  const now = Date.parse('2026-08-09T12:00:00')
  const attention = computeAttention({
    now,
    records: t.api.listRecords({ workspaceId: 'default', includeDeleted: true }),
    links: t.client.sqlite
      .prepare(
        'select id, from_id as fromId, to_id as toId, type, inferred, created_at as createdAt, created_by as createdBy from links',
      )
      .all() as never,
    changes: t.api
      .listChanges({ workspaceId: 'default', limit: 20000 })
      .map((row) => ({ ...row, op: row.op as never, actorType: row.actorType as never, origin: null })),
    resources: [],
    dueMs: parseDueStamp,
  })
  graph = model.buildStructureGraph({ records, links, attention, scope: { at: 'modules' }, now })
})

afterAll(() => {
  t.close()
})

/** The markup one card draws at one position, carrying these restriction readings. */
const drawWith = (
  node: GraphNode,
  says: 'label' | 'title' | 'gist',
  readings: readonly { severity: RestrictionSeverity; standing: { state: string } }[],
): string => {
  const plan = card.planCanvas(graph, says)
  const one = plan.cards.get(node.id)
  if (one === undefined) throw new Error(`${node.id} was not planned at ${says}`)
  return renderToStaticMarkup(
    h(face.CardFace, {
      node,
      onOpen: () => {},
      opens: 'Open this record',
      flow: 'RIGHT',
      lit: false,
      restriction: card.restrictionOnCard(readings, says),
      here: [],
      says,
      plan: one,
      choice: card.NOTHING_PRESSED,
      onChoose: () => {},
    }),
  )
}

/** The attributes of the restriction mark in a piece of markup, or null when none was drawn. */
const restrictionMarkIn = (markup: string): { severity: string; glyph: string; edge: string; count: string } | null => {
  const at = markup.indexOf('data-mark="restricted"')
  if (at < 0) return null
  const open = markup.lastIndexOf('<span', at)
  const close = markup.indexOf('</span></span>', at) + '</span></span>'.length
  const whole = markup.slice(open, close)
  const attr = (name: string): string => {
    const found = new RegExp(`${name}="([^"]*)"`).exec(whole)
    return found?.[1] ?? ''
  }
  const numeral = /<span class="num">([^<]*)<\/span>/.exec(whole)
  return { severity: attr('data-severity'), glyph: attr('data-glyph'), edge: attr('data-edge'), count: numeral?.[1] ?? '' }
}

const aCard = (): GraphNode => {
  const node = graph.nodes.find((one) => one.kind === 'module')
  if (node === undefined) throw new Error('the modules drawing has no module card to draw')
  return node
}

describe('the two lists that have to agree', () => {
  it('gives every severity an entry to be drawn with, so no severity falls through to another one', () => {
    const missing = RESTRICTION_SEVERITY.filter(
      (severity) => RESTRICTION_MARKS[restrictionMarkKey(severity, 'active')] === undefined,
    )
    expect(
      missing,
      'a severity with no row in RESTRICTION_MARKS is drawn as whatever the lookup falls through to, and the ' +
        'likeliest fall-through is the harmless weight — which is a blocking restriction drawn as a harmless one',
    ).toEqual([])
  })

  it('tells the least serious severity from the most serious in BOTH channels a card has room for', () => {
    const worst = RESTRICTION_MARKS[restrictionMarkKey('stops_final', 'active')]
    const least = RESTRICTION_MARKS[restrictionMarkKey('harmless', 'active')]
    expect(worst).toBeDefined()
    expect(least).toBeDefined()
    // A CARD CANNOT SPEND `form` OR `where`: every entry in the table is `where: 'leftMargin'` with
    // `form` a rail or bare text, and the card's leading edge is already spent on the kind family
    // and on urgency. So the difference has to survive in the two channels that are left.
    expect(worst!.mark.glyph, 'harmless and stops_final draw the same glyph on a card').not.toBe(least!.mark.glyph)
    expect(worst!.mark.edge, 'harmless and stops_final draw the same edge on a card').not.toBe(least!.mark.edge)
  })
})

describe('a card draws what the table says, read out of the markup', () => {
  it('draws every severity with the glyph and the edge that severity is declared with', () => {
    const node = aCard()
    for (const severity of RESTRICTION_SEVERITY) {
      const entry = RESTRICTION_MARKS[restrictionMarkKey(severity, 'active')]!
      const drawn = restrictionMarkIn(drawWith(node, 'title', [reading(severity)]))
      expect(drawn, `${severity} drew no restriction mark at all`).not.toBeNull()
      expect(drawn!.severity).toBe(severity)
      expect(drawn!.glyph, `${severity} drew glyph ${drawn!.glyph} and the table declares ${entry.mark.glyph}`).toBe(
        entry.mark.glyph,
      )
      expect(drawn!.edge, `${severity} drew edge ${drawn!.edge} and the table declares ${entry.mark.edge}`).toBe(
        entry.mark.edge,
      )
    }
  })

  it('draws the count of what still stands, at the weight of the worst one present', () => {
    const node = aCard()
    // Three harmless and one that stops final validation. The owner's own case: the numeral is four
    // and the shape is the blocking one, because drawing the count alone hides the blocking one.
    const drawn = restrictionMarkIn(
      drawWith(node, 'title', [
        reading('harmless'),
        reading('harmless'),
        reading('harmless'),
        reading('stops_final'),
      ]),
    )
    expect(drawn).not.toBeNull()
    expect(drawn!.count).toBe('4')
    expect(drawn!.severity).toBe('stops_final')
    expect(drawn!.glyph).toBe(RESTRICTION_MARKS[restrictionMarkKey('stops_final', 'active')]!.mark.glyph)
  })

  it('counts a resolved restriction that nobody has re-checked, and stops counting a judged one', () => {
    const node = aCard()
    // RESOLVING A RESTRICTION MAKES NOTHING VALID. That is the loudest rule the feature has, so a
    // reading at `resolved-unchecked` still marks the card; only `resolved` stops.
    const unchecked = restrictionMarkIn(drawWith(node, 'title', [reading('stops_final', 'resolved-unchecked')]))
    expect(unchecked, 'a resolved restriction nobody re-checked stopped marking the card').not.toBeNull()
    expect(unchecked!.count).toBe('1')
    const judged = restrictionMarkIn(drawWith(node, 'title', [reading('stops_final', 'resolved')]))
    expect(judged, 'a restriction that is finished still marked the card').toBeNull()
  })

  it('draws nothing at all when nothing reaches the card', () => {
    expect(restrictionMarkIn(drawWith(aCard(), 'title', []))).toBeNull()
  })
})

describe('where on the ladder the mark is drawn', () => {
  it('draws no restriction mark at the far position, and draws one at the two nearer ones', () => {
    const node = aCard()
    expect(
      restrictionMarkIn(drawWith(node, 'label', [reading('stops_final')])),
      'the far position has no numerals on it and a count needs one; that position draws work presence',
    ).toBeNull()
    expect(restrictionMarkIn(drawWith(node, 'title', [reading('stops_final')]))).not.toBeNull()
    expect(restrictionMarkIn(drawWith(node, 'gist', [reading('stops_final')]))).not.toBeNull()
  })

  it('decides on the position and not on the rung, so pressing a card cannot reveal a blocking mark', () => {
    // A selected card is drawn a rung higher than an ordinary one on the same drawing. If the rule
    // keyed on the rung, a blocking restriction would appear when the reader pressed the card and
    // vanish when they pressed elsewhere.
    for (const says of ['label', 'title', 'gist'] as const) {
      expect(card.restrictionMarkDrawnAt(says)).toBe(says !== 'label')
    }
  })
})

describe('nothing was joined into the composition marks', () => {
  it('leaves the composition table at six marks and its pair check at fifteen pairs', () => {
    // Wave 0, collision 9: joining the restriction marks into the composition family takes the pair
    // walk from 12 marks and 66 pairs to 18 and 153, and reds a shipped acceptance row nobody here
    // owns fixing. The graph READS the restriction table and adds nothing to this one.
    expect(COMPOSITION_MARKS).toHaveLength(6)
    expect(markPairs()).toHaveLength(15)
  })

  it('puts no restriction word and no restriction shape into the composition family', () => {
    const compositionWords = new Set(COMPOSITION_MARKS.map((one) => EVOLUTION_MARKS[one].word))
    const compositionShapes = new Set(COMPOSITION_MARKS.map((one) => withoutHue(EVOLUTION_MARKS[one].mark)))
    for (const key of Object.keys(RESTRICTION_MARKS)) {
      const entry = RESTRICTION_MARKS[key]!
      expect(compositionWords.has(entry.word), `${key}'s word is in the composition family`).toBe(false)
      expect(compositionShapes.has(withoutHue(entry.mark)), `${key}'s shape is in the composition family`).toBe(false)
    }
  })
})
