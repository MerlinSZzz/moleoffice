// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE WRITE SETTLES A FORK AT A TIME. While a close by a decision already made is saved, nothing on the decide form
 * beside it can write a decision. While a decision from that form is saved, nothing in the close block can close.
 *
 * Point 14 of the order of 7 November 2026: "Decide it" stays on while a close saves. Test it first, and fix it
 * only if it misbehaves. Each of the two blocks kept its own saving state, so neither knew the other was saving. With
 * the close held, in a browser against a server with a database of its own, round 223 measured four things:
 *   - "Decide it" pressed alone opened the form and wrote nothing. The close then settled the fork as chosen.
 *   - on the proposal's page, "Decide it", an option and its confirm press wrote a new decision, and then the held
 *     close was written too. The fork was settled by two decisions that took different options, and nothing on the
 *     page said so.
 *   - on the Decisions page's card, which opens with the options already pressable, an option and its confirm press
 *     did the same.
 *   - the other way round, with the decision held, a close was written, and then the decision was refused ("already
 *     settled, so nothing was written"). The refusal was drawn nowhere, because the form had been taken off the page.
 *
 * WHAT THIS FILE PROVES, on the made-up office:
 *   1. on the proposal's page, while a close is held, "Decide it" is off and says why when pressed, and opens nothing.
 *      The fork ends settled by the decision chosen, and no decision is written;
 *   2. on the Decisions page's card, with an option already taken, while a close is held, the confirm press is off
 *      and says why when pressed, and no decision is sent. The fork ends settled by the decision chosen, and no
 *      decision is written;
 *   3. on the proposal's page, while a decision from the form is held, the close block's "Close by this decision" is
 *      off, and pressing it sends no close. The fork ends settled by the new decision alone.
 * The write a case starts is held by the test, so the page is read while it is saved, and let go before the fork is
 * read.
 *
 * WHAT THIS DOES NOT SAY. Case 3 does not read the reason the close block's press gives. On this branch that press
 * gives none, so `Btn` says that the page does not say why. Round 222's branch gives it "This is being saved.".
 *
 * MUTATIONS in src/web/components/Governance.tsx, each after a control run:
 *   - "Decide it" no longer off while a close is saved (its `disabled={closing}` and its reason taken out) → case 1
 *     goes red;
 *   - the form's `busy` no longer counting the close (`settling.busy || closing` → `settling.busy`) → case 2 goes red,
 *     because pressing the off confirm press still submits the form and the decision is sent;
 *   - the close block's `busy` no longer counting the decision (`closing || deciding` → `closing`) → case 3 goes red.
 *
 * Everybody and everything here is made up.
 */
import type { Locator, Page, Request, Route } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { type LiveApp, liveApp, waitForThePage, governsTheWholeProject } from './helpers.ts'

let app: LiveApp
let page: Page

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify({ kind, title, data }) })
  if (!res.ok) throw new Error(`filing a ${kind} answered ${String(res.status)}: ${await res.text()}`)
  return ((await res.json()) as { record: { id: string } }).record.id
}

function aFork(title: string): Promise<string> {
  return file('proposal', title, {
    question: 'Which glaze goes on the spring batch?',
    options: ['The celadon', 'The tenmoku'],
    because: 'The kiln is booked for Friday.',
    who_settles_it: 'the owner',
  })
}

/** A decision the person made, naming the fork in its text, so the fork's panel offers to close by it. */
function aDecisionNaming(fork: string, title: string): Promise<string> {
  return file('decision', title, {
    ...governsTheWholeProject(), replaces: [],
    decided_by: 'the owner',
    authority: 'the owner said so',
    option_taken: `The celadon, as proposal ${fork} asked.`,
    because: 'Said at the bench on 3 October.',
  })
}

async function decisionsHeld(): Promise<number> {
  const res = await fetch(`${app.api}/api/records?kind=decision`, { headers: AS_THE_PERSON })
  if (!res.ok) throw new Error(`listing decisions answered ${String(res.status)}`)
  return ((await res.json()) as { records: unknown[] }).records.length
}

async function settledBy(fork: string): Promise<{ resolved: boolean; by: string[] }> {
  const res = await fetch(`${app.api}/api/records/${fork}`, { headers: AS_THE_PERSON })
  if (!res.ok) throw new Error(`reading the fork answered ${String(res.status)}`)
  const body = (await res.json()) as { resolution: { resolved: boolean; by: { id: string }[] } }
  return { resolved: body.resolution.resolved, by: body.resolution.by.map((d) => d.id) }
}

async function openTheRecord(id: string): Promise<void> {
  await page.goto(`${app.site}/#/r/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.px-gov-opt', { timeout: 30_000 })
}

/** Opens the Decisions page, then the card of the fork with this title, and waits until its list has been read. */
async function openTheCard(fork: string, title: string): Promise<Locator> {
  await page.goto(`${app.site}/#/decisions`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const card = page.locator('li.dq-tile').filter({ has: page.locator('button.dq-title', { hasText: title }) })
  await card.waitFor({ timeout: 30_000 })
  const read = page.waitForResponse((res) => res.url().endsWith(`/api/records/${fork}`), { timeout: 30_000 })
  await card.locator('summary.dq-decide-sum').click()
  await read
  await card.locator('.px-gov-opt').first().waitFor({ timeout: 30_000 })
  return card
}

const faults = () => page.locator('.fault')
const whatTheFaultSays = async () => (await faults().allInnerTexts()).join(' | ')
const isAClose = (request: Request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/links'
const isADecision = (request: Request) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/promote')

/** The write a case is holding and has not let go yet. */
let stillHeld: Route | null = null

/** Holds the page's next POST that `isIt` names until the case lets it go. */
async function holdTheNext(isIt: (request: Request) => boolean): Promise<{ held: Promise<Route>; done: () => Promise<void> }> {
  let caught: (route: Route) => void = () => undefined
  const held = new Promise<Route>((resolve) => {
    caught = resolve
  })
  const every = () => true
  const handler = async (route: Route) => {
    if (!isIt(route.request())) {
      await route.continue()
      return
    }
    stillHeld = route
    caught(route)
  }
  await page.route(every, handler)
  return { held, done: () => page.unroute(every, handler) }
}

/** Lets the held write go, and returns the status its own answer came back with. */
async function letItGo(route: Route, done: () => Promise<void>, isIt: (request: Request) => boolean): Promise<number> {
  const answered = page.waitForResponse((res) => isIt(res.request()), { timeout: 30_000 })
  stillHeld = null
  await route.continue()
  const status = (await answered).status()
  await done()
  return status
}

/** The request listeners this file added, taken off after each case. */
const counting: ((request: Request) => void)[] = []

/** Counts the requests `isIt` names from now on. */
function countFromNow(isIt: (request: Request) => boolean): () => number {
  let n = 0
  const listener = (request: Request) => {
    if (isIt(request)) n += 1
  }
  counting.push(listener)
  page.on('request', listener)
  return () => n
}

/** Chooses `chosen` in the close block and presses its confirm press with the close held. */
async function startTheClose(list: Locator, chosen: string): Promise<{ route: Route; done: () => Promise<void> }> {
  await list.locator('li', { hasText: chosen }).getByRole('button', { name: sayInEnglish('decisions.closeBy.pick') }).click()
  const { held, done } = await holdTheNext(isAClose)
  await list.locator('.px-gov-acts .px-btn[data-variant="primary"]').click()
  const route = await held
  await list.locator('.px-btn[data-pending="1"]').waitFor({ timeout: 30_000 })
  return { route, done }
}

const theConfirmPressIn = (where: Locator | Page) => where.locator('.px-gov-decide .px-gov-acts .px-btn[data-variant="primary"]')

beforeAll(async () => {
  app = await liveApp({ name: 'one-write-settles-a-fork', viewport: { width: 1440, height: 1000 } })
  page = app.page
}, 240_000)

// A CASE THAT GOES RED WHILE IT HOLDS A WRITE would leave the request held and the route in place, and every later
// page would wait for it. Both are let go here, whatever the case did.
afterEach(async () => {
  const route = stillHeld
  stillHeld = null
  if (route) await route.abort()
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  for (const listener of counting.splice(0)) page.off('request', listener)
})

afterAll(async () => {
  await app?.stop()
})

describe('one write settles a fork at a time', () => {
  it('1. on the proposal\'s page, while a close is saved, "Decide it" is off, says why, and opens nothing', async () => {
    const fork = await aFork('Which glaze for the first batch?')
    const chosen = await aDecisionNaming(fork, 'The first batch takes the celadon')
    const before = await decisionsHeld()
    await openTheRecord(fork)
    const list = page.locator('[data-testid="close-by-a-decision"]')
    const { route, done } = await startTheClose(list, 'The first batch takes the celadon')

    const decideIt = page.locator('.px-gov-decide').getByRole('button', { name: sayInEnglish('decisions.decide'), exact: true })
    expect(await decideIt.getAttribute('aria-disabled'), '"Decide it" is off while the close is saved').toBe('true')
    await decideIt.click({ force: true })
    expect(await page.locator('.px-gov-decide .px-why').innerText()).toBe(sayInEnglish('decisions.savingReason'))
    expect(await page.locator('.px-gov-decide[data-deciding="1"]').count(), 'the form did not open').toBe(0)

    expect(await letItGo(route, done, isAClose), 'the close is answered with success').toBeLessThan(300)
    await page.locator('.px-gov-settled-list').waitFor({ timeout: 30_000 })
    expect(await faults().count(), await whatTheFaultSays()).toBe(0)
    expect(await settledBy(fork)).toEqual({ resolved: true, by: [chosen] })
    expect(await decisionsHeld()).toBe(before)
  }, 180_000)

  it("2. on the Decisions page's card, while a close is saved, the confirm press of an option already taken is off, says why, and sends nothing", async () => {
    const title = 'Which glaze for the second batch?'
    const fork = await aFork(title)
    const chosen = await aDecisionNaming(fork, 'The second batch takes the celadon')
    const before = await decisionsHeld()
    const card = await openTheCard(fork, title)
    await card.locator('.px-gov-opt', { hasText: 'The tenmoku' }).locator('button').first().click()
    const confirm = theConfirmPressIn(card)
    await confirm.waitFor({ timeout: 30_000 })
    const list = card.locator('[data-testid="close-by-a-decision"]')
    const { route, done } = await startTheClose(list, 'The second batch takes the celadon')

    const decisionsSent = countFromNow(isADecision)
    // A PRESS THAT SENDS HAS SENT WITHIN MILLISECONDS of being pressed, and this waits three seconds from before it.
    const aDecisionWasSent = page.waitForRequest(isADecision, { timeout: 3_000 }).then(() => true, () => false)
    expect(await confirm.getAttribute('aria-disabled'), 'the confirm press is off while the close is saved').toBe('true')
    await confirm.click({ force: true })
    expect(await card.locator('.px-gov-decide .px-gov-acts .px-why').innerText()).toBe(sayInEnglish('decisions.savingReason'))
    expect(await aDecisionWasSent, 'no decision is sent while the close is saved').toBe(false)

    expect(await letItGo(route, done, isAClose), 'the close is answered with success').toBeLessThan(300)
    await card.waitFor({ state: 'detached', timeout: 30_000 })
    expect(await faults().count(), await whatTheFaultSays()).toBe(0)
    expect(decisionsSent()).toBe(0)
    expect(await settledBy(fork)).toEqual({ resolved: true, by: [chosen] })
    expect(await decisionsHeld()).toBe(before)
  }, 180_000)

  it('3. on the proposal\'s page, while a decision from the form is saved, "Close by this decision" is off and sends nothing', async () => {
    const fork = await aFork('Which glaze for the third batch?')
    const named = await aDecisionNaming(fork, 'The third batch takes the celadon')
    const before = await decisionsHeld()
    await openTheRecord(fork)
    await page.locator('.px-gov-decide').getByRole('button', { name: sayInEnglish('decisions.decide'), exact: true }).click()
    await page.locator('.px-gov-opt', { hasText: 'The tenmoku' }).locator('button').first().click()
    const { held, done } = await holdTheNext(isADecision)
    await theConfirmPressIn(page).click()
    const route = await held
    await page.locator('.px-gov-decide .px-btn[data-pending="1"]').waitFor({ timeout: 30_000 })

    const closesSent = countFromNow(isAClose)
    const list = page.locator('[data-testid="close-by-a-decision"]')
    const pick = list.locator('li', { hasText: 'The third batch takes the celadon' }).getByRole('button', { name: sayInEnglish('decisions.closeBy.pick') })
    expect(await pick.getAttribute('aria-disabled'), '"Close by this decision" is off while the decision is saved').toBe('true')
    await pick.click({ force: true })
    expect(await list.locator('.px-gov-acts').count(), 'no close was chosen').toBe(0)
    expect(closesSent(), 'no close is sent while the decision is saved').toBe(0)

    expect(await letItGo(route, done, isADecision), 'the decision is answered with success').toBeLessThan(300)
    await page.locator('.px-gov-settled-list').waitFor({ timeout: 30_000 })
    expect(await faults().count(), await whatTheFaultSays()).toBe(0)
    expect(closesSent()).toBe(0)
    const after = await settledBy(fork)
    expect(after.resolved).toBe(true)
    expect(after.by).toHaveLength(1)
    expect(after.by).not.toContain(named)
    expect(await decisionsHeld()).toBe(before + 1)
  }, 180_000)
})
