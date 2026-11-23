// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO LINE CROSSES ANOTHER AT REST, ON THE MASTER AND ON THE REEL, AT 1440. Wave 13u round 230, PV-2, criterion 2. The
 * drawing is the one that PV-2's page decision puts on a pipeline's page; its areas are stored as PV-2's decision on
 * areas says.
 *
 * THE OFFICE IS A MADE-UP COPY OF THE TWO DRAWINGS PV-2'S STUDY LAID OUT, in
 * tests/fixtures/a-made-up-master-and-reel-in-lanes.json: the master at its Boxes level, with 13 steps, a block
 * pipeline hung on each, 34 boxes, 15 modules and 25 links, in 8 areas; and an ordinary pipeline, the reel, with 12
 * steps, 8 modules and 28 links, in 6 areas. The file says how it was made: every word in it is Latin filler of the
 * same length as the word it replaced, and it holds no record id. Records are named in it by keys, and the office gives
 * them their ids here.
 *
 * HOW IT IS STORED. Every record and link of the file is written into the test's own database before its server
 * starts, through the record functions the doors call (createRecord, addBlock and createLink), as the person. Two
 * kinds of link need that, and are stored as the office stores them:
 *   - the master's 17 feeds links that have a module at one end (4 from a module to a box, 3 between two modules and
 *     10 from a box to a module) are written straight into the links table, the way the office stored such links
 *     before 13 November. Since that day the office stores a feeds link only between two steps (checkLinkKinds in
 *     src/server/lib/records.ts), so its door refuses them. An office may still hold them, and the page draws every
 *     stored link;
 *   - the reel's 12 implements links carry the inferred flag, which the office sets on a link it worked out itself.
 *     The links door takes no such flag; createLink does.
 * Once the server is up, the master is set and each pipeline's areas and places are stored through their doors, as
 * the person, with each key turned into the record's id: the areas are what this test is about.
 *
 * WHAT CANNOT BE STORED AS THE FILE SAYS:
 *   - a box's short line: no stored field holds one;
 *   - one box's want of a state: the file holds one box with none, and the office stores no step without a state, so
 *     that box is stored as to do. The test of a card with no state is in
 *     tests/the-lanes-drawing-cards-say-their-state-and-select.test.ts, on modules.
 *
 * WHAT A CROSSING IS. Each line at rest is read from its data-points, as segments between its points. Two segments of
 * two different links cross when they meet at one point strictly inside both, more than 0.01 drawing units from each
 * segment's ends. Two lines that meet where one ends, or that run together along one straight line, do not cross: those
 * meetings are counted apart and printed, and they fail nothing.
 *
 * WHAT IS PROVED, case by case: on the master at its Boxes level and on the reel, at 1440 by 1000, in the light theme
 * (two cases; where lines cross does not change with the theme),
 *   - the areas of that pipeline were stored;
 *   - no card is selected, at least one link is drawn at rest, and every line at rest names a link drawn at rest;
 *   - every link between two records that are cards on that drawing is named at rest or for a selection;
 *   - no two lines of different links at rest cross. A failure names each crossing by the keys of the file.
 * And on the reel at 1440, light (a fifth case, for criterion 1, because the reel is where inferred links are stored):
 *   - no line at rest is drawn as inferred, since every link drawn at rest is stored as stated;
 *   - each of the 12 implements links is named in data-on-selection under its module's card, and while that card is
 *     selected its line says implements and carries data-inferred="1", and no line of a stated link does.
 *
 * MUTATIONS, wave 13u round 230, each run after a control run of this file at 12cd2330e in which all five cases were
 * green, each file copied first and restored with cp and checked with cmp, each in
 * src/web/components/graph/lanes/engine.ts, line numbers as at 12cd2330e:
 *   - line 1567, the line of an inferred link not marked data-inferred: case 5 red, 1-4 green;
 *   - at the top of pathFor (line 1543), every line sent from its first point through the point opposite it across
 *     (300, 300) and on to its last, `points = [points[0]!, { x: 600 - points[0]!.x, y: 600 - points[0]!.y },
 *     points.at(-1)!]`: cases 1-4 red, with 1,084 crossings on the master and 404 on the reel; case 5 green;
 *   - one that SURVIVED: at the top of pathFor, every line drawn straight from its first point to its last,
 *     `points = [points[0]!, points.at(-1)!]`: all five green. It survives because, on this file's places, the
 *     straight lines cross no more than the routed ones: a separate count from data-points under this mutation found 0
 *     crossings among the master's 25 lines at rest and the reel's 16 (its 4 crossings were among the 19 lines of a
 *     selection, which criterion 2 does not cover). So it makes nothing criterion 2 forbids, and the mutation above is
 *     the one that shows cases 1-4 are not empty.
 *
 * THE REEL'S SHAPE, a criterion of its own (wave 13u round 230, PV-2), in four cases, (i) to (iv). On round
 * 228's data, one pipeline took 161 s to draw. Thirteen of its implements links found no route while their module was
 * selected, and each of them made the drawing work out its whole plan again. The four cases hold a made-up pipeline in
 * that shape. It is built in code in this file, not in the fixture, and holds no record id and no word of the real one:
 *   - a lane of three modules, A, B and C;
 *   - below it, a lane framed by its head, a step of the same pipeline, which none of the thirteen links touches;
 *   - below that, the eleven blocks that another made-up pipeline lists, which the drawing puts in that pipeline's area;
 *   - implements links from A to block 1, from B to blocks 2 to 6, and from C to blocks 7, 8, 9, 10, 3, 11 and 5, so
 *     blocks 3 and 5 each have two;
 *   - two links at rest, neither of them between two cards side by side in one lane;
 *   - one more implements link, from C to step 1, which case (iv) is about. Both cards are above the frame.
 * On the real drawing the layout is 898 units wide and the frame runs from x=8 to x=890. So the frame's clearance of 8
 * units reaches both edges of the layout, and the frame itself does not. The made-up shape keeps those 8 units at any
 * card width. At a pipeline's Steps level the drawing puts its first two rows of areas at the left edge and centres every
 * row after them. The first row here is a lane of two steps with a lane of one step beside it. It is the widest row,
 * and it is 16 units wider than the framed lane of three steps: the gap of 56 between the two lanes, against the
 * frame's two pads of 12 and one more gap of 16. The modules' lane is the second row, and the framed lane the third.
 * Case (i) prints where the frame stands, so each run shows whether the shape still holds. The modules' lane is 632
 * units wide, so it holds A and B on its first line and C on its second, under A. Step 1 is at the left edge of the
 * first row, above A. So the line from C to step 1 can run inside the layout: out of C, past B's right end, up, and
 * back left in the gap between the first two rows. Case (iv) prints that line's points.
 *
 * WHAT IS PROVED for the reel's shape, at 1440 by 1000, light:
 *   - (i) no link is named in data-not-drawn; and for each of A, B and C, each of its implements links is named in
 *     data-on-selection under its card, and has a line that says implements while that card is selected;
 *   - (ii) at rest no card is selected, at least one link is drawn, and no two lines of different links cross, as above;
 *   - (iii) the drawing holds still within 30 s of its page being asked for;
 *   - (iv) the links named in data-on-selection under step 1 are its one link from C; and while step 1 is selected,
 *     that link has a line, and every point of each of its lines lies inside the layout's box, 0 to W across and 0 to
 *     H down. W and H are the width and the height in the style of the layout (.e-world), where (i) reads the width.
 *     The 13 lines of (i) must pass the frame, and (i) still lets them leave the layout.
 * The drawing writes data-drawn-links before it works out any route, and data-not-drawn only once it has chosen a plan.
 * So each case waits for data-not-drawn, for up to 300 s. A slow plan then fails (iii) with its time, and (i) still
 * names the links.
 *
 * THE OLD CODE, at 393df9641 (the code of 0ae3cb286), on 15 November 2026, run before (i) to (iii) were committed:
 * case (i) was red, and data-not-drawn named all 13 implements links. Cases (ii) and (iii) were green: 2 links drawn at
 * rest with no crossing, and the drawing held still 2.4 s and 3.0 s after its page was asked for. The layout was 996
 * units wide and the frame ran from x=8 to x=988. So the made-up shape shows the 13 links with no route, but not the
 * time the real drawing took. Why it is so much faster was not measured.
 * CASE (iv), run on 15 November 2026 before it was committed:
 *   - at 1afed1a0d's code, (iv) was green. The line ran out of C's right side, past B's right end and back left in the
 *     gap between the first two rows: [[308,302.5],[652.5,302.5],[652.5,152.5],[152.5,152.5],[152.5,111.22]], in a
 *     layout 996 by 1116.38. (i) was red as above, with 13 links named as not drawn, and (ii) and (iii) were green;
 *   - at 44ab4e854's code, (iv) was red, and it was the only red case. That commit changes one line of routeAll in
 *     src/web/components/graph/lanes/engine.ts: `const room = before ? 0 :` became `before ? ROUTE_ROOM - CELL :`,
 *     which lets a selection line use 55 units outside the layout. The line then ran out of C's left side to x=-37.5
 *     and back into step 1's left side: [[0,302.5],[-37.5,302.5],[-37.5,67.5],[0,67.5]].
 * MUTATIONS for the reel's shape: for (iv), 44ab4e854's one line, above, is the mutation. On 1afed1a0d's code it turns
 * (iv) red and no other case. For (i) to (iii), none yet. They are run once the Code that turns (i) green is committed.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import {
  aPlaceOnTheCard,
  DRAWING,
  openThePage,
  prepareThePage,
  readTheDrawing,
  storeTheAreas,
  theAreasWereStored,
  theDrawingHoldsStill,
  theDrawingIsDrawn,
  writerFor,
  type Attempt,
  type DrawnPath,
  type Point,
} from './a-made-up-office-drawn-in-lanes.ts'

interface FileLink {
  type: string
  from: string
  to: string
  gate: 'hard' | 'partial' | null
  upTo?: string
  inferred: boolean
  carries?: string
}

interface FileRecord {
  key: string
  kind: string
  role: string
  state: string | null
  title: string
}

interface FilePlacement {
  direction: string
  lanes: { name: string; head?: string }[]
  nodes: Record<string, { lane: string; order: number }>
}

interface TheFile {
  master: {
    pipeline: { key: string; title: string }
    steps: { key: string; title: string; state: string }[]
    waitsOn: FileLink[]
    blockPipelines: { key: string; title: string; partOf: string; boxes: string[] }[]
    records: FileRecord[]
    links: FileLink[]
    placement: FilePlacement
  }
  reel: { pipeline: { key: string; title: string }; records: FileRecord[]; links: FileLink[]; placement: FilePlacement }
}

const FILE = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/a-made-up-master-and-reel-in-lanes.json', import.meta.url)), 'utf8'),
) as TheFile

const PROJECT = { id: 'test-lanes-crossings', title: 'Example office of a master and a reel in areas (made up)' }

/** A drawing unit: a crossing this close to a segment's end is a meeting at that end. */
const AT_AN_END = 0.01

/** The local time stamped on each feeds link written the way the office stored one before 13 November. */
const BEFORE_13_NOVEMBER = '2026-11-12 12:00:00'

let db: TestDb
let app: LiveApp
const id: Record<string, string> = {}
/** Each link's id, with the keys of its ends and its type, for a failure to name it. */
const linkNamed = new Map<string, string>()
const linkEnds = new Map<string, readonly [string, string]>()
/** The master's feeds links with a module at one end, written straight into the database. */
const fromBefore13November: string[] = []
/** The reel's implements links, stored with the flag the office sets on a link it worked out itself. */
const inferred: { link: string; from: string; to: string }[] = []
const stored: Record<'master' | 'reel' | 'shape', Attempt> = {
  master: { ok: false, status: 0, text: 'not tried' },
  reel: { ok: false, status: 0, text: 'not tried' },
  shape: { ok: false, status: 0, text: 'not tried' },
}

type CreateLink = TestDb['api']['createLink']

/**
 * A feeds link with a module at one end, WRITTEN STRAIGHT INTO THE DATABASE the way the office stored such a link
 * before 13 November, because today's door refuses it: since then the office stores a feeds link only between two
 * steps (checkLinkKinds in src/server/lib/records.ts). An office may still hold such links, and the page draws every
 * stored link. The columns are those createLink writes.
 */
function aFeedsLinkFromBefore13November(link: FileLink, linkId: string): void {
  const carries = link.carries === undefined ? null : JSON.stringify([{ out: link.carries }])
  db.client.sqlite
    .prepare(
      'INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by, created_by_type, carries) ' +
        'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(linkId, PROJECT.id, db.api.HUMAN.id, BEFORE_13_NOVEMBER, BEFORE_13_NOVEMBER, id[link.from]!, id[link.to]!, 'feeds', 0, db.api.HUMAN.id, 'human', carries)
}

function aLink(link: FileLink, modules: ReadonlySet<string>, anOfficeId: () => string): void {
  let linkId: string
  if (link.type === 'feeds' && (modules.has(link.from) || modules.has(link.to))) {
    linkId = anOfficeId()
    aFeedsLinkFromBefore13November(link, linkId)
    fromBefore13November.push(`${link.from} feeds ${link.to}`)
  } else {
    const gate = link.gate === 'hard' ? { gate: { kind: 'hard' as const } } : link.gate === 'partial' ? { gate: { kind: 'partial' as const, upTo: link.upTo! } } : {}
    const carries = link.carries === undefined ? {} : { carries: [{ out: link.carries }] }
    // The flag the links door does not take: the office sets it on a link it worked out itself.
    const type = link.type as Parameters<CreateLink>[0]['type']
    linkId = db.api.createLink({ fromId: id[link.from]!, toId: id[link.to]!, type, inferred: link.inferred, ...gate, ...carries, actor: db.api.HUMAN }).id
    if (link.inferred) inferred.push({ link: linkId, from: link.from, to: link.to })
  }
  linkNamed.set(linkId, `${link.from} ${link.type} ${link.to}`)
  linkEnds.set(linkId, [id[link.from]!, id[link.to]!])
}

/** A pipeline's areas and places with every key turned into the record's id. */
function theIntent(placement: FilePlacement): Record<string, unknown> {
  return {
    direction: placement.direction,
    lanes: placement.lanes.map((lane) => (lane.head === undefined ? lane : { ...lane, head: id[lane.head]! })),
    nodes: Object.fromEntries(Object.entries(placement.nodes).map(([key, place]) => [id[key]!, place])),
  }
}

/** Every record and link of the file, written into the test's own database before its server starts. */
function storeTheFile(anOfficeId: () => string): void {
  const { master, reel } = FILE
  const person = db.api.HUMAN
  const records = new Map([...master.records, ...reel.records].map((record) => [record.key, record]))
  const modules = new Set([...records.values()].filter((record) => record.kind === 'module').map((record) => record.key))
  const aStep = (pipeline: string, key: string, title: string, state: string | null): void => {
    const asked = (state ?? 'todo') as Parameters<TestDb['blocks']['addBlock']>[1]['state']
    id[key] = db.blocks.addBlock(id[pipeline]!, { name: title, state: asked }, person).block.id
  }
  const aPipeline = (key: string, title: string): void => {
    id[key] = db.api.createRecord({ kind: 'pipeline', title, workspaceId: PROJECT.id, actor: person, data: { blockIds: [] } }).id
  }
  const aModule = (record: FileRecord): void => {
    const data = { context: 'Made up for a test of the drawing in areas.' }
    id[record.key] = db.api.createRecord({ kind: 'module', title: record.title, workspaceId: PROJECT.id, actor: person, data }).id
  }

  aPipeline(master.pipeline.key, master.pipeline.title)
  for (const step of master.steps) aStep(master.pipeline.key, step.key, step.title, step.state)
  for (const link of master.waitsOn) aLink(link, modules, anOfficeId)
  for (const block of master.blockPipelines) {
    aPipeline(block.key, block.title)
    db.api.createLink({ fromId: id[block.key]!, toId: id[block.partOf]!, type: 'part_of', actor: person })
    for (const box of block.boxes) aStep(block.key, box, records.get(box)!.title, records.get(box)!.state)
  }
  for (const record of master.records) if (record.kind === 'module') aModule(record)
  for (const link of master.links) aLink(link, modules, anOfficeId)

  aPipeline(reel.pipeline.key, reel.pipeline.title)
  for (const record of reel.records) {
    if (record.kind === 'module') aModule(record)
    else aStep(reel.pipeline.key, record.key, record.title, record.state)
  }
  for (const link of reel.links) aLink(link, modules, anOfficeId)
}

// ============================================================================================== the reel's shape

/** The reel's shape, made up in code: see the header. Every key begins "shape", so none is a key of the file. */
const SHAPE = {
  pipeline: 'shape',
  lister: 'shape lister',
  head: 'shape head',
  lanes: [
    { name: 'Above', arrange: 'grid', columns: 2, order: 0 },
    { name: 'Beside', arrange: 'row', order: 1, beside: 'right', of: 'Above' },
    { name: 'Modules', arrange: 'row', order: 2 },
    { name: 'Framed', arrange: 'grid', columns: 3, order: 3, head: 'shape head' },
  ],
  places: {
    Above: ['shape step 1', 'shape step 2'],
    Beside: ['shape step 3'],
    Modules: ['shape A', 'shape B', 'shape C'],
    Framed: ['shape step 4', 'shape step 5', 'shape step 6'],
  },
  /** The links at rest. Neither joins two cards side by side in one lane, so no gap between two cards is widened. */
  atRest: [
    ['shape step 2', 'shape step 3'],
    ['shape step 4', 'shape step 6'],
  ],
  /** Each module's implements links, to the blocks the lister lists, by number. */
  implementing: { 'shape A': [1], 'shape B': [2, 3, 4, 5, 6], 'shape C': [7, 8, 9, 10, 3, 11, 5] },
  /** One more implements link, from C to step 1. Both are above the frame, so its line can run inside the layout. */
  inside: ['shape C', 'shape step 1'],
} as const

/** Each of the shape's modules, with its implements links' ids. */
const implementedBy = new Map<string, string[]>()
/** The id of the shape's link from C to step 1, once it is stored. */
let insideLink = ''

function aShapeLink(type: 'blocks' | 'implements', from: string, to: string): string {
  const linkId = db.api.createLink({ fromId: id[from]!, toId: id[to]!, type, actor: db.api.HUMAN }).id
  linkNamed.set(linkId, `${from} ${type} ${to}`)
  linkEnds.set(linkId, [id[from]!, id[to]!])
  return linkId
}

/** Every record and link of the reel's shape, written into the test's own database before its server starts. */
function storeTheShape(): void {
  const person = db.api.HUMAN
  const aPipeline = (key: string, title: string): void => {
    id[key] = db.api.createRecord({ kind: 'pipeline', title, workspaceId: PROJECT.id, actor: person, data: { blockIds: [] } }).id
  }
  const aStep = (pipeline: string, key: string, title: string): void => {
    id[key] = db.blocks.addBlock(id[pipeline]!, { name: title, state: 'todo' }, person).block.id
  }
  aPipeline(SHAPE.pipeline, 'Example pipeline in the reel’s shape (made up)')
  aStep(SHAPE.pipeline, SHAPE.head, 'Example head of the framed lane (made up)')
  for (let n = 1; n <= 6; n += 1) aStep(SHAPE.pipeline, `shape step ${String(n)}`, `Example step ${String(n)} of the shape (made up)`)
  for (const module of SHAPE.places.Modules) {
    const data = { context: 'Made up for a test of the drawing in areas.' }
    id[module] = db.api.createRecord({ kind: 'module', title: `Example module ${module.slice(-1)} (made up)`, workspaceId: PROJECT.id, actor: person, data }).id
  }
  aPipeline(SHAPE.lister, 'Example pipeline that lists eleven blocks (made up)')
  for (let n = 1; n <= 11; n += 1) aStep(SHAPE.lister, `shape block ${String(n)}`, `Example block ${String(n)} (made up)`)
  for (const [from, to] of SHAPE.atRest) aShapeLink('blocks', from, to)
  for (const [module, blocks] of Object.entries(SHAPE.implementing)) {
    implementedBy.set(module, blocks.map((n) => aShapeLink('implements', module, `shape block ${String(n)}`)))
  }
  insideLink = aShapeLink('implements', SHAPE.inside[0], SHAPE.inside[1])
}

/** The shape's areas and places with every key turned into the record's id. */
function theShapeIntent(): Record<string, unknown> {
  return {
    lanes: SHAPE.lanes.map((lane) => ('head' in lane ? { ...lane, head: id[lane.head]! } : lane)),
    nodes: Object.fromEntries(Object.entries(SHAPE.places).flatMap(([lane, keys]) => keys.map((key, order) => [id[key]!, { lane, order }]))),
  }
}

beforeAll(async () => {
  db = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  const { anOfficeId } = await import('../src/server/db/ids.ts')
  createWorkspace(PROJECT)
  storeTheFile(anOfficeId)
  storeTheShape()
  app = await liveApp({ name: 'lanes-crossings', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // The master and the areas through their doors, as the person: the areas are what this test is about.
  const write = writerFor(app, PROJECT.id, join(dirname(db.file), 'keys.json'))
  await write.call('PUT', `/api/projects/${PROJECT.id}/master-pipeline`, { pipeline: id[FILE.master.pipeline.key]! })
  stored.master = await storeTheAreas(write, id[FILE.master.pipeline.key]!, theIntent(FILE.master.placement))
  stored.reel = await storeTheAreas(write, id[FILE.reel.pipeline.key]!, theIntent(FILE.reel.placement))
  stored.shape = await storeTheAreas(write, id[SHAPE.pipeline]!, theShapeIntent())
  await prepareThePage(app, PROJECT.id)
}, 300_000)

afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)

// ============================================================================================= finding a crossing

interface Segment {
  link: string
  a: Point
  b: Point
}

interface Meetings {
  crossings: string[]
  atAnEnd: number
  runningTogether: number
}

const minus = (p: Point, q: Point): Point => [p[0] - q[0], p[1] - q[1]]
const cross = (p: Point, q: Point): number => p[0] * q[1] - p[1] * q[0]
const dot = (p: Point, q: Point): number => p[0] * q[0] + p[1] * q[1]
const length = (p: Point): number => Math.hypot(p[0], p[1])

function segmentsOf(paths: DrawnPath[]): Segment[] {
  return paths.flatMap((path) =>
    path.points.slice(1).flatMap((b, i) => {
      const a = path.points[i]!
      return length(minus(b, a)) > 0 ? [{ link: path.link, a, b }] : []
    }),
  )
}

/** Every meeting of two segments of different links, sorted into crossings, meetings at an end and running together. */
function meetingsOf(paths: DrawnPath[]): Meetings {
  const found: Meetings = { crossings: [], atAnEnd: 0, runningTogether: 0 }
  const segments = segmentsOf(paths)
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const one = segments[i]!
      const two = segments[j]!
      if (one.link === two.link) continue
      const r = minus(one.b, one.a)
      const s = minus(two.b, two.a)
      const between = minus(two.a, one.a)
      const turn = cross(r, s)
      if (Math.abs(turn) <= 1e-9 * length(r) * length(s)) {
        // Parallel. On one straight line, and sharing more than a point, they run together.
        if (Math.abs(cross(between, r)) > 1e-9 * length(r) * Math.max(length(between), 1)) continue
        const from = dot(between, r) / dot(r, r)
        const to = dot(minus(two.b, one.a), r) / dot(r, r)
        const overlap = Math.min(1, Math.max(from, to)) - Math.max(0, Math.min(from, to))
        if (overlap * length(r) > AT_AN_END) found.runningTogether += 1
        else if (overlap * length(r) >= -AT_AN_END) found.atAnEnd += 1
        continue
      }
      const t = cross(between, s) / turn
      const u = cross(between, r) / turn
      const slack = (segment: Point) => AT_AN_END / length(segment)
      if (t < -slack(r) || t > 1 + slack(r) || u < -slack(s) || u > 1 + slack(s)) continue
      const inside = t > slack(r) && t < 1 - slack(r) && u > slack(s) && u < 1 - slack(s)
      if (!inside) {
        found.atAnEnd += 1
        continue
      }
      const at = [one.a[0] + t * r[0], one.a[1] + t * r[1]].map((n) => Math.round(n * 10) / 10).join(', ')
      const name = (link: string) => linkNamed.get(link) ?? `a link this office did not store (${link})`
      found.crossings.push(`${name(one.link)} crosses ${name(two.link)} at (${at})`)
    }
  }
  return found
}

// ========================================================================================================= cases

const DRAWINGS = [
  { name: 'master', pipeline: 'master', level: 'boxes' },
  { name: 'reel', pipeline: 'reel', level: 'steps' },
] as const

for (const drawing of DRAWINGS) {
  for (const theme of ['light'] as const) {
    it(`criterion 2: no line crosses another at rest on the ${drawing.name}, at 1440, ${theme}`, async () => {
      theAreasWereStored(stored[drawing.name], `the ${drawing.name}`)
      await openThePage(app, pipelinePath(id[FILE[drawing.pipeline].pipeline.key]!), theme)
      await theDrawingIsDrawn(app.page)
      const read = await readTheDrawing(app.page)
      expect(read.level, `the ${drawing.name} is drawn at its ${drawing.level} level`).toBe(drawing.level)
      expect(read.selected, 'no card is selected at rest').toBeNull()
      expect(read.drawnLinks.length, 'at least one link is drawn at rest').toBeGreaterThan(0)
      for (const path of read.paths) expect(read.drawnLinks, `the line of ${linkNamed.get(path.link) ?? path.link} is a link drawn at rest`).toContain(path.link)

      const cards = new Set(read.cards.map((card) => card.id))
      const forASelection = new Set(Object.values(read.onSelection).flat())
      let between = 0
      for (const [linkId, [from, to]] of linkEnds) {
        if (!cards.has(from) || !cards.has(to)) continue
        between += 1
        expect(read.drawnLinks.includes(linkId) || forASelection.has(linkId), `${linkNamed.get(linkId)!}, between two cards, is named at rest or for a selection`).toBe(true)
      }

      const found = meetingsOf(read.paths)
      console.log(
        `the ${drawing.name}, ${theme}: ${String(read.cards.length)} cards, ${String(between)} links between two of them, ` +
          `${String(read.drawnLinks.length)} drawn at rest; ${String(found.crossings.length)} crossings, ` +
          `${String(found.atAnEnd)} meetings at an end, ${String(found.runningTogether)} stretches running together; ` +
          `${String(fromBefore13November.length)} feeds links of the whole file written as before 13 November`,
      )
      expect(found.crossings, `lines that cross at rest on the ${drawing.name}, ${theme}`).toEqual([])
    }, 120_000)
  }
}

it('criterion 1: the reel’s implements links, stored as links the office worked out, are drawn as inferred while their module is selected, and no stated link is', async () => {
  const named = (link: string): string => linkNamed.get(link) ?? link
  theAreasWereStored(stored.reel, 'the reel')
  expect(inferred.length, 'the reel holds implements links stored as inferred').toBeGreaterThan(0)
  await openThePage(app, pipelinePath(id[FILE.reel.pipeline.key]!), 'light')
  await theDrawingIsDrawn(app.page)
  const atRest = await readTheDrawing(app.page)
  for (const path of atRest.paths) expect(path.inferred, `the line of ${named(path.link)} at rest is not drawn as inferred`).toBe(false)

  const byModule = new Map<string, string[]>()
  for (const one of inferred) byModule.set(one.from, [...(byModule.get(one.from) ?? []), one.link])
  const theInferred = new Set(inferred.map((one) => one.link))
  for (const [module, links] of byModule) {
    const card = id[module]!
    for (const link of links) expect(atRest.onSelection[card] ?? [], `${named(link)} is named for a selection of ${module}`).toContain(link)
    const place = await aPlaceOnTheCard(app.page, card)
    await app.page.mouse.click(place.x, place.y)
    await app.page.locator(`${DRAWING}[data-selected="${card}"]`).waitFor({ timeout: 10_000 })
    await theDrawingHoldsStill(app.page)
    const selected = await readTheDrawing(app.page)
    for (const link of links) {
      const lines = selected.paths.filter((path) => path.link === link)
      expect(lines.length, `${named(link)} has a line while ${module} is selected`).toBeGreaterThan(0)
      for (const line of lines) {
        expect(line.type, `the line of ${named(link)} says its type`).toBe('implements')
        expect(line.inferred, `the line of ${named(link)} is drawn as inferred`).toBe(true)
      }
    }
    for (const path of selected.paths.filter((one) => !theInferred.has(one.link))) {
      expect(path.inferred, `the line of ${named(path.link)}, stored as stated, is not drawn as inferred while ${module} is selected`).toBe(false)
    }
    await app.page.keyboard.press('Escape')
    await app.page.locator(`${DRAWING}:not([data-selected])`).waitFor({ timeout: 10_000 })
  }
}, 120_000)

// ================================================================================================ the reel's shape

/** How long a case of the reel's shape waits for its plan: long enough to read what the old code named, and its time. */
const WAIT_FOR_THE_PLAN = 300_000
/** Criterion (iii) of the reel's shape. */
const READY_WITHIN = 30_000

/**
 * Opens the shape's page at 1440, light, and waits for its plan. Returns the milliseconds from asking for the page to
 * the drawing holding still. The drawing writes data-drawn-links before it works out a single route, and
 * data-not-drawn only once a plan is chosen, so the second is what says the plan is done.
 */
async function openTheShape(): Promise<number> {
  theAreasWereStored(stored.shape, 'the reel’s shape')
  const asked = performance.now()
  await openThePage(app, pipelinePath(id[SHAPE.pipeline]!), 'light')
  await app.page.locator(`${DRAWING}[data-not-drawn]`).waitFor({ timeout: WAIT_FOR_THE_PLAN })
  await theDrawingHoldsStill(app.page)
  return performance.now() - asked
}

/** The links the drawing names as not drawn, by the keys they were stored under. */
async function theLinksNamedNotDrawn(): Promise<string[]> {
  const text = await app.page.locator(DRAWING).getAttribute('data-not-drawn')
  const value = JSON.parse(text ?? 'null') as unknown
  expect(typeof value === 'object' && value !== null && !Array.isArray(value), `data-not-drawn is a map: ${String(text)}`).toBe(true)
  return Object.keys(value as Record<string, unknown>).map((link) => linkNamed.get(link) ?? `a link this office did not store (${link})`)
}

/** Where the framed lane stands in the layout, in drawing units, for the log: the header says why it is printed. */
async function theFrameInTheLayout(): Promise<string> {
  return app.page.evaluate((selector) => {
    const world = document.querySelector<HTMLElement>(`${selector} .e-world`)
    const frame = document.querySelector<HTMLElement>(`${selector} [data-key="Framed"]`)
    if (world === null || frame === null) return 'the layout or the framed lane was not found'
    const width = parseFloat(world.style.width)
    const left = parseFloat(frame.style.left)
    const right = left + parseFloat(frame.style.width)
    return `the layout is ${String(width)} wide and the framed lane runs from x=${String(left)} to x=${String(right)}`
  }, DRAWING)
}

/** The layout's width and height in drawing units, from the style of its world, where theFrameInTheLayout reads the width. */
async function theLayoutSize(): Promise<{ W: number; H: number }> {
  return app.page.evaluate((selector) => {
    const world = document.querySelector<HTMLElement>(`${selector} .e-world`)
    return { W: parseFloat(world?.style.width ?? ''), H: parseFloat(world?.style.height ?? '') }
  }, DRAWING)
}

it('the reel’s shape (i): when A, B and C are each selected, every one of its implements lines is drawn, and no link is named as not drawn, at 1440', async () => {
  const named = (link: string): string => linkNamed.get(link) ?? link
  const took = await openTheShape()
  const notDrawn = await theLinksNamedNotDrawn()
  console.log(`the reel’s shape: ${await theFrameInTheLayout()}; the drawing held still ${(took / 1000).toFixed(1)} s after its page was asked for; ${String(notDrawn.length)} links named as not drawn`)
  expect(notDrawn, 'the links the drawing names as not drawn (data-not-drawn)').toEqual([])
  const atRest = await readTheDrawing(app.page)
  expect(implementedBy.size, 'the shape holds three modules with implements links').toBe(3)
  for (const [module, links] of implementedBy) {
    const card = id[module]!
    for (const link of links) expect(atRest.onSelection[card] ?? [], `${named(link)} is named for a selection of ${module}`).toContain(link)
    const place = await aPlaceOnTheCard(app.page, card)
    await app.page.mouse.click(place.x, place.y)
    await app.page.locator(`${DRAWING}[data-selected="${card}"]`).waitFor({ timeout: 10_000 })
    await theDrawingHoldsStill(app.page)
    const selected = await readTheDrawing(app.page)
    for (const link of links) {
      const lines = selected.paths.filter((path) => path.link === link)
      expect(lines.length, `${named(link)} has a line while ${module} is selected`).toBeGreaterThan(0)
      for (const line of lines) expect(line.type, `the line of ${named(link)} says its type`).toBe('implements')
    }
    await app.page.keyboard.press('Escape')
    await app.page.locator(`${DRAWING}:not([data-selected])`).waitFor({ timeout: 10_000 })
  }
}, WAIT_FOR_THE_PLAN + 120_000)

it('the reel’s shape (ii): no line crosses another at rest, at 1440', async () => {
  await openTheShape()
  const read = await readTheDrawing(app.page)
  expect(read.selected, 'no card is selected at rest').toBeNull()
  expect(read.drawnLinks.length, 'at least one link is drawn at rest').toBeGreaterThan(0)
  for (const path of read.paths) expect(read.drawnLinks, `the line of ${linkNamed.get(path.link) ?? path.link} is a link drawn at rest`).toContain(path.link)
  const found = meetingsOf(read.paths)
  console.log(
    `the reel’s shape: ${String(read.drawnLinks.length)} links drawn at rest; ${String(found.crossings.length)} crossings, ` +
      `${String(found.atAnEnd)} meetings at an end, ${String(found.runningTogether)} stretches running together`,
  )
  expect(found.crossings, 'lines that cross at rest in the reel’s shape').toEqual([])
}, WAIT_FOR_THE_PLAN + 60_000)

it('the reel’s shape (iii): the drawing is ready within 30 s of asking for its page, at 1440', async () => {
  const took = await openTheShape()
  console.log(`the reel’s shape: the drawing held still ${(took / 1000).toFixed(1)} s after its page was asked for`)
  expect(took, `milliseconds from asking for the page to the drawing holding still, at most ${String(READY_WITHIN)}`).toBeLessThanOrEqual(READY_WITHIN)
}, WAIT_FOR_THE_PLAN + 60_000)

it('the reel’s shape (iv): when step 1 is selected, its one implements line, which can run inside the layout, has every point inside the layout, at 1440', async () => {
  const [module, step] = SHAPE.inside
  await openTheShape()
  const atRest = await readTheDrawing(app.page)
  const card = id[step]!
  expect(atRest.onSelection[card] ?? [], `the links named for a selection of ${step} are its one link, from ${module}`).toEqual([insideLink])
  const { W, H } = await theLayoutSize()
  expect(W > 0 && H > 0, `the layout has a width and a height: ${String(W)} by ${String(H)}`).toBe(true)
  const place = await aPlaceOnTheCard(app.page, card)
  await app.page.mouse.click(place.x, place.y)
  await app.page.locator(`${DRAWING}[data-selected="${card}"]`).waitFor({ timeout: 10_000 })
  await theDrawingHoldsStill(app.page)
  const lines = (await readTheDrawing(app.page)).paths.filter((path) => path.link === insideLink)
  console.log(`the reel’s shape: the layout is ${String(W)} by ${String(H)}; while ${step} is selected, the line of ${module} implements ${step} runs ${lines.map((line) => JSON.stringify(line.points)).join(' and ')}`)
  expect(lines.length, `${module} implements ${step} has a line while ${step} is selected`).toBeGreaterThan(0)
  for (const line of lines) {
    const outside = line.points.filter(([x, y]) => x < 0 || x > W || y < 0 || y > H)
    expect(outside, `the points of the line of ${module} implements ${step} outside the layout, 0 to ${String(W)} across and 0 to ${String(H)} down`).toEqual([])
  }
  await app.page.keyboard.press('Escape')
  await app.page.locator(`${DRAWING}:not([data-selected])`).waitFor({ timeout: 10_000 })
}, WAIT_FOR_THE_PLAN + 60_000)
