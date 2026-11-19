// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARIES ARE READ WITHOUT READING EVERY AGENT, AND ARE THE SAME AGENTS IN THE SAME ORDER. Wave 13u round 42.
 *
 * `theSecretaries` (src/server/lib/secretariat.ts) read the id, role and retired mark of every agent and kept the live
 * ones whose role is the secretary card. On a made-up office of 972 agents that was 972 of the 1,237 rows one role
 * request read. It now asks the database for those rows only, with the card bound. A role is compared exactly, as before;
 * a retired mark of 1 is the only one that leaves an agent out, as before; and the order is by id, as before. Twelve
 * places in the server ask it, seven of them in timer steps. Each uses only the ids, their order or their count, so each
 * gets the same answer.
 *
 * Every id, handle and sentence written here is made up for this file's throwaway office.
 *
 * WHAT IS PROVED HERE.
 *
 *   1. THE SAME ANSWER. The office holds two live secretaries whose id order is the opposite of their handle order and
 *      of the order they were written in; a retired secretary; a secretary whose retired mark is 2, which no door writes
 *      and which the code before this round did not leave out; the card in upper case; the card with a space after it;
 *      an agent with no role; a worker; and 30 agents with no role or the worker's. The answer is the answer the code
 *      before this round gives, worked out here from every row, and its made-up secretaries are the three written out
 *      below, in that order.
 *   2. ONLY THE SECRETARIES' ROWS. The rows any statement gives back while it answers are as many as the secretaries,
 *      and one statement runs. It is checked after the answer, in the same case. The old way gave back every agent: 39
 *      rows for 3 secretaries here, and this file was red on that count alone before the change.
 *
 * WHAT TURNS EACH RED, each tried in wave 13u round 42, in src/server/lib/secretariat.ts:
 *   · case 1: leave out the retired test (the retired secretary is in); test `retired = 0` (the mark of 2 is out);
 *     compare the role without regard to case (the card in upper case is in); order by handle (the two live
 *     secretaries swap);
 *   · case 2: read every agent's id, role and retired mark again and keep the secretaries in the server.
 */
import { readFileSync } from 'node:fs'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const at = localStamp(new Date())

let t: TestDb
let app: FastifyInstance
let secretariat: typeof import('../src/server/lib/secretariat.ts')
let roles: typeof import('../src/server/lib/roles.ts')
/** True while a counted call runs. Meanwhile every statement run and every row given back is counted. */
let recording = false
let seen = { statements: 0, rows: 0 }

/** The made-up secretaries the answer holds, in the order it gives them. */
const THE_MADE_UP_SECRETARIES = ['made-up-secretary-a', 'made-up-secretary-b', 'made-up-secretary-retired-two']

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE COUNTER GOES IN BEFORE THE SERVER IS MADE, so no statement the server keeps is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get', 'iterate'] as const) {
      const run = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof run !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        const answer = run.apply(this, args)
        if (!recording) return answer
        seen = { statements: seen.statements + 1, rows: seen.rows + (method === 'all' ? (answer as unknown[]).length : method === 'get' ? (answer === undefined ? 0 : 1) : 0) }
        if (method === 'iterate') return counting(answer as Iterable<unknown>)
        return answer
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  secretariat = await import('../src/server/lib/secretariat.ts')
  roles = await import('../src/server/lib/roles.ts')
  expect(roles.theRoleCardsAreRead(), 'the role cards are read, so an agent can be a secretary').toBe(true)
  const card = theSecretaryCard()
  expect(card.toUpperCase(), 'the card in upper case is another word').not.toBe(card)

  // WRITTEN IN THE OPPOSITE ORDER TO THEIR IDS, and each handle sorts the other way.
  anAgent('made-up-secretary-b', 'made-up-a-handle', { role: card })
  anAgent('made-up-secretary-a', 'made-up-z-handle', { role: card })
  anAgent('made-up-secretary-retired', 'made-up-secretary-retired', { role: card, retired: 1 })
  anAgent('made-up-secretary-retired-two', 'made-up-secretary-retired-two', { role: card, retired: 2 })
  anAgent('made-up-upper-case', 'made-up-upper-case', { role: card.toUpperCase() })
  anAgent('made-up-space-after', 'made-up-space-after', { role: `${card} ` })
  anAgent('made-up-no-role', 'made-up-no-role', {})
  anAgent('made-up-worker', 'made-up-worker', { role: 'worker' })
  for (let i = 1; i <= 30; i += 1) {
    const id = `made-up-filler-${String(i).padStart(2, '0')}`
    anAgent(id, id, i % 2 === 0 ? { role: 'worker' } : {})
  }
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

function* counting(rows: Iterable<unknown>): Generator<unknown> {
  for (const row of rows) {
    seen = { ...seen, rows: seen.rows + 1 }
    yield row
  }
}

function theSecretaryCard(): string {
  return (JSON.parse(readFileSync(roles.theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }).elevation.onlyThisCardCanHoldIt
}

/** One registry row and its avatar, written at the table as tests/a-message-to-an-agent-is-stored-by-its-id.test.ts writes one. */
function anAgent(id: string, handle: string, more: { retired?: number; role?: string }): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated')",
    )
    .run(`avatar-default-agent-${id}`, at)
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at, started_by_kind, started_by_id, role) ' +
        "VALUES (?, ?, ?, ?, ?, ?, ?, 'person', ?, ?)",
    )
    .run(id, handle, handle, `avatar-default-agent-${id}`, more.retired ?? 0, more.retired === undefined ? null : at, at, THE_PERSON, more.role ?? null)
}

/** The answer the code before this round gave, worked out the way it worked it out: from every row, in the server. */
function theAnswerFromEveryRow(card: string): string[] {
  const rows = t.client.sqlite.prepare('SELECT id, role, retired FROM agents ORDER BY id').all() as { id: string; role: string | null; retired: number }[]
  return rows.filter((row) => row.retired !== 1 && row.role === card).map((row) => row.id)
}

describe('the secretaries are read without every agent', () => {
  it('1 and 2. gives the same secretaries in the same order, from their rows alone', () => {
    const card = theSecretaryCard()
    seen = { statements: 0, rows: 0 }
    recording = true
    let answer: ReturnType<typeof secretariat.theSecretaries>
    try {
      answer = secretariat.theSecretaries()
    } finally {
      recording = false
    }
    const agents = (t.client.sqlite.prepare('SELECT count(*) AS n FROM agents').get() as { n: number }).n
    expect(agents, 'the agents of the office').toBeGreaterThan(38)
    expect(answer.every((one) => one.kind === 'agent'), 'every secretary is an agent').toBe(true)
    expect(answer.map((one) => one.id)).toEqual(theAnswerFromEveryRow(card))
    expect(answer.map((one) => one.id).filter((id) => id.startsWith('made-up-'))).toEqual(THE_MADE_UP_SECRETARIES)
    // LAST, so a run that is red here has already given the same answer.
    expect(seen, 'the statements run and the rows they gave back').toEqual({ statements: 1, rows: answer.length })
  })
})
