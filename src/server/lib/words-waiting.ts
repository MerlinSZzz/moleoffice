// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE DOOR GET /api/words/waiting SAYS: the words waiting for translation, worked out from the word
 * lists by whatWaitsForTranslation (src/shared/words/waiting.ts) each time it is asked. Nothing here is
 * kept, so the list cannot fall behind the lists it is worked out from.
 *
 * The answer with no language named is the Chinese answer, byte for byte as it was before the five languages
 * joined: what the old tools and the old page ask for. The answer with a language named reads that language's
 * own list and record, and adds the language-neutral names for the two wrong lists beside the Chinese-named ones.
 */
import { LANGUAGES, type Language, type Word } from '@shared/i18n.ts'
import { madeFromFile, madeFromFor } from '@shared/words/made-from.ts'
import { WAITING_REASONS, whatWaitsForTranslation, type WaitingReason } from '@shared/words/waiting.ts'
import { ZH_MADE_FROM } from '@shared/words/zh-made-from.ts'
import { EFFECTIVE_WORD_LISTS, savedWords } from '@shared/word-settings.ts'

export interface WhatTheWordsWaitingDoorSays {
  /** Every word waiting, whatever page this is. */
  readonly count: number
  readonly byReason: Readonly<Record<WaitingReason, number>>
  /** This page of them, sorted by key, each with its English. */
  readonly words: readonly { readonly key: string; readonly reason: WaitingReason; readonly english: Word }[]
  readonly offset: number
  /** The offset of the next page, or null when this page is the last. */
  readonly next: number | null
  /** Keys whose Chinese was taken out, which a test refuses. Not waiting: wrong. */
  readonly chineseRemoved: readonly string[]
  /** Chinese keys with no English, which a test refuses. Not waiting: wrong. */
  readonly chineseWithoutEnglish: readonly string[]
  /** What the record of each Chinese word's English is, and how far back it reaches. */
  readonly record: { readonly file: string; readonly baselineOn: string; readonly baselineSays: string }
}

/** The Chinese answer, unchanged for every caller that names no language. */
export function whatTheWordsWaitingDoorSays(offset: number, limit: number): WhatTheWordsWaitingDoorSays {
  const english = EFFECTIVE_WORD_LISTS.en as Readonly<Record<string, Word>>
  const madeFrom = { ...ZH_MADE_FROM, translated: { ...ZH_MADE_FROM.translated } }
  for (const [key, choice] of Object.entries(savedWords())) {
    if (choice.zhFrom !== null) madeFrom.translated[key] = choice.zhFrom
  }
  const found = whatWaitsForTranslation(english, EFFECTIVE_WORD_LISTS.zh, madeFrom)
  const page = found.waiting.slice(offset, offset + limit)
  return {
    count: found.waiting.length,
    byReason: Object.fromEntries(WAITING_REASONS.map((reason) => [reason, found.waiting.filter((one) => one.reason === reason).length])) as Record<WaitingReason, number>,
    words: page.map((one) => ({ ...one, english: english[one.key] as Word })),
    offset,
    next: offset + page.length < found.waiting.length ? offset + page.length : null,
    chineseRemoved: found.chineseRemoved,
    chineseWithoutEnglish: found.chineseWithoutEnglish,
    record: { file: 'src/shared/words/zh-made-from.ts', baselineOn: ZH_MADE_FROM.baseline.on, baselineSays: ZH_MADE_FROM.baseline.says },
  }
}

export interface WhatTheWordsWaitingForALanguageDoorSays {
  readonly language: Language
  readonly count: number
  readonly byReason: Readonly<Record<WaitingReason, number>>
  readonly words: readonly { readonly key: string; readonly reason: WaitingReason; readonly english: Word }[]
  readonly offset: number
  readonly next: number | null
  /** Kept under the name the Chinese answer has, so one reader reads both answers. */
  readonly chineseRemoved: readonly string[]
  readonly chineseWithoutEnglish: readonly string[]
  readonly translationRemoved: readonly string[]
  readonly translationWithoutEnglish: readonly string[]
  readonly record: { readonly file: string | null; readonly baselineOn: string; readonly baselineSays: string }
}

/**
 * ONE LANGUAGE'S WAITING WORDS. English is the source, so nothing waits for it. Chinese keeps the office's saved
 * translation fingerprints; every language added after it records its own in src/shared/words/<code>-made-from.ts.
 */
export function whatTheWordsWaitingForLanguageDoorSays(language: Language, offset: number, limit: number): WhatTheWordsWaitingForALanguageDoorSays {
  const english = EFFECTIVE_WORD_LISTS.en as Readonly<Record<string, Word>>
  const record = madeFromFor(language)
  let madeFrom = record
  if (language === 'zh') {
    const translated = { ...record.translated }
    for (const [key, choice] of Object.entries(savedWords())) {
      if (choice.zhFrom !== null) translated[key] = choice.zhFrom
    }
    madeFrom = { baseline: record.baseline, translated }
  }
  const found = language === 'en'
    ? { waiting: [], chineseRemoved: [], chineseWithoutEnglish: [] }
    : whatWaitsForTranslation(english, EFFECTIVE_WORD_LISTS[language], madeFrom)
  const page = found.waiting.slice(offset, offset + limit)
  return {
    language,
    count: found.waiting.length,
    byReason: Object.fromEntries(WAITING_REASONS.map((reason) => [reason, found.waiting.filter((one) => one.reason === reason).length])) as Record<WaitingReason, number>,
    words: page.map((one) => ({ ...one, english: english[one.key] as Word })),
    offset,
    next: offset + page.length < found.waiting.length ? offset + page.length : null,
    chineseRemoved: found.chineseRemoved,
    chineseWithoutEnglish: found.chineseWithoutEnglish,
    translationRemoved: found.chineseRemoved,
    translationWithoutEnglish: found.chineseWithoutEnglish,
    record: { file: madeFromFile(language), baselineOn: record.baseline.on, baselineSays: record.baseline.says },
  }
}

/** The languages this door can be asked about, for a refusal that names them. */
export const WAITING_LANGUAGES = Object.keys(LANGUAGES) as readonly Language[]
