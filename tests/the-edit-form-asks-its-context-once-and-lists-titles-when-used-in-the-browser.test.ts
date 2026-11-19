// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EDIT FORM ASKS A RECORD'S CONTEXT ONCE, AND THE ADD-LINK BOX DRAWS ITS TITLES WHEN IT IS FIRST USED.
 *
 * Wave 13y round 143, item 82: the edit form is to be usable within a second on an office of the live size. On the
 * made-up office of 4 November, shaped like the live project, two things the browser did were found among the form's
 * wait. The record page asked GET /api/records/<id>/context before the record was read, and again once it was, and threw
 * the first answer away: 490 ms of the server's time among the form's own reads. And the Add link box drew its 116,300 or
 * so titles as options with the form, which took about 250 ms, for a list a browser shows only to a box with the focus.
 *
 * WHAT IS HELD HERE:
 *   1. Opening a report's edit form asks its context once, and only after the record has been read.
 *   2. The Add link box's list holds no title until the box takes the focus, and then every title the door offers.
 *
 * THE MUTATIONS THAT TURN THEM RED, each after a green control run: in src/web/pages/RecordPage.tsx, ask the context
 * while `readAt` is still null (case 1 counts two); in src/web/components/LinkPanel.tsx, start `used` as true (case 2
 * finds the titles before the focus).
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Request } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'

let app: LiveApp
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let report = ''

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind, title, data }) })
  expect(reply.status, await reply.clone().text()).toBe(201)
  return ((await reply.json()) as { record: { id: string } }).record.id
}

/** Every /api read the page asks from now on, with when it was asked and when it was answered. */
function watchTheReads(): { reads: { path: string; askedAt: number; answeredAt: number | null }[]; quiet: (ms: number) => Promise<void> } {
  const reads: { path: string; askedAt: number; answeredAt: number | null }[] = []
  const open = new Map<Request, (typeof reads)[number]>()
  let lastChange = performance.now()
  app.page.on('request', (request) => {
    const url = new URL(request.url())
    // THE EVENT STREAM STAYS OPEN for as long as the page does, so it is no read the page waits for.
    if (!url.pathname.startsWith('/api/') || url.pathname === '/api/events') return
    const read = { path: url.pathname, askedAt: performance.now(), answeredAt: null }
    reads.push(read)
    open.set(request, read)
    lastChange = performance.now()
  })
  const ended = (request: Request): void => {
    const read = open.get(request)
    if (read === undefined) return
    read.answeredAt = performance.now()
    open.delete(request)
    lastChange = performance.now()
  }
  app.page.on('requestfinished', ended)
  app.page.on('requestfailed', ended)
  return {
    reads,
    quiet: async (ms) => {
      await expect.poll(() => open.size === 0 && performance.now() - lastChange >= ms, { timeout: 30_000, interval: 100 }).toBe(true)
    },
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'edit-form-reads', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  report = await file('report', 'Made-up report for the edit form', { for: 'Made-up club', date: '2026-11-06', blocks: [] })
  await file('note', 'Made-up note to link to', { body: 'Made-up words.' })
}, 180_000)
afterAll(async () => {
  await app?.stop()
}, 180_000)

it('asks a record\'s context once, after the record has been read', async () => {
  const seen = watchTheReads()
  await app.page.goto(`${app.site}/?lang=en&look=light&mode=normal#/report/${report}/edit`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.mv-line').first().waitFor({ state: 'visible' })
  await seen.quiet(1500)
  const theRecord = seen.reads.filter((one) => one.path === `/api/records/${report}`)
  const theContext = seen.reads.filter((one) => one.path === `/api/records/${report}/context`)
  expect(theRecord.length, 'the record was read').toBeGreaterThan(0)
  expect(theContext.length, 'the times the context was asked').toBe(1)
  const firstAnswer = Math.min(...theRecord.map((one) => one.answeredAt ?? Infinity))
  expect(theContext[0]!.askedAt, 'the context is asked after the record was read').toBeGreaterThan(firstAnswer)
}, 120_000)

it('draws the Add link box\'s titles when the box is first used', async () => {
  const reply = await fetch(`${app.api}/api/records/title-options`, { headers })
  expect(reply.status, await reply.clone().text()).toBe(200)
  const offered = ((await reply.json()) as { options: { value: string }[] }).options
  expect(offered.map((one) => one.value), 'the door offers the made-up note').toContain('Made-up note to link to')
  await app.page.goto(`${app.site}/?lang=en&look=light&mode=normal#/report/${report}/edit`)
  await waitForThePage(app.page, 60_000)
  // THE BOX IS IN THE LINKS FOLD, drawn and hidden until the fold is opened, as a person opens it.
  await app.page.locator('summary', { hasText: en['record.links.join'] }).click()
  const box = app.page.getByPlaceholder(en['record.links.titleExample'], { exact: true })
  await box.waitFor({ state: 'visible' })
  const list = await box.getAttribute('list')
  expect(list, 'the box names its list').not.toBeNull()
  const options = app.page.locator(`datalist[id="${list ?? ''}"] option`)
  expect(await options.count(), 'titles drawn before the box was used').toBe(0)
  await box.focus()
  await expect.poll(() => options.count(), { timeout: 10_000 }).toBe(offered.length)
  expect(await options.evaluateAll((all) => all.map((one) => (one as HTMLOptionElement).value)), 'the titles drawn').toEqual(offered.map((one) => one.value))
}, 120_000)
