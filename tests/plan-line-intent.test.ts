// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE LINE SAYS ONE THING ABOUT TIME, AND BOTH VIEWS OF THE PLAN CAN SEE IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHY THESE TESTS EXIST
 * ---------------------------------------------------------------------------------------
 *
 * The owner drove their own path through round five on 16 August 2026 and it produced two rows saying
 * "next week" about one line. One was written when the owner typed the words into the table with a week
 * button pressed; the other when filing the line moved `{time: next week}` out of its words. They
 * carried DIFFERENT readings — 2026-W33 and 2026-W34 — and the schedule drew both, so one phrase the owner
 * had typed once appeared as two different weeks with no way to remove either.
 *
 * The second half was worse: after the line was filed, the table said nobody had given the work any
 * time while the same words were still on screen in the writing view. Two views of one plan,
 * contradicting each other about something a person wrote.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH GROUP HERE DEFENDS
 * ---------------------------------------------------------------------------------------
 *
 *   1. Identity. Writing time for a line REPLACES what that line last said about time. A committed
 *      one is never replaced, because it is where an allocation came from.
 *   2. The way out. Kept words can be removed; committed ones are refused, naming what to remove.
 *   3. Filing. It attaches the words the line already holds instead of writing a second copy.
 *   4. Both views. Every plan read carries the line's kept words before AND after binding, with the
 *      same id and the same words, so the two views cannot say different things.
 *   5. The receipt. What a person reads after filing carries no record id and no shouting; the
 *      whole account is still there, in `detail`.
 *
 * Everything goes through the real routes on a throwaway database, because what is being proved is
 * what a person driving the product can and cannot make happen.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { weekKey } from '../src/shared/planning.ts'
import type { BuiltServer } from '../src/server/index.ts'
import { freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: BuiltServer['app']

/**
 * WHAT THIS CASE WROTE INTO THE TWO SHARED TABLES THE WHOLE-READINGS READ. The office is made once
 * for the file, so each case notes what was there at its start and removes what it added at its end.
 * The readings themselves stay whole.
 */
let intentIdsAtStart = new Set<string>()
let allocationIdsAtStart = new Set<string>()

/**
 * A PROJECT OF THIS CASE'S OWN for the work it files, so the receipt's "other work with this name"
 * sentence cannot name a record an earlier case filed. The plans themselves take no project.
 */
let CASE_PROJECT = 'case-project'
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  const { apiApp } = await import('./helpers.ts')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(async () => {
  caseNumber += 1
  CASE_PROJECT = `case-project-${String(caseNumber)}`
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    headers: { ...PERSON, 'x-mole-office-workspace': 'default' },
    payload: { id: CASE_PROJECT, title: `Case project ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
  const ids = (table: string): Set<string> =>
    new Set((t.client.sqlite.prepare(`SELECT id FROM ${table}`).all() as { id: string }[]).map((row) => row.id))
  intentIdsAtStart = ids('planning_intents')
  allocationIdsAtStart = ids('allocations')
})

afterEach(() => {
  const sqlite = t.client.sqlite
  for (const row of sqlite.prepare('SELECT id FROM allocations').all() as { id: string }[]) {
    if (!allocationIdsAtStart.has(row.id)) sqlite.prepare('DELETE FROM allocations WHERE id = ?').run(row.id)
  }
  for (const row of sqlite.prepare('SELECT id FROM planning_intents').all() as { id: string }[]) {
    if (!intentIdsAtStart.has(row.id)) sqlite.prepare('DELETE FROM planning_intents WHERE id = ?').run(row.id)
  }
})

afterAll(async () => {
  await app.close()
  t.close()
})

type Json = Record<string, unknown>

const bodyOf = (res: { body: string }): Json => JSON.parse(res.body) as Json

interface KeptWords {
  id: string
  said: string
  period: string | null
  hours: number | null
  reading: string
  recordId: string | null
  canScheduled: boolean
}

interface LineRead {
  line: { id: string; text: string; recordId: string | null }
  work: { id: string } | null
  derived: { key: string; says: string; canonical: boolean }[]
  kept: KeptWords[]
}

async function newPlan(body: string): Promise<{ id: string; lines: { id: string; text: string }[] }> {
  const res = await app.inject({ method: 'POST', url: '/api/plans', payload: { title: 'Next week', body } })
  expect(res.statusCode, res.body).toBe(201)
  const made = bodyOf(res)
  return { id: (made['plan'] as { id: string }).id, lines: made['lines'] as { id: string; text: string }[] }
}

/** The plan as a reader gets it, through the route both views of a plan read. */
async function readPlan(planId: string): Promise<LineRead[]> {
  const res = await app.inject({ method: 'GET', url: `/api/plans/${planId}` })
  expect(res.statusCode, res.body).toBe(200)
  return bodyOf(res)['lines'] as LineRead[]
}

/**
 * THE PERSON, SAYING SO — as the browser does on every request.
 *
 * Committing an intent is a governance act from 25 August 2026: `assertMayCommitAnIntent` refuses it
 * to an agent AND to a request that sent no actor headers at all, on owner decision §36's reasoning
 * that an absent header is not evidence that a person made the act. These injections used to send no
 * headers, so they were the second case.
 */
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

/** Keep words about time against a line, which is what the table's own box does. */
async function keepWords(
  payload: Record<string, unknown>,
): Promise<{ status: number; body: Json; intent: KeptWords & { state: string }; replaced: { said: string }[] }> {
  const res = await app.inject({ method: 'POST', url: '/api/planning/intents', payload })
  const body = bodyOf(res)
  return {
    status: res.statusCode,
    body,
    intent: body['intent'] as KeptWords & { state: string },
    replaced: (body['replaced'] ?? []) as { said: string }[],
  }
}

async function fileAsWork(planId: string, lineId: string): Promise<{ status: number; body: Json }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/plans/${planId}/lines/${lineId}/file-as-work`,
    payload: { kind: 'task', workspaceId: CASE_PROJECT },
  })
  return { status: res.statusCode, body: bodyOf(res) }
}

/** Every stored row, read straight from SQLite. Nothing can hide behind a reply here. */
const intentRows = (): { id: string; said: string; period: string | null; state: string; record: string | null }[] =>
  t.client.sqlite
    .prepare('SELECT id, said, period, state, record_id AS record FROM planning_intents ORDER BY created_at, id')
    .all() as { id: string; said: string; period: string | null; state: string; record: string | null }[]

// ============================================================ one line, one answer about time

describe('a line holds one answer about time', () => {
  it('replaces what the line last said instead of writing a second row', async () => {
    const plan = await newPlan('- Build the rig')
    const line = plan.lines[0]!.id

    const first = await keepWords({ said: 'next week', planLineId: line })
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    expect(first.replaced).toEqual([])

    const second = await keepWords({ said: 'the week after that', planLineId: line })
    expect(second.status, JSON.stringify(second.body)).toBe(201)

    // ONE ROW, AND IT IS THE NEW ONE. This is the whole rule: the same line answering "when" twice
    // is one answer changed, not two answers to choose between.
    const rows = intentRows()
    expect(rows).toHaveLength(1)
    expect(one(rows, 'kept row').said).toBe('the week after that')

    // AND THE REPLY SAID WHAT WENT. A replacement nobody is told about is indistinguishable from a
    // second row the person now has to go and find.
    expect(second.replaced.map((row) => row.said)).toEqual(['next week'])
    expect(String(second.body['note'])).toContain('next week')
  })

  it('leaves words written about a record and no line alone, because a line is what makes two writes one', async () => {
    const work = t.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'Baseline',
      data: { state: 'todo' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })

    await keepWords({ said: 'sometime next week', recordId: work.id })
    const second = await keepWords({ said: 'before the review', recordId: work.id })

    // TWO STATEMENTS, BOTH KEPT. Nothing says one of these replaces the other: they were written
    // about a piece of work from wherever somebody was standing, not against one line of one plan.
    expect(intentRows()).toHaveLength(2)
    expect(second.replaced).toEqual([])
  })

  it('never replaces a committed one, because it is where an allocation came from', async () => {
    const plan = await newPlan('- Build the rig')
    const line = plan.lines[0]!.id
    const filed = await fileAsWork(plan.id, line)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    const week = weekKey(new Date())
    const kept = await keepWords({ said: '5h this week', planLineId: line, recordId: filed.body['recordId'] })
    const done = await app.inject({ method: 'POST', url: `/api/planning/intents/${kept.intent.id}/commit`, headers: PERSON })
    expect(done.statusCode, done.body).toBe(201)
    expect(intentRows()[0]!.state).toBe('committed')

    const after = await keepWords({ said: 'and a bit the week after', planLineId: line })
    expect(after.status, JSON.stringify(after.body)).toBe(201)

    // BOTH ROWS ARE THERE. The committed one accounts for hours that are really stored, and the new
    // words are what the line says now.
    const rows = intentRows()
    expect(rows).toHaveLength(2)
    expect(rows.filter((row) => row.state === 'committed').map((row) => row.said)).toEqual(['5h this week'])
    expect(rows.filter((row) => row.state !== 'committed').map((row) => row.said)).toEqual([
      'and a bit the week after',
    ])
    expect(after.replaced).toEqual([])
    // AND THE HOURS ARE UNTOUCHED, which is what the committed row is standing for.
    const hours = t.client.sqlite
      .prepare('SELECT count(*) AS n FROM allocations WHERE period = ?')
      .get(week) as { n: number }
    expect(hours.n).toBe(1)
  })
})

// ============================================================ the way out

describe('kept words can be taken off a line', () => {
  it('removes them, and the line then says nothing about time', async () => {
    const plan = await newPlan('- Build the rig')
    const line = plan.lines[0]!.id
    const kept = await keepWords({ said: 'next week', planLineId: line })

    const gone = await app.inject({ method: 'DELETE', url: `/api/planning/intents/${kept.intent.id}` })
    expect(gone.statusCode, gone.body).toBe(200)
    expect(intentRows()).toHaveLength(0)

    const lines = await readPlan(plan.id)
    expect(lines[0]!.kept).toEqual([])
    expect(lines[0]!.derived.filter((row) => row.key === 'time')).toEqual([])
  })

  it('answers 404 for an id that is not kept words, whatever project it is from', async () => {
    // THE BOUNDARY THIS ROUTE SITS ON, measured rather than assumed, and it is what
    // tests/by-id-boundary.test.ts records for it: the parameter is an intent id, so a RECORD id
    // sent here finds no intent. The answer is "there is no such row", not "that row is not yours",
    // and it names no project — the whole planning layer takes no project header, because a plan is
    // one person's overlay across work that stays in its own project.
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    const other = createWorkspace({ id: 'robotics', title: 'Robotics' })
    const record = t.api.createRecord({
      workspaceId: other.id,
      kind: 'task',
      title: 'Rebuild the gripper',
      data: { state: 'todo' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })

    const res = await app.inject({ method: 'DELETE', url: `/api/planning/intents/${record.id}` })
    expect(res.statusCode).toBe(404)
    const message = String(bodyOf(res)['message'] ?? bodyOf(res)['error'])
    expect(message).toContain('No intent has the id')
    expect(message).not.toContain('robotics')
  })

  it('refuses to remove a committed one and says what to remove instead', async () => {
    const plan = await newPlan('- Build the rig')
    const line = plan.lines[0]!.id
    const filed = await fileAsWork(plan.id, line)
    const kept = await keepWords({ said: '5h this week', planLineId: line, recordId: filed.body['recordId'] })
    await app.inject({ method: 'POST', url: `/api/planning/intents/${kept.intent.id}/commit`, headers: PERSON })

    const refused = await app.inject({ method: 'DELETE', url: `/api/planning/intents/${kept.intent.id}` })
    expect(refused.statusCode).toBe(409)
    expect(String(bodyOf(refused)['message'] ?? bodyOf(refused)['error'])).toContain('Take the hours off')
    // NOTHING WAS REMOVED. A refusal that half happened would leave the allocation with no account
    // of where it came from, which is the thing the refusal exists to prevent.
    expect(intentRows()).toHaveLength(1)
  })
})

// ============================================================ filing writes no second copy

describe('filing a line does not say the same thing twice', () => {
  it('keeps one row for one phrase, with one reading, about the work', async () => {
    // THE OWNER'S OWN PATH. The owner typed "next week" into the table with a week button pressed, which
    // keeps the words against the line and puts them in the line's text, and then filed the line.
    const plan = await newPlan('- Build the rig {time: next week}')
    const line = plan.lines[0]!.id
    const pressed = weekKey(new Date())
    await keepWords({ said: 'next week', planLineId: line, period: pressed })

    const filed = await fileAsWork(plan.id, line)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    // ONE ROW. Two would be one phrase drawn twice, and they read it as two different weeks.
    const rows = intentRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.said).toBe('next week')
    expect(rows[0]!.period).toBe(pressed)
    // AND IT IS ABOUT THE WORK NOW, which is what makes it schedulable at all.
    expect(rows[0]!.record).toBe(filed.body['recordId'])
    expect(filed.body['intentId']).toBe(rows[0]!.id)

    // THE PLAN SAYS IT ONCE TOO. `derived` drew both rows before this, so the plan page showed one
    // phrase three times: once in the line's own words and once for each stored row.
    const lines = await readPlan(plan.id)
    expect(lines[0]!.kept.map((row) => row.said)).toEqual(['next week'])
    expect(lines[0]!.derived.filter((row) => row.key === 'time' && !row.canonical)).toHaveLength(1)
  })

  it('carries words the line was holding to the work, so they can be scheduled at all', async () => {
    const plan = await newPlan('- Build the rig')
    const line = plan.lines[0]!.id
    const week = weekKey(new Date())
    const kept = await keepWords({ said: 'about 5h this week', planLineId: line, period: week, hours: 5 })
    // NOT SCHEDULABLE YET, and the read says so rather than a screen having to work it out.
    expect((await readPlan(plan.id))[0]!.kept[0]!.canScheduled).toBe(false)

    const filed = await fileAsWork(plan.id, line)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    // THE SAME ROW, NOW ABOUT THE WORK. A new row would be a second answer; leaving it pointing at
    // nothing would make committing it refused for ever.
    const rows = intentRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(kept.intent.id)
    expect(rows[0]!.record).toBe(filed.body['recordId'])
    expect((await readPlan(plan.id))[0]!.kept[0]!.canScheduled).toBe(true)

    // AND IT REALLY COMMITS, which is the proof that "about this work" is a fact and not a label.
    const done = await app.inject({ method: 'POST', url: `/api/planning/intents/${kept.intent.id}/commit`, headers: PERSON })
    expect(done.statusCode, done.body).toBe(201)
  })

  it('carries them when the line is pointed at work that already exists', async () => {
    const work = t.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'Rig rebuild',
      data: { state: 'todo' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })
    const plan = await newPlan('- the rig again')
    const line = plan.lines[0]!.id
    const kept = await keepWords({ said: 'next week', planLineId: line })

    const pointed = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}/lines/${line}`,
      payload: { recordId: work.id },
    })
    expect(pointed.statusCode, pointed.body).toBe(200)

    const rows = intentRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(kept.intent.id)
    expect(rows[0]!.record).toBe(work.id)
    expect((bodyOf(pointed)['kept'] as KeptWords[]).map((row) => row.said)).toEqual(['next week'])
  })
})

// ============================================================ both views see the same words

describe('the plan read carries a line kept words before and after binding', () => {
  it('hands them back either way, with the same id and the same words', async () => {
    const plan = await newPlan('- Build the rig {size: very big} {note: ask Sam}')
    const line = plan.lines[0]!.id
    const kept = await keepWords({ said: 'next week', planLineId: line, period: weekKey(new Date()) })

    const before = (await readPlan(plan.id))[0]!
    expect(before.work).toBeNull()
    expect(before.kept).toHaveLength(1)
    expect(before.kept[0]!.id).toBe(kept.intent.id)
    expect(before.kept[0]!.said).toBe('next week')
    // WHAT PANELX MADE OF THEM IS THERE TOO, ready to draw, so no surface writes that sentence itself.
    expect(before.kept[0]!.reading).toContain(weekKey(new Date()))

    const filed = await fileAsWork(plan.id, line)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    // THE SAME WORDS, AFTER FILING. This is the contradiction that was measured: the table said
    // nobody had given the work any time while the writing view showed these words on the line.
    const after = (await readPlan(plan.id))[0]!
    expect(after.work).not.toBeNull()
    expect(after.kept).toHaveLength(1)
    expect(after.kept[0]!.id).toBe(kept.intent.id)
    expect(after.kept[0]!.said).toBe('next week')
    expect(after.kept[0]!.recordId).toBe(filed.body['recordId'])

    // AND NOTHING WAS SCHEDULED FROM THEM. Words are not hours, whatever view is drawing them.
    const hours = t.client.sqlite.prepare('SELECT count(*) AS n FROM allocations').get() as { n: number }
    expect(hours.n).toBe(0)
  })

  it('survives writing the whole document again, which is what switching views does', async () => {
    const plan = await newPlan('- Build the rig')
    const line = plan.lines[0]!.id
    const kept = await keepWords({ said: 'next week', planLineId: line })

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/body`,
      payload: { body: '- Build the rig {note: ask Sam}' },
    })
    expect(saved.statusCode, saved.body).toBe(200)

    const after = (await readPlan(plan.id))[0]!
    expect(after.kept.map((row) => row.id)).toEqual([kept.intent.id])
    expect(after.kept[0]!.said).toBe('next week')
  })

  it('says so when a save takes away the line the words were written on', async () => {
    const plan = await newPlan('- Build the rig')
    const line = plan.lines[0]!.id
    const kept = await keepWords({ said: 'next week', planLineId: line })

    // CHANGING THE WORDS OF A LINE MAKES IT A DIFFERENT LINE. That is the rule that drops a record
    // binding too, and it is deliberate: matching by how similar two lines look would move somebody
    // else's writing onto a line nobody wrote it on.
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/plans/${plan.id}/body`,
      payload: { body: '- Build the rig properly' },
    })
    expect(saved.statusCode, saved.body).toBe(200)

    // NOTHING WAS DELETED, AND THE REPLY SAYS WHERE THE WORDS ARE. A save that quietly threw away a
    // sentence somebody wrote is the loss this whole layer exists to prevent.
    const adrift = bodyOf(saved)['keptWordsAdrift'] as { said: string; intentId: string; text: string }[]
    expect(adrift.map((row) => row.said)).toEqual(['next week'])
    expect(adrift[0]!.intentId).toBe(kept.intent.id)
    expect(adrift[0]!.text).toBe('- Build the rig')
    expect(String(bodyOf(saved)['note'])).toContain('Nothing was deleted')
    expect(intentRows()).toHaveLength(1)
  })
})

// ============================================================ what a person reads after pressing

describe('the receipt for filing a line', () => {
  it('says what happened without a record id or a shout, and keeps the whole account beside it', async () => {
    const plan = await newPlan('- Build the rig {size: very big} {time: next week} {note: ask Sam}')
    const line = plan.lines[0]!.id
    const filed = await fileAsWork(plan.id, line)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    const note = String(filed.body['note'])
    const detail = String(filed.body['detail'])

    // NO IDS, checked against the ids this filing really produced rather than by a pattern that
    // guesses what an id looks like.
    const ids = [
      String(filed.body['recordId']),
      String(filed.body['intentId']),
      plan.id,
      line,
    ]
    for (const id of ids) expect(note, `the receipt names ${id}`).not.toContain(id)

    // NO SHOUTING. Three capitals in a row is a sentence raising its voice at somebody who pressed
    // a button, and the owner counted them in a paragraph the owner had to read.
    expect(note).not.toMatch(/[A-Z]{3,}/)

    // IT SAYS THE TWO THINGS A PERSON NEEDS: what it is called now, and that their rough words are
    // still their words and are not scheduled.
    expect(note).toContain('Build the rig')
    expect(note).toContain('next week')
    expect(note).toContain('nothing has been scheduled')
    expect(note.length, note).toBeLessThan(400)

    // AND NOTHING WAS THROWN AWAY. The account with the ids in it is still there, one field along.
    expect(detail).toContain(String(filed.body['recordId']))
    expect(detail.length).toBeGreaterThan(note.length)
  })

  /**
   * THE OTHER RECEIPT A PERSON MEETS, AND IT WAS STILL SHOUTING ON 16 AUGUST 2026.
   *
   * Pressing "Keep these words" in the plan table printed this under the row, measured in Chromium
   * on the owner's own corpus: "Your words are stored exactly as you wrote them. NOTHING HAS BEEN
   * SCHEDULED FROM THEM: no allocation was made, no capacity was used, and no total moved. Mole Office
   * read no period from them and did not invent one. This line said "next week" about time before,
   * and that has been replaced." That is 300 characters of storage semantics with a shout in the
   * middle, in a dense table, and it is what the owner's eighth and ninth notes are about.
   *
   * The claim it made is not weakened here. It still has to say that nothing was scheduled and it
   * still has to name what the write took off the line, because a silent replacement is worse than
   * a long sentence. The whole account moved to `detail`, where a developer view reads it.
   */
  it('says the same about words kept from the table, and keeps the account beside it', async () => {
    const plan = await newPlan('- Build the rig')
    const line = plan.lines[0]!.id
    const first = await keepWords({ said: 'next week', planLineId: line })
    expect(first.status, JSON.stringify(first.body)).toBe(201)

    const again = await keepWords({ said: 'sometime in the first half of September', planLineId: line })
    expect(again.status, JSON.stringify(again.body)).toBe(201)
    const note = String(again.body['note'])
    const detail = String(again.body['detail'])

    // NO SHOUTING, and no id in front of somebody who pressed a button.
    expect(note, note).not.toMatch(/[A-Z]{3,}/)
    expect(note).not.toContain(again.intent.id)
    expect(note).not.toContain(first.intent.id)
    expect(note.length, note).toBeLessThan(300)

    // THE THREE THINGS A PERSON NEEDS: their words are theirs, nothing was scheduled, and this
    // write took the line's last answer away.
    expect(note).toContain('kept as you typed them')
    expect(note).toContain('Nothing was scheduled from them')
    expect(note).toContain('"next week"')

    // AND NOTHING WAS THROWN AWAY. The allocation, the capacity, the total and the id of the row
    // this replaced are all still there, one field along.
    expect(detail).toContain('no allocation was made')
    expect(detail).toContain('no capacity was used')
    expect(detail).toContain('no total moved')
    expect(detail).toContain(first.intent.id)
    expect(detail.length).toBeGreaterThan(note.length)
  })
})
