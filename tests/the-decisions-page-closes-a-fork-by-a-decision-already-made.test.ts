// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DECISIONS PAGE'S CARD CLOSES A FORK BY A DECISION ALREADY MADE, AND WRITES NO NEW DECISION. Problem lZ8mjvbb4fxl.
 *
 * Wave 13r's round 9 gave the proposal's own page a list of the decisions that name the fork, and a press that closes
 * the fork by one (tests/a-proposal-is-closed-by-a-decision-already-made.test.ts). The card on the Decisions page and in
 * Home's band drew the same panel without that list, so its only press still wrote a NEW decision, and the office asked
 * which earlier decisions it replaced. The card now reads the list when it is opened.
 *
 * WHAT THIS FILE PROVES, in a real browser against a real server with a database of its own:
 *   1. the opened card lists the decision that names the fork, two presses close the fork by it, the fork reads settled
 *      by exactly that decision, and the number of decisions held is unchanged;
 *   2. the opened card of a fork no decision names draws no such list, once the list has been read.
 * Case 1 reads the fork only after the close request (POST /api/links) has answered (problem KhgMC_5MAXjg). Mutation:
 * the awaited path changed to '/api/linksX', a request the press never sends; case 1 goes red on the wait.
 * With DECISIONS_CLOSE_BY_SHOTS set to a folder, it also photographs the opened card with a decision chosen, at 1440,
 * 990, 660 and 390 (chapter 6), light and dark, in English and Chinese, and checks nothing is drawn wider than the window.
 *
 * Everybody and everything here is made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright'
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
function aDecisionNaming(fork: string, title: string): Promise<string> {
  return file('decision', title, {
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

/** Opens the Decisions page, then the card of the fork with this title, and waits until its list has been read. */
async function openTheCard(fork: string, title: string, query = ''): Promise<Locator> {
  await page.goto(`${app.site}/${query}#/decisions`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const card = page.locator('li.dq-tile').filter({ has: page.locator('button.dq-title', { hasText: title }) })
  await card.waitFor({ timeout: 30_000 })
  const read = page.waitForResponse((res) => res.url().endsWith(`/api/records/${fork}`), { timeout: 30_000 })
  await card.locator('summary.dq-decide-sum').click()
  await read
  await card.locator('.px-gov-opt').first().waitFor({ timeout: 30_000 })
  return card
}

const theListIn = (card: Locator) => card.locator('[data-testid="close-by-a-decision"]')

beforeAll(async () => {
  app = await liveApp({ name: 'decisions-close-by', viewport: { width: 1440, height: 1000 } })
  page = app.page
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe('the Decisions page closes a fork by a decision already made', () => {
  it('lists the decision that names it, and two presses close it by that decision with no new one', async () => {
    const title = 'Which glaze for the spring batch?'
    const fork = await aFork(title)
    const decision = await aDecisionNaming(fork, 'The spring batch takes the celadon')
    const before = await decisionsHeld()

    const card = await openTheCard(fork, title)
    const list = theListIn(card)
    await list.waitFor({ timeout: 30_000 })
    expect(await list.locator('li a').allTextContents()).toEqual(['The spring batch takes the celadon'])

    // THE FIRST PRESS CHOOSES AND WRITES NOTHING.
    await list.getByRole('button', { name: en['decisions.closeBy.pick'] }).click()
    expect((await settledBy(fork)).resolved).toBe(false)

    // THE SECOND PRESS NAMES THE DECISION AND CLOSES THE FORK BY IT.
    const confirm = list.getByRole('button', { name: /^Close by “/ })
    expect(await confirm.textContent()).toContain('The spring batch')
    // THE CLOSE REQUEST'S OWN ANSWER IS AWAITED before the fork is read (problem KhgMC_5MAXjg): the card leaving the
    // page is not proof that the request has been answered.
    const closed = page.waitForResponse(
      (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/links',
      { timeout: 30_000 },
    )
    await confirm.click()
    expect((await closed).status(), 'the close request is answered with success').toBeLessThan(300)
    // THE QUEUE IS READ AGAIN, AND A SETTLED FORK IS NO LONGER ON IT.
    await card.waitFor({ state: 'detached', timeout: 30_000 })

    expect(await settledBy(fork)).toEqual({ resolved: true, by: [decision] })
    expect(await decisionsHeld()).toBe(before)
  }, 180_000)

  it('draws no list on the card of a fork no decision names', async () => {
    const title = 'Which clay for the summer batch?'
    const fork = await aFork(title)
    const card = await openTheCard(fork, title)
    expect(await theListIn(card).count()).toBe(0)
    expect(await card.locator('.px-error').count()).toBe(0)
  }, 180_000)

  it.skipIf(!process.env['DECISIONS_CLOSE_BY_SHOTS'])('photographs the opened card at 1440, 990, 660 and 390, light and dark, in English and Chinese', async () => {
    const shots = process.env['DECISIONS_CLOSE_BY_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const title = 'Which glaze for the autumn batch?'
    const fork = await aFork(title)
    await aDecisionNaming(fork, 'The autumn batch takes the tenmoku')
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark']) {
        for (const language of ['en', 'zh']) {
          await page.setViewportSize({ width, height: 1000 })
          await page.evaluate((one) => localStorage.setItem('mole-office.preset.theme', one), theme)
          const card = await openTheCard(fork, title, `?lang=${language}`)
          const list = theListIn(card)
          await list.waitFor({ timeout: 30_000 })
          expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
          await list.locator('li button').first().click()
          await list.locator('.px-gov-acts').waitFor()
          const drawn = await page.evaluate(() => document.documentElement.scrollWidth)
          expect(drawn, `drawn ${String(drawn)} wide in a window ${String(width)} wide`).toBeLessThanOrEqual(width)
          await list.scrollIntoViewIfNeeded()
          await page.screenshot({ path: join(shots, `decisions-close-by-${String(width)}-${theme}-${language}.png`), fullPage: true })
        }
      }
    }
  }, 600_000)
})
