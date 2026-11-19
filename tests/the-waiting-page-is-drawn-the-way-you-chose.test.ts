// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITING-ON-YOU PAGE IS DRAWN AS THE PERSON SET IT — CRITERION P54, IN A BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET
 * ---------------------------------------------------------------------------------------
 *
 * THE DEFECT: the decisions page had turned into a list view, for no reason anyone could see. There
 * used to be a setting for it, and it could go in Settings.
 *
 * Two things had made it a list and neither was a setting. A fork was drawn as a card and everything
 * else as a row, so settling the last fork left only rows; and the control that chooses the order
 * was drawn only when two or more forks were waiting, so it disappeared at the same moment.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED HERE, IN A REAL BROWSER, ON A REAL SERVER
 * ---------------------------------------------------------------------------------------
 *
 *   · with the choice set to cards, everything waiting is a card — the fork AND the question an
 *     agent asked, which used to be a row whatever anybody chose;
 *   · with the choice set to a list, everything is a row, the fork included;
 *   · the order control is on the page with ONE fork waiting, which is where it used to vanish;
 *   · the Settings page carries the control, with both answers on it, and nothing on the
 *     Waiting-on-you page changes it — the setting is to live in Settings.
 *
 * THE SETTING IS WRITTEN INTO THE STORE THE APP ITSELF READS and the page is then loaded fresh, so
 * nothing here reaches past the product into a component.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `GovernancePage` ignore `view.view` and always build `asCards` → the list case goes red:
 *     the fork is a card whatever was chosen.
 *   draw `asRows` through `WaitingRow` in both views → the cards case goes red: the question an
 *     agent asked is a row while the setting says cards.
 *   put `asCards.length > 1` back in front of the order control → the one-fork case goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { QUEUE_VIEW_KEY, QUEUE_VIEW_WORDS } from '../src/web/lib/queueview.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_AN_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'lead-bot',
}

/** The one fork waiting on the owner: one is the count the control used to disappear at. */
const THE_FORK = 'Should a step carry its own lifecycle word'
/** The one question an agent asked the owner, which used to be a row whatever the setting said. */
const THE_QUESTION = 'The seed corpus dates are fixed and the window has closed'

async function file(headers: Record<string, string>, body: unknown): Promise<void> {
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, `${String(reply.status)} ${await reply.text()}`).toBe(true)
}

/** Load `#/governance` with the view already chosen, and hand back what is on the screen. */
async function theQueueWith(view: string): Promise<{ cards: string[]; rows: string[]; orderControls: number }> {
  await app.page.goto(`${app.site}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await app.page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string)
    },
    [QUEUE_VIEW_KEY, view] as const,
  )
  await app.page.goto(`${app.site}/#/governance`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  // The forks reply arrives after the first paint, so the cards appear on a second render.
  await app.page.waitForTimeout(600)
  return await app.page.evaluate(() => ({
    cards: [...document.querySelectorAll('.dq-tile')].map((one) => (one as HTMLElement).innerText),
    rows: [...document.querySelectorAll('.gq-row')].map((one) => (one as HTMLElement).innerText),
    orderControls: document.querySelectorAll('[data-target="uiSurface/governance.order"]').length,
  }))
}

beforeAll(async () => {
  app = await liveApp({ name: 'queue-view', viewport: { width: 1440, height: 1200 }, workspace: 'default' })
  // THE AGENT THAT FILES THE TWO ROWS IS REGISTERED FIRST. The records door refuses a write under an
  // agent id no registry row holds, and `lead-bot` files both the fork and the question below.
  const registered = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ handle: 'lead-bot', name: 'Lead Bot' }),
  })
  if (!registered.ok) throw new Error(`registering lead-bot answered ${String(registered.status)}: ${await registered.text()}`)
  // ONE FORK ONLY THE PERSON MAY SETTLE. One is the count the order control used to vanish at.
  await file(AS_AN_AGENT, {
    kind: 'proposal',
    title: THE_FORK,
    data: {
      question: 'Should a step carry its own lifecycle word, or should it be computed?',
      options: ['Store the word on the step.', 'Compute it from the checklist.'],
      who_settles_it: 'the owner',
    },
  })
  // AND ONE QUESTION AN AGENT ASKED THE OWNER. `lead-bot` is in no registry, so nothing records a starter
  // for it and the question reaches the owner as it always did — criterion P55's own answer for that case,
  // which is what makes this row a row on the owner's list at all.
  await file(AS_AN_AGENT, {
    kind: 'problem',
    title: THE_QUESTION,
    data: { whose_move: 'person', symptom: 'every seeded run is red from 17:00' },
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the page draws what the owner chose', () => {
  it('draws everything as a card when the owner chose cards, the agent question included', async () => {
    const screen = await theQueueWith('cards')
    expect(screen.cards.some((one) => one.includes(THE_FORK)), 'the fork was not a card').toBe(true)
    expect(
      screen.cards.some((one) => one.includes(THE_QUESTION)),
      'the question an agent asked was not a card',
    ).toBe(true)
    expect(screen.rows.length, `rows were drawn as well: ${screen.rows.join(' | ')}`).toBe(0)
  })

  it('draws everything as a row when the owner chose a list, the fork included', async () => {
    const screen = await theQueueWith('list')
    expect(screen.rows.some((one) => one.includes(THE_FORK)), 'the fork was not a row').toBe(true)
    expect(screen.rows.some((one) => one.includes(THE_QUESTION)), 'the question was not a row').toBe(true)
    expect(screen.cards.length, `cards were drawn as well: ${screen.cards.join(' | ')}`).toBe(0)
  })

  it('keeps the order control on the page with one fork waiting', async () => {
    expect((await theQueueWith('cards')).orderControls).toBe(1)
    expect((await theQueueWith('list')).orderControls).toBe(1)
  })
})

describe('the choice is made in Settings and nowhere else', () => {
  it('is on the Settings page, with both answers on it', async () => {
    await app.page.goto(`${app.site}/#/settings/queueview`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const panel = await app.page.evaluate(() => {
      const found = document.querySelector('[data-target="uiSurface/settings.queueview"]')
      return found === null ? null : (found as HTMLElement).innerText
    })
    expect(panel, 'the Waiting on you setting is not on the Settings page').not.toBeNull()
    expect(panel).toContain(QUEUE_VIEW_WORDS.cards)
    expect(panel).toContain(QUEUE_VIEW_WORDS.list)
  })

  it('is not offered a second time on the Waiting-on-you page', async () => {
    await app.page.goto(`${app.site}/#/governance`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const here = await app.page.evaluate(
      () => document.querySelectorAll('[data-target="uiSurface/settings.queueview"]').length,
    )
    expect(here, 'the setting is drawn twice, which is one setting in two places').toBe(0)
  })
})
