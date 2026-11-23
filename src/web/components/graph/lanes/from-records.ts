// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LANES DRAWING'S INPUT, READ FROM WHAT THE PIPELINE PAGE LOADED (package PV, second half, wave 13u round 230).
 *
 * The drawing in this folder draws one `LanesInput` (tree.ts) and works out its own geometry. This file builds that input
 * from the records, links and carries `loadPage` loaded and from the stored intent of the pipeline's scope, and says in
 * sentences what it could not draw: `said` for every reader, and `toDevelopers`, each with its word key, for the
 * developer view only. It asks for nothing and draws nothing.
 *
 * IT READS NOTHING THE PAGE'S READERS ALREADY READ. A pipeline's steps, their states, their carriers and the pipelines
 * hung on them come from `readPipeline`; the master's boxes, their block pipelines and the blocks' places from
 * `readTheBigMap`; which pipelines list a step from `blockIdsOf`; a link's gate from `blockLinkRows`; and every href from
 * the router's own `hrefOf`, which `RouteLink` draws with. `readEveryPipeline` and `readTheMastersMap` are the page's
 * two readings, so the page and this file call one copy of each.
 *
 * THE COUNTS ON A CARD come from the same readings, whether or not the records counted are drawn: a module's from the
 * steps of the drawn pipeline whose carriers name it, a step's from its own carriers, and what a step or box holds from
 * the pipelines hung on it. A count that does not apply is null. A count this page cannot work out is null too, and a
 * sentence says why, so a reader never sees a number nobody looked at.
 *
 * A STEP'S PACKAGE STATE is the state of the one package that names the step's block, from the packages the page read,
 * by `thePackageStateOn`, the rule the old graph's card used: none when no package or two packages name it, and then the
 * card says the step's own state. The step's `state` stays its own, and the card's colours with it.
 *
 * WHAT A LINK CARRIES is drawn in words, as the block map's lines say it: `carriedWords` of `carriesOf` the stored JSON
 * text. A card reads the record's written label and summary when the reader's detail asks for them.
 *
 * WHICH RECORDS, as the decisions on how lanes are stored and how the page carries the drawing say:
 *   - the master's Boxes level: every box of the big map, every record a node lane places in a listed lane, and every
 *     lane's head; with no lanes listed, each master step, at the head of the row of its boxes, and the modules joined
 *     to the boxes by `feeds` links, as the next paragraph says;
 *   - the master's Steps level: the master's own steps, in tiers; stored lanes are not used there;
 *   - every other pipeline, at its Steps level only: its steps, the modules recorded as carrying them, every record a
 *     node lane places in a listed lane, and every lane's head;
 *   - at every level, a step of another pipeline that one of those records links to, in an area headed by that pipeline,
 *     and the pipeline itself, as the area's head.
 * Every record an area is headed by is among the drawn records, made like any other, because the drawing draws an area's
 * head from its records and cannot draw a head that is not there.
 *
 * THE MODULES JOINED TO THE MASTER'S BOXES, by the decision on the master's Boxes level with no lanes stored: each module
 * joined by a `feeds` link, in either direction, to a drawn box, and then each module joined by a `feeds` link to a
 * module drawn so, until no more are found. Each is drawn as any module is. A module that a box's `feeds` link leads to
 * is in a column beside the right of the row of the first such box, in the big map's order. A row has one column at
 * most, its modules in the order of their first boxes, then by title. Every other such module is in one row above the
 * first step's row, in the order of the `feeds` links among them, then by title; where those links go round in a ring,
 * the first of the modules left, by title, comes next. Neither area has a heading, and nothing is stored. A master with
 * no module joined to its boxes so draws the areas it drew before.
 */
import { readTheBigMap, type TheBigMap } from '@shared/big-map-reading.ts'
import { BLOCK_KIND, blockIdsOf, carriesBlock, carriesOf as carriedDataOf, type BlockLinkRow } from '@shared/blocks.ts'
import { listJoined, t, type WordKey, type WordValues } from '@shared/i18n.ts'
import { listedLaneNames, type LaneIntent, type NodeIntent } from '@shared/presentation.ts'
import type { PanelRecord } from '@shared/types.ts'
import { kindWord, linkWord } from '@shared/words.ts'
import { carriedWords, readPipeline, stepNumber, type FlowStep, type PipelineReading } from '../../PipelineFlow.tsx'
import { hrefOf, pipelinePath, recordPath } from '../../router.tsx'
import { stageInAPipeline } from '../../../lib/gate-stage.ts'
import type { StoredIntent } from '../Edit.tsx'
import { blockLinkRows, thePackageStateOn, type GraphInput, type GraphLink } from '../model.ts'
import type { DrawnLink, DrawnRecord, LaneArea, LanesInput, LanesTree } from './tree.ts'

/** What `loadPage` loaded, as far as this reading looks. */
export interface LoadedForLanes {
  records: readonly PanelRecord[]
  links: readonly GraphLink[]
  /** What moves along each link, by link id. `undefined` is nobody said. */
  linkCarries: ReadonlyMap<string, string | null | undefined>
}

export interface LanesReading {
  input: LanesInput
  /**
   * What a reader needs to trust the drawing, one sentence each, for the page's body: a count a card cannot show, and a
   * gate that cannot be read on a line that is drawn.
   */
  said: string[]
  /**
   * What the drawing could not draw or does not use, one sentence each with the word key that writes it, for the
   * developer view only (16 November 2026). None of them means that a read failed: `loadPage` reads every record these
   * name, or the whole page says it could not load.
   */
  toDevelopers: { key: WordKey; words: string }[]
}

/** The page's links as the block reader takes them, with what each carries. */
function blockLinksOf(loaded: LoadedForLanes): BlockLinkRow[] {
  return blockLinkRows(loaded.links).map((row) => {
    const carries = loaded.linkCarries.get(row.id)
    return carries === undefined ? row : { ...row, carries }
  })
}

/** Every pipeline the page loaded, read by the page's own reader, in the order the page lists them. */
export function readEveryPipeline(loaded: LoadedForLanes): PipelineReading[] {
  const links = blockLinksOf(loaded)
  return loaded.records.filter((record) => record.kind === 'pipeline').map((record) => readPipeline(record, loaded.records, links))
}

/** The master's big map, read from what the page loaded. */
export function readTheMastersMap(master: PanelRecord, loaded: LoadedForLanes): TheBigMap {
  const records = new Map(loaded.records.map((record) => [record.id, record]))
  const links = loaded.links.map((link) => ({ id: link.linkId, fromId: link.fromId, toId: link.toId, type: link.type, carries: loaded.linkCarries.get(link.linkId) }))
  return readTheBigMap(master, records, links)
}

/**
 * Where an item sits among the items beside it. A stored `order` comes first, low first, and an item with none comes
 * after every item with one. Then lanes in their listed order, the drawn pipeline's steps in stored order, the boxes in
 * the big map's order, and every other record by title, then id.
 */
interface Place {
  order: number | undefined
  group: 0 | 1 | 2 | 3
  n: number
  title: string
  id: string
}

function byPlace(a: Place, b: Place): number {
  if (a.order !== b.order) {
    if (a.order === undefined) return 1
    if (b.order === undefined) return -1
    return a.order - b.order
  }
  return a.group - b.group || a.n - b.n || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
}

/** A record's stored state, read as the canvas reads it: the trimmed word, or null. */
function stateOf(record: PanelRecord): string | null {
  const data = record.data as unknown
  const state = typeof data === 'object' && data !== null ? (data as Record<string, unknown>)['state'] : undefined
  return typeof state === 'string' && state.trim() !== '' ? state.trim() : null
}

const areaOf = (key: string, heading: LaneArea['heading'], arrange: LaneArea['arrange'], items: string[]): LaneArea => ({
  key,
  heading,
  arrange,
  columns: null,
  beside: null,
  tint: null,
  items: items.map((record) => ({ record })),
})

/**
 * The drawing's input for one pipeline at one level, and the sentences for what it could not draw.
 *
 * `stored` is the intent `presentation.read` answered for the pipeline's scope, or null when it could not be read; then
 * the drawing is the one for a scope with no lanes, and the page says the intent could not be read. The level counts on
 * the master only: every other pipeline has its Steps level alone. `packages` are the packages the page read: a step that
 * exactly one of them names says that package's state, and every other step says its own.
 */
export function lanesInputFor(
  loaded: LoadedForLanes,
  masterId: string | null,
  pipeline: PanelRecord,
  level: LanesTree['level'],
  stored: StoredIntent | null,
  packages?: GraphInput['packages'],
): LanesReading {
  const said: string[] = []
  const toDevelopers: LanesReading['toDevelopers'] = []
  /** A sentence for the developer view only, kept with its key. */
  const tell = (key: WordKey, values: WordValues): void => {
    toDevelopers.push({ key, words: t(key, values) })
  }
  const byId = new Map(loaded.records.map((record) => [record.id, record]))
  const pipelines = loaded.records.filter((record) => record.kind === 'pipeline')
  const readings = readEveryPipeline(loaded)
  const readingById = new Map(readings.map((reading) => [reading.record.id, reading]))
  const own = readingById.get(pipeline.id)
  if (own === undefined) throw new Error(`The pipeline ${pipeline.id} is not among the records the page loaded, so its drawing cannot be read.`)
  const rows = blockLinksOf(loaded)

  const isMaster = pipeline.id === masterId
  const atBoxes = isMaster && level === 'boxes'
  const lanesUsed = !isMaster || atBoxes
  const lanes: readonly LaneIntent[] = lanesUsed ? (stored?.intent.lanes ?? []) : []
  const listed = listedLaneNames(lanes)
  const nodes: Readonly<Record<string, NodeIntent>> = lanesUsed ? (stored?.intent.nodes ?? {}) : {}

  // Which pipelines list each step, by their stored ids, in the page's order; and each readable step's reading under the
  // first pipeline that lists it.
  const listedBy = new Map<string, PanelRecord[]>()
  for (const one of pipelines) {
    for (const id of new Set(blockIdsOf(one))) listedBy.set(id, [...(listedBy.get(id) ?? []), one])
  }
  const ownStep = new Map(own.steps.map((step, index) => [step.id, { step, index }]))
  const firstReading = new Map<string, FlowStep>()
  for (const reading of readings) for (const step of reading.steps) if (!firstReading.has(step.id)) firstReading.set(step.id, step)
  const readingOf = (id: string): FlowStep | undefined => ownStep.get(id)?.step ?? firstReading.get(id)

  const ofAnotherPipeline = (id: string): boolean => {
    const listers = listedBy.get(id) ?? []
    return listers.length > 0 && !listers.some((one) => one.id === pipeline.id)
  }

  /** The pipelines hung on a step, each once. */
  const hungOn = (step: FlowStep): string[] => [...new Set((step.hung ?? []).map((one) => one.id))]

  /** Where a card's title leads, by the four rules of the page's decision. A box's rule is applied where the box is drawn. */
  const hrefFor = (record: PanelRecord): string => {
    const step = readingOf(record.id)
    if (step !== undefined) {
      const hung = hungOn(step)
      if (hung.length === 1) return hrefOf(pipelinePath(hung[0]!))
      const listers = listedBy.get(record.id) ?? []
      if (ofAnotherPipeline(record.id) && listers.length === 1) return hrefOf(pipelinePath(listers[0]!.id))
    }
    return hrefOf(recordPath(record.id, record.kind))
  }

  const drawn = new Map<string, { record: DrawnRecord; place: Place }>()
  const titleOf = (id: string): string => drawn.get(id)?.record.title ?? byId.get(id)?.title ?? t('g7b.missingRecord')

  /** A card's counts, by its role, under the title it is drawn with. Called once for each drawn record. */
  const countsOf = (record: PanelRecord, role: DrawnRecord['role'], title: string): DrawnRecord['counts'] => {
    const step = readingOf(record.id)
    return {
      carries: role === 'module' ? carriesOf(record, title) : null,
      carriedBy: role === 'step' && step !== undefined ? carriedByOf(step, title) : null,
      holds: role !== 'module' && step !== undefined ? holdsOf(step, title) : null,
    }
  }

  /**
   * How many of the drawn pipeline's steps a module carries. A step the pipeline lists that this page could not read
   * might be one of them, so a module linked as carrying one has no count, and a sentence says so. The steps of other
   * pipelines it carries are counted once every record is drawn, below.
   */
  const carriesOf = (module: PanelRecord, title: string): DrawnRecord['counts']['carries'] => {
    const unread = own.stepProblems.some((problem) => rows.some((row) => row.fromId === module.id && carriesBlock(row, problem.blockId, module)))
    if (unread) {
      said.push(t('lanesInput.carriesUnknown', { record: title }))
      return null
    }
    return { thisPipeline: new Set(own.steps.filter((one) => one.carriers.some((carrier) => carrier.moduleId === module.id)).map((one) => one.id)).size, otherPipelines: 0 }
  }

  /**
   * How many different modules carry a step. A carrier whose record this page did not load may not be a module, so a
   * step with one has no count, and a sentence says so.
   */
  const carriedByOf = (step: FlowStep, title: string): number | null => {
    if (step.carriers.some((carrier) => carrier.module === null)) {
      said.push(t('lanesInput.carriedByUnknown', { record: title }))
      return null
    }
    return new Set(step.carriers.map((carrier) => carrier.moduleId)).size
  }

  /**
   * How many different steps the pipelines hung on a step or box list together, each step once: what the card itself
   * holds, never what holds it. Null when no pipeline is hung on it. A hung pipeline read with no step gives 0. A hung
   * pipeline that lists a step this page could not read leaves the card with no count, and a sentence names it.
   */
  const holdsOf = (step: FlowStep, title: string): number | null => {
    const hung = hungOn(step).map((id) => {
      const reading = readingById.get(id)
      if (reading === undefined) throw new Error(`The pipeline ${id}, hung on ${step.id}, is not among the pipelines the page read.`)
      return reading
    })
    if (hung.length === 0) return null
    const unread = hung.filter((reading) => reading.stepProblems.length > 0)
    if (unread.length > 0) {
      said.push(t('lanesInput.holdsUnread', { record: title, pipelines: listJoined(unread.map((reading) => `“${reading.record.title}”`)) }))
      return null
    }
    return new Set(hung.flatMap((reading) => reading.steps.map((one) => one.id))).size
  }

  /** A record that is not a box: a step of a pipeline, a module, or anything else. */
  const draw = (record: PanelRecord): void => {
    if (drawn.has(record.id)) return
    const step = readingOf(record.id)
    const mine = ownStep.get(record.id)
    const role: DrawnRecord['role'] = record.kind === 'module' ? 'module' : step !== undefined ? 'step' : 'box'
    const title = step?.name ?? record.title
    drawn.set(record.id, {
      record: {
        id: record.id,
        kind: record.kind,
        title,
        detail: { summary: record.summary, shortForms: record.data.shortForms },
        role,
        state: step?.state ?? stateOf(record),
        ...(role === 'step' ? thePackageStateOn(packages, record.id) : {}),
        number: mine !== undefined && !atBoxes ? stepNumber(mine.index) : null,
        badges: [],
        counts: countsOf(record, role, title),
        href: hrefFor(record),
      },
      place: { order: undefined, group: mine !== undefined ? 1 : 3, n: mine?.index ?? 0, title, id: record.id },
    })
  }

  // The modules joined to the master's boxes, as the file's head says: the row above the first step's row, and the column
  // beside the right of a row, by the row's key. Filled on the master's Boxes level with no lanes listed, and only there.
  const joinedOnTop: string[] = []
  const joinedBeside = new Map<string, string[]>()
  /** Draws the modules joined to the map's drawn boxes by `feeds` links, and says where each goes. */
  const drawTheJoinedModules = (map: TheBigMap): void => {
    const feeds = loaded.links.filter((link) => link.type === 'feeds' && !link.broken && link.fromId !== link.toId)
    const isAModule = (id: string): boolean => byId.get(id)?.kind === 'module'
    const boxAt = new Map(map.boxes.flatMap((box, n) => (drawn.has(box.id) ? [[box.id, n] as const] : [])))
    const joined = new Set<string>()
    for (const link of feeds) {
      if (boxAt.has(link.fromId) && isAModule(link.toId)) joined.add(link.toId)
      if (boxAt.has(link.toId) && isAModule(link.fromId)) joined.add(link.fromId)
    }
    // Then each module joined to one of those, until no more are found.
    for (let size = -1; size !== joined.size; ) {
      size = joined.size
      for (const link of feeds) {
        if (joined.has(link.fromId) && isAModule(link.toId)) joined.add(link.toId)
        if (joined.has(link.toId) && isAModule(link.fromId)) joined.add(link.fromId)
      }
    }
    const byTitle = (a: string, b: string): number => byId.get(a)!.title.localeCompare(byId.get(b)!.title) || a.localeCompare(b)

    // A module a box's feeds link leads to goes beside the row of the first such box, in the big map's order.
    const firstBox = new Map<string, number>()
    for (const link of feeds) {
      const n = boxAt.get(link.fromId)
      if (n === undefined || !joined.has(link.toId)) continue
      if (n < (firstBox.get(link.toId) ?? Infinity)) firstBox.set(link.toId, n)
    }
    for (const [id, n] of [...firstBox].sort(([a, atA], [b, atB]) => atA - atB || byTitle(a, b))) {
      const box = map.boxes[n]!
      const row = map.blocks.find((block) => block.place === box.block)
      if (row === undefined) throw new Error(`The box ${box.id} is in no row of the master's map, so the module ${id} it feeds has no row to go beside.`)
      joinedBeside.set(row.id, [...(joinedBeside.get(row.id) ?? []), id])
    }

    // Every other one goes in the row on top, along the feeds links among them, then by title. When each module left is
    // fed by another one left, the links go round in a ring, and the first left by title comes next.
    const onTop = [...joined].filter((id) => !firstBox.has(id)).sort(byTitle)
    const among = feeds.filter((link) => onTop.includes(link.fromId) && onTop.includes(link.toId))
    while (joinedOnTop.length < onTop.length) {
      const left = onTop.filter((id) => !joinedOnTop.includes(id))
      const free = left.find((id) => !among.some((link) => link.toId === id && left.includes(link.fromId)))
      joinedOnTop.push(free ?? left[0]!)
    }

    for (const id of joined) draw(byId.get(id)!)
  }

  // ---------------------------------------------------------------- the drawing's own records
  const map = atBoxes ? readTheMastersMap(pipeline, loaded) : null
  const layered = map !== null && listed === null && map.boxes.some((box) => box.tier !== null)
  if (map !== null) {
    map.boxes.forEach((box, n) => {
      const record = byId.get(box.id)
      if (record === undefined) return
      const listers = listedBy.get(box.id) ?? []
      drawn.set(box.id, {
        record: {
          id: box.id,
          kind: record.kind,
          title: box.name,
          detail: { summary: record.summary, shortForms: record.data.shortForms },
          role: 'box',
          state: stateOf(record),
          number: null,
          badges: map.blocks
            .filter((block) => block.pipelines.some((one) => listers.some((lister) => lister.id === one.id)))
            .map((block) => ({ text: t('bigMap.place', { n: block.place }), tone: block.place })),
          counts: countsOf(record, 'box', box.name),
          href: hrefOf(pipelinePath(box.pipeline.id)),
        },
        place: { order: undefined, group: 2, n, title: box.name, id: box.id },
      })
    })
    // With no lanes listed, each master step heads the row of its boxes, so each is drawn, as that row's head; and the
    // modules joined to the boxes by feeds links are drawn, as the file's head says.
    if (listed === null) {
      if (!layered) for (const block of map.blocks) draw(byId.get(block.id)!)
      drawTheJoinedModules(map)
    }
  } else {
    for (const step of own.steps) draw(step.record)
    if (!isMaster) {
      for (const step of own.steps) for (const carrier of step.carriers) if (carrier.module !== null) draw(carrier.module)
    }
  }

  if (listed !== null) {
    for (const [id, node] of Object.entries(nodes)) {
      if (node.lane === undefined || !listed.includes(node.lane)) continue
      const record = byId.get(id)
      if (record === undefined) tell('lanesInput.placedNotLoaded', { lane: node.lane })
      else draw(record)
    }
    for (const lane of lanes) {
      if (lane.head === undefined) continue
      const record = byId.get(lane.head)
      if (record === undefined) tell('lanesInput.headNotLoaded', { lane: lane.name })
      else draw(record)
    }
  } else if (lanesUsed && stored !== null) {
    for (const [id, node] of Object.entries(nodes)) {
      if (node.lane !== undefined) tell('lanesInput.oldNodeLane', { record: titleOf(id), lane: node.lane })
    }
  }
  // What the stored intent holds that this drawing never reads, at any level: one sentence naming each kind stored.
  if (stored !== null) {
    const hints = Object.values(stored.intent.nodes ?? {})
    const unused = [
      stored.intent.direction !== undefined ? t('lanesInput.unused.direction') : null,
      hints.some((node) => node.role !== undefined) ? t('lanesInput.unused.room') : null,
      hints.some((node) => node.emphasis !== undefined) ? t('lanesInput.unused.emphasis') : null,
      hints.some((node) => node.collapsed !== undefined) ? t('lanesInput.unused.folded') : null,
      hints.some((node) => node.near !== undefined) ? t('lanesInput.unused.near') : null,
      hints.some((node) => node.x !== undefined || node.y !== undefined) ? t('lanesInput.unused.moved') : null,
    ].filter((word) => word !== null)
    if (unused.length > 0) tell('lanesInput.unusedHints', { which: listJoined(unused) })
  }
  // A stored order places a record among the items of its lane, so it counts only where lanes are listed.
  if (listed !== null) for (const [id, entry] of drawn) entry.place.order = nodes[id]?.order

  // ---------------------------------------------------------------- other pipelines' steps a drawn record links to
  const ownIds = new Set(drawn.keys())
  const elsewhere = new Map<string, string[]>()
  for (const link of loaded.links) {
    if (ownIds.has(link.fromId) === ownIds.has(link.toId) || link.broken) continue
    const far = ownIds.has(link.fromId) ? link.toId : link.fromId
    const step = firstReading.get(far)
    if (step === undefined || !ofAnotherPipeline(far) || drawn.has(far) || layered && map!.blocks.some((block) => block.id === far)) continue
    const listers = listedBy.get(far)!
    draw(step.record)
    elsewhere.set(listers[0]!.id, [...(elsewhere.get(listers[0]!.id) ?? []), far])
    if (listers.length > 1) tell('lanesInput.stepUnderFirst', { step: step.name, count: listers.length, pipeline: listers[0]!.title })
  }
  // Each such area is headed by its pipeline, so that pipeline is drawn too, as the area's head.
  for (const id of elsewhere.keys()) draw(byId.get(id)!)
  // A module's carries lines to the steps of other pipelines are drawn too, and a selection of its card lights them, so
  // its card counts those steps as well. Each one it carries is drawn by now, by the loop above.
  for (const entry of drawn.values()) {
    const carries = entry.record.counts.carries
    if (carries === null) continue
    const theirs = [...drawn.keys()].filter((id) => ofAnotherPipeline(id) && readingOf(id)?.carriers.some((carrier) => carrier.moduleId === entry.record.id) === true)
    entry.record.counts = { ...entry.record.counts, carries: { ...carries, otherPipelines: theirs.length } }
  }

  // ---------------------------------------------------------------- the links
  const links: DrawnLink[] = []
  // A partial gate's reach is worked out once, here, for every line that words the gate, as model.ts works it out for
  // the old graph: a step of this pipeline by its number and title, at every level.
  const isABlock = (id: string): boolean => byId.get(id)?.kind === BLOCK_KIND
  /**
   * A PART_OF LINK FROM A PIPELINE TO A STEP WHOSE TITLE LEADS TO THAT PIPELINE IS DRAWN BY THAT TITLE (16 November
   * 2026): pressing the step opens the pipeline, so the link gives no line and no sentence. That holds where the step is
   * drawn with that title. On a page that does not draw the step, it holds when the title this page would give the
   * step leads to the pipeline. A block pipeline's link to its block is one: the block's title leads to it, on the
   * master at both levels, so the link says nothing on any page.
   */
  const drawnByATitle = (link: GraphLink): boolean => {
    if (link.type !== 'part_of' || byId.get(link.fromId)?.kind !== 'pipeline') return false
    const step = byId.get(link.toId)
    if (step === undefined) return false
    const leadsThere = hrefOf(pipelinePath(link.fromId))
    const shown = drawn.get(step.id)
    if (shown !== undefined) return shown.record.href === leadsThere
    return hrefFor(step) === leadsThere
  }
  loaded.links.forEach((link, at) => {
    if (drawnByATitle(link)) return
    const row = rows[at]!
    const fromIn = drawn.has(link.fromId)
    const toIn = drawn.has(link.toId)
    const word = linkWord(link.type, 'forward').text
    if (fromIn && toIn) {
      const stage = row.gate === 'partial' ? stageInAPipeline(row.upTo ?? undefined, own.steps, stepNumber, isABlock).words : undefined
      links.push({ id: row.id, type: row.type, from: row.fromId, to: row.toId, carries: carriedWords(carriedDataOf(row.carries)), gate: row.gate, upTo: row.upTo, stage, inferred: row.inferred })
      if (link.gate.at === 'unreadable') {
        said.push(t('lanesInput.gateUnreadable', { link: word, from: titleOf(link.fromId), to: titleOf(link.toId), problem: link.gate.problem }))
      }
      return
    }
    // A link of the pipeline record itself is this drawing's, but the pipeline has no card here, so the link is said
    // with the pipeline as its near end. A link with no end among the drawing's own records may still have one drawn
    // here: another pipeline's step drawn in that pipeline's area, or the pipeline heading the area. It belongs to that
    // pipeline's drawing, and it is said with that end as its near end. A link with no end drawn here is not said.
    const ofThePipeline = link.fromId === pipeline.id || link.toId === pipeline.id
    const near = ownIds.has(link.fromId) ? link.fromId : ownIds.has(link.toId) ? link.toId : ofThePipeline ? pipeline.id : fromIn ? link.fromId : toIn ? link.toId : null
    if (near === null) return
    const far = byId.get(near === link.fromId ? link.toId : link.fromId)
    const ends = { link: word, from: titleOf(link.fromId), to: titleOf(link.toId) }
    if (link.broken) tell('lanesInput.linkBroken', { link: word, drawn: titleOf(near) })
    else if (far === undefined) tell('lanesInput.linkFarNotLoaded', { link: word, drawn: titleOf(near) })
    else if (near === pipeline.id && !drawn.has(pipeline.id)) tell('lanesInput.ownLinkNotDrawn', ends)
    else if (ownIds.has(near)) tell('lanesInput.linkNotDrawn', { ...ends, far: far.title, kind: kindWord(far.kind).text })
    else if (elsewhere.has(near)) tell('lanesInput.linkOfAnAreasPipeline', { ...ends, pipeline: titleOf(near), far: far.title, kind: kindWord(far.kind).text })
    else {
      const area = [...elsewhere].find(([, steps]) => steps.includes(near))
      if (area === undefined) throw new Error(`${near} is drawn, but it is neither one of the drawing's own records nor in another pipeline's area.`)
      // Of the pipelines that list both ends, the one whose area holds the near end comes first, as it is listed first.
      const both = (listedBy.get(near) ?? []).find((one) => (listedBy.get(far.id) ?? []).includes(one))
      if (both !== undefined) tell('lanesInput.linkOfAnotherPipeline', { ...ends, pipeline: titleOf(both.id) })
      else tell('lanesInput.linkOfAnotherPipelinesStep', { ...ends, near: titleOf(near), pipeline: titleOf(area[0]), far: far.title, kind: kindWord(far.kind).text })
    }
  })

  // ---------------------------------------------------------------- the tree
  const placed = new Set<string>()
  const sorted = (ids: string[]): string[] => ids.map((id) => drawn.get(id)!).sort((a, b) => byPlace(a.place, b.place)).map((entry) => entry.record.id)
  let areas: LaneArea[]
  if (listed !== null) {
    const byName = new Map<string, { area: LaneArea; place: Place; held: { item: LaneArea['items'][number]; place: Place }[] }>()
    lanes.forEach((lane, n) => {
      const head = lane.head !== undefined && drawn.has(lane.head) ? lane.head : null
      byName.set(lane.name, {
        area: {
          key: lane.name,
          heading: { text: lane.name, record: head },
          arrange: lane.arrange,
          columns: lane.columns ?? null,
          beside: lane.beside !== undefined && lane.of !== undefined ? { side: lane.beside, of: lane.of } : null,
          tint: lane.tint ?? null,
          items: [],
        },
        place: { order: lane.order, group: 0, n, title: lane.name, id: lane.name },
        held: [],
      })
    })
    const top: { area: LaneArea; place: Place }[] = []
    for (const lane of lanes) {
      const entry = byName.get(lane.name)!
      if (lane.in === undefined) {
        top.push(entry)
        continue
      }
      const parent = byName.get(lane.in)
      if (parent === undefined) throw new Error(`The lane “${lane.name}” is in “${lane.in}”, which the scope does not list.`)
      parent.held.push({ item: { area: entry.area }, place: entry.place })
    }
    for (const [id, entry] of drawn) {
      const lane = nodes[id]?.lane
      const holder = lane === undefined ? undefined : byName.get(lane)
      if (holder === undefined) continue
      holder.held.push({ item: { record: id }, place: entry.place })
      placed.add(id)
    }
    for (const entry of byName.values()) entry.area.items = entry.held.sort((a, b) => byPlace(a.place, b.place)).map((one) => one.item)
    areas = top.sort((a, b) => byPlace(a.place, b.place)).map((one) => one.area)
  } else if (map !== null && layered) {
    const tier = (name: 'ways-in' | 'gate' | 'services' | 'data' | 'hosting' | 'runtime' | 'stores', arrange: LaneArea['arrange']): LaneArea | null => {
      const boxes = map.boxes.filter((box) => box.tier === name && drawn.has(box.id)).map((box) => box.id)
      if (!boxes.length) return null
      const area = areaOf(name, { text: t(`bigMap.tier.${name}`), record: null }, arrange, boxes)
      if (name === 'services') area.columns = 4
      return area
    }
    const people = joinedOnTop.length ? areaOf('people', { text: t('lanes.people'), record: null }, 'row', joinedOnTop) : null
    const ways = tier('ways-in', 'row')
    const inside = [tier('gate', 'row'), tier('services', 'grid'), tier('data', 'row')].filter((area): area is LaneArea => area !== null)
    const api: LaneArea | null = inside.length ? { ...areaOf('api-server', { text: t('lanes.apiServer'), record: null }, 'stack', []), frame: 'solid', items: inside.map((area) => ({ area })) } : null
    const hosting = tier('hosting', 'stack')
    const runtime = tier('runtime', 'stack')
    const outsideIds = [...joinedBeside.values()].flat()
    const outside: LaneArea | null = outsideIds.length ? { ...areaOf('outside', { text: t('lanes.outside'), record: null }, 'stack', outsideIds), frame: 'dashed' as const } : null
    if (api && hosting) hosting.beside = { side: 'left', of: api.key }
    if (api && runtime) runtime.beside = { side: 'right', of: api.key }
    if (api && outside) outside.beside = { side: 'right', of: runtime?.key ?? api.key }
    if (!api) for (const area of [hosting, runtime, outside]) if (area) area.arrange = 'row'
    areas = [people, ways, api, hosting, runtime, outside, tier('stores', 'row')].filter((area): area is LaneArea => area !== null)
  } else if (map !== null) {
    // Each master step's row of its boxes, headed by the step, in the map's order. Above them, the row of the joined
    // modules no box feeds; beside the right of a row, the column of the joined modules its boxes feed first. Neither
    // has a heading, and neither is there with no module in it.
    const onTop = joinedOnTop.length > 0 ? [areaOf('joined modules', null, 'row', joinedOnTop)] : []
    areas = [
      ...onTop,
      ...map.blocks.flatMap((block): LaneArea[] => {
        const row = areaOf(block.id, { text: block.title, record: block.id }, 'row', map.boxes.filter((box) => box.block === block.place && drawn.has(box.id)).map((box) => box.id))
        const column = joinedBeside.get(block.id)
        if (column === undefined) return [row]
        return [row, { ...areaOf(`joined modules beside ${block.id}`, null, 'stack', column), beside: { side: 'right', of: row.key } }]
      }),
    ]
  } else {
    const steps = areaOf('steps', null, 'tiers', own.steps.map((step) => step.id))
    areas = [steps]
    if (!isMaster) {
      const modules = [...drawn.values()].filter((entry) => entry.record.role === 'module' && ownIds.has(entry.record.id)).map((entry) => entry.record.id)
      if (modules.length > 0) areas.push({ ...areaOf('modules', { text: t('lanesInput.modulesArea'), record: null }, 'stack', sorted(modules)), beside: { side: 'right', of: steps.key } })
    }
  }
  // A record at an area's head is placed there, as much as one among its items.
  const held = (area: LaneArea): void => {
    if (area.heading?.record) placed.add(area.heading.record)
    for (const item of area.items) {
      if ('record' in item) placed.add(item.record)
      else held(item.area)
    }
  }
  areas.forEach(held)

  for (const one of pipelines) {
    const ids = elsewhere.get(one.id)
    if (ids === undefined) continue
    const order = new Map(blockIdsOf(one).map((id, n) => [id, n]))
    const area = areaOf(one.id, { text: one.title, record: one.id }, 'row', [...ids].sort((a, b) => order.get(a)! - order.get(b)!))
    areas.push(area)
    held(area)
  }

  return {
    input: {
      pipeline: { id: pipeline.id, title: pipeline.title },
      ...(layered && map !== null ? { blockLegend: map.blocks.map((block) => ({ id: block.id, title: block.title, place: block.place, pipelines: block.pipelines.map((one) => ({ title: one.title, href: hrefOf(pipelinePath(one.id)) })) })) } : {}),
      ...(map !== null && listed === null && !layered ? { byStep: true } : {}),
      records: [...new Set([...sorted([...ownIds]), ...[...elsewhere].flatMap(([head, ids]) => [head, ...ids])])].map((id) => drawn.get(id)!.record),
      links,
      tree: {
        level: atBoxes ? 'boxes' : 'steps',
        direction: 'down',
        areas,
        notPlaced: sorted([...ownIds].filter((id) => !placed.has(id))),
      },
    },
    said,
    toDevelopers,
  }
}
