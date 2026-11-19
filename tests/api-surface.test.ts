// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The HTTP surface as a caller meets it: what GET /api says, and whether the server does that.
 *
 * Every test here comes from one probe finding, and each finding was the same shape — the
 * endpoint behaved sensibly and the sentence describing it did not, so the documented path was
 * the wrong one to take:
 *
 *   "GET /api says PATCH takes {title?,summary?,data?} and that `data` is replaced whole. The
 *    string 'dataPatch' appears nowhere in the endpoint list. The discoverable path is the
 *    destructive one."
 *
 *   "A blank string is a 400 inside `data`, with a good explanation. On the envelope summary —
 *    the field most likely to arrive padded — it is stored verbatim."
 *
 *   "A record has an envelope `summary`. A module also declares `data.summary`. Both store, side
 *    by side, and nothing says which one a page reads."
 *
 * So these tests do not check that GET /api answers 200. They read the served sentence, then
 * CARRY IT OUT against the real routes: a body the index describes must work, and a body it
 * warns about must fail in the way it warned. A description that drifts from the endpoint fails
 * here rather than in an agent's write six weeks later.
 *
 * HOW THE APP IS BUILT. This file used to register the plugins its author knew about and call it
 * "the same ones, in the same order" — a comment that was false within one commit, and the reason
 * the last test in this file could assert that every endpoint is described while eight of them were
 * not. It now calls `buildApp()` from src/server/index.ts through `apiApp` in tests/helpers.ts, so
 * the app under test is the product's own surface and not a second opinion about it.
 *
 * WHICH ROUTE GROUPS THAT SURFACE HAS IS NOT THIS FILE'S QUESTION. It belongs to
 * tests/server-wiring.test.ts, which compares what `buildApp()` registered against every route
 * group on disk and fails naming the group. This file used to keep four group names of its own as
 * a canary, which is the same mistake one size smaller — a list of four could never notice a fifth
 * group going missing, and it had to be edited by hand when the layout group was deleted.
 *
 * A FOURTH PROBE FINDING used to sit between the first and the second above, about the layout
 * endpoint's envelope. That whole route group has been deleted; the note where its tests were says
 * so, so that nobody hunts for it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ApiIndex, ApiRoute } from '../src/server/api/kinds.ts'
import { validateData } from '../src/shared/kinds.ts'

// -------------------------------------------------------------------------------- the harness

let db: TestDb
let app: FastifyInstance
let listRoutes: () => readonly ApiRoute[]

beforeAll(async () => {
  db = await freshDb()
  // Error handling is installed inside the builder. Without it a PanelError is a 500 with no
  // message, and every assertion below about what a caller is told would be testing Fastify's
  // default rather than Mole Office's answer.
  const built = await apiApp()
  app = built.app
  listRoutes = built.listApiRoutes
  await app.ready()
})

afterAll(async () => {
  await app.close()
  db.close()
})

/** What an agent's requests carry, so a write is attributed to one. */
const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-api-surface',
}

/** The JSON body of a response, as an object, or a failure showing what actually came back. */
function bodyOf(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 200)}`)
  }
  return parsed as Record<string, unknown>
}

/** The `error` string of a failed response, checked to be one. */
function errorOf(res: { body: string; statusCode: number }): string {
  const message = bodyOf(res)['error']
  if (typeof message !== 'string') {
    throw new Error(`expected an error string, got ${res.body.slice(0, 200)}`)
  }
  return message
}

/** The record inside a write response. */
function recordOf(res: { body: string }): Record<string, unknown> {
  const record = bodyOf(res)['record']
  if (typeof record !== 'object' || record === null) throw new Error(`no record in ${res.body.slice(0, 200)}`)
  return record as Record<string, unknown>
}

/** The `data` of a record in a response. */
function dataOf(res: { body: string }): Record<string, unknown> {
  const data = recordOf(res)['data']
  if (typeof data !== 'object' || data === null) throw new Error(`no data in ${res.body.slice(0, 200)}`)
  return data as Record<string, unknown>
}

/** GET /api, parsed from the served bytes rather than read off the handler's object. */
async function index(): Promise<ApiIndex> {
  const res = await app.inject({ method: 'GET', url: '/api' })
  expect(res.statusCode).toBe(200)
  return bodyOf(res) as unknown as ApiIndex
}

/**
 * The sentence GET /api serves for one endpoint.
 *
 * Fails loudly rather than returning undefined: a missing line is the bug this file is about,
 * and `expect(undefined).toContain(...)` would report it as a type error rather than as "nobody
 * has said what this endpoint does".
 */
async function noteFor(method: string, path: string): Promise<string> {
  const listed = (await index()).endpoints.find((e) => e.method === method && e.path === path)
  if (!listed) throw new Error(`GET /api does not list ${method} ${path} at all`)
  if (listed.description === null) throw new Error(`GET /api lists ${method} ${path} with no description`)
  return listed.description
}

let seq = 0
/**
 * A title nothing else in this file uses.
 *
 * NOT BECAUSE THE DATABASE REQUIRES IT — titles may repeat since 17 August 2026. Because every test
 * here writes records into one database, and a test that found its record by name would match
 * another test's the day two of them chose the same words.
 */
const uniqueTitle = (what: string) => `api-surface ${what} ${++seq}`

/** A module with every field filled in, so that anything missing afterwards was lost by a write. */
function wholeModule(): Record<string, unknown> {
  return {
    context: 'ZED mini on the right wrist; the mount is the thing under test.',
    summary: 'Mount is printed and calibrated. The bracket may still clip the gripper at full close.',
    parts: [],
    paths: [],
  }
}

/** File a module and hand back its id. */
async function newModule(data: Record<string, unknown> = wholeModule(), summary?: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_AGENT,
    payload: {
      kind: 'module',
      title: uniqueTitle('module'),
      ...(summary === undefined ? {} : { summary }),
      data,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const id = recordOf(res)['id']
  if (typeof id !== 'string') throw new Error(`no id in ${res.body.slice(0, 200)}`)
  return id
}

// ============================================================ 1. the merge patch is discoverable

describe('GET /api describes both PATCH bodies, not only the destructive one', () => {
  it('names dataPatch at all — it used to appear nowhere in the endpoint list', async () => {
    const note = await noteFor('PATCH', '/api/records/:id')
    expect(note).toContain('dataPatch')
  })

  it('says what each body does, which to prefer, and that null deletes a key', async () => {
    const note = await noteFor('PATCH', '/api/records/:id')
    // Merge and replace both named, in the words that distinguish them.
    expect(note.toLowerCase()).toContain('merge')
    expect(note.toLowerCase()).toContain('replace')
    // The preference, so a caller reading in a hurry does not have to infer it.
    expect(note).toMatch(/prefer\s+dataPatch/i)
    // The null rule is the part nobody can guess, and the reason a delete is invisible otherwise.
    expect(note).toMatch(/null\s+DELETES/i)
    // AND THAT THE DESTRUCTIVE BODY IS REFUSED WHEN IT WOULD EMPTY SOMETHING, with the key that
    // says you mean it. A caller reading this list is the caller the refusal is written for, so a
    // list that still described the old 200 would send it somewhere the route no longer goes.
    expect(note).toMatch(/refused/i)
    expect(note).toContain('"replace":true')
    // AND THAT BOTH BODIES REPORT WHAT THEY DID: `emptied` on a replace, the merge report on a
    // merge. A caller told only about the refusal would not know the reply names its losses.
    //
    // THE KEY, IN THE BACKTICKS THE DESCRIPTION QUOTES FIELD NAMES IN. A bare `toContain('emptied')`
    // passed with the reply key taken out of the sentence altogether, because the word is also in
    // "every field you do not resend would be emptied" a few lines above it.
    expect(note).toContain('`emptied`')
  })

  /**
   * THIS TEST USED TO ASSERT THE OPPOSITE, AND THE DOCUMENT IT PINS SAID THE OPPOSITE TOO.
   *
   * It was called "is honest that whole-replace empties what you leave out — the documented trap is
   * real", and it sent this same body and expected a 200 with the summary gone. Both the sentence
   * in the endpoint list and this test were true and were describing a door two builders walked
   * into on 4 September 2026, twenty minutes apart, losing seven fields and then two more off one
   * problem record. The trap is shut: the write is refused, and the document says so. What has not
   * changed is what this test is for — the endpoint list and the route agreeing about what `data`
   * does — so it now drives the sentence that is there.
   */
  it('is honest that whole-replace is refused when it would empty what you leave out', async () => {
    const id = await newModule()
    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { data: { context: 'ZED mini on the right wrist; the mount is the thing under test.' } },
    })
    // 400, not a 200: the write is refused and the record keeps its summary.
    expect(refused.statusCode, refused.body).toBe(400)
    expect(errorOf(refused)).toContain('summary')

    // AND THE WAY OUT THE DOCUMENT NAMES REALLY WORKS, carried out rather than read. `replace: true`
    // lets the same write through, and then the summary really is gone — the old behaviour, now
    // reached only by asking for it.
    const meant = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: {
        data: { context: 'ZED mini on the right wrist; the mount is the thing under test.' },
        replace: true,
      },
    })
    expect(meant.statusCode, meant.body).toBe(200)
    expect(dataOf(meant)['summary']).toBeUndefined()
  })

  it('does what the preferred body promises: the keys you do not name are left alone', async () => {
    const id = await newModule()
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { context: 'ZED mini, right wrist. Clearance check still open.' } },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(dataOf(res)['context']).toBe('ZED mini, right wrist. Clearance check still open.')
    // The field the caller never mentioned. Under the documented `data` route it would be gone.
    expect(dataOf(res)['summary']).toBe(wholeModule()['summary'])
  })

  it('does what the null rule promises: the key is removed, and the response says so', async () => {
    const id = await newModule()
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { summary: null } },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect('summary' in dataOf(res)).toBe(false)
    // A delete is the one edit you cannot see by reading back what you sent, so the report of it
    // is part of the contract the index now points at.
    expect(bodyOf(res)['dataPatch']).toMatchObject({ deleted: ['data.summary'] })
  })
})

// ------------------------------------------------------------------------------------------
// A PROBE FINDING USED TO BE TESTED HERE, AND ITS SUBJECT NO LONGER EXISTS.
//
// It was about `PUT /api/layout/:id` — the index called the body "opaque JSON owned by the
// browser" while the route wanted `{"layout": …}` and answered a bare "Unrecognized key" to
// anything else. The whole layout route group has since been deleted along with the draggable
// panel grid it served, so there is no endpoint left to describe and nothing to keep honest.
// Six tests went with it. This note is here so that a reader who finds the finding quoted in the
// header, or in the audit, does not go looking for a test that was quietly dropped.
// ------------------------------------------------------------------------------------------

// ==================================================== 3. blank is blank, envelope or not

/**
 * The blank-value sentence, taken from the data side at run time.
 *
 * Hard-coding it here would let the two drift and still pass. Reading it out of `validateData`
 * means the envelope's message is checked against whatever shared/kinds.ts says today, which is
 * the whole point of the fix: one rule, one explanation, wherever a blank string arrives.
 */
function blankRuleSentence(): string {
  const result = validateData('module', { context: 'why this exists', summary: '   ' })
  if (result.ok) throw new Error('shared/kinds.ts no longer refuses a blank data.summary')
  const issue = result.errors.find((e) => e.path === 'data.summary')
  if (!issue) throw new Error(`no data.summary error: ${JSON.stringify(result.errors)}`)
  // Drop the field's own name from the front and the per-field example from the back; what is
  // left is the rule and the reason, which is the part both sides must say identically.
  const withoutExample = issue.message.split(' A correct value looks like:')[0] ?? issue.message
  return withoutExample.replace(/^data\.summary /, '').replace(/\.$/, '')
}

describe('a blank envelope summary is refused, in the same words as a blank one inside data', () => {
  it('refuses it on POST, and says the same thing shared/kinds.ts says', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: { kind: 'module', title: uniqueTitle('blank summary'), summary: '   ', data: wholeModule() },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(errorOf(res)).toContain(blankRuleSentence())
  })

  it('refuses it on PATCH, and stores nothing', async () => {
    const id = await newModule(wholeModule(), 'ZED mini on the right wrist. Clearance check open.')
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { summary: '  \t ' },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(errorOf(res)).toContain(blankRuleSentence())

    const after = await app.inject({ method: 'GET', url: `/api/records/${id}` })
    expect(recordOf(after)['summary']).toBe('ZED mini on the right wrist. Clearance check open.')
  })

  it('treats the two sides alike: the same string is refused in data and on the envelope', async () => {
    const payload = { kind: 'module', title: uniqueTitle('both blanks'), data: { ...wholeModule(), summary: '   ' } }
    const inData = await app.inject({ method: 'POST', url: '/api/records', headers: AS_AGENT, payload })
    const onEnvelope = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: { kind: 'module', title: uniqueTitle('both blanks'), summary: '   ', data: wholeModule() },
    })
    expect(inData.statusCode).toBe(400)
    expect(onEnvelope.statusCode).toBe(400)
  })

  it('still allows null, which means "no summary", and is not the same as blank', async () => {
    const id = await newModule(wholeModule(), 'A line worth showing in the list.')
    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { summary: null },
    })
    expect(cleared.statusCode, cleared.body).toBe(200)
    expect(recordOf(cleared)['summary']).toBeNull()
  })

  it('does not trim: a summary with content and stray spaces is stored exactly as sent', async () => {
    // The rule is about blankness, not about tidiness. Nothing on the write path rewrites what
    // you wrote, and a silent trim here would be the start of one.
    const id = await newModule(wholeModule(), '  ZED mini, right wrist.  ')
    const got = await app.inject({ method: 'GET', url: `/api/records/${id}` })
    expect(recordOf(got)['summary']).toBe('  ZED mini, right wrist.  ')
  })
})

// ======================================================== 4. two summaries, told apart

describe('the two summaries are documented as the different fields they are', () => {
  it('GET /api says what the envelope summary is for, and that data.summary is not it', async () => {
    const note = await noteFor('POST', '/api/records')
    expect(note).toContain('data.summary')
    // Where each one is drawn is the question the probe could not answer from the API.
    expect(note.toLowerCase()).toContain('records list')
    expect(note.toLowerCase()).toContain('module page')
  })

  it('GET /api/kinds/module says the same thing on the field itself', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/kinds/module' })
    expect(res.statusCode).toBe(200)
    const kind = bodyOf(res)['kind'] as { fields: { key: string; description: string }[] }
    const field = kind.fields.find((f) => f.key === 'summary')
    if (!field) throw new Error('module no longer declares a summary field')
    expect(field.description).toContain('envelope')
    expect(field.description.toLowerCase()).toContain('module page')
    expect(field.description.toLowerCase()).toContain('records list')
  })

  it('they are two stored fields, and a write to one does not touch the other', async () => {
    const envelope = 'ZED mini on the right wrist. Mount printed; clearance check still open.'
    const paragraph = 'Mount is printed and calibrated. The bracket may still clip the gripper at full close.'
    const id = await newModule({ ...wholeModule(), summary: paragraph }, envelope)

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { summary: 'Re-measured 2026-08-08: 1.5 mm clearance at full close.' } },
    })
    expect(patched.statusCode, patched.body).toBe(200)
    // The paragraph moved; the one-line label the lists draw did not.
    expect(dataOf(patched)['summary']).toBe('Re-measured 2026-08-08: 1.5 mm clearance at full close.')
    expect(recordOf(patched)['summary']).toBe(envelope)
  })

  it('the list rows carry the envelope one, which is what the records page draws', async () => {
    const envelope = 'Chest-mast 2i watching the bench. Timing is the open problem.'
    const id = await newModule({ ...wholeModule(), summary: 'A paragraph nothing in a list ever shows.' }, envelope)

    const res = await app.inject({ method: 'GET', url: '/api/records?kind=module&shape=full' })
    expect(res.statusCode).toBe(200)
    const rows = bodyOf(res)['records'] as { id: string; summary: string | null }[]
    const row = rows.find((r) => r.id === id)
    if (!row) throw new Error('the module just written is not in the list')
    expect(row.summary).toBe(envelope)
  })
})

// ======================================================== the index still describes the real server

describe('the index and the routes cannot drift apart', () => {
  it('describes every endpoint that exists, and none that does not', async () => {
    const listed = (await index()).endpoints
    const real = listRoutes().map((r) => `${r.method} ${r.path}`)
    expect(listed.map((e) => `${e.method} ${e.path}`).sort()).toEqual([...real].sort())
    expect(
      listed.filter((e) => e.description === null).map((e) => `${e.method} ${e.path}`),
      'these endpoints are served and nobody has said what they are for. Declare the sentence beside the route ' +
        "as config: { note: '…' }, the way src/server/api/presentation.ts does.",
    ).toEqual([])
    // And the comparison had something in it. Both sides come from the same route table, so an app
    // that registered nothing would make the equality above true and empty — the exact way an
    // assertion in this file once passed while eight endpoints described themselves as nothing.
    expect(listed.length, 'GET /api listed no endpoints, so the comparison above compared nothing').toBeGreaterThan(40)
  })

  /**
   * WHERE THE OTHER HALF OF THIS WENT.
   *
   * There used to be a second test here naming four route groups — `/api/presentation`,
   * `/api/sessions`, `/api/resources`, `/api/source` — to prove this file was asking about the
   * whole server rather than the five groups its author had registered by hand. It was written for
   * a real defect and it fixed the wrong layer: a list of four names cannot notice a fifth group
   * going missing, and when the layout group was deleted the list had to be edited by hand to stay
   * true. That is four hand-written inventories becoming five.
   *
   * The app under test is now `buildApp()` itself, so "the whole server" is true by construction
   * rather than by canary, and tests/server-wiring.test.ts asks the real question — comparing the
   * plugins the app registered against every route group on disk, in both directions, and failing
   * with the group's own name.
   */
})
