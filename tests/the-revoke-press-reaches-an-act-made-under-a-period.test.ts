// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVOKE PRESS REACHES AN ACT MADE UNDER A PERIOD THE OWNER GRANTED. Problem yW5Qt7TgM1lE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS TRUE BEFORE
 * ---------------------------------------------------------------------------------------
 *
 * `POST /api/records/:id/revisions/:seq/revoke` answered 400 "was an ordinary write" for an act made under a period:
 * `revokeAnActOnTheirWords` (src/server/lib/records.ts) accepted only a revision that carried a warrant, and an act
 * under a period carries the grant (`elevationWritten`) and no warrant. So the owner could not take back one act made under a
 * period with the press the product calls revoking.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 *   · a goal confirmed by the secretary under the period is put back by the owner's press, and the undo says it was done
 *     under a period;
 *   · a decision the secretary wrote under the period is retracted by the owner's press;
 *   · the same act cannot be revoked twice;
 *   · the secretary cannot revoke an act once its period has ended, because revoking stays the owner's;
 *   · an ordinary write is still refused 400.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THIS IS WRITTEN AGAINST, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * In `revokeAnActOnTheirWords`, put back `if (act.warrant === null) {` in place of
 * `if (act.warrant === null && act.elevation === null) {` → the goal, the decision and the twice cases go red, each
 * answered 400. In `putBack`, give every undo the old note, "It was done on your words and you revoked it." → the goal
 * case goes red, because the act stood on none of the owner's words.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/**
 * Every version of a record, with what each stood on, read from the ledger itself. `GET /api/records/:id/revisions`
 * serves the warrant and not the period's stamp, so the stamp is read where `elevationWritten` put it.
 */
async function revisionsOf(id: string): Promise<{ seq: number; elevation: string | null; warrant: string | null; note: string | null }[]> {
  return t.client.sqlite
    .prepare('SELECT seq, elevation, warrant, note FROM revisions WHERE record_id = ? ORDER BY seq')
    .all(id) as { seq: number; elevation: string | null; warrant: string | null; note: string | null }[]
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, role] of [[THE_TEST_OFFICES_SECRETARY.handle, 'secretary'], ['some-worker', 'worker']] as const) {
    const made = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
    expect(made.status, made.said).toBe(201)
  }
  const raised = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'a test raises it', endsWhen: 'when you say' })
  expect(raised.status, raised.said).toBe(201)
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the revoke press, on an act made under a period', () => {
  let goal = ''
  let confirmedAt = 0

  it('puts back a goal the secretary confirmed under the period, and says it was done under a period', async () => {
    const filed = await ask('POST', '/api/records', asAgent('some-worker'), { kind: 'goal', title: 'A goal a worker filed', data: {} })
    expect(filed.status, filed.said).toBe(201)
    goal = String((filed.body['record'] as { id: string }).id)
    const confirmed = await ask('PATCH', `/api/records/${goal}`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      ...FOR_THE_PERSON,
      dataPatch: { confirmed_by: { by: THE_TEST_OFFICES_SECRETARY.handle, at: '2026-10-01 09:00:00' } },
    })
    expect(confirmed.status, confirmed.said).toBe(200)
    const act = (await revisionsOf(goal)).find((one) => one.elevation !== null && one.elevation !== undefined)
    expect(act, 'the confirmation is stamped with the period').toBeDefined()
    expect(act?.warrant ?? null, 'and carries no warrant').toBeNull()
    confirmedAt = act?.seq ?? 0

    const revoked = await ask('POST', `/api/records/${goal}/revisions/${String(confirmedAt)}/revoke`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() })
    expect(revoked.status, revoked.said).toBe(200)
    expect(String(revoked.body['note'])).toContain('back to what it held')

    const now = await ask('GET', `/api/records/${goal}`, AS_THE_PERSON)
    const data = (now.body['record'] as { data: Record<string, unknown> }).data
    expect(data['confirmed_by'] ?? null, 'the confirmation was taken back').toBeNull()
    const undo = (await revisionsOf(goal)).reduce((a, b) => (a.seq > b.seq ? a : b))
    expect(undo.note ?? '', 'the undo says it was done under a period').toContain('under a period you granted')
  })

  it('refuses the same act a second time', async () => {
    const again = await ask('POST', `/api/records/${goal}/revisions/${String(confirmedAt)}/revoke`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() })
    expect(again.status, again.said).toBe(409)
    expect(again.said).toContain('already revoked')
  })

  it('retracts a decision the secretary wrote under the period', async () => {
    const written = await ask('POST', '/api/records', asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      ...FOR_THE_PERSON,
      kind: 'decision',
      title: 'A decision made under the period',
      data: { ...governsTheWholeProject(), replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'Because the owner said so.' },
    })
    expect(written.status, written.said).toBe(201)
    const id = String((written.body['record'] as { id: string }).id)
    const revoked = await ask('POST', `/api/records/${id}/revisions/1/revoke`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() })
    expect(revoked.status, revoked.said).toBe(200)
    expect(String(revoked.body['note'])).toContain('was retracted')
  })

  it('stays the owner\'s: the secretary cannot revoke once the period has ended', async () => {
    const filed = await ask('POST', '/api/records', asAgent('some-worker'), { kind: 'goal', title: 'Another goal a worker filed', data: {} })
    expect(filed.status, filed.said).toBe(201)
    const id = String((filed.body['record'] as { id: string }).id)
    const confirmed = await ask('PATCH', `/api/records/${id}`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), { ...FOR_THE_PERSON, dataPatch: { confirmed_by: { by: THE_TEST_OFFICES_SECRETARY.handle, at: '2026-10-01 09:05:00' } } })
    expect(confirmed.status, confirmed.said).toBe(200)
    const act = (await revisionsOf(id)).find((one) => one.elevation !== null && one.elevation !== undefined)
    const ended = await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, AS_THE_PERSON)
    expect(ended.status, ended.said).toBeLessThan(300)
    const refused = await ask('POST', `/api/records/${id}/revisions/${String(act?.seq ?? 0)}/revoke`, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(refused.status, refused.said).toBe(403)
  })

  it('still refuses an ordinary write, which stands on nobody', async () => {
    const filed = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'note', title: 'An ordinary note', data: { body: 'x' } })
    expect(filed.status, filed.said).toBe(201)
    const id = String((filed.body['record'] as { id: string }).id)
    const changed = await ask('PATCH', `/api/records/${id}`, AS_THE_PERSON, { summary: 'an ordinary edit' })
    expect(changed.status, changed.said).toBe(200)
    const refused = await ask('POST', `/api/records/${id}/revisions/2/revoke`, AS_THE_PERSON)
    expect(refused.status, refused.said).toBe(400)
    expect(refused.said).toContain('was an ordinary write')
  })

})
