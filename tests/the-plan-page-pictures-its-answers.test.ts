// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLAN PAGE, IN A BROWSER, WITH TWO ANSWERS FROM TWO WRITERS.
 *
 * A plan's lines are filed as work; two of those work records are linked as answers to planned
 * states, one by the person and one by a registered agent. The plan's own page must say who wrote
 * each answer, when, and how many the plan has. The pictures it takes are the plan page at 1440,
 * 990, 660 and 390, in light and dark, each with both answers and both writers on it.
 *
 * MADE-UP DATA ONLY. Every title, line and planned state below is written by this test. The
 * pictures are labelled as made-up in the round's report, and this file writes them only into the
 * folder `TEST_SHOTS` names (tests/where-shots-go.ts), which the report's picture run points at
 * the run's own pictures folder.
 *
 * The file also asserts that no width is drawn wider than its window. The two writers are the
 * person and an agent registered through the office's own door, so the names on the page are the
 * registry's names and not ids.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'

import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { linkWord } from '../src/shared/words.ts'
import { t } from '../src/shared/i18n.ts'
import type { BuiltServer } from '../src/server/index.ts'

let tdb: TestDb
let inProcess: BuiltServer
let live: LiveApp

const PICTURES = testShots('plan-answers')

const PLAN_TITLE = 'Made-up plan: who said it came true'
const LINE_ONE = 'Made-up: check the clamp holds'
const LINE_TWO = 'Made-up: measure the reach'
const STATE_ONE = 'Made-up: the clamp closes on the pot'
const STATE_TWO = 'Made-up: the arm reaches the bench'

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const AS_THE_AGENT: Record<string, string> = {
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle,
}

interface Made {
  id: string
}

async function send<T>(method: 'GET' | 'POST', path: string, payload?: Record<string, unknown>, headers = AS_THE_PERSON): Promise<T> {
  const reply = await inProcess.app.inject({
    method,
    url: path,
    headers,
    ...(payload === undefined ? {} : { payload }),
  })
  if (reply.statusCode < 200 || reply.statusCode >= 300) {
    throw new Error(`${method} ${path} answered ${String(reply.statusCode)}: ${reply.body}`)
  }
  return reply.json() as T
}

let planId = ''

async function makePlan(): Promise<void> {
  const made = await send<{ plan: Made; lines: { id: string; text: string }[] }>('POST', '/api/plans', {
    title: PLAN_TITLE,
    body: [`- ${LINE_ONE.slice('Made-up: '.length)}`, `- ${LINE_TWO.slice('Made-up: '.length)}`].join('\n'),
  })
  planId = made.plan.id
  const [first, second] = made.lines
  if (first === undefined || second === undefined) throw new Error('the made-up plan has two lines')

  const filedOne = await send<{ recordId: string }>('POST', `/api/plans/${planId}/lines/${first.id}/file-as-work`, {
    kind: 'task',
    workspaceId: 'default',
  })
  const filedTwo = await send<{ recordId: string }>('POST', `/api/plans/${planId}/lines/${second.id}/file-as-work`, {
    kind: 'task',
    workspaceId: 'default',
  })

  const one = await send<{ record: Made }>('POST', '/api/records', {
    kind: 'planned_state',
    title: STATE_ONE,
    data: { what: LINE_ONE },
  })
  const two = await send<{ record: Made }>('POST', '/api/records', {
    kind: 'planned_state',
    title: STATE_TWO,
    data: { what: LINE_TWO },
  })

  // THE PERSON'S ANSWER, and then the agent's, in the agent's own name. Both links are written
  // through the door the product writes links through, so the writer each row stores is a real one.
  await send('POST', '/api/links', { fromId: filedOne.recordId, toId: one.record.id, type: 'realises' })
  await send('POST', '/api/agents/started', {
    handle: THE_TEST_OFFICES_SECRETARY.handle,
    name: THE_TEST_OFFICES_SECRETARY.name,
    role: 'secretary',
    runtime: 'claude-code',
  })
  await send('POST', '/api/links', { fromId: filedTwo.recordId, toId: two.record.id, type: 'instead_of' }, AS_THE_AGENT)
}

/** Open the plan in one look, and wait for the answers section. */
async function openThePlan(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
  await page.goto(`${live.site}/#/plans/${planId}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.pp-answers').waitFor({ timeout: 30_000 })
}

/** The words a reader sees in the answers section, with the tags taken out. */
async function answerWords(page: Page): Promise<string> {
  return (await page.locator('.pp-answers').innerText()).replace(/\s+/g, ' ').trim()
}

beforeAll(async () => {
  tdb = await freshDb()
  inProcess = await apiApp()
  await inProcess.app.ready()
  live = await liveApp({
    name: 'plan-answers',
    viewport: { width: 1440, height: 1000 },
    workspace: 'default',
    database: tdb.file,
  })
  await makePlan()
})

afterAll(async () => {
  await live?.stop()
  await inProcess?.app.close()
  tdb?.close()
})

describe('the plan page and its answers', () => {
  it('says who wrote each answer, when, and how many the plan has', async () => {
    const page = live.page
    await openThePlan(page, 'light')
    const said = await answerWords(page)
    const count = t('g7a.horizons.answers', { n: 2 })
    // The heading is drawn in capitals by the page's stylesheet, so the count is read as the screen shows it.
    expect(said.toLowerCase(), 'the count').toContain(count.toLowerCase())
    expect(said, 'the person’s registry name').toContain(THE_TEST_OFFICES_OWNER.name)
    expect(said, 'the agent’s registry name').toContain(THE_TEST_OFFICES_SECRETARY.name)
    expect(said).toContain(STATE_ONE)
    expect(said).toContain(STATE_TWO)
    expect(said).toContain(linkWord('realises', 'forward').text)
    expect(said).toContain(linkWord('instead_of', 'forward').text)
    expect(await page.locator('.pp-answers time[datetime]').count(), 'one drawn moment per answer').toBe(2)
    for (const at of await page.locator('.pp-answers time[datetime]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime')))) {
      expect(at, 'the drawn moment names its stored time').toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    }
  }, 180_000)

  it('takes the page with both answers at four widths in both looks, and no width is wider than its window', async () => {
    const page = live.page
    for (const width of [1440, 990, 660, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const theme of ['light', 'dark'] as const) {
        await openThePlan(page, theme)
        const said = await answerWords(page)
        expect(said, `${width} ${theme}: both writers`).toContain(THE_TEST_OFFICES_OWNER.name)
        expect(said, `${width} ${theme}: the agent`).toContain(THE_TEST_OFFICES_SECRETARY.name)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          `${width} ${theme}: the page is not wider than its window`,
        ).toBe(true)
        await page.screenshot({ path: `${PICTURES}/plan-answers-${String(width)}-${theme}.png`, fullPage: true })
      }
    }
  }, 300_000)
})
