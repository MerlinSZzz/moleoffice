// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A MODULE'S CLAIMS LIVE, NOW THAT THERE IS ONLY ONE ANSWER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINNED BEFORE WINDOW B, AND WHAT IT PINS NOW
 * ---------------------------------------------------------------------------------------
 *
 * The implementation map is the place a record's code lives: one row per relationship, in
 * `implementation_map`, carrying the repository it is relative to and the actor who stated it.
 * `KIND_SPECS.module.fields.claims` was the older field that answered a narrower version of the same
 * question for one repository, and the owner's corpus held 152 strings in it.
 *
 * Until window B this file pinned "both, for now": that the field was still declared, still
 * optional, still accepted, and that a module with no `claims` key was NOT incomplete. Its own
 * closing section said what it deliberately did not pin and where that belonged:
 *
 *     "That `claims` is REFUSED, and that the refusal names the map. That is window B's commit,
 *      beside the migration."
 *
 * This is that commit, so this is that assertion. The property the old file pinned one wave early —
 * a module with no `claims` key is not incomplete — is still asserted here, because it is what makes
 * the deletion a deletion rather than 27 modules becoming incomplete on a Tuesday.
 *
 * ---------------------------------------------------------------------------------------
 * IT ASKS THE SERVER NOW, RATHER THAN READING THE DECLARATION
 * ---------------------------------------------------------------------------------------
 *
 * Every case below drives a real request. `POST /api/records` is the door an agent writes through,
 * and `GET /api/kinds/module` is the answer an agent reads before it writes. Reading `KIND_SPECS`
 * directly said nothing about either, and one of the two things this file exists to hold turned out
 * to be false while every case here was green:
 *
 *     The `paths` description told every agent reading `GET /api/kinds` that `claims` "still works".
 *
 * It had not worked since window B. The block that was meant to stop the neighbouring field sending
 * people to the retired answer asserted two phrases that were still there, rather than the sentence
 * that was wrong, so it passed. That sentence is fixed in `src/shared/kinds.ts`, and the case below
 * reads what the route serves.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE THING THAT MAKES THIS SAFE, AND IT IS NOT IN THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/lib/records.ts` validates the MERGED record, so a record still holding `data.claims`
 * after this declaration is gone cannot be merge-patched AT ALL — 400, unknown key, on every write
 * to it. That is why the migration that empties the key and the deletion of the declaration are one
 * commit. The proof that the key really is empty is not a fixture: it is
 * `design/round-ten/verification/` and a PATCH through the running API against a copy of the real
 * corpus.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { completenessOf } from '../src/shared/kinds.ts'

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
  'content-type': 'application/json',
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

/** A module's data with everything the kind wants, so that only `claims` is in question. */
function aModule(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    context: 'Resolve a stated pattern into the files it covers.',
    parts: [],
    ...extra,
  }
}

/** File a module through the door an agent writes through, and hand back the reply. */
function fileAModule(title: string, data: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HEADERS,
    payload: JSON.stringify({ kind: 'module', title, data }),
  })
}

/**
 * The refusal an author reads, out of the reply's JSON rather than off its wire bytes.
 *
 * Read from the parsed body because the wire form escapes every quotation mark, so a check for the
 * words DO NOT PUT IT IN "extra" against the raw bytes fails on a message that says exactly that.
 */
function refusalIn(res: { statusCode: number; body: string }): string {
  expect(res.statusCode, res.body).toBe(400)
  return String((JSON.parse(res.body) as { error?: unknown }).error ?? res.body)
}

/** What `GET /api/kinds/module` publishes about one field, as an agent reads it. */
async function publishedField(key: string): Promise<{ key: string; description: string } | undefined> {
  const res = await app.inject({ method: 'GET', url: '/api/kinds/module', headers: HEADERS })
  expect(res.statusCode, res.body).toBe(200)
  const fields = (JSON.parse(res.body) as { kind: { fields: { key: string; description: string }[] } }).kind.fields
  return fields.find((one) => one.key === key)
}

describe('the claims field is gone, and the refusal says where the answer lives', () => {
  it('is not published as a field of the module kind', async () => {
    expect(await publishedField('claims')).toBeUndefined()
    // AND A FIELD THAT SHOULD BE THERE IS, so this cannot pass by finding nothing.
    expect(await publishedField('paths')).toBeDefined()
  })

  it('a module carrying no claims at all is not reported incomplete for it', () => {
    // THE PROPERTY THE DELETION LEANS ON, asserted before the deletion and still asserted after it.
    const gaps = completenessOf('module', aModule())
    expect(gaps.map((g) => g.path)).not.toContain('data.claims')
  })

  it('is refused with a 400 rather than stored where nothing reads it', async () => {
    const res = await fileAModule('A module that claims a file', aModule({ claims: ['src/server/lib/sourceindex.ts'] }))
    // A 201 HERE IS THE WHOLE DEFECT: the responsibility stored as text, and coverage still saying
    // nobody has taken the file.
    expect(res.statusCode, res.body).toBe(400)
  })

  it('the refusal names the row, both routes, and what a field on one record cannot say', async () => {
    const said = refusalIn(
      await fileAModule('A module that claims a file', aModule({ claims: ['src/server/lib/sourceindex.ts'] })),
    )
    expect(said).toContain('POST /api/implementation')
    expect(said).toContain('GET /api/implementation/record/')
    expect(said).toContain('one file may serve several records')
  })

  it('says not to put it in extra, which is the 201 this refusal exists to stop', async () => {
    const said = refusalIn(await fileAModule('A module that claims a directory', aModule({ claims: ['src/server/lib'] })))
    // A CLAIM IN `extra` IS STORED, SHOWN, AND READ BY NOTHING: coverage would go on saying nobody
    // has taken responsibility for the file, and the author would have been answered 201.
    expect(said).toContain('DO NOT PUT IT IN "extra"')
  })

  it('and a module with no claims at all is filed, so the refusal is about the key', async () => {
    // THE CONTROL. Without it, a route that refused every module would pass all four cases above.
    const res = await fileAModule('A module claiming nothing', aModule())
    expect(res.statusCode, res.body).toBe(201)
  })
})

describe('the neighbouring field stops sending people to the retired answer', () => {
  it('sends a reader to the implementation map, by both of its routes', async () => {
    const paths = await publishedField('paths')
    expect(String(paths?.description)).toContain('POST /api/implementation')
    expect(String(paths?.description)).toContain('GET /api/implementation/record/')
  })

  it('still tells the two apart by which way each one points', async () => {
    const paths = await publishedField('paths')
    expect(String(paths?.description)).toContain('point OUT of Mole Office')
  })

  it('does not tell a reader that claims still works, because it does not', async () => {
    // THE SENTENCE THAT WAS WRONG, and the reason this file now reads the route. It said `claims`
    // "still works" for a whole window after `claims` had started answering 400. An agent following
    // that sentence would write a module holding `claims` and be refused by the very schema that
    // recommended it.
    const paths = await publishedField('paths')
    expect(String(paths?.description)).not.toMatch(/still works/i)

    // And the field it used to recommend really is refused, measured through the door.
    const res = await fileAModule('A module following the paths description', aModule({ claims: ['src/server/lib'] }))
    expect(res.statusCode, 'the published description and the write door disagree about `claims`').toBe(400)
  })
})
