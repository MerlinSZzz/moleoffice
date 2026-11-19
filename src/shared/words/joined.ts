// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { LANGUAGES, type Language, type Word } from '../i18n.ts'
import type { el } from './el.ts'
import { en } from './en.ts'
import type { es } from './es.ts'
import type { it } from './it.ts'
import { joinWordLists } from './join-word-lists.ts'
import type { ko } from './ko.ts'
import { LATER_WORDS_ALREADY_HERE, LATER_WORDS_FILES } from './later-words-here.ts'
import * as parts from './parts.ts'
import type { pt } from './pt.ts'
import type { th } from './th.ts'
import { zh } from './zh.ts'

/**
 * THE WORD LISTS AS THE PAGES READ THEM: one core file per language (en.ts, zh.ts, el.ts and the six
 * waiting beside them), each joined with every part file parts.ts names, by joinWordLists, by wave
 * 13j's round 41.
 *
 * A wave writes its new words in its own file, src/shared/words/en-wave-13x.ts, in English only. A
 * translation round writes a language's words in its core file, and a later wave's words for that
 * language in <code>-wave-<wave>.ts. parts.ts holds one line for each part file and nothing else, so
 * two waves that each add a file change it on different lines.
 *
 * THE ORDER IS FIXED: the core list first, then its parts in the order of their names. A key in two of
 * them is refused at once, by joinWordLists, naming the key.
 *
 * Each list is joined the first time it is asked for, and not while this module loads, because en.ts
 * imports modules that import i18n.ts, which imports this. That is also why the part-name pattern is
 * built inside thePartsOf: LANGUAGES is not ready while this module is being loaded.
 *
 * THE BUILT PAGE CARRIES ONLY ENGLISH AND CHINESE. The six other core files come
 * when the page asks for them, by bringWordsOf below, and src/shared/words/later-words-here.ts says how.
 */

type Parts = typeof parts
type Intersection<U> = (U extends unknown ? (one: U) => void : never) extends (all: infer I) => void ? I : never
type PartsOf<L extends Language> = Intersection<{ [K in keyof Parts]: K extends `${L}${string}` ? Parts[K] : never }[keyof Parts]>

/** The core file of each language. A language with no words yet is an empty object, not a missing file. */
interface Cores { en: typeof en; zh: typeof zh; el: typeof el; es: typeof es; it: typeof it; ko: typeof ko; pt: typeof pt; th: typeof th }
type CoreOf<L extends Language> = Cores[L]
type WordsOf<L extends Language> = CoreOf<L> & PartsOf<L>

/** Every English word: en.ts and every English part. */
export type EnglishWords = WordsOf<'en'>
/**
 * Every Chinese word: zh.ts and every Chinese part. A key with Chinese keeps its exact type. Any other English key
 * may be missing, because a wave's new words wait for their Chinese (wave 13j's round 42).
 */
export type ChineseWords = typeof zh & PartsOf<'zh'> & { readonly [K in keyof EnglishWords]?: string | { readonly other: string } }
/** Every Greek word: el.ts and every Greek part. A later wave's file may hold a key this one does not yet. */
export type GreekWords = WordsOf<'el'>

/**
 * THE CORE FILE OF EACH LANGUAGE THAT IS HERE, made when a list is asked for and not while this module loads. A test
 * imports en.ts first in a fresh graph, so en.ts is still being initialised when this module is reached; reading `en`
 * here at the top would be a use before initialisation.
 *
 * THE LATER LANGUAGES ARE COPIED AS THEIR GETTERS, NOT READ. Reading a later language's getter loads its file
 * (src/shared/words/later-words-here.ts), and a spread reads every getter, so asking for English would load all six.
 */
function cores(): Readonly<Partial<Record<Language, object>>> {
  return Object.defineProperties({ en, zh }, {
    ...Object.getOwnPropertyDescriptors(LATER_WORDS_ALREADY_HERE),
    ...Object.getOwnPropertyDescriptors(brought),
  })
}

/** The core files the page has fetched, and the fetches still on their way. */
const brought: Partial<Record<Language, object>> = {}
const bringing: Partial<Record<Language, Promise<void>>> = {}

/** Whether a language's words are on this page. Always true outside the built page. */
export function wordsAreHere(language: Language): boolean {
  return Object.hasOwn(cores(), language)
}

/**
 * FETCH ONE LANGUAGE'S CORE FILE, once. A fetch that failed is forgotten, so asking again fetches again. It is a
 * fetch and not import(), because Chromium keeps a failed import: measured on 8 November 2026 with Chromium 151, a
 * second import() of a module whose first one failed sent no request and failed at once.
 */
export function bringWordsOf(language: Language): Promise<void> {
  if (wordsAreHere(language)) return Promise.resolve()
  bringing[language] ??= fetchTheWordsOf(language).then(
    (words) => { brought[language] = words },
    (error: unknown) => {
      delete bringing[language]
      throw error
    },
  )
  return bringing[language]
}

async function fetchTheWordsOf(language: Language): Promise<object> {
  const file = (LATER_WORDS_FILES as Partial<Record<Language, string>>)[language]
  if (file === undefined) throw new Error(`This page names no file for the words of the language "${language}".`)
  const reply = await fetch(new URL(file, import.meta.url))
  if (!reply.ok) throw new Error(`The words of the language "${language}" did not come: ${file} answered ${String(reply.status)}.`)
  return (await reply.json()) as object
}

/** The part files of one language, in the order of their names. An export parts.ts names in any other form is refused. */
export function thePartsOf(language: Language): readonly { name: string; words: object }[] {
  const names = Object.keys(parts).sort()
  const pattern = new RegExp(`^(${Object.keys(LANGUAGES).join('|')})(NoWave|Wave[0-9]+[a-z]*)$`)
  const odd = names.filter((name) => !pattern.test(name))
  if (odd.length > 0) throw new Error(`src/shared/words/parts.ts names ${odd.join(', ')}, which is not a word list's part (enNoWave, enWave13x, zhWave13x, elWave14b).`)
  return names.filter((name) => name.startsWith(language)).map((name) => ({ name, words: (parts as Record<string, object>)[name] as object }))
}

const joined: Partial<Record<Language, Record<string, Word>>> = {}

/** One language's whole list: its core file joined with every part of it, in the order of their names. */
export function wordsIn(language: Language): Readonly<Record<string, Word>> {
  if (joined[language] === undefined) {
    const core = cores()[language]
    if (core === undefined) {
      throw new Error(`The words of the language "${language}" are not on this page yet. bringWordsOf brings them, and the page asks for them before it draws in that language (src/web/lib/language.ts).`)
    }
    joined[language] = joinWordLists(core, ...thePartsOf(language).map((part) => part.words)) as Record<string, Word>
  }
  return joined[language]
}

export function englishWords(): EnglishWords {
  return wordsIn('en') as EnglishWords
}

export function chineseWords(): ChineseWords {
  return wordsIn('zh') as ChineseWords
}

export function greekWords(): GreekWords {
  return wordsIn('el') as GreekWords
}
