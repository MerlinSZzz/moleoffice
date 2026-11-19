// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT ENGLISH EACH TRANSLATED WORD WAS MADE FROM, AND WHAT WAITS FOR TRANSLATION IN ONE LANGUAGE.
 *
 *     node scripts/words-made-from.ts --language el                    # prints el's words waiting, with why
 *     node scripts/words-made-from.ts --language el --record <key>...  # records that each key's el was made from its English now
 *     node scripts/words-made-from.ts --language el --begin            # writes el's baseline; refuses once the record exists
 *
 * The language defaults to zh, so the old command with no --language still writes the Chinese record. The
 * translation round before a version works from the printed list. For each word it writes the translation in the
 * language's file, then runs --record with the keys it translated. That writes a fingerprint of each key's English
 * into src/shared/words/<language>-made-from.ts, so a later change to the English puts the word back on the list.
 * --record refuses a key with no translation or no English, and writes nothing then.
 *
 * The same lists are on Settings in Developer mode and at GET /api/words/waiting?language=. All three work it out
 * with whatWaitsForTranslation in src/shared/words/waiting.ts.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { LANGUAGES, type Language } from '../src/shared/i18n.ts'
import { englishWords, wordsIn } from '../src/shared/words/joined.ts'
import { fingerprintOfEnglish, whatWaitsForTranslation, type MadeFromRecord } from '../src/shared/words/waiting.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

/** The record file of one language. */
export function recordFileOf(language: Language): string {
  return resolve(HERE, '..', 'src', 'shared', 'words', `${language}-made-from.ts`)
}

/** The name the record is exported by: EL_MADE_FROM, ZH_MADE_FROM. */
export function recordNameOf(language: Language): string {
  return `${language.toUpperCase()}_MADE_FROM`
}

/** The Chinese record, kept as the name the old script exported. */
export const THE_RECORD = recordFileOf('zh')

const NAMES: Readonly<Record<Language, string>> = {
  en: 'English', zh: 'Chinese', el: 'Greek', es: 'Spanish', it: 'Italian', ko: 'Korean', pt: 'Portuguese', th: 'Thai',
}

const BASELINE_SAYS = (name: string) =>
  `What each ${name} word stood beside in the English list on the day this record began. It is not a check ` +
  `that the ${name} was translated from that English; it is the English that was there when nobody had recorded it.`

function entries(record: Readonly<Record<string, string>>, indent: string): string[] {
  return Object.keys(record)
    .sort()
    .map((key) => `${indent}${JSON.stringify(key)}: ${JSON.stringify(record[key])},`)
}

/** The record as the text of <language>-made-from.ts. */
export function theRecordAsText(record: MadeFromRecord, language: Language = 'zh'): string {
  const name = NAMES[language]
  return [
    `// Written by scripts/words-made-from.ts --language ${language} --record, and by nothing else: the translation round runs it.`,
    `// For each ${name} word, a fingerprint of the English it was made from. src/shared/words/waiting.ts reads it.`,
    "import type { MadeFromRecord } from './waiting.ts'",
    '',
    `export const ${recordNameOf(language)}: MadeFromRecord = {`,
    '  baseline: {',
    `    on: ${JSON.stringify(record.baseline.on)},`,
    `    says: ${JSON.stringify(record.baseline.says)},`,
    '    fingerprints: {',
    ...entries(record.baseline.fingerprints, '      '),
    '    },',
    '  },',
    '  translated: {',
    ...entries(record.translated, '    '),
    '  },',
    '}',
    '',
  ].join('\n')
}

/** The record with each key's fingerprint taken from its English now. Throws, naming them, for keys with no translation or no English. */
export function recordedNow(record: MadeFromRecord, keys: readonly string[], english: object, translated: object): MadeFromRecord {
  if (keys.length === 0) throw new Error('words-made-from: --record needs the keys whose translation was written. Nothing was written.')
  const noEnglish = keys.filter((key) => !Object.hasOwn(english, key))
  const noTranslation = keys.filter((key) => !Object.hasOwn(translated, key))
  if (noEnglish.length > 0 || noTranslation.length > 0) {
    throw new Error(
      `words-made-from: ${[noEnglish.length > 0 ? `no English for ${noEnglish.join(', ')}` : '', noTranslation.length > 0 ? `no translation for ${noTranslation.join(', ')}` : ''].filter(Boolean).join('; ')}. Nothing was written.`,
    )
  }
  const written = { ...record.translated }
  for (const key of keys) written[key] = fingerprintOfEnglish((english as Record<string, unknown>)[key])
  return { baseline: record.baseline, translated: written }
}

function languageOf(argv: readonly string[]): { language: Language; rest: string[] } {
  const at = argv.indexOf('--language')
  if (at < 0) return { language: 'zh', rest: [...argv] }
  const asked = argv[at + 1]
  if (asked === undefined || !Object.hasOwn(LANGUAGES, asked)) {
    throw new Error(`words-made-from: --language takes one of ${Object.keys(LANGUAGES).join(', ')}; it was ${JSON.stringify(asked)}. Nothing was written.`)
  }
  return { language: asked as Language, rest: [...argv.slice(0, at), ...argv.slice(at + 2)] }
}

/** Run the script for one language. `--begin` is refused before it writes when the record file already exists. */
export async function mainFor(language: Language, argv: readonly string[]): Promise<void> {
  const english = englishWords()
  const translated = wordsIn(language)
  const file = recordFileOf(language)
  if (argv[0] === '--begin') {
    if (existsSync(file)) throw new Error(`words-made-from: the ${language} record exists, so its baseline was written already. Nothing was written.`)
    const fingerprints = Object.fromEntries(
      Object.keys(translated)
        .filter((key) => Object.hasOwn(english, key))
        .map((key) => [key, fingerprintOfEnglish((english as Record<string, unknown>)[key])]),
    )
    const on = new Date().toISOString().slice(0, 10)
    writeFileSync(file, theRecordAsText({ baseline: { on, says: BASELINE_SAYS(NAMES[language]), fingerprints }, translated: {} }, language))
    console.log(`words-made-from: wrote the baseline of ${String(Object.keys(fingerprints).length)} ${NAMES[language]} words, on ${on}.`)
    return
  }
  const loaded = await import(pathToFileURL(file).href) as Record<string, unknown>
  const record = loaded[recordNameOf(language)] as MadeFromRecord | undefined
  if (record === undefined) throw new Error(`words-made-from: ${file} does not export ${recordNameOf(language)}. Nothing was written.`)
  if (argv[0] === '--record') {
    const keys = argv.slice(1)
    writeFileSync(file, theRecordAsText(recordedNow(record, keys, english, translated), language))
    console.log(`words-made-from: recorded the English of ${String(keys.length)} words: ${keys.join(', ')}.`)
    return
  }
  if (argv[0] === '--record-all') {
    // The first round of a language writes every key at once, too many for one command line. Refuse if any English
    // key has no word in this language, so the record can never say a list is whole when it is not.
    const missing = Object.keys(english).filter((key) => !Object.hasOwn(translated, key))
    if (missing.length > 0) throw new Error(`words-made-from: ${String(missing.length)} English keys have no ${NAMES[language]} word, the first is ${missing[0]}. Nothing was written.`)
    const keys = Object.keys(english)
    writeFileSync(file, theRecordAsText(recordedNow(record, keys, english, translated), language))
    console.log(`words-made-from: recorded the English of all ${String(keys.length)} ${NAMES[language]} words.`)
    return
  }
  if (argv.length > 0) throw new Error(`words-made-from: ${argv[0]} is not something this script does. It takes --language <code>, and nothing, --record <key>..., --record-all or --begin.`)
  const found = whatWaitsForTranslation(english, translated, record)
  console.log(`words-made-from: ${String(found.waiting.length)} ${NAMES[language]} words wait for translation.`)
  for (const one of found.waiting) console.log(`  ${one.key} (${one.reason})`)
  for (const key of found.chineseRemoved) console.log(`  WRONG: ${key} has English and a record, and its translation was taken out.`)
  for (const key of found.chineseWithoutEnglish) console.log(`  WRONG: ${key} has a translation and no English.`)
}

async function main(argv: readonly string[]): Promise<void> {
  const { language, rest } = languageOf(argv)
  await mainFor(language, rest)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
