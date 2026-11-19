// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT SAYS UNDER A WAITING MESSAGE WHAT HAPPENS TO IT NEXT. Criterion M86, wave 13u round 18.
 *
 * Before this, a message the person sent to an agent nothing was answering as showed only a tick
 * labelled *Waiting*, with a sentence on hover. tests/a-waiting-message-says-what-happens-next.test.ts
 * proves the server's sentence; this file proves the chat draws it, in a real browser on a real
 * office with no message worker running.
 *
 * ROUND 168 CHANGES THE NOBODY-ANSWERING HALF. The conversation's long sentence is no longer a
 * paragraph under the newest message; each message the office routed carries one short "Not delivered"
 * mark, and the sentence is behind that mark in Developer detail. A reason the worker writes on a
 * delivery row is not that paragraph, so it is still drawn under the message it belongs to.
 *
 * 1. With two waiting messages, no long nobody-answering paragraph is drawn; each message carries the
 *    short mark, from its own routed entry.
 * 2. Once the worker writes its own reason on the newer message's delivery row, that reason is the one
 *    line under the newer message, and the marks stay.
 * 3. Once the agent has the newer message, the worker's line is gone and the waiting message keeps its
 *    mark.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const HANDLE = 'glaze-tester'
const AS_THE_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': HANDLE }
const AS_THE_WORKER = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
const THE_CAP = '2 runs are already going, which is as many as this installation allows at once. This message starts as soon as one of them ends.'

let agentId = ''

/** The mark's words, read from their key and never copied. */
const THE_MARK = t('chat.notDelivered')
let older = ''
let newer = ''

async function post(path: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  const aLetterNothingHolds = path === '/api/records' && theAnswerToAWriteInATestOffice(headers, body) === 409
  expect(aLetterNothingHolds ? res.status === 409 : res.status < 300, `${path} answered ${String(res.status)}: ${text}`).toBe(true)
  return JSON.parse(text) as Record<string, unknown>
}

async function thePersonSays(body: string): Promise<string> {
  const made = await post('/api/records', AS_THE_OWNER, { kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'agent', id: agentId }] } })
  return (made['record'] as { id: string }).id
}

/** Every short not-delivered mark on the page, with the message it is under and its words. */
async function theMarks(): Promise<{ under: string | null; words: string }[]> {
  return app.page.$$eval('.px-chat-not-delivered', (all) =>
    all.map((mark) => ({
      under: mark.closest('.px-chat-one')?.querySelector('.px-chat-words')?.textContent?.trim() ?? null,
      words: (mark.textContent ?? '').trim(),
    })),
  )
}

/** Every "what happens next" line on the page, with the message it is under and where its words came from. */
async function theLines(): Promise<{ under: string | null; from: string | null; words: string }[]> {
  return app.page.$$eval('.px-chat-next', (all) =>
    all.map((line) => ({
      under: line.closest('.px-chat-one')?.querySelector('.px-chat-words')?.textContent?.trim() ?? null,
      from: line.getAttribute('data-from'),
      words: (line.textContent ?? '').trim(),
    })),
  )
}

async function waitForOneLine(words: string): Promise<void> {
  await app.page.waitForFunction(
    (want) => {
      const all = document.querySelectorAll('.px-chat-next')
      return all.length === 1 && (all[0]?.textContent ?? '').trim() === want
    },
    words,
    { timeout: 15_000 },
  )
}

async function theConversationsSentence(): Promise<string> {
  const res = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=${agentId}`, { headers: AS_THE_OWNER })
  expect(res.status).toBe(200)
  const sentence = ((await res.json()) as { whatHappensToAWaitingMessage: string | null }).whatHappensToAWaitingMessage
  expect(sentence, 'the conversation says nothing about a waiting message').not.toBeNull()
  return sentence ?? ''
}

beforeAll(async () => {
  app = await liveApp({ name: 'what-happens-next', viewport: { width: 1440, height: 1000 } })
  await post('/api/records', AS_THE_OWNER, { kind: 'agent', title: 'Glaze Tester', data: { handle: HANDLE, runtime: 'claude-code', state: 'active' } })
  const res = await fetch(`${app.api}/api/participants/agent/${HANDLE}`, { headers: AS_THE_OWNER })
  agentId = ((await res.json()) as { participant: { id: string } }).participant.id
  older = await thePersonSays('Is the second firing done?')
  newer = await thePersonSays('Send me the kiln log when you can.')
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 15_000 })
  await app.page.click('.px-chat-contact')
  await app.page.waitForSelector('.px-chat-words', { timeout: 15_000 })
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('a waiting message says what happens next', () => {
  it('draws a short mark under each waiting message, and no long nobody-answering paragraph', async () => {
    const sentence = await theConversationsSentence()
    // THE SENTENCE IS STILL THE CONVERSATION'S, and it is what the mark opens in Developer detail; it is
    // no longer drawn as a paragraph in normal mode.
    await app.page.waitForFunction(
      () => document.querySelectorAll('.px-chat-not-delivered').length === 2,
      undefined,
      { timeout: 15_000 },
    )
    expect(await theLines(), 'a long what-happens-next line is still drawn').toEqual([])
    expect(await theMarks()).toEqual([
      { under: 'Is the second firing done?', words: THE_MARK },
      { under: 'Send me the kiln log when you can.', words: THE_MARK },
    ])
    expect(await app.page.locator('.px-chat-said').innerText(), 'the sentence is still drawn').not.toContain(sentence)
  }, 60_000)

  it('draws the worker’s own reason once it has written one on the row', async () => {
    await post(`/api/worker/messages/${newer}/held`, AS_THE_WORKER, { to: { kind: 'agent', id: agentId }, because: THE_CAP })
    await waitForOneLine(THE_CAP)
    expect(await theLines()).toEqual([{ under: 'Send me the kiln log when you can.', from: 'row', words: THE_CAP }])
    // THE REASON IS THE ROW'S OWN, not the nobody-answering paragraph, so both messages keep their marks.
    expect((await theMarks()).map((mark) => mark.under)).toEqual([
      'Is the second firing done?',
      'Send me the kiln log when you can.',
    ])
  }, 60_000)

  it('stops drawing the worker’s reason once the agent has the newer one, and leaves the mark', async () => {
    await post(`/api/messages/${newer}/mark`, AS_THE_AGENT, { mark: 'delivered' })
    // The conversation still says what happens to the older message; normal mode does not draw it.
    const sentence = await theConversationsSentence()
    await app.page.waitForFunction(() => document.querySelectorAll('.px-chat-next').length === 0, undefined, { timeout: 15_000 })
    expect(await theLines()).toEqual([])
    expect((await theMarks()).map((mark) => mark.under)).toContain('Is the second firing done?')
    expect(await app.page.locator('.px-chat-said').innerText()).not.toContain(sentence)
    expect(older).not.toBe('')
  }, 60_000)
})
