// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMMENTS COLUMN NAMES THE PERSON A REMARK WAS SENT TO. Backlog item 9.3, wave 13y round 41.
 *
 * An agent's remark sent on its own to the person — `to: [{"kind": "person", "id": THE_PERSON}]` — drew "nobody can
 * say" in the comments column. `nameOfCommentsOwnRecipient` in src/server/lib/reviews.ts named an address only when
 * it was an agent's, and one null made the whole answer undefined. It now names a person from the registry row the
 * rest of the page names them from: the same row the contact list and the chat draw a person's name from.
 *
 * A throwaway office, synthetic agents and three synthetic remarks, run in a real browser. Held at the door
 * (GET /api/messages/comments, the recipientNames answer) and on the page (each row's own words).
 *
 * MUTATIONS, each a run of this whole file after a control and before its restore:
 *  1. A person address mapped back to null in `nameOfCommentsOwnRecipient` (the person branch taken out): the
 *     person case fails at the door and on the page.
 *  2. The person named from the wrong reading, the registry id instead of the registry name
 *     (`readParticipant(...)?.id`): the person case fails, with the wrong words.
 *
 * With TEST_SHOTS set, the last case photographs the column holding the remark at 1440, 990, 660 and 390, light
 * and dark.
 *
 * Everything here is made up.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const WRITER = { name: 'Kiln Keeper', handle: 'remark-kiln' }
const ADDRESSED = { name: 'Glaze Reader', handle: 'remark-glaze' }
/** Words a choice named nobody with, stored exactly as the choice the office could not settle. */
const WORDS_NAMING_NOBODY = 'Synthetic words: whoever was reading the kiln that day'
const REMARK_TO_THE_PERSON = 'Synthetic remark: the shelf holds, for the person.'
const REMARK_TO_AN_AGENT = 'Synthetic remark: the glaze changed, for an agent.'
const REMARK_TO_NOBODY = 'Synthetic remark: a remark whose choice named nobody.'
let app: LiveApp
let pageId = ''
let toThePerson = ''
let toAnAgent = ''
let toNobody = ''
/** The person's name as the registry holds it, which is the name the contact list and the chat draw. */
let personName = ''
/** The addressed agent's name as the registry holds it, which is how a remark to an agent is named. */
let addressedName = ''
let addressedId = ''

async function write<T>(path: string, body: unknown, method = 'POST', headers = PERSON): Promise<T> {
  const response = await fetch(app.api + path, { method, headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
  expect(response.status, await response.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, body))
  return await response.json() as T
}
async function file(kind: string, title: string, data: unknown, headers = PERSON): Promise<string> {
  return (await write<{ record: { id: string } }>('/api/records', { kind, title, data }, 'POST', headers)).record.id
}
/** What the comments door says about the three remarks. */
async function theComments(): Promise<{ recipientNames?: Record<string, string | null | undefined> }> {
  const response = await fetch(`${app.api}/api/messages/comments`, { headers: PERSON, signal: AbortSignal.timeout(30_000) })
  expect(response.ok, await response.clone().text()).toBe(true)
  return await response.json() as { recipientNames?: Record<string, string | null | undefined> }
}
const row = (body: string) => app.page.locator('.px-rev-item').filter({ has: app.page.locator('.px-rev-words', { hasText: body }) })

beforeAll(async () => {
  app = await liveApp({ name: 'comments-column-person', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.page.addInitScript(() => localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light'))
  for (const agent of [WRITER, ADDRESSED]) {
    await file('agent', agent.name, { handle: agent.handle, runtime: 'claude-code', state: 'active' })
  }
  const registries = await (await fetch(`${app.api}/api/participants`, { headers: PERSON })).json() as {
    people: { id: string; name: string }[]
    agents: { id: string; name: string; handle: string }[]
  }
  personName = registries.people.find((one) => one.id === THE_PERSON)?.name ?? ''
  const addressed = registries.agents.find((one) => one.handle === ADDRESSED.handle)
  addressedName = addressed?.name ?? ''
  addressedId = addressed?.id ?? ''
  expect(personName).not.toBe('')
  expect(addressedId).not.toBe('')

  pageId = await file('report', 'Synthetic kiln remarks', { for: 'Robin', date: '2026-10-08', blocks: [
    { id: 'b-1', type: 'text', heading: 'Synthetic observations', text: 'Made-up data for this test: a shelf moved and a glaze changed colour.' },
  ] }, AS(WRITER.handle))
  const context = { target: { kind: 'record', recordId: pageId, workspaceId: 'default' } }
  // AN AGENT'S REMARK TO THE PERSON, sent on its own: a `to` and no `chosenRecipient`.
  toThePerson = await file('message', 'Synthetic remark to the person', { body: REMARK_TO_THE_PERSON, target: context, to: [{ kind: 'person', id: THE_PERSON }] }, AS(WRITER.handle))
  // A REMARK TO AN AGENT, written by the person: the office makes no routed copy of the person's own words, so the
  // remark is addressed to the one agent and nothing else.
  toAnAgent = await file('message', 'Synthetic remark to an agent', { body: REMARK_TO_AN_AGENT, target: context, to: [{ kind: 'agent', id: addressedId }] })
  // A REMARK WHOSE STORED CHOICE NAMES NOBODY, so the column has no name to draw.
  toNobody = await file('message', 'Synthetic remark naming nobody', {
    body: REMARK_TO_NOBODY,
    target: context,
    chosenRecipient: { kind: 'unresolved', said: WORDS_NAMING_NOBODY, why: 'Made-up words that answered to nobody.' },
  }, AS(WRITER.handle))
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor({ timeout: 30_000 })
}, 240_000)
afterAll(async () => { await app?.stop() }, 60_000)

/** Open the report page and press its comment circle, so the comments column is drawn at 1440. */
async function open(): Promise<void> {
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.goto(`${app.site}/?lang=en#/r/${pageId}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.px-comment-circle').first().click()
  await row(REMARK_TO_THE_PERSON).waitFor({ timeout: 30_000 })
}

it('names a remark sent to the person the way the contact list names them', async () => {
  const comments = await theComments()
  expect(comments.recipientNames?.[toThePerson]).toBe(personName)
  await open()
  await row(REMARK_TO_THE_PERSON).locator('.px-comment-recipient').getByText(`For ${personName}`, { exact: true }).waitFor({ timeout: 15_000 })
}, 120_000)

it('names a remark sent to an agent as before', async () => {
  const comments = await theComments()
  expect(comments.recipientNames?.[toAnAgent]).toBe(addressedName)
  await open()
  await row(REMARK_TO_AN_AGENT).locator('.px-comment-recipient').getByText(`For ${addressedName}`, { exact: true }).waitFor({ timeout: 15_000 })
}, 120_000)

it('still says the recipient is not known for a remark whose stored choice names nobody', async () => {
  const comments = await theComments()
  expect(Object.prototype.hasOwnProperty.call(comments.recipientNames ?? {}, toNobody)).toBe(false)
  await open()
  await row(REMARK_TO_NOBODY).locator('.px-comment-recipient').getByText('Recipient not known', { exact: true }).waitFor({ timeout: 15_000 })
}, 120_000)

