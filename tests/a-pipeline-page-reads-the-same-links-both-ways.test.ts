// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PIPELINE PAGE READS THE SAME LINKS BOTH WAYS.
 *
 * The page reads one pipeline's links through `blockLinkRowsFor`, which asks the database only for
 * links pointing at the pipeline's own stored steps. It used to read every link of the project
 * through `blockLinkRowsIn`. This file holds the two readings side by side, case by case, and
 * requires them to agree: the rows row for row and in order, the whole reading through
 * `readOnePipelinesBlocks`, and the answer the door gives.
 *
 * THE OLD QUERY HAS NO ORDER BY. `blockLinkRowsIn` reads every link of the project through
 * `allGatedLinks`, whose query has no ORDER BY, so its order is the order SQLite happens to return
 * rows in — an observed plan, not a SQL guarantee. The new read orders by `links.rowid` explicitly.
 * The comparison is made on the store the office runs on: SQLite through better-sqlite3 13.0.3, the
 * version in package.json. It is checked there and nowhere claimed as guaranteed.
 *
 * `readPipelineBlocks` ignores every link whose `toId` is not one of the pipeline's stored steps, so
 * the old workspace rows are restricted to those steps before the two row arrays are compared.
 *
 * Neither reader puts `carries` in a row, and this file keeps that: the rows of a `feeds` link that
 * stores words have the same keys as the other reader's rows and no `carries` key.
 *
 * All the records and links here are made up, in a fresh office of this file's own. The one damaged
 * archive state is written straight into the record row, and the case says so.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, one, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { blockIdsOf } from '../src/shared/blocks.ts'
import type { RecordKind } from '../src/shared/types.ts'

let t: TestDb
let app: FastifyInstance
const project = 'default'
const elsewhere = 'another-made-up-project'
let made = 0

function headersFor(workspaceId: string): Record<string, string> {
  return {
    'x-mole-office-workspace': workspaceId,
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
  }
}

function aPipeline(workspaceId: string, purpose: string): string {
  made += 1
  return t.api.createRecord({
    workspaceId,
    kind: 'pipeline',
    title: `A made-up ${purpose} pipeline ${String(made)}`,
    data: { blockIds: [] },
    actor: t.api.HUMAN,
  }).id
}

function stepsOf(pipelineId: string, names: readonly string[]): string[] {
  return names.map(
    (name) => t.blocks.addBlock(pipelineId, { name, state: 'todo' }, t.api.HUMAN).block.id,
  )
}

function aRecord(workspaceId: string, kind: RecordKind, purpose: string): string {
  made += 1
  return t.api.createRecord({
    workspaceId,
    kind,
    title: `A made-up ${purpose} ${String(made)}`,
    actor: t.api.HUMAN,
  }).id
}

/**
 * Read one pipeline both ways and hold the two answers to each other.
 *
 * The old rows are the workspace rows `readPipelineBlocks` would actually look at, and the two
 * readings are made by the same function the door calls. The door is asked last, so the answer a
 * page receives is held to the same comparison.
 */
async function bothWays(pipelineId: string, workspaceId: string) {
  const pipeline = t.api.getRecord(pipelineId)
  if (pipeline === null) throw new Error(`the pipeline ${pipelineId} is missing`)
  const stepIds = new Set(blockIdsOf(pipeline))
  const oldWorkspaceRows = t.blocks.blockLinkRowsIn(workspaceId)
  const oldRows = oldWorkspaceRows.filter((row) => stepIds.has(row.toId))
  const newRows = t.blocks.blockLinkRowsFor(pipeline, workspaceId)
  expect(newRows, 'the narrow rows are the old rows for this pipeline\'s steps, in order').toEqual(oldRows)
  const oldReading = t.blocks.readOnePipelinesBlocks(pipeline, workspaceId, oldWorkspaceRows)
  const newReading = t.blocks.readOnePipelinesBlocks(pipeline, workspaceId, newRows)
  expect(newReading, 'the narrow reading is the reading through the whole project').toEqual(oldReading)
  const reply = await app.inject({
    method: 'GET',
    url: `/api/records/${pipelineId}`,
    headers: headersFor(workspaceId),
  })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  expect(reply.json().blocks, 'the door answers with the reading the page makes').toEqual(newReading)
  return { oldWorkspaceRows, oldRows, newRows, oldReading, newReading }
}

beforeAll(async () => {
  t = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: elsewhere, title: 'A made-up other project' })
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a pipeline page reads the same links both ways', () => {
  it('reads several links in the order they were written, which differs from the steps\' order', async () => {
    const pipeline = aPipeline(project, 'ordered')
    const [first, second, third] = stepsOf(pipeline, ['First made-up step', 'Second made-up step', 'Third made-up step'])
    const carrier = aRecord(project, 'module', 'carrier')
    const intoThird = t.api.createLink({ fromId: carrier, toId: third!, type: 'implements', actor: t.api.HUMAN }).id
    const intoFirst = t.api.createLink({ fromId: carrier, toId: first!, type: 'implements', actor: t.api.HUMAN }).id
    const intoSecond = t.api.createLink({ fromId: carrier, toId: second!, type: 'implements', actor: t.api.HUMAN }).id

    const { oldRows, newRows, newReading } = await bothWays(pipeline, project)

    expect(newRows.map((row) => row.toId), 'the links were written in a different order from the steps').toEqual([third, first, second])
    expect(newRows.map((row) => row.id)).toEqual([intoThird, intoFirst, intoSecond])
    expect(newRows.map((row) => Object.keys(row)), 'both row shapes carry the same keys').toEqual(oldRows.map((row) => Object.keys(row)))
    expect(newRows.flatMap((row) => Object.keys(row)), 'no link row has a carries key').not.toContain('carries')
    expect(newReading.blocks.map((block) => block.carriers.map((carrierOfStep) => carrierOfStep.linkId))).toEqual([
      [intoFirst],
      [intoSecond],
      [intoThird],
    ])
  })

  it('reads a gated blocks link with upTo and a blocks link without a gate', async () => {
    const pipeline = aPipeline(project, 'gated')
    const [waiting, blocked, later] = stepsOf(pipeline, ['Waiting made-up step', 'Blocked made-up step', 'Later made-up step'])
    const partial = t.api.createLink({
      fromId: waiting!,
      toId: blocked!,
      type: 'blocks',
      gate: { kind: 'partial', upTo: 'bench tuning without the arm' },
      actor: t.api.HUMAN,
    }).id
    const unqualified = t.api.createLink({ fromId: blocked!, toId: later!, type: 'blocks', actor: t.api.HUMAN }).id

    const { newRows, newReading } = await bothWays(pipeline, project)

    expect(newRows.map((row) => ({ gate: row.gate, upTo: row.upTo }))).toEqual([
      { gate: 'partial', upTo: 'bench tuning without the arm' },
      { gate: null, upTo: null },
    ])
    expect(newReading.blocks.map((block) => block.needs)).toEqual([
      [],
      [{ blockId: waiting, gate: 'partial', upTo: 'bench tuning without the arm', linkId: partial }],
      [{ blockId: blocked, gate: null, linkId: unqualified }],
    ])
  })

  it('reads a feeds link between two steps and puts no carries in a row', async () => {
    const pipeline = aPipeline(project, 'fed')
    const [from, to] = stepsOf(pipeline, ['Producing made-up step', 'Consuming made-up step'])
    const carried = [{ out: 'made-up frames', in: 'images' }]
    const feed = t.api.createLink({ fromId: from!, toId: to!, type: 'feeds', carries: carried, actor: t.api.HUMAN }).id
    const stored = t.client.sqlite.prepare('SELECT carries FROM links WHERE id = ?').get(feed) as { carries: string }
    expect(JSON.parse(stored.carries), 'the link really stores what moves').toEqual(carried)

    const { oldRows, newRows, newReading } = await bothWays(pipeline, project)

    expect(newRows.map((row) => row.type)).toEqual(['feeds'])
    expect(Object.keys(one(newRows, 'a new feeds row'))).not.toContain('carries')
    expect(Object.keys(one(oldRows, 'an old feeds row'))).not.toContain('carries')
    expect(newReading.blocks[0]?.moves, 'the row shapes omit carries, so the reading names nothing moving').toEqual([
      { blockId: to, linkId: feed, carries: [] },
    ])
  })

  it('does not read a link of the same kind from another project', async () => {
    const otherPipeline = aPipeline(elsewhere, 'other project')
    const [otherFrom, otherTo] = stepsOf(otherPipeline, ['Other producing made-up step', 'Other consuming made-up step'])
    const otherLink = t.api.createLink({
      fromId: otherFrom!,
      toId: otherTo!,
      type: 'feeds',
      carries: [{ out: 'made-up cargo' }],
      actor: t.api.HUMAN,
    }).id

    const other = await bothWays(otherPipeline, elsewhere)
    expect(other.newRows.map((row) => row.id), 'the link is readable in its own project').toEqual([otherLink])

    const pipeline = aPipeline(project, 'here')
    stepsOf(pipeline, ['Here producing made-up step', 'Here consuming made-up step'])
    const here = await bothWays(pipeline, project)
    expect(JSON.stringify(here.oldRows), 'the other project\'s link is not among the old rows').not.toContain(otherLink)
    expect(JSON.stringify(here.newRows), 'the other project\'s link is not among the narrow rows').not.toContain(otherLink)
    expect(here.newReading.blocks.flatMap((block) => block.moves), 'no move crosses the project boundary').toEqual([])
  })

  it('reads no links for a pipeline whose stored block list is empty', async () => {
    const withLinks = aPipeline(project, 'not empty')
    const [step] = stepsOf(withLinks, ['A made-up step with a link'])
    const carrier = aRecord(project, 'module', 'carrier')
    t.api.createLink({ fromId: carrier, toId: step!, type: 'implements', actor: t.api.HUMAN })

    const pipeline = aPipeline(project, 'empty')
    const { oldWorkspaceRows, newRows, newReading } = await bothWays(pipeline, project)

    expect(oldWorkspaceRows.length, 'the project has links, so the empty answer is not vacuous').toBeGreaterThan(0)
    expect(newRows).toEqual([])
    expect(newReading).toEqual({ blocks: [], problems: [], storedIds: 0, undeclared: false })
  })

  it('reads the same for a stored block list that is not an array', async () => {
    const pipeline = aPipeline(project, 'not a list')
    writeDataBypassingTheGate(t, pipeline, { blockIds: 'not a list of block ids' })
    const current = t.api.getRecord(pipeline)
    if (current === null) throw new Error(`the pipeline ${pipeline} is missing`)
    expect(blockIdsOf(current), 'blockIdsOf reads a stored value that is not an array as no ids').toEqual([])

    const { newRows, newReading } = await bothWays(pipeline, project)

    expect(newRows).toEqual([])
    expect(newReading).toEqual({ blocks: [], problems: [], storedIds: 0, undeclared: false })
  })

  it('reads the same for damaged entries in a stored block list', async () => {
    const pipeline = aPipeline(project, 'damaged list')
    const [step] = stepsOf(pipeline, ['A made-up step that is really there'])
    const carrier = aRecord(project, 'module', 'carrier')
    const link = t.api.createLink({ fromId: carrier, toId: step!, type: 'implements', actor: t.api.HUMAN }).id
    const noRecord = 'a-made-up-id-that-no-record-holds'
    writeDataBypassingTheGate(t, pipeline, { blockIds: [step, 42, '', noRecord] })
    const current = t.api.getRecord(pipeline)
    if (current === null) throw new Error(`the pipeline ${pipeline} is missing`)
    expect(
      blockIdsOf(current),
      'blockIdsOf keeps the string ids, including one no record holds, and drops a number and an empty string',
    ).toEqual([step, noRecord])

    const { newRows, newReading } = await bothWays(pipeline, project)

    expect(newRows.map((row) => row.id)).toEqual([link])
    expect(newReading.storedIds).toBe(4)
    expect(newReading.problems.map((problem) => problem.at)).toEqual([2, 3, 4])
    expect(newReading.problems.map((problem) => problem.blockId)).toEqual(['', '', noRecord])
    expect(newReading.blocks.map((block) => block.id)).toEqual([step])
    expect(newReading.blocks[0]?.carriers.map((carrierOfStep) => carrierOfStep.linkId)).toEqual([link])
  })
})
