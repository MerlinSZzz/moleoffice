// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DECISION PRESSES SAY WHY THEY WAIT, AND THE PAGE STANDS WHILE ONE IS SAVED.
 *
 * A press drawn off with no reason stops the whole page: `Btn` throws while drawing, and the page's one fault boundary
 * draws the fault where the page was. Four presses on a fork and on a decision were drawn that way.
 *   - Closing a fork by a decision already made: while the close is saved, the other decisions' "Close by this decision"
 *     and the "Change the choice" press were drawn off with no reason. The close was written, and the page said it had
 *     failed. The proposal's own page and the card on the Decisions page draw the same block.
 *   - A decision's "Add words": the press is off until words are typed, with no reason, so opening the form stopped the
 *     page.
 *   - A decision's "Choose again": the press is off until an option is taken, with no reason, so opening the form stopped
 *     the page. Its "None of these" card drew no line for the person's own answer, so a press after taking it wrote
 *     nothing and said nothing.
 *
 * WHAT THIS FILE PROVES, in a real browser against a real server with a database of its own:
 *   1. on the proposal's page, with two decisions and with one, the page stands while the close is held; every other
 *      press in the block is off and says why when pressed; the fork ends settled by the chosen decision, and no new
 *      decision is written;
 *   2. the same on the Decisions page's card, with two decisions and with one;
 *   3. on a decision's page, "Add words" opens without stopping the page, says why it is off while the box is empty, and
 *      once words are typed adds them;
 *   4. "Choose again" opens without stopping the page, says why it is off until an option is taken, and once one is taken
 *      writes a new decision that supersedes this one;
 *   5. "Choose again" with "None of these" draws a line for the person's own answer, says why it is off while the line is
 *      empty, and once it is written writes a new decision taking those words.
 * The close request (POST /api/links) is held by the test, so the page is read while it saves, and released before the
 * fork is read.
 *
 * MUTATIONS, each after a control run:
 *   - the reason taken off the other decisions' "Close by this decision" → the two two-decision cases go red;
 *   - the reason taken off "Change the choice" → all four close cases go red;
 *   - the reason "Add words" gives while its box is empty taken off → case 3 goes red;
 *   - the reason "Choose again" gives before an option is taken taken off → cases 4 and 5 go red;
 *   - the own answer no longer handed to the write → case 5 goes red.
 * With DECISION_PRESSES_SHOTS set to a folder, it also photographs the proposal's page and the Decisions page's card
 * while a close is held, and a decision's page with "None of these" taken, at 1440, 990, 660 and 390, light and dark, in
 * English, and checks nothing is drawn wider than the window.
 *
 * Everybody and everything here is made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page, Route } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

let app: LiveApp
let page: Page

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ kind, title, data }),
  })
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

/** A decision the person made, naming the fork in its text. */
function aDecisionNaming(fork: string, title: string): Promise<string> {
  return file('decision', title, {
    replaces: [],
    decided_by: 'the owner',
    authority: 'the owner said so',
    option_taken: `The celadon, as proposal ${fork} asked.`,
    because: 'Said at the bench on 3 October.',
  })
}

/** A decision made from the fork by the person's press, so its page offers to choose again. */
async function aDecisionMadeFrom(fork: string): Promise<string> {
  const res = await fetch(`${app.api}/api/records/${fork}/promote`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      title: 'The spring batch takes the celadon',
      data: { option_taken: 'The celadon', option_index: 0, because: 'Said at the bench on 3 October.' },
    }),
  })
  if (res.status !== 201) throw new Error(`deciding the fork answered ${String(res.status)}: ${await res.text()}`)
  return ((await res.json()) as { decision: { id: string } }).decision.id
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

async function readTheDecision(id: string): Promise<{ replacedBy: string | null; taken: unknown }> {
  const res = await fetch(`${app.api}/api/records/${id}`, { headers: AS_THE_PERSON })
  if (!res.ok) throw new Error(`reading the decision answered ${String(res.status)}`)
  const body = (await res.json()) as { record: { data: Record<string, unknown> }; replacedBy?: { id: string } | null }
  return { replacedBy: body.replacedBy?.id ?? null, taken: body.record.data['option_taken'] }
}

async function openTheRecord(id: string, drawn: string): Promise<void> {
  await page.goto(`${app.site}/#/r/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector(drawn, { timeout: 30_000 })
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

/** The close request a case is holding and has not let go yet. */
let stillHeld: Route | null = null

/** Holds the page's next close request until the test lets it go. */
async function holdTheClose(): Promise<{ held: Promise<Route>; done: () => Promise<void> }> {
  let caught: (route: Route) => void = () => undefined
  const held = new Promise<Route>((resolve) => {
    caught = resolve
  })
  const isTheClose = (url: URL) => url.pathname === '/api/links'
  const handler = async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    stillHeld = route
    caught(route)
  }
  await page.route(isTheClose, handler)
  return { held, done: () => page.unroute(isTheClose, handler) }
}

/**
 * Chooses `chosen` in the block, presses the confirm press with the close held, and checks the page while it saves.
 * Returns the held close request.
 */
async function closeWhileHeld(list: Locator, chosen: string, others: readonly string[]): Promise<{ route: Route; done: () => Promise<void> }> {
  await list.locator('li', { hasText: chosen }).getByRole('button', { name: sayInEnglish('decisions.closeBy.pick') }).click()
  const confirm = list.locator('.px-gov-acts .px-btn[data-variant="primary"]')
  expect(await confirm.textContent()).toContain(chosen)

  const { held, done } = await holdTheClose()
  await confirm.click()
  const route = await held
  // THE PAGE IS DRAWN AGAIN WHILE IT SAVES: either the press is marked as saving, or the page has stopped.
  await page.locator('.fault, [data-testid="close-by-a-decision"] .px-btn[data-pending="1"]').first().waitFor({ timeout: 30_000 })
  expect(await faults().count(), `the page stands while the close is saved; it says: ${await whatTheFaultSays()}`).toBe(0)

  // EVERY OTHER PRESS IN THE BLOCK IS OFF, AND SAYS WHY WHEN PRESSED.
  for (const other of others) {
    const row = list.locator('li', { hasText: other })
    const pick = row.getByRole('button', { name: sayInEnglish('decisions.closeBy.pick') })
    expect(await pick.getAttribute('aria-disabled'), `"${other}" cannot be chosen while the close is saved`).toBe('true')
    await pick.click({ force: true })
    expect(await row.locator('.px-why').innerText()).toBe(sayInEnglish('decisions.savingReason'))
  }
  const back = list.getByRole('button', { name: sayInEnglish('decisions.changeChoice'), exact: true })
  expect(await back.getAttribute('aria-disabled'), 'the choice cannot be changed while the close is saved').toBe('true')
  await back.click({ force: true })
  expect(await list.locator('.px-gov-acts .px-why').innerText()).toBe(sayInEnglish('decisions.savingReason'))
  return { route, done }
}

/** Lets the held close go, and waits for its own answer. */
async function letItGo(route: Route, done: () => Promise<void>): Promise<void> {
  const answered = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/links',
    { timeout: 30_000 },
  )
  stillHeld = null
  await route.continue()
  expect((await answered).status(), 'the close request is answered with success').toBeLessThan(300)
  await done()
}

const theListIn = (where: Locator | Page) => where.locator('[data-testid="close-by-a-decision"]')
const thePanel = () => page.locator('.px-gov-m83')
const theForm = () => thePanel().locator('.px-gov-m83-form')

/** Presses one of the decision panel's two closed presses, and checks the form it opens did not stop the page. */
async function openTheForm(press: string): Promise<Locator> {
  await thePanel().getByRole('button', { name: press, exact: true }).click()
  await page.locator('.fault, .px-gov-m83-form').first().waitFor({ timeout: 30_000 })
  expect(await faults().count(), `the form opens and the page stands; it says: ${await whatTheFaultSays()}`).toBe(0)
  return theForm()
}

/** Presses the form's own press while it is off, and returns what it says. */
async function whyItIsOff(form: Locator, press: string): Promise<string> {
  const off = form.getByRole('button', { name: press, exact: true })
  expect(await off.getAttribute('aria-disabled'), `"${press}" is off`).toBe('true')
  await off.click({ force: true })
  return form.locator('.px-why').innerText()
}

beforeAll(async () => {
  app = await liveApp({ name: 'decision-presses', viewport: { width: 1440, height: 1000 } })
  page = app.page
}, 240_000)

// A CASE THAT GOES RED WHILE IT HOLDS THE CLOSE would leave the request held and the route in place, and every later
// page would wait for it. Both are let go here, whatever the case did.
afterEach(async () => {
  const route = stillHeld
  stillHeld = null
  if (route) await route.abort()
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

afterAll(async () => {
  await app?.stop()
})

describe('closing a fork by a decision already made, while it saves', () => {
  for (const many of [2, 1]) {
    it(`on the proposal's page, with ${String(many)} decision${many === 1 ? '' : 's'}: the page stands and the fork is settled by the one chosen`, async () => {
      const fork = await aFork(`Which glaze for batch ${String(many)} on its page?`)
      const titles = ['The batch takes the celadon', 'The batch takes the tenmoku'].slice(0, many)
      const ids: string[] = []
      for (const title of titles) ids.push(await aDecisionNaming(fork, title))
      const before = await decisionsHeld()

      await openTheRecord(fork, '.px-gov-opt')
      const list = theListIn(page)
      await list.waitFor({ timeout: 30_000 })
      const { route, done } = await closeWhileHeld(list, titles[0] as string, titles.slice(1))
      await letItGo(route, done)

      // THE PANEL IS DRAWN AGAIN AS SETTLED, and nothing stopped the page.
      await page.locator('.px-gov-settled-list').waitFor({ timeout: 30_000 })
      expect(await faults().count(), await whatTheFaultSays()).toBe(0)
      expect(await settledBy(fork)).toEqual({ resolved: true, by: [ids[0]] })
      expect(await decisionsHeld()).toBe(before)
    }, 180_000)

    it(`on the Decisions page's card, with ${String(many)} decision${many === 1 ? '' : 's'}: the page stands and the fork is settled by the one chosen`, async () => {
      const title = `Which glaze for batch ${String(many)} on the list?`
      const fork = await aFork(title)
      const titles = ['The batch takes the celadon', 'The batch takes the tenmoku'].slice(0, many)
      const ids: string[] = []
      for (const one of titles) ids.push(await aDecisionNaming(fork, one))
      const before = await decisionsHeld()

      const card = await openTheCard(fork, title)
      const list = theListIn(card)
      await list.waitFor({ timeout: 30_000 })
      const { route, done } = await closeWhileHeld(list, titles[0] as string, titles.slice(1))
      await letItGo(route, done)

      // THE QUEUE IS READ AGAIN, AND A SETTLED FORK IS NO LONGER ON IT.
      await card.waitFor({ state: 'detached', timeout: 30_000 })
      expect(await faults().count(), await whatTheFaultSays()).toBe(0)
      expect(await settledBy(fork)).toEqual({ resolved: true, by: [ids[0]] })
      expect(await decisionsHeld()).toBe(before)
    }, 180_000)
  }
})

describe("a decision's own presses", () => {
  it('"Add words" opens, says why it is off while the box is empty, and adds the words once typed', async () => {
    const decision = await aDecisionMadeFrom(await aFork('Which glaze for the words batch?'))
    await openTheRecord(decision, '.px-gov-m83')
    const press = sayInEnglish('decisions.addWords')
    const form = await openTheForm(press)
    expect(await whyItIsOff(form, press)).toBe(sayInEnglish('decisions.addWordsFirst'))

    const words = 'The kiln ran ten degrees hot.'
    await form.locator('textarea').fill(words)
    const save = form.getByRole('button', { name: press, exact: true })
    await expect.poll(() => save.getAttribute('aria-disabled'), { timeout: 10_000 }).toBeNull()
    const patched = page.waitForResponse(
      (res) => res.request().method() === 'PATCH' && new URL(res.url()).pathname === `/api/records/${decision}`,
      { timeout: 30_000 },
    )
    await save.click()
    expect((await patched).status(), 'the words are saved').toBeLessThan(300)
    await page.locator('.px-gov-since-words', { hasText: words }).waitFor({ timeout: 30_000 })
    expect(await faults().count(), await whatTheFaultSays()).toBe(0)
  }, 180_000)

  it('"Choose again" opens, says why it is off until an option is taken, and writes a decision that supersedes this one', async () => {
    const decision = await aDecisionMadeFrom(await aFork('Which glaze for the choose-again batch?'))
    await openTheRecord(decision, '.px-gov-m83')
    const press = sayInEnglish('decisions.chooseAgain')
    const form = await openTheForm(press)
    expect(await whyItIsOff(form, press)).toBe(sayInEnglish('decisions.chooseAgainFirst'))

    await form.locator('.px-gov-opt', { hasText: 'The tenmoku' }).locator('button').click()
    await form.locator('textarea').fill('The celadon ran out.')
    const write = form.getByRole('button', { name: press, exact: true })
    await expect.poll(() => write.getAttribute('aria-disabled'), { timeout: 10_000 }).toBeNull()
    const written = page.waitForResponse(
      (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === `/api/records/${decision}/choose-again`,
      { timeout: 30_000 },
    )
    await write.click()
    const answer = await written
    expect(answer.status(), 'the new decision is written').toBe(201)
    const newer = ((await answer.json()) as { decision: { id: string } }).decision.id

    await page.locator('.px-gov-superseded').waitFor({ timeout: 30_000 })
    expect(await faults().count(), await whatTheFaultSays()).toBe(0)
    expect((await readTheDecision(decision)).replacedBy).toBe(newer)
    expect((await readTheDecision(newer)).taken).toBe('The tenmoku')
  }, 180_000)

  it('"Choose again" with "None of these" asks for the own answer, says why it is off while it is empty, and writes it', async () => {
    const decision = await aDecisionMadeFrom(await aFork('Which glaze for the bare batch?'))
    await openTheRecord(decision, '.px-gov-m83')
    const press = sayInEnglish('decisions.chooseAgain')
    const form = await openTheForm(press)

    await form.locator('.px-gov-opt', { hasText: sayInEnglish('decisions.takeNone') }).locator('button').click()
    const own = form.getByLabel(sayInEnglish('decisions.ownAnswer'))
    await own.waitFor({ timeout: 10_000 })
    expect(await whyItIsOff(form, press)).toBe(sayInEnglish('decisions.writeOwn'))

    const ownWords = 'We fire this batch bare.'
    await own.fill(ownWords)
    const write = form.getByRole('button', { name: press, exact: true })
    await expect.poll(() => write.getAttribute('aria-disabled'), { timeout: 10_000 }).toBeNull()
    const written = page.waitForResponse(
      (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === `/api/records/${decision}/choose-again`,
      { timeout: 30_000 },
    )
    await write.click()
    const answer = await written
    expect(answer.status(), 'the new decision is written').toBe(201)
    const newer = ((await answer.json()) as { decision: { id: string } }).decision.id

    await page.locator('.px-gov-superseded').waitFor({ timeout: 30_000 })
    expect(await faults().count(), await whatTheFaultSays()).toBe(0)
    expect((await readTheDecision(decision)).replacedBy).toBe(newer)
    expect((await readTheDecision(newer)).taken).toBe(ownWords)
  }, 180_000)
})

describe.skipIf(!process.env['DECISION_PRESSES_SHOTS'])('the pictures', () => {
  it('photographs the three screens at 1440, 990, 660 and 390, light and dark', async () => {
    const shots = process.env['DECISION_PRESSES_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const title = 'Which glaze for the autumn batch?'
    const fork = await aFork(title)
    const titles = ['The autumn celadon', 'The autumn tenmoku']
    for (const one of titles) await aDecisionNaming(fork, one)
    const decision = await aDecisionMadeFrom(await aFork('Which glaze for the winter batch?'))

    const measured = async (width: number, theme: string, name: string) => {
      expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
      expect(await faults().count(), await whatTheFaultSays()).toBe(0)
      const drawn = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(drawn, `${name} drawn ${String(drawn)} wide in a window ${String(width)} wide`).toBeLessThanOrEqual(width)
      await page.screenshot({ path: join(shots, `${name}-${String(width)}-${theme}.png`), fullPage: true })
    }
    // THE HELD CLOSE IS REFUSED BY THE TEST AND NEVER REACHES THE SERVER, so the fork stays open for the next picture.
    const refuse = async (route: Route, done: () => Promise<void>) => {
      stillHeld = null
      await route.abort()
      await done()
    }

    await page.goto(`${app.site}/#/decisions`, { timeout: 60_000 })
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark']) {
        await page.setViewportSize({ width, height: 1000 })
        await page.evaluate((one) => localStorage.setItem('mole-office.preset.theme', one), theme)

        await openTheRecord(fork, '.px-gov-opt')
        const onThePage = await closeWhileHeld(theListIn(page), titles[0] as string, titles.slice(1))
        await theListIn(page).scrollIntoViewIfNeeded()
        await measured(width, theme, 'record-page-closing')
        await refuse(onThePage.route, onThePage.done)

        const card = await openTheCard(fork, title)
        const onTheCard = await closeWhileHeld(theListIn(card), titles[0] as string, titles.slice(1))
        await card.scrollIntoViewIfNeeded()
        await measured(width, theme, 'decisions-list-closing')
        await refuse(onTheCard.route, onTheCard.done)

        await openTheRecord(decision, '.px-gov-m83')
        const press = sayInEnglish('decisions.chooseAgain')
        const form = await openTheForm(press)
        await form.locator('.px-gov-opt', { hasText: sayInEnglish('decisions.takeNone') }).locator('button').click()
        await form.getByLabel(sayInEnglish('decisions.ownAnswer')).waitFor({ timeout: 10_000 })
        await whyItIsOff(form, press)
        await form.scrollIntoViewIfNeeded()
        await measured(width, theme, 'decision-page-choose-again')
      }
    }
    expect(await settledBy(fork)).toEqual({ resolved: false, by: [] })
  }, 600_000)
})
