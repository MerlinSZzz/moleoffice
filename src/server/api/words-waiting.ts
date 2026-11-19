// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS WAITING FOR TRANSLATION.
 *
 *   GET /api/words/waiting                  every word whose Chinese is not written, or was written from English that has changed
 *   GET /api/words/waiting?language=el      the same, for the language named (en, zh, el, es, it, ko, pt)
 *
 * Remote, like any read of the office's own words: the words are the product's, not anybody's secret, and
 * the translation round may run on another machine. Settings shows the same list in Developer mode. The answer
 * with no language named is the Chinese answer, unchanged for every old caller.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { LANGUAGES, type Language } from '@shared/i18n.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { whatTheWordsWaitingDoorSays, whatTheWordsWaitingForLanguageDoorSays, type WhatTheWordsWaitingDoorSays, type WhatTheWordsWaitingForALanguageDoorSays } from '../lib/words-waiting.ts'

const NOTE =
  'The words waiting for translation, worked out from the word lists each time: every key with English and no ' +
  'translation in the named language, every key whose English changed after its translation was written, and every ' +
  'translated word nobody recorded the English of. Pages of ?limit= (1 to 500, 100 if left out) from ?offset=. ' +
  `?language= names one of ${Object.keys(LANGUAGES).join(', ')}; left out, it answers for Chinese.`

const LANGUAGE_CODES = Object.keys(LANGUAGES) as [Language, ...Language[]]

const query = z.object({
  offset: z.coerce.number({ error: 'offset must be a whole number' }).int({ error: 'offset must be a whole number' }).min(0, { error: 'offset must be 0 or more' }).optional(),
  limit: z.coerce.number({ error: 'limit must be a whole number' }).int({ error: 'limit must be a whole number' }).min(1, { error: 'limit must be at least 1' }).max(500, { error: 'limit must be at most 500' }).optional(),
  language: z.enum(LANGUAGE_CODES, { error: `language must be one of ${Object.keys(LANGUAGES).join(', ')}` }).optional(),
})

export async function wordsWaitingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/words/waiting', route('office.words-waiting', 'remote', NOTE), async (req): Promise<WhatTheWordsWaitingDoorSays | WhatTheWordsWaitingForALanguageDoorSays> => {
    const asked = parse(query, req.query ?? {}, 'The words waiting query')
    if (asked.language === undefined) return whatTheWordsWaitingDoorSays(asked.offset ?? 0, asked.limit ?? 100)
    return whatTheWordsWaitingForLanguageDoorSays(asked.language, asked.offset ?? 0, asked.limit ?? 100)
  })
}
