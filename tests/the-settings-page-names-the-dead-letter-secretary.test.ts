// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS PANEL "THE SECRETARY WHO TAKES THE DEAD LETTERS", IN A BROWSER. Problem 0WUuvB0IhRfb, with
 * answers I24sT059xQlk and UEmOvQ6-ptyJ: the person picks one secretary, the panel shows who is
 * named now, says plainly when nobody is named and why, and says when a letter from the person waits
 * because nobody is named.
 *
 *   1. the panel is in the Chat category, straight after the machine names, and drawn in normal mode;
 *   2. with nobody named it says so, and says a letter from the person waits, and offers the secretaries;
 *   3. it says first what a dead letter is, then where messages for an unreachable agent go, in plain
 *      words with no word of how the office works inside, in English and in Chinese (the secretary's
 *      review of round 32; the list of each kind was taken out in wave 13y round 121);
 *   4. a press names one: the state, the waiting line and the change line follow the stored value, and
 *      the panel says the named secretary reads the letters and acts on them;
 *   5. when TEST_SHOTS names a folder, the panel is photographed named and not named, at 1440, 990, 660
 *      and 390 in light and dark, in English and in Chinese.
 *
 * The world: two secretaries, and one worker the person sends a letter to and then retires, so one letter from
 * the person waits for a secretary to be named.
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const PANEL = '[data-target="uiSurface/settings.deadletters"]'
const ENTRY = '[data-settings-panel="settings.deadletters"]'

let app: LiveApp
const shots = testShots('the-settings-page-names-the-dead-letter-secretary')

/** The card that may act for the person, read from the declaration and never typed. */
function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }
  return said.elevation.onlyThisCardCanHoldIt
}

async function call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method, headers: AS_THE_PERSON, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  const aLetterNothingHolds = method === 'POST' && path === '/api/records' && theAnswerToAWriteInATestOffice(AS_THE_PERSON, body) === 409
  expect(aLetterNothingHolds ? reply.status === 409 : reply.status < 300, `${method} ${path}: ${text.slice(0, 400)}`).toBe(true)
  return JSON.parse(text) as Record<string, unknown>
}

async function openThePanel(lang: 'en' | 'zh' | 'el' | 'es' | 'it' | 'ko' | 'pt' | 'th' = 'en', width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&mode=normal&look=${look}#/settings/deadletters`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator(`${PANEL} .dls-state`).waitFor({ timeout: 30_000 })
}

async function photograph(state: string): Promise<void> {
  // EVERY WIDTH, BOTH LOOKS, IN BOTH LANGUAGES.
  for (const lang of ['en', 'zh'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark']) {
        await openThePanel(lang, width, look)
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${state} ${lang} ${String(width)} ${look}`).toBe(true)
        await app.page.locator(PANEL).scrollIntoViewIfNeeded()
        await app.page.screenshot({ path: `${shots}/dead-letter-secretary-${state}-${lang}-${String(width)}-${look}.png`, fullPage: false })
      }
    }
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'dead-letter-secretary-panel', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  for (const [handle, name] of [[THE_TEST_OFFICES_SECRETARY.handle, THE_TEST_OFFICES_SECRETARY.name], ['quill', 'Quill']]) {
    await call('POST', '/api/agents/started', { handle, name, role: theSecretaryCard() })
  }
  const worker = (await call('POST', '/api/agents/started', { handle: 'lark', name: 'Lark', role: 'worker' })) as { agent: { id: string } }
  await call('POST', '/api/records', { kind: 'message', title: 'A note for Lark', data: { to: [{ kind: 'agent', id: worker.agent.id }], body: 'A note for Lark' } })
  await call('POST', '/api/participants/agent/lark/retire', { because: 'Test: its work here is done.' })
  await app.page.addInitScript(({ person }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
  }, { person: THE_PERSON })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

it('is in the Chat category straight after the machine names, in normal mode', async () => {
  await openThePanel()
  const chat = await app.page.locator('.set .sf-cat[data-category="chat"] [data-settings-panel]').evaluateAll((all) =>
    all.map((one) => one.getAttribute('data-settings-panel') ?? ''),
  )
  expect(chat.indexOf('settings.deadletters')).toBe(chat.indexOf('settings.machinenames') + 1)
  // THE WORDS, not how a style draws their case.
  expect((await app.page.locator(`${ENTRY} .sf-title`).textContent())?.trim()).toBe('Dead-letter secretary')
}, 120_000)

it('says nobody is named, shows no waiting-for-a-secretary warning, and offers the secretaries', async () => {
  await openThePanel()
  expect((await app.page.locator(`${PANEL} .dls-state`).innerText()).trim()).toBe('No secretary named.')
  expect(await app.page.locator(`${PANEL} .dls-waiting`).count()).toBe(0)
  const offered = await app.page.locator(`${PANEL} .dls-pick select option`).allInnerTexts()
  // EACH SECRETARY BY ITS NAME ALONE, with no handle beside it (wave 13n round 33).
  expect(offered.map((one) => one.trim())).toEqual(['None', THE_TEST_OFFICES_SECRETARY.name, 'Quill'])
  expect((await app.page.locator(`${PANEL} .scl-line`).innerText()).trim()).toBe('No change recorded.')
}, 120_000)

/** The panel's words, in the order drawn, one entry per paragraph or list item. */
async function thePanelsWords(): Promise<string[]> {
  return app.page.locator(`${PANEL} .dls > p, ${PANEL} .dls > ul > li`).allInnerTexts()
}

/** Words of how the office works inside, which a person reading Settings does not know. */
const INSIDE_WORDS = /starter|chain|sweep|启动者链|清扫/i

it('draws the ownership explanation on English and Chinese pages', async () => {
  await openThePanel()
  const words = (await thePanelsWords()).map((one) => one.trim())
  const english = createI18n('en')
  expect(words[0]).toBe(english.t('deadLetterSecretary.whatADeadLetterIs'))
  expect(words[1]).toBe(english.t('deadLetterSecretary.ownerRoute'))
  for (const one of words) expect(one, `the panel says "${one}"`).not.toMatch(INSIDE_WORDS)
  // The language's own words include the English fallback until translated.
  await openThePanel('zh')
  const chinese = (await thePanelsWords()).map((one) => one.trim())
  const translated = createI18n('zh')
  expect(chinese[0]).toBe(translated.t('deadLetterSecretary.whatADeadLetterIs'))
  expect(chinese[1]).toBe(translated.t('deadLetterSecretary.ownerRoute'))
  for (const one of chinese) expect(one, `the panel says "${one}"`).not.toMatch(INSIDE_WORDS)
}, 120_000)

it('uses the current route in every page language', async () => {
  for (const language of ['el', 'es', 'it', 'ko', 'pt', 'th'] as const) {
    await openThePanel(language)
    const words = (await thePanelsWords()).map((one) => one.trim())
    expect(words[1], language).toMatch(/owner/i)
  }
}, 240_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the panel with nobody named', async () => {
  await photograph('nobody')
}, 600_000)

it('names one secretary with one press, and draws back what was stored', async () => {
  await openThePanel()
  const ids = (await call('GET', '/api/office/dead-letter-secretary')) as { mayBeNamed: { id: string; handle: string }[] }
  const secretary = ids.mayBeNamed.find((one) => one.handle === THE_TEST_OFFICES_SECRETARY.handle)!.id
  await app.page.locator(`${PANEL} .dls-pick select`).selectOption(secretary)
  await app.page.locator(`${PANEL} .dls-button`).click()
  await app.page.waitForFunction(
    ({ selector, expected }) => {
      const words = document.querySelector(selector)?.textContent ?? ''
      return words.includes(expected) && /notice/i.test(words)
    },
    { selector: `${PANEL} .dls-state`, expected: THE_TEST_OFFICES_SECRETARY.name },
    { timeout: 15_000 },
  )
  expect(await app.page.locator(`${PANEL} .dls-waiting`).count()).toBe(0)
  await app.page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent?.includes('Changed by') ?? false,
    `${PANEL} .scl-line`,
    { timeout: 15_000 },
  )
  const stored = (await call('GET', '/api/office/dead-letter-secretary')) as { named: { id: string } | null }
  expect(stored.named?.id).toBe(secretary)
  // WHO CHANGED IT, BY THE PERSON'S NAME and never the stored id (wave 13n round 33).
  const people = (await call('GET', '/api/participants')) as { people: { id: string; name: string }[] }
  const name = people.people.find((one) => one.id === THE_PERSON)?.name ?? ''
  expect(name.length, 'the test office holds a name for the person').toBeGreaterThan(0)
  const changed = (await app.page.locator(`${PANEL} .scl-line`).innerText()).trim()
  expect(changed.startsWith(`Changed by ${name} `), changed).toBe(true)
  if (name !== THE_PERSON) expect(changed).not.toContain(THE_PERSON)
  // WITH A SECRETARY NAMED, THE PANEL SAYS THAT SECRETARY READS THE LETTERS AND ACTS ON THEM.
  const acts = (await app.page.locator(`${PANEL} .dls-who-acts`).innerText()).trim()
  expect(acts).toMatch(/notice|line/i)
  expect(acts).not.toMatch(/reads these letters/i)
}, 120_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the panel with a secretary named', async () => {
  await photograph('named')
}, 600_000)
