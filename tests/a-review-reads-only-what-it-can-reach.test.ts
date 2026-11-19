// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * A REVIEW WORKS OUT WHAT IT COLLECTS FROM THE RECORDS IT CAN REACH, AND THE ANSWER IS THE ONE THE WHOLE PROJECT GIVES.
 *
 * Until round 15 of wave 13r, `recordsInside` in lib/reviews.ts read every record and every link of the project for
 * each review: about 85 ms a review on an office of the owner’s size, paid once for every review still collecting each time
 * the list of reviews was read. It now reads only what can be reached going down from the record the review was
 * started on. This test builds a project with every way a record can be part of another — a pipeline's stored
 * steps, a part_of link, a part of a part of a part, a deleted part, a pipeline that is itself a part — and asks, for every record, that the review's
 * scope is what `descendantsOf` says when it is handed the whole project. A record held twice and a loop are refused
 * when they are written, so they are not built here. Links of other types are built too, because since round 18 of wave
 * 13y the walk reads only `part_of` links and the records at their ends, and the answer must not change.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb

beforeEach(async () => {
  t = await freshDb()
})

afterEach(() => {
  t.close()
})

describe('what a review collects', () => {
  it('is the same from the records it can reach as from the whole project', async () => {
    const reviews = await import('../src/server/lib/reviews.ts')
    const records = await import('../src/server/lib/records.ts')
    const { descendantsOf } = await import('../src/shared/containment.ts')
    const { db } = await import('../src/server/db/client.ts')
    const { links } = await import('../src/server/db/schema.ts')

    const file = (kind: string, title: string, data: Record<string, unknown> = {}) =>
      t.api.createRecord({ workspaceId: WORKSPACE, kind: kind as never, title, data, actor: HUMAN }).id
    const partOf = (fromId: string, toId: string) => t.api.createLink({ fromId, toId, type: 'part_of', actor: HUMAN })

    const pipeline = file('pipeline', 'Bench check', { blockIds: [] })
    const steps = ['Freeze the model', 'Run the targets', 'Compare'].map(
      (name) => t.blocks.addBlock(pipeline, { name, state: 'todo' }, t.api.HUMAN).block.id,
    )
    const module = file('module', 'The gripper', { context: 'x' })
    const task = file('task', 'Calibrate', { state: 'todo' })
    const deep = file('task', 'Zero the offset', { state: 'todo' })
    const deeper = file('task', 'Write the offset down', { state: 'todo' })
    const gone = file('task', 'Old wiring', { state: 'todo' })
    const loopA = file('module', 'Loop A', { context: 'x' })
    const loopB = file('module', 'Loop B', { context: 'x' })
    const unrelated = file('module', 'The wrist camera', { context: 'x' })
    partOf(task, module)
    partOf(deep, task)
    partOf(deeper, deep)
    partOf(gone, module)
    partOf(pipeline, module)
    partOf(loopB, loopA)
    t.api.deleteRecord(gone, HUMAN)
    // LINKS OF OTHER TYPES, which a review does not follow. Live panelx held about 15,000 `about` links in October 2026.
    const join = (fromId: string, toId: string, type: string) => t.api.createLink({ fromId, toId, type: type as never, actor: HUMAN })
    const problem = file('problem', 'The offset drifts', { state: 'open' })
    const source = file('module', 'The old gripper', { context: 'x' })
    join(problem, task, 'about')
    join(unrelated, module, 'relates_to')
    join(source, deep, 'derived_from')

    const whole = records.listRecords({ workspaceId: WORKSPACE, includeDeleted: true })
    const ids = new Set(whole.map((one) => one.id))
    const everyLink = db
      .select({ id: links.id, fromId: links.fromId, toId: links.toId, type: links.type })
      .from(links)
      .all()
      .filter((one) => ids.has(one.fromId) || ids.has(one.toId))

    const roots = [pipeline, ...steps, module, task, deep, deeper, gone, loopA, loopB, unrelated, problem, source]
    for (const root of roots) {
      const record = records.getRecord(root)
      if (record === null) throw new Error(`${root} was not filed`)
      const walk = descendantsOf(record, { records: whole, links: everyLink })
      const expected = {
        ids: [...new Set([root, ...walk.steps.map((step) => step.id)])].sort(),
        gaps: [...walk.gaps.map((gap) => gap.reason), ...(walk.complete ? [] : [walk.stopped])],
      }
      const scope = reviews.scopeOf({ target: { kind: 'record', recordId: root, workspaceId: WORKSPACE } }, WORKSPACE)
      const got = {
        ids: whole
          .map((one) => one.id)
          .filter((id) => reviews.insideScope(scope, { kind: 'record', recordId: id, workspaceId: WORKSPACE }, WORKSPACE))
          .sort(),
        // A DELETED ROOT IS SAID BY THE SCOPE ITSELF, as a sentence the walk does not make.
        gaps: scope.gaps.filter((gap) => !gap.startsWith('The record this review was started from')),
      }
      expect(got, `the review started on ${record.title}`).toEqual(expected)
    }
    // THE WALK REACHED SOMETHING, so the comparison above is not one of empty answers.
    const fromModule = reviews.scopeOf({ target: { kind: 'record', recordId: module, workspaceId: WORKSPACE } }, WORKSPACE)
    for (const id of [task, deep, deeper, gone, pipeline, ...steps]) {
      expect(reviews.insideScope(fromModule, { kind: 'record', recordId: id, workspaceId: WORKSPACE }, WORKSPACE), id).toBe(true)
    }
    // AND IT READ NOTHING IT COULD REACH ONLY THROUGH ANOTHER TYPE. Wave 13y round 18: reading those made each comments
    // read take 32 to 48 s on the owner's office, though the answer above was the same.
    const moduleRecord = records.getRecord(module)
    if (moduleRecord === null) throw new Error('the module was not filed')
    const read = reviews.whatCanBeReachedFrom(moduleRecord, WORKSPACE)
    const readIds = read.records.map((one) => one.id)
    for (const id of [problem, source, unrelated]) expect(readIds, `the walk read ${id}, reached only through another link type`).not.toContain(id)
    expect(read.links.every((one) => one.type === 'part_of'), 'the walk read a link that is not part_of').toBe(true)
    expect(readIds).toContain(deeper)
  })
})
