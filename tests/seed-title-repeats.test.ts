// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEED STOPS WHEN ONE OF ITS TITLES NAMES TWO RECORDS, AND SAYS WHAT TO DO ABOUT IT.
 *
 * `records_title_idx` was UNIQUE(workspace_id, title) until 17 August 2026, so `getRecordByTitle`
 * could not see two rows and `upsert` in scripts/seed.ts could rely on that without saying so. The
 * migration `0030_titles_may_repeat` ended it: an id is identity, a title is presentation, and two
 * records may share a name. `getRecordByTitle` now counts its matches and refuses rather than
 * handing back SQLite's first row.
 *
 * A seed spec is keyed by its title and carries no id, so the seed genuinely cannot tell which of
 * two records of one name it meant. STOPPING IS THE CORRECT ANSWER — writing fixture content over
 * whichever row came back first would be a silent overwrite reported as success — and this test is
 * here so that nobody reads the stop as a fault and "fixes" it by taking the first row.
 *
 * IT ALSO CHECKS THE SENTENCE. The refusal `getRecordByTitle` throws ends with "ask for the one you
 * mean by its id", which is advice for an API caller and useless to a person running
 * `npm run db:seed`, who has no way to hand the seed an id. `upsertContent` keeps that sentence
 * whole — it names both records — and adds what to do here.
 *
 * Importing scripts/seed.ts RUNS the seed, so freshDb() has to point the connection at a throwaway
 * database before that import happens. See tests/helpers.ts for why the imports are dynamic.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb

beforeEach(async () => {
  t = await freshDb()
})

afterEach(() => {
  t.close()
})

describe('a title the seed writes, held by two records', () => {
  it('stops the seed, names both records, and says what a person should do', async () => {
    // "Microfilm scanner station" is the first module scripts/seed.ts files, so the run reaches this on its first
    // upsert. Both rows are stamped `fixture` on purpose: the seed refuses to write beside records
    // it cannot account for as fixture, and this test is about the title lookup, not that gate.
    const first = t.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title: 'Microfilm scanner station',
      data: { context: 'One of two records of this name.', parts: [] },
      actor: HUMAN,
      origin: 'fixture',
    })
    const second = t.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title: 'Microfilm scanner station',
      data: { context: 'The other one.', parts: [] },
      actor: HUMAN,
      origin: 'fixture',
    })
    expect(second.id).not.toBe(first.id)

    let thrown: unknown = null
    try {
      await import('../scripts/seed.ts')
    } catch (err) {
      thrown = err
    }

    expect(thrown, 'the seed ran to the end against a title naming two records').toBeInstanceOf(Error)
    const said = thrown instanceof Error ? thrown.message : String(thrown)

    // It stopped, and it says so first.
    expect(said).toContain('The seed stopped')
    // Both records are named, because a person cannot act on "there are two of them".
    expect(said).toContain(first.id)
    expect(said).toContain(second.id)
    expect(said).toContain('Microfilm scanner station')
    // And the sentence a person here can act on, which the underlying refusal does not carry.
    expect(said).toContain('Rename or delete all but one of them')
  })
})
