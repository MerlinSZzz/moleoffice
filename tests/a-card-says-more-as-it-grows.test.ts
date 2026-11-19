// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE CARD SAYS MORE AS IT IS FOCUSED AND ENLARGED, AND NEVER MORE THAN THE RECORD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, AND WHAT IS PROVED IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The rule for what a node says as it grows is a decision about words, so it is checked
 * here, in the runner, over every size and every shape of record. Whether the controls that move it
 * are on a screen a person can press is a fact about a window, and it is checked in
 * `tests/a-node-says-more-in-the-browser.test.ts`.
 *
 * The rule, section 15 of design/messages/ACCEPTANCE.md:
 *
 *   A card's title goes from level 1 to level 2; the next step adds a level-3 line under the title.
 *   Higher levels need the detail tick: with it on, growing a card brings level 4 where it brought
 *   level 3, and growing it further moves through levels 4 to 6. The title rule is unchanged. The
 *   detail tick is a packaged, automatic semantic-zoom strategy, and choosing a level by hand stays.
 *
 * and, on a level nobody wrote: the automatic zoom skips a level that is not there, and moves only
 * among the levels that are; a level chosen by hand that does not exist is shown as not existing.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN EACH SECTION RED
 * ---------------------------------------------------------------------------------------
 *
 *   make `whatACardSays` ignore `choice.detail` → section 2 goes red: growing a ticked card stays
 *     at level 3 instead of moving through 4, 5 and 6.
 *   make its by-hand arm fall through to the size ladder → section 3 goes red: a level chosen by
 *     hand stops winning.
 *   make the by-hand arm answer with the nearest lower level that IS written → section 4 goes red:
 *     a level nobody wrote is drawn as a lower one instead of being said.
 *   drop the `has.includes` filter → section 5 goes red: the automatic ladder stops skipping.
 *   make `sizeWithFocus` answer its argument → section 6 goes red: focus stops moving what a card
 *     says, which is the state the owner met.
 *   let `rungsFor` keep the levels above a record's own length → section 7 goes red: a two-line
 *     record grows a level 4.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { computeAttention } from '../src/shared/attention.ts'
import { parseDueStamp } from '../src/web/lib/attention.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { Rung } from '../src/shared/detail.ts'
import type { StoredPart } from '../src/shared/zoom.ts'
import type { GraphNode, StructureGraph } from '../src/web/components/graph/model.ts'

type CardModule = typeof import('../src/web/components/graph/card.ts')
type Model = typeof import('../src/web/components/graph/model.ts')

let t: TestDb
let card: CardModule
let model: Model

/** Two parts, written, so a record can have levels 4, 5 and 6 to reach. */
const PARTS: StoredPart[] = [
  {
    id: 'p-one',
    heading: 'Gannet the printed mount fails below the trial load',
    text30: 'Bittern three of four printed mounts broke between fourteen and sixteen newtons, under the twenty the trials need.',
    text120:
      'Caribou four printed mounts were pulled on the bench jig and three broke at the thin section behind the bolt circle, below the twenty newtons the handover trials need.',
    covers: ['b-1'],
  },
  {
    id: 'p-two',
    heading: 'Kestrel the aluminium mount is still on order',
    text30: 'Aardvark an aluminium mount of the same geometry has been ordered and nothing else is waiting on it.',
    text120:
      'Tapir an aluminium mount of the same geometry has been ordered and is expected next week, and nothing else on the handover work is waiting on it.',
    covers: ['b-2'],
  },
]

/**
 * THE RECORD'S OWN BLOCKS, which the parts above cover one each.
 *
 * THEY ARE LONG ON PURPOSE. `rungsFor` stops a record's ladder at the first length the whole record
 * fits in — the owner's rule that no level says more than the record — and one part's long text is
 * 120 words. A record shorter than that has no level 6 to reach, which is what the two-line module
 * below is for; this one has to be longer than the ladder so that every level exists on it.
 */
const SUMMARY_BLOCKS = [
  {
    id: 'b-1',
    type: 'finding',
    text:
      'Ostrich four printed wrist mounts were pulled to failure on the bench jig this week, and three of ' +
      'them broke at the thin section behind the bolt circle, at fourteen point two, fifteen point one and ' +
      'fifteen point four newtons, which is below the twenty the transplant trials need, so the printed part ' +
      'cannot be used for them at all. The fourth held to twenty-two newtons and had been printed at half ' +
      'the layer height, which was a mistake in the print queue rather than a decision anybody made, and ' +
      'nobody has repeated it since. One sample is not a finding and the rig is not the question here.',
  },
  {
    id: 'b-2',
    type: 'finding',
    text:
      'Marmot nobody has pulled the aluminium mount yet, because the shop has not cut one: the order went ' +
      'in on Tuesday and the same geometry is expected next week, so the bench is free until then and the ' +
      'jig can stay set up as it is. Nothing else on the handover work is waiting on this, and the trials ' +
      'themselves are held by the gripper calibration rather than by the mount, which is written down on ' +
      'the pipeline and not here. The next run pulls four aluminium mounts and one printed one for comparison.',
  },
]

const LONG_SUMMARY =
  'Quokka three of four printed wrist mounts broke below the load the handover trials need, so only the ' +
  'aluminium one is worth another run this week, and the printed part is out of the running for the ' +
  'transplant work until somebody prints it again at half the layer height and pulls it properly.'

/** The module every ladder question below is asked of: a summary, blocks, and written parts. */
let rich: GraphNode
/** A module whose own words are two lines: the record the ladder has to stop at. */
let short: GraphNode
/** A two-line module somebody wrote a by-part summary of: written, and longer than the record. */
let overClaimed: GraphNode

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
  card = await import('../src/web/components/graph/card.ts')
  model = await import('../src/web/components/graph/model.ts')

  const made = t.api.createRecord({
    workspaceId: 'default',
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: LONG_SUMMARY,
    data: {
      state: 'active',
      parts: [],
      summaryBlocks: SUMMARY_BLOCKS,
    },
    actor: t.api.HUMAN,
  }) as PanelRecord
  // THE PARTS ARE WRITTEN AFTER THE RECORD EXISTS, because the write door refuses a by-part summary
  // on a record with no revision to have been written from — a rule of its own, with its own tests.
  // This file is about what a card draws, so the stored shape is written straight in rather than
  // walked through the door a second time.
  writeDataBypassingTheGate(t, made.id, {
    state: 'active',
    parts: [],
    summaryBlocks: SUMMARY_BLOCKS,
    shortForms: {
      // LEVEL 1 IS WRITTEN ON THIS ONE, so the ladder this file walks has every position on it and
      // the name line has two texts to move between. No record in the corpus has a written label,
      // which is why the first step, from level 1 to level 2, was never
      // seen to fail. `short` below has none, and it is the record the missing level is asked of.
      label: { text: 'Wrist mount rig', madeFrom: { seq: 1, contentHash: 'aaaa' }, writtenBy: 'agent' },
      parts: { madeFrom: { seq: 1, contentHash: 'aaaa' }, writtenBy: 'agent', parts: PARTS },
    },
  })
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'module',
    title: 'Bench jig',
    summary: 'Holds the mount while it is pulled.',
    data: { state: 'active', parts: [] },
    actor: t.api.HUMAN,
  })
  // A RECORD WHOSE PARTS ARE WRITTEN AND WHOSE OWN WORDS ARE SHORTER THAN THEY ARE. Somebody wrote
  // a by-part summary of a two-line module; the levels it claims would say more than the record
  // does, so the record has not got them. This is the case only `rungsFor` can answer.
  const overwritten = t.api.createRecord({
    workspaceId: 'default',
    kind: 'module',
    title: 'Cable loom',
    summary: 'One line about the loom.',
    data: { state: 'active', parts: [], summaryBlocks: [{ id: 'b-1', type: 'finding', text: 'It is tied back.' }] },
    actor: t.api.HUMAN,
  }) as PanelRecord
  writeDataBypassingTheGate(t, overwritten.id, {
    state: 'active',
    parts: [],
    summaryBlocks: [{ id: 'b-1', type: 'finding', text: 'It is tied back.' }],
    shortForms: { parts: { madeFrom: { seq: 1, contentHash: 'bbbb' }, writtenBy: 'agent', parts: PARTS } },
  })

  const graph = build()
  rich = nodeCalled(graph, 'Wrist mount pull rig')
  short = nodeCalled(graph, 'Bench jig')
  overClaimed = nodeCalled(graph, 'Cable loom')
})

afterAll(() => {
  t.close()
})

function build(): StructureGraph {
  const records = t.api.listRecords({ workspaceId: 'default' }) as PanelRecord[]
  const links = model.graphLinks(t.api.allGatedLinks('default'))
  const now = Date.parse('2026-09-05T12:00:00')
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
  return model.buildStructureGraph({ records, links, attention, scope: { at: 'modules' }, now })
}

function nodeCalled(graph: StructureGraph, title: string): GraphNode {
  const found = graph.nodes.find((node) => node.title === title)
  if (found === undefined) throw new Error(`no node called ${title} on the modules drawing`)
  return found
}

/**
 * What one card is at, at one size, with the tick as given. The ladder, asked once.
 *
 * THE WIDTH THAT PUTS A CARD AT ONE OF THE FIVE SIZES CHANGED ON 6 SEPTEMBER 2026 — criterion D33.
 * The size is now read from the card's AREA rather than from its width alone, so the width that
 * reaches a word depends on the height the card has: `roomForSize` is the one place that arithmetic
 * lives, and these cases ask it rather than restating the table. At the ordinary height it is the
 * word's own share squared — 2.89 for the largest, where it used to be 1.7.
 */
const at = (size: 'smallest' | 'small' | 'usual' | 'large' | 'largest', detail: boolean, has: readonly Rung[], byHand: Rung | null = null): Rung =>
  card.whatACardSays({ room: card.roomForSize(size, 1), height: null, rise: null, width: null, size: null, detail, level: byHand }, 'gist', has).level

// ==================================================================== 1. the order of the levels, with the tick off

describe('the sizes move the title line, then add a line under it', () => {
  it('is level 1 at the smallest and level 2 one size up', () => {
    expect(at('smallest', false, rich.levels.has)).toBe('label')
    expect(at('small', false, rich.levels.has)).toBe('title')
  })

  it('adds the level-3 line at the next size, and the title line stops moving', () => {
    expect(at('usual', false, rich.levels.has)).toBe('gist')
    // THE TITLE RULE IS UNCHANGED ABOVE LEVEL 3. A card at level 3 and above draws
    // its name at level 2, which is what `CARD_RUNG_AT` gives every one of those rows.
    for (const level of ['gist', 'outline', 'sketch', 'digest'] as const) {
      expect(card.CARD_RUNGS[card.CARD_RUNG_AT[level]].nameAt, level).toBe('title')
    }
  })

  it('goes no further than level 3 while the detail tick is off, however large the card is', () => {
    expect(at('large', false, rich.levels.has)).toBe('gist')
    expect(at('largest', false, rich.levels.has)).toBe('gist')
  })
})

// ==================================================================== 2. the detail tick

describe('the detail tick is a packaged zoom policy for one card', () => {
  it('turns the step that showed level 3 into level 4', () => {
    expect(at('usual', true, rich.levels.has)).toBe('outline')
  })

  it('moves through levels 4, 5 and 6 as the card grows', () => {
    expect(at('large', true, rich.levels.has)).toBe('sketch')
    expect(at('largest', true, rich.levels.has)).toBe('digest')
  })

  it('leaves the two smallest sizes on the title line', () => {
    expect(at('smallest', true, rich.levels.has)).toBe('label')
    expect(at('small', true, rich.levels.has)).toBe('title')
  })

  it('takes the words back down the same steps when the card is shrunk', () => {
    const down = ([...card.CARD_SIZES].reverse()).map((size) => at(size, true, rich.levels.has))
    expect(down).toEqual(['digest', 'sketch', 'outline', 'title', 'label'])
  })
})

// ==================================================================== 3. a level chosen by hand

describe('a level chosen by hand wins over the sizes and is kept', () => {
  it('is what the card is at, whatever size it is', () => {
    for (const size of card.CARD_SIZES) {
      expect(at(size, false, rich.levels.has, 'digest'), size).toBe('digest')
    }
  })

  it('says the sizes are no longer deciding', () => {
    const saying = card.whatACardSays({ room: 1, height: null, rise: null, width: null, size: null, detail: false, level: 'sketch' }, 'gist', rich.levels.has)
    expect(saying.from).toBe('byHand')
    expect(card.whatACardSays({ room: 1, height: null, rise: null, width: null, size: null, detail: false, level: null }, 'gist', rich.levels.has).from).toBe(
      'size',
    )
  })
})

// ==================================================================== 4. a level nobody wrote, by hand

describe('a level chosen by hand that nobody wrote is shown as not written', () => {
  it('names the level and draws no lower one in its place', () => {
    const saying = card.whatACardSays({ room: 1, height: null, rise: null, width: null, size: null, detail: true, level: 'digest' }, 'gist', short.levels.has, short.levels.why)
    // AND WHY IT HAS NOT GOT IT. `Bench jig` is a title and one line, so the ladder stops at the
    // conclusion: the record is too short for a level 6, and nobody failing to write one is not why.
    expect(saying.missing).toEqual({ level: 'digest', why: 'tooShort' })
    // THE CARD STILL DRAWS ITS NAME. Every position of this ladder draws a name; what it does not do
    // is draw level 3 and call it level 6.
    expect(saying.level).toBe('title')
    expect(card.notWrittenHere({ level: 'digest', why: 'notWritten' })).toContain('Level 6')
  })

  it('says nothing of the kind when the sizes are deciding', () => {
    // THE TWO RULES ARE DIFFERENT RULES. The automatic zoom SKIPS what nobody wrote; only a level
    // asked for by name is answered "not written".
    for (const size of card.CARD_SIZES) {
      const saying = card.whatACardSays({ room: card.roomForSize(size, 1), height: null, rise: null, width: null, size: null, detail: true, level: null }, 'gist', short.levels.has)
      expect(saying.missing, size).toBeNull()
    }
  })
})

// ==================================================================== 5. skipping what nobody wrote

describe('the automatic zoom moves only among the levels that exist', () => {
  it('skips a level nobody wrote and lands on the next one that is written', () => {
    // A record with level 4 and level 6 written and nothing at level 5.
    const gappy: Rung[] = ['title', 'gist', 'outline', 'digest']
    expect(at('usual', true, gappy)).toBe('outline')
    expect(at('large', true, gappy)).toBe('digest')
    expect(at('largest', true, gappy)).toBe('digest')
  })

  it('draws the name and nothing under it when no body level is written at all', () => {
    expect(at('largest', false, ['title'])).toBe('title')
    expect(at('largest', true, ['title'])).toBe('title')
  })

  it('skips level 1 too, on the ordinary record nobody wrote a label for', () => {
    // THE RULE HAS NO EXCEPTION IN IT: the automatic zoom skips a level nobody wrote, and moves only
    // among the levels that are. The card used to exempt levels 1 and 2 from the filter and say
    // `Level 1` on a record whose short forms say nobody wrote one, while drawing the record's own
    // title, which is level 2.
    expect(short.levels.has).not.toContain('label')
    expect(at('smallest', false, short.levels.has)).toBe('title')
    expect(at('smallest', true, short.levels.has)).toBe('title')
    // AND IT STILL STOPS AT LEVEL 1 WHERE LEVEL 1 IS WRITTEN, which is the other half of the same
    // rule and is what `rich` now carries.
    expect(rich.levels.has).toContain('label')
    expect(at('smallest', false, rich.levels.has)).toBe('label')
  })

  it('says level 1 is not written when a reader asks for it by hand', () => {
    // THE TWO RULES ARE STILL TWO RULES. The zoom skips it; asking for it by name is answered.
    const saying = card.whatACardSays({ room: 1, height: null, rise: null, width: null, size: null, detail: false, level: 'label' }, 'gist', short.levels.has, short.levels.why)
    expect(saying.missing).toEqual({ level: 'label', why: 'notWritten' })
    expect(saying.level).toBe('title')
    expect(card.notWrittenHere({ level: 'label', why: 'notWritten' })).toContain('Level 1')
  })
})

// ============================================================ 5b. the name line moves with the rung

describe('the name line goes from the label to the record’s own name as the card grows', () => {
  it('draws the written label at level 1 and the record’s own name at level 2', () => {
    // THE TITLE GOES FROM LEVEL 1 TO LEVEL 2. That is the first step of the rule, and the first one
    // to be tried. The name was decided once for the whole drawing before this, so a card
    // with a written label drew the label at every size and the record's own name at none.
    const graph = build()
    const plan = card.planCanvas(graph, 'gist', card.NO_FOCUS, new Map([[rich.id, { room: 0.62, height: null, rise: null, width: null, size: null, detail: false, level: null }]]))
    const smallest = card.cardAt(rich, plan.cards.get(rich.id) as never)
    expect(smallest.level).toBe('label')
    expect(smallest.name?.text).toBe('Wrist mount rig')
    expect(smallest.nameFrom).toBe('shortForm')

    const bigger = card.planCanvas(graph, 'gist', card.NO_FOCUS, new Map([[rich.id, { room: 0.8, height: null, rise: null, width: null, size: null, detail: false, level: null }]]))
    const one = card.cardAt(rich, bigger.cards.get(rich.id) as never)
    expect(one.level).toBe('title')
    expect(one.name?.text).toBe('Wrist mount pull rig')
    expect(one.nameFrom).toBe('node')
  })

  it('stands the record’s own name in at level 1 where nobody wrote a label, and says which field it drew', () => {
    const graph = build()
    const plan = card.planCanvas(graph, 'gist', card.NO_FOCUS, new Map([[short.id, { room: 0.62, height: null, rise: null, width: null, size: null, detail: false, level: null }]]))
    const drawn = card.cardAt(short, plan.cards.get(short.id) as never)
    expect(drawn.name?.text).toBe('Bench jig')
    expect(drawn.nameFrom).toBe('node')
  })
})

// ============================================ 6. focus changes no size, no level and no box (D12)

/**
 * REWRITTEN ON 6 SEPTEMBER 2026, AND THE OLD CLAIM IS THE ONE THAT WAS REJECTED.
 *
 * It used to assert that focus was one size step: the pressed card one size larger, everything else
 * one size smaller. That is what was objected to — a press made the card flash larger and moved the view — and
 * criterion D12 replaces it: a press focuses a card and changes nothing about what any card says,
 * how large it is drawn, or where it sits. So the assertions are inverted rather than deleted: the
 * same three tiers are walked and every one of them must answer the same.
 */
describe('a press changes no card’s size and no card’s level', () => {
  it('gives the pressed card, its neighbour and the background the same size', () => {
    for (const tier of card.FOCUS_TIERS) {
      expect(card.sizeOf({ room: null, height: null, rise: null, width: null, size: null, detail: false, level: null }, 'gist'), tier).toBe('usual')
    }
  })

  it('says exactly the same thing on a pressed card as on an untouched one', () => {
    const chosen = { room: 1, height: null, rise: null, width: null, size: null, detail: true, level: null }
    expect(card.whatACardSays(chosen, 'gist', rich.levels.has).level).toBe('outline')
    const untouched = { room: null, height: null, rise: null, width: null, size: null, detail: true, level: null }
    expect(card.whatACardSays(untouched, 'gist', rich.levels.has).level).toBe('outline')
  })

  it('draws every tier at one rung, so a press cannot change how much furniture a card has', () => {
    const graph = build()
    const one = graph.nodes[0] as GraphNode
    const pressed = card.planCanvas(graph, 'gist', {
      selected: new Set([one.id]),
      neighbours: card.neighboursOf(graph, new Set([one.id])),
    })
    const quiet = card.planCanvas(graph, 'gist')
    for (const node of graph.nodes) {
      const before = quiet.cards.get(node.id)
      const after = pressed.cards.get(node.id)
      expect(after?.rung, node.title).toBe(before?.rung)
      expect(after?.size, node.title).toBe(before?.size)
      expect(after?.level, node.title).toBe(before?.level)
    }
  })

  it('keeps the layout key still when a card is pressed, because nothing about a box moved', () => {
    const graph = build()
    const one = graph.nodes[0] as GraphNode
    const shapes = (plan: ReturnType<typeof card.planCanvas>) =>
      graph.nodes.map((node) => ({
        plan: plan.cards.get(node.id) as never,
        presence: 0,
        restricted: false,
        room: plan.cards.get(node.id)?.room ?? null,
      }))
    const quiet = card.planCanvas(graph, 'gist')
    const pressed = card.planCanvas(graph, 'gist', {
      selected: new Set([one.id]),
      neighbours: card.neighboursOf(graph, new Set([one.id])),
    })
    expect(card.layoutKeyFor('modules', shapes(pressed))).toBe(card.layoutKeyFor('modules', shapes(quiet)))
  })

  it('assigns the background tier on a drawing where something is pressed, and never otherwise', () => {
    const graph = build()
    const one = graph.nodes[0] as GraphNode
    const quiet = card.planCanvas(graph, 'gist')
    expect([...quiet.cards.values()].map((plan) => plan.tier)).not.toContain('background')
    const pressed = card.planCanvas(graph, 'gist', {
      selected: new Set([one.id]),
      neighbours: card.neighboursOf(graph, new Set([one.id])),
    })
    expect(pressed.cards.get(one.id)?.tier).toBe('selected')
    expect([...pressed.cards.values()].map((plan) => plan.tier)).toContain('background')
  })
})

// ==================================================================== 7. never more than the record

describe('a card never says more than the record does', () => {
  it('has no level above the record’s own length on a two-line record', () => {
    // `Bench jig` holds a title and a one-line summary. `rungsFor` stops the ladder at the first
    // length the whole record fits in, so there is nothing written by part to reach.
    expect(short.levels.has).toEqual(['title', 'gist'])
    expect(short.levels.parts.outline).toBeNull()
  })

  it('draws no part on it at the largest size with the tick on', () => {
    const graph = build()
    const plan = card.planCanvas(graph, 'gist', card.NO_FOCUS, new Map([[short.id, { room: card.roomForSize('largest', 1), height: null, rise: null, width: null, size: null, detail: true, level: null }]]))
    const drawn = card.cardAt(short, plan.cards.get(short.id) as never)
    expect(drawn.parts).toEqual([])
    expect(drawn.level).toBe('title')
  })

  it('has no by-part level on a record whose own words are shorter than one, even when somebody wrote one', () => {
    // `formsWrittenIn` says the parts ARE written on this record: somebody stored them. `rungsFor`
    // is what takes them away, because a level that would say more than the record has nothing to
    // say. Both are asked, and this is the case where only the second one answers.
    expect(overClaimed.levels.parts.outline).not.toBeNull()
    expect(overClaimed.levels.has).toEqual(['title', 'gist'])
    const graph = build()
    const plan = card.planCanvas(
      graph,
      'gist',
      card.NO_FOCUS,
      new Map([[overClaimed.id, { room: card.roomForSize('largest', 1), height: null, rise: null, width: null, size: null, detail: true, level: null }]]),
    )
    const drawn = card.cardAt(overClaimed, plan.cards.get(overClaimed.id) as never)
    expect(drawn.level).toBe('title')
    expect(drawn.parts).toEqual([])
  })

  it('tells a level nobody wrote from a level the record is too short to have', () => {
    // THE TWO USED TO BE ONE ANSWER AND THE CARD SAID THE WRONG ONE. `has` is an intersection of
    // two lists and an intersection cannot say which of the two removed a rung, so a record whose
    // parts ARE stored and whose own words are shorter than they are was told nobody had written
    // it. A reader who believes that writes the parts, and the card still will not draw them.
    expect(overClaimed.levels.parts.outline, 'the parts are not stored, so this proves nothing').not.toBeNull()
    expect(overClaimed.levels.why.outline, 'a stored level the record is too short for reads as unwritten').toBe(
      'tooShort',
    )
    // AND THE ORDINARY CASE IS STILL THE ORDINARY CASE. `Bench jig` has room for a label and nobody
    // has written one.
    expect(short.levels.why.label).toBe('notWritten')
    // A LEVEL THE RECORD HAS IS NOT IN THE MAP AT ALL.
    expect(rich.levels.why.digest).toBeUndefined()
  })

  it('says the record is too short, and not that nobody wrote it, when a reader asks by hand', () => {
    const saying = card.whatACardSays(
      { room: 1, height: null, rise: null, width: null, size: null, detail: true, level: 'sketch' },
      'gist',
      overClaimed.levels.has,
      overClaimed.levels.why,
    )
    expect(saying.missing).toEqual({ level: 'sketch', why: 'tooShort' })
    expect(card.notWrittenHere(saying.missing as never)).toContain('too short')
    expect(card.notWrittenHere(saying.missing as never)).not.toContain('not written')
  })

  it('draws the parts on a record that has them, at the level asked for', () => {
    const graph = build()
    // 2.89 AND NOT 1.7 — criterion D33. The size is read from the area now, so the width that
    // reaches the largest word at the ordinary height is the word's own share squared.
    const chosen = new Map([[rich.id, { room: card.roomForSize('largest', 1), height: null, rise: null, width: null, size: null, detail: true, level: null }]])
    const plan = card.planCanvas(graph, 'gist', card.NO_FOCUS, chosen)
    const drawn = card.cardAt(rich, plan.cards.get(rich.id) as never)
    expect(drawn.level).toBe('digest')
    expect(drawn.parts.map((part) => part.id)).toEqual(['p-one', 'p-two'])
    // LEVEL 6 DRAWS THE PART'S LONG TEXT AND LEVEL 4 DRAWS NEITHER, out of the same reader the
    // report page draws from.
    expect(drawn.parts[0]?.text).toBe(PARTS[0]?.text120)
    const level4 = card.cardAt(
      rich,
      card
        .planCanvas(graph, 'gist', card.NO_FOCUS, new Map([[rich.id, { room: 1, height: null, rise: null, width: null, size: null, detail: true, level: null }]]))
        .cards.get(rich.id) as never,
    )
    expect(level4.parts[0]?.text).toBeNull()
    expect(level4.parts[0]?.heading).toBe(PARTS[0]?.heading)
  })

  it('draws the record’s own line at level 3 and never beside the parts', () => {
    const graph = build()
    const level3 = card.cardAt(
      rich,
      card
        .planCanvas(graph, 'gist', card.NO_FOCUS, new Map([[rich.id, { room: 1, height: null, rise: null, width: null, size: null, detail: false, level: null }]]))
        .cards.get(rich.id) as never,
    )
    expect(level3.body?.text).toBe(LONG_SUMMARY)
    expect(level3.parts).toEqual([])
    const level6 = card.cardAt(
      rich,
      card
        .planCanvas(graph, 'gist', card.NO_FOCUS, new Map([[rich.id, { room: card.roomForSize('largest', 1), height: null, rise: null, width: null, size: null, detail: true, level: null }]]))
        .cards.get(rich.id) as never,
    )
    expect(level6.body).toBeNull()
  })
})

// ==================================================================== 8. one drawing, never copied

// ==================================================================== 9. the four states are four

describe('the states a reader moves on a drawing each have their own word', () => {
  it('has a word for each of them, and no two of them are the same word', () => {
    const words = Object.values(card.DRAWING_WORDS)
    expect(new Set(words).size).toBe(words.length)
    // `Focus` CAME OFF THIS LIST ON 6 SEPTEMBER 2026, with criterion D15, because a Focus control had
    // no clear meaning to a reader and only confused them. Focus is not a control with a word
    // over the drawing any more; it is a press on a card, shown on the card. The other three still
    // need a word each, and `Detail` is still written once and drawn at two scopes so they cannot
    // come to two words for one axis.
    expect(card.DRAWING_WORDS.says).toBe('Detail')
    expect([card.DRAWING_WORDS.zoom, card.DRAWING_WORDS.size, card.DRAWING_WORDS.level]).toEqual([
      'Zoom',
      'Size',
      'Level',
    ])
    expect(Object.values(card.DRAWING_WORDS), 'a word for focus is still on the drawing').not.toContain('Focus')
  })

  it('makes a card of every size a different width, and never a different rung', () => {
    const widths = card.CARD_SIZES.map((size) => card.WIDTH_AT_SIZE[size])
    expect(new Set(widths).size).toBe(card.CARD_SIZES.length)
    expect([...widths].sort((a, b) => a - b)).toEqual(widths)
  })

  it('refuses a step past either end of the sizes, in the words of the state it is in', () => {
    expect(card.sizeStep('largest', 1)).toBeNull()
    expect(card.sizeStep('smallest', -1)).toBeNull()
    expect(card.sizeRefusal('largest')).toBe(
      'Already as big as it goes: it is saying everything it has, and more room would only cover the drawing.',
    )
    expect(card.sizeRefusal('smallest')).toBe('Already the smallest a card goes.')
  })

  /**
   * REWRITTEN ON 6 SEPTEMBER 2026, WITH CRITERION D14, AND THE OLD CLAIM SAID MORE THAN THIS ONE.
   *
   * It used to walk `CANVAS_SAYS` — the three steps of the control over a drawing — and check that
   * `canvasSaysAt` marked the right one. That control is gone, and so are
   * both of those. What survives is the half that is still true and still matters: the level a
   * drawing opens at decides the size its cards open at, and the card then says that level.
   */
  it('starts every card at the size its opening level asks for', () => {
    for (const says of ['label', 'title', 'gist'] as const) {
      expect(at(card.SIZE_A_CARD_STARTS_AT[says], false, rich.levels.has), says).toBe(says)
    }
    // A DRAWING WHOSE OPENING LEVEL IS ABOVE 3 STILL OPENS ITS CARDS AT LEVEL 3, because the levels
    // written by part are behind a card's own tick and nothing else ticks it.
    for (const says of ['outline', 'sketch', 'digest', 'full'] as const) {
      expect(card.SIZE_A_CARD_STARTS_AT[says], says).toBe('usual')
      expect(at('usual', false, rich.levels.has), says).toBe('gist')
    }
  })
})
