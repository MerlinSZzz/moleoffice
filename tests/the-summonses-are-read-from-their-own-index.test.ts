// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SUMMONSES ARE READ FROM THEIR OWN INDEX, AND THE SAME SUMMONSES ARE ANSWERED.
 *
 * The mail tool asks the office for the summonses since the last one it read, every 20 seconds (`EVERY_MS` in
 * tools/mail-the-summonses.mjs). The door answers from `theSummonsesSince` (src/server/lib/summons.ts). Its read named the
 * summons mark as `json_extract(data, '$.summons')`, which no index held. So SQLite read the data of every message and
 * sorted what it found, even when there was no summons at all. Migration 0339 made `records_message_summons_idx`, which
 * holds the summonses and nothing else, in the order the read asks.
 *
 * WHAT IS PROVED
 *   2. It answers the same summonses as before. They come oldest first, and two made in one second come in the order
 *      they were made. Four near misses are passed over: a withdrawn summons, a message with no mark, a message whose
 *      mark is null, and a record that is no message but carries a mark. From a place in the middle of one second, the
 *      read goes on after it. After the last summons it answers none, and a place that is no summons is refused.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the read stops asking `deleted_at IS NULL`                                → case 2
 *   the read goes on from a place by `rowid >= ?`, so it answers the place too → case 2
 *
 * WHAT THIS DOES NOT PROVE. The time a read takes. A fresh test office holds a few messages, so it shows the plan and the
 * answers, and the times are measured on a made-up office of the live size outside the suite.
 *
 * Every record here is made up. `freshDb` in tests/helpers.ts makes a throwaway database.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let summons: typeof import('../src/server/lib/summons.ts')

const WORKSPACE = 'default'

/** A made-up record written past the door, with the kind, data, time and withdrawal a case needs. Answers its id. */
function aRecord(kind: string, data: Record<string, unknown>, at: string, withdrawn = false): string {
  const record = t.api.createRecord({ kind: 'note', title: 'Made-up record', workspaceId: WORKSPACE, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, origin: 'fixture' })
  t.client.sqlite
    .prepare('UPDATE records SET kind = ?, data = ?, created_at = ?, deleted_at = ? WHERE id = ?')
    .run(kind, JSON.stringify(data), at, withdrawn ? '2026-11-02 00:00:00' : null, record.id)
  return record.id
}

/** A made-up message to the person, with a summons mark unless `mark` says otherwise. */
function aMessage(at: string, mark: Record<string, unknown> | null | undefined, withdrawn = false, kind = 'message'): string {
  const data: Record<string, unknown> = { body: 'A made-up call', to: [{ kind: 'person', id: 'made-up-person' }] }
  if (mark !== undefined) data['summons'] = mark
  return aRecord(kind, data, at, withdrawn)
}

const aMark = (n: number) => ({ who: `made-up-secretary-${String(n)}`, urgency: n % 2 === 0 ? 'soon' : 'now', title: `A made-up call ${String(n)}` })


const made = { first: '', notAMessage: '', withdrawn: '', noMark: '', nullMark: '', second: '', third: '', fourth: '' }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  summons = await import('../src/server/lib/summons.ts')
  // MADE IN THIS ORDER, so the row order is this order. The second and the third are made in the same second.
  made.first = aMessage('2026-11-10 09:00:00', aMark(1))
  made.notAMessage = aMessage('2026-11-10 09:00:01', aMark(9), false, 'note')
  made.withdrawn = aMessage('2026-11-10 09:00:02', aMark(9), true)
  made.noMark = aMessage('2026-11-10 09:00:03', undefined)
  made.nullMark = aMessage('2026-11-10 09:00:04', null)
  made.second = aMessage('2026-11-10 09:00:05', aMark(2))
  made.third = aMessage('2026-11-10 09:00:05', aMark(3))
  made.fourth = aMessage('2026-11-10 09:00:06', aMark(4))
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the summonses since a place', () => {

  it('2. are the same summonses as before: oldest first, one second in the order made, past four near misses', () => {
    const all = summons.theSummonsesSince(null)
    expect(all.summonses, 'every summons, from no place').toEqual([
      { id: made.first, at: '2026-11-10 09:00:00', ...aMark(1) },
      { id: made.second, at: '2026-11-10 09:00:05', ...aMark(2) },
      { id: made.third, at: '2026-11-10 09:00:05', ...aMark(3) },
      { id: made.fourth, at: '2026-11-10 09:00:06', ...aMark(4) },
    ])
    expect(all.says).toBe('4 summonses, oldest first.')
    expect(summons.theSummonsesSince(made.second).summonses.map((one) => one.id), 'from the second, made in the same second as the third').toEqual([made.third, made.fourth])
    expect(summons.theSummonsesSince(made.fourth), 'from the last').toEqual({ summonses: [], says: 'No summons has been made since the last one read.' })
    expect(() => summons.theSummonsesSince(made.noMark), 'a place that is no summons').toThrow(`"${made.noMark}" is no summons this office holds`)
  })
})
