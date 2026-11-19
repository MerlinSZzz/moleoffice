// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Baseline measurement: after an elsewhere comment and focus, server 2 / folded 1; after this-tab Add to review, server 2 / folded 2.
/** Made-up data only. A folded count must draw the collecting list that has answered this look/change. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
async function ask(method: string, path: string, body?: unknown): Promise<any> {
  const reply = await fetch(app.api + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return reply.json()
}
beforeAll(async () => {
  app = await liveApp({ name: 'folded-review-answered-count', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
}, 300_000)
afterAll(async () => { await app?.stop() }, 120_000)

for (const where of ['elsewhere', 'this tab'] as const) {
  it(`draws the answered count after a comment is added in ${where}`, async () => {
    const page = app.page
    const about = (await ask('POST', '/api/records', { kind: 'note', title: `Made-up folded kiln note, ${where}`, data: { body: 'Two firings a week.' } })).record.id
    const target = { target: { kind: 'record', recordId: about, workspaceId: 'default' }, place: { at: 'surface' } }
    const review = (await ask('POST', '/api/reviews', { entry: target })).review.id
    const comment = (body: string) => ask('POST', '/api/records', { kind: 'message', title: 'Made-up folded comment', data: { body, target } })
    try {
      await comment('The shelf needs measuring.')
      await page.goto(`${app.site}/#/r/${about}`)
      await waitForThePage(page)
      await page.evaluate(id => {
        localStorage.setItem('mole-office.review', `open|${id}|default|${id}|default`)
        localStorage.setItem('mole-office.review.width', 'collapsed')
      }, review)
      await page.reload()
      await waitForThePage(page)
      await expect.poll(() => page.locator('.px-pane-folded-count').innerText()).toBe('1')
      const answered = page.waitForResponse(async reply => reply.url().includes('/api/reviews?state=collecting') &&
        (await reply.json()).collectingHolds[review] === 2)
      if (where === 'elsewhere') {
        await comment('The second shelf needs measuring.')
        await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      } else {
        await page.getByText('Two firings a week.', { exact: true }).click({ button: 'right' })
        await page.locator('.px-talk textarea').fill('A second comment written in this browser.')
        await page.locator('.px-talk').getByRole('button', { name: 'Add to review', exact: true }).click()
        await page.getByText('This comment is in your review. Nothing has been sent.', { exact: true }).waitFor()
      }
      const fresh = await (await answered).json()
      await page.waitForTimeout(300)
      const drawn = await page.locator('.px-pane-folded-count').innerText()
      console.info('FOLDED_COUNT', JSON.stringify({ where, server: fresh.collectingHolds[review], drawn }))
      expect(fresh.collectingHolds[review]).toBe(2)
      expect(drawn).toBe('2')
      const shots = process.env['REVIEW_COUNT_SHOTS']
      if (shots && where === 'elsewhere') {
        for (const width of [1440, 990, 660, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await page.setViewportSize({ width, height: 1000 })
            await page.emulateMedia({ colorScheme: theme })
            await page.evaluate(value => { document.documentElement.dataset['theme'] = value }, theme)
            await page.screenshot({ path: `${shots}/folded-${String(width)}-${theme}.png` })
          }
        }
      }
    } finally {
      await ask('POST', `/api/reviews/${review}/abandon`)
    }
  }, 120_000)
}
