// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CANNOT-REACH NOTICE, THE OFFER TO START AN AGENT, AND THE ONE NEW AGENT BUTTON.
 *
 * Criteria M115, M116 and M117 of design/messages/ACCEPTANCE.md:
 *
 *   - M115: the chat has one button, New agent, that starts a new agent from the page;
 *   - M116: a message sent when Mole Office cannot reach its agent still leaves the offer to start
 *     a new run, which had gone;
 *   - M117: a notice such as Cannot reach Throwaway 2 is a red-bordered box at the top of the chat,
 *     on the line between the agent and the messages, and not plain text under the input.
 *
 * WHAT IS PROVED HERE, in a real browser against a real server.
 *
 *   1. M117: with an agent nothing is answering as, the notice is drawn once, in the
 *      red-bordered box, at the boundary between the agent's header and the messages; it is not
 *      under the input, and the header does not repeat it as plain text. At 390 the header is
 *      still on the screen while the box is drawn.
 *   2. M116: a send to that agent leaves the offer to start a new agent, once, beside the notice;
 *      a send to an agent that is answering leaves none.
 *   3. M115: exactly one New agent button is drawn in the panel's own header, and pressing it
 *      opens the same chooser the right-click menu draws, listing the agents nothing is answering
 *      as.
 *   4. H3 and M125: when a session holds the handle and answers, the words drawn under the name
 *      are "Handle holding".
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH THE CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL (unmutated): the five cases below pass.
 *
 * MUTATION 1 — M117, drawn under the input. The notice block in src/web/components/Chat.tsx was
 * moved back to after the composer. The first case, which reads the box before the composer and
 * before the message list, went red. The 390 case stayed green, because the notice is still on
 * the screen; only its place changed.
 *
 * MUTATION 2 — M116, the offer dropped. The `<StartANewAgent ... where="the conversation" />`
 * was removed from the notice. The second case's unreachable half went red on the count of one;
 * the reachable half stayed green, because it asks for the absence.
 *
 * MUTATION 3 — M115, the button gone. The `.px-chat-new-agent` button was removed from the
 * panel's chrome. The third case went red on the count of one.
 *
 * MUTATION 4 — H3/M125, the old words back. In src/shared/messages.ts the `a live session` phrase
 * was written back as "Answering here now". The H3 case, which reads the drawn words, went red;
 * the four M115-M117 cases stayed green. The change was put back.
 *
 * Each change was put back and the control run again, all five green.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { theResizeIsDrawn, fakeTranscript, liveApp, waitForThePage, type LiveApp, thePersonsKeyHeader } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CANNOT_REACH_WORDS, CHAT_WORDS } from '../src/shared/messages.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

/** The agent nothing is answering as, named after the example in M117, and one that is answering. */
const UNREACHABLE = 'throwaway-2'
const UNREACHABLE_NAME = 'Throwaway 2'
const REACHABLE = 'steady-one'
const REACHABLE_NAME = 'Steady One'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Register an agent through the plain records door. */
async function anAgent(handle: string, title: string): Promise<void> {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
}

/** One line the person writes to an agent. To the unreachable one this stays queued and answers the unheld 409. */
async function thePersonSays(to: string, body: string, status = 201): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'message',
      title: body.slice(0, 30),
      data: { body, to: [{ kind: 'agent', id: to }] },
    }),
  })
  expect(said.status, await said.clone().text()).toBe(status)
}

/**
 * Make one agent answer: a running run whose transcript grew just now, with a hold taken on it.
 *
 * This is the same shape tests/the-chats-presence-mark-is-true.test.ts builds, driven through the
 * HTTP doors a real server serves rather than through the library functions that test uses. The
 * file's own modification time is inside the hold's lapse window, so `theSessionBehindTheHold`
 * answers.
 */
async function anAgentThatAnswers(agentId: string): Promise<void> {
  const log = fakeTranscript(agentId)
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
    body: JSON.stringify({
      kind: 'session',
      title: `A run of ${agentId}`,
      data: {
        state: 'running',
        runtime: 'claude-code',
        servingAgent: agentId,
        ranAs: [{ workspaceId: 'default', agentId }],
        extra: {
          discovered: {
            tool: 'claude-code',
            externalId: agentId,
            logPath: log,
            resumeCommand: null,
            startedAt: null,
            entryPoint: null,
          },
        },
      },
    }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  const session = ((await made.json()) as { record: { id: string } }).record.id
  // THE HOLD IS ASKED AS THE WAITER ASKS IT: under the agent's own handle, with the office's key, which is what
  // tools/hold-the-handle.mjs sends for an agent that holds no key of its own. The hold door refuses a request a
  // listener carried with no key (keys wave piece 7). The key is read from this test office's key file and never printed.
  const theOfficesKey = (JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { office: string }).office
  const held = await fetch(`${app.api}/api/handles/${agentId}/hold`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': agentId,
      'x-mole-office-key': theOfficesKey,
    },
    body: JSON.stringify({ session, machine: 'a-machine', runtime: 'claude-code' }),
  })
  expect(held.status, await held.clone().text()).toBe(201)
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-reach', viewport: { width: 1440, height: 1000 } })
  await anAgent(UNREACHABLE, UNREACHABLE_NAME)
  await anAgent(REACHABLE, REACHABLE_NAME)
  await anAgentThatAnswers(REACHABLE)
  // ONE MESSAGE WAITING FOR THE UNREACHABLE AGENT, so the press that starts one has something to
  // start it for and the chooser has an agent to list.
  // THE UNHELD 409 (decision 60sbc5I-bwKx); the letter is still queued for the agent, which is what this fixture needs.
  await thePersonSays(UNREACHABLE, 'Can you read the loquat logs for me?', 409)
  // AND ONE CONVERSATION WITH THE AGENT THAT ANSWERS, so it has a contact row to open. Its message
  // reaches the run, so this one is not queued and the chooser does not offer it.
  await thePersonSays(REACHABLE, 'Are you answering?')
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

beforeEach(async () => {
  // THE 390 CASE CHANGES THE WINDOW, so every case starts at the size the others measure at.
  await app.page.setViewportSize({ width: 1440, height: 1000 })
})

/** Open the panel, whatever was open last time, and come back to the contacts. */
async function openTheContacts(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  // DESIGN D (wave 13y) DRAWS THE CIRCLE ONLY WHILE A MESSAGE WAITS, so the chat is opened the way the page offers it.
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
}

/** Press the contact row drawn under one name and wait for its conversation. */
async function openTheConversationWith(name: string): Promise<void> {
  await openTheContacts()
  const rows = await app.page.$$('.px-chat-contact')
  for (const row of rows) {
    const said = await row.evaluate((el) => el.textContent ?? '')
    if (said.includes(name)) {
      await row.click()
      await app.page.waitForSelector('.px-chat-write textarea', { timeout: 20_000 })
      return
    }
  }
  throw new Error(`no contact row named ${name}`)
}

/** Send one line through the composer, the way a person does. */
async function sendThroughTheComposer(body: string): Promise<void> {
  await app.page.fill('.px-chat-write textarea', body)
  await app.page.click('.px-chat-write .px-chat-send')
}

describe('criterion M117: the cannot-reach notice at the top, in its box', () => {
  it('draws it once, between the header and the messages, and not under the input', async () => {
    await openTheConversationWith(UNREACHABLE_NAME)
    await app.page.waitForSelector('.px-chat-cannot-reach', { timeout: 20_000 })

    const shape = await app.page.evaluate(() => {
      const box = document.querySelector('.px-chat-cannot-reach')
      const header = document.querySelector('.px-chat-them')
      const list = document.querySelector('.px-chat-said')
      const composer = document.querySelector('.px-chat-write')
      if (box === null || header === null || list === null || composer === null) return null
      const before = (a: Node, b: Node): boolean =>
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
      return {
        count: document.querySelectorAll('.px-chat-cannot-reach').length,
        headerBeforeBox: before(header, box),
        boxBeforeList: before(box, list),
        boxBeforeComposer: before(box, composer),
        headerLabels: document.querySelectorAll('.px-chat-answering').length,
        text: box.textContent ?? '',
      }
    })
    expect(shape, 'the conversation did not draw its header, box or messages').not.toBeNull()
    expect(shape?.count, 'the notice is drawn more than once').toBe(1)
    expect(shape?.headerBeforeBox, 'the notice is above the header, not below it').toBe(true)
    expect(shape?.boxBeforeList, 'the notice is below the messages, not above them').toBe(true)
    expect(shape?.boxBeforeComposer, 'the notice is under the input again').toBe(true)
    expect(shape?.headerLabels, 'the header repeats the fact as plain text').toBe(0)
    expect(shape?.text).toContain(CANNOT_REACH_WORDS.cannotReach(UNREACHABLE_NAME))

    // AND THE PLAIN FORM IS GONE FROM THE WHOLE PANEL, not only from the header.
    const panel = (await app.page.textContent('.px-chat')) ?? ''
    expect(panel, 'the plain answering word still says nobody is answering').not.toContain(
      CHAT_WORDS.answeringNow.nobody,
    )
  }, 120_000)

  it('keeps the header on the screen at 390 while the box is drawn', async () => {
    await openTheConversationWith(UNREACHABLE_NAME)
    await app.page.waitForSelector('.px-chat-cannot-reach', { timeout: 20_000 })
    await app.page.setViewportSize({ width: 390, height: 844 })
    await theResizeIsDrawn(app.page)

    const shape = await app.page.evaluate(() => {
      const header = document.querySelector('.px-chat-them')
      const box = document.querySelector('.px-chat-cannot-reach')
      if (header === null || box === null) return null
      const h = header.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      return { headerTop: h.top, headerBottom: h.bottom, boxTop: b.top, viewport: window.innerHeight }
    })
    expect(shape, 'the header or the notice vanished at 390').not.toBeNull()
    expect(shape?.headerTop, 'the header was pushed off the top of the screen').toBeGreaterThanOrEqual(0)
    expect(shape?.headerBottom, 'the header was pushed off the bottom of the screen').toBeLessThanOrEqual(
      (shape?.viewport ?? 0) + 1,
    )
    expect(shape?.boxTop, 'the notice is not below the header').toBeGreaterThanOrEqual(shape?.headerTop ?? 0)
  }, 120_000)
})

describe('criterion M116: the offer comes back beside the notice', () => {
  it('offers to start an agent once after a send to an unreachable agent, and never for one that answers', async () => {
    // THE UNREACHABLE ONE. A line sent through the composer cannot be answered, and the offer is
    // drawn once beside the notice.
    await openTheConversationWith(UNREACHABLE_NAME)
    await sendThroughTheComposer('One more line for the agent that cannot answer.')
    await app.page.waitForSelector('.px-chat-cannot-reach', { timeout: 20_000 })
    expect(await app.page.$$('.px-chat-cannot-reach'), 'the notice is drawn more than once').toHaveLength(1)
    expect(
      await app.page.$$('.px-start-agent[data-where="the conversation"]'),
      'the unreachable agent was not offered a new agent to start',
    ).toHaveLength(1)

    // AND THE ONE THAT ANSWERS IS OFFERED NOTHING.
    await openTheConversationWith(REACHABLE_NAME)
    await sendThroughTheComposer('A line for the agent that is answering.')
    await app.page.waitForFunction(
      (words: string) => document.querySelector('.px-chat-said')?.textContent?.includes(words) === true,
      'A line for the agent that is answering.',
      { timeout: 20_000 },
    )
    expect(await app.page.$$('.px-chat-cannot-reach'), 'a reachable agent drew a cannot-reach notice').toHaveLength(0)
    expect(
      await app.page.$$('.px-start-agent[data-where="the conversation"]'),
      'a reachable agent was offered a new agent to start',
    ).toHaveLength(0)
  }, 150_000)
})

describe('criteria M115 and M122: one New agent press, beside the Agent heading', () => {
  it('is drawn once, beside Agent, with none in the panel header, and opens the chooser', async () => {
    await openTheContacts()

    // THE HEADER ONE IS GONE. Criterion M122 moved the press criterion M115 put in the panel's own
    // header row; the header keeps only the fill and close presses.
    expect(
      await app.page.$$('.px-chat-chrome .px-chat-new-agent'),
      'the panel header still draws a New agent press',
    ).toHaveLength(0)

    // EXACTLY ONE IN THE PANEL, BESIDE THE AGENT HEADING. Criterion M115's "exactly one" survives;
    // where it sits is what M122 changed.
    const buttons = await app.page.$$('.px-chat-top-group[data-side="agent"] .px-chat-top-heading .px-chat-new-agent')
    expect(buttons, 'the Agent heading does not carry exactly one New agent press').toHaveLength(1)
    expect(await app.page.$$('.px-chat-new-agent'), 'the press is drawn more than once in the panel').toHaveLength(1)
    expect((await buttons[0]?.textContent())?.trim()).toBe(CANNOT_REACH_WORDS.newAgent)

    await buttons[0]?.click()
    await app.page.waitForSelector('.px-chat-new-agent-ask', { timeout: 20_000 })
    await app.page.waitForSelector('.px-start-agent-here .px-start-agent', { timeout: 20_000 })

    const chooser = (await app.page.textContent('.px-chat-new-agent-ask')) ?? ''
    expect(chooser, 'the chooser does not list the agent nothing is answering as').toContain(UNREACHABLE_NAME)
    expect(chooser, 'the chooser lists an agent that is answering').not.toContain(REACHABLE_NAME)

    await app.page.click('.px-chat-new-agent-close')
    await app.page.waitForFunction(() => document.querySelector('.px-chat-new-agent-ask') === null, { timeout: 20_000 })
  }, 120_000)
})

describe('criterion H3: the words under the name when a session holds the handle', () => {
  it('draws "Handle holding", the person\'s words, for the session that answers', async () => {
    // The old phrase under the name for the answering state `a live session` — "Answering here now" — became "Handle
    // holding". Nothing about when it is drawn changed; only the words.
    await openTheConversationWith(REACHABLE_NAME)
    await app.page.waitForSelector('.px-chat-answering', { timeout: 20_000 })

    const drawn = await app.page.textContent('.px-chat-answering')
    expect(drawn?.trim(), 'the header does not draw the person\'s words for the session that answers').toBe(
      CHAT_WORDS.answeringNow['a live session'],
    )
    expect(drawn?.trim(), 'the header still draws the old words').toBe('Handle holding')
  }, 120_000)
})
