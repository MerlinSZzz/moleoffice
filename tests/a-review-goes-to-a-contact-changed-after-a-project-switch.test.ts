// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW'S CHANGE, PRESSED AFTER A PROJECT SWITCH, SENDS THE WHOLE REVIEW TO THE AGENT PRESSED. Problem IsfgDzJ2yrAB
 * (wave 13q round 38, report YChEgtlRbMvZ). Wave 13r round 16, piece 1, item 7.
 *
 * THE CAUSE, as tests/a-person-picks-a-contact-and-the-review-is-sent.test.ts says it: the review panel turns a
 * pressed agent into its record in the project from `readParticipantsOnce` (src/web/lib/oneread.ts), and the server
 * answers an agent's `record` for the project the request names. Kept once for the whole browser, the read made in
 * one project answered for the next, so after a switch every agent looked as if it had no record there, and a press
 * chose nobody. That file proves it for one comment's chooser. This file proves it for the other door to the same
 * read: the review's own Change, in the line that says who the review goes to, whose choice applies to every comment
 * in the review.
 *
 * In a real browser against a Mole Office of its own: the agent has its record in project Greenhouse only, and a
 * review there is collecting one comment. The browser opens in project Default and reads its contacts there; the
 * person switches to Greenhouse with the sidebar's switcher (nothing reloads the page), presses Change beside "goes
 * to", and presses the agent. The review now goes to that agent's record in Greenhouse, and the line says its name.
 *
 * Three-run proof (control, mutation, restore) is in round 16's report. The mutation: `oneRead`'s key made one
 * constant for every project, so the read made in Default answers in Greenhouse; this file then fails at the press.
 *
 * Everything here is made up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { en } from '../src/shared/words/en.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const PROJECT = 'test-greenhouse'
const AS_THE_PERSON_IN = (project: string) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': project,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
})

let app: LiveApp
let aboutId = ''
let reviewId = ''
/** The project each read of the participants named, in order. */
const participantsReadIn: string[] = []

async function post<T>(path: string, body: unknown, project = PROJECT): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers: AS_THE_PERSON_IN(project), body: JSON.stringify(body) })
  if (!reply.ok) throw new Error(`${path} answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as T
}

beforeAll(async () => {
  app = await liveApp({ name: 'r16-review-change-after-switch', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await post('/api/workspaces', { id: PROJECT, title: 'Greenhouse' }, 'default')
  // THE AGENT HAS ITS RECORD IN GREENHOUSE ONLY, as an agent started in one project does.
  await post('/api/agents/started', { handle: 'kiln-keeper', name: 'Kiln Keeper', role: 'worker' })
  aboutId = (await post<{ record: { id: string } }>('/api/records', { kind: 'note', title: 'The kiln schedule', data: { body: 'Two firings a week.' } })).record.id
  const target = { target: { kind: 'record', recordId: aboutId, workspaceId: PROJECT }, place: { at: 'surface' } }
  reviewId = (await post<{ review: { id: string } }>('/api/reviews', { entry: target })).review.id
  await post('/api/records', { kind: 'message', title: 'About the shelves', data: { body: 'The left shelf is cracked.', target } })
  // THE BROWSER STARTS IN DEFAULT, with the column open on the Greenhouse review that is collecting.
  await app.page.addInitScript(([id, project]) => {
    if (sessionStorage.getItem('test.seeded') === null) {
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.review', `open|${String(id)}|${String(project)}|${String(id)}|${String(project)}`)
      sessionStorage.setItem('test.seeded', '1')
    }
  }, [reviewId, PROJECT])
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

describe("a review's Change after a project switch", () => {
  it('sends the review to the agent pressed, by its record in the project switched to', async () => {
    // THE PARTICIPANTS ARE READ FIRST IN DEFAULT: the frame's panels read them as a page opens.
    await app.page.goto(`${app.site}/#/`)
    await waitForThePage(app.page)
    await expect.poll(() => participantsReadIn.includes('default'), { timeout: 30_000 }).toBe(true)

    // THEN THE PERSON SWITCHES TO GREENHOUSE WITH THE SIDEBAR'S SWITCHER. Nothing reloads the page.
    await app.page.locator('.sbp-switch').click()
    await app.page.locator(`.sbp-choice[data-project="${PROJECT}"]`).click()
    await app.page.goto(`${app.site}/#/r/${aboutId}`)
    await waitForThePage(app.page)
    // CHANGE IS ON THE TRAY'S ROW at the window's foot (wave 13y round 146, item 73a), and opens the list with the
    // contacts in it. The Change beside the recipient line is not drawn in the tray.
    const chip = app.page.locator('[data-part="goes-to"]')
    await app.page.locator('[data-part="your-review-bar"]').getByRole('button', { name: en['review.b.change'], exact: true }).click()
    const kiln = app.page.locator('.px-review-contacts .px-talk-contact', { hasText: 'Kiln Keeper' })
    await kiln.waitFor({ timeout: 30_000 })
    await kiln.click()

    // THE PRESS CHOSE THE AGENT: the line says its name, and nothing said it has no record here.
    await expect
      .poll(async () => (await chip.locator('.px-b-chip-words').textContent()) ?? '', { timeout: 30_000 })
      .toContain('Kiln Keeper')
    expect(await app.page.getByText(en['review.pane.contacts.noRecord'], { exact: true }).count(), 'the press said the agent has no record here').toBe(0)
    const stored = (await (await fetch(`${app.api}/api/reviews/${reviewId}`, { headers: AS_THE_PERSON_IN(PROJECT) })).json()) as {
      goesTo: { recipient: unknown; name: string | null }
    }
    expect(stored.goesTo.name, JSON.stringify(stored.goesTo)).toBe('Kiln Keeper')
    expect(participantsReadIn, 'the participants were read again in Greenhouse').toContain(PROJECT)
  }, 240_000)
})
