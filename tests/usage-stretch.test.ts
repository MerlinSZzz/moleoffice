// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STRETCH IS PANELX'S RULE, NOT AN AGENT'S DISCIPLINE.
 *
 * An agent that mints one trace id, recovers in six minutes and keeps the same header for four hours
 * would be drawn as a 242-minute recovery. The sparkline that is the whole of the longitudinal
 * measurement would then say recovery got forty times worse, and nothing anywhere would be wrong
 * except the number. So the segmentation is stated as a rule and tested as one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { CallRow } from '../src/server/lib/usage-reads.ts'
import { IDLE_GAP } from '../src/shared/ops.ts'

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
}, 60_000)

afterAll(() => {
  t.close()
})

const NOW = 1_800_000_000_000

/** One call row, with only the fields the segmentation reads. */
function call(overrides: Partial<CallRow>): CallRow {
  return {
    id: 'r',
    atMs: NOW,
    operation: 'record.read',
    effect: 'read',
    status: 200,
    ms: 3,
    bytes: 100,
    listLen: null,
    waits: 0,
    purpose: null,
    traceId: 'run-1',
    actorType: 'agent',
    actorId: 'claude-code',
    sessionId: 'sess-1',
    workspaceId: 'default',
    targetId: null,
    targetKind: null,
    clientOrigin: 'local',
    ...overrides,
  }
}

const stretches = async () => (await import('../src/server/lib/usage-reads.ts')).stretchesOf

describe('where one stretch ends and the next begins', () => {
  it('cuts a trace in two when the purpose changes, and says which rule ended the first', async () => {
    const cut = await stretches()
    const out = cut(
      [
        call({ atMs: NOW - 60_000, purpose: 'cold-recovery' }),
        call({ atMs: NOW - 50_000, purpose: 'cold-recovery' }),
        call({ atMs: NOW - 40_000, purpose: 'module-work' }),
      ],
      NOW,
    )
    expect(out.length).toBe(2)
    expect(out[0]!.purpose).toBe('cold-recovery')
    expect(out[0]!.endedBecause).toBe('purpose-changed')
    expect(out[1]!.purpose).toBe('module-work')
  })

  it('cuts a trace in two when nothing arrives for longer than the idle gap', async () => {
    const cut = await stretches()
    const out = cut(
      [
        call({ atMs: NOW - IDLE_GAP - 600_000, purpose: 'cold-recovery' }),
        call({ atMs: NOW - IDLE_GAP - 590_000, purpose: 'cold-recovery' }),
        call({ atMs: NOW - 400_000, purpose: 'cold-recovery' }),
      ],
      NOW,
    )
    // WITHOUT THIS CLAUSE the four-hour trace above reads as one recovery, and the whole
    // longitudinal series is a lie that nothing can detect from inside.
    expect(out.length).toBe(2)
    expect(out[0]!.endedBecause).toBe('went-quiet')
  })

  it('calls the last stretch still open while its last row is inside the idle gap', async () => {
    const cut = await stretches()
    const out = cut([call({ atMs: NOW - 30_000, purpose: 'cold-recovery' })], NOW)
    // A STILL-OPEN STRETCH IS EXCLUDED FROM EVERY AVERAGE. Averaging a number that is still growing
    // is the same defect as averaging a hand-measured baseline with an instrumented one.
    expect(out[0]!.endedBecause).toBe('still-open')
  })

  it('lets a row with no purpose join the stretch before it, because absence is not a third purpose', async () => {
    const cut = await stretches()
    const out = cut(
      [
        call({ atMs: NOW - 60_000, purpose: 'cold-recovery' }),
        call({ atMs: NOW - 55_000, purpose: null }),
        call({ atMs: NOW - 50_000, purpose: 'cold-recovery' }),
      ],
      NOW,
    )
    expect(out.length).toBe(1)
    expect(out[0]!.rows.length).toBe(3)
  })

  it('keeps two traces apart even when their calls interleave', async () => {
    const cut = await stretches()
    const out = cut(
      [
        call({ atMs: NOW - 60_000, traceId: 'a', purpose: 'cold-recovery' }),
        call({ atMs: NOW - 59_000, traceId: 'b', purpose: 'module-work' }),
        call({ atMs: NOW - 58_000, traceId: 'a', purpose: 'cold-recovery' }),
      ],
      NOW,
    )
    // TWO AGENTS WORKING AT THE SAME MOMENT ARE NOT ONE SEQUENCE, and a segmentation that walked
    // rows in time order without checking the trace would make them one.
    expect(out.map((s) => s.traceId).sort()).toEqual(['a', 'b'])
    expect(out.find((s) => s.traceId === 'a')!.rows.length).toBe(2)
  })

  it('leaves a row that named no piece of work out of every stretch', async () => {
    const cut = await stretches()
    // THE BROWSER SENDS NO TRACE HEADER AND NEVER WILL. Its polling is not a stretch of anybody's
    // work, and folding it into one would put a tab left open into a recovery time.
    expect(cut([call({ atMs: NOW, traceId: null })], NOW).length).toBe(0)
  })
})

describe('what a stretch costs, counted from its own rows', () => {
  it('counts the machines a stretch ran from rather than bucketing them into one word', async () => {
    const cut = await stretches()
    const rows = [
      ...Array.from({ length: 39 }, (_, i) => call({ atMs: NOW - 900_000 + i * 100, purpose: 'cold-recovery', clientOrigin: 'local' })),
      ...Array.from({ length: 2 }, (_, i) => call({ atMs: NOW - 890_000 + i * 100, purpose: 'cold-recovery', clientOrigin: 'remote' })),
    ]
    const stretch = cut(rows, NOW)[0]!
    // 39 AND 2 MUST NOT LOOK LIKE 20 AND 21. A single `mixed` bucket makes them the same value and
    // drops both out of any comparison between working here and working from the other machine.
    expect(stretch.rows.filter((r) => r.clientOrigin === 'local').length).toBe(39)
    expect(stretch.rows.filter((r) => r.clientOrigin === 'remote').length).toBe(2)
  })
})
