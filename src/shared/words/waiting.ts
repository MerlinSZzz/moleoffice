// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT WAITS FOR TRANSLATION, worked out from the word lists themselves and never kept by hand, in
 * wave 13j's round 41.
 *
 * A word waits for one of three reasons:
 *   - `noChinese`: its English is there and its Chinese is not;
 *   - `englishChanged`: its Chinese is there, and its English is not the English the record says the
 *     Chinese was made from;
 *   - `nobodyRecorded`: its Chinese is there, and nothing says which English it was made from.
 *
 * THE RECORD is src/shared/words/zh-made-from.ts, a fingerprint of the English for each Chinese key. The
 * translation round writes it with scripts/chinese-made-from.ts as it writes the Chinese. Its baseline is
 * what each Chinese word stood beside on the day the record began, which is not a check that it was
 * translated from that English, and the record says so.
 *
 * TWO THINGS ARE NOT WAITING, AND ARE WRONG: a key the record has, with English and no Chinese, is Chinese
 * that was taken out (`chineseRemoved`); a Chinese key with no English is `chineseWithoutEnglish`. The
 * parity tests refuse both.
 */

export type WaitingReason = 'noChinese' | 'englishChanged' | 'nobodyRecorded'
export const WAITING_REASONS: readonly WaitingReason[] = ['noChinese', 'englishChanged', 'nobodyRecorded']

/**
 * The fingerprints of the English each word of one language was made from, by key. The Chinese record was the
 * first (src/shared/words/zh-made-from.ts); each language added after it has its own record beside it.
 */
export interface ChineseMadeFrom {
  /** The fingerprints written on the day the record began, of the English each Chinese word stood beside. */
  readonly baseline: { readonly on: string; readonly says: string; readonly fingerprints: Readonly<Record<string, string>> }
  /** The fingerprints the translation round wrote, of the English it made each Chinese word from. */
  readonly translated: Readonly<Record<string, string>>
}

/** The record of one language's translations. Kept under the Chinese name it was first written with. */
export type MadeFromRecord = ChineseMadeFrom

export interface WaitingWord {
  readonly key: string
  readonly reason: WaitingReason
}

export interface WhatWaitsForTranslation {
  /** Sorted by key. */
  readonly waiting: readonly WaitingWord[]
  readonly chineseRemoved: readonly string[]
  readonly chineseWithoutEnglish: readonly string[]
}

/** Eight hex digits of FNV-1a over the word as JSON: a plural word's forms are part of it. */
export function fingerprintOfEnglish(word: unknown): string {
  const text = JSON.stringify(word)
  if (text === undefined) throw new Error(`An English word cannot be fingerprinted: ${String(word)}.`)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** The fingerprint the record holds for a key: the translation round's, or else the baseline's. */
export function recordedFingerprint(madeFrom: ChineseMadeFrom, key: string): string | undefined {
  if (Object.hasOwn(madeFrom.translated, key)) return madeFrom.translated[key]
  if (Object.hasOwn(madeFrom.baseline.fingerprints, key)) return madeFrom.baseline.fingerprints[key]
  return undefined
}

export function whatWaitsForTranslation(english: object, chinese: object, madeFrom: ChineseMadeFrom): WhatWaitsForTranslation {
  const waiting: WaitingWord[] = []
  const chineseRemoved: string[] = []
  const englishKeys = Object.keys(english).sort()
  for (const key of englishKeys) {
    const recorded = recordedFingerprint(madeFrom, key)
    if (!Object.hasOwn(chinese, key)) {
      if (recorded === undefined) waiting.push({ key, reason: 'noChinese' })
      else chineseRemoved.push(key)
    } else if (recorded === undefined) {
      waiting.push({ key, reason: 'nobodyRecorded' })
    } else if (recorded !== fingerprintOfEnglish((english as Record<string, unknown>)[key])) {
      waiting.push({ key, reason: 'englishChanged' })
    }
  }
  const chineseWithoutEnglish = Object.keys(chinese).filter((key) => !Object.hasOwn(english, key)).sort()
  return { waiting, chineseRemoved, chineseWithoutEnglish }
}
