// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ASSEMBLER PRINTS THE READER'S WORD, AND THE ONE TABLE IS WHERE IT GETS IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED 28 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/lib/continuation.ts` is the one place Mole Office assembles a reading of itself for
 * somebody who was not here. The text it assembles is drawn on `#/bundles`, where a person reads it
 * before deciding to hand it over, so every word in it is a word on a screen.
 *
 * THREE OF ITS LINES WERE WRITTEN OUT OF THE STORED COLUMNS:
 *
 *   1. a change row read `2026-08-27 12:44 — unlink on record rG-…, by human:` and the owner's id — two stored
 *      words in one sentence, where the product says "unlinked (part of)" and "person".
 *   2. a revision row read `by human:` and the owner's id, for the same reason.
 *   3. an unresolved thing read `— a placeholder` or `— a method that ran instead`, from a
 *      two-branch table written into that line. THAT IS THE RECURRING DEFECT: `KIND_WORDS` in
 *      `src/shared/words.ts` already says what each of those two kinds is called, so the line and
 *      the table were one fact worked out in two places and either could move without the other.
 *
 * `tests/the-machine-word-gate.test.ts` found the file. It cannot say whether a given site is a
 * defect, so it lists them; this file is what says these three were.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ASSERTIONS READ THE TABLE INSTEAD OF QUOTING IT
 * ---------------------------------------------------------------------------------------
 *
 * `expect(text).toContain('ran instead')` is a THIRD place the word would be written down, and it
 * would keep passing on the day somebody changed the table and forgot the assembler. So each
 * assertion asks `src/shared/words.ts` what the word is and then looks for that word in the
 * assembled text.
 *
 * WHAT THAT DOES AND DOES NOT PROVE, MEASURED RATHER THAN ASSUMED. Changing a reading in the table
 * and nothing else leaves this file green — measured on three mutations, `KIND_WORDS.ran_instead`,
 * `CHANGE_OP_WORDS.create` and `ACTOR_WORDS.human`, on 28 August 2026. That is correct and it is
 * the point: CLAUDE.md offers three ways to fix one fact worked out in two places, and this fix is
 * the second one — the assembler now DERIVES its words from the table, so there is no second place
 * left to disagree with. A test that could catch a disagreement would need the two to still exist.
 *
 * WHAT REDDENS IT is the derivation being taken back out, which is the thing that can actually
 * happen: putting any of the three stored columns back into the sentence. Each block below names
 * that mutation, and all three were run. The first block is the CONTROL, because a file of "this
 * word is absent" assertions passes just as well when nothing was assembled at all.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { ACTOR_WORDS, CHANGE_OP_WORDS, KIND_WORDS, changeVerb } from '../src/shared/words.ts'
// THE HEADINGS ARE READ FROM THE DECLARATION, never spelled here. They were two literals, and
// criterion B24 renamed the parts they belong to: a heading spelled in a test is the same words
// in a second place, free to disagree with the words the product actually prints.
import { SCOPES } from '../src/shared/bundles.ts'

const WORKSPACE = (workspace: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspace,
})

let t: TestDb
let app: FastifyInstance
let workspace = 'default'
let caseNumber = 0

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
  workspace = `assembler-case-${String(caseNumber)}`
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'Assembler' } })
  expect(made.statusCode, made.body).toBe(201)
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: WORKSPACE(workspace) })
  return { status: res.statusCode, body: res.json() }
}
async function patch(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'PATCH', url, payload: payload as object, headers: WORKSPACE(workspace) })
  return { status: res.statusCode, body: res.json() }
}
async function file(kind: string, title: string, data: unknown): Promise<string> {
  const made = await post('/api/records', { kind, title, data })
  expect(made.status, `${kind} "${title}": ${JSON.stringify(made.body)}`).toBe(201)
  return made.body.record.id as string
}
/** The assembled text for one part, read through the route the bundles page calls. */
async function textOf(query: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: `/api/bundles/preview?${query}`, headers: WORKSPACE(workspace) })
  expect(res.statusCode, res.body).toBe(200)
  return String(res.json().text)
}

/** A problem, a link off it and a rewrite of it: one row of the log for each of three ops. */
async function aProjectWithAHistory(): Promise<{ problem: string; note: string }> {
  const problem = await file('problem', 'The far edge of the tray is not segmented', {
    symptom: 'It drops it.',
    state: 'open',
  })
  const note = await file('note', 'Where the tray sits', { body: 'Second shelf.' })
  expect((await post('/api/links', { fromId: note, toId: problem, type: 'relates_to' })).status).toBe(201)
  expect((await patch(`/api/records/${problem}`, { title: 'The far edge of the tray is still not segmented' })).status).toBe(200)
  return { problem, note }
}

// ============================================================================== the control

describe('the control: the assembler answers with a change log at all', () => {
  it('assembles the recent changes, with the record and the person who wrote it in the text', async () => {
    const { problem } = await aProjectWithAHistory()
    const text = await textOf('preset=custom&slots=recentChanges')
    expect(text, 'nothing was assembled, so nothing below is evidence').toContain(SCOPES.recentChanges.heading)
    expect(text).toContain(problem)
    expect(text).toContain(THE_TEST_OFFICES_OWNER.id)
  })
})

// ====================================================== what a write was, and who made it

describe('a change row in the assembled text says what the write was in words', () => {
  /**
   * Mutation: put `${row.op}` back in place of `changeVerb(row)` in `recentChanges` in
   * `src/server/lib/continuation.ts`. Measured: this test and the one below it go red together.
   */
  it('reads the operation through the one table, so the stored token is never the verb', async () => {
    await aProjectWithAHistory()
    const text = await textOf('preset=custom&slots=recentChanges')
    expect(text, 'a record being filed').toContain(CHANGE_OP_WORDS.create)
    expect(text, 'a link being made, with the link type read as well').toContain(
      changeVerb({ op: 'link', field: 'relates_to' }),
    )
    // AND THE STORED WORDS ARE NOT THERE. `relates_to` is the link type as the database holds it,
    // and `create on record` is the shape the line had before it asked the table.
    expect(text, 'the stored link type reached the text').not.toContain('relates_to')
    expect(text).not.toContain('create on record')
    expect(text).not.toContain('link on record')
  })

  /**
   * Mutation: put `${row.actorType}:${row.actorId}` back in the same line.
   *
   * `human` is a stored word that reads as ordinary English, which is exactly the class the
   * machine-word scanner says it cannot catch by reading source. This catches it by reading text.
   */
  it('names the person who wrote each row in the product’s word for them, not the column’s', async () => {
    await aProjectWithAHistory()
    const text = await textOf('preset=custom&slots=recentChanges')
    expect(text, 'the reader’s word for a human author').toContain(`by ${ACTOR_WORDS.human} ${THE_TEST_OFFICES_OWNER.id}`)
    expect(text, 'the stored actor type reached the text').not.toContain(`human:${THE_TEST_OFFICES_OWNER.id}`)
    expect(text).not.toContain('human')
  })
})

// ====================================================== who rewrote a record

describe('a revision row says who wrote it in the same words', () => {
  /** Mutation: put `${one.who.actorType}:${one.who.actorId}` back in `revisions`. */
  it('reads the author of every stored version through the one table', async () => {
    const { problem } = await aProjectWithAHistory()
    const text = await textOf(`scope=${problem}&preset=custom&slots=revisions`)
    expect(text, 'nothing was assembled, so the absence below proves nothing').toContain(
      SCOPES.revisions.heading,
    )
    expect(text).toContain(`by ${ACTOR_WORDS.human} ${THE_TEST_OFFICES_OWNER.id}`)
    expect(text).not.toContain(`human:${THE_TEST_OFFICES_OWNER.id}`)
  })
})

// ====================================================== the two kinds that carry a restriction

describe('an unresolved thing is called what the one table calls it', () => {
  /**
   * THE RECURRING DEFECT, DELETED RATHER THAN WATCHED. Mutation: in
   * `src/server/lib/continuation.ts`, put back
   * `one.kind === 'placeholder' ? 'a placeholder' : 'a method that ran instead'`. Measured: this
   * test and the next one go red together.
   *
   * Changing `KIND_WORDS.ran_instead` in the table alone leaves this green, and that is right —
   * the assembler reads the table, so the two cannot say different things any more. See the head
   * of this file.
   */
  it('calls a placeholder what KIND_WORDS calls it, and never a word of its own', async () => {
    await file('placeholder', 'Wrist camera intrinsics are not calibrated', {
      what: "The wrist camera's intrinsics have never been calibrated.",
      slot: 'stand_in',
      substitute: 'fx = 600, fy = 600, cx = 320, cy = 240 — guessed from the sensor data sheet',
      resolved_when: 'A checkerboard calibration run on the wrist camera.',
      disallowed_claims: ['any millimetre-level accuracy claim'],
      severity: 'stops_final',
    })
    const text = await textOf('preset=custom&slots=placeholders')
    expect(text).toContain(SCOPES.placeholders.heading)
    // THE ENTRY IS A REFERENCE SINCE CRITERION B18 — `title (kind, id) — what it means here` — so
    // the word from the table sits inside the brackets. It is still read from the table and never
    // written here, which is what this case is about.
    expect(text).toContain(`Wrist camera intrinsics are not calibrated (${KIND_WORDS.placeholder}, `)
  })

  /** The other kind, and the one whose stored word holds an underscore. */
  it('calls what ran instead what KIND_WORDS calls it, and never the stored word', async () => {
    const pipeline = await file('pipeline', 'Perception', {})
    const step = await post(`/api/records/${pipeline}/blocks`, { name: 'Pixel segmentation', state: 'doing' })
    expect(step.status, JSON.stringify(step.body)).toBe(201)
    const stepId = step.body.record.id as string
    expect((await patch(`/api/records/${stepId}`, { dataPatch: { method: 'SAM segmentation' } })).status).toBe(200)
    const filed = await post(`/api/records/${stepId}/ran-instead`, {
      ran: 'Classical threshold segmentation — OpenCV adaptiveThreshold, block 51, C 7.',
      because: 'SAM will not load on the Jetson at 8 GB.',
      since: '2026-08-30',
      allowed_uses: ['downstream plumbing'],
      disallowed_claims: ['that SAM segmentation works'],
      severity: 'limits_claims',
    })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const text = await textOf('preset=custom&slots=placeholders')
    expect(text).toContain(`(${KIND_WORDS.ran_instead}, `)
    expect(text, 'the stored kind reached the text').not.toContain('ran_instead')
  })
})
