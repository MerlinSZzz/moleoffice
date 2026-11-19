// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUESTION SHOWS THE PERSON'S OWN CHANGE BESIDE THE OTHER WRITER'S, and the history line under the form follows the
 * change too.
 *
 * Item 98 (8 Nov 2026, from round 146's pictures), wave 13y round 156. Two points on the edit form's choice A:
 *
 * (a) Under the form "History: 1 version" stayed while the line above the form said version 2 exists. The page now
 *     reads the record again when another writer's change is heard, so the version count follows, and the form's boxes
 *     keep what the person typed.
 * (b) The question after Save showed the other writer's version but not the person's own words, and at 390 and 660 it
 *     covers the form. It now shows the fields the person's write would change, with their value beside the one it
 *     would replace, so Save mine and Keep theirs can be chosen without going back.
 *
 * The words are read from their keys, never copied. Set W13Y_ANOTHER_WRITER_SHOTS to a folder outside the checkout and
 * W13Y_ANOTHER_WRITER_LOOK to light or dark to photograph the edit page with its history line following the change,
 * and the question with both changes in it, at 1440, 990, 660 and 390. Every record is made up, and every picture says
 * so above the block it shows or inside the question above its heading.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '@shared/i18n.ts'
import { liveApp, type LiveApp } from './helpers.ts'
import { open as openIn, type HeardOffice } from './a-page-that-hears-changes.ts'
import { putTheMadeUpLabelIn, THE_MADE_UP_LABEL_MARKER } from './the-made-up-label-above-the-page.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const WRITER_HANDLE = 'kiln-writer'
const WRITER_NAME = 'Kiln Writer'
const AN_AGENT = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WRITER_HANDLE }

const shots = process.env['W13Y_ANOTHER_WRITER_SHOTS']
const look = process.env['W13Y_ANOTHER_WRITER_LOOK']
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
const DRAWN_WITHIN_MS = 8_000

const TITLE_BOX = 'form.rp-edit input'
const SAVE = 'form.rp-edit button[type="submit"]'
const LINE = '.aw-line'
const QUESTION = 'dialog.aw-question[open]'
const TYPED = 'The kiln report, as the person is retitling it'
const THEIRS = 'The kiln report, retitled by the kiln writer'

async function send(method: string, url: string, body: object | null, headers: Record<string, string>): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, ...(body === null ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

function heard(): HeardOffice {
  return { api: app.api, site: app.site, headers: PERSON }
}

async function open(page: Page, hash: string, waitFor: string): Promise<void> {
  await openIn(heard(), page, hash, waitFor)
}

async function aReport(title: string): Promise<string> {
  const made = await send('POST', '/api/records', { kind: 'report', title, data: { for: 'A made-up reader', date: '2026-11-07', blocks: [{ id: 'b-1', type: 'text', text: 'A made-up report.' }] } }, AN_AGENT)
  return made['record'].id as string
}

async function stored(id: string): Promise<Record<string, any>> {
  return (await send('GET', `/api/records/${id}`, null, PERSON))['record'] as Record<string, any>
}

/** The record's versions, newest first. */
async function versions(id: string): Promise<Array<{ seq: number; who: { actorType: string; actorId: string } }>> {
  return (await send('GET', `/api/records/${id}/revisions`, null, PERSON))['revisions'] as Array<{ seq: number; who: { actorType: string; actorId: string } }>
}

/** Wait until the element `within` names holds these words. */
async function drawn(page: Page, within: string, words: string): Promise<void> {
  await page.waitForFunction(
    ([where, what]) => (document.querySelector(where ?? '')?.textContent ?? '').includes(what ?? ''),
    [within, words],
    { timeout: DRAWN_WITHIN_MS },
  )
}

/** The history fold's own line: the word and its numeral, from the same words the page draws. */
function historyLine(n: number): string {
  return t('record.history.labelCount', { title: t('record.history.history'), n })
}

async function summaryText(page: Page): Promise<string> {
  return (await page.locator('.rh-fold > summary').first().textContent()) ?? ''
}

/** Open the report's edit address, type a title, and have the kiln writer store theirs; wait for the line. */
async function typedThenTheirs(page: Page, report: string): Promise<void> {
  await open(page, `/r/${report}/edit`, TITLE_BOX)
  await page.locator(TITLE_BOX).first().fill(TYPED)
  await send('PATCH', `/api/records/${report}`, { title: THEIRS }, AN_AGENT)
  await drawn(page, LINE, WRITER_NAME)
}

async function press(page: Page, within: string, words: string): Promise<void> {
  await page.locator(within).getByRole('button', { name: words, exact: true }).click()
}

/** The label in the question sits at its top, with no margin the question does not draw. */
async function labelAtTheQuestionsTop(page: Page, called: string): Promise<void> {
  const label = page.locator(`${QUESTION} ${THE_MADE_UP_LABEL_MARKER}`)
  if ((await label.count()) !== 1) throw new Error(`${called}: the made-up label is not in the question`)
  const after = await label.evaluate((element) => {
    ;(element as HTMLElement).style.marginTop = '0px'
    const box = element.getBoundingClientRect()
    const heading = element.parentElement?.querySelector('h2')?.getBoundingClientRect()
    return {
      whole: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
      above: heading !== undefined && heading.top >= box.bottom - 0.5,
    }
  })
  if (!after.whole) throw new Error(`${called}: the made-up label is cut off by the window`)
  if (!after.above) throw new Error(`${called}: the made-up label is not above the question's heading`)
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-question-shows-the-persons-change', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await send('POST', '/api/agents/started', { handle: WRITER_HANDLE, name: WRITER_NAME, role: 'worker' }, PERSON)
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

it('1. the history line under the form follows another writer\'s change, and the typing stays: without reading the page again the line keeps version one', async () => {
  const report = await aReport('The kiln report')
  await open(app.page, `/r/${report}/edit`, TITLE_BOX)
  expect(await summaryText(app.page), 'the history line before their change').toContain(historyLine(1))
  await app.page.locator(TITLE_BOX).first().fill(TYPED)
  await send('PATCH', `/api/records/${report}`, { title: THEIRS }, AN_AGENT)
  await drawn(app.page, LINE, WRITER_NAME)
  const count = (await versions(report)).length
  expect(count, 'the versions the record holds after their change').toBe(2)
  await expect.poll(() => summaryText(app.page), { timeout: DRAWN_WITHIN_MS }).toContain(historyLine(count))
  expect(await summaryText(app.page)).not.toContain(historyLine(1))
  expect(await app.page.locator(TITLE_BOX).first().inputValue()).toBe(TYPED)
  expect(await app.page.locator(QUESTION).count(), 'a question before Save').toBe(0)
}, 120_000)

it("2. the question shows the person's changed title beside theirs at 390, 660 and 1440: without it the form the question covers is the only place the person's words are", async () => {
  const report = await aReport('The kiln report')
  await typedThenTheirs(app.page, report)
  for (const width of [390, 660, 1440]) {
    await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await app.page.locator(SAVE).click()
    await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
    const text = (await app.page.locator(QUESTION).textContent()) ?? ''
    expect(text, `${String(width)}: the question names the person's change`).toContain(t('record.anotherWriter.yourChange'))
    expect(text, `${String(width)}: the person's typed title`).toContain(TYPED)
    expect(text, `${String(width)}: the two sides`).toContain(t('record.anotherWriter.yours'))
    expect(text, `${String(width)}: the two sides`).toContain(t('record.anotherWriter.theirs'))
    const fit = await app.page.locator(QUESTION).evaluate((element) => {
      const box = element.getBoundingClientRect()
      return {
        inside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
        page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      }
    })
    expect(fit.inside, `${String(width)}: the question is inside the window`).toBe(true)
    expect(fit.page, `${String(width)}: the page is not wider than the window`).toBe(true)
    if (width === 390) {
      await press(app.page, QUESTION, 'See their version')
      await drawn(app.page, QUESTION, THEIRS)
      expect((await app.page.locator(QUESTION).textContent()) ?? '').toContain(TYPED)
    }
    await press(app.page, QUESTION, 'Back to the form')
    await expect.poll(() => app.page.locator(QUESTION).count()).toBe(0)
  }
  expect((await stored(report))['title']).toBe(THEIRS)
  expect((await versions(report)).filter((one) => one.who.actorType === 'human').length, 'versions the person wrote').toBe(0)
  await app.page.setViewportSize({ width: 1440, height: 1000 })
}, 180_000)

it.runIf(shots)('3. photographs the edit page with its history line and the question with both changes, at four widths in one look', async () => {
  if (shots === undefined) throw new Error('the pictures need W13Y_ANOTHER_WRITER_SHOTS')
  if (look !== 'light' && look !== 'dark') throw new Error('the pictures need W13Y_ANOTHER_WRITER_LOOK, light or dark')
  mkdirSync(shots, { recursive: true })
  await app.page.goto(`${app.site}/`)
  await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  const report = await aReport('The kiln report')
  await typedThenTheirs(app.page, report)
  expect(await app.page.evaluate(() => document.documentElement.getAttribute('data-theme')), `${look}: the theme`).toBe(look)
  // THE HISTORY LINE IS BELOW THE FORM'S SAVE PRESS, so open their version once to make both changes readable in one
  // picture and leave the line above the form saying who changed it.
  await press(app.page, LINE, 'See their version')
  await drawn(app.page, LINE, THEIRS)
  for (const width of [1440, 990, 660, 390]) {
    // THE HISTORY LINE IS UNDER THE FORM'S FIELDS. A phone window of 844 cuts it off just below the fold, so this
    // picture is taken in a taller phone window; the width, which is what the layout rule is about, is still 390.
    await app.page.setViewportSize({ width, height: 1000 })
    await app.page.waitForTimeout(300)
    await putTheMadeUpLabelIn(app.page, LABEL, app.page.locator(THE_PAGE_TOP).first(), `another-writer-history-${look}-${String(width)}`)
    await app.page.screenshot({ path: join(shots, `another-writer-history-${look}-${String(width)}.png`) })
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.locator(SAVE).click()
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  await press(app.page, QUESTION, 'See their version')
  await drawn(app.page, QUESTION, THEIRS)
  for (const width of [1440, 990, 660, 390]) {
    await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await app.page.waitForTimeout(300)
    await putTheMadeUpLabelIn(app.page, LABEL, app.page.locator(`${QUESTION} h2`), `another-writer-question-${look}-${String(width)}`)
    await labelAtTheQuestionsTop(app.page, `another-writer-question-${look}-${String(width)}`)
    await app.page.screenshot({ path: join(shots, `another-writer-question-${look}-${String(width)}.png`) })
  }
  await press(app.page, QUESTION, 'Back to the form')
  await app.page.setViewportSize({ width: 1440, height: 1000 })
}, 300_000)
