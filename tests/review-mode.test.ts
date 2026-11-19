// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REVIEW MODE, AND THE THREE THINGS ABOUT IT THAT COULD BE WRONG IN SILENCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Collecting is one remembered fact — is this browser collecting, and which review the comments
 * belong to — and every way it can be wrong is quiet:
 *
 *   1. A REMEMBERED VALUE THIS BUILD DOES NOT KNOW IS DROPPED, and the column starts closed. It used
 *      to be announced as well, through reviewFaults(), but no page ever drew that list, so it was
 *      removed (plan 7FEOshq3mBGG, row F1). Nothing on a page says so today; that gap is recorded
 *      for the review pane's owners.
 *   2. WHICH REVIEW IS SURVIVING A RELOAD. The comments themselves are on the server, so the one
 *      thing this browser has to remember is which review to count the next one into. Forgetting it
 *      looks exactly like the review being empty.
 *   3. A BROWSER THAT REFUSES STORAGE STILL COLLECTS. What it cannot do is survive a reload. The
 *      sentence that said so went with reviewFaults(), which no page drew; the same gap as point 1.
 *
 * The same three are pinned for the other global mode in tests/mode.test.ts, and this file is
 * deliberately its shape: the module reads its setting ONCE, at import, so every test imports it
 * fresh against a window stand-in of its own.
 *
 * ---------------------------------------------------------------------------------------
 * THE OTHER HALF: WHAT A MARK AND A SENTENCE READ AS
 * ---------------------------------------------------------------------------------------
 *
 * `markOn` is how a page finds out that an object has a comment waiting, and it is the one place
 * that could quietly draw nothing for ever: the server sends a key of its own, and this browser
 * deliberately does not read it. So the test below builds a mark exactly as the server sends one
 * and checks the object on screen finds it — and that "nobody has asked yet" is not drawn as "none
 * waiting", which is the fifth engineering rule on a page with forty rows.
 */

import { checkSubtraction } from '../src/shared/disclosure.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

type ReviewModule = typeof import('../src/web/lib/review.ts')
const PROJECT = 'project-a'

/** A fresh window with a chosen memory, and the module imported against it. */
async function boot(options: { stored?: Record<string, string>; refuse?: boolean } = {}) {
  const store = new Map<string, string>(Object.entries(options.stored ?? {}))
  store.set('mole-office.workspace', PROJECT)
  const storage = {
    getItem: (k: string) => {
      if (options.refuse === true) throw new Error('storage is disabled in this profile')
      return store.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (options.refuse === true) throw new Error('storage is disabled in this profile')
      store.set(k, v)
    },
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.resetModules()
  const review = (await import('../src/web/lib/review.ts')) as ReviewModule
  return { review, store }
}

describe('review mode', () => {
  it('is off for somebody who has never opened the column', async () => {
    const { review } = await boot()
    expect(review.currentReview()).toEqual({ on: false, reviewId: null, reviewProjectId: null, showing: null, showingProjectId: null, commentsOn: null, open: false })
  })

  it('remembers that the column was open on the list of reviews', async () => {
    const { review } = await boot({ stored: { 'mole-office.review': 'list' } })
    expect(review.currentReview()).toEqual({ on: false, reviewId: null, reviewProjectId: null, showing: null, showingProjectId: null, commentsOn: null, open: true })
  })

  it('remembers WHICH review is collecting, so a reload counts into the same one', async () => {
    // THE FAILURE THIS CATCHES: a reload that keeps "collecting is on" and loses the review id
    // starts a second review on the next comment. Both would be real and neither would be whole,
    // and the screen would say collecting was working the entire time.
    const { review } = await boot({ stored: { 'mole-office.review': 'on:Hdp1MnGuW__Q' } })
    expect(review.currentReview()).toEqual({
      on: true,
      reviewId: 'Hdp1MnGuW__Q',
      reviewProjectId: null,
      showing: 'Hdp1MnGuW__Q',
      showingProjectId: null,
      commentsOn: null,
      open: true,
    })
  })

  /**
   * THE FLAG THE COMPOSER READS FOLLOWS THE REVIEW'S OWN STATE, and this is the whole of what
   * `read:` is for. A review whose collecting has finished takes no more comments — membership
   * froze — and the composer must not go on saying the next one joins it.
   */
  it('keeps "the column is open" apart from "a comment written now joins a review"', async () => {
    const { review, store } = await boot({ stored: { 'mole-office.review': 'read:Hdp1MnGuW__Q' } })
    expect(review.currentReview()).toEqual({
      on: false,
      reviewId: null,
      reviewProjectId: null,
      showing: 'Hdp1MnGuW__Q',
      showingProjectId: null,
      commentsOn: null,
      open: true,
    })
    review.openReview('Hdp1MnGuW__Q', true, PROJECT)
    expect(review.currentReview().on).toBe(true)
    expect(store.get('mole-office.review')).toBe(`open|Hdp1MnGuW__Q|${PROJECT}|Hdp1MnGuW__Q|${PROJECT}`)
    review.openReview('Hdp1MnGuW__Q', false, PROJECT)
    expect(review.currentReview().on).toBe(false)
    expect(store.get('mole-office.review')).toBe(`open|Hdp1MnGuW__Q|${PROJECT}||`)
  })

  it('writes the review down as soon as Mole Office says which one is collecting', async () => {
    const { review, store } = await boot()
    review.openReviewList()
    expect(store.get('mole-office.review')).toBe('open||||')
    review.openReview('abc123', true, PROJECT)
    expect(store.get('mole-office.review')).toBe(`open|abc123|${PROJECT}|abc123|${PROJECT}`)
    expect(review.currentReview()).toEqual({ on: true, reviewId: 'abc123', reviewProjectId: PROJECT, showing: 'abc123', showingProjectId: PROJECT, commentsOn: null, open: true })
  })

  it('drops a saved value this build has no meaning for', async () => {
    // THE COLUMN STARTS CLOSED AND THE VALUE IS CLEARED, so nothing is guessed from it. Nothing on a
    // page says so; point 1 of the header says why and where that gap is recorded.
    const { review, store } = await boot({ stored: { 'mole-office.review': 'collecting-into-7' } })
    expect(review.currentReview()).toEqual({ on: false, reviewId: null, reviewProjectId: null, showing: null, showingProjectId: null, commentsOn: null, open: false })
    expect(store.has('mole-office.review')).toBe(false)
  })

  it('still works when the browser will not remember it', async () => {
    const { review } = await boot({ refuse: true })
    // IT STILL WORKS. Applying comes first and persisting second, so a locked-down profile loses
    // the memory of the review and not the review.
    review.openReviewList()
    expect(review.currentReview().open).toBe(true)
  })

  /**
   * CLOSING THE COLUMN, AND SEEING THE LIST, BOTH LEAVE THE REVIEW COLLECTING.
   *
   * MEASURED IN CHROMIUM ON 19 AUGUST 2026. A review was collecting on a report. The column was
   * closed. The composer on that report then offered "Send" and "Write it down and keep it" and
   * said afterwards that the comment was "kept with your reports and notes, and a review can send
   * it later". `GET /api/reviews/:id` came back with that comment as a member: it had joined the
   * review the composer had just said it would not be part of.
   *
   * The browser was the one that was wrong. Mole Office decides membership from where a review
   * collects, when it started and who wrote the comment, and asks nothing about a column. So
   * closing one changes what is DRAWN and nothing else.
   */
  it('leaves the review collecting when the column is closed', async () => {
    const { review, store } = await boot({ stored: { 'mole-office.review': 'on:abc123' } })
    review.leaveReview()
    expect(review.currentReview()).toEqual({ on: true, reviewId: 'abc123', reviewProjectId: null, showing: null, showingProjectId: null, commentsOn: null, open: false })
    expect(store.get('mole-office.review')).toBe('shut|||abc123|')
  })

  it('leaves the review collecting when the column goes back to the list', async () => {
    const { review } = await boot({ stored: { 'mole-office.review': 'on:abc123' } })
    review.openReviewList()
    expect(review.currentReview()).toEqual({ on: true, reviewId: 'abc123', reviewProjectId: null, showing: null, showingProjectId: null, commentsOn: null, open: true })
  })

  it('reading a finished review does not stop the one that is collecting', async () => {
    const { review } = await boot({ stored: { 'mole-office.review': `open|abc123|${PROJECT}|abc123|${PROJECT}` } })
    review.openReview('older99', false, 'project-b')
    expect(review.currentReview()).toEqual({
      on: true,
      reviewId: 'abc123',
      reviewProjectId: PROJECT,
      showing: 'older99',
      showingProjectId: 'project-b',
      commentsOn: null,
      open: true,
    })
  })

  it('counts every write to a review, so the frame knows to read it again', async () => {
    // WHAT THIS IS FOR: the composer that writes a comment and the bar that counts what is waiting
    // are in different parts of the tree, and neither may hold a copy of the comments. The count is
    // the whole signal — it says "go and read again" and nothing else.
    const { review } = await boot()
    const Counter = () => h('span', null, String(review.useReviewChanges()))
    const before = Number(renderToStaticMarkup(h(Counter)).replace(/\D/g, ''))
    review.reviewChanged()
    review.reviewChanged()
    const after = Number(renderToStaticMarkup(h(Counter)).replace(/\D/g, ''))
    expect(after - before).toBe(2)
  })
})

// ---------------------------------------------------------------------------- marks on objects

describe('which objects have a comment waiting', () => {
  it('finds the mark for an object by the one spelling of a key both sides use', async () => {
    // THE SILENT FAILURE THIS PREVENTS: two spellings of one key, one on each side. Nothing would
    // throw — every mark would simply stop being drawn, on every page, for ever.
    //
    // ROUND SEVEN AVOIDED IT BY IGNORING THE SERVER'S KEY and rebuilding one on this side from the
    // mark's context. Round eight removes the second spelling instead: `targetKey` in
    // src/shared/targets.ts is the ONE function that turns a target into a key, the server's
    // `marks` route calls it, this browser calls it, and it is also the value an addressable
    // element carries as `data-target`. So the key really is read now, and it is checked here
    // against what this side builds — which is what makes reading it safe.
    await boot()
    const { lookupKey } = await import('../src/web/components/agent/context.ts')
    const { markOn } = await import('../src/web/components/agent/marks.ts')
    const { targetKey } = await import('@shared/targets.ts')

    const target = { kind: 'record' as const, recordId: 'r1', workspaceId: 'panelx' }
    const context = { target }
    const mark = {
      // The key the server sends, built by the shared function. Nothing here types one out.
      key: targetKey(target),
      target,
      waiting: 2,
      threads: [{ id: 't1', title: 'Review, 18 August', mode: 'review' as const }],
      spans: [],
      // How many of the comments on this thing have already gone. A page draws a sent comment too —
      // it used to be dropped, so a mark disappeared at the moment its result started to matter.
      sent: 0,
    }
    // `marks` is what a page draws — the route's marks and the ones the waiting notes make, added
    // together in the browser because the route cannot see a note. `reply` stays the route's own
    // answer. Here the notes add nothing, so the two hold the same one mark.
    const read = {
      state: 'read' as const,
      // `goneOut` is the comments the server says have gone to somebody. None here: every comment
      // in this fixture is still waiting, which is what the marks above say.
      reply: { marks: [mark], subtraction: { candidates: 1, carried: 1, leftOut: 0, shortened: 0 }, leftOutGroups: [], leftOut: 0, covers: 'every waiting comment', goneOut: [] },
      marks: [mark],
      // The comment records the same read holds, and the places they point at. None of either
      // here: this test is about the counts, and empty lists are the honest thing to hand a reader
      // that asks for the words or for where they were written.
      comments: [],
      notes: [],
    }
    checkSubtraction('marks fixture', read.reply.subtraction, read.reply.leftOutGroups)
    expect(markOn(read, context)?.waiting).toBe(2)
    expect(lookupKey(context)).toBe('record/r1/panelx')
    // A different record is not this one.
    expect(markOn(read, { target: { kind: 'record', recordId: 'r2', workspaceId: 'panelx' } })).toBe(null)
    // A comment on a few words of the record is a comment on the record.
    expect(
      markOn(read, { target, span: { quote: 'the gripper', from: 0, to: 11 } })?.waiting,
    ).toBe(2)
  })

  it('draws nothing when nobody has asked, which is not the same as nothing waiting', async () => {
    await boot()
    const { markOn } = await import('../src/web/components/agent/marks.ts')
    const context = { target: { kind: 'record' as const, recordId: 'r1', workspaceId: 'panelx' } }
    expect(markOn({ state: 'unasked' }, context)).toBe(null)
    expect(markOn({ state: 'asking' }, context)).toBe(null)
    expect(markOn({ state: 'failed', message: 'the server is not running' }, context)).toBe(null)
  })
})

// ---------------------------------------------------------------------------- ids stay in Developer

describe('what a comment was about, in Normal', () => {
  it('keeps the record id off the screen and leaves the sentence readable', async () => {
    await boot()
    const { withoutIds } = await import('../src/web/components/agent/context.ts')
    const context = { target: { kind: 'record' as const, recordId: 'Hdp1MnGuW__Q', workspaceId: 'panelx' } }
    const said = 'the block "4B.2 probe pipeline, delete me › First block", Hdp1MnGuW__Q'
    expect(withoutIds(said, context)).toBe('the block "4B.2 probe pipeline, delete me › First block"')
    // Nothing else is rewritten: this only ever removes the ids the context itself names.
    expect(withoutIds('a plan line, nothing to remove', null)).toBe('a plan line, nothing to remove')
  })

  it('leaves a row and a column number in, because a position is not an id', async () => {
    await boot()
    const { withoutIds } = await import('../src/web/components/agent/context.ts')
    // MEASURED IN CHROMIUM ON 18 AUGUST 2026, the first time a person could point at a table cell:
    // the review pane read "row , column of the table in the report". A row number is a value a
    // person reads off the screen, not machinery, so it stays. `isPosition` on the declaration in
    // src/shared/targets.ts is what says which of the two a value is.
    const cell = {
      target: {
        kind: 'tableCell' as const,
        recordId: 'Hdp1MnGuW__Q',
        blockId: 'b-effort',
        rowKey: '2',
        columnKey: '3',
      },
    }
    const said = 'row 2, column 3 of the table b-effort in the report "What broke", Hdp1MnGuW__Q'
    const shown = withoutIds(said, cell)
    expect(shown).toContain('row 2, column 3')
    expect(shown, 'the record id is still on the screen in Normal detail').not.toContain('Hdp1MnGuW__Q')
  })
})
