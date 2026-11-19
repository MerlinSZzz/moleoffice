// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT WHOSE BLOCKS SAY `kind` INSTEAD OF `type` IS ANSWERED WHOLE, IN ONE REPLY.
 *
 * Problem lbGlHcthzliO. The record envelope is keyed `kind`, so a writer slips and keys the blocks
 * `kind` too. On 25 September 2026, at commit 13713bbeb, that report took three replies to a 201:
 * the first said only that every block's `type` was missing, the second then named the table's
 * `columns` and `rows`, and the third stored it. The pointer to GET /api/kinds/report sat on the
 * last line of each refusal, after every error.
 *
 * WHAT "EVERY BLOCK ERROR" CAN HONESTLY MEAN HERE. Without `type` the validator cannot know a block
 * is a table unless it reads what the writer put in `kind`. The block says `kind: 'table'`, so the
 * table's own errors are knowable. The refusal may check the block as a table only if it says it
 * did, so this file also asks that the reply names the `kind` key it read (invariant 8). Nothing is
 * stored on that reading: the answer is still a 400.
 *
 * WHAT "THE FIRST ERROR" MEANS. The refusal is one `error` string: a heading line, one line per
 * error beginning `  - `. Before the fix a closing line held the pointer. The pointer counts as on
 * the first error when it appears before the second error line begins.
 *
 * Through the door only: a real socket and `fetch`, as the person, into a throwaway database.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let t: TestDb
let app: FastifyInstance
let base: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
}, 60_000)

async function fileReport(blocks: unknown[]): Promise<{ status: number; error: string }> {
  const res = await fetch(`${base}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report with a slip in its blocks',
      data: { for: THE_TEST_OFFICES_OWNER.id, date: '2026-09-25', blocks },
    }),
  })
  const body = (await res.json()) as { error?: unknown }
  return { status: res.status, error: typeof body.error === 'string' ? body.error : '' }
}

const SLIPPED = [
  { id: 'b1', kind: 'table', columns: ['a', 'b'], rows: [['1', '2']] },
  { id: 'b2', kind: 'text', text: 'x' },
]

/** Every fix the first reply is expected to name, made at once. */
const FIXED = [
  { id: 'b1', type: 'table', columns: [{ label: 'a' }, { label: 'b' }], rows: [{ cells: ['1', '2'] }] },
  { id: 'b2', type: 'text', text: 'x' },
]

describe('a report whose blocks are keyed kind instead of type', () => {
  it('is stored when the blocks are right (the control)', async () => {
    const res = await fileReport(FIXED)
    expect(res.status, res.error).toBe(201)
  }, 30_000)

  it('is refused once, with every error and the pointer on the first', async () => {
    const first = await fileReport(SLIPPED)
    expect(first.status).toBe(400)
    const lines = first.error.split('\n').filter((l) => l.startsWith('  - '))

    // The missing `type` on both blocks.
    expect(lines.some((l) => /blocks\[0\]/.test(l) && /\btype\b/.test(l)), first.error).toBe(true)
    expect(lines.some((l) => /blocks\[1\]/.test(l) && /\btype\b/.test(l)), first.error).toBe(true)

    // The table's own errors, in the same reply, and the `kind` key the reply read to know it is a table.
    expect(lines.some((l) => /columns/.test(l) && /label/.test(l)), first.error).toBe(true)
    expect(lines.some((l) => /rows/.test(l) && /cells/.test(l)), first.error).toBe(true)
    expect(lines.some((l) => /\bkind\b/.test(l)), first.error).toBe(true)

    // The pointer is on the first error: it appears before the second error line begins.
    const pointer = first.error.indexOf('/api/kinds/report')
    const secondError = first.error.indexOf('\n  - ', first.error.indexOf('\n  - ') + 1)
    expect(pointer, first.error).toBeGreaterThanOrEqual(0)
    expect(secondError, first.error).toBeGreaterThan(0)
    expect(pointer, first.error).toBeLessThan(secondError)
  }, 30_000)
})
