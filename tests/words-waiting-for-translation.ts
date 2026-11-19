// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE PARITY TESTS ACCEPT: a key the waiting list holds, from wave 13j's round 41.
 *
 * A test that asks every key, or every key of a part, for its Chinese gives the keys it found with no
 * Chinese to `notWaitingForTranslation`, and expects what comes back to be empty. A key with English and
 * no Chinese that nobody recorded Chinese for is waiting, and is let through. Chinese that was taken out is
 * not waiting, because the record says what English it was made from, so it comes back and the test fails.
 *
 * The list is worked out once, from the joined lists the pages read and the record, by the function the
 * door and Settings use (src/shared/words/waiting.ts). It is a module of its own, and not an export of a
 * test file, because a test file that imports another test file runs that file's tests a second time.
 */
import { WORD_LISTS } from '../src/shared/i18n.ts'
import { whatWaitsForTranslation } from '../src/shared/words/waiting.ts'
import { ZH_MADE_FROM } from '../src/shared/words/zh-made-from.ts'

/** What waits for translation and what is wrong, from the lists as they are now. */
export function theWaitingList() {
  return whatWaitsForTranslation(WORD_LISTS.en, WORD_LISTS.zh, ZH_MADE_FROM)
}

/** The keys among these that the waiting list does not hold. */
export function notWaitingForTranslation(keys: readonly string[]): string[] {
  const waiting = new Set(theWaitingList().waiting.map((one) => one.key))
  return keys.filter((key) => !waiting.has(key))
}

/**
 * How many keys wait because they have no Chinese yet. It is the Chinese missing count the word check on Settings
 * should draw: Chinese that was taken out is missing too, and is not counted here, so a page that misses it fails.
 */
export function howManyWaitWithNoChinese(): number {
  return theWaitingList().waiting.filter((one) => one.reason === 'noChinese').length
}

/**
 * The keys of the word check's drawn fallback rows that do not wait for translation (wave 13j's round 42). A row reads
 * "{key}：{n} 次" in Chinese and "{key}: {n} times" in English. A row of any other shape is kept whole, so it fails.
 */
export function fallbackRowsNotWaiting(rows: readonly string[]): string[] {
  return notWaitingForTranslation(rows.map((row) => /^(\S+)(?:：| *: )\d[\d,]* (?:次|times?)$/.exec(row)?.[1] ?? row))
}

/** A page's word check with the waiting keys taken out of what the Chinese list is missing: `{ en: [], zh: [] }` when nothing else is. */
export function missingAndNotWaiting(missing: { readonly en: readonly string[]; readonly zh: readonly string[] }): { en: string[]; zh: string[] } {
  return { en: [...missing.en], zh: notWaitingForTranslation(missing.zh) }
}

/**
 * The word a page in this language draws for a key, from the joined lists the pages read (wave 13j's round 43). On a
 * Chinese page a key that waits with no Chinese is drawn in exactly its English. A key with no
 * word, and a Chinese key that was taken out, give undefined, so a test that expects the word on the page fails.
 */
export function theWordAPageDraws(language: 'en' | 'zh', key: string): string | undefined {
  const en = WORD_LISTS.en as Readonly<Record<string, unknown>>
  const zh = WORD_LISTS.zh as Readonly<Record<string, unknown>>
  const waitsWithNoChinese = theWaitingList().waiting.some((one) => one.key === key && one.reason === 'noChinese')
  const word = language === 'en' ? en[key] : Object.hasOwn(zh, key) ? zh[key] : waitsWithNoChinese ? en[key] : undefined
  return typeof word === 'string' ? word : undefined
}
