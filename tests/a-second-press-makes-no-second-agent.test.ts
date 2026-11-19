// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECOND PRESS OF START A NEW AGENT, BEFORE THE NEW AGENT HAS ANSWERED, MAKES NO SECOND AGENT.
 * Problem T6e9AVCcZyhb: after the press, the chat follows to the new agent's conversation. Nothing
 * answers as that agent until the message worker starts its run, so the conversation said Cannot
 * reach and offered the press again, and a second press made a second agent.
 *
 * WHAT IS PROVED HERE, in a real browser against a real server. No message worker runs, so the new
 * agent stays unanswered for as long as the case needs.
 *
 *   1. After the press, the new agent's conversation says it was made on this page and that nothing
 *      is answering as it yet. It draws no press at all: the message the first press carried is
 *      already pressed, and the line Mole Office wrote there needs no run, so the server says a press
 *      would carry nothing (problem hqbovBMnTu-z). No third agent is made. Wave 13q's round 38 changed
 *      this case, by the secretary's coordination: it expected a held press, which was drawn only because the
 *      server counted Mole Office's own line as waiting (tests/a-second-press-after-a-reload-makes-no-second-agent).
 *   2. The right-click menu draws no press for the new agent either. Opening the menu makes no
 *      per-agent carry reads; the server's own reading still says the new agent would carry nothing.
 *   3. Once the conversation reads somebody answering as the new agent, the page lets it go: when
 *      nobody answers again, the conversation says Cannot reach, and still draws no press, because
 *      nothing waits for one.
 *
 * MUTATIONS (after a green control), each alone:
 *   a. in src/web/components/StartANewAgent.tsx, `press`, the line that remembers the handle of the
 *      agent a press made removed: case 1 goes red on the banner's words;
 *   b. in src/web/components/Chat.tsx, the call of `letThePressGoFor` removed: case 3 goes red on the
 *      banner's words;
 *   c. in src/web/components/StartANewAgent.tsx, ask the carry reading for every candidate again:
 *      case 2 goes red, because opening the menu must not make those reads.
 *
 * PHOTOGRAPHS, when NEW_AGENT_HELD_SHOTS names a folder: a new conversation, with its banner and no
 * press, at 1440, 990, 660 and 390, light and dark, in English and in Chinese, and at 1440 in the test
 * language. A reload
 * empties the page's memory of the agents it made, so each look and each language presses for an
 * agent of its own, and the widths are changed without a reload.
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fakeTranscript, liveApp, waitForThePage, type LiveApp, thePersonsKeyHeader } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CANNOT_REACH_WORDS } from '../src/shared/messages.ts'
import { en } from '../src/shared/words/en.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let heron = ''
let made: { id: string; handle: string; name: string } | undefined

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function theAgents(): Promise<{ id: string; handle: string; name: string }[]> {
  const res = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  return ((await res.json()) as { agents: { id: string; handle: string; name: string }[] }).agents
}

/** Open the chat panel and the conversation drawn under one name, without loading the page again. */
async function openTheConversationWith(name: string): Promise<void> {
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.waitForSelector('.px-chat-contact', { timeout: 30_000 })
  // THE LIST MAY STILL BE ARRIVING after a load, so the row is waited for by its words.
  await app.page.waitForFunction(
    (wanted) => [...document.querySelectorAll('.px-chat-contact')].some((el) => (el.textContent ?? '').includes(wanted)),
    name, { timeout: 30_000 },
  ).catch(() => undefined)
  for (const row of await app.page.$$('.px-chat-contact')) {
    const said = await row.evaluate((el) => el.querySelector('.px-chat-contact-name')?.textContent ?? el.textContent ?? '')
    if (said.trim() === name || said.includes(name) && !said.includes(`${name} (`)) {
      await row.click()
      await app.page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
      return
    }
  }
  throw new Error(`no contact row named ${name}`)
}

/** The office's key file names a key the hold door takes for an agent with no key of its own. Never printed. */
function theOfficesKey(): string {
  return (JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { office: string }).office
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-second-press', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Heron Mapper', data: { handle: 'heron-mapper', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  heron = (await theAgents()).find((one) => one.handle === 'heron-mapper')?.id ?? ''
  expect(heron).not.toBe('')
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'message', title: 'Map the north shore', data: { body: 'Map the north shore, please.', to: [{ kind: 'agent', id: heron }] } }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(said.status, await said.text()).toBe(409)
  await app.page.addInitScript(() => {
    if (localStorage.getItem('mole-office.preset.theme') === null) localStorage.setItem('mole-office.preset.theme', 'light')
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a second press before the new agent answers', () => {
  it('1: the new conversation says it was made here, and draws no press', async () => {
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await openTheConversationWith('Heron Mapper')
    await app.page.click('.px-start-agent[data-where="the conversation"]')
    await app.page.waitForSelector('.px-start-agent-ask', { timeout: 30_000 })
    await app.page.click('.px-start-agent-yes')
    await app.page.waitForFunction(() => document.querySelector('.px-start-agent-ask') === null, { timeout: 30_000 })

    made = (await theAgents()).find((one) => one.handle === 'heron-mapper-2')
    expect(made, 'the first press made heron-mapper-2').toBeDefined()
    // THE CHAT FOLLOWED TO IT, and nothing is answering as it: no worker runs here.
    await app.page.waitForFunction(
      (id) => window.localStorage.getItem('mole-office.chat.with')?.endsWith(`:${id}`) === true, made!.id, { timeout: 30_000 },
    )
    const words = app.page.locator('.px-chat-cannot-reach-words')
    await words.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await words.innerText()).toBe(en['newAgentKeys.madeHere'].replace('{who}', made!.name))
    // NO PRESS IS DRAWN, once the server's reading of what a press would carry has come back. Until it has,
    // the page draws the press held; it is then taken away.
    await app.page.waitForFunction(
      () => document.querySelectorAll('.px-start-agent[data-where="the conversation"]').length === 0, undefined, { timeout: 30_000 },
    ).catch(() => undefined)
    expect(await app.page.locator('.px-start-agent[data-where="the conversation"]').count(), 'the conversation drew a press').toBe(0)
    expect((await theAgents()).some((one) => one.handle === 'heron-mapper-2-2' || one.handle === 'heron-mapper-3'), 'a second agent was made').toBe(false)
  }, 180_000)

  it('2: the right-click menu makes no carry reads and draws no press for the new agent', async () => {
    // THE SERVER'S OWN READING for the new agent: a press would carry nothing.
    const reading = await fetch(`${app.api}/api/agents/${encodeURIComponent(made!.id)}/start-a-new-agent`, { headers: AS_THE_OWNER })
    expect(reading.status).toBe(200)
    expect(((await reading.json()) as { wouldCarry: boolean }).wouldCarry).toBe(false)
    await app.page.keyboard.press('Escape')
    // COUNT ALL CARRY READS from before the menu opens until two seconds after the carryable-agent reading.
    let asked = 0
    const countCarry = (request: { method(): string; url(): string }) => {
      if (request.method() === 'GET' && /\/api\/agents\/[^/]+\/start-a-new-agent(?:\?|$)/.test(request.url())) asked++
    }
    app.page.on('request', countCarry)
    const pool = app.page.waitForResponse((reply) => {
      const url = new URL(reply.url())
      return url.pathname === '/api/messages/carryable-agent-ids'
    }, { timeout: 30_000 })
    await app.page.click('body', { button: 'right' })
    await app.page.click('.px-talk-more-btn')
    await pool
    await app.page.waitForTimeout(2_000)
    if ((await app.page.$('.px-talk-more-line')) !== null) await app.page.click('.px-talk-more-line')
    await app.page.waitForTimeout(500)
    app.page.off('request', countCarry)
    expect(asked, 'opening the menu asks no carry readings').toBe(0)
    expect(
      await app.page.locator(`.px-start-agent[data-where="the right-click menu"][data-agent="${made!.id}"]`).count(),
      'the menu drew a press for the new agent',
    ).toBe(0)
    await app.page.keyboard.press('Escape')
    await app.page.waitForFunction(() => document.querySelector('.px-talk') === null, { timeout: 30_000 })
  }, 120_000)

  it('3: once somebody is read answering as it, the page lets it go, and nothing waits for a press', async () => {
    // A RUNNING SESSION WITH A HOLD ON THE NEW AGENT'S HANDLE, asked as tools/hold-the-handle.mjs asks it.
    const session = await fetch(`${app.api}/api/records`, {
      method: 'POST', headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
      body: JSON.stringify({
        kind: 'session', title: 'A session of heron-mapper-2',
        data: {
          state: 'running', runtime: 'claude-code', servingAgent: made!.handle,
          ranAs: [{ workspaceId: 'default', agentId: made!.id }],
          extra: { discovered: { tool: 'claude-code', externalId: 'heron-2', logPath: fakeTranscript('heron-2'), resumeCommand: null, startedAt: null, entryPoint: null } },
        },
      }),
    })
    expect(session.status, await session.clone().text()).toBe(201)
    const sessionId = ((await session.json()) as { record: { id: string } }).record.id
    const asTheAgent = {
      'content-type': 'application/json', 'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': made!.handle, 'x-mole-office-key': theOfficesKey(),
    }
    const held = await fetch(`${app.api}/api/handles/${made!.handle}/hold`, {
      method: 'POST', headers: asTheAgent, body: JSON.stringify({ session: sessionId, machine: 'a-machine', runtime: 'claude-code' }),
    })
    expect(held.status, await held.clone().text()).toBe(201)
    // THE CONVERSATION IS OPENED AGAIN, not the page loaded again, so the page keeps its memory.
    await openTheConversationWith(made!.name)
    await app.page.waitForFunction(() => document.querySelector('.px-chat-cannot-reach') === null, { timeout: 30_000 })

    // AND NOBODY ANSWERS AGAIN: the hold is released and the session is marked crashed.
    const released = await fetch(`${app.api}/api/handles/${made!.handle}/release`, {
      method: 'POST', headers: asTheAgent, body: JSON.stringify({ session: sessionId }),
    })
    expect(released.status, await released.clone().text()).toBeLessThan(300)
    // WRITTEN WITH THE OFFICE'S KEY: a run is not the person's to end by a patch.
    const ended = await fetch(`${app.api}/api/records/${sessionId}`, {
      method: 'PATCH',
      headers: { ...asTheAgent, 'x-mole-office-actor-id': 'mole-office/the-message-worker' },
      body: JSON.stringify({ dataPatch: { state: 'crashed' } }),
    })
    expect(ended.status, await ended.clone().text()).toBeLessThan(300)
    await openTheConversationWith(made!.name)
    const words = app.page.locator('.px-chat-cannot-reach-words')
    await words.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await words.innerText()).toBe(CANNOT_REACH_WORDS.cannotReach(made!.name))
    await app.page.waitForFunction(
      () => document.querySelectorAll('.px-start-agent[data-where="the conversation"]').length === 0, undefined, { timeout: 30_000 },
    ).catch(() => undefined)
    expect(await app.page.locator('.px-start-agent[data-where="the conversation"]').count(), 'the conversation drew a press').toBe(0)
  }, 180_000)
})

describe('photographs', () => {
  it.skipIf(!process.env['NEW_AGENT_HELD_SHOTS'])('photographs a new conversation with its banner and no press', async () => {
    const shots = process.env['NEW_AGENT_HELD_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const flows: { name: string; handle: string; theme: 'light' | 'dark'; query: string; widths: number[]; tag: string }[] = [
      { name: 'Ibis Surveyor', handle: 'ibis-surveyor', theme: 'light', query: '', widths: [1440, 990, 660, 390], tag: 'light' },
      { name: 'Crane Plotter', handle: 'crane-plotter', theme: 'dark', query: '', widths: [1440, 990, 660, 390], tag: 'dark' },
      { name: 'Egret Tracer', handle: 'egret-tracer', theme: 'light', query: '?lang=zh', widths: [1440, 990, 660, 390], tag: 'zh-light' },
      { name: 'Ibis Charter', handle: 'ibis-charter', theme: 'dark', query: '?lang=zh', widths: [1440, 990, 660, 390], tag: 'zh-dark' },
      { name: 'Stork Charter', handle: 'stork-charter', theme: 'light', query: '?lang=xx', widths: [1440], tag: 'xx' },
    ]
    for (const flow of flows) {
      const filed = await fetch(`${app.api}/api/records`, {
        method: 'POST', headers: AS_THE_OWNER,
        body: JSON.stringify({ kind: 'agent', title: flow.name, data: { handle: flow.handle, runtime: 'claude-code', state: 'active' } }),
      })
      expect(filed.status).toBe(201)
      const id = (await theAgents()).find((one) => one.handle === flow.handle)?.id ?? ''
      const said = await fetch(`${app.api}/api/records`, {
        method: 'POST', headers: AS_THE_OWNER,
        body: JSON.stringify({ kind: 'message', title: 'Chart the bay', data: { body: 'Chart the bay, please.', to: [{ kind: 'agent', id }] } }),
      })
      expect(said.status).toBe(201)
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), flow.theme)
      await app.page.goto(`${app.site}/${flow.query}#/records`, { timeout: 60_000 })
      // A GOTO THAT CHANGES ONLY THE HASH LOADS NOTHING, so the page is loaded again to take the look.
      await app.page.reload({ timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      await openTheConversationWith(flow.name)
      await app.page.click('.px-start-agent[data-where="the conversation"]')
      await app.page.click('.px-start-agent-yes')
      await app.page.waitForFunction(() => document.querySelector('.px-start-agent-ask') === null, { timeout: 30_000 })
      await app.page.locator('.px-chat-cannot-reach-words').waitFor({ state: 'visible', timeout: 30_000 })
      await app.page.waitForFunction(
        () => document.querySelectorAll('.px-start-agent[data-where="the conversation"]').length === 0, undefined, { timeout: 30_000 },
      )
      for (const width of flow.widths) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.waitForTimeout(400)
        await app.page.locator('.px-chat').first().screenshot({ path: join(shots, `new-conversation-${String(width)}-${flow.tag}.png`) })
      }
    }
  }, 600_000)
})
