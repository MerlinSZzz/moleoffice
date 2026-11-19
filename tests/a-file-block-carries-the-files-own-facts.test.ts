// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILE BLOCK CARRIES THE FILE'S OWN NAME, SIZE AND HASH. Criterion R3.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * On 8 September 2026 an agent archived five code files by cutting them into text blocks of 4,000
 * characters, because a text block is capped at MAX_PROSE. A `file` block is the answer: the file
 * itself, carried with its own facts. Three things are proved here:
 *
 *   1. The block round-trips through the block checker with its path, name, size and hash exactly as
 *      they went in.
 *   2. The size and the hash are the BYTES' OWN. The hash is the short sha256 `hashOfBytes` gives,
 *      and changing one byte changes it.
 *   3. Values that could not have come from the store — a hash of the wrong shape, a fractional or
 *      negative size — are refused, so a block cannot claim facts no store produced.
 *
 * THE STRUCTURAL HALF OF THE RECORD DOOR IS NOT DRIVEN HERE. It lives in src/shared/kinds.ts, which
 * another worker holds tonight, and a `file` block reaches it only once that file names the shape.
 * `validateSummaryBlocks` in src/server/lib/summary.ts is the authority on curated summary blocks
 * and is what the write gate calls for the block rules, so the block contract is proved against it.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

/** How many characters of the sha256 token this product keeps, from the one declaration. */
const HASH_CHARS = 16

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

/** One file block, built from what the store handed back. */
function blockFrom(stored: { path: string; name: string; size: number; hash: string }, id = 'b-file'): Record<string, unknown> {
  return { id, type: 'file', path: stored.path, name: stored.name, size: stored.size, hash: stored.hash }
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
  // The database is in a temporary directory of this test's own, so that directory has to be a
  // preview root or the store would rightly refuse to write.
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${dirname(t.file)}`
  store = await import('../src/server/lib/reportfiles.ts')
  summary = await import('../src/server/lib/summary.ts')
}, 60_000)

afterAll(() => {
  t.close()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
})

describe('a file block carries the file as a file', () => {
  it('round-trips through the block checker with its path, name, size and hash unchanged', () => {
    const bytes = Buffer.from('export const answer = 42\n', 'utf8')
    const stored = store.storeAReportFile(bytes, 'answer.ts', 'default')
    const block = blockFrom(stored)
    expect(summary.validateSummaryBlocks([block])).toEqual([block])
  })

  it('works out the size and the hash from the bytes and never from a name the caller gave', () => {
    const bytes = Buffer.from('the bytes on disk are the file', 'utf8')
    const stored = store.storeAReportFile(bytes, 'notes.txt', 'default')
    expect(stored.name).toBe('notes.txt')
    expect(stored.size).toBe(bytes.length)
    expect(stored.hash).toBe(expectedHash(bytes))
    // And the bytes really are at the path, whole: reading them back gives the same hash.
    expect(readFileSync(stored.path)).toEqual(bytes)
    expect(expectedHash(readFileSync(stored.path))).toBe(stored.hash)
  })

  it('proves the hash is the bytes\u2019 own by changing one byte', () => {
    const before = store.storeAReportFile(Buffer.from('abcdef', 'utf8'), 'a.txt', 'default')
    const after = store.storeAReportFile(Buffer.from('abcdeg', 'utf8'), 'b.txt', 'default')
    expect(before.hash).not.toBe(after.hash)
    expect(before.hash).toBe(expectedHash(Buffer.from('abcdef', 'utf8')))
    expect(after.hash).toBe(expectedHash(Buffer.from('abcdeg', 'utf8')))
    // The two stored paths differ too, so neither file replaced the other.
    expect(before.path).not.toBe(after.path)
  })

  it('refuses a block whose hash could not have come from the store', () => {
    const message = refusalOf(() =>
      summary.validateSummaryBlocks([
        { id: 'b', type: 'file', path: '/tmp/x', name: 'x.txt', size: 1, hash: 'NOT-A-HASH' },
      ]),
    )
    expect(message).toContain(String(HASH_CHARS))
    expect(message).toMatch(/hexadecimal/i)
  })

  it('refuses a fractional or negative size, because bytes are whole and none is negative', () => {
    for (const size of [-1, 1.5]) {
      const message = refusalOf(() =>
        summary.validateSummaryBlocks([
          { id: 'b', type: 'file', path: '/tmp/x', name: 'x.txt', size, hash: expectedHash(Buffer.from('x')) },
        ]),
      )
      expect(message).toMatch(/whole number of bytes|negative/)
    }
  })
})
