// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * UNSEEN MESSAGES ARE FOUND BY THEIR IDS. Wave 13y round 38.
 *
 * The two readers start from the delivery ids this person has not seen. The kind and the centre must both stay off
 * their indexes, or SQLite walks every message instead. Read the actual bound plans in a fresh office without
 * statistics, for the centre and a project's view. Keep the ids and their order, including an urgent message outside
 * the project, and leave out seen and deleted messages. Messages written in one second keep their stored order, with
 * ids deliberately drawn in reverse order so that id order is always wrong. This holds the plan and answers, not time.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
const OWNER = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const
const PERSON = { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } as const

beforeEach(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
})

afterEach(() => {
  vi.useRealTimers()
  t?.close()
  vi.unstubAllEnvs()
})

/** Capture the readers' own statements and ask SQLite for each plan with the values they bound. */
function theUnseenReadsDuring(work: () => void): { sql: string; values: unknown[]; plan: string[] }[] {
  const ran: { sql: string; values: unknown[] }[] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    const statement = prepare(source)
    if (!source.includes('"records"."id" in (select "message_id" from "message_delivery"')) return statement
    const all = statement.all.bind(statement) as (...values: unknown[]) => unknown
    ;(statement as unknown as Record<string, unknown>).all = (...values: unknown[]) => {
      ran.push({ sql: source, values })
      return all(...values)
    }
    return statement
  }) as never)
  try {
    work()
  } finally {
    spy.mockRestore()
  }
  return ran.map((one) => ({
    ...one,
    plan: (prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...one.values) as { detail: string }[]).map((step) => step.detail),
  }))
}

it('the centre and project find unseen messages by id and keep their answers and order', async () => {
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  const { messagesWaitingFor, forcedMessagesFor, markDelivery } = await import('../src/server/lib/messages.ts')
  createWorkspace({ id: 'elsewhere', title: 'Another project' })
  vi.useFakeTimers({ toFake: ['Date'] })
  let second = 0
  const write = (body: string, workspaceId = 'default', urgent = true): string => {
    vi.setSystemTime(new Date(2026, 9, 1, 10, 0, second++))
    return t.api.createRecord({
      workspaceId, kind: 'message', title: body, data: { body, urgent, to: [PERSON] }, actor: OWNER,
    }).id
  }
  const four = [1, 2, 3, 4].map((n) => write(`unseen-${String(n)}`))
  const outside = write('outside the project', 'elsewhere')
  const ordinary = write('not urgent', 'default', false)
  const seen = write('already seen')
  markDelivery(seen, PERSON, 'seen')
  const deleted = write('deleted after delivery')
  t.api.deleteRecord(deleted, OWNER)

  const answers: Record<string, string[]> = {}
  const reads = theUnseenReadsDuring(() => {
    answers.centre = messagesWaitingFor('message-centre', PERSON).map((one) => one.id)
    answers.project = messagesWaitingFor('default', PERSON).map((one) => one.id)
    // Forced messages belong to every project: changing the page's project never hides an emergency.
    answers.forced = forcedMessagesFor(PERSON, { machine: null, program: null }).map((one) => one.id)
  })
  expect(answers).toEqual({ centre: [ordinary, outside, ...[...four].reverse()], project: [ordinary, ...[...four].reverse()], forced: [...four, outside] })
  expect(reads, 'the centre, project, and forced readers each ran their unseen read').toHaveLength(3)
  for (const read of reads) {
    const said = `${read.plan.join('\n')}\nSQL: ${read.sql}\nvalues: ${JSON.stringify(read.values)}`
    expect(read.plan[0], said).toBe('SEARCH records USING INDEX sqlite_autoindex_records_1 (id=?)')
    for (const step of read.plan) expect(step, said).not.toMatch(/records_kind_idx|records_live_idx/)
  }
})

it('messages written in one second keep their stored order rather than their id order', async () => {
  const { messagesWaitingFor } = await import('../src/server/lib/messages.ts')
  const ids = await import('../src/server/lib/ids.ts')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 1, 10, 0, 0))
  // EVERY DRAW IS UNIQUE AND DESCENDING, including the draws for delivery and change rows between message ids.
  let next = 999_999_999
  const draws = vi.spyOn(ids, 'anOfficeId').mockImplementation(() => `tie${String(next--).padStart(9, '0')}`)
  let stored: string[]
  try {
    stored = [1, 2, 3].map((n) => t.api.createRecord({
      workspaceId: 'default', kind: 'message', title: `tied-${String(n)}`,
      data: { body: `Written in the same second: ${String(n)}.`, to: [PERSON] }, actor: OWNER,
    }).id)
  } finally {
    draws.mockRestore()
  }
  expect(stored, 'id order must certainly differ from stored order').not.toEqual([...stored].sort())
  for (const project of ['message-centre', 'default']) {
    expect(messagesWaitingFor(project, PERSON).map((one) => one.id), `stored order in ${project}`).toEqual(stored)
  }
})
