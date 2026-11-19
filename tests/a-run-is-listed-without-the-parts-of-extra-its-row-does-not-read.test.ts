// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/sessions READS OF A RUN'S `extra` ONLY THE PART ITS ROW IS BUILT FROM. Wave 13s round 188.
 *
 * A session kind declares `extra` as an open bag. A run's row reads one part of it, `discovered`: the discovery stamp
 * and the recorded process. A person's notes and anything else kept beside it are read by nothing in the list, and on
 * an office of the live shape they can be most of the run's stored text. The list kept `extra` whole, so every part of
 * it was handed back by the database on every call.
 *
 * WHAT THIS FILE COUNTS. A statement on `records` that hands back any text holding the made-up note. The note is one
 * sentence repeated, and no other record holds it, so no reader can be missed.
 *
 * AND EVERY READER STILL GETS ITS PART. A stamped run's row is the run discovery found, by its stamp, and a run that
 * says it is running is looked for by the process it recorded. Both are read from `discovered`.
 *
 * THREE-RUN PROOF, in the commit message with the commands: CONTROL before the code, red for the note and for the
 * narrowing; a MUTATION of one line for each part, red; RESTORE green, run after the last mutation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const NOTE = 'A note a person kept in the run, which no row of the list reads. '
const LONG = NOTE.repeat(40)
/** Above the largest pid Linux gives, so nothing can run under it. */
const A_PID_NOTHING_RUNS_UNDER = 4_194_999

const asThePerson = (): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
})

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const add = t.client.sqlite.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     VALUES (?, 'default', 'owner', '2026-09-01 09:00:00', '2026-09-01 09:00:00', 'session', ?, NULL, ?, NULL, 'fixture')`,
  )
  add.run('fx-run-stamped', 'A run discovery stamped', JSON.stringify({
    state: 'finished',
    extra: { notes: LONG, discovered: { tool: 'claude-code', externalId: 'fx-noted-run', logPath: '/nowhere/fx-noted-run.jsonl' } },
  }))
  add.run('fx-run-running', 'A run filed by hand that says it is running', JSON.stringify({
    state: 'running',
    extra: { discovered: { pid: A_PID_NOTHING_RUNS_UNDER, pidStartedAt: '2026-09-01T09:00:00.000Z' }, notes: LONG },
  }))
  add.run('fx-run-only-notes', 'A run whose extra holds only notes', JSON.stringify({ state: 'idle', extra: { notes: LONG } }))
  add.run('fx-run-extra-a-word', 'A run whose extra is not an object', JSON.stringify({ state: 'idle', extra: 'a word' }))
  add.run('fx-run-discovered-false', 'A run whose discovered is false', JSON.stringify({ state: 'idle', extra: { discovered: false, notes: LONG } }))
})
afterAll(async () => {
  await app.close()
  t.close()
})

/** The list as the person asks it, with every text a statement on `records` handed back that holds the note. */
async function theListAndWhatHeldTheNote(): Promise<{ rows: Record<string, unknown>[]; heldTheNote: string[] }> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const original = sqlite.prepare
  const heldTheNote: string[] = []
  const look = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.includes(NOTE)) heldTheNote.push(value.slice(0, 120))
    } else if (Array.isArray(value)) value.forEach(look)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(look)
  }
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = original.call(this, text)
    if (/\bfrom\s+"?records"?/i.test(text)) {
      for (const method of ['all', 'get', 'iterate'] as const) {
        const read = statement[method] as (...args: unknown[]) => unknown
        statement[method] = function (this: unknown, ...args: unknown[]) {
          const out = read.apply(this, args)
          if (method === 'iterate') {
            const rows = [...(out as Iterable<unknown>)]
            look(rows)
            return rows[Symbol.iterator]()
          }
          look(out)
          return out
        }
      }
    }
    return statement
  }
  try {
    const reply = await app.inject({ method: 'GET', url: '/api/sessions', headers: asThePerson() })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
    return { rows: (JSON.parse(reply.body) as { sessions: Record<string, unknown>[] }).sessions, heldTheNote }
  } finally {
    sqlite.prepare = original
  }
}

describe('GET /api/sessions and the parts of a run’s extra', () => {
  it('lists the runs without handing back any part of extra beside discovered', async () => {
    const { rows, heldTheNote } = await theListAndWhatHeldTheNote()
    expect(rows.filter((row) => String(row['recordId']).startsWith('fx-run-')).length, 'the made-up runs listed').toBe(5)
    expect(heldTheNote, 'texts handed back that hold the note').toEqual([])
  })

  it('still builds a row from discovered: the stamp, and the process a running run recorded', async () => {
    const { rows } = await theListAndWhatHeldTheNote()
    const row = (id: string): Record<string, unknown> | undefined => rows.find((one) => one['recordId'] === id)
    expect(row('fx-run-stamped'), 'the stamped run').toMatchObject({ id: 'claude-code:fx-noted-run', logPath: '/nowhere/fx-noted-run.jsonl' })
    const its = row('fx-run-running')?.['itsProcess'] as { seen: string; says: string } | null | undefined
    expect(its?.says, 'what the office saw of the recorded process').toContain(String(A_PID_NOTHING_RUNS_UNDER))
  })
})

describe('a field kept with only some of its parts', () => {
  it('keeps the parts named, each as stored, and keeps a field that is not an object as stored', async () => {
    const { listRecordsWithDataAs, onlyTheseFieldsOf } = await import('../src/server/lib/records/reading.ts')
    const kept = listRecordsWithDataAs({ workspaceId: 'default', kind: 'session' }, onlyTheseFieldsOf(['state', 'extra'], [], { extra: ['discovered'] }))
    const data = (id: string): unknown => kept.find((record) => record.id === id)?.data
    expect(data('fx-run-stamped')).toEqual({
      state: 'finished',
      extra: { discovered: { tool: 'claude-code', externalId: 'fx-noted-run', logPath: '/nowhere/fx-noted-run.jsonl' } },
    })
    expect(data('fx-run-running')).toEqual({ state: 'running', extra: { discovered: { pid: A_PID_NOTHING_RUNS_UNDER, pidStartedAt: '2026-09-01T09:00:00.000Z' } } })
    expect(data('fx-run-only-notes'), 'an extra that holds none of the parts named').toEqual({ state: 'idle', extra: {} })
    expect(data('fx-run-extra-a-word'), 'an extra that is not an object').toEqual({ state: 'idle', extra: 'a word' })
    expect(data('fx-run-discovered-false'), 'a part that is false').toEqual({ state: 'idle', extra: { discovered: false } })
  })
})
