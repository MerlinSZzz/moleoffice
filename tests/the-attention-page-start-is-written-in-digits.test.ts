// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `from` ON GET /api/attention?shape=part IS READ ONLY WHEN IT IS WRITTEN IN DECIMAL DIGITS.
 *
 * Round 19c of wave 13w. The route read `from` with z.coerce.number, so an empty `from=` or a space was
 * read as 0 and `0x10` as 16: the reader got a page they had not asked for, and the route's description
 * said such a value was refused. The check refused round 19b for it (invariant 2).
 *
 * WHAT IS HELD, through the route itself rather than a copy of its schema: each bad form below is
 * refused with a 400 whose words say what is wrong with it, and the digit forms are answered.
 *
 * MUTATION, run and then restored on 9 October 2026: `from` in `attentionQuery` in
 * src/server/api/queries.ts put back to z.coerce.number().int().min(0): red, 10 of 11. The empty value
 * and a space were answered as page 0, ' 1' and '+1' as page 1, 0x10 as page 16 and 1e2 as page 100, all
 * with 200; -1, 1.5, abc and the too-large number were refused, but with words that did not say why.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let db: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})
afterAll(async () => {
  await app?.close()
  db?.close()
})

const page = (from: string) => app.inject({ method: 'GET', url: `/api/attention?shape=part&part=noState&from=${from}`, headers })

describe('GET /api/attention?shape=part reads from only as decimal digits', () => {
  const refused: [what: string, written: string, says: string][] = [
    ['an empty value', '', 'from is empty'],
    ['a space', '%20', 'from has a space in it'],
    ['a space before digits', '%201', 'from has a space in it'],
    ['hex', '0x10', 'is not written in decimal'],
    ['a minus sign', '-1', 'from has a sign'],
    ['a plus sign', '%2B1', 'from has a sign'],
    ['a fraction', '1.5', 'is not a whole number written in digits'],
    ['an exponent', '1e2', 'is not a whole number written in digits'],
    ['letters', 'abc', 'has a character that is not a digit'],
    ['too large to count exactly', '99999999999999999999', 'is too large to count exactly'],
  ]
  for (const [what, written, says] of refused) {
    it(`refuses ${what} with a 400 that says so`, async () => {
      const reply = await page(written)
      expect(reply.statusCode, reply.body).toBe(400)
      expect(reply.body).toContain(says)
    })
  }

  it('answers digits, a leading 0 included', async () => {
    for (const written of ['0', '7', '007']) {
      const reply = await page(written)
      expect(reply.statusCode, `from=${written}: ${reply.body}`).toBe(200)
      expect((reply.json() as { rows: unknown[] }).rows).toBeInstanceOf(Array)
    }
  })
})
