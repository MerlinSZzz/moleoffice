// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HANDBOOK: guidance written for whoever starts a flow or takes a role card, kept as a record of its own. The owner's
 * decision of 7 November 2026 started it. KIND_SPECS.handbook declares its fields; this file holds its lists, how its
 * stored fields are read, the check of what one write may hold, and the one rule for which languages are sent.
 *
 * src/server/lib/handbooks.ts asks what changed between two versions and sends a handbook when a flow is started or a
 * card is given.
 */
import { isLanguage, type Language } from './i18n.ts'
import type { ValidationError } from './kinds.ts'
import { countWords } from './zoom.ts'

export const HANDBOOK_KIND = 'handbook'

/** Where a handbook stands. Only one in use is sent. A retired one is kept, and its page says it is retired. */
export const HANDBOOK_STATES = ['draft', 'in use', 'retired'] as const
export type HandbookState = (typeof HANDBOOK_STATES)[number]
export const IN_USE: HandbookState = 'in use'

/** The most words the opening part of one language's text may have. The rest has no limit. */
export const THE_OPENING_MOST_WORDS = 200

/** One language's text: the opening, which is sent, and the rest, which the reader asks for. */
export interface HandbookText {
  opening: string
  rest?: string
}

/** One place a handbook hangs on. A step is a flow and the step's number in it. */
export type HandbookPlace = { flow: string; step?: number } | { card: string } | { project: string }

/** One handbook as a page lists it: where it stands and the languages it is written in. GET /api/roles answers these. */
export interface HandbookRead {
  id: string
  title: string
  /** Null when the stored state is none of HANDBOOK_STATES. */
  state: HandbookState | null
  languages: Language[]
}

/** One handbook on a flow, as GET /api/flows/<id> answers it, with where on the flow it hangs. */
export interface FlowHandbookRead extends HandbookRead {
  /** True when it hangs on the whole flow. */
  onTheFlow: boolean
  /** The numbers of the steps it hangs on, smallest first. */
  steps: number[]
}

/**
 * WHY A HANDBOOK IS NOT ON A LIST: it is filed in a project the reader may not read. A list counts those in
 * `narrowedByPermission` (src/shared/disclosure.ts), and says neither which they are nor their titles.
 */
export const HANDBOOK_LIST_BUCKETS = ['in_a_project_you_may_not_read'] as const
export type HandbookListBucket = (typeof HANDBOOK_LIST_BUCKETS)[number]

/** One entry of the change record: which languages a write changed the text of, and why. */
export interface HandbookTextChange {
  languages: Language[]
  why: string
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The text a handbook's data holds, by language, keeping only entries that are text in a known language. */
export function theTextOf(data: unknown): Partial<Record<Language, HandbookText>> {
  const text = isObject(data) ? data['text'] : undefined
  if (!isObject(text)) return {}
  const out: Partial<Record<Language, HandbookText>> = {}
  for (const [language, one] of Object.entries(text)) {
    if (!isLanguage(language) || !isObject(one) || typeof one['opening'] !== 'string') continue
    out[language] = typeof one['rest'] === 'string' ? { opening: one['opening'], rest: one['rest'] } : { opening: one['opening'] }
  }
  return out
}

/** The places a handbook's data names, each read as one of the three forms, and nothing else. */
export function thePlacesOf(data: unknown): HandbookPlace[] {
  const places = isObject(data) ? data['hangs_on'] : undefined
  if (!Array.isArray(places)) return []
  return places.flatMap((place: unknown): HandbookPlace[] => {
    if (!isObject(place)) return []
    if (typeof place['flow'] === 'string') return [typeof place['step'] === 'number' ? { flow: place['flow'], step: place['step'] } : { flow: place['flow'] }]
    if (typeof place['card'] === 'string') return [{ card: place['card'] }]
    if (typeof place['project'] === 'string') return [{ project: place['project'] }]
    return []
  })
}

/** The change record a handbook's data holds, oldest first, as it is stored. */
export function theTextChangesOf(data: unknown): unknown[] {
  const changes = isObject(data) ? data['text_changes'] : undefined
  return Array.isArray(changes) ? changes : []
}

/** The why of the newest entry of the change record, or null because it holds none. */
export function theNewestWhyOf(data: unknown): string | null {
  const newest = theTextChangesOf(data).at(-1)
  return isObject(newest) && typeof newest['why'] === 'string' ? newest['why'] : null
}

/** Whom a handbook is for, or null because nobody recorded it: no "for", or one that is not words, or a blank one. */
export function theForOf(data: unknown): string | null {
  const who = isObject(data) ? data['for'] : undefined
  return typeof who === 'string' && who.trim() !== '' ? who : null
}

export function theStateOf(data: unknown): HandbookState | null {
  const state = isObject(data) ? data['state'] : undefined
  return HANDBOOK_STATES.find((one) => one === state) ?? null
}

/** The cards a handbook's data hangs on, by the card's word. */
export function theCardsOf(data: unknown): string[] {
  return thePlacesOf(data).flatMap((place) => ('card' in place ? [place.card] : []))
}

/**
 * WHAT ONE HANDBOOK'S DATA HOLDS THAT ITS SHAPE CANNOT SAY. The shapes have already refused a wrong type. This refuses
 * a text in a language the office does not have, an opening that is empty or longer than THE_OPENING_MOST_WORDS, a
 * place that is not exactly one of its three forms, and a change entry that names no language or gives no why.
 */
export function theHandbookAsWritten(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = []
  const text = data['text']
  if (isObject(text)) {
    if (Object.keys(text).length === 0) errors.push({ path: 'data.text', message: 'data.text holds no language. Write the text in at least one language, as {"en": {"opening": "..."}}.' })
    for (const [language, one] of Object.entries(text)) {
      const at = `data.text.${language}`
      if (!isLanguage(language)) errors.push({ path: at, message: `${at} names "${language}", which is not one of the office's languages. Use a language code such as "en" or "zh".` })
      if (!isObject(one) || typeof one['opening'] !== 'string') continue
      const words = countWords(one['opening'])
      if (words === 0) errors.push({ path: `${at}.opening`, message: `${at}.opening is empty. The opening is the part that is sent, so it needs words.` })
      if (words > THE_OPENING_MOST_WORDS) {
        errors.push({
          path: `${at}.opening`,
          message: `${at}.opening has ${words} words, and an opening has at most ${THE_OPENING_MOST_WORDS}. Put the rest in ${at}.rest, which is read on request.`,
        })
      }
    }
  }
  const places = data['hangs_on']
  if (Array.isArray(places)) {
    places.forEach((place: unknown, n) => {
      if (!isObject(place)) return
      const named = ['flow', 'card', 'project'].filter((key) => place[key] !== undefined)
      const at = `data.hangs_on[${n}]`
      if (named.length !== 1) {
        errors.push({
          path: at,
          message: `${at} must name exactly one place: {"flow": "<flow id>"}, {"flow": "<flow id>", "step": <its number>}, {"card": "<card word>"} or {"project": "<project id>"}. It names ${named.length === 0 ? 'none' : named.join(' and ')}.`,
        })
        return
      }
      if (place['step'] !== undefined && named[0] !== 'flow') errors.push({ path: `${at}.step`, message: `${at}.step names a step, and a step is one of a flow's: write the flow beside it.` })
      const step = place['step']
      if (typeof step === 'number' && !(Number.isInteger(step) && step >= 1)) errors.push({ path: `${at}.step`, message: `${at}.step is ${step}, and a step is counted from 1.` })
      const word = place[named[0]!]
      if (typeof word === 'string' && word.trim() === '') errors.push({ path: `${at}.${named[0]!}`, message: `${at}.${named[0]!} is blank, so it names nothing.` })
    })
  }
  theTextChangesOf(data).forEach((change: unknown, n) => {
    if (!isObject(change)) return
    const at = `data.text_changes[${n}]`
    const languages = change['languages']
    if (Array.isArray(languages)) {
      if (languages.length === 0) errors.push({ path: `${at}.languages`, message: `${at}.languages is empty. Name each language whose text the write changed.` })
      for (const language of languages) {
        if (!isLanguage(language)) errors.push({ path: `${at}.languages`, message: `${at}.languages names ${JSON.stringify(language)}, which is not one of the office's languages.` })
      }
    }
    if (typeof change['why'] === 'string' && change['why'].trim() === '') errors.push({ path: `${at}.why`, message: `${at}.why is blank. Say why the text changed.` })
  })
  return errors
}

/**
 * WHY THESE LANGUAGES WERE SENT: the reader's own; English, because the text is not written in the reader's; every
 * language written, because nobody said which the reader reads; every language written, because neither the reader's
 * nor English is written.
 */
export type WhyTheseLanguages = 'theirs' | 'english' | 'unknown' | 'neither'

/**
 * WHICH OF THE LANGUAGES A TEXT IS WRITTEN IN GO TO A READER, and why. The one rule, for a card's own handbook and for
 * a handbook record:
 *   - the reader's language, when the text is written in it;
 *   - otherwise English, when it is written in English;
 *   - otherwise every language it is written in;
 *   - every language it is written in, when nobody said which language the reader reads.
 */
export function theLanguagesToSend<L extends Language>(written: readonly L[], reads: Language | null): { languages: L[]; why: WhyTheseLanguages } {
  if (reads === null) return { languages: [...written], why: 'unknown' }
  const theirs = written.find((one) => one === reads)
  if (theirs !== undefined) return { languages: [theirs], why: 'theirs' }
  const english = written.find((one) => one === 'en')
  if (english !== undefined) return { languages: [english], why: 'english' }
  return { languages: [...written], why: 'neither' }
}
