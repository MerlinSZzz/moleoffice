// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PIPELINE PAGE FITS A PHONE WHEN A ROW CARRIES AN UNFILLED-FIELDS MARK.
 *
 * A family list row's second line is one flex line: the row's own sentence, then "1 detail missing"
 * when the record is unfinished. At 390 the Greek and Italian sentences and the mark together are
 * wider than the row, and the mark has flex: none and white-space: nowrap, so it kept its whole
 * width and pushed the page to 422 pixels in Greek and 418 in Italian. The page scrolled sideways
 * and the mark was cut at the edge.
 *
 * The check measures each mark's own text against the box that holds it, as well as the page
 * against the window, so a mark cut inside a page that fits is red too. English is the control that
 * the row still reads as one line there; Greek and Italian are where the fault was seen.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { LANGUAGES } from '../src/shared/i18n.ts'

const SHOTS = process.env['PIPELINE_MARK_SHOTS']
const THE_PIPELINE = 'A made-up pipeline with no steps'

let app: LiveApp

const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

beforeAll(async () => {
  app = await liveApp({ name: 'pipeline-mark', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.context.addInitScript(({ person }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  }, { person: THE_TEST_OFFICES_OWNER.id })
  const reply = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'pipeline', title: THE_PIPELINE, data: {} }),
  })
  expect(reply.status, await reply.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

interface MarkReading {
  text: string
  right: number
  scrollWidth: number
  clientWidth: number
}

async function open(language: string, look: string): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${language}&look=${look}#/pipeline`)
  await waitForThePage(app.page, 45_000)
  await app.page.waitForSelector('.flst-row', { state: 'visible', timeout: 30_000 })
}

async function measure(): Promise<{ page: number; window: number; theme: string | null; marks: MarkReading[] }> {
  return await app.page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    window: document.documentElement.clientWidth,
    theme: document.documentElement.getAttribute('data-theme'),
    marks: [...document.querySelectorAll('.px-inc-mark')].map((mark) => {
      const word = mark.querySelector('.px-inc-mark-word') ?? mark
      return {
        text: (mark.textContent ?? '').replace(/\s+/g, ' ').trim(),
        right: Math.round(mark.getBoundingClientRect().right),
        scrollWidth: word.scrollWidth,
        clientWidth: word.clientWidth,
      }
    }),
  }))
}

it('draws an unfinished pipeline whole at the widest and the narrowest width, in the light theme, in every page language', async () => {
  if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true })
  const taken: { language: string; look: string; width: number; shot: Buffer; theme: string | null; reading: Awaited<ReturnType<typeof measure>> }[] = []
  const languages = Object.keys(LANGUAGES)
  for (const language of languages) {
    for (const look of ['light']) {
      for (const width of [1440, 390]) {
        await app.page.setViewportSize({ width, height: 1000 })
        await open(language, look)
        const reading = await measure()
        const shot = await app.page.screenshot({
          path: SHOTS === undefined ? undefined : join(SHOTS, `pipeline-mark-${language}-${String(width)}-${look}.png`),
          fullPage: true,
        })
        taken.push({ language, look, width, shot, theme: reading.theme, reading })
      }
    }
  }
  for (const one of taken) {
    const where = `${one.language} ${one.look} ${String(one.width)}`
    expect(one.theme, `${where}: the page is not in the theme asked`).toBe(one.look)
    // Soft, so a red run names every reader that is still too wide rather than only the first.
    expect.soft(one.reading.page, `${where}: the pipeline page is wider than the window`).toBeLessThanOrEqual(one.reading.window + 1)
    expect.soft(one.reading.marks.length, `${where}: the unfinished pipeline draws no unfilled-fields mark`).toBeGreaterThan(0)
    for (const mark of one.reading.marks) {
      expect.soft(mark.right, `${where}: the mark ${JSON.stringify(mark.text)} runs past the window`).toBeLessThanOrEqual(one.reading.window + 1)
      expect.soft(mark.scrollWidth, `${where}: the mark ${JSON.stringify(mark.text)} is cut`).toBeLessThanOrEqual(mark.clientWidth + 1)
    }
  }
}, 600_000)
