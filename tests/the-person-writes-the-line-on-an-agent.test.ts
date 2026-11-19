// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER MAY WRITE OR CLEAR THE LINE ON AN AGENT, AND THE LINE SAYS WHO WROTE IT.
 *
 * Decision `lUh6uis7oB6z`: yes, the owner keeps the power to set it, but it is a mark like
 * reporting or working, not offline or online. Criterion M21 of design/messages/ACCEPTANCE.md
 * section 9; problem `FpKzIFjH5Gzi`.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE THINGS THAT HAVE TO BE TRUE AT ONCE
 * ---------------------------------------------------------------------------------------
 *
 * 1. The owner may write it, and clear it.
 * 2. The line names the owner as its writer, so nobody reads the owner's line as the agent's.
 * 3. The agent may still write its own.
 *
 * A build that gave the owner the power and dropped who did it would pass 1 and 3 and would have put the
 * owner's words in an agent's mouth on every screen that draws a state. So every case here asserts
 * the attribution beside the line, not only the line.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The first case writes the line as the agent and reads it back, so a server that stored nothing at
 * all would fail before any "the owner may write it" assertion is reached.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

interface OneParticipant {
  id: string
  name: string
  state: string | null
  stateAt: string | null
  stateBy?: { kind: string; id: string } | null
}

async function readTheAgent(handle: string): Promise<OneParticipant> {
  const got = await fetch(`${app.api}/api/participants/agent/${handle}`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return ((await got.json()) as { participant: OneParticipant }).participant
}

async function writeTheLine(
  handle: string,
  line: string,
  headers: Record<string, string>,
): Promise<Response> {
  return fetch(`${app.api}/api/participants/agent/${handle}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ state: line }),
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-owners-hand-on-a-line', viewport: { width: 1440, height: 1000 } })
  for (const [handle, name] of [
    ['builder-line', 'Builder Line'],
    ['other-agent', 'Another Agent'],
  ]) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        kind: 'agent',
        title: name,
        data: { handle, runtime: 'claude-code', state: 'active' },
      }),
    })
    expect(filed.status, await filed.text()).toBe(201)
  }
  // ONE MESSAGE EACH WAY, so the agent is a contact the panel draws.
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: asAgent('builder-line'),
    body: JSON.stringify({
      kind: 'message',
      title: 'from the builder',
      data: { body: 'The rig is on the bench.', to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.text()).toBe(201)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('an agent still writes its own line', () => {
  it('stores it, keeps the moment, and says the agent wrote it', async () => {
    expect((await writeTheLine('builder-line', 'fitting the wrist camera', asAgent('builder-line'))).status).toBe(200)
    const held = await readTheAgent('builder-line')
    expect(held.state).toBe('fitting the wrist camera')
    expect(held.stateAt).not.toBeNull()
    // THE WRITER IS STORED BY REGISTRY ID, and a new agent's id is minted, so it is not its handle.
    expect(held.stateBy).toEqual({ kind: 'agent', id: held.id })
  }, 120_000)
})

describe('the owner writes the line, and it says they did', () => {
  it('takes the owner\'s words and names the owner beside them', async () => {
    expect((await writeTheLine('builder-line', 'holding the bench for me', AS_THE_OWNER)).status).toBe(200)
    const held = await readTheAgent('builder-line')
    expect(held.state).toBe('holding the bench for me')
    expect(held.stateBy, 'the owner\'s words were stored with nobody named as their writer').toEqual({
      kind: 'person',
      id: THE_PERSON,
    })
  }, 120_000)

  it('clears the line and who wrote it together', async () => {
    expect((await writeTheLine('builder-line', 'holding the bench for me', AS_THE_OWNER)).status).toBe(200)
    expect((await writeTheLine('builder-line', '', AS_THE_OWNER)).status).toBe(200)
    const held = await readTheAgent('builder-line')
    expect(held.state).toBeNull()
    expect(held.stateAt).toBeNull()
    expect(held.stateBy, 'the line went and the name of whoever wrote it stayed').toBeNull()
  }, 120_000)

  it('lets the agent write over what the owner wrote, and the line then says the agent', async () => {
    expect((await writeTheLine('builder-line', 'holding the bench for me', AS_THE_OWNER)).status).toBe(200)
    expect((await writeTheLine('builder-line', 'back on the camera', asAgent('builder-line'))).status).toBe(200)
    const held = await readTheAgent('builder-line')
    expect(held.state).toBe('back on the camera')
    // THE WRITER IS STORED BY REGISTRY ID, and a new agent's id is minted, so it is not its handle.
    expect(held.stateBy).toEqual({ kind: 'agent', id: held.id })
  }, 120_000)
})

describe('what did not change', () => {
  it('refuses one agent writing on another, naming the rule', async () => {
    const refused = await writeTheLine('builder-line', 'busy, another agent decided', asAgent('other-agent'))
    expect(refused.status).toBe(403)
    expect(await refused.text()).toContain('no other')
  }, 120_000)

  it("refuses an agent writing a person's own line", async () => {
    const refused = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: asAgent('builder-line'),
      body: JSON.stringify({ state: 'busy, an agent decided' }),
    })
    expect(refused.status).toBe(403)
    expect(await refused.text()).toContain('theirs to write')
  }, 120_000)
})

describe('the owner does it from the panel', () => {
  it('writes the line in the conversation header and sees who set it', async () => {
    expect((await writeTheLine('builder-line', 'fitting the wrist camera', asAgent('builder-line'))).status).toBe(200)
    await app.page.goto(app.site)
    await waitForThePage(app.page, 30_000)
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
    if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
    await app.page.click('.px-chat-contact')
    await app.page.waitForSelector('.px-chat-them-state', { timeout: 20_000 })

    // THE CONTROL: the agent's own line is drawn, with nothing saying somebody else wrote it.
    expect(await app.page.textContent('.px-chat-them-state')).toContain('fitting the wrist camera')
    expect(await app.page.$('.px-chat-state-by')).toBeNull()

    await app.page.click('.px-chat-them-state')
    await app.page.waitForSelector('.px-chat-state-box', { timeout: 20_000 })
    await app.page.fill('.px-chat-state-box', 'holding the bench for me')
    await app.page.press('.px-chat-state-box', 'Enter')

    await app.page.waitForFunction(
      () => document.querySelector('.px-chat-state-by') !== null,
      undefined,
      { timeout: 20_000 },
    )
    expect(await app.page.textContent('.px-chat-them-state')).toContain('holding the bench for me')
    expect(await app.page.textContent('.px-chat-state-by')).toBe(CHAT_WORDS.lineSetBy(THE_TEST_OFFICES_OWNER.name))

    // AND IT IS STORED, not only drawn.
    const held = await readTheAgent('builder-line')
    expect(held.state).toBe('holding the bench for me')
    expect(held.stateBy).toEqual({ kind: 'person', id: THE_PERSON })
  }, 240_000)
})
