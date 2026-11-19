// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT DRAWS NO CANNOT-REACH NOTICE FOR A SUPERVISOR AFTER ITS RUN'S WAIT, AND DRAWS IT FOR A WORKER.
 *
 * By the owner's decision on criterion M78, a message to a secretary or a supervisor picks up its own
 * conversation after its run's wait as well as during it; a worker is not resumed. The chat
 * draws Cannot reach only when nothing will answer as the agent, so for a supervisor past its wait it draws
 * none, and for a worker past its wait it draws the notice as before.
 *
 * WHAT IS PROVED HERE, in a real browser against a real server.
 *
 *   1. A supervisor whose run's wait has ended: no Cannot reach notice and no Start press, and the
 *      header says its conversation is kept, with the whole sentence as the hover text.
 *   2. A worker whose run's wait has ended: the Cannot reach notice, with the Start press.
 *
 * THE RUNS ARE FILED DIRECTLY, with the fields the worker writes on a run that has answered: the
 * agent it served, the message it delivered, its tool's conversation id, and the time its wait ends,
 * here a minute ago. No worker runs here, so nothing else changes the reading.
 *
 * THE PHOTOGRAPHS. When `PHOTOGRAPH_THE_CHAT_INTO` names a folder, each case photographs the chat at
 * 1440, 990, 660 and 390 pixels wide, in light and dark (chapter 6, rule 1). Without it nothing is
 * written.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { liveApp, waitForThePage, type LiveApp, thePersonsKeyHeader, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { openTheChatBeside } from './open-the-chat.ts'
import { whoIsAnsweringSays } from '../src/shared/handles.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CANNOT_REACH_WORDS, CHAT_WORDS } from '../src/shared/messages.ts'
import { THE_SUPERVISOR, THE_WORKER } from '../src/shared/roles.ts'
import { localStamp } from '../src/shared/time.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const SUPERVISOR = { id: 'kept-supervisor', name: 'Kept Supervisor', card: THE_SUPERVISOR }
const WORKER = { id: 'ended-worker', name: 'Ended Worker', card: THE_WORKER }

const PHOTOGRAPHS = process.env['PHOTOGRAPH_THE_CHAT_INTO'] ?? ''

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  // A SESSION FOR AN AGENT IS FILED WITH THE PERSON'S KEY: a claim to be the person with no key may not file one.
  const asking = (body as { kind?: string }).kind === 'session' ? { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) } : AS_THE_OWNER
  const made = await fetch(`${app.api}${path}`, { method: 'POST', headers: asking, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(theAnswerToAWriteInATestOffice(asking, body))
  return (await made.json()) as { record: { id: string } }
}

/** An agent holding one card, one message to it, and the run that answered it, whose wait ended a minute ago. */
async function anAgentWhoseWaitHasEnded(agent: { id: string; name: string; card: string }, n: number): Promise<void> {
  await post('/api/records', { kind: 'agent', title: agent.name, data: { handle: agent.id, runtime: 'claude-code', state: 'active', role: agent.card } })
  const said = await post('/api/records', {
    kind: 'message',
    title: 'A first line',
    data: { body: `A first line for ${agent.name}.`, to: [{ kind: 'agent', id: agent.id }] },
  })
  // ITS STATE STAYS `running` because a finished session must first seal a work area, which this test
  // has no use for. No process is registered for it, so nothing reads it as a run that is going.
  await post('/api/records', {
    kind: 'session',
    title: `${agent.id} answering a message`,
    data: {
      state: 'running',
      runtime: 'claude-code',
      startedByMoleOffice: true,
      servingAgent: agent.id,
      deliveringMessage: said.record.id,
      providerSession: `6f1c1d2e-0000-4000-8000-00000000000${String(n)}`,
      waitsUntil: localStamp(new Date(Date.now() - 60_000)),
    },
  })
}

/** Open the panel at the contacts, then the conversation drawn under one name. */
async function openTheConversationWith(name: string): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  await openTheChatBeside(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
  for (const row of await app.page.$$('.px-chat-contact')) {
    if (((await row.textContent()) ?? '').includes(name)) {
      await row.click()
      await app.page.waitForSelector('.px-chat-write textarea', { timeout: 20_000 })
      return
    }
  }
  throw new Error(`no contact row named ${name}`)
}

async function banners(): Promise<number> {
  return (await app.page.$$('.px-chat-cannot-reach')).length
}

/** The chat at four widths in both themes, when a folder is named; then back to 1440 and light. */
async function photograph(state: string): Promise<void> {
  if (PHOTOGRAPHS === '') return
  mkdirSync(PHOTOGRAPHS, { recursive: true })
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      await sleep(400)
      await app.page.locator('.px-chat').screenshot({ path: join(PHOTOGRAPHS, `chat-${state}-${String(width)}-${theme}.png`) })
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-kept-conversation', viewport: { width: 1440, height: 1000 } })
  await anAgentWhoseWaitHasEnded(SUPERVISOR, 1)
  await anAgentWhoseWaitHasEnded(WORKER, 2)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('after a run has waited and its wait has ended', () => {
  it('draws no Cannot reach notice for a supervisor, and the header says its conversation is kept', async () => {
    await openTheConversationWith(SUPERVISOR.name)
    await app.page.waitForSelector('.px-chat-answering', { timeout: 20_000 })
    expect(await app.page.textContent('.px-chat-answering')).toBe(CHAT_WORDS.answeringNow['its own conversation'])
    expect(await app.page.getAttribute('.px-chat-answering', 'title')).toBe(whoIsAnsweringSays('its own conversation', null))
    // TWO SECONDS MORE, so a notice drawn by a later read would be seen.
    await sleep(2_000)
    expect(await banners()).toBe(0)
    expect(await app.page.$$('.px-start-agent'), 'the Start press is drawn for a supervisor past its wait').toHaveLength(0)
    await photograph('a-supervisor-past-its-wait')
  }, 180_000)

  it('draws the Cannot reach notice for a worker, with the Start press', async () => {
    await openTheConversationWith(WORKER.name)
    await app.page.waitForSelector('.px-chat-cannot-reach', { timeout: 20_000 })
    expect(await app.page.textContent('.px-chat-cannot-reach')).toContain(CANNOT_REACH_WORDS.cannotReach(WORKER.name))
    expect(await app.page.$$('.px-chat-cannot-reach .px-start-agent'), 'the Start press is not drawn for a worker').toHaveLength(1)
    expect(await app.page.$$('.px-chat-answering')).toHaveLength(0)
    await photograph('a-worker-past-its-wait')
  }, 180_000)
})
