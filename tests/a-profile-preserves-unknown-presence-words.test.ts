// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Wave 13k round 36: presence words describe the server's reading, not its dot's colour.
 * Mutation: replace presenceWord's unknown-word return with the old colour fallback to Offline.
 * The unknown-word case must fail for an arbitrary future word.
 */
import { afterEach, expect, it } from 'vitest'
import { setWordLanguage } from '../src/shared/i18n.ts'
import { presenceWord } from '../src/web/lib/server-sentences.ts'

afterEach(() => setWordLanguage('en'))

it('keeps an unknown presence word exactly as the server sent it, in either language and every colour', () => {
  for (const language of ['en', 'zh'] as const) {
    setWordLanguage(language)
    for (const colour of ['green', 'grey', 'red'] as const) {
      for (const word of ['Waiting for a new kind of connection', '']) {
        expect(presenceWord({ word, colour })).toBe(word)
      }
    }
  }
})

