// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S TWO LISTS ASK THE LEDGER ABOUT THE OWNER'S WORDS ONCE FOR THE WHOLE LIST. Problem 9dYnSFapwm5x.
 *
 * GET /api/forks and GET /api/waiting say, on each row, whether anything on it stands on the owner's
 * own words (`onTheirWords`). That answer came from `standsOnTheirWords`, which asked the ledger for one
 * record at a time: one query for the decisions that settle it and one for its warranted revisions,
 * and more for each act it found. So the number of queries grew with the length of the list.
 *
 * WHAT IS PROVED
 *   1. The number of ledger queries each list makes does not grow with the number of forks.
 *   2. The whole-list reader gives, for each record, exactly the act the one-record reader gives:
 *      the newest act on the owner's words nobody took back, on the record or on a decision settling it,
 *      and null where there is none. Four records: an act that stands, an act the owner took back, a record
 *      nobody acted on, and a fork settled on the owner's words, whose act is on the decision.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   a list asks `standsOnTheirWords` row by row again   → case 1
 *   the whole-list reader drops a revoked act's check  → case 2
 *
 * HOW THE QUERIES ARE COUNTED. Every statement the product runs goes through `prepare` on the one
 * database handle; this wraps that handle's `prepare` and counts the statements that read the
 * ledger for warrants, which is SQL naming both `revisions` and `warrant`.
 *
 * Nothing here opens ./data/panelx.db: `freshDb` in tests/helpers.ts makes a throwaway database.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'panelx'
const asAgent: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}
const asPerson: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: PROJECT, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

async function fileForks(n: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < n; i += 1) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asPerson,
      payload: { kind: 'proposal', title: `Fork number ${i + 1}`, data: { question: 'Which one?', options: ['a — this', 'b — that'], who_settles_it: 'the owner' } },
    })
    expect(res.statusCode, res.body).toBe(201)
    ids.push((res.json() as { record: { id: string } }).record.id)
  }
  return ids
}

/** How many statements reading the ledger for warrants one request runs. */
async function ledgerQueriesOf(url: string): Promise<number> {
  const handle = t.client.sqlite as unknown as { prepare: (sql: string) => unknown }
  const real = handle.prepare
  let n = 0
  handle.prepare = function (sql: string) {
    if (/revisions/.test(sql) && /warrant/.test(sql)) n += 1
    return real.call(this, sql)
  }
  try {
    const res = await app.inject({ method: 'GET', url, headers: asAgent })
    expect(res.statusCode, res.body).toBe(200)
  } finally {
    handle.prepare = real
  }
  return n
}

describe("the owner's lists ask the ledger once", () => {
  it('makes as many ledger queries for forty forks as for four', async () => {
    await fileForks(4)
    const fewForks = await ledgerQueriesOf('/api/forks')
    const fewWaiting = await ledgerQueriesOf('/api/waiting')
    await fileForks(36)
    const manyForks = await ledgerQueriesOf('/api/forks')
    const manyWaiting = await ledgerQueriesOf('/api/waiting')
    expect(manyForks).toBe(fewForks)
    expect(manyWaiting).toBe(fewWaiting)
  })

  it('gives each record the act the one-record reader gives', async () => {
    const warrants = await import('../src/server/lib/warrants.ts')
    // THE CARD THE SETTLING ACTS ASK FOR: a warrant on a fork is spent by the secretary.
    const card = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { ...asPerson, 'content-type': 'application/json' },
      payload: { handle: 'claude-code', name: 'Claude Code', role: 'secretary' },
    })
    expect(card.statusCode, card.body).toBe(201)
    const askedOfTheOwner = (symptom: string): string =>
      t.api.createRecord({
        workspaceId: PROJECT,
        kind: 'problem',
        title: symptom,
        data: { whose_move: 'person', symptom },
        actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
      }).id
    const onTheOwnersWords = (id: string): Record<string, unknown> => ({ saidBy: THE_TEST_OFFICES_OWNER.id, words: 'yes, close it', where: 'terminal', when: '2026-09-03 09:14', for: [id] })
    const patch = async (id: string, payload: Record<string, unknown>): Promise<void> => {
      const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asAgent, payload })
      expect(res.statusCode, res.body).toBe(200)
    }
    const revokeNewest = async (id: string): Promise<void> => {
      const act = warrants.actsOnTheirWords(id)[0]
      const res = await app.inject({ method: 'POST', url: `/api/records/${id}/revisions/${String(act?.seq)}/revoke`, headers: asPerson })
      expect(res.statusCode, res.body).toBe(200)
    }

    const standing = askedOfTheOwner('an act that stands')
    await patch(standing, { dataPatch: { state: 'accepted' }, warrant: onTheOwnersWords(standing) })
    const takenBack = askedOfTheOwner('an act the owner took back')
    await patch(takenBack, { dataPatch: { state: 'accepted' }, warrant: onTheOwnersWords(takenBack) })
    await revokeNewest(takenBack)
    const untouched = askedOfTheOwner('nothing on the owner\'s words')
    const [fork] = await fileForks(1)
    const promoted = await app.inject({
      method: 'POST',
      url: `/api/records/${fork!}/promote`,
      headers: asAgent,
      payload: { title: 'Take this one', data: { because: 'The owner said so.' }, warrant: onTheOwnersWords(fork!) },
    })
    expect(promoted.statusCode, promoted.body).toBe(201)

    const ids = [standing, takenBack, untouched, fork!]
    const whole = warrants.standsOnTheirWordsForEach(ids)
    for (const id of ids) {
      expect(whole.get(id), id).toEqual(warrants.actsOnTheirWords(id).find((act) => act.revoked === null) ?? null)
    }
    expect(whole.get(standing)).not.toBeNull()
    expect(whole.get(takenBack)).toBeNull()
    expect(whole.get(untouched)).toBeNull()
    expect(whole.get(fork!)?.recordId).not.toBe(fork)
  })
})
