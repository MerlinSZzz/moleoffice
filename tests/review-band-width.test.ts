// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PROJECT = 'review-band-width'
const COMMENTS = 20
const SHOT_DIR = process.env['REVIEW_BAND_SHOTS']
const AS_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp

async function post(path: string, body: unknown, workspace = PROJECT): Promise<Record<string, unknown>> {
  const response = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: { ...AS_OWNER, 'x-mole-office-workspace': workspace },
    body: JSON.stringify(body),
  })
  const responseText = await response.text()
  if (!response.ok) throw new Error(`POST ${path} answered ${String(response.status)}: ${responseText}`)
  return JSON.parse(responseText) as Record<string, unknown>
}

beforeAll(async () => {
  app = await liveApp({ name: 'review-band-width', viewport: { width: 1440, height: 800 } })

  const project = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: AS_OWNER,
    body: JSON.stringify({ id: PROJECT, title: 'Review band width' }),
  })
  expect(project.status, await project.text()).toBe(201)

  const report = await post('/api/records', {
    kind: 'report',
    title: 'Synthetic long page for the review band width test',
    summary: 'A made-up report in a made-up project.',
    data: { date: '2026-09-29', blocks: [{ id: 'b-prose', type: 'text', text: 'A measurement sentence.' }] },
  })
  const reportId = (report.record as { id: string }).id
  const target = { target: { kind: 'record', recordId: reportId, workspaceId: PROJECT }, place: { at: 'surface' } }
  const review = await post('/api/reviews', { entry: target })
  const reviewId = (review.review as { id: string }).id
  await new Promise((resolve) => setTimeout(resolve, 1200))

  for (let n = 1; n <= COMMENTS; n += 1) {
    await post('/api/records', {
      kind: 'annotation',
      title: `Synthetic review line ${String(n)}`,
      data: {
        body: `Synthetic review line ${String(n)} gives the open pane enough content to scroll.`,
        context: { target: { kind: 'record', recordId: reportId, workspaceId: PROJECT } },
      },
    })
  }

  await app.page.addInitScript(({ projectId, id }) => {
    window.localStorage.setItem('mole-office.workspace', projectId)
    window.localStorage.setItem('mole-office.review', `open|${id}|${projectId}|${id}|${projectId}`)
  }, { projectId: PROJECT, id: reviewId })
  await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.shell-main > .page').waitFor({ timeout: 30_000 })
  await app.page.locator('.shell-main > .px-pane').waitFor({ timeout: 30_000 })
  await app.page.evaluate(() => {
    const fill = (element: HTMLElement, lines: string[]) => {
      const paragraphs = lines.map((text) => {
        const line = document.createElement('p')
        line.textContent = text
        return line
      })
      element.replaceChildren(...paragraphs)
    }
    fill(document.querySelector<HTMLElement>('.shell-main > .page')!,
      Array.from({ length: 20 }, (_, index) => `Long page line ${String(index + 1)} makes this a long review page.`))
    fill(document.querySelector<HTMLElement>('.shell-main > .px-pane')!,
      Array.from({ length: 20 }, (_, index) => `Made-up line ${String(index + 1)} added by the test to make the pane long.`))
  })
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

it('keeps the review band the width of the page at band sizes and beside it at desk sizes', async () => {
  if (SHOT_DIR !== undefined) mkdirSync(SHOT_DIR, { recursive: true })
  const measurements: {
    width: number
    look: string
    direction: string
    pageLeft: number
    pageRight: number
    pageWidth: number
    paneLeft: number
    paneRight: number
    paneWidth: number
  }[] = []

  for (const width of [1440, 990, 660, 390]) {
    await app.page.setViewportSize({ width, height: 800 })
    for (const look of ['light', 'dark'] as const) {
      await app.page.emulateMedia({ colorScheme: look })
      await app.page.evaluate((theme) => { document.documentElement.dataset['theme'] = theme }, look)
      const measured = await app.page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>('.shell-main')
        const page = document.querySelector<HTMLElement>('.shell-main > .page')
        const pane = document.querySelector<HTMLElement>('.shell-main > .px-pane')
        if (shell === null || page === null || pane === null) throw new Error('the page or review pane was not drawn')
        const pageBox = page.getBoundingClientRect()
        const paneBox = pane.getBoundingClientRect()
        return {
          direction: getComputedStyle(shell).flexDirection,
          pageLeft: pageBox.left,
          pageRight: pageBox.right,
          pageWidth: pageBox.width,
          paneLeft: paneBox.left,
          paneRight: paneBox.right,
          paneWidth: paneBox.width,
        }
      })
      measurements.push({ width, look, ...measured })
      if (SHOT_DIR !== undefined) {
        await app.page.screenshot({ path: join(SHOT_DIR, `${width}-${look}.png`) })
      }
    }
  }

  console.info(`REVIEW_BAND_WIDTH_MEASUREMENTS ${JSON.stringify(measurements)}`)

  for (const measured of measurements) {
    const name = `${measured.width}-${measured.look}`
    // SHAPE B, wave 13r round 15, KEEPS THE COLUMN BESIDE THE PAGE DOWN TO 660 WIDE. At 390 the
    // pane this test filled with its own lines draws no review bar, so it is still the band above the page.
    if (measured.width >= 660) {
      expect(measured.direction, `${name}: desk layout`).toBe('row')
      expect(measured.pageRight, `${name}: page edge beside pane`).toBeLessThanOrEqual(measured.paneLeft + 1)
    } else {
      expect(measured.direction, `${name}: band layout`).toBe('column')
      expect(Math.abs(measured.paneLeft - measured.pageLeft), `${name}: band and page left edges`).toBeLessThanOrEqual(1)
      expect(Math.abs(measured.paneRight - measured.pageRight), `${name}: band and page right edges`).toBeLessThanOrEqual(1)
    }
  }
})
