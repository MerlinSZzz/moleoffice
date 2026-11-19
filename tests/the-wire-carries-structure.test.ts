// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WIRE CARRIES STRUCTURE, NOT FINISHED ENGLISH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * Two surfaces send a person a sentence where they need a fact, and in both cases the fact is on
 * the server and never reaches the browser.
 *
 *   THE REVIEW PANE. A review that left two of somebody's comments out told the owner so in one sentence
 *   with a count in it: "2 other comments in this project are waiting and are not in this review.
 *   They are still stored." No ids, no words, nothing to press. `commentsNotIn` answers the same
 *   question with rows: which comments, what each one says, where it points, and why this review
 *   did not take it — a word from a closed set of seven, with the sentence behind it.
 *
 *   SAYING WHO YOU MEAN. `resolveRecipient` said "over 31 agents in the project panelx" inside a
 *   paragraph and served no count. `searched` is the same two facts as fields.
 *
 * ---------------------------------------------------------------------------------------
 * THE ASSERTION THAT MATTERS MOST IS THE ONE ABOUT DRIFT
 * ---------------------------------------------------------------------------------------
 *
 * Membership is decided by `membersOf` and exclusion is explained by `clauseFor`, and those are two
 * readings of one rule — the shape of defect this repository keeps producing. So the test that
 * earns its place is not "an excluded row draws `elsewhere`"; it is that no comment is ever in both
 * lists and none is ever in neither. That one fails the moment the two readings disagree.
 *
 * ---------------------------------------------------------------------------------------
 * WHY SOME COMMENTS HAVE THEIR STAMPS MOVED
 * ---------------------------------------------------------------------------------------
 *
 * Every stamp in this database is a local wall clock to the second, and a test writes a review and
 * three comments well inside one. "Written before the review started" is then not a state a test
 * can reach by writing things in order. `stampedAt` writes the `created_at` column directly, which
 * is the one thing in this file that goes round the product's own write path, and it does it for
 * that reason alone. Nothing else about the row is touched.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { Context } from '../src/shared/targets.ts'
import type { CommentNotInReview } from '../src/server/lib/reviews.ts'

type ReviewsLib = typeof import('../src/server/lib/reviews.ts')
type RecipientsLib = typeof import('../src/server/lib/recipients.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
/** A second person, so "somebody else wrote it" is about somebody rather than about a type. */
const OTHER = { type: 'human', id: 'sam' } as const
/**
 * ONE OFFICE FOR THE FILE, A PROJECT FOR EACH CASE. A review's not-in-it list and a resolve of who
 * somebody means both count what is in the project, so each case gets a project of its own and the
 * count sees only the records that case filed.
 */
let WORKSPACE = 'default'
let caseNumber = 0

let t: TestDb
let reviews: ReviewsLib
let recipients: RecipientsLib
let createWorkspace: typeof import('../src/server/lib/workspaces.ts')['createWorkspace']

beforeAll(async () => {
  t = await freshDb()
  reviews = await import('../src/server/lib/reviews.ts')
  recipients = await import('../src/server/lib/recipients.ts')
  createWorkspace = (await import('../src/server/lib/workspaces.ts')).createWorkspace
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  createWorkspace({ id: WORKSPACE, title: 'A case of its own' })
})

// -------------------------------------------------------------------------------- small helpers

function module(title: string): string {
  return t.api.createRecord({ workspaceId: WORKSPACE, kind: 'module', title, data: { context: 'x' }, actor: HUMAN }).id
}

const onRecord = (recordId: string): Context => ({ target: { kind: 'record', recordId, workspaceId: WORKSPACE } })

/** A comment, written the way the product writes one: a record of kind `annotation`. */
function comment(
  title: string,
  context: Context,
  opts: { by?: { type: string; id: string } } = {},
): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'annotation',
    title,
    data: { body: `words about ${title}`, context },
    actor: (opts.by ?? HUMAN) as typeof HUMAN,
  }).id
}

/** Move one record's stamp. See the note at the top of this file for why this is here. */
function stampedAt(recordId: string, at: string): string {
  const changed = t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(at, recordId)
  if (changed.changes !== 1) throw new Error(`no record with id ${recordId} to stamp`)
  return recordId
}

const rowFor = (read: { rows: readonly CommentNotInReview[] }, id: string): CommentNotInReview | undefined =>
  read.rows.find((r) => r.id === id)

// ================================================== the review pane gets rows, not a count


/**
 * SEND ONE COMMENT'S WORDS TO SOMEBODY, which is what fixes them and what the review pane reads.
 *
 * The fixtures here used to write `{ state: 'sent' }` into the record, because that field was where
 * "this has gone out" was stored. It is not any more — it was a SECOND store, stamped from the
 * browser after the send, and it could be wrong in both directions. The fact now lives in the
 * messages that carried the words, so a fixture that wants a sent comment has to send one.
 */
async function sendItToSomebody(annotationId: string): Promise<void> {
  const agents = await import('../src/server/lib/agents.ts')
  const thread = agents.createThread(
    { workspaceId: WORKSPACE, title: 'Reading that comment', mode: 'direct' },
    HUMAN as never,
  )
  agents.addMessage(
    thread.id,
    WORKSPACE,
    { intent: 'ask', body: 'the words of that comment', fromAnnotationId: annotationId, recipient: { kind: 'new' } },
    HUMAN as never,
  )
  agents.dispatchThread(thread.id, WORKSPACE, { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' })
}

describe('a review says which comments it did not take, and why, as rows', () => {
  it('names the comment written before it started: its id, its words, its place and the word `earlier`', () => {
    const gripper = module('The gripper')
    const before = stampedAt(comment('written first', onRecord(gripper)), '2020-01-01 09:00:00')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)

    const one = rowFor(reviews.commentsNotIn(started.review.id, WORKSPACE), before)

    // A ROW, NOT A NUMBER. Everything a working press needs is on it.
    expect(one).toBeDefined()
    expect(one?.body).toBe('words about written first')
    expect(one?.key).toBe(`record/${gripper}/${WORKSPACE}`)
    // WHAT IT POINTS AT IS THE TARGET. A stored context carries more than the caller sent, and the
    // row's job here is to say which thing this comment was left on.
    expect(one?.context?.target).toEqual(onRecord(gripper).target)
    expect(one?.created).toBe('2020-01-01 09:00:00')
    expect(one?.reason).toBe('earlier')
    expect(one?.clause).toBe('written-before-it-started')
    // THE SENTENCE IS BEHIND THE WORD, never instead of it.
    expect(one?.detail).toBe('This comment was written before the review started collecting.')
  })

  it('draws `elsewhere` for a comment about something the review does not collect', () => {
    const gripper = module('The gripper')
    const camera = module('The wrist camera')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const away = comment('on the other module', onRecord(camera))

    const one = rowFor(reviews.commentsNotIn(started.review.id, WORKSPACE), away)
    expect(one?.reason).toBe('elsewhere')
    expect(one?.clause).toBe('outside-the-scope')
  })

  it('draws `other-author` for a comment somebody else wrote inside the same scope', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const theirs = comment('sam’s remark', onRecord(gripper), { by: OTHER })

    const one = rowFor(reviews.commentsNotIn(started.review.id, WORKSPACE), theirs)
    expect(one?.reason).toBe('other-author')
    expect(one?.clause).toBe('somebody-else-wrote-it')
    expect(one?.createdBy).toBe('human:sam')
  })

  it('is newest first, and says how many it is not carrying rather than shortening quietly', () => {
    const gripper = module('The gripper')
    const camera = module('The wrist camera')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const oldest = stampedAt(comment('one', onRecord(camera)), '2026-01-01 09:00:01')
    const middle = stampedAt(comment('two', onRecord(camera)), '2026-01-01 09:00:02')
    const newest = stampedAt(comment('three', onRecord(camera)), '2026-01-01 09:00:03')

    const read = reviews.commentsNotIn(started.review.id, WORKSPACE, 2)
    expect(read.total).toBe(3)
    expect(read.rows.map((r) => r.id)).toEqual([newest, middle])
    expect(read.leftOut).toBe(1)
    expect(rowFor(read, oldest)).toBeUndefined()
    expect(read.read.comments).toBe(3)
  })

  it('says what it did not look at, rather than leaving the limit to be discovered', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const read = reviews.commentsNotIn(started.review.id, WORKSPACE)
    // THREE, AND THE THIRD LANDED WITH THE FIFTH REVIEW STATE. Abandoning a review writes its
    // membership down, and a written-down membership is what "in another review" is read from — so
    // without this line an abandoned review would have quietly claimed the comments it never sent.
    expect(read.limits.length).toBe(3)
    expect(read.limits.join(' ')).toContain('live in a conversation')
    expect(read.limits.join(' ')).toContain('finished collecting')
    expect(read.limits.join(' ')).toContain('abandoned review')
  })
})

// ================================================== the two readings of one rule cannot disagree

describe('membership and exclusion are one rule read twice, and they agree', () => {
  it('puts every comment in this project in exactly one of the two lists', () => {
    const gripper = module('The gripper')
    const camera = module('The wrist camera')
    const early = stampedAt(comment('before it started', onRecord(gripper)), '2020-01-01 09:00:00')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const inside = comment('inside it', onRecord(gripper))
    const outside = comment('outside it', onRecord(camera))
    const theirs = comment('somebody else’s', onRecord(gripper), { by: OTHER })

    const held = reviews.readReview(started.review.id, WORKSPACE)
    const out = reviews.commentsNotIn(started.review.id, WORKSPACE)
    const heldIds = new Set(held.members.map((m) => m.id))
    const outIds = new Set(out.rows.map((r) => r.id))

    expect(heldIds).toEqual(new Set([inside]))
    expect(outIds).toEqual(new Set([early, outside, theirs]))
    // NEITHER LIST OVERLAPS THE OTHER, and together they hold every comment in the project. This
    // is the assertion that fails first when the two readings drift apart.
    for (const id of heldIds) expect(outIds.has(id)).toBe(false)
    expect(heldIds.size + outIds.size).toBe(4)
  })
})

// ============================================ where it went beats why this one did not take it

describe('a comment that went somewhere says where, and still says which clause left it out', () => {
  it('draws `sent` over the clause’s own word, and keeps the clause', async () => {
    const gripper = module('The gripper')
    const gone = stampedAt(comment('already sent', onRecord(gripper)), '2020-01-01 09:00:00')
    await sendItToSomebody(gone)
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)

    const one = rowFor(reviews.commentsNotIn(started.review.id, WORKSPACE), gone)
    expect(one?.reason).toBe('sent')
    expect(one?.alreadySent).toBe(true)
    // NOTHING IS DROPPED TO MAKE THE ROW READ TIDILY. The clause is still the mechanism.
    expect(one?.clause).toBe('written-before-it-started')
    expect(one?.detail).toContain('It has already been sent.')
  })

  it('draws `in-another-review` over `sent`, and names the review it is in', async () => {
    const gripper = module('The gripper')
    const older = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const both = comment('in the older one', onRecord(gripper))
    await sendItToSomebody(both)
    reviews.finishCollecting(older.review.id, WORKSPACE, HUMAN)
    // Written down as a member of the older review, and now older than the newer one.
    stampedAt(both, '2020-01-01 09:00:00')
    const newer = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)

    const read = reviews.commentsNotIn(newer.review.id, WORKSPACE)
    const one = rowFor(read, both)
    expect(one?.reason).toBe('in-another-review')
    expect(one?.inAnotherReview).toBe(older.review.id)
    expect(one?.alreadySent).toBe(true)
    expect(read.read.reviewsRead).toBe(1)
  })

  it('decides the word from three facts and nothing else', () => {
    const clause = 'written-before-it-started' as const
    expect(reviews.reasonToDraw({ clause, alreadySent: false, inAnotherReview: null })).toBe('earlier')
    expect(reviews.reasonToDraw({ clause, alreadySent: true, inAnotherReview: null })).toBe('sent')
    expect(reviews.reasonToDraw({ clause, alreadySent: true, inAnotherReview: 'rOther' })).toBe('in-another-review')
    expect(reviews.reasonToDraw({ clause, alreadySent: false, inAnotherReview: 'rOther' })).toBe('in-another-review')
  })
})

// ================================================== a frozen review does not claim to know why

describe('a review whose membership is written down answers about the past honestly', () => {
  it('says `later` for a comment written after collecting finished', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)
    const after = stampedAt(comment('written afterwards', onRecord(gripper)), '2099-01-01 09:00:00')

    const one = rowFor(reviews.commentsNotIn(started.review.id, WORKSPACE), after)
    expect(one?.reason).toBe('later')
    expect(one?.clause).toBe('written-after-collecting-finished')
  })

  it('keeps the reason it had while collecting, rather than losing it at the freeze', () => {
    // THIS USED TO EXPECT `not-known`, AND THAT WAS THE DEFECT. Measured on 20 August 2026: two
    // comments read `Earlier` while a review collected and `Not known` the moment it finished.
    // Finishing now writes down why each comment outside it was left out, so the word a person
    // reads is the same word on both sides of the press.
    const gripper = module('The gripper')
    const camera = module('The wrist camera')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const away = comment('about the other module', onRecord(camera))

    const collecting = rowFor(reviews.commentsNotIn(started.review.id, WORKSPACE), away)
    reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)
    const frozen = rowFor(reviews.commentsNotIn(started.review.id, WORKSPACE), away)

    expect(collecting?.reason).toBe('elsewhere')
    expect(frozen?.reason).toBe(collecting?.reason)
    expect(frozen?.clause).toBe('outside-the-scope')
  })

  it('writes down `earlier` for a comment written the second before the review started, and still shows it', async () => {
    // PROBLEM 342gEXEpJ20R's OWN RECIPE, on the real clock. A comment is written in one second and the
    // review is started in a later one. The review does not hold it, because a review collects what is
    // written after it starts (the `Earlier` reason of the round-nine interaction contract). What this
    // checks is that the comment is not lost: finishing writes down why it was left out, and the
    // `Not in it` list still names it, with the word `earlier`, after the membership is frozen.
    const { nowStamp } = await import('../src/shared/time.ts')
    const gripper = module('The gripper')
    const first = comment('written a second before', onRecord(gripper))
    const writtenAt = t.api.getRecord(first)?.createdAt ?? ''
    expect(writtenAt).not.toBe('')
    while (nowStamp() <= writtenAt) await new Promise((next) => setTimeout(next, 20))
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    expect(started.review.started > writtenAt, 'the review did not start in a later second').toBe(true)

    const held = reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)
    expect(held.members.map((m) => m.id)).toEqual([])

    const one = rowFor(reviews.commentsNotIn(started.review.id, WORKSPACE), first)
    expect(one, 'the comment is in neither list once the review is frozen').toBeDefined()
    expect(one?.clause).toBe('written-before-it-started')
    expect(one?.reason).toBe('earlier')
    expect(one?.created).toBe(writtenAt)
  })

  it('says `not-known` for a review frozen before Mole Office wrote the reasons down', () => {
    // THE STORED SHAPE BEFORE THIS: a bare list of members, and nothing about who was out. Those
    // rows still read `Not known`, because nobody wrote the reason down and Mole Office will not invent
    // one. The column is set to that older shape here, which is the only way to have one now.
    const gripper = module('The gripper')
    const camera = module('The wrist camera')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const away = comment('about the other module', onRecord(camera))
    reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)
    const asItWasStored = t.client.sqlite
      .prepare('UPDATE reviews SET frozen = ? WHERE id = ?')
      .run('[]', started.review.id)
    expect(asItWasStored.changes).toBe(1)

    const one = rowFor(reviews.commentsNotIn(started.review.id, WORKSPACE), away)
    expect(one?.reason).toBe('not-known')
    expect(one?.clause).toBe('not-in-the-frozen-membership')
    expect(one?.detail).toContain('was not written down')
  })
})

// ================================================== the two vocabularies are closed and total

describe('the words a row may draw are a closed set with nothing outside it', () => {
  it('gives every clause a word and a sentence, and every word is one of the seven', () => {
    for (const clause of reviews.NOT_IN_IT_CLAUSES) {
      const word = reviews.REASON_FOR_CLAUSE[clause]
      expect(reviews.NOT_IN_IT_REASONS).toContain(word)
      expect(reviews.WHAT_A_CLAUSE_MEANS[clause].length).toBeGreaterThan(20)
    }
    expect(reviews.NOT_IN_IT_REASONS.length).toBe(7)
    // THE TWO WORDS NO CLAUSE DRAWS ON ITS OWN. They come from where the comment went, which is
    // the refinement `reasonToDraw` applies, and a clause claiming them would be a second rule.
    // ONE CLAUSE DRAWS `sent` ON ITS OWN, and it is the one about sending: a comment written with Send goes at once and
    // never enters a review (the owner's first detail, record 9BZZVKQxWV9Z), so the press itself is why it is not in one.
    const fromClauses = new Set(
      reviews.NOT_IN_IT_CLAUSES.filter((c) => c !== 'sent-on-its-own').map((c) => reviews.REASON_FOR_CLAUSE[c]),
    )
    expect(reviews.REASON_FOR_CLAUSE['sent-on-its-own']).toBe('sent')
    expect(fromClauses.has('sent')).toBe(false)
    expect(fromClauses.has('in-another-review')).toBe(false)
  })
})

// ============================================ saying who you mean serves the count it says

describe('`say who you mean` serves what it searched, on every outcome', () => {
  const said = (words: string) => recipients.resolveRecipient(words, null, WORKSPACE)

  function run(title: string): string {
    return t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'session',
      title,
      summary: `why ${title} was started`,
      data: { state: 'idle', runtime: 'claude-code' },
      actor: HUMAN,
    }).id
  }

  it('carries the count and the project when the words name one agent', () => {
    run('calibration sweep')
    run('the wrist camera')
    const answer = said('calibration')
    expect(answer.outcome).toBe('one')
    expect(answer.searched).toEqual({ agents: 2, workspaceId: WORKSPACE })
  })

  it('carries them when the words name several, which is the refusal', () => {
    run('calibration sweep, morning')
    run('calibration sweep, afternoon')
    const answer = said('calibration')
    expect(answer.outcome).toBe('many')
    expect(answer.searched).toEqual({ agents: 2, workspaceId: WORKSPACE })
  })

  it('carries them when nothing matched, where the count is what tells one nothing from another', () => {
    run('the wrist camera')
    const answer = said('calibration')
    expect(answer.outcome).toBe('none')
    expect(answer.searched).toEqual({ agents: 1, workspaceId: WORKSPACE })
  })

  it('builds its own sentence out of the field, so the two cannot come to disagree', () => {
    run('the wrist camera')
    run('the gripper')
    const answer = said('calibration')
    expect(answer.note).toContain(`${answer.searched.agents} agents in the project ${answer.searched.workspaceId}`)
  })
})
