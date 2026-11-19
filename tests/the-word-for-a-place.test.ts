// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORD A PLACE IS DRAWN WITH IS TRUE OF EVERY KIND, AND IT COMES FROM THE ONE VOCABULARY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * A selection that ran across more than one thing is drawn with a count and a noun — `2 blocks`,
 * `3 rows`. The count is measured in the browser. The noun is not: there is no plural on the target
 * declaration, so `partWordFor` reads the singular noun that is there and pluralises it only in the
 * two shapes it can do safely. Everything else answers `parts`, which is true of anything.
 *
 * THAT IS THE FIFTH ENGINEERING RULE APPLIED TO A WORD. `note somebody left on something` has no
 * plural a rule can find, and a rule that produced one anyway would be guessing — right for the
 * nouns that happen to be regular today and wrong for the first one that is not. `2 parts` is exact.
 *
 * The runner's environment is `node` and this project has ruled out jsdom, so the smallest window
 * stand-in goes in before the browser modules are imported. Nothing about the stand-in is under
 * test; the two functions below are arithmetic over strings and need no document at all.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { PLACE_STATES } from '../src/shared/states.ts'
import { TARGET_KINDS, type Place, type TargetKind } from '../src/shared/targets.ts'

let partWordFor: (kind: TargetKind) => string
let wordForPlace: (place: Place) => string | null

beforeAll(async () => {
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
  ;({ partWordFor } = await import('../src/web/components/agent/pointing.ts'))
  ;({ wordForPlace } = await import('../src/web/components/agent/MarkLayer.tsx'))
})

describe('what a selection that crossed a boundary calls the things it crossed', () => {
  it('answers every one of the kinds, and never with a bare number', () => {
    const said = Object.fromEntries(TARGET_KINDS.map((kind) => [kind, partWordFor(kind)]))
    expect(said).toEqual({
      record: 'records',
      plan: 'plans',
      reportBlock: 'blocks',
      // `part of a report` — the rule finds the head word and pluralises it.
      region: 'parts',
      tableRow: 'rows',
      tableCell: 'cells',
      planLine: 'lines',
      planLineFact: 'parts',
      scheduleBlock: 'blocks',
      graphNode: 'nodes',
      agentMessage: 'messages',
      // NO PLURAL A RULE CAN FIND, so the true generic word is used rather than a guess.
      annotation: 'parts',
      // `change to a record` — the rule reads a head word out of `X of a Y` and its siblings, and
      // `to` is not one of them. `2 parts` is exact; widening the rule for one noun would be a
      // guess that happened to be right, which is what the two shapes above exist to avoid.
      change: 'parts',
      proposedAction: 'parts',
      draft: 'parts',
      uiSurface: 'parts',
      page: 'pages',
    })
  })

  it('never answers with something a reader would have to finish', () => {
    for (const kind of TARGET_KINDS) {
      const word = partWordFor(kind)
      expect(word, kind).toMatch(/^[a-z]+s$/)
      expect(word.includes(' '), kind).toBe(false)
    }
  })
})

describe('the word drawn for a place', () => {
  it('is the vocabulary\'s word and never one this file made up', () => {
    expect(wordForPlace({ at: 'surface' })).toBe(PLACE_STATES.surface.word)
    expect(wordForPlace({ at: 'quote', words: 'six words the person chose' })).toBe(PLACE_STATES.quote.word)
    expect(wordForPlace({ at: 'run', field: 'data.blocks[#b-1].text', offset: 0 })).toBe(PLACE_STATES.run.word)
    // THE EXACT CHARACTERS DRAW NO WORD AT ALL. The wash under them is the whole statement, and a
    // word beside it would be the interface explaining its own drawing.
    expect(wordForPlace({ at: 'words', span: { quote: 'a', from: 0, to: 1 } })).toBe(null)
  })

  it('fills the count and the noun from the place itself', () => {
    const across: Place = {
      at: 'across',
      from: { quote: 'the end of the first', from: 100, to: 120, field: 'data.blocks[#b-1].text' },
      to: { quote: 'the start of the next', from: 0, to: 21, field: 'data.blocks[#b-2].text' },
      parts: 2,
      partWord: 'blocks',
    }
    expect(wordForPlace(across)).toBe('2 blocks')
    expect(wordForPlace({ ...across, parts: 3, partWord: 'rows' })).toBe('3 rows')
  })
})
