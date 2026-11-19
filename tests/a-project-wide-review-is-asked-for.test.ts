// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WIDEST REVIEW THERE IS IS ASKED FOR, AND IT CANNOT BE REACHED BY POINTING AT NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * `SCOPE_READERS` had two arms that widened: `page` and `uiSurface` both answered
 * `{scope: {kind: 'project'}}`. A page is what a comment points at when nothing more precise was
 * under the pointer, so the ONE gesture between a person and a review of their entire project was a
 * right-click on the gap beside the panels. The review said "Everything in this project" and
 * collected everybody's comments about everything until somebody finished collecting — and a person
 * who WANTED one had no way to ask for it, because the only route to it was the accident.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS TRUE NOW, AND BOTH DIRECTIONS ARE ASSERTED
 * ---------------------------------------------------------------------------------------
 *
 *   THE REFUSAL. Starting a review of one place from a page or from a part of the screen is refused
 *   by name, and the refusal says what to do instead. Neither arm widens anything any more.
 *
 *   THE ASK. `POST /api/reviews {reach: "global"}` starts one, from wherever the person was
 *   standing, and `rule` says it collects the project and that the entry decides nothing.
 *
 *   ONE AT A TIME. A second project-wide review collecting in the same project is refused 409, and
 *   the refusal NAMES WHO HOLDS THE FIRST — an index alone would answer "UNIQUE constraint failed",
 *   which tells a person nothing they can act on. The index behind it is created by window B's
 *   reach step, so on a database that has not had window B run against it the sentence is the whole
 *   of the guard; both are asserted here, on the sentence, because that is what a person meets.
 *
 * Every failing case here was proved by mutation, with a control run of this file first.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/**
 * A PROJECT OF ITS OWN FOR EACH CASE. One case says the list of reviews is empty and several start a
 * project-wide review, of which only one may collect at a time. A fresh project per case keeps both
 * true in one office shared by the file.
 */
let WORKSPACE = 'default'
let caseNumber = 0
const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
const SOMEBODY_ELSE = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': 'sam', 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  HUMAN['x-mole-office-workspace'] = WORKSPACE
  SOMEBODY_ELSE['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: 'A made-up project for one case' },
  })
  expect(made.statusCode, made.body).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

const PAGE = { target: { kind: 'page', route: '/governance' } }
const SURFACE = { target: { kind: 'uiSurface', surfaceId: 'rail' } }

async function aRecord(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: { kind: 'module', title: 'The mount' },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function start(
  payload: Record<string, unknown>,
  headers: Record<string, string> = HUMAN,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'POST', url: '/api/reviews', headers, payload })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

// ============================================================================ the refusal

describe('a review of one place cannot be started where no place was pointed at', () => {
  it('refuses a page, and says to ask for a project-wide review instead', async () => {
    const out = await start({ entry: PAGE })
    expect(out.status, JSON.stringify(out.body)).toBe(400)
    expect(String(out.body['error'])).toContain('project-wide review')
    // AND NOTHING WAS CREATED. A refusal that had already written a row would be the worst of both.
    const list = await app.inject({ method: 'GET', url: '/api/reviews', headers: HUMAN })
    expect((list.json() as { reviews: unknown[] }).reviews).toHaveLength(0)
  })

  it('refuses a part of the screen for the same reason and in its own words', async () => {
    const out = await start({ entry: SURFACE })
    expect(out.status, JSON.stringify(out.body)).toBe(400)
    expect(String(out.body['error'])).toContain('every page it is on')
    expect(String(out.body['error'])).toContain('project-wide review')
  })

  it('still starts a review from something that names a place', async () => {
    // THE HALF A TOO-WIDE REFUSAL WOULD BREAK.
    const id = await aRecord()
    const out = await start({ entry: { target: { kind: 'record', recordId: id, workspaceId: WORKSPACE } } })
    expect(out.status, JSON.stringify(out.body)).toBe(201)
    expect(String((out.body['rule'] as Record<string, unknown>)['kind'])).toBe('record')
  })
})

// ============================================================================ the ask

describe('a project-wide review is a press, and it says the entry decides nothing', () => {
  it('starts one from a page, because how wide it is was chosen rather than derived', async () => {
    const out = await start({ entry: PAGE, reach: 'global' })
    expect(out.status, JSON.stringify(out.body)).toBe(201)
    const review = out.body['review'] as Record<string, unknown>
    expect(review['reach']).toBe('global')
    const rule = out.body['rule'] as Record<string, unknown>
    expect(rule['kind']).toBe('project')
    expect(String(rule['says'])).toContain('Everything in this project')
    expect(String(rule['says'])).toContain('nothing about what it collects')
  })

  it('starts one from a record too, and the record does not narrow it', async () => {
    const id = await aRecord()
    const out = await start({ entry: { target: { kind: 'record', recordId: id, workspaceId: WORKSPACE } }, reach: 'global' })
    expect(out.status, JSON.stringify(out.body)).toBe(201)
    expect(String((out.body['rule'] as Record<string, unknown>)['kind'])).toBe('project')
  })

  it('leaves an ordinary review reading as one place, so the default did not move', async () => {
    const id = await aRecord()
    const out = await start({ entry: { target: { kind: 'record', recordId: id, workspaceId: WORKSPACE } } })
    expect((out.body['review'] as Record<string, unknown>)['reach']).toBe('local')
  })

  it('refuses a word that is neither', async () => {
    const out = await start({ entry: PAGE, reach: 'everything' })
    expect(out.status).toBe(400)
    expect(String(out.body['error'])).toContain('local')
  })
})

// ============================================================================ one at a time

describe('one project-wide review collects at a time, and the refusal names who holds it', () => {
  it('refuses a second one and names the person whose it is', async () => {
    const first = await start({ entry: PAGE, reach: 'global' })
    expect(first.status).toBe(201)

    const second = await start({ entry: PAGE, reach: 'global' }, SOMEBODY_ELSE)
    expect(second.status, JSON.stringify(second.body)).toBe(409)
    // WHO HOLDS IT. An index alone answers "UNIQUE constraint failed", which is not something a
    // person can do anything with.
    expect(String(second.body['error'])).toContain(`human:${THE_TEST_OFFICES_OWNER.id}`)
    expect(String(second.body['error'])).toContain('still collecting')
  })

  it('gives the person who started it their own review back rather than refusing them', async () => {
    const first = await start({ entry: PAGE, reach: 'global' })
    const again = await start({ entry: PAGE, reach: 'global' })
    expect(again.status).toBe(200)
    expect((again.body['review'] as Record<string, unknown>)['id']).toBe(
      (first.body['review'] as Record<string, unknown>)['id'],
    )
    expect(again.body['started']).toBe(false)
  })

  it('lets a second one start once the first has stopped collecting', async () => {
    const first = await start({ entry: PAGE, reach: 'global' })
    const id = (first.body['review'] as Record<string, unknown>)['id'] as string
    const ended = await app.inject({ method: 'POST', url: `/api/reviews/${id}/abandon`, headers: HUMAN })
    expect(ended.statusCode, ended.body).toBe(200)
    const second = await start({ entry: PAGE, reach: 'global' }, SOMEBODY_ELSE)
    expect(second.status, JSON.stringify(second.body)).toBe(201)
  })

  it('does not stand in the way of an ordinary review of one place', async () => {
    await start({ entry: PAGE, reach: 'global' })
    const id = await aRecord()
    const narrow = await start(
      { entry: { target: { kind: 'record', recordId: id, workspaceId: WORKSPACE } } },
      SOMEBODY_ELSE,
    )
    expect(narrow.status, JSON.stringify(narrow.body)).toBe(201)
  })
})

// ============================================================================ who asked for it

describe('the agent that asked for a review is remembered, and only a person may write it', () => {
  it('keeps the agent a person names', async () => {
    const out = await start({ entry: PAGE, reach: 'global', startedByAgent: 'agentRecord1' })
    expect((out.body['review'] as Record<string, unknown>)['startedByAgent']).toBe('agentRecord1')
  })

  it('ignores it when an agent sends it about itself, because an agent may not start one', async () => {
    const id = await aRecord()
    const out = await start(
      { entry: { target: { kind: 'record', recordId: id, workspaceId: WORKSPACE } }, startedByAgent: 'agentRecord1' },
      {
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'claude-code',
        'x-mole-office-session': 'sess-1',
        'x-mole-office-workspace': WORKSPACE,
      },
    )
    expect(out.status, JSON.stringify(out.body)).toBe(201)
    expect((out.body['review'] as Record<string, unknown>)['startedByAgent']).toBeNull()
  })
})
