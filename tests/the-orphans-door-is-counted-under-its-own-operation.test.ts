// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ORPHANS DOOR IS COUNTED UNDER ITS OWN OPERATION, `runtime.orphans`.
 *
 * Problem aHdrneS3NBGF. Criterion U7 and problem 1O_hor2KlyPY gave `GET /api/resources/orphans` a
 * name of its own so that a count per operation can tell the orphan read from the machine sweep it
 * runs beside. Nothing pinned it: the route could have been declared under `runtime.resources`
 * (or any other name) and every test would still have passed. This is the missing pin.
 *
 * WHAT IS READ HERE. The door is asked for real, against the product's own built server over a
 * throwaway database, and then the `api_calls` row the office wrote for that request is read back:
 * the operation the request was COUNTED UNDER, not the name written in the source. That is the
 * fact a usage reading is built from, so that is the fact pinned.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT PROVES THIS CASE CAN FAIL
 * ---------------------------------------------------------------------------------------
 *
 *   the route under another name   Change `route('runtime.orphans', 'remote')` in the
 *                                  `/resources/orphans` handler to `route('runtime.resources',
 *                                  'remote')`. The stored operation becomes `runtime.resources`
 *                                  and this goes red. Restored with `cp` and `cmp`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
})

describe('the orphans door is counted under its own operation', () => {
  it('records a request to the door in api_calls under runtime.orphans', async () => {
    const answer = await app.inject({ method: 'GET', url: '/api/resources/orphans' })
    expect(answer.statusCode).toBe(200)

    const row = t.client.sqlite
      .prepare(
        "SELECT operation, route FROM api_calls WHERE route = '/api/resources/orphans' ORDER BY at_ms DESC LIMIT 1",
      )
      .get() as { operation: string | null; route: string | null } | undefined

    // The row is the evidence. Without it the operation name could be anything and this test would
    // be checking nothing.
    expect(row, 'the door wrote no api_calls row at all, so the count is not evidence').toBeDefined()
    expect(row?.route).toBe('/api/resources/orphans')
    expect(row?.operation, 'the door was counted under another operation').toBe('runtime.orphans')
  })
})
