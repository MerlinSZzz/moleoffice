// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COPY UNDER BUDGET IS NOT A LIST OF BARE RECORD IDS, AND IT SAYS WHAT IT COULD NOT FIT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criteria B13, B14 and B15 of `design/bundle/ACCEPTANCE.md`, and problem `F2NxzxAnRkb2`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Measured on a copy of the live corpus on 6 September 2026, a *Recover this project* copy at four
 * budgets: 4,096 characters produced 21,702 characters, of which 10,776 — 49.7% — were record ids.
 * At 16,384 it was 41.3%, at 32,768 30.5%, at 65,536 19.4%. Nearly all of them were in four lines:
 * the lists of records a reader or the size had dropped, printed as `(id, id, id, …)` with no words
 * beside them. The smaller the copy asked for, the higher the proportion of ids — the prose shrank
 * and the list of dropped ids grew.
 *
 * Register section 7 names the same failure: `93 records finished (id1, id2,
 * id3...)`, given as the example of what a reference must never be.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. NO ID IS PRINTED WITH NOTHING BESIDE IT. Every id in the text is on a line that also carries
 *      words, whatever the size asked for.
 *   2. A DROPPED RECORD IS NAMED where there is room, by title and kind, with its id beside it.
 *   3. WHERE THERE IS NOT ROOM, ONE SENTENCE SAYS HOW MANY AND WHY, and does not fall back to ids.
 *   4. ONE ACCOUNT OF ONE CUT. What the reader subtracted and what the size subtracted are two
 *      sentences and each says which of the two it is.
 *   5. THE COPY SAYS WHEN IT DID NOT FIT, in its own text, with both numbers.
 *   6. AND SAYS NOTHING OF THE KIND WHEN IT DID.
 *
 * Proved by mutation with a control run of this file first, all against `src/server/lib/bundle.ts`
 * and `src/server/lib/continuation.ts`:
 *
 *   the ids appended to the reader's sentence again, as they were    2 of 6 red
 *   the over-budget notice deleted from the opening                  1 of 6 red
 *   the left-out list printing bare ids again                        2 of 6 red
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

/**
 * ONE OFFICE AND ONE CORPUS FOR THE FILE.
 *
 * The corpus is 120 problems, filed through the library rather than one HTTP request at a time, and
 * every case asks the same office for its copy. No case writes to the corpus, so nothing a case does
 * can change what another one reads.
 */
beforeAll(async () => {
  t = await freshDb()
  for (let n = 0; n < 120; n++) {
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'problem',
      title: `The tray edge is not segmented at angle ${String(n)}`,
      summary: `Measured on the bench: at ${String(n)} degrees the far edge of the tray falls out of the mask.`,
      data: {
        state: 'open',
        symptom: `The mask stops short of the tray edge at ${String(n)} degrees.`,
        why_it_hurts: 'A grasp planned on that mask reaches past the tray.',
      },
      actor: t.api.HUMAN,
    })
  }
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

/** Every twelve-character token in the text that is the id of a record this project holds. */
function idsIn(text: string, known: readonly string[]): string[] {
  return known.filter((id) => text.includes(id))
}

/** The line an id is printed on. */
function lineWith(text: string, id: string): string {
  return text.split('\n').find((one) => one.includes(id)) ?? ''
}

describe('a copy under budget is not a list of bare ids', () => {
  it('prints no id with nothing beside it, at any size', async () => {
    const ids = t.api.listRecords({ workspaceId: 'default', kind: 'problem' }).map((one) => one.id)
    for (const budgetBytes of [4096, 16384, 32768, 65536]) {
      const reply = await get(`/api/bundles/preview?preset=recover_project&budgetBytes=${String(budgetBytes)}`)
      expect(reply.status, JSON.stringify(reply.body)).toBe(200)
      const text = String(reply.body.text)
      for (const id of idsIn(text, ids)) {
        const line = lineWith(text, id)
        // THE WHOLE OF THE DEFECT IN ONE ASSERTION. A line that is an id and punctuation and
        // nothing else is a name for a thing the reader has nothing about.
        const words = line.replaceAll(id, '').replace(/[(),\s]/g, '')
        expect(words.length, `at ${String(budgetBytes)} bytes, ${id} is printed with nothing beside it: "${line}"`)
          .toBeGreaterThan(8)
      }
    }
  })

  it('names a dropped record by title and kind, with its id beside it', async () => {
    // WHICH SIZE DROPS SOMETHING AND STILL HAS ROOM FOR NAMES DEPENDS ON THE CORPUS, so this walks
    // the four the drafter measured and requires at least one of them to produce a name. Asserting
    // one chosen size would be asserting a fact about this fixture rather than about the rule.
    const named = /The tray edge is not segmented at angle \d+ \(problem, [A-Za-z0-9_-]{12}\)/
    const seen: string[] = []
    for (const budgetBytes of [4096, 16384, 32768, 65536]) {
      const reply = await get(`/api/bundles/preview?preset=recover_project&budgetBytes=${String(budgetBytes)}`)
      expect(reply.status, JSON.stringify(reply.body)).toBe(200)
      const text = String(reply.body.text)
      expect(text).toContain('WHAT IS NOT IN THIS TEXT')
      // The record kinds are drawn in the reader's own words, so a name carries what the thing IS.
      if (named.test(text)) seen.push(String(budgetBytes))
    }
    expect(seen.length, 'no size named a dropped record by title, kind and id').toBeGreaterThan(0)
  })

  it('says how many it could not name and why, without falling back to ids', async () => {
    const reply = await get('/api/bundles/preview?preset=recover_project&budgetBytes=4096')
    expect(reply.status).toBe(200)
    const text = String(reply.body.text)
    expect(text).toContain('not named here, because this list is given')
    expect(text).toContain('an id with nothing beside it is a name for a thing you have nothing about')
  })

  it('gives one account of each cut, and says which of the two made it', async () => {
    const reply = await get('/api/bundles/preview?preset=recover_project&budgetBytes=8192')
    expect(reply.status).toBe(200)
    const parts = reply.body.parts as { name: string; says: string }[]
    const problems = parts.find((one) => one.name === 'problems')
    expect(problems).toBeDefined()
    // THE SIZE'S OWN ACCOUNT NAMES THE SIZE. The reader's account is `leftOut` and is never
    // reworded by this cut; the two are never one sentence.
    expect(String(problems?.says)).toMatch(/bytes this part was given|drawn at .* here rather than/)
  })

  it('says in its own text that it did not fit, and by how much', async () => {
    const reply = await get('/api/bundles/preview?preset=recover_project&budgetBytes=4096')
    expect(reply.status).toBe(200)
    expect(reply.body.fits).toBe(false)
    const text = String(reply.body.text)
    // THE TEXT, NOT ONLY THE REPLY. The person pasting the text somewhere is not the person reading
    // the JSON, and `fits` used to be the only place this appeared.
    expect(text).toContain('THIS COPY IS LARGER THAN THE SIZE ASKED FOR')
    expect(text).toContain('4096 bytes were asked for')
  })

  it('says nothing of the kind when it did fit', async () => {
    const reply = await get('/api/bundles/preview?preset=recover_project&budgetBytes=65536')
    expect(reply.status).toBe(200)
    expect(reply.body.fits).toBe(true)
    expect(String(reply.body.text)).not.toContain('THIS COPY IS LARGER THAN THE SIZE ASKED FOR')
  })
})
