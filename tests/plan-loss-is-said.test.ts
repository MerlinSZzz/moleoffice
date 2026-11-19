// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHEN A PLAN LOSES SOMETHING OR MOVES SOMETHING, THE REPLY SAYS SO IN THE WORDS OF THE PERSON.
 *
 * Two measured failures from 16 August 2026, one test file. Both are about silence rather than
 * about storage: in each case Mole Office did the thing it says it does, and the person watching the
 * screen had no way to know it had happened.
 *
 * ---------------------------------------------------------------------------------------
 * ONE: RENAMING A FILED LINE TOOK REAL WORK OUT OF THE PLAN AND NOTHING SAID A WORD
 * ---------------------------------------------------------------------------------------
 *
 * A reader renamed a line that was filed as work, saved, and reloaded. The row had lost its record,
 * its estimate of 3 hours and its allocation on 2026-08-18; the plan's total fell from 9 hours to 6.
 * The hours were still in the schedule under the record's old name and the plan could no longer
 * reach them. Nothing warned the owner before, during or after, and there was no way back.
 *
 * THE RULE WAS REVERSED, so renaming costs nothing at all now. design/ROUND-SEVEN-OWNER-MESSAGE.md
 * section 5 holds the rule: a filed or bound line keeps its canonical work when its visible words
 * change, because editing prose is normal planning.
 * A line rewritten where it stood keeps its row, so it keeps its work.
 *
 * THESE TESTS WERE WRITTEN AGAINST THE OLD RULE AND NOW HOLD THE NEW ONE DOWN. The first says the
 * rename keeps everything. The rest keep the reporting honest for the losses that are still real —
 * lines Mole Office cannot follow, and lines that were deleted — because the reply naming what left the
 * plan's reach is what made the loss visible in the first place, and it is still the only thing
 * that can.
 *
 * ---------------------------------------------------------------------------------------
 * TWO: FILING TOOK OUT OF THE WRITING EXACTLY THE VALUES PANELX COULD READ, AND SAID NO RULE
 * ---------------------------------------------------------------------------------------
 *
 * All three first-time readers lost a `{time: …}` clause on filing and one thought they had deleted
 * it themselves. A size Mole Office could not turn into hours stayed in the words; one it could was taken.
 * The rule is real and defensible and nobody was told it, so what a person infers is that Mole Office
 * takes what it feels like taking. These tests hold the sentence that says which values left and
 * where each one is now, in the reply the browser prints after the press.
 *
 * Everything here goes through the real routes on a throwaway database. Nothing is asserted about a
 * screen: what a screen does with these fields is not this file's claim to make.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { BuiltServer } from '../src/server/index.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: BuiltServer['app']

/**
 * A project for the case alone. Filing a line as work files a record, and a record whose title the
 * project already holds makes the reply name the other one, so each case files into a project
 * nothing else has written in.
 */
let CASE_PROJECT = 'default'
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
  CASE_PROJECT = `plan-loss-case-${String(caseNumber)}`
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: CASE_PROJECT, title: 'A project for one case' },
  })
  expect(made.statusCode, made.body).toBe(201)
})

type Json = Record<string, unknown>

function bodyOf(res: { body: string }): Json {
  return JSON.parse(res.body) as Json
}

interface Line {
  id: string
  text: string
}

async function newPlan(body: string): Promise<{ id: string; lines: Line[] }> {
  const res = await app.inject({ method: 'POST', url: '/api/plans', payload: { title: 'Robotics week', body } })
  expect(res.statusCode, res.body).toBe(201)
  const made = bodyOf(res)
  return { id: (made['plan'] as { id: string }).id, lines: made['lines'] as Line[] }
}

async function fileAsWork(planId: string, lineId: string): Promise<Json> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/plans/${planId}/lines/${lineId}/file-as-work`,
    payload: { kind: 'task', workspaceId: CASE_PROJECT },
  })
  expect(res.statusCode, res.body).toBe(201)
  return bodyOf(res)
}

async function saveBody(planId: string, body: string): Promise<Json> {
  const res = await app.inject({ method: 'PUT', url: `/api/plans/${planId}/body`, payload: { body } })
  expect(res.statusCode, res.body).toBe(200)
  return bodyOf(res)
}

interface RemovedBinding {
  text: string
  recordId: string
  title: string | null
  lost: { key: string; says: string }[]
  putItBack: string
}

/** Every line of the plan with what its record says back, read through the route a reader reads. */
async function readPlan(planId: string): Promise<
  { line: Line & { recordId: string | null }; derived: { key: string; says: string }[] }[]
> {
  const res = await app.inject({ method: 'GET', url: `/api/plans/${planId}` })
  expect(res.statusCode, res.body).toBe(200)
  return bodyOf(res)['lines'] as {
    line: Line & { recordId: string | null }
    derived: { key: string; says: string }[]
  }[]
}

/**
 * THE OWNER'S OWN LINE: filed as work, estimated at 3 hours, with 3 hours on 2026-08-18.
 *
 * The plan holds two other lines so that a rename is one line removed and one line added between
 * two lines that did not change — which is the ordinary shape of renaming something.
 */
async function planWithFiledWork(): Promise<{ planId: string; recordId: string; lines: Line[] }> {
  const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze')
  const filed = await fileAsWork(plan.id, plan.lines[1]!.id)
  const recordId = filed['recordId'] as string
  const patched = await app.inject({
    method: 'PATCH',
    url: `/api/records/${recordId}`,
    payload: { dataPatch: { effort_hours: 3 } },
    headers: { 'x-mole-office-workspace': CASE_PROJECT, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
  })
  expect(patched.statusCode, patched.body).toBe(200)
  const hours = await app.inject({
    method: 'POST',
    url: `/api/plans/${plan.id}/lines/${plan.lines[1]!.id}/give-time`,
    payload: { horizon: 'day', period: '2026-08-18', plannedHours: 3 },
    headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
  })
  expect(hours.statusCode, hours.body).toBe(201)
  return { planId: plan.id, recordId, lines: plan.lines }
}

// ============================================ one: what a rename keeps, and what a real loss says

describe('renaming a filed line keeps its work, and a loss Mole Office cannot follow is still said', () => {
  /**
   * THE OWNER'S OWN CASE, AND THE ONE THE OWNER REVERSED THE RULE FOR. The owner renamed a filed line and lost
   * three hours of work out of the plan. Now the line is rewritten where it stood, so the row stays
   * and everything it reaches stays with it.
   */
  it('keeps the estimate and the hours when a filed line is renamed', async () => {
    const { planId, recordId, lines } = await planWithFiledWork()

    // BEFORE: the plan reaches both numbers through the line.
    const before = await readPlan(planId)
    expect(before[1]!.derived.map((one) => one.says)).toEqual(
      expect.arrayContaining(['3 hours', '3 hours in 2026-08-18']),
    )

    const saved = await saveBody(planId, '# Robotics\n- replace the gripper mount\n- gaze')
    // NOTHING LEFT THE PLAN, so nothing is reported as having left it.
    expect(saved['removedBindings']).toEqual([])
    expect(String(saved['note'])).toContain('No line that was filed as work was removed.')

    // THE SAME ROW, the person's new words, the same work, and both numbers still in reach.
    const after = await readPlan(planId)
    expect(after[1]!.line.id).toBe(lines[1]!.id)
    expect(after[1]!.line.text).toBe('- replace the gripper mount')
    expect(after[1]!.line.recordId).toBe(recordId)
    expect(after[1]!.derived.map((one) => one.says)).toEqual(
      expect.arrayContaining(['3 hours', '3 hours in 2026-08-18']),
    )
    // And the record is untouched: renaming the line did not rename the work.
    const held = await app.inject({
      method: 'GET',
      url: `/api/records/${recordId}`,
      headers: { 'x-mole-office-workspace': CASE_PROJECT },
    })
    expect(JSON.parse(held.body).record.title).toBe('replace the gripper')
  })

  /**
   * ABSENCE RATHER THAN A GUESS, which is the fifth invariant and the reason the rule above is safe.
   *
   * Two lines rewritten at once could have been swapped, merged, or split, and Mole Office cannot tell
   * which line is which. It carries neither binding, and it says what both of them cost.
   */
  it('drops both bindings when two lines were rewritten in the same place, and names what each cost', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze\n- write it up')
    const first = await fileAsWork(plan.id, plan.lines[1]!.id)
    const second = await fileAsWork(plan.id, plan.lines[2]!.id)
    const saved = await saveBody(plan.id, '# Robotics\n- replace the mount\n- gaze tracking\n- write it up')
    const removed = saved['removedBindings'] as RemovedBinding[]
    expect(removed.map((one) => one.recordId).sort()).toEqual(
      [first['recordId'] as string, second['recordId'] as string].sort(),
    )
    for (const one of removed) {
      expect(one.putItBack).toContain('is not on any line of this plan now')
      expect(one.putItBack).toContain('Point a line at it again')
    }
    // NEITHER RECORD MOVED ONTO A LINE. That is the whole reason Mole Office refuses to guess here.
    const after = await readPlan(plan.id)
    expect(after.map((row) => row.line.recordId)).toEqual([null, null, null, null])
  })

  /**
   * AND THE WAY BACK IS THE ORDINARY ROUTE, with nothing invented and nothing created.
   *
   * The reply names the request that does it. This takes it, on the loss Mole Office really cannot
   * follow, and checks that the work arrives with everything it was holding.
   */
  it('takes the record back onto a line, through the request the reply names', async () => {
    const plan = await newPlan('# Robotics\n- replace the gripper\n- gaze\n- write it up')
    const first = await fileAsWork(plan.id, plan.lines[1]!.id)
    await fileAsWork(plan.id, plan.lines[2]!.id)
    const recordId = first['recordId'] as string
    const saved = await saveBody(plan.id, '# Robotics\n- replace the mount\n- gaze tracking\n- write it up')
    const removed = (saved['removedBindings'] as RemovedBinding[]).find((one) => one.recordId === recordId)!
    expect(removed.putItBack).toContain(`{"recordId":"${recordId}"}`)

    const adrift = await readPlan(plan.id)
    const back = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${adrift[1]!.line.id}`,
      payload: { recordId },
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    })
    expect(back.statusCode, back.body).toBe(200)

    const after = await readPlan(plan.id)
    expect(after[1]!.line.recordId).toBe(recordId)
    // The words stay the person's own: putting the binding back is not renaming anything.
    expect(after[1]!.line.text).toBe('- replace the mount')
  })

  /**
   * A RECEIPT NOBODY READS IS THE DEFECT AGAIN, so the words are capped and the field is not.
   *
   * Emptying a plan can drop a dozen bindings at once. A dozen paragraphs is how a loss becomes
   * invisible a second time, so the note names three and counts the rest, and `removedBindings`
   * still carries every one of them with what it lost and how to put it back.
   */
  it('names three lost bindings in words and counts the rest, losing none of them', async () => {
    const plan = await newPlan('- one\n- two\n- three\n- four')
    for (const line of plan.lines) await fileAsWork(plan.id, line.id)
    const saved = await saveBody(plan.id, '- five')
    const removed = saved['removedBindings'] as RemovedBinding[]
    expect(removed).toHaveLength(4)
    for (const one of removed) expect(one.putItBack).toContain('is not on any line of this plan now')
    const note = String(saved['note'])
    expect(note).toContain('1 more removed line pointed at work')
    expect(note).toContain('"one" is not on any line of this plan now')
    expect(note).not.toContain('"four" is not on any line of this plan now')
  })

  /**
   * A PRESS THAT WOULD BE REFUSED IS NOT OFFERED. Pointing a line at a deleted record is refused by
   * `bindLineToWork`, so a deleted record gets the loss named and the way back it really has —
   * restore it — rather than a request to send that answers with a refusal.
   */
  it('does not offer a way back to work that has been deleted, and says what to do instead', async () => {
    const { planId, recordId } = await planWithFiledWork()
    const dropped = await app.inject({
      method: 'DELETE',
      url: `/api/records/${recordId}`,
      headers: { 'x-mole-office-workspace': CASE_PROJECT, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    })
    expect(dropped.statusCode, dropped.body).toBe(200)

    // The LINE is removed here, not renamed: a renamed line keeps its row and its record, deleted
    // or not, and this is about what a reader is told when the work is really out of reach.
    const saved = await saveBody(planId, '# Robotics\n- gaze')
    const removed = (saved['removedBindings'] as RemovedBinding[])[0]!
    expect(removed.putItBack).toContain('has been deleted')
    expect(removed.putItBack).toContain('Restore it first')
    expect(removed.putItBack).not.toContain('PATCH')
    // The loss is still named: deleting the record did not take the estimate off it.
    expect(removed.lost.map((one) => one.says)).toContain('3 hours')
  })

  /** A line that was deleted outright is a real loss, and the reply names what went with it. */
  it('names what the plan lost when the line was deleted rather than rewritten', async () => {
    const { planId } = await planWithFiledWork()
    const saved = await saveBody(planId, '# Robotics\n- gaze')
    const removed = (saved['removedBindings'] as RemovedBinding[])[0]!
    expect(removed.lost.map((one) => one.says)).toContain('3 hours in 2026-08-18')
    expect(removed.putItBack).toContain('Point a line at it again')
    // AND THE PERSON READING THE REPLY IS TOLD, in the same sentence, not in a field they would have
    // to know to ask for.
    expect(String(saved['note'])).toContain('an estimate of 3 hours')
    expect(String(saved['note'])).toContain('3 hours in 2026-08-18')

    // NOTHING WAS DELETED. The hours are still in the schedule, exactly as the reply says.
    const day = await app.inject({ method: 'GET', url: '/api/planning/day/2026-08-18' })
    expect(day.statusCode, day.body).toBe(200)
    expect(JSON.stringify(bodyOf(day))).toContain('replace the gripper')
  })
})

// ============================================ two: what filing took out of the writing

describe('filing says which values left the words and where each one is now', () => {
  /**
   * WHAT CHANGED HERE ON 17 AUGUST 2026. This test used to expect `{time: 6h}` to leave the words
   * too, because filing wrote it into `planning_intents` as words nobody had interpreted. That is
   * not a canonical home — no allocation, no hours in any week — so nothing was promoted and the
   * removal was unearned. `{time: 6h}` says how long and not when, so it now stays in the line
   * exactly as `{note: ask Sam}` does, and the sentence names only what really left.
   *
   * The claim is not weakened. It still checks that the sentence names every value that left and no
   * value that stayed; what changed is which of the three did which, and the test now also checks
   * that the words that stayed are still in the line and that the receipt says nothing was scheduled
   * from them.
   */
  it('names every value that left, and nothing that stayed', async () => {
    const plan = await newPlan('- Build the controller {size: 3h} {time: 6h} {note: ask Sam}')
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)

    const said = String(filed['whatLeftTheLine'])
    // THE ONE VALUE THAT REACHED A CANONICAL HOME, with where it is now.
    expect(said).toBe('"3h" left the words you typed and is now the estimate.')
    // NEITHER OF THE OTHER TWO IS IN IT. The note has no canonical home, and "6h" reached none.
    expect(said).not.toContain('ask Sam')
    expect(said).not.toContain('6h')
    // AND BOTH ARE STILL IN THE LINE, where the person typed them.
    expect((filed['line'] as Line).text).toBe('- Build the controller {time: 6h} {note: ask Sam}')

    // AND IT IS IN WHAT THE PERSON READS, not only in a field a caller has to know to ask for.
    const note = String(filed['note'])
    expect(note).toContain(said)
    // WITH THE HALF THAT DID NOT MOVE SAID IN THE SAME BREATH: their words are still their words,
    // and nothing has been scheduled from them.
    expect(note).toContain('"6h" stayed in the line as your own words')
    expect(note).toContain('nothing has been scheduled from it')
  })

  /**
   * THE RULE THE READERS COULD NOT SEE: a value Mole Office can read leaves the words and one it cannot
   * read stays. Both halves in one filing, so the sentence is the thing that tells them apart.
   */
  it('leaves a rough size in the words and says only the value that left', async () => {
    const plan = await newPlan('- Ship it {size: probably large} {time: 2h this week}')
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)

    const said = String(filed['whatLeftTheLine'])
    expect(said).toBe('"2h this week" left the words you typed and is now hours in the schedule.')
    expect(said).not.toContain('probably large')
    // The rough size is still exactly where the person typed it.
    expect((filed['line'] as Line).text).toBe('- Ship it {size: probably large}')
    expect(String(filed['note'])).toContain('"2h this week" left the words you typed')
    expect(String(filed['note'])).toContain('"probably large" stayed in the line as your own words')
  })

  it('says nothing left the words when nothing did', async () => {
    const plan = await newPlan('- Ship it')
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)
    expect(filed['whatLeftTheLine']).toBeNull()
    expect(String(filed['note'])).toBe('Filed as work, called "Ship it".')
  })

  /**
   * ONE PHRASE IS SAID ONCE. The receipt used to name the words kept against the line as well as
   * naming the value that had just become them, so a person filing one line read the same phrase
   * twice in two different sentences. A receipt that repeats itself stops being read.
   */
  it('does not say the same phrase twice in one receipt', async () => {
    const plan = await newPlan('- Build the controller {time: 6h}')
    const filed = await fileAsWork(plan.id, plan.lines[0]!.id)
    const note = String(filed['note'])
    expect(note.split('"6h"')).toHaveLength(2)
  })
})
