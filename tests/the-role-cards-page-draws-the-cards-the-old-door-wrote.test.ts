// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROLE CARDS PAGE DRAWS THE CARDS THE OLD DOOR WROTE, AND THE DOOR STILL REFUSES A NEW ONE. Wave 13r round 5,
 * item 1: the owner's decision; the page's two sentences were worded in round 6.
 *
 * UNTIL NOVEMBER 2026 the page drew a sentence above those cards saying where a role is added now, and each card's
 * note said why nothing enforces it. Both were taken off the page with the explanations, as decided: the add block
 * above the cards is where a role is added, and each card's note is the short state "Nothing enforces this card."
 * What follows is the history of those sentences, and of the door's words, which stay.
 *
 * THE OLD WORDING, criterion P51: "A new card is filled in on its own page and kept." The cards written that way were
 * listed under "Cards written here", each saying that nothing enforces it, and nothing said that the way to write one
 * had gone. THE OLD PAGE SENTENCE, drawn until wave 13r round 6: "Role cards are no longer written here. Add an office
 * role on the Role cards page, where it takes effect at once." It told a reader who was already on the Role cards page
 * to go to the Role cards page. THE NEW PAGE SENTENCE: "Role cards are no longer written here. Add an office role
 * above; it takes effect at once." On the page, "above" is the add block the reader can see. Each old card's note says
 * "Nothing enforces this card, because the old door wrote it. To make a role Mole Office enforces, add it above as an
 * office role." The note used to send the reader to the declaration file and a server restart; that advice is gone,
 * because the add block above makes an office role that takes effect at once. THE DOOR KEEPS
 * ITS OWN WORDS — "Role cards are no longer written here. Add an office role on the Role cards page, where it takes
 * effect at once. Nothing was written." — because a caller of the door is not on the page; the page adds no "Nothing
 * was written.", because nobody pressed anything there. GET /api/roles ANSWERS EACH OLD CARD'S NOTE IN THE DOOR'S
 * OWN WORDS too (the inspector's note on run JtwB8_PFtSv2). It used to answer the page's note, "… add it above as an
 * office role.", and "above" points nowhere for a caller of the door. It now says "Nothing enforces this card, because
 * the old door wrote it. To make a role Mole Office enforces, add an office role on the Role cards page, where it
 * takes effect at once." WHY: such a card took effect nowhere, and an office role added on this page takes effect at
 * once. The owner's "Settings" was corrected to this page, by the name the reader sees.
 *
 * In a test office with one made-up card the old door wrote, in a real browser, in English and in Chinese:
 *   2. the card is still drawn, with its short state saying nothing enforces it;
 *   3. POST /api/roles/cards still refuses every write with 410, in the door's own words;
 *   4. GET /api/roles answers the old card's note in the door's own words, naming the Role cards page.
 *
 * The pictures case draws the page at 1440 and 390 in light, in English, and keeps a picture of each when
 * W13R_ROLE_CARD_SHOTS names a folder.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { aRoleCardTheOldDoorWrote } from './a-role-card-the-old-door-wrote.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'
import { t } from '../src/shared/i18n.ts'

let app: LiveApp
const folder = process.env.W13R_ROLE_CARD_SHOTS
/** The door's own words, whole. A caller of the door is not on the page, so the door does not say "above". */
const DOOR_SAYS =
  'Role cards are no longer written here. Add an office role on the Role cards page, where it takes effect at once. Nothing was written.'
/** The note GET /api/roles answers for each card the old door wrote, whole. Its caller is not on the page either. */
const DOOR_NOTE =
  'Nothing enforces this card, because the old door wrote it. To make a role Mole Office enforces, add an office role on the Role cards page, where it takes effect at once.'
const A_MADE_UP_CARD = {
  name: 'made-up-kiln-keeper',
  rung: null,
  duties: 'Made-up duties: it keeps the kiln log and changes nothing.',
  powers: ['Reading everything'],
  appointedBy: 'the person',
  appoints: 'nobody',
  mustRead: { chapters: [{ chapter: 10, level: 'full' }], andWhatItsStarterNames: null },
  reportsTo: 'The person.',
  whatEndsIt: 'Only the person retires it.',
}

async function open(page: Page, language: 'en' | 'zh', theme = 'light') {
  await page.goto(app.site + `/?lang=${language}&look=${theme}#/roles`)
  await waitForThePage(page, 60_000)
}
/** The list of cards the old door wrote: its heading and the first card, by their places on the page. */
function theList(page: Page) {
  const section = page.locator('[data-target="uiSurface/roles.madehere"]')
  const card = section.locator('.rol-block').first()
  return { section, heading: section.locator('h2'), card, notEnforced: card.locator('.rol-not-enforced') }
}

beforeAll(async () => {
  app = await liveApp({ name: 'role-cards-say-where', workspace: 'default', viewport: { width: 1440, height: 900 } })
  await app.page.addInitScript(({ id }) => { localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id })); localStorage.setItem('mole-office.workspace', 'default'); localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light') }, { id: THE_TEST_OFFICES_OWNER.id })
  aRoleCardTheOldDoorWrote(join(app.dir, 'panelx.db'), A_MADE_UP_CARD)
  if (folder) mkdirSync(folder, { recursive: true })
}, 240_000)
afterAll(async () => { await app?.stop() }, 120_000)

it('still refuses every card write at the door, in the door’s own words', async () => {
  const answer = await fetch(`${app.api}/api/roles/cards`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    body: JSON.stringify({ card: A_MADE_UP_CARD }),
  })
  expect(answer.status, await answer.clone().text()).toBe(410)
  expect(((await answer.json()) as { error: string }).error).toBe(DOOR_SAYS)
}, 30_000)

it('answers the old card’s note at GET /api/roles in the door’s own words, which name the Role cards page', async () => {
  const answer = await fetch(`${app.api}/api/roles`, {
    headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
  })
  expect(answer.status, await answer.clone().text()).toBe(200)
  const said = (await answer.json()) as { nothingEnforcesACardMadeHere: string; madeHere: { role: string }[] }
  expect(said.madeHere.map((one) => one.role)).toContain(A_MADE_UP_CARD.name)
  expect(said.nothingEnforcesACardMadeHere).toBe(DOOR_NOTE)
}, 30_000)

it('pictures the old card and its state at 1440 and 390 in light, in English', async () => {
  const page = app.page
  for (const width of [1440, 390]) for (const theme of ['light'] as const) {
    await page.setViewportSize({ width, height: 900 })
    await open(page, 'en', theme)
    const list = theList(page)
    await list.card.waitFor({ timeout: 30_000 })
    await list.section.evaluate(element => { (element as HTMLElement).style.scrollMarginTop = '96px'; element.scrollIntoView({ block: 'start' }) })
    await putTheMadeUpLabelIn(page, 'Made-up test office — a role card the old door wrote', list.section, 'the Role cards page')
    if (folder) await page.screenshot({ path: `${folder}/role-cards-old-door-${width}-${theme}.png` })
    await takeTheMadeUpLabelOut(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `fits ${width}`).toBe(true)
    // Soft, so that a card without its state is still photographed at every width.
    expect.soft(await list.notEnforced.textContent(), `the state at ${width} in ${theme}`).toBe(t('addedRoles.notEnforced'))
  }
}, 600_000)
