// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CARD IS A KIND OF ITS OWN, NOT A REPORT. Item 3 of a
 * decision.
 *
 * Until 1 October 2026 a role card sat in the `notes` family, labelled "Reports and notes". So a role
 * card's record page carried the Reports and notes family tag and crumb, the rail marked the Reports
 * and notes row while a card was open, and the Reports and notes list drew the cards among the reports.
 * Now a role card is read on the Role cards page at #/roles and on its own record page, the way a
 * message is read on #/messages.
 *
 * WHAT THIS MEASURES, in a browser, in English and in Chinese:
 *   - a role card's record page has a middle crumb that leads to #/roles and says the rail row's word;
 *   - the rail marks the Role cards row on that page, and not the Reports and notes row;
 *   - the page draws the card itself, and no family tag, no family warning and no summary line;
 *   - Everything's Reports and notes group lists a report and no role card.
 *
 * THE MUTATION THAT TURNS THIS RED, AFTER A CONTROL RUN. Put 'role_card' back into
 * `KIND_FAMILIES.notes.kinds` in src/shared/work.ts. The crumb case goes red first: the middle crumb
 * says "Reports and notes" and leads to #/notes, not to #/roles. The Everything case goes red too,
 * because the Reports and notes group lists the worker card. The proof is in out/<wave 13k's folder>/r19/cards/proofs.txt.
 *
 * PICTURES. With TEST_SHOTS set, it photographs the card's record page at 1440 in English and Chinese,
 * with the rail, into a folder of its own; without it, into a temporary folder that is deleted.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'

import { liveApp, one, type LiveApp, waitForThePage } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'

let app: LiveApp
let page: Page
let workerCard = ''
const REPORT_TITLE = 'Watering timer for the herb garden, first week'
const shots = testShots('role-card-own-kind')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

type Language = 'en' | 'zh'

async function open(where: string, language: Language, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`${app.site}/${language === 'zh' ? '?lang=zh' : ''}#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

beforeAll(async () => {
  app = await liveApp({ name: 'role-card-own-kind', viewport: { width: 1440, height: 900 } })
  page = app.page
  const copied = (await post('/api/roles/mirror', undefined)) as { written?: string[] }
  expect(copied.written, 'the mirror copied no card into the project').toContain('worker')
  const listed = (await (await fetch(`${app.api}/api/records?kind=role_card&shape=full`)).json()) as {
    records?: { id: string; data?: { roleName?: string } }[]
  }
  workerCard = one((listed.records ?? []).filter((r) => r.data?.roleName === 'worker'), 'the worker card copy').id
  await post('/api/records', {
    kind: 'report',
    title: REPORT_TITLE,
    summary: 'The timer watered the herbs each morning at six.',
    data: { for: 'Mara Okonkwo', date: '2026-09-28', blocks: [{ id: 'b-1', type: 'text', text: 'The soil stayed damp all week.' }] },
  })
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe("a role card's record page stands under the Role cards page", () => {
  for (const language of ['en', 'zh'] as const) {
    it(`leads its middle crumb to #/roles, marks the Role cards row, and draws the card with no family tag, in ${language}`, async () => {
      await open(`/r/${workerCard}`, language)
      await page.locator('.rc').first().waitFor({ timeout: 30_000 })
      const words = language === 'zh' ? zh : en
      const crumbs = page.locator('.rp-crumbs a')
      // The first crumb is Everything; the second is the page the kind is read on.
      const middle = crumbs.nth(1)
      expect(await middle.getAttribute('href'), 'the middle crumb leads to the Role cards page').toBe('#/roles')
      expect((await middle.innerText()).trim(), 'the middle crumb says the rail row word').toBe(words['nav.roles'])
      expect(await page.locator('.rp-crumb-nofamily').count(), 'the crumb calls a role card a gap').toBe(0)

      // Test change (wave 13y round 165): the Role cards row is listed on All pages now, so the sidebar marks the
      // All pages entry that leads to it, and nothing else.
      const marked = await page.locator('a.shell-link[aria-current]').evaluateAll((all) => all.map((a) => a.getAttribute('href')))
      expect(marked, 'the rail marks All pages, where the Role cards row is, and nothing else').toEqual(['#/all-pages'])

      expect(await page.locator('.rp-kindline .px-family').count(), 'a family tag or a family warning is drawn').toBe(0)
      expect(await page.locator('.rp-lede').count(), 'the summary is drawn twice').toBe(0)
      expect(await page.locator('.rc').count(), 'the card itself is drawn').toBe(1)
      await page.screenshot({ path: `${shots}/role-card-record-1440-light-${language}.png`, fullPage: false })
      // AND THE RAIL WITH THE MARKED ROW IN VIEW.
      await page.locator('a.shell-link[aria-current]').first().scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${shots}/role-card-record-rail-1440-light-${language}.png`, fullPage: false })
    }, 120_000)
  }
})

describe("Everything's Reports and notes group holds no role card", () => {
  it('lists the report and not the worker role card once the Reports and notes group is pressed', async () => {
    await open('/records', 'en')
    // Before the press, every record is listed, the role cards among them: a role card is still a record.
    await page.getByText('The worker role card').first().waitFor({ timeout: 30_000 })
    await page.locator('.rec-facet', { hasText: 'Reports and notes' }).first().click()
    await page.getByText(REPORT_TITLE).first().waitFor({ timeout: 30_000 })
    await page.waitForFunction(() => !(document.querySelector('main')?.textContent ?? '').includes('The supervisor role card'), null, { timeout: 5_000 }).catch(() => undefined)
    const text = (await page.locator('main').first().textContent()) ?? ''
    expect(text, 'the group does not list the report it should hold').toContain(REPORT_TITLE)
    expect(text, 'the group lists a role card among the reports').not.toContain('The worker role card')
    await page.screenshot({ path: `${shots}/everything-reports-and-notes-1440-light-en.png`, fullPage: false })
  }, 120_000)
})
