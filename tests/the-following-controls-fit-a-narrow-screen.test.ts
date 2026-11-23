// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHILE FOLLOWING, A NARROW SCREEN GIVES UP ONE LINE AND NOT A FIFTH OF ITSELF.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED, AND WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M8 of design/messages/ACCEPTANCE.md: while somebody is following an agent, a control
 * that stops it is on screen the whole time. The control is in a box fixed to the screen, so
 * whatever that box covers it covers for as long as the reader is following, whatever they scroll
 * to.
 *
 * Measured at 390 by 972 on 4 September 2026: the box was 352 pixels wide and 208 tall — 90 per
 * cent of the width and 21 per cent of the height — because it drew two cards about one state, the
 * agent's words and a sentence explaining what following means. Problem `O184ESMBfKbN`, where it was
 * also written down as unavoidable. It was not.
 *
 * ---------------------------------------------------------------------------------------
 * THE FRACTION THIS FILE HOLDS THE LAYOUT TO
 * ---------------------------------------------------------------------------------------
 *
 * UNDER A TENTH OF THE HEIGHT OF THE SCREEN, at 390 and at 660, while following, with the agent's
 * words waiting behind the press. A tenth is the number the problem's own "how to tell it is back"
 * names, and at 972 tall it is 97 pixels — a line of writing and a press, and no more.
 *
 * The stop control is checked in the same breath, because a strip that fitted by dropping the way
 * to stop would meet the fraction and break the criterion.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { LEADING } from '../src/shared/messages.ts'
import { FOLLOWING_KEY } from '../src/web/lib/following.ts'

let app: LiveApp
let recordId = ''
let agentId = ''

/** The most of the screen the following box may take, and the reason is at the top of this file. */
const AT_MOST = 0.1

const WORDS = 'This is the paragraph I want you to read. Tell me if you agree with what it says.'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_GUIDE = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'lead-bot',
}

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

/** The guide offers to take the owner to the record, saying something about it. */
async function lead(): Promise<void> {
  const said = await write(AS_THE_GUIDE, {
    kind: 'message',
    title: 'Come and read this',
    data: {
      body: WORDS,
      to: [{ kind: 'person', id: THE_PERSON }],
      lead: { target: { kind: 'record', recordId, workspaceId: 'default' } },
    },
  })
  expect(said.status, await said.text()).toBe(201)
}

/** How much of the screen the following box is taking, and whether the stop press is on it. */
async function whatItTakes(): Promise<{ tall: number; wide: number; ofHeight: number; stop: boolean }> {
  return app.page.evaluate(() => {
    const box = document.querySelector('.px-lead-here')
    const stop = document.querySelector('.px-lead-stop')
    const rect = box === null ? new DOMRect() : box.getBoundingClientRect()
    return {
      tall: Math.round(rect.height),
      wide: Math.round(rect.width),
      ofHeight: rect.height / window.innerHeight,
      stop:
        stop !== null &&
        stop.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
    }
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'narrow-following', viewport: { width: 390, height: 972 } })
  const agent = await write(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Lead Bot',
    data: { handle: 'lead-bot', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, await agent.text()).toBe(201)
  // THE REGISTRY'S ID FOR THAT AGENT, WHICH IS WHAT A MESSAGE NAMES. An agent is a project record
  // and a registry row, and the two have different ids; following the record's id would follow
  // somebody the pool has never heard of.
  const registry = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const listed = (await registry.json()) as { agents: { id: string; handle: string; name: string }[] }
  expect(registry.status, JSON.stringify(listed)).toBe(200)
  agentId = listed.agents.find((one) => one.handle === 'lead-bot')?.id ?? ''
  expect(agentId, JSON.stringify(listed.agents)).not.toBe('')
  const note = await write(AS_THE_OWNER, {
    kind: 'note',
    title: 'The place the guide wants to show somebody',
    data: { date: '2026-09-04', body: 'A note the guide leads the reader to.' },
  })
  const made = (await note.json()) as { record?: { id: string } }
  expect(note.status, JSON.stringify(made)).toBe(201)
  recordId = made.record?.id ?? ''

  // THIS BROWSER IS FOLLOWING, WRITTEN WHERE THE PRODUCT KEEPS IT. Starting to follow from the
  // right-click menu is what `leading-with-consent.test.ts` walks; this file is about what the
  // screen costs once somebody already is, so it starts from that state rather than reaching it
  // again.
  await app.page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string)
    },
    [FOLLOWING_KEY, `agent:${agentId}`],
  )
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the following controls on a narrow screen', () => {
  it('takes under a tenth of the height at 390 and at 660, with the stop press on it', async () => {
    await lead()
    for (const width of [390, 660]) {
      await app.page.setViewportSize({ width, height: 972 })
      await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      // The lead is taken at once because this browser is following, so the page moves itself.
      await app.page.waitForSelector('.px-lead-following', { timeout: 30_000 })
      const took = await whatItTakes()
      expect(
        took.ofHeight,
        `at ${String(width)} the following box is ${String(took.wide)} by ${String(took.tall)}`,
      ).toBeLessThan(AT_MOST)
      expect(took.stop, `at ${String(width)} the stop press is not on screen`).toBe(true)
    }
  }, 180_000)

  it('folds the agent words behind a press, and one press brings them back', async () => {
    await app.page.setViewportSize({ width: 390, height: 972 })
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.waitForSelector('.px-lead-following', { timeout: 30_000 })

    const foldedAway = await app.page.locator('.px-lead-said').first().isVisible()
    expect(foldedAway, 'the agent words are on screen before anybody asked for them').toBe(false)

    await app.page.getByRole('button', { name: LEADING.whatItSaid }).first().click()
    await app.page.waitForSelector('.px-lead-said', { state: 'visible', timeout: 30_000 })
    expect(await app.page.locator('.px-lead-said').first().innerText()).toContain('Tell me if you agree')

    // Unfolded it is allowed to be big — the reader asked for it — and the stop press is still there.
    const open = await whatItTakes()
    expect(open.stop).toBe(true)

    await app.page.getByRole('button', { name: LEADING.foldItAway }).first().click()
    await app.page.waitForSelector('.px-lead-said', { state: 'hidden', timeout: 30_000 })
    const shut = await whatItTakes()
    expect(shut.ofHeight, `folded again it is ${String(shut.wide)} by ${String(shut.tall)}`).toBeLessThan(AT_MOST)
  }, 180_000)

  it('says the whole sentence on a wide screen, where there is room for it', async () => {
    await app.page.setViewportSize({ width: 1440, height: 972 })
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.waitForSelector('.px-lead-following', { timeout: 30_000 })
    const wide = await app.page.evaluate(() => {
      const stop = document.querySelector('.px-lead-stop')
      const words = document.querySelector('.px-lead-following .px-lead-said')
      const seen = (one: Element | null): boolean =>
        one !== null &&
        one.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
      return {
        stopSays: stop === null ? '' : (stop as HTMLElement).innerText.trim(),
        wordsOnScreen: seen(words),
        pressOnScreen: seen(document.querySelector('.px-lead-fold')),
      }
    })
    // The short word is drawn only where there is no room for the sentence, and the agent's words are not folded away.
    expect(wide.stopSays).toBe(LEADING.stopFollowing('Lead Bot'))
    expect(wide.wordsOnScreen).toBe(true)
    expect(wide.pressOnScreen).toBe(false)
  }, 120_000)

  it('names the press the same way at every width, so it is one control', async () => {
    await app.page.setViewportSize({ width: 390, height: 972 })
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.waitForSelector('.px-lead-following', { timeout: 30_000 })
    // WHAT IT IS CALLED OUT LOUD DOES NOT CHANGE WITH THE WIDTH. A narrow screen draws the short
    // word; the name anything reading the page hears is the whole sentence, at both widths.
    await expect(app.page.getByRole('button', { name: LEADING.stopFollowing('Lead Bot') })).toBeTruthy()
    const named = await app.page.getByRole('button', { name: LEADING.stopFollowing('Lead Bot') }).count()
    expect(named).toBe(1)
  }, 120_000)
})
