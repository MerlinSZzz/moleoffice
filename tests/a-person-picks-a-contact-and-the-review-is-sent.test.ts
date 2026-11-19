// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON PICKS A CONTACT IN THE REVIEW PANEL, AND THE REVIEW IS SENT, IN WHICHEVER PROJECT THEY OPENED FIRST.
 * Problem IsfgDzJ2yrAB: pressing a
 * contact did nothing, so a review could not reach the send step, on 3 and 4 October.
 *
 * THE CAUSE. The review panel's contact list turns a pressed agent into its record in the project, read from
 * `readParticipantsOnce` (src/web/lib/oneread.ts). That read was kept once for the whole browser, but the server
 * answers each agent's `record` for the project the request names. So after the browser read the participants in one
 * project and the person switched to another, every agent there looked as if it had no record in it. A press then
 * chose nobody and only added a quiet line under a long list.
 *
 * In a real browser against a Mole Office of its own, with a browser paired through the page: the agent and the review
 * are in project Greenhouse; the browser starts in project Default and reads its contacts there, then the person
 * switches to Greenhouse with the sidebar's switcher, opens the review's comment, presses "Choose who it is for",
 * presses the agent, and presses "Send this review". The comment is stored as going to that agent, and the review is
 * sent.
 *
 * MUTATION: key `readParticipantsOnce` by nothing again, and this file fails at the press.
 *
 * Everything here is made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { en } from '../src/shared/words/en.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PROJECT = 'test-greenhouse'
const AS_THE_PERSON_IN = (project: string) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': project,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
})

let app: LiveApp
let aboutId = ''
let reviewId = ''
let commentId = ''
const SHOTS = process.env['CONTACT_SHOTS']
/** The project each read of the participants named, in order. */
const participantsReadIn: string[] = []

async function post<T>(path: string, body: unknown, project = PROJECT): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers: AS_THE_PERSON_IN(project), body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

async function shot(name: string): Promise<void> {
  if (SHOTS === undefined) return
  mkdirSync(SHOTS, { recursive: true })
  await app.page.screenshot({ path: join(SHOTS, `${name}.png`) })
}

beforeAll(async () => {
  app = await liveApp({ name: 'pick-a-contact', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await post('/api/workspaces', { id: PROJECT, title: 'Greenhouse' }, 'default')
  // THE AGENT HAS ITS RECORD IN GREENHOUSE ONLY, as an agent started in one project does.
  await post('/api/agents/started', { handle: 'kiln-keeper', name: 'Kiln Keeper', role: 'worker' })
  aboutId = (await post<{ record: { id: string } }>('/api/records', { kind: 'note', title: 'The kiln schedule', data: { body: 'Two firings a week.' } })).record.id
  const target = { target: { kind: 'record', recordId: aboutId, workspaceId: PROJECT }, place: { at: 'surface' } }
  reviewId = (await post<{ review: { id: string } }>('/api/reviews', { entry: target })).review.id
  commentId = (await post<{ record: { id: string } }>('/api/records', {
    kind: 'message',
    title: 'About the shelves',
    data: { body: 'The left shelf is cracked.', target },
  })).record.id
  await post(`/api/reviews/${reviewId}/finish-collecting`, {})
  // THE BROWSER STARTS IN DEFAULT.
  await app.page.addInitScript(() => {
    if (sessionStorage.getItem('test.seeded') === null) {
      localStorage.setItem('mole-office.workspace', 'default')
      sessionStorage.setItem('test.seeded', '1')
    }
  })
  app.page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/participants') participantsReadIn.push(request.headers()['x-mole-office-workspace'] ?? '')
  })
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: en['g4.pairing.press'], exact: true }).click()
  await app.page.getByText(en['g4.pairing.paired'], { exact: true }).waitFor()
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a person picks a contact in the review panel', () => {
  it('chooses the agent for the comment after switching project, and the review is sent', async () => {
    // THE PARTICIPANTS ARE READ FIRST IN DEFAULT: the frame's panels read them as a page opens.
    await app.page.goto(`${app.site}/#/`)
    await waitForThePage(app.page)
    await expect.poll(() => participantsReadIn.includes('default'), { timeout: 30_000 }).toBe(true)
    await shot('1-default')

    // THEN THE PERSON SWITCHES TO GREENHOUSE WITH THE SIDEBAR'S SWITCHER. Nothing reloads the page.
    await app.page.locator('.sbp-switch').click()
    await app.page.locator(`.sbp-choice[data-project="${PROJECT}"]`).click()
    await app.page.goto(`${app.site}/#/r/${aboutId}`)
    await waitForThePage(app.page)
    await app.page.locator('.px-review-switch').click()
    await app.page.locator('.px-pane-list .px-rev-go').first().click()
    await app.page.locator('.px-rev-acts button').first().click()
    await app.page.getByRole('button', { name: en['review.pane.note.choose'], exact: true }).click()
    const kiln = app.page.locator('.px-talk-contact', { hasText: 'Kiln Keeper' })
    await kiln.waitFor({ timeout: 30_000 })
    await shot('2-contacts-open')
    await kiln.click()
    await app.page.getByRole('button', { name: en['review.pane.note.change'], exact: true }).waitFor({ timeout: 30_000 })
    await shot('3-after-contact-press')
    const stored = (await (await fetch(`${app.api}/api/records/${commentId}`, { headers: AS_THE_PERSON_IN(PROJECT) })).json()) as {
      record: { data: Record<string, unknown> }
    }
    expect(stored.record.data['chosenRecipient'], 'the press stored who the comment is for').toBeDefined()

    const reply = app.page.waitForResponse((r) => r.url() === `${app.api}/api/reviews/${reviewId}/send` && r.request().method() === 'POST')
    await app.page.getByRole('button', { name: en['review.pane.send.head'], exact: true }).click()
    const answered = await reply
    expect(answered.status(), await answered.text()).toBe(200)
    await shot('4-after-send')
    const review = (await (await fetch(`${app.api}/api/reviews/${reviewId}`, { headers: AS_THE_PERSON_IN(PROJECT) })).json()) as {
      review: { state: string }
    }
    expect(review.review.state).toBe('sent')
  }, 240_000)
})
