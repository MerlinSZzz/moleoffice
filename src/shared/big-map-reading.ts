// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ARCHITECTURE OF A PROJECT, READ FROM ITS MASTER PIPELINE BY PLACE. The architecture records are found by where
 * they are, never by `implements` links.
 *
 *   a block           a step of the master pipeline, in the master's own order; its place is its position, from 0
 *   a block pipeline  a live pipeline with a `part_of` link to a block
 *   a box             a step of a block pipeline; its `tier` says where the big map draws it (src/shared/big-map.ts)
 *   a line            a `feeds` link from one box to another, with what the link says it carries
 *
 * ONE READING FOR THE MAP AND THE DICTIONARY. The big map on the master pipeline's page draws this, and
 * GET /api/map/dictionary answers from it, so the two cannot disagree about which block a box is in. Each caller gives
 * it the records and links it has: the page what it loaded, and the door what it read by id.
 *
 * A block pipeline hung on two blocks is read under each. A step listed by two block pipelines is one box, in the
 * first of them in the order below.
 */
import { MAP_TIERS, type MapTier } from './big-map.ts'
import { blockIdsOf, blockNameIn } from './blocks.ts'
import type { Authority, Relation } from './implementation.ts'
import type { ParticipantRef } from './participants.ts'
import type { TheMasterPipeline } from './project-board.ts'
import type { PanelRecord } from './types.ts'

/** A record the map names, by id and title. */
export interface MapRecord {
  id: string
  title: string
}

/** One block: one step of the master pipeline. */
export interface MapBlock extends MapRecord {
  /** Its position among the master's steps, from 0. The map writes it M0, M1 and on. */
  place: number
  /** The block pipelines hung on it, by title. */
  pipelines: MapRecord[]
}

/** One box: one step of a block pipeline. */
export interface MapBox extends MapRecord {
  /** The step's own name, without its pipeline's title in front. */
  name: string
  /** Where the map draws it, or null when nobody has placed it. */
  tier: MapTier | null
  /** The block pipeline that lists it. */
  pipeline: MapRecord
  /** Its block, by place. */
  block: number
}

/** One line: a `feeds` link from one box to another. */
export interface MapLine {
  id: string
  fromId: string
  toId: string
  /** The link's `carries` column as it was read, or undefined when the caller did not read it. */
  carries: string | null | undefined
}

/** The whole reading. */
export interface TheBigMap {
  blocks: MapBlock[]
  /** Every box, by block place, then by block pipeline, then in the pipeline's own step order. */
  boxes: MapBox[]
  lines: MapLine[]
}

/** The fields of a record this reading looks at. A record the caller has is live: a caller drops the deleted ones. */
export type MapSource = Pick<PanelRecord, 'id' | 'kind' | 'title' | 'data'>

/** The fields of a link this reading looks at. */
export interface MapLink {
  id: string
  fromId: string
  toId: string
  type: string
  carries?: string | null | undefined
}

const byTitleThenId = (a: MapRecord, b: MapRecord): number => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)

function aTier(value: unknown): MapTier | null {
  return (MAP_TIERS as readonly unknown[]).includes(value) ? (value as MapTier) : null
}

/** The blocks of a master pipeline: its live steps, in its order, each with its place. */
export function theBlocksOf(master: MapSource, records: ReadonlyMap<string, MapSource>): { id: string; title: string; place: number }[] {
  const blocks: { id: string; title: string; place: number }[] = []
  for (const id of blockIdsOf(master)) {
    const step = records.get(id)
    if (step === undefined || step.kind !== 'block') continue
    blocks.push({ id: step.id, title: step.title, place: blocks.length })
  }
  return blocks
}

export function readTheBigMap(master: MapSource, records: ReadonlyMap<string, MapSource>, links: readonly MapLink[]): TheBigMap {
  const places = new Map(theBlocksOf(master, records).map((block) => [block.id, block]))
  const hung = new Map<string, MapRecord[]>()
  for (const link of links) {
    if (link.type !== 'part_of' || !places.has(link.toId)) continue
    const pipeline = records.get(link.fromId)
    if (pipeline === undefined || pipeline.kind !== 'pipeline') continue
    const list = hung.get(link.toId) ?? []
    if (!list.some((one) => one.id === pipeline.id)) list.push({ id: pipeline.id, title: pipeline.title })
    hung.set(link.toId, list)
  }

  const blocks: MapBlock[] = []
  const boxes: MapBox[] = []
  const seen = new Set<string>()
  for (const block of places.values()) {
    const pipelines = (hung.get(block.id) ?? []).sort(byTitleThenId)
    blocks.push({ ...block, pipelines })
    for (const pipeline of pipelines) {
      const record = records.get(pipeline.id)
      if (record === undefined) continue
      for (const id of blockIdsOf(record)) {
        const step = records.get(id)
        if (step === undefined || step.kind !== 'block' || seen.has(step.id)) continue
        seen.add(step.id)
        boxes.push({
          id: step.id,
          title: step.title,
          name: blockNameIn(step.title, pipeline.title),
          tier: aTier(step.data['tier']),
          pipeline,
          block: block.place,
        })
      }
    }
  }

  const lines: MapLine[] = links
    .filter((link) => link.type === 'feeds' && seen.has(link.fromId) && seen.has(link.toId))
    .map((link) => ({ id: link.id, fromId: link.fromId, toId: link.toId, carries: link.carries }))
  return { blocks, boxes, lines }
}

// ============================================================================ the dictionary

/**
 * WHAT GET /api/map/dictionary ANSWERS: for a file path or a module, the module, its block and its owning line. The
 * design report tlHlGHIbBBbh, section "The dictionary door". Asked by path, `modules` is every live module of the
 * project with a stated row whose pattern matches the path, in any of the project's repositories. Asked by module, it
 * is that module alone, and `matched` is empty.
 */
export interface MapDictionary {
  asked: { path: string } | { module: string }
  /** The project's master pipeline, as GET /api/projects/:project/master-pipeline reads it. */
  master: TheMasterPipeline
  modules: DictionaryModule[]
  /** Live records of other kinds that state the path as theirs. They are named and not followed to a block. */
  others: (MapRecord & { kind: string })[]
}

export interface DictionaryModule extends MapRecord {
  /** Each stated row of the module that matches the path. */
  matched: { repository: MapRecord; pattern: string; relation: Relation; authority: Authority }[]
  /** The line that owns the module, from its `owner` field, or null: nobody has recorded one. */
  owner: ParticipantRef | null
  /**
   * The boxes of the big map the module `implements`, each with its block pipeline and its block. `[]` means the
   * module is on no block yet. null means the map was not read, because the project's master is unmarked or broken.
   */
  places: DictionaryPlace[] | null
}

export interface DictionaryPlace {
  box: MapRecord & { name: string; tier: MapTier | null }
  pipeline: MapRecord
  block: MapRecord & { place: number }
}

/** Where a module is on the map: the boxes it implements, found in a reading of the map. */
export function thePlacesOf(map: TheBigMap, implemented: ReadonlySet<string>): DictionaryPlace[] {
  return map.boxes
    .filter((box) => implemented.has(box.id))
    .map((box) => {
      const block = map.blocks[box.block]!
      return {
        box: { id: box.id, title: box.title, name: box.name, tier: box.tier },
        pipeline: box.pipeline,
        block: { id: block.id, title: block.title, place: block.place },
      }
    })
}
