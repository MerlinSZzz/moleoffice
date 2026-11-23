// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { filledWithChineseSpacing, gapBetween, gapWhereChineseMeets, wordWithSpacedValues } from './spacing.ts'
import { parseLocalStamp } from './time.ts'
import { wordsIn, type EnglishWords } from './words/joined.ts'
import { EFFECTIVE_WORD_LISTS, savedWords } from './word-settings.ts'
import { connectStoredWordReader } from './stored-word-reader.ts'
import { LANGUAGES, type Language } from './languages.ts'

export { LANGUAGES, type Language }
export type PageLanguage = Language | 'xx'
export type WordKey = keyof EnglishWords
export type WordValues = Readonly<Record<string, string | number>>
export type Word = string | Readonly<Partial<Record<Intl.LDMLPluralRule, string>>>
export type WordLists = Readonly<Record<Language, Readonly<Partial<Record<WordKey, Word>>>>>
// Getters let each word module be imported first without reading a table before it exists. Each list is a core file
// (en.ts, zh.ts, el.ts ...) joined with every wave's part (src/shared/words/joined.ts). A key a language's list does
// not hold yet is read in English by `t` below, and is on the list of words waiting for that language's translation
// (src/shared/words/waiting.ts).
export const WORD_LISTS: WordLists = {
  get en() { return wordsIn('en') },
  get zh() { return wordsIn('zh') },
  get el() { return wordsIn('el') },
  get es() { return wordsIn('es') },
  get it() { return wordsIn('it') },
  get ko() { return wordsIn('ko') },
  get pt() { return wordsIn('pt') },
  get th() { return wordsIn('th') },
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && Object.hasOwn(LANGUAGES, value)
}

/** Content belongs to its writer. Choosing a page language never changes it. */
export function content<T extends string | null | undefined>(text: T): T {
  return text
}

/**
 * HOW THE TEST LANGUAGE MARKS TEXT THAT CAME THROUGH THE LANGUAGE MACHINERY: in brackets, made longer, so a
 * check can find a letter that did not. A word is marked this way, and so is a day `writtenDay` writes.
 */
function markedInTheTestLanguage(text: string): string {
  return `⟦${text}${'·'.repeat(Math.ceil(text.length * 0.4))}⟧`
}

/** Each reader can hold its own language and counts, without React or a browser. */
export function createI18n(initial: PageLanguage = 'en', lists: WordLists = EFFECTIVE_WORD_LISTS) {
  let language = initial
  const fallbacks = new Map<string, number>()

  function wordIn(which: Language, key: WordKey, values?: WordValues): string | undefined {
    const list = lists[which]
    const word = Object.hasOwn(list, key) ? list[key] : undefined
    if (typeof word === 'string' || word === undefined) return word
    const n = typeof values?.n === 'number' ? values.n : 0
    return word[new Intl.PluralRules(which).select(n)]
  }

  function t(key: WordKey, values?: WordValues): string {
    let word = wordIn(language === 'xx' ? 'en' : language, key, values)
    // A CHINESE WORD FILLS ITS VALUES BY THE OFFICE'S ONE SPACING RULE (`filledWithChineseSpacing`, which asks
    // `gapBetween` through `spacedAtValues`, src/shared/spacing.ts): a Latin name or a number beside a Chinese character
    // takes a space, two Chinese characters take none, and `wordWithSpacedValues` gives the same answer (wave 13q's
    // rounds 30 and 30b). Only a word the Chinese list holds; an English word, here or as a fallback, is filled as it
    // is written.
    if (language === 'zh' && word !== undefined && values !== undefined) return filledWithChineseSpacing(word, values)
    if (word === undefined) {
      fallbacks.set(key, (fallbacks.get(key) ?? 0) + 1)
      word = wordIn('en', key, values)
      if (word === undefined) return `⟦${key}⟧`
    }
    const filled = word.replace(/\{(\w+)\}/g, (mark, name: string) =>
      values !== undefined && Object.hasOwn(values, name) ? String(values[name]) : mark,
    )
    return language === 'xx' ? markedInTheTestLanguage(filled) : filled
  }

  /** A count written the way the reader's language writes numbers, grouped by thousands: 16,557. */
  function count(n: number): string {
    return new Intl.NumberFormat(NUMBER_LOCALE[language === 'xx' ? 'en' : language]).format(n)
  }

  function check() {
    const keys = Object.keys(lists.en) as WordKey[]
    const missingByLanguage = Object.fromEntries(
      (Object.keys(LANGUAGES) as Language[]).map((which) => [which, keys.filter((key) => lists[which][key] === undefined)]),
    ) as Record<Language, WordKey[]>
    return {
      total: keys.length,
      missingByLanguage,
      fallbacks: [...fallbacks].map(([key, count]) => ({ key, count })),
    }
  }

  return { t, count, check, setLanguage: (next: PageLanguage) => { language = next }, language: (): PageLanguage => language }
}

/**
 * Which locale groups the digits of a count in each language the pages speak, and which locale writes its days.
 * Spanish and Portuguese are the European usage, whatever regional form the browser asked for. Thai asks for the
 * Gregorian calendar, because Intl writes the Buddhist year for Thai by default: 2569 where the pages write 2026.
 */
const NUMBER_LOCALE: Readonly<Record<Language, string>> = {
  en: 'en-GB', zh: 'zh-CN', el: 'el-GR', es: 'es-ES', it: 'it-IT', ko: 'ko-KR', pt: 'pt-PT', th: 'th-TH-u-ca-gregory',
}

/** The page reader lasts for this visit. Servers can create a reader per request. */
export const { t, count, check: wordCheck, setLanguage: setWordLanguage, language: wordLanguage } = createI18n()

/**
 * THE LOCALE THE PAGE WRITES A DAY IN, for the page's language: "29 Sept 2026" in English and
 * "2026 年 9 月 29 日" in Chinese. It is the locale a count is grouped in, so the one table above says both.
 * The test language writes English's, which is how a line drawn by Intl stays unmarked there.
 */
export function pageLocale(): string {
  const language = wordLanguage()
  return NUMBER_LOCALE[language === 'xx' ? 'en' : language]
}

/**
 * THE END OF A SENTENCE, IN THE PAGE'S LANGUAGE: "." in English, "。" in Chinese, from the word `sentence.stop`. A
 * sentence put together from parts on a page ends here rather than with a "." typed in the markup, which was English
 * on every page (wave 13q's round 29). Given what follows, it adds the office's gap after the stop: a space in
 * English, none after 。. A stop that is only whitespace (Thai separates with a space and has no full stop) is not
 * drawn when nothing follows, so a text does not end in a space; with a sentence after it, exactly one space falls.
 */
export function endOfSentence(next?: string): string {
  const stop = t('sentence.stop')
  if (next === undefined) return stop.trim() === '' ? '' : stop
  return stop + gapBetween(stop, next)
}

/** Whole sentences, one after another, with the office's gap between them: a space in English, none after 。. */
export function sentencesJoined(sentences: readonly string[]): string {
  return sentences.reduce((line, one) => line + gapBetween(line, one) + one, '')
}

/** Clauses of one sentence, joined in the page's language: "a; b" in English, "a；b" in Chinese (`sentence.clauseGap`). */
export function clausesJoined(clauses: readonly string[]): string {
  return clauses.join(t('sentence.clauseGap'))
}

/** A list a person reads, joined in the page's language: "a, b" in English, "a、b" in Chinese (`sentence.listGap`). */
export function listJoined(items: readonly string[]): string {
  return items.join(t('sentence.listGap'))
}

/** Which parts of a day a line writes: any of the weekday, the day, the month and the year, as Intl names them. */
export type DayParts = Pick<Intl.DateTimeFormatOptions, 'weekday' | 'day' | 'month' | 'year'>

/**
 * A DAY IN WORDS, IN THE PAGE'S LANGUAGE: THE ONE PLACE THE OFFICE WRITES ONE (invariant 9). The caller
 * names the parts it wants; Intl puts them in the page language's order, and the office's spacing rule
 * (`gapWhereChineseMeets`, src/shared/spacing.ts) joins them where a Chinese character meets a number. So Chinese takes a space between a number and a
 * character and none between two characters: "2026 年 10 月 26 日", "10 月 3 日星期六". English reads as
 * Intl writes it: "26 Oct 2026", "Saturday 3 October". Until wave 13q's round 28 Chinese days were
 * written three ways, two of them unspaced. In the test language the day is marked as a word is, because
 * it came through the language machinery (English's form inside the marks). A moment written as numbers ("2026/10/03 14:05", `drawnStamp` in src/shared/time.ts) is not a day in words
 * and does not come here.
 */
export function writtenDay(when: Date, parts: DayParts): string {
  const line = new Intl.DateTimeFormat(pageLocale(), parts)
    .formatToParts(when)
    .reduce((written, part) => written + gapWhereChineseMeets(written, part.value) + part.value, '')
  return wordLanguage() === 'xx' ? markedInTheTestLanguage(line) : line
}

/**
 * TWO DAYS AS A RANGE, written once where they share a month or a year: "3 – 5 October 2026",
 * "2026 年 10 月 3 日至 5 日". The end the page's language writes the year on carries every part; the other
 * end carries only the parts that differ. The join is the word "days.range", spaced by `gapBetween`.
 */
export function writtenDayRange(from: Date, to: Date, parts: DayParts): string {
  const sameYear = from.getFullYear() === to.getFullYear()
  const shorter: DayParts = sameYear && from.getMonth() === to.getMonth()
    ? { day: parts.day }
    : sameYear ? { day: parts.day, month: parts.month } : parts
  const order = new Intl.DateTimeFormat(pageLocale(), { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(from).map((part) => part.type)
  const yearFirst = order.indexOf('year') < order.indexOf('day')
  return wordWithSpacedValues(t, 'days.range', yearFirst
    ? { from: writtenDay(from, parts), to: writtenDay(to, shorter) }
    : { from: writtenDay(from, shorter), to: writtenDay(to, parts) })
}

/**
 * A DAY WITH ITS MONTH SHORT: "28 Sept" or "28 Sept 2026" in English, "9 月 28 日" or "2026 年 9 月 28 日"
 * in Chinese, by `writtenDay`. A report's day, a due date and a moment on another day are written this
 * way. It lives here rather than in src/web/lib/minute.ts because src/web/lib/attention.ts uses it and
 * the server loads that file.
 */
export function dayInThePageLanguage(when: Date, withYear: boolean): string {
  return writtenDay(when, withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' })
}


/**
 * A STORED MOMENT IN WORDS, IN THE PAGE'S LANGUAGE: the day as `dayInThePageLanguage` writes it, with its year, and the
 * time of day: "4 Oct 2026, 05:37", "2026 年 10 月 4 日 05:37". The word `days.moment` joins them, spaced by the one rule.
 * The agent page's registered and key dates read this way since wave 13q's round 32; until then they were written as
 * numbers ("2026/10/04 05:37", `drawnStamp` in src/shared/time.ts), unlike every other date a person reads. A value that is
 * not a stamp is handed back as it is, as `drawnStamp` does, so an unreadable moment shows as itself.
 */
export function writtenMoment(stamp: string): string {
  const ms = parseLocalStamp(stamp)
  if (ms === null) return stamp
  const at = new Date(ms)
  const time = [at.getHours(), at.getMinutes()].map((n) => String(n).padStart(2, '0')).join(':')
  return wordWithSpacedValues(t, 'days.moment', { day: dayInThePageLanguage(at, true), time })
}

/** Shared readings on Node stay English, even when a page reader in this process changes language. */
const serverWords = createI18n('en')
export function readStoredWord(key: WordKey, values?: WordValues): string {
  return typeof process !== 'undefined' && process.versions?.node
    ? serverWords.t(key, values)
    : t(key, values)
}

/** A reader of words: `t` on a page, `sayInEnglish` where a sentence is stored or sent. */
export type Say = (key: WordKey, values?: WordValues) => string

/**
 * THE ENGLISH READER, in the browser as on the server. A composer the server and a page share takes a `Say`;
 * the server hands it this one, so what it stores is the English word list's words wherever it runs. A
 * function rather than `createI18n('en').t` at the top of a module, because the word lists import modules
 * that import those composers, and a reader made while this file is still loading would find no lists.
 */
export function sayInEnglish(key: WordKey, values?: WordValues): string {
  return serverWords.t(key, values)
}

// Connect after the shipped vocabulary is assembled; stored-value labels use the same reader.
connectStoredWordReader(key => Object.hasOwn(savedWords(), key) ? readStoredWord(key as WordKey) : undefined)
