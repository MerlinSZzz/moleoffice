// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LANES DRAWING'S INPUT IS READ FROM THE RECORDS AND LINKS THE PIPELINE PAGE LOADED, AND FROM THE STORED LANES.
 * Wave 13u round 230, package PV, second half. The function is `lanesInputFor` in
 * src/web/components/graph/lanes/from-records.ts. It takes what `loadPage` loaded, the master pipeline's id, the drawn
 * pipeline, the level and the stored intent of the pipeline's scope, and gives the `LanesInput` the drawing takes
 * (src/web/components/graph/lanes/tree.ts) and the sentences the page says about what it could not draw: `said` for
 * every reader, and `toDevelopers` for the developer view only, each with its word key.
 *
 * WHAT IS PROVED, with made-up records and links and no browser and no server. The project holds a master pipeline of
 * two steps, a block pipeline hung on each, an ordinary pipeline of three steps with two modules carrying them, two
 * further pipelines whose steps the ordinary one links to, a task, and a few links that cannot be drawn.
 *   1. every link whose two ends are drawn is in `links`, with its gate, what it carries and whether it was inferred;
 *   2. a link to another pipeline's step adds that step, in an area headed by its own pipeline, in the pipelines' order;
 *      a step two pipelines list goes under the first, and a sentence for developers says so;
 *   3. a link to anything else that is not drawn gives a sentence for developers naming its type and both titles, and
 *      no link; a part_of link from a pipeline to a step whose title leads to that pipeline gives no link and no
 *      sentence, on the master at both levels, on the hung pipeline's own page and on the page that draws the step; a
 *      step two pipelines are part of leads to its own page, so each of its part_of links is drawn as any other link:
 *      a line where the pipeline heads an area of the page, and a sentence for developers where it is not drawn;
 *   4. with no stored lanes: an ordinary pipeline draws its steps in tiers and the modules that carry them beside them,
 *      the master's Boxes level draws one row per master step, and its Steps level draws its steps in tiers; a pipeline
 *      whose steps no module carries has no modules area at all;
 *   5. stored lanes make the tree: lanes inside lanes, a lane beside another, a lane's head, tint, columns and order;
 *   6. a drawn record that no listed lane holds is listed as not placed;
 *   7. a lane stored on a node of a scope that lists no lanes places nothing, and a sentence for developers names it;
 *   8. on the master's Boxes level a box carries one badge for each block whose block pipelines list it;
 *   9. each of the four rules for where a card's title leads;
 *  10. the step numbers, which only the drawn pipeline's own steps carry; and a drawn record carries no summary;
 *  11. a gate that cannot be read gives a sentence for every reader; a broken link, a lane head the page did not load
 *      and a record placed in a lane the page did not load each give a sentence for developers;
 *  12. a stored direction, room, emphasis, fold, near hint or position, which this drawing does not use, gives one
 *      sentence for developers naming each kind that is stored, and a stored order alone gives none;
 *  13. each card's counts, drawn or not: the drawn pipeline's steps a module carries and the steps of other pipelines
 *      it carries that are drawn here, the different modules that carry a step, and the different steps the pipelines
 *      hung on a step or box list. A count that does not apply is null, and a count the page cannot work out is null
 *      with a sentence. This case adds records and links of its own.
 *  14. every record an area is headed by is among the drawn records, made like any other, and is not listed as not
 *      placed.
 *
 * WHAT ROUND 230'S REPAIR CHANGED HERE, AND WHY. On a filed pipeline's page the drawing threw and drew nothing: the
 * engine draws an area's head from the input's records, and two kinds of area were headed by a record that was not among
 * them. They were the area of another pipeline's steps, headed by that pipeline, and on the master's Boxes level with no
 * lanes listed, each master step's row, headed by that step. Case 14 is new and holds the rule for both. Case 1 said the
 * master's Boxes level draws only `lamp-kettle` and `spoon-seed`. Its two master steps now head their rows and are
 * drawn, so by case 1's own rule the link between them, `north-south`, is drawn as well, and case 1 now says so.
 *
 * WHAT ROUND 230'S STEP 1C CHANGED HERE, AND WHY. The drawing drew two things wrongly on look 2b. A feeds line said what
 * it carries as the office keeps it, JSON text with its braces. A card drew its record's whole summary. Case 1's made-up
 * link carried the bare word `seedlings`, which no stored link holds, so it now carries the JSON text the office keeps,
 * and case 1 still expects the word `seedlings`, as the drawing says it. Case 10 said a drawn record carries its
 * record's summary as `line`. The drawing draws no summary now, so case 10 says a drawn record has no `line`.
 *
 * WHAT ROUND 231 CHANGED HERE, AND WHY (PV-R3). A module card counted only the drawn pipeline's steps it carries, while
 * a selection of the card lit its carries lines to the steps of other pipelines drawn on the page as well. A module's
 * count is now two numbers: the drawn pipeline's steps, and the steps of other pipelines drawn here. Case 13 pins both
 * for each module it counts. Its counts of the modules that carry a step and of the steps a card holds are unchanged.
 *
 * WHAT CHANGED ON 16 NOVEMBER 2026, BY THE DECISION, WHICH THE SECRETARY FILED FROM THE OWNER'S WORDS, AND
 * WHY. A pipeline's page says in its body
 * only what a reader needs to trust the page. The drawing's sentences about links it could not draw, and the like, go
 * to the developer view. So `lanesInputFor` gives two lists: `said`, which every reader sees, and `toDevelopers`, each
 * line a word key and its sentence. Cases 2, 3, 7, 11 and 12 read a sentence for developers in `toDevelopers` now, by
 * its key, and ask that `said` does not hold it. Case 13's sentences are all for every reader, so it holds unchanged:
 * without them a card's missing count would look like a count of nothing. Case 11's gate sentence stays in `said` too:
 * its line is drawn, and the reader must know its gate is unknown.
 *
 * Case 11's three other sentences are for developers because no read failed. A broken link's far record was deleted.
 * A lane head, or a record placed in a lane, that the page did not load, and a link's far end the page did not load,
 * are records outside what the page reads: `loadPage` in src/web/pages/PipelinePage.tsx reads every record of the
 * structure and every live record one link joins to them that the reader may read, in one Promise.all, and if any of
 * those reads fails the whole page says it could not load. So none of these sentences can mean a read that failed.
 *
 * The decision also says that the part_of link from a block pipeline to its block is drawn by pressing the block, whose
 * title leads to that pipeline. That rule is general, and case 3 holds it: a part_of link from a pipeline to a step
 * whose title leads to that pipeline is drawn by that title, so it gives no line and no sentence. Until this day case 3
 * asked for a sentence about Pond's part_of link to Water, whose title leads to Pond; it now asks for none. At the
 * master's Boxes level a box's title leads to the block pipeline that lists it, not to a pipeline hung on the box, so
 * there a pipeline's part_of link to a box still gives a sentence for developers.
 *
 * Later on that day case 3 was corrected. It asked for a sentence for developers about Valley's part_of link to Pick,
 * on garden's page in case 13's project. But Valley heads the area of its step Spoon on that page, and Pick is garden's
 * own step, so both ends are drawn and the link is a line, by case 1's rule. Pick's title leads to Pick's own page, so
 * no title draws that link. Case 3 now asks for the line, and for no sentence about it. Ridge is not drawn on that
 * page, and its link still gives a sentence for developers.
 *
 * The function does not exist at the Criterion commit, so every case imports it on its own: each case is red there
 * because the module is missing, and never because this file could not load.
 *
 * MUTATIONS, each after a control run, each file copied first and restored with cp and checked with cmp:
 *   1. drop the links to another pipeline's steps: case 2 goes red.
 *   2. drop the sentence for a link that is not drawn: case 3 goes red.
 *   3. give a box no badge: case 8 goes red.
 *   4. send every title to the record's own page: case 9 goes red.
 *   5. leave the no-lanes drawing with no areas: case 4 goes red.
 *   6. draw the modules area when no module carries a step: case 4 goes red.
 *   7. drop the sentence about the stored hints the drawing does not use: case 12 goes red.
 *   8. leave stored positions out of that sentence: case 12 goes red.
 *   9. count a carrier whose record the page did not load: case 13 goes red.
 *  10. add up the hung pipelines' steps without counting a shared step once: case 13 goes red.
 *  11. leave another pipeline's area head out of the drawn records: case 14 goes red.
 *  12. pass a link's stored carries through raw: case 1 goes red.
 *  13. give a drawn record its summary as `line` again: case 10 goes red.
 *  14. draw no line for a part_of link from a pipeline, even with both ends drawn: case 3 goes red.
 */
import { beforeAll, describe, expect, it } from 'vitest'

import { t } from '../src/shared/i18n.ts'
import { linkWord } from '../src/shared/words.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { ScopeIntent } from '../src/shared/presentation.ts'
import type { StoredIntent } from '../src/web/components/graph/Edit.tsx'
import type { GraphLink } from '../src/web/components/graph/model.ts'
import type { GateReading } from '../src/web/components/LinkPanel.tsx'
import type { LaneArea, LanesInput } from '../src/web/components/graph/lanes/tree.ts'

type FromRecords = typeof import('../src/web/components/graph/lanes/from-records.ts')

const STORE = new Map<string, string>()
const storage = {
  getItem: (k: string) => STORE.get(k) ?? null,
  setItem: (k: string, v: string) => void STORE.set(k, v),
  removeItem: (k: string) => void STORE.delete(k),
}

// The page's modules read a window when they load. A plain one is enough here: nothing is drawn.
beforeAll(() => {
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
})

const fromRecords = (): Promise<FromRecords> => import('../src/web/components/graph/lanes/from-records.ts')
const router = () => import('../src/web/components/router.tsx')

const AT = '2026-08-01 09:00:00'

function record(id: string, kind: string, title: string, data: Record<string, unknown> = {}, summary: string | null = null): PanelRecord {
  return { id, kind, title, summary, data, createdAt: AT, updatedAt: AT, deletedAt: null } as unknown as PanelRecord
}

const pipeline = (id: string, title: string, steps: string[]) => record(id, 'pipeline', title, { blockIds: steps })
const step = (id: string, title: string, summary: string | null = null) => record(id, 'block', title, { state: 'todo' }, summary)

const NO_GATE: GateReading = { at: 'not-a-dependency' }

function link(id: string, type: string, fromId: string, toId: string, more: { inferred?: boolean; broken?: boolean; gate?: GateReading } = {}): GraphLink {
  return { linkId: id, fromId, toId, type, inferred: more.inferred ?? false, broken: more.broken ?? false, gate: more.gate ?? NO_GATE } as GraphLink
}

// THE PROJECT. Its records are listed in this order, so its pipelines are too: plan, ridge, valley, garden, orchard,
// barn, pond. `plan` is the master. `ridge` hangs on its first step and `valley` on its second; both list `kettle`.
// `garden` is an ordinary pipeline; `orchard` and `barn` both list `rake`.
const RECORDS: PanelRecord[] = [
  pipeline('plan', 'Plan', ['north', 'south']),
  pipeline('ridge', 'Ridge', ['lamp', 'kettle']),
  pipeline('valley', 'Valley', ['spoon', 'kettle']),
  pipeline('garden', 'Garden', ['seed', 'water', 'pick']),
  pipeline('orchard', 'Orchard', ['ladder', 'rake']),
  pipeline('barn', 'Barn', ['rake']),
  pipeline('pond', 'Pond', []),
  step('north', 'Plan › North'),
  step('south', 'Plan › South'),
  step('lamp', 'Ridge › Lamp'),
  step('kettle', 'Ridge › Kettle'),
  step('spoon', 'Valley › Spoon'),
  step('seed', 'Garden › Seed', 'Sows the first row.'),
  step('water', 'Garden › Water'),
  step('pick', 'Garden › Pick'),
  step('ladder', 'Orchard › Ladder'),
  step('rake', 'Orchard › Rake'),
  record('hose', 'module', 'Hose', { state: 'doing' }),
  record('basket', 'module', 'Basket'),
  record('shovel', 'module', 'Shovel'),
  record('chore', 'task', 'Chore', { state: 'todo' }),
]

const LINKS: GraphLink[] = [
  link('hung-ridge', 'part_of', 'ridge', 'north'),
  link('hung-valley', 'part_of', 'valley', 'south'),
  link('north-south', 'blocks', 'north', 'south'),
  link('lamp-kettle', 'feeds', 'lamp', 'kettle'),
  link('spoon-seed', 'feeds', 'spoon', 'seed'),
  link('seed-water', 'feeds', 'seed', 'water', { inferred: true }),
  link('seed-water-wait', 'blocks', 'seed', 'water', { gate: { at: 'unreadable', problem: 'the stored pair is torn' } }),
  link('water-pick', 'blocks', 'water', 'pick', { gate: { at: 'gate', gate: { kind: 'hard', upTo: 'a dry run' } } }),
  link('hose-water', 'implements', 'hose', 'water'),
  link('basket-pick', 'implements', 'basket', 'pick'),
  link('pick-ladder', 'feeds', 'pick', 'ladder'),
  link('rake-seed', 'blocks', 'rake', 'seed'),
  link('water-chore', 'relates_to', 'water', 'chore'),
  link('pond-water', 'part_of', 'pond', 'water'),
  link('seed-gone', 'relates_to', 'seed', 'gone', { broken: true }),
]

// What a link carries, as the office keeps it: JSON text.
const CARRIES = new Map<string, string | null | undefined>([['seed-water', '[{"out":"seedlings"}]']])

const LOADED = { records: RECORDS, links: LINKS, linkCarries: CARRIES }

// CASE 13'S PROJECT: the one above, with more carriers and more pipelines hung on steps and boxes. `shed` lists a step
// the page did not load, `loft` has not listed its steps yet, and `ghost` is a record the page did not load.
const COUNTED = {
  records: [...RECORDS, pipeline('shed', 'Shed', ['spade', 'lost']), record('loft', 'pipeline', 'Loft'), step('spade', 'Shed › Spade'), record('drill', 'module', 'Drill')],
  links: [
    ...LINKS,
    link('hose-seed', 'implements', 'hose', 'seed'),
    link('hose-water-again', 'implements', 'hose', 'water'),
    link('drill-water', 'implements', 'drill', 'water', { inferred: true }),
    link('hose-ladder', 'implements', 'hose', 'ladder'),
    link('chore-pick', 'implements', 'chore', 'pick'),
    link('ghost-spoon', 'implements', 'ghost', 'spoon'),
    link('drill-north', 'implements', 'drill', 'north'),
    link('basket-spade', 'implements', 'basket', 'spade'),
    link('drill-spade', 'implements', 'drill', 'spade'),
    link('drill-lost', 'implements', 'drill', 'lost'),
    link('hung-ridge-pick', 'part_of', 'ridge', 'pick'),
    link('hung-valley-pick', 'part_of', 'valley', 'pick'),
    link('hung-loft-ladder', 'part_of', 'loft', 'ladder'),
    link('hung-shed-lamp', 'part_of', 'shed', 'lamp'),
    link('hung-barn-kettle', 'part_of', 'barn', 'kettle'),
  ],
  linkCarries: CARRIES,
}

const byId = (id: string): PanelRecord => {
  const found = RECORDS.find((one) => one.id === id)
  if (found === undefined) throw new Error(`the made-up project has no record ${id}`)
  return found
}

function stored(intent: ScopeIntent, scope: string): StoredIntent {
  return { scope, intent, targets: [], report: {}, note: '' } as unknown as StoredIntent
}

/** The lanes this file stores on the ordinary pipeline's scope. */
const LANES: ScopeIntent = {
  lanes: [
    { name: 'Front', arrange: 'row', order: 2, tint: '--area-2' },
    { name: 'Back', arrange: 'grid', columns: 3, order: 1, head: 'chore' },
    { name: 'Side', arrange: 'stack', beside: 'right', of: 'Back', head: 'nowhere' },
    { name: 'Inner', arrange: 'row', in: 'Front', order: 0 },
    { name: 'Inner2', arrange: 'row', in: 'Front' },
  ],
  nodes: {
    seed: { lane: 'Front', order: 5 },
    water: { lane: 'Inner' },
    pick: { lane: 'Front' },
    hose: { lane: 'Front' },
    shovel: { lane: 'Side' },
    ghost: { lane: 'Back' },
  },
}

/** What `lanesInputFor` gives: the input, the sentences for every reader, and the sentences for developers. */
interface Reading {
  input: LanesInput
  said: string[]
  // Optional, so this file compiles before `lanesInputFor` gives the list.
  toDevelopers?: readonly { key: string; words: string }[]
}

async function garden(intent: ScopeIntent = {}): Promise<Reading> {
  const { lanesInputFor } = await fromRecords()
  return lanesInputFor(LOADED, 'plan', byId('garden'), 'steps', stored(intent, 'pipeline:garden'))
}

async function master(level: 'boxes' | 'steps', intent: ScopeIntent = {}): Promise<Reading> {
  const { lanesInputFor } = await fromRecords()
  return lanesInputFor(LOADED, 'plan', byId('plan'), level, stored(intent, 'pipeline:plan'))
}

const ids = (input: LanesInput): string[] => input.records.map((one) => one.id).sort()
const drawn = (input: LanesInput, id: string) => {
  const found = input.records.find((one) => one.id === id)
  if (found === undefined) throw new Error(`${id} is not drawn: ${ids(input).join(', ')}`)
  return found
}
const items = (area: LaneArea): string[] => area.items.map((item) => ('record' in item ? item.record : `lane ${item.area.key}`))
const saying = (said: readonly string[], ...words: string[]): string[] => said.filter((sentence) => words.every((word) => sentence.includes(word)))
/**
 * The sentences for developers, as words. A reading with no such list gives none, so a case that asks for one is red in
 * its own words and not because the list is missing.
 */
const told = (reading: Reading): string[] => (reading.toDevelopers ?? []).map((line) => line.words)
/** The keys of the sentences for developers that hold every one of the words. */
const toldBy = (reading: Reading, ...words: string[]): string[] =>
  (reading.toDevelopers ?? []).filter((line) => words.every((word) => line.words.includes(word))).map((line) => line.key)

describe('the lanes input is read from the records and links the page loaded', () => {
  it('1. every link whose two ends are drawn is in the links, with its gate, what it carries and whether it was inferred', async () => {
    const { input } = await garden()
    const byLink = new Map(input.links.map((one) => [one.id, one]))
    expect([...byLink.keys()].sort()).toEqual(
      ['basket-pick', 'hose-water', 'pick-ladder', 'rake-seed', 'seed-water', 'seed-water-wait', 'spoon-seed', 'water-pick'].sort(),
    )
    expect(byLink.get('seed-water')).toEqual({ id: 'seed-water', type: 'feeds', from: 'seed', to: 'water', carries: 'seedlings', gate: null, upTo: null, inferred: true })
    expect(byLink.get('water-pick')).toEqual({ id: 'water-pick', type: 'blocks', from: 'water', to: 'pick', carries: null, gate: 'hard', upTo: 'a dry run', inferred: false })
    // A gate that cannot be read is no gate on the line; case 11 shows its sentence.
    expect(byLink.get('seed-water-wait')).toMatchObject({ gate: null, upTo: null })
    expect(byLink.get('hose-water')).toMatchObject({ type: 'implements', from: 'hose', to: 'water', carries: null })

    // The master's Steps level draws the links between its steps; its Boxes level the links between its boxes, and the
    // link between its two steps, which head the rows of boxes and so are drawn.
    expect((await master('steps')).input.links.map((one) => one.id)).toEqual(['north-south'])
    expect((await master('boxes')).input.links.map((one) => one.id).sort()).toEqual(['lamp-kettle', 'north-south', 'spoon-seed'])
  })

  it("2. a link to another pipeline's step adds that step in an area headed by its pipeline, in the pipelines' order", async () => {
    const reading = await garden()
    const { input, said } = reading
    for (const id of ['ladder', 'rake', 'spoon']) expect(drawn(input, id).role).toBe('step')
    const areas = input.tree.areas.slice(-2)
    expect(areas.map((area) => area.heading)).toEqual([
      { text: 'Valley', record: 'valley' },
      { text: 'Orchard', record: 'orchard' },
    ])
    expect(areas.map((area) => area.arrange)).toEqual(['row', 'row'])
    expect(items(areas[0]!)).toEqual(['spoon'])
    // `rake` is listed by the orchard and by the barn: it goes under the first of them, and one sentence says so.
    expect(items(areas[1]!)).toEqual(['ladder', 'rake'])
    expect(input.tree.areas.some((area) => area.heading?.record === 'barn')).toBe(false)
    expect(toldBy(reading, 'Rake', 'Orchard')).toEqual(['lanesInput.stepUnderFirst'])
    expect(saying(said, 'Rake', 'Orchard'), 'every reader is not told').toEqual([])

    // On the master's Boxes level a box's link to an ordinary pipeline's step draws that step too.
    const boxes = (await master('boxes')).input
    expect(boxes.tree.areas.at(-1)!.heading).toEqual({ text: 'Garden', record: 'garden' })
    expect(items(boxes.tree.areas.at(-1)!)).toEqual(['seed'])
  })

  it('3. a link to anything else that is not drawn gives a sentence for developers naming its type and both titles, and no link', async () => {
    const reading = await garden()
    const { input, said } = reading
    const partOf = linkWord('part_of', 'forward').text
    expect(input.links.some((one) => one.id === 'water-chore')).toBe(false)
    expect(ids(input)).not.toContain('chore')
    expect(toldBy(reading, linkWord('relates_to', 'forward').text, 'Water', 'Chore')).toEqual(['lanesInput.linkNotDrawn'])
    expect(saying(said, 'Water', 'Chore'), 'every reader is not told').toEqual([])

    // A pipeline hung on a step is not drawn either, but Water's title leads to Pond, so that title draws the link:
    // no line, and no sentence for anybody (16 November 2026).
    expect(drawn(input, 'water').href).toBe((await router()).hrefOf((await router()).pipelinePath('pond')))
    expect(input.links.some((one) => one.id === 'pond-water')).toBe(false)
    expect(saying([...said, ...told(reading)], 'Pond', 'Water'), "Pond's part_of link to Water is said by nobody").toEqual([])

    // The block pipelines' part_of links to the master's steps: on the master at both levels, each step's title leads to
    // its block pipeline, and on that pipeline's own page the step is not drawn. None gives a line or a sentence.
    const { lanesInputFor } = await fromRecords()
    const ridge = lanesInputFor(LOADED, 'plan', byId('ridge'), 'steps', stored({}, 'pipeline:ridge'))
    for (const [where, one] of [['Boxes', await master('boxes')], ['Steps', await master('steps')], ["Ridge's page", ridge]] as const) {
      expect(one.input.links.map((each) => each.id), `${where}: no line for a block pipeline's part_of link`).not.toContain('hung-ridge')
      expect(one.input.links.map((each) => each.id), `${where}: no line for a block pipeline's part_of link`).not.toContain('hung-valley')
      expect(saying([...one.said, ...told(one)], 'Ridge', 'North'), `${where}: Ridge's part_of link to North is said by nobody`).toEqual([])
      expect(saying([...one.said, ...told(one)], 'Valley', 'South'), `${where}: Valley's part_of link to South is said by nobody`).toEqual([])
    }

    // A step two pipelines are part of leads to its own page, so no title draws their part_of links, and each is drawn
    // as any other link is. In case 13's project Ridge and Valley are both part of Pick. Ridge is not drawn on garden's
    // page, so its link gives a sentence for developers. Valley heads the area of its step Spoon there, so both ends of
    // its link are drawn: the link is a line, by case 1's rule, and no sentence names it.
    const yard = lanesInputFor(COUNTED, 'plan', byId('garden'), 'steps', stored({}, 'pipeline:garden'))
    expect(drawn(yard.input, 'pick').href).toBe((await router()).hrefOf((await router()).recordPath('pick', 'block')))
    expect(toldBy(yard, partOf, 'Ridge', 'Pick')).toEqual(['lanesInput.linkNotDrawn'])
    const valley = yard.input.tree.areas.find((area) => area.heading?.record === 'valley')
    expect(valley === undefined ? null : items(valley), 'Valley heads the area of its step Spoon').toEqual(['spoon'])
    expect(yard.input.links.map((each) => each.id), "Valley's part_of link to Pick is a line").toContain('hung-valley-pick')
    expect(saying([...yard.said, ...told(yard)], 'Valley', 'Pick'), "Valley's part_of link to Pick is said by nobody").toEqual([])
    expect(saying(yard.said, 'Pick', partOf), 'every reader is not told').toEqual([])
  })

  it('4. with no stored lanes, each of the three drawings has its own areas', async () => {
    // An ordinary pipeline: its steps in tiers, the modules that carry them beside them, then other pipelines.
    const { input } = await garden()
    const words = await import('../src/shared/words/en-wave-13u.ts')
    const modulesHeading = Reflect.get(words.enWave13u, 'lanesInput.modulesArea')
    expect(typeof modulesHeading).toBe('string')
    const [steps, modules] = input.tree.areas
    expect(input.tree).toMatchObject({ level: 'steps', direction: 'down', notPlaced: [] })
    expect(steps).toMatchObject({ heading: null, arrange: 'tiers', columns: null, beside: null, tint: null })
    expect(items(steps!)).toEqual(['seed', 'water', 'pick'])
    expect(modules).toMatchObject({ heading: { text: modulesHeading, record: null }, arrange: 'stack', beside: { side: 'right', of: steps!.key } })
    expect(items(modules!)).toEqual(['basket', 'hose'])
    expect(input.tree.areas).toHaveLength(4)

    // A pipeline whose steps no module carries has its steps and the other pipelines' areas, and no modules area.
    const { lanesInputFor } = await fromRecords()
    const bare = lanesInputFor(LOADED, 'plan', byId('orchard'), 'steps', stored({}, 'pipeline:orchard')).input
    expect(items(bare.tree.areas[0]!)).toEqual(['ladder', 'rake'])
    expect(bare.tree.areas.some((area) => area.heading?.text === modulesHeading)).toBe(false)
    expect(bare.tree.areas.map((area) => area.heading?.record ?? null)).toEqual([null, 'garden'])

    // The master's Boxes level: one row for each master step, headed by it, holding the boxes the reading puts there.
    const boxes = (await master('boxes')).input
    expect(boxes.tree.level).toBe('boxes')
    expect(boxes.tree.areas.slice(0, 2).map((area) => [area.heading, area.arrange, items(area)])).toEqual([
      [{ text: 'Plan › North', record: 'north' }, 'row', ['lamp', 'kettle']],
      [{ text: 'Plan › South', record: 'south' }, 'row', ['spoon']],
    ])

    // The master's Steps level: its steps in tiers, and nothing else.
    const levels = (await master('steps')).input
    expect(levels.tree.level).toBe('steps')
    expect(levels.tree.areas).toHaveLength(1)
    expect(levels.tree.areas[0]).toMatchObject({ heading: null, arrange: 'tiers', columns: null, beside: null, tint: null })
    expect(items(levels.tree.areas[0]!)).toEqual(['north', 'south'])
    expect(ids(levels)).toEqual(['north', 'south'])
  })

  it('5. stored lanes make the tree: lanes inside lanes, beside, head, tint, columns and order', async () => {
    const { input } = await garden(LANES)
    const [back, front, side, ...rest] = input.tree.areas
    expect(rest.map((area) => area.heading?.record)).toEqual(['valley', 'orchard'])
    expect(back).toEqual({ key: 'Back', heading: { text: 'Back', record: 'chore' }, arrange: 'grid', columns: 3, beside: null, tint: null, items: [] })
    expect(side).toEqual({
      key: 'Side',
      heading: { text: 'Side', record: null },
      arrange: 'stack',
      columns: null,
      beside: { side: 'right', of: 'Back' },
      tint: null,
      items: [{ record: 'shovel' }],
    })
    expect(front).toMatchObject({ key: 'Front', heading: { text: 'Front', record: null }, arrange: 'row', tint: '--area-2', beside: null })
    // Stored order first, low first; then lanes in their listed order, steps in stored order, other records by title.
    expect(items(front!)).toEqual(['lane Inner', 'seed', 'lane Inner2', 'pick', 'hose'])
    const inner = front!.items.find((item) => 'area' in item && item.area.key === 'Inner')
    expect(inner !== undefined && 'area' in inner ? items(inner.area) : null).toEqual(['water'])
    // A lane's head is drawn, and the lanes place what their nodes name.
    for (const id of ['chore', 'shovel']) expect(ids(input)).toContain(id)
  })

  it('6. a drawn record that no listed lane holds is listed as not placed', async () => {
    const { input } = await garden(LANES)
    expect(ids(input)).toContain('basket')
    expect(input.tree.notPlaced).toEqual(['basket'])
  })

  it('7. a lane stored on a node of a scope that lists no lanes places nothing, and a sentence names it', async () => {
    const reading = await garden({ nodes: { seed: { lane: 'Front' }, hose: { lane: 'Front', order: 1 } } })
    const { input, said } = reading
    expect(items(input.tree.areas[0]!)).toEqual(['seed', 'water', 'pick'])
    expect(input.tree.areas.some((area) => area.key === 'Front')).toBe(false)
    expect(toldBy(reading, 'Seed', 'Front')).toEqual(['lanesInput.oldNodeLane'])
    expect(toldBy(reading, 'Hose', 'Front')).toEqual(['lanesInput.oldNodeLane'])
    expect(saying(said, 'Front'), 'every reader is not told').toEqual([])
  })

  it('8. on the Boxes level a box carries one badge for each block whose block pipelines list it', async () => {
    const { input } = await master('boxes')
    const place = (n: number) => ({ text: t('bigMap.place', { n }), tone: n })
    expect(drawn(input, 'lamp').badges).toEqual([place(0)])
    expect(drawn(input, 'kettle').badges).toEqual([place(0), place(1)])
    expect(drawn(input, 'spoon').badges).toEqual([place(1)])
    expect(drawn(input, 'seed').badges).toEqual([])
    // A box is named without its block pipeline's title in front, as the block map names it.
    expect(['lamp', 'kettle', 'spoon'].map((id) => [drawn(input, id).title, drawn(input, id).role])).toEqual([
      ['Lamp', 'box'],
      ['Kettle', 'box'],
      ['Spoon', 'box'],
    ])
    // No badge anywhere else.
    for (const one of [...(await garden()).input.records, ...(await master('steps')).input.records]) expect(one.badges).toEqual([])
  })

  it("9. a card's title leads by the four rules", async () => {
    const { hrefOf, pipelinePath, recordPath } = await router()
    const boxes = (await master('boxes')).input
    // A box opens the block pipeline that lists it.
    expect(drawn(boxes, 'lamp').href).toBe(hrefOf(pipelinePath('ridge')))
    expect(drawn(boxes, 'kettle').href).toBe(hrefOf(pipelinePath('ridge')))
    expect(drawn(boxes, 'spoon').href).toBe(hrefOf(pipelinePath('valley')))
    // A step that exactly one pipeline is part of opens that pipeline.
    expect(drawn((await master('steps')).input, 'north').href).toBe(hrefOf(pipelinePath('ridge')))
    const { input } = await garden()
    expect(drawn(input, 'water').href).toBe(hrefOf(pipelinePath('pond')))
    // A step of another pipeline opens that pipeline when exactly one pipeline lists it.
    expect(drawn(input, 'ladder').href).toBe(hrefOf(pipelinePath('orchard')))
    expect(drawn(input, 'spoon').href).toBe(hrefOf(pipelinePath('valley')))
    // Anything else opens the record's own page: a step two pipelines list, the drawn pipeline's own step, a module.
    expect(drawn(input, 'rake').href).toBe(hrefOf(recordPath('rake', 'block')))
    expect(drawn(input, 'seed').href).toBe(hrefOf(recordPath('seed', 'block')))
    expect(drawn(input, 'hose').href).toBe(hrefOf(recordPath('hose', 'module')))
  })

  it("10. only the drawn pipeline's own steps carry a number", async () => {
    const { input } = await garden()
    expect(['seed', 'water', 'pick'].map((id) => drawn(input, id).number)).toEqual(['01', '02', '03'])
    for (const id of ['ladder', 'rake', 'spoon', 'hose', 'basket']) expect(drawn(input, id).number).toBeNull()
    expect(drawn(input, 'seed')).toMatchObject({ title: 'Seed', role: 'step', state: 'todo' })
    expect(drawn(input, 'hose')).toMatchObject({ role: 'module', state: 'doing' })
    // The drawing draws no summary, so a drawn record has none, though `seed` has one.
    expect(drawn(input, 'seed')).not.toHaveProperty('line')
    const levels = (await master('steps')).input
    expect(['north', 'south'].map((id) => drawn(levels, id).number)).toEqual(['01', '02'])
    for (const one of (await master('boxes')).input.records) expect(one.number).toBeNull()
  })

  it('11. a gate that cannot be read gives a sentence for every reader; a broken link and a lane record not loaded, one for developers', async () => {
    const plain = await garden()
    const related = linkWord('relates_to', 'forward').text
    expect(saying(told(plain), 'Seed', related).filter((one) => !one.includes('Chore'))).toHaveLength(1)
    expect(toldBy(plain, 'Seed', related).filter((key) => key === 'lanesInput.linkBroken')).toHaveLength(1)
    expect(saying(plain.said, 'Seed', related), 'every reader is not told of the broken link').toEqual([])
    expect(saying(plain.said, 'the stored pair is torn', 'Seed', 'Water')).toHaveLength(1)
    expect(saying(told(plain), 'the stored pair is torn'), 'nor is the gate a sentence for developers').toEqual([])
    const laned = await garden(LANES)
    expect(toldBy(laned, 'Side')).toEqual(['lanesInput.headNotLoaded'])
    expect(toldBy(laned, 'Back')).toEqual(['lanesInput.placedNotLoaded'])
    expect(saying(laned.said, 'Side'), 'every reader is not told').toEqual([])
    expect(saying(laned.said, 'Back'), 'every reader is not told').toEqual([])
  })

  it('12. stored hints this drawing does not use give one sentence naming each kind that is stored', async () => {
    // A stored order and nothing else is read by the drawing, so it adds no sentence.
    const plain = await garden({ nodes: { seed: { order: 2 } } })
    expect(plain.said).toEqual((await garden()).said)
    expect(told(plain)).toEqual(told(await garden()))
    const added = (reading: Reading): string[] => {
      expect(reading.said, 'every reader is not told of a stored hint').toEqual(plain.said)
      const keys = (reading.toDevelopers ?? []).filter((line) => !told(plain).includes(line.words)).map((line) => line.key)
      expect(keys.every((key) => key === 'lanesInput.unusedHints'), `the hints' sentence is named by its key (${keys.join(', ')})`).toBe(true)
      return told(reading).filter((sentence) => !told(plain).includes(sentence))
    }
    // Positions alone, where cards were moved to on the old canvas, are named too.
    expect(added(await garden({ nodes: { pick: { x: 10, y: 20 } } }))).toHaveLength(1)

    const every = await garden({
      direction: 'right',
      nodes: { seed: { order: 2, role: 'prominent', emphasis: 'safety' }, water: { collapsed: true, near: 'seed' }, pick: { x: 10, y: 20 } },
    })
    expect(added(every)).toHaveLength(1)
    const words = await import('../src/shared/words/en-wave-13u.ts')
    const word = (key: string): string => String(Reflect.get(words.enWave13u, key))
    const kinds = ['direction', 'room', 'emphasis', 'folded', 'near', 'moved'].map((kind) => word(`lanesInput.unused.${kind}`))
    for (const kind of kinds) expect(added(every)[0]).toContain(kind)

    // Only the kinds that are stored are named.
    const one = added(await garden({ direction: 'right' }))
    expect(one).toHaveLength(1)
    expect(kinds.filter((kind) => one[0]!.includes(kind))).toEqual([kinds[0]])
  })

  it("13. each card's counts, drawn or not, and a sentence for each count the page cannot work out", async () => {
    const { lanesInputFor } = await fromRecords()
    const counted = (id: string, level: 'boxes' | 'steps' = 'steps') =>
      lanesInputFor(COUNTED, 'plan', COUNTED.records.find((one) => one.id === id)!, level, stored({}, `pipeline:${id}`))
    const counts = (input: LanesInput, id: string) => drawn(input, id).counts
    // The three sentences' words come with the code, so this case says them through a signature that takes any key, and
    // checks at its end that each is a word.
    const say = t as unknown as (key: string, values: Record<string, string>) => string

    // A module counts the drawn pipeline's different steps it carries, and apart from them the different steps of other
    // pipelines it carries that are drawn here: `ladder`, `north` and `spade`. A step the page could not read is not one.
    const yard = counted('garden')
    expect(counts(yard.input, 'hose')).toEqual({ carries: { thisPipeline: 2, otherPipelines: 1 }, carriedBy: null, holds: null })
    expect(counts(yard.input, 'basket')).toEqual({ carries: { thisPipeline: 1, otherPipelines: 1 }, carriedBy: null, holds: null })
    expect(counts(yard.input, 'drill')).toEqual({ carries: { thisPipeline: 1, otherPipelines: 2 }, carriedBy: null, holds: null })
    // A step counts the different modules that carry it, an inferred link too and a task's link not at all. It holds the
    // different steps of the pipelines hung on it, a step two of them list once, and 0 when a hung pipeline lists none.
    expect(counts(yard.input, 'seed')).toEqual({ carries: null, carriedBy: 1, holds: null })
    expect(counts(yard.input, 'water')).toEqual({ carries: null, carriedBy: 2, holds: 0 })
    expect(counts(yard.input, 'pick')).toEqual({ carries: null, carriedBy: 1, holds: 3 })
    // Another pipeline's step holds only what is hung on it, never the pipeline that lists it.
    expect(counts(yard.input, 'ladder')).toEqual({ carries: null, carriedBy: 1, holds: 0 })
    expect(counts(yard.input, 'rake')).toEqual({ carries: null, carriedBy: 0, holds: null })
    expect(counts(yard.input, 'north')).toEqual({ carries: null, carriedBy: 1, holds: 2 })
    // A carrier whose record the page did not load may not be a module: no count, and one sentence.
    expect(counts(yard.input, 'spoon')).toEqual({ carries: null, carriedBy: null, holds: null })
    expect(yard.said.filter((one) => one === say('lanesInput.carriedByUnknown', { record: 'Spoon' }))).toHaveLength(1)

    // The records counted need not be drawn: the master's Steps level draws no module.
    const levels = counted('plan').input
    expect(ids(levels)).toEqual(['north', 'south'])
    expect(counts(levels, 'north')).toEqual({ carries: null, carriedBy: 1, holds: 2 })
    expect(counts(levels, 'south')).toEqual({ carries: null, carriedBy: 0, holds: 2 })

    // A box holds only what is hung on the box itself, and carries nothing and is carried by nothing.
    const boxes = counted('plan', 'boxes')
    expect(counts(boxes.input, 'kettle')).toEqual({ carries: null, carriedBy: null, holds: 1 })
    expect(counts(boxes.input, 'spoon')).toEqual({ carries: null, carriedBy: null, holds: null })
    // A hung pipeline that lists a step the page could not read leaves no count, and one sentence names it.
    expect(counts(boxes.input, 'lamp')).toEqual({ carries: null, carriedBy: null, holds: null })
    expect(boxes.said.filter((one) => one === say('lanesInput.holdsUnread', { record: 'Lamp', pipelines: '“Shed”' }))).toHaveLength(1)

    // A module linked as carrying a step the drawn pipeline lists and the page could not read has no count, and one
    // sentence names it. A module with no such link keeps its count.
    const shed = counted('shed')
    expect(counts(shed.input, 'basket')).toEqual({ carries: { thisPipeline: 1, otherPipelines: 1 }, carriedBy: null, holds: null })
    expect(counts(shed.input, 'drill')).toEqual({ carries: null, carriedBy: null, holds: null })
    expect(counts(shed.input, 'spade')).toEqual({ carries: null, carriedBy: 2, holds: null })
    expect(shed.said.filter((one) => one === say('lanesInput.carriesUnknown', { record: 'Drill' }))).toHaveLength(1)

    const words = await import('../src/shared/words/en-wave-13u.ts')
    for (const key of ['lanesInput.carriedByUnknown', 'lanesInput.holdsUnread', 'lanesInput.carriesUnknown']) {
      expect(typeof Reflect.get(words.enWave13u, key)).toBe('string')
    }
  })

  it('14. every record an area is headed by is among the drawn records, made like any other, and is placed', async () => {
    const { lanesInputFor } = await fromRecords()
    const heads = (areas: LaneArea[]): string[] =>
      areas.flatMap((area) => [...(area.heading?.record ? [area.heading.record] : []), ...heads(area.items.flatMap((item) => ('area' in item ? [item.area] : [])))])
    const drawings = {
      'the ordinary pipeline': (await garden()).input,
      'the ordinary pipeline with stored lanes': (await garden(LANES)).input,
      "the master's Boxes level": (await master('boxes')).input,
      'a pipeline no module carries': lanesInputFor(LOADED, 'plan', byId('orchard'), 'steps', stored({}, 'pipeline:orchard')).input,
    }
    for (const [which, input] of Object.entries(drawings)) {
      expect(heads(input.tree.areas).length, `${which} has an area headed by a record`).toBeGreaterThan(0)
      for (const id of heads(input.tree.areas)) {
        expect(ids(input), `${which}: the head ${id} is drawn`).toContain(id)
        expect(input.tree.notPlaced, `${which}: the head ${id} is placed`).not.toContain(id)
      }
    }
    // Another pipeline heads the area of its steps, and a master step heads the row of its boxes, each drawn by the
    // rules any card is drawn by.
    const { hrefOf, pipelinePath } = await router()
    expect(drawn(drawings['the ordinary pipeline'], 'valley')).toMatchObject({ kind: 'pipeline', title: 'Valley', number: null, badges: [] })
    expect(drawn(drawings["the master's Boxes level"], 'north')).toMatchObject({
      kind: 'block', title: 'North', role: 'step', state: 'todo', number: null, href: hrefOf(pipelinePath('ridge')),
    })
  })
})
