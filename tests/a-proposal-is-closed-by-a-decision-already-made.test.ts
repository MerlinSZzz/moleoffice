// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROPOSAL IS CLOSED ON ITS PAGE BY A DECISION ALREADY MADE, AND NO NEW DECISION IS WRITTEN. Problem lZ8mjvbb4fxl.
 *
 * On 3 October 2026 the person pressed to close proposal jvFnqONCGikw by a decision they had already made. The panel's
 * only press wrote a NEW decision through the promote door, so the office asked which earlier decisions it replaced and
 * wrote nothing. The proposal page now lists the decisions that name the fork, and a press on one, then a second press
 * naming it, joins that decision to the fork with the settling link. No decision is written.
 *
 * WHAT THIS FILE PROVES, in a real browser against a real server with a database of its own:
 *   1. the page lists the decision that names the fork, two presses close the fork by it, the fork reads settled by
 *      exactly that decision, and the number of decisions held is unchanged;
 *   2. a fork no decision names draws no such list.
 * With CLOSE_BY_A_DECISION_SHOTS set to a folder, it also photographs the open list with a decision chosen, at 1440, 990,
 * 660 and 390 (chapter 6), light and dark, in English and Chinese, and checks nothing is drawn wider than the window.
 *
 * Everybody and everything here is made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { en } from '../src/shared/words/en.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

let app: LiveApp
let page: Page

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ kind, title, data }),
  })
  if (!res.ok) throw new Error(`filing a ${kind} answered ${String(res.status)}: ${await res.text()}`)
  return ((await res.json()) as { record: { id: string } }).record.id
}

function aFork(title: string): Promise<string> {
  return file('proposal', title, {
    question: 'Which glaze goes on the spring batch?',
    options: ['The celadon', 'The tenmoku'],
    because: 'The kiln is booked for Friday.',
    who_settles_it: 'the owner',
  })
}

/** A decision the person made, naming the fork in its text. */
function aDecisionNaming(fork: string): Promise<string> {
  return file('decision', 'The spring batch takes the celadon', {
    replaces: [],
    decided_by: 'the owner',
    authority: 'the owner said so',
    option_taken: `The celadon, as proposal ${fork} asked.`,
    because: 'Said at the bench on 3 October.',
  })
}

async function decisionsHeld(): Promise<number> {
  const res = await fetch(`${app.api}/api/records?kind=decision`, { headers: AS_THE_PERSON })
  if (!res.ok) throw new Error(`listing decisions answered ${String(res.status)}`)
  return ((await res.json()) as { records: unknown[] }).records.length
}

async function settledBy(fork: string): Promise<{ resolved: boolean; by: string[] }> {
  const res = await fetch(`${app.api}/api/records/${fork}`, { headers: AS_THE_PERSON })
  if (!res.ok) throw new Error(`reading the fork answered ${String(res.status)}`)
  const body = (await res.json()) as { resolution: { resolved: boolean; by: { id: string }[] } }
  return { resolved: body.resolution.resolved, by: body.resolution.by.map((d) => d.id) }
}

async function openTheFork(id: string, query = ''): Promise<void> {
  await page.goto(`${app.site}/${query}#/r/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.px-gov-opt', { timeout: 30_000 })
}

const theList = () => page.locator('[data-testid="close-by-a-decision"]')

beforeAll(async () => {
  app = await liveApp({ name: 'close-by-a-decision', viewport: { width: 1440, height: 1000 } })
  page = app.page
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe('a proposal is closed by a decision already made', () => {
  it('lists the decision that names it, and two presses close it by that decision with no new one', async () => {
    const fork = await aFork('Which glaze for the spring batch?')
    const decision = await aDecisionNaming(fork)
    const before = await decisionsHeld()

    await openTheFork(fork)
    await theList().waitFor({ timeout: 30_000 })
    expect(await theList().locator('li a').allTextContents()).toEqual(['The spring batch takes the celadon'])

    // THE FIRST PRESS CHOOSES AND WRITES NOTHING.
    await theList().getByRole('button', { name: en['decisions.closeBy.pick'] }).click()
    expect((await settledBy(fork)).resolved).toBe(false)

    // THE SECOND PRESS NAMES THE DECISION AND CLOSES THE FORK BY IT.
    const confirm = theList().getByRole('button', { name: /^Close by “/ })
    expect(await confirm.textContent()).toContain('The spring batch')
    await confirm.click()
    // THE PANEL IS DRAWN AGAIN AS SETTLED, so the list of decisions to close it by is gone.
    await theList().waitFor({ state: 'detached', timeout: 30_000 })

    expect(await settledBy(fork)).toEqual({ resolved: true, by: [decision] })
    expect(await decisionsHeld()).toBe(before)
  }, 180_000)

  it('draws no list on a fork no decision names', async () => {
    const fork = await aFork('Which clay for the summer batch?')
    await openTheFork(fork)
    expect(await theList().count()).toBe(0)
  }, 180_000)

  it.skipIf(!process.env['CLOSE_BY_A_DECISION_SHOTS'])('photographs the list at 1440, 990, 660 and 390, light and dark, in English and Chinese', async () => {
    const shots = process.env['CLOSE_BY_A_DECISION_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const fork = await aFork('Which glaze for the autumn batch?')
    await aDecisionNaming(fork)
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark']) {
        for (const language of ['en', 'zh']) {
          await page.setViewportSize({ width, height: 1000 })
          await page.evaluate((one) => localStorage.setItem('mole-office.preset.theme', one), theme)
          await openTheFork(fork, `?lang=${language}`)
          await theList().waitFor({ timeout: 30_000 })
          expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
          await theList().locator('li button').first().click()
          await theList().locator('.px-gov-acts').waitFor()
          const drawn = await page.evaluate(() => document.documentElement.scrollWidth)
          expect(drawn, `drawn ${String(drawn)} wide in a window ${String(width)} wide`).toBeLessThanOrEqual(width)
          await theList().scrollIntoViewIfNeeded()
          await page.screenshot({ path: join(shots, `close-by-a-decision-${String(width)}-${theme}-${language}.png`), fullPage: true })
        }
      }
    }
  }, 600_000)
})
