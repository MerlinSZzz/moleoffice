// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S WAITING ROW OPENS ITS RECORD WITH ONE PRESS; SETTLEMENT LIVES ON THE GOVERNANCE PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A BROWSER TEST AND NOT A RENDER TEST
 * ---------------------------------------------------------------------------------------
 *
 * Needs you shows each row from GET /api/waiting as one link. The link opens the kind of object the
 * row names; the person settles a proposal from the Governance page that owns that act. This file
 * keeps the browser proof of the page that writes the decision and checks Home only navigates.
 *
 * ---------------------------------------------------------------------------------------
 * IT SETTLES A FORK OF ITS OWN, IN A DATABASE OF ITS OWN, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * Settling a fork is the one act Mole Office reserves to a person. An agent driving a browser is still
 * an agent, so a run of this against the owner's corpus would leave a decision behind that says a
 * person answered a question no person answered. `liveApp` gives this file its own empty Mole Office in
 * a temporary directory, and the six forks it settles are six it filed itself, seconds earlier.
 * Nothing here can touch anybody's real queue.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH TEST BELOW WOULD CATCH
 * ---------------------------------------------------------------------------------------
 *
 *   1. Home draws each waiting proposal once, at most NEEDS_SHOWN of them, and builds no decision form. The
 *      Needs you page draws all six, because a decision cut Home's rows to five.
 *   2. The queue page draws all six, each still folded. Draw the forms there and the count of
 *      pressable options stops being nought.
 *   3. One press on a Home row opens its own record instead of an embedded form.
 *   4. The governance form writes the decision, the server holds it, and the card leaves the queue.
 *
 * The order matters: the fourth test takes a fork out of the queue, so it runs last.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ForksReply } from '../src/server/api/forks.ts'
import { NEEDS_SHOWN } from '../src/web/components/home/HomeSections.tsx'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * SIX FORKS, WHICH IS MORE THAN HOME DRAWS. Four would prove nothing about a cap of four.
 * They are filed oldest-first so the queue's order is settled and this file can name a card.
 */
const HOW_MANY = 6

/** The reason a person types into the box. Distinctive, so the stored decision can be found by it. */
const BECAUSE = 'Settled by hand on the Governance page in a browser against an empty test database.'

let app: LiveApp
let page: Page
const forkIds: string[] = []

beforeAll(async () => {
  app = await liveApp({ name: 'settle-by-hand', viewport: { width: 1440, height: 1000 } })
  page = app.page

  // AN AGENT FILES THE FORK, WHICH IS WHO FILES THEM. It may not settle one; that is the guard this
  // file then exercises from the other side, as a person, in the browser.
  for (let i = 0; i < HOW_MANY; i += 1) {
    const res = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'claude-code',
      },
      body: JSON.stringify({
        kind: 'proposal',
        title: `Fork number ${String(i)}: which way should the gripper approach?`,
        data: {
          question: `Should approach ${String(i)} come from above or from the side?`,
          options: ['a — from above', 'b — from the side'],
          recommendation: 'Take (a), because the bench camera can see the tag from above.',
          because: 'Two runs disagreed and nobody wrote down which one was believed.',
          // HANDED UP BY THE AGENT THAT FILED IT, which is what puts a fork on the person's queue since
          // 3 September 2026. A fork an agent files says "an agent" unless the agent names somebody
          // else — an engineering question is the agent's,
          // `design/messages/ACCEPTANCE.md` W3 — and a fork that says "an agent" is deliberately not
          // on the person's list. This whole file is about the forks that ARE.
          who_settles_it: 'the owner',
        },
      }),
    })
    if (!res.ok) throw new Error(`filing a fork answered ${String(res.status)}: ${await res.text()}`)
    const filed = (await res.json()) as { record: { id: string } }
    forkIds.push(filed.record.id)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * What is on the page that a form would have put there. Nought is the claim this pass makes.
 *
 * `options` COUNTS THE BUTTONS THE OPTION CARDS BECAME on 6 September 2026: the options A to D of a
 * decision are pressed directly and change colour once chosen, criterion M57. It used to count radios.
 * `radios` is kept beside it at nought so that the mechanism it replaced cannot come back unseen.
 */
async function formParts(): Promise<{
  options: number
  radios: number
  textareas: number
  submits: number
  tiles: number
}> {
  return page.evaluate(() => ({
    options: document.querySelectorAll('main.page button.px-gov-opt-inner').length,
    radios: document.querySelectorAll('main.page input[type=radio]').length,
    textareas: document.querySelectorAll('main.page textarea').length,
    submits: [...document.querySelectorAll('main.page button')].filter(
      (b) => (b.textContent ?? '').trim() === 'Record this decision',
    ).length,
    tiles: document.querySelectorAll('li.dq-tile').length,
  }))
}

/**
 * A PAGE, DRAWN FROM NOTHING.
 *
 * IT LOADS THE ADDRESS AND THEN RELOADS IT, and the second half is not belt and braces. Going to an
 * address that differs from the current one only after the `#` is a move within the same document:
 * the browser does not draw the page again, so a fold a previous test opened is still open and the
 * next press CLOSES it. That cost twenty minutes; the reload is what makes each test below start
 * from a page nobody has touched.
 */
async function open(route: string, readySelector = 'li.dq-tile'): Promise<void> {
  await page.goto(`${app.site}/${route}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector(readySelector, { timeout: 30_000 })
  await sleep(400)
}

describe('Home points each waiting row to the page that owns it', () => {
  it('draws each proposal once and builds no decision form on the page', async () => {
    await open('#/', '[data-home-waiting-id]')
    const parts = await formParts()
    expect(parts.tiles, 'Home still embeds the queue cards').toBe(0)
    expect(parts.options).toBe(0)
    expect(parts.radios).toBe(0)
    expect(parts.textareas).toBe(0)
    expect(parts.submits).toBe(0)
    expect(HOW_MANY, 'the office holds more forks than Home draws, so the cut is tried').toBeGreaterThan(NEEDS_SHOWN)
    expect(await page.locator('[data-home-waiting-id]').count()).toBe(NEEDS_SHOWN)
    await open('#/needs-you', '[data-home-waiting-id]')
    expect(await page.locator('[data-home-waiting-id]').count(), 'the Needs you page draws every fork').toBe(HOW_MANY)
    expect(await formParts()).toMatchObject({ tiles: 0, options: 0, radios: 0, textareas: 0, submits: 0 })
  }, 60_000)

  it('uses one press to open the proposal record', async () => {
    await open('#/', '[data-home-waiting-id]')
    const first = page.locator('[data-home-waiting-id]').first()
    const href = await first.getAttribute('href')
    expect(href).toMatch(/^#\//)
    await first.click()
    await page.waitForFunction((expected) => location.hash === expected, href)
    expect(await formParts()).toMatchObject({ options: 0, radios: 0, textareas: 0, submits: 0 })
  }, 60_000)

  it('draws every fork on the queue page, each still folded', async () => {
    await open('#/governance')
    const parts = await formParts()
    expect(parts.tiles, 'the dedicated page is the one that shows all of them').toBe(HOW_MANY)
    expect(parts.options, 'the queue page built its forms eagerly').toBe(0)
    expect(parts.radios, 'the queue page built its forms eagerly').toBe(0)
    expect(parts.textareas).toBe(0)
  }, 60_000)
})

describe('one press from Needs you opens the proposal record', () => {
  it('opens a proposal record without building a settlement form on Home', async () => {
    await open('#/', '[data-home-waiting-id]')
    const row = page.locator('[data-home-waiting-id]').first()
    const id = await row.getAttribute('data-home-waiting-id')
    expect(forkIds, 'the waiting row is not one of this test office’s proposals').toContain(id)
    const href = await row.getAttribute('href')
    await row.click()
    await page.waitForFunction((expected) => location.hash === expected, href)
    expect(await formParts()).toMatchObject({ tiles: 0, options: 0, radios: 0, textareas: 0, submits: 0 })
  }, 120_000)
})

/**
 * WHAT A REFUSED GOVERNANCE ACT LOOKS LIKE ON THE PAGE, AND IN THE REPLY. Criterion M43.
 *
 * After a press of Decide on another machine, the box was headed "Nothing was recorded." It should be
 * headed Error, with a very short reason under it. The old heading did not say it was an
 * error, and the box carried five sentences where one line does.
 *
 * THE REFUSAL IS REACHED THE WAY A PERSON REACHES IT: the browser is switched to write as an agent,
 * which is what the actor picker in the sidebar does, and then the same press is made. Nothing here
 * fakes a reply.
 */
describe('a refused governance act is headed Error and gives one short reason', () => {
  /** The one short sentence the door writes beside the long one. Read off the reply, not typed here. */
  let reasonFromTheDoor = ''

  it('sends a short reason beside the whole refusal', async () => {
    const fork = forkIds[forkIds.length - 1]
    const refused = await fetch(`${app.api}/api/records/${String(fork)}/promote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'claude-code',
      },
      body: JSON.stringify({ title: 'Take (a)', data: { option_index: 0, because: 'because' } }),
    })
    expect(refused.status).toBe(403)
    const said = (await refused.json()) as { error?: string; reason?: string }

    // ONE SHORT SENTENCE, AND THE WHOLE REFUSAL IS STILL THERE. Neither replaces the other.
    expect(said.reason, 'the door sent no short reason').toBeTruthy()
    expect((said.reason ?? '').length, 'the short reason is not short').toBeLessThan(90)
    expect(said.error ?? '', 'the whole refusal was dropped').toContain('Nothing was written')
    expect((said.error ?? '').length, 'the whole refusal is no longer than the short one').toBeGreaterThan(
      (said.reason ?? '').length,
    )
    reasonFromTheDoor = said.reason ?? ''
  }, 60_000)

  it('draws Error, the one short reason, and the whole refusal one press away', async () => {
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await page.evaluate(() => {
      window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'claude-code' }))
    })
    try {
      await open('#/governance')
      const card = page.locator('li.dq-tile').first()
      await card.locator('summary.dq-decide-sum').click()
      await page.waitForSelector('li.dq-tile button.px-gov-opt-inner', { timeout: 15_000 })
      await card.locator('textarea').first().fill('Pressed while the browser was writing as an agent.')
      // BOTH PRESSES, because both presses are what settling a fork is now. Criterion P89.
      await card.locator('button.px-gov-opt-inner').first().click()
      const confirm = card.locator('.px-gov-acts button.px-btn', { hasText: 'Decide ' }).first()
      await confirm.waitFor({ state: 'visible', timeout: 15_000 })
      await confirm.click()
      await card.locator('.px-error').waitFor({ timeout: 30_000 })

      // HEADED "Error". The old heading was "Nothing was recorded."
      expect((await card.locator('.px-error strong').first().innerText()).trim()).toBe('Error')

      // AND ONE SHORT REASON UNDER IT, which is the door's own sentence and not a shortening the
      // page worked out. The fold is closed, so what is on screen is the short one alone.
      const shown = (await card.locator('.px-error .px-error-msg').first().innerText()).trim()
      expect(shown.split('\n')[0]).toBe(reasonFromTheDoor)

      // AND THE WHOLE REFUSAL IS ONE PRESS AWAY, unedited. It is folded until it is pressed, which
      // is why the sentence above is the short one alone.
      expect(await card.locator('.px-error .px-error-sum').first().innerText()).toBe('The whole refusal')
      expect(
        await card.locator('.px-error .px-error-long').first().isVisible(),
        'the whole refusal was on the box before anybody asked for it',
      ).toBe(false)
      await card.locator('.px-error .px-error-sum').first().click()
      const whole = (await card.locator('.px-error .px-error-long').first().innerText()).trim()
      expect(whole, 'the door whole refusal is not on the box').toContain('Nothing was written')
    } finally {
      // AND THE BROWSER IS THE PERSON AGAIN, so nothing after this file inherits an agent.
      await page.evaluate(() => {
        window.localStorage.removeItem('mole-office.actor')
      })
    }
  }, 120_000)
})
