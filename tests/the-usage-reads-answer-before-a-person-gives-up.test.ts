// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE USAGE READS ANSWER IN UNDER A SECOND ON A CORPUS THE SIZE OF THE OWNER'S.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * On 6 September 2026 `GET /api/usage/operations` answered after 161,919 ms and
 * `GET /api/usage/patterns` after 146,046 ms against the owner's live server. The database reads
 * are synchronous, so every other request waited behind them: writes timed out, `GET /api/health`
 * did not answer for forty seconds, and the durable agent's handle beat came back 409 twice.
 * Problem `seMxXokrlWrI`.
 *
 * Two things were wrong and both are fixed in `src/server/lib/usage-reads.ts`:
 *
 *   1. The aggregates walked every row once per operation name, and once more per write for the
 *      read-back rule. About 150 operations over 600,000 rows is tens of billions of comparisons.
 *   2. Every read fetched all eighteen columns of every row, whether it looked at them or not.
 *      The readings built on stretches now fetch only the rows that carry a trace, because
 *      `stretchesOf` drops the rest anyway.
 *
 * Even then, `GET /api/usage/operations` and `GET /api/usage/patterns` took 0.6 to 0.8 s warm,
 * because they fetched every row into JavaScript to group it, and this file went red whenever the
 * machine was busy (problem `Hy13YXeH7xHL`). Since 27 September 2026 SQLite does the grouping and
 * only one row per group comes back.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ROW COUNT IS THE LIVE ONE AND NOT A ROUND NUMBER
 * ---------------------------------------------------------------------------------------
 *
 * Because the fault only appears at that size. At a thousand rows the old code answered instantly,
 * which is why a suite of ten thousand tests never noticed. This file writes as many rows as the
 * owner's corpus held when the fault was found, so a change that makes the work quadratic again
 * fails here rather than on the owner's server.
 *
 * ---------------------------------------------------------------------------------------
 * A TIMING TEST IS ONLY HONEST IF IT SAYS WHAT IT MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Wall clock on a machine running eleven other test files is not a clean measurement, so the
 * failure message prints the milliseconds and the row count rather than only saying "too slow".
 * The budget is a second because that is the number the fault was judged against. On 27 September
 * 2026, on this file's rows with a load average of 7 to 13, operations answered in 520 to 700 ms and
 * patterns in 330 to 450 ms. Operations is the first request the app serves in this file, and a
 * first request costs about 150 ms more than a later one. A run that fails here has either regressed
 * or is being starved, and the printed number tells them apart.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'

/**
 * As many call rows as the owner's corpus held on 6 September 2026, when two reads over it blocked
 * the owner's server for five minutes. Counted from `GET /api/usage/summary` on that day.
 */
const AS_MANY_ROWS_AS_THE_LIVE_CORPUS = 703_341

/** How many of those carried a trace. The rest are the untraced bulk a stretch reading skips. */
const OF_THOSE_TRACED = 5_383

/** What a read may take before a person gives up on it. */
const A_SECOND = 1000

const WORKSPACE = 'default'

let t: TestDb
let app: FastifyInstance

/** The operations the rows are spread over, so the per-operation grouping has real work to do. */
const OPERATIONS = Array.from({ length: 150 }, (_, n) => `made.up.operation.${String(n)}`)

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()

  const insert = t.client.sqlite.prepare(
    'insert into api_calls (id, at_ms, operation, effect, route, method, waits, status, ms, bytes, list_len, ' +
      'workspace_id, workspace_stated, actor_type, actor_id, session_id, identity_source, trace_id, purpose, ' +
      'target_id, target_kind, client_addr, client_origin) values ' +
      '(?, ?, ?, ?, ?, ?, 0, ?, ?, ?, null, ?, 1, ?, ?, ?, ?, ?, ?, ?, null, null, ?)',
  )
  const now = Date.now()
  const many = t.client.sqlite.transaction(() => {
    for (let n = 0; n < AS_MANY_ROWS_AS_THE_LIVE_CORPUS; n += 1) {
      const operation = OPERATIONS[n % OPERATIONS.length]!
      // The traced rows are the first ones, so a stretch reading has whole runs to segment rather
      // than one row from each of six hundred thousand traces.
      const traced = n < OF_THOSE_TRACED
      insert.run(
        `call-${String(n)}`,
        now - (AS_MANY_ROWS_AS_THE_LIVE_CORPUS - n) * 100,
        operation,
        n % 7 === 0 ? 'write' : 'read',
        `/api/${operation}`,
        n % 7 === 0 ? 'POST' : 'GET',
        n % 23 === 0 ? 404 : 200,
        (n % 40) + 1,
        (n % 900) + 10,
        WORKSPACE,
        'agent',
        `agent-${String(n % 5)}`,
        `session-${String(n % 20)}`,
        'header',
        traced ? `trace-${String(Math.floor(n / 60))}` : null,
        traced ? 'cold-recovery' : null,
        n % 7 === 0 ? `record-${String(n % 500)}` : null,
        'local',
      )
    }
  })
  many()
}, 600_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** One read, with how long the server took to answer it. */
async function timed(path: string): Promise<{ ms: number; status: number }> {
  const started = Date.now()
  const reply = await app.inject({ method: 'GET', url: path, headers: { 'x-mole-office-workspace': WORKSPACE } })
  return { ms: Date.now() - started, status: reply.statusCode }
}

describe('the usage reads answer before a person gives up', () => {
  it('holds as many call rows as the corpus the fault was found on', () => {
    const counted = t.client.sqlite.prepare('select count(*) as n from api_calls').get() as { n: number }
    expect(counted.n, 'the rows this file is meant to measure against were not written').toBe(
      AS_MANY_ROWS_AS_THE_LIVE_CORPUS,
    )
  })

  for (const path of [
    '/api/usage/operations',
    '/api/usage/patterns',
    '/api/usage/sequences',
    '/api/usage/traces',
    '/api/usage/summary',
  ]) {
    it(`answers ${path} in under a second`, async () => {
      const { ms, status } = await timed(path)
      expect(status, `${path} did not answer at all`).toBe(200)
      expect(
        ms,
        `${path} took ${String(ms)} ms over ${String(AS_MANY_ROWS_AS_THE_LIVE_CORPUS)} call rows. It has to answer ` +
          'in under a second, because these reads run on the same thread as every other request and a slow one ' +
          'stops the whole server. Before this was fixed the same read took 162 seconds (problem seMxXokrlWrI). ' +
          'Look first for a walk of every row per operation, and for a read that fetches columns it never looks at.',
      ).toBeLessThan(A_SECOND)
    }, 120_000)
  }
})
