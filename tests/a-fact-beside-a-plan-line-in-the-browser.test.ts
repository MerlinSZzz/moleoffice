// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RIGHT-CLICK ON A FACT BESIDE A PLAN LINE OPENS THE COMPOSER ABOUT THAT FACT, IN A REAL BROWSER.
 *
 * Problem ON-vXSmgokHf: the plan table draws a line's size, the time given to it and its project in
 * cells beside the line, and a right-click on one of them answered the whole line. The markup is
 * read in tests/the-gesture-reaches-the-whole-row.test.ts and the server in
 * tests/a-fact-beside-a-plan-line-is-its-own-target.test.ts. This file drives the real page: it
 * right-clicks the Project cell and reads the chip above the composer, which names what the
 * comment will be about.
 *
 * When TEST_SHOTS names a folder, it also photographs the plan's table and an empty week at 1440,
 * 990, 660 and 390 in light and dark, at 1440 in Chinese and once in the test language. The test
 * person's name is replaced by a made-up one before every picture. The plan and its line are made
 * up.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

const shots = testShots('a-fact-beside-a-plan-line')
const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': 'test-rowan',
}

let live: LiveApp
let planId = ''
let filedLine = ''

async function request(path: string, method = 'GET', body?: unknown): Promise<any> {
  const response = await fetch(live.api + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  expect(response.ok, await response.clone().text()).toBe(true)
  return response.json()
}

/** Open one page of the app in one look and one language, as a person arriving at it would. */
async function open(page: Page, where: string, look: 'light' | 'dark' = 'light', lang?: 'zh' | 'xx'): Promise<void> {
  await page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look).catch(() => {})
  await page.goto(`${live.site}/${lang === undefined ? '' : `?lang=${lang}`}#${where}`, { timeout: 60_000 })
  // A NEW ADDRESS THAT DIFFERS ONLY AFTER THE # DOES NOT LOAD THE PAGE AGAIN, so the look just
  // stored would not be read. Loading it again is what a person arriving at it would see.
  await page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  expect(await page.locator('html').getAttribute('data-theme')).toBe(look)
}

/** The plan's own page, turned to its table. */
async function openTheTable(page: Page, look: 'light' | 'dark' = 'light', lang?: 'zh' | 'xx'): Promise<void> {
  await open(page, `/plans/${planId}`, look, lang)
  // THE THIRD PRESS OF THE VIEW SWITCH IS THE TABLE, read by position so it works in every language.
  await page.locator('.op-views .op-view').nth(2).click({ timeout: 30_000 })
  await page.waitForSelector('.pt-table tbody tr', { timeout: 30_000 })
}

beforeAll(async () => {
  live = await liveApp({ name: 'plan-line-fact', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const made = await request('/api/plans', 'POST', { title: 'Test bench week', body: '- Re-level the test bench {size: 3h}\n- Order new feet for the bench' })
  planId = made.plan.id
  // THE FIRST LINE IS FILED AS WORK, so its project is a fact read from the work: the case in the
  // problem, where the facts beside a line are drawn rather than typed.
  filedLine = made.lines[0].id
  await request(`/api/plans/${planId}/lines/${filedLine}/file-as-work`, 'POST', { kind: 'task', workspaceId: 'default' })
  const kept = await request('/api/planning/intents', 'POST', {
    said: 'next week, if the parts arrive',
    planLineId: filedLine,
  })
  expect(kept.intent.state).toBe('kept')
}, 180_000)

afterAll(async () => {
  await live?.stop()
})

describe('a fact beside a line of a plan', () => {
  it('opens the composer about the fact that was right-clicked, named by its column and its line', async () => {
    const page = live.page
    await openTheTable(page)
    // THE FILED LINE'S CELL. On a line nobody has filed, the cell is a box the person types in, and
    // a right-click in a box you type in is the browser's own, as everywhere in Mole Office.
    const cell = page.locator(`td[data-target="planLineFact/${planId}/${filedLine}/project"]`)
    await cell.waitFor({ timeout: 30_000 })
    // THE EDGE OF THE CELL, away from the picker inside it, which is a control of its own.
    await cell.click({ button: 'right', position: { x: 3, y: 3 } })
    await page.waitForSelector('.px-talk', { timeout: 15_000 })
    const chip = await page.locator('.px-talk-chip-what').first().innerText()
    expect(chip).toBe('Project of “Re-level the test bench”')
    await page.keyboard.press('Escape')
  }, 120_000)

  it('leaves the kept-time box to the browser when it is right-clicked', async () => {
    const page = live.page
    await openTheTable(page)
    const box = page.locator(`td[data-target="planLineFact/${planId}/${filedLine}/time"] .pi-kept textarea`)
    await box.waitFor({ timeout: 30_000 })
    await page.evaluate(() => {
      const root = document.documentElement
      delete root.dataset['contextMenuPrevented']
      document.addEventListener(
        'contextmenu',
        (event) => {
          setTimeout(() => {
            root.dataset['contextMenuPrevented'] = String(event.defaultPrevented)
          }, 0)
        },
        { capture: true, once: true },
      )
    })
    await box.click({ button: 'right' })
    await page.waitForFunction(() => document.documentElement.dataset['contextMenuPrevented'] !== undefined)
    expect(await page.evaluate(() => document.documentElement.dataset['contextMenuPrevented'])).toBe('false')
    expect(await page.locator('.px-talk').count()).toBe(0)
  }, 120_000)
})

describe('the pictures', () => {
  it.skipIf(!process.env['TEST_SHOTS'])('photographs the plan table and an empty week', async () => {
    const page = live.page
    const snap = async (name: string): Promise<void> => {
      await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          if (node.textContent !== null && /test-rowan/i.test(node.textContent)) {
            node.textContent = node.textContent.replace(/test-rowan/gi, 'Rowan')
          }
        }
      })
      await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
    }
    for (const look of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await openTheTable(page, look)
        await snap(`plan-table-${String(width)}-${look}`)
        await open(page, '/plan/2026-W45', look)
        await page.waitForSelector('.px-pl-none', { timeout: 30_000 })
        await snap(`empty-week-${String(width)}-${look}`)
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    for (const lang of ['zh', 'xx'] as const) {
      await openTheTable(page, 'light', lang)
      await snap(`plan-table-1440-light-${lang}`)
      await open(page, '/plan/2026-W45', 'light', lang)
      await page.waitForSelector('.px-pl-none', { timeout: 30_000 })
      await snap(`empty-week-1440-light-${lang}`)
    }
    // THE COMPOSER, OPENED ON THE PROJECT CELL.
    await openTheTable(page)
    await page.locator(`td[data-target="planLineFact/${planId}/${filedLine}/project"]`).click({ button: 'right', position: { x: 3, y: 3 } })
    await page.waitForSelector('.px-talk', { timeout: 15_000 })
    await snap('plan-table-fact-composer-1440-light')
    await page.keyboard.press('Escape')
  }, 600_000)
})
