// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HIGHLIGHT ON QUOTED WORDS NEVER MOVES TO A DIFFERENT COPY OF THE SAME WORDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * A comment stores the words it quoted, which stored string they came out of, and where they
 * started in it. The mark layer lit the characters at that offset and checked that they read the
 * same as the quote. Identical characters pass that check, so any edit earlier in the string could
 * slide a DIFFERENT copy of the words under the stored offset.
 *
 * Reproduced in Chromium against a scratch database on 18 August 2026. A report block read:
 *
 *     The gate is met and the gate is not met. This second sentence exists so that the phrase
 *     appears twice and an anchor has to say which one it meant.
 *
 * "gate is" is at character 4 and at character 24. A comment was written on the one at 24, and the
 * browser lit it correctly. Twenty characters — "Rewritten on Friday " — were then added to the
 * front of the block, and the page was reloaded. The highlight was still drawn at character 24,
 * which is now the FIRST "gate is": the person's words had moved to 44 and the screen said nothing.
 * A highlight that moves is worse than no highlight, because it tells somebody their comment is
 * about text it is not about.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS UNDER TEST, AND WHY IT IS THIS SHAPE
 * ---------------------------------------------------------------------------------------
 *
 * `whereTheWordsAre` is the whole decision, and it is arithmetic over strings: the runs of drawn
 * text as the browser gave them, and the span the comment stored. The runner has no DOM, so the
 * drawing itself is checked in a browser and the rule is checked here. The three browser readings
 * after the fix, on the same scratch server: words that appear once are lit at the right
 * characters; an edit that does not move them keeps them lit; the repeated case is lit nowhere,
 * before or after the edit.
 *
 * `GET /api/agent/marks` sends no revision, so the browser cannot ask whether the block changed.
 * Counting every place the words are drawn is what the evidence it does have can carry.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import type { DrawnRun, Lit } from '../src/web/components/agent/MarkLayer.tsx'
import type { Span } from '../src/shared/targets.ts'

/**
 * The mark layer reaches src/web/api.ts, which reads storage the moment it is imported, so the
 * smallest stand-in goes in first and the module is imported after it. Nothing here is under test.
 */
let whereTheWordsAre: (runs: readonly DrawnRun[], span: Span) => Lit | null

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
  ;({ whereTheWordsAre } = await import('../src/web/components/agent/MarkLayer.tsx'))
})

// ---------------------------------------------------------------------------- the block that broke it

const FIELD = 'data.blocks[#p1].text'

/** The block as it was written. "gate is" is at 4 and at 24. */
const TWICE =
  'The gate is met and the gate is not met. This second sentence exists so that the phrase appears ' +
  'twice and an anchor has to say which one it meant.'

/** The same block after twenty characters were added to the front of it. */
const TWICE_REWRITTEN = `Rewritten on Friday ${TWICE}`

/** One run holding a whole stored string, which is what a plain text block draws as. */
function wholeBlock(text: string, field = FIELD): DrawnRun[] {
  return [{ field, offset: 0, text }]
}

/** The comment the person wrote: on the SECOND "gate is", at character 24. */
function onTheSecondCopy(): Span {
  return { quote: 'gate is', from: 24, to: 31, field: FIELD }
}

describe('a comment on one of two identical phrases', () => {
  it('is lit nowhere once anything is added in front of it', () => {
    // THE DEFECT. Character 24 of the rewritten block is the FIRST "gate is", and the characters
    // there read exactly like the quote, so a check on the characters alone passes.
    expect(TWICE_REWRITTEN.slice(24, 31)).toBe('gate is')
    expect(whereTheWordsAre(wholeBlock(TWICE_REWRITTEN), onTheSecondCopy())).toBeNull()
  })

  it('is lit nowhere even before anybody edits anything, because nothing can say which copy', () => {
    // THE PRICE, AND IT IS PAID DELIBERATELY. The offset is right at this moment and there is no
    // way to know that from the drawn text, so the honest answer is to draw no highlight. The small
    // mark on the block still says a comment is waiting and the conversation still holds the words.
    expect(whereTheWordsAre(wholeBlock(TWICE), onTheSecondCopy())).toBeNull()
  })
})

describe('a comment on words that appear once', () => {
  const ONCE = 'The mount holds calibration through a full handover, and the arm was never re-zeroed.'
  const span = (): Span => ({ quote: 'holds calibration', from: 10, to: 27, field: FIELD })

  it('is lit on exactly those characters', () => {
    expect(whereTheWordsAre(wholeBlock(ONCE), span())).toEqual({ run: 0, from: 10, to: 27 })
  })

  it('stays lit when the block is edited somewhere that does not move them', () => {
    expect(whereTheWordsAre(wholeBlock(`${ONCE} A sentence added at the end.`), span())).toEqual({
      run: 0,
      from: 10,
      to: 27,
    })
  })

  it('is lit nowhere once they have moved, because an offset is evidence and is never repaired', () => {
    expect(whereTheWordsAre(wholeBlock(`Rewritten on Friday ${ONCE}`), span())).toBeNull()
  })

  it('is found in whichever run draws it, at that run’s own offset', () => {
    // A block drawn as several runs — a bold word makes two — is the ordinary case for Markdown.
    const runs: DrawnRun[] = [
      { field: FIELD, offset: 0, text: 'The mount ' },
      { field: FIELD, offset: 12, text: 'holds calibration' },
      { field: FIELD, offset: 29, text: ' through a full handover.' },
    ]
    expect(whereTheWordsAre(runs, { quote: 'holds calibration', from: 12, to: 29, field: FIELD })).toEqual({
      run: 1,
      from: 0,
      to: 17,
    })
  })

  it('is lit nowhere when a second copy of the words is drawn in another run of the same string', () => {
    const runs: DrawnRun[] = [
      { field: FIELD, offset: 0, text: 'holds calibration and ' },
      { field: FIELD, offset: 22, text: 'holds calibration' },
    ]
    expect(whereTheWordsAre(runs, { quote: 'holds calibration', from: 22, to: 39, field: FIELD })).toBeNull()
  })

  it('ignores a copy in a different stored string, which is a different string and not a second copy', () => {
    const runs: DrawnRun[] = [
      { field: 'data.blocks[#other].text', offset: 0, text: 'holds calibration' },
      { field: FIELD, offset: 10, text: 'holds calibration' },
    ]
    expect(whereTheWordsAre(runs, { quote: 'holds calibration', from: 10, to: 27, field: FIELD })).toEqual({
      run: 1,
      from: 0,
      to: 17,
    })
  })
})

describe('a span that does not describe one stretch of text', () => {
  it('names no stored string, so nothing is lit', () => {
    expect(whereTheWordsAre(wholeBlock('holds calibration'), { quote: 'holds calibration', from: 0, to: 17 })).toBeNull()
  })

  it('says the words are longer than its own quote, so nothing is lit', () => {
    // Two different pieces of text are described and there is no honest way to choose one.
    expect(
      whereTheWordsAre(wholeBlock('holds calibration through a full handover.'), {
        quote: 'holds calibration',
        from: 0,
        to: 41,
        field: FIELD,
      }),
    ).toBeNull()
  })

  it('quotes nothing at all, so nothing is lit', () => {
    expect(whereTheWordsAre(wholeBlock('holds calibration'), { quote: '', from: 0, to: 0, field: FIELD })).toBeNull()
  })
})

describe('a run that does not say where it starts', () => {
  it('is not read, because half an answer would put the words in the wrong place', () => {
    const runs: DrawnRun[] = [{ field: FIELD, offset: Number.NaN, text: 'holds calibration' }]
    expect(whereTheWordsAre(runs, { quote: 'holds calibration', from: 0, to: 17, field: FIELD })).toBeNull()
  })
})
