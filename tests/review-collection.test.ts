// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW IS A COLLECTION, AND THE COLLECTION HAS A BOUNDARY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * Four claims, and each one is a thing round seven could not do:
 *
 *   A REVIEW IS A STORED THING. It says where it was started from, when, by whom, and where it
 *   stands. Round seven kept `{on, threadId}` in browser storage with no project in it, so a review
 *   could not be listed, could not say what it was about, and went away with the tab.
 *
 *   WHAT IT COLLECTS IS DERIVED FROM WHERE IT WAS STARTED. Nobody picks a scope. Started from a
 *   record it collects that record's work; from a line of a plan, that plan; from a page, the
 *   project. One mechanism, and the entry point is a value.
 *
 *   LEAVING STOPS COLLECTING THERE AND ENDS NOTHING. A remark written outside the scope is outside
 *   the review; one written inside it afterwards is inside. No state is written either way.
 *
 *   FINISHING COLLECTING FREEZES THE MEMBERSHIP AND SENDS NOTHING. After it, a link written next
 *   week cannot change what the review contained — and that is checked by writing the link.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE INTERESTING TESTS WRITE A LINK AFTERWARDS
 * ---------------------------------------------------------------------------------------
 *
 * A frozen membership that is never disturbed is indistinguishable from one that was worked out
 * again on every read. So the two tests that matter do the disturbing: one writes a `part_of` link
 * while a review is still collecting and requires the answer to change, and the other writes the
 * same link after collecting has finished and requires the answer NOT to change. Either alone would
 * pass with the feature half built.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { WHY_A_DRAFT_IS_NOT_ON_THE_SERVER } from '../src/shared/targets.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, expectPanelError, freshDb, type TestDb } from './helpers.ts'
import type { FastifyInstance } from 'fastify'
import type { Context } from '../src/shared/targets.ts'

type ReviewsLib = typeof import('../src/server/lib/reviews.ts')
type PlansLib = typeof import('../src/server/lib/plans.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
/** A second person, so "only the one who started it" is about somebody rather than about a type. */
const OTHER_HUMAN = { type: 'human', id: 'sam' } as const
/**
 * A PROJECT OF ITS OWN FOR EACH CASE. One case says the list of reviews is empty, another says it
 * holds exactly one, and a project-wide review counts every remark in the project. A fresh project
 * per case keeps all of them true in one office shared by the file.
 */
let WORKSPACE = 'default'
let caseNumber = 0
let t: TestDb
let app: FastifyInstance
let reviews: ReviewsLib
let plans: PlansLib

beforeAll(async () => {
  t = await freshDb()
  const { apiApp } = await import('./helpers.ts')
  app = (await apiApp()).app
  await app.ready()
  reviews = (await import('../src/server/lib/reviews.ts')) as ReviewsLib
  plans = (await import('../src/server/lib/plans.ts')) as PlansLib
}, 60_000)

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: 'A made-up project for one case' },
  })
  expect(made.statusCode, made.body).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ---------------------------------------------------------------------------- building things

function module(title: string): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'module',
    title,
    // ONE CURATED SUMMARY BLOCK, so a review can also be started from a block of it — which is the
    // case that proves two different entries in one scope are one review.
    data: { context: 'x', summaryBlocks: [{ id: 'b-1', type: 'text', text: 'What this module is for.' }] },
    actor: HUMAN,
  }).id
}

function task(title: string): string {
  return t.api.createRecord({ workspaceId: WORKSPACE, kind: 'task', title, data: { state: 'todo' }, actor: HUMAN }).id
}

/** A remark, written the way the product writes one: a record of kind `annotation`. */
function remark(title: string, context: Context, actor: { type: string; id: string } = HUMAN): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'annotation',
    title,
    data: { body: `words about ${title}`, context },
    actor: actor as typeof HUMAN,
  }).id
}

const onRecord = (recordId: string): Context => ({
  target: { kind: 'record', recordId, workspaceId: WORKSPACE },
})

/**
 * What a review holds, as sorted words.
 *
 * SORTED, because every stamp in this database is a local wall clock to the SECOND and a test writes
 * several remarks inside one. Members written in the same second are ordered by id, which is a
 * nanoid, so asserting on the order would be asserting on random bytes. What each test is about is
 * WHICH remarks are in the review.
 */
function bodies(read: { members: readonly { found: boolean; body?: string }[] }): string[] {
  return read.members.map((m) => (m.found ? (m.body ?? '') : '')).sort()
}

// ============================================================================ a review is a thing

describe('a review is a stored thing rather than a mode', () => {
  it('carries where it was started from, when, by whom, and where it stands', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)

    expect(started.started).toBe(true)
    expect(started.review.workspaceId).toBe(WORKSPACE)
    // WHAT IT WAS STARTED FROM IS THE TARGET. The entry is a Context and a stored Context carries
    // more than the caller sent — this test is about the review remembering WHERE it was started,
    // which is the target, and `a review entry is stored complete` below is the test about the rest
    // of the shape.
    expect(started.review.entry.target).toEqual(onRecord(gripper).target)
    expect(started.review.startedBy).toBe(`human:${THE_TEST_OFFICES_OWNER.id}`)
    expect(started.review.state).toBe('collecting')
    // NOT THE SAME FACT AS "IT CONTAINED NOTHING". Nobody has finished collecting.
    expect(started.review.membershipFrozen).toBe(false)
    expect(started.review.collectedAt).toBeNull()
    // A LOCAL WALL CLOCK, the way every other stamp in this database is written.
    expect(started.review.started).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('is read back by id, and a review of another project is not found under this one', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)

    expect(reviews.readReview(started.review.id, WORKSPACE).review.id).toBe(started.review.id)
    const refused = expectPanelError(t, () => reviews.readReview(started.review.id, 'robotics'), 404)
    expect(refused.message).toContain("of one project's work")
  })

  it('says plainly that nothing has organised the remarks, and stores no reading of them', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const read = reviews.readReview(started.review.id, WORKSPACE)

    // NO PLACEHOLDER READING. `organised` is null and the sentence says why, rather than a
    // mechanical arrangement of somebody's words standing where an interpretation goes.
    expect(read.organised).toBeNull()
    expect(read.says).toContain('Nothing has organised these comments yet')
  })
})

// ============================================================================ scope is derived

describe('what a review collects is worked out from where it was started', () => {
  it('started from a record, collects that record and everything stored as part of it', () => {
    const gripper = module('The gripper')
    const calibration = task('Calibrate the gripper')
    t.api.createLink({ fromId: calibration, toId: gripper, type: 'part_of', actor: HUMAN })
    const elsewhere = module('The wrist camera')

    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    remark('on the module itself', onRecord(gripper))
    remark('on the task inside it', onRecord(calibration))
    remark('on something else entirely', onRecord(elsewhere))

    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(read.rule.kind).toBe('record')
    expect(read.rule.id).toBe(gripper)
    expect(bodies(read)).toEqual(['words about on the module itself', 'words about on the task inside it'])
  })

  it('started from a line of a plan, collects that plan', () => {
    const written = plans.createPlan({ title: 'This week', body: 'first line\nsecond line' }, HUMAN)
    const first = written.lines[0]
    const second = written.lines[1]
    if (first === undefined || second === undefined) throw new Error('the plan has fewer than two lines')
    const other = plans.createPlan({ title: 'Another plan', body: 'a line' }, HUMAN)
    const otherLine = other.lines[0]
    if (otherLine === undefined) throw new Error('the second plan has no line')

    const started = reviews.startReview(
      { workspaceId: WORKSPACE, entry: { target: { kind: 'planLine', planId: written.plan.id, lineId: first.id } } },
      HUMAN,
    )
    remark('on the line it started from', { target: { kind: 'planLine', planId: written.plan.id, lineId: first.id } })
    remark('on another line of the same plan', {
      target: { kind: 'planLine', planId: written.plan.id, lineId: second.id },
    })
    remark('on a line of a different plan', {
      target: { kind: 'planLine', planId: other.plan.id, lineId: otherLine.id },
    })

    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(read.rule.kind).toBe('plan')
    expect(read.rule.id).toBe(written.plan.id)
    expect(bodies(read)).toEqual([
      'words about on another line of the same plan',
      'words about on the line it started from',
    ])
  })

  it('started from a fact beside a plan line, also collects that plan', () => {
    const written = plans.createPlan({ title: 'This week', body: 'first line\nsecond line' }, HUMAN)
    const first = written.lines[0]
    const second = written.lines[1]
    if (first === undefined || second === undefined) throw new Error('the plan has fewer than two lines')
    const other = plans.createPlan({ title: 'Another plan', body: 'a line' }, HUMAN)
    const otherLine = other.lines[0]
    if (otherLine === undefined) throw new Error('the second plan has no line')

    const fact = { kind: 'planLineFact' as const, planId: written.plan.id, lineId: first.id, fact: 'size' }
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: { target: fact } }, HUMAN)
    remark('on the fact it started from', { target: fact })
    remark('on another line of the same plan', {
      target: { kind: 'planLine', planId: written.plan.id, lineId: second.id },
    })
    remark('on a fact of a different plan', {
      target: { kind: 'planLineFact', planId: other.plan.id, lineId: otherLine.id, fact: 'project' },
    })

    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(read.rule.kind).toBe('plan')
    expect(read.rule.id).toBe(written.plan.id)
    expect(bodies(read)).toEqual([
      'words about on another line of the same plan',
      'words about on the fact it started from',
    ])
  })

  it('started from a page, when somebody ASKED for the whole project, collects it', () => {
    // IT USED TO COLLECT THE PROJECT WITHOUT ANYBODY ASKING, and that is what changed. A page is
    // what a comment points at when nothing more precise was under the pointer, so the widest
    // review there was could be reached by pointing at nothing. `reach` is now the one stored
    // answer and `scopeOf` reads it before it reads the entry; the refusal for a review of one
    // place started from a page is the case below.
    const gripper = module('The gripper')
    const camera = module('The wrist camera')
    const started = reviews.startReview(
      { workspaceId: WORKSPACE, entry: { target: { kind: 'page', route: '/records' } }, reach: 'global' },
      HUMAN,
    )
    remark('on one module', onRecord(gripper))
    remark('on the other', onRecord(camera))

    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(read.rule.kind).toBe('project')
    expect(read.count).toBe(2)
  })

  it('refuses a review of ONE PLACE started from a page, and says what to ask for instead', () => {
    const refused = expectPanelError(
      t,
      () => reviews.startReview({ workspaceId: WORKSPACE, entry: { target: { kind: 'page', route: '/records' } } }, HUMAN),
      400,
    )
    expect(refused.message).toContain('project-wide review')
    expect(reviews.listReviews({ workspaceId: WORKSPACE }).total).toBe(0)
  })

  it('refuses to start from a thing Mole Office does not store, naming what is missing', () => {
    // `draft` is one of the thirteen things a person can point at and one of the three Mole Office has
    // no reader for. Starting a review there would scope it to something nothing can look up.
    const refused = expectPanelError(
      t,
      () => reviews.startReview({ workspaceId: WORKSPACE, entry: { target: { kind: 'draft', draftId: 'd1' } } }, HUMAN),
      400,
    )
    // ASSERTED AGAINST THE SHARED SENTENCE RATHER THAN AGAINST A PHRASE COPIED OUT OF IT. This line
    // used to look for the words "unsent agent instructions", and it went red when the reason was
    // reworded — the reason moved into one place and stopped promising, with the word "yet", that
    // Mole Office would keep a draft one day. The claim under test is that the refusal SAYS WHAT IS
    // MISSING, and reading the same constant the refusal reads is how that survives a rewording.
    expect(refused.message).toContain(WHY_A_DRAFT_IS_NOT_ON_THE_SERVER)
  })
})

// ============================================================================ leaving and coming back

describe('leaving the place it was started stops it collecting there and ends nothing', () => {
  it('collects again when a remark is written back inside the scope', () => {
    const gripper = module('The gripper')
    const elsewhere = module('The wrist camera')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)

    remark('written inside', onRecord(gripper))
    remark('written after walking away', onRecord(elsewhere))
    remark('written after coming back', onRecord(gripper))

    const read = reviews.readReview(started.review.id, WORKSPACE)
    // THE REVIEW NEVER STOPPED AND NOTHING WAS WRITTEN TO SAY IT HAD. The one written elsewhere is
    // simply not inside the scope.
    expect(read.review.state).toBe('collecting')
    expect(bodies(read)).toEqual(['words about written after coming back', 'words about written inside'])
  })

  it('starting again in the same scope comes back to the same review rather than making a second', () => {
    const gripper = module('The gripper')
    const first = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    // A DIFFERENT ENTRY IN THE SAME SCOPE. A block of the record and the record itself are the same
    // review, because the scope is what is compared and not the entry.
    const again = reviews.startReview(
      { workspaceId: WORKSPACE, entry: { target: { kind: 'reportBlock', recordId: gripper, blockId: 'b-1' } } },
      HUMAN,
    )

    expect(again.started).toBe(false)
    expect(again.review.id).toBe(first.review.id)
    expect(again.says).toContain('already collecting here')
    expect(reviews.listReviews({ workspaceId: WORKSPACE }).total).toBe(1)
  })

  it('starting in a different scope is a different review', () => {
    const gripper = module('The gripper')
    const camera = module('The wrist camera')
    const first = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const second = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(camera) }, HUMAN)

    expect(second.started).toBe(true)
    expect(second.review.id).not.toBe(first.review.id)
  })

  it('says which reviews are collecting where somebody is standing', () => {
    const gripper = module('The gripper')
    const inside = task('Calibrate the gripper')
    t.api.createLink({ fromId: inside, toId: gripper, type: 'part_of', actor: HUMAN })
    const elsewhere = module('The wrist camera')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)

    const here = reviews.listReviews({
      workspaceId: WORKSPACE,
      covers: `record/${inside}/${WORKSPACE}`,
    })
    expect(here.reviews.map((r) => r.id)).toEqual([started.review.id])

    const notHere = reviews.listReviews({
      workspaceId: WORKSPACE,
      covers: `record/${elsewhere}/${WORKSPACE}`,
    })
    expect(notHere.reviews).toEqual([])
  })
})

// ============================================================================ whose remarks

describe('a review holds the remarks of the person who started it', () => {
  it('leaves out one an agent wrote inside the same scope at the same time', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    remark('what the person wrote', onRecord(gripper))
    remark('what an agent wrote', onRecord(gripper), AGENT)

    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(bodies(read)).toEqual(['words about what the person wrote'])
  })

  it('leaves out one written before it started', () => {
    const gripper = module('The gripper')
    const earlier = remark('written before anybody started collecting', onRecord(gripper))
    // STAMPED BACK BY AN HOUR, IN SQL. Every stamp in this database is a local wall clock to the
    // second, so a remark written in the same second as the review starts cannot be told from one
    // written just after it. An hour is the difference this test is actually about.
    t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run('2020-01-01 09:00:00', earlier)
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    remark('written after', onRecord(gripper))

    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(bodies(read)).toEqual(['words about written after'])
  })
})

// ============================================================================ the boundary

describe('finishing collecting writes the membership down and sends nothing', () => {
  it('a link written while it is still collecting changes what is inside', () => {
    const gripper = module('The gripper')
    const calibration = task('Calibrate the gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    remark('on the task', onRecord(calibration))

    // NOT YET INSIDE: nothing says the task is part of the module.
    expect(reviews.readReview(started.review.id, WORKSPACE).count).toBe(0)

    t.api.createLink({ fromId: calibration, toId: gripper, type: 'part_of', actor: HUMAN })

    // NOW INSIDE, because the review is still collecting and what is inside is a live question.
    expect(reviews.readReview(started.review.id, WORKSPACE).count).toBe(1)
  })

  it('a link written after collecting has finished cannot change what it contained', () => {
    const gripper = module('The gripper')
    const calibration = task('Calibrate the gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const inside = remark('on the module', onRecord(gripper))
    remark('on the task, which is part of nothing yet', onRecord(calibration))

    const collected = reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)
    expect(collected.review.state).toBe('collected')
    expect(collected.review.membershipFrozen).toBe(true)
    expect(collected.review.collectedAt).not.toBeNull()
    expect(collected.members.map((m) => m.id)).toEqual([inside])

    // THE DISTURBANCE. This is the same write that changed the answer above.
    t.api.createLink({ fromId: calibration, toId: gripper, type: 'part_of', actor: HUMAN })

    expect(reviews.readReview(started.review.id, WORKSPACE).members.map((m) => m.id)).toEqual([inside])
  })

  it('does not consume the remarks: a later review in the same scope collects them too', () => {
    const gripper = module('The gripper')
    const first = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const written = remark('on the module', onRecord(gripper))
    reviews.finishCollecting(first.review.id, WORKSPACE, HUMAN)

    // The second review starts after the remark was written, so it does not hold it — a review
    // collects what is written while it is collecting. The remark is still readable and still
    // belongs to the person who wrote it, which is what the frozen list names.
    const again = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    expect(again.started).toBe(true)
    expect(t.api.getRecord(written)).not.toBeNull()
  })

  it('reports a remark a frozen review contained that is not there any more', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const written = remark('on the module', onRecord(gripper))
    reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)
    t.api.deleteRecord(written, HUMAN)

    const read = reviews.readReview(started.review.id, WORKSPACE)
    // NOT SHORTENED. The review contained it, and a list that quietly lost it would read as a
    // review that never had it.
    expect(read.count).toBe(1)
    const only = read.members[0]
    if (only === undefined || only.found) throw new Error('expected the deleted remark to be reported as missing')
    expect(only.id).toBe(written)
    // THE REAL REASON, NOT "IT IS NOT IN THIS DATABASE NOW". Deleting a record here is a soft
    // delete: the row, the words and the stamp are all still there, and this sentence used to
    // claim an absence Mole Office had not measured. tests/a-review-loses-nothing-quietly.test.ts
    // holds the other four reasons a frozen member can fail to read.
    expect(only.says).toContain('was deleted at')
    expect(only.says).toContain('still in the record')
  })

  it('refuses to finish twice, so a membership cannot be rewritten', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)

    const refused = expectPanelError(t, () => reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN), 409)
    expect(refused.message).toContain('is not collecting')
  })

  it('refuses somebody who did not start it, because freezing cannot be undone', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)

    const refused = expectPanelError(t, () => reviews.finishCollecting(started.review.id, WORKSPACE, OTHER_HUMAN), 403)
    expect(refused.message).toContain(`human:${THE_TEST_OFFICES_OWNER.id} started this review`)
    expect(reviews.readReview(started.review.id, WORKSPACE).review.state).toBe('collecting')
  })
})

// ============================================================================ the states nothing writes

describe('the two states nothing in Mole Office writes are refused by name', () => {
  /**
   * THIS TEST CHANGED ON 19 AUGUST 2026, AND THE OLD VERSION WAS RIGHT WHEN IT WAS WRITTEN.
   *
   * It required the refusal to say "there is no interpreter", which was true: nothing read a
   * review's comments. Something does now — see `organiseRequest` and `keepOrganised` in
   * src/server/lib/reviews.ts — so the sentence would have been a lie kept alive by a passing test.
   *
   * WHAT IT CHECKS INSTEAD IS THE PART THAT DID NOT CHANGE: the word is still not something a
   * caller sets by hand, because a review is organised when somebody has actually read its
   * comments. The refusal now names the act that does it rather than a piece of Mole Office that does
   * not exist.
   */
  it('refuses "organised", and names the act that organises instead', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const refused = expectPanelError(t, () => reviews.setState(started.review.id, WORKSPACE, 'organised'), 409)
    expect(refused.message).toContain('not by being told it was read')
    expect(refused.message).toContain(`POST /api/reviews/${started.review.id}/organise`)
    expect(reviews.readReview(started.review.id, WORKSPACE).review.state).toBe('collecting')
  })

  it('refuses "sent", and names the act that sends it', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const refused = expectPanelError(t, () => reviews.setState(started.review.id, WORKSPACE, 'sent'), 409)
    // THE OLD SENTENCE — "nothing in Mole Office sends a review yet" — was true when it was written and
    // is not now. What has not changed is that the word is refused HERE: a review is sent by
    // sending it, and setting the word by hand would say work had been handed over when none had.
    expect(refused.message).toContain('sent by sending it')
    expect(refused.message).toContain(`POST /api/reviews/${started.review.id}/send`)
    expect(reviews.readReview(started.review.id, WORKSPACE).review.state).toBe('collecting')
  })
})
