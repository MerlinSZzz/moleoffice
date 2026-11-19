// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STATE DRAWING: one word, one drawing, chosen by the word.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A state word's drawing used to be chosen by what it CLASSIFIES as, so 32 stored words came out
 * as four grounds and seven shapes. Measured in Chromium on the live corpus on 13 August 2026:
 * every one of Home's 20 state chips was the identical filled black block — ground, ink, edge
 * colour and edge style all equal — and between them they carried five different words: `open`,
 * `blocked`, `orphaned`, `idle`, `crashed`. Those are five different jobs for a person, and the
 * drawing said nothing about any of them.
 *
 * Every test here pins one part of the fix, and each was proved by reverting the code it covers
 * and watching it go red, after a control run of the same command on unmutated code.
 *
 * WHY IT IS A FILE OF ITS OWN. tests/ui.test.ts pins the stylesheet — which rule draws which
 * drawing. This pins the TABLES and what the component emits, which is the half a CSS test cannot
 * see: a word with no drawing, a rename that is only in one of two places, two words that mean
 * different things coming out as one picture.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

import { STATE_MEANING } from '../src/shared/work.ts'

type UI = typeof import('../src/web/components/ui.tsx')
let ui: UI

beforeAll(async () => {
  // ui.tsx reaches the appearance store, which reads localStorage the moment it loads. This is the
  // smallest stand-in that lets the module import in a Node runner; nothing in it is under test.
  const store = new Map<string, string>()
  Object.assign(globalThis, {
    window: {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  })
  ui = await import('../src/web/components/ui.tsx')
})

const render = (el: React.ReactElement): string => renderToStaticMarkup(el)

async function renderInDeveloper(el: React.ReactElement): Promise<string> {
  const { setMode } = await import('../src/web/lib/mode.ts')
  setMode('inspect')
  try { return render(el) } finally { setMode('normal') }
}

/** The chip's drawing, as the browser would read it off the markup. */
const drawingOf = (html: string): string | null => /data-drawing="([a-z-]+)"/.exec(html)?.[1] ?? null

/** The chip's glyph: every path, circle and rect in it, in order. */
const glyphOf = (html: string): string =>
  [...html.matchAll(/<(path|circle|rect)\b[^>]*>/g)].map((m) => m[0]).join('')

describe('the five words the measurement found come apart', () => {
  /**
   * THE MEASUREMENT THIS WHOLE PASS RESTS ON. All twenty of Home's chips were one filled black
   * block and these five words were among them: work you can pick up, work you cannot pick up, a
   * dead run holding a port, an agent waiting for your answer, and something that broke.
   *
   * FOUR DRAWINGS, NOT FIVE, AND THE PAIR THAT SHARES ONE IS DELIBERATE. `idle` and `orphaned` both
   * mean somebody is waiting on you right now and the fix takes seconds, so they take the same
   * filled block and are told apart by their words — "waiting for you" and "left running". Every
   * other pair here means something a reader would act on differently, and every other pair is a
   * different drawing.
   */
  it('draws open, blocked, crashed and the waiting pair four different ways', () => {
    const words = ['open', 'blocked', 'orphaned', 'idle', 'crashed']
    const drawings = words.map((word) => ui.stateDrawing(word))
    expect(new Set(drawings).size, `drawn as ${drawings.join(', ')}`).toBe(4)
    expect(ui.stateDrawing('idle')).toBe(ui.stateDrawing('orphaned'))
  })

  it('draws them apart in the markup as well, glyph and word included', () => {
    const chips = ['open', 'blocked', 'orphaned', 'idle', 'crashed'].map((word) =>
      render(h(ui.StoredState, { state: word, progress: 'stopped_short' })),
    )
    // All five classify as `stopped_short`, so this is the test that the SHAPE channel is keyed on
    // the word. Keyed on the classification, these five silhouettes were one silhouette.
    expect(new Set(chips.map(glyphOf)).size, 'the four shapes collapsed again').toBe(4)
    // And no two of the five carry the same word, so the pair sharing a shape is still two facts.
    const words = chips.map((html) => /<span class="px-chip-word">([^<]+)</.exec(html)?.[1])
    expect(new Set(words).size, `the page said ${words.join(', ')}`).toBe(5)
  })
})

// Criterion before production (nnYh5vC_G2ts):
// OLD: the four classified verification words had no drawing entry.
// NEW: planned=not-started, attempted=under-way, complete=ended, unavailable=held-up.
// WHY: a completed verification is answered, not a success claim; unavailable verification is held up.
// The existing global coverage assertion stays unchanged. Each entry gets its own removal/restore proof.
it('draws the four main-suite verification words in their agreed states', () => {
  const expected = { planned: 'not-started', attempted: 'under-way', complete: 'ended', unavailable: 'held-up' } as const
  for (const [word, drawing] of Object.entries(expected)) {
    expect(ui.STATE_DRAWING_BY_WORD[word], word).toBe(drawing)
    expect(ui.stateDrawing(word), word).toBe(drawing)
    expect(render(h(ui.StoredState, { state: word, progress: STATE_MEANING[word] ?? null }))).toContain(`data-drawing="${drawing}"`)
  }
})

describe('the filled block is spent on the wait, and on nothing else', () => {
  /**
   * It is the heaviest object on a row. On 51 of 52 rows it marked nothing — the same argument the
   * UX contract already makes about hue, and ground inversion is louder than hue.
   */
  it('gives it to the two states where somebody is waiting on you now, and no other word', () => {
    const filled = Object.keys(ui.STATE_DRAWING_BY_WORD).filter(
      (word) => ui.STATE_DRAWING_BY_WORD[word] === 'waiting-on-you',
    )
    expect(filled.sort()).toEqual(['idle', 'orphaned'])
  })

  it('gives it to a date somebody agreed and missed, whatever the word says', () => {
    // A promise that is late is a person waiting on you, whatever the work says about itself. The
    // caller decides it — nothing here reads a date or parses a phrase.
    const late = render(
      h(ui.StoredState, { state: 'todo', progress: 'not_started', count: '6 days late', countKind: 'late' }),
    )
    expect(drawingOf(late)).toBe('waiting-on-you')
    const aged = render(h(ui.StoredState, { state: 'todo', progress: 'not_started', count: '13 days', countKind: 'age' }))
    expect(drawingOf(aged), 'how long a row has sat is not a promise anybody made').toBe('not-started')
  })

  it('does not take it from work that reached its end, late or not', () => {
    // MEASURED IN CHROMIUM, NOT REASONED. The first version of the date rule drew a `fulfilled`
    // obligation whose agreed date had gone by as the filled block, so a promise that was KEPT,
    // late, read as a person still waiting on you. Nothing is owed on work that ended.
    const late = render(
      h(ui.StoredState, { state: 'fulfilled', progress: 'finished', count: '2 days late', countKind: 'late' }),
    )
    expect(drawingOf(late)).toBe('ended')
  })
})

describe('nine pairs keep one drawing, deliberately', () => {
  /**
   * They mean the same thing to a person. Splitting all 32 words apart would put a new alphabet in
   * front of somebody who has not learned the first one.
   */
  it('draws each pair alike', () => {
    const pairs: readonly (readonly [string, string])[] = [
      ['failed', 'crashed'],
      ['done', 'finished'],
      ['done', 'fixed'],
      ['finished', 'fixed'],
      ['todo', 'new'],
      ['active', 'doing'],
      ['paused', 'parked'],
      ['paused', 'deferred'],
      ['parked', 'deferred'],
    ]
    for (const [left, right] of pairs) {
      expect(ui.stateDrawing(left), `${left} and ${right} came apart`).toBe(ui.stateDrawing(right))
    }
  })

  it('keeps an end that delivered apart from an end that did not', () => {
    // The one distinction inside "it is over" that changes what a reader does: `done` is a thing to
    // build on and `retracted` is a thing to stop building on.
    expect(ui.stateDrawing('done')).toBe('ended')
    expect(ui.stateDrawing('retracted')).toBe('ended-empty')
    const done = render(h(ui.StoredState, { state: 'done', progress: 'finished' }))
    const gone = render(h(ui.StoredState, { state: 'retracted', progress: 'finished' }))
    expect(glyphOf(done), 'the tick and the struck tick are one shape again').not.toBe(glyphOf(gone))
  })
})

describe('the words a person reads', () => {
  /**
   * THE STORED WORD NEVER CHANGES. Renaming it costs a migration, the API schema and every agent's
   * skill file; a display table buys the reader the same thing for nothing.
   */
  it('shows the six renamed words', () => {
    expect(ui.shownState('idle')).toBe('waiting for you')
    expect(ui.shownState('orphaned')).toBe('left running')
    expect(ui.shownState('stopped_short')).toBe('did not finish')
    expect(ui.shownState('in_flight')).toBe('under way')
    expect(ui.shownState('wanna_try')).toBe('worth a try')
    // The one word shown differently on one kind: a claim in state `proposed` is believed with no
    // numbers behind it, and drawn as an ordinary to-do people quote it as if it had been checked.
    expect(ui.shownState('proposed', 'claim')).toBe('not measured')
    expect(ui.shownState('proposed'), 'the rename leaked off the kind it belongs to').toBe('proposed')
  })

  /**
   * THE CASE THAT USED TO BE HERE PINNED THE DEFECT ITSELF, so it is gone rather than rewritten.
   *
   * It said: `it('leaves every other word exactly as it was stored')`, and it asserted
   * `shownState('open') === 'open'`, `shownState('chasing') === 'chasing'` and
   * `shownState('重印中') === '重印中'` — that a word `shownState` has no reading for comes back
   * as the stored token. That fall-through is how the chip `worked_around` reached #/records at
   * first paint in normal mode at both widths, found by the wave-5 verifier and by the four
   * verifiers before it. `src/shared/words.ts` holds `worked_around: 'worked around'` and the chip
   * never asked it.
   *
   * `open`, `blocked` and `done` ARE the right answers. The words test checked them, with every
   * state word, until it was deleted on 12 November 2026. What is not the right
   * answer is `chasing` coming back as `chasing`: rule 3 of src/shared/words.ts says a value no
   * table knows is named out loud, never printed raw.
   *
   * The opposite assertion is written in the commit that makes it true, not in this one.
   */
  it('reads EVERY state word from the one table, not five of them', () => {
    // The chip that draws these words asked a five-entry table of its own and handed back the
    // stored token for everything else. `worked_around` is the word the wave-5 verifier read off
    // #/records at 1440 and at 390, with the reading below already written in src/shared/words.ts.
    expect(ui.shownState('worked_around')).toBe('worked around')
    expect(ui.shownState('todo')).toBe('to do')
    expect(ui.shownState('queued')).toBe('waiting')
    expect(ui.shownState('handled')).toBe('dealt with')
    expect(ui.shownState('picked_up')).toBe('picked up')
    // Still true, and now true from the same table as the five above rather than from a second one.
    expect(ui.shownState('idle')).toBe('waiting for you')
    expect(ui.shownState('orphaned')).toBe('left running')
    expect(ui.shownState('stopped_short')).toBe('did not finish')
    expect(ui.shownState('in_flight')).toBe('under way')
    expect(ui.shownState('wanna_try')).toBe('worth a try')
  })

  it('never draws a machine word: no reading it gives holds an underscore', () => {
    for (const word of Object.keys(STATE_MEANING)) {
      expect(ui.shownState(word), word).not.toContain('_')
    }
  })

  it('names a word it has no reading for, instead of printing the stored token', () => {
    // Rule 3 of src/shared/words.ts. A screen that silently prints the raw value is how a missing
    // word survives for months, which is what the five waves before this one kept finding.
    expect(ui.shownState('chasing')).toBe('unknown word: chasing')
    expect(ui.shownState('重印中')).toBe('unknown word: 重印中')
  })


  it('says the stored word in the tooltip whenever it shows a different one in developer mode', async () => {
    const html = await renderInDeveloper(h(ui.StoredState, { state: 'orphaned', progress: 'stopped_short' }))
    expect(html).toContain('left running')
    expect(html, 'a reader cannot find out what is actually stored').toContain('orphaned')
  })
})

describe('two ways of having no state word, drawn apart', () => {
  /**
   * One is a record somebody should go and finish. The other is a fact about the kind and needs
   * nothing at all. They were identical in every measured channel and differed by one noun, which
   * is invariant 5 failing in pixels while the words held.
   */
  it('draws "nobody wrote one" as a question and "this kind has none" as a plain dash', () => {
    const written = render(h(ui.NoStateMark, { expected: true }))
    const noField = render(h(ui.NoStateMark, { expected: false }))
    expect(written).toContain('data-edge="dashed"')
    expect(noField).toContain('data-edge="none"')
    expect(glyphOf(written), 'the two are one drawing again').not.toBe(glyphOf(noField))
  })

  it('draws a record whose kind expects a state but carries none as a question, not as an answer', () => {
    const html = render(h(ui.StoredState, { state: null, progress: null }))
    expect(drawingOf(html)).toBe('nobody-can-say')
    expect(html).toContain('no state')
  })
})

describe('a direction is drawn on its own ladder, in words', () => {
  /**
   * `noticed, read, ran, measured, integrated, defended` is required and validated, and was drawn
   * in exactly one place: as the bare fraction "2/6" inside one graph. Eleven records carry it.
   */
  it('names the rung and how far along it is', () => {
    const html = render(h(ui.DepthLadder, { depth: 'ran' }))
    expect(html).toContain('ran')
    expect(html).toContain('3/6')
  })

  it('says nobody wrote one, rather than drawing rung zero', () => {
    const html = render(h(ui.DepthLadder, { depth: null }))
    expect(html).toContain('No depth recorded')
    expect(html).not.toContain('0/6')
  })

  it('prints a word the ladder does not hold instead of swallowing it', () => {
    const html = render(h(ui.DepthLadder, { depth: 'skimmed' }))
    expect(html).toContain('skimmed')
    expect(html, 'an unknown rung was reported as an absent one').not.toContain('No depth recorded')
  })
})

describe('the drawing is keyed on the word and not on the classification', () => {
  /**
   * The two entries that prove it, and they are the two the measurement was about. `open`
   * classifies as stopped short and is drawn as work somebody is on, because a problem in state
   * `open` is work you can pick up. `ordered` classifies as in flight and is drawn as not started,
   * because nobody has begun anything until the thing arrives.
   */
  it('lets a word disagree with what it classifies as', () => {
    expect(ui.stateDrawing('open')).toBe('under-way')
    expect(ui.stateDrawing('blocked')).toBe('held-up')
    expect(ui.stateDrawing('ordered')).toBe('not-started')
    expect(ui.stateDrawing('running')).toBe('under-way')
  })

  it('draws a word nothing has classified as a question, not as a guess', () => {
    expect(ui.stateDrawing('重印中')).toBe('nobody-can-say')
    const html = render(h(ui.StoredState, { state: '重印中', progress: 'unclassified' }))
    expect(drawingOf(html)).toBe('nobody-can-say')
    expect(html).toContain('重印中')
  })
})
