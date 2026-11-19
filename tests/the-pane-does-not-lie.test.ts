// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * THE REVIEW PANE, AND THE PRESSES IT USED TO OFFER THAT COULD NOT MEAN WHAT THEY SAID.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------------
 *
 * Three hostile agents drove the pane on 19 August 2026 and found that most of what it offered was
 * either impossible, forbidden or already done. Every one of these is a control drawn from the
 * wrong fact, and every one of them looks finished on screen:
 *
 *   1. SENDING WAS OFFERED WHILE THE REVIEW WAS STILL COLLECTING, one comment at a time, six inches
 *      under a button whose own words say nothing is sent. That is the two boundaries Phase 5
 *      exists to keep apart, collapsed into none.
 *   2. THE SAME COMMENT COULD BE SENT TWICE, because nothing re-read the review after a send and
 *      nothing refused a note already stamped sent. Two conversations, two runs, one set of words.
 *   3. "SEND REVIEW" WAS THE PRIMARY BUTTON OF A FINISHED REVIEW AND COULD ONLY EVER FAIL.
 *   4. A COMMENT THAT HAD GONE COULD BE EDITED AND DELETED, and a review that says its membership
 *      cannot change offered a button that empties it.
 *   5. THE COUNT COUNTED A COMMENT THAT IS NOT THERE as one the review holds.
 *   6. THE SENTENCE ABOUT COMMENTS OUTSIDE THE REVIEW GAVE TWO CAUSES, BOTH GUESSES, and claimed
 *      the reader had written comments that agents wrote.
 *   7. A STALE QUOTE PRINTED THE SAME PARAGRAPH THREE TIMES, with a record id, a block id, a stored
 *      field path and a raw API call, in NORMAL mode.
 *   8. EVERY REVIEW STARTED FROM THE INTERFACE WAS SCOPED TO THE WHOLE PROJECT, so "scope is
 *      derived from where you were standing" had one reachable value.
 *
 * WHAT IS NOT HERE. Whether the editor really scrolls into view, and whether the pane really takes
 * a third of a 390px screen, are properties of a browser. This file holds what can be decided
 * without one, which is every decision about what the pane OFFERS.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ContextReading } from '../src/server/lib/agents.ts'
import { readinessOf } from '../src/shared/readiness.ts'
import type {
  FoundMember,
  ReviewDetail,
  ReviewMember,
  ReviewState,
  ReviewView,
} from '../src/server/lib/reviews.ts'

type Bar = typeof import('../src/web/components/agent/ReviewBar.tsx')
type Api = typeof import('../src/web/api.ts')

let bar: Bar
let api: Api

beforeAll(async () => {
  // src/web/api.ts and src/web/lib/mode.ts both read storage when they are first imported, so the
  // smallest stand-in goes in before anything else. Nothing here is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  bar = await import('../src/web/components/agent/ReviewBar.tsx')
  api = await import('../src/web/api.ts')
})

const render = (el: React.ReactElement): string => renderToStaticMarkup(el)

/**
 * Every state a review can be in, read off the pane's own words for them.
 *
 * NOT IMPORTED FROM THE SERVER. `REVIEW_STATES` is a value in src/server/lib/reviews.ts, and a
 * value import from there opens a database the moment this file loads — before `freshDb()` can
 * point it at a throwaway one. That the four words are total over the states is TypeScript's job:
 * `REVIEW_STATE_WORDS` is a `Record<ReviewState, string>`, so a fifth state stops the build.
 */
const everyState = (): ReviewState[] => Object.keys(bar.REVIEW_STATE_WORDS) as ReviewState[]

// ---------------------------------------------------------------------------- the fixtures

const READING: ContextReading = {
  state: 'there',
  about: 'the module "LeafCam 2 overhead camera", JgwUmrzxIqkn',
  says: 'Still there, in the same place.',
}

function member(over: Partial<FoundMember> = {}): FoundMember {
  return {
    found: true,
    source: 'annotation',
    id: 'n1',
    body: 'These two numbers disagree and the paragraph does not say which is right.',
    context: { target: { kind: 'record', recordId: 'JgwUmrzxIqkn', workspaceId: 'panelx' } },
    reading: READING,
    created: '2026-08-19 09:00:00',
    state: 'queued',
    createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    key: 'record/JgwUmrzxIqkn/panelx',
    interpretation: null,
    chosen: null,
    restrictions: null,
    ...over,
  }
}

function review(over: Partial<ReviewView> = {}): ReviewView {
  return {
    id: 'wdCLe2jmzo1h',
    workspaceId: 'panelx',
    entry: { target: { kind: 'record', recordId: 'JgwUmrzxIqkn', workspaceId: 'panelx' } },
    state: 'collecting',
    started: '2026-08-19 09:40:00',
    startedBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    collectedAt: null,
    membershipFrozen: false,
    fromThreadId: null,
    sentAt: null,
    threadId: null,
    reach: 'local',
    startedByAgent: null,
    ...over,
  }
}

function detail(over: { review?: Partial<ReviewView>; members?: ReviewMember[] } = {}): ReviewDetail {
  const one = review(over.review ?? {})
  const members = over.members ?? [member()]
  return {
    review: one,
    rule: { kind: 'record', id: 'JgwUmrzxIqkn', says: 'Everything about that module.', gaps: [] },
    members,
    // NO COMMENT SAVED WITHOUT SENDING is listed beside these, which is the case this file draws.
    saved: [],
    count: members.length,
    gaps: [],
    gapForms: [],
    // Worked out from the same four stored facts the server works it out from, rather than typed:
    // a fixture that made up an answer would be the second opinion this shape exists to prevent.
    readiness: readinessOf(one, members),
    // Nobody recorded who wrote the record these fixtures were started on, so the review goes to nobody.
    goesTo: { ground: 'nobody-recorded', recipient: null, name: null, elsewhere: [] },
    organised: null,
    says: 'Collecting since 2026-08-19 09:40:00. 1 remark so far. Nothing has been sent.',
  }
}

const pane = (one: ReviewDetail) =>
  render(h(bar.PaneBody, { detail: one, notes: null, showing: { state: 'none' } as never }))

const expanded = (
  one: FoundMember,
  over: { collecting?: boolean; frozen?: boolean; inspect?: boolean } = {},
) =>
  render(
    h(bar.MemberDetail, {
      member: one,
      reviewId: 'rev1',
      inspect: over.inspect ?? false,
      collecting: over.collecting ?? false,
      frozen: over.frozen ?? false,
      editing: false,
      onEditing: () => {},
    }),
  )

// ============================================================ 1. the two boundaries stay apart

describe('what a review offers while it is still collecting', () => {
  /**
   * THE ONE THAT MATTERS. A press that hands a comment to an agent, offered while the review is
   * collecting, dispatches a review one comment at a time with neither boundary crossed — and the
   * pane's own foot, six inches below, says that finishing collecting sends nothing to anybody.
   */
  it('offers nobody to send a comment to while collecting is still going on', () => {
    const html = expanded(member(), { collecting: true })
    expect(html, 'a comment could be handed to an agent before the review was finished').not.toContain(
      'Send this comment',
    )
    expect(html, 'a recipient could be chosen for a comment in a review still collecting').not.toContain(
      'Choose a recipient',
    )
  })

  it('offers it once collecting has finished, because that is the one send Mole Office can do', () => {
    const html = expanded(member(), { collecting: false })
    expect(html).toContain('Choose a recipient')
  })

  it('offers the press that sends a review once collecting has finished, and never before', () => {
    // IT USED TO OFFER NOTHING HERE, and that was right while nothing sent a review: every press of
    // the old "Send review" answered 409, on a button drawn as the primary thing to do next. What
    // is offered now is an act that works. While a review is still COLLECTING there is still no
    // such press, because what is inside it can still change and handing it over would hand over a
    // collection nobody has finished.
    const collecting = pane(detail({ review: { state: 'collecting', membershipFrozen: false } }))
    expect(collecting, 'a review that is still collecting offered to send itself').not.toContain('Send this review')
    for (const state of everyState()) {
      if (state === 'collecting') continue
      const html = pane(detail({ review: { state, membershipFrozen: true } }))
      expect(html, `a ${state} review said nothing about where its comments go`).toContain('comment')
      if (state === 'sent') {
        // A REVIEW THAT HAS GONE STILL DRAWS THE BLOCK AND OFFERS NO PRESS. What happened to each
        // comment is worth reading afterwards, and pressing again would be refused.
        expect(html, 'a review that has gone offered to send itself again').not.toContain('Send this review<')
        continue
      }
      expect(html, `a ${state} review offered no way to send it`).toContain('Send this review')
    }
  })

  it('has one call that sends a review, and it is not the one that always failed', () => {
    // `askToSendReview` sent PATCH {"state":"sent"}, which `setState` refuses by name and always
    // did. The call that replaced it presses the route that really hands the comments over.
    expect('askToSendReview' in api.api, 'the call that always failed is back').toBe(false)
    expect('sendReview' in api.api, 'nothing in the browser can send a review').toBe(true)
  })

  /**
   * WHERE "HOW MANY HAVE GONE" IS SAID, AND IT IS THE ONE PLACE THAT CAN COUNT IT.
   *
   * This is the other half of the check above. Taking the false clause out of the state lines is
   * only right if the fact is still on the screen, and it is: the count beside the pane's title is
   * worked out from the comments themselves, so it cannot disagree with them.
   */
  it('says how many comments have gone, counted from the comments', () => {
    expect(bar.countWords([member(), member({ id: 'n2' })]), 'a review with nothing sent does not say so').toContain(
      'none sent',
    )
    expect(
      bar.countWords([member(), member({ id: 'n2', state: 'sent' })]),
      'a review with one comment already gone does not say so',
    ).toContain('1 sent')
  })

  it('refuses Finish collecting while a comment is being edited, rather than eating the press', () => {
    // MEASURED: with three comments in the pane, the centre of "Save the change" was 16px below the
    // list's clip line and the pixel it sat on belonged to "Finish collecting" — the one press the
    // pane itself calls irreversible.
    // SHAPE B (wave 13r round 15) keeps Finish collecting behind More on a collecting review, so the face of the pane
    // offers More, and the whole pane that More opens offers the press.
    const face = pane(detail())
    expect(face, 'a collecting review has no More to reach Finish collecting by').toContain('More about this review')
    const html = render(h(bar.PaneWhole, { detail: detail(), notes: null, showing: { state: 'none' } as never }))
    expect(html, 'the pane stopped offering the first boundary').toContain('Finish collecting')
    expect(html).not.toContain('Save the comment you are editing first')
  })
})

// ============================================================ 2. a comment that has already gone

describe('a comment that has already gone to somebody', () => {
  const sent = member({ state: 'sent' })

  it('is not offered again, so one comment cannot become two conversations', () => {
    const html = expanded(sent)
    expect(html).toContain('Already sent')
    expect(html, 'the send press was still there after the comment had gone').not.toContain('Send this comment')
  })

  it('is not offered Edit, which refused with a record id and a POST body in a 22rem column', () => {
    expect(expanded(sent), 'Edit was offered on a comment that cannot be changed').not.toContain('>Edit<')
  })

  it('is not offered Remove, because the words are the record of what somebody said', () => {
    expect(expanded(sent), 'Remove was offered on a comment that had already been sent').not.toContain('Remove')
  })

  it('is still editable and removable while it is waiting and the review is collecting', () => {
    const html = expanded(member(), { collecting: true })
    expect(html).toContain('>Edit<')
    expect(html).toContain('Remove')
  })
})

describe('a review whose membership has been written down', () => {
  /**
   * The pane said "That membership is written down and nothing can change it now" and offered a
   * button that empties it. Removing a member left the header counting a comment that was gone and
   * a tombstone where it had been.
   */
  it('offers nothing that would take a comment out of it', () => {
    const html = expanded(member(), { collecting: false, frozen: true })
    expect(html, 'a frozen review offered Remove').not.toContain('Remove')
    expect(html, 'a frozen review offered Edit').not.toContain('>Edit<')
  })
})

// ============================================================ 3. the numbers and the sentences

describe('how many comments a review says it holds', () => {
  const one = (over: Partial<FoundMember>): ReviewMember => member(over)
  const lost: ReviewMember = { found: false, source: 'annotation', id: 'nGone', says: 'This review contained…' }

  it('counts what is present as present and what is gone as gone', () => {
    // It used to read "3 comments, none sent." over a list holding two comments and a tombstone.
    expect(bar.countWords([one({ id: 'a' }), one({ id: 'b' }), lost])).toBe(
      '2 comments · none sent · 1 more no longer here',
    )
    expect(bar.countWords([one({ id: 'a' }), one({ id: 'b', state: 'sent' })])).toBe('2 comments · 1 sent')
    expect(bar.countWords([lost])).toBe('0 comments · none sent · 1 more no longer here')
    expect(bar.countWords([])).toBe('Nothing written yet')
  })

  it('says a comment it cannot show is missing without printing its id in Normal', () => {
    const html = pane(detail({ review: { state: 'collected', membershipFrozen: true }, members: [lost] }))
    expect(html, 'a record id was printed in Normal mode').not.toContain('nGone')
    expect(html).toContain('is no longer stored')
  })
})

describe('the comments that are not in this review', () => {
  /**
   * IT GAVE TWO CAUSES AND BOTH WERE GUESSES. Measured with the reply's cap reached: five comments
   * written after the review started, inside its scope, by the reviewer, were explained as "written
   * before it started, or somewhere it does not collect". A cause that is not the cause is worse
   * than saying nothing.
   */
  /**
   * THE THREE TESTS THAT WERE HERE ARE DELETED WITH `outsideWords`, WHICH IS DELETED.
   *
   * They pinned a sentence: that it counted the comments waiting outside the review, that it said
   * they were still stored, and that it named no cause the browser had not checked. All three
   * passed, and the sentence was still the defect the owner met — a count, no ids, and no way
   * through to any of the comments it counted. Step 30 replaces it with the `Not in it` group: one
   * row per comment, the reason from the server's closed set of seven, and the same press a member
   * row has.
   *
   * WHERE THE FACT IS PINNED NOW: tests/the-wire-carries-structure.test.ts, which asserts that
   * every clause of the membership rule maps to one of the seven words, that `not-known` is a real
   * answer rather than a placeholder, and that the population is named rather than left to be
   * discovered.
   */
  it('has no sentence standing in for the comments a review did not take', () => {
    expect('outsideWords' in bar, 'the sentence with a number in it is back').toBe(false)
  })
})

// ============================================================ 4. a stale quote, said once

describe('what an expanded comment says when its words have moved', () => {
  const moved = member({
    reading: {
      state: 'changed',
      about: 'the block b-open of the report "Round six", JgwUmrzxIqkn',
      says:
        'The text has changed. These words are no longer in the block b-open of the report, JgwUmrzxIqkn. ' +
        'This was written against revision 1 of record JgwUmrzxIqkn. What that revision held at ' +
        'data.blocks[#b-open].text: "The mount holds calibration".',
      quote: { words: 'The mount holds', stillThere: false, at: null, field: null, lookedEverywhere: true },
      writtenAgainst: {
        seq: 1,
        contentHash: 'abc',
        inTheLedger: true,
        heldThere: 'The mount holds calibration',
        field: 'data.blocks[#b-open].text',
        says:
          'This was written against revision 1 of record JgwUmrzxIqkn, written 2026-08-19 00:38:00. What that ' +
          'revision held at data.blocks[#b-open].text: "The mount holds calibration".',
      },
    },
  })

  it('prints the old text once, and not three times', () => {
    const html = expanded(moved)
    const times = html.split('The mount holds calibration').length - 1
    expect(times, `the text a comment was written on was printed ${String(times)} times`).toBe(1)
  })

  it('keeps record ids, block ids and stored field paths out of Normal', () => {
    const html = expanded(moved)
    expect(html, 'a record id was drawn in Normal mode').not.toContain('JgwUmrzxIqkn')
    expect(html, 'a stored field path was drawn in Normal mode').not.toContain('data.blocks[#b-open].text')
  })

  it('still says the words moved, because that is what somebody has to act on', () => {
    // The pane's own short mark, the one already on the row, rather than the server's paragraph.
    expect(expanded(moved)).toContain('Quoted words no longer there')
  })

  it('gives the whole of the server sentences to Developer detail, where the ids belong', () => {
    const html = expanded(moved, { inspect: true })
    expect(html).toContain('JgwUmrzxIqkn')
    expect(html).toContain('data.blocks[#b-open].text')
  })
})

// ============================================================ 5. where a review collects

describe('what a review started from the interface is about', () => {
  /**
   * The pane handed Mole Office the page's address every time, and a page derives the widest scope there
   * is. So a review started while reading one report collected every comment written anywhere in
   * the project, and five of the six scopes had no path through the interface at all.
   */
  const contains = (outer: string, inner: string) => outer !== inner && inner.startsWith(`${outer}/`)

  it('is the one thing on the page that contains all the others', () => {
    const onAReport = ['r', 'r/b1', 'r/b1/cell', 'r/b2']
    expect(bar.theOneInside(onAReport, contains)).toBe('r')
  })

  it('is nothing at all when the page is about several things, so the page answers instead', () => {
    // Home draws six unrelated things. There is no single thing it is about, and saying it was
    // about the first one found would be a guess about what somebody meant.
    expect(bar.theOneInside(['a', 'b', 'c'], contains)).toBe(null)
    expect(bar.theOneInside([], contains)).toBe(null)
  })

  it('is the thing itself when the page draws exactly one', () => {
    expect(bar.theOneInside(['only'], contains)).toBe('only')
  })
})

// ============================================================ 6. one comment is not sent twice

describe('handing one comment to one agent', () => {
  /**
   * MEASURED: two presses made two dispatched conversations titled the same, three seconds apart,
   * and the second stamp answered 200. The screen was one cause and the missing guard was the other.
   *
   * ---------------------------------------------------------------------------------------
   * THE GUARD MOVED TO THE SERVER, AND THIS TEST MOVED WITH IT
   * ---------------------------------------------------------------------------------------
   *
   * It used to be a read in this browser function: fetch the comment, look at its stored `state`,
   * throw if it was not `queued`. Two things were wrong with that. It was the BROWSER'S rule, so
   * any other caller of the same routes had none. And it read the field that could be wrong — the
   * one stamped from here after the send, in a `try/catch` that could fail without failing
   * anything.
   *
   * The rule is now `addMessage`'s, over the one store, and `tests/dispatch-store.test.ts` drives
   * it through HTTP. What is left for this file to prove is the half that is still this function's:
   * it says which comment the words came from, so the server has something to refuse on. A send
   * that did not would go through twice and nothing would have said so.
   */
  it('says which comment the words came from, so the server can refuse a second send', async () => {
    const asked: { key: string; body: unknown }[] = []
    ;(globalThis as unknown as { fetch: unknown }).fetch = (
      path: string,
      init?: { method?: string; body?: string },
    ) => {
      const key = `${init?.method ?? 'GET'} ${path}`
      asked.push({ key, body: init?.body === undefined ? null : JSON.parse(init.body) })
      const reply =
        key === 'POST /api/agent/threads' ? { thread: { id: 't1' } } : { outcome: { sent: 1, held: [], runs: [] } }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(reply)) })
    }

    await api.sendOneComment({
      noteId: 'n1',
      body: 'x',
      context: { target: { kind: 'record', recordId: 'r1', workspaceId: 'panelx' } },
      intent: 'review',
      recipient: { kind: 'new', sessionId: null, said: null, why: null },
      title: 'Review: x',
    })

    const wrote = asked.find((one) => one.key === 'POST /api/agent/threads/t1/messages')
    expect(wrote, 'the words were never written into a conversation').toBeDefined()
    expect(
      (wrote?.body as { fromAnnotationId?: string }).fromAnnotationId,
      'the message does not say which comment it carried, so nothing can tell it has gone out',
    ).toBe('n1')

    // AND NOTHING IS STAMPED ON THE COMMENT AFTERWARDS. That PATCH was the second store.
    expect(
      asked.map((one) => one.key).filter((key) => key.startsWith('PATCH /api/records/')),
      'the comment was stamped from the browser after the send, which is the second store',
    ).toEqual([])
  })
})

// ============================================================ 9. one review, one conversation

/**
 * THE PRESS THAT SENDS ONE COMMENT DOES NOT MAKE ITS OWN CONVERSATION.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT WENT WRONG, AND WHY THIS IS A TEST OF THE SOURCE
 * ---------------------------------------------------------------------------------------------
 *
 * "Send this comment" called `sendOneComment`, which opens a fresh `direct` conversation through
 * the agent routes, writes the words into it and dispatches it. That is the right thing for a
 * comment belonging to no review — the composer still does it — and the wrong thing inside one.
 * The comment went out in a conversation nothing tied to the review; the review's own conversation
 * went on listing it as "Not sent yet", addressed to a dead run, printing the reason it could not
 * go; and the pane's heading counted it as sent. Two authoritative screens, two answers about one
 * comment. Point 26 of design/ROUND-EIGHT-DOGFOOD.md, 19 August 2026.
 *
 * WHAT PANELX DOES INSTEAD is send that much of the review — `POST /api/reviews/:id/send` with the
 * one comment named — and tests/review-send.test.ts holds what that means on the server.
 *
 * THIS IS A TEST OF THE FILE'S TEXT because the defect is which function the press calls, and a
 * rendered string cannot say. It is narrow on purpose: the pane may not reach for any call that
 * makes a conversation of its own.
 */
describe('the review pane cannot open a conversation of its own', () => {
  it('calls none of the conversation-making calls, so one comment cannot go out beside its review', async () => {
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(
      new URL('../src/web/components/agent/ReviewBar.tsx', import.meta.url),
      'utf8',
    )
    // THE COMMENTS IN THIS FILE TALK ABOUT `sendOneComment` ON PURPOSE, so what is looked for is a
    // CALL and not a mention: the name followed by an open bracket, which no prose in it has.
    for (const call of ['sendOneComment(', 'api.newAgentThread(', 'handOverToOneAgent(']) {
      expect(
        source.includes(call),
        `the review pane calls ${call} — a comment sent from a row would go out in a conversation the review ` +
          `does not name, and the two screens would then disagree about whether it had been sent`,
      ).toBe(false)
    }
    // AND IT DOES SEND, through the review. A file that called nothing would pass the check above.
    expect(source).toContain('api.sendReview(')
  })
})
