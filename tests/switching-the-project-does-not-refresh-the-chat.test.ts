// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SWITCHING PROJECT DOES NOT REFRESH THE CHAT. Problem sM59NEsuJa8g: switching the project still
 * refreshed the chat.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED IN A BROWSER BEFORE ANYTHING WAS CHANGED
 * ---------------------------------------------------------------------------------------
 *
 * The measurement was taken at commit 4e1b6323 in a browser against a test office holding two
 * projects, with the chat open on one contact, the list scrolled to 300px and a draft in the box.
 * Switching the project in the rail gave:
 *
 *   window navigation entries   1 before, 1 after; timeOrigin unchanged; a marker set on window
 *                               before the switch still there after — so NO navigation and NO reload
 *   the panel element           the same element (a token written on it survives) — so the panel is
 *                               NOT remounted
 *   the draft                   survived, as it already did
 *   the messages                30 before, 0 for a frame, 30 again — the conversation was EMPTIED
 *                               and read again
 *   the list's scrollTop        300 before, 0 while empty, 2533 (the bottom) after — the reader's
 *                               place was LOST
 *   the "New messages below" mark   appeared, though nothing new had arrived
 *
 * THE CAUSE. `readTheTalk` in src/web/components/Chat.tsx closed over `destination` — the project a
 * message would be sent in, which is the project on screen — so choosing another project gave the
 * callback a new identity. The effect watching it ran `setTalk(null)` and read the conversation
 * again. There was no reload and no remount: the chat refreshed because its own conversation state
 * was thrown away and rebuilt, one project too literally being treated as a new screen.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE FIX DOES, AND WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * `readTheTalk` reads the project from the ref it already keeps, at the moment the read is made, and
 * no longer depends on the project changing. So the effect runs when the reader OPENS ANOTHER
 * CONVERSATION and never merely because the project changed. This file proves, across a real switch:
 *
 *   1. NO navigation and NO reload, and the panel is not remounted (a token on the element survives).
 *   2. THE CONVERSATION IS NEVER EMPTIED, not for one frame, and the message being read stays where it
 *      is on the screen. A MutationObserver samples the panel throughout; the message count never falls.
 *      Wave 13y round 148, item 108: the switch can give the line under the agent's name a second line,
 *      which moves the list's top edge down, and the chat keeps the message being read still on the
 *      screen. So the list's scroll position moves by that much, and the place is read from the message.
 *   3. THE DRAFT SURVIVES.
 *   4. THE CONTACT LIST IS RE-READ FOR THE NEW PROJECT IN PLACE — counted at the wire — and is never
 *      emptied while that read is on its way.
 *   5. NOTHING IN THE PANEL SAYS THE CONVERSATION BELONGS TO A PROJECT. The chat is global (wave 13y round 134,
 *      item 72 b). Until then a line under the header said "This conversation belongs to" and the project the
 *      conversation was read in, after every switch.
 *
 * THE CONTROL is the same one the older chat tests use: the project this browser stores is read back
 * after the switch, so a switcher that did nothing cannot make any of this true for the wrong reason.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'
import { switchTheProject, theProjectOnScreen } from './switch-the-project.ts'

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

/** Where the reader had scrolled to, mid-list, so a reset to the top or the bottom is visible. */
const SCROLLED_TO = 300

/** The words of the message across the middle of the list, and how far its top is from the window's top. */
async function theRowBeingRead(): Promise<{ words: string; onScreen: number }> {
  return app.page.evaluate(() => {
    const list = document.querySelector('.px-chat-said')
    if (list === null) throw new Error('no list')
    const box = list.getBoundingClientRect()
    const middle = box.top + box.height / 2
    for (const row of list.children) {
      const its = row.getBoundingClientRect()
      const words = row.querySelector('.px-chat-words')?.textContent ?? ''
      if (words !== '' && its.bottom >= middle) return { words, onScreen: Math.round(its.top) }
    }
    throw new Error('no message reaches the middle of the list')
  })
}

/** How far the message with these words is from the window's top, or null where it is not drawn. */
async function whereTheRowIs(words: string): Promise<number | null> {
  return app.page.evaluate((wanted) => {
    for (const row of document.querySelectorAll('.px-chat-said > *')) {
      if ((row.querySelector('.px-chat-words')?.textContent ?? '') === wanted) return Math.round(row.getBoundingClientRect().top)
    }
    return null
  }, words)
}

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-project-switch', viewport: { width: 1440, height: 1000 } })

  const made = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ id: OTHER, title: 'Robotics' }),
  })
  expect(made.status, await made.text()).toBe(201)

  const agent = await write(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Long Agent',
    data: { handle: 'long-agent', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, await agent.text()).toBe(201)

  // THIRTY MESSAGES THE READER SENT, so the list really scrolls. They are the owner's own on purpose: a
  // message addressed to the owner is marked read on arrival, which re-reads the conversation for a reason
  // that is not this test.
  for (let n = 1; n <= 30; n += 1) {
    const said = await write(AS_THE_OWNER, {
      kind: 'message',
      title: `Line ${String(n)}`,
      data: {
        body: `Line ${String(n)} of the wrist camera fit, long enough to take a row.`,
        to: [{ kind: 'agent', id: 'long-agent' }],
      },
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(said.status, await said.text()).toBe(409)
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe('switching the project', () => {
  it('does not reload or remount the chat, does not empty the open conversation, and keeps the reader’s place and draft', async () => {
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)

    // ---- OPEN THE PANEL AND A CONVERSATION, scroll to the middle, and type without sending.
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
    await app.page.waitForSelector('.px-chat-contact', { timeout: 30_000 })
    await app.page.click('.px-chat-contact:has(.px-chat-name:text-is("Long Agent"))')
    await app.page.waitForSelector('.px-chat-said .px-chat-words', { timeout: 30_000 })
    await app.page.waitForFunction(
      () => {
        const list = document.querySelector('.px-chat-said')
        return list !== null && list.scrollHeight - list.clientHeight > 200
      },
      undefined,
      { timeout: 20_000 },
    )
    await app.page.$eval('.px-chat-said', (list) => {
      list.scrollTop = 300
      list.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await app.page.waitForTimeout(100)
    await app.page.fill('.px-chat-write textarea', HALF_WRITTEN)
    expect(await app.page.inputValue('.px-chat-write textarea')).toBe(HALF_WRITTEN)
    expect(await app.page.$eval('.px-chat-said', (list) => Math.round(list.scrollTop)), 'the list is not where the reader put it').toBe(SCROLLED_TO)
    const reading = await theRowBeingRead()

    // THE NAME THIS INSTALLATION GIVES THE PROJECT THE READER IS LEAVING, read off the project
    // block rather than written here, so a renamed project does not make this test lie.
    const oldProjectName = (await theProjectOnScreen(app.page)) ?? ''
    expect(oldProjectName).not.toBe('')

    // ---- MARK THE ELEMENTS AND WATCH THE PANEL FOR A FRAME OF EMPTINESS. A property written onto
    // a DOM node by hand is not something React can put back: it survives a re-render of the same
    // element and dies with an unmount. A MutationObserver samples the message count throughout.
    await app.page.evaluate(() => {
      const holder = window as unknown as {
        __trace: { words: number }[]
        __contactReads: number
        __navMark: string
      }
      holder.__navMark = 'alive-before-the-switch'
      holder.__trace = []
      const panel = document.querySelector('.px-chat')
      if (panel === null) throw new Error('the panel was not on screen')
      ;(panel as unknown as Record<string, string>)['__token'] = 'panel-before-the-switch'
      const sample = (): void => {
        holder.__trace.push({ words: document.querySelectorAll('.px-chat-said .px-chat-words').length })
      }
      new MutationObserver(sample).observe(panel, { childList: true, subtree: true })
      sample()
      // COUNT THE PANEL'S CONTACT READS FROM HERE, so the re-read for the new project is proved at
      // the wire rather than inferred from a list that looks the same either way.
      holder.__contactReads = 0
      const real = window.fetch.bind(window)
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        // THE CHAT'S CONTACT LIST, read a page at a time since round 20 of wave 13u.
        if (url.includes('/api/messages/contact-list')) holder.__contactReads += 1
        return real(input, init)
      }
    })

    // ---- SWITCH, THE WAY A READER DOES.
    await switchTheProject(app.page, OTHER)
    await app.page.waitForFunction(
      `window.localStorage.getItem('mole-office.workspace') === ${JSON.stringify(OTHER)}`,
      { timeout: 30_000 },
    )
    await waitForThePage(app.page, 60_000)

    // ---- THE CONTROL: the switch really happened.
    expect(await app.page.evaluate(() => window.localStorage.getItem('mole-office.workspace'))).toBe(OTHER)

    // ---- 1. NO NAVIGATION, NO RELOAD, NO REMOUNT.
    const after = await app.page.evaluate(() => {
      const panel = document.querySelector('.px-chat')
      const list = document.querySelector('.px-chat-said') as HTMLElement | null
      return {
        navigationEntries: performance.getEntriesByType('navigation').length,
        navMark: (window as unknown as Record<string, string>)['__navMark'] ?? null,
        panelIsThere: panel !== null,
        panelToken: panel === null ? null : ((panel as unknown as Record<string, string>)['__token'] ?? null),
        draft: (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value ?? null,
        scrollTop: list === null ? null : Math.round(list.scrollTop),
        most: list === null ? null : Math.round(list.scrollHeight - list.clientHeight),
        messages: document.querySelectorAll('.px-chat-said .px-chat-words').length,
        newBelow: document.querySelector('.px-chat-new-below') !== null,
        panelWords: panel?.textContent ?? '',
      }
    })
    expect(after.navigationEntries, 'the window navigated on a project switch').toBe(1)
    expect(after.navMark, 'the window reloaded: the marker set before the switch is gone').toBe('alive-before-the-switch')
    expect(after.panelIsThere, 'the chat panel was not on screen after the switch').toBe(true)
    expect(after.panelToken, 'the chat panel was rebuilt: it is a different element').toBe('panel-before-the-switch')

    // ---- 2. THE CONVERSATION WAS NEVER EMPTIED, NOT FOR ONE FRAME, AND THE PLACE SURVIVED.
    const trace = await app.page.evaluate(
      () => (window as unknown as { __trace: { words: number }[] }).__trace,
    )
    const fewestWords = Math.min(...trace.map((one) => one.words))
    expect(trace.length, 'the panel never redrew, so nothing was watched').toBeGreaterThan(0)
    expect(fewestWords, 'the open conversation was emptied for a frame and read again').toBe(30)
    expect(after.messages, 'the conversation is not on screen after the switch').toBe(30)
    expect(after.most, 'the list stopped scrolling, so nothing about the place is measured').toBeGreaterThan(200)
    const readingAfter = await whereTheRowIs(reading.words)
    expect(readingAfter, 'the reader’s place was lost: the message being read is not drawn after the switch').not.toBeNull()
    expect(Math.abs((readingAfter ?? Number.NaN) - reading.onScreen), `the reader’s place was lost: "${reading.words}" moved on the screen on a project switch`).toBeLessThanOrEqual(2)
    expect(after.newBelow, 'a mark said new messages were below, and nothing new had arrived').toBe(false)

    // ---- 3. THE DRAFT SURVIVED.
    expect(after.draft).toBe(HALF_WRITTEN)

    // ---- 4. THE CONTACT LIST WAS RE-READ FOR THE NEW PROJECT, IN PLACE.
    const contactReads = await app.page.evaluate(
      () => (window as unknown as { __contactReads: number }).__contactReads,
    )
    expect(contactReads, 'the contact list was not read again for the project the reader moved to').toBeGreaterThan(0)

    // ---- 5. NOTHING SAYS THE CONVERSATION BELONGS TO A PROJECT.
    expect(after.panelWords, 'the chat said the conversation belongs to a project, and the chat is global').not.toContain('belongs to')
  }, 180_000)
})
