// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A THING DRAWS WHEN NOBODY IS DOING ANYTHING: how many comments are on it, counting the ones
 * somebody started about it and never sent.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE MEASURED FAULTS THIS IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * ONE. The count was not drawn. The glyph was `❝` alone, and the number lived only in the
 * alternative text a screen reader announces. Measured on 20 August 2026: three comments on one
 * block of a report drew exactly what one comment draws, so a person looking at the page could not
 * tell them apart.
 *
 * TWO. Twenty kept instructions were invisible. Measured on 19 August 2026: zero elements matched
 * `[data-target^="draft/"]` on every page with no composer open. An instruction somebody began and
 * did not send could be found again only by pointing at the same thing and hoping. The store holds
 * twenty and drops the oldest to make room, so those words are losable as well as invisible.
 *
 * THREE. The count was drawn INSIDE THE WORDS IT COUNTED. Both numbers above were generated
 * content — `content: "❝ 1"` in a `::before` on the element carrying the block's key — and a
 * `::before` on a paragraph is that paragraph's first inline box. The owner left one comment on a
 * decision page on 4 September 2026 and read their own summary with a 1 spliced into the front of it.
 * What is wanted is a floating circle with the number of comments in it, never a mark inserted into the text.
 * Problem `muxtJ4V4HfUj`.
 *
 * ---------------------------------------------------------------------------------------
 * SO THERE IS ONE CIRCLE PER PLACE, AND IT IS PRESSED
 * ---------------------------------------------------------------------------------------
 *
 * `circlesToDraw` says what each circle holds: its key, its number, its name and the comment a
 * press goes to. One circle per place, so one number in it, so the comments on that place and the
 * drafts started on it are added together and the name says which of them are which.
 *
 * Marks used to be drawn and never pressed, and §8.3 of the interaction contract said so. It was
 * changed on 4 September 2026, in its own commit, before this was written; it keeps the old wording
 * quoted. A circle a person can see and cannot press is furniture.
 *
 * This file reads what would be drawn WITHOUT A BROWSER, because the runner has no layout engine.
 * Where the circle ends up on a page, and that it inserts nothing into the words, is measured in a
 * real browser by tests/a-comment-is-drawn-beside-the-words.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import type { DrawnMark } from '../src/web/components/agent/marks.ts'

type MarkLayer = typeof import('../src/web/components/agent/MarkLayer.tsx')
type Marks = typeof import('../src/web/components/agent/marks.ts')
let mark: MarkLayer
let marksModule: Marks

/**
 * The smallest stand-in for a browser's store, as tests/the-review-pane.test.ts uses.
 *
 * src/web/api.ts and src/web/lib/workspace.ts both read storage the moment they are imported, and
 * this module imports them, so the stand-in goes in before anything else. It is not under test: the
 * thing under test is what `keptDrafts` does with what it finds there.
 */
const store = new Map<string, string>()
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

/** One thing the server says has comments on it. */
const on = (key: string, waiting: number, sent = 0): DrawnMark => ({
  key,
  target: { kind: 'record', recordId: key, workspaceId: 'panelx' },
  waiting,
  sent,
  threads: [],
  spans: [],
})

beforeEach(async () => {
  vi.resetModules()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  mark = await import('../src/web/components/agent/MarkLayer.tsx')
  marksModule = await import('../src/web/components/agent/marks.ts')
})

afterEach(() => {
  vi.resetModules()
})

/** The circle built for this object, or null when nothing draws one. */
function circleFor(
  circles: readonly { key: string; count: number; name: string }[],
  key: string,
): { key: string; count: number; name: string } | null {
  return circles.find((one) => one.key === key) ?? null
}

describe('the number of comments is drawn, not only announced', () => {
  it('draws three where there are three, and one where there is one', () => {
    const circles = mark.circlesToDraw([on('a', 3), on('b', 1)])
    expect(circleFor(circles, 'a')?.count).toBe(3)
    expect(circleFor(circles, 'b')?.count).toBe(1)
  })

  it('counts only what has not gone where a place holds a sent and an unsent comment', () => {
    const circles = mark.circlesToDraw([on('a', 1, 2)])
    expect(circleFor(circles, 'a')?.count).toBe(1)
    // The name is about what has not gone too, so it does not announce the sent ones the number left out.
    // THE NAME IS READ FROM THE WORD LIST, not copied into this test, by the owner's
    // decision.
    const { t } = createI18n('en')
    expect(circleFor(circles, 'a')?.name).toBe(t('agentWords.mark.on.waiting', { n: 1, thing: 'record' }))
    expect(circleFor(circles, 'a')?.name).not.toContain('already sent')
  })

  it('draws a sent-only place only while sent marks are shown, and then counts and names the sent comment', () => {
    const { t } = createI18n('en')
    const reply = {
      subtraction: { candidates: 0, carried: 0, leftOut: 0, shortened: 0 },
      leftOutGroups: [],
      marks: [],
      leftOut: 0,
      covers: '',
      goneOut: ['gone'],
    }
    const sentOnly = [
      {
        id: 'gone',
        body: 'Made-up comment',
        context: { target: { kind: 'record', recordId: 'a', workspaceId: 'panelx' } },
        sent: true,
      },
    ] as const
    const key = 'record/a/panelx'
    const hidden = mark.circlesToDraw(marksModule.whatIsDrawn(reply, sentOnly, 'hide').marks)
    expect(circleFor(hidden, key), 'a sent comment drew a circle while sent marks were hidden').toBe(null)
    const shown = mark.circlesToDraw(marksModule.whatIsDrawn(reply, sentOnly, 'show').marks)
    expect(circleFor(shown, key)?.count).toBe(1)
    expect(circleFor(shown, key)?.name).toBe(t('agentWords.mark.on.sent', { n: 1, thing: 'record' }))
  })

  it('still says the text around the quoted words changed', () => {
    const circles = mark.circlesToDraw([on('a', 1)], ['a'])
    expect(circleFor(circles, 'a')?.count, 'the count changed because the quoted words moved').toBe(1)
    expect(circleFor(circles, 'a')?.name).toContain('The text around words one of them quoted has changed')
  })
})

/**
 * THE COUNT IS NEVER PUT INTO THE PAGE'S OWN TEXT. Problem `muxtJ4V4HfUj`.
 *
 * This is the half of that problem a test without a browser can hold: the mark layer produces a
 * LIST OF CIRCLES and no stylesheet at all, so there is nothing it could put into a paragraph. The
 * other half — that the block on a real page still reads exactly what the record says — is measured
 * in a browser by tests/a-comment-is-drawn-beside-the-words.test.ts.
 */
describe('nothing is drawn inside the words', () => {
  it('produces circles and no generated content of any kind', () => {
    const circles = mark.circlesToDraw([on('a', 2)], [], [{ key: 'a', kept: 1 }])
    const asText = JSON.stringify(circles)
    expect(asText, 'the mark layer still writes a ::before, which lands inside the words').not.toContain('::before')
    expect(asText, 'the mark layer still writes CSS generated content').not.toContain('content:')
    expect(asText, 'the quote glyph is back, which is what used to be spliced into the prose').not.toContain('❝')
    expect(asText, 'the pencil glyph is back, which was spliced in beside it').not.toContain('✎')
  })

  it('is a button a person can reach, which is what a circle nobody can press would not be', () => {
    const circles = mark.circlesToDraw([on('a', 1)])
    const one = circleFor(circles, 'a')
    expect(one?.name, 'the circle has no name, so a keyboard reader is told nothing').not.toBe('')
    expect(one?.name, 'the name does not say how many comments there are').toContain('1 comment')
    expect(one?.name, 'the name does not say which thing the comments are on').toContain('on this record')
  })
})

/**
 * WHAT THE NUMBER COUNTS, SAID IN THE WORDS BESIDE IT. Problem caRjFXgjwNb4.
 *
 * Measured on a report holding five waiting comments — three on one block, two on the record
 * itself: the record drew `❝ 2` and announced "2 comments waiting, not sent" while the block below
 * it drew `❝ 3`. Both numbers were right and neither said what it had counted, so the two read as a
 * contradiction on one screen.
 *
 * THE DECISION IS THAT A THING COUNTS WHAT IS ON IT AND NEVER WHAT IS INSIDE IT. A container total
 * would put the block's three into the record's number as well, with both circles in view at once
 * and no way to tell which of the two to believe.
 */
describe('the number and the words say the same thing', () => {
  const record: DrawnMark = {
    key: 'record/r1/panelx',
    target: { kind: 'record', recordId: 'r1', workspaceId: 'panelx' },
    waiting: 2,
    sent: 0,
    threads: [],
    spans: [],
  }
  const block: DrawnMark = {
    key: 'reportBlock/r1/b-1',
    target: { kind: 'reportBlock', recordId: 'r1', blockId: 'b-1' },
    waiting: 3,
    sent: 0,
    threads: [],
    spans: [],
  }

  it('names the thing it counted, so two circles on one screen do not read as a contradiction', () => {
    const circles = mark.circlesToDraw([record, block])
    expect(circleFor(circles, 'record/r1/panelx')?.count).toBe(2)
    expect(circleFor(circles, 'record/r1/panelx')?.name).toBe('2 comments on this record, waiting, not sent')
    expect(circleFor(circles, 'reportBlock/r1/b-1')?.count).toBe(3)
    expect(circleFor(circles, 'reportBlock/r1/b-1')?.name).toBe(
      '3 comments on this block of a report, waiting, not sent',
    )
  })

  it('does not add what is inside a thing into the thing\u2019s own count', () => {
    const [onRecord] = mark.atRest([record, block])
    expect(onRecord?.comments, 'the block\u2019s three were counted twice on one screen').toBe(2)
  })

  it('says \u201chere\u201d and never invents a noun for a thing only this browser knows about', () => {
    // A kept instruction is a key in local storage and carries no target, so there is no noun to
    // read. Absence beats a guess: the words say where without claiming what.
    const circles = mark.circlesToDraw([], [], [{ key: 'never-commented-on', kept: 1 }])
    expect(circleFor(circles, 'never-commented-on')?.name).toContain('here')
  })
})

describe('an instruction nobody has sent can be found again', () => {
  it('counts it in the circle on the thing it is about, and names it', () => {
    const circles = mark.circlesToDraw([], [], [{ key: 'c', kept: 2 }])
    expect(circleFor(circles, 'c')?.count).toBe(2)
    expect(circleFor(circles, 'c')?.name).toContain('2 instructions you started here and have not sent')
  })

  it('draws it on a thing that has no comment at all, which is the whole fault it fixes', () => {
    // The server sends no mark for this key: nobody has commented on it. Only this browser knows.
    const circles = mark.circlesToDraw([on('a', 1)], [], [{ key: 'never-commented-on', kept: 1 }])
    expect(
      circleFor(circles, 'never-commented-on'),
      'a kept instruction on an uncommented thing draws nothing',
    ).not.toBe(null)
  })

  it('adds a kept instruction to the comments already there, in the one number the circle holds', () => {
    const circles = mark.circlesToDraw([on('a', 2)], [], [{ key: 'a', kept: 1 }])
    expect(circleFor(circles, 'a')?.count).toBe(3)
    expect(circleFor(circles, 'a')?.name).toContain('2 comments on this record')
    expect(circleFor(circles, 'a')?.name).toContain('1 instruction you started here')
  })

  it('builds exactly one circle for an object that has both, because one place has one number', () => {
    const circles = mark.circlesToDraw([on('a', 2)], [], [{ key: 'a', kept: 1 }])
    const howMany = circles.filter((one) => one.key === 'a').length
    expect(howMany, 'two circles on one place is two numbers a reader has to choose between').toBe(1)
  })

  it('says nothing about a thing with neither', () => {
    expect(mark.circlesToDraw([], [], [{ key: 'd', kept: 0 }])).toEqual([])
  })
})

/**
 * WHERE A PRESS GOES, AND WHAT HAPPENS WHERE THERE IS NOTHING TO GO TO.
 *
 * A circle is a button, so a press has to do something or the button is a lie. It goes to the first
 * comment written about that place, because that is the one that chose the words a press lights up.
 * A place whose only mark is a draft this browser is keeping has no stored comment to go to, and
 * `opensAt` is null rather than a made-up id.
 */
describe('what a press opens', () => {
  const context = { target: { kind: 'record', recordId: 'a', workspaceId: 'panelx' } } as const

  it('goes to the first comment written about that place', () => {
    const circles = mark.circlesToDraw(
      [on('a', 2)],
      [],
      [],
      new Map(),
      new Map([['a', { context, annotationId: 'first' }]]),
    )
    expect(circleFor(circles, 'a') === null).toBe(false)
    expect(circles[0]?.opensAt?.annotationId).toBe('first')
  })

  it('has nowhere to go when the only thing here is a draft, and says so rather than inventing one', () => {
    const circles = mark.circlesToDraw([], [], [{ key: 'a', kept: 1 }])
    expect(circles[0]?.opensAt).toBe(null)
  })
})

describe('the unsent instructions this browser is keeping', () => {
  const KEY = 'mole-office.talk.drafts'

  it('counts them by the thing they are about, and ignores the empty ones', () => {
    storage.setItem(
      KEY,
      JSON.stringify([
        { id: 'd1', key: 'record/r1/panelx', intent: 'ask', body: 'half a sentence', changes: [] },
        { id: 'd2', key: 'record/r1/panelx', intent: 'ask', body: 'another', changes: [] },
        { id: 'd3', key: 'record/r2/panelx', intent: 'ask', body: '', changes: [] },
      ]),
    )
    const kept = mark.keptDrafts()
    expect(kept).toEqual([{ key: 'record/r1/panelx', kept: 2 }])
  })

  it('draws no pencil when the store cannot be read, rather than a count of nought', () => {
    // A COUNT OF NOUGHT WOULD BE A CLAIM. "Nobody could look" and "there are none" are different
    // facts; the composer is where the first one is said in words.
    storage.setItem(KEY, 'this was written by another build')
    expect(mark.keptDrafts()).toEqual([])
  })

  afterEach(() => {
    storage.removeItem(KEY)
  })
})

describe('what one object draws, worked out once', () => {
  it('joins the server’s count and this browser’s count under one key', () => {
    const list = mark.atRest([on('a', 1, 1)], ['a'], [{ key: 'a', kept: 2 }])
    expect(list).toEqual([
      { key: 'a', noun: 'record', comments: 2, waiting: 1, sent: 1, drafts: 2, textChanged: true },
    ])
  })
})

describe('the wash is painted under the name the registry is given', () => {
  /**
   * THE SAME NAME IN TWO PLACES, WITH SOMETHING MAKING THEM AGREE.
   *
   * `MarkLayer.tsx` registers the marked ranges with the browser under a name, and `agent-css.ts`
   * has the rule that paints whatever is registered under it. Change one and the wash stops
   * appearing — there is no type error, no other failing test and no message, because a
   * `::highlight()` rule naming nothing is not an error to CSS.
   *
   * Written on 28 August 2026, when the rename from PanelX to Mole Office had to change both at
   * once. Nothing would have caught it if only one had moved.
   */
  it('agent-css.ts paints the name MarkLayer registers', async () => {
    const { HIGHLIGHT } = await import('../src/web/components/agent/MarkLayer.tsx')
    const { AGENT_CSS } = await import('../src/web/components/agent/agent-css.ts')
    expect(HIGHLIGHT, 'the name is empty, so the search below would match anything').not.toBe('')
    expect(AGENT_CSS, `nothing paints ::highlight(${HIGHLIGHT}), so marked words are drawn plain`).toContain(
      `::highlight(${HIGHLIGHT})`,
    )
  })
})
