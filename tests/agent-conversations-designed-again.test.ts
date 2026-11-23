// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { AgentMessageView, AgentRunView, AgentThreadListView, AgentThreadView, ThreadDetail } from '../src/server/lib/agents.ts'
import { pathFor } from '../src/web/components/router.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { deleteTheCopiedDefaultChapters, deleteTheCopiedDefaultFlows, deleteTheFiledCardWords, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const answerId = 'thread-answer-secret-47'
const failedId = 'thread-failed-secret-47'
const workingId = 'thread-working-secret-47'
const olderId = 'thread-older-secret-47'
const droppedId = 'thread-dropped-secret-47'
const answerRunId = 'run-answer-secret-47'
const answerMessageId = 'message-answer-secret-47'
const threads: AgentThreadListView[] = [
  { id: answerId, workspaceId: 'default', title: 'Pilot answered', mode: 'direct', state: 'answered', createdAt: '2026-09-26 11:00:00', updatedAt: '2026-09-26 12:00:00', createdBy: THE_TEST_OFFICES_OWNER.id, lastWordIsAgent: true, needsYou: true, lastRunState: 'finished', runCount: 1 },
  { id: workingId, workspaceId: 'default', title: 'Working handoff', mode: 'direct', state: 'dispatched', createdAt: '2026-09-26 10:00:00', updatedAt: '2026-09-26 11:45:00', createdBy: THE_TEST_OFFICES_OWNER.id, lastWordIsAgent: false, needsYou: false, lastRunState: 'running', runCount: 1 },
  { id: failedId, workspaceId: 'default', title: 'Failed handoff', mode: 'direct', state: 'dispatched', createdAt: '2026-09-26 09:00:00', updatedAt: '2026-09-26 11:30:00', createdBy: THE_TEST_OFFICES_OWNER.id, lastWordIsAgent: false, needsYou: true, lastRunState: 'failed', runCount: 1 },
  { id: olderId, workspaceId: 'default', title: 'Older answer', mode: 'direct', state: 'answered', createdAt: '2026-09-25 09:00:00', updatedAt: '2026-09-26 10:00:00', createdBy: THE_TEST_OFFICES_OWNER.id, lastWordIsAgent: false, needsYou: false, lastRunState: 'finished', runCount: 1 },
  { id: droppedId, workspaceId: 'default', title: 'Dropped request', mode: 'direct', state: 'abandoned', createdAt: '2026-09-24 09:00:00', updatedAt: '2026-09-24 10:00:00', createdBy: THE_TEST_OFFICES_OWNER.id, lastWordIsAgent: false, needsYou: false, lastRunState: 'failed', runCount: 1 },
]

const answerThread: AgentThreadView = {
  id: answerId,
  workspaceId: 'default',
  title: 'Pilot answered',
  mode: 'direct',
  state: 'answered',
  createdAt: '2026-09-26 11:00:00',
  updatedAt: '2026-09-26 12:00:00',
  createdBy: THE_TEST_OFFICES_OWNER.id,
}
const answerMessage = {
  id: answerMessageId,
  threadId: answerId,
  position: 2,
  role: 'agent',
  intent: 'discuss',
  body: 'The second reading is within range.',
  context: null,
  reading: null,
  state: 'sent',
  recipient: null,
  delivery: { canSend: false, says: 'This answer has already been sent.' },
  runId: answerRunId,
  fromAnnotationId: null,
  carries: [],
  quotes: [],
  quotePositions: null,
  createdAt: '2026-09-26 12:00:00',
  createdBy: 'pilot',
} as AgentMessageView
const answerRun = {
  id: answerRunId,
  threadId: answerId,
  workspaceId: 'default',
  threadTitle: 'Pilot answered',
  runtime: 'fixture',
  state: 'finished',
  recipientSessionId: null,
  resume: null,
  claimedBy: null,
  claimedAt: null,
  claimedFromMachine: null,
  startedAt: '2026-09-26 11:55:00',
  endedAt: '2026-09-26 12:00:00',
  createdAt: '2026-09-26 11:50:00',
  error: null,
  result: { answer: 'The second reading is within range.' },
  focus: null,
  says: 'The run finished and wrote an answer.',
} as AgentRunView

const details: Record<string, ThreadDetail> = {
  [answerId]: { thread: answerThread, messages: [answerMessage], runs: [answerRun], says: 'One run answered in this conversation.' },
  [failedId]: { thread: { ...answerThread, id: failedId, title: 'Failed handoff', state: 'dispatched' }, messages: [], runs: [], says: 'Nobody answered this conversation.' },
  [workingId]: { thread: { ...answerThread, id: workingId, title: 'Working handoff', state: 'dispatched' }, messages: [], runs: [], says: 'The worker is still working.' },
  [olderId]: { thread: { ...answerThread, id: olderId, title: 'Older answer' }, messages: [], runs: [], says: 'The last word was from the person.' },
  [droppedId]: { thread: { ...answerThread, id: droppedId, title: 'Dropped request', state: 'abandoned' }, messages: [], runs: [], says: 'This conversation was dropped.' },
}

let app: LiveApp
let emptyThreadList = false
const shots = process.env.W13K_AGENTS_SHOTS

beforeAll(async () => {
  app = await liveApp({ name: 'agents-designed-again', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // The default chapters a fresh office copies at its first start (wave 13s round 7) are module records
  // this test did not file, and it counts or draws modules, so it deletes them first.
  await deleteTheCopiedDefaultChapters(app.api)
  await deleteTheCopiedDefaultFlows(app.api)
  // The five role card text records a fresh office files at its first start (wave 13w round 3) are records
  // this test did not file, and it counts the project's work, so they go too.
  await deleteTheFiledCardWords(app.api)
  for (let n = 1; n <= 7; n++) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: OWNER,
      body: JSON.stringify({ kind: 'task', title: `Seed tray ${String(n)}`, data: { state: 'todo' } }),
    })
    expect(filed.status, await filed.clone().text()).toBe(201)
  }
  await app.page.route('**/api/agent/threads**', async (route) => {
    const url = new URL(route.request().url())
    // Keep the real world header: the browser checks that every reply came from the same Office
    // that served the page before it draws a response.
    const upstream = await route.fetch()
    if (url.pathname === '/api/agent/threads') {
      await route.fulfill({
        response: upstream,
        status: 200,
        body: JSON.stringify({ threads: emptyThreadList ? [] : threads, counts: { open: 0, dispatched: 2, answered: 2, abandoned: 1 }, leftOut: 0, note: '' }),
      })
      return
    }
    const id = decodeURIComponent(url.pathname.split('/').at(-1) ?? '')
    const detail = details[id]
    if (detail === undefined) {
      await route.fulfill({ response: upstream, status: 404, body: JSON.stringify({ error: 'No fixture conversation.' }) })
      return
    }
    await route.fulfill({ response: upstream, status: 200, body: JSON.stringify(detail) })
  })
  if (shots) mkdirSync(shots, { recursive: true })
})

afterAll(async () => { await app?.stop() })

async function openPage(language: 'en' | 'zh' = 'en', developer = false): Promise<void> {
  const back = app.page.getByRole('button', { name: language === 'zh' ? zh['agentsPage.allConversations'] : en['agentsPage.allConversations'] })
  if (await back.isVisible().catch(() => false)) await back.click()
  const params = new URLSearchParams()
  if (language !== 'en') params.set('lang', language)
  if (developer) params.set('mode', 'inspect')
  const query = params.size === 0 ? '' : `?${params.toString()}`
  await app.page.goto(`${app.site}/${query}#${pathFor('agents')}`)
  await waitForThePage(app.page)
  try {
    await app.page.locator('.px-ac-thread-row').first().waitFor({ timeout: 5_000 })
  } catch (error) {
    const pageText = await app.page.locator('main.page').innerText().catch(() => '(no main page)')
    const pageHtml = await app.page.locator('main.page').innerHTML().catch(() => '(no main page)')
    throw new Error(`Agent conversations did not draw a row. ${String(error)}\n${pageText}\n${pageHtml.slice(0, 3000)}`)
  }
}

// THE SWITCH WIDTH IS THE PRODUCT'S ONE WIDTH RULE, by item 2 of a decision.
// Above 1180 pixels the two panes stand side by side, and at 1180 and below a conversation is its own screen.
// Until wave 13k's round 18 the panes stood side by side down to 800 pixels, so 990 was a wide width.
it('keeps conversations beside their open thread at 1440, and groups needs-you rows first', async () => {
  for (const width of [1440]) {
    await app.page.setViewportSize({ width, height: 1000 })
    await openPage()
    const layout = await app.page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('.px-ac-list-pane')!
      const detail = document.querySelector<HTMLElement>('.px-ac-detail')!
      const left = list.getBoundingClientRect()
      const right = detail.getBoundingClientRect()
      return { listDisplay: getComputedStyle(list).display, detailDisplay: getComputedStyle(detail).display, grid: getComputedStyle(list.parentElement!).gridTemplateColumns, media: matchMedia('(max-width: 800px)').matches, left: left.left, leftEnd: left.right, right: right.left, rightEnd: right.right, viewport: innerWidth, page: document.documentElement.scrollWidth, style: document.querySelector<HTMLStyleElement>('style[href="mole-office-agent"]')?.textContent?.length }
    })
    expect(layout.detailDisplay, `the open thread is hidden at ${String(width)}`).not.toBe('none')
    expect(layout.leftEnd, `the panes do not sit beside each other at ${String(width)}: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.right)
    expect(layout.rightEnd, `the detail pane is outside the page at ${String(width)}`).toBeLessThanOrEqual(layout.viewport)
    expect(layout.page, `the page overflows sideways at ${String(width)}`).toBeLessThanOrEqual(layout.viewport)

    const needs = await app.page.locator('.px-ac-needs-you .px-ac-thread-row .px-thread-name').allTextContents()
    const rest = await app.page.locator('.px-ac-group:not(.px-ac-needs-you) .px-ac-thread-row .px-thread-name').allTextContents()
    expect(needs).toEqual(['Pilot answered', 'Failed handoff'])
    expect(rest).toEqual(['Working handoff', 'Older answer', 'Dropped request'])
    expect(await app.page.locator('.px-ac-needs-you').evaluate((node) => node.compareDocumentPosition(node.parentElement!.querySelector('.px-ac-group:not(.px-ac-needs-you)')!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy()
  }
})

it('makes a conversation its own screen with a way back at 1180 and 390', async () => {
  for (const width of [1180, 390]) {
    await app.page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await openPage()
    expect(await app.page.locator('.px-ac-list-pane').isVisible()).toBe(true)
    expect(await app.page.locator('.px-ac-work-section').isVisible()).toBe(true)
    expect(await app.page.locator('.px-ac-detail').isVisible()).toBe(false)
    await app.page.locator('.px-ac-thread-row').first().click()
    expect(await app.page.locator('.px-ac-detail').isVisible()).toBe(true)
    expect(await app.page.locator('.px-ac-detail').innerText()).toContain('Pilot answered')
    expect(await app.page.locator('.px-ac-list-pane').isVisible()).toBe(false)
    expect(await app.page.locator('.px-ac-work-section').isVisible()).toBe(false)
    await app.page.getByRole('button', { name: 'All conversations' }).click()
    expect(await app.page.locator('.px-ac-list-pane').isVisible()).toBe(true)
    expect(await app.page.locator('.px-ac-detail').isVisible()).toBe(false)
    const overflow = await app.page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }))
    expect(overflow.document, `the phone page overflows at ${String(width)}`).toBeLessThanOrEqual(overflow.width)
  }
})

it('has one primary press, starts from a whole work row, and gates machine ids to developer mode', async () => {
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await openPage()
  expect(await app.page.locator('.px-ac-page button[data-variant="primary"]').allTextContents()).toEqual([en['agentsPage.start']])
  expect(await app.page.locator('.px-ac-work-row').count()).toBe(5)
  expect(await app.page.locator('.px-ac-work-head h2').textContent()).toBe(en['agentsPage.work'])
  expect(await app.page.locator('.px-ac-work-count').textContent()).toBe('5 of 7 most recently changed')
  expect(await app.page.locator('.px-ac-work-section input[type="search"]').count()).toBe(1)
  expect(await app.page.locator('.px-ac-work-row a, .px-ac-work-row button').count()).toBe(0)
  // THE SEARCH IS ASKED OF THE SERVER a moment after the last key, so the rows are waited for.
  await app.page.locator('.px-ac-search').fill('Seed tray 6')
  await expect.poll(() => app.page.locator('.px-ac-work-row').count(), { timeout: 10_000 }).toBe(1)
  await app.page.locator('.px-ac-search').fill('')
  await expect.poll(() => app.page.locator('.px-ac-work-row').count(), { timeout: 10_000 }).toBe(5)

  const normalText = await app.page.locator('main.page').innerText()
  for (const secret of [answerId, failedId, answerRunId, answerMessageId]) expect(normalText).not.toContain(secret)
  const recordTarget = await app.page.locator('.px-ac-work-row').first().getAttribute('data-target')
  const recordId = recordTarget?.match(/^record\/([^/]+)/)?.[1]
  expect(recordId).toBeTruthy()
  expect(normalText).not.toContain(recordId!)

  await app.page.locator('.px-ac-work-row').first().click()
  await app.page.getByRole('dialog').waitFor({ timeout: 20_000 })
  await app.page.keyboard.press('Escape')

  await openPage('en', true)
  const developerText = await app.page.locator('main.page').innerText()
  expect(developerText).toContain(answerId)
  expect(developerText).toContain(answerMessageId)
  expect(developerText).toContain(answerRunId)
  expect(developerText).toContain('1 run')
  expect(await app.page.locator('.px-ac-work-row .rid-text').first().textContent()).toBe(recordId)
})

it('captures the redesigned page at each requested size and look', async () => {
  if (!shots) return
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await app.page.evaluate((look) => { document.documentElement.dataset.theme = look }, theme)
      await openPage()
      await app.page.screenshot({ path: join(shots, `agents-${String(width)}-${theme}-en.png`), fullPage: true })
      if (width === 390) {
        await app.page.locator('.px-ac-thread-row').first().click()
        await app.page.screenshot({ path: join(shots, `agents-${String(width)}-${theme}-open-en.png`), fullPage: true })
      }
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  for (const theme of ['light', 'dark'] as const) {
    await app.page.evaluate((look) => { document.documentElement.dataset.theme = look }, theme)
    await openPage('zh')
    await app.page.screenshot({ path: join(shots, `agents-1440-${theme}-zh.png`), fullPage: true })
  }
  await openPage('en', true)
  await app.page.screenshot({ path: join(shots, 'agents-1440-light-developer.png'), fullPage: true })
})

it('says the quiet line when no conversation needs the person', async () => {
  emptyThreadList = true
  await app.page.goto(`${app.site}/#${pathFor('agents')}`)
  await waitForThePage(app.page)
  const quiet = app.page.locator('.px-ac-needs-you .px-ac-quiet')
  await quiet.waitFor()
  expect(await quiet.textContent()).toBe(en['agentsPage.nothingNeedsYou'])
})
