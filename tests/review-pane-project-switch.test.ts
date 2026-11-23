// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'
import { openTheProjectList, switchTheProject } from './switch-the-project.ts'

const PROJECT_A = 'review-project-a'
const PROJECT_B = 'review-project-b'
const PROJECT_A_TITLE = 'Mole Office Review'
const PROJECT_B_TITLE = 'AI News Test'
const COMMENT_A = 'A comment held by the Mole Office review.'
const COMMENT_B = 'A comment held by the AI News review.'
/**
 * WHERE THE PICTURES GO, or undefined to take none. Set REVIEW_PANE_PROJECT_SHOTS to a folder to photograph each width
 * and look; left unset, as in the merge queue and in any checkout, this test writes nothing outside its own test office.
 */
const SHOT_DIR = process.env['REVIEW_PANE_PROJECT_SHOTS']
const AS_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let reportA = ''
let reviewA = ''

async function post(path: string, body: unknown, project: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: { ...AS_OWNER, 'x-mole-office-workspace': project },
    body: JSON.stringify(body),
  })
  const bodyText = await response.text()
  if (!response.ok) throw new Error(`POST ${path} in ${project} answered ${String(response.status)}: ${bodyText}`)
  return JSON.parse(bodyText) as Record<string, unknown>
}

async function makeReview(project: string, title: string, comment: string): Promise<{ reportId: string; reviewId: string }> {
  const report = await post('/api/records', {
    kind: 'report',
    title,
    summary: `Synthetic work in ${project}.`,
    data: { date: '2026-09-28', blocks: [{ id: 'b-prose', type: 'text', text: 'A synthetic report.' }] },
  }, project)
  const reportId = (report.record as { id: string }).id
  const target = { target: { kind: 'record', recordId: reportId, workspaceId: project }, place: { at: 'surface' } }
  const review = await post('/api/reviews', { entry: target }, project)
  const reviewId = (review.review as { id: string }).id
  await new Promise((resolve) => setTimeout(resolve, 1200))
  await post('/api/records', {
    kind: 'annotation',
    title: comment,
    data: { body: comment, context: { target: { kind: 'record', recordId: reportId, workspaceId: project } } },
  }, project)
  return { reportId, reviewId }
}

beforeAll(async () => {
  app = await liveApp({ name: 'review-pane-project-switch', viewport: { width: 1440, height: 1000 } })
  for (const [id, title] of [[PROJECT_A, PROJECT_A_TITLE], [PROJECT_B, PROJECT_B_TITLE]] as const) {
    const made = await fetch(`${app.api}/api/workspaces`, {
      method: 'POST',
      headers: AS_OWNER,
      body: JSON.stringify({ id, title }),
    })
    expect(made.status, await made.text()).toBe(201)
  }
  const madeA = await makeReview(PROJECT_A, 'A report in the Mole Office project', COMMENT_A)
  reportA = madeA.reportId
  reviewA = madeA.reviewId
  await makeReview(PROJECT_B, 'A report in the AI News project', COMMENT_B)
  await post('/api/records', {
    kind: 'agent',
    title: 'A citizen of the AI News test project',
    data: { handle: 'ai-news-test-citizen', runtime: 'claude-code', state: 'active' },
  }, PROJECT_B)

  await app.page.addInitScript((project) => {
    if (window.localStorage.getItem('mole-office.workspace') === null) window.localStorage.setItem('mole-office.workspace', project)
  }, PROJECT_A)
  await app.page.goto(`${app.site}/#/r/${reportA}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

it('keeps the review with its project, makes no read in the new project, and opens it there on request', async () => {
  if (SHOT_DIR !== undefined) mkdirSync(SHOT_DIR, { recursive: true })
  await app.page.locator('.px-review-switch').click()
  await app.page.locator('.px-pane-list .px-rev-go').waitFor({ timeout: 30_000 })
  await app.page.locator('.px-pane-list .px-rev-go').first().click()
  // THE TRAY'S LIST IS SHUT AT FIRST (wave 13y round 146, item 73a), and the comment is in it.
  await setTheReviewTraysList(app.page, 'open')
  await app.page.locator('.px-pane').getByText(COMMENT_A, { exact: true }).waitFor({ timeout: 30_000 })

  const readsOfReviewA: { project: string | undefined; url: string }[] = []
  app.page.on('request', (request) => {
    if (!request.url().startsWith(`${app.api}/api/reviews/${reviewA}`)) return
    readsOfReviewA.push({ project: request.headers()['x-mole-office-workspace'], url: request.url() })
  })

  // Leave the report in A first; the record route itself restores A when it is revisited. Leaving a page whose review
  // holds a comment not sent asks what to do (wave 13r round 15), and Keep leaves the review as it is.
  await app.page.goto(`${app.site}/#/embassy`, { timeout: 60_000 })
  const question = app.page.locator('[data-part="leave-question"]')
  await question.waitFor({ timeout: 15_000 })
  await question.getByRole('button', { name: 'Keep', exact: true }).click()
  await question.waitFor({ state: 'detached' })
  await waitForThePage(app.page, 60_000)
  await switchTheProject(app.page, PROJECT_B)
  await app.page.waitForFunction((project) => window.localStorage.getItem('mole-office.workspace') === project, PROJECT_B)
  await waitForThePage(app.page, 60_000)
  const sentence = `This review belongs to “${PROJECT_A_TITLE}”.`
  const go = `Open this review in “${PROJECT_A_TITLE}”`
  const close = 'Close pane'
  await app.page.waitForFunction((said) => {
    const text = document.querySelector('.px-pane')?.textContent ?? ''
    return text.includes(said) || text.includes('Mole Office could not read this review')
  }, sentence, { timeout: 30_000 })
  expect(readsOfReviewA.filter((one) => one.project === PROJECT_B)).toEqual([])
  await app.page.locator('.px-pane').getByText(sentence, { exact: true }).waitFor({ timeout: 30_000 })
  expect(await app.page.locator('.px-pane').innerText()).toContain(sentence)
  expect(await app.page.getByRole('button', { name: go, exact: true }).count()).toBe(1)
  expect(await app.page.getByRole('button', { name: close, exact: true }).count()).toBe(1)
  expect(await app.page.locator('.px-pane').getByText(/Mole Office could not read this review/i).count()).toBe(0)

  for (const width of [1440, 390]) {
    await app.page.setViewportSize({ width, height: 1000 })
    for (const look of ['light'] as const) {
      await app.page.emulateMedia({ colorScheme: look })
      await app.page.evaluate((theme) => { document.documentElement.dataset['theme'] = theme }, look)
      await app.page.getByText(sentence, { exact: true }).waitFor({ timeout: 30_000 })
      if (SHOT_DIR !== undefined) await app.page.screenshot({ path: join(SHOT_DIR, `review-other-project-${String(width)}-${look}.png`) })
    }
  }

  await app.page.goto(`${app.site}/?lang=zh#/embassy`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
  await app.page.evaluate(() => { document.documentElement.dataset['theme'] = 'light' })
  expect(await app.page.locator('html').getAttribute('lang')).toBe('zh')
  await app.page.locator('.px-pane').getByText(`这份评审属于“${PROJECT_A_TITLE}”。`, { exact: true }).waitFor({ timeout: 30_000 })
  if (SHOT_DIR !== undefined) await app.page.screenshot({ path: join(SHOT_DIR, 'review-other-project-1440-zh.png') })

  await app.page.goto(`${app.site}/?lang=en#/embassy`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.px-pane').getByRole('button', { name: go, exact: true }).click()
  await app.page.waitForFunction((project) => window.localStorage.getItem('mole-office.workspace') === project, PROJECT_A)
  // THE REVIEW IS OPEN AGAIN, AND THE TRAY'S LIST IS SHUT AT FIRST.
  await setTheReviewTraysList(app.page, 'open')
  await app.page.locator('.px-pane').getByText(COMMENT_A, { exact: true }).waitFor({ timeout: 30_000 })
  expect(readsOfReviewA.some((one) => one.project === PROJECT_A)).toBe(true)
  expect(readsOfReviewA.filter((one) => one.project === PROJECT_B)).toEqual([])
}, 240_000)

it('changes to a project pressed where the open project list reaches into the review tray', async () => {
  // THE REVIEW IN A IS STILL COLLECTING, as the case before left it, so it is held as the tray across the window's
  // foot. Its list is open, as a person reading the comments has it, and the tray stands well up the window.
  await app.page.locator('[data-part="your-review-bar"]').waitFor({ timeout: 30_000 })
  await setTheReviewTraysList(app.page, 'open')
  // A WINDOW SHORT ENOUGH FOR THE OPEN PROJECT LIST TO REACH INTO THE TRAY. The list opens below the Switch, beside
  // the sidebar and over the page, and the tray stands over the page from the sidebar's edge to the window's.
  await app.page.setViewportSize({ width: 1440, height: 800 })
  const list = await openTheProjectList(app.page)
  const choice = list.locator(`.sbp-choice[data-project="${PROJECT_B}"]`)
  // Playwright brings a choice into the list's view before it presses it, so the choice is measured after the same step.
  await choice.scrollIntoViewIfNeeded()
  const tray = await app.page.locator('.px-pane').boundingBox()
  const reach = await list.boundingBox()
  const pressed = await choice.boundingBox()
  if (tray === null || reach === null || pressed === null) throw new Error('the tray, the open project list or the choice of B is not drawn')
  // THE CASE PROVES SOMETHING ONLY WHERE THE TWO MEET, so that is checked before the press. In a window where the list
  // ended above the tray, the press below would pass with the tray drawn over the list as well.
  expect(reach.y + reach.height, 'the open project list ends above the review tray').toBeGreaterThan(tray.y)
  expect(pressed.y + pressed.height / 2, 'the middle of the choice, where the press lands, is above the review tray').toBeGreaterThan(tray.y)

  // THE PRESS IN THE TRAY'S BAND CHOOSES THE PROJECT. While the tray was drawn over the list, the press landed on the
  // tray and the project stayed as it was.
  await switchTheProject(app.page, PROJECT_B)
  await app.page.waitForFunction((project) => window.localStorage.getItem('mole-office.workspace') === project, PROJECT_B)

  // THE NEXT CASE STARTS WHERE THE FIRST LEFT IT: at 1440 by 1000, in A, with the review collecting and its tray's
  // list open.
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await switchTheProject(app.page, PROJECT_A)
  await app.page.waitForFunction((project) => window.localStorage.getItem('mole-office.workspace') === project, PROJECT_A)
  await waitForThePage(app.page, 60_000)
  await setTheReviewTraysList(app.page, 'open')
}, 180_000)

it('does not guess a project for a saved review value that predates project ids', async () => {
  await switchTheProject(app.page, PROJECT_B)
  await app.page.waitForFunction((project) => window.localStorage.getItem('mole-office.workspace') === project, PROJECT_B)
  await app.page.goto(`${app.site}/#/embassy`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)

  await app.page.evaluate((id) => {
    window.localStorage.setItem('mole-office.review', `open|${id}|${id}`)
  }, reviewA)
  const unknownProjectReads: string[] = []
  app.page.on('request', (request) => {
    if (request.url().startsWith(`${app.api}/api/reviews/${reviewA}`)) {
      unknownProjectReads.push(request.headers()['x-mole-office-workspace'] ?? '')
    }
  })
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.px-pane').getByText('This review was saved without its project.', { exact: true }).waitFor({ timeout: 30_000 })
  expect(unknownProjectReads).toEqual([])
  await app.page.getByRole('button', { name: 'Close pane', exact: true }).click()
  await app.page.locator('.px-pane').waitFor({ state: 'detached', timeout: 30_000 })
}, 180_000)
