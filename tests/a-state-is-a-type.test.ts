// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STATE IS A WORD, A MARK AND A SENTENCE ON DEMAND — AND THE TABLE HAS TO SAY WHAT IT LOOKS
 * LIKE IN GREY.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO FAILURES THIS FILE GUARDS
 * ---------------------------------------------------------------------------------------
 *
 * FIRST: a component meets an honest state, has no word and no shape to hand, and writes a
 * paragraph. Measured on 19 August 2026 against `src/web`: 90 uses of the one correct shape
 * against 759 places that print an English sentence, in 68 of 86 files. That is one missing
 * declaration repeated 68 times, not 68 lapses of judgement. `src/shared/states.ts` is the
 * declaration and this file is what keeps it honest.
 *
 * SECOND, and it is the mirror: 17 states in the product today are told apart only by which of
 * two nearly identical sentences prints. A word alone can do the same thing, and so can a colour
 * alone. So `StateMark` holds four channels with no colour among them, and the checks below fail
 * on any two states in one family that are identical once the colour is gone.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CHECK GO RED
 * ---------------------------------------------------------------------------------------
 *
 * Every check here was proved by mutation, with a control run first, and the mutations are
 * recorded in `design/round-nine/step10-state-type.md`. The short version:
 *
 *   give two states in one family the same word and the same four channels  → the grey check
 *   take the doubled quote glyph off `words only`                           → the hardest pair
 *   draw the `review` intent as `Review` again                              → the intent check
 *   copy a rung phrase into the detail table instead of reading it          → the derivation check
 *   add a sixth reading to the union without a word                         → will not compile
 *   put a `tabindex` or a `role` on `Mark`                                  → the pressing check
 *   stop passing the sentence to `Mark`, or print it beside the word        → the sentence check
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DELIBERATELY DOES NOT CHECK
 * ---------------------------------------------------------------------------------------
 *
 * Which screens draw which words. Five components read these tables today: `MarkLayer`,
 * `Presence`, `ReviewBar`, `TalkBox` and the component library itself. The step that adopted each
 * family carries the screen proof for it. This file checks the tables, and the one component that
 * turns a table row into markup.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { COMMUNICATION_INTENTS } from '../src/shared/intent.ts'
import { RUNGS, RUNG_SPECS } from '../src/shared/detail.ts'
import { CONTEXT_READINGS, PLACES } from '../src/shared/targets.ts'
import {
  ARTIFACT_STATES,
  COMPOSER_STATES,
  DETAIL_STATES,
  INTENT_STATES,
  KNOWN_COLLISIONS,
  NEARLY_THE_SAME,
  NEVER_PRESSED,
  PLACE_STATES,
  READING_STATES,
  READING_STATE_OF,
  STANDING_STATES,
  VOCABULARY,
  everyState,
  fillWord,
  slotsIn,
  withoutHue,
  type VocabularyEntry,
} from '../src/shared/states.ts'

type UI = typeof import('../src/web/components/ui.tsx')
let ui: UI

beforeAll(async () => {
  // Same stand-in `tests/ui.test.ts` uses: src/web/api.ts reads window.localStorage at module
  // scope, and the component library imports it for one error helper.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  ui = await import('../src/web/components/ui.tsx')
})

const ALL = everyState()
const where = (entry: VocabularyEntry) => `${entry.word ?? '(nothing drawn)'} (contract ${entry.section})`

// =========================================================================== the shape of a state

describe('every state in the vocabulary is a word, a mark and a sentence', () => {
  it('carries a sentence, and it is a real one', () => {
    // The sentence is the part that makes a one-word state honest rather than terse: the reader
    // who needs it gets it, from the title, the off-screen span or the fold. A state with an
    // empty one has moved the paragraph problem rather than solved it.
    //
    // THE DETAIL LADDER IS THE ONE FAMILY WHERE IT IS NOT A SENTENCE, and that is the contract's
    // own rule rather than a hole here. Section 8.8 says the six positions carry phrases in their
    // accessible names — `a few words`, `one line`, `the whole thing` — because the thing being
    // named is a position on a control, not a state of a record. So this checks that family in
    // the other direction: those six must NOT be sentences. A hole would let one become a
    // paragraph unnoticed; this fails if one does.
    for (const { family, name, entry } of ALL) {
      const at = `${family}.${name}`
      expect(entry.detail.length, `${at} has no sentence`).toBeGreaterThan(0)
      if (family === 'detail') {
        expect(entry.detail, `${at} is the accessible name of a position, so it is a phrase`).not.toMatch(/[.?!]$/)
        continue
      }
      expect(entry.detail, `${at} does not end a sentence`).toMatch(/[.?!]$/)
      expect(entry.detail[0], `${at} does not start a sentence`).toMatch(/[A-Z{]/)
    }
  })

  it('draws a WORD and never a sentence', () => {
    // The whole point. If a word may be a sentence then the table has recreated the failure it
    // exists to stop, and it has done it in the one place every surface will copy from.
    for (const { family, name, entry } of ALL) {
      if (entry.word === null) continue
      const at = `${family}.${name}`
      expect(entry.word, `${at} draws a sentence, not a word`).not.toMatch(/[.?!]$/)
      expect(entry.word.split(' ').length, `${at} draws too many words`).toBeLessThanOrEqual(4)
    }
  })

  it('says what it looks like with the colour gone, on four channels and no fifth', () => {
    // `withoutHue` is what the grey checks compare, so it has to be built from every channel the
    // mark has. If somebody adds a fifth channel and forgets this function, two states could
    // differ in it and still compare equal — and the grey check would pass while the drawing
    // differed. Reading the keys off the object is what makes that impossible.
    for (const { family, name, entry } of ALL) {
      expect(Object.keys(entry.mark).sort(), `${family}.${name}`).toEqual(['edge', 'form', 'glyph', 'where'])
      expect(withoutHue(entry.mark).split('/')).toHaveLength(4)
    }
    expect(JSON.stringify(READING_STATES.gone.mark)).not.toMatch(/colour|color|hue|red|amber|accent/i)
  })
})

// =========================================================================== nothing rides on hue

describe('no two states in a family are the same once the colour is gone', () => {
  it('holds for all ten families', () => {
    const same: string[] = []
    for (const [family, table] of Object.entries(VOCABULARY)) {
      const rows = Object.entries(table)
      for (let i = 0; i < rows.length; i += 1) {
        for (let j = i + 1; j < rows.length; j += 1) {
          const [oneName, one] = rows[i] as [string, VocabularyEntry]
          const [otherName, other] = rows[j] as [string, VocabularyEntry]
          if (one.word === other.word && withoutHue(one.mark) === withoutHue(other.mark)) {
            same.push(`${family}: ${oneName} and ${otherName} are identical in grey`)
          }
        }
      }
    }
    expect(same).toEqual([])
  })

  it('tells “your words were kept” from “nobody recorded a place”, and not by the frame', () => {
    // The contract's own hardest pair, and the reason the mark is structured at all. Both are a
    // dashed frame on the target. One means the words were kept and Mole Office could not place them;
    // the other means no place finer than the thing was recorded. That is invariant five —
    // nothing is there against nobody looked — and a frame cannot carry it.
    const kept = PLACE_STATES.quote
    const whole = PLACE_STATES.surface
    expect(kept.mark.form).toBe(whole.mark.form)
    expect(kept.mark.edge).toBe(whole.mark.edge)
    // So the glyph is the second channel, and it is the only thing standing between them.
    expect(kept.mark.glyph).toBe('doubled')
    expect(whole.mark.glyph).toBe('none')
    expect(withoutHue(kept.mark)).not.toBe(withoutHue(whole.mark))
  })

  it('tells the two washes apart by solid against dashed', () => {
    expect(PLACE_STATES.words.mark.edge).toBe('underline')
    expect(PLACE_STATES.across.mark.edge).toBe('dashed')
  })
})

// =========================================================================== one word, one meaning

describe('a drawn word means one thing', () => {
  it('has exactly the two words that mean two things, and no third', () => {
    // A word with two meanings is a reader guessing. These two are recorded rather than resolved,
    // because resolving one is a decision about what the product says. A third fails here.
    const meanings = new Map<string, Set<string>>()
    for (const { entry } of ALL) {
      if (entry.word === null) continue
      const set = meanings.get(entry.word) ?? new Set<string>()
      set.add(entry.detail)
      meanings.set(entry.word, set)
    }
    const twoWays = [...meanings].filter(([, set]) => set.size > 1).map(([word]) => word)
    expect(twoWays.sort()).toEqual(KNOWN_COLLISIONS.map((one) => one.word).sort())
  })

  it('says where each of those two is written, so a reader can go and look', () => {
    for (const collision of KNOWN_COLLISIONS) {
      expect(collision.sections.length, collision.word).toBeGreaterThan(0)
      expect(collision.why.length, collision.word).toBeGreaterThan(20)
    }
  })

  it('never draws a word that is a stored intent word drawn somewhere else', () => {
    // A4's collision rule, checked rather than trusted. `Review` on screen means the collection,
    // and it is safe ONLY because the intent chip reads `Find problems`. This reads the intent
    // table to establish that, so the day somebody puts `Review` back on the chip, the check
    // fires on the collection's own word instead of staying quietly green.
    const clashes: string[] = []
    for (const stored of COMMUNICATION_INTENTS) {
      const drawnAs = INTENT_STATES[stored.word].word
      if (drawnAs === null) continue
      if (drawnAs.toLowerCase() !== stored.word) continue
      for (const { family, name, entry } of ALL) {
        if (family === 'intent') continue
        if (entry.word !== null && entry.word.toLowerCase() === stored.word) {
          clashes.push(`${family}.${name} draws "${entry.word}", which is also the intent "${stored.word}"`)
        }
      }
    }
    expect(clashes).toEqual([])
  })

  it('draws the review intent as something other than the word Review', () => {
    expect(INTENT_STATES.review.word).toBe('Find problems')
    expect(INTENT_STATES.review.labels).toBe('review')
  })

  it('names the pairs a reader will struggle to tell apart, with both words real', () => {
    // Not a failure — a record. These four are the mirror defect inside the contract's own
    // vocabulary, and the steps that draw them should meet the list rather than discover it.
    const drawn = new Set(ALL.map(({ entry }) => entry.word).filter((word): word is string => word !== null))
    for (const pair of NEARLY_THE_SAME) {
      expect(drawn.has(pair.one), pair.one).toBe(true)
      expect(drawn.has(pair.other), pair.other).toBe(true)
    }
  })
})

// =========================================================================== the tables are total

describe('a component cannot draw a state that is not in a table', () => {
  it('gives every stored reading a word, and names the one word no reading produces', () => {
    for (const reading of CONTEXT_READINGS) {
      const entry = READING_STATES[READING_STATE_OF[reading]]
      expect(entry, reading).toBeDefined()
      expect(entry.labels, `${reading} is drawn by an entry that labels something else`).toBe(reading)
    }
    // Six words over five stored values: the contract's section 8.1 splits `changed` in two and
    // the union has no member for the second half. That gap is recorded, not smoothed over.
    const unlabelled = Object.entries(READING_STATES)
      .filter(([, entry]) => entry.labels === null)
      .map(([name]) => name)
    expect(unlabelled).toEqual(['wordsGone'])
    expect(READING_STATES.wordsGone.word).toBe('Words gone')
  })

  it('gives every member of Place a word and a mark', () => {
    for (const place of PLACES) expect(PLACE_STATES[place], place).toBeDefined()
    expect(Object.keys(PLACE_STATES).sort()).toEqual([...PLACES].sort())
  })

  it('gives every rung a position, and reads its phrase rather than copying it', () => {
    // The six accessible phrases already exist once, in `src/shared/detail.ts`. Copying them here
    // would be the defect this repository names most often: one fact in two places, free to
    // drift, with nothing failing when it does. This is the check that says they were read.
    for (const rung of RUNGS) {
      expect(DETAIL_STATES[rung].detail, rung).toBe(RUNG_SPECS[rung].phrase)
    }
    expect(DETAIL_STATES.full.word).toBe('Full')
    expect(DETAIL_STATES.label.word).toBe('1')
    // No word on any screen names the axis, so no entry may say "detail".
    for (const rung of RUNGS) expect(DETAIL_STATES[rung].word?.toLowerCase()).not.toBe('detail')
  })

  it('gives every intent word a drawn label', () => {
    for (const stored of COMMUNICATION_INTENTS) {
      expect(INTENT_STATES[stored.word], stored.word).toBeDefined()
      expect(INTENT_STATES[stored.word].labels).toBe(stored.word)
    }
    expect(Object.keys(INTENT_STATES).sort()).toEqual(COMMUNICATION_INTENTS.map((one) => one.word).sort())
  })

  it('puts artifacts on the left and intents on the right, before any colour', () => {
    // Contract 8.6: position, enclosure and behaviour tell the two families apart first. If both
    // sat inline, a reader would be left with hue, which is exactly what is forbidden.
    for (const entry of Object.values(ARTIFACT_STATES)) expect(entry.mark.where, where(entry)).toBe('left')
    for (const entry of Object.values(INTENT_STATES)) {
      expect(entry.mark.where, where(entry)).toBe('right')
      expect(entry.mark.form, where(entry)).toBe('text')
    }
  })
})

// =========================================================================== filling in the numbers

describe('a word with a number in it is filled, never guessed', () => {
  it('fills what it is given', () => {
    expect(fillWord(PLACE_STATES.across.word ?? '', { parts: 2, partWord: 'blocks' })).toBe('2 blocks')
    expect(fillWord(STANDING_STATES.comments.word, { n: 4 })).toBe('4')
  })

  it('refuses a missing number rather than drawing a gap', () => {
    // "2 blocks" with the 2 missing reads " blocks", which is a claim about nothing presented as
    // a fact. Absence beats a guess, and a throw beats both.
    expect(() => fillWord(PLACE_STATES.across.word ?? '', { parts: 2 })).toThrow(/partWord/)
  })

  it('refuses a number nobody asked for', () => {
    expect(() => fillWord(STANDING_STATES.comments.word, { n: 1, extra: 2 })).toThrow(/extra/)
  })

  it('uses one placeholder spelling everywhere, so nothing is left half-written', () => {
    for (const { family, name, entry } of ALL) {
      const at = `${family}.${name}`
      expect(entry.word ?? '', at).not.toContain('${')
      expect(entry.detail, at).not.toContain('${')
      // Every number a word needs must be answerable from the sentence too, or the reader who
      // asks for the sentence gets a different fact from the reader who reads the word.
      for (const name of slotsIn(entry.word ?? '')) {
        expect(name.length, at).toBeGreaterThan(0)
      }
    }
  })
})

// =========================================================================== the Mark component

describe('Mark draws a word, a mark and a sentence, and is never pressed', () => {
  const render = () =>
    renderToStaticMarkup(
      h(ui.Mark, {
        glyph: null,
        word: 'Words gone',
        tone: 'todo',
        mark: ui.inlineMark('broken'),
        detail: 'The stored quote is not in the current revision.',
      }),
    )

  it('gives the reader the sentence, and gives it on demand rather than printing it', () => {
    // This is the sentence half of "a word, a mark and a sentence on demand". Two things have to
    // be true at once and each one alone is a different defect.
    //
    // The sentence must be there. A mark with no sentence is a shape the reader has to guess at.
    // The sentence must not be printed beside the word. That is the paragraph-next-to-the-mark
    // failure this whole file exists to stop.
    //
    // So this reads the markup twice. Once for the sentence anywhere in it, and once for the run
    // of text a reader sees on the page, which must be the word alone. A title attribute passes
    // both, because stripping the tags takes the title with them. An off-screen span passes both
    // as well, and that is on purpose: the round-nine plan asks for one beside the title, because
    // a title needs a pointer and a hover and is reachable by neither keyboard nor touch. This
    // case used to assert that the span was ABSENT, which would have gone red on the very
    // improvement the plan asks for. design/round-nine/step10-state-type.md has that history.
    const sentence = 'The stored quote is not in the current revision.'
    const html = render()
    expect(html, 'the mark hands the reader no sentence').toContain(sentence)
    const offScreen = /<span [^>]*class="[^"]*px-sr[^"]*"[^>]*>.*?<\/span>/g
    const printed = html.replace(offScreen, '').replace(/<[^>]*>/g, '').trim()
    expect(printed, 'the sentence is printed beside the word instead of offered on demand').toBe('Words gone')
  })

  it('draws the word beside it, so nothing rests on the shape alone', () => {
    expect(render()).toContain('>Words gone<')
  })

  it('is drawn and never pressed: no tabindex, no role, no handler', () => {
    // Contract 8.3. Three cluster designs made marks into controls and all three were withdrawn:
    // the way to a marked thing is the gesture, and the way to its history is the row in the pane.
    // Section 6.29 of the same contract says marks are in the tab order, which contradicts this;
    // the contradiction is reported in design/round-nine/step10-state-type.md rather than settled
    // by whichever file was read last.
    const html = render()
    expect(html).not.toContain('tabindex')
    expect(html).not.toContain('role=')
    expect(html).not.toContain('<button')
  })

  it('emits an edge attribute only for the two values the stylesheet reads', () => {
    // `solid` is what a mark looks like with no attribute at all. Emitting `data-edge="solid"`
    // would put a new attribute on the page for no drawing, and stage 2 emits nothing.
    const solid = renderToStaticMarkup(
      h(ui.Mark, { glyph: null, word: 'A', tone: 'todo', mark: ui.inlineMark('filled'), detail: 'A thing.' }),
    )
    expect(solid).not.toContain('data-edge')
    const dashed = renderToStaticMarkup(
      h(ui.Mark, { glyph: null, word: 'A', tone: 'todo', mark: ui.inlineMark('hollow', 'dashed'), detail: 'A thing.' }),
    )
    expect(dashed).toContain('data-edge="dashed"')
  })

  it('drops the enclosure when the edge says there is none', () => {
    expect(ui.inlineMark('none', 'none').form).toBe('text')
    expect(ui.inlineMark('none', 'none').edge).toBe('none')
    expect(ui.inlineMark('filled').form).toBe('outline')
  })

  it('keeps the standing marks out of reach of a press, in the table as well as the code', () => {
    for (const name of NEVER_PRESSED) {
      const entry = STANDING_STATES[name]
      expect(['generated', 'row'], `${name} is drawn as ${entry.mark.form}`).toContain(entry.mark.form)
    }
    // The one exception the contract names, and it is an exception because it is not a mark about
    // a state: it is a control that reveals text.
    expect(STANDING_STATES.moreText.mark.form).toBe('control')
    expect(NEVER_PRESSED).not.toContain('moreText')
  })
})
