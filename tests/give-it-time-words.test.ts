// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOURS BOX ON "GIVE IT TIME": A TYPO NEVER BECOMES AN ANSWER.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS PINS
 * ---------------------------------------------------------------------------------------
 *
 * The box sent `Number(what they typed)`. `Number("5h")` is `NaN`, `JSON.stringify` turns `NaN`
 * into `null`, and `null` is this route's LEGITIMATE value for "somebody committed to this work
 * here without saying for how long". So typing `5h` wrote an allocation and Mole Office then reported
 * that no hours had been stated — a typo silently became a real answer, in the one place the
 * product is meant to be careful about hours.
 *
 * It was worse than a discarded value. A second allocation for the same work in the same period is
 * refused, so the typo also spent the budget and sent the person somewhere else to undo it. Three
 * readers who had never seen Mole Office hit it on their first attempt and it cost one of them twelve
 * minutes.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MUST STAY TRUE
 * ---------------------------------------------------------------------------------------
 *
 *   1. A number of hours Mole Office can defend is written as that number.
 *   2. Words it cannot read write NO allocation at all. They are kept exactly as typed, in the
 *      intent layer, which enters no total.
 *   3. `null` hours are reached ONLY by an empty box, which is a real answer and must keep working.
 *   4. A typo does not spend the budget: after words are kept, the same work in the same period
 *      still takes the hours.
 *   5. Mole Office says what it made of the words, in the reader's receipt.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so there is no DOM. Nothing here presses a button: the press
 * calls `giveItemTime` and this file calls the same function, so no rule is restated. `fetch` is
 * pointed at a real Fastify app through `app.inject`, exactly as tests/plan-table-editing.test.ts
 * does it, so every write below really lands in a database and is read back out of it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { readHoursBox } from '../src/shared/planning.ts'
import type { Allocation } from '../src/shared/planning.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanItemsModule = typeof import('../src/web/components/plans/planitems.tsx')
type PlanningLib = typeof import('../src/server/lib/planning.ts')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planItems: PlanItemsModule
let planningLib: PlanningLib

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const WEEK = { horizon: 'week' as const, period: '2026-W36' }

/**
 * A plan of one heading and one bullet, so every test below has a filed line of its own.
 *
 * The words differ per test because two records in one project cannot share a title, and a
 * collision here would read as a defect in the thing being tested.
 */
function bodyFor(words: string): string {
  return ['# Robotics', `- ${words}`].join('\n')
}

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  db = await freshDb()

  const { planRoutes } = await import('../src/server/api/plans.ts')
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(planningRoutes, { prefix: '/api' })
  await app.ready()

  ;(globalThis as unknown as { fetch: unknown }).fetch = async (
    input: unknown,
    init: { method?: string; headers?: HeadersInit; body?: string } = {},
  ) => {
    const res = await app.inject({
      method: (init.method ?? 'GET') as 'GET',
      url: String(input),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      ...(init.body === undefined ? {} : { payload: init.body }),
    })
    return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => res.body }
  }

  webApi = await import('../src/web/api.ts')
  webApi.setActor({ ...AS_HUMAN })
  planItems = await import('../src/web/components/plans/planitems.tsx')
  planningLib = await import('../src/server/lib/planning.ts')
})

afterAll(async () => {
  await app.close()
  db.close()
})

/** A fresh plan with one filed bullet, so no test can be affected by another one's hours. */
async function aFiledLine(words: string): Promise<{
  item: import('../src/web/components/plans/planitems.tsx').PlanItem
  planId: string
  recordId: string
}> {
  const written = await webApi.api.newPlan(`Plan for ${words}`, bodyFor(words))
  const planId = written.plan.id
  const line = written.lines.find((one) => one.text === `- ${words}`)
  if (line === undefined) throw new Error(`The plan has no line reading "- ${words}".`)
  const filed = await webApi.api.fileLineAsWork(planId, line.id, { kind: 'task', workspaceId: 'default' })
  const reply = await webApi.api.planBlocks(planId)
  const item = planItems.planItemsOf(reply.lines).items.find((one) => one.entry.line.id === line.id)
  if (item === undefined) throw new Error('The plan read back without the line that was just filed.')
  return { item, planId, recordId: filed.recordId }
}

/** Every allocation on one piece of work, read straight out of the database. */
function hoursOn(recordId: string): Allocation[] {
  return planningLib.allocationsOf(recordId)
}

// ============================================================ what the box makes of what is typed

/**
 * THE READING ITSELF. Every string here was typed by a real reader into this box.
 *
 * The seven that do not read are the seven that used to write `null`, which the product then
 * reported as "no hours were stated".
 */
describe('the hours box reads what it can defend and nothing else', () => {
  it('reads a bare number as hours, because the box is labelled Hours', () => {
    expect(readHoursBox('5')).toEqual({ said: 'hours', hours: 5, how: '5 hours.' })
    expect(readHoursBox('2.5')).toEqual({ said: 'hours', hours: 2.5, how: '2.5 hours.' })
    expect(readHoursBox(' 3 ')).toEqual({ said: 'hours', hours: 3, how: '3 hours.' })
  })

  it('reads a number with a unit on it, and says what it read', () => {
    for (const [typed, hours] of [
      ['5h', 5],
      ['2.5h', 2.5],
      ['12 hours', 12],
      ['2.5 hrs', 2.5],
    ] as const) {
      const read = readHoursBox(typed)
      expect(read.said, typed).toBe('hours')
      if (read.said !== 'hours') throw new Error('unreachable')
      expect(read.hours, typed).toBe(hours)
      // IT SAYS WHAT IT UNDERSTOOD, in its own words, and those words name the number.
      expect(read.how, typed).toContain(String(hours))
    }
  })

  it('reads NO hours from the things that used to become null, and keeps them as words', () => {
    for (const typed of ['90m', '1d', 'around 5h', 'about 12 hours', 'half a day', 'a couple of hours', 'soon']) {
      const read = readHoursBox(typed)
      expect(read.said, typed).toBe('words')
      if (read.said !== 'words') throw new Error('unreachable')
      // The refusal says why, in a sentence a person can act on.
      expect(read.why.length, typed).toBeGreaterThan(20)
    }
  })

  it('an empty box is a real answer and is not a failed reading', () => {
    expect(readHoursBox('')).toEqual({ said: 'nothing' })
    expect(readHoursBox('   ')).toEqual({ said: 'nothing' })
  })
})

// ============================================================ what one press actually writes

describe('one press of Give it time', () => {
  it('writes the hours a reader typed with a unit, as that number', async () => {
    const { item, planId, recordId } = await aFiledLine('rebuild the gripper')
    const outcome = await planItems.giveItemTime(planId, item, WEEK, '5h')

    expect(outcome.ok, outcome.said).toBe(true)
    const rows = hoursOn(recordId)
    expect(rows).toHaveLength(1)
    // THE WHOLE DEFECT IN ONE ASSERTION. This was `null`, and Mole Office then said no hours were stated.
    expect(rows[0]?.plannedHours).toBe(5)
    // AND IT SAYS WHAT IT UNDERSTOOD, so the reader can check it without retyping the box.
    expect(outcome.said).toContain('5 hours')
  })

  it('writes NO allocation for words it cannot read, and keeps them exactly as typed', async () => {
    const { item, planId, recordId } = await aFiledLine('measure the offset')
    const outcome = await planItems.giveItemTime(planId, item, WEEK, ' 90m ')

    expect(outcome.ok, outcome.said).toBe(true)
    // NOTHING WAS SCHEDULED. Not zero hours, not unstated hours: no allocation at all.
    expect(hoursOn(recordId)).toHaveLength(0)

    const kept = planningLib.listIntents({ recordId })
    expect(kept).toHaveLength(1)
    // STORED EXACTLY AS TYPED, spaces and all.
    expect(kept[0]?.said).toBe(' 90m ')
    expect(kept[0]?.hours).toBeNull()
    expect(kept[0]?.period).toBe(WEEK.period)
    expect(kept[0]?.planLineId).toBe(item.entry.line.id)

    /**
     * AND THE RECEIPT SAYS BOTH HALVES: why no hours were read, and that nothing was scheduled.
     *
     * THE THIRD LINE USED TO ASK FOR "NOTHING HAS BEEN SCHEDULED FROM THEM", in capitals, and this
     * is what a person read in the plan table after pressing the button. The owner read it there on
     * 16 August 2026 and rejected it: normal reading gets what happened, and the long account with
     * its allocations, capacity and totals goes where a developer view can find it. The claim is
     * unchanged and is now asserted twice over — the sentence still has to say that nothing was
     * scheduled, and NOTHING ON A PERSON'S RECEIPT MAY SHOUT, which the old wording would fail.
     */
    expect(outcome.said).toContain('could not read a number of hours')
    expect(outcome.said).toContain('No hours were written')
    expect(outcome.said).toContain('Nothing was scheduled from them')
    expect(outcome.said, 'a word in capitals on a receipt a person reads').not.toMatch(/[A-Z]{3,}/)
  })

  it('leaves the budget free, so retyping the hours works — the twelve minutes this cost', async () => {
    const { item, planId, recordId } = await aFiledLine('write the report')

    const typo = await planItems.giveItemTime(planId, item, WEEK, 'around 5h')
    expect(typo.ok, typo.said).toBe(true)
    expect(hoursOn(recordId)).toHaveLength(0)

    // THE SECOND PRESS IS THE POINT. With an allocation already written the route answers 409 and
    // the reader has to go to another page to undo it before they can say what they meant.
    const fixed = await planItems.giveItemTime(planId, item, WEEK, '1.5h')
    expect(fixed.ok, fixed.said).toBe(true)
    const rows = hoursOn(recordId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.plannedHours).toBe(1.5)
  })

  it('an empty box still says somebody committed without saying how long, and that survives', async () => {
    const { item, planId, recordId } = await aFiledLine('order the couplings')
    const outcome = await planItems.giveItemTime(planId, item, WEEK, '')

    expect(outcome.ok, outcome.said).toBe(true)
    const rows = hoursOn(recordId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.plannedHours).toBeNull()
    expect(outcome.said).toContain('No hours were stated')
    // Nothing was kept as words either: an empty box is not something somebody wrote.
    expect(planningLib.listIntents({ recordId })).toHaveLength(0)
  })
})
