// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLAN LINE KEEPS ITS WORK WHEN ITS WORDS CHANGE, AND EVERY WAY OF LOSING IT SAYS SO.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER REVERSED THE OLD RULE ON 17 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * Until that day, saving a document with one word changed on a filed line took the work off it. That
 * was deliberate and it was tested, so that nobody would "fix" it by matching a changed line to the
 * stored line it most resembles. The owner overturned it, in design/ROUND-SEVEN-OWNER-MESSAGE.md
 * section 5:
 *
 *     "Editing prose is normal planning behaviour. A filed/bound line must not lose access to its
 *      canonical work merely because its visible words changed."
 *
 * ---------------------------------------------------------------------------------------
 * WHAT REPLACED IT, AND WHY IT IS NOT A SIMILARITY MATCH
 * ---------------------------------------------------------------------------------------
 *
 * The exact-characters match runs first. Then, for the bound rows it matched to nothing, the SHAPE
 * of the alignment is read: between the two nearest lines that did not change, was exactly one line
 * removed and exactly one added? Where it was, one line was replaced by one line in the same place,
 * and the row is carried onto it. Nothing compares two lines, ever.
 *
 * WHERE MORE THAN ONE LINE CHANGED IN THE SAME PLACE, NOTHING IS CARRIED. That is the half of this
 * file that keeps a similarity match out of the product: two lines rewritten between the same two
 * unchanged lines could have been swapped, merged or split, so both bindings are dropped and both
 * are reported, exactly as they were before the reversal.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE THREE OTHER HOLES THE OWNER NAMED, IN THE SAME PASS
 * ---------------------------------------------------------------------------------------
 *
 *   - Removing a line said nothing about what it left behind. It now names the work that is still
 *     tracked and no longer on this plan, the words about time that are attached to no line, and the
 *     rows that still hold the gone line's id. Nothing is repaired and nothing is deleted.
 *   - There was no way to take the work off a line and keep the line. `{"recordId": null}` does it.
 *   - Filing a line was refused when the project already had a record of that name, and refused
 *     again when a DELETED record did. Both are gone: the record is filed and the reply says what
 *     else is called this.
 *
 * Everything here goes through the real routes on a throwaway database, except the two unit tests at
 * the top, which are about the pure function the rule is built on.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BuiltServer } from '../src/server/index.ts'
import { matchLines, replacedInPlace } from '../src/shared/plandiff.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: BuiltServer['app']

beforeAll(async () => {
  t = await freshDb()
  const { apiApp } = await import('./helpers.ts')
  app = (await apiApp()).app
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

type Json = Record<string, unknown>

const READER = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

function bodyOf(res: { body: string }): Json {
  return JSON.parse(res.body) as Json
}

interface Line {
  id: string
  text: string
  recordId: string | null
}

async function newPlan(body: string): Promise<{ id: string; lines: Line[] }> {
  const res = await app.inject({ method: 'POST', url: '/api/plans', payload: { title: 'Robotics week', body } })
  expect(res.statusCode, res.body).toBe(201)
  const made = bodyOf(res)
  return { id: (made['plan'] as { id: string }).id, lines: made['lines'] as Line[] }
}

/** The plan's lines as stored, read back through the route a reader uses. */
async function linesOf(id: string): Promise<Line[]> {
  const res = await app.inject({ method: 'GET', url: `/api/plans/${id}` })
  expect(res.statusCode, res.body).toBe(200)
  return (bodyOf(res)['lines'] as { line: Line }[]).map((row) => row.line)
}

async function fileAsWork(planId: string, lineId: string, kind = 'task'): Promise<Json> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/plans/${planId}/lines/${lineId}/file-as-work`,
    payload: { kind, workspaceId: 'default' },
  })
  expect(res.statusCode, res.body).toBe(201)
  return bodyOf(res)
}

async function saveBody(planId: string, body: string): Promise<Json> {
  const res = await app.inject({ method: 'PUT', url: `/api/plans/${planId}/body`, payload: { body } })
  expect(res.statusCode, res.body).toBe(200)
  return bodyOf(res)
}

// ============================================================ the shape, on its own

/**
 * THE POSITIONAL FACT, WITH NO DATABASE AND NO TEXT.
 *
 * `replacedInPlace` is handed an alignment and two lengths. It never sees a string, which is what
 * makes "one line was replaced by one line" a fact about the document's shape rather than a guess
 * about somebody's words.
 */
describe('which stored line was replaced by which new line', () => {
  it('pairs one removed line with one added line between the same two unchanged lines', () => {
    const stored = ['# Robotics', '- baseline', '- gaze']
    const now = ['# Robotics', '- baseline, rewritten', '- gaze']
    const match = matchLines(stored, now)
    expect(match).toEqual([0, null, 2])
    expect([...replacedInPlace(match, stored.length)]).toEqual([[1, 1]])
  })

  it('pairs nothing when two lines were removed and two added in the same place', () => {
    const stored = ['# Robotics', '- baseline', '- gaze', '- write it up']
    const now = ['# Robotics', '- baseline, rewritten', '- gaze tracking', '- write it up']
    const match = matchLines(stored, now)
    expect([...replacedInPlace(match, stored.length)]).toEqual([])
  })

  it('pairs nothing when a line was removed and nothing took its place', () => {
    const stored = ['# Robotics', '- baseline', '- gaze']
    const now = ['# Robotics', '- gaze']
    expect([...replacedInPlace(matchLines(stored, now), stored.length)]).toEqual([])
  })

  it('pairs nothing when one line was removed and two lines were added in its place', () => {
    const stored = ['# Robotics', '- baseline', '- gaze']
    const now = ['# Robotics', '- baseline, part one', '- baseline, part two', '- gaze']
    expect([...replacedInPlace(matchLines(stored, now), stored.length)]).toEqual([])
  })

  it('pairs a replacement at the top and at the bottom, where there is a neighbour on one side only', () => {
    const top = matchLines(['- baseline', '- gaze'], ['- baseline, rewritten', '- gaze'])
    expect([...replacedInPlace(top, 2)]).toEqual([[0, 0]])
    const bottom = matchLines(['- baseline', '- gaze'], ['- baseline', '- gaze tracking'])
    expect([...replacedInPlace(bottom, 2)]).toEqual([[1, 1]])
  })

  it('pairs each of two replacements that are in different places', () => {
    const stored = ['- baseline', '# Perception', '- gaze']
    const now = ['- baseline, rewritten', '# Perception', '- gaze tracking']
    expect([...replacedInPlace(matchLines(stored, now), stored.length)]).toEqual([
      [0, 0],
      [2, 2],
    ])
  })
})

// ============================================================ what a save does with a binding

describe('saving a document that rewrote a filed line', () => {
  /**
   * THE OWNER'S OWN ACT: edit the words of a line the owner already filed. It cost the owner the work, and that
   * is what this test exists to stop happening again.
   */
  it('keeps the binding when a bound line is rewritten alone between two unchanged lines', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze')
    const line = plan.lines[1]!
    const recordId = (await fileAsWork(plan.id, line.id))['recordId'] as string

    const saved = await saveBody(plan.id, '# Robotics\n- replace the gripper mount\n- gaze')

    const stored = await linesOf(plan.id)
    expect(stored[1]!.id).toBe(line.id)
    expect(stored[1]!.text).toBe('- replace the gripper mount')
    expect(stored[1]!.recordId).toBe(recordId)
    // NOTHING IS REPORTED AS LOST, because nothing was lost. A reply naming a loss that did not
    // happen would be as wrong as the silence this whole layer exists to end.
    expect(saved['removedBindings']).toEqual([])
    expect(saved['keptWordsAdrift']).toEqual([])
    expect(String(saved['note'])).toContain('No line that was filed as work was removed.')
  })

  /**
   * AND THE ROW IS RESTAMPED, because somebody typed those words. A line that only moved is not
   * restamped, and that rule is unchanged — this is the other side of it.
   */
  it('records that the words were written, on the row that survived', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze')
    const line = plan.lines[1]!
    await fileAsWork(plan.id, line.id)
    const before = t.client.sqlite
      .prepare('SELECT updated_at, updated_by FROM plan_lines WHERE id = ?')
      .get(line.id) as { updated_at: string; updated_by: string }

    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/body`,
      payload: { body: '# Robotics\n- replace the gripper mount\n- gaze' },
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
    })
    expect(res.statusCode, res.body).toBe(200)

    const after = t.client.sqlite
      .prepare('SELECT updated_at, updated_by FROM plan_lines WHERE id = ?')
      .get(line.id) as { updated_at: string; updated_by: string }
    expect(after.updated_by).toBe('agent:claude-code')
    expect(after.updated_by).not.toBe(before.updated_by)
  })

  /**
   * TWO LINES REWRITTEN IN ONE PLACE IS WHERE PANELX STOPS. The lines could have been swapped,
   * merged or split. Both bindings go and BOTH are reported, which is the behaviour that was there
   * before the reversal and is the reason the reversal is safe.
   */
  it('drops and reports both bindings when two bound lines were rewritten in the same place', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze\n- write it up')
    const first = (await fileAsWork(plan.id, plan.lines[1]!.id))['recordId'] as string
    const second = (await fileAsWork(plan.id, plan.lines[2]!.id))['recordId'] as string

    const saved = await saveBody(plan.id, '# Robotics\n- replace the mount\n- gaze tracking\n- write it up')

    const removed = saved['removedBindings'] as { recordId: string; text: string; putItBack: string }[]
    expect(removed.map((one) => one.recordId).sort()).toEqual([first, second].sort())
    expect(removed.map((one) => one.text).sort()).toEqual(['- gaze', '- replace the gripper'])
    // AND NEITHER RECORD MOVED ONTO A LINE. This is invariant 2: a binding on a line nobody bound
    // would be a different answer reported as the requested one.
    expect((await linesOf(plan.id)).map((one) => one.recordId)).toEqual([null, null, null, null])
    for (const one of removed) expect(one.putItBack).toContain('Point a line at it again')
  })

  /**
   * A LINE DELETED AND AN UNRELATED LINE ADDED SOMEWHERE ELSE IS A REMOVAL, NOT A REPLACEMENT.
   *
   * The two happen in the same save and in different places, so the shape says nothing joins them.
   * A rule that counted lines across the whole document would move this binding onto a line nobody
   * bound, which is the mistake this construction is built to be unable to make.
   */
  it('drops the binding when the line went and a new line arrived somewhere else', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze\n# Later\n- write it up')
    const recordId = (await fileAsWork(plan.id, plan.lines[1]!.id))['recordId'] as string

    const saved = await saveBody(plan.id, '# Robotics\n- gaze\n# Later\n- tidy the bench\n- write it up')

    const removed = saved['removedBindings'] as { recordId: string; text: string }[]
    expect(removed).toHaveLength(1)
    expect(removed[0]!.recordId).toBe(recordId)
    expect(removed[0]!.text).toBe('- replace the gripper')
    expect((await linesOf(plan.id)).map((one) => one.recordId)).toEqual([null, null, null, null, null])
  })

  /**
   * A LINE THAT ONLY MOVED KEEPS ITS ROW AND ITS WORK, and this worked before the reversal too. It
   * is here so that the new rule cannot be built in a way that breaks the old one.
   *
   * The bound line moves to the top and the line above it moves below: the words of the bound line
   * did not change, so the exact-characters match finds it wherever it went.
   */
  it('keeps the binding of a bound line that moved without its words changing', async () => {
    const plan = await newPlan('- gaze\n- replace the gripper')
    const line = plan.lines[1]!
    const recordId = (await fileAsWork(plan.id, line.id))['recordId'] as string

    const saved = await saveBody(plan.id, '- replace the gripper\n- gaze')

    const stored = await linesOf(plan.id)
    expect(stored[0]!.id).toBe(line.id)
    expect(stored[0]!.text).toBe('- replace the gripper')
    expect(stored[0]!.recordId).toBe(recordId)
    expect(saved['removedBindings']).toEqual([])
  })

  /**
   * ADDING A NOTE TO A FILED LINE KEEPS IT, and it worked before the reversal: the groups at the end
   * of a line are fields the line carries, not what makes it the line it is. It is here so that a
   * change to the new rule cannot take the old one with it.
   */
  it('keeps the binding when a note is added to a bound line', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze')
    const line = plan.lines[1]!
    const recordId = (await fileAsWork(plan.id, line.id))['recordId'] as string

    const noted = '- replace the gripper {note: ask Sam}'
    const saved = await saveBody(plan.id, `# Robotics\n${noted}\n- gaze`)

    const stored = await linesOf(plan.id)
    expect(stored[1]!.id).toBe(line.id)
    expect(stored[1]!.text).toBe(noted)
    expect(stored[1]!.recordId).toBe(recordId)
    expect(saved['removedBindings']).toEqual([])
  })

  /**
   * ONLY A BOUND ROW IS CARRIED, and that is stated rather than hidden. A rewritten line that nobody
   * filed is a removal and an addition, exactly as it always was, so what a save counts as kept,
   * added and removed is what it always counted.
   */
  it('makes a new row for a rewritten line that was never filed as work', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze')
    const line = plan.lines[1]!

    const saved = await saveBody(plan.id, '# Robotics\n- replace the gripper mount\n- gaze')

    const stored = await linesOf(plan.id)
    expect(stored[1]!.id).not.toBe(line.id)
    expect([saved['kept'], saved['added'], saved['removed']]).toEqual([2, 1, 1])
  })

  /** The words somebody wrote about time on a rewritten filed line stay on it, because the row does. */
  it('keeps the words about time that were written on a rewritten filed line', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze')
    const line = plan.lines[1]!
    await fileAsWork(plan.id, line.id)
    const kept = await app.inject({
      method: 'POST',
      url: '/api/planning/intents',
      payload: { said: 'sometime next week', planLineId: line.id },
      headers: READER,
    })
    expect(kept.statusCode, kept.body).toBe(201)

    const saved = await saveBody(plan.id, '# Robotics\n- replace the gripper mount\n- gaze')
    expect(saved['keptWordsAdrift']).toEqual([])

    const read = await app.inject({ method: 'GET', url: `/api/plans/${plan.id}` })
    const rows = bodyOf(read)['lines'] as { line: Line; kept: { said: string }[] }[]
    expect(rows[1]!.kept.map((one) => one.said)).toEqual(['sometime next week'])
  })
})

// ============================================================ removing a line says what it left

describe('removing one line', () => {
  it('says the work is still tracked, and how to put it on a line again', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze')
    const line = plan.lines[1]!
    const recordId = (await fileAsWork(plan.id, line.id))['recordId'] as string

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${plan.id}/lines/${line.id}`,
      payload: { reason: 'the test removes this line' },
    })
    expect(res.statusCode, res.body).toBe(200)
    const said = bodyOf(res)

    const removed = said['removedBindings'] as { recordId: string; title: string; putItBack: string }[]
    expect(removed).toHaveLength(1)
    expect(removed[0]!.recordId).toBe(recordId)
    expect(removed[0]!.title).toBe('replace the gripper')
    expect(removed[0]!.putItBack).toContain('is not on any line of this plan now')
    expect(removed[0]!.putItBack).toContain(`{"recordId":"${recordId}"}`)
    expect(String(said['note'])).toContain('is not on any line of this plan now')

    // THE WORK IS ALIVE, which is the point. Deleting a line has never been a reason to delete a
    // record, and until this reply existed nothing said which record had been left with no line.
    const held = await app.inject({ method: 'GET', url: `/api/records/${recordId}` })
    expect(held.statusCode, held.body).toBe(200)
    expect(JSON.parse(held.body).record.deletedAt).toBeNull()
  })

  it('says nothing about work when the line was not filed as any', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper')
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${plan.id}/lines/${plan.lines[1]!.id}`,
      payload: { reason: 'the test removes this line' },
    })
    expect(res.statusCode, res.body).toBe(200)
    const said = bodyOf(res)
    expect(said['removedBindings']).toEqual([])
    expect(said['keptWordsAdrift']).toEqual([])
    expect(String(said['note'])).toBe('The line is gone. It was not filed as work.')
  })

  /**
   * THE HOURS AND THE WORDS THAT STILL NAME A LINE NOBODY CAN READ ANY MORE.
   *
   * `allocations.from_plan_line` and `planning_intents.plan_line_id` both hold a line's id and
   * neither is a foreign key. Mole Office does not clear them — the hours were still given and the words
   * were still written — so the reply names them instead of tidying up in silence.
   */
  it('names the hours given from the line, and does not take them back', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze')
    const line = plan.lines[1]!
    const recordId = (await fileAsWork(plan.id, line.id))['recordId'] as string
    const hours = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${line.id}/give-time`,
      payload: { horizon: 'day', period: '2026-08-18', plannedHours: 3 },
      headers: READER,
    })
    expect(hours.statusCode, hours.body).toBe(201)
    const allocationId = bodyOf(hours)['allocationId'] as string

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${plan.id}/lines/${line.id}`,
      payload: { reason: 'the test removes this line' },
    })
    expect(res.statusCode, res.body).toBe(200)
    const still = bodyOf(res)['stillNamesIt'] as {
      allocations: { id: string; recordId: string; period: string }[]
      keptWords: unknown[]
    }
    expect(still.allocations).toEqual([
      { id: allocationId, recordId, horizon: 'day', period: '2026-08-18', plannedHours: 3 },
    ])
    expect(String(bodyOf(res)['note'])).toContain('The hours are still given')

    // AND THE ROW IS UNTOUCHED, still naming the line that has gone. Repairing it would destroy the
    // one fact that says where those hours came from.
    const row = t.client.sqlite
      .prepare('SELECT from_plan_line, planned_hours FROM allocations WHERE id = ?')
      .get(allocationId) as { from_plan_line: string; planned_hours: number }
    expect(row.from_plan_line).toBe(line.id)
    expect(row.planned_hours).toBe(3)
  })

  it('names the words about time that are now on no line, and does not delete them', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze')
    const line = plan.lines[1]!
    const kept = await app.inject({
      method: 'POST',
      url: '/api/planning/intents',
      payload: { said: 'sometime next week', planLineId: line.id },
      headers: READER,
    })
    expect(kept.statusCode, kept.body).toBe(201)
    const intentId = (bodyOf(kept)['intent'] as { id: string }).id

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${plan.id}/lines/${line.id}`,
      payload: { reason: 'the test removes this line' },
    })
    expect(res.statusCode, res.body).toBe(200)
    const said = bodyOf(res)
    expect(said['keptWordsAdrift']).toEqual([
      { text: '- replace the gripper', said: 'sometime next week', intentId },
    ])
    expect(String(said['note'])).toContain('"sometime next week" was written about time')
    expect(String(said['note'])).toContain('Nothing was deleted')

    // The words are still there, still saying what they said.
    const row = t.client.sqlite.prepare('SELECT said FROM planning_intents WHERE id = ?').get(intentId) as {
      said: string
    }
    expect(row.said).toBe('sometime next week')
  })

  /**
   * "NO LINE OF THIS PLAN POINTS AT IT" IS A SENTENCE PANELX CHECKS BEFORE SAYING.
   *
   * Nothing forbids two lines pointing at one record. When one of them is removed the plan still
   * reaches the work through the other, so the reply says that instead of naming a loss that did not
   * happen.
   */
  it('says the plan still reaches the work when another line still points at it', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze')
    const line = plan.lines[1]!
    const recordId = (await fileAsWork(plan.id, line.id))['recordId'] as string
    const also = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${plan.lines[2]!.id}`,
      payload: { recordId },
      headers: READER,
    })
    expect(also.statusCode, also.body).toBe(200)

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${plan.id}/lines/${line.id}`,
      payload: { reason: 'the test removes this line' },
    })
    const removed = bodyOf(res)['removedBindings'] as { lost: unknown[]; putItBack: string }[]
    expect(removed).toHaveLength(1)
    expect(removed[0]!.putItBack).toContain('still on another line of this plan')
    expect(removed[0]!.lost).toEqual([])
  })
})

describe('deleting a whole plan', () => {
  it('names every piece of work that was on it, and deletes none of it', async () => {
    const plan = await newPlan('- replace the gripper\n- gaze')
    const first = (await fileAsWork(plan.id, plan.lines[0]!.id))['recordId'] as string
    const second = (await fileAsWork(plan.id, plan.lines[1]!.id))['recordId'] as string

    const res = await app.inject({ method: 'DELETE', url: `/api/plans/${plan.id}` })
    expect(res.statusCode, res.body).toBe(200)
    const said = bodyOf(res)

    const removed = said['removedBindings'] as { recordId: string; putItBack: string }[]
    expect(removed.map((one) => one.recordId).sort()).toEqual([first, second].sort())
    // THE WAY BACK IS NOT A LINE OF THIS PLAN, because there is no plan. It says so.
    for (const one of removed) expect(one.putItBack).toContain('point a line of another plan at it')
    expect(String(said['note'])).toContain('2 of its lines were filed as work.')

    for (const id of [first, second]) {
      const held = await app.inject({ method: 'GET', url: `/api/records/${id}` })
      expect(held.statusCode, held.body).toBe(200)
      expect(JSON.parse(held.body).record.deletedAt).toBeNull()
    }
  })

  it('says so plainly when nothing on the plan was ever filed', async () => {
    const plan = await newPlan('- replace the gripper\n- gaze')
    const res = await app.inject({ method: 'DELETE', url: `/api/plans/${plan.id}` })
    expect(res.statusCode, res.body).toBe(200)
    expect(bodyOf(res)['removedBindings']).toEqual([])
    expect(String(bodyOf(res)['note'])).toContain('No line of it was filed as work.')
  })
})

// ============================================================ taking the work off a line

describe('taking the work off a line', () => {
  it('unbinds the line, keeps the record, and says what the plan can no longer reach', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze')
    const line = plan.lines[1]!
    const recordId = (await fileAsWork(plan.id, line.id))['recordId'] as string

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${line.id}`,
      payload: { recordId: null },
      headers: READER,
    })
    expect(res.statusCode, res.body).toBe(200)
    const said = bodyOf(res)

    expect((said['line'] as Line).recordId).toBeNull()
    // The line keeps its own words: they were the person's before the binding and after it.
    expect((said['line'] as Line).text).toBe('- replace the gripper')
    expect((said['removed'] as { recordId: string }).recordId).toBe(recordId)
    expect(String(said['note'])).toContain('This line points at nothing now.')
    expect(String(said['note'])).toContain('nothing was deleted')

    const stored = await linesOf(plan.id)
    expect(stored[1]!.id).toBe(line.id)
    expect(stored[1]!.recordId).toBeNull()

    // THE RECORD IS UNTOUCHED. Withdrawing a claim about a line is not a statement about the work.
    const held = await app.inject({ method: 'GET', url: `/api/records/${recordId}` })
    expect(held.statusCode, held.body).toBe(200)
    expect(JSON.parse(held.body).record.title).toBe('replace the gripper')
    expect(JSON.parse(held.body).record.deletedAt).toBeNull()
  })

  it('refuses to take work off a line that points at none, and writes nothing', async () => {
    const plan = await newPlan('- replace the gripper')
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${plan.lines[0]!.id}`,
      payload: { recordId: null },
      headers: READER,
    })
    expect(res.statusCode).toBe(409)
    expect(String(bodyOf(res)['error'])).toContain('does not point at any work')
  })

  /**
   * AND THE LINE CAN BE POINTED SOMEWHERE ELSE AFTERWARDS WITHOUT `replacing`, because it now points
   * at nothing. That is the whole reason this exists: before it, the only way out of a wrong binding
   * was to delete the line.
   */
  it('leaves the line free to be pointed at other work', async () => {
    const plan = await newPlan('- replace the gripper\n- gaze')
    const line = plan.lines[0]!
    await fileAsWork(plan.id, line.id)
    const other = (await fileAsWork(plan.id, plan.lines[1]!.id))['recordId'] as string

    await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${line.id}`,
      payload: { recordId: null },
      headers: READER,
    })
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${line.id}`,
      payload: { recordId: other },
      headers: READER,
    })
    expect(res.statusCode, res.body).toBe(200)
    expect((await linesOf(plan.id))[0]!.recordId).toBe(other)
  })

  it('refuses `replacing` beside a null, and says what to send instead', async () => {
    const plan = await newPlan('- replace the gripper')
    const recordId = (await fileAsWork(plan.id, plan.lines[0]!.id))['recordId'] as string
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${plan.lines[0]!.id}`,
      payload: { recordId: null, replacing: recordId },
      headers: READER,
    })
    expect(res.statusCode).toBe(400)
    expect(String(bodyOf(res)['error'])).toContain('{"recordId": null}')
    // Nothing was written by the refusal.
    expect((await linesOf(plan.id))[0]!.recordId).toBe(recordId)
  })
})

// ============================================================ filing, and the two refusals that went

describe('filing a line whose words name work that already exists', () => {
  it('files it anyway, and names what else is called this', async () => {
    // A NAME NO OTHER CASE IN THIS FILE USES, because the office is shared and the reply names
    // every record in the project that is called this.
    const work = 'trim the mast, then stow it'
    const plan = await newPlan(`- ${work}\n- ${work}`)
    const first = (await fileAsWork(plan.id, plan.lines[0]!.id))['recordId'] as string

    const second = await fileAsWork(plan.id, plan.lines[1]!.id)
    expect(second['recordId']).not.toBe(first)
    const named = second['alsoCalledThis'] as { id: string; kind: string; title: string }[]
    expect(named).toEqual([{ id: first, kind: 'task', title: work }])
    expect(String(second['note'])).toContain(`already called "${work}"`)
    expect(String(second['note'])).toContain('This is a separate record.')

    // Two records, and the two lines point at one each. ID is identity; the title is presentation.
    const stored = await linesOf(plan.id)
    expect(stored[0]!.recordId).toBe(first)
    expect(stored[1]!.recordId).toBe(second['recordId'])
  })

  /**
   * THE ONE THE OWNER MET: the owner removed a line, wrote the line again, and was refused because a record
   * the owner had just DELETED still held the name.
   */
  it('files it when only a deleted record holds the name', async () => {
    const work = 'stow the cradle after dark'
    const plan = await newPlan(`- ${work}\n- ${work}`)
    const first = (await fileAsWork(plan.id, plan.lines[0]!.id))['recordId'] as string
    const dropped = await app.inject({
      method: 'DELETE',
      url: `/api/records/${first}`,
      headers: { 'x-mole-office-workspace': 'default', ...READER },
    })
    expect(dropped.statusCode, dropped.body).toBe(200)

    const second = await fileAsWork(plan.id, plan.lines[1]!.id)
    expect(second['recordId']).not.toBe(first)
    // A DELETED RECORD IS NOT OFFERED: no line may point at one, so naming it as something to link
    // to would be offering a press that is refused.
    expect(second['alsoCalledThis']).toEqual([])
  })

  it('says nothing about other names when nothing else is called this', async () => {
    const work = 'level the bench before noon'
    const plan = await newPlan(`- ${work}`)
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)
    expect(filed['alsoCalledThis']).toEqual([])
    expect(String(filed['note'])).toBe(`Filed as work, called "${work}".`)
  })
})

/**
 * A BLOCK IS REFUSED AT THE GATE, WITH NOTHING ATTEMPTED.
 *
 * `block` is a kind a plan can give hours to and cannot be filed on its own, so this filing always
 * failed — inside the transaction, after the record row, the allocation, the rewritten line and the
 * parent link had all been attempted and rolled back. It is refused before any of that now, in the
 * sentence the records layer would have used.
 */
describe('filing a line as a block', () => {
  it('refuses it before anything is attempted, and says where a block goes', async () => {
    // THE WHOLE OFFICE, read before this case writes anything, because other cases share it. The
    // assertion stays about every row: nothing was written by the refusal.
    const recordsBefore = (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n
    const plan = await newPlan('- replace the gripper')
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${plan.lines[0]!.id}/file-as-work`,
      payload: { kind: 'block', workspaceId: 'default' },
    })
    expect(res.statusCode).toBe(400)
    expect(String(bodyOf(res)['error'])).toContain('A block belongs to a pipeline')
    expect(String(bodyOf(res)['error'])).toContain('/blocks')

    // Nothing was written: no record, and the line is still filed as nothing.
    expect(
      (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n,
    ).toBe(recordsBefore)
    expect((await linesOf(plan.id))[0]!.recordId).toBeNull()
  })

  /**
   * AND THIS IS WHAT SHOWS THE REFUSAL IS AT THE GATE AND NOT INSIDE THE TRANSACTION.
   *
   * A rollback leaves the same empty database behind, so "nothing was written" cannot tell the two
   * apart. THE ORDER CAN. The project is looked up after the kind is checked, so a block filed into
   * a project nobody has is answered about the block. While the refusal lived inside the
   * transaction, the missing project was met first and this answered 404.
   */
  it('answers about the block before it has even looked the project up', async () => {
    const plan = await newPlan('- replace the gripper')
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${plan.lines[0]!.id}/file-as-work`,
      payload: { kind: 'block', workspaceId: 'no-such-project' },
    })
    expect(res.statusCode).toBe(400)
    expect(String(bodyOf(res)['error'])).toContain('A block belongs to a pipeline')
  })
})
