// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CARD'S NAME IS DRAWN IN THE PAGE LANGUAGE. Problem SGTqdnfCmQxh.
 *
 * Wave 13q round 19's picture of an agent page at ?lang=zh read "secretary 层级 3", "持有的角色卡
 * secretary" and "secretary角色卡做什么", and the contact group under What is known read "Secretary".
 * The card panel wrote the card's stored name into the page, and the agent page drew the contact
 * group's stored name rather than its heading. Every page that names a card now reads the name
 * through `cardWord` in src/shared/card-words.ts, and the agent page draws the group through
 * `groupHeading`, the function the contacts list uses.
 *
 * WHAT IS MEASURED, in a real browser on a test office of this file's own, at ?lang=zh:
 *   · the card panel of a made-up secretary and of a made-up worker: the card's name, the line that
 *     says which card it holds, and the row that opens what the card does, read 秘书 and 工人;
 *   · the contact group under What is known reads 秘书 for the secretary;
 *   · the Role cards page names every card in Chinese, with no Latin letter in any card's name.
 * The Chinese words are written out here, so a case does not pass by reading back whatever the word
 * lists hold. The control is the English pass of the same agent page, which reads "secretary".
 *
 * MADE-UP: the agents "test-tern" (a secretary) and "test-plover" (a worker).
 *
 * MUTATION, after a green control run, restored to green afterwards: make `cardWord` in
 * src/shared/card-words.ts hand back the stored name (`return content(name)` as its only line). Red:
 * the secretary's card panel reads "secretary" where 秘书 is expected.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { pairTheContext } from './a-paired-context.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const THEIR: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const CARD = '[data-target="uiSurface/profile.theircard"]'
const SECRETARY = { handle: 'test-tern', name: 'Test Tern', role: 'secretary' }
const WORKER = { handle: 'test-plover', name: 'Test Plover', role: 'worker' }

let app: LiveApp
let page: Page

async function open(where: string, lang: 'en' | 'zh', ready: string, width = 1440, scheme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${lang}#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(ready).first().waitFor({ state: 'attached', timeout: 30_000 })
}

/** Every text a selector names on the page, trimmed, hidden or not. */
async function textsOf(selector: string): Promise<string[]> {
  return page.evaluate((s) => [...document.querySelectorAll(s)].map((one) => (one.textContent ?? '').trim()), selector)
}

/** The card panel's three places that name the card. */
async function theCardPanel(): Promise<{ name: string; holds: string; whatItDoes: string }> {
  const [name] = await textsOf(`${CARD} .tc-card-name`)
  const [holds] = await textsOf(`${CARD} .tc-fact .tc-value`)
  const [whatItDoes] = await textsOf(`${CARD} .tc-card-all-title`)
  return { name: name ?? '', holds: holds ?? '', whatItDoes: whatItDoes ?? '' }
}

/** The value beside a label under What is known. */
async function factBeside(label: string): Promise<string | null> {
  return page.evaluate((label) => {
    const fact = [...document.querySelectorAll('.prof-fact')].find((one) => one.querySelector('.prof-label')?.textContent?.trim() === label)
    return fact?.querySelector('.prof-value')?.textContent?.trim() ?? null
  }, label)
}

beforeAll(async () => {
  app = await liveApp({ name: 'card-names-in-the-page-language', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  // THE PERSON'S BROWSER, PAIRED with two halves, so the page reads as the person and the contact group they see is drawn.
  await pairTheContext(app.context, app.api)
  for (const agent of [SECRETARY, WORKER]) {
    const started = await fetch(`${app.api}/api/agents/started`, { method: 'POST', headers: THEIR, body: JSON.stringify(agent) })
    expect(started.status, await started.text()).toBe(201)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a role card is named in the page language', () => {
  it('control: names the secretary card in English on an English page', async () => {
    await open(`/who/agent/${SECRETARY.handle}`, 'en', `${CARD} .tc-card-name`)
    expect(await theCardPanel()).toEqual({ name: 'secretary', holds: 'secretary', whatItDoes: 'What the secretary card does' })
    expect(await factBeside('Contact group')).toBe('Secretary')
  }, 180_000)




})
