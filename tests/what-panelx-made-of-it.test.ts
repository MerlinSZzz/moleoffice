// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT SOMEBODY SAID, AND WHAT PANELX MADE OF IT — TWO LEVELS, AND THE LOWER ONE IS NEVER TOUCHED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * tests/interpreter-vocabulary.test.ts is about the words and the check, which are pure. This file
 * is about the act: a review's comments are handed over, a reading comes back, and Mole Office keeps
 * what it can keep. Six claims:
 *
 *   THE WORDS ARE NOT TOUCHED. Every comment's body is byte for byte the person's own text, after
 *   organising, and the reading is stored beside it in a different field.
 *
 *   NOTHING IS FILED. A reading may say a comment should become a task, a problem or a decision
 *   somebody has to make. No record is created by any of it, and `decision` is the one kind Mole Office
 *   may never write at all.
 *
 *   ONLY AFTER THE FIRST BOUNDARY. A review that is still collecting cannot be organised, because
 *   what is in it can still change and a reading of a moving set is a reading of something else.
 *
 *   A READING THAT CANNOT BE TRACED BACK IS REFUSED, AND NOTHING IS STORED. Half a reading written
 *   before a refusal would leave some comments carrying sentences from an answer nobody accepted.
 *
 *   IT IS EDITABLE AND REFUSABLE. Sending a corrected reading replaces the sentence; an ordinary
 *   record patch takes one away, and the review says so rather than going quiet.
 *
 *   WHERE THERE IS NOWHERE TO KEEP IT, PANELX SAYS SO AND DOES NOT CLAIM THE REVIEW WAS ORGANISED.
 *   A review carried forward from round seven reads its comments out of `agent_messages`, which has
 *   no place for a reading beside them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT DO, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * IT NEVER RUNS A RUNTIME. Nothing under `src/` may start a process, so Mole Office asks and validates
 * and something outside it reads the words. The readings below are therefore test input and not
 * observations, exactly as a comment's body is test input. What is under test is what Mole Office asks
 * for, what it accepts, and what it does with what it accepted.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, expectPanelError, freshDb, type TestDb } from './helpers.ts'
import type { Context } from '../src/shared/targets.ts'
import { saidWithOthers, type OrganisedGroup } from '../src/shared/intent.ts'
import { REVIEW_STATES as REVIEW_VOCABULARY } from '../src/shared/states.ts'

type ReviewsLib = typeof import('../src/server/lib/reviews.ts')
type AgentsLib = typeof import('../src/server/lib/agents.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
/**
 * EACH CASE GETS ITS OWN PROJECT, so the reviews it starts and the records it counts are its own.
 * The doors below answer for the project in the request's header.
 */
let WORKSPACE = 'default'
const HEADERS = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let reviews: ReviewsLib
let agents: AgentsLib
let app: FastifyInstance
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  reviews = (await import('../src/server/lib/reviews.ts')) as ReviewsLib
  agents = (await import('../src/server/lib/agents.ts')) as AgentsLib
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `panelx-made-case-${String(caseNumber)}`
  HEADERS['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: `Panelx made case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
})

// ---------------------------------------------------------------------------- building things

function module(title: string): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'module',
    title,
    data: { context: 'x', summaryBlocks: [{ id: 'b-1', type: 'text', text: 'What this module is for.' }] },
    actor: HUMAN,
  }).id
}

const onRecord = (recordId: string): Context => ({ target: { kind: 'record', recordId, workspaceId: WORKSPACE } })

/** A comment, written the way the product writes one: a record of kind `annotation`. */
function remark(body: string, context: Context): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'annotation',
    title: body.slice(0, 40),
    data: { body, context },
    actor: HUMAN,
  }).id
}

/** A review of one module, with two comments in it, collecting finished. */
function collected(): { reviewId: string; first: string; second: string; moduleId: string } {
  const moduleId = module('The gripper')
  const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(moduleId) }, HUMAN)
  const first = remark('This number does not match the one in the run log. Which of the two was measured?', onRecord(moduleId))
  const second = remark('Same disagreement here, and we should automate this check next round.', onRecord(moduleId))
  reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)
  return { reviewId: started.review.id, first, second, moduleId }
}

/** A reading of those two comments, as something outside Mole Office would send it back. */
function readingOf(first: string, second: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    comments: [
      {
        commentId: first,
        reading: 'Asks which of two numbers was measured.',
        intents: ['ask', 'verify'],
        artefacts: ['problem'],
      },
      {
        commentId: second,
        reading: 'Reports the same disagreement and asks for the check to be automated.',
        intents: ['verify', 'change'],
        artefacts: ['problem', 'task'],
      },
    ],
    groups: [{ says: 'Both are about the same two numbers disagreeing.', commentIds: [first, second] }],
    ...over,
  }
}

/**
 * EVERY CLAIM ABOUT THIS COMMENT AND OTHERS AT ONCE THAT A READER WOULD SEE UNDER IT, from wherever
 * it lives: the groups the review stores, and the sentence stored beside the comment itself.
 *
 * IT LOOKS IN BOTH PLACES ON PURPOSE. The defect this guards was a group written into every
 * member's own sentence, and a test that only read the review's stored groups would pass under that
 * design as happily as under this one. Reading both makes the question "do the two comments say the
 * same thing about being said together", which is the thing a person can be lied to about.
 */
function claimsUnder(detail: { organised: { groups: OrganisedGroup[] } | null }, id: string): string[] {
  const said = saidWithOthers(detail.organised?.groups ?? [], id)
  const beside = String(stored(id).interpretation ?? '')
  for (const sentence of beside.split(/(?<=\.)\s+/)) {
    if (sentence.startsWith('Said with')) said.push(sentence.trim())
  }
  return said.sort()
}

/** What is stored on one comment record right now. */
function stored(id: string): { body: string; interpretation: unknown } {
  const record = t.api.getRecord(id)
  if (record === null) throw new Error(`no record ${id}`)
  return { body: record.data['body'] as string, interpretation: record.data['interpretation'] }
}

// ============================================================================ what is asked

describe('what an interpreter is asked about a review', () => {
  it('refuses while the review is still collecting, and names the press that comes first', () => {
    const moduleId = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(moduleId) }, HUMAN)
    remark('something', onRecord(moduleId))

    const refused = expectPanelError(t, () => reviews.organiseRequest(started.review.id, WORKSPACE), 409)
    expect(refused.message).toContain('still collecting')
    // THE PRESS, NOT THE ROUTE. This asked for the route until 5 September 2026, which is this
    // case's own name being contradicted by its own assertion: a person reading a screen is told
    // what to press, and naming an API route to them is USER.md's seventh invariant broken. The
    // word is read from the one place that holds it, so it cannot drift from the press itself.
    expect(refused.message).toContain(REVIEW_VOCABULARY.finishCollecting.word)
    expect(refused.message, 'a person reading this is shown a raw API route').not.toContain('POST /api/')
  })

  it('hands over every comment with its own id, its words, and what it was left on', () => {
    const { reviewId, first, second } = collected()
    const asked = reviews.organiseRequest(reviewId, WORKSPACE)

    expect(asked.count).toBe(2)
    expect(asked.comments.map((one) => one.id).sort()).toEqual([first, second].sort())
    // THE WORDS, EXACTLY AS WRITTEN. The request carries them because a reading of a paraphrase is
    // a reading of something nobody said.
    expect(asked.asked).toContain('Which of the two was measured?')
    expect(asked.asked).toContain(first)
    expect(asked.asked).toContain(second)
  })

  it('hands over who the person said it was for, because that is something they wrote', () => {
    // IT WAS LEFT OUT OF THE FIRST VERSION, found by reading a real request on a running server:
    // the interpreter was asked who a comment seems to be for while being shown less than the
    // person had written about exactly that. It stays a hint on both sides — nothing routes
    // anything from it — and the person's own words are still stored exactly as they wrote them.
    const moduleId = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(moduleId) }, HUMAN)
    const said = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'annotation',
      title: 'for whoever ran it',
      data: {
        body: 'Do we even keep the second camera?',
        context: onRecord(moduleId),
        recipientHint: 'whoever ran the calibration on Tuesday',
      },
      actor: HUMAN,
    }).id
    reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)

    const asked = reviews.organiseRequest(started.review.id, WORKSPACE)
    expect(asked.comments[0]?.theySaidItWasFor).toBe('whoever ran the calibration on Tuesday')
    expect(asked.asked).toContain('They said it was for: whoever ran the calibration on Tuesday')
    // AND IT IS STILL THEIR FIELD. Nothing was moved out of it or written over it.
    expect(t.api.getRecord(said)?.data['recipientHint']).toBe('whoever ran the calibration on Tuesday')
  })

  it('says nothing about who a comment is for when the person said nothing', () => {
    // ABSENCE BEATS A GUESS. The line is left out of the request rather than filled in with the
    // person who started the review, which would put a recipient in somebody's mouth.
    const { reviewId } = collected()
    expect(reviews.organiseRequest(reviewId, WORKSPACE).asked).not.toContain('They said it was for')
  })

  it('writes both vocabularies into the request, so what is asked for is what is accepted back', () => {
    const { reviewId } = collected()
    const asked = reviews.organiseRequest(reviewId, WORKSPACE)

    // EVERY WORD THE CHECK WILL ACCEPT IS IN THE REQUEST. An interpreter asked for one list and
    // checked against another would be refused for answering the question it was asked.
    for (const word of ['ask', 'explain', 'discuss', 'review', 'investigate', 'change', 'start', 'continue', 'verify']) {
      expect(asked.asked, word).toContain(`  ${word} — `)
    }
    for (const word of ['task', 'problem', 'idea', 'decision', 'finding', 'note', 'nothing']) {
      expect(asked.asked, word).toContain(`  ${word} — `)
    }
    expect(asked.asked).toContain('Never rewrite what they wrote')
    expect(asked.asked).toContain('NAMING A DECISION IS NOT TAKING ONE')
    expect(asked.answerShape).toContain('commentId')
    // AND IT SAYS PANELX DID NOT READ THEM. The request is not a reading and must not read as one.
    expect(asked.says).toContain('Nothing here has read them')
  })

  it('is served over HTTP, which is how anything outside this process gets it', async () => {
    const { reviewId } = collected()
    const got = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}/organise`, headers: HEADERS })

    expect(got.statusCode, got.body).toBe(200)
    const body = got.json() as { count: number; asked: string; comments: { id: string }[] }
    expect(body.count).toBe(2)
    expect(body.asked.length).toBeGreaterThan(200)
  })
})

// ============================================================================ what comes back

describe('a reading comes back, and Mole Office keeps it beside the words', () => {
  it('stores one sentence per comment and leaves every word the person wrote exactly as it was', () => {
    const { reviewId, first, second } = collected()
    const before = [stored(first), stored(second)]

    const outcome = reviews.keepOrganised(reviewId, WORKSPACE, readingOf(first, second), HUMAN)

    expect(outcome.stored).toBe(true)
    expect(outcome.kept.kept).toBe(2)
    expect(outcome.kept.notKept).toBe(0)
    // THE LOWER LEVEL IS UNTOUCHED. This is the claim the whole phase rests on.
    expect(stored(first).body).toBe(before[0]?.body)
    expect(stored(second).body).toBe(before[1]?.body)
    // AND THE READING IS THERE, BESIDE IT.
    expect(String(stored(first).interpretation)).toContain('Asks which of two numbers was measured.')
    expect(String(stored(first).interpretation)).toContain('What they want: ask and verify.')
  })

  it('marks the review organised, and the review reads back with what was made of each comment', () => {
    const { reviewId, first } = collected()
    reviews.keepOrganised(reviewId, WORKSPACE, readingOf(first, collectedSecond(reviewId, first)), HUMAN)

    const read = reviews.readReview(reviewId, WORKSPACE)
    expect(read.review.state).toBe('organised')
    expect(read.organised).not.toBeNull()
    expect(read.organised?.readings.length).toBe(2)
    // ORIGINAL AGAINST ORGANISED, ON THE SAME ROW. A pane draws both from one member.
    const member = read.members.find((one) => one.found && one.id === first)
    expect(member?.found).toBe(true)
    if (member?.found !== true) return
    expect(member.body).toContain('Which of the two was measured?')
    expect(member.interpretation).toContain('Asks which of two numbers was measured.')
    expect(read.says).toContain('carry a reading')
  })

  it('keeps what is true of several comments at once on the review, not in each of their sentences', () => {
    const { reviewId, first, second } = collected()
    reviews.keepOrganised(reviewId, WORKSPACE, readingOf(first, second), HUMAN)

    // THE WHOLE SET IS ORGANISED AT ONCE so that duplicates can be seen at all. What is true of
    // several comments is stored once, on the review, and NOT written into the sentence beside each
    // member — that sentence is the person's to rewrite, and a group written into it was a group
    // one press could destroy for everybody else. See the test below.
    expect(String(stored(first).interpretation)).not.toContain('Said with')
    expect(String(stored(second).interpretation)).not.toContain('Said with')

    const read = reviews.readReview(reviewId, WORKSPACE)
    expect(read.organised?.groups).toEqual([
      { says: 'Both are about the same two numbers disagreeing.', commentIds: [first, second] },
    ])
    // AND BOTH MEMBERS DRAW THE SAME SENTENCE FROM IT.
    expect(claimsUnder(read, first)).toEqual(['Said with 1 other comment: Both are about the same two numbers disagreeing.'])
    expect(claimsUnder(read, first)).toEqual(claimsUnder(read, second))
  })

  /**
   * THE ONE THAT MATTERS. A person corrects one comment's reading, which is the press
   * "Change this reading" in the review pane, and the OTHER comment goes on announcing that the two
   * were said together.
   *
   * WHAT WENT WRONG. The group's sentence was appended to the reading stored beside every member,
   * so a group of two lived as two copies with nothing holding them together. `interpretation` is a
   * declared, patchable field — a reading is a claim about somebody's words and correcting it is a
   * thing the product offers — and one correction left a review saying, on one screen, that a
   * comment was said with one other, while the only other member said nothing of the kind. Found by
   * a first-time user on 19 August 2026, point 17 of design/ROUND-EIGHT-DOGFOOD.md.
   *
   * THE ASSERTION IS ABOUT WHAT A READER SEES AND NOT ABOUT WHERE IT IS STORED. `claimsUnder`
   * gathers the group claims under one comment from BOTH places one could live: the review's stored
   * groups and the sentence beside the comment. So this test is red under the design that caused
   * the defect and green under the one that fixed it, rather than being a description of the fix.
   */
  it('does not leave one comment announcing a group after the other member\'s reading is corrected', () => {
    const { reviewId, first, second } = collected()
    reviews.keepOrganised(reviewId, WORKSPACE, readingOf(first, second), HUMAN)
    const before = reviews.readReview(reviewId, WORKSPACE)
    expect(claimsUnder(before, first).length, 'nothing was grouped, so this proves nothing').toBeGreaterThan(0)

    // THE PRESS. "Change this reading" is an ordinary patch of the one field beside the words.
    t.api.patchRecord(first, { dataPatch: { interpretation: 'It is really about naming, not numbers.' } }, HUMAN)

    const after = reviews.readReview(reviewId, WORKSPACE)
    expect(String(stored(first).interpretation)).toBe('It is really about naming, not numbers.')
    expect(
      claimsUnder(after, second),
      'the comment left in the group still announces it while the corrected one no longer does',
    ).toEqual(claimsUnder(after, first))
    // AND WHAT WAS FOUND OF SEVERAL COMMENTS IS STILL THERE. Agreeing by both having lost it would
    // be the same fact destroyed twice rather than kept once.
    expect(claimsUnder(after, first)).toEqual(claimsUnder(before, first))
  })

  it('is sent over HTTP, and the review answers with the reading afterwards', async () => {
    const { reviewId, first, second } = collected()
    const sent = await app.inject({
      method: 'POST',
      url: `/api/reviews/${reviewId}/organise`,
      headers: HEADERS,
      payload: readingOf(first, second),
    })
    expect(sent.statusCode, sent.body).toBe(200)
    expect((sent.json() as { stored: boolean }).stored).toBe(true)

    const read = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}`, headers: HEADERS })
    const body = read.json() as { organised: { readings: { id: string }[] } | null; review: { state: string } }
    expect(body.review.state).toBe('organised')
    expect(body.organised?.readings.map((one) => one.id).sort()).toEqual([first, second].sort())
  })
})

// ============================================================================ the gate

describe('naming something that could exist is not making it exist', () => {
  it('writes no record of any kind, however many artefacts the reading names', () => {
    const { reviewId, first, second } = collected()
    const countBefore = t.api.listRecords({ workspaceId: WORKSPACE, includeDeleted: true }).length

    reviews.keepOrganised(reviewId, WORKSPACE, readingOf(first, second), HUMAN)

    // THE READING NAMED A PROBLEM AND A TASK. Neither was filed, and nothing else was either.
    const after = t.api.listRecords({ workspaceId: WORKSPACE, includeDeleted: true })
    expect(after.length).toBe(countBefore)
    expect(after.filter((one) => one.kind === 'problem')).toEqual([])
    expect(after.filter((one) => one.kind === 'task')).toEqual([])
  })

  it('may say a comment names a decision, and never writes one', () => {
    const { reviewId, first, second } = collected()
    const outcome = reviews.keepOrganised(
      reviewId,
      WORKSPACE,
      readingOf(first, second, {
        comments: [
          { commentId: first, reading: 'Asks whether to keep the second gripper at all.', intents: ['discuss'], artefacts: ['decision'] },
          { commentId: second, reading: 'Says the same thing about the wrist.', intents: ['discuss'], artefacts: ['decision'] },
        ],
        groups: [],
      }),
      HUMAN,
    )

    expect(outcome.stored).toBe(true)
    // NO DECISION EXISTS. The one governance gate in this product is not reached by this path, and
    // it is not reached because nothing here asks to write one.
    expect(t.api.listRecords({ workspaceId: WORKSPACE, includeDeleted: true }).filter((r) => r.kind === 'decision')).toEqual([])
    // AND THE PERSON IS TOLD, where they read the reading.
    expect(String(stored(first).interpretation)).toContain('Mole Office never writes a decision')
  })
})

// ============================================================================ refusals store nothing

describe('a reading that cannot be traced back is refused, and nothing is stored', () => {
  it('refuses one that leaves a comment out, and the first comment is left with nothing beside it', () => {
    const { reviewId, first, second } = collected()
    const refused = expectPanelError(
      t,
      () =>
        reviews.keepOrganised(
          reviewId,
          WORKSPACE,
          { comments: [{ commentId: first, reading: 'only this one', intents: [], artefacts: [] }], groups: [] },
          HUMAN,
        ),
      400,
    )
    expect(refused.message).toContain(second)
    // NOT HALF-WRITTEN. The comment the reading DID cover carries nothing either.
    expect(stored(first).interpretation).toBeUndefined()
    expect(reviews.readReview(reviewId, WORKSPACE).review.state).toBe('collected')
  })

  it('refuses one naming a comment from somewhere else', () => {
    const { reviewId, first, second } = collected()
    const stranger = remark('a comment in another review', onRecord(module('Something else')))
    const refused = expectPanelError(
      t,
      () =>
        reviews.keepOrganised(
          reviewId,
          WORKSPACE,
          {
            comments: [
              { commentId: first, reading: 'a', intents: [], artefacts: [] },
              { commentId: second, reading: 'b', intents: [], artefacts: [] },
              { commentId: stranger, reading: 'c', intents: [], artefacts: [] },
            ],
            groups: [],
          },
          HUMAN,
        ),
      400,
    )
    expect(refused.message).toContain(stranger)
    expect(stored(first).interpretation).toBeUndefined()
  })

  it('answers 400 over HTTP and says nobody’s words were touched', async () => {
    const { reviewId, first } = collected()
    const sent = await app.inject({
      method: 'POST',
      url: `/api/reviews/${reviewId}/organise`,
      headers: HEADERS,
      payload: { comments: [{ commentId: first, reading: 'x', intents: [], artefacts: [] }], groups: [] },
    })
    expect(sent.statusCode).toBe(400)
    expect((sent.json() as { error: string }).error).toContain("no words have been changed")
  })
})

// ============================================================================ editable, refusable

describe('a reading is editable and refusable, because it is a claim about somebody else’s words', () => {
  it('replaces the sentence when a corrected reading is sent', () => {
    const { reviewId, first, second } = collected()
    reviews.keepOrganised(reviewId, WORKSPACE, readingOf(first, second), HUMAN)

    reviews.keepOrganised(
      reviewId,
      WORKSPACE,
      readingOf(first, second, {
        comments: [
          { commentId: first, reading: 'The person corrected this: it is about the run log, not the number.', intents: ['ask'], artefacts: [] },
          { commentId: second, reading: 'And this one stands.', intents: ['verify'], artefacts: ['problem'] },
        ],
        groups: [],
      }),
      HUMAN,
    )

    expect(String(stored(first).interpretation)).toContain('The person corrected this')
    expect(String(stored(first).interpretation)).not.toContain('Asks which of two numbers')
  })

  it('lets one be taken away with an ordinary record patch, and says so rather than going quiet', () => {
    const { reviewId, first, second } = collected()
    reviews.keepOrganised(reviewId, WORKSPACE, readingOf(first, second), HUMAN)

    // THE ORDINARY DOOR. An interpretation is a field of an ordinary record, so refusing one needs
    // no route of its own: a null in a merge patch removes the key.
    t.api.patchRecord(first, { dataPatch: { interpretation: null } }, HUMAN)

    const read = reviews.readReview(reviewId, WORKSPACE)
    expect(read.organised?.readings.map((one) => one.id)).toEqual([second])
    expect(read.organised?.without.map((one) => one.id)).toEqual([first])
    expect(read.organised?.without[0]?.says).toContain('Mole Office cannot say whether')
    // THE REVIEW DOES NOT GO BACKWARDS. Somebody did organise it; taking a reading away is a
    // different act from that never having happened.
    expect(read.review.state).toBe('organised')
  })
})

// ============================================================================ nowhere to keep one

describe('where there is nowhere to keep a reading, Mole Office says so and claims nothing', () => {
  it('reads a carried-forward review’s comments, stores none of it, and leaves the review collected', () => {
    // A REVIEW FROM ROUND SEVEN. Its comments live in `agent_messages`, which has no column for a
    // reading beside the words. The owner's own review is one of these, so this is the ordinary
    // case for anything carried forward rather than a corner.
    // THE REVIEW IS STARTED BEFORE THE MESSAGE IS WRITTEN. A review collects the messages written
    // from the moment it started, and every stamp is a local wall clock to the second, so a message
    // written first counts only while both land inside one second. Writing it afterwards is
    // certain. Problem `WxHumZZG57UO` is that flake met in a full run of another review test.
    const moduleId = module('The gripper')
    const thread = agents.createThread({ workspaceId: WORKSPACE, title: 'About the gripper', mode: 'review' }, HUMAN)
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(moduleId) }, HUMAN)
    const message = agents.addMessage(
      thread.id,
      WORKSPACE,
      { intent: 'review', body: 'this number looks wrong', context: onRecord(moduleId) },
      HUMAN,
    )
    t.client.sqlite.prepare('UPDATE reviews SET from_thread_id = ? WHERE id = ?').run(thread.id, started.review.id)
    reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)

    const outcome = reviews.keepOrganised(
      started.review.id,
      WORKSPACE,
      {
        comments: [{ commentId: message.id, reading: 'Says a number is wrong.', intents: ['verify'], artefacts: ['problem'] }],
        groups: [],
      },
      HUMAN,
    )

    // THE READING WAS MADE AND IT IS IN THE REPLY. It was not stored, and Mole Office does not pretend.
    expect(outcome.kept.readings[0]?.sentence).toContain('Says a number is wrong.')
    expect(outcome.stored).toBe(false)
    expect(outcome.kept.kept).toBe(0)
    expect(outcome.kept.readings[0]?.says).toContain('no place to keep a reading')
    expect(outcome.says).toContain('NONE of it could be stored')
    // AND THE WORD IS NOT SET OVER AN EMPTY SPACE.
    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(read.review.state).toBe('collected')
    expect(read.organised).toBeNull()
    expect(read.says).toContain('Nothing has organised these comments yet')
  })
})

/** The other comment of a review, found by asking the review rather than by carrying it about. */
function collectedSecond(reviewId: string, first: string): string {
  const read = reviews.readReview(reviewId, WORKSPACE)
  const other = read.members.find((one) => one.found && one.id !== first)
  if (other === undefined) throw new Error('the review holds only one comment')
  return other.id
}
