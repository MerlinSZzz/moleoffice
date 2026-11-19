// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A LINE SAYS ABOUT ITSELF: PLANNING INTENT UNTIL IT IS FILED, AND WHERE IT GOES WHEN IT IS.
 *
 * What these tests are about, in one sentence each:
 *
 *   - A planning value on a line nobody has filed enters NO arithmetic: no allocation, no hours in
 *     any week, no capacity used, no work planned.
 *   - Filing a line moves the size to the record's estimate, the project to the project it is filed
 *     in, and the time to an allocation, and each value that moved LEAVES the line's words.
 *   - The reply names every value: what moved and where, or what stayed and why.
 *   - A kind with no estimate keeps the size on the line and is still filed. Nothing is dropped and
 *     no field is invented.
 *   - Time that does not read cleanly is kept as an intent and enters no total.
 *   - The note lives in the words, so editing the words keeps it — problem `6DIqEdKWuMgN`.
 *   - The note migration moves every stored remark into its line's text, and refuses rather than
 *     mangling a note it cannot write there.
 *
 * Everything goes through the real routes on a throwaway database, because the boundary being
 * proved is what a caller can and cannot make happen.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { weekKey } from '../src/shared/planning.ts'
import type { BuiltServer } from '../src/server/index.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: BuiltServer['app']

/**
 * What this case wrote into the two shared tables it is read back from. The office is made once for
 * the file, so each case takes fingers of the whole week and of `plan_lines` at its start, and
 * removes what it added at its end. The readings themselves stay whole.
 */
let allocationIdsAtStart = new Set<string>()
let planLinesWrittenByThisCase: string[] = []

beforeAll(async () => {
  t = await freshDb()
  const { apiApp } = await import('./helpers.ts')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(() => {
  allocationIdsAtStart = new Set(
    (t.client.sqlite.prepare('SELECT id FROM allocations').all() as { id: string }[]).map((row) => row.id),
  )
  planLinesWrittenByThisCase = []
})

afterEach(() => {
  const sqlite = t.client.sqlite
  const held = (sqlite.prepare('SELECT id FROM allocations').all() as { id: string }[]).map((row) => row.id)
  for (const id of held) {
    if (allocationIdsAtStart.has(id)) continue
    sqlite.prepare('DELETE FROM allocations WHERE id = ?').run(id)
  }
  for (const id of planLinesWrittenByThisCase) sqlite.prepare('DELETE FROM plan_lines WHERE id = ?').run(id)
  planLinesWrittenByThisCase = []
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** The rows of a whole-table reading that were not there when the case started. */
function addedSince<T>(before: readonly T[], after: readonly T[], key: (one: T) => string): T[] {
  const had = new Set(before.map(key))
  return after.filter((one) => !had.has(key(one)))
}

type Json = Record<string, unknown>

function bodyOf(res: { body: string }): Json {
  return JSON.parse(res.body) as Json
}

async function newPlan(body: string): Promise<{ id: string; lines: { id: string; text: string }[] }> {
  const res = await app.inject({ method: 'POST', url: '/api/plans', payload: { title: 'Robotics week', body } })
  expect(res.statusCode, res.body).toBe(201)
  const made = bodyOf(res)
  return { id: (made['plan'] as { id: string }).id, lines: made['lines'] as { id: string; text: string }[] }
}

interface Promoted {
  key: string
  said: string
  moved: boolean
  wentTo: string | null
  stayed: string | null
}

async function fileAsWork(
  planId: string,
  lineId: string,
  payload: Record<string, unknown> = { kind: 'task', workspaceId: 'default' },
): Promise<{ status: number; body: Json; promoted: Promoted[]; text: string }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/plans/${planId}/lines/${lineId}/file-as-work`,
    payload,
  })
  const body = bodyOf(res)
  return {
    status: res.statusCode,
    body,
    promoted: (body['promoted'] ?? []) as Promoted[],
    text: ((body['line'] ?? {}) as { text?: string }).text ?? '',
  }
}

/** The lines as stored, read back through the route a reader uses. */
async function linesOf(id: string): Promise<{ id: string; text: string; remark: string | null }[]> {
  const res = await app.inject({ method: 'GET', url: `/api/plans/${id}` })
  expect(res.statusCode, res.body).toBe(200)
  const rows = bodyOf(res)['lines'] as { line: { id: string; text: string; remark: string | null } }[]
  return rows.map((row) => row.line)
}

function count(table: string): number {
  return (t.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
}

/** What this week says about itself, through the route every schedule surface reads. */
async function thisWeek(): Promise<{ entries: number; plannedHours: number; unstated: number }> {
  const res = await app.inject({ method: 'GET', url: `/api/planning/week/${weekKey(new Date())}` })
  expect(res.statusCode, res.body).toBe(200)
  const body = bodyOf(res)
  const fit = body['fit'] as { load: { plannedHours: number }; unstated: number }
  return {
    entries: (body['entries'] as unknown[]).length,
    plannedHours: fit.load.plannedHours,
    unstated: fit.unstated,
  }
}

// ================================================== planning intent never enters arithmetic

describe('a planning value on a line nobody has filed is not a fact', () => {
  it('adds no hours to the week, uses no capacity and writes no allocation', async () => {
    await app.inject({
      method: 'PUT',
      url: `/api/planning/capacity/week/${weekKey(new Date())}`,
      payload: { hours: 20 },
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    })
    await newPlan(
      [
        '- Build the controller {size: 15h} {time: 15h this week} {project: robotics}',
        '- Perception {time: 4h this week}',
      ].join('\n'),
    )

    expect(count('allocations')).toBe(0)
    const week = await thisWeek()
    expect(week.entries).toBe(0)
    expect(week.plannedHours).toBe(0)

    // And the week says so in the words a person reads, rather than only in the numbers.
    const res = await app.inject({ method: 'GET', url: `/api/planning/week/${weekKey(new Date())}` })
    expect(bodyOf(res)['note']).toMatch(/Nothing is planned/)
  })

  it('keeps the words on the line and reports them as written, not as scheduled', async () => {
    const plan = await newPlan('- Build the controller {size: 15h} {time: 15h this week}')
    const stored = await linesOf(plan.id)
    expect(stored[0]!.text).toBe('- Build the controller {size: 15h} {time: 15h this week}')
    const res = await app.inject({ method: 'GET', url: `/api/plans/${plan.id}` })
    const lines = bodyOf(res)['lines'] as { line: { planning: { key: string; value: string }[] } }[]
    expect(lines[0]!.line.planning).toEqual([
      { key: 'size', value: '15h' },
      { key: 'time', value: '15h this week' },
    ])
  })
})

// ================================================== filing promotes, and says what it moved

describe('filing a line moves what the line says to where that kind of fact lives', () => {
  it('moves the size, the project and the time, and takes each one out of the words', async () => {
    const plan = await newPlan(
      '- Build the controller {size: 15h} {time: 15h this week} {project: default} {note: ask Sam}',
    )
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    // The title is the words without the groups: they are fields, not something written about the work.
    expect(filed.body['title']).toBe('Build the controller')
    // Everything that moved has left the line. The note has not, because it has nowhere to go.
    expect(filed.text).toBe('- Build the controller {note: ask Sam}')

    const record = bodyOf(
      await app.inject({ method: 'GET', url: `/api/records/${filed.body['recordId'] as string}` }),
    )['record'] as { data: { effort_hours?: number }; workspaceId: string }
    expect(record.data.effort_hours).toBe(15)
    expect(record.workspaceId).toBe('default')

    const week = await thisWeek()
    expect(week.entries).toBe(1)
    expect(week.plannedHours).toBe(15)

    // THE REPLY NAMES EVERY ONE OF THEM. A value that moved and was not reported is a document the
    // caller thinks it still has.
    const byKey = new Map(filed.promoted.map((one) => [one.key, one]))
    expect(byKey.get('size')!.moved).toBe(true)
    expect(byKey.get('size')!.wentTo).toContain('estimate')
    expect(byKey.get('project')!.moved).toBe(true)
    expect(byKey.get('time')!.moved).toBe(true)
    expect(byKey.get('time')!.wentTo).toContain('allocation')
    expect(byKey.get('note')!.moved).toBe(false)
    expect(byKey.get('note')!.stayed).toMatch(/nowhere else to live/)
    // IN `detail`, WHICH IS THE HALF OF THE REPLY THAT ACCOUNTS FOR EVERY VALUE. The reply says
    // what happened at two lengths now: `note` is one or two plain sentences for the person who
    // pressed the button, with no ids in them, and `detail` is the whole account for a developer
    // view and for a caller. Both are built from the same fields of one reply.
    expect(filed.body['detail']).toContain('moved out of its words')
  })

  it('leaves the size on a kind that has no estimate, files it anyway, and says why', async () => {
    for (const kind of ['direction', 'problem']) {
      const plan = await newPlan(`- Try ${kind} landmarks {size: 5h}`)
      const filed = await fileAsWork(plan.id, plan.lines[0]!.id, { kind, workspaceId: 'default' })
      expect(filed.status, JSON.stringify(filed.body)).toBe(201)
      // Filed. The estimate is not a reason to refuse the whole filing.
      expect(filed.body['recordId']).toBeTruthy()
      // Still in the words, and still planning intent.
      expect(filed.text).toBe(`- Try ${kind} landmarks {size: 5h}`)
      const size = filed.promoted.find((one) => one.key === 'size')!
      expect(size.moved).toBe(false)
      expect(size.stayed).toContain('planning intent')
      expect(size.stayed).toContain(`A ${kind} has no estimate`)
      // No field was invented on the record.
      const record = bodyOf(
        await app.inject({ method: 'GET', url: `/api/records/${filed.body['recordId'] as string}` }),
      )['record'] as { data: Record<string, unknown> }
      expect('effort_hours' in record.data).toBe(false)
    }
  })

  it('leaves the project when the line names a different one from the filing', async () => {
    const plan = await newPlan('- Build the controller {project: robotics}')
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    expect(filed.text).toBe('- Build the controller {project: robotics}')
    const project = filed.promoted.find((one) => one.key === 'project')!
    expect(project.moved).toBe(false)
    expect(project.stayed).toContain('"robotics"')
    expect(project.stayed).toContain('did not move the record')
  })

  it('moves nothing when a key is written twice, and says it will not pick one', async () => {
    const plan = await newPlan('- Build the controller {size: 2h} {size: 4h}')
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    expect(filed.text).toBe('- Build the controller {size: 2h} {size: 4h}')
    expect(filed.promoted.every((one) => !one.moved)).toBe(true)
    expect(filed.promoted[0]!.stayed).toContain('will not pick one')
  })

  it('does not read hours out of a hedge, and keeps the words', async () => {
    const plan = await newPlan('- Build the controller {size: around 5h}')
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    expect(filed.text).toBe('- Build the controller {size: around 5h}')
    const record = bodyOf(
      await app.inject({ method: 'GET', url: `/api/records/${filed.body['recordId'] as string}` }),
    )['record'] as { data: Record<string, unknown> }
    expect('effort_hours' in record.data).toBe(false)
  })
})

// ================================================== time that cannot be read stays in the line

/**
 * TIME NOTHING COULD BE MADE OF STAYS IN THE WORDS, AND FILING WRITES IT NOWHERE.
 *
 * WHAT THIS TEST SAID BEFORE 17 AUGUST 2026, AND WHY IT CHANGED. It asserted that filing took
 * `{time: sometime next week}` out of the line and wrote one `kept` row in `planning_intents`
 * instead. That is the behaviour the owner's phase-gate run caught: the words left the box the owner was
 * typing in and reappeared only in a panel that sits below the fold at three of four ordinary window
 * sizes, and nothing canonical had been written — no allocation, no hours, no total. So nothing was
 * promoted, and `design/ROUND-FIVE.md` decision 1 already says a value that cannot be promoted stays
 * in the text and says why.
 *
 * The claim is not weakened by the change. Everything it proved is still proved — no allocation, no
 * week moved, the words survive, the reply says nothing was scheduled — and two claims are added:
 * the words are still in the line's own text, and nothing was written to `planning_intents` at all.
 */
describe('time Mole Office cannot read stays in the line, and is never guessed at', () => {
  it('writes no allocation, adds nothing to any week, and leaves the words where they were typed', async () => {
    const plan = await newPlan('- Build the controller {time: sometime next week}')
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    // NOTHING WAS SCHEDULED. This is the half of the eighth rule that has to be a test.
    expect(count('allocations')).toBe(0)
    expect((await thisWeek()).plannedHours).toBe(0)
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    const res = await app.inject({ method: 'GET', url: `/api/planning/week/${weekKey(nextWeek)}` })
    const fit = bodyOf(res)['fit'] as { load: { plannedHours: number } }
    expect(fit.load.plannedHours).toBe(0)

    // AND THE WORDS ARE STILL IN THE LINE, exactly as typed. This is the assertion the owner's run
    // asked for: nothing a person wrote leaves the prose unless it became a fact somewhere else.
    // WHAT WAS READ OUT OF THEM IS `readTimeWords` IN shared/planning.ts, which is the one reader of
    // loose time and refuses a phrase holding a word like "sometime". Nothing here reads those words
    // a second time.
    expect(filed.text).toBe('- Build the controller {time: sometime next week}')

    // AND NOTHING WAS WRITTEN ANYWHERE ELSE. A `kept` row holding the same phrase that is still in
    // the line is one fact in two places, which is the defect this repository keeps finding.
    const intents = t.client.sqlite
      .prepare('SELECT said, period, hours, state FROM planning_intents')
      .all() as { said: string; period: string | null; hours: number | null; state: string }[]
    expect(intents).toHaveLength(0)
    expect(filed.body['intentId']).toBeNull()

    const time = filed.promoted.find((one) => one.key === 'time')!
    expect(time.moved).toBe(false)
    expect(time.stayed).toContain('Nothing was scheduled from "sometime next week"')
    expect(time.stayed).toContain('stays in the line where you typed it')
  })
})

// ================================================== the note is part of the words

describe('a note lives in the line, so editing the line keeps it', () => {
  it('writes the note into the words and hands the new words back', async () => {
    const plan = await newPlan('- baseline\n- gaze')
    const line = plan.lines[0]!
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${line.id}`,
      payload: { remark: 'the arm is free from the 17th' },
    })
    expect(res.statusCode, res.body).toBe(200)
    const stored = await linesOf(plan.id)
    expect(stored[0]!.text).toBe('- baseline {note: the arm is free from the 17th}')
    expect(stored[0]!.remark).toBe('the arm is free from the 17th')
    expect(bodyOf(res)['note']).toContain('the line\'s own words')

    // AND THE COLUMN IS NOT WRITTEN. Two places holding one note is what this change removes.
    const row = t.client.sqlite.prepare('SELECT remark FROM plan_lines WHERE id = ?').get(line.id) as {
      remark: string | null
    }
    expect(row.remark).toBeNull()
  })

  it('keeps the note when the words of the line are edited, which is problem 6DIqEdKWuMgN', async () => {
    const plan = await newPlan('- baseline\n- gaze')
    const line = plan.lines[0]!
    await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${line.id}`,
      payload: { remark: 'the arm is free from the 17th' },
    })
    // The document as a person now sees it, with one word changed in the line that has the note.
    const edited = ['- baseline gains {note: the arm is free from the 17th}', '- gaze'].join('\n')
    const res = await app.inject({ method: 'PUT', url: `/api/plans/${plan.id}/body`, payload: { body: edited } })
    expect(res.statusCode, res.body).toBe(200)

    const stored = await linesOf(plan.id)
    expect(stored[0]!.text).toBe('- baseline gains {note: the arm is free from the 17th}')
    expect(stored[0]!.remark).toBe('the arm is free from the 17th')
  })

  it('takes the note off when an empty one is sent, and says so', async () => {
    const plan = await newPlan('- baseline {note: ask Sam}')
    const line = plan.lines[0]!
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${line.id}`,
      payload: { remark: null },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect((await linesOf(plan.id))[0]!.text).toBe('- baseline')
    expect(bodyOf(res)['note']).toContain('taken off the line')
  })

  it('refuses a note that cannot be written into a line, and writes nothing', async () => {
    const plan = await newPlan('- baseline')
    const line = plan.lines[0]!
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${line.id}`,
      payload: { remark: 'use the {gripper}' },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(bodyOf(res)['error']).toContain('curly bracket')
    expect((await linesOf(plan.id))[0]!.text).toBe('- baseline')
  })
})


// ================================================== the migration that moved the stored notes

describe('the note migration moves every stored note into its line', () => {
  /** A stored line as it was written before the note moved: the note in the column. */
  function line(id: string, text: string, remark: string | null): void {
    t.client.sqlite
      .prepare(
        'INSERT INTO plan_lines (id, plan_id, position, text, record_id, remark, updated_at, updated_by) ' +
          'VALUES (?, ?, ?, ?, NULL, ?, ?, ?)',
      )
      .run(id, 'plan-1', 1, text, remark, '2026-08-16 09:00:00', `human:${THE_TEST_OFFICES_OWNER.id}`)
    planLinesWrittenByThisCase.push(id)
  }

  function stored(): { id: string; text: string; remark: string | null; updated_at: string }[] {
    return t.client.sqlite.prepare('SELECT id, text, remark, updated_at FROM plan_lines ORDER BY id').all() as {
      id: string
      text: string
      remark: string | null
      updated_at: string
    }[]
  }

  it('appends the note to the words and empties the column', async () => {
    const before = stored()
    line('l-1', '- baseline', 'the arm is free from the 17th')
    line('l-2', '- gaze', null)
    line('l-3', '- prose with {braces}', 'ask Sam')
    line('l-4', '- blank note', '   ')
    const { migratePlanNotes } = await import('../src/server/db/plan-note-migration.ts')
    const report = migratePlanNotes(t.client.sqlite)

    expect(report.moved).toBe(2)
    expect(report.blank).toBe(1)
    const added = addedSince(before, stored(), (row) => row.id)
    expect(added.map((row) => [row.id, row.text, row.remark])).toEqual([
      ['l-1', '- baseline {note: the arm is free from the 17th}', null],
      ['l-2', '- gaze', null],
      ['l-3', '- prose with {braces} {note: ask Sam}', null],
      // A note that was nothing but spaces was never a note, so nothing is added to the words.
      ['l-4', '- blank note', null],
    ])
    // AND THE LINE IS NOT RESTAMPED. This migration is not somebody writing in their plan.
    expect(added.every((row) => row.updated_at === '2026-08-16 09:00:00')).toBe(true)
  })

  it('is safe to run twice: the second run finds nothing and writes nothing', async () => {
    const before = stored()
    line('l-1', '- baseline', 'ask Sam')
    const { migratePlanNotes } = await import('../src/server/db/plan-note-migration.ts')
    migratePlanNotes(t.client.sqlite)
    const after = stored()
    const second = migratePlanNotes(t.client.sqlite)
    expect(second.alreadyDone).toBe(true)
    expect(second.moved).toBe(0)
    expect(stored()).toEqual(after)
    expect(addedSince(before, stored(), (row) => row.id)[0]!.text).toBe('- baseline {note: ask Sam}')
  })

  it('refuses a note it cannot write into a line, and changes nothing at all', async () => {
    const before = stored()
    line('l-1', '- baseline', 'use the {gripper}')
    line('l-2', '- gaze', 'ask Sam')
    const { migratePlanNotes } = await import('../src/server/db/plan-note-migration.ts')
    expect(() => migratePlanNotes(t.client.sqlite)).toThrow(/NOTHING WAS MIGRATED/)
    expect(() => migratePlanNotes(t.client.sqlite)).toThrow(/curly bracket/)
    // NOT ONE ROW MOVED, including the one it could have moved: the refusal runs before any write.
    expect(addedSince(before, stored(), (row) => row.id).map((row) => [row.id, row.text, row.remark])).toEqual([
      ['l-1', '- baseline', 'use the {gripper}'],
      ['l-2', '- gaze', 'ask Sam'],
    ])
  })

  it('will not choose between a note in the words and a note in the column', async () => {
    const before = stored()
    line('l-1', '- baseline {note: written in the line}', 'written in the column')
    const { migratePlanNotes } = await import('../src/server/db/plan-note-migration.ts')
    const report = migratePlanNotes(t.client.sqlite)
    expect(report.moved).toBe(0)
    expect(report.notes.map((one) => one.kind)).toEqual(['two_notes'])
    expect(report.notes[0]!.detail).toContain('will not pick one of two things')
    // Both are exactly where they were, which is what "it will not choose" has to mean.
    expect(addedSince(before, stored(), (row) => row.id).map((row) => [row.text, row.remark])).toEqual([
      ['- baseline {note: written in the line}', 'written in the column'],
    ])
  })
})
