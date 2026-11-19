// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON CLOSES A PROBLEM WHOSE MOVE IS THEIRS, FROM THE PROBLEM'S OWN PAGE AND FROM ITS RECORD PAGE.
 * Problems QbIyPcjwZpNk and KyoZmFiuv9ma.
 *
 * The person opened a problem whose move was theirs and found no way to close it: the state control is drawn
 * only behind `/edit`, which the page does not point to. `CloseThisProblem` in
 * src/web/components/CloseThisProblem.tsx draws a close press for the person on a problem carrying
 * `whose_move: person` that has not ended. It asks how the problem ended and, for fixed and worked
 * around, what closed it, and writes both through `PATCH /api/records/:id`.
 *
 * The press was first drawn only at `#/problem/<id>`. The person was then sent a link to such a problem at
 * `#/r/<id>`, the record page, which is the address most links carry, and found no press there
 * (problem KyoZmFiuv9ma). The record page now draws the same component beside the problem's state.
 *
 * WHAT THIS FILE PROVES, in a real browser:
 *   1. the person sees the press on a person's-move problem at `#/problem/<id>`, chooses fixed, and
 *      the problem then reads fixed in the state chip under its title, with what was written saved as
 *      its fix. The chip is new with the press: before it, the page drew a problem's state only behind
 *      `/edit`. In English;
 *   2. a page read as an agent draws no press on the same kind of problem, at `#/problem/<id>`;
 *   3. the person sees no press on a problem whose move is an agent's, at `#/problem/<id>`;
 *   4. the person sees the press at `#/r/<id>` too, chooses fixed, and the office then holds the
 *      problem as fixed, and the record page reads it fixed beside where the press was;
 *   5. a page read as an agent draws no press at `#/r/<id>` or at `#/problem/<id>`;
 *   6. the person sees no press at `#/r/<id>` on a problem whose move is an agent's, nor on one that
 *      is already fixed.
 * Cases 1 to 6 are in English. The Chinese repeat of the behaviour and the two photograph cases were
 * dropped: the behaviour does not change with the language, and the pictures are held by the wider
 * review rather than by this file.
 *
 * MUTATIONS, NAMED, AFTER A CONTROL RUN:
 *   · the press hidden (`CloseThisProblem` returns null first): case 1 goes red, the press is not
 *     there (round 20's proofs file);
 *   · the press shown to an agent (the `getActor().type !== 'human'` line taken out): case 2 goes red
 *     (round 20's proofs file);
 *   · the press taken off the record page (the `<CloseThisProblem>` line in RecordPage.tsx removed):
 *     case 4 goes red because the press is not there, and case 1 stays green, because the problem's
 *     own page still draws it. Case 5 goes red in its control half, and the record page's pictures
 *     cannot be taken (round 23's proofs file).
 *
 * Everybody and everything here is made up. The world is the test's own: `liveApp` starts its own API
 * on ports of its own with a database of its own, and nothing touches the owner's server.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { problemPath, recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let agentId = ''
const shots = testShots('a-problem-close-press')

/** File one problem as the person and hand back its id. */
async function aProblem(title: string, whoseMove: 'person' | 'agent', state = 'open'): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      kind: 'problem',
      title,
      data: {
        symptom: 'The kiln log stops at midnight and starts again at six.',
        why_it_hurts: 'Six hours of firing go unrecorded every night.',
        state,
        whose_move: whoseMove,
      },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

/** What the office now holds for one problem. */
async function stored(id: string): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}/api/records/${id}`, { headers: AS_THE_PERSON })
  expect(reply.status).toBe(200)
  const body = (await reply.json()) as { record?: { data: Record<string, unknown> }; data?: Record<string, unknown> }
  return body.record?.data ?? body.data ?? {}
}

/**
 * Open a problem in a language, as the person or as the agent, and wait for its title. `at` is the
 * address: the problem's own page, `#/problem/<id>`, or its record page, `#/r/<id>`.
 */
async function open(
  id: string,
  lang: 'en' | 'zh',
  reader: 'person' | 'agent',
  width = 1440,
  look = 'light',
  at: 'problem' | 'record' = 'problem',
): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  const address = at === 'problem' ? problemPath(id) : recordPath(id)
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}&reader=${reader === 'agent' ? agentId : ''}#${address}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator(at === 'problem' ? 'h1.pp-title' : 'h1.rp-title').waitFor({ timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'problem-close-press', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const started = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ handle: 'kiln-watcher', name: 'Kiln Watcher', role: 'worker' }),
  })
  expect(started.status, await started.clone().text()).toBe(201)
  agentId = ((await started.json()) as { agent: { id: string } }).agent.id
  // WHO THE PAGE READS AS, set before any document loads, from the address: `reader` names an agent,
  // and no reader is the person. `look` is the theme the page is drawn in.
  await app.page.addInitScript(({ person }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    const reader = query.get('reader')
    localStorage.setItem('mole-office.actor', JSON.stringify(reader ? { type: 'agent', id: reader } : { type: 'human', id: person }))
  }, { person: THE_PERSON })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

// ENGLISH ONLY. The close press and the cases that count it do not change with the language, so one
// language holds them.
for (const lang of ['en'] as const) {
  const words = createI18n(lang).t

  it(`the person closes a problem whose move is the person's, and it reads fixed (${lang})`, async () => {
    const id = await aProblem(`The kiln log has a gap (${lang})`, 'person')
    await open(id, lang, 'person')

    const press = app.page.locator('.pp-close button', { hasText: words('problemPage.close.press') })
    await press.waitFor({ state: 'visible', timeout: 30_000 })
    // BEFORE THE PRESS, THE PROBLEM READS OPEN, beside the press.
    expect(await app.page.locator('.pp-standing .px-chip-stored').innerText()).toContain(words('state.open'))
    await app.page.screenshot({ path: `${shots}/open-${lang}-1440-light.png`, fullPage: false })
    await press.click()

    // THE PRESS ASKS WHICH ENDING, with the three words that end a problem.
    const form = app.page.locator('.pp-close-form')
    await form.waitFor({ state: 'visible', timeout: 10_000 })
    expect(await form.locator('legend').textContent()).toBe(words('problemPage.close.which'))
    expect(await form.locator('.pp-close-choice').evaluateAll((all) => all.map((one) => one.getAttribute('data-choice')))).toEqual([
      'fixed',
      'worked_around',
      'accepted',
    ])
    await form.locator('.pp-close-choice[data-choice="fixed"] input').check()
    await form.locator('textarea').fill('The logger now writes through the night.')
    await app.page.screenshot({ path: `${shots}/asking-${lang}-1440-light.png`, fullPage: false })
    await form.locator('button', { hasText: words('problemPage.close.confirm') }).click()

    // THE PROBLEM READS FIXED: the press is gone, and the office holds the state and the fix.
    await app.page.locator('.pp-close').waitFor({ state: 'detached', timeout: 30_000 })
    await expect.poll(async () => (await stored(id))['state'], { timeout: 10_000 }).toBe('fixed')
    expect((await stored(id))['fix']).toBe('The logger now writes through the night.')
    await expect
      .poll(async () => (await app.page.locator('.pp-standing .px-chip-stored').innerText()).includes(words('state.fixed')), { timeout: 10_000 })
      .toBe(true)
    await app.page.screenshot({ path: `${shots}/closed-${lang}-1440-light.png`, fullPage: false })
  }, 180_000)

  it(`a page read as an agent draws no close press (${lang})`, async () => {
    const id = await aProblem(`The glaze cupboard is unlabelled (${lang})`, 'person')
    // THE CONTROL HALF: the person sees the press on this very problem.
    await open(id, lang, 'person')
    await app.page.locator('.pp-close button').waitFor({ state: 'visible', timeout: 30_000 })

    await open(id, lang, 'agent')
    // The page has drawn the problem's own body before the press is counted.
    await app.page.locator('.rd').first().waitFor({ timeout: 30_000 })
    expect(await app.page.locator('.pp-close').count(), 'a close press drawn for an agent').toBe(0)
  }, 180_000)

  it(`the person sees no close press on a problem whose move is an agent's (${lang})`, async () => {
    const id = await aProblem(`The kiln shelf is cracked (${lang})`, 'agent')
    await open(id, lang, 'person')
    await app.page.locator('.rd').first().waitFor({ timeout: 30_000 })
    expect(await app.page.locator('.pp-close').count(), "a close press on an agent's problem").toBe(0)
  }, 180_000)
}

// ---------------------------------------------------------------------------------------------------
// THE RECORD PAGE, `#/r/<id>`: the address most links carry. Problem KyoZmFiuv9ma.
// ---------------------------------------------------------------------------------------------------

const en = createI18n('en').t

it('the person closes a problem whose move is the person\'s from its record page, and it reads fixed', async () => {
  const id = await aProblem('The pottery wheel stalls at low speed', 'person')
  await open(id, 'en', 'person', 1440, 'light', 'record')
  expect(recordPath(id)).toBe(`/r/${id}`)

  const press = app.page.locator('.rp-standing .pp-close button', { hasText: en('problemPage.close.press') })
  await press.waitFor({ state: 'visible', timeout: 30_000 })
  // BEFORE THE PRESS, THE PROBLEM READS OPEN, beside the press.
  expect(await app.page.locator('.rp-standing .px-chip-stored').innerText()).toContain(en('state.open'))
  await press.click()

  const form = app.page.locator('.pp-close-form')
  await form.waitFor({ state: 'visible', timeout: 10_000 })
  await form.locator('.pp-close-choice[data-choice="fixed"] input').check()
  await form.locator('textarea').fill('The belt was replaced.')
  await form.locator('button', { hasText: en('problemPage.close.confirm') }).click()

  // THE OFFICE HOLDS IT FIXED, read back from the server, and the page reads it fixed.
  await expect.poll(async () => (await stored(id))['state'], { timeout: 30_000 }).toBe('fixed')
  expect((await stored(id))['fix']).toBe('The belt was replaced.')
  await app.page.locator('.pp-close').waitFor({ state: 'detached', timeout: 30_000 })
  await expect
    .poll(async () => (await app.page.locator('.rp-standing .px-chip-stored').innerText()).includes(en('state.fixed')), { timeout: 10_000 })
    .toBe(true)
}, 180_000)

it("the person sees the press on another such problem at the problem's own address too", async () => {
  const id = await aProblem('The clay store is too damp', 'person')
  await open(id, 'en', 'person', 1440, 'light', 'problem')
  await app.page.locator('.pp-standing .pp-close button', { hasText: en('problemPage.close.press') }).waitFor({ state: 'visible', timeout: 30_000 })
}, 180_000)

it('a page read as an agent draws no close press at either address', async () => {
  const id = await aProblem('The studio extractor fan rattles', 'person')
  // THE CONTROL HALF: the person sees the press on this very problem at the record page.
  await open(id, 'en', 'person', 1440, 'light', 'record')
  await app.page.locator('.rp-standing .pp-close button').waitFor({ state: 'visible', timeout: 30_000 })

  for (const at of ['record', 'problem'] as const) {
    await open(id, 'en', 'agent', 1440, 'light', at)
    // The page has drawn the problem's own body before the press is counted.
    await app.page.locator('.rd').first().waitFor({ timeout: 30_000 })
    expect(await app.page.locator('.pp-close').count(), `a close press drawn for an agent at the ${at} address`).toBe(0)
  }
}, 180_000)

it("the person sees no close press at the record page of an agent's problem, nor of a fixed one", async () => {
  const agents = await aProblem('The slip bucket lid is missing', 'agent')
  const fixed = await aProblem('The kiln shelf wash ran out', 'person', 'fixed')
  for (const id of [agents, fixed]) {
    await open(id, 'en', 'person', 1440, 'light', 'record')
    await app.page.locator('.rd').first().waitFor({ timeout: 30_000 })
    expect(await app.page.locator('.pp-close').count(), `a close press on ${id}`).toBe(0)
  }
}, 180_000)
