// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LIST OF WHAT THE PERSON'S GRANT CARRIES IS ON THE SECRETARY'S PAGE (wave 13s round 2a). Under the grant panel on
 * the secretary's page, WhatTheGrantCarries.tsx draws the list the read door answers (GET
 * /api/office/what-the-grant-carries), and the person changes it there with the write door.
 *
 * In a browser, against a test office of this file's own. The person's browser is paired: it holds the two halves the
 * pairing press gives a browser. The other browser holds no key and says it is the secretary, so the read door
 * gives it a refusal and the page draws no menu. Every expected count and answer is read from the read door, so this
 * file does not go stale when a door is wired or the card changes.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. For the person: three groups, each with the count of doors whose answer in force is its answer, and one row for
 *      each door the list names, in the group of its answer. Each row has a menu of four choices: the card's answer,
 *      kept, ask first and may press.
 *   2. For the person: choosing an answer stores nothing. It adds a line saying the door's answer before and after.
 *      "Leave it as it is" takes the line away and stores nothing. Choosing again and pressing "Change it" stores the
 *      answer as the person's, moves the row to its new group, and the row says the person set it.
 *   3. The words "does not ask yet" are on exactly the rows the read door says do not ask the check.
 *   3b. The words "also needs your words" are on exactly the rows the read door says need the person's own words.
 *      With one role card door at may-press, that door's words name a card's words, as the shared reading answers,
 *      and every other row keeps "also needs your words" (round 81).
 *   4. For a browser that is not proved to be the person: no menu and no "Change it" anywhere, the word "read only",
 *      and each row says its answer in force in words.
 *   5. At 390 wide each row stacks, with the answer under the door's words, and the page does not scroll sideways. At
 *      1440 the answer is beside the words.
 *
 * When TEST_SHOTS names a folder, it also photographs the list at 1440, 990, 660 and 390 in light and dark with one
 * change chosen, at 1440 in Chinese, and read-only at 390 in light and dark. Since round 81 one role card door is at
 * may-press in those pictures, and its row is photographed on its own at each width, so its line can be read.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the commit that added this file names the logs)
 * ---------------------------------------------------------------------------------------
 *
 *   - the menus drawn whatever the read door's refusal says (`mayChange` always true): case 4 goes red;
 *   - a choice sent at once, with no confirm line (`choose` calling `send`): case 2 goes red;
 *   - the line about a door that does not ask drawn on no row: case 3 goes red;
 *   - the line about a door that also needs the person's words drawn on no row: case 3b goes red;
 *   - round 81: the line that the grant alone does not press it drawn on every such row, the role card door at may-press
 *     too: case 3b goes red;
 *   - the rule that stacks a row at 40rem and below taken out: case 5 goes red.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Browser, Page } from 'playwright'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { pairTheContext } from './a-paired-context.ts'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import {
  doesThisDoorNeedThePersonsWordsOnlyForACardsWords,
  type AnAnswerAboutADoor,
  type WhatTheGrantCarriesReading,
} from '../src/shared/what-the-grant-carries.ts'
import type { BuiltServer } from '../src/server/index.ts'

let db: TestDb
let inProcess: BuiltServer
let live: LiveApp

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const THE_ANSWERS: readonly AnAnswerAboutADoor[] = ['kept', 'ask-first', 'may-press']
const GROUP_WORD = { kept: 'grantList.group.kept', 'ask-first': 'grantList.group.askFirst', 'may-press': 'grantList.group.mayPress' } as const
const ANSWER_WORD = { kept: 'grantList.answer.kept', 'ask-first': 'grantList.answer.askFirst', 'may-press': 'grantList.answer.mayPress' } as const

/** The list as the read door answers it to the person. */
async function theList(): Promise<WhatTheGrantCarriesReading> {
  const said = await inProcess.app.inject({ method: 'GET', url: '/api/office/what-the-grant-carries', headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader() } })
  expect(said.statusCode, said.body).toBe(200)
  return said.json() as WhatTheGrantCarriesReading
}

/** A door the card keeps, that asks the check, and that has no answer of this office's: one the person may change. */
async function aKeptDoorThatAsks(): Promise<WhatTheGrantCarriesReading['doors'][number]> {
  const door = (await theList()).doors.find((one) => one.card === 'kept' && one.office === null && one.asksTheCheck)
  if (door === undefined) throw new Error('No door the card keeps asks the check, so this file has no door to change on the page.')
  return door
}

/** Open the secretary's page in a look and a language, and open every group, as a reader does. */
async function openTheList(page: Page, look: 'light' | 'dark' = 'light', lang: 'en' | 'zh' = 'en'): Promise<void> {
  await page.addInitScript((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  await page.goto(`${live.site}/${lang === 'en' ? '' : `?lang=${lang}`}#/who/agent/${THE_TEST_OFFICES_SECRETARY.handle}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.wgc .wgc-group').first().waitFor({ timeout: 60_000 })
  for (const answer of THE_ANSWERS) {
    const group = page.locator(`.wgc-group[data-group="${answer}"]`)
    if ((await group.getAttribute('open')) === null) await group.locator('summary').click()
  }
}

/** A window that holds no key and says it is the secretary: not proved to be the person. */
async function aSecretarysWindow(browser: Browser, width: number): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width, height: 1000 } })
  const page = await context.newPage()
  await page.addInitScript((handle) => localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: handle })), THE_TEST_OFFICES_SECRETARY.handle)
  return { page, close: () => context.close() }
}

beforeAll(async () => {
  db = await freshDb()
  inProcess = await apiApp()
  await inProcess.app.ready()
  const started = await inProcess.app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' } })
  expect(started.statusCode, started.body).toBe(201)
  live = await liveApp({ name: 'grant-list-on-the-page', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: db.file })
  // PAIRED: the two halves a paired browser holds, so "Change it" is the person's own press.
  await pairTheContext(live.context, live.api)
}, 240_000)

afterEach(() => {
  // EVERY CASE STARTS FROM THE CARD'S ANSWERS.
  db.client.sqlite.prepare('DELETE FROM what_the_grant_carries').run()
})

afterAll(async () => {
  await live?.stop()
  await inProcess?.app.close()
  db?.close()
}, 60_000)

describe('the list, for the person', () => {
  it('1: three groups with their counts, a row for each door in the group of its answer, and four choices on each', async () => {
    const list = await theList()
    const page = live.page
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openTheList(page)
    for (const answer of THE_ANSWERS) {
      const group = page.locator(`.wgc-group[data-group="${answer}"]`)
      expect(await group.locator('.wgc-group-head').textContent(), answer).toBe(t(GROUP_WORD[answer], { n: list.counts[answer] }))
      const drawn = await group.locator('.wgc-row[data-door]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-door')))
      expect(drawn, answer).toEqual(list.doors.filter((one) => one.answer === answer).map((one) => one.door))
    }
    const choices = await page.locator('.wgc-row[data-door] select').evaluateAll((menus) =>
      menus.map((menu) => [...(menu as HTMLSelectElement).options].map((one) => one.value).join(' ')),
    )
    expect(choices.length).toBe(list.doors.length)
    expect(new Set(choices)).toEqual(new Set(['default kept ask-first may-press']))
  }, 180_000)

  it('2: a choice stores nothing until "Change it", and then it is the person\'s answer, in its new group', async () => {
    const door = await aKeptDoorThatAsks()
    const page = live.page
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openTheList(page)
    const menu = page.locator(`.wgc-row[data-door="${door.door}"] select`)
    await menu.selectOption('may-press')
    await page.locator('.wgc-confirm').waitFor()
    const theLine = t('grantList.fromTo', {
      door: door.words.en,
      from: t('grantList.short.default', { answer: t('grantList.short.kept') }),
      to: t('grantList.short.mayPress'),
    })
    expect(await page.locator('.wgc-confirm li').allTextContents()).toEqual([theLine])
    expect((await theList()).doors.find((one) => one.door === door.door)?.office, 'stored after a choice').toBeNull()

    await page.getByRole('button', { name: t('grantList.leaveIt') }).click()
    await expect.poll(async () => page.locator('.wgc-confirm').count()).toBe(0)
    expect(await menu.inputValue(), 'the menu after "Leave it as it is"').toBe('default')
    expect((await theList()).doors.find((one) => one.door === door.door)?.office, 'stored after "Leave it as it is"').toBeNull()

    await menu.selectOption('may-press')
    await page.getByRole('button', { name: t('grantList.changeIt') }).click()
    await expect.poll(async () => page.locator('.wgc-confirm').count(), { timeout: 30_000 }).toBe(0)
    const after = await theList()
    expect(after.doors.find((one) => one.door === door.door)?.office).toMatchObject({ answer: 'may-press', kind: 'human', id: THE_PERSON })
    const moved = page.locator(`.wgc-group[data-group="may-press"] .wgc-row[data-door="${door.door}"]`)
    await expect.poll(async () => moved.count(), { timeout: 30_000 }).toBe(1)
    expect(await moved.locator('.wgc-who').textContent()).toContain("This office's answer, set by the person")
    expect(await page.locator('.wgc-group[data-group="may-press"] .wgc-group-head').textContent()).toBe(t(GROUP_WORD['may-press'], { n: after.counts['may-press'] }))
  }, 180_000)

  it('3: the line about a door that does not ask yet is on exactly the rows that do not ask the check', async () => {
    const list = await theList()
    const page = live.page
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openTheList(page)
    const saidNotYet = await page.locator('.wgc-row[data-door]').evaluateAll((rows) =>
      rows.filter((row) => row.querySelector('.wgc-not-yet') !== null).map((row) => row.getAttribute('data-door')),
    )
    const doNotAsk = list.doors.filter((one) => !one.asksTheCheck).map((one) => one.door)
    expect(doNotAsk.length, 'the read door names at least one door that does not ask yet').toBeGreaterThan(0)
    expect(new Set(saidNotYet)).toEqual(new Set(doNotAsk))
    expect(await page.locator('.wgc-not-yet').first().textContent()).toBe(t('grantList.state.doesNotAskYet'))
  }, 180_000)

  it("3b: the line about a door that also needs the person's words is on exactly the rows that need them, and says for which changes", async () => {
    // ONE ROLE CARD DOOR AT MAY-PRESS, so the list holds a door that needs the person's words only for a change to a
    // card's words beside doors that need them for every change.
    const set = await inProcess.app.inject({
      method: 'POST',
      url: '/api/office/what-the-grant-carries',
      headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader() },
      payload: { changes: [{ door: 'role.set-added', answer: 'may-press' }] },
    })
    expect(set.statusCode, set.body).toBe(200)
    const list = await theList()
    const page = live.page
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openTheList(page)
    const saidWords = await page.locator('.wgc-row[data-door]').evaluateAll((rows) =>
      rows
        .filter((row) => row.querySelector('.wgc-needs-words') !== null)
        .map((row): [string | null, string | null] => [row.getAttribute('data-door'), row.querySelector('.wgc-needs-words')?.textContent ?? null]),
    )
    const needWords = list.doors.filter((one) => one.alsoNeedsThePersonsWords)
    expect(needWords.length, "the read door names at least one door that also needs the person's words").toBeGreaterThan(0)
    expect(new Set(saidWords.map(([door]) => door))).toEqual(new Set(needWords.map((one) => one.door)))
    // THE ROLE CARD DOOR AT MAY-PRESS NAMES A CARD'S WORDS, and a door that needs the person's words for every change
    // does not.
    const said = new Map(saidWords)
    expect(said.get('role.set-added')).toBe(t('grantList.state.alsoNeedsYourWordsForACardsWords'))
    expect(said.get('office.set-restart-grant')).toBe(t('grantList.state.alsoNeedsYourWords'))
    // EACH LINE SAYS FOR WHICH CHANGES, as the shared reading answers for the door, the card's answer and the answer in force.
    const theLine = (one: (typeof needWords)[number]): string =>
      t(doesThisDoorNeedThePersonsWordsOnlyForACardsWords(one.door, one.card, one.answer) ? 'grantList.state.alsoNeedsYourWordsForACardsWords' : 'grantList.state.alsoNeedsYourWords')
    expect(new Map(saidWords)).toEqual(new Map(needWords.map((one) => [one.door, theLine(one)])))
  }, 180_000)
})

describe('the list, for somebody not proved to be the person', () => {
  it('4: no menu and no "Change it", the word read only, and each answer in words', async () => {
    const list = await theList()
    const { page, close } = await aSecretarysWindow(live.browser, 1440)
    try {
      await openTheList(page)
      expect(await page.locator('.wgc select').count(), 'menus').toBe(0)
      expect(await page.getByRole('button', { name: t('grantList.changeIt') }).count(), '"Change it"').toBe(0)
      expect(await page.locator('.wgc-read-only').textContent()).toBe(t('settingsState.readOnly'))
      const drawn = await page.locator('.wgc-row[data-door]').evaluateAll((rows) =>
        rows.map((row): [string | null, string | null] => [row.getAttribute('data-door'), row.querySelector('.wgc-answer')?.textContent ?? null]),
      )
      expect(new Map(drawn)).toEqual(new Map(list.doors.map((one) => [one.door, t(ANSWER_WORD[one.answer])])))
    } finally {
      await close()
    }
  }, 180_000)
})

describe('the list on a phone', () => {
  it('5: at 390 each row stacks and nothing scrolls sideways; at 1440 the answer is beside the words', async () => {
    const page = live.page
    const measure = async (): Promise<{ sideways: boolean; stacked: number; beside: number; rows: number }> =>
      page.evaluate(() => {
        let stacked = 0
        let beside = 0
        const rows = [...document.querySelectorAll('.wgc-row[data-door]')]
        for (const row of rows) {
          const words = row.querySelector('.wgc-about')?.getBoundingClientRect()
          const answer = row.querySelector('.wgc-answer')?.getBoundingClientRect()
          if (words === undefined || answer === undefined) continue
          if (answer.top >= words.bottom - 1) stacked += 1
          else if (answer.left >= words.right - 1) beside += 1
        }
        return { sideways: document.documentElement.scrollWidth > window.innerWidth, stacked, beside, rows: rows.length }
      })
    await page.setViewportSize({ width: 390, height: 1000 })
    await openTheList(page)
    const narrow = await measure()
    expect(narrow.rows).toBeGreaterThan(0)
    expect(narrow, 'at 390').toEqual({ sideways: false, stacked: narrow.rows, beside: 0, rows: narrow.rows })
    await page.setViewportSize({ width: 1440, height: 1000 })
    const wide = await measure()
    expect(wide, 'at 1440').toEqual({ sideways: false, stacked: 0, beside: wide.rows, rows: wide.rows })
  }, 180_000)
})

describe('the pictures', () => {
  it.skipIf(!process.env['TEST_SHOTS'])('6: photographs the list at four widths in both themes, in Chinese, and read-only', async () => {
    const shots = process.env['TEST_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const door = await aKeptDoorThatAsks()
    const set = await inProcess.app.inject({
      method: 'POST',
      url: '/api/office/what-the-grant-carries',
      headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader() },
      payload: { changes: [{ door: 'role.set-added', answer: 'may-press' }] },
    })
    expect(set.statusCode, set.body).toBe(200)
    const page = live.page
    for (const look of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await openTheList(page, look)
        await page.locator('.wgc-row[data-door="role.set-added"]').screenshot({ path: join(shots, `grant-list-role-card-row-${String(width)}-${look}.png`) })
        await page.locator(`.wgc-row[data-door="${door.door}"] select`).selectOption('may-press')
        await page.locator('.wgc-confirm').waitFor()
        await page.locator('.wgc').screenshot({ path: join(shots, `grant-list-${String(width)}-${look}.png`) })
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openTheList(page, 'light', 'zh')
    await page.locator('.wgc').screenshot({ path: join(shots, 'grant-list-1440-light-zh.png') })
    const { page: theirs, close } = await aSecretarysWindow(live.browser, 390)
    try {
      for (const look of ['light', 'dark'] as const) {
        await openTheList(theirs, look)
        await theirs.locator('.wgc').screenshot({ path: join(shots, `grant-list-390-${look}-read-only.png`) })
      }
    } finally {
      await close()
    }
  }, 400_000)
})


describe('the hand-over grant on the page', () => {
  it('shows the hand-over at 1440 and 390 in the light theme', async () => {
    const shots = process.env['OWNER_GRANT_PICTURES']
    if (shots !== undefined) mkdirSync(shots, { recursive: true })
    const page = live.page
    {
      const look = 'light' as const
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await openTheList(page, look)
        const row = page.locator('.wgc-row[data-door="agent.owner-move"]')
        await row.scrollIntoViewIfNeeded()
        expect(await row.isVisible()).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
        if (shots !== undefined) await page.screenshot({ path: join(shots, `owner-grant-${String(width)}-${look}.png`) })
      }
    }
  }, 400_000)
})
