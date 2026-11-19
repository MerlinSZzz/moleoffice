// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPLACED DECISION'S PAGE NAMES ONE DECISION AS THE ONE THAT STANDS, AND SAYS WHICH ONES REPLACED IT DIRECTLY.
 *
 * Item 15 of the requirement list, from round 102's report (qhC3k5alqwfT). When A is replaced by B and B by C, A's mark
 * named C, the decision at the end of the line (`whatSupersedes`, src/server/lib/replaced-decisions.ts), and its links
 * named B under "superseded by", the decision that replaced A directly. The page did not say why the two differ. Now
 * the mark says that C is the decision that stands now, and a line under it says that B replaced this one directly. The
 * links panel is left as it reads on every kind's page: it still names B under "superseded by".
 *
 * Every value this file makes up is labelled as made up: the three decisions' titles begin with "Fixture". The words
 * the page draws are read from the word lists, and the links panel's word from linkWord.
 *
 * What is proved, against a test office of its own, at 1440 and in English:
 *   1. the reply for A names C as the decision that stands and B as the one decision that replaced A directly;
 *   2. A's page: the mark names C after the words that say it stands now, and does not name B; the line under it names
 *      B after the words that say B replaced this one directly, and does not name C; the page says "stands now" once;
 *      and the links panel still names B under "superseded by";
 *   3. B's page names C as the decision that stands now and draws no line of direct replacements, because C replaced B
 *      directly and is the one that stands; C's page draws neither, because nothing replaced it;
 *   4. when two decisions replaced one directly, the reply names the first of the two as the decision that stands, and
 *      E's page names that one in its mark and both on its line, in the reply's order. Which of the two is first is the
 *      office's to say: two decisions filed in the same second are ordered by id. The second is linked through the
 *      links door, as a person may.
 *
 * The last case takes pictures only when TEST_SHOTS names a folder.
 *
 * PROVED BY MUTATION (wave 13s round 104). Cases 1 to 4 were red on round 103's tip 5efde7362 with this file alone, each
 * at its own assertion: the reply had no replacedDirectlyBy, and the mark had no words saying the decision stands now.
 * With round 104's code, after a control run with every case green, each mutation run alone and restored before the next:
 *   M1. the decisions that replaced one directly read as its whole line of replacements (replaced-decisions.ts): cases
 *       1, 2 and 4 red;
 *   M2. the statement keeps only the first decision that supersedes one, as before round 104: case 4 red;
 *   M3. the direct replacements come in another order than the line takes them: case 4 red;
 *   M4. the reply for a decision sends no replacedDirectlyBy (src/server/api/records.ts): cases 1, 2 and 4 red;
 *   M5. the record page does not pass them to the panel (src/web/pages/RecordPage.tsx): cases 2 and 4 red;
 *   M6. the panel never draws the line (src/web/components/Governance.tsx): cases 2 and 4 red;
 *   M7. the panel draws the line when it names only the decision that stands: case 3 red;
 *   M8. the mark does not say that it names the decision that stands now: cases 2, 3 and 4 red.
 * Every case was green again after the last was restored.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { linkWord } from '../src/shared/words.ts'
import { testShots } from './where-shots-go.ts'

let app: LiveApp
let page: Page
const errors: string[] = []
const shots = testShots('a-replaced-decisions-page-says-which-decision-stands')
const words = createI18n('en')

/** The three made-up decisions: A, then B replacing A, then C replacing B. */
const A_TITLE = 'Fixture decision the line of replacements starts from'
const B_TITLE = 'Fixture decision that replaced it directly'
const C_TITLE = 'Fixture decision that replaced that one in turn'
let aId = ''
let bId = ''
let cId = ''

/** Three more made-up decisions for case 4: E, then F replacing E, then G linked as replacing E as well. */
const E_TITLE = 'Fixture decision two others replaced directly'
const F_TITLE = 'Fixture decision filed first to replace it'
const G_TITLE = 'Fixture decision linked afterwards as replacing it too'

const headers: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A made-up decision of the owner's, replacing the decisions named. */
async function aDecision(title: string, replaces: string[]): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'decision',
      title,
      data: { option_taken: 'Fixture the greenhouse is watered at dawn.', because: 'Fixture a reason.', decided_by: THE_OWNER, replaces },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return (await filed.json()).record.id as string
}

beforeAll(async () => {
  app = await liveApp({ name: 'replaced-decision-page', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  page = await app.context.newPage()
  page.setDefaultTimeout(15_000)
  page.on('pageerror', (error) => errors.push(error.message))

  aId = await aDecision(A_TITLE, [])
  bId = await aDecision(B_TITLE, [aId])
  cId = await aDecision(C_TITLE, [bId])
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

/** One record's page in English, normal mode, with every body fold opened. */
async function openTheRecordPage(id: string): Promise<void> {
  // A DOCUMENT OF ITS OWN, so a page already at this address really asks the office again.
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/r/${id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(() => {
    localStorage.setItem('mole-office.mode', 'normal')
    document.querySelectorAll('main.page details.rd-fold').forEach((one) => {
      (one as HTMLDetailsElement).open = true
    })
  })
  await page.locator('details.rd-fold-body').first().waitFor({ timeout: 30_000 })
}

/** The text of every element a selector finds, as the DOM holds it: the key words are drawn in capitals by CSS alone. */
async function textsOf(selector: string): Promise<string[]> {
  return page.locator(selector).allTextContents()
}

it('1: the reply for A names C as the decision that stands and B as the one that replaced A directly', async () => {
  const reply = (await (await fetch(`${app.api}/api/records/${aId}`, { headers })).json()) as Record<string, unknown>
  expect(reply['replacedBy']).toEqual({ id: cId, title: C_TITLE })
  expect(reply['replacedDirectlyBy']).toEqual([{ id: bId, title: B_TITLE }])
}, 60_000)

it("2: A's page names C as the decision that stands now and B as the one that replaced it directly, and its links still name B", async () => {
  await openTheRecordPage(aId)
  const standsNow = words.t('decisions.standsNow')
  const replacedDirectly = words.t('decisions.replacedDirectly')

  const mark = await textsOf('.px-gov-superseded')
  expect(mark.length, 'the page draws one mark of a replaced decision').toBe(1)
  expect(mark[0]).toContain(`${standsNow} ${C_TITLE}`)
  expect(mark[0]).not.toContain(B_TITLE)
  const toC = page.locator('.px-gov-superseded').getByRole('link', { name: C_TITLE, exact: true })
  expect(await toC.getAttribute('href')).toContain(cId)

  const directly = await textsOf('.px-gov-replaced-directly')
  expect(directly.length, 'the page draws one line of the decisions that replaced this one directly').toBe(1)
  expect(directly[0]).toContain(`${replacedDirectly} ${B_TITLE}`)
  expect(directly[0]).not.toContain(C_TITLE)
  const toB = page.locator('.px-gov-replaced-directly').getByRole('link', { name: B_TITLE, exact: true })
  expect(await toB.getAttribute('href')).toContain(bId)

  // ONE DECISION IS NAMED AS THE ONE THAT STANDS: the words are on the page once.
  const all = (await page.locator('main.page').textContent()) ?? ''
  expect(all.split(standsNow).length - 1, `"${standsNow}" is on A's page once`).toBe(1)

  // THE LINKS PANEL READS AS IT DOES ON EVERY KIND'S PAGE: B's row says B superseded this one, a link stored from B to A.
  const row = page.locator('.lp-link', { hasText: B_TITLE })
  await row.first().waitFor({ timeout: 30_000 })
  expect(await row.count()).toBe(1)
  expect(await row.textContent()).toContain(linkWord('supersedes', 'reverse').text)
  expect(errors).toEqual([])
}, 180_000)

it("3: B's page names C as the decision that stands now and draws no line, and C's page draws neither", async () => {
  await openTheRecordPage(bId)
  const mark = await textsOf('.px-gov-superseded')
  expect(mark.length).toBe(1)
  expect(mark[0]).toContain(`${words.t('decisions.standsNow')} ${C_TITLE}`)
  expect(await textsOf('.px-gov-replaced-directly'), 'C replaced B directly and stands, so it is named once').toEqual([])

  await openTheRecordPage(cId)
  await page.locator('.px-gov-m83').waitFor({ timeout: 30_000 })
  expect(await textsOf('.px-gov-superseded')).toEqual([])
  expect(await textsOf('.px-gov-replaced-directly')).toEqual([])
  expect(errors).toEqual([])
}, 180_000)

it("4: when two decisions replaced one directly, its page names the first of them as the one that stands, and both on the line", async () => {
  const eId = await aDecision(E_TITLE, [])
  const fId = await aDecision(F_TITLE, [eId])
  const gId = await aDecision(G_TITLE, [])
  const linked = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fromId: gId, toId: eId, type: 'supersedes' }),
  })
  expect(linked.status, await linked.clone().text()).toBe(201)

  const reply = (await (await fetch(`${app.api}/api/records/${eId}`, { headers })).json()) as Record<string, unknown>
  const directly = reply['replacedDirectlyBy'] as { id: string; title: string }[] | undefined
  expect(directly?.map((one) => one.id).sort()).toEqual([fId, gId].sort())
  // NEITHER F NOR G IS REPLACED, so the decision that stands is the first of the two: one ordering, read in one place.
  const stands = directly?.[0]
  expect(reply['replacedBy']).toEqual(stands)
  const other = directly?.[1]

  await openTheRecordPage(eId)
  const mark = await textsOf('.px-gov-superseded')
  expect(mark.length).toBe(1)
  expect(mark[0]).toContain(`${words.t('decisions.standsNow')} ${stands?.title ?? ''}`)
  expect(mark[0]).not.toContain(other?.title ?? '')
  const line = await textsOf('.px-gov-replaced-directly')
  expect(line.length).toBe(1)
  expect(line[0]).toContain(words.t('decisions.replacedDirectly'))
  const links = page.locator('.px-gov-replaced-directly').getByRole('link')
  expect(await links.allTextContents()).toEqual(directly?.map((one) => one.title))
  expect(await links.nth(0).getAttribute('href')).toContain(stands?.id ?? '')
  expect(await links.nth(1).getAttribute('href')).toContain(other?.id ?? '')
  expect(errors).toEqual([])
}, 180_000)

it.skipIf(!process.env['TEST_SHOTS'])(
  "photographs A's page in English at four widths in both looks",
  async () => {
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark']) {
        await page.setViewportSize({ width, height: 1000 })
        await page.goto(`${app.site}/?lang=en#/r/${aId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await page.evaluate((chosen) => {
          localStorage.setItem('mole-office.mode', 'normal')
          localStorage.setItem('mole-office.preset.theme', chosen)
        }, look)
        await page.reload({ timeout: 60_000 })
        await waitForThePage(page, 60_000)
        await page.evaluate(() => {
          document.querySelectorAll('main.page details.rd-fold').forEach((one) => {
            (one as HTMLDetailsElement).open = true
          })
        })
        await page.screenshot({ path: join(shots, `replaced-decision-page-en-${String(width)}-${look}.png`), fullPage: true })
      }
    }
  },
  600_000,
)
