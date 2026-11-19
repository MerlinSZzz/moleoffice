// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Language, Word, WordKey, WordLists } from './i18n.ts'
import { chineseWords, englishWords, wordsIn } from './words/joined.ts'
import { fingerprintOfEnglish, recordedFingerprint } from './words/waiting.ts'
import { ZH_MADE_FROM } from './words/zh-made-from.ts'

/** One office-wide choice per shipped key. A translation records the English it was made from. */
export interface SavedWord { en: Word; zh: Word | null; zhFrom: string | null }
export type SavedWords = Readonly<Record<string, SavedWord>>
let saved: SavedWords = {}
let generation = 0
let storedRevision = ''
let readFailure: string | null = null
const listeners = new Set<() => void>()
let joined: Partial<Record<Language, Record<string, Word>>> = {}

export function shippedWord(key: string): SavedWord | null {
  const en = englishWords() as Record<string, Word>
  const zh = chineseWords() as Record<string, Word>
  if (!Object.hasOwn(en, key)) return null
  return { en: en[key]!, zh: zh[key] ?? null, zhFrom: recordedFingerprint(ZH_MADE_FROM, key) ?? null }
}

/** Readers share this snapshot; no read changes somebody's authored content. */
export function savedWords(): SavedWords { return saved }
export function wordGeneration(): number { return generation }
export function wordReadFailure(): string | null { return readFailure }
export function wordReadFailed(reason: string): void {
  readFailure = reason
  generation++
  for (const listener of listeners) listener()
}
export function subscribeWords(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
/**
 * WHAT STOPS THIS RELEASE FROM USING ONE SAVED WORD, or nothing. installSavedWords asks it, and so does the
 * server's loader, which keeps a word that fails out of use and names it instead of refusing to start.
 */
export function problemsWithASavedWord(key: string, choice: unknown): string[] {
  const shipped = shippedWord(key)
  if (shipped === null) return [`This release has no page word with the key ${key}.`]
  if (choice === null || typeof choice !== 'object' || Array.isArray(choice)) return ['The saved choice is not an English and Chinese word.']
  const { en, zh, zhFrom } = choice as Record<string, unknown>
  const problems: string[] = []
  const check = (word: unknown, source: Word, language: Language) => {
    try { validateWord(word, source, language); return true }
    catch (error) { problems.push(`${language === 'en' ? 'English' : 'Chinese'}: ${error instanceof Error ? error.message : String(error)}`); return false }
  }
  const englishHolds = check(en, shipped.en, 'en')
  // Chinese is checked against the English it may copy, so a broken English line leaves it unchecked.
  if (zh !== null && (shipped.zh !== null || englishHolds)) check(zh, shipped.zh ?? en as Word, 'zh')
  if (zhFrom !== null && (typeof zhFrom !== 'string' || !/^[a-f0-9]{8}$/.test(zhFrom))) problems.push('The saved translation source is not a fingerprint of eight hexadecimal characters.')
  return problems
}
export function installSavedWords(next: SavedWords, revision = ''): void {
  if (readFailure === null && revision === storedRevision && JSON.stringify(next) === JSON.stringify(saved)) return
  for (const [key, choice] of Object.entries(next)) {
    const problems = problemsWithASavedWord(key, choice)
    if (problems.length > 0) throw new Error(`The saved word ${key} cannot be used. ${problems.join(' ')}`)
  }
  saved = structuredClone(next)
  storedRevision = revision
  readFailure = null
  joined = {}
  generation++
  for (const listener of listeners) listener()
}

export function effectiveWord(key: string): SavedWord | null { return saved[key] ?? shippedWord(key) }
/**
 * A LIST AS THE PAGES READ IT. English and Chinese may keep an office-wide saved choice for a key. The languages
 * added after them have no saved choice yet: they read their shipped list, and a key the list does not hold falls
 * back to English in `t` (src/shared/i18n.ts).
 */
function effectiveList(language: Language): Record<string, Word> {
  if (joined[language]) return joined[language]!
  const source = (language === 'en' || language === 'zh'
    ? (language === 'en' ? englishWords() : chineseWords())
    : wordsIn(language)) as Record<string, Word>
  const list: Record<string, Word> = {}
  const keepsSavedWords = language === 'en' || language === 'zh'
  // Shipped getters remain live. A cached reader must not freeze a renamed source word.
  for (const key of new Set([...Object.keys(source), ...(keepsSavedWords ? Object.keys(saved) : [])])) {
    if (keepsSavedWords) {
      const savedIn = language as 'en' | 'zh'
      if (saved[key]?.[savedIn] === null) continue
      Object.defineProperty(list, key, { enumerable: true, get: () => saved[key]?.[savedIn] ?? source[key] })
    } else {
      Object.defineProperty(list, key, { enumerable: true, get: () => source[key] })
    }
  }
  joined[language] = list
  return list
}
export const EFFECTIVE_WORD_LISTS: WordLists = {
  get en() { return effectiveList('en') },
  get zh() { return effectiveList('zh') },
  get el() { return effectiveList('el') },
  get es() { return effectiveList('es') },
  get it() { return effectiveList('it') },
  get ko() { return effectiveList('ko') },
  get pt() { return effectiveList('pt') },
  get th() { return effectiveList('th') },
}

export function substitutions(word: Word): string[] {
  const lines = typeof word === 'string' ? [word] : Object.values(word)
  return [...new Set(lines.flatMap(line => [...line.matchAll(/\{(\w+)\}/g)].map(match => match[1]!)))].sort()
}

/** Check structure and required values, never taste or phrasing. Text is always rendered as text. */
export function validateWord(word: unknown, source: Word, language: Language): asserts word is Word {
  const plural = typeof source !== 'string'
  if (!plural && typeof word !== 'string') throw new Error('This word is one line, not plural forms.')
  if (plural && (word === null || typeof word !== 'object' || Array.isArray(word))) throw new Error('This word needs plural forms, not one line.')
  const lines = typeof word === 'string' ? { other: word } : word as Record<string, unknown>
  if (plural) {
    const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories
    if (!categories.every(category => Object.hasOwn(lines, category))) throw new Error(`Required plural forms: ${categories.join(', ')}.`)
    if (Object.keys(lines).some(category => !['zero', 'one', 'two', 'few', 'many', 'other'].includes(category))) throw new Error('An unknown plural form was sent.')
  }
  if (Object.keys(lines).length === 0) throw new Error('At least one word is required.')
  for (const [form, line] of Object.entries(lines)) {
    const template = typeof source === 'string' ? source : source[form as Intl.LDMLPluralRule] ?? source.other!
    if (typeof line !== 'string' || (line.trim().length === 0 && template.trim().length > 0) || line.length > 4000) throw new Error('Each required word must contain text, within 4000 characters.')
    const required = substitutions(template)
    if (JSON.stringify(substitutions(line)) !== JSON.stringify(required)) throw new Error(`Keep exactly these substitutions: ${required.map(name => `{${name}}`).join(', ') || 'none'}.`)
    if (/[{}]/.test(line.replace(/\{\w+\}/g, '')) && !/[{}]/.test(template.replace(/\{\w+\}/g, ''))) throw new Error('A substitution has an unmatched brace.')
  }
}

export function translationStanding(choice: SavedWord): 'noChinese' | 'englishChanged' | 'nobodyRecorded' | 'matches' {
  if (choice.zh === null) return 'noChinese'
  if (choice.zhFrom === null) return 'nobodyRecorded'
  return choice.zhFrom === fingerprintOfEnglish(choice.en) ? 'matches' : 'englishChanged'
}
