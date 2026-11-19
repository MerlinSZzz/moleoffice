// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW NEVER LOSES A REMARK QUIETLY, AND IT NEVER STOPS ANSWERING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * tests/review-collection.test.ts proves what a review MEANS when everything it points at is
 * there. This file is about the other half: what a review says when something it depends on has
 * gone, been rewritten, or was never recorded. Every claim below was a defect three hostile agents
 * found on 18 August 2026, and each one failed in the same direction — Mole Office went quiet, or threw,
 * where it had something true to say.
 *
 * Six claims:
 *
 *   IT STILL ANSWERS WHEN WHAT IT WAS STARTED FROM IS GONE. A review started from a comment in a
 *   conversation used to throw a 404 once that comment was deleted — and because starting any new
 *   review walks every collecting review of the project, one deleted comment stopped reviewing
 *   working anywhere in that project, for good.
 *
 *   FREEZING KEEPS EVERY REMARK. The membership was cut to 200 by a slice with nothing said, and
 *   which 200 survived was decided by the random bytes of a nanoid.
 *
 *   A MEMBER THAT IS STILL THERE IS NOT REPORTED AS MISSING, and one that is really gone says the
 *   real reason it cannot be read.
 *
 *   A REMARK NOBODY IS RECORDED AS WRITING IS NAMED, not dropped in silence.
 *
 *   A REVIEW CARRIED FORWARD FROM A CONVERSATION SAYS WHERE ITS WORDS LIVE, so "0 remarks" from a
 *   deleted comment cannot read as "nobody wrote anything".
 *
 *   A PROJECT-WIDE REVIEW DOES NOT CLAIM ANOTHER PROJECT'S WORK.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, expectPanelError, freshDb, type TestDb } from './helpers.ts'
import type { Context } from '../src/shared/targets.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type ReviewsLib = typeof import('../src/server/lib/reviews.ts')
type AgentsLib = typeof import('../src/server/lib/agents.ts')
type WorkspacesLib = typeof import('../src/server/lib/workspaces.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
/**
 * A PROJECT PAIR OF ITS OWN FOR EACH CASE. One case says the list of reviews holds exactly one, and
 * another says it holds none; a fresh pair of projects keeps both true in one office shared by the
 * file, and keeps each case's remarks out of a project-wide review of another's.
 */
let WORKSPACE = 'default'
let ELSEWHERE = 'robotics'
let caseNumber = 0

let t: TestDb
let reviews: ReviewsLib
let agents: AgentsLib
let workspaces: WorkspacesLib

beforeAll(async () => {
  t = await freshDb()
  reviews = (await import('../src/server/lib/reviews.ts')) as ReviewsLib
  agents = (await import('../src/server/lib/agents.ts')) as AgentsLib
  workspaces = (await import('../src/server/lib/workspaces.ts')) as WorkspacesLib
}, 60_000)

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  ELSEWHERE = `robotics-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WORKSPACE, title: 'A made-up project for one case' })
  workspaces.createWorkspace({ id: ELSEWHERE, title: 'A made-up second project for one case' })
})

afterAll(() => {
  t.close()
})

// ---------------------------------------------------------------------------- building things

function module(title: string, workspaceId = WORKSPACE): string {
  return t.api.createRecord({
    workspaceId,
    kind: 'module',
    title,
    data: { context: 'x', summaryBlocks: [{ id: 'b-1', type: 'text', text: 'What this module is for.' }] },
    actor: HUMAN,
  }).id
}

function remark(title: string, context: Context, actor: { type: string; id: string } = HUMAN): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'annotation',
    title,
    data: { body: `words about ${title}`, context },
    actor: actor as typeof HUMAN,
  }).id
}

const onRecord = (recordId: string, workspaceId = WORKSPACE): Context => ({
  target: { kind: 'record', recordId, workspaceId },
})

/** A conversation with one comment in it, pointing at a record. */
function conversationAbout(recordId: string, workspaceId = WORKSPACE): { threadId: string; messageId: string } {
  const thread = agents.createThread({ workspaceId, title: 'About the gripper', mode: 'review' }, HUMAN)
  const message = agents.addMessage(
    thread.id,
    workspaceId,
    { intent: 'review', body: 'this number looks wrong', context: onRecord(recordId, workspaceId) },
    HUMAN,
  )
  return { threadId: thread.id, messageId: message.id }
}

// ============================================================================ the entry is gone


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

describe('a review still answers when the thing it was started from has gone', () => {
  it('reads back, saying it cannot work out what it collects, instead of throwing', () => {
    const gripper = module('The gripper')
    const { messageId } = conversationAbout(gripper)
    const started = reviews.startReview(
      { workspaceId: WORKSPACE, entry: { target: { kind: 'agentMessage', messageId } } },
      HUMAN,
    )

    agents.removeMessage(messageId, WORKSPACE, HUMAN)

    // A REVIEW WHOSE ENTRY HAS BEEN DELETED IS A REAL STATE AND IT IS AN ANSWER.
    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(read.review.id).toBe(started.review.id)
    expect(read.rule.kind).toBe('gone')
    expect(read.rule.says).toContain(messageId)
    expect(read.rule.gaps.length).toBeGreaterThan(0)
    expect(read.says).toContain('cannot say what this review collects')
  })

  it('refuses to write down a membership it cannot work out, and names the missing comment', () => {
    const gripper = module('The gripper')
    const { messageId } = conversationAbout(gripper)
    const started = reviews.startReview(
      { workspaceId: WORKSPACE, entry: { target: { kind: 'agentMessage', messageId } } },
      HUMAN,
    )
    agents.removeMessage(messageId, WORKSPACE, HUMAN)

    // FREEZING WOULD WRITE DOWN AN EMPTY MEMBERSHIP, and an empty frozen membership means "this
    // review contained nothing" — a measurement nobody took. So the one act that cannot be done
    // honestly is refused by name, and everything else about the review still works.
    const refused = expectPanelError(t, () => reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN), 400)
    expect(refused.message).toContain(messageId)
    expect(refused.message).toContain('Nothing has been changed')
    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(read.review.state).toBe('collecting')
    expect(read.review.membershipFrozen).toBe(false)
  })

  it('does not stop a new review being started anywhere else in the project', () => {
    const gripper = module('The gripper')
    const camera = module('The wrist camera')
    const { messageId } = conversationAbout(gripper)
    reviews.startReview({ workspaceId: WORKSPACE, entry: { target: { kind: 'agentMessage', messageId } } }, HUMAN)
    agents.removeMessage(messageId, WORKSPACE, HUMAN)

    // THE WALK OVER EVERY COLLECTING REVIEW IS WHAT USED TO CARRY THE THROW OUT TO EVERY CALLER.
    const elsewhere = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(camera) }, HUMAN)
    expect(elsewhere.started).toBe(true)
    // AND THE LIST, WHICH IS HOW A PAGE ASKS "is anything collecting where I am standing".
    const here = reviews.listReviews({ workspaceId: WORKSPACE, covers: `record/${camera}/${WORKSPACE}` })
    expect(here.reviews.map((r) => r.id)).toEqual([elsewhere.review.id])
  })
})

// ============================================================================ freezing keeps all

describe('finishing collecting writes down every remark, not the first two hundred', () => {
  it('keeps all 205 of them, and the count says 205', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const written: string[] = []
    for (let i = 0; i < 205; i += 1) written.push(remark(`remark ${String(i)}`, onRecord(gripper)))

    const collecting = reviews.readReview(started.review.id, WORKSPACE)
    expect(collecting.count).toBe(205)

    const frozen = reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)
    expect(frozen.count).toBe(205)
    expect(frozen.members.map((m) => m.id).sort()).toEqual([...written].sort())
  })
})

// ============================================================================ a member that is there

describe('a frozen review says the real reason a member cannot be read', () => {
  it('refuses to turn a comment a finished review is holding into a note, which it used to allow', () => {
    // A NEW REFUSAL, AND IT CLOSES A MEASURED HOLE. The gate that fixes a comment's words used to
    // ask what kind the record was BECOMING, so all three of its refusals — the words are fixed, a
    // frozen review is holding it, somebody else wrote it — were skipped by a write that turned the
    // comment into a note. Turning one into a note moves `context` into `data.extra`, which is the
    // anchor changing, and a frozen review stores ids and re-reads the words.
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const written = remark('on the module', onRecord(gripper))
    reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)

    const refused = expectPanelError(t, () => t.api.patchRecord(written, { kind: 'note' }, HUMAN), 409)
    expect(refused.message).toContain('finished collecting')
    expect(t.api.getRecord(written)?.kind, 'the refused write changed the kind anyway').toBe('annotation')
  })

  it('does not call a record that is present and undeleted "not in this database now"', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const written = remark('on the module', onRecord(gripper))
    reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)

    // THE ROW STAYS, WITH ITS WORDS.
    //
    // THE KIND IS CHANGED IN SQL AND NOT THROUGH THE API, and that is a change from how this test
    // used to reach this state. `patchRecord` now refuses it — see the test above — and the state
    // this one is about is still reachable: a record whose kind changed before that refusal
    // existed, or one an import wrote. What is being tested is the READER, which must say the true
    // reason rather than "not in this database now" about a row that is right there.
    const changed = t.client.sqlite.prepare("UPDATE records SET kind = 'note' WHERE id = ?").run(written)
    expect(changed.changes).toBe(1)
    expect(t.api.getRecord(written)?.deletedAt ?? null).toBeNull()

    const read = reviews.readReview(started.review.id, WORKSPACE)
    const only = read.members[0]
    if (only === undefined || only.found) throw new Error('expected the changed record to be reported')
    expect(only.says).not.toContain('not in this database now')
    // THE REAL REASON, IN THE WORDS OF WHAT IT IS NOW.
    expect(only.says).toContain('is a note now')
    expect(only.says).toContain(written)
  })

  it('says a deleted member was deleted, and when, and that its words are still in the record', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const written = remark('on the module', onRecord(gripper))
    reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)
    t.api.deleteRecord(written, HUMAN)

    const read = reviews.readReview(started.review.id, WORKSPACE)
    const only = read.members[0]
    if (only === undefined || only.found) throw new Error('expected the deleted remark to be reported as missing')
    expect(only.says).toContain('deleted')
    expect(only.says).toContain('still in the record')
  })

  it('says how many of the remarks it holds are not there to read now', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    remark('the one that stays', onRecord(gripper))
    const going = remark('the one that goes', onRecord(gripper))
    reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)
    t.api.deleteRecord(going, HUMAN)

    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(read.count).toBe(2)
    // THE NUMBER A PERSON READS MUST NOT BE A COUNT OF WHAT WAS COLLECTED WEARING THE NAME OF A
    // COUNT OF WHAT IS PRESENT.
    expect(read.says).toContain('1 of them is not there to read now')
  })
})

// ============================================================================ what has been sent

describe('the sentence about a collected review does not contradict its own members', () => {
  it('says one comment has been sent when one has, instead of "Nothing has been sent."', async () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const written = remark('on the module', onRecord(gripper))
    // Was `patchRecord(written, { dataPatch: { state: 'sent' } })`. That field is no longer where
    // "this has gone out" is stored — see `sendItToSomebody` above — so the fixture sends it.
    await sendItToSomebody(written)
    reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)

    const read = reviews.readReview(started.review.id, WORKSPACE)
    // THE PANE'S HEADER READ "1 comment, 1 sent." SIX INCHES ABOVE THIS SENTENCE READING "Nothing
    // has been sent." Two statements about one fact, on one 22rem pane, disagreeing.
    expect(read.says).not.toContain('Nothing has been sent')
    expect(read.says).toContain('1 of them has been sent')
  })

  it('still says nothing has been sent when nothing has', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    remark('on the module', onRecord(gripper))
    const read = reviews.finishCollecting(started.review.id, WORKSPACE, HUMAN)

    expect(read.says).toContain('Nothing has been sent')
  })
})

// ============================================================================ the entry, deleted

describe('a review entered from a record that was then deleted says so', () => {
  it('does not go on describing it by title as though it were there', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    remark('on the module', onRecord(gripper))
    t.api.deleteRecord(gripper, HUMAN)

    const read = reviews.readReview(started.review.id, WORKSPACE)
    // IT STILL COLLECTS, AND THE DELETION IS PART OF THE ANSWER. `checkContext` refuses to START a
    // review here now, so a person cannot resume the one they are already in, and used to be told
    // nothing about why.
    expect(read.count).toBe(1)
    expect(read.rule.says).toContain('was deleted at')
    expect(read.rule.gaps.join(' ')).toContain('was deleted at')
    expect(read.rule.gaps.join(' ')).toContain(gripper)
  })

  it('lets the person get back to the review they are still collecting into', () => {
    const gripper = module('The gripper')
    const first = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    t.api.deleteRecord(gripper, HUMAN)

    // THE CHECK THAT REFUSES A DELETED RECORD GUARDS WHAT IS WRITTEN, and coming back writes
    // nothing. It used to be asked of everybody, so deleting the module locked its owner out of
    // the review they were still collecting into, with a refusal about the module.
    const again = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    expect(again.started).toBe(false)
    expect(again.review.id).toBe(first.review.id)
    expect(reviews.listReviews({ workspaceId: WORKSPACE }).total).toBe(1)
  })
})

// ============================================================================ nobody recorded it

describe('a remark nobody is recorded as writing is named rather than dropped', () => {
  it('says so in the review, instead of counting it as somebody else’s', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const written = remark('on the module', onRecord(gripper))
    // WHAT RESTORING AN ARCHIVE PRODUCES: the importer writes records with run-time SQL and never
    // reaches the ledger, so nothing says who wrote them.
    t.client.sqlite.prepare('DELETE FROM revisions WHERE record_id = ?').run(written)

    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(read.count).toBe(0)
    expect(read.gaps.join(' ')).toContain('no recorded writer')
    expect(read.gaps.join(' ')).toContain(written)
    expect(read.says).toContain('no recorded writer')
  })

  it('leaves an agent’s remark out with nothing said, because that one is answered', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    remark('what an agent wrote', onRecord(gripper), AGENT)

    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(read.count).toBe(0)
    expect(read.gaps).toEqual([])
  })
})

// ============================================================================ carried forward

describe('a review carried forward from a conversation says where its words live', () => {
  /**
   * THE REVIEW IS STARTED BEFORE THE CONVERSATION IS WRITTEN, AND THAT ORDER IS WHAT MAKES THIS
   * TEST RUN THE SAME WAY EVERY TIME.
   *
   * A review collects the messages written from the moment it started: `membersOf` in
   * src/server/lib/reviews.ts skips a message when `message.createdAt < review.started`, and every
   * stamp here is a local wall clock to the second.
   *
   * This test used to write the conversation first and start the review afterwards, so the message
   * counted only when both landed inside one wall-clock second. In a full run of 558 files at 03:54
   * on 3 September 2026 they straddled a boundary, `readReview` answered a count of 0, and this was
   * the only failure in the suite; the file passed on its own straight afterwards. That is problem
   * `WxHumZZG57UO`, and the test above it at *leaves an agent's remark out* already had the order
   * right.
   *
   * Nothing is asserted more weakly. The count of 1 stays, and the message the count is about is
   * now named by its id.
   */
  it('says its remarks live in a conversation, and names which one where an id belongs', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const { threadId, messageId } = conversationAbout(gripper)
    t.client.sqlite.prepare('UPDATE reviews SET from_thread_id = ? WHERE id = ?').run(threadId, started.review.id)

    const before = reviews.readReview(started.review.id, WORKSPACE)
    expect(before.count).toBe(1)
    expect(
      before.members.map((m) => (m.found ? m.id : null)),
      'the review did not collect the message this test wrote, so the count above is about something else',
    ).toContain(messageId)
    // THE WARNING IS IN WORDS AND THE ID IS IN A FIELD, which is what changed on 19 August and is
    // the right way round. This used to require the conversation's id inside the gap SENTENCE — a
    // database id in a paragraph a person reads, which finding 6 of the language audit had taken
    // out. What the review owes its reader is that the words live somewhere else and can leave;
    // what it owes a caller is which conversation, and `fromThreadId` is where that belongs.
    expect(before.gaps.join(' ')).toContain('comments in one conversation')
    expect(before.review.fromThreadId, 'the review no longer says which conversation at all').toBe(threadId)

    agents.removeMessage(messageId, WORKSPACE, HUMAN)

    const after = reviews.readReview(started.review.id, WORKSPACE)
    expect(after.count).toBe(0)
    // NOT THE SAME SENTENCE AS A REVIEW NOBODY HAS WRITTEN IN.
    // The id is on the review, where a caller reads it; what the SENTENCE has to do is tell this
    // apart from a review nobody has written in, which is the whole point of this test.
    expect(after.review.fromThreadId).toBe(threadId)
    expect(after.gaps.join(' ')).toContain('leaves this review too')
    expect(after.gaps.join(' '), 'an empty review and one whose words were deleted read alike').not.toEqual('')
  })

  it('says when the conversation itself is gone', () => {
    const gripper = module('The gripper')
    const { threadId } = conversationAbout(gripper)
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    t.client.sqlite.prepare('UPDATE reviews SET from_thread_id = ? WHERE id = ?').run(threadId, started.review.id)
    t.client.sqlite.prepare('DELETE FROM agent_threads WHERE id = ?').run(threadId)

    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(read.gaps.join(' ')).toContain('is not in this database now')
    expect(read.says).toContain(threadId)
  })
})

// ============================================================================ the project boundary

describe('a project-wide review does not claim another project’s work', () => {
  it('is not listed as collecting a record of a different project', () => {
    const elsewhere = module('Somebody else’s module', ELSEWHERE)
    // ASKED FOR, not arrived at: a page no longer widens by itself, so the project-wide review this
    // section is about is now a press rather than a side effect of pointing at nothing.
    reviews.startReview(
      { workspaceId: WORKSPACE, entry: { target: { kind: 'page', route: '/records' } }, reach: 'global' },
      HUMAN,
    )

    const asked = reviews.listReviews({ workspaceId: WORKSPACE, covers: `record/${elsewhere}/${ELSEWHERE}` })
    expect(asked.reviews).toEqual([])
    expect(asked.total).toBe(0)
  })

  it('cannot be started from another project’s conversation', () => {
    const theirs = module('Their module', ELSEWHERE)
    const { messageId } = conversationAbout(theirs, ELSEWHERE)

    // A MESSAGE TARGET NAMES NO RECORD, so `checkTarget`'s record boundary never fires on one and
    // this was accepted: the review's rule read "Everything said in the conversation <id>" about
    // another project's conversation.
    const refused = expectPanelError(
      t,
      () =>
        reviews.startReview(
          { workspaceId: WORKSPACE, entry: { target: { kind: 'agentMessage', messageId } } },
          HUMAN,
        ),
      400,
    )
    expect(refused.message).toContain("one project's work")
    expect(reviews.listReviews({ workspaceId: WORKSPACE }).total).toBe(0)
  })

  it('still collects this project’s work', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview(
      { workspaceId: WORKSPACE, entry: { target: { kind: 'page', route: '/records' } }, reach: 'global' },
      HUMAN,
    )
    remark('on the module', onRecord(gripper))

    expect(reviews.readReview(started.review.id, WORKSPACE).count).toBe(1)
    const asked = reviews.listReviews({ workspaceId: WORKSPACE, covers: `record/${gripper}/${WORKSPACE}` })
    expect(asked.reviews.map((r) => r.id)).toEqual([started.review.id])
  })
})

// ============================================================================ the same second

describe('a remark written in the same second the review started is named', () => {
  it('says Mole Office cannot tell whether it came before or after the press', () => {
    const gripper = module('The gripper')
    // THE BROWSER'S ORDINARY CASE: press Add on a comment, then press Start collecting. Every stamp
    // in this database is a local wall clock to the second, so the two tie.
    const written = remark('written in the same second', onRecord(gripper))
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    t.client.sqlite
      .prepare('UPDATE records SET created_at = (SELECT started_at FROM reviews WHERE id = ?) WHERE id = ?')
      .run(started.review.id, written)

    const read = reviews.readReview(started.review.id, WORKSPACE)
    expect(read.count).toBe(1)
    expect(read.gaps.join(' ')).toContain('same second')
    expect(read.gaps.join(' ')).toContain(written)
  })
})
