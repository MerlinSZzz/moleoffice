// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION PLACEMENT RESOLVES ONLY THE SESSION VALUES OF THE CHANGE ROWS IT READS, AND NAMES EACH RUN AS THE RESOLVER DOES.
 * Wave 13y round 32, item 3.6.
 *
 * MEASURED FIRST: on 14 October 2026, on the office copy of 5 October, `readSessionEvidence` read every value of the
 * change log's session column, 5,410 of them over 190,237 rows, and resolved them all: 94 to 107 ms a read. It then
 * looks up only the values of the 100,000 rows it reads, which held 2,783. Resolving those alone took 65 to 82 ms less
 * in each of three rounds, and answered every one of them the same way.
 *
 * WHAT THIS HOLDS:
 *   - `readSessionEvidence` runs no statement that groups the change log;
 *   - each run that wrote is named by the session record its value means, as `resolveSessionRef` answers it, or by the
 *     value itself where that answers none: a session's id, the same id with space around it, a bound run name, a
 *     session's exact title, a session of another project, a note's id, a name nobody has, and an empty value.
 *
 * WHAT IT DOES NOT HOLD. Where a run is placed; the placement tests hold that.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb

const PERSON = { type: 'human' as const, id: THE_PERSON }

beforeAll(async () => {
  t = await freshDb()
}, 60000)

afterAll(() => {
  t.close()
})

/** The text of every statement `work` runs, by wrapping what the connection's `prepare` hands back. */
function theStatementsOf(work: () => void): string[] {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => Record<string, unknown> }
  const original = sqlite.prepare
  const ran: string[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = original.call(this, text)
    for (const method of ['all', 'get', 'run'] as const) {
      const call = statement[method] as (...args: unknown[]) => unknown
      statement[method] = function (this: unknown, ...args: unknown[]) {
        ran.push(text)
        return call.apply(this, args)
      }
    }
    return statement
  }
  try {
    work()
  } finally {
    sqlite.prepare = original
  }
  return ran
}

let made = 0

/** One change row in `workspaceId` whose session column holds `stored`, to `recordId`, a minute after the last one. */
function aRowWrittenBy(stored: string, recordId: string, workspaceId: string): string {
  made += 1
  const at = `2026-10-14 12:${String(made).padStart(2, '0')}:00`
  t.client.sqlite
    .prepare(
      `INSERT INTO changes (id, record_id, op, actor_type, actor_id, session_id, field, new_value, at, workspace_id)
       VALUES (?, ?, 'update', 'agent', 'test-agent', ?, 'title', '"x"', ?, ?)`,
    )
    .run(`chg-test-${String(made)}`, recordId, stored, at, workspaceId)
  return at
}

function aSession(title: string, workspaceId: string): string {
  return t.api.createRecord({ workspaceId, kind: 'session', title, origin: 'fixture', data: { state: 'running' }, actor: PERSON }).id
}

it('groups nothing in the change log', async () => {
  const { readSessionEvidence } = await import('../src/server/lib/sessions.ts')
  aRowWrittenBy(aSession('Test run one', 'default'), 'test-record-one', 'default')
  aRowWrittenBy('test-run-name', 'test-record-two', 'default')
  const ran = theStatementsOf(() => readSessionEvidence('default'))
  expect(ran.filter((text) => /from "changes"/.test(text)).length, 'the statements that read the change log').toBeGreaterThan(0)
  expect(ran.filter((text) => /from "changes"/.test(text) && /group by/i.test(text)), 'the statements that group it').toEqual([])
})

it('names each run that wrote by the session its value means, as the resolver answers it', async () => {
  const { readSessionEvidence } = await import('../src/server/lib/sessions.ts')
  const ws = 'test-session-values'
  const here = aSession('Test run of this project', ws)
  const named = aSession('Test named run', ws)
  t.api.bindSessionName(named, 'test-named-run', PERSON)
  const titled = aSession('Test run found by its title', ws)
  const elsewhere = aSession('Test run of another project', 'other-project')
  const note = t.api.createRecord({ workspaceId: ws, kind: 'note', title: 'Test note, not a run', data: { body: 'Test.' }, actor: PERSON }).id
  const values = [here, ` ${here} `, 'test-named-run', 'Test run found by its title', elsewhere, note, 'test-nobody-at-all', '']
  const written = values.map((value, i) => ({ value, recordId: `test-record-${String(i)}`, at: aRowWrittenBy(value, `test-record-${String(i)}`, ws) }))
  // So the comparison below is not of values that all answer none.
  expect(t.api.resolveSessionRef(` ${here} `, ws).recordId).toBe(here)
  expect(t.api.resolveSessionRef('test-named-run', ws).recordId).toBe(named)
  expect(t.api.resolveSessionRef('Test run found by its title', ws).recordId).toBe(titled)
  expect(t.api.resolveSessionRef(elsewhere, ws).recordId).toBeNull()

  const evidence = readSessionEvidence(ws)
  const wrote = new Map<string, string[]>()
  const lastWroteAt = new Map<string, string>()
  for (const { value, recordId, at } of [...written].reverse()) {
    const session = t.api.resolveSessionRef(value, ws).recordId ?? value
    if (!lastWroteAt.has(session)) lastWroteAt.set(session, at)
    wrote.set(session, [...(wrote.get(session) ?? []), recordId])
  }
  const sorted = <T>(map: ReadonlyMap<string, T>) => [...map].sort((a, b) => a[0].localeCompare(b[0]))
  expect(sorted(evidence.wrote), 'which run wrote which records').toEqual(sorted(wrote))
  expect(sorted(evidence.lastWroteAt), 'when each run wrote last').toEqual(sorted(lastWroteAt))
})
