// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SWITCH FROM ONE CONVERSATION TO ANOTHER FETCHES ONLY THE NEW CONVERSATION.
 *
 * Round 9 of wave 13x, on a decision. On an office of the live size a switch fetched the
 * whole contact list again, 876 KB, and at other times the presence, the names and the groups as well. The cause was
 * in two places:
 *   - the mark that a conversation was read carried no counts, so the page read the contacts and the groups whole to
 *     learn them (src/web/lib/chatdeltas.ts);
 *   - the effect that writes that mark in src/web/components/Chat.tsx read every list again after it.
 * Now the server puts each moved contact row's counts on the `delivery.changed` event (`seenLeaves`), and the page puts
 * them in place.
 *
 * WHAT THIS FILE HOLDS. On the chat page, with two agents that each wrote to the person, the first conversation is
 * opened and then the second. Every `/api` request from the second press until the page has settled is kept. Each
 * must be about the second agent: its conversation, its presence, its status reading, its new-agent offer, or the marks
 * on its messages. Since round 102 of wave 13y the heading reads the open agent's status with its conversation, asking
 * the status view for that one agent alone, so that request is allowed when it names the second agent and no other.
 * Since round 111 of wave 13y it reads that agent in its home projects (scope=home), so the allowed request says so.
 * Since round 86 of wave 13y the seen marks for what is on the screen go together to POST /api/messages/seen, and the
 * delivered marks still go one at a time to POST /api/messages/:id/mark, so both are allowed.
 * And the second contact's row stops being drawn as unread, so the counts did arrive by the event.
 *
 * WHAT MAKES IT RED: putting `await readEverything()` back after the marks in the mark effect of Chat.tsx, or leaving
 * `seenLeaves` off the event in src/server/lib/messages.ts (then the page reads the contacts and the groups).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { theTargetOfARead } from '../src/shared/plugin-read.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({ ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

const ids: Record<string, string> = {}

/** A text to be matched as it stands, with no character of it read as part of a pattern. */
const exactly = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function write(headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  expect(res.status, text).toBe(201)
  return JSON.parse(text) as Record<string, unknown>
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-chat-switch', viewport: { width: 1440, height: 1000 } })
  for (const handle of ['first-to-open', 'second-to-open']) {
    await write(AS_THE_OWNER, { kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active' } })
  }
  const registry = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })).json()) as { agents: { id: string; handle: string }[] }
  for (const one of registry.agents) ids[one.handle] = one.id
  // BOTH WROTE TO THE PERSON AND NEITHER IS READ, so opening each one marks its messages seen and moves the counts.
  for (const handle of ['first-to-open', 'second-to-open']) {
    for (const n of [1, 2]) await write(asAgent(handle), { kind: 'message', title: `${handle} ${String(n)}`, data: { body: `Line ${String(n)} from ${handle}.`, to: [{ kind: 'person', id: THE_PERSON }] } })
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe('a switch from one conversation to another', () => {
  it('fetches only what is about the new conversation, and its row stops being unread', async () => {
    const asked: string[] = []
    app.page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api/')) asked.push(`${request.method()} ${url.pathname}${url.search}`)
    })
    await app.page.goto(`${app.site}/?lang=en#/chat`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const row = (handle: string) => app.page.locator(`.px-chat-page-lists .px-chat-contact[data-contact="agent:${ids[handle] as string}"]`)
    await expect.poll(() => row('second-to-open').getAttribute('data-unread'), { timeout: 30_000 }).toBe('yes')

    await row('first-to-open').click()
    await expect.poll(() => row('first-to-open').getAttribute('data-unread'), { timeout: 30_000 }).toBe('no')
    await waitForThePage(app.page, 60_000)
    await app.page.waitForTimeout(1_500)

    const from = asked.length
    await row('second-to-open').click()
    // THE COUNTS CAME, by the event or by a read; the list of requests says which.
    await expect.poll(() => row('second-to-open').getAttribute('data-unread'), { timeout: 30_000 }).toBe('no')
    await waitForThePage(app.page, 60_000)
    await app.page.waitForTimeout(1_500)
    const switched = asked.slice(from)

    const second = ids['second-to-open'] as string
    expect(switched, 'the second conversation was read').toContainEqual(expect.stringMatching(new RegExp(`^GET /api/messages/conversation\\?kind=agent&id=${second}(&|$)`)))
    const aboutTheSecond = [
      new RegExp(`^GET /api/messages/conversation\\?kind=agent&id=${second}(&|$)`),
      new RegExp(`^GET /api/presence/agent/${second}$`),
      new RegExp(`^GET ${exactly(theTargetOfARead('status', { agents: second, scope: 'home' }))}$`),
      new RegExp(`^GET /api/agents/${second}/start-a-new-agent$`),
      /^POST \/api\/messages\/[^/]+\/mark$/,
      /^POST \/api\/messages\/seen$/,
    ]
    expect(switched.filter((one) => !aboutTheSecond.some((rule) => rule.test(one))), JSON.stringify(switched)).toEqual([])
  }, 180_000)
})
