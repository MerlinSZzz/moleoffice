// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LEAD INTO ANOTHER PROJECT NAMES THAT PROJECT AND THE PLACE, AND ONE PRESS TAKES THEM THERE.
 *
 * A lead to a place in another project said the place was
 * "somewhere this project does not hold". The offer must name the real destination, and moving to
 * the other project is part of taking them there, with no second press.
 *
 * The office is this test's own (liveApp). One agent sends the person two leads: one to a report in
 * this project and one to a report in a second project. The sentence the offer draws names the
 * record's title and, when the record is elsewhere, that project. The press is the short
 * `chatEnglish.lead.takeMe`, and pressing it moves the page and the project together.
 *
 * WHAT IS PROVED
 *   1. The offer for the report in this project names its title and no project.
 *   2. The offer for the report in the other project names that project and the report's title, and
 *      neither says the place is one this project does not hold.
 *   3. One press on the other project's offer lands on the report's page, in that project.
 *
 * PICTURES are taken only when TEST_SHOTS names a folder: at 1440 and 390, light and dark, English
 * and Chinese, for both offers. Each dark picture is compared with the light picture of the same
 * width and language, and a dark picture equal to its light one fails.
 *
 * WHAT WOULD MAKE A CASE GO RED
 *   the record is read in the reader's project again        → case 2
 *   the project is left out of the offer                    → cases 2 and 3
 *   the press names the place again                         → cases 1 and 2
 *   the press moves the page but not the project            → case 3
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { LEADING } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'

const HERE = 'default'
const OTHER = 'sample-project-b'
const OTHER_TITLE = 'Sample project B'
const GUIDE = 'lead-across-guide'
const GUIDE_NAME = 'Sample Guide'
const HERE_TITLE = 'Sample project A report'
const THERE_TITLE = 'Sample project B daily report'

let app: LiveApp
let page: Page
let person: Record<string, string>
let guideKey = ''
let hereId = ''
let thereId = ''
let hereMessage = ''
let thereMessage = ''
const shots = testShots('lead-across-project')
const PICTURE_WIDTHS = [1440, 390] as const
const PICTURE_THEMES = ['light', 'dark'] as const
const PICTURE_LANGUAGES = ['en', 'zh'] as const

const asPerson = (workspace = HERE): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  ...person,
})
const asGuide = (workspace: string): Record<string, string> => ({
  ...asPerson(workspace),
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': GUIDE,
  'x-mole-office-key': guideKey,
})

async function call(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, any>> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} answered ${String(res.status)}: ${text}`)
  return text === '' ? {} : (JSON.parse(text) as Record<string, any>)
}

const cardOf = (id: string): string => `.px-lead-offer[data-lead-message="${id}"]`
const oneLine = (words: string): string => words.replace(/\s+/g, ' ').trim()

/** The words the offer must draw for one record: its title, and its project when it is not this one. */
const theOfferFor = (title: string, project: string | null): string =>
  LEADING.offer(GUIDE_NAME, project === null ? title : LEADING.inAnotherProject(title, project))

async function openHome(language: string, theme: 'light' | 'dark', width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/?lang=${language}#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(cardOf(hereMessage)).waitFor({ state: 'visible', timeout: 30_000 })
  await page.locator(cardOf(thereMessage)).waitFor({ state: 'visible', timeout: 30_000 })
}

/** The sentence one offer draws, with the wrapping taken out. */
async function theSentenceIn(messageId: string): Promise<string> {
  return oneLine((await page.locator(`${cardOf(messageId)} .px-lead-words`).textContent()) ?? '')
}

/** The words the press on one offer draws. */
async function thePressIn(messageId: string): Promise<string> {
  return oneLine(await page.locator(`${cardOf(messageId)} .px-lead-go`).innerText())
}

/** Read a picture's bytes, so a dark one can be compared with its light twin. */
const bytesOf = (path: string): Buffer => readFileSync(path)

beforeAll(async () => {
  app = await liveApp({ name: 'lead-across-projects', viewport: { width: 1440, height: 900 } })
  page = app.page
  person = thePersonsKeyHeader(join(app.dir, 'keys.json'))
  await call('POST', '/api/workspaces', asPerson(), { id: OTHER, title: OTHER_TITLE })
  const started = await call('POST', '/api/agents/started', asPerson(), { handle: GUIDE, name: GUIDE_NAME, role: 'worker', runtime: 'claude-code' })
  guideKey = String(started['whatToGiveIt']?.key)
  const blocks = [{ id: 'b-1', type: 'text', text: 'Made-up words for a lead across projects.' }]
  hereId = String((await call('POST', '/api/records', asPerson(), { kind: 'report', title: HERE_TITLE, data: { blocks } }))['record'].id)
  thereId = String((await call('POST', '/api/records', asPerson(OTHER), { kind: 'report', title: THERE_TITLE, data: { blocks } }))['record'].id)
  const here = await call('POST', '/api/records', asGuide(HERE), {
    kind: 'message',
    title: 'Made-up offer in this project',
    data: {
      body: 'Made-up: the report in this project is here.',
      to: [{ kind: 'person', id: THE_PERSON }],
      lead: { target: { kind: 'record', recordId: hereId, workspaceId: HERE } },
    },
  })
  hereMessage = String(here['record'].id)
  const there = await call('POST', '/api/records', asGuide(OTHER), {
    kind: 'message',
    title: 'Made-up offer in another project',
    data: {
      body: 'Made-up: the report in the other project is here.',
      to: [{ kind: 'person', id: THE_PERSON }],
      lead: { target: { kind: 'record', recordId: thereId, workspaceId: OTHER } },
    },
  })
  thereMessage = String(there['record'].id)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a lead into another project names it and takes the reader there', () => {
  it('names the report in this project by its title, and no project', async () => {
    await openHome('en', 'light', 1440)
    await expect.poll(() => theSentenceIn(hereMessage), { timeout: 30_000 }).toBe(theOfferFor(HERE_TITLE, null))
    expect(await thePressIn(hereMessage)).toBe(LEADING.takeMe)
  }, 240_000)

  it('names the other project and the report, and never a place this project does not hold', async () => {
    await openHome('en', 'light', 1440)
    await expect.poll(() => theSentenceIn(thereMessage), { timeout: 30_000 }).toBe(theOfferFor(THERE_TITLE, OTHER_TITLE))
    const sentence = await theSentenceIn(thereMessage)
    expect(sentence, 'the offer still draws the sentence for a place this project does not hold').not.toContain(LEADING.somewhereUnknown)
    expect(await thePressIn(thereMessage)).toBe(LEADING.takeMe)
  }, 240_000)

  it('takes the pictures asked for, in both languages and both looks', async () => {
    if (process.env[TEST_SHOTS] === undefined || process.env[TEST_SHOTS] === '') return
    for (const language of PICTURE_LANGUAGES) for (const theme of PICTURE_THEMES) for (const width of PICTURE_WIDTHS) {
      await openHome(language, theme, width)
      const name = `${language}-${theme}-${String(width)}`
      await page.locator('.px-lead-here').screenshot({ path: join(shots, `both-offers-${name}.png`) })
      for (const [which, id] of [['this-project', hereMessage], ['other-project', thereMessage]] as const) {
        await page.locator(cardOf(id)).screenshot({ path: join(shots, `${which}-${name}.png`) })
      }
    }
    for (const language of PICTURE_LANGUAGES) for (const width of PICTURE_WIDTHS) {
      const light = bytesOf(join(shots, `both-offers-${language}-light-${String(width)}.png`))
      const dark = bytesOf(join(shots, `both-offers-${language}-dark-${String(width)}.png`))
      expect(dark.equals(light), `the dark picture at ${String(width)} in ${language} is its light one`).toBe(false)
    }
  }, 590_000)

  it('takes the reader to the other project and the report in one press', async () => {
    await openHome('en', 'light', 1440)
    await page.locator(`${cardOf(thereMessage)} .px-lead-go`).click()
    await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 30_000 }).toContain(thereId)
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('mole-office.workspace')), { timeout: 30_000 }).toBe(OTHER)
    await expect.poll(() => page.locator('main.page').innerText(), { timeout: 30_000 }).toContain(THERE_TITLE)
  }, 240_000)
})
