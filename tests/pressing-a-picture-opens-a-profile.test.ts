// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PRESSING A PICTURE IN THE PANEL OPENS A PROFILE: THEIRS FROM A CONVERSATION, THE PERSON'S OWN FROM THE TABS.
 *
 * A person needs a way to learn about the people in their contacts, which is a profile. In a
 * conversation, pressing a picture opens that agent's record page; at the outermost view of the chat,
 * the person's own picture opens the settings, where they set their own profile. Criterion M36 of design/messages/ACCEPTANCE.md section 9e; problem
 * `WtRlugLdGyLi`.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THEIR PICTURE GOES CHANGED ON 6 SEPTEMBER, AND THE OWNER IS THE ONE WHO CHANGED IT
 * ---------------------------------------------------------------------------------------
 *
 * M36 sent it to the agent's RECORD page and this file measured that. That page was not a profile:
 * it was Everything / Reports and notes, and the picture, the name and the other details could not be
 * changed there. So criterion M51 replaced that half: their picture opens the profile
 * page at `#/who/<kind>/<id>`. The person's own picture at the outermost view still opens their settings —
 * that half of M36 did not change.
 *
 * THE RECORD PAGE IS STILL ASSERTED AGAINST, as the address the press must NOT reach. It is the
 * answer this press used to give, so a build that reverted the change would land there.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Where the browser ENDS UP, not what the markup says. A press wired to the wrong address, or to
 * nothing, looks the same in the DOM as one wired right; the address bar afterwards does not.
 *
 * THE TWO PRESSES ARE AT DIFFERENT DEPTHS OF THE SAME PANEL and a build could easily wire one and
 * not the other, so each has its own case and each asserts it did NOT reach the other's page.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The first case asserts the panel is on the tabs and the picture is a press before it presses, and
 * every case reads the address before and after. A page that was already at the settings would
 * otherwise pass "pressing the person's own picture opens the settings" without any press happening.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whoPath } from '../src/web/components/router.tsx'
import { openTheChat } from './open-the-chat.ts'

/**
 * The address the agent's profile lives at, from the one function that builds one.
 *
 * READ FROM THE PRODUCT AND NOT TYPED OUT, so renaming the address moves this test with it rather
 * than leaving it asserting a string nothing serves. The address holds the agent's registry id,
 * which the office gives it when it is registered, so it is built once that id is known.
 */
let WHERE_THE_AGENT_LIVES = ''

let app: LiveApp
let theRecord = ''
/** The registry id the office gave builder-face. It is not the handle. */
let theAgentId = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'builder-face',
}

async function openThePanel(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
}

/** The part of the address after the hash, which is where this app says what page it is on. */
function where(): string {
  return new URL(app.page.url()).hash
}

beforeAll(async () => {
  app = await liveApp({ name: 'picture-opens-profile', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Face',
      data: { handle: 'builder-face', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  theRecord = ((await filed.json()) as { record: { id: string } }).record.id
  const everyone = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await everyone.json()) as { agents: { id: string; handle: string }[] }).agents
  theAgentId = agents.find((one) => one.handle === 'builder-face')?.id ?? ''
  expect(theAgentId).not.toBe('')
  WHERE_THE_AGENT_LIVES = whoPath('agent', theAgentId)

  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_AGENT,
    body: JSON.stringify({
      kind: 'message',
      title: 'the last thing said',
      data: { body: 'The clamp holds at 11.8 N.', to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the registries say where the rest of an agent is', () => {
  it('names the agent record this project holds for it', async () => {
    const got = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
    expect(got.status, await got.clone().text()).toBe(200)
    const held = (await got.json()) as { agents: { id: string; record: string | null }[] }
    const one = held.agents.find((row) => row.id === theAgentId)
    expect(one, 'the agent is not in the registry at all').toBeDefined()
    expect(one?.record, 'the reply does not say which record answers for this agent').toBe(theRecord)
  }, 60_000)
})

describe('the person’s own picture, at the outermost view, opens their settings', () => {
  it('goes to the settings page and nowhere else', async () => {
    await openThePanel()
    // THE CONTROL: the panel is on the tabs, the picture is a press, and we are not already there.
    expect(await app.page.$$eval('.px-chat-tabs', (all) => all.length)).toBe(1)
    expect(where(), 'the browser is already on the settings page').not.toContain('settings')
    const face = await app.page.$('.px-chat-me .px-chat-face')
    expect(face, 'the person’s own picture is not something to press').not.toBeNull()

    await app.page.click('.px-chat-me .px-chat-face')
    await app.page.waitForFunction(() => window.location.hash.includes('settings'), undefined, { timeout: 20_000 })
    expect(where()).toContain('settings')
    // AND NOT AT A RECORD PAGE, which is the other press's answer.
    expect(where(), 'the person’s picture opened a record page').not.toContain('/r/')
  }, 120_000)
})

describe('their picture, inside the conversation, opens their profile page', () => {
  it('goes to the profile address and not to the record page or the settings', async () => {
    await openThePanel()
    await app.page.click(`.px-chat-contact[data-contact="agent:${theAgentId}"]`)
    await app.page.waitForSelector('.px-chat-them', { timeout: 20_000 })
    // THE CONTROL: we are inside the conversation, their picture is a press, and we are not there.
    const face = await app.page.$('.px-chat-them .px-chat-face')
    expect(face, 'their picture inside the conversation is not something to press').not.toBeNull()
    expect(where(), 'the browser is already on the profile page').not.toContain(WHERE_THE_AGENT_LIVES)

    await app.page.click('.px-chat-them .px-chat-face')
    await app.page.waitForFunction(
      (at: string) => window.location.hash.includes(at),
      WHERE_THE_AGENT_LIVES,
      { timeout: 20_000 },
    )
    expect(where(), 'their picture did not open their profile page').toContain(WHERE_THE_AGENT_LIVES)
    // AND NOT WHERE IT USED TO GO. The record page is the answer M36 gave; a build that reverted
    // criterion M51 would land there, and this is what says so.
    expect(where(), 'their picture opened the record page, which is where it went before M51').not.toContain(
      theRecord,
    )
    expect(where(), 'their picture opened the settings page').not.toContain('settings')
  }, 120_000)

  it('draws the profile that address names, rather than a page that could not find it', async () => {
    await app.page.waitForSelector('.prof-name', { timeout: 20_000 })
    const name = await app.page.$eval('.prof-name', (el) => el.textContent ?? '')
    expect(name, 'the profile page did not draw the agent whose picture was pressed').toBe('Builder Face')
  }, 60_000)

  it('opens a page for a participant this project holds no record for', async () => {
    // A REGISTRY ROW WITH NO RECORD HERE. Mole Office itself is one: it is registered so that its
    // lines have a sender, and nobody filed an agent record for it. Under M36 there was no press
    // at all for a row like this, because the only address it could build was a record address.
    const got = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
    const held = (await got.json()) as { agents: { id: string; handle: string; record: string | null }[] }
    const office = held.agents.find((row) => row.handle === 'mole-office')
    expect(office, 'Mole Office is not registered, so nothing below is measured').toBeDefined()
    expect(office?.record, 'Mole Office has a record after all, so this case measures nothing').toBeNull()

    await app.page.goto(`${app.site}/#${whoPath('agent', office!.id)}`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.prof-name', { timeout: 20_000 })
    const name = await app.page.$eval('.prof-name', (el) => el.textContent ?? '')
    expect(name, 'a registry row with no record in this project has no profile page').not.toBe('')
  }, 120_000)
})
