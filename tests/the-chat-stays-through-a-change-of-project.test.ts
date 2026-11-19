// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CHANGING PROJECT DOES NOT REBUILD THE APP, AND DOES NOT TOUCH THE CHAT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M61 of design/messages/ACCEPTANCE.md: switching to another project refreshed the
 * whole of Mole Office, the chat at the bottom right too, and the chat was not the same one, and any
 * words in the chat box were wiped.
 *
 * ---------------------------------------------------------------------------------------
 * THE CAUSE, MEASURED BEFORE ANY OF THIS WAS WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * Nothing reloaded the browser. `setWorkspace` in src/web/lib/workspace.ts navigates nowhere. What
 * happened is that `App` hung the whole shell off `key={workspaceKey(workspace)}`, so React threw
 * the entire tree away and built a new one — the chat panel with it. What came back came back from
 * localStorage: whether the panel was open, which conversation, and the panel's size. What did not
 * come back was `typed`, the composer's own state, which has no store behind it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS MEASURES, AND WHY IT IS A DOM IDENTITY AND NOT A SCREENSHOT
 * ---------------------------------------------------------------------------------------
 *
 * "The panel stays mounted" is a claim about the ELEMENT, not about what is drawn. A rebuilt panel
 * that happens to draw the same thing would pass every reading of its text. So a token is written
 * onto the element itself before the switch and read off it afterwards: React unmounting the panel
 * takes the element and the token with it, and no amount of redrawing puts a hand-written property
 * back. The same token is put on the shell's own element for the same reason.
 *
 * The composer's text is the other half and is what the owner actually lost.
 *
 * THE CONTROL is that the switch really happened: the project this browser stores is read back
 * afterwards, so a switcher that did nothing cannot make "the panel is still there" true for the
 * wrong reason.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'
import { switchTheProject } from './switch-the-project.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp

const OTHER = 'robotics'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** What the reader is in the middle of typing when the project changes under them. */
const HALF_WRITTEN = 'I was in the middle of writing this'

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

/** Which project this browser is reading, as the browser itself stores it. */
async function whichProject(): Promise<string | null> {
  return app.page.evaluate(() => window.localStorage.getItem('mole-office.workspace'))
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-through-a-switch', viewport: { width: 1440, height: 1000 } })

  const made = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ id: OTHER, title: 'Robotics' }),
  })
  expect(made.status, await made.text()).toBe(201)

  const agent = await write(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Mopsy',
    data: { handle: 'mopsy', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, await agent.text()).toBe(201)

  const said = await write(AS_THE_OWNER, {
    kind: 'message',
    title: 'Hello from Mopsy',
    data: { body: 'Something to open a conversation on.', to: [{ kind: 'agent', id: 'mopsy' }] },
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(said.status, await said.text()).toBe(409)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('switching project', () => {
  it('leaves the shell and the chat panel mounted, and keeps what was typed', async () => {
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)

    // ---- OPEN THE PANEL AND A CONVERSATION, then type without sending.
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
    await app.page.click('.px-chat-contact')
    await app.page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
    await app.page.fill('.px-chat-write textarea', HALF_WRITTEN)
    expect(await app.page.inputValue('.px-chat-write textarea')).toBe(HALF_WRITTEN)

    // ---- MARK THE TWO ELEMENTS. A property written onto a DOM node by hand is not something React
    // can put back: it survives a re-render of the same element and dies with an unmount.
    await app.page.evaluate(() => {
      const shell = document.querySelector('.shell')
      const panel = document.querySelector('.px-chat')
      if (shell === null || panel === null) throw new Error('the shell or the panel was not on screen')
      ;(shell as unknown as Record<string, string>)['__token'] = 'shell-before-the-switch'
      ;(panel as unknown as Record<string, string>)['__token'] = 'panel-before-the-switch'
    })

    // ---- SWITCH, THE WAY A READER DOES.
    await switchTheProject(app.page, OTHER)
    await app.page.waitForFunction(
      `window.localStorage.getItem('mole-office.workspace') === ${JSON.stringify(OTHER)}`,
      { timeout: 30_000 },
    )
    await waitForThePage(app.page, 60_000)

    // ---- THE CONTROL: the switch really happened.
    expect(await whichProject()).toBe(OTHER)

    // ---- THE REQUIREMENT.
    const after = await app.page.evaluate(() => {
      const shell = document.querySelector('.shell')
      const panel = document.querySelector('.px-chat')
      return {
        shellIsThere: shell !== null,
        panelIsThere: panel !== null,
        shellToken: shell === null ? null : ((shell as unknown as Record<string, string>)['__token'] ?? null),
        panelToken: panel === null ? null : ((panel as unknown as Record<string, string>)['__token'] ?? null),
      }
    })
    expect(after.shellIsThere, 'the shell was not on screen after the switch').toBe(true)
    expect(after.panelIsThere, 'the chat panel was not on screen after the switch').toBe(true)
    expect(after.shellToken, 'the shell was rebuilt: it is a different element').toBe('shell-before-the-switch')
    expect(after.panelToken, 'the chat panel was rebuilt: it is a different element').toBe('panel-before-the-switch')

    // ---- AND WHAT THE OWNER WAS TYPING IS STILL THERE.
    expect(await app.page.inputValue('.px-chat-write textarea')).toBe(HALF_WRITTEN)
  }, 120_000)
})
