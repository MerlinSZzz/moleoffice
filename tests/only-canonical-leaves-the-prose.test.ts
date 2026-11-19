// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NOTHING A PERSON TYPED LEAVES THE PROSE UNLESS IT BECAME A REAL FACT SOMEWHERE THEY CAN SEE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The owner's phase gate for this round is one sentence they must be able to write knowing nothing
 * about Mole Office, and then move between Writing and Table without any part of it disappearing:
 *
 *     do this next week; it is probably large; remember this note
 *
 * Saying it passed. Filing the line with "Make it real work" did not. Filing took
 * `{time: next week}` out of the writing and wrote it into `planning_intents` as words nobody had
 * interpreted — no allocation, no hours, no period, in no total and in no week. So the phrase left
 * the one place the owner could see it while becoming a fact nowhere, and the only thing left drawing it
 * was a panel below the box, which the owner's own run found BELOW THE FOLD at 1440x800, 1280x720 and
 * 390x844 (visible only at 1440x900).
 *
 * `design/ROUND-FIVE.md` decision 1 had already ruled on this from both sides. A promoted group is
 * removed from the line BECAUSE a value in two places is the defect this repository keeps finding;
 * and in the same decision, "a value that cannot be promoted stays in the text and says why". A
 * kept intent is not a canonical row. It is the same words in another table. So nothing had been
 * promoted and the removal was unearned. This is a bug against a decision that already existed.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THESE TESTS HOLD
 * ---------------------------------------------------------------------------------------
 *
 * A group leaves the line ONLY when it truly became canonical:
 *
 *   size     the record's `effort_hours`
 *   project  the project the record is filed in
 *   time     an allocation, with hours AND a period
 *
 * Anything less stays in the line, exactly as `{size: probably large}` already did, and the receipt
 * says it stayed and why. AND NOTHING IS WRITTEN TO `planning_intents` FOR IT: a kept row holding
 * words that are still in the line is one fact in two places, which is the defect the removal was
 * meant to prevent, arriving through the door meant to prevent it.
 *
 * Both halves are tested here, because either one alone can be passed by a wrong build. A version
 * that never moves anything passes the first half; a version that moves everything passes the
 * second. `filing still moves what really became canonical` is the control for the rest.
 *
 * Everything goes through the real routes on one throwaway database for the file.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { weekKey } from '../src/shared/planning.ts'
import type { BuiltServer } from '../src/server/index.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: BuiltServer['app']
let allocationsAtStart: number
let intentsAtStart: number
let project = 'default'
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  const { apiApp } = await import('./helpers.ts')
  app = (await apiApp()).app
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  project = `only-canonical-case-${String(caseNumber)}`
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: project, title: `Only canonical case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
  allocationsAtStart = countOf('allocations')
  intentsAtStart = countOf('planning_intents')
})

type Json = Record<string, unknown>

const bodyOf = (res: { body: string }): Json => JSON.parse(res.body) as Json

interface Promoted {
  key: string
  said: string
  moved: boolean
  wentTo: string | null
  nowIn: string | null
  stayed: string | null
}

interface Filed {
  status: number
  body: Json
  text: string
  promoted: Promoted[]
  note: string
}

async function newPlan(body: string): Promise<{ id: string; lines: { id: string; text: string }[] }> {
  const res = await app.inject({ method: 'POST', url: '/api/plans', payload: { title: 'A rough plan', body } })
  expect(res.statusCode, res.body).toBe(201)
  const made = bodyOf(res)
  return { id: (made['plan'] as { id: string }).id, lines: made['lines'] as { id: string; text: string }[] }
}

async function fileAsWork(planId: string, lineId: string): Promise<Filed> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/plans/${planId}/lines/${lineId}/file-as-work`,
    payload: { kind: 'task', workspaceId: project },
  })
  const body = bodyOf(res)
  return {
    status: res.statusCode,
    body,
    text: ((body['line'] ?? {}) as { text?: string }).text ?? '',
    promoted: (body['promoted'] ?? []) as Promoted[],
    note: String(body['note'] ?? ''),
  }
}

/** The plan as both views read it, through the one route they share. */
async function readLines(planId: string): Promise<
  { line: { id: string; text: string; recordId: string | null }; derived: { key: string; canonical: boolean }[] }[]
> {
  const res = await app.inject({ method: 'GET', url: `/api/plans/${planId}` })
  expect(res.statusCode, res.body).toBe(200)
  return bodyOf(res)['lines'] as {
    line: { id: string; text: string; recordId: string | null }
    derived: { key: string; canonical: boolean }[]
  }[]
}

/** Every row of a table, counted straight from SQLite, so nothing can hide behind a reply. */
const countOf = (table: string): number =>
  (t.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n

// ============================================================ the phase-gate sentence, end to end

/** The owner's phase-gate sentence, written the way the table writes it into a line. */
const THEIR_SENTENCE = '- Do this {time: next week} {size: probably large} {note: remember this note}'

describe('the phase-gate sentence survives being filed as work', () => {
  it('keeps every part of it in the line, because none of it became canonical', async () => {
    const plan = await newPlan(THEIR_SENTENCE)
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    // NOT ONE CHARACTER OF IT LEFT. "next week" says when and not how long, "probably large" is not
    // a number of hours, and a note has no canonical home at all, so nothing reached one.
    expect(filed.text).toBe(THEIR_SENTENCE)
    expect(filed.body['whatLeftTheLine']).toBeNull()

    // AND IT IS STILL THERE ON A FRESH READ, which is what switching between Writing and Table does.
    const lines = await readLines(plan.id)
    expect(lines[0]!.line.text).toBe(THEIR_SENTENCE)
    expect(lines[0]!.line.recordId).not.toBeNull()

    // NOTHING WAS WRITTEN ANYWHERE ELSE EITHER. No hours, and no second copy of the sentence.
    expect(countOf('allocations') - allocationsAtStart).toBe(0)
    expect(countOf('planning_intents') - intentsAtStart).toBe(0)
    expect(filed.body['allocationId']).toBeNull()
    expect(filed.body['intentId']).toBeNull()
  })

  it('survives writing the whole document again, which is what a view switch saves', async () => {
    const plan = await newPlan(THEIR_SENTENCE)
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/body`,
      payload: { body: filed.text },
    })
    expect(saved.statusCode, saved.body).toBe(200)

    const lines = await readLines(plan.id)
    expect(lines[0]!.line.text).toBe(THEIR_SENTENCE)
    expect(countOf('planning_intents') - intentsAtStart).toBe(0)
  })

  /**
   * WHAT THE PERSON READS IN THE SECOND THEY PRESS. The receipt has to say that the typed words stayed AND that
   * nothing was scheduled from the time, or "it stayed" beside a phrase about a week reads as hours
   * somebody now has.
   */
  it('says the words stayed and that nothing was scheduled from them', async () => {
    const plan = await newPlan(THEIR_SENTENCE)
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)

    expect(filed.note).toContain('"next week"')
    expect(filed.note).toContain('"probably large"')
    expect(filed.note).toContain('stayed in the line as your own words')
    expect(filed.note).toContain('nothing has been scheduled from')
    // The receipt is for a person: no ids in it, and no shouting.
    expect(filed.note).not.toContain(String(filed.body['recordId']))
    expect(filed.note).not.toMatch(/[A-Z]{3,}/)

    // AND THE WHOLE ACCOUNT IS STILL BESIDE IT, one field along, for a developer view.
    const time = filed.promoted.find((one) => one.key === 'time')!
    expect(time.moved).toBe(false)
    expect(time.nowIn).toBeNull()
    expect(String(time.stayed)).toContain('Nothing was scheduled from "next week"')
    expect(String(time.stayed)).toContain('It is in no total and it uses no capacity.')
  })
})

// ============================================================ and what really does leave

describe('filing still moves what really became canonical', () => {
  /**
   * THE CONTROL FOR EVERY TEST ABOVE. Without this, a build that simply stopped promoting anything
   * would pass the whole file, and the plan's own arithmetic would quietly stop working.
   */
  it('takes the size, the project and real hours out of the line', async () => {
    const week = weekKey(new Date())
    const plan = await newPlan(`- Build the rig {size: 15h} {time: 15h ${week}} {project: ${project}}`)
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    // ALL THREE LEFT THE WORDS, because all three reached a canonical home.
    expect(filed.text).toBe('- Build the rig')
    expect(filed.promoted.every((one) => one.moved), JSON.stringify(filed.promoted)).toBe(true)

    // AND THE HOURS ARE REAL HOURS: one allocation, in that week, on that record.
    expect(countOf('allocations') - allocationsAtStart).toBe(1)
    const allocation = t.client.sqlite
      .prepare('SELECT period, planned_hours AS hours, record_id AS record FROM allocations WHERE record_id = ?')
      .get(filed.body['recordId']) as { period: string; hours: number; record: string }
    expect(allocation.period).toBe(week)
    expect(allocation.hours).toBe(15)
    expect(allocation.record).toBe(filed.body['recordId'])

    // The estimate is on the record, which is the size's canonical home.
    const record = bodyOf(
      await app.inject({
        method: 'GET',
        url: `/api/records/${String(filed.body['recordId'])}`,
        headers: { 'x-mole-office-workspace': project },
      }),
    )['record'] as { data: Record<string, unknown> }
    expect(record.data['effort_hours']).toBe(15)
  })

  /**
   * ONE LINE, BOTH HALVES OF THE RULE. The hours become an allocation and leave; the rough size
   * cannot become an estimate and stays. This is the pair a reader has to be able to tell apart,
   * and the difference is whether the value reached a canonical home — nothing else.
   */
  it('moves the hours and leaves the rough size on the same line', async () => {
    const week = weekKey(new Date())
    const plan = await newPlan(`- Ship it {size: probably large} {time: 2h ${week}}`)
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)

    expect(filed.text).toBe('- Ship it {size: probably large}')
    expect(countOf('allocations') - allocationsAtStart).toBe(1)
    expect(countOf('planning_intents') - intentsAtStart).toBe(0)
    const size = filed.promoted.find((one) => one.key === 'size')!
    const time = filed.promoted.find((one) => one.key === 'time')!
    expect(size.moved).toBe(false)
    expect(time.moved).toBe(true)
    expect(String(time.nowIn)).toBe('hours in the schedule')
  })
})

// ============================================================ the two-places rule, from the other side

describe('filing writes no second copy of words that are still in the line', () => {
  /**
   * THE HALF THAT IS EASY TO GET WRONG WHILE FIXING THE OTHER. Leaving the words in the line and
   * ALSO writing them into `planning_intents` would put one phrase in two places — the very defect
   * the removal existed to prevent — and each copy would carry its own reading, taken at its own
   * moment, so "next week" could stand beside "next week" naming two different weeks.
   */
  it('writes nothing to the intent layer for time it could not schedule', async () => {
    const plan = await newPlan('- Calibrate the wrist {time: sometime in September}')
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    expect(filed.text).toBe('- Calibrate the wrist {time: sometime in September}')
    expect(countOf('planning_intents') - intentsAtStart).toBe(0)
    expect(countOf('allocations') - allocationsAtStart).toBe(0)
    // And the read draws no time for it either, from the record or from anywhere else, because
    // nothing was made of the words. They are in the line, which is where they live.
    const lines = await readLines(plan.id)
    expect(lines[0]!.derived.filter((value) => value.key === 'time')).toEqual([])
  })

  /**
   * WORDS THE TABLE'S OWN BOX KEPT ARE LEFT EXACTLY AS THEY ARE. Pressing "keep these words" in the
   * table stores a row, sometimes with a period the person pressed. Filing does not write a second
   * one, does not remove that one, and names it so nobody has to guess where their words went.
   */
  it('leaves a row the table already kept, and names it instead of writing another', async () => {
    const plan = await newPlan('- Rebuild the gripper {time: next week}')
    const line = plan.lines[0]!.id
    const week = weekKey(new Date())
    const kept = await app.inject({
      method: 'POST',
      url: '/api/planning/intents',
      payload: { said: 'next week', planLineId: line, period: week },
    })
    expect(kept.statusCode, kept.body).toBe(201)
    const keptId = (bodyOf(kept)['intent'] as { id: string }).id

    const filed = await fileAsWork(plan.id, line)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    // ONE ROW, THE ONE THAT WAS THERE, now about the work so it can be scheduled at all.
    expect(countOf('planning_intents') - intentsAtStart).toBe(1)
    const row = t.client.sqlite
      .prepare('SELECT id, said, record_id AS record FROM planning_intents WHERE id = ?')
      .get(keptId) as {
      id: string
      said: string
      record: string | null
    }
    expect(row.id).toBe(keptId)
    expect(row.said).toBe('next week')
    expect(row.record).toBe(filed.body['recordId'])
    expect(filed.body['intentId']).toBe(keptId)
    // AND THE LINE STILL SAYS IT. The row is not a reason to take the words out of the writing.
    expect(filed.text).toBe('- Rebuild the gripper {time: next week}')
  })
})
