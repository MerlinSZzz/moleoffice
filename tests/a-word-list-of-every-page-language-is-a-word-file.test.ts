// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORD LIST OF EVERY PAGE LANGUAGE IS A WORD FILE. It proves that the word file pattern is built from the page
 * languages, so a translation round for any page language, its made-from record included, can land as a standard
 * change of the kind words. A pattern that names en and zh again turns cases 1, 3 and 4 red. A pattern that takes any
 * name in the folder turns case 2 red. LANGUAGES written out again in i18n.ts turns case 5 red.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { aWordFile, aWordListPattern, whatAStandardDeclarationFinds, type WhatTheToolReadOfAStandardChange } from '../src/shared/standard-change.ts'
import { LANGUAGES } from '../src/shared/languages.ts'
import { LANGUAGES as LANGUAGES_FROM_I18N } from '../src/shared/i18n.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const WORDS_FOLDER = join(REPO, 'src/shared/words')

const changed = (...paths: string[]) => paths.map((path) => ({ path, deleted: false }))
/** What the check tool would hand on for these paths when nothing is protected, no case is lost and only words changed. */
function readOf(paths: string[]): WhatTheToolReadOfAStandardChange {
  return {
    neverStandard: [],
    cases: paths.filter((path) => path.startsWith('tests/') || path.includes('.test.')).map((path) => ({ path, removed: [] })),
    words: paths.map((path) => ({ path, plain: true, why: 'Only words changed.' })),
  }
}
const finds = (kind: unknown, paths: string[], read = readOf(paths)) => whatAStandardDeclarationFinds(kind, changed(...paths), read)

it('matches every word list of every page language, and its made-from record and wave parts', () => {
  const names = readdirSync(WORDS_FOLDER)
  for (const code of Object.keys(LANGUAGES)) {
    expect(names, `${code} has no ${code}.ts`).toContain(`${code}.ts`)
    const files = names.filter((name) => name === `${code}.ts` || (name.startsWith(`${code}-`) && name.endsWith('.ts')))
    for (const name of files) {
      expect(aWordFile(`src/shared/words/${name}`), `${code}: ${name}`).toBe(true)
    }
  }
})

it('does not match the files that join or wait on the lists, the test language, or the language lists', () => {
  const notWordFiles = [
    'src/shared/words/joined.ts',
    'src/shared/words/join-word-lists.ts',
    'src/shared/words/parts.ts',
    'src/shared/words/made-from.ts',
    'src/shared/words/waiting.ts',
    'src/shared/words/later-words-here.ts',
    'src/shared/words/xx.ts',
    'src/shared/i18n.ts',
    'src/shared/languages.ts',
  ]
  for (const path of notWordFiles) expect(aWordFile(path), path).toBe(false)
})

it('matches a made-up language once it is added to the list, with no edit to the rule', () => {
  const withAMadeUpLanguage = aWordListPattern([...Object.keys(LANGUAGES), 'qz'])
  for (const path of ['src/shared/words/qz.ts', 'src/shared/words/qz-made-from.ts', 'src/shared/words/qz-wave-13r.ts']) {
    expect(withAMadeUpLanguage.test(path), path).toBe(true)
  }
  for (const path of ['src/shared/words/qzx.ts', 'src/shared/qz.ts']) {
    expect(withAMadeUpLanguage.test(path), path).toBe(false)
  }
  const thePageLanguagesOnly = aWordListPattern(Object.keys(LANGUAGES))
  expect(thePageLanguagesOnly.test('src/shared/words/qz.ts')).toBe(false)
})

it('finds a translation round a standard change of the kind words', () => {
  for (const code of ['el', 'th']) {
    const paths = [`src/shared/words/${code}.ts`, `src/shared/words/${code}-made-from.ts`]
    expect(finds('words', paths, readOf(paths)), code).toMatchObject({ declared: 'words', matches: true })
  }
})

it('declares the page languages in one place only', () => {
  expect(LANGUAGES_FROM_I18N).toBe(LANGUAGES)
  expect(readFileSync(join(REPO, 'src/shared/languages.ts'), 'utf8')).not.toMatch(/^import\b/m)
  for (const code of Object.keys(LANGUAGES)) expect(code, code).toMatch(/^[a-z]+$/)
})
