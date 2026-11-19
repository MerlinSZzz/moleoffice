// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n, LANGUAGES, WORD_LISTS } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'

/**
 * EVERY WORD HAS ITS LANGUAGE, OR WAITS FOR IT IN THE READER'S LANGUAGE.
 *
 * A key a language does not hold is drawn in English and listed for that language in the waiting
 * reader; it is never drawn as its machine key. A bracketed key means English itself is missing, which
 * is a code fault and not a translation state.
 *
 * New features are written in English only, and translation follows before a version. Greek, Spanish,
 * Italian, Korean and Portuguese are therefore held as Chinese is: an English key that a language does not hold yet is
 * allowed while the waiting reader holds it, and that key is drawn in English. What is still refused
 * is a language that holds a key English does not, a key whose translation was taken out even though
 * its record says what English it was made from, a missing placeholder, a wrong plural, a machine key
 * and an empty word. Whether a round leaves anything waiting is a number a report can give, not a test
 * that other lines can break.
 *
 * The address and the radio are proved in a browser, because the browser reading and the saved choice are what a
 * person uses: ?lang=el names the page language for this view, and the Ελληνικά radio saves Greek on the person.
 * Spanish, Italian, Korean and Portuguese are proved the same way: their records say what English each word was
 * made from, and ?lang=es, ?lang=it, ?lang=ko, ?lang=pt or the Español, Italiano, 한국어 and Português radios
 * choose them.
 */

it('draws a missing word in English, and a missing English word as the bracketed key that names the code fault', () => {
  const english = createI18n('en')
  const greek = createI18n('el', { ...WORD_LISTS, el: {} })
  expect(greek.t('settings.language.title')).toBe(english.t('settings.language.title'))
  expect(greek.t('settings.language.title')).not.toBe('settings.language.title')
  const spanish = createI18n('es', { ...WORD_LISTS, es: {} })
  expect(spanish.t('settings.language.title')).toBe(english.t('settings.language.title'))
  expect(spanish.t('settings.language.title')).not.toBe('settings.language.title')
  const broken = createI18n('el', { ...WORD_LISTS, el: {}, en: {} })
  expect(broken.t('settings.language.title')).toBe('⟦settings.language.title⟧')
})

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'greek-language', viewport: { width: 1440, height: 1000 } })
}, 240_000)

afterAll(async () => { await app?.stop() }, 240_000)

const headers = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function storedLanguage(): Promise<string | null> {
  const reply = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { headers })
  expect(reply.status, await reply.clone().text()).toBe(200)
  return (await reply.json()).participant.language
}

async function openTheLanguagePanel(page: Page): Promise<void> {
  await waitForThePage(page, 30_000)
  await openSettingsPanel(page, 'settings.language')
  await page.locator(`${THE_PANEL} input[value="el"]`).waitFor()
  await page.waitForFunction((selector) => !document.querySelector<HTMLFieldSetElement>(`${selector} fieldset`)?.disabled, THE_PANEL)
}

const THE_PANEL = '[data-target="uiSurface/settings.language"]'

it('chooses Greek from ?lang=el and from the Ελληνικά radio, and saves it on the person', async () => {
  const page = app.page
  const greek = createI18n('el')
  expect(await storedLanguage()).toBe(null)
  await page.goto(`${app.site}/?lang=el#/settings`)
  await openTheLanguagePanel(page)
  expect(await page.locator('html').getAttribute('lang')).toBe('el')
  expect(await page.locator('.language-source').innerText()).toBe(greek.t('settings.language.address', { language: LANGUAGES.el }))
  expect(await page.locator(`${THE_PANEL} input[value="el"]`).isChecked()).toBe(false)
  await page.goto(`${app.site}/#/settings`)
  await openTheLanguagePanel(page)
  expect(await page.locator(`${THE_PANEL} input[value="el"]`).isChecked()).toBe(false)
  await page.locator(`${THE_PANEL} input[value="el"]`).check()
  await page.waitForFunction(
    (expected) => document.querySelector('.language-source')?.textContent === expected,
    greek.t('settings.language.person', { language: LANGUAGES.el }),
  )
  expect(await page.locator('html').getAttribute('lang')).toBe('el')
  expect(await page.locator('.language-source').innerText()).toBe(greek.t('settings.language.person', { language: LANGUAGES.el }))
  expect(await storedLanguage()).toBe('el')
  expect(await page.locator(`${THE_PANEL} input[value="el"]`).isChecked()).toBe(true)
  await page.reload()
  await page.waitForFunction(() => document.documentElement.lang === 'el')
  await openTheLanguagePanel(page)
  expect(await page.locator('html').getAttribute('lang')).toBe('el')
  expect(await page.locator(`${THE_PANEL} input[value="el"]`).isChecked()).toBe(true)
  expect(await storedLanguage()).toBe('el')
}, 120_000)

it('chooses Spanish from ?lang=es and from the Español radio, and saves it on the person', async () => {
  const page = app.page
  const spanish = createI18n('es')
  expect(await storedLanguage()).toBe('el')
  await page.goto(`${app.site}/?lang=es#/settings`)
  await openTheLanguagePanel(page)
  expect(await page.locator('html').getAttribute('lang')).toBe('es')
  expect(await page.locator('.language-source').innerText()).toBe(spanish.t('settings.language.address', { language: LANGUAGES.es }))
  expect(await page.locator(`${THE_PANEL} input[value="es"]`).isChecked()).toBe(false)
  await page.goto(`${app.site}/#/settings`)
  await openTheLanguagePanel(page)
  expect(await page.locator(`${THE_PANEL} input[value="es"]`).isChecked()).toBe(false)
  await page.locator(`${THE_PANEL} input[value="es"]`).check()
  await page.waitForFunction(
    (expected) => document.querySelector('.language-source')?.textContent === expected,
    spanish.t('settings.language.person', { language: LANGUAGES.es }),
  )
  expect(await page.locator('html').getAttribute('lang')).toBe('es')
  expect(await page.locator('.language-source').innerText()).toBe(spanish.t('settings.language.person', { language: LANGUAGES.es }))
  expect(await storedLanguage()).toBe('es')
  expect(await page.locator(`${THE_PANEL} input[value="es"]`).isChecked()).toBe(true)
  await page.reload()
  await page.waitForFunction(() => document.documentElement.lang === 'es')
  await openTheLanguagePanel(page)
  expect(await page.locator('html').getAttribute('lang')).toBe('es')
  expect(await page.locator(`${THE_PANEL} input[value="es"]`).isChecked()).toBe(true)
  expect(await storedLanguage()).toBe('es')
}, 120_000)

it('chooses Italian from ?lang=it and from the Italiano radio, and saves it on the person', async () => {
  const page = app.page
  const italian = createI18n('it')
  expect(await storedLanguage()).toBe('es')
  await page.goto(`${app.site}/?lang=it#/settings`)
  await openTheLanguagePanel(page)
  expect(await page.locator('html').getAttribute('lang')).toBe('it')
  expect(await page.locator('.language-source').innerText()).toBe(italian.t('settings.language.address', { language: LANGUAGES.it }))
  expect(await page.locator(`${THE_PANEL} input[value="it"]`).isChecked()).toBe(false)
  await page.goto(`${app.site}/#/settings`)
  await openTheLanguagePanel(page)
  expect(await page.locator(`${THE_PANEL} input[value="it"]`).isChecked()).toBe(false)
  await page.locator(`${THE_PANEL} input[value="it"]`).check()
  await page.waitForFunction(
    (expected) => document.querySelector('.language-source')?.textContent === expected,
    italian.t('settings.language.person', { language: LANGUAGES.it }),
  )
  expect(await page.locator('html').getAttribute('lang')).toBe('it')
  expect(await page.locator('.language-source').innerText()).toBe(italian.t('settings.language.person', { language: LANGUAGES.it }))
  expect(await storedLanguage()).toBe('it')
  expect(await page.locator(`${THE_PANEL} input[value="it"]`).isChecked()).toBe(true)
  await page.reload()
  await page.waitForFunction(() => document.documentElement.lang === 'it')
  await openTheLanguagePanel(page)
  expect(await page.locator('html').getAttribute('lang')).toBe('it')
  expect(await page.locator(`${THE_PANEL} input[value="it"]`).isChecked()).toBe(true)
  expect(await storedLanguage()).toBe('it')
}, 120_000)

it('chooses Korean from ?lang=ko and from the 한국어 radio, draws a Korean word the list holds, and saves it on the person', async () => {
  const page = app.page
  const korean = createI18n('ko')
  const english = createI18n('en')
  expect(korean.t('settings.language.title'), 'Korean holds a word of its own').not.toBe(english.t('settings.language.title'))
  expect(await storedLanguage()).toBe('it')
  await page.goto(`${app.site}/?lang=ko#/settings`)
  await openTheLanguagePanel(page)
  expect(await page.locator('html').getAttribute('lang')).toBe('ko')
  expect(await page.locator('.language-source').innerText()).toBe(korean.t('settings.language.address', { language: LANGUAGES.ko }))
  expect(await page.locator(`${THE_PANEL} input[value="ko"]`).isChecked()).toBe(false)
  await page.goto(`${app.site}/#/settings`)
  await openTheLanguagePanel(page)
  expect(await page.locator(`${THE_PANEL} input[value="ko"]`).isChecked()).toBe(false)
  await page.locator(`${THE_PANEL} input[value="ko"]`).check()
  await page.waitForFunction(
    (expected) => document.querySelector('.language-source')?.textContent === expected,
    korean.t('settings.language.person', { language: LANGUAGES.ko }),
  )
  expect(await page.locator('html').getAttribute('lang')).toBe('ko')
  expect(await page.locator('.language-source').innerText()).toBe(korean.t('settings.language.person', { language: LANGUAGES.ko }))
  expect(await storedLanguage()).toBe('ko')
  expect(await page.locator(`${THE_PANEL} input[value="ko"]`).isChecked()).toBe(true)
  await page.reload()
  await page.waitForFunction(() => document.documentElement.lang === 'ko')
  await openTheLanguagePanel(page)
  expect(await page.locator('html').getAttribute('lang')).toBe('ko')
  expect(await page.locator(`${THE_PANEL} input[value="ko"]`).isChecked()).toBe(true)
  expect(await storedLanguage()).toBe('ko')
}, 120_000)

it('chooses Portuguese from ?lang=pt and from the Português radio, draws a Portuguese word the list holds, and saves it on the person', async () => {
  const page = app.page
  const portuguese = createI18n('pt')
  const english = createI18n('en')
  expect(portuguese.t('settings.language.title'), 'Portuguese holds a word of its own').not.toBe(english.t('settings.language.title'))
  expect(await storedLanguage()).toBe('ko')
  await page.goto(`${app.site}/?lang=pt#/settings`)
  await openTheLanguagePanel(page)
  expect(await page.locator('html').getAttribute('lang')).toBe('pt')
  expect(await page.locator('.language-source').innerText()).toBe(portuguese.t('settings.language.address', { language: LANGUAGES.pt }))
  expect(await page.locator(`${THE_PANEL} input[value="pt"]`).isChecked()).toBe(false)
  await page.goto(`${app.site}/#/settings`)
  await openTheLanguagePanel(page)
  expect(await page.locator(`${THE_PANEL} input[value="pt"]`).isChecked()).toBe(false)
  await page.locator(`${THE_PANEL} input[value="pt"]`).check()
  await page.waitForFunction(
    (expected) => document.querySelector('.language-source')?.textContent === expected,
    portuguese.t('settings.language.person', { language: LANGUAGES.pt }),
  )
  expect(await page.locator('html').getAttribute('lang')).toBe('pt')
  expect(await page.locator('.language-source').innerText()).toBe(portuguese.t('settings.language.person', { language: LANGUAGES.pt }))
  expect(await storedLanguage()).toBe('pt')
  expect(await page.locator(`${THE_PANEL} input[value="pt"]`).isChecked()).toBe(true)
  await page.reload()
  await page.waitForFunction(() => document.documentElement.lang === 'pt')
  await openTheLanguagePanel(page)
  expect(await page.locator('html').getAttribute('lang')).toBe('pt')
  expect(await page.locator(`${THE_PANEL} input[value="pt"]`).isChecked()).toBe(true)
  expect(await storedLanguage()).toBe('pt')
}, 120_000)

it('chooses Thai from ?lang=th and from the ไทย radio, draws a Thai word the list holds, and saves it on the person', async () => {
  const page = app.page
  const thai = createI18n('th')
  const english = createI18n('en')
  expect(thai.t('settings.language.title'), 'Thai holds a word of its own').not.toBe(english.t('settings.language.title'))
  expect(await storedLanguage()).toBe('pt')
  await page.goto(`${app.site}/?lang=th#/settings`)
  await openTheLanguagePanel(page)
  expect(await page.locator('html').getAttribute('lang')).toBe('th')
  expect(await page.locator('.language-source').innerText()).toBe(thai.t('settings.language.address', { language: LANGUAGES.th }))
  expect(await page.locator(`${THE_PANEL} input[value="th"]`).isChecked()).toBe(false)
  await page.goto(`${app.site}/#/settings`)
  await openTheLanguagePanel(page)
  expect(await page.locator(`${THE_PANEL} input[value="th"]`).isChecked()).toBe(false)
  await page.locator(`${THE_PANEL} input[value="th"]`).check()
  await page.waitForFunction(
    (expected) => document.querySelector('.language-source')?.textContent === expected,
    thai.t('settings.language.person', { language: LANGUAGES.th }),
  )
  expect(await page.locator('html').getAttribute('lang')).toBe('th')
  expect(await page.locator('.language-source').innerText()).toBe(thai.t('settings.language.person', { language: LANGUAGES.th }))
  expect(await storedLanguage()).toBe('th')
  expect(await page.locator(`${THE_PANEL} input[value="th"]`).isChecked()).toBe(true)
  await page.reload()
  await page.waitForFunction(() => document.documentElement.lang === 'th')
  await openTheLanguagePanel(page)
  expect(await page.locator('html').getAttribute('lang')).toBe('th')
  expect(await page.locator(`${THE_PANEL} input[value="th"]`).isChecked()).toBe(true)
  expect(await storedLanguage()).toBe('th')
}, 120_000)
