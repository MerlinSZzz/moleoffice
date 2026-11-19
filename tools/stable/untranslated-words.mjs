#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Counts the shipped words still needing Chinese. Missing translations are a count, not a refused upgrade. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { words as mapWords } from '../../plugins/office-map/src/words.ts'
import { chineseWords, englishWords } from '../../src/shared/words/joined.ts'
import { whatWaitsForTranslation } from '../../src/shared/words/waiting.ts'
import { ZH_MADE_FROM } from '../../src/shared/words/zh-made-from.ts'
import { validateWord } from '../../src/shared/word-settings.ts'

/** An English string needs a Chinese string; an English plural needs the Chinese other form. */
export function missingChinese(english, chinese) {
  return Object.keys(english).sort().filter(key => {
    if (!Object.hasOwn(chinese, key)) return true
    const source = english[key]
    const word = chinese[key]
    try { validateWord(word, source, 'zh'); return false }
    catch { return true } // The product's validator refuses unusable Chinese; count it for the upgrade.
  })
}

export function translationStatus() {
  const english = englishWords()
  const chinese = chineseWords()
  const lists = [{ list: 'office', english, chinese }, { list: 'office-map', english: mapWords.en, chinese: mapWords.zh }]
  const missing = lists.flatMap(({ list, english, chinese }) => missingChinese(english, chinese).map(key => ({ list, key, english: english[key] })))
  const sourceReviews = whatWaitsForTranslation(english, chinese, ZH_MADE_FROM).waiting.filter(word => word.reason !== 'noChinese')
  return { englishCount: lists.reduce((n, list) => n + Object.keys(list.english).length, 0), untranslatedCount: missing.length, missing, sourceReviewCount: sourceReviews.length, sourceReviews }
}

function main(args) {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--json')) throw new Error('Use untranslated-words.mjs with no argument, or --json.')
  const report = translationStatus()
  if (args[0] === '--json') console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`${report.untranslatedCount} English words have no usable Chinese.`)
    for (const row of report.missing) console.log(`${row.list}: ${row.key}: ${JSON.stringify(row.english)}`)
    console.log(`${report.sourceReviewCount} existing Chinese words need a translation source review.`)
  }
  // The upgrade reports this count even when it proceeds. An unreadable dictionary still throws.
  process.exitCode = 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
