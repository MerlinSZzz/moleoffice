// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FAULT PANEL SAYS ONLY WHAT IT KNOWS, AND NOTHING ABOUT WRITES THAT THE OFFICE DID NOT TELL IT.
 *
 * Point 12 of the secretary's order of 7 November 2026. The panel said "Nothing was written." under every
 * fault. It cannot know that. A page can stop while it draws after a press has already written, and
 * a press can stop after its write was sent. The one thing the office tells the panel about writing
 * is whether it wrote the fault down as a problem, and those words are drawn only once it answers.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * In each language the product carries, the panel for a page that stopped while it was drawn and
 * for a press that stopped is drawn under Node, before the office has answered. Its words must not
 * hold the product's own sentence that nothing was written (talk.nothingWritten) in that language.
 *
 * WHAT THIS CANNOT SEE. Korean, Portuguese and Thai said the panel's old first sentence in other
 * words than their talk.nothingWritten, so in those three languages the case was green before the
 * change as well. Their old sentence came out in the same commit as the others.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   put "Nothing was written. " back at the start of frameFiles.fault.says in
 *     src/shared/words/en.ts → the English case goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, it } from 'vitest'
import { LANGUAGES, setWordLanguage, t, type Language } from '../src/shared/i18n.ts'
import { FAULT_WORDS, TheFault } from '../src/web/components/TheFault.tsx'

/** The panel's words as a reader sees them: no tags, and the characters React escapes put back. */
function wordsIn(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

describe('the fault panel says nothing about writes that the office did not tell it', () => {
  afterAll(() => setWordLanguage('en'))

  for (const language of Object.keys(LANGUAGES) as Language[]) {
    it(`in ${LANGUAGES[language]}`, () => {
      setWordLanguage(language)
      const nothingWritten = t('talk.nothingWritten')
      for (const what of [FAULT_WORDS.whileDrawing, FAULT_WORDS.whileSending]) {
        const drawn = wordsIn(renderToStaticMarkup(
          h(TheFault, { said: { message: 'the store said no', page: 'Citizens', press: 'Retire' }, what }),
        ))
        expect(drawn, `${what}: the panel's own words`).toContain(FAULT_WORDS.says)
        expect(drawn, `${what}: a sentence the panel cannot know`).not.toContain(nothingWritten)
      }
    })
  }
})
