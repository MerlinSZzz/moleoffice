// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT DRAWS NO CANNOT-REACH NOTICE WHILE A RUN OF THE AGENT WAITS FOR THE NEXT MESSAGE.
 *
 * Criterion M89 of design/messages/ACCEPTANCE.md, problem `KKRT8OQX5bWm`: a run went down as soon as a
 * conversation ended, and kept no heartbeat. A run that has answered waits for the next message
 * (criterion M22), and the queue gives the next message to its conversation without asking anybody.
 * Until this change the chat drew Cannot reach for that agent the moment the run ended.
 *
 * WHAT IS PROVED HERE, in a real browser against a real server.
 *
 *   1. While the run waits, the chat draws no Cannot reach notice and no Start press, and its header
 *      says "Waiting for the next message", with the whole sentence as the hover text.
 *   2. When the wait is moved into the past, the notice comes back with no reload and no beat: the
 *      write announces `answering.changed`, and the page reads the open conversation on it (round 26
 *      of wave 13w; until then the chat's thirty-second beat drew it, fixed in fe6332c17).
 *   3. The dot beside the name agrees with the notice (task gVBpHNHP8oEP). While the run waits, the
 *      dot is green and there is no notice. In the same moment the notice is drawn, the
 *      dot is not green. Before this, the beat read only the conversation, so the dot stayed green
 *      beside the notice until the next full read.
 *   4. THE DOT AND THE NOTICE COME FROM ONE ANSWER, so no order of the page's reads can set a green dot
 *      beside the notice. Until round 115 of wave 13y the page read the conversation, the agent's
 *      presence and its status in three requests, each answered at its own moment, and the dot's
 *      colour came from the status answer. So a status answer older than the conversation's left the
 *      dot green beside the notice. The second case below saw that once in round 113: one read's
 *      status was answered before the write and its conversation after it. Now the conversation's
 *      answer carries the agent's status, read in the moment of its notice, and the chat makes no
 *      status read of its own. Here the presence answers, and any status answer, are held from before
 *      the wait ends: every later read of them is answered with what was true while the run waited.
 *      The notice is drawn from a conversation read made after the change, and the dot beside it must
 *      be grey. CONTROL: red before the change, with the dot green beside the notice. MUTATION: in the
 *      commit with the code.
 *
 * THE RUN IS FILED DIRECTLY, with the fields the worker writes on a run that has answered: the agent
 * it served, the message it delivered, its tool's conversation id, and the time its wait ends. No
 * worker runs here, so nothing else changes the reading between the two cases.
 *
 * THE PAGE'S CLOCK IS PLAYWRIGHT'S, installed before the first load and running at the real rate. The
 * second case does not move it, and the notice must come within ten real seconds of the write, a third
 * of the beat the chat had, so no timer of the page can be what drew it.
 *
 * THE PHOTOGRAPHS. When `PHOTOGRAPH_THE_CHAT_INTO` names a folder, each case photographs the chat at
 * 1440, 990, 660 and 390 pixels wide, in light and dark (chapter 6, rule 1). Without it nothing is
 * written.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { liveApp, waitForThePage, type LiveApp, thePersonsKeyHeader } from './helpers.ts'
import { openTheChatBeside } from './open-the-chat.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CANNOT_REACH_WORDS, CHAT_WORDS } from '../src/shared/messages.ts'
import { localStamp } from '../src/shared/time.ts'

let app: LiveApp
let run = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const WAITS = { id: 'its-run-waits', name: 'Its Run Waits' }

const PHOTOGRAPHS = process.env['PHOTOGRAPH_THE_CHAT_INTO'] ?? ''

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** A SESSION FOR AN AGENT IS FILED, AND A RUN'S DATA CHANGED, WITH THE PERSON'S KEY: a claim to be the person with no key may do neither. */
function asTheOwnerWithTheirKey(): Record<string, string> {
  return { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) }
}

async function post(path: string, body: unknown, answers: 201 | 409 = 201): Promise<{ record: { id: string } }> {
  const asking = (body as { kind?: string }).kind === 'session' ? asTheOwnerWithTheirKey() : AS_THE_OWNER
  const made = await fetch(`${app.api}${path}`, { method: 'POST', headers: asking, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(answers)
  return (await made.json()) as { record: { id: string } }
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

/** The colour of the dot beside the open conversation's name, in the chat's header. */
async function theirDot(): Promise<string | null> {
  return app.page.getAttribute('.px-chat-them-top .px-chat-dot', 'data-colour')
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
  app = await liveApp({ name: 'chat-run-waits', viewport: { width: 1440, height: 1000 } })
  // THE PAGE'S CLOCK, before the first load of the page. See the head of this file.
  await app.page.clock.install()
  await post('/api/records', { kind: 'agent', title: WAITS.name, data: { handle: WAITS.id, runtime: 'claude-code', state: 'active' } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  const said = await post('/api/records', {
    kind: 'message',
    title: 'A first line',
    data: { body: `A first line for ${WAITS.name}.`, to: [{ kind: 'agent', id: WAITS.id }] },
  }, 409)
  // THE RUN THAT ANSWERED IT, waiting ten minutes. Its state stays `running` because a finished
  // session must first seal a work area, which this test has no use for. No process is registered
  // for it, so nothing reads it as a run that is going, and the wait's reading does not read state.
  run = (
    await post('/api/records', {
      kind: 'session',
      title: `${WAITS.id} answering a message`,
      data: {
        state: 'running',
        runtime: 'claude-code',
        startedByMoleOffice: true,
        servingAgent: WAITS.id,
        deliveringMessage: said.record.id,
        providerSession: '6f1c1d2e-0000-4000-8000-000000000001',
        waitsUntil: localStamp(new Date(Date.now() + 10 * 60_000)),
      },
    })
  ).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('criterion M89: a run that waits for the next message', () => {
  it('draws no Cannot reach notice, and the header says the run waits', async () => {
    await openTheConversationWith(WAITS.name)
    await app.page.waitForSelector('.px-chat-answering', { timeout: 20_000 })
    expect(await app.page.textContent('.px-chat-answering')).toBe(CHAT_WORDS.answeringNow['a waiting run'])
    const hover = (await app.page.getAttribute('.px-chat-answering', 'title')) ?? ''
    expect(hover).toContain('A run Mole Office started for this agent has answered and waits for the next message until')
    // TWO SECONDS MORE, so a notice drawn by a later read would be seen.
    await sleep(2_000)
    expect(await banners()).toBe(0)
    expect(await app.page.$$('.px-start-agent'), 'the Start press is drawn while a run waits').toHaveLength(0)
    expect(await theirDot(), 'the dot beside the name while the run waits').toBe('green')
    await photograph('a-run-waits')
  }, 180_000)

  it('draws the notice again from the event, with no reload and no beat, once the wait has ended', async () => {
    await openTheConversationWith(WAITS.name)
    await app.page.waitForSelector('.px-chat-answering', { timeout: 20_000 })
    // ON THE WAY IN, WHILE THE RUN STILL WAITS: a green dot and no notice.
    expect(await theirDot(), 'the dot beside the name while the run waits').toBe('green')
    expect(await banners()).toBe(0)
    const moved = await fetch(`${app.api}/api/records/${run}`, {
      method: 'PATCH',
      headers: asTheOwnerWithTheirKey(),
      body: JSON.stringify({ dataPatch: { waitsUntil: localStamp(new Date(Date.now() - 60_000)) } }),
    })
    expect(moved.status, await moved.clone().text()).toBe(200)
    // THE PAGE'S CLOCK IS NOT MOVED. THE DOT IS READ IN THE SAME MOMENT THE NOTICE IS FIRST SEEN, inside the page, so no later
    // read can change it in between.
    const whenTheNoticeCame = await app.page.waitForFunction(
      () => {
        if (document.querySelector('.px-chat-cannot-reach') === null) return null
        return document.querySelector('.px-chat-them-top .px-chat-dot')?.getAttribute('data-colour') ?? 'no dot'
      },
      undefined,
      { timeout: 10_000, polling: 'raf' },
    )
    expect(await whenTheNoticeCame.jsonValue(), 'the dot beside the name when the notice was drawn').not.toBe('green')
    expect(await theirDot()).toBe('grey')
    expect(await app.page.textContent('.px-chat-cannot-reach')).toContain(CANNOT_REACH_WORDS.cannotReach(WAITS.name))
    expect(await app.page.$$('.px-chat-cannot-reach .px-start-agent'), 'the Start press came back with the notice').toHaveLength(1)
    expect(await app.page.$$('.px-chat-answering')).toHaveLength(0)
    await photograph('the-wait-has-ended')
  }, 180_000)

  /**
   * THE ORDER, MADE ON PURPOSE (point 4 at the head of this file). Every presence and status read is answered by the
   * server until the wait ends, and the answer is kept by its address. From then on each read is answered with the kept
   * answer, so the page sees those two as they were while the run waited, however late it asks.
   */
  it('draws the dot grey beside the notice, even when the presence and status answers are from before the wait ended', async () => {
    const ahead = await fetch(`${app.api}/api/records/${run}`, {
      method: 'PATCH',
      headers: asTheOwnerWithTheirKey(),
      body: JSON.stringify({ dataPatch: { waitsUntil: localStamp(new Date(Date.now() + 10 * 60_000)) } }),
    })
    expect(ahead.status, await ahead.clone().text()).toBe(200)
    const kept = new Map<string, { status: number; headers: Record<string, string>; body: Buffer }>()
    const notKept: string[] = []
    let holding = false
    const presenceOrStatus = (url: URL): boolean =>
      url.pathname === '/api/plugin-read/v1/status' || url.pathname.startsWith('/api/presence/agent/')
    const keepOrHold = async (route: Route): Promise<void> => {
      const address = route.request().url()
      if (holding) {
        const before = kept.get(address)
        if (before !== undefined) return route.fulfill(before)
        // A READ AT AN ADDRESS NOT READ BEFORE is refused and named, and the case fails on it below.
        notKept.push(address)
        return route.abort()
      }
      const response = await route.fetch()
      const body = await response.body()
      // THE BODY IS KEPT AS READ, so the headers that described its packing on the wire are not kept with it.
      const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => name !== 'content-encoding' && name !== 'content-length'))
      kept.set(address, { status: response.status(), headers, body })
      return route.fulfill({ response, body })
    }
    await app.page.route(presenceOrStatus, keepOrHold)
    try {
      await openTheConversationWith(WAITS.name)
      await app.page.waitForSelector('.px-chat-answering', { timeout: 20_000 })
      expect(await theirDot(), 'the dot beside the name while the run waits').toBe('green')
      expect(await banners()).toBe(0)
      expect([...kept.keys()].some((address) => new URL(address).pathname.startsWith('/api/presence/agent/')), 'a presence answer from before the change is kept').toBe(true)
      holding = true
      const moved = await fetch(`${app.api}/api/records/${run}`, {
        method: 'PATCH',
        headers: asTheOwnerWithTheirKey(),
        body: JSON.stringify({ dataPatch: { waitsUntil: localStamp(new Date(Date.now() - 60_000)) } }),
      })
      expect(moved.status, await moved.clone().text()).toBe(200)
      const whenTheNoticeCame = await app.page.waitForFunction(
        () => {
          if (document.querySelector('.px-chat-cannot-reach') === null) return null
          return document.querySelector('.px-chat-them-top .px-chat-dot')?.getAttribute('data-colour') ?? 'no dot'
        },
        undefined,
        { timeout: 10_000, polling: 'raf' },
      )
      expect(await whenTheNoticeCame.jsonValue(), 'the dot beside the name when the notice was drawn').toBe('grey')
      expect(notKept, 'every presence and status read was one the page had made before the change').toEqual([])
      await photograph('the-wait-has-ended-with-older-answers-held')
    } finally {
      await app.page.unroute(presenceOrStatus, keepOrHold)
    }
  }, 180_000)
})
