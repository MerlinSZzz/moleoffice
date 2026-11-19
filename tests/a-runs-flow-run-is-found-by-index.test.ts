// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S FLOW RUN IS FOUND BY AN INDEX, SO THE LOOKUP DOES NOT COST MORE AS THE OFFICE FILES MORE RUNS. Wave 13p
 * round 25b, on check UD7dt6P3ISh6: `theFlowRunOf` read the data of every flow run in the office to find one, about
 * 18 ms at 20,000 runs, and the bootstrap read and every step append paid it.
 *
 * WHAT IS MEASURED, in a test world. Every record here is synthetic, written straight into a fresh test database:
 *
 *   · 20,000 runs, each with its flow run, the shape of an office that has filed 20,000 runs;
 *   · migration 0201 made `records_flow_run_run_idx`, partial to flow runs;
 *   · `theFlowRunOf` answers each run's own flow run, and 200 lookups of runs spread over the office take a median
 *     under 2 ms each. The scan took about 18 ms each on the checker's machine; the index takes well under 1 ms.
 *
 * The old wording of the lookup is run over the same office once, as a control, and its time is printed beside the
 * new one. It is not asserted: it only shows the office is big enough for a scan to cost something.
 *
 * MUTATIONS (wave 13p round 25b), each run once and put back:
 *   1. In `theFlowRunOf` (src/server/lib/flow-runs.ts), ask the kind as a value and read `$.run` with a bare
 *      json_extract, as before this round. SQLite cannot use the index for those words. The time case goes red.
 *   2. Take the CREATE INDEX out of drizzle/0201_a_runs_flow_run_is_found_by_index.sql. The index case and the time
 *      case go red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let theFlowRunOf: (runId: string) => { id: string; steps: unknown[] } | null

const RUNS = 20_000
const LOOKUPS = 200
const MEDIAN_LIMIT_MS = 2

const runId = (n: number): string => `run-${String(n).padStart(6, '0')}`
const flowRunId = (n: number): string => `flow-run-${String(n).padStart(6, '0')}`

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

beforeAll(async () => {
  t = await freshDb()
  theFlowRunOf = (await import('../src/server/lib/flow-runs.ts')).theFlowRunOf
  const db = t.client.sqlite
  const insert = db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) ' +
      "VALUES (?, 'default', 'jory', '2026-10-05 01:00:00', '2026-10-05 01:00:00', ?, ?, ?, 'authored')",
  )
  db.transaction(() => {
    for (let n = 0; n < RUNS; n++) {
      insert.run(runId(n), 'session', `A synthetic run ${String(n)}`, JSON.stringify({ state: 'finished', servingAgent: 'seeded-worker' }))
      insert.run(
        flowRunId(n),
        'flow_run',
        `A synthetic flow run ${String(n)}`,
        JSON.stringify({
          run: runId(n),
          noFlow: 'This run named no flow.',
          stepsTaken: [
            { does: 'The run started.', actor: { kind: 'agent', id: 'seeded-worker' }, startedAt: '2026-10-05 01:00:00', endedAt: '2026-10-05 01:00:00', how: 'by an agent', outcome: 'done', evidence: 'The office filed the run.' },
          ],
        }),
      )
    }
  })()
}, 120_000)

afterAll(() => {
  t?.close()
})

describe('the index', () => {
  it('migration 0201 made an index on the run a flow run names, holding only flow runs', () => {
    const row = t.client.sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'records_flow_run_run_idx'").get() as { sql: string } | undefined
    expect(row?.sql).toContain("$.run")
    expect(row?.sql).toContain("WHERE `kind` = 'flow_run'")
  })
})

describe('the lookup on an office of 20,000 runs', () => {
  it("answers each run's own flow run, with a median under 2 ms a lookup", () => {
    const old = t.client.sqlite.prepare(
      "SELECT id, workspace_id, data FROM records WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.run') = ? ORDER BY created_at, id LIMIT 1",
    )
    const scanned: number[] = []
    for (let i = 0; i < 5; i++) {
      const started = performance.now()
      old.get('flow_run', runId(RUNS - 1 - i))
      scanned.push(performance.now() - started)
    }

    const timed: number[] = []
    for (let i = 0; i < LOOKUPS; i++) {
      const n = Math.floor((i * RUNS) / LOOKUPS) + (i % 7)
      const started = performance.now()
      const found = theFlowRunOf(runId(n))
      timed.push(performance.now() - started)
      expect(found?.id).toBe(flowRunId(n))
      expect(found?.steps).toHaveLength(1)
    }
    const took = median(timed)
    console.log(`theFlowRunOf over ${String(RUNS)} runs: median ${took.toFixed(3)} ms over ${String(LOOKUPS)} lookups; the old scan, as a control: median ${median(scanned).toFixed(3)} ms over 5`)
    expect(took).toBeLessThan(MEDIAN_LIMIT_MS)
  })

  it('a run with no flow run is answered null, by the same index', () => {
    expect(theFlowRunOf('a-run-the-office-never-filed')).toBeNull()
  })
})
