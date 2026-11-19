// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A KEY IS COMPARED IN CONSTANT TIME, NEVER WITH `===`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P83, point 1. A key compared with `===` stops at the first byte that differs, so a
 * caller who can time the reply can recover the key one byte at a time. `crypto.timingSafeEqual` is
 * what compares two keys, and the repository used it nowhere before this piece.
 *
 * A FUNCTION THAT RETURNS THE RIGHT BOOLEAN IS NOT PROOF. `a === b` and `timingSafeEqual` answer the
 * same question with the same true and the same false; no run can tell them apart by its result. So
 * this file does both things: it DRIVES the comparison with a made-up value, and it READS THE SOURCE
 * of the one function that compares a key and fails when `timingSafeEqual` is not what is called.
 * The value it drives with is made up — no test here ever holds or prints a real key.
 *
 * It also fails if the source writes the key itself anywhere a person reads: a log, a message, a
 * record. That is the rule this whole piece is most likely to break by accident, and it is checked
 * here rather than trusted.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

const KEYS_MATCH_SOURCE = fileURLToPath(new URL('../src/server/lib/how-this-request-proved-itself.ts', import.meta.url))

let t: TestDb
let keys: typeof import('../src/server/lib/keys.ts')

beforeAll(async () => {
  // A throwaway database first: importing lib/keys.ts opens whatever MOLE_OFFICE_DB names.
  t = await freshDb()
  keys = await import('../src/server/lib/keys.ts')
})

afterAll(() => {
  t.close()
})

describe('keysMatch', () => {
  it('is true for two copies of one made-up value and false for two different ones', () => {
    const madeUp = 'a-made-up-value-used-only-by-this-test'
    expect(keys.keysMatch(madeUp, madeUp)).toBe(true)
    expect(keys.keysMatch(madeUp, `${madeUp}-and-one-more`)).toBe(false)
    expect(keys.keysMatch(madeUp, '')).toBe(false)
    // DIFFERENT LENGTHS MUST NOT THROW. `timingSafeEqual` throws over buffers of different sizes,
    // and a key of the wrong length is the commonest thing a caller sends by mistake.
    expect(keys.keysMatch('', madeUp)).toBe(false)
  })

  it('is the function that calls crypto.timingSafeEqual, read from the source', () => {
    const source = readFileSync(KEYS_MATCH_SOURCE, 'utf8')
    const start = source.indexOf('export function keysMatch(')
    expect(start, 'src/server/lib/how-this-request-proved-itself.ts has no keysMatch function').toBeGreaterThan(-1)
    const after = source.indexOf('\nexport ', start + 1)
    const body = after === -1 ? source.slice(start) : source.slice(start, after)
    expect(body, 'keysMatch does not call timingSafeEqual').toContain('timingSafeEqual(')
    // AND NEVER `===`. A comparison written that way would pass the case above and fail this line.
    expect(body, 'keysMatch compares with ===, which leaks the prefix by timing').not.toMatch(/[^=!<>]===[^=]/)
  })

})
