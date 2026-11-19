// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ANSWERED LEAD OFFER LEAVES THE SCREEN AT ONCE, AND THE NEXT ONE IS DRAWN AS A DIFFERENT ONE.
 *
 * Problem 2JUcu1Sg9eg1, from a message: sometimes the offer stayed on screen after Take me there
 * or Not now.
 *
 * THE CAUSE, FOUND BY THIS FILE BEFORE THE FIX. Both presses waited for a write and then for a read of
 * the offers, and only that read took the offer away. The read after a press handed back the answer the
 * page had held since it loaded, which still held the offer. So the offer stayed until an event from
 * the server made the panel read again, and when no event came, it stayed. This file holds the page's
 * event stream (it answers nothing), which is the case where no event comes, and holds or fails the
 * press's own write. Run against the code before the fix, the five cases that press with the stream
 * held found the offer still on screen. A third fault was found on the way: the reason a press wrote
 * nothing was drawn in the panel's read fault, and the read after the press emptied it at once.
 *
 * WHAT EACH CASE SAYS. With one offer waiting and with two, each press makes the answered offer go
 * within a second, and with two the card left is the other message: its words and its sent time are
 * that message's. A write that is slow does not keep the offer on screen. A write that fails puts the
 * offer back with the reason, because an offer that went away when nothing was written would be a
 * press that lied.
 *
 * MUTATIONS, named in the commit that meets this file: put the cause back (the press does not take the
 * offer off the screen and the read hands back the held answer) and the five cases with the stream held
 * go red; let the press not take the offer off the screen alone, and the slow write goes red; draw the
 * reason in the read fault again, and the failed write goes red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Route } from 'playwright'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { TEST_SHOTS, testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { drawnStamp, localStamp, parseLocalStamp } from '../src/shared/time.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let placeId = ''
const shots = testShots('lead-offer-not-now')

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_GUIDE = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'guide-at-once' }

/** How long an answered offer may stay on screen after the press. */
const AT_ONCE_MS = 1000
/** How long a slow write is held before it goes on to the server. */
const A_SLOW_WRITE_MS = 4000

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

/** The guide offers to take the person to the note. The message's id and sent time come back. */
async function anOffer(words: string): Promise<{ id: string; sentAt: string }> {
  const res = await write(AS_THE_GUIDE, {
    kind: 'message',
    title: words.slice(0, 40),
    data: {
      body: words,
      to: [{ kind: 'person', id: THE_PERSON }],
      lead: { target: { kind: 'record', recordId: placeId, workspaceId: 'default' } },
    },
  })
  const made = (await res.json()) as { record?: { id: string; createdAt: string } }
  expect(res.status, JSON.stringify(made)).toBe(201)
  return { id: made.record?.id ?? '', sentAt: made.record?.createdAt ?? '' }
}

/**
 * MAKE A MESSAGE TWO MINUTES OLDER, in the database the server reads, and give back its new sent time.
 * The card draws minutes, so two offers sent in one minute look alike. Until this, the case waited for the
 * wall clock's next minute, up to 60.5 s a case. The stamp is the office's own form (localStamp), and the
 * page reads it from the server after this, as tests/the-long-pages-draw-one-page-at-a-time.test.ts does.
 */
function sentTwoMinutesEarlier(message: { id: string; sentAt: string }): { id: string; sentAt: string } {
  const was = parseLocalStamp(message.sentAt)
  expect(was, `the sent time ${message.sentAt} is not a stored stamp`).not.toBeNull()
  const earlier = localStamp(new Date((was ?? 0) - 120_000))
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const changed = db.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(earlier, message.id)
    expect(changed.changes, `no record ${message.id} to make older`).toBe(1)
  } finally {
    db.close()
  }
  return { id: message.id, sentAt: earlier }
}

/**
 * EVERY MESSAGE STILL WAITING FOR THE PERSON IS MARKED READ, so each case starts with no offer but its
 * own. Not now leaves a message unread, so an earlier case's offer would otherwise still be waiting.
 */
async function noOfferWaits(): Promise<void> {
  const res = await fetch(`${app.api}/api/messages?only=waiting-for-me`, { headers: AS_THE_OWNER })
  const held = (await res.json()) as { messages: { id: string }[] }
  expect(res.status, JSON.stringify(held)).toBe(200)
  for (const one of held.messages) {
    const marked = await fetch(`${app.api}/api/messages/${one.id}/mark`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ mark: 'seen' }),
    })
    expect(marked.status, await marked.text()).toBe(200)
  }
}

/** True for the event stream's request. Held, it answers nothing, so no event reaches the page. */
const theEventStream = (url: URL): boolean => url.pathname === '/api/events'
/** True for a press's write on one message: the read mark or Not now. */
const aPressWrite = (url: URL): boolean => /^\/api\/messages\/[^/]+\/(mark|not-now)$/.test(url.pathname)

/**
 * OPEN THE RECORDS PAGE FROM NOTHING, with the event stream held, and wait for `count` offers.
 * `onWrite` decides what happens to the press's write; left out, it goes to the server at once.
 */
async function openWithTheStreamHeld(count: number, onWrite?: (route: Route) => Promise<void>): Promise<void> {
  await app.page.unrouteAll({ behavior: 'ignoreErrors' })
  await app.page.route(theEventStream, () => {
    // HELD: never answered, never let through.
  })
  if (onWrite !== undefined) {
    await app.page.route(aPressWrite, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      return onWrite(route)
    })
  }
  await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
  await app.page.reload({ timeout: 60_000 })
  // NOT `waitForThePage`: a page marks itself drawn only once its event stream has answered, and this
  // case holds the stream on purpose. The offers are read at mount, without the stream.
  await expect.poll(() => app.page.locator('.px-lead-offer').count(), { timeout: 30_000, interval: 50 }).toBe(count)
}

/** How many offer cards are on screen, polled until it is `count` or `AT_ONCE_MS` has passed. */
async function offersWithinASecond(count: number, why: string): Promise<void> {
  await expect
    .poll(() => app.page.locator('.px-lead-offer').count(), { message: why, timeout: AT_ONCE_MS, interval: 25 })
    .toBe(count)
}

beforeAll(async () => {
  app = await liveApp({ name: 'lead-at-once', viewport: { width: 1440, height: 900 } })
  const agent = await write(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Guide At Once',
    data: { handle: 'guide-at-once', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, await agent.text()).toBe(201)
  const note = await write(AS_THE_OWNER, {
    kind: 'note',
    title: 'The place the guide offers to show',
    data: { date: '2026-10-04', body: 'A note the guide leads the reader to.' },
  })
  const made = (await note.json()) as { record?: { id: string } }
  expect(note.status, JSON.stringify(made)).toBe(201)
  placeId = made.record?.id ?? ''
}, 300_000)

afterAll(async () => {
  await app?.page.unrouteAll({ behavior: 'ignoreErrors' })
  await app?.stop()
}, 60_000)

describe('with one offer waiting, each press takes it off the screen within a second', () => {
  for (const press of ['.px-lead-go', '.px-lead-not'] as const) {
    it(`${press === '.px-lead-go' ? 'Take me there' : 'Not now'}, with no event from the server`, async () => {
      await noOfferWaits()
      await anOffer(`One offer, answered with ${press}.`)
      await openWithTheStreamHeld(1)
      await app.page.locator(press).first().click()
      await offersWithinASecond(0, `the answered offer was still on screen ${String(AT_ONCE_MS)} ms after ${press}`)
    }, 240_000)
  }
})

describe('with two offers waiting, the one answered goes and the one left is the other', () => {
  for (const press of ['.px-lead-go', '.px-lead-not'] as const) {
    it(`${press === '.px-lead-go' ? 'Take me there' : 'Not now'} on the first, with no event from the server`, async () => {
      await noOfferWaits()
      const sentFirst = await anOffer(`The first of two, answered with ${press}.`)
      const second = await anOffer(`The second of two, left waiting after ${press}.`)
      // THE FIRST MADE TWO MINUTES OLDER, so the two sent times differ on the card, which draws minutes.
      const first = sentTwoMinutesEarlier(sentFirst)
      await openWithTheStreamHeld(2)
      const firstCard = app.page.locator('.px-lead-offer').first()
      expect(await firstCard.textContent()).toContain('The first of two')
      // THE PAGE READ THE OLDER TIME FROM THE SERVER, so the two cards differ by the database and not by this file's arithmetic.
      expect(await firstCard.locator('.px-lead-when').textContent()).toBe(drawnStamp(first.sentAt))
      await firstCard.locator(press).click()
      await offersWithinASecond(1, `two offers were still on screen ${String(AT_ONCE_MS)} ms after ${press} on the first`)
      const left = app.page.locator('.px-lead-offer').first()
      expect(await left.getAttribute('data-lead-message')).toBe(second.id)
      // WHAT A PERSON SEES: the other message's words and its own sent time, not the first's.
      const text = (await left.textContent()) ?? ''
      expect(text).toContain('The second of two')
      expect(text).not.toContain('The first of two')
      expect(await left.locator('.px-lead-when').textContent()).toBe(drawnStamp(second.sentAt))
      expect(drawnStamp(second.sentAt), 'the two offers were sent in the same minute, so the case shows nothing').not.toBe(
        drawnStamp(first.sentAt),
      )
    }, 240_000)
  }
})

describe('a slow or failed write', () => {
  it('does not keep the offer on screen while the write is slow', async () => {
    await noOfferWaits()
    await anOffer('One offer, its write held for four seconds.')
    await openWithTheStreamHeld(1, async (route) => {
      await new Promise((wake) => setTimeout(wake, A_SLOW_WRITE_MS))
      await route.continue()
    })
    await app.page.locator('.px-lead-not').first().click()
    await offersWithinASecond(0, `the offer stayed on screen while its write was held for ${String(A_SLOW_WRITE_MS)} ms`)
  }, 240_000)

  it('draws the offer again, with the reason, when the write fails', async () => {
    await noOfferWaits()
    await anOffer('One offer, its write refused.')
    // THE SERVER REFUSES IT FOR REAL: the write is sent about a message id that names nothing, so the
    // answer is the server's own refusal, with the headers the page checks on every answer.
    const refusals: string[] = []
    await openWithTheStreamHeld(1, async (route) => {
      const response = await route.fetch({ url: route.request().url().replace(/\/messages\/[^/]+\//, '/messages/nosuchmsg001/') })
      refusals.push(`${String(response.status())} ${await response.text()}`)
      await route.fulfill({ response })
    })
    await app.page.locator('.px-lead-not').first().click()
    await app.page.locator('.px-lead-fault').waitFor({ state: 'visible', timeout: 15_000 })
    expect(refusals.length, 'the press sent no write').toBe(1)
    expect(refusals[0], 'the server did not refuse the write').toMatch(/^4\d\d /)
    const reason = ((await app.page.locator('.px-lead-fault').textContent()) ?? '').trim()
    expect(reason, 'the reason drawn is not the server\'s refusal').not.toBe('')
    expect(refusals[0]).toContain(reason.slice(0, 40))
    expect(await app.page.locator('.px-lead-offer').count(), 'the offer went away although nothing was written').toBe(1)
    // AND THE REASON STAYS after the read that follows the press has answered. Before the fix that read
    // emptied it within a moment, so a person could miss it.
    await new Promise((wake) => setTimeout(wake, 2000))
    expect(await app.page.locator('.px-lead-fault').count(), 'the reason went away after the next read').toBe(1)
    expect(((await app.page.locator('.px-lead-fault').textContent()) ?? '').trim()).toBe(reason)
  }, 240_000)
})

/**
 * THE PICTURES, taken only when TEST_SHOTS names a folder to keep them in (tests/where-shots-go.ts).
 *
 * Two offers wait, so each card's sent time is in the picture. Then Not now is pressed on the first,
 * and the chat's circle and contact list and the Messages page are photographed: each still counts
 * that message as unread. At 1440, 990, 660 and 390, light and dark, English and Chinese.
 */
describe('the pictures', () => {
  it.skipIf((process.env[TEST_SHOTS] ?? '') === '')('photographs the offer, then the chat and Messages after Not now', async () => {
    await app.page.unrouteAll({ behavior: 'ignoreErrors' })
    await app.page.addInitScript(() => {
      localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
    })
    await noOfferWaits()
    const first = await anOffer('Here is the note you asked about. The second paragraph is the one that changed.')
    await new Promise((wake) => setTimeout(wake, 60_500 - (Date.now() % 60_000)))
    await anOffer('And the same note again, in case the first offer was missed.')
    type View = { lang: string; width: number; look: string }
    const views: View[] = []
    for (const lang of ['en', 'zh']) for (const width of [1440, 990, 660, 390]) for (const look of ['light', 'dark']) views.push({ lang, width, look })
    const open = async (view: View, route: string): Promise<void> => {
      await app.page.setViewportSize({ width: view.width, height: 900 })
      await app.page.goto('about:blank')
      await app.page.goto(`${app.site}/?lang=${view.lang}&look=${view.look}#${route}`, { timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
    }
    const name = (what: string, view: View): string => `${shots}/${what}-${view.lang}-${String(view.width)}-${view.look}.png`

    for (const view of views) {
      await open(view, '/records')
      await expect.poll(() => app.page.locator('.px-lead-offer').count(), { timeout: 30_000 }).toBe(2)
      await app.page.screenshot({ path: name('offer', view) })
    }

    // NOT NOW ON THE FIRST, through the page's own press.
    await open({ lang: 'en', width: 1440, look: 'light' }, '/records')
    const putOff = app.page.waitForResponse((reply) => reply.url().endsWith(`/api/messages/${first.id}/not-now`))
    await app.page.locator(`.px-lead-offer[data-lead-message="${first.id}"] .px-lead-not`).click()
    const answered = await putOff
    expect(answered.status(), await answered.text()).toBe(200)
    await expect.poll(() => app.page.locator('.px-lead-offer').count(), { timeout: 5_000 }).toBe(1)
    // A PAGE OPENED FROM NOTHING DOES NOT OFFER IT AGAIN: the offers read leaves it out.
    await open({ lang: 'en', width: 1440, look: 'light' }, '/records')
    await expect.poll(() => app.page.locator('.px-lead-offer').count(), { timeout: 15_000 }).toBe(1)

    for (const view of views) {
      await open(view, '/records')
      await openTheChat(app.page)
      // THE GUIDE'S CONTACT ROW, with its unread number, scrolled into the panel.
      const row = app.page.locator('.px-chat .px-chat-contact', { hasText: 'Guide At Once' }).first()
      await row.waitFor({ timeout: 30_000 })
      await row.scrollIntoViewIfNeeded()
      await app.page.screenshot({ path: name('chat-after-not-now', view) })
      // THE CHAT IS CLOSED BEFORE THE MESSAGES PAGE, so the page is not under the panel.
      await app.page.locator('.px-chat-close').first().click()
      await app.page.locator('.px-chat').first().waitFor({ state: 'detached', timeout: 15_000 })
      await open(view, '/messages')
      // THE PUT-OFF ROW IN VIEW, in the middle of the page, so the offer card fixed at the foot does not cover its
      // state at 390 (the secretary's review of round 35's pictures, point 2).
      await app.page.getByText('Here is the note you asked about.').first().evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await app.page.screenshot({ path: name('messages-after-not-now', view) })
    }
    // THE PICTURES DID NOT READ IT: the message is still unread for the person.
    const res = await fetch(`${app.api}/api/messages?only=waiting-for-me`, { headers: AS_THE_OWNER })
    const held = (await res.json()) as { messages: { id: string }[] }
    expect(held.messages.map((one) => one.id), 'taking the pictures marked the message read').toContain(first.id)
  }, 1_800_000)
})
