// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A CARD ON THE CANVAS SAYS, AND HOW TALL THE BOX AROUND THEM IS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE FOUR THINGS AND NOT THE DRAWING
 * ---------------------------------------------------------------------------------------
 *
 * The runner has no DOM, so the canvas cannot be rendered here and nothing in this file claims
 * anything about how the picture LOOKS. What it holds is the four decisions that were taken out of
 * Canvas.tsx into card.ts, each of which was found to be wrong in a photograph:
 *
 *   1. A card printed every fact, so twelve module cards fitted at about a third size and no title
 *      on the drawing could be read.
 *   2. A step nobody carries said so twice on the same card, once as a fact and once as a note.
 *   3. A step under a wall printed the wall's whole two-line sentence, on six cards of one pipeline.
 *   4. The canvas box was a fixed 760px, so a drawing three times wider than it was tall left about
 *      400px of empty grey on a page this pass exists to shorten.
 *
 * NOTHING IS DELETED BY ANY OF THEM, and the test that matters most is the one at the bottom: every
 * fact a card leaves off is still in the graph object the reading layer renders. That is the whole
 * bargain — scan on the canvas, read everything one press away — and it is the one that would break
 * silently.
 *
 * The real seeded pipeline is used rather than a hand-built graph, because the facts a card chooses
 * between are the facts `model.ts` writes, and a fixture would let those two drift apart.
 */

import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { computeAttention } from '../src/shared/attention.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { parseDueStamp } from '../src/web/lib/attention.ts'
import type { GatedLink } from '../src/web/components/LinkPanel.tsx'
import type { PlacedBox } from '../src/web/components/graph/card.ts'
import type { GraphNode, StructureGraph } from '../src/web/components/graph/model.ts'

type CardModule = typeof import('../src/web/components/graph/card.ts')
type Model = typeof import('../src/web/components/graph/model.ts')

let t: TestDb
let card: CardModule
let modules: StructureGraph
let pipeline: StructureGraph

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope to restore who you are acting as, and
  // both modules under test reach it through the component library. This is the smallest stand-in
  // that lets them load; nothing in it is under test.
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
  const { buildStructureGraph, graphLinks }: Model = await import('../src/web/components/graph/model.ts')
  const records = t.api.listRecords({ workspaceId: 'default' }) as PanelRecord[]
  // Every link, read the way the page reads it. Blocks included: their links are what the pipeline
  // drawing's lines are made of.
  const links = graphLinks(t.api.allGatedLinks('default'))
  const now = Date.parse('2026-08-09T12:00:00')
  // The REAL answer, not an empty one. What is attached to a card is what the attention rule
  // selected, so a card's overflow line only exists on data the rule has actually looked at.
  const attention = computeAttention({
    now,
    records: t.api.listRecords({ workspaceId: 'default', includeDeleted: true }),
    links: t.client.sqlite
      .prepare('select id, from_id as fromId, to_id as toId, type, inferred, created_at as createdAt, created_by as createdBy from links')
      .all() as never,
    changes: t.api
      .listChanges({ workspaceId: 'default', limit: 20000 })
      .map((row) => ({ ...row, op: row.op as never, actorType: row.actorType as never, origin: null })),
    resources: [],
    dueMs: parseDueStamp,
  })
  modules = buildStructureGraph({ records, links, attention, scope: { at: 'modules' }, now })
  // The richest pipeline on the seed: it branches, it rejoins, it carries hard and partial gates,
  // and three of its steps are carried by nobody. It is the one tools/review.mjs photographs.
  const chosen = records.find((r) => r.kind === 'pipeline' && r.title === 'Reel to searchable page')
  if (chosen === undefined) throw new Error('the seed no longer holds "Reel to searchable page"')
  pipeline = buildStructureGraph({
    records,
    links,
    attention,
    scope: { at: 'pipeline', recordId: chosen.id },
    now,
  })
})

afterAll(() => {
  t.close()
})

const labelsOf = (node: GraphNode): string[] => card.factsOnCard(node).map((fact) => fact.label)
const stepsOf = (graph: StructureGraph): GraphNode[] => graph.nodes.filter((node) => node.kind === 'step')

describe('which facts a card prints', () => {
  it('keeps the paragraph off a scanned card and gives it back on an opened one', () => {
    const cards = modules.nodes.filter((node) => node.kind === 'module')
    expect(cards.length).toBeGreaterThan(5)
    for (const node of cards) {
      // The module's own words are the longest thing it holds and they are the reason the drawing
      // was illegible at a third size. A scanned card prints no fact line at all — its counts are
      // badges, which are one row of pills rather than two rows of label and value.
      // EVERY RUNG THE CANVAS USES, not two of them. A written fact is R7 and above, which is the
      // inspect experience, and a canvas that printed one at any distance is the defect the ladder
      // exists to remove.
      for (const rung of card.CANVAS_RUNGS) expect(card.factsOnCard(node, rung)).toEqual([])
      // Opened, it is all there.
      expect(labelsOf(node)).toContain('why it exists')
      expect(labelsOf(node)).toContain('checklist')
    }
    // And a scanned card is not an empty box: every module still says how much of it is done.
    expect(cards.every((node) => node.badges.some((badge) => badge.key === 'checklist'))).toBe(true)
  })

  it('never prints what the lines already draw, at any level', () => {
    // `waits on` IS the edges: every one of them is a line between two cards with its gate on it.
    // A card repeating it turns a picture into a list with boxes round it.
    for (const step of stepsOf(pipeline)) {
      for (const rung of card.RUNG_NAMES) {
        expect(card.factsOnCard(step, rung).map((fact) => fact.label)).not.toContain('waits on')
      }
    }
    expect(card.DRAWN_AS_LINES.step).toEqual(['waits on'])
    const needs = pipeline.edges.filter((edge) => edge.relation === 'needs')
    expect(needs.length).toBeGreaterThan(8)
    // `measured` is the opposite case and is NOT left off an opened card. A measured error in
    // millimetres against a predicted one is the content, and an opened card is where it is read
    // carefully rather than glanced at.
    const withNumber = stepsOf(pipeline).find((step) => step.facts.some((fact) => fact.label === 'measured'))
    if (withNumber !== undefined) expect(labelsOf(withNumber)).toContain('measured')
  })

  it('says a step nobody carries owns nothing ONCE, not twice', () => {
    const unowned = stepsOf(pipeline).filter((step) => step.note !== null)
    expect(unowned.length).toBeGreaterThanOrEqual(2)
    for (const step of unowned) {
      // 7FEOshq3mBGG gives this ordinary empty slot one short mark.
      expect(labelsOf(step)).not.toContain('carried by')
      expect(step.note).toBe('—')
    }
    // A step that IS carried keeps the fact, so this is a rule about the duplicate and not about
    // dropping the answer.
    const owned = stepsOf(pipeline).filter((step) => step.note === null)
    expect(owned.length).toBeGreaterThan(0)
    expect(owned.every((step) => labelsOf(step).includes('carried by'))).toBe(true)
  })

  it('has three words for the three sides of a wall, and keeps the third honest', () => {
    // `unplaced` is the answer that matters: a step on a parallel branch neither leads to the step
    // the wall stands at nor follows from it, and "not walled" would be a verdict nothing recorded.
    expect(card.WALL_WORDS.unplaced).toContain('nothing says')
    expect(new Set(Object.values(card.WALL_WORDS)).size).toBe(3)
    const walled = stepsOf(pipeline).filter((step) => step.wall !== null)
    expect(walled.length).toBeGreaterThan(0)
    for (const step of walled) {
      const words = card.WALL_WORDS[step.wall?.at ?? 'unplaced']
      expect(words.length).toBeGreaterThan(0)
      // The card's words are short and the graph's sentence is not. Both exist; one is scanned and
      // one is read.
      expect(words.length).toBeLessThan(40)
      expect((step.wall?.sentence ?? '').length).toBeGreaterThan(words.length)
    }
  })
})

describe('the nine rungs', () => {
  const moduleCard = (): GraphNode => {
    const found = modules.nodes.find((node) => node.badges.length > 3 && node.attached.length > 0)
    if (found === undefined) throw new Error('the seed no longer holds a module with badges and attachments')
    return found
  }

  it('draws a whole name and nothing else at R2, and counts what it left off', () => {
    const node = moduleCard()
    const far = card.cardAt(node, 'R2')
    // THE WHOLE STORED NAME, byte for byte. Nothing is abbreviated and no character is invented —
    // and nothing is cut either, because `clipTo` and the wedge that marked its cuts are deleted.
    // A distant card draws all of a stored name or it draws none of it.
    expect(far.name?.text).toBe(node.title)
    expect(far.name?.full).toBe(node.title)
    expect(far.chip).toBeNull()
    expect(far.badges).toEqual([])
    expect(far.facts).toEqual([])
    expect(far.attached).toEqual([])
    // NOTHING VANISHES WITHOUT BEING COUNTED. Everything the rung left off is in `withheld`, with
    // a place to read it.
    const counted = new Map(far.withheld.map((entry) => [entry.what, entry.count]))
    // EVERY COUNT IS EITHER DRAWN OR COUNTED AS WITHHELD, exactly once. A badge can reach a card as
    // words or as a mark, and one that reaches it by neither is one thing withheld rather than two.
    const couldBeDrawn = new Set(
      node.badges.filter((badge) => badge.standsInForLines || badge.count !== null).map((badge) => badge.key),
    )
    expect((counted.get('counts') ?? 0) + far.marks.length + far.badges.length).toBe(couldBeDrawn.size)
    expect(counted.get('written facts')).toBe(node.facts.length)
    expect(counted.get('attached records')).toBe(node.attached.length)
    expect(far.withheld.every((entry) => entry.where.length > 20)).toBe(true)
  })

  it('adds the state as a word at R4, and every count is a mark rather than a sentence', () => {
    // A NODE THAT HAS A STATE. A module records none, and the card says nothing rather than drawing
    // its kind in the chip — a word repeating the outline the reader can already see.
    const node = stepsOf(pipeline).find((one) => one.state !== null)
    if (node === undefined) throw new Error('the seed no longer holds a step with a stored state')
    const normal = card.cardAt(node, 'R4')
    expect(normal.chip).not.toBeNull()
    expect(normal.chip?.word).toBe(node.stateWord ?? node.state)
    // A record with no state word draws no chip at all, at any rung.
    expect(card.cardAt(moduleCard(), 'R8').chip).toBeNull()
    // NO COUNT EARNS WORDS HERE. `2 problems attached` is nineteen characters; the same fact is a
    // numeral beside the problem shape, and the sentence it came from is on the mark itself.
    expect(normal.badges).toEqual([])
    expect(normal.marks.length).toBeGreaterThan(0)
    for (const mark of normal.marks) {
      expect(mark.text.length).toBeLessThanOrEqual(5)
      expect(node.badges.map((badge) => badge.key)).toContain(mark.key)
      // The sentence behind the mark is the badge's own, reachable and never on the canvas.
      expect(mark.full.length).toBeGreaterThan(20)
    }
    // No attached record is printed in full: a list is not a picture, at any distance.
    expect(normal.attached).toEqual([])
    expect(normal.facts).toEqual([])
    // AND NO PROSE. The rung's character budget is deleted — a long name used to eat the state chip
    // and every mark on the card — so what keeps this a picture is which PARTS a rung draws, not how
    // many characters they came to. R4 draws no record's own line.
    expect(normal.body).toBeNull()
  })

  it('opens one card onto the whole of itself, and then withholds nothing', () => {
    const node = moduleCard()
    const open = card.cardAt(node, 'R8')
    expect(open.facts.map((fact) => fact.label)).toContain('why it exists')
    expect(open.facts).toEqual(node.facts)
    expect(open.attached).toEqual(node.attached)
    expect(open.more).toBeNull()
    expect(open.withheld).toEqual([])
  })

  it('stands a badge down where the level prints the thing it summarises', () => {
    const node = moduleCard()
    expect(node.badges.some((badge) => badge.summarises === 'attached')).toBe(true)
    expect(node.badges.some((badge) => badge.summarises === 'facts')).toBe(true)
    const open = card.cardAt(node, 'R8')
    // ONE FACT, ONE PLACE, on the rung that prints everything. `2 problems attached` above the two
    // problems is the one-fact-twice defect a photograph already found on this drawing.
    expect(open.facts.length).toBeGreaterThan(0)
    expect(open.attached).toEqual(node.attached)
    // And printing everything is not withholding: the card says so by leaving `withheld` empty.
    expect(open.withheld).toEqual([])
  })

  it('draws the wall as a mark on the canvas and keeps its words for the inspect rungs', () => {
    const walled = stepsOf(pipeline).find((step) => step.wall !== null)
    expect(walled).toBeDefined()
    const at = walled?.wall?.at ?? 'unplaced'
    // ON THE CANVAS THE SIDE OF THE WALL IS A MARK AND A POSITION, at every rung the canvas uses.
    // It was three words on the card — on six step cards of one pipeline — and the whole sentence
    // names the records whose gates put the step there and runs to two lines.
    for (const rung of card.CANVAS_RUNGS) {
      const drawn = card.cardAt(walled as GraphNode, rung)
      expect(drawn.wall?.at, `the side is still said at ${rung}`).toBe(at)
      expect(drawn.wall?.words, `no wall words at ${rung}`).toBeNull()
    }
    // The words come back where there is room to read them, and the whole sentence at the record.
    expect(card.cardAt(walled as GraphNode, 'R7').wall?.words).toBe(card.WALL_WORDS[at])
    expect(card.cardAt(walled as GraphNode, 'R8').wall?.words).toBe(walled?.wall?.sentence)
  })

  it('says a step nobody carries owns nothing ONCE at every level, never twice on one card', () => {
    const unowned = stepsOf(pipeline).filter((step) => step.note !== null)
    expect(unowned.length).toBeGreaterThanOrEqual(2)
    for (const step of unowned) {
      // SCANNED: three words, in a badge, and the paragraph saying the same thing is off. A card
      // carrying both was photographed on this drawing — "nobody carries this" as a pill with "No
      // module carries this step — nobody owns it yet…" underneath it.
      // ON THE CANVAS: the mark alone. `nobody carries this` was a badge on 38 of 38 cards and the
      // 187-character sentence under it was drawn on 27 — the single largest piece of prose
      // measured on the canvas. Neither is on any canvas rung now.
      for (const rung of card.CANVAS_RUNGS) {
        const scanned = card.cardAt(step, rung)
        expect(scanned.note, `no note at ${rung}`).toBeNull()
        expect(scanned.facts, `no fact lines at ${rung}`).toEqual([])
        expect(scanned.badges.some((badge) => badge.short === 'nobody carries this'), `no sentence at ${rung}`).toBe(
          false,
        )
      }
      // The fact is not lost: the node still carries it, and the mark on the card is drawn from it.
      expect(step.carriedBy).toEqual([])

      // Opened, the note holds the short mark; the badge and fact stand down.
      const open = card.cardAt(step, 'R8')
      expect(open.note).toBe('—')
      expect(open.badges.some((badge) => badge.key === 'carried-by')).toBe(false)
      expect(open.facts.map((fact) => fact.label)).not.toContain('carried by')
    }
  })

  // -------------------------------------------------------------------- the count the lines do not draw
  //
  // A PHOTOGRAPH FOUND THIS, after blocks became records. The `carries` lines are held back until a
  // card is pressed, so the count on the card is the only place the drawing states them. Three of the
  // four module cards on the seeded pipeline drawing were ranked past it by louder badges — one of
  // which, "2 blocks attached", only exists because a block is a record now — and pressing one of
  // those cards then revealed seven lines the picture had never mentioned. A fold this product allows
  // is one that is counted where the reader is looking.

  // How many badges the level a drawing opens at has room for. Read from the table rather than
  // typed, and narrowed here once because the table also allows `all` on the opened level.
  const roomForBadges = (): number => card.CARD_RUNGS.R5.standsIn

  it('never ranks off the count standing in for lines the drawing is not drawing', () => {
    const carrying = pipeline.nodes.filter((node) => node.kind === 'module' || node.kind === 'step')
    expect(carrying.length).toBeGreaterThan(2)
    // The seed has to hold at least one card that is crowded, or this test proves nothing at all.
    const crowded = carrying.filter((node) => node.badges.length > roomForBadges())
    expect(crowded.length, 'the seed no longer holds a crowded card on the pipeline drawing').toBeGreaterThan(0)
    for (const node of carrying) {
      const scanned = card.cardAt(node, 'R5')
      const stands = node.badges.filter((badge) => badge.standsInForLines)
      expect(stands.length, `${node.title} states what it carries`).toBe(1)
      // THE COUNT STANDING IN FOR LINES THE DRAWING HOLDS BACK IS NEVER RANKED OFF THE CARD. It
      // reaches it as words where it counts something — R5 is the one rung where a count earns
      // words, and it is the only badge that earns them — and as a mark where the count is zero,
      // because an absence is a shape rather than a sentence repeated on every card.
      const reached = [...scanned.badges.map((badge) => badge.key), ...scanned.marks.map((mark) => mark.key)]
      expect(reached, `${node.title} keeps “${stands[0]?.short}” on the card`).toContain(stands[0]?.key)
      if ((stands[0]?.count ?? 0) > 0) expect(scanned.badges.map((badge) => badge.key)).toEqual([stands[0]?.key])
      else expect(scanned.badges).toEqual([])
    }
  })

  it('keeps the cap at three, and counts what the reserved place displaced', () => {
    const crowded = pipeline.nodes
      .filter((node) => node.kind === 'module')
      .find((node) => node.badges.filter((badge) => !badge.standsInForLines).length > 2)
    expect(crowded, 'the seed no longer holds a module card with more badges than fit').toBeDefined()
    const scanned = card.cardAt(crowded as GraphNode, 'R5')
    // RESERVING A PLACE IS NOT MAKING ROOM. A card that draws more marks is a taller card, and every
    // card being taller is how the drawing shrinks until nothing can be read. The ration is a count
    // of marks now and never a count of characters.
    expect(scanned.badges.length).toBeLessThanOrEqual(roomForBadges())
    expect(scanned.marks.length).toBeLessThanOrEqual(card.CARD_RUNGS.R5.markCount)
    // And every count is either drawn or counted, with somewhere to read it, rather than vanishing.
    const counted = scanned.withheld.find((entry) => entry.what === 'counts')
    const couldBeDrawn = new Set(
      (crowded as GraphNode).badges
        .filter((badge) => badge.standsInForLines || badge.count !== null)
        .map((badge) => badge.key),
    )
    expect((counted?.count ?? 0) + scanned.marks.length + scanned.badges.length).toBe(couldBeDrawn.size)
    if (counted !== undefined) expect(counted.where.length).toBeGreaterThan(20)
  })

  it('lets a stored role move a card one rung, and never as far as the pressed one', () => {
    expect(card.rungWithRole('R3', 'compact')).toBe('R2')
    expect(card.rungWithRole('R2', 'prominent')).toBe('R3')
    expect(card.rungWithRole('R3', 'normal')).toBe('R3')
    // `prominent` must not put the record's own line on the canvas by default, which is the failure
    // the ladder exists to remove: R6 is the object the reader pressed and nothing else reaches it.
    expect(card.rungWithRole('R5', 'prominent')).toBe('R5')
    expect(card.rungWithRole('R6', 'prominent')).toBe('R6')
    // And the shape rung has nowhere lower to go.
    expect(card.rungWithRole('R0', 'compact')).toBe('R0')
  })

  it('draws a compact node lower than its neighbours, and says which level it ended at', () => {
    const node = moduleCard()
    const compact: GraphNode = { ...node, presentation: { ...node.presentation, role: 'compact' } }
    const drawn = card.cardAt(compact, 'R4')
    expect(drawn.asked).toBe('R4')
    expect(drawn.rung).toBe('R3')
    expect(drawn.chip).toBeNull()
    // The neighbour it is not competing with is unchanged.
    expect(card.cardAt(node, 'R4').rung).toBe('R4')
  })

  it('adds up what a whole drawing is not showing, in one place rather than per card', () => {
    // THE SHORTEST OF THE THREE POSITIONS THE BAR OFFERS. There is no `far` distance any more:
    // canvas zoom decides no card's words, so what a drawing says is a rung a person chose.
    const far = card.withheldAcrossCanvas(modules, card.planCanvas(modules, 'label'))
    const facts = modules.nodes.reduce((sum, node) => sum + card.factsOnCard(node, 'R8').length, 0)
    expect(far.find((entry) => entry.what === 'written facts')?.count).toBe(facts)
    // THE OBJECTS DRAWN AS A SHAPE ARE COUNTED TOO, which is the biggest thing a distant level
    // withholds. A drawing that dropped an object's words and did not say so is a silent fold.
    const shapes = far.find((entry) => entry.what === 'objects drawn as a shape, with no words')
    const plan = card.planCanvas(modules, 'label')
    if (plan.shapes > 0) expect(shapes?.count).toBe(plan.shapes)
    // Loudest first, so the sentence starts with the biggest number.
    expect(far.map((entry) => entry.count)).toEqual([...far.map((entry) => entry.count)].sort((a, b) => b - a))
  })

  it('does not promise a fact that opening the card will not give back', () => {
    // A step's `waits on` is drawn as lines and is on no card at any level. Counting it as withheld
    // would tell a reader that opening the card prints it, and opening the card does not. The step
    // must also hold a written fact, or the scanned card has nothing to count and names no entry.
    const step = stepsOf(pipeline).find(
      (node) => node.facts.some((fact) => fact.label === 'waits on') && card.factsOnCard(node, 'R8').length > 0,
    )
    expect(step).toBeDefined()
    // R8 IS THE WHOLE RECORD AND WITHHOLDS NOTHING IT COULD DRAW. The one thing it may still report
    // is that nobody wrote the record's own line, which is an answer rather than a fold.
    expect(
      card.cardAt(step as GraphNode, 'R8').withheld.filter((one) => one.what !== 'records with no summary written'),
    ).toEqual([])
    const scanned = card.cardAt(step as GraphNode, 'R4')
    const said = scanned.withheld.find((entry) => entry.what === 'written facts')
    expect(said?.count).toBe(card.factsOnCard(step as GraphNode, 'R8').length)
  })

  it('never shows at one level something the node does not hold', () => {
    for (const graph of [modules, pipeline]) {
      for (const node of graph.nodes) {
        for (const rung of card.RUNG_NAMES) {
          const content = card.cardAt(node, rung)
          for (const badge of content.badges) expect(node.badges).toContain(badge)
          for (const fact of content.facts) expect(node.facts).toContain(fact)
          for (const item of content.attached) expect(node.attached).toContain(item)
          // AND NOT ONE PART MORE THAN THE RUNG ALLOWS. A rung rations counts of things — how many
          // marks, how many counts in words — and a rung that drew more would be the ladder claiming
          // a shape it does not have.
          expect(content.marks.length, `${node.title} at ${rung}`).toBeLessThanOrEqual(card.CARD_RUNGS[rung].markCount)
          expect(content.badges.length, `${node.title} at ${rung}`).toBeLessThanOrEqual(card.CARD_RUNGS[rung].standsIn)
          // Every drawn name is the whole stored one. Nothing is abbreviated, cut or generated.
          if (content.name !== null) expect(content.name.text).toBe(content.name.full)
        }
      }
    }
  })
})

describe('cutting one written fact', () => {
  it('leaves a short fact exactly as it was written', () => {
    const cut = card.shorten('4 of 8 done, 2 stopped short')
    expect(cut.text).toBe('4 of 8 done, 2 stopped short')
    expect(cut.shortened).toBe(false)
  })

  it('cuts a long English fact at the end of its first sentence', () => {
    const value = `A ZED 2i on the chest mast, angled down the bench. ${'x'.repeat(200)}`
    const cut = card.shorten(value)
    expect(cut.shortened).toBe(true)
    expect(cut.text).toBe('A ZED 2i on the chest mast, angled down the bench.')
  })

  it('cuts a Chinese fact at 。 and never at an ASCII full stop it does not have', () => {
    // A Chinese sentence ends in 。 and never in "."; cutting only on "." would print the paragraph.
    const value = `夹爪的重印需要三天，因为打印机还在排队，而且要等壁厚测完。${'重'.repeat(200)}`
    const cut = card.shorten(value)
    expect(cut.shortened).toBe(true)
    expect(cut.text.endsWith('。')).toBe(true)
    expect(cut.text.length).toBeLessThan(card.FACT_CHARS)
  })

  it('ends with an ellipsis when there is no sentence end to cut at', () => {
    // A script with no spaces and no punctuation is the case a character count has to survive.
    const cut = card.shorten('重'.repeat(300))
    expect(cut.shortened).toBe(true)
    expect(cut.text.endsWith('…')).toBe(true)
  })

  it('names what a card had no room for by kind, rather than counting it alone', () => {
    expect(card.byKind([{ kind: 'task' }, { kind: 'task' }, { kind: 'pipeline' }])).toBe('2 tasks, 1 pipeline')
    expect(card.byKind([{ kind: 'obligation' }])).toBe('1 obligation')
    expect(card.byKind([])).toBe('')
  })
})

describe('how tall the canvas box is', () => {
  const place = (boxes: Record<string, PlacedBox>): Map<string, PlacedBox> => new Map(Object.entries(boxes))
  const graphOf = (ids: { id: string; parentId: string | null }[]): StructureGraph =>
    ({ nodes: ids.map((entry) => ({ ...entry }) as unknown as GraphNode) }) as StructureGraph

  it('gives a wide drawing a short box and a tall one a tall box', () => {
    const wide = graphOf([{ id: 'a', parentId: null }])
    const short = card.heightFor(wide, place({ a: { x: 0, y: 0, width: 3000, height: 900 } }), 1200)
    const tall = card.heightFor(wide, place({ a: { x: 0, y: 0, width: 900, height: 3000 } }), 1200)
    expect(short).not.toBeNull()
    expect(tall).not.toBeNull()
    expect(short as number).toBeLessThan(tall as number)
    // Three times wider than tall, fitted to 1200px, is about a third of that in height.
    expect(short as number).toBeGreaterThan(300)
    expect(short as number).toBeLessThan(450)
  })

  it('never goes below the floor or above the ceiling', () => {
    const one = graphOf([{ id: 'a', parentId: null }])
    expect(card.heightFor(one, place({ a: { x: 0, y: 0, width: 4000, height: 20 } }), 1200)).toBe(card.BOX_MIN)
    expect(card.heightFor(one, place({ a: { x: 0, y: 0, width: 200, height: 9000 } }), 1200)).toBe(card.BOX_MAX)
  })

  it('does not count a child twice by adding it to the canvas origin', () => {
    // A step's position is relative to the pipeline box it sits in. Measuring children as well
    // asked for a box about twice as tall as the drawing, and the drawing then floated in it.
    const graph = graphOf([
      { id: 'pipe', parentId: null },
      { id: 'step', parentId: 'pipe' },
    ])
    const withChild = card.heightFor(
      graph,
      place({
        pipe: { x: 0, y: 0, width: 2000, height: 800 },
        step: { x: 40, y: 700, width: 236, height: 400 },
      }),
      1200,
    )
    const withoutChild = card.heightFor(graph, place({ pipe: { x: 0, y: 0, width: 2000, height: 800 } }), 1200)
    expect(withChild).toBe(withoutChild)
  })

  it('answers null rather than guessing when there is nothing to measure', () => {
    const one = graphOf([{ id: 'a', parentId: null }])
    // A width the browser has not settled yet. A box that sized itself from zero would collapse to
    // the floor and stay there, which is worse than leaving the stylesheet's own height alone.
    expect(card.heightFor(one, place({ a: { x: 0, y: 0, width: 900, height: 400 } }), 0)).toBeNull()
    expect(card.heightFor(one, place({}), 1200)).toBeNull()
    expect(card.heightFor(graphOf([]), place({}), 1200)).toBeNull()
  })

  it('is a pure function of its arguments, so two draws of one graph agree', () => {
    const graph = graphOf([{ id: 'a', parentId: null }])
    const boxes = place({ a: { x: 0, y: 0, width: 2200, height: 780 } })
    expect(card.heightFor(graph, boxes, 1180)).toBe(card.heightFor(graph, boxes, 1180))
  })
})

describe('nothing a card leaves off is lost', () => {
  it('keeps every fact a card does not print in the graph the reading layer renders', () => {
    // THE BARGAIN, CHECKED. Folding is allowed in this product only because everything folded is one
    // press away. `Outline.tsx` renders `node.facts` whole, so this asserts on the object both
    // compositions share: for every card, what is printed is a SUBSET and the rest is still there.
    for (const graph of [modules, pipeline]) {
      for (const node of graph.nodes) {
        const printed = card.factsOnCard(node)
        const all = node.facts
        expect(printed.length).toBeLessThanOrEqual(all.length)
        for (const fact of printed) expect(all).toContain(fact)
      }
    }
    // And the paragraph the module cards stopped printing is one of the facts still in there.
    const module = modules.nodes.find((node) => node.kind === 'module')
    expect(module?.facts.some((fact) => fact.label === 'why it exists')).toBe(true)
  })

  /**
   * THE CONTRACT THE CANVAS NOW RENDERS, pinned over every card of both real drawings.
   *
   * WHY THIS TEST EXISTS. `Canvas.tsx` used to decide all of this a second time, in its own words,
   * and the two answers had drifted: it printed two attached records and a "4 more attached to this
   * card" sentence per module, it printed a step's note beside the badge that already said the same
   * thing, and it treated a stored `prominent` as `expanded` — which the rule above refuses by name.
   * Every one of those was visible in a photograph and none of them failed a test, because the suite
   * tested this file and the screen drew the other one. `Canvas.tsx` now calls `cardAt`, so what is
   * asserted here is what is drawn.
   *
   * The runner has no DOM, so this still cannot see the picture. What it can do is hold the answer
   * the picture is made from, over the real seed rather than a fixture.
   */
  it('gives every card at the distance a drawing opens at a name, a state and marks — and nothing longer', () => {
    for (const graph of [modules, pipeline]) {
      for (const node of graph.nodes) {
        const scanned = card.cardAt(node, 'R4')
        // A name, and the state as a word. Both, on every card, in either script.
        expect(scanned.title).not.toBe('')
        expect(scanned.title).not.toBeNull()
        if (node.state !== null) expect(scanned.chip).not.toBeNull()
        // No lists, no paragraphs, no sentences at all. Counts are marks, and the wall is a mark.
        expect(scanned.attached).toEqual([])
        expect(scanned.facts).toEqual([])
        expect(scanned.note).toBeNull()
        expect(scanned.badges).toEqual([])
        expect(scanned.wall?.words ?? null).toBeNull()
        expect(scanned.marks.length).toBeLessThanOrEqual(card.CARD_RUNGS.R4.markCount)
      }
    }
  })

  it('says what it left off every card, counted, rather than leaving it off quietly', () => {
    for (const graph of [modules, pipeline]) {
      for (const node of graph.nodes) {
        const scanned = card.cardAt(node, 'R4')
        const opened = card.cardAt(node, 'R8')
        // Everything the opened card has and this one does not is accounted for in `withheld`,
        // which is what the sentence under the canvas adds up. A card that showed less without
        // saying so is the silent fallback this product bans, drawn instead of typed.
        const missingAttached = opened.attached.length - scanned.attached.length
        if (missingAttached > 0) {
          expect(scanned.withheld.find((w) => w.what === 'attached records')?.count).toBe(missingAttached)
        }
        const missingFacts = opened.facts.length - scanned.facts.length
        if (missingFacts > 0) {
          expect(scanned.withheld.find((w) => w.what === 'written facts')?.count).toBe(missingFacts)
        }
        // And every entry says where the whole of it can be read. Never "elsewhere".
        for (const entry of scanned.withheld) expect(entry.where.length).toBeGreaterThan(10)
      }
    }
  })

  it('counts and names the attachments a card had no room for', () => {
    // A card shows the highest-ranked few and then says how many it did not show, by kind. The seed
    // has at least one module with more than that, which is what makes the rule visible on screen.
    const crowded = modules.nodes.filter((node) => node.attached.length > card.ATTACHED_ON_A_CARD)
    expect(crowded.length).toBeGreaterThan(0)
    for (const node of crowded) {
      const rest = node.attached.slice(card.ATTACHED_ON_A_CARD)
      // Never a bare "more": the line the card draws is this sentence, and it names every kind.
      expect(card.byKind(rest)).not.toBe('')
      expect(card.byKind(rest)).toMatch(/\d/)
    }
  })
})
