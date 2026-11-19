// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SCOPE'S RESTRICTIONS COME FROM WHAT THE SCOPE HOLDS, AND THE ANSWER IS THE WHOLE PROJECT'S ANSWER.
 *
 * `recordsInScope` in src/server/lib/restrictions.ts read every live record of the project and every link of every
 * project, only to walk down from one scope root. It now walks the scope's own closure: the root, the links into each
 * frontier, the children the containment reader gives it, and the live records those children land on. What must not
 * change is the answer.
 *
 * THE JUDGE IS THE CODE AS IT WAS BEFORE THIS CHANGE, kept here whole: the old `recordsInScope` body (every live record
 * of the project, every link of every project, the same filter and the same gap sentences), `descendantsOf` from
 * src/shared/containment.ts, and then `restrictionsReaching` with no graphs, deduped by restriction id and counted with
 * `restrictionCounts` from src/shared/restriction.ts. Every answer below is compared with it by hash.
 *
 * THE OFFICE IS BUILT THROUGH THE DOORS where a door will build it. A few rows are written straight into the table,
 * and each says so: a loop and a second parent (both refused by the write path), pipeline stored orders that name a
 * block twice or hold something that is not an id, links whose two ends are in two projects, a `part_of` link filed in
 * another project, a message-centre child and a restriction in the message centre.
 *
 * WHAT IT COSTS. The rows `restrictionsInScope` and `boundaryReply` read for one pipeline scope do not grow when the
 * project grows by records and links that are not in that scope, and the answer does not change.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import {
  MAX_CONTAINMENT_DEPTH,
  descendantsOf,
  partsOf,
  type ContainmentContext,
  type ContainmentLink,
} from '../src/shared/containment.ts'
import { restrictionCounts, type RestrictionSeverity } from '../src/shared/restriction.ts'

const HERE = 'default'
const THERE = 'robotics-elsewhere'
const CENTRE = 'message-centre'
const NOBODY_HAS_THIS_ID = 'no-record-has-this-id'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': HERE }
const PERSON_THERE = { ...PERSON, 'x-mole-office-workspace': THERE }

type Db = typeof import('../src/server/db/client.ts')
type Schema = typeof import('../src/server/db/schema.ts')
type Lib = typeof import('../src/server/lib/restrictions.ts')
type Boundaries = typeof import('../src/server/lib/boundaries.ts')
type Reading = {
  restrictionId: string
  title: string
  kind: string
  severity: RestrictionSeverity
  holdsField: string | null
  reach: { how: string; through?: string; distance?: number; carriedFrom?: string; path?: { recordId: string }[] }
  standing: { state: string; revalidationId?: string | null; resolvedBy?: string }
}
type Reply = { found: Reading[]; skippedDeleted: number; couldNotCheck: { what: string; because: string }[] }
type ScopeReply = Reply & { counts: { active: number; unchecked: number; stopsFinal: number; harmless: number } }

let t: TestDb
let app: FastifyInstance
let lib: Lib
let boundaries: Boundaries
let db: Db['db']
let schema: Schema
const id: Record<string, string> = {}

async function call(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload: unknown,
  headers: Record<string, string> = PERSON,
): Promise<any> {
  const res = await app.inject({ method, url, payload: payload as object, headers })
  if (method === 'POST' && url === '/api/records' && theAnswerToAWriteInATestOffice(headers, payload) === 409) {
    expect(res.statusCode, `${method} ${url}: ${res.body}`).toBe(409)
  } else {
    expect(res.statusCode, `${method} ${url}: ${res.body}`).toBeLessThan(300)
  }
  return res.json()
}

async function record(kind: string, title: string, data: Record<string, unknown> = { state: 'measured' }, headers = PERSON): Promise<string> {
  return (await call('POST', '/api/records', { kind, title, data }, headers)).record.id as string
}

async function restriction(
  title: string,
  severity: 'stops_final' | 'limits_claims' | 'harmless',
  extra: Record<string, unknown> = {},
  headers = PERSON,
): Promise<string> {
  return record('placeholder', title, {
    what: `${title}: a made-up stand-in.`,
    slot: 'stand_in',
    substitute: 'a made-up value',
    resolved_when: 'Somebody measures it.',
    allowed_uses: severity === 'harmless' ? [] : ['pipeline plumbing'],
    disallowed_claims: severity === 'harmless' ? [] : ['geometric accuracy claims'],
    severity,
    ...extra,
  }, headers)
}

async function link(fromId: string, toId: string, type: string, headers = PERSON): Promise<void> {
  await call('POST', '/api/links', { fromId, toId, type }, headers)
}

let straight = 0
/** A row no door will write, written into the table so both reads meet it. The header says why each is here. */
function straightIntoTheTable(workspaceId: string, fromId: string, toId: string, type: string): void {
  straight += 1
  t.client.sqlite
    .prepare(
      `INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by, created_by_type)
       VALUES (?, ?, ?, '2026-10-25 09:00:00', '2026-10-25 09:00:00', ?, ?, ?, 0, ?, 'human')`,
    )
    .run(`written-straight-${straight}`, workspaceId, THE_TEST_OFFICES_OWNER.id, fromId, toId, type, THE_TEST_OFFICES_OWNER.id)
}

/** A stored order no door writes, written straight into the pipeline's own row. */
function storeBlockIds(pipelineId: string, blockIds: unknown[]): void {
  const row = db.select().from(schema.records).where(eq(schema.records.id, pipelineId)).get()
  if (row === undefined) throw new Error(`the pipeline ${pipelineId} is not in the table`)
  const data = { ...(row.data as Record<string, unknown>), blockIds }
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), pipelineId)
}

async function anAgent(handle: string): Promise<string> {
  await call('POST', '/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } })
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: PERSON })).json() as { agents?: { id: string; handle: string }[] }
  const row = (listed.agents ?? []).find((agent) => agent.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} was registered and is not listed`)
  return row.id
}

const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** The whole-project context the old read handed to `descendantsOf`, for the structural assertions only. */
function oldContainmentContext(workspaceId: string): ContainmentContext {
  const all = db
    .select()
    .from(schema.records)
    .where(and(eq(schema.records.workspaceId, workspaceId), isNull(schema.records.deletedAt)))
    .all() as any[]
  const ids = new Set(all.map((row) => row.id as string))
  const rows = db
    .select({ id: schema.links.id, fromId: schema.links.fromId, toId: schema.links.toId, type: schema.links.type })
    .from(schema.links)
    .all()
  return { records: all, links: rows.filter((row) => ids.has(row.fromId) || ids.has(row.toId)) as ContainmentLink[] }
}

/** The old `recordsInScope` body, kept as the judge. Same root read, same two early returns, same gaps. */
function oldRecordsInScope(
  rootId: string,
  workspaceId: string,
): { ids: Set<string>; gaps: { what: string; because: string }[] } {
  const root = db.select().from(schema.records).where(eq(schema.records.id, rootId)).get()
  if (root === undefined || root.deletedAt != null) {
    return {
      ids: new Set([rootId]),
      gaps: [
        {
          what: `the scope ${rootId}`,
          because:
            root === undefined
              ? 'no record of that id is in this project, so nothing under it was walked'
              : 'that record has been deleted, so nothing under it was walked',
        },
      ],
    }
  }
  const all = db
    .select()
    .from(schema.records)
    .where(and(eq(schema.records.workspaceId, workspaceId), isNull(schema.records.deletedAt)))
    .all() as any[]
  const ids = new Set(all.map((row) => row.id as string))
  const rows = db
    .select({ id: schema.links.id, fromId: schema.links.fromId, toId: schema.links.toId, type: schema.links.type })
    .from(schema.links)
    .all()
  const joins = rows.filter((row) => ids.has(row.fromId) || ids.has(row.toId)) as ContainmentLink[]
  const found = descendantsOf(root as any, { records: all, links: joins })
  const inside = new Set<string>([rootId])
  for (const step of found.steps) inside.add(step.id)
  const gaps = found.gaps.map((gap) => ({ what: 'part of this scope', because: gap.reason }))
  if (!found.complete) gaps.push({ what: 'the rest of this scope', because: found.stopped })
  return { ids: inside, gaps }
}

/** The old `restrictionsInScope`: the old scope closure and then `restrictionsReaching` with no graphs. */
function theOldScopeAnswer(input: { workspaceId: string; scopeRecordId?: string; recordIds?: string[] }): ScopeReply {
  const ids = new Set<string>(input.recordIds ?? [])
  const gaps: { what: string; because: string }[] = []
  if (input.scopeRecordId != null) {
    const inside = oldRecordsInScope(input.scopeRecordId, input.workspaceId)
    for (const found of inside.ids) ids.add(found)
    gaps.push(...inside.gaps)
  }
  const reply = lib.restrictionsReaching([...ids], input.workspaceId)
  return scopeReply(reply, gaps)
}

/** The one dedupe and count every scope answer makes, kept here so the judge and the read are compared whole. */
function scopeReply(reply: { found: Map<string, Reading[]>; skippedDeleted: number; couldNotCheck: { what: string; because: string }[] }, gaps: { what: string; because: string }[]): ScopeReply {
  const found: Reading[] = []
  const seen = new Set<string>()
  for (const readings of reply.found.values()) {
    for (const reading of readings) {
      if (seen.has(reading.restrictionId)) continue
      seen.add(reading.restrictionId)
      found.push(reading)
    }
  }
  return {
    found,
    skippedDeleted: reply.skippedDeleted,
    couldNotCheck: [...gaps, ...reply.couldNotCheck],
    counts: restrictionCounts(found),
  }
}

const inScope = (scopeRecordId: string, workspaceId = HERE): ScopeReply =>
  lib.restrictionsInScope({ workspaceId, scopeRecordId }) as ScopeReply

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  lib = await import('../src/server/lib/restrictions.ts')
  boundaries = await import('../src/server/lib/boundaries.ts')
  db = (await import('../src/server/db/client.ts')).db
  schema = await import('../src/server/db/schema.ts')
  await call('POST', '/api/workspaces', { id: THERE, title: 'Robotics' })

  // THE PIPELINE THE SCOPE CASES USE: three blocks in stored order. Everything that reaches a member of this scope is
  // made below, so the comparison is not an empty one.
  id.pipeline! = await record('pipeline', 'Perception scope', {})
  id.blockA! = (await call('POST', `/api/records/${id.pipeline!}/blocks`, { name: 'Segment', state: 'doing' })).record.id as string
  id.blockB! = (await call('POST', `/api/records/${id.pipeline!}/blocks`, { name: 'Fuse', state: 'doing' })).record.id as string
  id.blockC! = (await call('POST', `/api/records/${id.pipeline!}/blocks`, { name: 'Project', state: 'doing' })).record.id as string

  // DIRECT: a restriction about one step of the scope.
  id.direct! = await restriction('Direct: the segmentation step is a stand-in', 'stops_final')
  await link(id.direct!, id.blockA!, 'about')

  // THROUGH A DEPENDENCY PATH: one step consumes a record the restriction is about.
  id.depA! = await record('claim', 'The upstream measurement A')
  await link(id.blockA!, id.depA!, 'consumes')
  id.depends! = await restriction('Depends: the upstream measurement A is a stand-in', 'limits_claims')
  await link(id.depends!, id.depA!, 'about')

  // THE SAME PATH, RESOLVED: the restriction still travels, and its standing says it was answered.
  id.depB! = await record('claim', 'The upstream measurement B')
  await link(id.blockB!, id.depB!, 'consumes')
  id.resolved! = await restriction('Resolved: the upstream measurement B was answered', 'stops_final')
  await link(id.resolved!, id.depB!, 'about')
  id.answer! = await record('note', 'The answer to the resolved restriction', { body: 'It was measured.' })
  await link(id.answer!, id.resolved!, 'resolves')

  // CARRIED THROUGH `implements`: a module in the scope carries a restriction about a block outside it.
  id.otherPipeline! = await record('pipeline', 'A pipeline outside the scope', {})
  id.outsideBlock! = (await call('POST', `/api/records/${id.otherPipeline!}/blocks`, { name: 'A step outside the scope', state: 'doing' })).record.id as string
  id.carrier! = await record('module', 'The carrying module', { context: 'A made-up module that carries a step.', state: 'active', parts: [] })
  await link(id.carrier!, id.outsideBlock!, 'implements')
  await link(id.carrier!, id.blockB!, 'part_of')
  id.carriedImplements! = await restriction('Carried by implements: a step outside the scope is a stand-in', 'limits_claims')
  await link(id.carriedImplements!, id.outsideBlock!, 'about')

  // CARRIED THROUGH `part_of`: a step of the scope is part of a restricted record outside it. The write path refuses a
  // second parent for a block already in a pipeline's order, so this row is written straight into the table.
  id.outsidePart! = await record('claim', 'A record outside the scope that a step is part of')
  straightIntoTheTable(HERE, id.blockC!, id.outsidePart!, 'part_of')
  id.carriedPartOf! = await restriction('Carried by part of: the record outside the scope is a stand-in', 'limits_claims')
  await link(id.carriedPartOf!, id.outsidePart!, 'about')

  // A CHILD IN THE MESSAGE CENTRE, with a restriction about it there. The link from the message is written straight
  // because no door files a `part_of` link from a message into a project record.
  const reader = await anAgent('scope-reader')
  id.message! = (
    await call('POST', '/api/records', {
      kind: 'message',
      title: 'A made-up message that is part of the scope',
      data: { body: 'A made-up message.', to: [{ kind: 'agent', id: reader }] },
    })
  ).record.id as string
  straightIntoTheTable(CENTRE, id.message!, id.blockA!, 'part_of')
  id.centre! = await restriction('Centre: a restriction about the message', 'limits_claims')
  t.client.sqlite.prepare('UPDATE records SET workspace_id = ? WHERE id = ?').run(CENTRE, id.centre!)
  straightIntoTheTable(CENTRE, id.centre!, id.message!, 'about')

  // A PART_OF CHILD THAT IS LIVE, ONE THAT IS DELETED, AND ONE UNDER THE DELETED CHILD. Only the live one is walked.
  id.liveParent! = await record('module', 'The live parent', { context: 'A made-up parent with two children.', state: 'active', parts: [] })
  id.liveChild! = await record('claim', 'The live child of the parent')
  await link(id.liveChild!, id.liveParent!, 'part_of')
  id.deletedChild! = await record('claim', 'The deleted child of the parent')
  await link(id.deletedChild!, id.liveParent!, 'part_of')
  id.underDeleted! = await record('claim', 'A record under the deleted child')
  await link(id.underDeleted!, id.deletedChild!, 'part_of')
  id.liveChildRestriction! = await restriction('Live child: a stand-in inside the parent', 'limits_claims')
  await link(id.liveChildRestriction!, id.liveChild!, 'about')
  id.deletedChildRestriction! = await restriction('Deleted child: a stand-in that must not be walked to', 'stops_final')
  await link(id.deletedChildRestriction!, id.deletedChild!, 'about')
  id.underDeletedRestriction! = await restriction('Under the deleted child: a stand-in that must not be reached', 'stops_final')
  await link(id.underDeletedRestriction!, id.underDeleted!, 'about')
  await call('DELETE', `/api/records/${id.deletedChild!}`, undefined)

  // A CHILD IN ANOTHER PROJECT, reached by a link written straight into the table because the write path refuses a
  // `part_of` link whose ends are in two projects.
  id.crossParent! = await record('claim', 'A parent with a child in the other project')
  id.crossChild! = await record('claim', 'A child in the other project', { state: 'measured' }, PERSON_THERE)
  straightIntoTheTable(HERE, id.crossChild!, id.crossParent!, 'part_of')
  id.crossChildRestriction! = await restriction('Cross: a stand-in about the other project child', 'stops_final', {}, PERSON_THERE)
  await link(id.crossChildRestriction!, id.crossChild!, 'about', PERSON_THERE)

  // A LOOP, written straight because the write path refuses the second link that makes it.
  id.loopA! = await record('claim', 'The first record of the loop')
  id.loopB! = await record('claim', 'The second record of the loop')
  await link(id.loopA!, id.loopB!, 'part_of')
  straightIntoTheTable(HERE, id.loopB!, id.loopA!, 'part_of')

  // A RECORD PART OF TWO THINGS: the first parent by door, the second straight because a second parent is refused.
  id.twoRoot! = await record('pipeline', 'The root of two ways', {})
  id.twoA! = await record('claim', 'The first way')
  id.twoB! = await record('claim', 'The second way')
  await link(id.twoA!, id.twoRoot!, 'part_of')
  await link(id.twoB!, id.twoRoot!, 'part_of')
  id.shared! = await record('claim', 'The record part of two things')
  await link(id.shared!, id.twoA!, 'part_of')
  straightIntoTheTable(HERE, id.shared!, id.twoB!, 'part_of')

  // A CHAIN MORE THAN THE READER'S DEPTH. The write path refuses a `part_of` link once the chain above it reaches the
  // reader's depth, so these rows are written straight into the table. The number is the reader's own.
  id.chainRoot! = await record('claim', 'The root of the deep chain')
  let previous = id.chainRoot!
  for (let depth = 1; depth <= MAX_CONTAINMENT_DEPTH + 2; depth += 1) {
    const made = await record('claim', `The deep chain record ${depth}`)
    straightIntoTheTable(HERE, made, previous, 'part_of')
    previous = made
  }
  id.chainLast! = previous

  // A MODULE WITH A CHECKLIST. A checklist item is not a record, so the containment reader names it as a gap.
  id.checklist! = await record('module', 'The module with a checklist', {
    context: 'A made-up module whose checklist cannot be records.',
    state: 'active',
    parts: [
      {
        id: 'part-1',
        name: 'The work',
        items: [
          { id: 'item-1', text: 'A made-up first item', state: 'doing' },
          { id: 'item-2', text: 'A made-up second item', state: 'doing' },
        ],
      },
    ],
  })

  // A `part_of` LINK FILED IN ANOTHER PROJECT, with both ends in this one. No door files it there.
  id.otherFiledParent! = await record('claim', 'A parent whose link is filed elsewhere')
  id.otherFiledChild! = await record('claim', 'A child whose link is filed elsewhere')
  straightIntoTheTable(THERE, id.otherFiledChild!, id.otherFiledParent!, 'part_of')

  // A SCOPE ROOT IN THERE with one child in THERE and one in HERE, and a child under the THERE one. The cross-project
  // link is written straight for the reason above.
  id.thereRoot! = await record('pipeline', 'The other project root', {}, PERSON_THERE)
  id.thereChild! = await record('claim', 'The other project child', { state: 'measured' }, PERSON_THERE)
  id.thereGrandchild! = await record('claim', 'A record under the other project child', { state: 'measured' }, PERSON_THERE)
  id.hereChild! = await record('claim', 'The child of the other project root that is here')
  await link(id.thereChild!, id.thereRoot!, 'part_of', PERSON_THERE)
  await link(id.thereGrandchild!, id.thereChild!, 'part_of', PERSON_THERE)
  straightIntoTheTable(THERE, id.hereChild!, id.thereRoot!, 'part_of')
  id.thereChildRestriction! = await restriction('There child: a stand-in in the other project', 'stops_final', {}, PERSON_THERE)
  await link(id.thereChildRestriction!, id.thereChild!, 'about', PERSON_THERE)
  id.hereChildRestriction! = await restriction('Here child: a stand-in in this project', 'limits_claims')
  await link(id.hereChildRestriction!, id.hereChild!, 'about')

  // A THERE PIPELINE WHOSE STORED ORDER NAMES ITSELF. No door writes a stored order that names anything but a block.
  id.thereSelf! = await record('pipeline', 'The pipeline that names itself', {}, PERSON_THERE)
  storeBlockIds(id.thereSelf!, [id.thereSelf!])

  // A STORED ORDER THAT NAMES ONE BLOCK TWICE AND HOLDS SOMETHING THAT IS NOT AN ID, written straight into the row.
  id.oddPipeline! = await record('pipeline', 'The pipeline with a broken order', {})
  id.oddOne! = (await call('POST', `/api/records/${id.oddPipeline!}/blocks`, { name: 'The first odd block', state: 'doing' })).record.id as string
  id.oddTwo! = (await call('POST', `/api/records/${id.oddPipeline!}/blocks`, { name: 'The second odd block', state: 'doing' })).record.id as string
  storeBlockIds(id.oddPipeline!, [id.oddOne!, 99999, ` ${id.oddTwo!} `, id.oddOne!])
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** Every record of every project, and the id nobody has, each read as a scope in HERE and in its own project. */
function everyRecordAndItsScope(): { recordId: string; ownProject: string }[] {
  const rows = db.select({ id: schema.records.id, workspaceId: schema.records.workspaceId }).from(schema.records).all() as {
    id: string
    workspaceId: string
  }[]
  return [...rows, { id: NOBODY_HAS_THIS_ID, workspaceId: HERE }].map((row) => ({ recordId: row.id, ownProject: row.workspaceId }))
}

describe('the office holds every kind of scope and reach, so the comparison is not empty', () => {
  it('holds the pipelines and their broken orders, the children, the loop, the two parents, the deep chain and the checklist', () => {
    // A pipeline's blocks, in its stored order.
    const main = oldContainmentContext(HERE)
    const pipelineRow = main.records.find((row) => row.id === id.pipeline!)!
    expect(partsOf(pipelineRow, { records: [], links: [] }).parts.map((part) => part.id)).toEqual([
      id.blockA!,
      id.blockB!,
      id.blockC!,
    ])

    // One block named twice and one entry that is not an id: the reader names both gaps.
    const oddRow = main.records.find((row) => row.id === id.oddPipeline!)!
    const odd = partsOf(oddRow, { records: [], links: [] })
    expect(odd.parts.map((part) => part.id), 'the readable order, trimmed and counted once').toEqual([id.oddOne!, id.oddTwo!])
    expect(odd.gaps).toHaveLength(2)
    expect(odd.gaps.some((gap) => gap.count === 1 && gap.recordIds.length === 0), 'the entry that is not an id').toBe(true)
    expect(odd.gaps.some((gap) => gap.count === 1 && gap.recordIds[0] === id.oddOne!), 'the block named twice').toBe(true)

    // A live `part_of` child, a deleted one, and nothing under the deleted one.
    const liveScope = inScope(id.liveParent!)
    expect(liveScope.found.map((reading) => reading.restrictionId)).toContain(id.liveChildRestriction!)
    expect(liveScope.found.map((reading) => reading.restrictionId)).not.toContain(id.deletedChildRestriction!)
    expect(liveScope.found.map((reading) => reading.restrictionId)).not.toContain(id.underDeletedRestriction!)
    const liveSteps = descendantsOf(rowOf(id.liveParent!), main).steps
    expect(liveSteps.map((step) => step.id)).toContain(id.liveChild!)
    expect(liveSteps.map((step) => step.id), 'the deleted child is a step that was not loaded').toContain(id.deletedChild!)
    expect(liveSteps.map((step) => step.id), 'nothing under the deleted child is walked').not.toContain(id.underDeleted!)

    // A child in another project, and a child in the message centre with a restriction about it there.
    const crossSteps = descendantsOf(rowOf(id.crossParent!), main).steps.map((step) => step.id)
    expect(crossSteps).toContain(id.crossChild!)
    expect(crossSteps).not.toContain(id.underDeleted!)
    expect(inScope(id.blockA!).found.map((reading) => reading.restrictionId), 'a message in the centre is part of the scope').toContain(id.centre!)
    expect(inScope(id.blockA!).couldNotCheck.length, 'the message is not a record of this project').toBeGreaterThan(0)

    // A loop, a record part of two things, a chain deeper than the reader walks, and a module's checklist.
    const loop = descendantsOf(rowOf(id.loopA!), main)
    expect(loop.complete).toBe(false)
    const two = descendantsOf(rowOf(id.twoRoot!), main)
    expect(two.gaps.some((gap) => gap.recordIds.includes(id.shared!)), 'the record part of two things').toBe(true)
    const deep = descendantsOf(rowOf(id.chainRoot!), main)
    expect(deep.complete).toBe(false)
    expect(deep.steps).toHaveLength(MAX_CONTAINMENT_DEPTH)
    expect(deep.complete === false && deep.stopped).toContain(String(MAX_CONTAINMENT_DEPTH))
    const checklist = descendantsOf(rowOf(id.checklist!), main)
    expect(checklist.gaps.some((gap) => gap.count === 2 && gap.recordIds.length === 0), 'the checklist items').toBe(true)

    // A `part_of` link filed in another project, with both ends in this one.
    expect(descendantsOf(rowOf(id.otherFiledParent!), main).steps.map((step) => step.id)).toContain(id.otherFiledChild!)

    // A root in THERE with one child in THERE and one in HERE, and a pipeline in THERE that names itself.
    const there = inScope(id.thereRoot!, HERE)
    expect(there.found.map((reading) => reading.restrictionId)).toContain(id.hereChildRestriction!)
    expect(there.found.map((reading) => reading.restrictionId)).not.toContain(id.thereChildRestriction!)
    const thereOwn = inScope(id.thereRoot!, THERE)
    expect(thereOwn.found.map((reading) => reading.restrictionId)).toContain(id.thereChildRestriction!)
    const selfRow = rowOf(id.thereSelf!)
    expect(partsOf(selfRow, { records: [], links: [] }).parts.map((part) => part.id)).toEqual([id.thereSelf!])

    // Direct, carried both ways, through a dependency path, and resolved.
    expect(inScope(id.pipeline!).found.map((reading) => reading.restrictionId)).toEqual(
      expect.arrayContaining([id.direct!, id.depends!, id.resolved!, id.carriedImplements!, id.carriedPartOf!, id.centre!]),
    )
    expect(inScope(id.pipeline!).found.find((reading) => reading.restrictionId === id.direct!)!.reach.how).toBe('direct')
    expect(inScope(id.pipeline!).found.find((reading) => reading.restrictionId === id.depends!)!.reach).toMatchObject({
      how: 'depends',
      distance: 1,
    })
    expect(inScope(id.pipeline!).found.find((reading) => reading.restrictionId === id.carriedImplements!)!.reach).toMatchObject({
      how: 'carried',
      through: 'implements',
    })
    expect(inScope(id.pipeline!).found.find((reading) => reading.restrictionId === id.carriedPartOf!)!.reach).toMatchObject({
      how: 'carried',
      through: 'part_of',
    })
    expect(inScope(id.pipeline!).found.find((reading) => reading.restrictionId === id.resolved!)!.standing.state).not.toBe('active')
  })

  function rowOf(recordId: string): any {
    const row = db.select().from(schema.records).where(eq(schema.records.id, recordId)).get()
    if (row === undefined) throw new Error(`the record ${recordId} is not in the table`)
    return row
  }

})

describe('a scope gives the whole project answer for every record', () => {
  it('in every project and the message centre, deleted records and an id nobody has included, by hash', () => {
    const pairs = new Set<string>()
    let compared = 0
    for (const { recordId, ownProject } of everyRecordAndItsScope()) {
      for (const workspaceId of [HERE, ownProject]) {
        const key = `${workspaceId}\u0000${recordId}`
        if (pairs.has(key)) continue
        pairs.add(key)
        const found = inScope(recordId, workspaceId)
        const judge = theOldScopeAnswer({ workspaceId, scopeRecordId: recordId })
        expect(found, `${recordId} in ${workspaceId}`).toEqual(judge)
        expect(hash(found), `${recordId} in ${workspaceId}, by hash`).toBe(hash(judge))
        compared += 1
      }
    }
    expect(compared, 'every record was compared at least once').toBeGreaterThanOrEqual(everyRecordAndItsScope().length)
  })
})

describe('a list of records gives the whole project answer', () => {
  it('for lists that mix live, deleted, other-project, message-centre and nobody ids', () => {
    const lists = [
      [id.blockA!, id.deletedChild!, id.crossChild!, id.message!, NOBODY_HAS_THIS_ID],
      [id.pipeline!, id.underDeleted!, id.thereChild!, id.centre!, NOBODY_HAS_THIS_ID, id.liveChild!],
      [id.chainRoot!, id.chainLast!, id.deletedChild!, id.thereGrandchild!, id.message!, NOBODY_HAS_THIS_ID],
      [id.loopB!, id.shared!, id.otherFiledChild!, id.thereSelf!, id.centre!, NOBODY_HAS_THIS_ID, id.direct!],
    ]
    for (const recordIds of lists) {
      const found = lib.restrictionsInScope({ workspaceId: HERE, recordIds }) as ScopeReply
      const judge = theOldScopeAnswer({ workspaceId: HERE, recordIds })
      expect(found, JSON.stringify(recordIds)).toEqual(judge)
      expect(hash(found), JSON.stringify(recordIds)).toBe(hash(judge))
    }
  })
})

describe('what a scope costs to answer', () => {
  /** The rows every statement hands back while `act` runs, exactly as the one-record test counts them. */
  function rowsReadDuring(act: () => void): number {
    const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => object }
    type Methods = Record<'all' | 'get' | 'iterate', (this: unknown, ...args: unknown[]) => any>
    const proto = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Methods
    const kept: Methods = { all: proto.all, get: proto.get, iterate: proto.iterate }
    let rows = 0
    proto.all = function (...args) {
      const found = kept.all.apply(this, args) as unknown[]
      rows += found.length
      return found
    }
    proto.get = function (...args) {
      const found = kept.get.apply(this, args)
      if (found !== undefined) rows += 1
      return found
    }
    proto.iterate = function* (...args) {
      for (const row of kept.iterate.apply(this, args) as Iterable<unknown>) {
        rows += 1
        yield row
      }
    }
    try {
      act()
    } finally {
      Object.assign(proto, kept)
    }
    return rows
  }

  it('does not grow for a pipeline scope, through the read or through a boundary, when the project grows outside it', async () => {
    const scope = { id: id.pipeline!, kind: 'pipeline', title: 'Perception scope', workspaceId: HERE }
    const before = inScope(id.pipeline!)
    const beforeBoundary = boundaries.boundaryReply('pipeline.complete', scope)
    const small = rowsReadDuring(() => inScope(id.pipeline!))
    const smallBoundary = rowsReadDuring(() => boundaries.boundaryReply('pipeline.complete', scope))
    let previous: string | null = null
    const added: string[] = []
    for (let i = 0; i < 20; i += 1) {
      const made = await record('claim', `A record outside the scope, ${i}`)
      added.push(made)
      if (previous !== null) {
        await link(made, previous, i % 2 === 0 ? 'derived_from' : 'consumes')
        await link(made, previous, 'part_of')
      }
      previous = made
    }
    for (let i = 0; i < added.length; i += 1) {
      if (i % 4 === 0) await call('DELETE', `/api/records/${added[i]}`, undefined)
    }
    const large = rowsReadDuring(() => inScope(id.pipeline!))
    const largeBoundary = rowsReadDuring(() => boundaries.boundaryReply('pipeline.complete', scope))
    expect(small, 'the counter saw the read').toBeGreaterThan(0)
    expect(smallBoundary, 'the counter saw the boundary read').toBeGreaterThan(0)
    expect(large, `rows read for a scope: ${small} before twenty more records and their links, ${large} after`).toBe(small)
    expect(
      largeBoundary,
      `rows read for a boundary: ${smallBoundary} before twenty more records and their links, ${largeBoundary} after`,
    ).toBe(smallBoundary)
    expect(hash(inScope(id.pipeline!)), 'and the scope answer did not change').toBe(hash(before))
    expect(hash(boundaries.boundaryReply('pipeline.complete', scope)), 'and the boundary answer did not change').toBe(
      hash(beforeBoundary),
    )
  })
})
