// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANE, AND THE THREE THINGS ROUND EIGHT DEFERRED TO IT.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------------
 *
 * Three things were measured as missing at the end of the last pass, and each of them fails
 * quietly — the screen goes on looking finished while saying nothing:
 *
 *   1. NO COMMENT RECORDED THE REVISION IT WAS WRITTEN AGAINST, so the ledger built for exactly
 *      that could not be reached from the interface. `revisionToStamp` is the whole decision and it
 *      is arithmetic over two readings, so it is put here without a browser and without a server.
 *   2. THE LIST NEVER SAID A QUOTE HAD GONE STALE. With two of seven quotes stale, all seven rows
 *      drew the quote and nothing else. `staleWords` and the row that draws it are pinned below.
 *   3. A COMMENT COULD NOT TAKE YOU TO THE THING IT IS ABOUT. Which page holds each thing a person
 *      can point at is a total map, and `pageHolding` is checked over every target kind
 *      so that a fourteenth cannot arrive as a row nothing opens.
 *
 * And one more, from design/UX-CONTRACT.md by name: a half-written comment survived a view change
 * and not a reload, and nothing said which. What the box says about that is one function, and the
 * two answers it gives are different promises rather than one sentence with a word changed.
 *
 * WHAT IS NOT HERE. Whether the words really light up on the page, whether the pane really narrows
 * the reading, and whether the two presses really do two things are properties of a browser, and
 * they were driven in Chromium against a throwaway copy of the corpus. This file holds what can be
 * decided without one.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { TARGET_KINDS, type Context, type Place, type Seen, type Target } from '../src/shared/targets.ts'
import { PLACE_STATES, READING_STATES } from '../src/shared/states.ts'
import type { ContextReading } from '../src/server/lib/agents.ts'
import type { FoundMember } from '../src/server/lib/reviews.ts'

type Bar = typeof import('../src/web/components/agent/ReviewBar.tsx')
type Mark = typeof import('../src/web/components/agent/MarkLayer.tsx')
type Talk = typeof import('../src/web/components/agent/TalkBox.tsx')
type Api = typeof import('../src/web/api.ts')

let bar: Bar
let marks: Mark
let talk: Talk
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
  marks = await import('../src/web/components/agent/MarkLayer.tsx')
  talk = await import('../src/web/components/agent/TalkBox.tsx')
  api = await import('../src/web/api.ts')
})

const render = (el: React.ReactElement): string => renderToStaticMarkup(el)

// ============================================================ 1. the revision a comment carries

describe('which revision a comment says it was written against', () => {
  it('stamps what the record is now when this browser never drew a page of it', () => {
    // A row in a list carries a title and no version, so there is nothing to compare with. The read
    // taken at the moment of writing is the evidence, and it is a real read.
    const out = api.revisionToStamp(null, { seq: 7, contentHash: 'abc' })
    expect(out).toEqual({ revision: { seq: 7, contentHash: 'abc' }, changedSinceDrawn: false })
  })

  it('stamps the revision the page was drawn from when the record still holds it', () => {
    const drawn = { seq: 4, contentHash: 'held' }
    expect(api.revisionToStamp(drawn, { seq: 4, contentHash: 'held' })).toEqual({
      revision: drawn,
      changedSinceDrawn: false,
    })
  })

  /**
   * THE ONE THAT MATTERS. Somebody else changed the record after the page was drawn, so the reader
   * is looking at older words than the ones stored. Neither revision is a true answer to "what was
   * this written against", and Mole Office says nothing rather than the convenient thing.
   */
  it('stamps NOTHING when the page was drawn from something older, and says the page has moved on', () => {
    const out = api.revisionToStamp({ seq: 4, contentHash: 'old' }, { seq: 9, contentHash: 'new' })
    expect(out.revision, 'a stale page was stamped with the newest revision').toBe(null)
    expect(out.changedSinceDrawn, 'the screen was not told the page had moved on').toBe(true)
  })

  it('stamps nothing when this database has no revision holding what was read', () => {
    // `revisionSeq` is null on a database whose ledger holds nothing with that content. There is no
    // revision to name, so nothing is named.
    expect(api.revisionToStamp(null, { seq: null, contentHash: 'abc' })).toEqual({
      revision: null,
      changedSinceDrawn: false,
    })
  })
})

// ============================================================ 2. where a comment can take you

describe('the page holding what a comment is about', () => {
  /** One of each kind, built from the declaration so none can be forgotten here. */
  const someTarget = (kind: string): Target => {
    const built: Record<string, Target> = {
      record: { kind: 'record', recordId: 'r1', workspaceId: 'panelx' },
      plan: { kind: 'plan', planId: 'p1' },
      reportBlock: { kind: 'reportBlock', recordId: 'r1', blockId: 'b-1' },
      region: { kind: 'region', recordId: 'r1', regionId: 'data.blocks[#b-1].text@412' },
      change: { kind: 'change', recordId: 'r1', changeId: 'c1' },
      tableRow: { kind: 'tableRow', recordId: 'r1', blockId: 'b-1', rowKey: '2' },
      tableCell: { kind: 'tableCell', recordId: 'r1', blockId: 'b-1', rowKey: '2', columnKey: '3' },
      planLine: { kind: 'planLine', planId: 'p1', lineId: 'l1' },
      planLineFact: { kind: 'planLineFact', planId: 'p1', lineId: 'l1', fact: 'size' },
      scheduleBlock: { kind: 'scheduleBlock', windowId: 'w1' },
      graphNode: { kind: 'graphNode', recordId: 'r1', drawing: 'plan-graph' },
      agentMessage: { kind: 'agentMessage', messageId: 'm1' },
      annotation: { kind: 'annotation', annotationId: 'n1' },
      proposedAction: { kind: 'proposedAction', interpretationId: 'i1', actionId: 'a-2' },
      draft: { kind: 'draft', draftId: 'd1' },
      page: { kind: 'page', route: '/records' },
      uiSurface: { kind: 'uiSurface', surfaceId: 'rail.modules' },
    }
    const one = built[kind]
    if (one === undefined) throw new Error(`this test has no example of a ${kind}`)
    return one
  }

  /**
   * A CONTEXT AROUND ONE TARGET. `pageHolding` takes the whole context now, because what a
   * comment on a part of Mole Office's own screen can open is decided by the evidence stored beside the
   * target and not by the target alone. Every other kind ignores everything but the target.
   */
  const about = (kind: string, seen?: Seen): Context => ({ target: someTarget(kind), ...(seen === undefined ? {} : { seen }) })

  it('answers for every one of the seventeen, so a comment cannot be a row nothing opens', () => {
    expect(TARGET_KINDS.length, 'the vocabulary changed size and this test was not told').toBe(17)
    for (const kind of TARGET_KINDS) {
      const answer = bar.pageHolding(about(kind))
      const said = 'path' in answer ? answer.path : 'seenOn' in answer ? answer.seenOn : answer.cannot
      expect(said.length, `${kind} answered with nothing at all`).toBeGreaterThan(0)
    }
  })

  it('sends every piece of a record to that record page', () => {
    for (const kind of ['record', 'reportBlock', 'region', 'change', 'tableRow', 'tableCell', 'graphNode']) {
      const answer = bar.pageHolding(about(kind))
      expect(answer, `${kind} does not open the record it is part of`).toEqual({ path: '/r/r1' })
    }
  })

  it('sends a plan, a line and one fact of it to the plan, and a note to its own record page', () => {
    expect(bar.pageHolding(about('plan'))).toEqual({ path: '/plans/p1' })
    expect(bar.pageHolding(about('planLine'))).toEqual({ path: '/plans/p1' })
    expect(bar.pageHolding(about('planLineFact'))).toEqual({ path: '/plans/p1' })
    // A note is a record, so it needs no page of its own.
    expect(bar.pageHolding(about('annotation'))).toEqual({ path: '/r/n1' })
  })

  it('opens a page at the address the comment stored, rather than at wherever the reader is', () => {
    expect(bar.pageHolding(about('page'))).toEqual({ path: '/records' })
  })

  it('ranks a question about one plan fact with the line that carries it', () => {
    expect(api.rankingAsk(about('planLineFact'))).toEqual({ kind: 'planLine', planId: 'p1', lineId: 'l1' })
  })

  it('refuses the two nothing can open, and says why there is no page', () => {
    // IT USED TO ASK FOR THE WORDS "does not store", and that pinned the assertion to one reason.
    // Mole Office DOES store a reading of a comment now — one sentence, on the comment — and the true
    // refusal for a single proposed action became narrower: an action inside that sentence has no
    // identity of its own, so there is no object a page could hold. What both refusals owe the
    // reader is the same either way: that there is no page, and why.
    for (const kind of ['proposedAction', 'draft']) {
      const answer = bar.pageHolding(about(kind))
      expect('cannot' in answer, `${kind} claimed to have a page`).toBe(true)
      if ('cannot' in answer) {
        expect(answer.cannot, `${kind} refuses without saying there is no page`).toContain('no page holding')
        expect(answer.cannot.split(/\s+/).length, `${kind} refuses without a reason`).toBeGreaterThan(8)
      }
    }
  })
})

// ============================================================ 3. when a quote has gone stale

describe('a row says when what it points at has moved under it', () => {
  const reading = (over: Partial<ContextReading> = {}): ContextReading => ({
    state: 'there',
    about: 'the module "Close-up camera", r1',
    says: 'Still there, in the same place.',
    ...over,
  })

  it('says nothing when the thing and the words are both still there', () => {
    expect(bar.staleWords(reading())).toBe(null)
  })

  it('says the words have gone, and that somebody has to look', () => {
    const out = bar.staleWords(
      reading({
        state: 'changed',
        quote: { words: 'the mast moved', stillThere: false, at: null, field: 'summary', lookedEverywhere: false },
      }),
    )
    expect(out).toEqual({ kind: 'act', words: 'Quoted words no longer there' })
  })

  it('says the thing itself is gone', () => {
    expect(bar.staleWords(reading({ state: 'gone' }))).toEqual({ kind: 'act', words: 'Subject no longer there' })
  })

  it('says the thing has changed when no words were quoted', () => {
    expect(bar.staleWords(reading({ state: 'changed' }))).toEqual({
      kind: 'act',
      words: 'Changed since written',
    })
  })

  /**
   * NOBODY LOOKED IS NOT NOTHING IS THERE. `unknown` is Mole Office being unable to tell, which needs
   * nobody to do anything, and it is a different answer from the words having gone.
   */
  it('keeps "Mole Office cannot tell" apart from "the words have gone"', () => {
    expect(bar.staleWords(reading({ state: 'unknown' }))).toEqual({ kind: 'cannot say' })
  })
})

describe('the row a person reads', () => {
  const member = (over: Partial<FoundMember> = {}): FoundMember => ({
    found: true,
    source: 'annotation',
    id: 'n1',
    body: 'These two numbers disagree and the paragraph does not say which is right.',
    context: {
      target: { kind: 'record', recordId: 'r1', workspaceId: 'panelx' },
      span: { quote: 'the 3 mm depth figure', from: 4, to: 25, field: 'summary' },
    },
    reading: {
      state: 'there',
      about: 'the module "LeafCam 2 overhead camera", r1',
      says: 'Still there, in the same place.',
      quote: { words: 'the 3 mm depth figure', stillThere: true, at: 4, field: 'summary', lookedEverywhere: false },
    },
    state: 'queued',
    created: '2026-08-19 09:00:00',
    createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    key: 'record/r1/panelx',
    interpretation: null,
    chosen: null,
    restrictions: null,
    ...over,
  })

  const row = (one: FoundMember, to: string | null = null) =>
    render(
      h(bar.ReviewRow, {
        member: one,
        inspect: false,
        to,
        lit: null,
        onGo: () => {},
        onOpen: () => {},
        openNow: false,
      }),
    )

  it('draws what the person wrote, where it came from, and the words it was left on', () => {
    const html = row(member())
    expect(html).toContain('These two numbers disagree')
    expect(html).toContain('the module &quot;LeafCam 2 overhead camera&quot;')
    expect(html).toContain('the 3 mm depth figure')
  })

  /**
   * THE MEASURED DEFECT, PINNED. Two of seven quotes were stale and all seven rows drew the quote
   * and nothing else. Both have to be on the row: the quote says which words, and the mark says
   * they are not those words any more.
   */
  it('draws the quote AND says it has gone stale, which is the pair that was missing', () => {
    const html = row(
      member({
        reading: {
          state: 'changed',
          about: 'the module "LeafCam 2 overhead camera", r1',
          says: 'The text has changed.',
          quote: {
            words: 'the 3 mm depth figure',
            stillThere: false,
            at: null,
            field: 'summary',
            lookedEverywhere: false,
          },
        },
      }),
    )
    expect(html, 'the quote is gone from the row').toContain('the 3 mm depth figure')
    expect(html, 'nothing on the row says the words moved').toContain('Quoted words no longer there')
  })

  it('names the resolved destination instead of a typed hint, and says when nobody is chosen', () => {
    const html = row(member({ recipientName: 'Calibration Agent' }), 'an old recipient hint')
    expect(html).toContain('For Calibration Agent')
    expect(html).not.toContain('For an old recipient hint')
    expect(row(member({ recipientName: null }))).toContain('No recipient')
  })

  it('says where a comment stands only when it is not the ordinary state of a review', () => {
    // A word repeated on every row is furniture. The pane's heading carries how many have gone.
    expect(row(member())).not.toContain('px-rev-stands')
    expect(row(member({ state: 'sent' }))).toContain('Sent')
  })

  /**
   * THE MEASURED DEFECT: A MACHINE TOKEN ON A SCREEN.
   *
   * Wave 3 made where a comment has got to one of six words and deleted `answered`. The pane's word
   * list still held three and returned the stored word for anything else, so a row read `handled`,
   * `picked_up` or `failed` — an underscore and all — in a product whose plain-language rule is an
   * invariant and which says in as many words: do not name a thing on screen after the mechanism
   * that produces it.
   */
  it('draws a reader\'s word for every one of the six, and never the stored token', () => {
    // THE SIX ARE WRITTEN OUT HERE BECAUSE THIS FILE OPENS NO DATABASE, and `MESSAGE_STATES` lives
    // in the file that holds the only writer of the column, which does. The list is pinned to that
    // declaration by tests/annotation.test.ts, which also fails when one of the six has no reading
    // in `STATE_WORDS`. So a seventh word cannot arrive unread: that file catches it, and this one
    // says what the pane does with the ones there are.
    const six = ['queued', 'sent', 'delivered', 'picked_up', 'handled', 'failed'] as const
    for (const stored of six) {
      const said = bar.standsWords(stored)
      if (stored === 'queued') {
        expect(said, 'a comment nobody has sent is the ordinary state and says nothing').toBe(null)
        continue
      }
      expect(said, `no reader's word for "${stored}"`).not.toBe(null)
      expect(said, `"${stored}" reached a screen with no reading`).not.toContain('unknown state')
      expect(said, `"${stored}" reached a screen as a machine token`).not.toContain('_')
    }
    // The two that are not already English, said in full rather than left to a punctuation rule.
    expect(bar.standsWords('picked_up')).toBe('Picked up')
    expect(bar.standsWords('handled')).toBe('Dealt with')
    // And a row draws it, so this is not a statement about a function nobody calls.
    const drawn = row(member({ state: 'handled' }))
    expect(drawn).toContain('Dealt with')
    expect(drawn).not.toContain('>handled<')
  })



  /**
   * A COMMENT THAT HAS GONE OUT IS ONE THE MARK LAYER DRAWS AS GONE, WHATEVER WORD IT HAS REACHED.
   *
   * The row asked whether the state was exactly `sent`, so a comment a run had picked up or dealt
   * with was carried to the page it was left on as still waiting for somebody to send it — and the
   * same expression gates the Send button and the "Already sent" line beside it.
   */
  it('counts a comment as gone for every word except the one that means nobody has it', () => {
    expect(bar.noteOfMember(member({ state: 'queued' })).sent).toBe(false)
    for (const word of ['sent', 'delivered', 'picked_up', 'handled', 'failed']) {
      expect(bar.noteOfMember(member({ state: word })).sent, `"${word}" means it has gone`).toBe(true)
    }
  })

  it('tells a person a comment a run has dealt with has already gone, and does not offer to send it', () => {
    const html = render(
      h(bar.MemberDetail, {
        member: member({ state: 'handled' }),
        reviewId: 'rev1',
        inspect: false,
        collecting: false,
        frozen: false,
        editing: false,
        onEditing: () => {},
      }),
    )
    expect(html).toContain('Already sent')
    expect(html, 'a comment already dealt with was offered for sending again').not.toContain('>Send<')
  })


  /**
   * THE ROW SAYS WHICH MARK THE PRESS MANAGED TO PUT ON THE PAGE, and that is the half that was
   * missing. A comment made on a whole record scrolled the page, drew an edge down both sides of a
   * nineteen-screen article, and left the row reading exactly what it read before the press.
   */
  it('says in one word what was marked, for each of the places that are not exact words', () => {
    const said = (place: Place | null, drawn: 'words' | 'rail' | 'frame' | 'none') =>
      render(
        h(bar.ReviewRow, {
          member: member(),
          inspect: false,
          to: null,
          lit: { state: 'found', key: 'record/r1/panelx', annotationId: 'n-1', words: drawn === 'words', drawn, place },
          onGo: () => {},
          onOpen: () => {},
          openNow: false,
        }),
      )
    expect(said({ at: 'surface' }, 'frame')).toContain(PLACE_STATES.surface.word)
    expect(said({ at: 'quote', words: 'six words somebody chose' }, 'frame')).toContain(PLACE_STATES.quote.word)
    expect(said({ at: 'run', field: 'data.blocks[#b-1].text', offset: 0 }, 'rail')).toContain(PLACE_STATES.run.word)
    // NOTHING RECORDED IS NOT THE SAME AS "THE WHOLE THING", and the two must not read alike.
    expect(said(null, 'none')).toContain(READING_STATES.notKnown.word)
    expect(said(null, 'none')).not.toContain(PLACE_STATES.surface.word)
    // The wash on the exact characters is the answer, and §8.2 gives that row no word of its own.
    const exact = said({ at: 'words', span: { quote: 'x', from: 0, to: 1 } }, 'words')
    expect(exact).not.toContain(PLACE_STATES.surface.word)
    expect(exact).not.toContain(PLACE_STATES.run.word)
  })

  it('says nothing about a place while it is still looking for one', () => {
    const html = render(
      h(bar.ReviewRow, {
        member: member(),
        inspect: false,
        to: null,
        lit: { state: 'looking', key: 'record/r1/panelx', annotationId: 'n-1' } as const,
        onGo: () => {},
        onOpen: () => {},
        openNow: false,
      }),
    )
    expect(html).toContain('Looking for it')
    expect(html).not.toContain(PLACE_STATES.surface.word)
  })
})


// ============================================================ 4. taking somebody to the words

describe('the mark that shows the one comment somebody pressed', () => {
  const shown = (place: Place | null, drawn: 'words' | 'rail' | 'frame' | 'none') => ({
    key: 'record/r1/panelx',
    place,
    drawn,
  })

  it('washes the words when they could be placed, and outlines nothing else', () => {
    const rule = marks.showingRule(shown({ at: 'words', span: { quote: 'x', from: 0, to: 1 } }, 'words'))
    expect(rule, 'the words are not lit at all').toContain('::highlight(mole-office-showing)')
    expect(rule, 'a whole record page was outlined as well as the words inside it').not.toContain('outline:')
    expect(rule, 'exact characters were drawn the way two ends are drawn').toContain('text-decoration-style: solid')
  })

  /**
   * WHY THERE IS NO OUTLINE ANY MORE, AND WHY THAT IS THE FIX RATHER THAN A LOSS.
   *
   * A solid outline on the element carrying the key was the ONE drawing available to every place
   * that is not exact characters, so a comment on one line, a comment whose words could not be
   * placed, and a comment on a whole record were all drawn the same way. §8.2 gives those three
   * their own marks — a rail, a frame with a doubled quote glyph, a frame — and they are rectangles
   * measured from the document rather than a rule naming an element that is often the whole page.
   */
  it('draws no outline for a place that names no words, whichever place it is', () => {
    for (const place of [
      { at: 'surface' } as const,
      { at: 'quote', words: 'six words somebody chose' } as const,
      { at: 'run', field: 'data.blocks[#b-1].text', offset: 0 } as const,
    ]) {
      const rule = marks.showingRule(shown(place, marks.markForPlace(place)))
      expect(rule, 'four different places were drawn as one outline again').not.toContain('outline:')
    }
  })

  it('draws the wash dashed when the place is two ends and solid when it is exact characters', () => {
    const across = {
      at: 'across' as const,
      from: { quote: 'a', from: 0, to: 1 },
      to: { quote: 'b', from: 8, to: 9 },
      parts: 2,
      partWord: 'blocks',
    }
    expect(marks.showingRule(shown(across, 'words'))).toContain('text-decoration-style: dashed')
  })

  it('draws nothing when nothing is being shown', () => {
    expect(marks.showingRule(null)).toBe('')
  })

  it('quotes a key that carries a quotation mark, so a selector cannot be broken by an id', () => {
    const rule = marks.showingRule({ key: 'page/"odd"', place: { at: 'surface' }, drawn: 'frame' })
    expect(rule).toContain('page/\\"odd\\"')
  })
})

/**
 * EVERY PLACE GETS THE MARK ITS OWN VOCABULARY ROW ASKS FOR, and no two of the five agree by
 * accident. This is the reading that used to be thrown away one component before it was drawn.
 */
describe('which of the five marks a place asks for', () => {
  it('answers each of the five places, and answers a missing place differently', () => {
    expect(marks.markForPlace({ at: 'words', span: { quote: 'x', from: 0, to: 1 } })).toBe('words')
    expect(
      marks.markForPlace({
        at: 'across',
        from: { quote: 'a', from: 0, to: 1 },
        to: { quote: 'b', from: 8, to: 9 },
        parts: 2,
        partWord: 'blocks',
      }),
    ).toBe('words')
    expect(marks.markForPlace({ at: 'run', field: 'data.blocks[#b-1].text', offset: 0 })).toBe('rail')
    expect(marks.markForPlace({ at: 'quote', words: 'six words somebody chose' })).toBe('frame')
    expect(marks.markForPlace({ at: 'surface' })).toBe('frame')
    // A context that recorded no place at all is not "the whole thing": nothing is drawn about
    // where, because nothing was written down about where.
    expect(marks.markForPlace(null)).toBe('none')
  })

})

// ============================================================ 5. words that are not a comment yet


describe('half-written comments kept in this browser', () => {
  /**
   * THIS ASSERTION CHANGED BECAUSE THE PRODUCT GOT MORE HONEST, and it is worth saying which way.
   *
   * It used to say that a stored row reads back as exactly the three fields it was written with. An
   * unsent instruction is now a thing a person can point at, so it carries an id and whatever
   * changes were made to it before it went — and a row written by the build that had neither is
   * still read rather than thrown away, because it holds words somebody typed. So what comes back
   * is the same three fields plus an id and an empty list of changes.
   *
   * WHAT IS STILL PINNED IS THE PART THAT MATTERS: the words are not touched. See
   * tests/an-unsent-instruction.test.ts for the rest of what a stored instruction owes.
   */
  it('reads back what it wrote', () => {
    const stored = JSON.stringify([{ key: 'record/r1/panelx', intent: 'ask', body: 'half a thought' }])
    const read = talk.draftsFromStored(stored)
    expect(read?.length).toBe(1)
    expect(read?.[0]?.key).toBe('record/r1/panelx')
    expect(read?.[0]?.intent).toBe('ask')
    expect(read?.[0]?.body).toBe('half a thought')
    expect(read?.[0]?.changes).toEqual([])
  })

  it('drops a stored list this build cannot read, rather than half-restoring it', () => {
    expect(talk.draftsFromStored('not json at all')).toBe(null)
    expect(talk.draftsFromStored('{"key":"r1"}')).toBe(null)
    expect(talk.draftsFromStored(JSON.stringify([{ key: 'r1', body: 'x' }]))).toBe(null)
    // A word this build has no meaning for is not a meaning it can guess at.
    expect(talk.draftsFromStored(JSON.stringify([{ key: 'r1', intent: 'ponder', body: 'x' }]))).toBe(null)
  })
})

// ============================================================ 6. who a comment seemed to be for

describe('who a comment seemed to be for', () => {
  const record = (id: string, data: Record<string, unknown>) =>
    ({ id, data }) as unknown as Parameters<Bar['hintsFrom']>[0][number]

  it('reads the hint the person wrote, and says nothing about the ones who wrote none', () => {
    const found = bar.hintsFrom([
      record('n1', { recipientHint: 'the calibration agent' }),
      record('n2', {}),
      record('n3', { recipientHint: '   ' }),
    ])
    expect(found.get('n1')).toBe('the calibration agent')
    expect(found.has('n2'), 'a comment nobody named was given somebody').toBe(false)
    expect(found.has('n3'), 'a hint of nothing but spaces was kept').toBe(false)
  })
})
