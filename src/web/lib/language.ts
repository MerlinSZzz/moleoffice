// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// ?lang= is for tests and pictures: it names the page language for this page view only.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { LANGUAGES, isLanguage, setWordLanguage, type Language, type PageLanguage } from '@shared/i18n.ts'
import { bringWordsOf, wordsAreHere } from '@shared/words/joined.ts'
import { api, getActor, subscribeActor } from '../api.ts'
import { makeBroadcast } from './store.ts'
import { readParticipantsOnce } from './oneread.ts'
import { subscribeWords, wordGeneration } from '@shared/word-settings.ts'

export type LanguageSource = 'address' | 'person' | 'browser'

/**
 * The first supported browser preference wins, including regional forms such as zh-TW, el-GR, es-419, it-CH,
 * ko-KR and pt-BR. The regional form only chooses the language; Spanish and Portuguese are read in the European
 * usage wherever the browser is. Anything the office does not speak still falls to English.
 */
export function browserLanguage(languages: readonly string[]): Language {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0]
    if (isLanguage(base)) return base
  }
  return 'en'
}

export function languageFromAddress(search: string): PageLanguage | null {
  const asked = new URLSearchParams(search).get('lang')
  return isLanguage(asked) || asked === 'xx' ? asked : null
}

export function languageForPage(address: PageLanguage | null, chosen: Language | null, browser: Language) {
  if (address !== null) return { language: address, source: 'address' as const }
  if (chosen !== null) return { language: chosen, source: 'person' as const }
  return { language: browser, source: 'browser' as const }
}

interface LanguageReading {
  language: PageLanguage
  source: LanguageSource
  chosen: Language | null
  personId: string | null
  status: 'loading' | 'ready' | 'error'
  saving: boolean
  saveFailed: boolean
  /** A language whose words did not reach the page, so the page is still drawn in the one it had. */
  wordsMissing: Language | null
}

const broadcast = makeBroadcast()
const address = languageFromAddress(typeof window === 'undefined' ? '' : window.location?.search ?? '')
const browser = browserLanguage(typeof navigator === 'undefined' ? [] : navigator.languages)
let reading: LanguageReading = {
  ...languageForPage(address, null, browser),
  chosen: null, personId: null, status: 'loading', saving: false, saveFailed: false, wordsMissing: null,
}
let requestNumber = 0
let asking = 0
let theWordsAsked: Promise<void> = Promise.resolve()

/** Draw the page in a language whose words are here. */
function draw(language: PageLanguage): void {
  setWordLanguage(language)
  if (typeof document !== 'undefined') document.documentElement.lang = language
  broadcast.announce()
}

/**
 * THE PAGE IS DRAWN IN A LANGUAGE ONLY ONCE ITS WORDS ARE HERE. The built page
 * carries English and Chinese, and the words of the other six come when they are asked for
 * (src/shared/words/joined.ts). The reading says the language asked for at once, and the page stays in the language
 * it had until the words come. When they do not come, the reading names the language, the page says so
 * (src/web/lib/the-words-that-did-not-come.tsx), and the page stays as it was. A later ask replaces an earlier one.
 */
function announce(next: LanguageReading): void {
  const ask = ++asking
  const wanted = next.language
  reading = { ...next, wordsMissing: null }
  if (wanted === 'xx' || wordsAreHere(wanted)) {
    theWordsAsked = Promise.resolve()
    draw(wanted)
    return
  }
  broadcast.announce()
  theWordsAsked = bringWordsOf(wanted).then(
    () => {
      if (ask !== asking) return
      reading = { ...reading }
      draw(wanted)
    },
    () => {
      if (ask !== asking) return
      reading = { ...reading, wordsMissing: wanted }
      broadcast.announce()
    },
  )
}

/**
 * Settles when the words of the language last asked for are on the page, or are known not to have come. It never
 * fails. src/web/main.tsx waits for it before the first drawing, so a page in Greek is drawn in Greek from the start.
 */
export function theWordsAskedFor(): Promise<void> {
  return theWordsAsked
}

/** The notice's press: ask again for the words that did not come. */
export function bringTheMissingWordsAgain(): void {
  if (reading.wordsMissing !== null) announce({ ...reading })
}

/**
 * Until the account answers, the panel says it is reading, rather than claiming no choice exists.
 *
 * THE PAGE KEEPS ITS LANGUAGE WHILE IT READS. A reading starts again each time the page switches whom it writes as.
 * Until wave 13y round 82 it began by putting the browser's language on the page, which is a guess, so a person who
 * chose Chinese saw the page in English after a switch until the reading answered. Now the answer's language is the
 * first drawn after the switch. A writer who is not a person, and a reading that fails, still end on the browser's.
 */
export async function readLanguage(fresh = false): Promise<void> {
  const request = ++requestNumber
  const actor = getActor()
  announce({ ...reading, chosen: null, personId: null, status: 'loading', saving: false, saveFailed: false })
  try {
    const reply = await (fresh ? readParticipantsOnce.again() : readParticipantsOnce())
    if (request !== requestNumber) return
    const person = actor.type === 'human' ? reply.people.find((one) => one.id === actor.id) : undefined
    if (person === undefined) {
      announce({ ...reading, ...languageForPage(address, null, browser), status: 'error' })
      return
    }
    const chosen = person.language ?? null
    announce({ ...reading, ...languageForPage(address, chosen, browser), chosen, personId: person.id, status: 'ready' })
  } catch {
    if (request === requestNumber) announce({ ...reading, ...languageForPage(address, null, browser), status: 'error' })
  }
}

/** A press redraws at once. An unconfirmed save restores the last reading and says so. */
export async function chooseLanguage(chosen: Language | null): Promise<void> {
  if (reading.status !== 'ready' || reading.personId === null || reading.saving) return
  const before = reading
  const request = ++requestNumber
  announce({ ...reading, ...languageForPage(address, chosen, browser), chosen, saving: true, saveFailed: false })
  try {
    const reply = await api.changeParticipant('person', before.personId!, { language: chosen ?? '' })
    if (request !== requestNumber) return
    const saved = reply.participant.language ?? null
    announce({ ...reading, ...languageForPage(address, saved, browser), chosen: saved, saving: false })
  } catch {
    if (request === requestNumber) announce({ ...before, saveFailed: true })
  }
}

/**
 * THE FIRST-RUN GUIDE'S LANGUAGE, shown before there is a person to keep it on.
 *
 * A fresh office has no person yet, so the guide (src/web/pages/WelcomePage.tsx) cannot save a
 * choice the way chooseLanguage does. This redraws the page in the language chosen, and nothing
 * more. The guide sends the same language with the name to POST /api/office/owner, which keeps it on
 * the person; the guide then calls readLanguage, which reads it back from there.
 */
export function showLanguageBeforeItIsKept(chosen: Language): void {
  announce({ ...reading, ...languageForPage(address, chosen, browser), chosen })
}

export function useLanguage(): LanguageReading {
  useSyncExternalStore(subscribeWords, wordGeneration, wordGeneration)
  return useSyncExternalStore(broadcast.subscribe, () => reading, () => reading)
}

/**
 * EVERY LANGUAGE'S WORDS, for the developer counts on the Settings page, which read every list
 * (src/web/components/WordCheckPanel.tsx). They are asked for only while `wanted`. `didNotCome` names the first
 * language whose words did not come, and `again` asks again.
 */
export function useEveryLanguagesWords(wanted: boolean): { here: boolean; didNotCome: Language | null; again: () => void } {
  const [tries, setTries] = useState(0)
  const [didNotCome, setDidNotCome] = useState<Language | null>(null)
  const [, setAnswers] = useState(0)
  useEffect(() => {
    if (!wanted) return
    let live = true
    setDidNotCome(null)
    const languages = Object.keys(LANGUAGES) as Language[]
    void Promise.allSettled(languages.map((language) => bringWordsOf(language))).then((results) => {
      if (!live) return
      const failed = results.findIndex((result) => result.status === 'rejected')
      setDidNotCome(failed === -1 ? null : languages[failed]!)
      setAnswers((n) => n + 1)
    })
    return () => { live = false }
  }, [wanted, tries])
  const here = (Object.keys(LANGUAGES) as Language[]).every((language) => wordsAreHere(language))
  return { here, didNotCome, again: () => { setTries((n) => n + 1) } }
}

// Set the document before the first page draws. Reading the account then updates every subscriber.
announce(reading)
if (typeof window !== 'undefined' && window.location?.protocol?.startsWith('http')) {
  subscribeActor(() => { void readLanguage(true) })
  void readLanguage()
}
