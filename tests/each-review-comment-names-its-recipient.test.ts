// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Destinations belong on comment rows, not group headings, by a decision of the owner's.
 * A throwaway office, with synthetic comments and three synthetic agents.
 * Mutation: make CommentRecipient return null; the row assertion must fail.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'
import { testShots } from './where-shots-go.ts'

const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agents = [
  { name: 'Kiln Keeper', handle: 'recipient-kiln' },
  { name: 'Glaze Reader', handle: 'recipient-glaze' },
  { name: 'Shelf Checker', handle: 'recipient-shelf' },
]
const shots = testShots('review-recipients')
let app: LiveApp
let pageId = ''
let first = ''
let second = ''
let outside = ''
let unchosen = ''
let reviewId = ''
let otherPage = ''
const ids: string[] = []
async function write<T>(path: string, body: unknown, method = 'POST', headers = PERSON): Promise<T> {
  const response = await fetch(app.api + path, { method, headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
  const aLetterNothingHolds = method === 'POST' && path === '/api/records' && theAnswerToAWriteInATestOffice(headers, body) === 409
  expect(aLetterNothingHolds ? response.status === 409 : response.ok, await response.clone().text()).toBe(true)
  return await response.json() as T
}
async function file(kind: string, title: string, data: unknown, headers = PERSON): Promise<string> {
  return (await write<{ record: { id: string } }>('/api/records', { kind, title, data }, 'POST', headers)).record.id
}
beforeAll(async () => {
  app = await liveApp({ name: 'review-recipient-rows', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.page.addInitScript(() => localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light'))
  for (const agent of agents) {
    ids.push(await file('agent', agent.name, { handle: agent.handle, runtime: 'claude-code', state: 'active' }))
    await file('message', 'Synthetic contact note', { body: 'Synthetic contact for the recipient test.', to: [{ kind: 'person', id: THE_PERSON }] },
      { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent.handle })
  }
  pageId = await file('report', 'Synthetic kiln review', { for: 'Robin', date: '2026-10-08', blocks: [
    { id: 'b-1', type: 'text', heading: 'Synthetic observations', text: 'Made-up data for this test: a shelf moved and a glaze changed colour.' },
  ] }, { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agents[0]!.handle })
  const context = { target: { kind: 'record', recordId: pageId, workspaceId: 'default' } }
  reviewId = (await write<{ review: { id: string } }>('/api/reviews', { entry: context })).review.id
  first = await file('message', 'Synthetic shelf comment', { body: 'Synthetic comment: check the shelf movement.', target: context })
  second = await file('message', 'Synthetic glaze comment', { body: 'Synthetic comment: check the glaze colour.', target: context, recipientHint: 'Old typed hint', chosenRecipient: { kind: 'agent', agentId: ids[1] } })
  otherPage = await file('note', 'Synthetic page outside this review', { body: 'Made-up page for excluded comments.' })
  const otherContext = { target: { kind: 'record', recordId: otherPage, workspaceId: 'default' } }
  outside = await file('message', 'Synthetic excluded comment', { body: 'Synthetic comment: check the spare shelf.', target: otherContext, chosenRecipient: { kind: 'agent', agentId: ids[1] } })
  unchosen = await file('message', 'Synthetic unaddressed comment', { body: 'Synthetic comment: nobody chosen yet.', target: otherContext })
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor({ timeout: 30_000 })
}, 180_000)
afterAll(async () => { await app?.stop() }, 60_000)

async function open(): Promise<void> {
  await app.page.goto(`${app.site}/?lang=en#/r/${pageId}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.px-review-switch').click()
  await app.page.locator('.px-pane-list .px-rev-go').filter({ hasText: 'Synthetic kiln review' }).click()
  // THE TRAY'S LIST IS SHUT AT FIRST (wave 13y round 146, item 73a), so Show comments opens the comment rows.
  await setTheReviewTraysList(app.page, 'open')
  await app.page.locator('.px-b-comment').first().waitFor({ timeout: 30_000 })
}
const row = (body: string) => app.page.locator('.px-rev-item').filter({ has: app.page.locator('.px-rev-words', { hasText: body }) })
async function label(selector: string, name: string): Promise<void> {
  await app.page.locator(selector).getByText(`For ${name}`, { exact: true }).waitFor({ timeout: 15_000 })
}
it('names the default and explicit recipients in both groups and follows one stored change without changing another comment', async () => {
  await open()
  await label(`[data-comment="${first}"]`, agents[0]!.name)
  await label(`[data-comment="${second}"]`, agents[1]!.name)
  await app.page.locator('.px-b-more > summary').click()
  const firstRow = row('check the shelf movement.')
  const secondRow = row('check the glaze colour.')
  await firstRow.locator('.px-comment-recipient').getByText(`For ${agents[0]!.name}`, { exact: true }).waitFor({ timeout: 15_000 })
  await secondRow.locator('.px-comment-recipient').getByText(`For ${agents[1]!.name}`, { exact: true }).waitFor({ timeout: 15_000 })
  await row('check the spare shelf.').locator('.px-comment-recipient').getByText(`For ${agents[1]!.name}`, { exact: true }).waitFor({ timeout: 15_000 })
  await row('nobody chosen yet.').locator('.px-comment-recipient').getByText('No recipient', { exact: true }).waitFor({ timeout: 15_000 })
  await app.page.getByRole('button', { name: 'Finish collecting', exact: true }).click()
  await app.page.getByRole('button', { name: /^Finish collecting ·/ }).click()
  await secondRow.getByRole('button', { name: 'More', exact: true }).click()
  await secondRow.getByRole('button', { name: 'Change the recipient', exact: true }).click()
  const stored = app.page.waitForResponse(r => r.url().endsWith(`/api/records/${second}`) && r.request().method() === 'PATCH', { timeout: 30_000 })
  await secondRow.locator('.px-talk-contact', { hasText: agents[2]!.name }).click()
  expect((await stored).status()).toBe(200)
  await secondRow.locator('.px-comment-recipient').getByText(`For ${agents[2]!.name}`, { exact: true }).waitFor({ timeout: 15_000 })
  await firstRow.locator('.px-comment-recipient').getByText(`For ${agents[0]!.name}`, { exact: true }).waitFor({ timeout: 15_000 })
  const detail = await fetch(`${app.api}/api/reviews/${reviewId}`, { headers: PERSON }).then(r => r.json()) as { members: { id: string; recipientName: string }[] }
  expect(detail.members.find(one => one.id === second)?.recipientName).toBe(agents[2]!.name)
  expect(detail.members.find(one => one.id === first)?.recipientName).toBe(agents[0]!.name)
  expect(await secondRow.textContent()).not.toContain('For Old typed hint')
  const comments = await fetch(`${app.api}/api/messages/comments`, { headers: PERSON }).then(r => r.json()) as { recipientNames: Record<string, string | null> }
  expect(comments.recipientNames[first]).toBe(agents[0]!.name)
  expect(comments.recipientNames[second]).toBe(agents[2]!.name)
  expect(comments.recipientNames[outside]).toBe(agents[1]!.name)
  expect(comments.recipientNames[unchosen]).toBe(null)
  expect(await app.page.locator('.px-pane input[type="checkbox"]').count()).toBe(0)
  expect(await app.page.locator('.px-review-steps').count()).toBe(0)
}, 120_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs several recipients in both groups at four widths in English light and dark', async () => {
  // Close the expanded comment so all destinations are visible together.
  const expanded = row('check the glaze colour.').getByRole('button', { name: 'Less', exact: true })
  if (await expanded.count()) await expanded.click()
  for (const width of [1440, 990, 660, 390]) for (const look of ['light', 'dark']) {
    await app.page.setViewportSize({ width, height: width === 390 ? 1440 : 1200 })
    await app.page.evaluate((theme) => {
      localStorage.setItem('mole-office.preset.theme', theme)
    }, look)
    await app.page.goto(`${app.site}/?lang=en&look=${look}#/r/${pageId}`)
    await waitForThePage(app.page, 60_000)
    // The review selection survives navigation. At phone width Open unfolds its sheet.
    const openSheet = app.page.locator('[data-part="your-review-bar"]').getByRole('button', { name: 'Open', exact: true })
    if (await openSheet.isVisible()) await openSheet.click()
    const disclosure = app.page.locator('.px-review-switch')
    if (await row('check the spare shelf.').count() === 0 && await disclosure.isVisible()) await disclosure.click()
    const more = app.page.locator('.px-b-more > summary')
    if (await more.isVisible()) await more.click()
    await row('check the spare shelf.').locator('.px-comment-recipient').waitFor({ timeout: 15_000 })
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    for (const agent of agents) {
      const label = app.page.locator('.px-pane .px-comment-recipient').getByText(`For ${agent.name}`, { exact: true })
      expect(await label.evaluate((el) => {
        const pane = el.closest('.px-pane')!.getBoundingClientRect()
        const box = el.getBoundingClientRect()
        return box.top >= pane.top && box.bottom <= pane.bottom && box.right <= pane.right
      }), `${width} ${look}: ${agent.name}'s label is clipped`).toBe(true)
    }
    await app.page.screenshot({ path: `${shots}/recipients-${width}-${look}-en.png` })
  }
}, 180_000)

it('names recipients on the comment-only column when those comments belong to no review', async () => {
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.goto(`${app.site}/?lang=en#/r/${otherPage}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.px-comment-circle').first().click()
  await row('check the spare shelf.').locator('.px-comment-recipient').getByText(`For ${agents[1]!.name}`, { exact: true }).waitFor({ timeout: 15_000 })
  await row('nobody chosen yet.').locator('.px-comment-recipient').getByText('No recipient', { exact: true }).waitFor({ timeout: 15_000 })
}, 60_000)

it('keeps the default writer on a comment-only row after the review sends it', async () => {
  const send = await app.context.request.post(`${app.api}/api/reviews/${reviewId}/send`, { data: {}, headers: PERSON })
  expect(send.ok(), await send.text()).toBe(true)
  const sent = await send.json() as { review: { review: { state: string } } }
  expect(sent.review.review.state).toBe('sent')
  const response = await fetch(`${app.api}/api/messages/comments`, { headers: PERSON, signal: AbortSignal.timeout(30_000) })
  expect(response.ok, await response.clone().text()).toBe(true)
  const comments = await response.json() as { recipientNames: Record<string, string | null> }
  expect(comments.recipientNames[first]).toBe(agents[0]!.name)
  await app.page.goto(`${app.site}/?lang=en#/r/${pageId}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.px-comment-circle').first().click()
  await row('check the shelf movement.').locator('.px-comment-recipient').getByText(`For ${agents[0]!.name}`, { exact: true }).waitFor({ timeout: 15_000 })
}, 60_000)

it('names another review’s default writer on an excluded comment instead of treating it as unaddressed', async () => {
  const report = await file('report', 'Synthetic second review', { for: 'Robin', date: '2026-10-08', blocks: [] },
    { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agents[1]!.handle })
  const context = { target: { kind: 'record', recordId: report, workspaceId: 'default' } }
  await write('/api/reviews', { entry: context })
  const comment = await file('message', 'Synthetic comment held elsewhere', { body: 'Synthetic comment in the second review.', target: context })
  const reply = await fetch(`${app.api}/api/reviews/${reviewId}/not-in-it`, { headers: PERSON, signal: AbortSignal.timeout(30_000) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  const body = await reply.json() as { rows: { id: string; recipientName?: string | null }[] }
  expect(body.rows.find(one => one.id === comment)?.recipientName).toBe(agents[1]!.name)
}, 60_000)
