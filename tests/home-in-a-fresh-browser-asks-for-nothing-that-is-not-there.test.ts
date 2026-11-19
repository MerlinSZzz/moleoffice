// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME, OPENED IN A FRESH BROWSER, ASKS FOR NOTHING THE SERVER DOES NOT HOLD. Problem f1Q1eivN_jSa.
 *
 * Home (#/) and the welcome address (#/welcome, the same page) logged "Failed to load resource: the
 * server responded with a status of 404 (Not Found)" on every load, at every width, in both looks.
 * The review tool found it on its throwaway office, which holds a visiting agent waiting to be let in.
 *
 * WHICH ADDRESS ANSWERED 404, measured on 2 October 2026 against main 767b2ef3d:
 * `GET /api/records/<the credential's id>`, carrying the project `default`, once per load. Needs
 * you draws a row for a visiting agent that waits on the person. That row's id is the id of a
 * credential, not of a record, and Home asked the record door for it to draw its title at the
 * page's reading level. The door answered 404, which is the correct answer to a wrong request.
 * It was not the project race of problem ipeva-Ir-5by: the request carried the right project.
 *
 * WHAT IS PROVED HERE, in a real browser against a real server, for #/, at 1440 in the light look
 * and at 390 in the dark one, each in a new browser with nothing stored:
 *   1. Needs you draws the visiting agent's row, so the case that 404'd is on the page. It also draws
 *      an unread message's row: a message is a record, so Home still reads it, and that read is
 *      answered too.
 *   2. No request the page makes is answered 404. A failure names the method, the address and the
 *      project the request carried.
 * The office also holds a second project with more records than the first, so a never-chosen
 * browser moves to it after the list of projects answers; the race of ipeva-Ir-5by is in play too.
 *
 * MUTATION, run on 2 October 2026: `aWaitingRowIsARecord` in src/web/lib/waiting.ts made to answer
 * true for every row, which is what Home did before. Both cases went red, naming
 * `GET /api/records/<the credential's id>`.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { join } from 'node:path'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { DEFAULT_WORKSPACE } from '../src/shared/workspaces.ts'

let app: LiveApp
const PROJECT = { id: 'test-willow', title: 'Willow Marsh' }
let credentialId = ''
let messageId = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function file(title: string): Promise<void> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': PROJECT.id },
    body: JSON.stringify({ kind: 'problem', title, data: { state: 'open' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
}

beforeAll(async () => {
  app = await liveApp({ name: 'home-asks-nothing-missing', viewport: { width: 1440, height: 1000 } })
  const made = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': DEFAULT_WORKSPACE },
    body: JSON.stringify(PROJECT),
  })
  expect(made.status, await made.text()).toBe(201)
  // THE SECOND PROJECT HOLDS THE MOST RECORDS, so a browser that has never chosen moves to it.
  await file('The willow cuttings need water before the weekend')
  await file('The marsh gate does not close')
  // A VISITING AGENT ASKS TO COME IN, the way the review tool's office has one. It waits on the person.
  const asked = await fetch(`${app.api}/api/office/visitors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': DEFAULT_WORKSPACE },
    body: JSON.stringify({ handle: 'a-visiting-heron', name: 'A visiting heron', role: 'worker', startDirectory: `${THE_TEST_FIXTURE_ROOT}/a-visiting-heron` }),
  })
  expect(asked.status, await asked.clone().text()).toBe(201)
  credentialId = ((await asked.json()) as { credential: { id: string } }).credential.id
  // AN UNREAD MESSAGE TO THE PERSON, written in the second project. Its row opens the chat, and its
  // id is a record's, so Home may read it; this proves that read is answered too.
  const agentFiled = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': DEFAULT_WORKSPACE },
    body: JSON.stringify({ kind: 'agent', title: 'Willow Counter', data: { handle: 'willow-counter', runtime: 'claude-code', state: 'active' } }),
  })
  expect(agentFiled.status, await agentFiled.clone().text()).toBe(201)
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': PROJECT.id, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'willow-counter' },
    body: JSON.stringify({ kind: 'message', title: 'The cuttings are watered', data: { body: 'The cuttings are watered.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
  messageId = ((await said.json()) as { record: { id: string } }).record.id
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

const LOOKS = [
  { width: 1440, height: 1000, scheme: 'light' },
  { width: 390, height: 844, scheme: 'dark' },
] as const

it('#/ in a fresh browser draws the visiting agent\'s row and no request is answered 404', async () => {
  for (const look of LOOKS) {
    // A NEW CONTEXT, so nothing is stored: no project chosen, no language, no look.
    const context = await app.browser.newContext({ viewport: { width: look.width, height: look.height }, colorScheme: look.scheme })
    try {
      const page = await context.newPage()
      const missing: string[] = []
      page.on('response', (response) => {
        if (response.status() !== 404) return
        const request = response.request()
        const url = new URL(response.url())
        missing.push(`${request.method()} ${url.pathname}${url.search} (project ${request.headers()['x-mole-office-workspace'] ?? 'none'})`)
      })
      await page.goto(`${app.site}/?lang=en#/`)
      await waitForThePage(page)
      await page.locator(`[data-home-waiting-id="${credentialId}"]`).first().waitFor({ timeout: 30_000 })
      await page.locator(`[data-home-waiting-id="${messageId}"]`).first().waitFor({ timeout: 30_000 })
      // EVERY READ THE ROWS START IS GIVEN TIME TO ANSWER before the list is judged. The read that
      // answered 404 went out as the row was drawn and was answered within a second; the page holds
      // a connection open, so waiting for the network to go quiet would never end.
      await page.waitForTimeout(3_000)
      await page.screenshot({ path: join(testShots('home-asks-nothing-missing'), `home-${look.width}-${look.scheme}.png`), fullPage: true })
      expect(missing, `at ${look.width} ${look.scheme}, a request was answered 404 (the credential's id is ${credentialId})`).toEqual([])
    } finally {
      await context.close()
    }
  }
}, 180_000)
