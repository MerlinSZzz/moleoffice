// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DRAFT IS KEPT, AND NOTHING SENDS IT BY ITSELF. Point 5 of a decision: a reminder comes one hour
 * after the draft was last changed unless the draft names another time; it goes to the writer, or to
 * the writer's starter once the writer's run has ended; it is said once for each version of the
 * draft; and it never sends the draft.
 *
 * The tick is driven with a clock the test sets, the way the idle-reminder test drives it: one call of
 * `sendTheRemindersThatAreDue` is one minute of the office's own watcher. `watchingSince` is set after
 * every clock used here, so no idle reminder is due and each office line below is a draft line.
 *
 * THE THREE-RUN PROOF is in the commit that adds this file: a control run, a mutation of one line of
 * the code each case guards, and a run after the line was put back.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib

/** Real now, once, at the top. Every tick clock is measured from it. */
const R0 = new Date()
const minutes = (n: number): Date => new Date(R0.getTime() + n * 60_000)
/** Later than every clock below, so the idle reminder never counts any agent's activity as observed. */
const WATCHING_SINCE = minutes(24 * 60)

const as = (type: 'agent' | 'human', id: string, session?: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  reminders = await import('../src/server/lib/reminders.ts')
  const started = async (by: Record<string, string>, handle: string): Promise<void> => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle, name: `Synthetic ${handle}` } })
    expect(r.statusCode, r.body).toBe(201)
  }
  await started(asPerson, 'kept-starter')
  await started(as('agent', 'kept-starter'), 'kept-writer')
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

function agentId(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** A running run of kept-writer, filed as its session record. */
function aRun(): string {
  return t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run of kept-writer',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'kept-writer' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'kept-writer' },
  }).id
}

/** A draft kept-writer files in one of its runs, or in none. */
async function aDraft(run: string | undefined, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: as('agent', 'kept-writer', run),
    payload: {
      kind: 'draft',
      title: 'Synthetic draft left unsent',
      data: { body: 'Synthetic words.', for: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }], becomes: 'message', ...extra },
    },
  })
  expect(r.statusCode, r.body).toBe(201)
  return (JSON.parse(r.body) as { record: { id: string } }).record.id
}

/** Every office line about one draft, with whom it reached. */
function linesAbout(draft: string): { to: string; said: string }[] {
  return (
    t.client.sqlite
      .prepare(
        `SELECT d.recipient_kind || ':' || d.recipient_id AS "to", json_extract(r.data, '$.saidInFull') AS said
           FROM records r JOIN message_delivery d ON d.message_id = r.id
          WHERE r.kind = 'message' AND json_extract(r.data, '$.extra.draft') = ?
          ORDER BY r.created_at, r.id`,
      )
      .all(draft) as { to: string; said: string }[]
  )
}

function tick(at: Date): string[] {
  return reminders.sendTheRemindersThatAreDue('default', at, WATCHING_SINCE).draftsReminded
}

function deliveryRows(): number {
  return (t.client.sqlite.prepare('SELECT count(*) AS n FROM message_delivery').get() as { n: number }).n
}

describe('a draft kept in the office', () => {
  it('makes no delivery row when it is saved or changed', async () => {
    const before = deliveryRows()
    const id = await aDraft(aRun())
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: as('agent', 'kept-writer'),
      payload: { dataPatch: { body: 'Synthetic words, changed.' } },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    expect(deliveryRows()).toBe(before)
  })

  it('is reminded once after its time, and again only after a change', async () => {
    const run = aRun()
    const id = await aDraft(run)
    expect(tick(minutes(59))).not.toContain(id)
    expect(tick(minutes(61))).toContain(id)
    expect(tick(minutes(62))).not.toContain(id)
    expect(tick(minutes(200))).not.toContain(id)
    const first = linesAbout(id)
    expect(first).toHaveLength(1)
    expect(first[0]!.to).toBe(`agent:${agentId('kept-writer')}`)
    expect(first[0]!.said).toContain('Your draft "Synthetic draft left unsent"')
    expect(first[0]!.said).toContain('Nothing sends it by itself.')

    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: as('agent', 'kept-writer', run),
      payload: { dataPatch: { body: 'Synthetic words, changed after the reminder.' } },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    expect(tick(minutes(201))).toContain(id)
    expect(tick(minutes(202))).not.toContain(id)
    expect(linesAbout(id)).toHaveLength(2)
  })

  it('waits the time the draft names instead of the hour', async () => {
    const id = await aDraft(aRun(), { remindAfterMinutes: 120 })
    expect(tick(minutes(61))).not.toContain(id)
    expect(tick(minutes(121))).toContain(id)
  })

  it("goes to the writer's starter once the writer's run has ended", async () => {
    const run = aRun()
    const id = await aDraft(run)
    const ended = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: as('agent', 'kept-writer'),
      // CRASHED IS ONE OF THE THREE WORDS THAT END A RUN, and it needs no seal, which a finish does.
      payload: { dataPatch: { state: 'crashed' } },
    })
    expect(ended.statusCode, ended.body).toBe(200)
    expect(tick(minutes(61))).toContain(id)
    const lines = linesAbout(id)
    expect(lines.map((one) => one.to)).toEqual([`agent:${agentId('kept-starter')}`])
    expect(lines[0]!.said).toContain('You started kept-writer')
    expect(lines[0]!.said).toContain('Only kept-writer can send it.')
  })

  it('goes to the person, saying why, when nothing recorded which run wrote it', async () => {
    const id = await aDraft(undefined)
    expect(tick(minutes(61))).toContain(id)
    const lines = linesAbout(id)
    expect(lines.map((one) => one.to)).toEqual([`person:${THE_TEST_OFFICES_OWNER.id}`])
    expect(lines[0]!.said).toContain('This comes to you because nothing recorded which run of kept-writer wrote it')
  })

  it('is never sent by the tick', async () => {
    const id = await aDraft(aRun())
    for (const n of [61, 120, 600, 1400]) tick(minutes(n))
    const data = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, unknown>
    expect(data['sentAs']).toBeUndefined()
    expect(data['sentAt']).toBeUndefined()
    const derived = t.client.sqlite.prepare("SELECT count(*) AS n FROM links WHERE type = 'derived_from' AND to_id = ?").get(id) as { n: number }
    expect(derived.n).toBe(0)
    const madeByTheWriter = t.client.sqlite
      .prepare(
        "SELECT count(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.sentBy.id') != 'mole-office' AND json_extract(data, '$.body') = 'Synthetic words.'",
      )
      .get() as { n: number }
    expect(madeByTheWriter.n).toBe(0)
  })
})
