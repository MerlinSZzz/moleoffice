// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ADDED CARD WHOSE REPORTS-TO WORDS NAME NOBODY IS WARNED IN ITS PREVIEW AND ON ITS BLOCK.
 *
 * For a card the office ships, `theRoleCards()` reads the shipped declaration, so changing the card's
 * words record changes only what is shown. For a card a person added, the office reads the card as its
 * words record says, so those words decide who is added above the holder when two work areas overlap
 * (`whoTheCardReportsTo` in src/shared/roles.ts, `theOneAbove` in src/server/lib/claims.ts). A person
 * who writes words the office cannot read is therefore warned, and the card can still be applied: the
 * warning is a reminder, never a problem.
 *
 * MEASURED HERE, through the doors and in the browser:
 *   1. `POST /api/roles/added/preview` answers the one sentence among its reminders, and not among its
 *      problems, and `POST /api/roles/added` still applies the card with 200;
 *   2. at #/roles/new the preview draws that sentence, and draws it for no words the office can read;
 *   3. at #/roles the added card's block draws one status line carrying the sentence, and the cards the
 *      office ships draw none;
 *   4. the record page of a role card's words draws the hint saying what changes on each kind of card.
 *
 * THE SENTENCE AND THE HINT ARE READ FROM THE WORDS TABLE (tests/helpers.ts's office serves it), so this
 * file holds no second copy of either. `THE_REPORTS_TO_NAMES_NOBODY` in src/shared/roles.ts is the one
 * English copy; the hint lives at `record.hint.role_card_words.reportsTo` in src/shared/words/en.ts.
 *
 * MUTATIONS, each after the control run the commit that added this file names:
 *   1. `checkAddedRole` does not add the reminder: case 1 and case 2 go red.
 *   2. the block draws the line on every added card, whatever its words: case 3 goes red.
 *   3. `checkAddedRole` adds the sentence to `problems`: case 1 goes red, on the apply as well.
 *   4. the hint goes back to its old words: case 4 goes red in the browser and in the table.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app: LiveApp, db: TestDb

const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

/** Words the office cannot read as anybody: no starter, no secretary, no person, no nobody. */
const NAMING_NOBODY = 'The made-up-missing-supervisor role.'
/** Words the office can read: the holder's own starter. */
const NAMING_ITS_STARTER = 'Its starter.'
const NOBODY_CARD = 'made-up-nobody-role'
const STARTER_CARD = 'made-up-starter-role'

const cardFor = (name: string, reportsTo: string) => ({
  name,
  rung: null,
  duties: 'Made-up archive duties.',
  powers: ['Reading everything'],
  appointedBy: 'the person',
  appoints: 'nobody',
  mustRead: { chapters: [{ chapter: 1, level: 'full' }], andWhatItsStarterNames: null },
  reportsTo,
  whatEndsIt: 'When the archive is read.',
  workArea: { grain: 'folders', most: 'no limit', says: 'Name the archive folders.' },
})

const wordsTable = () => englishWords() as unknown as Record<string, unknown>
/**
 * THE SENTENCE, READ FROM THE WORDS TABLE, so this file holds no second copy of it. A table with no
 * string at the key fails by name here, rather than answering undefined and letting a check pass.
 */
function theSentence(): string {
  const word = wordsTable()['addedRoles.reportsToNamesNobody']
  if (typeof word !== 'string' || word === '') throw new Error('The words table holds no string at addedRoles.reportsToNamesNobody.')
  return word
}
/** THE HINT, READ FROM THE WORDS TABLE for the same reason, and failing by name for the same reason. */
function theHint(): string {
  const word = wordsTable()['record.hint.role_card_words.reportsTo']
  if (typeof word !== 'string' || word === '') throw new Error('The words table holds no string at record.hint.role_card_words.reportsTo.')
  return word
}

beforeAll(async () => {
  db = await freshDb()
  db.client.sqlite.prepare('UPDATE people SET name=? WHERE id=?').run('Made-up caretaker', THE_TEST_OFFICES_OWNER.id)
  app = await liveApp({ name: 'added-card-reports-to', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.context.addInitScript(() => { localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light') })
})
afterAll(async () => { await app?.stop(); db?.close() })

async function open(path: string, width = 1440, theme = 'light') {
  await app.page.setViewportSize({ width, height: 1100 })
  await app.page.goto(app.site + `/?lang=en&look=${theme}&mode=normal#/${path}`)
  await waitForThePage(app.page, 60_000)
  expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
}

async function fill(name: string, reportsTo: string) {
  await app.page.getByLabel('Name', { exact: true }).fill(name)
  await app.page.getByLabel('Duties', { exact: true }).fill('Made-up browser archive duties.')
  await app.page.locator('.added-choice').filter({ hasText: 'Reading everything' }).locator('input').check()
  await app.page.getByLabel('Who it reports to', { exact: true }).fill(reportsTo)
  await app.page.getByLabel('What ends it', { exact: true }).fill('When the archive is read.')
  await app.page.getByLabel('Words shown when a work area is refused', { exact: true }).fill('Name the archive folders.')
}

async function preview() {
  const response = app.page.waitForResponse(reply => reply.url().endsWith('/api/roles/added/preview'))
  await app.page.getByRole('button', { name: 'Preview', exact: true }).click()
  const reply = await response
  expect(reply.status(), await reply.text()).toBe(200)
  await app.page.locator('[data-role-preview]').waitFor()
}

describe('an added card whose reports-to words name nobody', () => {
  it('answers the sentence among the preview’s reminders, and the card can still be applied', async () => {
    const post = async (path: string, body: unknown) => {
      const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
      const text = await reply.text()
      return { status: reply.status, said: (text === '' ? {} : JSON.parse(text)) as { problems: string[]; reminders: string[] } }
    }
    const namingNobody = await post('/api/roles/added/preview', { card: cardFor(NOBODY_CARD, NAMING_NOBODY) })
    expect(namingNobody.status, JSON.stringify(namingNobody.said)).toBe(200)
    // SOFT, so the apply below still runs and is measured on the same commit.
    expect.soft(namingNobody.said.reminders).toContain(theSentence())
    expect.soft(namingNobody.said.problems).not.toContain(theSentence())
    const applied = await post('/api/roles/added', { version: null, card: cardFor(NOBODY_CARD, NAMING_NOBODY), because: 'Made-up reason for the card whose reports-to names nobody.' })
    expect(applied.status, JSON.stringify(applied.said)).toBe(200)

    const namingItsStarter = await post('/api/roles/added/preview', { card: cardFor(STARTER_CARD, NAMING_ITS_STARTER) })
    expect(namingItsStarter.status, JSON.stringify(namingItsStarter.said)).toBe(200)
    expect(namingItsStarter.said.reminders).not.toContain(theSentence())
    const starter = await post('/api/roles/added', { version: null, card: cardFor(STARTER_CARD, NAMING_ITS_STARTER), because: 'Made-up reason for the card that reports to its starter.' })
    expect(starter.status, JSON.stringify(starter.said)).toBe(200)
  })

  it('says the sentence in the browser preview, and not when the words name its starter', async () => {
    await open('roles/new')
    await fill('made-up-preview-card', NAMING_NOBODY)
    await preview()
    // SOFT, so the case still shows the starter's half below.
    expect.soft(await app.page.locator('[data-role-preview]').innerText()).toContain(theSentence())
    // THE WARNING IS NOT A PROBLEM, so the Apply press is off only until a reason is given.
    await app.page.getByLabel('Why change this card?', { exact: true }).fill('Made-up preview reason.')
    expect(await app.page.getByRole('button', { name: 'Apply', exact: true }).isDisabled()).toBe(false)

    await app.page.getByLabel('Who it reports to', { exact: true }).fill(NAMING_ITS_STARTER)
    await preview()
    expect(await app.page.locator('[data-role-preview]').innerText()).not.toContain(theSentence())
  })

  it('draws the line on the added card’s block, and on no shipped card’s block', async () => {
    await open('roles')
    const nobody = app.page.locator('.rol-block').filter({ hasText: NOBODY_CARD })
    await nobody.waitFor()
    const line = nobody.locator('[data-reports-to-names-nobody]')
    expect(await line.count()).toBe(1)
    expect(await line.getAttribute('role')).toBe('status')
    expect(await line.innerText()).toBe(theSentence())

    const starter = app.page.locator('.rol-block').filter({ hasText: STARTER_CARD })
    await starter.waitFor()
    expect(await starter.locator('[data-reports-to-names-nobody]').count()).toBe(0)
    // NO SHIPPED CARD'S BLOCK CARRIES IT: the declaration decides there, and none of the office's cards reads as nobody.
    expect(await app.page.locator('.rol-block [data-reports-to-names-nobody]').count()).toBe(1)

    // AND THE CARD THE BLOCK DRAWS CARRIES ITS WORDS RECORD'S reportsTo, which is the words this line is about.
    const roles = await (await fetch(app.api + '/api/roles', { headers })).json() as { cards: { name: string; reportsTo: string }[] }
    expect(roles.cards.find((one) => one.name === NOBODY_CARD)?.reportsTo).toBe(NAMING_NOBODY)
  })

  it('keeps the hint true for a shipped card and an added one, and the words record page draws it', async () => {
    const hint = theHint()
    // SOFT, so the record page below is still read on the commit that has only the new test.
    expect.soft(hint).toContain('the office ships')
    expect.soft(hint).toContain('a person added')
    expect.soft(hint).toContain('who is added above the holder')
    expect.soft(hint).toContain('two work areas overlap')

    const roles = await (await fetch(app.api + '/api/roles', { headers })).json() as { words: { role: string; record: string | null }[] }
    const record = roles.words.find((one) => one.role === 'worker')?.record
    expect(record, 'the office filed no words record for the worker card').toBeTruthy()
    await open(`r/${String(record)}/edit`)
    // THE SECTION IS A CLOSED FOLD, as tests/the-role-cards-stay-inside-a-phone.test.ts opens one.
    const fold = app.page.locator('.rd-fold-body').filter({ has: app.page.locator('summary', { hasText: 'Who it reports to' }) })
    await fold.evaluate(node => { (node as HTMLDetailsElement).open = true })
    await app.page.getByRole('button', { name: 'Change who it reports to', exact: true }).click()
    expect(await app.page.locator('.fw-form .px-hint-body').textContent()).toBe(hint)
  })

  it('draws the preview and the block at four widths and in both themes', async () => {
    const folder = process.env.W13R_REPORTS_TO_SHOTS
    if (folder) mkdirSync(folder, { recursive: true })
    // LIGHT ONLY, at 1440 and 390. Fitting the preview and the block does not depend on the theme.
    for (const width of [1440, 390]) for (const theme of ['light'] as const) {
      await open('roles/new', width, theme)
      await fill('made-up-picture-card', NAMING_NOBODY)
      await preview()
      expect(await app.page.locator('[data-role-preview]').innerText()).toContain(theSentence())
      const sentence = app.page.locator('[data-role-preview] li').filter({ hasText: theSentence() })
      expect(await sentence.count()).toBe(1)
      await putTheMadeUpLabelIn(app.page, 'Made-up test office — an added card whose reports-to names nobody', sentence, 'the new Role card preview')
      expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `preview ${String(width)} ${theme}`).toBe(true)
      const box = (await sentence.boundingBox())!
      expect(box.x + box.width, `preview ${String(width)} ${theme}`).toBeLessThanOrEqual(width)
      if (folder) await app.page.screenshot({ path: `${folder}/roles-new-preview-${String(width)}-${theme}.png`, fullPage: false })

      await open('roles', width, theme)
      const block = app.page.locator('.rol-block').filter({ hasText: NOBODY_CARD })
      await block.waitFor()
      // THE BLOCK'S OWN TOP IS BROUGHT INTO VIEW, so a reader sees which card carries the warning: the
      // label sits in the page's flow above it and its height is returned rather than guessed.
      const labelHeight = await putTheMadeUpLabelIn(app.page, 'Made-up test office — the added card’s block on the Role cards page', block, 'the Role cards page')
      const line = block.locator('[data-reports-to-names-nobody]')
      await line.waitFor()
      // THE NAME, THE TAG AND THE WHOLE WARNING ARE IN THE PICTURE, with nothing over them.
      expect((await block.boundingBox())!.y, `block top ${String(width)} ${theme}`).toBeGreaterThanOrEqual(labelHeight)
      const lineBox = (await line.boundingBox())!
      expect(lineBox.y + lineBox.height, `warning in view ${String(width)} ${theme}`).toBeLessThanOrEqual(1100)
      expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `block ${String(width)} ${theme}`).toBe(true)
      expect(lineBox.x + lineBox.width, `block ${String(width)} ${theme}`).toBeLessThanOrEqual(width)
      if (folder) await app.page.screenshot({ path: `${folder}/roles-added-block-${String(width)}-${theme}.png`, fullPage: false })
    }
  }, 240_000)
})
