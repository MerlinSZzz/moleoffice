// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT DRAWS THE PRESENCE GET /api/presence ANSWERS, IN THE PROJECT THE PAGE IS READING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 26 September 2026 on a copy of the owner's office: with the chat panel open from load, main
 * drew the secretary's dot filled (online) and the branch drew it hollow, while the door said green. A dot is
 * worked out in one project (a run of an agent in a project makes it green there and not elsewhere),
 * and the page moved from Default to panelx a moment after it loaded. Main read the presence again
 * because the stream, reopened for the new project, announced the page opening; once presence was
 * announced only when it changed, nothing read it for the new project, and the page kept Default's
 * reading.
 *
 * WHAT THIS FILE PROVES, in a real browser against an office of its own:
 *   1. An agent green by the door in the second project, grey in Default: a page open on Default with
 *      the chat panel open from load, moved to the second project, draws that agent green, which is
 *      what the door answers there.
 *   2. It stays green after a presence change about another participant reaches the page, and the
 *      other participant's dot takes the reading the event carried, which is the door's. (Since
 *      27 September 2026 the other participant's change is in its words, not its colour: an open
 *      connection no longer makes an agent green, problem h1S1MLK-SQ1I.)
 *
 * RED ON THE TIP BEFORE THE FIX (3fa681b97): case 1 times out with the dot grey. MUTATION: in
 * Chat.tsx, the project-change effect not reading the presence (case 1 red).
 */

import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp, thePersonsKeyHeader, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { switchTheProject } from './switch-the-project.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'

let app: LiveApp
let agentId = ''
let otherId = ''
const SECOND = 'second-project'

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const inTheSecond = { ...OWNER, 'x-mole-office-workspace': SECOND }

async function post(headers: Record<string, string>, path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const said = (await res.json()) as Record<string, unknown>
  expect(res.status, JSON.stringify(said)).toBe(theAnswerToAWriteInATestOffice(headers, body))
  return said
}

/** What the door says one participant's dot is, in one project, as the person is told it. */
async function theDoorSays(project: string, id: string): Promise<string> {
  const res = await fetch(`${app.api}/api/presence`, { headers: { ...OWNER, 'x-mole-office-workspace': project } })
  const said = (await res.json()) as { presence: { who: { id: string }; colour: string }[] }
  return said.presence.find((one) => one.who.id === id)?.colour ?? 'none'
}

/** What the door says one participant's dot is called (its word), in one project, as the person is told it. */
async function theDoorsWord(project: string, id: string): Promise<string> {
  const res = await fetch(`${app.api}/api/presence`, { headers: { ...OWNER, 'x-mole-office-workspace': project } })
  const said = (await res.json()) as { presence: { who: { id: string }; word: string }[] }
  return said.presence.find((one) => one.who.id === id)?.word ?? 'none'
}

/** The word the chat draws on the dot beside one contact, as its accessible name. */
async function theWordBeside(name: string): Promise<string | null> {
  return app.page.evaluate((who) => {
    const row = [...document.querySelectorAll('.px-chat-contact')].find(
      (one) => one.querySelector('.px-chat-name')?.textContent === who,
    )
    return row?.querySelector('.px-chat-dot')?.getAttribute('aria-label') ?? null
  }, name)
}

/** The colour of the dot the chat draws beside one contact. */
async function theDotBeside(name: string): Promise<string | null> {
  return app.page.evaluate((who) => {
    const row = [...document.querySelectorAll('.px-chat-contact')].find(
      (one) => one.querySelector('.px-chat-name')?.textContent === who,
    )
    return row?.querySelector('.px-chat-dot')?.getAttribute('data-colour') ?? null
  }, name)
}

beforeAll(async () => {
  app = await liveApp({ name: 'presence-door', viewport: { width: 1440, height: 1000 } })
  await post(OWNER, '/api/workspaces', { id: SECOND, title: 'Second project' })
  for (const [handle, title] of [
    ['dot-agent', 'Dot Agent'],
    ['other-dot', 'Other Dot'],
  ]) {
    await post(OWNER, '/api/records', { kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } })
  }
  const registry = (await (await fetch(`${app.api}/api/participants`, { headers: OWNER })).json()) as { agents: { id: string; handle: string }[] }
  agentId = registry.agents.find((one) => one.handle === 'dot-agent')?.id ?? ''
  otherId = registry.agents.find((one) => one.handle === 'other-dot')?.id ?? ''
  // BOTH ARE CONTACTS OF THE OWNER'S: the owner has written to each.
  for (const id of [agentId, otherId]) {
    await post(OWNER, '/api/records', { kind: 'message', title: 'hello', data: { body: 'Hello.', to: [{ kind: 'agent', id }] } })
  }
  // A RUN GOING FOR DOT AGENT IN THE SECOND PROJECT, with this test's own process as its live process
  // row: green there, and only there. (Since 27 September 2026 output written down alone no longer
  // makes an agent green, problem h1S1MLK-SQ1I; a run going does.)
  const run = await post({ ...inTheSecond, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) }, '/api/records', {
    kind: 'session',
    title: 'a run serving dot-agent',
    data: { state: 'running', runtime: 'claude-code', servingAgent: agentId, ranAs: [{ workspaceId: SECOND, agentId }], lastOutputAt: localStamp(new Date()) },
  })
  await post(inTheSecond, '/api/resources', {
    type: 'process',
    key: String(process.pid),
    sessionRecordId: (run['record'] as { id: string }).id,
    detail: 'this test process, as the run of dot-agent',
    adopting: 'this test process started before the session the test filed for it',
  })
  expect(await theDoorSays(SECOND, agentId), 'the fixture: the door says green in the second project').toBe('green')
  expect(await theDoorSays('default', agentId), 'the fixture: the door says grey in Default').toBe('grey')
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the chat draws the presence the door answers', () => {
  it('draws the door’s reading for the project the page moved to, with the panel open from load', async () => {
    await app.page.addInitScript(() => {
      window.localStorage.setItem('mole-office.chat.open', 'yes')
      window.localStorage.setItem('mole-office.chat.with', '')
    })
    await app.page.goto(`${app.site}/#/`)
    await waitForThePage(app.page, 60_000)
    await app.page.waitForSelector('.px-chat-contact', { timeout: 30_000 })
    await switchTheProject(app.page, SECOND)
    await app.page.waitForFunction(
      (name) =>
        [...document.querySelectorAll('.px-chat-contact')]
          .find((one) => one.querySelector('.px-chat-name')?.textContent === name)
          ?.querySelector('.px-chat-dot')
          ?.getAttribute('data-colour') === 'green',
      'Dot Agent',
      { timeout: 15_000 },
    ).catch(() => undefined)
    expect(await theDotBeside('Dot Agent'), 'the dot is not what the door answers in the second project').toBe(await theDoorSays(SECOND, agentId))
  }, 120_000)

  it('stays the door’s after a presence change about somebody else', async () => {
    // ANOTHER AGENT OPENS A STREAM, which is a held connection. Since 27 September 2026 that does not
    // make it green (problem h1S1MLK-SQ1I: nothing is answering as it), but it changes what its dot
    // says, from Inactive to Offline with the connection named, and the pages that draw it are told
    // with the reading.
    const before = await theDotBeside('Other Dot')
    expect(before).toBe(await theDoorSays(SECOND, otherId))
    const wordBefore = await theDoorsWord(SECOND, otherId)
    const stop = new AbortController()
    const stream = await fetch(`${app.api}/api/events`, {
      headers: { ...inTheSecond, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'other-dot', accept: 'text/event-stream' },
      signal: stop.signal,
    })
    expect(stream.status).toBe(200)
    try {
      const word = await theDoorsWord(SECOND, otherId)
      expect(word, 'the fixture: a held connection changes what the other agent’s dot says').not.toBe(wordBefore)
      await app.page.waitForFunction(
        ({ name, said }) =>
          [...document.querySelectorAll('.px-chat-contact')]
            .find((one) => one.querySelector('.px-chat-name')?.textContent === name)
            ?.querySelector('.px-chat-dot')
            ?.getAttribute('aria-label') === said,
        { name: 'Other Dot', said: word },
        { timeout: 15_000 },
      ).catch(() => undefined)
      expect(await theWordBeside('Other Dot'), 'the other dot did not take the reading the event carried').toBe(word)
      expect(await theDotBeside('Other Dot')).toBe(await theDoorSays(SECOND, otherId))
      expect(await theDotBeside('Dot Agent'), 'a change about somebody else changed this dot').toBe(await theDoorSays(SECOND, agentId))
    } finally {
      stop.abort()
    }
  }, 120_000)
})
