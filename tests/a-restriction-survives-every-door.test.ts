// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FRESH OR EXTERNAL AGENT MUST NOT SEE `fx = 600` WHILE LOSING "not valid for geometry".
 *
 * That sentence is the owner's, and it is the whole of why this file exists. A restriction is
 * useless if it is drawn on one page and lost by every route that hands work to somebody else. So
 * the same restriction is asked for at every door out of the building, and every door that exists
 * has to carry it.
 *
 * ---------------------------------------------------------------------------------------
 * THE DOORS, AND THE TWO THAT ARE NOT BUILT
 * ---------------------------------------------------------------------------------------
 *
 * Built, and driven here:
 *
 *   the record read     GET /api/records/:id      `restrictions`
 *   the restriction read GET /api/restrictions     `found`
 *   the review reply    GET /api/reviews/:id       each member's `restrictions`
 *   the project export  the markdown a person or an external agent is handed
 *
 * NOT BUILT, AND NAMED RATHER THAN QUIETLY LEFT OUT:
 *
 * BOTH OF THE TWO ARE BUILT NOW, AND BOTH HAVE THEIR ROW. `src/server/lib/bundle.ts` landed in
 * round ten wave 12; `src/server/lib/continuation.ts`, which it calls rather than holding a second
 * assembler, landed on 27 August 2026. The two tripwires that named them by path are replaced by
 * the rows they were holding places for, and the last of those rows asks for the text at a size
 * that cuts everything else, because the assembler shortens before it drops.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }

/** The words that must survive every door. */
const MUST_NOT_BE_LOST = 'geometric accuracy claims'

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

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: PERSON })
  return { status: res.statusCode, body: res.json() }
}

async function get(url: string): Promise<{ status: number; body: any; raw: string }> {
  const res = await app.inject({ method: 'GET', url, headers: PERSON })
  return { status: res.statusCode, body: res.statusCode < 400 ? res.json() : null, raw: res.body }
}

/** A claim that rests on a block whose camera intrinsics are a made-up number. */
async function theRestrictedClaim(): Promise<{ p17: string; block: string; claim: string }> {
  const pipeline = await post('/api/records', { kind: 'pipeline', title: 'Perception', data: {} })
  const madeBlock = await post(`/api/records/${pipeline.body.record.id}/blocks`, {
    name: 'Pixel segmentation',
    state: 'done',
  })
  const block = madeBlock.body.record.id as string
  const claim = await post('/api/records', {
    kind: 'claim',
    title: 'Handover reach test, 40 trials',
    data: { state: 'measured', numbers: { reach_error_mm: 3.1, trials: 40 } },
  })
  expect(claim.status, JSON.stringify(claim.body)).toBe(201)
  const p17 = await post('/api/records', {
    kind: 'placeholder',
    title: 'Wrist camera intrinsics are not calibrated',
    data: {
      what: "The wrist camera's intrinsics have never been calibrated.",
      slot: 'stand_in',
      substitute: 'fx = 600, fy = 600, cx = 320, cy = 240 — guessed from the sensor data sheet',
      resolved_when: 'A checkerboard calibration run on the wrist camera.',
      allowed_uses: ['pipeline plumbing', 'shape/interface testing'],
      disallowed_claims: [MUST_NOT_BE_LOST, 'production deployment validation'],
      severity: 'stops_final',
    },
  })
  expect(p17.status, JSON.stringify(p17.body)).toBe(201)
  expect((await post('/api/links', { fromId: p17.body.record.id, toId: block, type: 'about' })).status).toBe(201)
  expect(
    (await post('/api/links', { fromId: claim.body.record.id, toId: block, type: 'measures' })).status,
  ).toBe(201)
  return { p17: p17.body.record.id, block, claim: claim.body.record.id }
}

describe('the same restriction is at every door that exists', () => {
  it('is on the record read of the claim it reaches', async () => {
    const { p17, claim } = await theRestrictedClaim()
    const read = await get(`/api/records/${claim}`)
    expect(read.status).toBe(200)
    const found = read.body.restrictions.found
    expect(found.map((r: any) => r.restrictionId)).toContain(p17)
    expect(found[0].disallowedClaims).toContain(MUST_NOT_BE_LOST)
    // AND THE SUBSTITUTE DOES NOT TRAVEL WITH IT. A downstream finding does not use `fx = 600`; it
    // uses a result computed with it, and copying the number down the graph would put a made-up
    // value on a page that is not about it.
    expect(JSON.stringify(found)).not.toContain('fx = 600')
  })

  it('is on the restriction read', async () => {
    const { p17, claim } = await theRestrictedClaim()
    const read = await get(`/api/restrictions?record=${claim}`)
    expect(read.body.found.map((r: any) => r.restrictionId)).toContain(p17)
    expect(JSON.stringify(read.body.found)).toContain(MUST_NOT_BE_LOST)
  })

  /**
   * THE REVIEW IS STARTED BEFORE THE COMMENT IS WRITTEN, AND THAT ORDER IS WHAT MAKES THIS TEST
   * RUN THE SAME WAY EVERY TIME.
   *
   * A review collects the comments its owner wrote from the moment it started. `membersOf` in
   * src/server/lib/reviews.ts keeps an annotation when `record.createdAt >= review.started`, and
   * every stamp here is a local wall clock to the second.
   *
   * This test used to write the comment first and press start afterwards. The comment was then
   * collected only when both landed inside one wall-clock second. Under a loaded suite they
   * straddled a boundary, the review collected nothing, and the file went red on *the review
   * collected nothing, so this proves nothing* — the product being right and the fixture having
   * asked for something impossible. That is problem `WxHumZZG57UO`.
   *
   * Writing the comment after the press settles it in both directions: a stamp in a later second
   * is later, and a stamp in the same second is kept too. Nothing about the restriction is
   * asserted more weakly. The membership is now checked by the comment's own id instead of by
   * counting rows, which is the stronger claim: one row from somewhere else would have satisfied
   * the count.
   */
  it('is on the review reply, beside the comment that points at the restricted claim', async () => {
    const { p17, claim } = await theRestrictedClaim()
    const review = await post('/api/reviews', {
      entry: { target: { kind: 'record', recordId: claim, workspaceId: WORKSPACE } },
    })
    expect(review.status, JSON.stringify(review.body)).toBe(201)
    const comment = await post('/api/records', {
      kind: 'annotation',
      title: 'About the reach number',
      data: {
        body: 'Is this 3.1 mm the calibrated figure?',
        context: { target: { kind: 'record', recordId: claim, workspaceId: WORKSPACE } },
      },
    })
    expect(comment.status, JSON.stringify(comment.body)).toBe(201)
    const read = await get(`/api/reviews/${review.body.review.id}`)
    expect(read.status, read.raw).toBe(200)
    const members = read.body.members.filter((m: any) => m.found)
    expect(
      members.map((m: any) => m.id),
      'the review did not collect the comment this test wrote, so nothing below is about it',
    ).toContain(comment.body.record.id)
    const carried = members.flatMap((m: any) => m.restrictions ?? [])
    expect(carried.map((r: any) => r.restrictionId)).toContain(p17)
    expect(JSON.stringify(carried)).toContain(MUST_NOT_BE_LOST)
  })

  it('is in the words a person or an external agent is handed by the archive', async () => {
    const { claim } = await theRestrictedClaim()
    // THE ARCHIVE'S OWN TEXT, not the plan of it: `GET /api/export/workspace` says what would be
    // written, and what is asserted here is what a person or an external agent actually reads.
    const { buildExport } = await import('../src/server/lib/export.ts')
    const text = buildExport({ workspaceId: WORKSPACE })
      .files.map((f: { path: string; text: string }) => f.text)
      .join('\n')
    // The restriction is exported like any other record, with its authored lists in it, and so is
    // the claim it reaches. That is what makes the archive self-contained.
    expect(text).toContain(MUST_NOT_BE_LOST)
    expect(text).toContain(claim)
  })

  it('reads the same words at every door — one restriction, not four paraphrases', async () => {
    const { claim } = await theRestrictedClaim()
    const fromRecord = (await get(`/api/records/${claim}`)).body.restrictions.found
    const fromRestrictions = (await get(`/api/restrictions?record=${claim}`)).body.found
    // ONE FACT, MANY PROJECTIONS. Two doors handing back two different sentences about one
    // restriction is the defect this whole campaign is about, so they are held to being equal
    // rather than merely both non-empty.
    expect(fromRecord).toEqual(fromRestrictions)
  })
})

describe('the door that leaves the building', () => {
  /**
   * THE ROW WAVE 8 SAID WOULD BE OWED. This file used to assert that `src/server/lib/bundle.ts` did
   * not exist, with the message *the context bundle now exists — add a row to this file asserting
   * the restriction survives its text*. Round ten wave 12 built it, so that assertion is replaced
   * by the row it was holding a place for rather than deleted.
   *
   * IT IS THE HARDEST DOOR OF THE FOUR, and that is why it is here beside the other three. The
   * record read, the restrictions read and the archive all answer somebody who can ask a second
   * question. A bundle goes to an agent Mole Office does not run: everything it will ever know about
   * what it may not claim is in this text.
   */
  it('carries the restriction into text that leaves the building', async () => {
    const { block } = await theRestrictedClaim()
    const preview = await get(`/api/bundles/preview?scope=${block}&preset=continue`)
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    // The author's own words, not a paraphrase and not a footnote.
    expect(String(preview.body.text)).toContain(MUST_NOT_BE_LOST)
  })

  /**
   * THE ROW THE ASSERTION ABOVE IT WAS HOLDING A PLACE FOR.
   *
   * This test used to assert that `src/server/lib/continuation.ts` DID NOT EXIST, with the message
   * *the continuation envelope now exists — add a row to this file asserting the restriction
   * survives it, and note that the envelope may NOT shorten a restriction with its rung*. The file
   * landed on 27 August 2026. The tripwire is replaced by the row it named, in its own words,
   * rather than deleted — the same way wave 12's bundle replaced the tripwire before it.
   *
   * THE SECOND HALF OF THAT MESSAGE IS THE HARDER ASSERTION AND IT IS THE ONE HERE. The assembler
   * cuts every part to a share of a size, twice: it draws entries short before it drops them. A
   * restriction may survive neither cut. So this asks for the text at 512 bytes — the smallest the
   * door accepts, far under what the reading needs — and demands the author's own words anyway.
   */
  it('carries the restriction through the assembler at a size that cuts everything else', async () => {
    const { block } = await theRestrictedClaim()
    // ENOUGH AROUND THE BLOCK THAT A CUT REALLY BITES, and it is filed here rather than in the
    // shared fixture because only this case needs it. With the three records of that fixture alone
    // there is nothing for a size to take away: every part is one sentence and one line already,
    // and the difference between the two readings below would be the notice saying the copy did
    // not fit — a smaller ask producing a larger text, which proves nothing about shortening.
    for (let i = 0; i < 12; i += 1) {
      const made = await post('/api/records', {
        kind: 'task',
        title: `A task around the block, with a title long enough to cost real bytes, number ${String(i)}`,
        data: { state: 'doing', command: 'Written at the length the real corpus writes these at.' },
      })
      expect(made.status, JSON.stringify(made.body)).toBe(201)
      expect((await post('/api/links', { fromId: made.body.record.id, toId: block, type: 'about' })).status).toBe(201)
    }
    const roomy = await get(`/api/bundles/preview?scope=${block}&preset=continue`)
    // THE CONTROL. Without it, the assertion below passes on a door that is broken in both runs.
    expect(roomy.status, JSON.stringify(roomy.body)).toBe(200)
    expect(String(roomy.body.text)).toContain(MUST_NOT_BE_LOST)

    const tight = await get(`/api/bundles/preview?scope=${block}&preset=continue&budgetBytes=512`)
    expect(tight.status, JSON.stringify(tight.body)).toBe(200)
    // THE CUT REALLY HAPPENED, or this test asserts nothing about shortening.
    expect(Number(tight.body.bytes), 'the smaller ask must produce a smaller text').toBeLessThan(
      Number(roomy.body.bytes),
    )
    expect(
      String(tight.body.text),
      'the assembler shortened a part and took the limit with it',
    ).toContain(MUST_NOT_BE_LOST)

    // AND THE OTHER HALF OF THE RULE, ASSERTED AS THE IMPLICATION IT IS: a limit is carried
    // whenever the record it reaches is carried, at every length. So on each of the two readings,
    // if the text names a record the limit reaches, the limit rides inside that record's entry.
    for (const reading of [roomy, tight]) {
      const text = String(reading.body.text)
      const names = (reading.body.carried as { recordId: string }[]).some((one) => one.recordId === block)
      if (!names) continue
      expect(text, 'the record is in this text and its limit is not beside it').toContain('LIMIT —')
    }
    // THE ROOMY READING MUST BE ONE OF THOSE, or the loop above asserts nothing.
    expect((roomy.body.carried as { recordId: string }[]).map((one) => one.recordId)).toContain(block)
  })
})
