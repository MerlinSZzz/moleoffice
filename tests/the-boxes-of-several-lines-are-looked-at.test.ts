// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE BOX OF SEVERAL LINES, AND ONE DRAWN REASON, ON A DECISION PAGE.
 *
 * Round 38 changed the boxes where a person writes a reason and made each box measure itself again
 * when its width changes. This file keeps one of those screens in one look: the box holds three lines
 * and shows every one of them, the box measures itself again when the window narrows to 390, and a
 * stored reason is drawn with its line breaks.
 *
 * Everybody and everything here is made up. `liveApp` starts its own API and site with a database of
 * their own; nothing touches the live server.
 */
import type { Locator } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Three made-up lines, as a person writes a reason in a box. */
const THREE = ['The kiln ran hot on the last firing.', 'Two bowls cracked on the top shelf.', 'Ask the glazer before the next batch.'].join('\n')

let app: LiveApp

async function call<T>(path: string, body: unknown): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.ok, `POST ${path}: ${text}`).toBe(true)
  return JSON.parse(text) as T
}
const file = async (kind: string, title: string, data: unknown): Promise<string> =>
  (await call<{ record: { id: string } }>('/api/records', { kind, title, data })).record.id

async function open(route: string): Promise<void> {
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&look=light#${route}`)
  await waitForThePage(app.page, 60_000)
}

/** The box holds the three lines and shows every one of them without scrolling. */
async function holdsThree(box: Locator): Promise<void> {
  await box.waitFor({ timeout: 30_000 })
  await box.fill(THREE)
  expect(await box.inputValue(), 'the box did not keep the line breaks').toBe(THREE)
  const { scroll, client } = await box.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }))
  expect(scroll, 'the box hides some of its lines').toBeLessThanOrEqual(client + 1)
}

/** The drawn words keep their line breaks. */
async function drawsThree(words: Locator): Promise<void> {
  await words.first().waitFor({ timeout: 30_000 })
  expect(await words.first().innerText(), 'the words were drawn on one line').toContain(THREE)
}

beforeAll(async () => {
  app = await liveApp({ name: 'several-lines-looked-at', viewport: { width: 1440, height: 1000 }, workspace: 'default', opensAt: 'full' })
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

it('a decision: the own answer, and why the question came up', async () => {
  const fork = await file('proposal', 'Which glaze for the spring batch?', {
    question: 'Which glaze should the spring batch use?',
    options: ['a — Celadon, as last spring', 'b — Tenmoku'],
    because: THREE,
    who_settles_it: 'the owner',
  })
  await open(`/r/${fork}`)
  await app.page.getByRole('button', { name: 'Decide it', exact: true }).click()
  await app.page.locator('button.px-gov-opt-inner', { hasText: 'None of these' }).click()
  const box = app.page.getByLabel('What you are doing instead')
  await holdsThree(box)

  // The same words wrap onto more lines in a narrow box, so the box must measure itself again there
  // or its last lines are cut off.
  await app.page.setViewportSize({ width: 390, height: 1000 })
  await expect
    .poll(async () => box.evaluate((el) => el.scrollHeight > el.clientHeight + 1), { timeout: 10_000 })
    .toBe(false)

  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.locator('details.px-gov-fold > summary').click()
  await drawsThree(app.page.locator('.px-gov-fold > p'))
}, 300_000)
