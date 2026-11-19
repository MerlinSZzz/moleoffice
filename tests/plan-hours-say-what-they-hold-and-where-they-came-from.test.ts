// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FOUR ANSWERS ABOUT PLANNED HOURS AND THEIR SOURCE, EACH PINNED BY ONE DESCRIBE BELOW.
 *
 *   1  Problem 4Eg6N1On0O2w. GET /api/planning/month/<month> said "Nothing is planned" for a month
 *      whose weeks held hours, while the same reply's `finer` rows carried those hours. The sentence
 *      now says what the weeks hold, from the same rows.
 *      Mutation: in src/server/api/planning.ts, make `nothingHereOrFiner` read `mine.length === 0`.
 *
 *   2  Problem RaTua9l60bM3. The schedule part of a context bundle added every row of a period flat,
 *      so a piece of work and a part of it planned on one day counted twice, and then added today,
 *      this week and this month together. It now takes each period's total from `loadOf` with the
 *      period's containment reading, like the planning page, and keeps one figure for each period.
 *      Mutations: in src/server/lib/continuation.ts, pass no containment reading to `loadOf`; or
 *      give all three figures the one key `hoursPlanned`.
 *
 *   3  Problem bZ571Mf18WTT. A period stored beside kept words was always described as "Mole Office
 *      read this as ...", also when a button had given it and the words name no period. The sentence
 *      now claims a reading only when the words, read on the day they were written, name that period.
 *      Mutations: in src/server/lib/planning.ts, make `readHere` true; or read the words as of today
 *      in `readingOfIntent`.
 *
 *   4  Plan 7FEOshq3mBGG, block b-6. The schedule's copy on #/bundles named
 *      the source files and the helper functions that read hours, in normal mode. Its provenance is
 *      now reader-facing words.
 *      Mutation: put `hoursCountedTwiceIn` and `loadOf` back into the schedule's reader sentence.
 *
 *   5  Problem bZ571Mf18WTT. Both intent routes return the same historical answer about the period
 *      named by the words, and the answer agrees with the sentence the server gives for those words.
 *      Mutation: make `periodReadingOfIntent` always say the words named the stored period.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { periodKey } from '../src/shared/planning.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': 'robin', 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

/**
 * ALLOCATIONS AND INTENTS ARE PERSON-LEVEL: a month's reading counts every allocation in it, so a
 * day's hours another case gave would change the count and the emptiness this file checks. Each case
 * puts those two tables back as it found them (the office starts with none) instead of narrowing a
 * reading.
 */
afterEach(() => {
  t.client.sqlite.prepare('delete from allocations').run()
  t.client.sqlite.prepare('delete from planning_intents').run()
})

afterAll(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: PERSON })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: PERSON })
  return { status: res.statusCode, body: res.json() }
}
async function task(title: string): Promise<string> {
  const made = await post('/api/records', { kind: 'task', title, data: { state: 'doing' } })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}
async function give(recordId: string, horizon: string, period: string, plannedHours?: number): Promise<void> {
  const res = await post('/api/planning/allocations', {
    horizon,
    period,
    recordId,
    ...(plannedHours === undefined ? {} : { plannedHours }),
  })
  expect(res.status, JSON.stringify(res.body)).toBeLessThan(300)
}

// ============================================================================ 1

describe('a month with nothing of its own says what its weeks hold', () => {
  it('names the hours in its weeks instead of saying nothing is planned', async () => {
    const one = await task('Calibrate the arm')
    const two = await task('Write the field notes')
    // 2026-W37 is 7 to 13 September, wholly inside the month.
    await give(one, 'week', '2026-W37', 4)
    await give(two, 'week', '2026-W37')

    const month = await get('/api/planning/month/2026-09')
    expect(month.status).toBe(200)
    expect(month.body.entries, 'the month itself must hold nothing, or this proves nothing').toHaveLength(0)
    expect(month.body.finer.map((l: { period: string }) => l.period)).toEqual(['2026-W37'])
    const note = String(month.body.note)
    expect(note).not.toContain('Nothing is planned for 2026-09 yet')
    expect(note).toContain('Nothing is planned for 2026-09 itself')
    expect(note).toContain('the weeks that overlap it hold 2 allocations, 4 hours planned')
    expect(note).toContain('1 of them does not say how long')
    expect(note).toContain("not added to 2026-09's own total")
  })

  it('still says nothing is planned when the month and its weeks are both empty', async () => {
    const month = await get('/api/planning/month/2026-10')
    expect(String(month.body.note)).toContain('Nothing is planned for 2026-10 yet')
  })
})

// ============================================================================ 2

describe("the schedule part of a context bundle counts a period's hours as the planning page does", () => {
  it('counts a piece of work and a part of it on one day once, and adds no period to another', async () => {
    const whole = await task('Rebuild the test rig')
    const part = await task('Rewire the rig sensors')
    expect((await post('/api/links', { fromId: part, toId: whole, type: 'part_of' })).status).toBe(201)
    const today = periodKey('day', new Date())
    await give(whole, 'day', today, 5)
    await give(part, 'day', today, 3)

    // The planning page's own number for today: the envelope of the tree, 5, and never 8.
    const page = await get(`/api/planning/day/${today}`)
    expect(page.body.fit.load.plannedHours).toBe(5)
    expect(page.body.fit.load.rowHours).toBe(8)

    const preview = await get('/api/bundles/preview?preset=custom&slots=schedule')
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    const text = String(preview.body.text)
    expect(text).not.toMatch(/\b(?:allocationsIn|withWork|capacityOf|hoursCountedTwiceIn|loadOf)\b/)
    expect(text).not.toMatch(/\bsrc\/(?:server|shared)\//)
    expect(text).toContain('Mole Office read this from the planned hours for today, this week and this month.')
    expect(text).toContain(`Today, ${today} — 2 thing(s), 5 hour(s) planned (the rows add up to 8`)
    expect(text).not.toContain('8 hour(s) planned')
    const schedule = (preview.body.parts as { name: string; says: string }[]).find((p) => p.name === 'schedule')
    const { assembleContinuation } = await import('../src/server/lib/continuation.ts')
    const assembled = assembleContinuation({
      workspaceId: 'default',
      subject: { kind: 'project' },
      parts: ['schedule'],
      budgetBytes: 262144,
    })
    const assembledSchedule = assembled.parts.find((part) => part.name === 'schedule')
    expect(assembledSchedule?.figures).toEqual({
      'hoursPlanned.day': 5,
      'hoursPlanned.week': 0,
      'hoursPlanned.month': 0,
    })
    expect(schedule?.says).toContain('They are not added together')
    expect(schedule?.says).not.toContain('across the three')
  })
})

// ============================================================================ 3

describe('a period beside kept words is called a reading only when the words name it', () => {
  it('does not claim to have read a period a button gave', async () => {
    const week = periodKey('week', new Date())
    const kept = await post('/api/planning/intents', { said: 'around 1.5 maybe more', period: week })
    expect(kept.status, JSON.stringify(kept.body)).toBe(201)
    expect(kept.body.intent.period).toBe(week)
    const said = String(kept.body.interpretation)
    expect(said).not.toContain('Mole Office read this as')
    expect(said).toContain(`This is for ${week}. The words themselves do not name it: Mole Office reads no period in them.`)

    // The same sentence when the plan reads the stored row back.
    const { getIntent, readingOfIntent } = await import('../src/server/lib/planning.ts')
    const stored = getIntent(kept.body.intent.id as string)
    expect(stored).not.toBeNull()
    expect(readingOfIntent(stored!)).toBe(said)
  })

  it('says which different period the words read as', async () => {
    const now = new Date()
    const thisWeek = periodKey('week', now)
    const nextWeek = periodKey('week', new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7))
    const kept = await post('/api/planning/intents', { said: 'next week', period: thisWeek })
    expect(kept.status, JSON.stringify(kept.body)).toBe(201)
    expect(kept.body.intent.period).toBe(thisWeek)
    expect(String(kept.body.interpretation)).toContain(
      `This is for ${thisWeek}. The words themselves do not name it: Mole Office reads them as ${nextWeek}.`,
    )
  })

  it('still says it read the period when the words name it', async () => {
    const week = periodKey('week', new Date())
    const kept = await post('/api/planning/intents', { said: '3h this week' })
    expect(kept.status, JSON.stringify(kept.body)).toBe(201)
    expect(kept.body.intent.period).toBe(week)
    expect(String(kept.body.interpretation)).toContain(`Mole Office read this as ${week}.`)
  })

  it('reads the words as of the day they were written, not as of today', async () => {
    // "this week", written on Wednesday 12 August 2026, names 2026-W33 (10 to 16 August). Read as of
    // any later week it would name that week instead, and the sentence would deny a real reading.
    const { db } = await import('../src/server/db/client.ts')
    const { planningIntents } = await import('../src/server/db/schema.ts')
    db.insert(planningIntents)
      .values({
        id: 'testThisWeekInAugust',
        said: 'this week',
        recordId: null,
        planLineId: null,
        horizon: 'week',
        period: '2026-W33',
        hours: null,
        state: 'offered',
        createdAt: '2026-08-12 09:00:00',
        createdBy: 'human:robin',
      })
      .run()
    const { getIntent, readingOfIntent } = await import('../src/server/lib/planning.ts')
    expect(readingOfIntent(getIntent('testThisWeekInAugust')!)).toContain('Mole Office read this as 2026-W33.')
  })

  it('returns the same historical period answer from the list and the intent page', async () => {
    const now = new Date()
    const thisWeek = periodKey('week', now)
    const nextWeek = periodKey('week', new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7))
    const given = await post('/api/planning/intents', { said: 'next week', period: thisWeek })
    expect(given.status, JSON.stringify(given.body)).toBe(201)
    const kept = await post('/api/planning/intents', { said: 'sometime next week' })
    expect(kept.status, JSON.stringify(kept.body)).toBe(201)

    const list = await get('/api/planning/intents')
    expect(list.status).toBe(200)
    expect(list.body.note).toContain('kept as words with no period assigned')
    expect(list.body.note).not.toContain('nothing read from them')

    const id = given.body.intent.id as string
    const byId = await get(`/api/planning/intents/${id}`)
    expect(byId.status).toBe(200)
    const listed = list.body.intents.find((intent: { id: string }) => intent.id === id)
    expect(listed).toBeDefined()

    const { getIntent, periodReadingOfIntent, readingOfIntent } = await import('../src/server/lib/planning.ts')
    const stored = getIntent(id)
    expect(stored).not.toBeNull()
    const answer = periodReadingOfIntent(stored!)
    expect(answer).toEqual({ period: nextWeek, namesStoredPeriod: false })
    expect(listed.periodReading).toEqual(answer)
    expect(byId.body.intent.periodReading).toEqual(answer)
    expect(answer.namesStoredPeriod).toBe(readingOfIntent(stored!).includes('Mole Office read this as'))
  })
})
