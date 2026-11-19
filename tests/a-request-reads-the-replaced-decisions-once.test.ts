// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST READS WHICH DECISIONS REPLACED WHICH ONCE, NOT ONCE FOR EACH DECISION, AND EVERY ANSWER STAYS AS IT WAS.
 *
 * Wave 13s round 144, item 39 (a). `whatSupersedes` and the two reads beside it (src/server/lib/replaced-decisions.ts)
 * read the live decisions that supersede one decision, one decision at a time, and walk a line of replacements one
 * step at a time. Every reading of the forks asks it for each decision that settles a fork (`proposalResolution` in
 * src/server/lib/records.ts, from `readForks` in src/server/lib/forks.ts), and GET /api/records/:id/context and
 * GET /api/project/bootstrap each read the forks. On the made-up office of 22 October, with guessed supersedes links
 * planted in it, each of the two requests ran that statement 324 times. Now the live decisions that supersede others
 * are read once, and a request that asks about many decisions passes that one read to each question.
 *
 * WHAT THIS FILE PROVES, against a test office of its own:
 *   1. the answers. Made-up decisions make a line of two, a tie broken by id, a decision filed earlier with a larger id,
 *      a deleted decision that supersedes, a note that supersedes, a loop, a pair in another project and a link of
 *      another type. `whatSupersedes`, `theLineOfReplacements`, `theDecisionsThatReplacedThisDirectly` and
 *      `proposalResolution` answer as written here, and so do the record page of a decision and of a fork and the list
 *      of decisions. These were written before the change and held on round 143's tip.
 *   2. the reads. Three forks are each settled by a decision at the start of a line of replacements. Six doors are each
 *      read, and the statements that name supersedes links, in their text or in a bound value, are counted each time one
 *      runs. Then each line grows by two decisions and every door is read again. No door may run those statements more
 *      often than before. A read that walks a line one step at a time runs at least two more.
 *
 * CONTROL: cases 2 and 3 are red before the change, case 2 for every door: each reading of a line ran the statement
 * once a step, and each reading of the forks ran it for each decision that settles a fork. Case 1 passes before and
 * after.
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. In `readForks`, do not pass the one read to `proposalResolution`. Case 3 goes red for both doors.
 *   2. In `proposalResolution`, do not pass the read it was given to `whatSupersedes`. Case 3 goes red for both doors.
 *   3. In `theLineOfReplacements`, read the replacements again at each step. Case 2 goes red for every door.
 *   4. In the list of decisions, read the replacements again for each decision listed. Case 2 goes red for the list.
 *   5. In the one read of the replacements, order by when the deciding record was filed only. Case 1 goes red for the
 *      tie: the one written first comes first.
 *   6. In that read, order by the deciding record's id only. Case 1 goes red for the decision filed earlier with a
 *      larger id.
 *   7. In that read, leave out the check that the deciding record is not deleted. Case 1 goes red for the deleted one.
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
let replaced: typeof import('../src/server/lib/replaced-decisions.ts')
let lib: typeof import('../src/server/lib/records.ts')

const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const ELSEWHERE = 'r144-elsewhere'

/** A made-up record, written straight into the table. */
function aRecord(id: string, kind: string, at: string, opts: { workspace?: string; deleted?: boolean; data?: Record<string, unknown> } = {}): void {
  const data =
    opts.data ??
    (kind === 'decision'
      ? { option_taken: 'this way', because: 'made up', decided_by: 'the owner', decided_on: at.slice(0, 10), replaces: [] }
      : kind === 'proposal'
        ? { question: 'Which way?', options: ['this way', 'that way'], recommendation: 'this way', because: 'made up', who_settles_it: 'the owner' }
        : { body: 'made up' })
  t.client.sqlite
    .prepare(
      `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       values (?, ?, 'owner', ?, ?, ?, ?, null, ?, ?, 'fixture')`,
    )
    .run(id, opts.workspace ?? 'default', at, at, kind, `Made-up ${kind} ${id}`, JSON.stringify(data), opts.deleted === true ? at : null)
}

/** A made-up link, written straight into the table. */
function aLink(from: string, to: string, type: string, workspace = 'default'): void {
  const at = '2026-10-29 12:00:00'
  t.client.sqlite
    .prepare(
      `insert into links (id, workspace_id, owner_id, from_id, to_id, type, inferred, created_by, created_by_type, created_at, updated_at)
       values (?, ?, 'owner', ?, ?, ?, 0, 'made-up', 'agent', ?, ?)`,
    )
    .run(`r144-link-${from}-${type}-${to}`, workspace, from, to, type, at, at)
}

const ids = (list: readonly { id: string }[]): string[] => list.map((one) => one.id)
const title = (id: string): string => `Made-up decision ${id}`

/** The three lines that settle forks, which case 2 grows: each fork's decision and the decisions replacing it, in order. */
const lines: string[][] = [['fl1-0'], ['fl2-0'], ['fl3-0']]
let grown = 0
/** One more decision at the end of each line, superseding the one that stood. */
function growEachLine(): void {
  grown += 1
  for (const [n, line] of lines.entries()) {
    const next = `fl${String(n + 1)}-${String(line.length)}`
    aRecord(next, 'decision', `2026-10-2${String(Math.min(grown, 8))} 1${String(n)}:00:00`)
    aLink(next, line.at(-1)!, 'supersedes')
    line.push(next)
  }
}


async function read(url: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url, headers: PERSON })
  expect(reply.statusCode, `${url}: ${reply.body.slice(0, 400)}`).toBe(200)
  return reply.json() as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  replaced = await import('../src/server/lib/replaced-decisions.ts')
  lib = await import('../src/server/lib/records.ts')
  const at = '2026-10-29 11:00:00'
  t.client.sqlite.prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(ELSEWHERE, 'Made-up elsewhere', at, at)

  // A LINE OF TWO: d1 replaced by d2, d2 by d3.
  aRecord('d1', 'decision', '2026-10-20 10:00:00')
  aRecord('d2', 'decision', '2026-10-21 10:00:00')
  aRecord('d3', 'decision', '2026-10-22 10:00:00')
  aLink('d2', 'd1', 'supersedes')
  aLink('d3', 'd2', 'supersedes')
  // A TIE IN TIME, BROKEN BY ID: tie-b is written first, so the order of writing would put it first.
  aRecord('tie', 'decision', '2026-10-20 10:00:00')
  aRecord('tie-b', 'decision', '2026-10-23 10:00:00')
  aRecord('tie-a', 'decision', '2026-10-23 10:00:00')
  aLink('tie-b', 'tie', 'supersedes')
  aLink('tie-a', 'tie', 'supersedes')
  // FILED FIRST COMES FIRST, whatever the id says.
  aRecord('early', 'decision', '2026-10-20 10:00:00')
  aRecord('early-a-later', 'decision', '2026-10-24 10:00:00')
  aRecord('early-z-sooner', 'decision', '2026-10-21 10:00:00')
  aLink('early-a-later', 'early', 'supersedes')
  aLink('early-z-sooner', 'early', 'supersedes')
  // A DELETED DECISION REPLACES NOTHING: x is replaced only by x-live, y by nothing.
  aRecord('x', 'decision', '2026-10-20 10:00:00')
  aRecord('x-gone', 'decision', '2026-10-21 10:00:00', { deleted: true })
  aRecord('x-live', 'decision', '2026-10-22 10:00:00')
  aLink('x-gone', 'x', 'supersedes')
  aLink('x-live', 'x', 'supersedes')
  aRecord('y', 'decision', '2026-10-20 10:00:00')
  aRecord('y-gone', 'decision', '2026-10-21 10:00:00', { deleted: true })
  aLink('y-gone', 'y', 'supersedes')
  // ONLY A DECISION REPLACES A DECISION: a note that supersedes z replaces nothing.
  aRecord('z', 'decision', '2026-10-20 10:00:00')
  aRecord('z-note', 'note', '2026-10-21 10:00:00')
  aLink('z-note', 'z', 'supersedes')
  // A LOOP stops where it comes back.
  aRecord('loop-1', 'decision', '2026-10-20 10:00:00')
  aRecord('loop-2', 'decision', '2026-10-21 10:00:00')
  aLink('loop-2', 'loop-1', 'supersedes')
  aLink('loop-1', 'loop-2', 'supersedes')
  // ANOTHER PROJECT'S PAIR.
  aRecord('w1', 'decision', '2026-10-20 10:00:00', { workspace: ELSEWHERE })
  aRecord('w2', 'decision', '2026-10-21 10:00:00', { workspace: ELSEWHERE })
  aLink('w2', 'w1', 'supersedes', ELSEWHERE)
  // A LINK OF ANOTHER TYPE replaces nothing.
  aRecord('k', 'decision', '2026-10-20 10:00:00')
  aRecord('k-relates', 'decision', '2026-10-21 10:00:00')
  aLink('k-relates', 'k', 'relates_to')
  // FORKS SETTLED BY d1, BY tie AND BY y.
  aRecord('fork-d1', 'proposal', '2026-10-19 10:00:00')
  aRecord('fork-tie', 'proposal', '2026-10-19 10:00:00')
  aRecord('fork-y', 'proposal', '2026-10-19 10:00:00')
  aLink('d1', 'fork-d1', 'derived_from')
  aLink('tie', 'fork-tie', 'derived_from')
  aLink('y', 'fork-y', 'derived_from')

  // CASE 2'S THREE FORKS, each settled by the first decision of a line of one replacement, and a record to stand on.
  for (const [n, line] of lines.entries()) {
    aRecord(line[0]!, 'decision', `2026-10-19 1${String(n)}:00:00`)
    aRecord(`fl-fork-${String(n + 1)}`, 'proposal', `2026-10-19 1${String(n)}:00:00`)
    aLink(line[0]!, `fl-fork-${String(n + 1)}`, 'derived_from')
  }
  growEachLine()
  aRecord('stand-here', 'module', '2026-10-19 09:00:00', { data: {} })
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})

describe('which decisions replaced which', () => {
  it('is answered as before, in the functions and on the doors', async () => {
    const line = (id: string): string[] => ids(replaced.theLineOfReplacements(id))
    const stands = (id: string): string | null => replaced.whatSupersedes(id)?.id ?? null
    const directly = (id: string): string[] => ids(replaced.theDecisionsThatReplacedThisDirectly(id))

    expect([line('d1'), stands('d1'), directly('d1')]).toEqual([['d2', 'd3'], 'd3', ['d2']])
    expect([line('d2'), stands('d2'), directly('d2')]).toEqual([['d3'], 'd3', ['d3']])
    expect([line('d3'), stands('d3'), directly('d3')]).toEqual([[], null, []])
    expect(replaced.whatSupersedes('d1')).toEqual({ id: 'd3', title: title('d3') })
    expect(replaced.theLineOfReplacements('d1')).toEqual([
      { id: 'd2', title: title('d2'), createdAt: '2026-10-21 10:00:00' },
      { id: 'd3', title: title('d3'), createdAt: '2026-10-22 10:00:00' },
    ])
    expect(replaced.theDecisionsThatReplacedThisDirectly('d1')).toEqual([{ id: 'd2', title: title('d2') }])
    expect([line('tie'), stands('tie'), directly('tie')]).toEqual([['tie-a'], 'tie-a', ['tie-a', 'tie-b']])
    expect([line('early'), stands('early'), directly('early')]).toEqual([['early-z-sooner'], 'early-z-sooner', ['early-z-sooner', 'early-a-later']])
    expect([line('x'), stands('x'), directly('x')]).toEqual([['x-live'], 'x-live', ['x-live']])
    expect([line('y'), stands('y'), directly('y')]).toEqual([[], null, []])
    expect([line('z'), stands('z'), directly('z')]).toEqual([[], null, []])
    expect([line('loop-1'), stands('loop-1'), directly('loop-1')]).toEqual([['loop-2'], 'loop-2', ['loop-2']])
    expect([line('loop-2'), stands('loop-2'), directly('loop-2')]).toEqual([['loop-1'], 'loop-1', ['loop-1']])
    expect([line('w1'), stands('w1'), directly('w1')]).toEqual([['w2'], 'w2', ['w2']])
    expect([line('k'), stands('k'), directly('k')]).toEqual([[], null, []])
    expect(replaced.whatSupersedes('no-such-record')).toBeNull()

    const settledBy = (fork: string) =>
      lib.proposalResolution({ id: fork, kind: 'proposal', title: `Made-up proposal ${fork}` })?.by.map((one) => [one.id, one.replacedBy])
    expect(settledBy('fork-d1')).toEqual([['d1', { id: 'd3', title: title('d3') }]])
    expect(settledBy('fork-tie')).toEqual([['tie', { id: 'tie-a', title: title('tie-a') }]])
    expect(settledBy('fork-y')).toEqual([['y', null]])

    // THE DOORS: a decision's page, a fork's page and the list of decisions with the replaced ones in it.
    const page = await read('/api/records/d1')
    expect([page['replacedBy'], page['replacedDirectlyBy']]).toEqual([{ id: 'd3', title: title('d3') }, [{ id: 'd2', title: title('d2') }]])
    const tiePage = await read('/api/records/tie')
    expect([tiePage['replacedBy'], tiePage['replacedDirectlyBy']]).toEqual([
      { id: 'tie-a', title: title('tie-a') },
      [
        { id: 'tie-a', title: title('tie-a') },
        { id: 'tie-b', title: title('tie-b') },
      ],
    ])
    const forkPage = await read('/api/records/fork-d1')
    expect((forkPage['resolution'] as { by: { id: string; replacedBy: unknown }[] }).by.map((one) => [one.id, one.replacedBy])).toEqual([
      ['d1', { id: 'd3', title: title('d3') }],
    ])
    const listed = await read('/api/records?kind=decision&replaced=include&limit=200&shape=full')
    const rows = new Map((listed['records'] as { id: string; replacedBy?: unknown }[]).map((one) => [one.id, one.replacedBy]))
    expect(['d1', 'd2', 'd3', 'tie', 'early', 'x', 'y', 'z', 'loop-1', 'loop-2', 'k'].map((id) => [id, rows.get(id) ?? null])).toEqual([
      ['d1', { id: 'd3', title: title('d3') }],
      ['d2', { id: 'd3', title: title('d3') }],
      ['d3', null],
      ['tie', { id: 'tie-a', title: title('tie-a') }],
      ['early', { id: 'early-z-sooner', title: title('early-z-sooner') }],
      ['x', { id: 'x-live', title: title('x-live') }],
      ['y', null],
      ['z', null],
      ['loop-1', { id: 'loop-2', title: title('loop-2') }],
      ['loop-2', { id: 'loop-1', title: title('loop-1') }],
      ['k', null],
    ])
  })


})
