// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY DECLARED BUNDLE PART HAS A READER. NO SECOND LIST OF PART NAMES.
 *
 * Criterion B7 of design/bundle/ACCEPTANCE.md: "No second list of part names. The parts are read
 * from the declaration in src/shared/bundles.ts and the assembler's READERS map stays total
 * against it, which the type already enforces at continuation.ts:929. Nothing this cluster adds
 * restates a part name."
 *
 * design/bundle/ACCEPTANCE.md section 5 says plainly that this one is "standing: it is met by the
 * type that makes READERS total, and the work is not to break it" — `READERS` in
 * src/server/lib/continuation.ts is declared `as const satisfies Readonly<Record<ScopeName,
 * PartReader>>`, so `tsc` already refuses a build where a declared part has no reader. That is real
 * protection and it is not a vitest test: `npx tsc --noEmit` does not run as part of `npm test`, and
 * vitest transpiles without type-checking, so a `READERS` entry deleted by hand still runs under
 * `vitest run` even though `npm run build` would refuse it. This file is the runtime half: it walks
 * every name `src/shared/bundles.ts` declares and asks the real assembler for it, through the same
 * route a person's bundle goes through, so a part with no reader is caught here even on a change
 * that slips past the type (a loosened annotation, a cast, a rename that satisfies the type but not
 * the map).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. EVERY NAME IN `SCOPE_NAMES` answers, through `GET /api/bundles/preview`, with 200 and a member
 *      for that one part — not a crash, not a reply pretending nothing was asked.
 *   2. EVERY PART EITHER RAN A READER OR SAYS WHICH NOTHING IT WAS. `AssembledPart.answered` is
 *      "true when a reader ran, whatever it found"; `reader` is null when nothing was called, "and
 *      then `why` says which nothing it was", in the closed vocabulary of `WhyNothing`
 *      (continuation.ts:216). So a part that answered false with no `why` is a part that went
 *      silent, and that fails here. The five words are copied from the type on purpose: a new
 *      nothing-word in a reply fails this file until somebody adds it here, which is what a closed
 *      vocabulary is for.
 *   3. THE PART'S OWN NAME IS NOT INVENTED HERE: this file reads `SCOPE_NAMES` off the shared
 *      declaration rather than typing the list out, which is the criterion's own point — a test
 *      holding its own copy of the parts would be a second list of exactly the kind this criterion
 *      refuses.
 *
 * Proved by mutation with a control run of this file first: renaming one entry of `READERS` in
 * src/server/lib/continuation.ts (for example `objective:` to `xobjective:`) leaves `tsc` unrun
 * under vitest and turns this file's case red for exactly that one part — a 500 where every other
 * part still answers 200 — which is what a change that slipped past the type would look like.
 * Restored afterwards.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { SCOPE_NAMES } from '../src/shared/bundles.ts'

/** The closed vocabulary of `WhyNothing` (src/server/lib/continuation.ts). A new word fails here. */
const WHY_WORDS = ['nothing-computes-it', 'about-one-record', 'no-agent-named', 'none-in-scope']

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

// ONE OFFICE FOR THE FILE. Every case only reads one part through a GET, and changes nothing.
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})
afterAll(async () => {
  await app.close()
  t.close()
})

async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}

describe('every declared bundle part has a reader', () => {

  for (const name of SCOPE_NAMES) {
    it(`reads "${name}" without crashing, and either a reader ran for it or it says which nothing it was`, async () => {
      const preview = await get(`/api/bundles/preview?preset=custom&slots=${name}`)
      expect(preview.status, `part "${name}" has no reader: ${JSON.stringify(preview.body)}`).toBe(200)
      const parts = preview.body.parts as { name: string; answered: boolean; reader: string | null; why?: string }[]
      const mine = parts.find((one) => one.name === name)
      expect(mine, `the reply does not carry a part named "${name}" at all`).toBeDefined()
      if (mine?.answered === true) return
      // A READER DID NOT RUN. Then the part may not go silent: `reader` is null and `why` says which
      // nothing it was, in one of the four words the type closes. Anything else is a part that
      // answered nothing and did not say so.
      expect(mine?.reader, `part "${name}" answered nothing and named a reader for it`).toBeNull()
      expect(
        WHY_WORDS.includes(mine?.why ?? ''),
        `part "${name}" answered nothing and said no why from the closed vocabulary (got ${JSON.stringify(mine?.why)})`,
      ).toBe(true)
    })
  }
})
