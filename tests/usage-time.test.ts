// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO TIME REPRESENTATIONS MEET IN EXACTLY ONE PLACE, AND IT IS NOT A HAND-WRITTEN CONVERSION.
 *
 * `api_calls.at_ms` is epoch milliseconds. `changes.at` is a local wall-clock string. Asking
 * whether a session wrote anything after a stretch crosses the two, and the bridge is
 * `parseLocalStamp` from `src/shared/time.ts` and nothing else.
 *
 * THE DEFECT THIS FILE EXISTS FOR IS ALREADY IN THIS REPOSITORY'S HISTORY. Somebody wrote the
 * conversion by hand as `` `${stamp.replace(' ','T')}Z` ``, which reads a local stamp as UTC. It
 * failed no test and no typecheck and was found by accident two months later, having made a
 * fifty-minute silence read as *just now*. On a machine an hour ahead of UTC the same mistake here
 * would count every change written in the hour BEFORE a stretch as inside it.
 *
 * AND THE THIRD VALUE IS AS IMPORTANT AS THE ARITHMETIC. A compliant agent that recovers, works and
 * writes three records without sending a session header must not be drawn as an agent that
 * recovered and did nothing. Absence of a header is not absence of work.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'

let t: TestDb
/** A session of this case's own, so a change another case wrote is not read as this one's. */
let SESSION: string
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  SESSION = `sess-case-${String(caseNumber)}`
})

const NOW = new Date(2026, 7, 27, 14, 3, 11).getTime()

/** A stretch with one row, at `NOW`, run by `sessionId`. */
function aStretch(sessionId: string | null) {
  return {
    traceId: 'run-1',
    seq: 0,
    purpose: 'cold-recovery',
    startedMs: NOW,
    endedMs: NOW,
    endedBecause: 'went-quiet' as const,
    rows: [
      {
        id: 'r1',
        atMs: NOW,
        operation: 'record.read',
        effect: 'read',
        status: 200,
        ms: 3,
        bytes: 100,
        listLen: null,
        waits: 0,
        purpose: 'cold-recovery',
        traceId: 'run-1',
        actorType: 'agent',
        actorId: 'claude-code',
        sessionId,
        workspaceId: 'default',
        targetId: null,
        targetKind: null,
        clientOrigin: 'local',
      },
    ],
  }
}

/** Write one change row at a given local moment, with a session id on it. */
function aChangeAt(when: number, sessionId: string) {
  t.client.sqlite
    .prepare(
      'INSERT INTO changes (id, record_id, workspace_id, at, actor_type, actor_id, session_id, op) ' +
        "VALUES (?, 'rec-1', 'default', ?, 'agent', 'claude-code', ?, 'update')",
    )
    .run(`ch-${String(when)}`, localStamp(new Date(when)), sessionId)
}

const thenWrote = async () => (await import('../src/server/lib/usage-reads.ts')).thenWroteFor

describe('whether a stretch’s session went on to write anything', () => {
  it('finds a change written a few minutes after the stretch', async () => {
    aChangeAt(NOW + 5 * 60_000, SESSION)
    const { db } = await import('../src/server/db/client.ts')
    expect((await thenWrote())(aStretch(SESSION), db)).toBe('wrote')
  })

  it('says it did not write when the session is known and no change is there', async () => {
    const { db } = await import('../src/server/db/client.ts')
    expect((await thenWrote())(aStretch(SESSION), db)).toBe('did-not-write')
  })

  it('says it cannot tell when no row of the stretch carried a session id', async () => {
    aChangeAt(NOW + 60_000, SESSION)
    const { db } = await import('../src/server/db/client.ts')
    // THREE VALUES, BECAUSE TWO WOULD LIE. `did-not-write` here would draw a header that was never
    // sent as work that was never done, on the page whose whole subject is honesty.
    expect((await thenWrote())(aStretch(null), db)).toBe('cannot-tell')
  })

  it('does not count a change written an hour before the stretch, which is what the hand-written bridge would do', async () => {
    // THE EXACT DEFECT. `${stamp.replace(' ','T')}Z` reads a local stamp as UTC, so on a machine an
    // hour ahead of UTC every change in the hour before a stretch lands inside it. This row is that
    // hour, and it must not count.
    aChangeAt(NOW - 60 * 60_000, SESSION)
    const { db } = await import('../src/server/db/client.ts')
    expect((await thenWrote())(aStretch(SESSION), db)).toBe('did-not-write')
  })

  it('does not count a change written long after the window closed', async () => {
    aChangeAt(NOW + 60 * 60_000, SESSION)
    const { db } = await import('../src/server/db/client.ts')
    expect((await thenWrote())(aStretch(SESSION), db)).toBe('did-not-write')
  })
})

describe('a held listen is a wait and not a cost', () => {
  it('leaves a long poll out of the latency figures, so a median stays about work', async () => {
    const { latencies, medianOf } = await import('../src/server/lib/usage-reads.ts')
    const rows = [
      { waits: 0, ms: 4 },
      { waits: 0, ms: 6 },
      { waits: 0, ms: 8 },
      // 144 ROWS AN HOUR PER LISTENER AT 25 SECONDS EACH would otherwise read as the slowest thing
      // in the product, and every median in the table would be a lie about what work costs.
      { waits: 1, ms: 25_000 },
      { waits: 1, ms: 25_000 },
      { waits: 1, ms: 25_000 },
    ] as never[]
    expect(latencies(rows)).toEqual([4, 6, 8])
    expect(medianOf(latencies(rows))).toBe(6)
    // AND THE OTHER DIRECTION: without the rule, the median is a wait.
    expect(medianOf(rows.map((r) => (r as unknown as { ms: number }).ms))).toBe(12_504)
  })
})
