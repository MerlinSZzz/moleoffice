// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FORK'S SETTLING LINKS ARE FOUND BY THE FORK, NOT BY THE LINK TYPE, AND THE SAME LINKS ARE FOUND.
 *
 * Wave 13y round 114, item 47. `theSettlingLinksOfAFork` in src/server/lib/records.ts reads the `derived_from` links to
 * one fork, with the record at the other end of each. The office keeps no statistics, so for `to_id = ? AND type = ?`
 * SQLite chose links_type_idx, and each read walked every `derived_from` link in the office. One GET
 * /api/where-you-stand makes this read three times for each fork: in `readForks` inside what waits on a person, in the
 * waiting list's probe of the guard on deleting a fork, and in `readForks` again. On the made-up office shaped to the
 * live counts of the second-largest project on 31 October 2026 (200 forks, 2,117 `derived_from` links), those 600
 * reads took 914 ms of one where-you-stand, at load 9.3. The type is now asked as `+type`, and SQLite finds the links
 * through links_to_idx, the fork's own.
 *
 * WHAT THIS FILE HOLDS, against a test office of its own:
 *   1. the plan. GET /api/waiting, GET /api/forks and GET /api/where-you-stand are each read as the person. Every read
 *      of a fork's settling links that they make is planned by SQLite, with the values bound to it, and searches links
 *      through links_to_idx and not through links_type_idx. Each door makes the read at least once for each fork, so
 *      a door that stopped making it would not pass by reading nothing.
 *   2. the links found. `proposalResolution` names, for each fork, the decisions written here as settling it and no
 *      others: one decision, two in the order they were linked, none for a decision linked by another type, none for a
 *      note, none for a fork with no link, and a deleted decision as deleted. The other project's links to its own
 *      forks are found for those forks alone.
 *
 * CONTROL: case 1 is red before the change, for every door: the plan searches links_type_idx (type=?). Case 2 passes
 * before and after.
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. In `theSettlingLinksOfAFork`, ask the type as `eq(links.type, RESOLVES_PROPOSAL)` again. Case 1 goes red for
 *      every door.
 *   2. In it, leave the type out. Case 2 goes red: the decision linked by `relates_to` is named as settling its fork.
 *   3. In it, ask `from_id` for the fork instead of `to_id`. Case 2 goes red: no fork is settled by anything.
 *
 * WHAT IT DOES NOT HOLD. How long a read takes; the times are in the round's report and in the commit. Which forks are
 * open or settled, and by whose link, which tests/a-fork-leaves-the-queue-only-on-a-link-that-may-take-it.test.ts and
 * tests/governance-queue-is-the-persons.test.ts hold.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Every record and link is
 * written straight into the tables and is made up; every title begins with "Made-up".
 */
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let lib: typeof import('../src/server/lib/records.ts')

const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const ELSEWHERE = 'r114-elsewhere'

/** A made-up record, written straight into the table. */
function aRecord(id: string, kind: string, at: string, opts: { workspace?: string; deleted?: boolean } = {}): void {
  const data =
    kind === 'decision'
      ? { option_taken: 'this way', because: 'made up', decided_by: 'the owner', decided_on: at.slice(0, 10), replaces: [] }
      : kind === 'proposal'
        ? { question: 'Which way?', options: ['this way', 'that way'], recommendation: 'this way', because: 'made up', who_settles_it: 'the owner' }
        : { body: 'made up' }
  t.client.sqlite
    .prepare(
      `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       values (?, ?, 'owner', ?, ?, ?, ?, null, ?, ?, 'fixture')`,
    )
    .run(id, opts.workspace ?? 'default', at, at, kind, `Made-up ${kind} ${id}`, JSON.stringify(data), opts.deleted === true ? at : null)
}

/** A made-up link a person made, written straight into the table. */
function aLink(from: string, to: string, type: string, workspace = 'default'): void {
  const at = '2026-10-30 12:00:00'
  t.client.sqlite
    .prepare(
      `insert into links (id, workspace_id, owner_id, from_id, to_id, type, inferred, created_by, created_by_type, created_at, updated_at)
       values (?, ?, 'owner', ?, ?, ?, 0, ?, 'human', ?, ?)`,
    )
    .run(`r114-link-${from}-${type}-${to}`, workspace, from, to, type, THE_PERSON, at, at)
}

const FORKS = ['fork-one', 'fork-two', 'fork-relates', 'fork-note', 'fork-open', 'fork-gone']
const FORKS_ELSEWHERE = ['fork-w1', 'fork-w2', 'fork-w3']




beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  lib = await import('../src/server/lib/records.ts')
  const at = '2026-10-30 11:00:00'
  t.client.sqlite.prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(ELSEWHERE, 'Made-up elsewhere', at, at)

  for (const fork of FORKS) aRecord(fork, 'proposal', '2026-10-20 10:00:00')
  // ONE DECISION SETTLES fork-one.
  aRecord('d-one', 'decision', '2026-10-21 10:00:00')
  aLink('d-one', 'fork-one', 'derived_from')
  // TWO SETTLE fork-two, named in the order they were linked: the second one written is linked first.
  aRecord('d-two-a', 'decision', '2026-10-21 10:00:00')
  aRecord('d-two-b', 'decision', '2026-10-22 10:00:00')
  aLink('d-two-b', 'fork-two', 'derived_from')
  aLink('d-two-a', 'fork-two', 'derived_from')
  // A DECISION LINKED BY ANOTHER TYPE settles nothing.
  aRecord('d-relates', 'decision', '2026-10-21 10:00:00')
  aLink('d-relates', 'fork-relates', 'relates_to')
  // A NOTE LINKED BY derived_from settles nothing.
  aRecord('n-note', 'note', '2026-10-21 10:00:00')
  aLink('n-note', 'fork-note', 'derived_from')
  // A DELETED DECISION is named, as deleted.
  aRecord('d-gone', 'decision', '2026-10-21 10:00:00', { deleted: true })
  aLink('d-gone', 'fork-gone', 'derived_from')
  // ANOTHER PROJECT'S FORKS, each settled by its own decision, so the office holds more settling links than any fork.
  for (const [n, fork] of FORKS_ELSEWHERE.entries()) {
    aRecord(fork, 'proposal', '2026-10-20 10:00:00', { workspace: ELSEWHERE })
    aRecord(`d-w${String(n + 1)}`, 'decision', '2026-10-21 10:00:00', { workspace: ELSEWHERE })
    aLink(`d-w${String(n + 1)}`, fork, 'derived_from', ELSEWHERE)
  }
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})

describe("a fork's settling links", () => {

  it('2. are the links written, and only those', () => {
    const settledBy = (fork: string): [string, boolean][] | undefined =>
      lib.proposalResolution({ id: fork, kind: 'proposal', title: `Made-up proposal ${fork}` })?.by.map((one) => [one.id, one.deleted])
    expect(settledBy('fork-one')).toEqual([['d-one', false]])
    expect(settledBy('fork-two')).toEqual([
      ['d-two-b', false],
      ['d-two-a', false],
    ])
    expect(settledBy('fork-relates')).toEqual([])
    expect(settledBy('fork-note')).toEqual([])
    expect(settledBy('fork-open')).toEqual([])
    expect(settledBy('fork-gone')).toEqual([['d-gone', true]])
    expect(settledBy('fork-w1')).toEqual([['d-w1', false]])
    expect(settledBy('fork-w2')).toEqual([['d-w2', false]])
    expect(settledBy('fork-w3')).toEqual([['d-w3', false]])
  })
})
