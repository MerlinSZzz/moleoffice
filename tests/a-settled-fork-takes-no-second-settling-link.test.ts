// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SETTLED FORK TAKES NO SECOND SETTLING LINK.
 *
 * In a browser measurement on 7 November 2026, a made-up office's fork was being closed with one decision while a
 * second decision, for another option, was written through the decide form and linked to the same fork through
 * POST /api/links. The links door took it, and the fork read as settled by two decisions that took different options,
 * with nothing on the page saying which one stood. The promote door refuses an already-settled fork with 409; the
 * links door did not.
 *
 * A LITERAL RULE WOULD BREAK TWO WRITES THE OFFICE MAKES ON PURPOSE. Choosing again writes the new decision with a
 * `supersedes` link to the old one and a settling link to the same fork. The promote door's own 409 tells a caller
 * to do the same by hand. So the links door refuses a settling link from decision D only while another decision
 * that settles the fork still stands: not deleted, and not replaced, down its line of replacements, by D.
 *
 * WHAT THIS FILE HOLDS:
 *   1. POST /api/links refuses a settling link while another decision still stands on the fork. It answers 409, with
 *      the promote door's short sentence, names the decision that stands, and writes nothing;
 *   2. choosing again still settles the same fork, because the new decision supersedes the old one first;
 *   3. a decision filed through POST /api/records that says it replaces the standing one may be linked to the fork in
 *      the same write;
 *   4. "still stands" is followed through the replacements: after the settling decision is replaced, the decision
 *      that replaced it may be linked to the fork, and another decision may not;
 *   5. a settling link that is already stored still answers with its id, even while another decision stands on the
 *      fork, as the new decision does once the first one is chosen again;
 *   6. a fork whose only decision was deleted takes a new one;
 *   7. POST /api/records/:id/restore refuses to bring back a decision while another decision stands on a fork it
 *      settled. It answers 409 with the promote door's short sentence, names the decision that stands, and offers a
 *      `supersedes` link that lets the decision back once it is made;
 *   8. the restore door still brings back a decision whose fork has no other answer, and a decision on the same line
 *      of replacements as the one that stands: either one of a pair chosen again, after it was deleted.
 *
 * A DELETED DECISION BROUGHT BACK WAS THE WAY TWO DECISIONS CAME TO STAND ON ONE FORK after the links door refused a
 * second settling link. Case 5 built its state that way until the restore door refused it, and builds it now by
 * choosing again.
 *
 * THE MUTATIONS THAT TURN IT RED, each in src/server/lib/records.ts:
 *   M1. `createLink` without the new check: cases 1 and 4.
 *   M2. `theOtherAnswersToThisFork` compares each decision's own id, not the end of its line of replacements: cases 2,
 *       3, 4, 5, 7 and 8.
 *   M3. `createRecordWithReport` writes the links in the order they were asked for: case 3.
 *   M4. The check moved above the already-stored answer in `createLink`: case 5.
 *   M5. A deleted decision counted as standing: cases 6 and 7.
 *   M6. The offered `supersedes` link points at the replaced decision, not the one that stands: case 4.
 *   M7. `restoreRecord` without the new check: case 7.
 *   M8. The restore door's check compares the decision brought back, not the one that stands in its place: case 8.
 *   M9. The restore door's check asked before the decision is live again: cases 7 and 8.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { RESOLVES_PROPOSAL } from '../src/shared/types.ts'
import { freshDb, type TestDb } from './helpers.ts'

const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}
const THE_PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { linkRoutes } = await import('../src/server/api/links.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** A number for each fixture's title, so no two records in this office share one. */
let made = 0

/** A fork the person filed, with two options. */
const aFork = (): string =>
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'proposal',
    title: `Position or force control for the handover? (${String(++made)})`,
    data: {
      question: 'Position control or force control for the handover?',
      options: ['a — position control', 'b — force control'],
    },
    actor: THE_PERSON,
  }).id

/** A decision the person filed, linked to nothing. */
const aDecision = (title: string): string =>
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'decision',
    title: `${title} (${String(++made)})`,
    data: { because: 'The left finger has no force sensor, measured on the robot on 27 August 2026.' },
    actor: THE_PERSON,
  }).id

/** POST /api/links as the person, which is the door the finding is about. */
const link = (fromId: string, toId: string, type: string = RESOLVES_PROPOSAL) =>
  app.inject({ method: 'POST', url: '/api/links', headers: AS_THE_PERSON, payload: { fromId, toId, type } })

/** Choosing again from a decision, as the person, which files the new decision and settles the same fork with it. */
const chooseAgain = async (decisionId: string): Promise<string> => {
  const chosen = await app.inject({
    method: 'POST',
    url: `/api/records/${decisionId}/choose-again`,
    headers: AS_THE_PERSON,
    payload: { title: 'Move to force control', data: { because: 'A sensor arrives next week.' } },
  })
  expect(chosen.statusCode, chosen.body).toBe(201)
  return (chosen.json() as { decision: { id: string } }).decision.id
}

/** The restore door, pressed as the person. */
const restore = (id: string) => app.inject({ method: 'POST', url: `/api/records/${id}/restore`, headers: AS_THE_PERSON })

/** The promote door, pressed as the person on the same fork. */
const promote = (forkId: string) =>
  app.inject({
    method: 'POST',
    url: `/api/records/${forkId}/promote`,
    headers: AS_THE_PERSON,
    payload: { title: 'Move to force control', data: { because: 'A sensor arrives next week.' } },
  })

const said = (reply: { json: () => unknown }): { error: string; reason: string | undefined } => {
  const body = reply.json() as { error?: string; reason?: string }
  return { error: body.error ?? '', reason: body.reason }
}

/**
 * The request bodies a refusal offers as the way through, read out of its words as JSON, so a case checks which
 * records the offered link joins and not how the sentence around it is put. A span in braces that is not JSON is
 * not an offered request, and is left out.
 */
const offeredLinks = (error: string): unknown[] =>
  [...error.matchAll(/\{[^{}]*\}/g)].flatMap((found) => {
    try {
      return [JSON.parse(found[0]) as unknown]
    } catch {
      return []
    }
  })

/** How the fork reads as settled, out of the product's own reader. */
const resolutionOf = (forkId: string) => {
  const fork = t.api.getRecord(forkId)
  if (fork === null || fork === undefined) throw new Error(`no fork ${forkId}`)
  const resolution = t.api.proposalResolution(fork)
  if (resolution === null) throw new Error(`${forkId} is not a fork`)
  return resolution
}

/** The decisions linked to the fork as settling it. */
const settledBy = (forkId: string): string[] => resolutionOf(forkId).by.map((one) => one.id)

describe('a second decision is refused while the first still settles the fork', () => {
  it('answers 409 in the promote door’s words, names the decision that stands, and writes nothing', async () => {
    const fork = aFork()
    const first = aDecision('Stay on position control')
    expect((await link(first, fork)).statusCode).toBe(201)

    const second = aDecision('Move to force control')
    const refused = await link(second, fork)
    expect(refused.statusCode, refused.body).toBe(409)

    // THE PROMOTE DOOR'S WORDS: the same short sentence for the box on the screen, read from that door's own reply.
    const promoted = await promote(fork)
    expect(promoted.statusCode).toBe(409)
    expect(said(refused).reason).toBeDefined()
    expect(said(refused).reason).toBe(said(promoted).reason)

    // AND THE LONG ONE NAMES WHAT STANDS AND WHAT WOULD LET THE LINK THROUGH.
    expect(said(refused).error).toContain(first)
    expect(offeredLinks(said(refused).error)).toContainEqual({ fromId: second, toId: first, type: 'supersedes' })

    expect(settledBy(fork), 'the second settling link was written').toEqual([first])
  })
})

describe('the decisions that replace the standing one still settle the same fork', () => {
  it('lets choosing again settle the fork with the new decision', async () => {
    const fork = aFork()
    const first = aDecision('Stay on position control')
    expect((await link(first, fork)).statusCode).toBe(201)

    const next = await chooseAgain(first)

    expect(settledBy(fork)).toEqual([first, next])
    const theFirst = resolutionOf(fork).by.find((one) => one.id === first)
    expect(theFirst?.replacedBy?.id, 'the first decision does not read as replaced by the new one').toBe(next)
  })

  it('lets a decision filed through POST /api/records that replaces the standing one be linked in the same write', async () => {
    const fork = aFork()
    const first = aDecision('Stay on position control')
    expect((await link(first, fork)).statusCode).toBe(201)

    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: {
        kind: 'decision',
        title: 'Move to force control, filed by hand',
        data: { because: 'A sensor arrives next week.', replaces: [first] },
        links: [{ type: RESOLVES_PROPOSAL, toId: fork }],
      },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const next = (filed.json() as { record: { id: string } }).record.id
    expect(settledBy(fork)).toEqual([first, next])
  })

  it('follows "still stands" through the replacements', async () => {
    const fork = aFork()
    const first = aDecision('Stay on position control')
    expect((await link(first, fork)).statusCode).toBe(201)

    // THE FIRST DECISION IS REPLACED BY ONE THAT IS NOT LINKED TO THE FORK. The one that replaced it is what stands.
    const replacing = aDecision('Move to force control')
    expect((await link(replacing, first, 'supersedes')).statusCode).toBe(201)

    const other = aDecision('Use a spring instead')
    const refused = await link(other, fork)
    expect(refused.statusCode, refused.body).toBe(409)
    expect(offeredLinks(said(refused).error), 'the refusal does not offer to replace the decision that stands').toContainEqual(
      { fromId: other, toId: replacing, type: 'supersedes' },
    )
    expect(settledBy(fork)).toEqual([first])

    expect((await link(replacing, fork)).statusCode).toBe(201)
    expect(settledBy(fork)).toEqual([first, replacing])
  })
})

describe('what the refusal leaves alone', () => {
  it('answers a settling link that is already stored with its id, even while another decision stands', async () => {
    const fork = aFork()
    const first = aDecision('Stay on position control')
    const stored = await link(first, fork)
    expect(stored.statusCode).toBe(201)

    const again = await link(first, fork)
    expect(again.statusCode, again.body).toBe(201)
    expect((again.json() as { id: string }).id).toBe((stored.json() as { id: string }).id)

    // ANOTHER DECISION STANDS ON THE FORK once the first one is chosen again, and it is not the first one. The repeat
    // of the first one's stored link is still answered as a repeat, and not refused as a second answer.
    const next = await chooseAgain(first)
    expect(resolutionOf(fork).by.map((one) => one.replacedBy?.id ?? one.id)).toEqual([next, next])

    const afterChoosingAgain = await link(first, fork)
    expect(afterChoosingAgain.statusCode, afterChoosingAgain.body).toBe(201)
    expect((afterChoosingAgain.json() as { id: string }).id).toBe((stored.json() as { id: string }).id)
  })

  it('lets a fork whose only decision was deleted take a new one', async () => {
    const fork = aFork()
    const first = aDecision('Stay on position control')
    expect((await link(first, fork)).statusCode).toBe(201)
    t.api.deleteRecord(first, THE_PERSON)

    const second = aDecision('Move to force control')
    expect((await link(second, fork)).statusCode).toBe(201)
    expect(settledBy(fork)).toEqual([first, second])
  })
})

describe('the restore door gives a settled fork no second answer either', () => {
  it('refuses to bring back a decision while another stands on its fork, in the promote door’s words, and its way through works', async () => {
    const fork = aFork()
    const first = aDecision('Stay on position control')
    expect((await link(first, fork)).statusCode).toBe(201)
    t.api.deleteRecord(first, THE_PERSON)
    const second = aDecision('Move to force control')
    expect((await link(second, fork)).statusCode).toBe(201)

    const refused = await restore(first)
    expect(refused.statusCode, refused.body).toBe(409)
    const promoted = await promote(fork)
    expect(promoted.statusCode).toBe(409)
    expect(said(refused).reason).toBeDefined()
    expect(said(refused).reason).toBe(said(promoted).reason)
    expect(said(refused).error).toContain(second)
    expect(offeredLinks(said(refused).error)).toContainEqual({ fromId: first, toId: second, type: 'supersedes' })
    expect(resolutionOf(fork).by.filter((one) => !one.deleted).map((one) => one.id), 'the decision came back').toEqual([second])

    // THE WAY THROUGH THE REFUSAL OFFERS: the decision brought back replaces the one that stands, so one answer stands.
    expect((await link(first, second, 'supersedes')).statusCode).toBe(201)
    const restored = await restore(first)
    expect(restored.statusCode, restored.body).toBe(200)
    expect(resolutionOf(fork).by.map((one) => one.replacedBy?.id ?? one.id)).toEqual([first, first])
  })

  it('brings back a decision whose fork is open, or stands on the same line of replacements', async () => {
    // A FORK WITH NO OTHER ANSWER.
    const open = aFork()
    const only = aDecision('Stay on position control')
    expect((await link(only, open)).statusCode).toBe(201)
    t.api.deleteRecord(only, THE_PERSON)
    expect((await restore(only)).statusCode).toBe(200)
    expect(resolutionOf(open).resolved).toBe(true)

    // A FORK CHOSEN AGAIN. The decision filed by choosing again comes back after a delete and replaces the first one
    // again; the first one comes back after a delete and is still replaced. Neither is a second answer.
    const fork = aFork()
    const first = aDecision('Stay on position control')
    expect((await link(first, fork)).statusCode).toBe(201)
    const next = await chooseAgain(first)
    t.api.deleteRecord(next, THE_PERSON)
    const newer = await restore(next)
    expect(newer.statusCode, newer.body).toBe(200)
    t.api.deleteRecord(first, THE_PERSON)
    const older = await restore(first)
    expect(older.statusCode, older.body).toBe(200)
    expect(resolutionOf(fork).by.map((one) => one.replacedBy?.id ?? one.id)).toEqual([next, next])
  })
})
