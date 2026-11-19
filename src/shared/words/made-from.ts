// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Language } from '../i18n.ts'
import { EL_MADE_FROM } from './el-made-from.ts'
import { ES_MADE_FROM } from './es-made-from.ts'
import { IT_MADE_FROM } from './it-made-from.ts'
import { KO_MADE_FROM } from './ko-made-from.ts'
import { PT_MADE_FROM } from './pt-made-from.ts'
import type { MadeFromRecord } from './waiting.ts'
import { TH_MADE_FROM } from './th-made-from.ts'
import { ZH_MADE_FROM } from './zh-made-from.ts'

/**
 * EACH LANGUAGE'S RECORD OF WHAT ENGLISH ITS WORDS WERE MADE FROM, under the language's code.
 *
 * English is the source and is recorded by nothing. The Chinese record came first; every language added after it has
 * a record of its own beside it, written by scripts/words-made-from.ts when its translation round runs.
 */
const ENGLISH_ITSELF: MadeFromRecord = {
  baseline: { on: '', says: 'English is the source, not a translation of one.', fingerprints: {} },
  translated: {},
}

const RECORDS: Readonly<Record<Language, MadeFromRecord>> = {
  en: ENGLISH_ITSELF,
  zh: ZH_MADE_FROM,
  el: EL_MADE_FROM,
  es: ES_MADE_FROM,
  it: IT_MADE_FROM,
  ko: KO_MADE_FROM,
  pt: PT_MADE_FROM,
  th: TH_MADE_FROM,
}

export function madeFromFor(language: Language): MadeFromRecord {
  return RECORDS[language]
}

/** The file the record was written to, as the waiting reader names it. English has no file. */
export function madeFromFile(language: Language): string | null {
  return language === 'en' ? null : `src/shared/words/${language}-made-from.ts`
}
