// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROLE CARDS PAGE SHOWS WHERE A CARD'S WORDS DIFFER FROM THE SHIPPED FILE, AND ITS PRESS COPIES THEM, IN THE BROWSER.
 *
 * This follows a decision. tests/a-cards-shipped-words-are-copied-onto-the-offices-words.test.ts measures
 * the server and the component alone. This file measures the page a person sees, against a test office of its own:
 * that the Role cards page draws the component in each shipped card's block, and that a press on it changes the card's
 * words on the same page without a reload (src/web/pages/RolesPage.tsx, src/web/components/TheShippedWords.tsx).
 *
 * A FRESH TEST OFFICE FILES ITS WORDS FROM THE SHIPPED FILE, so nothing differs. The difference is made up, and every
 * text here says so with MADE-UP in it:
 *   - the supervisor card's duties are written into its words record and into every one of its revisions in the
 *     office's database, as if an older shipped file had said them, so the field reads as copied;
 *   - the person changes what ends a worker through the record door, so that field reads as changed here.
 *
 * What is proved, at 1440, in English, in light:
 *   1. the fresh office's cards differ in nothing, and after the two made-up changes the office names exactly those two;
 *   2. the page draws the supervisor's field with both texts, as copied, with the press and no warning; the worker's
 *      field as changed by the person, with the warning; and the sentence that nothing differs on every other card;
 *   3. the person's press on the supervisor card copies its shipped words: the page says so, the card says nothing
 *      differs, and the card's own duties line shows the shipped text without a reload. The worker card is unchanged;
 *   4. a card added on the Roles page has a words record but no shipped words, because the shipped file does not
 *      declare it: the office answers its read with 404, and the page neither asks for it nor draws a refusal in its
 *      block. The added card is made up, and its texts say so with MADE-UP in them.
 *
 * Two cases take pictures only when TEST_SHOTS names a folder, at four widths and in both looks, each with the label
 * that says the office is made up. The first photographs the two differing blocks, before the press, so the pictures
 * show the difference. The second photographs the added card's block, after case 4.
 *
 * PROVED BY MUTATION (wave 13s round 113). Before the code, at this file's criterion commit, cases 1 to 3 were red: case
 * 1 because the office had no door for a card's shipped words, cases 2 and 3 because the page drew no component. With
 * the code, after a control run with cases 1 to 3 green, each mutation
 * run alone and put back before the next:
 *   M1. the Role cards page draws no component in a card's block (src/web/pages/RolesPage.tsx): cases 2 and 3 red;
 *   M2. the page does not read the cards again after a press: case 3 red, at the card's duties line;
 *   M3. the component tells no page after a press (src/web/components/TheShippedWords.tsx): case 3 red, the same way.
 * Cases 1 to 3 were green again after the last was put back.
 *
 * PROVED BY MUTATION (wave 13s round 114), for case 4. At its criterion commit, before the code, case 4 was red and
 * cases 1 to 3 green: the page asked the office for the added card's shipped words, the office answered 404, and the
 * block drew that refusal. With the code, after a control run with cases 1 to 4 green, one mutation:
 *   M4. the Role cards page draws the component in every block with a words record, an added card's included, as it
 *       did in round 113 (src/web/pages/RolesPage.tsx): case 4 red, at the read of the added card's shipped words.
 * Cases 1 to 4 and both pictures cases were green after it was put back.
 */
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Locator, Page, Request, Response } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'
import { testShots } from './where-shots-go.ts'
import { createI18n } from '../src/shared/i18n.ts'
import type { WhatTheRolesSay } from '../src/shared/roles.ts'
import type { ACardsShippedWords, TheShippedWords } from '../src/shared/the-shipped-words.ts'

let app: LiveApp
let page: Page
const errors: string[] = []
const shots = testShots('the-role-cards-page-copies-a-cards-shipped-words-in-the-browser')
const words = createI18n('en')

/** The made-up texts: the supervisor's duties as an older file might have said them, and the person's change. */
const OLDER_SUPERVISOR_DUTIES = 'MADE-UP duties of the supervisor card, as an older shipped file might have said them.'
const THE_PERSONS_WORKER_ENDING = 'MADE-UP: what ends a worker, as the person changed it in this office.'

const headers: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** What the office says about every card's shipped words. */
async function theShippedWords(): Promise<TheShippedWords> {
  const reply = await fetch(`${app.api}/api/roles/shipped-words`, { headers })
  expect(reply.status, await reply.clone().text()).toBe(200)
  return (await reply.json()) as TheShippedWords
}

function theCard(said: TheShippedWords, role: string): ACardsShippedWords {
  const card = said.cards.find((one) => one.role === role)
  expect(card, `the reply names no ${role} card`).toBeDefined()
  return card!
}

/** The shipped text of the supervisor's duties, as the office read it from the shipped file. */
let shippedSupervisorDuties = ''

beforeAll(async () => {
  app = await liveApp({ name: 'role-cards-shipped-words', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  page = app.page
  page.setDefaultTimeout(15_000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(({ id }) => {
    // THE BLANK PAGE `open` CLEARS THE WINDOW WITH has no storage of its own.
    if (location.href === 'about:blank') return
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.mode', 'normal')
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  }, { id: THE_TEST_OFFICES_OWNER.id })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

/** The Role cards page in English, in one look. */
async function open(look: 'light' | 'dark' = 'light'): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en&look=${look}#/roles`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('[data-shipped-words="supervisor"]').waitFor({ timeout: 30_000 })
}

/** One card's block on the page, and the part of it the component draws. */
function theBlockOf(role: string): { block: Locator; words: Locator } {
  const words = page.locator(`[data-shipped-words="${role}"]`)
  return { block: page.locator('.rol-block').filter({ has: words }), words }
}

it('1: a fresh office differs in nothing, and after the two made-up changes the office names exactly those two', async () => {
  const fresh = await theShippedWords()
  expect(fresh.cards.length, 'the office names the shipped cards').toBeGreaterThan(2)
  expect(fresh.cards.filter((one) => one.differ.length > 0), 'a fresh office holds the shipped words').toEqual([])

  // THE SUPERVISOR'S DUTIES, AS AN OLDER FILE MIGHT HAVE SAID THEM: written into the record and into every revision of
  // it, so the history says the office's own copy put them there.
  const supervisor = theCard(fresh, 'supervisor').record!.id
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    db.pragma('busy_timeout = 5000')
    db.prepare("UPDATE records SET data = json_set(data, '$.duties', ?) WHERE id = ?").run(OLDER_SUPERVISOR_DUTIES, supervisor)
    db.prepare("UPDATE revisions SET data = json_set(data, '$.duties', ?) WHERE record_id = ?").run(OLDER_SUPERVISOR_DUTIES, supervisor)
  } finally {
    db.close()
  }
  // THE PERSON'S OWN CHANGE OF WHAT ENDS A WORKER, through the record door.
  const worker = theCard(fresh, 'worker').record!.id
  const changed = await fetch(`${app.api}/api/records/${worker}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ dataPatch: { whatEndsIt: THE_PERSONS_WORKER_ENDING } }),
  })
  expect(changed.status, await changed.clone().text()).toBe(200)

  const said = await theShippedWords()
  const differing = said.cards.filter((one) => one.differ.length > 0)
  expect(differing.map((one) => [one.role, one.differ.map((field) => [field.field, field.came.as])])).toEqual([
    ['supervisor', [['duties', 'copied']]],
    ['worker', [['whatEndsIt', 'changed']]],
  ].sort((a, b) => said.cards.findIndex((one) => one.role === a[0]) - said.cards.findIndex((one) => one.role === b[0])))
  const duties = theCard(said, 'supervisor').differ[0]!
  expect(duties.office).toBe(OLDER_SUPERVISOR_DUTIES)
  expect(duties.shipped, 'the shipped file has supervisor duties').not.toBeNull()
  shippedSupervisorDuties = duties.shipped!
}, 60_000)

it('2: the page draws each differing field with both texts and where it came from, warns only before a change, and says the rest are the same', async () => {
  await open()
  const supervisor = theBlockOf('supervisor')
  const field = supervisor.words.locator('[data-field="duties"]')
  expect(await field.count()).toBe(1)
  expect(await field.getAttribute('data-came')).toBe('copied')
  expect(await field.locator('[data-side="office"] .tsw-text').textContent()).toBe(OLDER_SUPERVISOR_DUTIES)
  expect(await field.locator('[data-side="shipped"] .tsw-text').textContent()).toBe(shippedSupervisorDuties)
  expect(await field.textContent()).toContain(words.t('shippedWords.cameCopied'))
  expect(await supervisor.words.locator('[data-writes-over-a-change]').count(), 'no warning where every field is as copied').toBe(0)
  expect(await supervisor.words.getByRole('button', { name: words.t('shippedWords.press') }).count()).toBe(1)
  // THE CARD'S OWN DUTIES LINE SHOWS THE OFFICE'S WORDS, which are the made-up ones.
  expect(await supervisor.block.locator('.rol-for').textContent()).toBe(OLDER_SUPERVISOR_DUTIES)

  const worker = theBlockOf('worker')
  const ending = worker.words.locator('[data-field="whatEndsIt"]')
  expect(await ending.getAttribute('data-came')).toBe('changed')
  expect(await ending.locator('[data-side="office"] .tsw-text').textContent()).toBe(THE_PERSONS_WORKER_ENDING)
  expect(await ending.textContent()).toContain(words.t('shippedWords.cameChangedBy'))
  expect(await worker.words.locator('[data-writes-over-a-change]').textContent()).toBe(words.t('shippedWords.writesOverAChange'))

  // EVERY OTHER SHIPPED CARD SAYS ITS WORDS ARE THE SHIPPED WORDS, and offers no press.
  const sections = page.locator('[data-shipped-words]')
  const all = await sections.count()
  expect(all, 'one section for each shipped card').toBe((await theShippedWords()).cards.length)
  expect(await page.locator('[data-shipped-words-same]').count()).toBe(all - 2)
  expect(await page.locator('[data-press-shipped-words]').count()).toBe(2)
  expect(errors).toEqual([])
}, 180_000)

it.skipIf(!process.env['TEST_SHOTS'])(
  'photographs the two blocks at four widths in both looks, each labelled as a made-up office',
  async () => {
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 1000 })
        await open(look)
        for (const role of ['supervisor', 'worker']) {
          const { block } = theBlockOf(role)
          await block.evaluate((element) => {
            (element as HTMLElement).style.scrollMarginTop = '96px'
            element.scrollIntoView({ block: 'start' })
          })
          await putTheMadeUpLabelIn(page, `Made-up test office — the ${role} card’s words were changed to differ from the shipped file`, block, 'the Role cards page')
          // THE LABEL AND THE BLOCK UNDER IT, whole, in the page's own coordinates.
          const clip = await block.evaluate((element, marker) => {
            const label = document.querySelector(marker)!.getBoundingClientRect()
            const box = element.getBoundingClientRect()
            const left = Math.max(0, Math.min(label.left, box.left) - 8)
            const right = Math.min(innerWidth, Math.max(label.right, box.right) + 8)
            return { x: left, y: label.top + scrollY - 8, width: right - left, height: box.bottom - label.top + 16 }
          }, '[data-made-up-label]')
          await page.screenshot({ path: join(shots, `role-cards-shipped-words-${role}-${String(width)}-${look}.png`), fullPage: true, clip })
          await takeTheMadeUpLabelOut(page)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `fits ${String(width)} in ${look}`).toBe(true)
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  },
  600_000,
)

it("3: the person's press copies the supervisor's shipped words, and the card shows them without a reload", async () => {
  await open()
  const supervisor = theBlockOf('supervisor')
  await supervisor.words.getByRole('button', { name: words.t('shippedWords.press') }).click()
  await supervisor.words.locator('.tsw-done').waitFor({ timeout: 30_000 })
  expect(await supervisor.words.locator('.tsw-done').textContent()).toBe(words.t('shippedWords.copiedNow'))
  await supervisor.words.locator('[data-shipped-words-same]').waitFor({ timeout: 30_000 })
  expect(await supervisor.words.locator('[data-field]').count()).toBe(0)
  // THE PAGE READ THE CARDS AGAIN: the duties line is the shipped text, with no reload.
  await expect.poll(() => supervisor.block.locator('.rol-for').textContent(), { timeout: 30_000 }).toBe(shippedSupervisorDuties)

  const said = await theShippedWords()
  expect(theCard(said, 'supervisor').differ).toEqual([])
  expect(theCard(said, 'worker').differ.map((one) => one.field), 'the press changed no other card').toEqual(['whatEndsIt'])
  expect(await theBlockOf('worker').words.locator('[data-writes-over-a-change]').count()).toBe(1)
  expect(errors).toEqual([])
}, 180_000)

/** The made-up card added on the Roles page, which the shipped file does not declare. */
const THE_ADDED_CARD = 'made-up-archivist'

/** The added card's block on the page: the one with the links to change and remove it. */
function theAddedBlock(): Locator {
  return page.locator('.rol-block').filter({ has: page.locator(`a[href*="/roles/added/${THE_ADDED_CARD}/remove"]`) })
}

it("4: an added card's block asks for no shipped words and draws no refusal, because the shipped file does not declare it", async () => {
  // A POWER AND A CHAPTER THE OFFICE ITSELF NAMES, read from it rather than copied here.
  const roles = await fetch(`${app.api}/api/roles`, { headers })
  expect(roles.status, await roles.clone().text()).toBe(200)
  const said = (await roles.json()) as WhatTheRolesSay
  const power = said.powers.find((one) => one.name !== "The person's own acts")
  expect(power, 'the office names a power an added card may hold').toBeDefined()
  const added = await fetch(`${app.api}/api/roles/added`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      version: null,
      because: 'MADE-UP: a card added for this test.',
      card: {
        name: THE_ADDED_CARD,
        rung: null,
        duties: 'MADE-UP duties of a card added on the Roles page.',
        powers: [power!.name],
        appointedBy: 'the person',
        appoints: 'nobody',
        mustRead: { chapters: [{ chapter: said.chapters[0]!.number, level: said.readingLevels[0]!.level }], andWhatItsStarterNames: null },
        reportsTo: 'The person.',
        whatEndsIt: 'MADE-UP: when the made-up archive is read.',
        workArea: { grain: 'folders', most: 'no limit', says: 'MADE-UP: name the made-up archive folders.' },
      },
    }),
  })
  expect(added.status, await added.clone().text()).toBe(200)
  // THE CARD HAS A WORDS RECORD, filed with it, and the office has no shipped words of it to read.
  const now = (await (await fetch(`${app.api}/api/roles`, { headers })).json()) as WhatTheRolesSay
  expect(now.cards.find((one) => one.name === THE_ADDED_CARD)?.source).toBe('added')
  expect(now.words.find((one) => one.role === THE_ADDED_CARD)?.record, 'the added card has a words record').toBeTruthy()
  const read = await fetch(`${app.api}/api/roles/shipped-words?role=${THE_ADDED_CARD}`, { headers })
  expect(read.status, 'the office has no shipped words of an added card').toBe(404)
  const refusal = ((await read.json()) as { error?: string }).error
  expect(refusal, 'the office says why in words').toBeTruthy()

  // EVERY READ OF A CARD'S SHIPPED WORDS THE PAGE MAKES, and how each ended: an answer, or a read the browser gave up.
  // Every block's read starts when the cards are drawn, so all of them have started once the supervisor's is answered.
  // The window is cleared first, so a read the last case's page still had out is not counted as this page's.
  await page.goto('about:blank')
  const asked: string[] = []
  const answered: { url: string; status: number }[] = []
  const givenUp: string[] = []
  const shippedWordsRead = (url: string): boolean => url.includes('/api/roles/shipped-words?role=')
  const onRequest = (request: Request): void => {
    if (shippedWordsRead(request.url())) asked.push(new URL(request.url()).searchParams.get('role') ?? '')
  }
  const onResponse = (response: Response): void => {
    if (shippedWordsRead(response.url())) answered.push({ url: response.url(), status: response.status() })
  }
  const onFailed = (request: Request): void => {
    if (shippedWordsRead(request.url())) givenUp.push(request.url())
  }
  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('requestfailed', onFailed)
  const block = theAddedBlock()
  try {
    await open()
    await block.waitFor({ timeout: 30_000 })
    await expect.poll(() => answered.length + givenUp.length, { timeout: 30_000 }).toBe(asked.length)
  } finally {
    page.off('request', onRequest)
    page.off('response', onResponse)
    page.off('requestfailed', onFailed)
  }
  expect(asked, 'the page asks the shipped words of no added card').not.toContain(THE_ADDED_CARD)
  expect(answered.filter((one) => one.status !== 200), 'every read the page makes is answered').toEqual([])
  // NO REFUSAL IS DRAWN IN THE BLOCK, in any of the ways the page draws one, and the office's sentence is not in it.
  expect(await block.locator('[role="alert"], [class*="px-error"]').count(), "no refusal in the added card's block").toBe(0)
  expect(await block.innerText()).not.toContain(refusal!)
  expect(await block.locator('[data-shipped-words]').count()).toBe(0)
  // THE BLOCK IS DRAWN WITH ITS WORDS, so the absence above is the panel's and not the block's.
  expect(await block.locator('.rol-for').textContent()).toBe('MADE-UP duties of a card added on the Roles page.')
  expect(await block.getByRole('link', { name: words.t('roleWords.change'), exact: true }).count()).toBe(1)
  expect(errors).toEqual([])
}, 180_000)

it.skipIf(!process.env['TEST_SHOTS'])(
  "photographs the added card's block at four widths in both looks, labelled as a made-up office",
  async () => {
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 1000 })
        await open(look)
        const block = theAddedBlock()
        await block.evaluate((element) => {
          (element as HTMLElement).style.scrollMarginTop = '96px'
          element.scrollIntoView({ block: 'start' })
        })
        await putTheMadeUpLabelIn(page, 'Made-up test office — a card added on the Roles page, which the shipped file does not declare', block, 'the Role cards page')
        const clip = await block.evaluate((element, marker) => {
          const label = document.querySelector(marker)!.getBoundingClientRect()
          const box = element.getBoundingClientRect()
          const left = Math.max(0, Math.min(label.left, box.left) - 8)
          const right = Math.min(innerWidth, Math.max(label.right, box.right) + 8)
          return { x: left, y: label.top + scrollY - 8, width: right - left, height: box.bottom - label.top + 16 }
        }, '[data-made-up-label]')
        await page.screenshot({ path: join(shots, `role-cards-shipped-words-added-card-${String(width)}-${look}.png`), fullPage: true, clip })
        await takeTheMadeUpLabelOut(page)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `fits ${String(width)} in ${look}`).toBe(true)
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  },
  600_000,
)
