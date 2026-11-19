// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DESIGN REMINDER IS JUDGED ONCE, BY THE SECRETARY THE MARKER ANSWERS TO OR BY THE PERSON, A MISS IS FILED BY THE
 * SAME JUDGES, AND THE OFFICE COUNTS BOTH BY THE DAY. Part 6 of the design-first build of wave 13s's requirements, on
 * the secretary's decision bYwACBK03tGT and the supervisor's vinDV1XnZ2dG, points 5 and 6.
 *
 * bYwACBK03tGT: a reminder is right when the run was method work and what it named was really missing; wrong when the
 * run was not method work, or when what it named was there, counted apart; the secretary the assigner answers to, or
 * the person, judges each one with one press; an unjudged one is counted as not judged, never as right or wrong; a
 * method run with a missing design and no reminder is a miss, counted when that secretary marks it. The count shows
 * right, wrong (not method work), wrong (it was there), not judged, and misses.
 *
 * The doors are in src/server/api/project-rules.ts and their rules in src/server/lib/design-reminders.ts:
 *   POST /api/design-reminders/<id>/judgement                             {verdict, words?}
 *   POST /api/runs/<run>/missed-design-reminder                           {words}
 *   GET  /api/office-regulations/projects/current/design-reminders        ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * WHAT IS REAL: the made-up world of tests/a-world-of-method-runs.ts, in a scratch office and a scratch git folder.
 *
 * THE CASES, in order, on one world with three reminded runs and two sealed runs that were not reminded:
 *   1. the secretary the marker answers to judges a reminder right, with words; the judgement says who and when; a
 *      second judgement is refused, to the person too, and the first stays;
 *   2. the marker itself, the run's own agent, a bystander and a name with no key may not judge; the person judges a
 *      reminder wrong because the run was not method work, and the secretary judges one wrong because it was there;
 *   3. a verdict off the list is refused, and so is a judgement of a record that is not a design reminder;
 *   4. the secretary files a miss for a marked run that was sealed with no design reminder, with words; a second miss,
 *      a miss of a run that was reminded, of a run nobody marked and of a run not yet finished are refused, as are no
 *      words, the marker and a bystander; a miss is not judged;
 *   5. the count of the days to today says right 1, wrong (not method work) 1, wrong (it was there) 1, not judged 1
 *      and misses 1, and lists each with who may judge it; the days before today count none; another project counts
 *      none; the range left out is the seven days to today; a date that does not read, 31 February among them, or a
 *      range that ends before it begins, is refused;
 *   6. the general record doors never write a design reminder, to the person neither.
 *
 * RED BEFORE THE CODE, 8 November 2026, at 17adf3aef (since remade with its author set, as e6a155c12, the same tree),
 * with this file and tests/a-world-of-method-runs.ts in the worktree and the code not yet written: the file was red in
 * its setup, where the world's first mark found no such door (404), so no case ran. Each case's proof is a mutation.
 * MUTATION PROOF, 8 November 2026, after a control run of 6 green. Each mutation alone, then restored:
 * - a second judgement not refused: case 1 red.
 * - the marker itself taken as a judge: cases 2, 4 and 5 red.
 * - a judgement of a record that is not a design reminder not refused: case 3 red.
 * - a second miss of the same run not refused: cases 4 and 5 red.
 * - a right judgement counted as wrong (it was there): case 5 red.
 * - a date read without checking that it is the day it names, so 31 February is read as 3 March: case 5 red. Its
 *   first run was green, because case 5 then asked no such date. 31 February was added to case 5, a control run gave
 *   6 green, and the mutation was then red.
 * - a range that ends before it begins not refused: case 5 red.
 * - the general record doors' refusal of a design reminder removed (src/server/lib/records.ts): case 6 red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { localStamp } from '../src/shared/typed-time.mjs'
import { aReportInForm } from './a-run-in-form.ts'
import { aWorldOfMethodRuns, OTHER, type ARun, type AWorldOfMethodRuns } from './a-world-of-method-runs.ts'

const COUNT = '/api/office-regulations/projects/current/design-reminders'

let w: AWorldOfMethodRuns
/** Three runs marked by the assigner, each reminded that it links no design, and their kept reminders. */
const reminded: { run: ARun; reminder: string }[] = []
/** A marked run sealed with no design reminder, since it links an approved design. */
let sealedUnreminded: ARun
/** Another, for a run that is not marked. */
let unmarkedSealed: ARun

const judge = (reminder: string, who: Record<string, string>, body: Record<string, unknown>) => w.call('POST', `/api/design-reminders/${reminder}/judgement`, who, body)
const miss = (run: string, who: Record<string, string>, body: Record<string, unknown> = { words: 'Made-up: the run had no design and was not reminded.' }) =>
  w.call('POST', `/api/runs/${run}/missed-design-reminder`, who, body)
const dataOf = (id: string): Record<string, unknown> => w.t.api.getRecord(id)!.data
const today = (): string => localStamp(new Date()).slice(0, 10)
const daysBefore = (n: number): string => localStamp(new Date(Date.now() - n * 86_400_000)).slice(0, 10)

/** Seal a run in form: its first write is answered with the reminder before the seal, and the second seals. */
async function seal(run: ARun): Promise<Record<string, unknown>> {
  await aReportInForm(w.t, run.id, w.worker.handle)
  const first = await w.finish(run)
  expect(first.status, first.raw).toBe(200)
  const second = await w.finish(run)
  expect(second.status, second.raw).toBe(200)
  expect(dataOf(run.id)['state']).toBe('finished')
  return first.body.beforeTheSeal
}

beforeAll(async () => {
  w = await aWorldOfMethodRuns()
  for (let n = 0; n < 3; n += 1) {
    const run = await w.aRun()
    expect((await w.mark(run.id, w.assigner.headers)).status).toBe(200)
    const said = (await seal(run)) as { design?: { reminder: string } }
    expect(said.design?.reminder, 'the run was not reminded of its design').toEqual(expect.any(String))
    reminded.push({ run, reminder: said.design!.reminder })
  }
  const good = await w.aDesign()
  await w.review(good, w.secretary.headers)
  sealedUnreminded = await w.aRun()
  w.link(sealedUnreminded.id, good)
  expect((await w.mark(sealedUnreminded.id, w.assigner.headers)).status).toBe(200)
  expect(((await seal(sealedUnreminded)) as { design?: unknown }).design).toBeUndefined()
  unmarkedSealed = await w.aRun()
  await seal(unmarkedSealed)
}, 120_000)

afterAll(async () => {
  await w?.close()
})

describe('a design reminder is judged once', () => {
  it('1. the secretary the marker answers to judges a reminder right, once', async () => {
    const { reminder } = reminded[0]!
    const done = await judge(reminder, w.secretary.headers, { verdict: 'right', words: 'Made-up: the run was method work and had no design.' })
    expect(done.status, done.raw).toBe(200)
    const judgement = dataOf(reminder)['judgement']
    expect(judgement).toEqual({ verdict: 'right', words: 'Made-up: the run was method work and had no design.', by: { kind: 'agent', id: w.secretary.id }, at: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/) })
    for (const who of [w.secretary.headers, w.person]) {
      const again = await judge(reminder, who, { verdict: 'wrong-it-was-there' })
      expect(again.status, again.raw).toBe(409)
      expect(dataOf(reminder)['judgement']).toEqual(judgement)
    }
  })

  it('2. only the secretary and the person judge', async () => {
    const { run, reminder } = reminded[1]!
    const noKey = { ...w.secretary.headers }
    delete noKey['x-mole-office-key']
    for (const [who, headers] of [
      ['the marker', w.assigner.headers],
      ["the run's own agent", run.headers],
      ['a bystander', w.bystander.headers],
      ['a name with no key', noKey],
    ] as const) {
      const refused = await judge(reminder, headers, { verdict: 'right' })
      expect([401, 403], `${who}: ${refused.raw}`).toContain(refused.status)
      expect(dataOf(reminder)['judgement'], who).toBeNull()
    }
    const byThePerson = await judge(reminder, w.person, { verdict: 'wrong-not-method-work' })
    expect(byThePerson.status, byThePerson.raw).toBe(200)
    expect(dataOf(reminder)['judgement']).toMatchObject({ verdict: 'wrong-not-method-work', words: null, by: { kind: 'person' } })
    const third = await judge(reminded[2]!.reminder, w.secretary.headers, { verdict: 'wrong-it-was-there', words: 'Made-up: the design was there, linked late.' })
    expect(third.status, third.raw).toBe(200)
    expect(dataOf(reminded[2]!.reminder)['judgement']).toMatchObject({ verdict: 'wrong-it-was-there' })
  })

  it('3. a verdict off the list, and a record that is not a design reminder, are refused', async () => {
    const run = await w.aRun()
    expect((await w.mark(run.id, w.assigner.headers)).status).toBe(200)
    const said = (await seal(run)) as { design: { reminder: string } }
    const wrong = await judge(said.design.reminder, w.secretary.headers, { verdict: 'wrong' })
    expect(wrong.status, wrong.raw).toBe(400)
    expect(dataOf(said.design.reminder)['judgement']).toBeNull()
    const notOne = await judge(run.id, w.person, { verdict: 'right' })
    expect(notOne.status, notOne.raw).toBe(400)
  })
})

describe('a miss is filed by the same judges', () => {
  it('4. the secretary files a miss once, for a marked run sealed with no design reminder', async () => {
    const refusals: [string, () => ReturnType<typeof miss>, number][] = [
      ['no words', () => miss(sealedUnreminded.id, w.secretary.headers, {}), 400],
      ['the marker', () => miss(sealedUnreminded.id, w.assigner.headers), 403],
      ['a bystander', () => miss(sealedUnreminded.id, w.bystander.headers), 403],
      ['a run that was reminded', () => miss(reminded[0]!.run.id, w.secretary.headers), 409],
      ['a run nobody marked', () => miss(unmarkedSealed.id, w.person), 409],
    ]
    for (const [what, ask, status] of refusals) {
      const refused = await ask()
      expect(refused.status, `${what}: ${refused.raw}`).toBe(status)
    }
    const running = await w.aRun()
    expect((await w.mark(running.id, w.assigner.headers)).status).toBe(200)
    const notFinished = await miss(running.id, w.secretary.headers)
    expect(notFinished.status, notFinished.raw).toBe(409)
    expect(w.recordsOfKind('design_reminder').filter((one) => one.data['was'] === 'missed')).toEqual([])

    const filed = await miss(sealedUnreminded.id, w.secretary.headers)
    expect(filed.status, filed.raw).toBe(201)
    const kept = w.recordsOfKind('design_reminder').filter((one) => one.data['was'] === 'missed')
    expect(kept.map((one) => one.id)).toEqual([filed.body.reminder])
    expect(kept[0]!.workspaceId).toBe(w.t.api.getRecord(sealedUnreminded.id)!.workspaceId)
    expect(kept[0]!.data).toMatchObject({ run: sealedUnreminded.id, work: 'method-work', markedBy: { kind: 'agent', id: w.assigner.id }, was: 'missed', named: [], missWords: 'Made-up: the run had no design and was not reminded.', judgement: null })
    const again = await miss(sealedUnreminded.id, w.person)
    expect(again.status, again.raw).toBe(409)
    const judged = await judge(filed.body.reminder, w.secretary.headers, { verdict: 'right' })
    expect(judged.status, judged.raw).toBe(409)
  })
})

describe('the count, by the day', () => {
  it('5. counts right, wrong apart, not judged and misses over a range of days', async () => {
    const answer = await w.call('GET', `${COUNT}?from=${today()}&to=${today()}`, w.person)
    expect(answer.status, answer.raw).toBe(200)
    expect(answer.body).toMatchObject({ project: w.t.api.getRecord(reminded[0]!.run.id)!.workspaceId, from: today(), to: today() })
    expect(answer.body.counts).toEqual({ right: 1, wrongNotMethodWork: 1, wrongItWasThere: 1, notJudged: 1, misses: 1 })
    const listed = answer.body.reminders as { id: string; run: string; was: string; judgement: unknown; judges: unknown[] }[]
    expect(listed).toHaveLength(5)
    for (const one of listed) {
      expect(one.judges, one.id).toEqual([
        { kind: 'person', id: expect.any(String) },
        { kind: 'agent', id: w.secretary.id },
      ])
    }
    expect(listed.filter((one) => one.was === 'missed').map((one) => one.run)).toEqual([sealedUnreminded.id])

    const before = await w.call('GET', `${COUNT}?from=${daysBefore(8)}&to=${daysBefore(1)}`, w.person)
    expect(before.status, before.raw).toBe(200)
    expect(before.body.counts).toEqual({ right: 0, wrongNotMethodWork: 0, wrongItWasThere: 0, notJudged: 0, misses: 0 })
    expect(before.body.reminders).toEqual([])

    const elsewhere = await w.call('GET', COUNT, { ...w.person, 'x-mole-office-workspace': OTHER })
    expect(elsewhere.status, elsewhere.raw).toBe(200)
    expect(elsewhere.body.counts).toEqual({ right: 0, wrongNotMethodWork: 0, wrongItWasThere: 0, notJudged: 0, misses: 0 })

    const week = await w.call('GET', COUNT, w.person)
    expect(week.status, week.raw).toBe(200)
    expect(week.body).toMatchObject({ from: daysBefore(6), to: today(), counts: answer.body.counts })

    // 31 February is written as a day, and Node's clock reads it as 3 March, so it is refused by what it reads back as.
    for (const query of ['?from=last-week', `?from=${today()}&to=${daysBefore(1)}`, '?to=2026-13-01', '?to=2026-02-31']) {
      const refused = await w.call('GET', `${COUNT}${query}`, w.person)
      expect(refused.status, `${query}: ${refused.raw}`).toBe(400)
    }
  })
})

describe('the general record doors', () => {
  it('6. never write a design reminder, to the person neither', async () => {
    const filed = await w.call('POST', '/api/records', w.person, {
      kind: 'design_reminder',
      title: 'Made-up design reminder',
      data: { run: reminded[0]!.run.id, work: 'method-work', markedBy: { kind: 'agent', id: w.assigner.id }, was: 'missed', named: [], reminderLine: null, afterSeal: null, missWords: 'Made-up.', judgement: null },
    })
    expect(filed.status, filed.raw).toBe(403)
    const { reminder } = reminded[0]!
    const before = dataOf(reminder)
    const patched = await w.call('PATCH', `/api/records/${reminder}`, w.person, { dataPatch: { judgement: null } })
    expect(patched.status, patched.raw).toBe(403)
    expect(dataOf(reminder)).toEqual(before)
  })
})
