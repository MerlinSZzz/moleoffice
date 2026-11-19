// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NOT NOW ON ONE SCREEN TAKES THE OFFER OFF THE PERSON'S OTHER SCREENS AT ONCE.
 *
 * Row 65 of report rFBoQG6mAEI0, left by wave 13n's round 35: "Not now on one screen does not tell the person's other
 * screens at once; they drop the offer at their next read." The press wrote the put-off and announced nothing, and the
 * offers panel reads again only on a mark reaching `seen`, which Not now never moves. Now the press announces
 * `delivery.changed` with `offerPutOff: true` to the message's parties, and the offers panel reads again on it.
 *
 * WHAT IS CLAIMED
 *   1. A screen with the offer on it, whose own presses are not used, drops the offer within a few seconds of Not now
 *      pressed elsewhere (here, by the API with the person's headers), and the message stays unread.
 *   2. The mapping reads what is waiting for the person on that event, and on no put-off of somebody else's.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the press announces nothing again                              → case 1
 *   the offers panel ignores a put-off event again                 → cases 1 and 2
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { aSeenMarkTouchesThisPool, listsAnEventChanges } from '../src/web/lib/chatlists.ts'
import type { ChannelEvent } from '../src/shared/events.ts'

let app: LiveApp
let placeId = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_GUIDE = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'guide-elsewhere' }

/** Long enough for the event and one read, and far short of the 30 minutes after which a put-off offer comes back. */
const SOON_MS = 5000

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

beforeAll(async () => {
  app = await liveApp({ name: 'not-now-elsewhere', viewport: { width: 1440, height: 900 } })
  const agent = await write(AS_THE_PERSON, {
    kind: 'agent',
    title: 'Guide Elsewhere',
    data: { handle: 'guide-elsewhere', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, await agent.text()).toBe(201)
  const note = await write(AS_THE_PERSON, {
    kind: 'note',
    title: 'The place the guide offers to show',
    data: { date: '2026-10-06', body: 'A note the guide leads the reader to.' },
  })
  const made = (await note.json()) as { record?: { id: string } }
  expect(note.status, JSON.stringify(made)).toBe(201)
  placeId = made.record?.id ?? ''
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('Not now pressed on another screen', () => {
  it('takes the offer off this screen within seconds, and the message stays unread', async () => {
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const sent = await write(AS_THE_GUIDE, {
      kind: 'message',
      title: 'Shall I show you the note?',
      data: {
        body: 'Shall I show you the note?',
        to: [{ kind: 'person', id: THE_PERSON }],
        lead: { target: { kind: 'record', recordId: placeId, workspaceId: 'default' } },
      },
    })
    const message = (await sent.json()) as { record?: { id: string } }
    expect(sent.status, JSON.stringify(message)).toBe(201)
    const id = message.record?.id ?? ''
    await expect.poll(() => app.page.locator('.px-lead-offer').count(), { timeout: 30_000, interval: 50 }).toBe(1)

    // THE OTHER SCREEN'S PRESS: the same door the panel's Not now calls, with the person's headers.
    const pressed = await fetch(`${app.api}/api/messages/${id}/not-now`, { method: 'POST', headers: AS_THE_PERSON })
    expect(pressed.status, await pressed.text()).toBe(200)

    await expect
      .poll(() => app.page.locator('.px-lead-offer').count(), {
        message: 'the offer stayed on this screen after Not now on another',
        timeout: SOON_MS,
        interval: 50,
      })
      .toBe(0)
    const waiting = await fetch(`${app.api}/api/messages?only=waiting-for-me`, { headers: AS_THE_PERSON })
    const held = (await waiting.json()) as { messages: { id: string }[] }
    expect(held.messages.map((one) => one.id), 'Not now leaves the message unread').toContain(id)
  }, 180_000)

  it('is read by the offers panel for the person it was put off for, and by nobody else', () => {
    const person = { kind: 'person', id: THE_PERSON } as const
    const somebodyElse = { kind: 'person', id: 'made-up-other-person' } as const
    const putOff: ChannelEvent = {
      name: 'delivery.changed',
      workspaceId: 'default',
      messageIds: ['m1'],
      to: person,
      mark: 'delivered',
      rows: null,
      offerPutOff: true,
    }
    expect(listsAnEventChanges(putOff, person, null).has('waitingForMe')).toBe(true)
    expect(aSeenMarkTouchesThisPool(putOff, ['m1'])).toBe(true)
    expect(aSeenMarkTouchesThisPool(putOff, ['m2']), 'an offer this panel does not draw').toBe(false)
    expect(listsAnEventChanges({ ...putOff, to: somebodyElse }, person, null).has('waitingForMe')).toBe(false)
    const { offerPutOff: _left, ...aMark } = putOff
    expect(listsAnEventChanges(aMark, person, null).has('waitingForMe'), 'a mark that is not seen reads nothing, as before').toBe(false)
  })
})
