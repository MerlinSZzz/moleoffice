// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW-MARK CONTROL SAYS ON SCREEN THAT NOTHING DRAWS ITS TWO COLOURS YET.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAULT THIS FILE EXISTS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The Settings `Review marks` control writes `--review-local` and `--review-global` onto `<html>`,
 * and wave 14's verification found that nothing in Mole Office draws either of them:
 *
 *     "A person presses a control, sees the little sample beside it move, opens a report and
 *      nothing has changed. This is the campaign's signature defect in a new shape: not a server
 *      half with no door, but a door with nothing behind it."
 *
 * Review's own frame, band and ring draw `--rev` and `--rev-line`, which is a different vocabulary
 * chosen by a different control. The run of words a comment was written about has no edge drawn on
 * it at all. The panel's own sample used to read its ink off React state, which is why the sample
 * moved while the product did not: the one copy of the value the panel claimed did not exist.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS HELD HERE
 * ---------------------------------------------------------------------------------------
 *
 * Review's marker is not built and this file does not pretend otherwise. What it refuses is the
 * silent version of that — a control that says nothing about what it does not do — and the shape of
 * the original defect, a preview fed from a second copy of the value.
 *
 *   1. The panel says on the screen, without anything being pressed, that nothing draws these two
 *      colours on a reading yet, and it names what is not built.
 *   2. The sample follows the token. Change `--review-local` on the root element and the sample's
 *      edge changes with it. A sample fed from React state would not move.
 *   3. Every palette draws both marks in a colour of their own. A palette declaring neither token
 *      would draw the edge in the text colour, which is a mark that says nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE USED TO ASSERT, AND WHY IT DOES NOT NOW
 * ---------------------------------------------------------------------------------------
 *
 * It held a hand-written list of which source files were allowed to read either token, and it
 * matched two CSS rules character for character. Both went red on a reformat, and the list went red
 * again on the day somebody legitimately built review's marker — which is the day this file's whole
 * subject stops existing, not a day a test should fail. Case 2 asserts what that list was really
 * about: there is one value for a mark's ink, and the sample reads it.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS
 * ---------------------------------------------------------------------------------------
 *
 *   Delete the `Absence` sentence from ReviewMarks.tsx        → "says on the screen" goes red
 *   Give the sample an inline --rvm-ink again                 → "follows the token" goes red
 *   Delete --review-local from one palette in tokens.css      → "every palette" goes red
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'

import { MARK_TOKENS } from '../src/web/lib/markcolours.ts'
import { drawInABrowser, PALETTES, type Drawn } from './what-the-browser-draws.ts'

type Marks = typeof import('../src/web/components/ReviewMarks.tsx')

let marks: Marks
let drawn: Drawn
/** The panel as Settings mounts it, with the stylesheets the components write. */
let markup: string

beforeAll(async () => {
  // The panel reaches src/web/api.ts, which reads storage as it is imported. The smallest stand-in
  // that lets the import finish; nothing here is under test.
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
  marks = await import('../src/web/components/ReviewMarks.tsx')
  markup = renderToStaticMarkup(h(marks.ReviewMarksPanel))
  drawn = await drawInABrowser(markup)
}, 60_000)

afterAll(async () => {
  await drawn?.close()
})

/** The words on the panel, with the stylesheets taken out so a comment in CSS is never evidence. */
const words = (): string =>
  markup
    .replace(/<style\b[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

/** The sample beside one of the two controls, by the row it belongs to. */
const sample = (key: string): string => `.rvm-mark[data-mark-key='${key}']`

describe('the panel says what it does not do', () => {
  it('says on the screen, with nothing pressed, that nothing draws these colours on a reading yet', () => {
    // USER.md invariant 3: an unbuilt thing is labelled where it appears. A reader who presses these
    // controls and sees only the sample move must be told why, on this screen, at rest.
    //
    // THE SENTENCE IS READ FROM THE WORD LIST, not copied here, as the owner decided. The
    // check of round 153 asked the English to name the two colour choices, as the Chinese does, and a literal in this
    // test would have to be edited a second time for that.
    const { t } = createI18n('en')
    const sentence = t('settingsPanel.marks.notBuilt')
    expect(words()).toContain(sentence)
    // Named, not vague: the sentence names the two colours above and says what is missing, so it is a
    // pointer rather than an apology, and it says the choice is kept.
    expect(sentence).toContain('two colours')
    expect(sentence).toContain('is not built')
    expect(sentence).toContain('Your choice is kept')
  })
})

describe('the sample is drawn from the token, and there is no second copy of the value', () => {
  it('moves when the token moves, for each of the two marks', async () => {
    // THE ORIGINAL DEFECT EXACTLY, in the direction that catches it. The sample used to carry an
    // inline ink set from React state, so the token was not what drew it. Writing the token the way
    // the picker writes it — on the root element — and watching the sample follow is the only
    // reading that tells one arrangement from the other.
    for (const [key, token] of Object.entries(MARK_TOKENS)) {
      const before = await drawn.styleOf(sample(key), 'border-left-color')
      await drawn.page.evaluate(
        ([name, value]) => document.documentElement.style.setProperty(name as string, value as string),
        [token, 'rgb(1, 2, 3)'] as const,
      )
      const after = await drawn.styleOf(sample(key), 'border-left-color')
      expect(after, `the ${key} sample ignored ${token}, so something else is drawing it`).toBe('rgb(1, 2, 3)')
      expect(before, `the ${key} sample was already the test colour, so this measures nothing`).not.toBe(after)
      await drawn.page.evaluate((name) => document.documentElement.style.removeProperty(name as string), token)
    }
  })

  it('gives the two marks different shapes, so the colour is never the only thing saying which is which', async () => {
    // A reader who cannot tell two hues apart still has to be able to read this panel. One edge
    // against a doubled edge is what carries it.
    const one = await drawn.styleOf(sample('local'), 'border-left-style')
    const doubled = await drawn.styleOf(sample('global'), 'border-left-style')
    expect(one, 'both samples are drawn with the same edge, so only the hue tells them apart').not.toBe(doubled)
  })
})

describe('a fresh browser draws both marks before anybody chooses anything', () => {
  it('gives each mark a colour of its own in every palette', async () => {
    // A palette missing a token does not fail loudly. The reference falls through to nothing, the
    // border-left declaration is dropped, and the edge is drawn in the text colour. That is a mark
    // that says nothing, in exactly one theme, which is how a colour fault survives a review. So
    // the check is against the text colour rather than against emptiness.
    expect(PALETTES.length, 'no palettes were found in tokens.css, so this measures nothing').toBe(2)
    for (const theme of [null, ...PALETTES]) {
      await drawn.palette(theme)
      const named = theme ?? 'the default palette'
      for (const key of Object.keys(MARK_TOKENS)) {
        const ink = await drawn.styleOf(sample(key), 'border-left-color')
        const text = await drawn.styleOf(sample(key), 'color')
        expect(ink, `${named} draws the ${key} mark in the text colour, so it has no colour of its own`).not.toBe(
          text,
        )
        expect(ink, `${named} draws no ${key} mark at all`).not.toBe('rgba(0, 0, 0, 0)')
      }
    }
    await drawn.palette(null)
  })
})
