// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PROJECT = 'pane-measurement'
const REVIEW_TARGET = 'The synthetic page used to measure the review pane'
/**
 * WHERE THE PICTURES GO, or undefined to take none. Set REVIEW_PANE_PROJECT_SHOTS to a folder to photograph each width
 * and look; left unset, as in the merge queue and in any checkout, this test writes nothing outside its own test office.
 */
const SHOT_DIR = process.env['REVIEW_PANE_PROJECT_SHOTS']
const COMMENTS = 20
const AS_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let reportId = ''
let reviewId = ''

async function post(path: string, body: unknown, workspace = PROJECT): Promise<Record<string, unknown>> {
  const response = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: { ...AS_OWNER, 'x-mole-office-workspace': workspace },
    body: JSON.stringify(body),
  })
  const bodyText = await response.text()
  if (!response.ok) throw new Error(`POST ${path} answered ${String(response.status)}: ${bodyText}`)
  return JSON.parse(bodyText) as Record<string, unknown>
}

beforeAll(async () => {
  app = await liveApp({ name: 'review-pane-project-layout', viewport: { width: 1440, height: 1000 } })

  const projectResponse = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: AS_OWNER,
    body: JSON.stringify({ id: PROJECT, title: 'Pane Measurement' }),
  })
  expect(projectResponse.status, await projectResponse.text()).toBe(201)

  await post('/api/records', {
    kind: 'agent',
    title: 'A synthetic citizen whose name is long enough to measure',
    data: { handle: 'pane-measurement-citizen', runtime: 'claude-code', state: 'active' },
  })
  const report = await post('/api/records', {
    kind: 'report',
    title: REVIEW_TARGET,
    summary: 'A made-up report in a made-up project.',
    data: { date: '2026-09-28', blocks: [{ id: 'b-prose', type: 'text', text: 'A measurement sentence.' }] },
  })
  reportId = (report.record as { id: string }).id
  const target = { target: { kind: 'record', recordId: reportId, workspaceId: PROJECT }, place: { at: 'surface' } }
  const review = await post('/api/reviews', { entry: target })
  reviewId = (review.review as { id: string }).id
  await new Promise((resolve) => setTimeout(resolve, 1200))
  for (let n = 1; n <= COMMENTS; n += 1) {
    await post('/api/records', {
      kind: 'annotation',
      title: `Synthetic review comment ${String(n)}`,
      data: {
        body: `Synthetic review comment ${String(n)}.`,
        context: { target: { kind: 'record', recordId: reportId, workspaceId: PROJECT } },
      },
    })
  }

  await app.page.addInitScript(({ project, id }) => {
    window.localStorage.setItem('mole-office.workspace', project)
    window.localStorage.setItem('mole-office.review', `open|${id}|${project}|${id}|${project}`)
  }, { project: PROJECT, id: reviewId })
  await app.page.goto(`${app.site}/#/embassy`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.px-pane').waitFor({ timeout: 30_000 })
  await app.page.locator('.emb-title').waitFor({ timeout: 30_000 })
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

it('keeps the Embassy content clear of the review tray at the window\'s foot, at four widths and in both looks', async () => {
  if (SHOT_DIR !== undefined) mkdirSync(SHOT_DIR, { recursive: true })
  const measurements: { name: string; pageRight: number; paneLeft: number; paneWidth: number; tabsRight: number | null; direction: string; sideways: number }[] = []

  for (const width of [1440, 990, 660, 390]) {
    await app.page.setViewportSize({ width, height: 1000 })
    for (const look of ['light', 'dark'] as const) {
      await app.page.emulateMedia({ colorScheme: look })
      await app.page.evaluate((theme) => { document.documentElement.dataset['theme'] = theme }, look)
      await app.page.evaluate(() => window.scrollTo(0, 0))
      const measured = await app.page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>('.shell-main')
        const body = document.querySelector<HTMLElement>('.shell-body')
        const page = document.querySelector<HTMLElement>('.shell-main > .page')
        const pane = document.querySelector<HTMLElement>('.shell-main > .px-pane')
        const tabs = document.querySelector<HTMLElement>('.px-where')
        if (shell === null || body === null || page === null || pane === null) throw new Error('the page or pane was not drawn')
        const box = (element: Element) => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
        }
        return {
          viewport: window.innerWidth,
          height: window.innerHeight,
          windowRight: document.documentElement.clientWidth,
          sidebarEdge: box(body).left,
          paneFixed: getComputedStyle(pane).position === 'fixed',
          direction: getComputedStyle(shell).flexDirection,
          page: box(page),
          pane: box(pane),
          tabs: tabs === null ? null : box(tabs),
          tabsBottom: tabs === null ? null : box(tabs).bottom,
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })
      // THE ROOM UNDER THE PAGE IS MEASURED FROM THE ROW, whose height changes when its words wrap at another width,
      // and the page can still grow after the first scroll. Wait until the measure has caught up: useTheTrayRoom writes
      // this row's height into the shell's inline --px-b-bar-room. Then scroll until the window says it is at the end and
      // the document's height has not changed for two frames; only then does the page's foot mean where its last line is.
      await app.page.waitForFunction(() => {
        const main = document.querySelector<HTMLElement>('.shell-main')
        const row = document.querySelector<HTMLElement>('[data-part="your-review-bar"]')
        if (main === null || row === null) return false
        return main.style.getPropertyValue('--px-b-bar-room') === `${String(row.getBoundingClientRect().height)}px`
      }, undefined, { timeout: 10_000 })
      await app.page.evaluate(async () => {
        const atTheEnd = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1
        let height = -1
        let still = 0
        for (let frame = 0; frame < 120 && still < 2; frame += 1) {
          await new Promise((resolve) => requestAnimationFrame(resolve))
          const now = document.documentElement.scrollHeight
          if (now !== height || !atTheEnd()) {
            height = now
            still = 0
            window.scrollTo(0, document.documentElement.scrollHeight)
          } else {
            still += 1
          }
        }
      })
      const foot = await app.page.evaluate(() => {
        const page = document.querySelector('.shell-main > .page')?.getBoundingClientRect()
        const pane = document.querySelector('.shell-main > .px-pane')?.getBoundingClientRect()
        const row = document.querySelector('[data-part="your-review-bar"]')?.getBoundingClientRect()
        if (page === undefined || pane === undefined) return null
        return {
          gap: pane.top - page.bottom,
          scrollY: Math.round(window.scrollY),
          windowHeight: window.innerHeight,
          documentHeight: document.documentElement.scrollHeight,
          atTheEnd: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1,
          pageBottom: Math.round(page.bottom),
          trayTop: Math.round(pane.top),
          rowHeight: row === undefined ? null : Math.round(row.height * 1_000) / 1_000,
        }
      })
      await app.page.evaluate(() => window.scrollTo(0, 0))
      const name = `embassy-fit-${String(width)}-${look}`
      measurements.push({
        name,
        pageRight: Math.round(measured.page.right),
        paneLeft: Math.round(measured.pane.left),
        paneWidth: Math.round(measured.pane.width),
        tabsRight: measured.tabs === null ? null : Math.round(measured.tabs.right),
        direction: measured.direction,
        sideways: measured.sideways,
      })

      expect(measured.sideways, `${name}: document scrolls sideways`).toBe(0)
      // THE FOOT TRAY (wave 13y round 146, item 73a): at every width a collecting review is one row held at the
      // window's foot, from the sidebar's right edge to the window's right edge, and the page keeps the width it had
      // before the review started. So the route tabs are above the tray, and at the end of the page its last line is
      // above the tray's top.
      expect(measured.paneFixed, `${name}: the tray is not held in the window`).toBe(true)
      expect(Math.abs(measured.pane.left - measured.sidebarEdge), `${name}: the tray does not start at the sidebar's right edge`).toBeLessThanOrEqual(1)
      expect(Math.abs(measured.pane.right - measured.windowRight), `${name}: the tray does not reach the window's right edge`).toBeLessThanOrEqual(1)
      expect(Math.abs(measured.pane.bottom - measured.height), `${name}: the tray is not at the window's foot`).toBeLessThanOrEqual(1)
      expect(Math.abs(measured.page.left - measured.sidebarEdge), `${name}: the page does not start at the sidebar's right edge`).toBeLessThanOrEqual(1)
      expect(Math.abs(measured.page.right - measured.windowRight), `${name}: the page did not keep its width`).toBeLessThanOrEqual(1)
      expect(measured.tabsBottom ?? 0, `${name}: route tabs are under the tray`).toBeLessThanOrEqual(measured.pane.top + 1)
      expect(foot, `${name}: the page's foot could not be measured`).not.toBeNull()
      expect(foot?.atTheEnd, `${name}: the page was not at its end when its foot was read: ${JSON.stringify(foot)}`).toBe(true)
      expect(foot?.gap ?? -1, `${name}: the page's foot is under the tray: ${JSON.stringify(foot)}`).toBeGreaterThanOrEqual(-1)
      if (SHOT_DIR !== undefined) await app.page.screenshot({ path: join(SHOT_DIR, `${name}.png`) })
    }
  }

  await app.page.goto(`${app.site}/?lang=zh#/embassy`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
  await app.page.evaluate(() => { document.documentElement.dataset['theme'] = 'light' })
  expect(await app.page.locator('html').getAttribute('lang')).toBe('zh')
  if (SHOT_DIR !== undefined) await app.page.screenshot({ path: join(SHOT_DIR, 'embassy-fit-1440-zh.png') })

  // Reproduce gg65WQpn7vhJ on Records with twenty made-up lines. The narrow band at 660 is a
  // separate issue; record its measured width here without changing its sizing rule.
  await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.setViewportSize({ width: 660, height: 800 })
  await app.page.locator('.px-pane').evaluate((pane) => {
    const block = document.createElement('div')
    for (let i = 1; i <= 20; i += 1) {
      const line = document.createElement('p')
      line.textContent = `Made-up line ${String(i)} added by the test to make the pane long.`
      block.append(line)
    }
    pane.replaceChildren(block)
  })
  const recordsBandWidth = await app.page.locator('.px-pane').evaluate((pane) => pane.getBoundingClientRect().width)
  console.info(`RECORDS_BAND_660_WIDTH ${String(Math.round(recordsBandWidth))}`)
  console.info(`PANE_LAYOUT_MEASUREMENTS ${JSON.stringify(measurements)}`)
  expect(reviewId).not.toBe('')
})
