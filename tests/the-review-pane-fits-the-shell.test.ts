// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Problem 9W9_5_YnHQH9: the pane used a window query while its row asked the shell container.
 * Prove this file with ReviewBar's SHELL_BAND_QUERY replaced by @media (max-width: 1023px).
 * REVIEW_SHELL_SHOTS saves every width, rail state and look, with their measured bounds.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { SHELL_BAND_QUERY } from '../src/web/lib/shell-layout.ts'

/** THE SHELL'S BAND THRESHOLD IN REM, read from the one place it is written (36 since wave 13r round 15's shape B). */
const BAND_REM = Number(/max-width: ([\d.]+)rem/.exec(SHELL_BAND_QUERY)?.[1] ?? Number.NaN)

const REFUSAL = 'Nothing was sent. This request did not prove it comes from the person. If you are using a browser, pair it first on the Pairing page (#/pairing).'
let app: LiveApp

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(app.api + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
    },
    body: JSON.stringify(body),
  })
  expect(response.ok, await response.clone().text()).toBe(true)
  return await response.json() as T
}

beforeAll(async () => {
  app = await liveApp({ name: 'review-shell-width', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const note = await post<{ record: { id: string } }>('/api/records', {
    kind: 'note', title: 'Synthetic page for the review layout test', data: { body: 'Two totals to check.' },
  })
  const target = { target: { kind: 'record', recordId: note.record.id, workspaceId: 'default' }, place: { at: 'surface' } }
  const review = await post<{ review: { id: string } }>('/api/reviews', { entry: target })
  await post('/api/records', {
    kind: 'message', title: 'Synthetic comment for a new agent',
    data: { body: 'Synthetic review: please check the two totals.', chosenRecipient: { kind: 'new', said: 'a new agent' }, target },
  })
  await post(`/api/reviews/${review.review.id}/finish-collecting`, {})
  await app.page.goto(`${app.site}/#/r/${note.record.id}`)
  await waitForThePage(app.page)
  await app.page.locator('.px-review-switch').click()
  await app.page.locator('.px-pane-list .px-rev-go').click()
  const sent = app.page.waitForResponse((response) =>
    response.url() === `${app.api}/api/reviews/${review.review.id}/send` && response.request().method() === 'POST')
  await app.page.getByRole('button', { name: 'Send this review', exact: true }).click()
  expect((await sent).status()).toBe(403)
  await app.page.getByText(REFUSAL, { exact: true }).waitFor()
})

afterAll(async () => { await app?.stop() })

/** At a desk the rail narrows to icons; on a phone it closes as a drawer. */
async function setRail(width: number, open: boolean): Promise<void> {
  if (width >= 1024) {
    const toggle = app.page.locator('.shell-collapse')
    if ((await toggle.getAttribute('aria-expanded') === 'true') !== open) await toggle.click()
    await expect.poll(() => toggle.getAttribute('aria-expanded'), { timeout: 5_000 }).toBe(String(open))
  } else {
    const menu = app.page.locator('.shell-menu')
    if ((await menu.getAttribute('aria-expanded') === 'true') !== open) {
      await app.page.locator(open ? '.shell-menu' : '.shell-close').click()
    }
    // THE DRAWER IS PRESENT WHILE IT CLOSES (usePanelPresence), so the attribute follows the animation rather than the
    // press. This waits for it instead of reading it on the frame after the press.
    await expect.poll(() => app.page.locator('.shell-side').getAttribute('data-drawer'), { timeout: 5_000 }).toBe(open ? 'open' : 'closed')
  }
}

async function bounds() {
  return await app.page.getByText(REFUSAL, { exact: true }).evaluate((refusal, rem) => {
    const shell = document.querySelector<HTMLElement>('.shell-body')!
    const row = document.querySelector<HTMLElement>('.shell-main')!
    const pane = document.querySelector<HTMLElement>('.px-pane')!
    const page = document.querySelector<HTMLElement>('.shell-main > .page')!
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width }
    }
    return {
      viewport: window.innerWidth, document: document.documentElement.scrollWidth,
      shell: shell.clientWidth, threshold: rem * parseFloat(getComputedStyle(document.documentElement).fontSize),
      direction: getComputedStyle(row).flexDirection, position: getComputedStyle(pane).position,
      row: box(row), pane: box(pane), page: box(page), refusal: box(refusal),
      paneScroll: pane.scrollWidth, paneClient: pane.clientWidth,
      refusalScroll: refusal.scrollWidth, refusalClient: refusal.clientWidth,
    }
  }, BAND_REM)
}

function fits(measured: Awaited<ReturnType<typeof bounds>>, where: string): void {
  const band = measured.shell <= measured.threshold
  expect(measured.document, `${where}: document width`).toBeLessThanOrEqual(measured.viewport)
  expect(measured.direction, `${where}: shell layout`).toBe(band ? 'column' : 'row')
  expect(measured.position, `${where}: pane layout`).toBe(band ? 'static' : 'sticky')
  for (const [name, box] of [['pane', measured.pane], ['page', measured.page]] as const) {
    expect(box.width, `${where}: ${name} has room`).toBeGreaterThan(0)
    expect(box.left, `${where}: ${name} left edge`).toBeGreaterThanOrEqual(measured.row.left - 1)
    expect(box.right, `${where}: ${name} right edge`).toBeLessThanOrEqual(measured.row.right + 1)
  }
  expect(measured.paneScroll, `${where}: pane contents fit`).toBeLessThanOrEqual(measured.paneClient)
  expect(measured.refusalScroll, `${where}: refusal fits`).toBeLessThanOrEqual(measured.refusalClient)
  expect(measured.refusal.left, `${where}: refusal left edge`).toBeGreaterThanOrEqual(measured.pane.left)
  expect(measured.refusal.right, `${where}: refusal right edge`).toBeLessThanOrEqual(measured.pane.right)
  if (band) expect(measured.pane.bottom, `${where}: band above page`).toBeLessThanOrEqual(measured.page.top + 1)
  else expect(measured.page.right, `${where}: page beside pane`).toBeLessThanOrEqual(measured.pane.left + 1)
}

it('fits the long refusal at 1440, 660 and 390, both rail states, in light, and the shell boundary', async () => {
  const shots = process.env['REVIEW_SHELL_SHOTS']
  if (shots !== undefined) mkdirSync(shots, { recursive: true })
  const measurements: { name: string; bounds: Awaited<ReturnType<typeof bounds>> }[] = []
  for (const width of [1440, 660, 390]) {
    await app.page.setViewportSize({ width, height: 1000 })
    for (const look of ['light'] as const) {
      await app.page.emulateMedia({ colorScheme: look })
      await app.page.evaluate((theme) => { document.documentElement.dataset['theme'] = theme }, look)
      await setRail(width, false)
      await app.page.getByText(REFUSAL, { exact: true }).scrollIntoViewIfNeeded()
      for (const open of [false, true]) {
        await setRail(width, open)
        const name = `review-refused-${width}-rail-${open ? 'open' : 'closed'}-${look}`
        const measured = await bounds()
        measurements.push({ name, bounds: measured })
        fits(measured, name)
        if (shots !== undefined) await app.page.screenshot({ path: join(shots, `${name}.png`) })
      }
      await setRail(width, false)
    }
  }
  // Keep the window wide and change only the shell, on either side of its boundary.
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  for (const extra of [0, 1]) {
    await app.page.locator('.shell-body').evaluate((shell, { pixels, rem }) => {
      const threshold = rem * parseFloat(getComputedStyle(document.documentElement).fontSize)
      shell.style.maxWidth = `${threshold + pixels}px`
    }, { pixels: extra, rem: BAND_REM })
    const name = `shell-boundary-plus-${extra}`
    const measured = await bounds()
    measurements.push({ name, bounds: measured })
    fits(measured, name)
  }
  await app.page.locator('.shell-body').evaluate((shell) => { shell.style.maxWidth = '' })
  if (shots !== undefined) writeFileSync(join(shots, 'measurements.json'), JSON.stringify(measurements, null, 2))
})
