// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FASTER BOOTSTRAP THAT HIDES CONTRADICTORY DURABLE TRUTH IS A REGRESSION.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TEST IS WRITTEN THE WAY IT IS, AND NOT THE OBVIOUS WAY
 * ---------------------------------------------------------------------------------------
 *
 * The obvious version compares the ids the bootstrap returns against
 * `GET /api/records?kind=problem&state=open`, and proves it by adding `.slice(0, 5)`. That version
 * would pass with the defect present, three ways, and all three were confirmed:
 *
 *   1. THE QUERY DOES NOT EXIST. The records list accepts `kind` and refuses `state` with
 *      *Unrecognized key: "state"*, so the comparison would be against an error page.
 *   2. BOTH SIDES WOULD APPLY THE SAME FILTER, so both would drop the stateless problems and agree
 *      with each other while dropping exactly the records the guarantee exists to protect.
 *   3. `.slice(0, 5)` IS A NO-OP unless the fixture holds more than five, so the mutation run comes
 *      back green and is recorded as a proved test.
 *
 * So: the comparison is against a direct `listRecords()` call in process, and the fixture holds
 * fourteen problems in five states.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS AN `accepted` AND A `worked_around` IN THE FIXTURE
 * ---------------------------------------------------------------------------------------
 *
 * THEY ARE WHAT TELLS THIS RULE FROM THE NARROWER ONE. The rule is *every problem whose state is not
 * `fixed`*. The narrower repair is *open, or with no state*. Against a fixture of seven open, two
 * stateless and three fixed, both rules return the same nine rows and both go green — while against
 * the owner's own corpus the narrow rule silently drops two accepted problems and one worked around.
 * One row of each and a third mutation are the whole difference.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance

/** SEVEN OPEN, TWO WITH NO STATE AT ALL, ONE ACCEPTED, ONE WORKED AROUND, THREE FIXED. */
const FIXTURE: readonly { title: string; state?: string }[] = [
  { title: 'Open one', state: 'open' },
  { title: 'Open two', state: 'open' },
  { title: 'Open three', state: 'open' },
  { title: 'Open four', state: 'open' },
  { title: 'Open five', state: 'open' },
  { title: 'Open six', state: 'open' },
  { title: 'Open seven', state: 'open' },
  { title: 'Nobody has said one' },
  { title: 'Nobody has said two' },
  { title: 'Accepted, and still true' },
  { title: 'Worked around, and still true', state: 'worked_around' },
  { title: 'Fixed one', state: 'fixed' },
  { title: 'Fixed two', state: 'fixed' },
  { title: 'Fixed three', state: 'fixed' },
]

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // The fixture is filed once, because every case reads the same set and none of them writes. A
  // fresh office held exactly these fourteen problems; so does this one.
  for (const entry of FIXTURE) {
    t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'problem',
      title: entry.title,
      data: entry.title === 'Accepted, and still true' ? { state: 'accepted' } : entry.state === undefined ? {} : { state: entry.state },
      actor: t.api.HUMAN,
    })
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** What the bootstrap says, through its own route. */
async function bootstrap() {
  const res = await app.inject({ method: 'GET', url: '/api/project/bootstrap', headers: PERSON })
  expect(res.statusCode).toBe(200)
  return res.json() as { open_problems: { id: string; title: string; state: string | null }[]; of_problems: number }
}

/** Every problem the corpus holds, read in process, filtered here and nowhere else. */
async function notFixedInTheCorpus(): Promise<Set<string>> {
  const { listRecords } = await import('../src/server/lib/records.ts')
  return new Set(
    listRecords({ workspaceId: WORKSPACE, kind: 'problem' })
      .filter((record) => (record.data as { state?: unknown }).state !== 'fixed')
      .map((record) => record.id),
  )
}

describe('every problem that is not fixed reaches the bootstrap', () => {
  it('returns exactly the ids the corpus holds as not fixed', async () => {
    const reply = await bootstrap()
    expect(new Set(reply.open_problems.map((p) => p.id))).toEqual(await notFixedInTheCorpus())
    // ELEVEN NOT FIXED OUT OF FOURTEEN. The number is stated so that a fixture that quietly shrank
    // could not make the comparison above trivially true.
    expect(reply.open_problems.length).toBe(11)
    expect(reply.of_problems).toBe(14)
  })

  it('carries a problem nobody has given a state as null, and never as open', async () => {
    const reply = await bootstrap()
    const stateless = reply.open_problems.filter((p) => p.title.startsWith('Nobody has said'))
    expect(stateless.length).toBe(2)
    for (const problem of stateless) {
      // A GUESSED STATE IS ABSENCE-BEATS-A-GUESS BROKEN WITH EXTRA STEPS. `open` here would be
      // Mole Office answering a question nobody asked it, on the read a cold agent trusts most.
      expect(problem.state, problem.title).toBeNull()
    }
  })

  it('keeps the accepted one and the worked-around one, which the narrower rule would drop', async () => {
    const titles = (await bootstrap()).open_problems.map((p) => p.title)
    expect(titles).toContain('Accepted, and still true')
    expect(titles).toContain('Worked around, and still true')
  })

  it('leaves the fixed ones out, so the rule is a rule and not "return everything"', async () => {
    const titles = (await bootstrap()).open_problems.map((p) => p.title)
    for (const fixed of ['Fixed one', 'Fixed two', 'Fixed three']) expect(titles).not.toContain(fixed)
  })
})

/**
 * WHAT THE REPLY SAYS ABOUT ITSELF IS `tests/bootstrap-shape.test.ts`.
 *
 * Two tests used to sit here. The first named the three absent slots by hand — `checkpoint`,
 * `placeholders`, `work_domains` — and asserted every reason was `reader-not-built`. A list of names
 * cannot catch the fault it was meant to catch: `chosen_by` announced twelve sections while the body
 * carried four, and five were named in neither, and this test went green through all of it because
 * it never looked at `chosen_by` at all. The replacement walks the real reply against the real
 * declaration and asks whether every announced section is delivered or named.
 */

/**
 * WHAT A CHECK SAID, STORED AT THE MOMENT IT SAID IT, IS `tests/usage-checks.test.ts`.
 *
 * Two tests used to sit here and both have moved, because one of them was not the test its own title
 * claimed. It read *stores `passed` as null when a check could not run, and never as 0* and it made
 * no check that could not run: it asserted that two checks which DID run stored 0 or 1. Making the
 * unrunnable check store 0 left it green, which the wave-13 verifier confirmed by doing it. The real
 * version drops the table one check reads, so the check really throws, and follows the null the whole
 * way into storage.
 */

