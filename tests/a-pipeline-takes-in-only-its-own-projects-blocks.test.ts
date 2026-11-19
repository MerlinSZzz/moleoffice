// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PIPELINE TAKES IN ONLY ITS OWN PROJECT'S BLOCKS.
 *
 * A pipeline's page reads the records of its own project, so a block of another project in its `blockIds` is drawn
 * there as a hole in the order. The record door checked that each listed id is a live block, and not which project it
 * is in. A move of a block that two pipelines list named only one of them. What is held here:
 *   1. A create, a patch, a kind change into a pipeline and putting back an earlier revision are each refused with 409
 *      when the list names a block of another project. The refusal names the block, both projects and the ways out,
 *      and says nothing was written. Nothing is.
 *   2. A block of another project that the pipeline already lists is refused too, when a patch keeps it.
 *   3. A block of the pipeline's own project is taken in, also one that a second pipeline of that project lists.
 *   4. The project asked about is the one the pipeline is filed in. A message that becomes a pipeline is filed in the
 *      project it was written in, so that is the project its blocks must be of.
 *   5. The four checks before the project check still answer first: a deleted block, or a record that is not a block,
 *      of another project is told what it was told before.
 *   6. Only the list that arrives is checked, so a pipeline whose stored list holds a block of another project can
 *      still be given a shorter list.
 *   7. The dry run of a move of a block that two pipelines list names both pipelines, each with its own reason, and the
 *      move it asks for leaves no pipeline in the first project listing the block.
 *
 * Everything here is made up, in a test office of this file's own with two projects of its own. Blocks are made through
 * the block door. Where a case needs a row the doors do not write, it is written straight into the database, and the
 * case says so.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { AGENT, apiApp, expectPanelError, freshDb, type TestDb } from './helpers.ts'
import type { MoveReport } from '../src/server/lib/move.ts'

const HERE = 'made-up-here'
const ELSEWHERE = 'made-up-elsewhere'

let t: TestDb
let app: FastifyInstance
let restoreRevision: typeof import('../src/server/lib/revisions.ts').restoreRevision

beforeAll(async () => {
  t = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: HERE, title: 'A made-up project' })
  createWorkspace({ id: ELSEWHERE, title: 'Another made-up project' })
  ;({ restoreRevision } = await import('../src/server/lib/revisions.ts'))
  ;({ app } = await apiApp())
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
})

let made = 0

/** A pipeline of `project`, filed with an empty list. Each title is its own, so a failure names the case that made it. */
function aPipeline(project: string, title = 'A made-up pipeline'): string {
  made += 1
  return t.api.createRecord({ workspaceId: project, kind: 'pipeline', title: `${title} ${String(made)}`, data: { blockIds: [] }, actor: t.api.HUMAN }).id
}

/** A block added to `pipeline` through the block door. */
function aBlock(pipeline: string, name = 'A made-up step'): string {
  made += 1
  return t.blocks.addBlock(pipeline, { name: `${name} ${String(made)}`, state: 'todo' }, t.api.HUMAN).block.id
}

/** A block of the other project, listed by a pipeline of that project. */
const aBlockElsewhere = (): string => aBlock(aPipeline(ELSEWHERE, 'A made-up pipeline elsewhere'), 'A made-up step elsewhere')

/** A block of this project that two pipelines of this project list. */
function aBlockTwoPipelinesList(): { first: string; second: string; block: string } {
  const first = aPipeline(HERE)
  const block = aBlock(first)
  const second = aPipeline(HERE)
  t.api.patchRecord(second, { dataPatch: { blockIds: [block] } }, t.api.HUMAN)
  return { first, second, block }
}

/**
 * Puts a block in the other project straight in the database, and leaves its pipeline where it is. A move door carries
 * a block's pipelines with it. This row stands for a row an import or a hand could write.
 */
function movedElsewhereByHand(block: string): void {
  t.client.sqlite.prepare('UPDATE records SET workspace_id = ? WHERE id = ?').run(ELSEWHERE, block)
}

const listOf = (pipeline: string): unknown => t.api.getRecord(pipeline)?.data['blockIds']
const revisionsOf = (id: string): number =>
  (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n
const recordsTitled = (title: string): number =>
  (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records WHERE title = ?').get(title) as { n: number }).n
const titleOf = (id: string): string => t.api.getRecord(id)?.title ?? '(no record has this id)'
const projectOf = (id: string): string | undefined =>
  (t.client.sqlite.prepare('SELECT workspace_id AS project FROM records WHERE id = ?').get(id) as { project: string } | undefined)?.project

/** The pipelines of `project` whose stored list names `block`, read with SQL. */
const pipelinesListing = (block: string, project: string): string[] =>
  (
    t.client.sqlite
      .prepare("SELECT r.id AS id FROM records r, json_each(r.data, '$.blockIds') j WHERE r.kind = 'pipeline' AND r.workspace_id = ? AND j.value = ?")
      .all(project, block) as { id: string }[]
  ).map((row) => row.id)

/** What each of these refusals says: the block by title and id, its project, the pipeline's project, and that nothing was written. */
function expectTheRefusalToName(message: string, block: string, pipelineProject: string): void {
  expect(message, "the block's title").toContain(`"${titleOf(block)}"`)
  expect(message, "the block's id").toContain(block)
  expect(message, "the block's project").toContain(`"${projectOf(block) ?? '(no record has this id)'}"`)
  expect(message, "the pipeline's project").toContain(`"${pipelineProject}"`)
  expect(message).toContain('Nothing was written')
}

/** A move of one record, through the route, as an agent working in this project asks it. */
function move(id: string, body: { to: string; also?: string[]; dryRun?: boolean }): Promise<{ statusCode: number; body: string; json: () => unknown }> {
  return app.inject({
    method: 'POST',
    url: `/api/records/${id}/workspace`,
    headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.id, 'x-mole-office-workspace': HERE },
    payload: body,
  })
}

describe('a pipeline takes in only its own project\'s blocks', () => {
  it('1. refuses a create whose list names a block of another project, and files nothing', () => {
    const block = aBlockElsewhere()
    const title = 'A made-up pipeline that is never filed'
    const err = expectPanelError(
      t,
      () => t.api.createRecord({ workspaceId: HERE, kind: 'pipeline', title, data: { blockIds: [block] }, actor: t.api.HUMAN }),
      409,
    )
    expectTheRefusalToName(err.message, block, HERE)
    // There is no pipeline id yet, and the way out says so as the other refusal of a create does.
    expect(err.message).toContain("POST /api/records/<this pipeline's id>/blocks")
    expect(recordsTitled(title), 'records filed under that title').toBe(0)
  })

  it('2. refuses a patch that adds a block of another project, and leaves the list and the revisions as they were', () => {
    const pipeline = aPipeline(HERE)
    const own = aBlock(pipeline)
    const block = aBlockElsewhere()
    const revisionsBefore = revisionsOf(pipeline)
    const err = expectPanelError(t, () => t.api.patchRecord(pipeline, { dataPatch: { blockIds: [own, block] } }, t.api.HUMAN), 409)
    expectTheRefusalToName(err.message, block, HERE)
    // The two ways out: a block of this project, or a move of one of the two records, which a dry run reports first.
    expect(err.message).toContain(`POST /api/records/${pipeline}/blocks`)
    expect(err.message).toContain(`POST /api/records/${block}/workspace`)
    expect(err.message).toContain(`POST /api/records/${pipeline}/workspace`)
    expect(err.message).toContain('"dryRun":true')
    expect(listOf(pipeline)).toEqual([own])
    expect(revisionsOf(pipeline), 'revisions of the pipeline').toBe(revisionsBefore)
  })

  it('3. refuses a kind change into a pipeline that would bring a block of another project with it', () => {
    const block = aBlockElsewhere()
    const note = t.api.createRecord({
      workspaceId: HERE,
      kind: 'note',
      title: 'A made-up note carrying a list',
      data: { body: 'A made-up note.', extra: { blockIds: [block] } },
      actor: t.api.HUMAN,
    }).id
    const revisionsBefore = revisionsOf(note)
    const err = expectPanelError(t, () => t.api.patchRecord(note, { kind: 'pipeline' }, t.api.HUMAN), 409)
    expectTheRefusalToName(err.message, block, HERE)
    expect(t.api.getRecord(note)?.kind, 'it is still a note').toBe('note')
    expect(revisionsOf(note), 'revisions of the note').toBe(revisionsBefore)
  })

  it('4. refuses putting back an earlier revision whose list names a block of another project', () => {
    const pipeline = aPipeline(HERE)
    const own = aBlock(pipeline)
    const block = aBlockElsewhere()
    // The pipeline's first revision is given a list naming the other project's block straight in the database. It
    // stands for a row an import or a hand could write.
    t.client.sqlite.prepare('UPDATE revisions SET data = ? WHERE record_id = ? AND seq = 1').run(JSON.stringify({ blockIds: [own, block] }), pipeline)
    const revisionsBefore = revisionsOf(pipeline)
    const err = expectPanelError(t, () => restoreRevision(pipeline, 1, t.api.HUMAN), 409)
    expectTheRefusalToName(err.message, block, HERE)
    expect(listOf(pipeline)).toEqual([own])
    expect(revisionsOf(pipeline), 'revisions of the pipeline').toBe(revisionsBefore)
  })

  it('5. takes in a block of its own project, also one a second pipeline of that project lists', () => {
    const { first, second, block } = aBlockTwoPipelinesList()
    expect(listOf(second)).toEqual([block])
    const filed = t.api.createRecord({
      workspaceId: HERE,
      kind: 'pipeline',
      title: 'A made-up pipeline filed with a list',
      data: { blockIds: [block] },
      actor: t.api.HUMAN,
    }).id
    expect(listOf(filed)).toEqual([block])
    expect(listOf(first)).toEqual([block])
  })

  it('6. refuses a block of another project the pipeline already lists, when a patch keeps it and adds one of its own project', () => {
    const pipeline = aPipeline(HERE)
    const own = aBlock(pipeline)
    const gone = aBlock(pipeline)
    movedElsewhereByHand(gone)
    const another = aBlock(aPipeline(HERE))
    const revisionsBefore = revisionsOf(pipeline)
    const err = expectPanelError(t, () => t.api.patchRecord(pipeline, { dataPatch: { blockIds: [own, gone, another] } }, t.api.HUMAN), 409)
    expectTheRefusalToName(err.message, gone, HERE)
    expect(listOf(pipeline)).toEqual([own, gone])
    expect(revisionsOf(pipeline), 'revisions of the pipeline').toBe(revisionsBefore)
  })

  it('7. names both pipelines in the dry run of a move of a block two pipelines list, each with its own reason', async () => {
    const { first, second, block } = aBlockTwoPipelinesList()
    const res = await move(block, { to: ELSEWHERE, dryRun: true })
    expect(res.statusCode, res.body).toBe(200)
    const report = res.json() as MoveReport
    expect([...report.needsAlso].sort(), 'what the move asks to come with the block').toEqual([first, second].sort())
    for (const [pipeline, other] of [
      [first, second],
      [second, first],
    ] as const) {
      const why = report.moving.find((each) => each.id === pipeline)?.forcedBy?.why ?? '(nothing forces it)'
      expect(why, `why ${pipeline} must move`).toContain(pipeline)
      expect(why, `why ${pipeline} must move`).toContain(`"${titleOf(pipeline)}"`)
      expect(why, `why ${pipeline} must move`).not.toContain(other)
    }
  })

  it('8. leaves no pipeline in the first project listing the block, once the move the dry run asks for is made', async () => {
    const { block } = aBlockTwoPipelinesList()
    const dry = await move(block, { to: ELSEWHERE, dryRun: true })
    expect(dry.statusCode, dry.body).toBe(200)
    const res = await move(block, { to: ELSEWHERE, also: (dry.json() as MoveReport).needsAlso })
    expect(res.statusCode, res.body).toBe(200)
    expect(projectOf(block)).toBe(ELSEWHERE)
    expect(pipelinesListing(block, HERE), 'pipelines of the first project that list the block').toEqual([])
  })

  it('9. asks about the project a message that becomes a pipeline is filed in, which is the project it was written in', () => {
    const pointedAt = aPipeline(HERE)
    const own = aBlock(pointedAt)
    /** A comment written in this project to nobody, carrying a list for the pipeline it will become. */
    const aCommentCarrying = (block: string): string => {
      made += 1
      return t.api.createRecord({
        workspaceId: HERE,
        kind: 'message',
        title: `A made-up comment carrying a list ${String(made)}`,
        data: {
          body: 'A made-up comment.',
          target: { target: { kind: 'record', recordId: pointedAt, workspaceId: HERE } },
          extra: { blockIds: [block] },
        },
        actor: t.api.HUMAN,
      }).id
    }

    const taken = aCommentCarrying(own)
    expect(projectOf(taken), 'a message is kept in the message centre').not.toBe(HERE)
    t.api.patchRecord(taken, { kind: 'pipeline' }, t.api.HUMAN)
    expect(projectOf(taken), 'the pipeline is filed in the project the comment was written in').toBe(HERE)
    expect(listOf(taken)).toEqual([own])

    const block = aBlockElsewhere()
    const refused = aCommentCarrying(block)
    const err = expectPanelError(t, () => t.api.patchRecord(refused, { kind: 'pipeline' }, t.api.HUMAN), 409)
    expectTheRefusalToName(err.message, block, HERE)
    expect(t.api.getRecord(refused)?.kind, 'it is still a message').toBe('message')
  })

  it('10. tells a deleted block, or a record that is not a block, of another project what it was told before', () => {
    const pipeline = aPipeline(HERE)
    const own = aBlock(pipeline)
    const elsewhere = aPipeline(ELSEWHERE, 'A made-up pipeline elsewhere')
    const deleted = aBlock(elsewhere, 'A made-up step elsewhere')
    t.blocks.removeBlock(elsewhere, deleted, t.api.HUMAN)
    const wasDeleted = expectPanelError(t, () => t.api.patchRecord(pipeline, { dataPatch: { blockIds: [own, deleted] } }, t.api.HUMAN), 400)
    expect(wasDeleted.message).toContain(deleted)
    const note = t.api.createRecord({ workspaceId: ELSEWHERE, kind: 'note', title: 'A made-up note elsewhere', data: { body: 'A made-up note.' }, actor: t.api.HUMAN }).id
    const notABlock = expectPanelError(t, () => t.api.patchRecord(pipeline, { dataPatch: { blockIds: [own, note] } }, t.api.HUMAN), 400)
    expect(notABlock.message).toContain(note)
    expect(listOf(pipeline)).toEqual([own])
  })

  it('11. checks only the list that arrives, so a pipeline holding a block of another project can still be given a shorter list', () => {
    const pipeline = aPipeline(HERE)
    const own = aBlock(pipeline)
    const gone = aBlock(pipeline)
    movedElsewhereByHand(gone)
    t.blocks.removeBlock(pipeline, gone, t.api.HUMAN)
    expect(listOf(pipeline)).toEqual([own])
  })
})
