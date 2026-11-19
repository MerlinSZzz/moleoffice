// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RETIRED AGENT SITS IN THE COLLAPSED RETIRED GROUP — CRITERION M121, WHICH REPLACES M114.
 *
 * The first rule was that a retired agent is not
 * drawn on the chat page. Criterion M114 was built from that. A later rule replaced it:
 * every group can be folded, and the retired agents' group is folded by default (this replaces M114's "not
 * drawn": a retired agent sits in the collapsed retired group and its conversation stays readable).
 *
 * So the criterion now has three parts, and all three must hold:
 *
 *   1. a retired agent IS a contact, and it sits in the `retired` group under the Agent heading;
 *   2. that group is FOLDED by default, so the agent is not on screen until somebody opens it —
 *      which is the half of M114's sentence that survives;
 *   3. its conversation STAYS READABLE BY ADDRESS. A link straight to it still opens it and still
 *      shows the words, because the words in it are records and retirement deletes nothing.
 *
 * The file keeps its old name so the test suite can be run by the name it has always had; its
 * content is the criterion that replaced the one it was named for.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   control (unmutated)                            → passes.
 *   `contactsFor` starts filtering retired again   → the contact assertion goes red.
 *   `retired` is opened rather than folded         → the folded-by-default assertion goes red.
 *   the group faces stop filtering retired         → the groups assertion goes red.
 *   each restored                                  → passes again.
 *
 * The control comes first because a run that never started looks exactly like a run that failed.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp

/** The agent that is retired, and the one that is not. */
const THE_RETIRED = 'atlas-retired'
const THE_LIVE = 'bruno-live'

/** The words in the retired agent's conversation. They must survive retirement. */
const THE_WORDS = 'The clamp holds at 11.8 N, and this line is a record.'

const THE_GROUP = 'The wrist camera'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A request as one agent, which is how a message is written by the agent that sends it. */
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** Register an agent through the plain records door, the way an ordinary registration arrives. */
async function anAgent(handle: string, title: string): Promise<void> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      kind: 'agent',
      title,
      data: { handle, runtime: 'claude-code', state: 'active', role: 'worker' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
}

/** Say one line from one agent to the person, so there is a conversation to open later. */
async function say(handle: string, body: string): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: asAgent(handle),
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}

beforeAll(async () => {
  app = await liveApp({ name: 'm121-retired-group', viewport: { width: 1440, height: 1000 } })
  await anAgent(THE_RETIRED, 'Atlas')
  await anAgent(THE_LIVE, 'Bruno')
  await say(THE_RETIRED, THE_WORDS)
  await say(THE_LIVE, 'I am still running, so I am still on the contact list.')

  // A group holding the retired agent AND a living one, so the groups half has a control: a group
  // with no faces at all cannot pass the assertion below.
  const opened = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      name: THE_GROUP,
      because: 'so the groups list has a group holding an agent that is later retired',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'the person opened it' },
        { who: { kind: 'agent', id: THE_RETIRED }, because: 'it was doing the work' },
        { who: { kind: 'agent', id: THE_LIVE }, because: 'it is still doing the work' },
      ],
    }),
  })
  expect(opened.status, await opened.clone().text()).toBe(201)

  const retired = await fetch(`${app.api}/api/participants/agent/${THE_RETIRED}/retire`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ because: 'a test agent, closed' }),
  })
  expect(retired.status, await retired.clone().text()).toBe(200)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

/** Open the panel on the list of contacts, whatever was open last time. */
async function openThePanel(): Promise<void> {
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  if ((await app.page.$('.px-chat')) === null) {
    await app.page.waitForSelector('.px-chat-circle', { timeout: 20_000 })
    await app.page.click('.px-chat-circle')
  }
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="contacts"]', { timeout: 20_000 })
  await app.page.waitForSelector('.px-chat-top-group[data-side="agent"]', { timeout: 20_000 })
}

/** True where one of these drawn names is the retired agent's, whatever follows the name. */
function namesAtlas(drawn: readonly string[]): boolean {
  return drawn.some((one) => one.startsWith('Atlas'))
}

describe('criterion M121 on the chat page', () => {
  it('puts the retired agent in the retired group, folded by default, and still opens its conversation', async () => {
    await openThePanel()

    // ------------------------------------------------- the group exists, and is folded by default
    const retiredGroup = await app.page.$('.px-chat-group-of[data-group="retired"]')
    expect(retiredGroup, 'the retired group is not drawn at all').not.toBeNull()
    const folded = await app.page.$eval('.px-chat-group-of[data-group="retired"] .px-chat-fold', (one) =>
      one.getAttribute('aria-expanded'),
    )
    expect(folded, 'the retired group is not folded by default').toBe('false')
    const hidden = await app.page.$$eval('.px-chat-group-of[data-group="retired"] .px-chat-name', (all) =>
      all.map((one) => one.textContent ?? ''),
    )
    /*
     * A ROW IS FOUND BY WHAT ITS NAME STARTS WITH, NOT BY THE WHOLE NAME. Criterion I4 (wave 4,
     * 23 September 2026) draws a retired agent with its retirement date, so this row now reads
     * "Atlas — retired <date>" where it used to read "Atlas".
     *
     * THE FOLDED CHECK WOULD OTHERWISE STOP CHECKING ANYTHING. `not.toContain('Atlas')` asks for an
     * exact name, so once the date is beside the name it passes whether the folded group draws its
     * agents or not. Reading the start of the name keeps it a real check.
     */
    expect(namesAtlas(hidden), 'a retired agent is drawn while its group is folded').toBe(false)

    // ---------------------------------------------------------------- and it opens to show Atlas
    await app.page.click('.px-chat-group-of[data-group="retired"] .px-chat-fold')
    await app.page.waitForSelector('.px-chat-group-of[data-group="retired"] .px-chat-contact', { timeout: 20_000 })
    const shown = await app.page.$$eval('.px-chat-group-of[data-group="retired"] .px-chat-name', (all) =>
      all.map((one) => one.textContent ?? ''),
    )
    expect(namesAtlas(shown), 'the retired agent is not in the group it should sit in').toBe(true)
    // AND IT CARRIES ITS RETIREMENT DATE, criterion I4: a live agent may bear the same name, and
    // the date is what tells the two apart.
    expect(
      shown.find((one) => one.startsWith('Atlas')),
      'the retired agent is drawn with no retirement date beside its name',
    ).toMatch(/retired /)

    // A LIVE AGENT IS STILL WHERE IT WAS, so the retired one was not drawn in place of everybody.
    const liveNames = await app.page.$$eval('.px-chat-group-of[data-group="worker"] .px-chat-name', (all) =>
      all.map((one) => one.textContent ?? ''),
    )
    expect(liveNames, 'the live agent is no longer a contact').toContain('Bruno')

    // ---------------------------------------------------------------- the groups (M11) faces
    await app.page.click('.px-chat-tab[data-tab="groups"]')
    await app.page.waitForSelector('.px-chat-under-tabs[data-showing="groups"]', { timeout: 20_000 })
    const faces = await app.page.$$eval('.px-chat-contact .px-chat-faces img', (all) =>
      all.map((one) => one.getAttribute('alt') ?? ''),
    )
    expect(faces.some((one) => one.startsWith('Bruno')), 'the control: a live member is still drawn').toBe(true)
    expect(faces.some((one) => one.startsWith('Atlas')), 'a retired member is drawn in the group faces').toBe(false)

    // ------------------------------------------- the conversation, readable by address
    // THE CHAT KEYS A CONVERSATION BY THE AGENT'S REGISTRY ID, which is not its handle.
    const registry = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })).json()) as {
      agents: { id: string; handle: string }[]
    }
    const retiredId = registry.agents.find((one) => one.handle === THE_RETIRED)?.id
    expect(retiredId, 'the registry does not list the retired agent').toBeDefined()
    await app.page.evaluate((key) => localStorage.setItem('mole-office.chat.with', key), `agent:${String(retiredId)}`)
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    if ((await app.page.$('.px-chat')) === null) {
      await app.page.waitForSelector('.px-chat-circle', { timeout: 20_000 })
      await app.page.click('.px-chat-circle')
    }
    await app.page.waitForSelector('.px-chat-box', { timeout: 20_000 })
    expect(await app.page.textContent('body'), 'the words in it are records and do not vanish').toContain(THE_WORDS)

    // AND THE ADDRESS ITSELF STILL ANSWERS, whatever the browser remembered.
    const talk = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=${THE_RETIRED}`, {
      headers: AS_THE_PERSON,
    })
    expect(talk.status, await talk.clone().text()).toBe(200)
    expect(await talk.text()).toContain(THE_WORDS)
  }, 150_000)
})
