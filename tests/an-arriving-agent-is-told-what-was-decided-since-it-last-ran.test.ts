// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT THAT COMES BACK IS TOLD WHAT WAS DECIDED WHILE IT WAS AWAY.
 *
 * ---------------------------------------------------------------------------------------
 * WHOSE QUESTION THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * The question this file answers:
 *
 * Is there any way to tell an agent that arrives later what has already been decided about the
 * project? There was not. Criterion P36 of design/permissions/ACCEPTANCE.md, designed in its 3.7.6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * The reading is *the runs filed under the name you are writing under*, because that is the only tie
 * between a run and a caller that the corpus actually carries — `data.ranAs` is set on 2 of 1,076
 * session records and `data.servingAgent` on 10, while every run's create row in the change log
 * names who filed it. So the cases below drive real runs filed under a real name, and one of them
 * checks that a second name gets a different answer, which is what would break if the tie were
 * dropped for "the newest run in the project".
 *
 * FOUR ANSWERS, NOT TWO. Something was decided; nothing was; you did not say which run you are; and
 * nothing has run under this name before. The last two are why the section can be trusted at all: a
 * boundary nothing stands behind would report "nothing new" for ever and look exactly like a quiet
 * project. Each one says which it is, in its own sentence.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

let PROJECT = 'default'
let caseNumber = 0
const ME = 'claude-code/the-one-that-came-back'
const SOMEBODY_ELSE = 'claude-code/a-different-name'

/**
 * ONE OFFICE FOR THE FILE, and a project of its own for each case. The reading below counts the
 * decisions in the project the request names, so a case's own project makes it see only the records
 * that case filed.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  PROJECT = `default-case-${String(caseNumber)}`
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: PROJECT, title: 'A case’s own project' },
  })
  expect(made.statusCode, made.body).toBe(201)
})

/**
 * PUT A RECORD AT A NAMED MINUTE, so this file can say when things happened.
 *
 * Stamps in Mole Office are wall-clock to the second, and a test writes its whole story inside one
 * of them, so every record it files would otherwise carry the same time and no boundary could be
 * measured at all. Nothing here is testing the clock: it is testing what "since" means, so the
 * times are stated rather than raced for.
 */
function at(id: string, stamp: string): string {
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(stamp, id)
  t.client.sqlite.prepare('UPDATE changes SET at = ? WHERE record_id = ?').run(stamp, id)
  return id
}

/** A run this name filed, as the hook files one at the start of a session. */
function aRun(name: string, title: string, stamp: string): string {
  return at(
    t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'session',
      title,
      data: { state: 'running' },
      actor: { type: 'agent', id: name },
    }).id,
    stamp,
  )
}

/** A decision the person made. Filed directly, because what settled it is not what is measured here. */
function aDecision(title: string, stamp: string): string {
  return at(
    t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'decision',
      title,
      data: { because: 'the owner said so', authority: 'the owner said so', decided_by: THE_TEST_OFFICES_OWNER.id },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    }).id,
    stamp,
  )
}

interface TheSection {
  measuredFrom: { run: string; title: string; openedAt: string } | null
  decisions: { id: string; title: string }[]
  howMany: number
  note: string
}

async function brief(name: string | null, run: string | null): Promise<{ since: TheSection; tenNewest: { id: string }[] }> {
  const headers: Record<string, string> = { 'x-mole-office-workspace': PROJECT }
  if (name !== null) {
    headers['x-mole-office-actor-type'] = 'agent'
    headers['x-mole-office-actor-id'] = name
  }
  if (run !== null) headers['x-mole-office-session'] = run
  const res = await app.inject({ method: 'GET', url: '/api/brief', headers })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  const body = res.json() as { decidedSinceYouLastRan: TheSection; decisions: { id: string }[] }
  return { since: body.decidedSinceYouLastRan, tenNewest: body.decisions }
}

// ================================================== the answer when something was decided

describe('an arriving agent is told what was decided since it last ran', () => {
  it('names the decision filed between its two runs, and the run it measured from', async () => {
    const first = aRun(ME, 'The first run', '2026-09-05 10:00:00')
    const decided = aDecision('An orphaned session counts as over', '2026-09-05 14:00:00')
    const second = aRun(ME, 'The second run', '2026-09-06 09:00:00')

    const { since } = await brief(ME, second)
    expect(since.measuredFrom?.run, 'the boundary is the run before this one').toBe(first)
    expect(since.howMany).toBe(1)
    expect(since.decisions.map((one) => one.id)).toContain(decided)
    expect(since.note).toContain(first)
    expect(since.note).toContain(ME)
  })

  it('does not count a decision made before that run opened', async () => {
    aDecision('Decided long before anybody arrived', '2026-09-04 08:00:00')
    const first = aRun(ME, 'The first run', '2026-09-05 10:00:00')
    const second = aRun(ME, 'The second run', '2026-09-06 09:00:00')

    const { since } = await brief(ME, second)
    expect(since.measuredFrom?.run).toBe(first)
    expect(since.howMany, 'nothing was decided after the first run opened').toBe(0)
    expect(since.decisions).toHaveLength(0)
    expect(since.note, 'and it says so rather than leaving an empty list to be read as an answer').toContain(
      'Nothing has been decided',
    )
  })

  it('measures over this caller’s own runs and not over the newest run in the project', async () => {
    const mine = aRun(ME, 'My only earlier run', '2026-09-05 10:00:00')
    const decided = aDecision('Something settled while I was away', '2026-09-05 14:00:00')
    aRun(SOMEBODY_ELSE, 'Somebody else’s run, opened after that decision', '2026-09-05 18:00:00')
    const now = aRun(ME, 'My run now', '2026-09-06 09:00:00')

    const { since } = await brief(ME, now)
    expect(since.measuredFrom?.run, 'the other name’s run is not mine').toBe(mine)
    expect(since.decisions.map((one) => one.id)).toContain(decided)
    expect(since.howMany).toBe(1)
  })
})

// ================================================== the answers when it cannot be measured

describe('the brief says why it could not measure, rather than answering nothing new', () => {
  it('says a first run under this name has nothing to measure from, and the ten newest stand', async () => {
    aDecision('One', '2026-09-04 08:00:00')
    aDecision('Two', '2026-09-04 09:00:00')
    const only = aRun(ME, 'The only run this name has ever had', '2026-09-06 09:00:00')

    const { since, tenNewest } = await brief(ME, only)
    expect(since.measuredFrom, 'there is no earlier run').toBeNull()
    expect(since.howMany).toBe(0)
    expect(since.note).toContain('Nothing has run under the name')
    expect(since.note).toContain(ME)
    expect(tenNewest.length, 'a first-time reader still gets the ten newest').toBe(2)
  })

  it('says so when the request did not name which run it is, and names the header to send', async () => {
    aRun(ME, 'An earlier run', '2026-09-05 10:00:00')
    aDecision('Something decided', '2026-09-05 14:00:00')
    aRun(ME, 'This run, which did not introduce itself', '2026-09-06 09:00:00')

    const { since } = await brief(ME, null)
    expect(since.measuredFrom, 'a boundary nothing stands behind is not offered').toBeNull()
    expect(since.note).toContain('x-mole-office-session')
    expect(since.howMany).toBe(0)
  })

  it('says so when the request named no actor at all', async () => {
    aRun(ME, 'An earlier run', '2026-09-05 10:00:00')
    aDecision('Something decided', '2026-09-05 14:00:00')

    const { since } = await brief(null, null)
    expect(since.measuredFrom).toBeNull()
    expect(since.note).toContain('x-mole-office-actor-id')
  })
})

// ================================================== the ten newest are untouched

describe('the ten newest decisions are not what this changed', () => {
  it('leaves `decisions` as the ten newest whatever the caller’s history is', async () => {
    for (let i = 0; i < 12; i += 1) aDecision(`Decision ${String(i)}`, `2026-09-04 08:${String(i).padStart(2, '0')}:00`)
    const first = aRun(ME, 'The first run', '2026-09-05 10:00:00')
    aDecision('One more, after the first run', '2026-09-05 14:00:00')
    const second = aRun(ME, 'The second run', '2026-09-06 09:00:00')

    const { since, tenNewest } = await brief(ME, second)
    expect(tenNewest, 'the criterion’s ten, unchanged').toHaveLength(10)
    expect(since.measuredFrom?.run).toBe(first)
    expect(since.howMany, 'and the narrower reading is genuinely narrower').toBe(1)
  })
})
