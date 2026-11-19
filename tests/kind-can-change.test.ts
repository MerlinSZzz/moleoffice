// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old sweep covered every kind. It now covers every ordinarily convertible kind: sealed_tip is office-created and immutable in both directions, exercised in sealed-submission.test.ts. */
/**
 * A record's kind can be corrected after it is filed, and nothing it was holding is lost.
 *
 * Every test here is written from one sentence of the owner's, section 3 of
 * design/ROUND-SEVEN-OWNER-MESSAGE.md:
 *
 *   "After I file/track a planning line, I currently cannot naturally change what kind of thing it
 *    is. A mistaken first choice must not permanently lock the record. If changing type makes some
 *    canonical fields invalid, preserve what can be preserved and surface the real incompatibility.
 *    Do not silently discard data, and do not force the human to delete/recreate the line merely to
 *    correct the type."
 *
 * So these do not check that a PATCH with a kind returns 200 and stop. The four things they check
 * are the four halves of that sentence:
 *
 *   1. THE CHANGE HAPPENS, from the ordinary surface, with no delete and no recreate.
 *   2. NOTHING STORED IS DISCARDED. The sweep at the bottom takes every kind's own worked example
 *      out of KIND_SPECS, changes the record to every other kind in turn, and asserts that every
 *      value the example held is still readable afterwards — at its own key, or inside `extra`.
 *      That is 200-odd changes, and one dropped field anywhere fails it.
 *   3. WHAT MOVED IS NAMED. A preserved field nobody is told about is a field they will look for
 *      where it used to be. The reply names each one and the exact path it is at now.
 *   4. A REAL INCOMPATIBILITY IS REFUSED, with a sentence saying what to do instead — and every
 *      such refusal leaves the record exactly as it was.
 *
 * HOW THE HTTP TESTS ARE BUILT is the same arrangement tests/patch.test.ts uses and for the same
 * reason: src/server/index.ts listens on a port the moment it is imported, so the routes are
 * registered here against a throwaway database instead.
 */

import { KIND_SPECS } from '@shared/kinds.ts'
import { RECORD_KINDS, type RecordKind } from '@shared/types.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { AGENT, expectPanelError, freshDb, type TestDb } from './helpers.ts'
import { readFileSync } from 'node:fs'
import { NOTEBOOK_KIND, THE_NOTEBOOK_DOOR } from '@shared/notebook.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

// ------------------------------------------------------------------------------ the harness

interface Harness {
  db: TestDb
  app: FastifyInstance
}

async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  const app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.ready()
  // THE WRITER THIS FILE ACTS AS IS REGISTERED. Two cases below write a message addressed to the
  // person, and criterion M59 refuses one from an agent no registry holds. `AS_AGENT` and `AGENT`
  // both act as `claude-code`, so that is the handle registered here. Nothing else in this file
  // depends on the registry.
  db.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'The agent this file acts as',
    data: { handle: 'claude-code', runtime: 'claude-code', state: 'active' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, sessionId: null },
  })
  return { db, app }
}

/** What an agent's requests carry. Matches AGENT in helpers.ts, so the two routes agree on who acted. */
const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-test',
}

/** The person, said out loud, which is what the human-only kinds need. */
const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, sessionId: null } as const

function bodyOf(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 200)}`)
  }
  return parsed as Record<string, unknown>
}

function errorOf(res: { body: string }): string {
  const message = bodyOf(res)['error']
  if (typeof message !== 'string') throw new Error(`expected an error string, got ${res.body.slice(0, 200)}`)
  return message
}

/** The `kindChange` report of a successful patch, checked to be there. */
function kindChangeOf(res: { body: string }): {
  from: string
  to: string
  changed: boolean
  kept: { key: string; nowAt: string; why: string; plainly: string }[]
  broughtBack: { key: string; wasAt: string; restored: boolean; why: string; plainly: string }[]
  /** What a person reads. No stored paths, no requests. */
  note: string
  /** The same news with the exact places in it, for an agent and for Developer mode. */
  detail: string
} {
  const report = bodyOf(res)['kindChange']
  if (typeof report !== 'object' || report === null) {
    throw new Error(`expected a kindChange report, got ${res.body.slice(0, 400)}`)
  }
  return report as ReturnType<typeof kindChangeOf>
}

function dataOf(record: unknown): Record<string, unknown> {
  if (typeof record !== 'object' || record === null) throw new Error('expected a record')
  const data = (record as Record<string, unknown>)['data']
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`expected data to be an object, got ${JSON.stringify(data)}`)
  }
  return data as Record<string, unknown>
}

function extraOf(record: unknown): Record<string, unknown> {
  const extra = dataOf(record)['extra']
  if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) {
    throw new Error(`expected data.extra to be an object, got ${JSON.stringify(extra)}`)
  }
  return extra as Record<string, unknown>
}

// ---------------------------------------------------------------- the mistake being corrected

describe('a mistaken first choice of kind can be corrected from the ordinary patch', () => {
  let h: Harness
  beforeAll(async () => {
    h = await freshApp()
  })
  afterAll(() => h.db.close())

  it('changes the kind, and the record keeps its id, its title and its project', async () => {
    const before = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'the gripper drops at 50 mm',
      summary: 'seen on every run since Tuesday',
      data: { state: 'blocked' },
      actor: AGENT,
    })

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${before.id}`,
      headers: AS_AGENT,
      payload: { kind: 'problem' },
    })
    expect(res.statusCode, res.body).toBe(200)

    const after = bodyOf(res)['record'] as Record<string, unknown>
    expect(after['kind']).toBe('problem')
    // The three things a kind change must not touch. `origin` is the record's provenance and
    // `workspaceId` is which project it belongs to; neither is a fact about what kind of thing it
    // is, and a write that quietly moved either would be a record relabelling itself.
    expect(after['id']).toBe(before.id)
    expect(after['title']).toBe('the gripper drops at 50 mm')
    expect(after['summary']).toBe('seen on every run since Tuesday')
    expect(after['workspaceId']).toBe(before.workspaceId)
    expect(after['origin']).toBe(before.origin)
    expect(after['createdAt']).toBe(before.createdAt)
  })

  it('keeps a field the new kind has no place for, inside extra, under the key it already had', async () => {
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'reprint the gripper',
      data: { state: 'doing', command: 'make print-gripper', also_waiting_on: 'PETG stock' },
      actor: AGENT,
    })

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'problem' },
    })
    expect(res.statusCode, res.body).toBe(200)

    const record = bodyOf(res)['record']
    // Not one of these three is a field a problem has, and every one of them is still readable.
    expect(extraOf(record)).toEqual({
      state: 'doing',
      command: 'make print-gripper',
      also_waiting_on: 'PETG stock',
    })
    // ...and none of them is left at the top level, where a problem's own validation would refuse it.
    expect(Object.keys(dataOf(record))).toEqual(['extra'])
  })

  it('names every field that moved and the exact path it is at now', async () => {
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'reprint the gripper',
      data: { state: 'doing', command: 'make print-gripper' },
      actor: AGENT,
    })

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'problem' },
    })
    const report = kindChangeOf(res)

    expect(report.from).toBe('task')
    expect(report.to).toBe('problem')
    expect(report.changed).toBe(true)
    expect(report.kept.map((k) => k.key).sort()).toEqual(['command', 'state'])
    // The PATH and not only the field. "your command was preserved" leaves somebody looking for it.
    expect(report.kept.map((k) => k.nowAt).sort()).toEqual(['data.extra.command', 'data.extra.state'])
    for (const kept of report.kept) {
      expect(kept.why.length, `the reason "${kept.key}" moved is too short to be one`).toBeGreaterThan(20)
    }
    // THE EXACT PLACES ARE IN `detail`, and `note` is the same news in the words a person reads.
    // The two were one string until 18 August 2026, and the one string was what a roboticist met in
    // a ninety-pixel cell in the plan table. tests/kind-change-and-plain-replies.test.ts is what
    // keeps a path out of `note` from here on.
    expect(report.detail).toContain('data.extra.command')
    expect(report.detail).toContain('data.extra.state')
    expect(report.note).not.toContain('data.extra')
    expect(report.note).toContain('A problem has no command')
    expect(report.note).toContain('state does not mean the same thing on a problem')
  })

  it('moves a value the new kind cannot hold even though it declares the field, and says why', async () => {
    // A draft stores `for` as a list of participants, and a report stores it as one string. Both kinds declare the
    // key, so a change that only looked at key names would store the list on a report and leave a record its own
    // validation refuses. THIS WAS A MESSAGE'S `read` UNTIL 29 SEPTEMBER 2026: a message stays a message now
    // so a draft is the pair that shows the same thing.
    const draft = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'draft',
      title: 'the print cracked again',
      data: { body: 'Holding the sweep until you say whether to try PETG.', for: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }], becomes: 'report' },
      actor: AGENT,
    })

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${draft.id}`,
      headers: AS_AGENT,
      payload: { kind: 'report' },
    })
    expect(res.statusCode, res.body).toBe(200)

    const report = kindChangeOf(res)
    const forMoved = report.kept.find((k) => k.key === 'for')
    expect(forMoved, `"for" was not reported as moved: ${JSON.stringify(report.kept)}`).toBeDefined()
    // The reason is the write gate's own sentence. Nothing here restates the shape.
    expect(forMoved?.why.length).toBeGreaterThan(20)
    expect(extraOf(bodyOf(res)['record'])['for']).toEqual([{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }])

    // ...and the record really is valid as a report now: reading it back is what proves it, because
    // the gate that would have refused the list runs on the way in and not on the way out.
    const stored = h.db.api.getRecord(draft.id)
    expect(stored?.kind).toBe('report')
    const { validateData } = await import('@shared/kinds.ts')
    expect(validateData('report', stored?.data).ok, JSON.stringify(stored?.data)).toBe(true)
  })

  it('lets the record become incomplete, and says what it now wants, in the report every other write uses', async () => {
    const draft = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'draft',
      title: 'the print cracked again',
      data: { body: 'Holding the sweep.', for: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }], becomes: 'report' },
      actor: AGENT,
    })

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${draft.id}`,
      headers: AS_AGENT,
      payload: { kind: 'report' },
    })
    expect(res.statusCode, res.body).toBe(200)

    // Incomplete is a real state and must not block the correction. A report needs three fields the
    // draft does not hold in a shape a report can keep, and the record has none of them.
    const incomplete = bodyOf(res)['incomplete'] as { path: string }[]
    expect(incomplete.map((i) => i.path).sort()).toEqual(['data.blocks', 'data.date', 'data.for'])
    // Reported through the SAME mechanism a create and an ordinary patch use, not a second one.
    const { completenessOf } = await import('@shared/kinds.ts')
    const stored = h.db.api.getRecord(draft.id)
    expect(incomplete).toEqual(completenessOf('report', stored?.data))
  })
})

// ---------------------------------------------------------------------------- the same kind

describe('changing a kind to the kind it already is', () => {
  let h: Harness
  beforeAll(async () => {
    h = await freshApp()
  })
  afterAll(() => h.db.close())

  it('answers plainly that nothing changed, and writes no change row and no timestamp', async () => {
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'reprint the gripper',
      data: { state: 'doing' },
      actor: AGENT,
    })
    const rowsBefore = h.db.api.listChanges({ workspaceId: 'default', recordId: task.id }).length

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'task' },
    })
    expect(res.statusCode, res.body).toBe(200)

    const report = kindChangeOf(res)
    expect(report.changed).toBe(false)
    expect(report.from).toBe('task')
    expect(report.to).toBe('task')
    expect(report.note.toLowerCase()).toContain('already a task')

    // No change row saying a task became a task. A history that has to be read to discover that
    // nothing happened is worse than no row at all.
    expect(h.db.api.listChanges({ workspaceId: 'default', recordId: task.id }).length).toBe(rowsBefore)
    // ...and `updatedAt` did not move, so the record does not climb every list that orders by it.
    expect(h.db.api.getRecord(task.id)?.updatedAt).toBe(task.updatedAt)
  })
})

// ------------------------------------------------------------------------------- the refusals

describe('a kind this record may not become is refused, and the refusal says what to do', () => {
  let h: Harness
  beforeAll(async () => {
    h = await freshApp()
  })
  afterAll(() => h.db.close())

  it('refuses a kind nothing declares, and names the kinds that exist', async () => {
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'reprint the gripper',
      actor: AGENT,
    })

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'blocker' },
    })
    expect(res.statusCode, res.body).toBe(400)
    // Every kind, so a caller that guessed wrong can pick the right one without a second request.
    for (const kind of RECORD_KINDS) expect(errorOf(res)).toContain(kind)
    expect(h.db.api.getRecord(task.id)?.kind).toBe('task')
  })

  it('refuses a kind nothing declares for a caller that never goes through HTTP either', () => {
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'reprint the gripper',
      actor: AGENT,
    })
    // The seed, the importer and the tests call patchRecord directly, so the rule cannot live in
    // the route's schema alone.
    const err = expectPanelError(
      h.db,
      () => h.db.api.patchRecord(task.id, { kind: 'blocker' as RecordKind }, AGENT),
      400,
    )
    for (const kind of RECORD_KINDS) expect(err.message).toContain(kind)
  })

  it('refuses to make a record into a block, in the words a bare create is refused with', async () => {
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'calibrate the wrist camera',
      actor: AGENT,
    })

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'block' },
    })
    expect(res.statusCode, res.body).toBe(400)
    // The sentence is `blockMustBeFiledInAPipeline`'s, imported rather than written again, so this
    // refusal and the one a bare POST gets cannot come to disagree about what a block is.
    const { blockMustBeFiledInAPipeline } = await import('../src/server/lib/records.ts')
    expect(errorOf(res)).toContain(blockMustBeFiledInAPipeline('calibrate the wrist camera'))
    expect(h.db.api.getRecord(task.id)?.kind).toBe('task')
  })

  it('refuses to change a block that a pipeline still lists, and names the pipeline and the way out', async () => {
    const pipeline = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'pipeline',
      title: 'handover',
      data: { blockIds: [] },
      actor: AGENT,
    })
    const added = h.db.blocks.addBlock(pipeline.id, { name: 'grasp', state: 'todo' }, AGENT)

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${added.block.id}`,
      headers: AS_AGENT,
      payload: { kind: 'task' },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(errorOf(res)).toContain('handover')
    expect(errorOf(res)).toContain(`DELETE /api/records/${pipeline.id}/blocks/${added.block.id}`)

    // Nothing was written, and the pipeline can still be written to — which is the whole reason
    // this is refused. A `blockIds` naming a task is a pipeline that refuses its own next write.
    expect(h.db.api.getRecord(added.block.id)?.kind).toBe('block')
    const still = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${pipeline.id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { source: 'design/pipeline.md' } },
    })
    expect(still.statusCode, still.body).toBe(200)
  })

  it('refuses to change a pipeline that still holds steps, and says how many', async () => {
    const pipeline = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'pipeline',
      title: 'handover',
      data: { blockIds: [] },
      actor: AGENT,
    })
    h.db.blocks.addBlock(pipeline.id, { name: 'grasp', state: 'todo' }, AGENT)
    h.db.blocks.addBlock(pipeline.id, { name: 'hand over', state: 'todo' }, AGENT)

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${pipeline.id}`,
      headers: AS_AGENT,
      payload: { kind: 'task' },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(errorOf(res)).toContain('2 steps')
    expect(errorOf(res)).toContain(`DELETE /api/records/${pipeline.id}/blocks/`)
    expect(h.db.api.getRecord(pipeline.id)?.kind).toBe('pipeline')
  })

  // ---------------------------------------------------------------------------------------
  // TIME PLANNED AGAINST THE RECORD, WHICH IS THE THIRD REFUSAL OF THE SAME SHAPE
  // ---------------------------------------------------------------------------------------
  //
  // Four write paths refuse to point at a record outside `KINDS_A_PLAN_CAN_GIVE_HOURS_TO`: an
  // allocation, a span on the schedule, a recurring routine and a plan line's binding. Until
  // 18 August 2026 none of them was asked again afterwards, so `PATCH {"kind":"note"}` on a task
  // left hours allocated to a note and a plan line bound to work no plan may give time to. Nothing
  // said so anywhere.
  //
  // THE CHOICE, AND THE OTHER SIDE OF IT: the change is refused while something depends on it,
  // rather than allowed with the dangling rows reported wherever they are read. lib/records.ts
  // states both and why the first was taken. These tests pin the refusal, that nothing was written,
  // and that removing the plan really does let the change through — a refusal with no way past it
  // would be the lock that had to be removed.
  it('refuses to change work into a kind no plan can give time to while hours are allocated to it', async () => {
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'Reprint the v3 shell',
      data: { state: 'todo' },
      actor: AGENT,
    })
    const planning = await import('../src/server/lib/planning.ts')
    const week = planning.createAllocation(
      { horizon: 'week', period: '2026-W34', recordId: task.id, plannedHours: 6 },
      HUMAN,
    )

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'note' },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(errorOf(res)).toContain('2026-W34')
    expect(errorOf(res)).toContain(`DELETE /api/planning/allocations/${week.id}`)

    // Nothing was written. The hours are still on a task, which is the state the refusal defends.
    expect(h.db.api.getRecord(task.id)?.kind).toBe('task')
    expect(planning.allocationsOf(task.id).length).toBe(1)

    // AND THE WAY OUT REALLY WORKS. A refusal nobody can get past is the permanent lock the owner
    // asked to be removed, so this proves the sentence it prints is true.
    planning.deleteAllocation(week.id)
    const after = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'note' },
    })
    expect(after.statusCode, after.body).toBe(200)
    expect(h.db.api.getRecord(task.id)?.kind).toBe('note')
  })

  it('refuses while a span on the schedule names it, and names the days', async () => {
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'Test the gripper',
      data: { state: 'todo' },
      actor: AGENT,
    })
    const windows = await import('../src/server/lib/windows.ts')
    const span = windows.createWindow({ recordId: task.id, startsOn: '2026-08-20', endsOn: '2026-08-26' }, HUMAN)

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'claim' },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(errorOf(res)).toContain('2026-08-20 to 2026-08-26')
    expect(errorOf(res)).toContain(`DELETE /api/planning/windows/${span.id}`)
    expect(h.db.api.getRecord(task.id)?.kind).toBe('task')
    expect(windows.windowsOf(task.id).length).toBe(1)
  })

  it('refuses while a plan line is filed as this work, and names the line and the way to unbind it', async () => {
    const plans = await import('../src/server/lib/plans.ts')
    const written = plans.createPlan({ title: 'This week', body: '- reprint the mount\n' }, HUMAN)
    const line = written.lines[0]
    expect(line, 'the plan just written has no line to file').toBeDefined()
    const filed = plans.fileLineAsWork(
      written.plan.id,
      line?.id ?? '',
      { kind: 'task', workspaceId: 'default' },
      HUMAN,
    )

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${filed.recordId}`,
      headers: AS_AGENT,
      payload: { kind: 'note' },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(errorOf(res)).toContain(written.plan.id)
    expect(errorOf(res)).toContain(`{"recordId":null}`)
    expect(h.db.api.getRecord(filed.recordId)?.kind).toBe('task')
  })

  it('allows the change when the new kind can hold hours too, so the refusal is about the kind and not about the plan', async () => {
    // THE OTHER HALF OF THE RULE. Without this, a patch that refused EVERY kind change on any record
    // with a plan would pass all three tests above. `problem` is in the same list `task` is, so the
    // hours stay valid and nothing is in the way.
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'The pads slip above 15N',
      data: { state: 'todo' },
      actor: AGENT,
    })
    const planning = await import('../src/server/lib/planning.ts')
    planning.createAllocation({ horizon: 'week', period: '2026-W34', recordId: task.id, plannedHours: 2 }, HUMAN)

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'problem' },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(h.db.api.getRecord(task.id)?.kind).toBe('problem')
  })

  it('says so when an empty pipeline with a saved drawing stops being a pipeline, and deletes nothing', async () => {
    // The drawing is stored under the scope `pipeline:<id>`, and `parseScope` refuses to read that
    // scope once the record is not a pipeline. So the arrangement becomes unreadable — and it is not
    // gone. This is the warning that says which of the two it is, and the second half proves the
    // rows really are still there.
    const pipeline = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'pipeline',
      title: 'Transplant v2',
      data: { blockIds: [] },
      actor: AGENT,
    })
    const presentation = await import('../src/server/lib/presentation.ts')
    const scope = presentation.parseScope(`pipeline:${pipeline.id}`, 'default')
    presentation.writeScopeIntent(scope, { direction: 'down' }, HUMAN)

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${pipeline.id}`,
      headers: AS_AGENT,
      payload: { kind: 'module' },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(kindChangeOf(res)['note']).toContain('saved drawing')
    expect(kindChangeOf(res)['note']).toContain('NOTHING WAS DELETED')

    // The rows survived, which is the whole claim the sentence makes. Read straight from the table,
    // because `parseScope` now refuses this scope and that refusal is the thing being explained.
    const rows = h.db.client.sqlite
      .prepare('SELECT count(*) AS n FROM presentation_intent WHERE scope = ?')
      .get(`pipeline:${pipeline.id}`) as { n: number }
    expect(rows.n).toBe(1)
  })

  it('says nothing about a drawing when the pipeline never had one', async () => {
    // Without this, a sentence printed on every kind change would pass the test above.
    const pipeline = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'pipeline',
      title: 'Handover v3',
      data: { blockIds: [] },
      actor: AGENT,
    })
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${pipeline.id}`,
      headers: AS_AGENT,
      payload: { kind: 'module' },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(kindChangeOf(res)['note']).not.toContain('saved drawing')
  })

  it('refuses an agent making a record into a decision, and offers the proposal instead', async () => {
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'pick the gripper material',
      actor: AGENT,
    })

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'decision' },
    })
    // 403 and not 400: this is about who is asking, and the same request from the person works.
    expect(res.statusCode, res.body).toBe(403)
    expect(errorOf(res)).toContain('proposal')
    expect(h.db.api.getRecord(task.id)?.kind).toBe('task')

    // The kind is read from HUMAN_ONLY_KINDS, so the person is not refused.
    const allowed = h.db.api.patchRecord(task.id, { kind: 'decision' }, HUMAN)
    expect(allowed.record.kind).toBe('decision')
  })

  it('refuses a kind sent together with data or dataPatch, and says to send two writes', async () => {
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'reprint the gripper',
      data: { state: 'doing' },
      actor: AGENT,
    })

    for (const payload of [
      { kind: 'problem', data: { state: 'open' } },
      { kind: 'problem', dataPatch: { symptom: 'it cracks' } },
    ]) {
      const res = await h.app.inject({
        method: 'PATCH',
        url: `/api/records/${task.id}`,
        headers: AS_AGENT,
        payload,
      })
      expect(res.statusCode, res.body).toBe(400)
      expect(errorOf(res)).toContain('{"kind":"problem"}')
      expect(h.db.api.getRecord(task.id)?.kind).toBe('task')
    }
  })

  it('refuses a move into extra that would write over something extra already holds', async () => {
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'reprint the gripper',
      data: { command: 'make print-gripper', extra: { command: 'the one I ran last week' } },
      actor: AGENT,
    })

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'problem' },
    })
    // Storing one over the other would lose a value, which is the one thing this whole path exists
    // to make impossible. So it is refused rather than resolved.
    expect(res.statusCode, res.body).toBe(400)
    expect(errorOf(res)).toContain('extra.command')
    const stored = h.db.api.getRecord(task.id)
    expect(stored?.kind).toBe('task')
    expect(stored?.data).toEqual({ command: 'make print-gripper', extra: { command: 'the one I ran last week' } })
  })
})

// -------------------------------------------------------------------------- the compare-and-set

describe('ifVersion guards a kind change like every other write', () => {
  let h: Harness
  beforeAll(async () => {
    h = await freshApp()
  })
  afterAll(() => h.db.close())

  it('refuses a kind change written against a copy somebody else has already replaced', async () => {
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'reprint the gripper',
      data: { state: 'doing' },
      actor: AGENT,
    })
    const read = await h.app.inject({ method: 'GET', url: `/api/records/${task.id}`, headers: AS_AGENT })
    const stale = bodyOf(read)['version'] as string

    // Somebody else writes in between.
    h.db.api.patchRecord(task.id, { title: 'reprint the gripper in PETG' }, AGENT)

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'problem', ifVersion: stale },
    })
    expect(res.statusCode, res.body).toBe(409)
    expect(h.db.api.getRecord(task.id)?.kind).toBe('task')

    // The version the refusal hands back is the one that works.
    const fresh = await h.app.inject({ method: 'GET', url: `/api/records/${task.id}`, headers: AS_AGENT })
    const ok = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'problem', ifVersion: bodyOf(fresh)['version'] as string },
    })
    expect(ok.statusCode, ok.body).toBe(200)
  })

  it('moves the version even when the kind change moves no field at all', async () => {
    // THE CASE THE COMPARE-AND-SET WOULD OTHERWISE MISS. `consequence` and `source` are declared by
    // both kinds, so this change rewrites nothing inside `data`, and a version hashed from title,
    // summary, data and deletedAt alone would come out identical. Two readers would then hold one
    // token for two different records.
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'the gripper drops at 50 mm',
      data: { source: 'design/handover.md' },
      actor: AGENT,
    })
    const before = await h.app.inject({ method: 'GET', url: `/api/records/${task.id}`, headers: AS_AGENT })

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'problem' },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(kindChangeOf(res).kept).toEqual([])
    expect(h.db.api.getRecord(task.id)?.data).toEqual({ source: 'design/handover.md' })

    expect(bodyOf(res)['version']).not.toBe(bodyOf(before)['version'])

    // ...and the old token is now refused, which is what the moving token is FOR.
    const stale = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { title: 'written against the copy from before the kind changed', ifVersion: bodyOf(before)['version'] as string },
    })
    expect(stale.statusCode, stale.body).toBe(409)
  })
})

// ------------------------------------------------------------------------------ the change log

describe('the change log records a kind change with the provenance every other change carries', () => {
  let h: Harness
  beforeAll(async () => {
    h = await freshApp()
  })
  afterAll(() => h.db.close())

  it('writes who, which session, and what the kind changed from and to', async () => {
    const session = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'sess-test',
      data: { state: 'running' },
      actor: AGENT,
    })
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'reprint the gripper',
      data: { state: 'doing' },
      actor: AGENT,
    })

    await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'problem' },
    })

    const rows = h.db.api.listChanges({ workspaceId: 'default', recordId: task.id })
    const kindRow = rows.find((r) => r.field === 'kind')
    expect(kindRow, `no change row for the kind: ${JSON.stringify(rows.map((r) => r.field))}`).toBeDefined()
    expect(kindRow?.op).toBe('update')
    expect(kindRow?.oldValue).toBe('task')
    expect(kindRow?.newValue).toBe('problem')
    expect(kindRow?.actorType).toBe('agent')
    expect(kindRow?.actorId).toBe('claude-code')
    // The run name resolved to the session RECORD it names, exactly as `logChange` does for every
    // other row. A row that stored the raw name would not join to the session.
    expect(kindRow?.sessionId).toBe(session.id)
  })

  it('writes a row for the key a field left and a row for where it arrived', async () => {
    const task = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'reprint the gripper',
      data: { command: 'make print-gripper' },
      actor: AGENT,
    })

    await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${task.id}`,
      headers: AS_AGENT,
      payload: { kind: 'problem' },
    })

    const rows = h.db.api.listChanges({ workspaceId: 'default', recordId: task.id })
    const left = rows.find((r) => r.field === 'data.command')
    const arrived = rows.find((r) => r.field === 'data.extra.command')
    // One row alone would say the field went and not where it went, which is the half of the story
    // somebody reads the history to find.
    expect(left?.oldValue).toBe('make print-gripper')
    expect(left?.newValue).toBe(null)
    expect(arrived?.oldValue).toBe(null)
    expect(arrived?.newValue).toBe('make print-gripper')
  })
})

// ------------------------------------------------------------- nothing stored is ever discarded

/**
 * Every kind's own worked example, changed to every other kind, with nothing lost.
 *
 * The examples come from KIND_SPECS, which is the same declaration `GET /api/kinds` publishes and
 * the write gate enforces, so this sweep grows a case the day a kind or a field is added and
 * nobody has to remember to add one.
 *
 * `block` is left out as a starting point because a block cannot be filed on its own, and as a
 * destination because a record cannot become one — both are tested above as refusals. `pipeline` is
 * left out as a starting point because its published example deliberately lists block ids that
 * nothing answers to, which `checkBlockIds` refuses at creation; the pipeline pair has its own two
 * tests above.
 *
 * `work_domain` IS LEFT OUT AS A STARTING POINT FOR EXACTLY THE PIPELINE'S REASON, and it is left in
 * as a destination. Its published example names an agent record and a session record, because those
 * two ids are the point of the kind — a domain that names neither could never have an overlap told
 * to anybody, and could never have a change attributed to it. `checkWorkDomainIds` refuses both at
 * creation when nothing answers to them, which is the rule working rather than the example being
 * wrong. Its own tests are in tests/a-work-domain-says-what-it-believes-first.test.ts, which builds
 * the two records first and drives both write paths.
 */
// `merge_entry` IS LEFT OUT BOTH WAYS, for the seal's reason: only the merge queue's doors write one,
// so neither a kind change into it nor out of it is a write anybody may make here. Sandbox v1, P6;
// tests/merge-queue-doors.test.ts proves the refusal.
// `counter` IS LEFT OUT BOTH WAYS, for the merge entry's reason: only its own doors write one, so
// neither a kind change into it nor out of it is a write anybody may make here. Criteria CT1 and CT6;
// tests/counter-doors.test.ts proves the refusal.
// `flow_run` IS LEFT OUT BOTH WAYS, for the counter's reason: only the office writes one, beside the run it records.
// `checklist` IS LEFT OUT BOTH WAYS, for the counter's reason: only its own doors write one.
// `booking` is left out for the same reason.
// Personal notice rules are bound to one recipient; their own door alone may write them. The notice-rules test proves both kind-change refusals.
// Wave 1 of the office flow, M1; tests/the-office-writes-a-runs-steps.test.ts proves the refusal.
// `secretary_duties` is left out both ways (wave 13s round 92). Its example names a secretary's registry id and the
// person's decisions, which this fresh database has none of, and only the person or that secretary may write one.
// tests/secretary-duties.test.ts drives its writes on a world that has them.
// `emergency_push` is left out both ways, for the merge entry's reason: only its two doors write one, because it names
// who pushed (wave 13u round 82). The guard in assertMayWrite refuses it; tests/an-emergency-push-to-main.test.ts proves
// that refusal at the record door.
// `host_job` is left out both ways, for the merge entry's reason: only its own doors write one, and only the office's
// key answers one. The guard in assertMayWrite refuses it on a create and on a kind change;
// tests/a-sandboxed-agent-asks-the-office-for-a-registered-host-tool.test.ts proves both refusals at the record door.
// `project_chapter` is left out both ways, for the emergency push's reason: only its own doors write one, so that only the
// person or the project's own secretary writes a rule (wave 13s round 226). The guard in assertMayWrite refuses a change
// into one and out of one; tests/project-rules-the-chapter.test.ts proves both at the record door.
// `design_review` is left out both ways, for the project chapter's reason: only its own door writes one, so that the
// office writes the reviewer from the key (wave 13s round 226). The guard in assertMayWrite refuses a create and a change
// into one, so no sweep could start from one; tests/project-rules-the-judge.test.ts proves the create's refusal.
// `design_reminder` is left out both ways, for the design review's reason: only the office writes one before a seal, and
// only its own doors judge one, so that the office writes who judged it from the key (wave 13s round 228). The guard in
// assertMayWrite refuses a create and a change into one, so no sweep could start from one;
// tests/a-design-reminder-is-judged-once-and-counted-by-the-day.test.ts (case 6) proves the create's refusal.
const SWEEPABLE = RECORD_KINDS.filter(
  (k) => k !== 'block' && k !== 'pipeline' && k !== 'sealed_tip' && k !== 'merge_entry' && k !== 'counter' && k !== 'flow_run' && k !== 'checklist' && k !== 'booking' && k !== 'notice_rules' && k !== 'secretary_duties' && k !== 'emergency_push' && k !== 'host_job' && k !== 'project_chapter' && k !== 'design_review' && k !== 'design_reminder',
)
// A whole-suite receipt records an original cloud run. Another record cannot acquire that evidence by
// changing kind. A receipt can still change into an ordinary kind, which keeps its facts in extra.
const SWEEPABLE_TO = SWEEPABLE.filter((kind) => !new Set<string>(['whole_suite_receipt']).has(kind))
// `ran_instead` IS LEFT OUT AS A STARTING POINT FOR THE BLOCK'S REASON, and is left in as a
// destination. It says the canonical method for a STEP is one thing and something else ran, so two
// facts about one live on its block and nowhere else: which method it stands in for, and which
// record its restriction is declared against. `createRecord` refuses a bare one, with the route to
// use, exactly as it refuses a bare block. Its own tests are in
// tests/a-fallback-never-writes-the-method.test.ts, which drives the real route.
// `message` IS LEFT OUT AS A STARTING POINT SINCE 29 SEPTEMBER 2026, and is left in as a destination. A message that
// has gone out stays a message, and the message's own example is addressed to somebody, so it
// has gone out. A comment nobody has been handed yet may change kind like any record, by its writer.
// tests/only-its-writer-changes-a-message.test.ts proves both.
// `watch` IS LEFT OUT AS A STARTING POINT SINCE 29 OCTOBER 2026 (wave 13s round 142), for the work domain's reason, and
// is left in as a destination. Its example names its holder by a registry id this fresh database has no agent for, and
// a holder no registry row answers to is refused at creation. tests/a-watch-is-a-record.test.ts files watches held by
// agents it registers, and proves a change into a watch meets the same refusal.
// `backlog_item` IS LEFT OUT AS A STARTING POINT FOR THE SAME REASON, and is left in as a destination: its example names
// who placed it by a registry id this fresh database has no row for. tests/a-backlog-item-is-a-record.test.ts files items
// placed by the person.
// `design` IS LEFT OUT AS A STARTING POINT FOR THE SAME REASON SINCE 8 NOVEMBER 2026 (wave 13s round 226), and is left in
// as a destination: its example names who asked for it by a registry id this fresh database has no row for.
// tests/project-rules-the-judge.test.ts files designs asked for by an agent it registers.
const SWEEPABLE_FROM = SWEEPABLE.filter((k) => k !== 'work_domain' && k !== 'ran_instead' && k !== 'message' && k !== 'watch' && k !== 'backlog_item' && k !== 'design')

/**
 * THE AGENT THE NOTEBOOK'S OWN WORKED EXAMPLE IS KEPT UNDER, registered before the sweep runs.
 *
 * A notebook is refused for a handle nothing answers to, and refused again for an agent that does
 * not hold the card `design/permissions/roles.json` names in `elevation.onlyThisCardCanHoldIt`
 * (criterion N1, `checkTheNotebook` in src/server/lib/records/notebook-entries.ts). The sweep below files every
 * kind's own example, so the example's agent has to exist for it, exactly as `freshApp` above
 * registers `claude-code` because a message from an unregistered agent is refused.
 *
 * THE HANDLE AND THE CARD ARE BOTH READ rather than typed: the handle from the example this sweep
 * is about to file, and the card from the one file that says what a role is.
 *
 * AND ITS ENTRIES ARE FILED AS THE DOOR WOULD FILE THEM. A notebook's entries are written by
 * POST /api/agents/<handle>/notebook/entries and by nothing else, because each one says who wrote
 * it and when and neither is a caller's to supply (criterion N2, `checkTheNotebookEntries`). This
 * sweep is not a writer of entries — it is asking what a KIND CHANGE keeps — so `asTheDoorWould`
 * hands the create the same mark the door hands it, and the question this file exists to ask is
 * asked of a notebook like every other kind.
 */
function asTheDoorWould(kind: RecordKind): Record<string, true> {
  return kind === NOTEBOOK_KIND ? { [THE_NOTEBOOK_DOOR]: true } : {}
}

function theNotebooksAgent(db: TestDb): void {
  const card = (
    JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as {
      elevation: { onlyThisCardCanHoldIt: string }
    }
  ).elevation.onlyThisCardCanHoldIt
  db.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'The secretary the notebook example is kept under',
    data: {
      handle: String((KIND_SPECS.notebook.example as Record<string, unknown>)['agentHandle']),
      runtime: 'claude-code',
      state: 'active',
      role: card,
    },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, sessionId: null },
  })
}

/**
 * THE DECISION THE FLOW'S OWN WORKED EXAMPLE RESTS ON, filed before the sweep runs.
 *
 * Each new flow step names its sources, and each source must be a record the office holds. The
 * check is `checkTheFlowSteps` in src/server/lib/flow-reasons.ts. The example names a decision of the real office by
 * its id, and this fresh database holds no record with a fixed id, so the sweep files a decision of its own and the
 * flow's example names that one in its place.
 * Nothing else in the example changes, and no other kind's example is touched.
 */
function theFlowsSource(db: TestDb): string {
  return db.api.createRecord({
    workspaceId: 'default',
    kind: 'decision',
    title: 'The decision the flow example\'s step rests on',
    data: structuredClone(KIND_SPECS.decision.example),
    actor: HUMAN,
  }).id
}

/**
 * THE FLOW THE HANDBOOK'S OWN WORKED EXAMPLE HANGS ON, filed before the sweep runs.
 *
 * Each place a write puts into a handbook's `hangs_on` must be a record the office holds
 * (`checkAHandbookWrite` in src/server/lib/handbooks.ts). The example names a flow by an id no fresh
 * database holds, so the sweep files a flow of its own, from the flow's example, and the handbook's
 * example names that one in its place, as the flow's example names the decision above.
 */
function theHandbooksFlow(db: TestDb, flowsSource: string): string {
  return db.api.createRecord({
    workspaceId: 'default',
    kind: 'flow',
    title: 'The flow the handbook example hangs on',
    // A flow's example hangs on nothing, so the handbook's flow is not read here.
    data: theExampleOf('flow', flowsSource, ''),
    actor: HUMAN,
  }).id
}

function theExampleOf(kind: RecordKind, flowsSource: string, handbooksFlow: string): Record<string, unknown> {
  const example = structuredClone(KIND_SPECS[kind].example) as Record<string, unknown>
  if (kind === 'handbook') example['hangs_on'] = [{ flow: handbooksFlow }]
  // THE CRITICISM'S INDEPENDENT MARK IS WRITTEN BY ITS OWN DOOR, and the ordinary record door refuses it on purpose
  // (the guard in src/server/lib/records.ts). The example shows the shape; a criticism filed through this sweep's
  // ordinary door carries none, so the example for this sweep leaves the mark out. The mark is proved by the
  // criticism door's own cases.
  if (kind === 'criticism') delete example['independent']
  if (kind !== 'flow') return example
  for (const step of example['stages'] as Record<string, unknown>[]) step['sources'] = [flowsSource]
  return example
}

describe('changing a kind never discards a stored value', () => {
  let t: TestDb
  let flowsSource: string
  let handbooksFlow: string
  beforeAll(async () => {
    t = await freshDb()
    theNotebooksAgent(t)
    flowsSource = theFlowsSource(t)
    handbooksFlow = theHandbooksFlow(t, flowsSource)
  })
  afterAll(() => t.close())

  for (const from of SWEEPABLE_FROM) {
    it(`keeps every value a ${from}'s own worked example holds, whatever it is changed into`, () => {
      // WHAT THE SWEEP FILED, not the raw example: a value the ordinary door refuses (a criticism's independent mark)
      // is not in the record and cannot be kept by a kind change. `theExampleOf` is the one place that decides what
      // this sweep files, so both the data and the expected keys come from it.
      const example = theExampleOf(from, flowsSource, handbooksFlow)
      for (const to of SWEEPABLE_TO) {
        if (to === from) continue
        // A human, so the human-only kinds are part of the sweep in both directions rather than
        // being the one pair nobody checks.
        const record = t.api.createRecord({
          workspaceId: 'default',
          kind: from,
          title: `${from} to ${to}`,
          data: theExampleOf(from, flowsSource, handbooksFlow),
          actor: HUMAN,
          ...asTheDoorWould(from),
        })
        const result = t.api.patchRecord(record.id, { kind: to }, HUMAN)
        expect(result.record.kind, `${from} -> ${to}`).toBe(to)

        const after = result.record.data
        const extra = (after['extra'] ?? {}) as Record<string, unknown>
        // WHAT THE RECORD HELD, NOT WHAT THE EXAMPLE SAYS. A write path may complete a field on the
        // way in — a comment's context is stored with the place it names, which the example does not
        // spell — and this test is about a KIND CHANGE discarding nothing, which is a comparison
        // between what was stored before it and what is stored after it. Comparing against the
        // example instead would make this test fail for a write that happened before the kind
        // change and lost nothing at all.
        const held = record.data
        for (const key of Object.keys(example)) {
          if (key === 'extra') continue
          const found = key in after ? after[key] : extra[key]
          expect(found, `${from} -> ${to}: "${key}" is not readable at data.${key} or at data.extra.${key}`).toEqual(
            held[key],
          )
        }

        // ...and every field that moved was NAMED. A value preserved silently is a value somebody
        // goes on looking for where it used to be.
        const movedKeys = new Set((result.kindChange?.kept ?? []).map((k) => k.key))
        for (const key of Object.keys(example)) {
          if (key === 'extra' || key in after) continue
          expect(movedKeys.has(key), `${from} -> ${to}: "${key}" moved into extra without being reported`).toBe(true)
        }

        // A CARD'S WORDS RECORD IS THE ONLY LIVE ONE FOR ITS CARD, so this case takes its own back
        // out before the next one asks. Every assertion above has already run; what goes is only the
        // record this iteration made, not anything the database held before it.
        if (to === 'role_card_words') t.api.deleteRecord(record.id, HUMAN)
      }
    })
  }

  // THIRTY SECONDS, NOT THE RUNNER'S FIVE-SECOND DEFAULT. tests/how-long-a-test-may-take.ts gives
  // that default only to a test it can tell is pure — one that starts no browser and no server —
  // and this one qualifies by that rule: everything here is a direct, synchronous call against a
  // throwaway database. But "pure" and "fast" are not the same fact. This one case runs the full
  // cross product of SWEEPABLE_FROM and SWEEPABLE_TO — every allowed destination, from every
  // kind it could have started as, one real create and one real patch each — and measured alone on
  // 11 September 2026 it took 2627ms with nothing else of this worktree's running. That leaves under
  // half the default's five seconds of headroom before this suite runs anywhere near a busy machine,
  // and the other tests in this file that exercise the same code stay under the default because each
  // of them is the much smaller sweep of ONE starting kind rather than every pair at once. 30_000
  // is the number this project already uses for a test whose real cost the five-second default was
  // never sized for (see A_TEST_THAT_STARTS_SOMETHING in tests/how-long-a-test-may-take.ts) — giving
  // it here is completing this test's budget, not widening a timeout to make a red go away: nothing
  // about what the test checks changes, and the mutation proof beside this commit shows it still
  // catches a real regression in what a kind change leaves behind.
  it('leaves the record valid for its new kind, on every pair in the sweep', async () => {
    const { validateData } = await import('@shared/kinds.ts')
    for (const from of SWEEPABLE_FROM) {
      for (const to of SWEEPABLE_TO) {
        if (to === from) continue
        const record = t.api.createRecord({
          workspaceId: 'default',
          kind: from,
          title: `valid ${from} to ${to}`,
          data: theExampleOf(from, flowsSource, handbooksFlow),
          actor: HUMAN,
          ...asTheDoorWould(from),
        })
        const result = t.api.patchRecord(record.id, { kind: to }, HUMAN)
        // The gate runs on the way IN, so a record left invalid by this write would sit in the
        // table looking filed until somebody tried to patch it again.
        const check = validateData(to, result.record.data)
        expect(check.ok, `${from} -> ${to}: ${check.ok ? '' : JSON.stringify(check.errors)}`).toBe(true)
        // For the reason the sweep above gives: one live words record per card, so this case removes
        // the one it made once it has asked its question.
        if (to === 'role_card_words') t.api.deleteRecord(record.id, HUMAN)
      }
    }
  }, 30_000)
})
