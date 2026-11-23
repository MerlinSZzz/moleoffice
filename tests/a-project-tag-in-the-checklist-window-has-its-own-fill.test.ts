// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECT'S NAME ON A CHECKLIST CARD IS DRAWN AS A TAG, WITH A FILL OF ITS OWN, in the checklists window, in the light
 * look and in the dark one.
 *
 * The card names the project its checklist is in, such as Robotics, in a small box beside its title: the tag the
 * person reads as the card's department. Until this file the box was filled with --panel-2 on a card filled with
 * --panel, and those two are almost the same colour in both looks: the name read as plain text.
 *
 * WHAT THIS FILE HOLDS, in the window at 1440, once in each look: the card of a checklist in Robotics draws the name
 * Robotics in its tag, and the tag's fill is set apart from the card's by at least `SET_APART`, as a contrast ratio.
 *
 * `SET_APART` is this file's own bound. On the old code the two fills are 1.04 apart in the light look and 1.01 in the
 * dark one, so case 1 is red in both. The chat's comment chip is filled with --panel-3 on --panel, 1.16 and 1.14 apart.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database, and the browser is the person. The project
 * and the checklist here are made up, and nothing is asked of the live office.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const IN_ROBOTICS = { ...PERSON, 'x-mole-office-workspace': 'robotics' }

const SET_APART = 1.1
const LOOKS = ['light', 'dark'] as const

let list = ''

async function send(method: string, url: string, body: object, headers: Record<string, string> = PERSON): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text.slice(0, 600)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

beforeAll(async () => {
  app = await liveApp({ name: 'project-tag-has-its-own-fill', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  await send('POST', '/api/workspaces', { id: 'robotics', title: 'Robotics' })
  list = (await send('POST', '/api/checklists', { title: 'Test: the arm checklist', items: [{ words: 'Test: set the arm' }] }, IN_ROBOTICS))['checklist']
    .id as string
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

describe("1. a project's name on a card in the checklists window", () => {
  for (const look of LOOKS) {
    it(`1. is a tag with a fill of its own, in the ${look} look`, async () => {
      const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
      try {
        await context.addInitScript((one) => localStorage.setItem('mole-office.preset.theme', one), look)
        const page = await context.newPage()
        page.setDefaultTimeout(20_000)
        await page.goto(`${app.site}/?lang=en#/decisions`, { timeout: 60_000 })
        await waitForThePage(page, 60_000)
        await page.click('.ckw-press')
        const tag = page.locator(`.ckw-panel .cks-card[data-list="${list}"] .cks-project .pch-name`)
        await expect.poll(() => tag.innerText(), { timeout: 30_000 }).toBe('Robotics')
        expect(await page.locator('html').getAttribute('data-theme'), 'the page is in the look this case names').toBe(look)
        const drawn = await tag.evaluate((mark) => {
          const card = mark.closest('.cks-card')
          return { tag: getComputedStyle(mark).backgroundColor, card: card === null ? '' : getComputedStyle(card).backgroundColor }
        })
        expect(apart(drawn.tag, drawn.card), `the tag's fill ${drawn.tag} on the card's ${drawn.card}`).toBeGreaterThanOrEqual(SET_APART)
      } finally {
        await context.close()
      }
    }, 120_000)
  }
})

/** The WCAG 2 contrast ratio of two computed colours, as `rgb(…)` or `rgba(…)`. A colour not fully opaque answers 1. */
function apart(one: string, other: string): number {
  const a = lightness(one)
  const b = lightness(other)
  if (a === null || b === null) return 1
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function lightness(colour: string): number | null {
  const parts = /^rgba?\(([^)]*)\)$/.exec(colour.trim())?.[1]?.split(/[ ,/]+/).filter((one) => one !== '').map(Number)
  if (parts === undefined || parts.length < 3 || parts.some((one) => Number.isNaN(one))) return null
  if (parts.length > 3 && parts[3] !== 1) return null
  const [r, g, b] = parts.slice(0, 3).map((one) => {
    const c = one / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
