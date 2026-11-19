// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROSE CAP DOES NOT MOVE, AND A FILE IS NOT PROSE. Criterion R3.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The 4,000-character cap in src/server/lib/summary.ts is right for prose and wrong for a file, and
 * a decision keeps it for prose. Both halves are proved:
 *
 *   1. A text block one character past the cap is refused; one exactly at the cap is accepted. The
 *      cap is a line and it has not moved.
 *   2. A file of 200,000 bytes is stored and carried by one file block, and contributes no prose at
 *      all — its content is bytes, and `proseOfBlocks` reads stored fields.
 *   3. A file's caption is prose: one character past the cap is refused, exactly as a text block is.
 */

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { proseOfBlocks } from '../src/shared/waitingclaims.ts'

/** How many characters of the sha256 token this product keeps, from the one declaration. */
const HASH_CHARS = 16

/** The cap, written here as the number the criterion names, so the test would notice it moving. */
const MAX_PROSE = 4000

/** The checkout, which is always a preview root, so a store call can succeed in this test. */
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

type StoreApi = typeof import('../src/server/lib/reportfiles.ts')
type SummaryApi = typeof import('../src/server/lib/summary.ts')

let t: TestDb
let store: StoreApi
let summary: SummaryApi
let previousRoots: string | undefined

/** The short sha256 token the product's own `hashOfBytes` produces, written out here to compare. */
function expectedHash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, HASH_CHARS)
}

/** The message a refused call threw, or a failure saying it did not throw at all. */
function refusalOf(run: () => unknown): string {
  try {
    run()
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
  throw new Error('expected the call to be refused, but it returned')
}

beforeAll(async () => {
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  t = await freshDb()
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${dirname(t.file)}`
  store = await import('../src/server/lib/reportfiles.ts')
  summary = await import('../src/server/lib/summary.ts')
}, 60_000)

afterAll(() => {
  t.close()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
})

describe('the prose cap is unchanged for prose and does not apply to a file', () => {
  it('still refuses a text block one character past the cap', () => {
    const message = refusalOf(() =>
      summary.validateSummaryBlocks([{ id: 'b', type: 'text', text: 'x'.repeat(MAX_PROSE + 1) }]),
    )
    expect(message).toContain(String(MAX_PROSE))
  })

  it('accepts one text block of exactly the cap, so the cap is a line and not a smaller one', () => {
    expect(() =>
      summary.validateSummaryBlocks([{ id: 'b', type: 'text', text: 'x'.repeat(MAX_PROSE) }]),
    ).not.toThrow()
  })

  it('stores and carries a file far larger than the prose cap, because a file is not prose', () => {
    const bytes = Buffer.alloc(200_000, 0x61)
    const stored = store.storeAReportFile(bytes, 'big.txt', 'default')
    const block = {
      id: 'b-big',
      type: 'file',
      path: stored.path,
      name: stored.name,
      size: stored.size,
      hash: stored.hash,
    }
    expect(stored.size).toBe(200_000)
    expect(summary.validateSummaryBlocks([block])).toEqual([block])
    // The file contributes no prose at all: its content is bytes, and proseOfBlocks reads fields.
    expect(proseOfBlocks(summary.validateSummaryBlocks([block]))).toBe('')
  })

  it('still refuses a file caption one character past the cap, because a caption is prose', () => {
    const message = refusalOf(() =>
      summary.validateSummaryBlocks([
        {
          id: 'b',
          type: 'file',
          path: '/tmp/x',
          name: 'x.txt',
          size: 1,
          hash: expectedHash(Buffer.from('x')),
          caption: 'x'.repeat(MAX_PROSE + 1),
        },
      ]),
    )
    expect(message).toContain(String(MAX_PROSE))
  })
})
