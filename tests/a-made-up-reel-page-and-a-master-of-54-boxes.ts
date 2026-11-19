// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO MADE-UP DRAWINGS, AND THE ONE WAY EITHER IS PUT INTO AN OFFICE: a reel page, and a master of 54 boxes.
 *
 * THE FILES. Each says how it was made, and neither holds a record id: records are named by keys.
 *   - tests/fixtures/a-made-up-reel-page-with-other-pipelines-steps.json: a pipeline at its Steps level with 12 steps
 *     and 8 modules in 6 areas, and the 20 steps of 5 other pipelines that its modules link to, which the page draws in
 *     an area headed by each pipeline. 66 links, 34 of them implements links drawn only for a selection.
 *   - tests/fixtures/a-made-up-master-of-54-boxes-and-60-links.json: a master at its Boxes level with 13 steps, a block
 *     pipeline hung on each, 54 boxes, 15 modules (8 of them placed, so drawn) and 60 links, in 8 areas.
 *
 * WHO CALLS THIS. tests/a-made-up-reel-page-and-master-opened-fresh.ts, for the two test files its head names, each in
 * its own test office; and a script outside the tests that puts either drawing into a throwaway office. Nothing here imports vitest, so a script run with tsx can import it. Such a script:
 *   1. sets MOLE_OFFICE_DB to a new file, imports src/server/db/client.ts, and runs migrateInPlace from
 *      src/server/db/migrate.ts on that client's sqlite with the drizzle folder;
 *   2. calls createWorkspace from src/server/lib/workspaces.ts, then storeTheReelPage or storeTheMasterOf54Boxes
 *      below, with src/server/lib/records.ts, src/server/lib/blocks.ts, the client and anOfficeId from
 *      src/server/db/ids.ts;
 *   3. starts the office on that file and, as the person, for the master PUTs /api/projects/<workspace>/master-pipeline
 *      with { pipeline: master }, and for each entry of `areas` PUTs /api/presentation/<pipelineScope(pipeline)> with
 *      { intent }.
 *
 * HOW IT IS STORED, as tests/the-lanes-drawing-crosses-no-line-at-rest.test.ts stores its file: every record and link
 * through the record functions the doors call (createRecord, addBlock and createLink), as the person, except a feeds
 * link with a module at one end. The office's door has refused those since 13 November (checkLinkKinds in
 * src/server/lib/records.ts), and an office may still hold them, so they are written straight into the links table
 * with the columns createLink writes. An implements link of the reel page is stored with the inferred flag, which
 * createLink takes and the links door does not. A box with no state is stored as to do, since the office stores no
 * step without one.
 *
 * THE ORDER OF THE OTHER PIPELINES' AREAS. The page draws them in the order the records list gives the pipelines: newest
 * change first, then by id. Records stored in one go share their time, so that order would be the order of ids the office
 * makes up at random, and the drawing would change from one run to the next. So each other pipeline's updated_at is set
 * straight in the records table, one second apart and the first newest, from OTHER_PIPELINES_CHANGED, and the areas
 * come in the file's order, which is the order on the page the file was read from.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { TestDb } from './helpers.ts'

export interface FileLink {
  type: string
  from: string
  to: string
  gate: 'hard' | 'partial' | null
  upTo?: string
  inferred: boolean
  carries?: string
}

export interface FilePlacement {
  direction?: string
  lanes: { name: string; head?: string }[]
  nodes: Record<string, { lane: string; order: number }>
}

interface AStep {
  key: string
  title: string
  state: string | null
}

export interface TheReelPage {
  pipeline: { key: string; title: string }
  steps: AStep[]
  modules: { key: string; title: string }[]
  others: { key: string; title: string; steps: AStep[] }[]
  links: FileLink[]
  placement: FilePlacement
}

export interface TheMasterOf54Boxes {
  pipeline: { key: string; title: string }
  steps: AStep[]
  waitsOn: FileLink[]
  blockPipelines: { key: string; title: string; partOf: string; boxes: string[] }[]
  records: { key: string; kind: string; role: string; state: string | null; title: string }[]
  links: FileLink[]
  placement: FilePlacement
}

const read = <T>(name: string): T => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')) as T

export const REEL_PAGE = read<TheReelPage>('a-made-up-reel-page-with-other-pipelines-steps.json')
export const MASTER_OF_54_BOXES = read<TheMasterOf54Boxes>('a-made-up-master-of-54-boxes-and-60-links.json')

/** The record functions and the database a drawing is stored through. */
export type TheDoors = Pick<TestDb, 'api' | 'blocks' | 'client'>

/** What storing a drawing made, for opening it, storing its areas and naming its links. */
export interface Stored {
  /** The pipeline whose page draws it. */
  pipeline: string
  /** The pipeline to set as the workspace's master, or null when none is to be set. */
  master: string | null
  /** Each key's id. */
  id: Record<string, string>
  /** Each link's id, named by its ends' keys and its type. */
  linkNamed: Map<string, string>
  /** The ids of the links in the file's `links` list, in its order: the links the pipeline's page draws. */
  links: string[]
  /**
   * The ids of the records the pipeline's page draws as cards. On the reel page that is every step, its own and the
   * other pipelines', and every module. On the master it is every box, and every module placed in an area; the module
   * that heads an area is drawn as that area's heading.
   */
  cards: string[]
  /** Each pipeline whose areas and places are to be stored, with its intent, every key turned into its record's id. */
  areas: { pipeline: string; intent: Record<string, unknown> }[]
}

/** The local time stamped on each feeds link written the way the office stored one before 13 November. */
const BEFORE_13_NOVEMBER = '2026-11-12 12:00:00'

/** The local time of the newest change to the reel page's first other pipeline. Each one after it is a second older. */
export const OTHER_PIPELINES_CHANGED = '2026-11-12 13:00:00'

function aStore(doors: TheDoors, workspace: string, anOfficeId: () => string) {
  const person = doors.api.HUMAN
  const id: Record<string, string> = {}
  const linkNamed = new Map<string, string>()
  return {
    id,
    linkNamed,
    aPipeline(key: string, title: string): void {
      id[key] = doors.api.createRecord({ kind: 'pipeline', title, workspaceId: workspace, actor: person, data: { blockIds: [] } }).id
    },
    aStep(pipeline: string, step: AStep): void {
      const asked = (step.state ?? 'todo') as Parameters<TestDb['blocks']['addBlock']>[1]['state']
      id[step.key] = doors.blocks.addBlock(id[pipeline]!, { name: step.title, state: asked }, person).block.id
    },
    aModule(key: string, title: string): void {
      const data = { context: 'Made up for a test of how long the drawing takes.' }
      id[key] = doors.api.createRecord({ kind: 'module', title, workspaceId: workspace, actor: person, data }).id
    },
    aPartOf(from: string, to: string): void {
      doors.api.createLink({ fromId: id[from]!, toId: id[to]!, type: 'part_of', actor: person })
    },
    aLink(link: FileLink, modules: ReadonlySet<string>): string {
      let linkId: string
      if (link.type === 'feeds' && (modules.has(link.from) || modules.has(link.to))) {
        linkId = anOfficeId()
        const carries = link.carries === undefined ? null : JSON.stringify([{ out: link.carries }])
        doors.client.sqlite
          .prepare(
            'INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by, created_by_type, carries) ' +
              'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(linkId, workspace, person.id, BEFORE_13_NOVEMBER, BEFORE_13_NOVEMBER, id[link.from]!, id[link.to]!, 'feeds', 0, person.id, 'human', carries)
      } else {
        const gate = link.gate === 'hard' ? { gate: { kind: 'hard' as const } } : link.gate === 'partial' ? { gate: { kind: 'partial' as const, upTo: link.upTo! } } : {}
        const carries = link.carries === undefined ? {} : { carries: [{ out: link.carries }] }
        const type = link.type as Parameters<TestDb['api']['createLink']>[0]['type']
        linkId = doors.api.createLink({ fromId: id[link.from]!, toId: id[link.to]!, type, inferred: link.inferred, ...gate, ...carries, actor: person }).id
      }
      linkNamed.set(linkId, `${link.from} ${link.type} ${link.to}`)
      return linkId
    },
    intentOf(placement: FilePlacement): Record<string, unknown> {
      return {
        ...(placement.direction === undefined ? {} : { direction: placement.direction }),
        lanes: placement.lanes.map((lane) => (lane.head === undefined ? lane : { ...lane, head: id[lane.head]! })),
        nodes: Object.fromEntries(Object.entries(placement.nodes).map(([key, place]) => [id[key]!, place])),
      }
    },
  }
}

/** The reel page's records and links, written into the office's database. Its areas are stored afterwards: see the head. */
export function storeTheReelPage(doors: TheDoors, workspace: string, anOfficeId: () => string): Stored {
  const file = REEL_PAGE
  const store = aStore(doors, workspace, anOfficeId)
  store.aPipeline(file.pipeline.key, file.pipeline.title)
  for (const step of file.steps) store.aStep(file.pipeline.key, step)
  for (const module of file.modules) store.aModule(module.key, module.title)
  for (const other of file.others) {
    store.aPipeline(other.key, other.title)
    for (const step of other.steps) store.aStep(other.key, step)
  }
  const modules = new Set(file.modules.map((module) => module.key))
  const links = file.links.map((link) => store.aLink(link, modules))
  const changed = doors.client.sqlite.prepare("UPDATE records SET updated_at = datetime(?, ?) WHERE id = ?")
  file.others.forEach((other, n) => changed.run(OTHER_PIPELINES_CHANGED, `-${String(n)} seconds`, store.id[other.key]!))
  const pipeline = store.id[file.pipeline.key]!
  const cards = [...file.steps, ...file.modules, ...file.others.flatMap((other) => other.steps)].map((record) => store.id[record.key]!)
  return { pipeline, master: null, id: store.id, linkNamed: store.linkNamed, links, cards, areas: [{ pipeline, intent: store.intentOf(file.placement) }] }
}

/** The master's records and links, written into the office's database. It is set as master and its areas stored afterwards. */
export function storeTheMasterOf54Boxes(doors: TheDoors, workspace: string, anOfficeId: () => string): Stored {
  const file = MASTER_OF_54_BOXES
  const store = aStore(doors, workspace, anOfficeId)
  const records = new Map(file.records.map((record) => [record.key, record]))
  const modules = new Set(file.records.filter((record) => record.kind === 'module').map((record) => record.key))
  store.aPipeline(file.pipeline.key, file.pipeline.title)
  for (const step of file.steps) store.aStep(file.pipeline.key, step)
  for (const link of file.waitsOn) store.aLink(link, modules)
  for (const block of file.blockPipelines) {
    store.aPipeline(block.key, block.title)
    store.aPartOf(block.key, block.partOf)
    for (const box of block.boxes) store.aStep(block.key, { key: box, title: records.get(box)!.title, state: records.get(box)!.state })
  }
  for (const record of file.records) if (record.kind === 'module') store.aModule(record.key, record.title)
  const links = file.links.map((link) => store.aLink(link, modules))
  const pipeline = store.id[file.pipeline.key]!
  const drawn = file.records.filter((record) => record.role === 'box' || (record.kind === 'module' && file.placement.nodes[record.key] !== undefined))
  const cards = drawn.map((record) => store.id[record.key]!)
  return { pipeline, master: pipeline, id: store.id, linkNamed: store.linkNamed, links, cards, areas: [{ pipeline, intent: store.intentOf(file.placement) }] }
}
