// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CLOSED PROBLEM SAYS WHO CLOSED IT, AT BOTH OF ITS ADDRESSES.
 *
 * A secretary closes a fixed problem whose move was
 * the person's, and they can reopen it. They can only reopen what they can see was closed by somebody else,
 * so the problem's own page, `#/problem/<id>`, and its record page, `#/r/<id>`, say who closed it,
 * beside its state. The name is read from the problem's change log.
 *
 * WHAT THIS FILE PROVES, in a real browser:
 *   1. a problem a secretary closed reads "Closed by <the secretary's name> <when>" at
 *      `#/problem/<id>`, and "<when>由 <the secretary's name> 关闭" in Chinese: the time stands where
 *      each language puts it, from the word's own {when} place (wave 13n round 32);
 *   2. the record page says the same at `#/r/<id>`;
 *   3. an open problem says nothing about who closed it;
 *   4. the side card "Who made this, and whose move it is" on a closed problem says the move is over,
 *      not "Needs a person", and draws no line saying where the question is, at both addresses and in
 *      both languages. An open problem's card still says "Needs a person", and so does the card of a
 *      problem the person reopens, because closing it kept the question on the record;
 *   5. when TEST_SHOTS names a folder, the card is photographed closed and open at 1440, 990, 660 and
 *      390 in both looks, and at 1440 and 390 in Chinese in both looks. The line's pictures are not
 *      taken: the line is read by cases 1 to 3 at one view.
 *
 * MUTATION for 1 and 2: in src/web/components/WhoClosedIt.tsx, draw the words whole and the stamp
 * after them, as before round 32. The Chinese case goes red ("由 Quill 关闭 刚刚"), and so do the
 * English ones, because the word's {when} is then drawn as it stands.
 *
 * MUTATION for 4: in `WhoseMoveSays` (src/web/pages/RecordPage.tsx), read the stored `whose_move`
 * again instead of `whoseMoveNow`. The closed cards of 4 go red; the open and reopened cards stay green.
 *
 * Everybody and everything here is made up. `liveApp` starts its own API on ports of its own with a
 * database of its own, and nothing touches the owner's server.
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
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
const shots = testShots('a-closed-problem-says-who-closed-it')

/** The card that may act for the person, read from the declaration and never typed. */
function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as {
    elevation: { onlyThisCardCanHoldIt: string }
  }
  return said.elevation.onlyThisCardCanHoldIt
}

/** A problem whose move is the person's, filed by the person. */
async function aProblemForThem(title: string): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      kind: 'problem',
      title,
      data: { symptom: 'The kiln log stops at midnight and starts again at six.', whose_move: 'person' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

/** The secretary closes one problem as fixed, through the record door. */
async function theSecretaryCloses(id: string): Promise<void> {
  const reply = await fetch(`${app.api}/api/records/${id}`, {
    method: 'PATCH',
    headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'quill' },
    body: JSON.stringify({ dataPatch: { state: 'fixed', fix: 'The logger now writes through the night.' } }),
  })
  expect(reply.status, await reply.clone().text()).toBe(200)
}

/** The person reopens a problem, through the record door. */
async function thePersonReopens(id: string): Promise<void> {
  const reply = await fetch(`${app.api}/api/records/${id}`, {
    method: 'PATCH',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ dataPatch: { state: 'open' } }),
  })
  expect(reply.status, await reply.clone().text()).toBe(200)
}

/** The side card's words: who filed it and whose move it is. */
async function theCardSays(): Promise<string> {
  const card = app.page.locator('.rp-whose-move')
  await card.waitFor({ state: 'visible', timeout: 30_000 })
  return card.innerText()
}

async function open(id: string, lang: 'en' | 'zh', at: 'problem' | 'record', width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}#${at === 'problem' ? problemPath(id) : recordPath(id)}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator(at === 'problem' ? 'h1.pp-title' : 'h1.rp-title').waitFor({ timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-closed-problem-says-who', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const started = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ handle: 'quill', name: 'Quill', role: theSecretaryCard() }),
  })
  expect(started.status, await started.clone().text()).toBe(201)
  // THE PAGE READS AS THE PERSON, in the look the address names.
  await app.page.addInitScript(({ person }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
  }, { person: THE_PERSON })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

for (const lang of ['en', 'zh'] as const) {
  const words = createI18n(lang).t

  it(`a problem the secretary closed says so on its own page (${lang})`, async () => {
    const id = await aProblemForThem(`The kiln log has a gap (${lang})`)
    await theSecretaryCloses(id)
    await open(id, lang, 'problem')
    const line = app.page.locator('.pp-standing .pp-closed-by')
    await line.waitFor({ state: 'visible', timeout: 30_000 })
    // THE TIME STANDS WHERE THE LANGUAGE PUTS IT: after the name in English, first in Chinese.
    const when = await line.locator('time').innerText()
    expect(when.length, 'the line drew no time at all').toBeGreaterThan(0)
    const said = await line.innerText()
    expect(said).toBe(words('problemPage.closedBy', { who: 'Quill', when }))
    expect(said).toBe(lang === 'en' ? `Closed by Quill ${when}` : `${when}由 Quill 关闭`)
  }, 180_000)
}

it('a problem the secretary closed says so on its record page', async () => {
  const words = createI18n('en').t
  const id = await aProblemForThem('The glaze kiln trips its breaker')
  await theSecretaryCloses(id)
  await open(id, 'en', 'record')
  const line = app.page.locator('.rp-standing .pp-closed-by')
  await line.waitFor({ state: 'visible', timeout: 30_000 })
  const when = await line.locator('time').innerText()
  expect(await line.innerText()).toBe(words('problemPage.closedBy', { who: 'Quill', when }))
}, 180_000)

it('an open problem says nothing about who closed it', async () => {
  const id = await aProblemForThem('The clay store is too damp')
  for (const at of ['problem', 'record'] as const) {
    await open(id, 'en', at)
    await app.page.locator('.rd').first().waitFor({ timeout: 30_000 })
    expect(await app.page.locator('.pp-closed-by').count(), `a closer line on an open problem at the ${at} address`).toBe(0)
  }
}, 180_000)

for (const lang of ['en', 'zh'] as const) {
  const words = createI18n(lang).t

  it(`a closed problem's side card says the move is over, not that it needs a person (${lang})`, async () => {
    const id = await aProblemForThem(`The kiln vent rattles (${lang})`)
    await theSecretaryCloses(id)
    await open(id, lang, 'problem')
    const said = await theCardSays()
    expect(said).toContain(words('g2b.move.ended'))
    expect(said).not.toContain(words('g2b.move.person'))
    expect(said).not.toContain(words('g2b.move.personMeaning'))
    expect(await app.page.locator('.rp-question-is').count(), 'a line saying where the question is, on a closed problem').toBe(0)
  }, 180_000)
}

it("a closed problem's card says the same on its record page", async () => {
  const words = createI18n('en').t
  const id = await aProblemForThem('The kiln shelf has cracked')
  await theSecretaryCloses(id)
  await open(id, 'en', 'record')
  const said = await theCardSays()
  expect(said).toContain(words('g2b.move.ended'))
  expect(said).not.toContain(words('g2b.move.person'))
  expect(await app.page.locator('.rp-question-is').count(), 'a line saying where the question is, on a closed problem').toBe(0)
}, 180_000)

it("an open problem's card still says it needs a person, and so does a reopened one", async () => {
  const words = createI18n('en').t
  const id = await aProblemForThem('The pug mill jams')
  for (const at of ['problem', 'record'] as const) {
    await open(id, 'en', at)
    const said = await theCardSays()
    expect(said, `the open card at the ${at} address`).toContain(words('g2b.move.person'))
    expect(said, `the open card at the ${at} address`).not.toContain(words('g2b.move.ended'))
  }
  await theSecretaryCloses(id)
  await thePersonReopens(id)
  await open(id, 'en', 'problem')
  const said = await theCardSays()
  expect(said, 'the reopened card').toContain(words('g2b.move.person'))
  expect(said, 'the reopened card').not.toContain(words('g2b.move.ended'))
}, 240_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the side card closed and open, at four widths in both looks, and at 1440 and 390 in Chinese', async () => {
  const closed = await aProblemForThem('The kiln lid sticks')
  await theSecretaryCloses(closed)
  const opened = await aProblemForThem('The wheel motor hums')
  const views: { lang: 'en' | 'zh'; width: number; look: string }[] = []
  for (const width of [1440, 990, 660, 390]) for (const look of ['light', 'dark']) views.push({ lang: 'en', width, look })
  for (const width of [1440, 390]) for (const look of ['light', 'dark']) views.push({ lang: 'zh', width, look })
  for (const [state, id] of [['closed', closed], ['open', opened]] as const) {
    for (const { lang, width, look } of views) {
      await open(id, lang, 'problem', width, look)
      const card = app.page.locator('.rp-whose-move')
      await card.waitFor({ state: 'visible', timeout: 30_000 })
      await card.scrollIntoViewIfNeeded()
      await app.page.screenshot({ path: `${shots}/side-card-${state}-${lang}-${String(width)}-${look}.png`, fullPage: false })
    }
  }
}, 600_000)
