// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import {
  checkSubtraction,
  COMMENTS_NOT_IN_BUCKET_WORDS,
  MARKS_BUCKET_WORDS,
  REVIEW_LIST_BUCKET_WORDS,
  RUN_LIST_BUCKET_WORDS,
  THREAD_LIST_BUCKET_WORDS,
  type LeftOutCounts,
  type LeftOutGroup,
  WORK_LIST_BUCKET_WORDS,
} from '../src/shared/disclosure.ts'
import { targetKey } from '../src/shared/targets.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb() })
afterEach(() => { t.close() })

function declared(reply: { subtraction: LeftOutCounts; leftOutGroups: LeftOutGroup[]; leftOut: number }, omitted: string[]): void {
  checkSubtraction('test reply', reply.subtraction, reply.leftOutGroups)
  expect(reply.subtraction.leftOut).toBe(reply.leftOut)
  expect(reply.leftOutGroups.flatMap((group) => group.ids ?? [])).toEqual(omitted)
  expect(reply.leftOutGroups.every((group) => group.cause === 'budget' && group.bucket === 'row_limit')).toBe(true)
}

it('the work list, its home reading, and the plan context carry every omitted work id', async () => {
  const { readWorkList, homeWorkList, MAX_WORK_ROWS } = await import('../src/server/lib/worklist.ts')
  const { createPlan } = await import('../src/server/lib/plans.ts')
  const { readPlanContext } = await import('../src/server/lib/planreview.ts')
  for (let n = 0; n <= MAX_WORK_ROWS; n += 1) {
    t.api.createRecord({ workspaceId: 'default', kind: 'task', title: `Work ${String(n).padStart(4, '0')}`, data: { state: 'todo' }, actor: AGENT })
  }
  const whole = readWorkList(MAX_WORK_ROWS + 1)
  const cut = readWorkList(2)
  declared(cut, whole.rows.slice(2).map((row) => row.id))
  expect(cut.note).toContain(WORK_LIST_BUCKET_WORDS.row_limit.replace('{count}', String(cut.leftOut)))
  expect(homeWorkList(cut).leftOutGroups).toEqual(cut.leftOutGroups)
  const plan = createPlan({ title: 'A made-up plan' }, AGENT)
  const context = readPlanContext(plan.plan.id, { origin: null })
  declared(context.calculated.workList, whole.rows.slice(MAX_WORK_ROWS).map((row) => row.id))
}, 120_000)

it('conversation, mark, and run ceilings name the omitted members, including mark target keys', async () => {
  const { agentThreads, agentMessages, agentRuns } = await import('../src/server/db/schema.ts')
  const { listThreads, marksIn, listRuns, MAX_ROWS } = await import('../src/server/lib/agents.ts')
  const stamp = '2026-09-30 12:00:00'
  const ids = Array.from({ length: MAX_ROWS + 2 }, (_, n) => `row-${String(n).padStart(4, '0')}`)
  for (const id of ids) {
    t.client.db.insert(agentThreads).values({ id, workspaceId: 'default', title: id, mode: 'review', state: 'open', createdAt: stamp, updatedAt: stamp, createdBy: `human:${THE_TEST_OFFICES_OWNER.id}` }).run()
    t.client.db.insert(agentMessages).values({ id, threadId: id, position: 1, role: 'human', intent: 'review', body: 'Made-up comment', context: JSON.stringify({ target: { kind: 'record', recordId: id, workspaceId: 'default' } }), createdAt: stamp, createdBy: `human:${THE_TEST_OFFICES_OWNER.id}` }).run()
    t.client.db.insert(agentRuns).values({ id, threadId: id, runtime: 'claude-code', request: '{}', createdAt: stamp }).run()
  }
  const threads = listThreads({ workspaceId: 'default' })
  declared(threads, ids.filter((id) => !threads.threads.some((row) => row.id === id)))
  expect(threads.note).toContain(THREAD_LIST_BUCKET_WORDS.row_limit.replace('{count}', String(threads.leftOut)))
  const marks = marksIn('default')
  const keys = ids.map((id) => targetKey({ kind: 'record', recordId: id, workspaceId: 'default' }))
  declared(marks, keys.filter((key) => !marks.marks.some((row) => row.key === key)).sort())
  expect(marks.covers).toContain(MARKS_BUCKET_WORDS.row_limit.replace('{count}', String(marks.leftOut)))
  const runs = listRuns()
  declared(runs, ids.filter((id) => !runs.runs.some((row) => row.id === id)))
  expect(runs.note).toContain(RUN_LIST_BUCKET_WORDS.row_limit.replace('{count}', String(runs.leftOut)))
  declared(marksIn('no-such-project'), [])
})

it('both review reads name the rows beyond their own ceiling', async () => {
  const { reviews } = await import('../src/server/db/schema.ts')
  const { listReviews, commentsNotIn, MAX_ROWS } = await import('../src/server/lib/reviews.ts')
  const stamp = '2026-09-30 12:00:00'
  const ids = Array.from({ length: MAX_ROWS + 2 }, (_, n) => `review-${String(n).padStart(4, '0')}`)
  for (const id of ids) {
    t.client.db.insert(reviews).values({ id, workspaceId: 'default', entry: JSON.stringify({ target: { kind: 'record', recordId: 'outside', workspaceId: 'default' } }), startedAt: stamp, startedBy: `human:${THE_TEST_OFFICES_OWNER.id}` }).run()
  }
  const listed = listReviews({ workspaceId: 'default' })
  declared(listed, ids.slice(MAX_ROWS))
  expect(listed.says).toContain(REVIEW_LIST_BUCKET_WORDS.row_limit.replace('{count}', String(listed.leftOut)))
  const elsewhere = t.api.createRecord({ workspaceId: 'default', kind: 'task', title: 'Elsewhere', data: { state: 'todo' }, actor: AGENT })
  for (let n = 0; n < 3; n += 1) {
    t.api.createRecord({ workspaceId: 'default', kind: 'annotation', title: `Made-up comment ${n}`, data: { context: { target: { kind: 'record', recordId: elsewhere.id, workspaceId: 'default' } }, body: 'Made-up words' }, actor: AGENT })
  }
  const whole = commentsNotIn(ids[0]!, 'default', 10)
  expect(whole.rows).toHaveLength(3)
  const limited = commentsNotIn(ids[0]!, 'default', 1)
  declared(limited, whole.rows.slice(1).map((row) => row.id))
  expect(limited.limits).toContain(COMMENTS_NOT_IN_BUCKET_WORDS.row_limit.replace('{count}', String(limited.leftOut)))
})
