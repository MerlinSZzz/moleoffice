// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO BOX IS EVER EMPTY, AND NO NAME IS EVER CUT — MEASURED ON THE DRAWN TEXT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS REPLACES, AND WHY THE THING IT REPLACES COULD NOT FAIL
 * ---------------------------------------------------------------------------------------
 *
 * The graph used to fuse two controls. `GRAPH_SCALES` gave every zoom band an `admits` function
 * saying how many objects on the drawing were ALLOWED to carry words — the farthest band's was
 * literally `() => 0` — and every band put everything past that number at `CARD_RUNGS.R0`, whose
 * `nameAt` is null. So at `Fit all`'s 24 % every card on the owner's own campaign drawing was a box
 * with nothing in it. Not a record with nothing to say: a distance that had refused it a word.
 *
 * THE OLD PROOF OF THE SAME INVARIANT WAS VACUOUS. It asserted that no `.gx-card-title` carries
 * `data-clipped` — and the same design deleted `clipTo`, the only thing that could ever set it. A
 * check whose producer is gone is green for ever, and an eight-character cut ran underneath it.
 *
 * So this file asserts three different things, and each can fail on its own:
 *
 *   1. EVERY CARD DRAWS A NON-EMPTY IDENTITY, at every position of the ladder, on every drawing the
 *      seed can build — read out of the RENDERED MARKUP and not off a field of a return value.
 *   2. EVERY DRAWN IDENTITY IS SOMETHING SOMEBODY WROTE: a stored short form, the record's own name,
 *      or the part of that name before a dash the author themselves put in it. Never a prefix.
 *   3. THE IDENTITIES ON ONE DRAWING TELL ITS OBJECTS APART, or the drawing says which two it
 *      cannot tell apart rather than drawing one name twice in silence.
 *
 * ---------------------------------------------------------------------------------------
 * IT RENDERS, AND THAT IS THE POINT OF `CardFace.tsx` EXISTING
 * ---------------------------------------------------------------------------------------
 *
 * `Canvas.tsx` cannot be imported here: it imports React Flow's stylesheet, and the runner's
 * environment is `node`. The face of a card was moved out into `CardFace.tsx` for exactly this
 * reason, so a claim about a screen is checked against the elements the screen is made of.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT ELSE THIS FILE CARRIES, AND WHY IT IS HERE RATHER THAN LOST
 * ---------------------------------------------------------------------------------------
 *
 * `tests/graph-reveals-meaning.test.ts` and `tests/graph-simpler-as-you-zoom-out.test.ts` were the
 * proofs of the ladder this wave deleted, and they went with it. Three of their conditions are NOT
 * about the deleted mechanism and are carried forward here rather than dropped: nothing on a card is
 * generated, no canvas position draws a stored note or a fact value or an attached record's title,
 * and no position of any drawing is a document.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { computeAttention } from '../src/shared/attention.ts'
import { targetFromAttributeValue } from '../src/shared/targets.ts'
import { RUNGS, type Rung } from '../src/shared/detail.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { parseDueStamp } from '../src/web/lib/attention.ts'
import type { GraphNode, StructureGraph } from '../src/web/components/graph/model.ts'
import { freshDb, type TestDb } from './helpers.ts'

type CardModule = typeof import('../src/web/components/graph/card.ts')
type Model = typeof import('../src/web/components/graph/model.ts')
type Face = typeof import('../src/web/components/graph/CardFace.tsx')

let t: TestDb
let card: CardModule
let model: Model
let face: Face
let drawings: { name: string; graph: StructureGraph }[]

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

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
  // EVERY STRUCTURAL DRAWING THE SEED CAN MAKE, not one. A rule proved on a single drawing is a rule
  // tuned to a single drawing, and the two shapes that behave differently are a pipeline (a frame
  // with steps inside it) and the modules drawing (no frame at all).
  const built: { name: string; graph: StructureGraph }[] = [
    { name: 'modules', graph: model.buildStructureGraph({ records, links, attention, scope: { at: 'modules' }, now }) },
  ]
  for (const record of records.filter((one) => one.kind === 'pipeline')) {
    const graph = model.buildStructureGraph({ records, links, attention, scope: { at: 'pipeline', recordId: record.id }, now })
    if (graph.nodes.length >= 2) built.push({ name: record.title, graph })
  }
  drawings = built
})

afterAll(() => {
  t.close()
})

/** The markup one card draws at one position. The elements a person looks at, not a return value. */
const drawCard = (graph: StructureGraph, node: GraphNode, says: Rung, focus = card.NO_FOCUS): string => {
  const plan = card.planCanvas(graph, says, focus)
  const one = plan.cards.get(node.id)
  if (one === undefined) throw new Error(`${node.id} was not planned at ${says}`)
  return renderToStaticMarkup(
    h(face.CardFace, { node, onOpen: () => {}, flow: 'RIGHT', lit: false, restriction: null, here: [], says, plan: one, choice: card.NOTHING_PRESSED, onChoose: () => {}, opens: 'Open this record' }),
  )
}

/** What is inside `<button class="gx-card-title">…</button>`, or null when no such button was drawn. */
const titleDrawn = (markup: string): string | null => {
  const at = markup.indexOf('class="gx-card-title"')
  if (at < 0) return null
  const open = markup.indexOf('>', at)
  const close = markup.indexOf('</button>', open)
  if (open < 0 || close < 0) return null
  return markup
    .slice(open + 1, close)
    .replaceAll('<!-- -->', '')
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}

/** The three positions the canvas bar offers, plus the three above them, which must add nothing. */
const positions = (): readonly Rung[] => RUNGS

// ==================================================================== 1. no box is ever empty

describe('no box is ever empty', () => {
  it('draws a non-empty name on every card of every drawing at every position — read out of the markup', () => {
    for (const { name, graph } of drawings) {
      for (const says of positions()) {
        for (const node of graph.nodes) {
          const drawn = titleDrawn(drawCard(graph, node, says))
          expect(drawn, `${name} · ${says} · ${node.id} (${node.title}) drew no name at all`).not.toBeNull()
          expect((drawn ?? '').length, `${name} · ${says} · ${node.title} drew an empty name`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('reaches no rung that draws no name, at any position', () => {
    // THE TIER COLUMN WENT ON 6 SEPTEMBER 2026, with criterion D12: a press may not change what a
    // card draws, so the table has one answer per level rather than one per level and tier. What
    // this asserts is unchanged — no cell of it draws a box with no word in it.
    for (const says of positions()) {
      const rung = card.CARD_RUNG_AT[says]
      expect(card.CARD_RUNGS[rung].nameAt, `${says} draws at ${rung}, which has no name`).not.toBeNull()
    }
  })

  it('plans every object on the drawing and leaves none as a nameless shape', () => {
    for (const { name, graph } of drawings) {
      for (const says of positions()) {
        const plan = card.planCanvas(graph, says)
        expect(plan.cards.size, `${name} · ${says}`).toBe(graph.nodes.length)
        expect(plan.shapes, `${name} · ${says} left objects with no name`).toBe(0)
        expect(plan.withWords, `${name} · ${says}`).toBe(graph.nodes.length)
      }
    }
  })
})

// ==================================================================== 2. no name is ever cut

describe('no name is ever cut', () => {
  it('draws every character that was stored, and nothing that was not', () => {
    for (const { name, graph } of drawings) {
      for (const says of positions()) {
        const plan = card.planCanvas(graph, says)
        for (const node of graph.nodes) {
          const content = card.cardAt(node, plan.cards.get(node.id) as never)
          expect(content.name, `${name} · ${says} · ${node.title}`).not.toBeNull()
          const drawn = content.name as NonNullable<typeof content.name>
          expect(drawn.text, `${name} · ${says} · ${node.title} drew less than was stored`).toBe(drawn.full)
        }
      }
    }
  })

  it('draws only what a person wrote: a stored short form, the whole name, or the part before a dash', () => {
    for (const { name, graph } of drawings) {
      const identities = model.identityFor(graph.nodes)
      for (const node of graph.nodes) {
        const one = identities.get(node.id)
        expect(one, `${name} · ${node.id}`).toBeDefined()
        const drawn = (one as NonNullable<typeof one>).text
        const label = node.words.label
        const authored = label.kind === 'text' && label.drew === 'label' ? label.text : null
        const head = model.headOfName(node.title)
        expect(
          [authored, head, node.title].includes(drawn),
          `${name}: ${node.title} drew "${drawn}", which is not its label, its head or its whole name`,
        ).toBe(true)
      }
    }
  })
})

// ==================================================================== 3. the identities tell them apart

describe('the identities on one drawing tell its objects apart', () => {
  it('gives every object a distinct name, or names the objects it cannot tell apart', () => {
    for (const { name, graph } of drawings) {
      const identities = model.identityFor(graph.nodes)
      const seen = new Map<string, string>()
      for (const node of graph.nodes) {
        const one = identities.get(node.id) as NonNullable<ReturnType<typeof identities.get>>
        const already = seen.get(one.text)
        if (already !== undefined) {
          // A REPEAT IS ALLOWED ONLY WHERE THE DRAWING SAYS SO. Two records really can carry one
          // name, and `sharedWith` is what a card has to say about it.
          expect(one.sharedWith.length, `${name}: "${one.text}" is on two cards and neither says so`).toBeGreaterThan(0)
        }
        seen.set(one.text, node.id)
      }
    }
  })

  it('prefers the shortest candidate that nothing else on the drawing would draw', () => {
    const nodes = [
      { id: 'a', title: 'Wave 5 — Planning MVP' },
      { id: 'b', title: 'Wave 6 — The server half' },
    ].map((one) => ({ ...one, words: { label: { kind: 'nothing' } } })) as unknown as GraphNode[]
    const answer = model.identityFor(nodes)
    expect(answer.get('a')?.text).toBe('Wave 5')
    expect(answer.get('a')?.from).toBe('head')
    expect(answer.get('b')?.text).toBe('Wave 6')
  })

  it('demotes BOTH cards to their whole names the moment two heads collide', () => {
    const nodes = [
      { id: 'a', title: 'Wave 5 — Planning MVP' },
      { id: 'b', title: 'Wave 5 — something else entirely' },
    ].map((one) => ({ ...one, words: { label: { kind: 'nothing' } } })) as unknown as GraphNode[]
    const answer = model.identityFor(nodes)
    expect(answer.get('a')?.text).toBe('Wave 5 — Planning MVP')
    expect(answer.get('b')?.text).toBe('Wave 5 — something else entirely')
    expect(answer.get('a')?.from).toBe('title')
  })

  it('never overrules a label somebody wrote, and reports the collision instead', () => {
    const label = (text: string) => ({ kind: 'text', text, drew: 'label', asked: 'label', field: 'data.shortForms.label' })
    const nodes = [
      { id: 'a', title: 'A long name for one thing', words: { label: label('Perception') } },
      { id: 'b', title: 'Perception — rewrite the detector', words: { label: label('Perception') } },
    ] as unknown as GraphNode[]
    const answer = model.identityFor(nodes)
    expect(answer.get('a')?.text).toBe('Perception')
    expect(answer.get('b')?.text).toBe('Perception')
    expect(answer.get('a')?.sharedWith.length).toBeGreaterThan(0)
  })

  it('compares against every name on the drawing and not only against the cards', () => {
    // ONE COMPARISON UNIVERSE. An outline tab reading `Perception` and a card reading `Perception`
    // have to meet, or the uniqueness rule is two rules that never see each other.
    const nodes = [{ id: 'a', title: 'Perception — rewrite the detector' }].map((one) => ({
      ...one,
      words: { label: { kind: 'nothing' } },
    })) as unknown as GraphNode[]
    expect(model.identityFor(nodes).get('a')?.text).toBe('Perception')
    expect(model.identityFor(nodes, ['Perception']).get('a')?.text).toBe('Perception — rewrite the detector')
  })

  it('takes the head at the dash a person wrote and never at a colon', () => {
    expect(model.headOfName('Mole Office — blocks: a pipeline step is a record')).toBe('Mole Office')
    expect(model.headOfName('blocks: a pipeline step is a record')).toBeNull()
    expect(model.headOfName('Round eight')).toBeNull()
    expect(model.headOfName('Wave 5 - Planning')).toBe('Wave 5')
    expect(model.headOfName('Wave 5 – Planning')).toBe('Wave 5')
  })
})

// ============================================== 3a. a press on a card is about the card, not the page

describe('a press on a graph card is about that card', () => {
  it('draws a data-target on every card of every drawing, read out of the markup', () => {
    for (const { name, graph } of drawings) {
      for (const node of graph.nodes) {
        const markup = renderToStaticMarkup(
          h(
            'div',
            face.markAttributes({ node, onOpen: () => {}, flow: 'RIGHT', lit: false, restriction: null, here: [], says: 'title' as const, plan: card.planCanvas(graph, 'title').cards.get(node.id) as never, choice: card.NOTHING_PRESSED, onChoose: () => {}, opens: 'Open this record' }),
          ),
        )
        expect(markup, `${name} · ${node.title} drew no data-target`).toContain('data-target="')
      }
    }
  })

  it('names the card’s own record and never the page it is drawn on', () => {
    // A STEP'S TARGET IS THE BLOCK, NOT THE PIPELINE. That is the whole of this claim: a right-click
    // on a step of a drawing opened at `#/pipeline/<id>` used to resolve to `page/…`, so a comment
    // about one block was filed against the whole page — silently, with no error, which is why a
    // dogfood recorded it as working.
    for (const { name, graph } of drawings) {
      for (const node of graph.nodes) {
        const attributes = face.cardTarget(node)
        const value = attributes['data-target']
        expect(value, `${name} · ${node.title}`).toBeDefined()
        const read = targetFromAttributeValue(value as string)
        expect('target' in read, `${name} · ${node.title}: ${JSON.stringify(read)}`).toBe(true)
        if ('target' in read) {
          expect(read.target.kind).toBe('record')
          expect((read.target as { recordId: string }).recordId).toBe(node.recordId)
        }
      }
    }
    // AND THE STEPS OF ONE PIPELINE ARE TOLD APART. A target built from the pipeline's id would give
    // every step of a drawing the same one, which reads as correct in every assertion above.
    const pipeline = drawings.find((one) => one.graph.nodes.filter((node) => node.kind === 'step').length > 2)
    expect(pipeline, 'the seed no longer holds a pipeline drawing with three steps').toBeDefined()
    const steps = (pipeline as NonNullable<typeof pipeline>).graph.nodes.filter((node) => node.kind === 'step')
    const targets = new Set(steps.map((node) => face.cardTarget(node)['data-target']))
    expect(targets.size).toBe(steps.length)
  })
})

// ==================================================================== 4. zoom is not the detail axis

describe('canvas zoom decides no card’s words', () => {
  it('draws exactly the same thing with Developer mode on, at every position', () => {
    // FAR, MEDIUM AND NEAR ARE THREE POSITIONS OF THE DETAIL CONTROL. INSPECT IS THE PRODUCT'S MODE.
    // Fusing them would make the bar's top position turn Developer on everywhere, and would make
    // Developer mode elsewhere change what this drawing draws. `graph.md` §21 settles it and this is
    // the check: set the stored mode to `inspect`, draw every card of every drawing again, and
    // compare the markup byte for byte.
    const store = (globalThis as unknown as { window: { localStorage: { setItem: (k: string, v: string) => void } } }).window
      .localStorage
    for (const { name, graph } of drawings) {
      for (const says of positions()) {
        for (const node of graph.nodes) {
          store.setItem('mole-office.mode', 'normal')
          const asNormal = drawCard(graph, node, says)
          store.setItem('mole-office.mode', 'inspect')
          const asDeveloper = drawCard(graph, node, says)
          expect(asDeveloper, `${name} · ${says} · ${node.title} changed when Developer mode came on`).toBe(asNormal)
        }
      }
    }
    store.setItem('mole-office.mode', 'normal')
  })

  it('takes a position of the product’s own ladder and never a number', () => {
    // `planCanvas(graph, zoom)` cannot be written: the second argument is one of six words.
    for (const says of positions()) expect(() => card.planCanvas(drawings[0]?.graph as StructureGraph, says)).not.toThrow()
    // THE SECOND HALF OF THIS WENT WITH THE CONTROL OVER A DRAWING, on 6 September 2026 (D14). It
    // checked that `CANVAS_SAYS` — the three steps that control offered — were all positions of the
    // ladder. There is no such control and no such list; where a drawing opens is `opensAt` on its
    // own row of `DRAWING_PLACES`, and the compiler types that as a `Rung`.
  })
})

// ==================================================================== 5. carried forward

describe('carried forward from the two proofs the deleted ladder took with it', () => {
  it('draws only characters that are in the field the answer names', () => {
    for (const { name, graph } of drawings) {
      for (const says of positions()) {
        const plan = card.planCanvas(graph, says)
        for (const node of graph.nodes) {
          const content = card.cardAt(node, plan.cards.get(node.id) as never)
          if (content.body !== null) {
            const gist = node.words.gist
            expect(gist.kind, `${name}: ${node.title}`).toBe('text')
            if (gist.kind === 'text') expect(content.body.text).toBe(gist.text)
          }
        }
      }
    }
  })

  it('draws no stored note, no fact value and no attached record’s title at any canvas position', () => {
    for (const { name, graph } of drawings) {
      for (const says of positions()) {
        const plan = card.planCanvas(graph, says)
        for (const node of graph.nodes) {
          const content = card.cardAt(node, plan.cards.get(node.id) as never)
          expect(content.facts, `${name} · ${says} · ${node.title}`).toEqual([])
          expect(content.attached, `${name} · ${says} · ${node.title}`).toEqual([])
          expect(content.note, `${name} · ${says} · ${node.title}`).toBeNull()
        }
      }
    }
  })

  it('is a picture at every position and not a document', () => {
    for (const { name, graph } of drawings) {
      for (const says of positions()) {
        const plan = card.planCanvas(graph, says)
        const total = graph.nodes.reduce(
          (sum, node) => sum + card.cardAt(node, plan.cards.get(node.id) as never).chars,
          0,
        )
        // MEASURED, NOT CHOSEN. The seeded corpus's largest drawing at `full` is the number this
        // bound is set from; the old ladder's closest level put 12,003 characters on one canvas.
        expect(total, `${name} · ${says} put ${String(total)} characters on the canvas`).toBeLessThan(4000)
      }
    }
  })
})
