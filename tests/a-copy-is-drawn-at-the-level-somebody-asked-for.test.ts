// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COPY IS DRAWN AT THE LEVEL SOMEBODY ASKED FOR, ON THE ONE LADDER, AND SAYS WHEN IT COULD NOT BE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criteria B9, B10, B11, B12 and B16 of `design/bundle/ACCEPTANCE.md`. They are one change, because
 * the control, the position each entry lands on and the entry's own lengths are one fact.
 *
 * A decision, and its correction:
 *
 *   1. A record with nothing under it is returned at level 2, at levels 2 and 3, or Full: it has
 *      neither middle position.
 *   2. A record made of records, a module or a pipeline, is returned at level 2, at levels 2 and 3,
 *      as its title with its children's levels 2 and 3, or Full: it has them.
 *   3. A level nobody wrote falls back to the shorter one that is written.
 *
 * And the correction: by length, the title with its children's levels 2 and 3 belongs at rung 5 or
 * 6, so rung 4 is the children's titles and rung 5 is each child's title and conclusion.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * There was no detail control at all. `src/web/components/BundlePanel.tsx` mentioned no level and no
 * size, and the assembler had a ladder of its own with two positions on it, `whole` and `short`,
 * beside the product's ladder of seven. Asking for less gave the same document with fewer members —
 * the owner's first named failure, *Brief = fewer fields*.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. FIVE POSITIONS, AND THEY ARE THE LADDER'S. A rung of the ladder a copy does not offer is
 *      refused by name rather than rounded to a neighbour.
 *   2. EACH ONE DRAWS SOMETHING DIFFERENT. Level 2 is a line; the conclusion adds the record's own
 *      summary; Level 4 adds the children's titles; Level 5 adds each child's conclusion.
 *   3. AN ATOMIC RECORD HAS NEITHER MIDDLE POSITION and falls back, whatever was asked for.
 *   4. THE COPY SAYS AT THE TOP HOW MANY FELL BACK, and a copy where none did says that instead.
 *   5. A SHORTER LEVEL CHANGES WHAT EACH RECORD SAYS, NOT HOW MANY ARE NAMED. Every record named at
 *      Full is named at Level 2, which is what makes it a detail axis rather than a shorter list.
 *   6. THE TWO-LENGTH VOCABULARY IS GONE: what a part drew is a rung of the one ladder.
 *
 * Proved by mutation with a control run of this file first, all against
 * `src/server/lib/continuation.ts`:
 *
 *   `drawnAt` returning the rung asked for whatever the entry has     1 of 6 red
 *   `fillTheLadder` never writing the children                        2 of 6 red
 *   `fitOnePart` drawing at Full whatever was asked for               2 of 6 red
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { BUNDLE_RUNGS } from '../src/shared/bundles.ts'
import { THOSE_RECORDS_HAVE_NOTHING_AT_THAT_LEVEL } from '../src/shared/a-copys-levels-in-words.ts'

/**
 * EACH CASE GETS ITS OWN PROJECT, so the `structure` copy and the lookups inside it hold only the
 * records that case filed.
 */
let WORKSPACE = 'default'
let caseNumber = 0
const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `rungs-case-${String(caseNumber)}`
  HEADERS['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: `Rungs case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}

async function aModule(title: string, summary: string): Promise<string> {
  const made = await post('/api/records', { kind: 'module', title, summary })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

/**
 * A MODULE MADE OF MODULES, and one that is not. The owner's own two cases.
 *
 * The children say they are `part_of` the whole, which is the direction that link is stored in.
 */
async function aProjectWithOneWholeAndOneAtomicModule(): Promise<{ whole: string; atomic: string }> {
  const whole = await aModule('The perception stack', 'Everything between the camera and a grasp pose.')
  const atomic = await aModule('The logging shim', 'Where every line of output goes.')
  const first = await aModule('Frame intake', 'Where frames enter, and at what rate.')
  const second = await aModule('Grasp proposals', 'Turning a segmented tray into poses to try.')
  for (const child of [first, second]) {
    const made = await post('/api/links', { fromId: child, toId: whole, type: 'part_of' })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
  }
  return { whole, atomic }
}

/**
 * ONE RECORD, DRAWN AT ONE LEVEL, AS TEXT.
 *
 * The `objective` part draws the record the copy is about and nothing else, so what changes between
 * two of these readings is the LEVEL and not which records were found.
 */
async function oneRecordAt(recordId: string, detail: string): Promise<{ text: string; body: any }> {
  const reply = await get(`/api/bundles/preview?scope=${recordId}&preset=custom&slots=objective&detail=${detail}`)
  expect(reply.status, JSON.stringify(reply.body)).toBe(200)
  return { text: String(reply.body.text), body: reply.body }
}

/** Every module and pipeline, at one level, as text. Used where the copy is about the project. */
async function theStructureAt(detail: string): Promise<{ text: string; body: any }> {
  const reply = await get(`/api/bundles/preview?preset=custom&slots=structure&detail=${detail}`)
  expect(reply.status, JSON.stringify(reply.body)).toBe(200)
  return { text: String(reply.body.text), body: reply.body }
}

describe('a copy is drawn at the level somebody asked for', () => {
  it('offers five positions of the one ladder, and refuses any other by name', async () => {
    await aProjectWithOneWholeAndOneAtomicModule()

    // THE FIVE. Nothing here lists them: they are read from the declaration, so a sixth added there
    // is asked for here without this file being edited.
    //
    // THE TOP MOVED FROM FULL TO LEVEL 6 ON 8 SEPTEMBER 2026, criterion B32. The record itself is no
    // longer a position a copy goes to, and the digest is: `tests/the-top-of-a-copy-is-the-highest-
    // rung-really-written.test.ts` is that criterion's own file and has the measurement.
    expect([...BUNDLE_RUNGS]).toEqual(['title', 'gist', 'outline', 'sketch', 'digest'])
    for (const rung of BUNDLE_RUNGS) {
      const reply = await get(`/api/bundles/preview?preset=custom&slots=structure&detail=${rung}`)
      expect(reply.status, `${rung} was refused: ${JSON.stringify(reply.body)}`).toBe(200)
    }

    // A REAL POSITION OF THE REAL LADDER THAT A COPY DOES NOT DRAW is refused by name, never
    // rounded to a neighbour. Rounding would answer a question nobody asked.
    for (const rung of ['label', 'full', 'brief']) {
      const reply = await get(`/api/bundles/preview?preset=custom&slots=structure&detail=${rung}`)
      expect(reply.status, `${rung} was accepted`).toBe(400)
      expect(String(reply.body.error)).toContain(rung)
    }
  })

  it('draws something different at each of the five', async () => {
    const { whole } = await aProjectWithOneWholeAndOneAtomicModule()

    const atTitle = (await oneRecordAt(whole, 'title')).text
    const atGist = (await oneRecordAt(whole, 'gist')).text
    const atOutline = (await oneRecordAt(whole, 'outline')).text
    const atSketch = (await oneRecordAt(whole, 'sketch')).text

    // LEVEL 2 IS A LINE. The record's own summary is not there.
    expect(atTitle).toContain('The perception stack')
    expect(atTitle, 'level 2 carried the record\'s summary').not.toContain(
      'Everything between the camera and a grasp pose.',
    )

    // THE CONCLUSION ADDS THE RECORD'S OWN SUMMARY, and still no child.
    expect(atGist).toContain('Everything between the camera and a grasp pose.')
    expect(atGist, 'the conclusion carried a child').not.toContain('Frame intake')

    // LEVEL 4 ADDS THE CHILDREN'S TITLES, and not their conclusions. The owner's correction of 6 September.
    expect(atOutline).toContain('Frame intake')
    expect(atOutline).toContain('Grasp proposals')
    expect(atOutline, 'level 4 carried a child\'s conclusion').not.toContain('Where frames enter, and at what rate.')
    // AND IT CARRIES THE CONCLUSION TOO, which is criterion B32 and is the opposite of what this
    // line asserted until 8 September 2026. Every rung says everything the rung below it says: a
    // level 4 that dropped the record's own summary was a longer position saying less, which is
    // what problem `AQZm6esnQqCr` measured from the other end.
    expect(atOutline).toContain('Everything between the camera and a grasp pose.')

    // LEVEL 5 ADDS EACH CHILD'S CONCLUSION.
    expect(atSketch).toContain('Frame intake')
    expect(atSketch).toContain('Where frames enter, and at what rate.')
    expect(atSketch).toContain('Turning a segmented tray into poses to try.')
  })

  it('gives an atomic record neither middle position, and says how many fell back', async () => {
    const { whole, atomic } = await aProjectWithOneWholeAndOneAtomicModule()

    // THE ONE WITH CHILDREN GOT WHAT WAS ASKED FOR.
    const made = await oneRecordAt(whole, 'sketch')
    expect(made.text).toContain('Where frames enter, and at what rate.')
    expect(made.body.drawnShorter.count).toBe(0)

    // THE ATOMIC ONE FELL BACK to the shorter position that IS written, which is its conclusion.
    // Its own summary is there and nothing was invented under it.
    const none = await oneRecordAt(atomic, 'sketch')
    expect(none.text).toContain('Where every line of output goes.')

    // AND THE COPY SAYS SO AT THE TOP, with the count and where it landed.
    expect(none.body.drawnShorter.count, 'the atomic module was not counted as drawn shorter').toBeGreaterThan(0)
    expect(none.body.drawnShorter.at.gist).toBeGreaterThan(0)
    // THE WORDS ARE THE ONES THE LINE STANDS OUT WITH SINCE CRITERION B25: it is ruled off and in
    // capitals, because the owner read a copy whose first lines said this and did not see them.
    expect(none.text).toContain('ENTRIES BELOW HAVE NOTHING WRITTEN AT LEVEL 5, THE LONGEST POSITION THERE IS')
    expect(none.text).toContain(THOSE_RECORDS_HAVE_NOTHING_AT_THAT_LEVEL)

    // BOTH MIDDLE POSITIONS, not just the one asked for above.
    const alsoNone = await oneRecordAt(atomic, 'outline')
    expect(alsoNone.body.drawnShorter.count).toBeGreaterThan(0)
  })

  it('says plainly when nothing fell back, which is a different sentence', async () => {
    await aProjectWithOneWholeAndOneAtomicModule()
    // AT LEVEL 2 EVERY RECORD HAS THE POSITION ASKED FOR, so nothing falls back. *Nothing fell back*
    // and *17 of 19 fell back* must never read the same, which is why both are asserted.
    const { text, body } = await theStructureAt('title')
    expect(body.drawnShorter.count).toBe(0)
    expect(text).toContain('so none of them fell back to a shorter position for want of any')
    expect(text).not.toContain('drawn SHORTER')
  })

  it('changes what each record says, not how many records are named', async () => {
    await aProjectWithOneWholeAndOneAtomicModule()
    // THE LONGEST POSITION A COPY HAS, read from the declaration. It was Full until criterion B32.
    const full = await theStructureAt(BUNDLE_RUNGS[BUNDLE_RUNGS.length - 1] as string)
    const short = await theStructureAt('title')

    // THE OWNER'S FIRST NAMED FAILURE WAS "Brief = fewer fields". Every record named at the longest position
    // is named at Level 2: the axis changes the depth, not the membership.
    const named = (body: any): string[] => (body.carried as { recordId: string }[]).map((one) => one.recordId).sort()
    expect(named(short.body)).toEqual(named(full.body))
    expect(named(full.body).length).toBeGreaterThan(1)

    // AND THE SHORTER ONE IS ACTUALLY SHORTER.
    expect(short.text.length).toBeLessThan(full.text.length)
  })

  it('reports what a part drew as a rung of the one ladder', async () => {
    await aProjectWithOneWholeAndOneAtomicModule()
    // `drew` WAS 'whole' | 'short' | 'none', WHICH WAS A SECOND DETAIL VOCABULARY beside the
    // product's seven positions. design/PROBLEM-CLUSTERS.md:106 forbids one by name. Criterion B16.
    const reply = await get('/api/bundles/preview?preset=custom&slots=structure&detail=gist')
    expect(reply.status).toBe(200)
    const text = String(reply.body.text)
    for (const word of ['whole', 'short']) {
      expect(text.includes(`drew: ${word}`), `the text still speaks of a length called ${word}`).toBe(false)
    }
    // The reply's own account of the level is the ladder's word, not one of those two.
    expect(reply.body.detail).toBe('gist')
    expect([...BUNDLE_RUNGS]).toContain(reply.body.detail)
  })
})
