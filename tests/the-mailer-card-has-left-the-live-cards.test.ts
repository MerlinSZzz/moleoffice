// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAILER CARD HAS LEFT THE LIVE CARDS, AND ITS OLD COPY SAYS SO.
 *
 * The mail tool is the owner's own tool, set in their Settings, and not an agent or a role card. So on
 * 1 October 2026 the mailer card and its one power, "Reading the summonses", left
 * design/permissions/roles.json. A project that copied the card before then still holds the copy: the
 * mirror copies what is declared and leaves a copy of a card that has gone exactly as it was.
 *
 * WHAT THIS MEASURES, in a browser and at the door:
 *   - GET /api/roles holds no mailer card and no power that reads the summonses;
 *   - the Role cards page draws no mailer card;
 *   - the old copy's own page says, in English and in Chinese, that no card of that name is declared
 *     any more, and a declared card's page does not say it.
 *
 * THE OLD COPY IS MADE AS SUCH A PROJECT HOLDS IT. No door writes a copy of a card nobody declares, so
 * the test writes the record into this test's own database itself, with the data the mirror wrote while
 * the card was declared (tests/the-mailer-card-that-left.ts). It used to write a card through POST
 * /api/roles/cards first and change its data; that door refuses every write since wave 13r round 5.
 *
 * THE MUTATION THAT TURNS THIS RED, AFTER A CONTROL RUN. In src/web/components/RoleCard.tsx, set
 * `goneFromTheDeclaration` to false. The two cases on the old copy go red on "the old copy does not
 * say that no card of its name is declared". The proof was kept outside the repository, in wave 13k's out folder.
 *
 * PICTURES. The old copy's page at 1440 in English and Chinese, light, and at 390 in dark, into
 * testShots('mailer-card-left'): a folder TEST_SHOTS names, or a temporary one.
 */

import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'

import { aRoleCardRow } from './a-role-card-the-old-door-wrote.ts'
import { liveApp, one, type LiveApp, waitForThePage } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { THE_MAILER_CARD_THAT_LEFT } from './the-mailer-card-that-left.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { WhatTheRolesSay } from '../src/shared/roles.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'

let app: LiveApp
let page: Page
let oldCopy = ''
let workerCopy = ''
let roles: WhatTheRolesSay
const shots = testShots('mailer-card-left')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function open(where: string, language: 'en' | 'zh', theme: 'light' | 'dark' = 'light', width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/${language === 'zh' ? '?lang=zh' : ''}#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

beforeAll(async () => {
  app = await liveApp({ name: 'mailer-card-left', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  page = app.page
  const mirrored = await fetch(`${app.api}/api/roles/mirror`, {
    method: 'POST',
    headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
  })
  expect(mirrored.ok, await mirrored.clone().text()).toBe(true)
  roles = (await (await fetch(`${app.api}/api/roles`, { headers: AS_THE_PERSON })).json()) as WhatTheRolesSay
  oldCopy = aRoleCardRow(join(app.dir, 'panelx.db'), THE_MAILER_CARD_THAT_LEFT, {
    roleName: 'mailer',
    card: THE_MAILER_CARD_THAT_LEFT,
    copiedFrom: 'design/permissions/roles.json',
    copiedAt: '2026-09-28 10:00:00',
  })
  const listed = (await (await fetch(`${app.api}/api/records?kind=role_card&shape=full`, { headers: AS_THE_PERSON })).json()) as {
    records?: { id: string; data?: { roleName?: string; madeHere?: boolean } }[]
  }
  workerCopy = one((listed.records ?? []).filter((r) => r.data?.roleName === 'worker'), 'the worker card copy').id
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the live cards', () => {
  it('hold no mailer card and no power that reads the summonses', () => {
    expect([...roles.cards, ...roles.personCards].map((c) => c.name)).not.toContain('mailer')
    expect(roles.powers.map((p) => p.name)).not.toContain('Reading the summonses')
    expect(roles.powers.flatMap((p) => p.acts.map((a) => a.act))).not.toContain('office.read-summonses')
    for (const card of [...roles.cards, ...roles.personCards]) expect(card.powers ?? [], card.name).not.toContain('Reading the summonses')
  })

  it('are drawn on the Role cards page with no mailer card among them', async () => {
    await open('/roles', 'en')
    await page.locator('.rol-name').first().waitFor({ timeout: 30_000 })
    const names = await page.locator('.rol-name').allTextContents()
    expect(names.map((n) => n.trim())).toContain('inspector')
    expect(names.map((n) => n.trim())).not.toContain('mailer')
  }, 120_000)
})

describe("the old mailer card's copy", () => {
  for (const language of ['en', 'zh'] as const) {
    it(`says no card of its name is declared any more, in ${language}`, async () => {
      await open(`/r/${oldCopy}`, language)
      await page.locator('.rc').first().waitFor({ timeout: 30_000 })
      await page.waitForFunction(() => document.querySelector('.rc-rung') !== null, null, { timeout: 30_000 })
      // The declaration is read after the page draws; the mark waits for it rather than a fixed time.
      await page.locator('.rc-gone').first().waitFor({ timeout: 15_000 }).catch(() => undefined)
      const words = language === 'zh' ? zh : en
      const gone = (await page.locator('.rc-gone').allTextContents()).join(' ')
      expect(gone, 'the old copy does not say that no card of its name is declared').toContain(words['g6b.profile.cardNotDeclared'])
      await page.screenshot({ path: `${shots}/old-mailer-copy-1440-light-${language}.png`, fullPage: true })
    }, 120_000)
  }

  it('is photographed at 390 in dark', async () => {
    await open(`/r/${oldCopy}`, 'en', 'dark', 390)
    await page.locator('.rc').first().waitFor({ timeout: 30_000 })
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(sideways).toBe(0)
    await page.screenshot({ path: `${shots}/old-mailer-copy-390-dark-en.png`, fullPage: true })
  }, 120_000)

  it('is the only copy that says so: a declared card does not', async () => {
    await open(`/r/${workerCopy}`, 'en')
    await page.locator('.rc-power').first().waitFor({ timeout: 30_000 })
    expect(await page.locator('.rc-gone').count(), 'a declared card says it is not declared').toBe(0)
  }, 120_000)
})
