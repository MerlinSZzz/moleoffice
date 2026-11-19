// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PIPELINE BROUGHT BACK HAS ITS LIST CHECKED.
 *
 * Deleting a pipeline leaves its blocks as they are. Only a live pipeline's list holds a block back from a delete, so
 * the delete door then lets a block the deleted pipeline lists go. Bringing the pipeline back checked nothing, so it
 * came back listing a deleted block, or a block that had been put in another project. What is held here:
 *   1. A restore of a pipeline listing a block deleted while the pipeline was gone is refused, with the status a write
 *      of that list gets. The refusal names the block and the block's restore door. Nothing is written: the pipeline
 *      stays deleted, and its revisions and change rows are as they were. Once the block is brought back, the pipeline
 *      comes back.
 *   2. The same for a block of another project, whose refusal names the block's move door. Once the block is moved
 *      back, the pipeline comes back.
 *   3. An id no record holds, a record that is not a block, and an id listed twice are refused the same way, and the
 *      refusal names the pipeline's patch door. Once the list is corrected through it, the pipeline comes back.
 *   4. Each of those doors takes a deleted pipeline's block or list: the restore of a block, the move of a block back
 *      into the pipeline's project, and a patch of the pipeline's list.
 *   5. A pipeline whose list is good comes back.
 *
 * Everything here is made up, in a test office of this file's own with two projects of its own. Blocks are made through
 * the block door. Where a case needs a row the doors do not write, it is written straight into the database, and the
 * case says so.
 */
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'made-up-here'
const ELSEWHERE = 'made-up-elsewhere'
/** An id no record holds. */
const NOBODYS = 'made-up-id-that-no-record-holds'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: HERE, title: 'A made-up project' })
  createWorkspace({ id: ELSEWHERE, title: 'Another made-up project' })
  ;({ app } = await apiApp())
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
})

let made = 0

/** A pipeline of this project, filed with an empty list. Each title is its own, so a failure names the case that made it. */
function aPipeline(): string {
  made += 1
  return t.api.createRecord({ workspaceId: HERE, kind: 'pipeline', title: `A made-up pipeline ${String(made)}`, data: { blockIds: [] }, actor: t.api.HUMAN }).id
}

/** A block added to `pipeline` through the block door. */
function aBlock(pipeline: string): string {
  made += 1
  return t.blocks.addBlock(pipeline, { name: `A made-up step ${String(made)}`, state: 'todo' }, t.api.HUMAN).block.id
}

/** A note of this project: a record that is not a block. */
function aNote(): string {
  made += 1
  return t.api.createRecord({ workspaceId: HERE, kind: 'note', title: `A made-up note ${String(made)}`, data: { body: 'A made-up note.' }, actor: t.api.HUMAN }).id
}

/** A request to a door, as the test office's owner working in `project`. */
function ask(method: 'POST' | 'PATCH', url: string, project: string, payload?: Record<string, unknown>): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url,
    headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': project },
    ...(payload === undefined ? {} : { payload }),
  })
}

const restore = (id: string, project = HERE): Promise<LightMyRequestResponse> => ask('POST', `/api/records/${id}/restore`, project)
const moveBack = (block: string): Promise<LightMyRequestResponse> => ask('POST', `/api/records/${block}/workspace`, ELSEWHERE, { to: HERE })
const patchList = (pipeline: string, ids: string[]): Promise<LightMyRequestResponse> =>
  ask('PATCH', `/api/records/${pipeline}`, HERE, { dataPatch: { blockIds: ids } })
const errorOf = (res: LightMyRequestResponse): string => String((res.json() as { error?: unknown }).error)

/** A record's row as stored, deleted or not. */
const storedRow = (id: string): { project: string; deletedAt: string | null; data: string } =>
  t.client.sqlite.prepare('SELECT workspace_id AS project, deleted_at AS deletedAt, data FROM records WHERE id = ?').get(id) as {
    project: string
    deletedAt: string | null
    data: string
  }
const isDeleted = (id: string): boolean => storedRow(id).deletedAt !== null
const storedList = (pipeline: string): string[] => (JSON.parse(storedRow(pipeline).data) as { blockIds: string[] }).blockIds
const revisionsOf = (id: string): number =>
  (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n
const changesOf = (id: string): number => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes WHERE record_id = ?').get(id) as { n: number }).n

/** Writes a pipeline's list straight into the database. It stands for a row an import or a hand could write. */
function listByHand(pipeline: string, ids: string[]): void {
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.blockIds', json(?)) WHERE id = ?").run(JSON.stringify(ids), pipeline)
}

/** Puts a block in the other project straight in the database. It stands for a row an import or a hand could write. */
function movedElsewhereByHand(block: string): void {
  t.client.sqlite.prepare('UPDATE records SET workspace_id = ? WHERE id = ?').run(ELSEWHERE, block)
}

/** The status a write of `ids` into a pipeline of this project is refused with, as the write's own check gives it. */
function statusOfAWriteOf(ids: string[]): number {
  try {
    t.api.checkBlockIds(null, HERE, ids)
  } catch (err) {
    if (err instanceof t.api.PanelError) return err.status
    throw err
  }
  throw new Error(`a write of ${JSON.stringify(ids)} would be taken, and this case needs a list a write refuses`)
}

/**
 * Asks the restore door to bring `pipeline` back, and expects it refused with the status a write of its stored list
 * gets, naming `entry`. Nothing is written. Hands back the refusal's words.
 */
async function expectTheRestoreRefused(pipeline: string, entry: string): Promise<string> {
  const status = statusOfAWriteOf(storedList(pipeline))
  const revisions = revisionsOf(pipeline)
  const changes = changesOf(pipeline)
  const res = await restore(pipeline)
  expect(res.statusCode, res.body).toBe(status)
  const message = errorOf(res)
  expect(message, 'the entry').toContain(entry)
  expect(isDeleted(pipeline), 'the pipeline is still deleted').toBe(true)
  expect(revisionsOf(pipeline), 'revisions of the pipeline').toBe(revisions)
  expect(changesOf(pipeline), 'change rows of the pipeline').toBe(changes)
  return message
}

/** Brings `pipeline` back through the restore door, and expects it live. */
async function expectTheRestoreTaken(pipeline: string): Promise<void> {
  const res = await restore(pipeline)
  expect(res.statusCode, res.body).toBe(200)
  expect(isDeleted(pipeline), 'the pipeline is live').toBe(false)
}

describe('a pipeline brought back has its list checked', () => {
  it('1. refuses a pipeline listing a block deleted while it was gone, and brings it back once the block is back', async () => {
    const pipeline = aPipeline()
    aBlock(pipeline)
    const block = aBlock(pipeline)
    t.api.deleteRecord(pipeline, t.api.HUMAN)
    // The delete door lets the block go, since no live pipeline lists it.
    t.api.deleteRecord(block, t.api.HUMAN)
    const message = await expectTheRestoreRefused(pipeline, block)
    expect(message, 'the way out').toContain(`/api/records/${block}/restore`)
    const blockBack = await restore(block)
    expect(blockBack.statusCode, blockBack.body).toBe(200)
    await expectTheRestoreTaken(pipeline)
  })

  it('2. refuses a pipeline listing a block put in another project while it was gone, and brings it back once the block is moved back', async () => {
    const pipeline = aPipeline()
    aBlock(pipeline)
    const block = aBlock(pipeline)
    t.api.deleteRecord(pipeline, t.api.HUMAN)
    // The move door does not make this state: it asks for the pipeline that lists the block to come with it, a deleted
    // pipeline too.
    const tried = await ask('POST', `/api/records/${block}/workspace`, HERE, { to: ELSEWHERE })
    expect(tried.statusCode, tried.body).not.toBe(200)
    expect(errorOf(tried), 'the pipeline the move door asks to come along').toContain(pipeline)
    expect(storedRow(block).project).toBe(HERE)
    movedElsewhereByHand(block)
    const message = await expectTheRestoreRefused(pipeline, block)
    expect(message, "the block's project").toContain(ELSEWHERE)
    expect(message, "the pipeline's project").toContain(HERE)
    expect(message, 'the way out').toContain(`/api/records/${block}/workspace`)
    const moved = await moveBack(block)
    expect(moved.statusCode, moved.body).toBe(200)
    await expectTheRestoreTaken(pipeline)
  })

  it.each([
    ['an id no record holds', (): string => NOBODYS],
    ['a record that is not a block', (): string => aNote()],
    ['an id listed twice', (own: string): string => own],
  ])('3. refuses a pipeline listing %s, names its patch door, and brings it back once the list is patched', async (_, entryFor) => {
    const pipeline = aPipeline()
    const own = aBlock(pipeline)
    const entry = entryFor(own)
    t.api.deleteRecord(pipeline, t.api.HUMAN)
    // A write door refuses this list, so it is written straight into the database.
    listByHand(pipeline, [own, entry])
    const message = await expectTheRestoreRefused(pipeline, entry)
    expect(message, 'the way out').toContain(`/api/records/${pipeline}`)
    const patched = await patchList(pipeline, [own])
    expect(patched.statusCode, patched.body).toBe(200)
    await expectTheRestoreTaken(pipeline)
  })

  it('4. lets each door a refusal names take a deleted pipeline\'s block or list', async () => {
    const pipeline = aPipeline()
    const own = aBlock(pipeline)
    const gone = aBlock(pipeline)
    const moved = aBlock(pipeline)
    t.api.deleteRecord(pipeline, t.api.HUMAN)
    t.api.deleteRecord(gone, t.api.HUMAN)
    movedElsewhereByHand(moved)
    listByHand(pipeline, [own, gone, moved, NOBODYS])

    const blockBack = await restore(gone)
    expect(blockBack.statusCode, blockBack.body).toBe(200)
    expect(isDeleted(gone), 'the block is live').toBe(false)
    const movedBack = await moveBack(moved)
    expect(movedBack.statusCode, movedBack.body).toBe(200)
    expect(storedRow(moved).project, "the block is in the pipeline's project").toBe(HERE)
    expect(isDeleted(pipeline), 'the move left the pipeline deleted').toBe(true)
    const patched = await patchList(pipeline, [own, gone, moved])
    expect(patched.statusCode, patched.body).toBe(200)
    expect(storedList(pipeline)).toEqual([own, gone, moved])
    expect(isDeleted(pipeline), 'the patch left the pipeline deleted').toBe(true)
  })

  it('5. brings back a pipeline whose list is good', async () => {
    const pipeline = aPipeline()
    const first = aBlock(pipeline)
    const second = aBlock(pipeline)
    t.api.deleteRecord(pipeline, t.api.HUMAN)
    await expectTheRestoreTaken(pipeline)
    expect(storedList(pipeline)).toEqual([first, second])
  })
})
