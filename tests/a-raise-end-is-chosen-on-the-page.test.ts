// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RAISE'S END IS CHOSEN ON THE PAGE, NOT TYPED. Typing the end of a raise as a text date is
 * easy to get wrong, so the owner chooses it. The raise form on the agent's page
 * (TheirCard.tsx) draws RaiseEndChoice.tsx.
 *
 * In a browser, against a test office of this file's own, with the browser paired as the person (the owner's key as the
 * cookie a paired browser holds). The browser's clock is set by this file; the office's clock is read by a second
 * server in this process on the same database, with a clock this file sets too.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. With the browser's clock at 09:00 on a day ahead, the owner chooses 4 hours: the line says the raise ends today at
 *      13:00, the press sends the whole stamp `<that day> 13:00:00`, and the office stores exactly that. The raise
 *      holds a second before 13:00 that day and has ended at 13:00.
 *   2. The owner chooses Another time, and a time already past on the browser's clock: the line says it has passed and the
 *      press cannot be pressed. A later time makes it pressable again.
 *
 * When TEST_SHOTS names a folder, it also photographs the form at 1440, 990, 660 and 390 in light and dark, at 1440 in
 * Chinese and in the test language, Another time, a passed time, and the raise holding. The person's name is replaced
 * on the page before the holding picture is taken.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the commit that added this file names the logs)
 * ---------------------------------------------------------------------------------------
 *
 *   - the length not added to now (`endOf` in RaiseEndChoice.tsx returning the minute now): case 1 goes red;
 *   - a passed time handed up as though it were a choice (`onChange(stamp)` whatever `passed` says): case 2 goes red.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Page } from 'playwright'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { thePress } from '../src/shared/the-press.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let inProcess: BuiltServer
let live: LiveApp

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** 09:00 tomorrow on this machine's clock: a moment the office's real clock has not reached. */
const tomorrowAtNine = (() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0).getTime()
})()
const thatDay = localStamp(new Date(tomorrowAtNine)).slice(0, 10)

/** Who acts for the person, as the in-process server reads it with the clock this file set. */
async function whoIsRaised(): Promise<string[]> {
  const said = await inProcess.app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
  expect(said.statusCode, said.body).toBe(200)
  return (said.json().elevation.holding as { agent: string }[]).map((one) => one.agent)
}

/** The grants on the secretary's registry row, as stored. */
function theStoredGrants(): { id: string; until?: string; endedAt?: string }[] {
  const row = t.client.sqlite.prepare(`SELECT elevation FROM agents WHERE handle = '${THE_TEST_OFFICES_SECRETARY.handle}'`).get() as { elevation: string | null }
  return row.elevation === null ? [] : (JSON.parse(row.elevation) as { id: string; until?: string }[])
}

/** Open the secretary's page with the browser's clock at 09:00 tomorrow, in a look and a language. */
async function openTheRaiseForm(page: Page, look: 'light' | 'dark' = 'light', lang: 'en' | 'zh' | 'xx' = 'en', waitFor = '.rec'): Promise<void> {
  await page.addInitScript((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  await page.goto(`${live.site}/${lang === 'en' ? '' : `?lang=${lang}`}#/who/agent/${THE_TEST_OFFICES_SECRETARY.handle}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(waitFor).first().waitFor()
}

beforeAll(async () => {
  t = await freshDb()
  inProcess = await apiApp()
  await inProcess.app.ready()
  const started = await inProcess.app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' } })
  expect(started.statusCode, started.body).toBe(201)
  live = await liveApp({ name: 'raise-end-chosen', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: t.file })
  // PAIRED: the owner's key as the cookie a paired browser holds, so the press is the owner's.
  const key = thePersonsKeyHeader()['x-mole-office-key'] as string
  await live.context.addCookies([{ name: 'mole-office-key', value: key, domain: '127.0.0.1', path: '/' }])
  // THE BROWSER'S CLOCK STANDS AT 09:00 TOMORROW. Its timers still run; the time they read does not move.
  await live.page.clock.setFixedTime(tomorrowAtNine)
})

afterEach(async () => {
  vi.useRealTimers()
  await inProcess.app.inject({ method: 'DELETE', url: `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader() } })
})

afterAll(async () => {
  await live?.stop()
  await inProcess?.app.close()
  t?.close()
})

describe('the end is chosen', () => {
  it('1: 4 hours from 09:00 sends that day 13:00:00, and the raise holds until 13:00', async () => {
    const page = live.page
    await openTheRaiseForm(page)
    await page.locator('.tc-elev-reason-box textarea').fill('Tidy the notes tonight')
    await page.locator('.rec-choice[data-choice="4h"]').click()
    await expect.poll(async () => page.locator('.rec-line').textContent()).toContain('Ends today at 13:00, in 4 hours.')
    await page.getByRole('button', { name: thePress(THE_TEST_OFFICES_SECRETARY.name) }).click()
    await page.locator('.tc-elev-on').waitFor({ timeout: 30_000 })

    const grant = theStoredGrants().at(-1)
    expect(grant?.until, 'the whole stamp, as chosen').toBe(`${thatDay} 13:00:00`)
    const endsAt = new Date(tomorrowAtNine + 4 * 60 * 60_000).getTime()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(endsAt - 1000)
    expect(await whoIsRaised(), 'a second before 13:00').toEqual([THE_TEST_OFFICES_SECRETARY.handle])
    vi.setSystemTime(endsAt)
    expect(await whoIsRaised(), 'at 13:00').toEqual([])
  })

  it('2: another time that has passed cannot be pressed, and a later one can', async () => {
    const page = live.page
    await openTheRaiseForm(page)
    await page.locator('.tc-elev-reason-box textarea').fill('Tidy the notes tonight')
    await page.locator('.rec-choice[data-choice="another"]').click()
    await page.locator('.rec-day').fill(thatDay)
    await page.locator('.rec-hour').selectOption('8')
    await page.locator('.rec-passed').waitFor()
    expect(await page.locator('.rec-passed').textContent()).toBe('That time has passed. Choose a later one.')
    const press = page.getByRole('button', { name: thePress(THE_TEST_OFFICES_SECRETARY.name) })
    expect(await press.isDisabled(), 'the press with a passed time').toBe(true)
    await page.locator('.rec-hour').selectOption('18')
    await page.locator('.rec-minute').selectOption('30')
    await expect.poll(async () => page.locator('.rec-line').textContent()).toContain('Ends today at 18:30, in 9 h 30 min.')
    expect(await press.isDisabled(), 'the press with a later time').toBe(false)
  })
})

describe('the pictures', () => {
  it.skipIf(!process.env['TEST_SHOTS'])('4: photographs the choice, a passed time and the raise holding', async () => {
    const shots = process.env['TEST_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const page = live.page
    const snap = async (name: string): Promise<void> => {
      await page.locator('.tc-elev-block').first().scrollIntoViewIfNeeded()
      await page.screenshot({ path: join(shots, `${name}.png`), fullPage: false })
    }
    for (const look of ['light', 'dark'] as const) {
      await openTheRaiseForm(page, look)
      for (const width of [1440, 990, 660, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.locator('.rec-choice[data-choice="day"]').click()
        await snap(`raise-choice-${String(width)}-${look}`)
        await page.locator('.rec-choice[data-choice="another"]').click()
        await snap(`raise-another-${String(width)}-${look}`)
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    for (const lang of ['zh', 'xx'] as const) {
      await openTheRaiseForm(page, 'light', lang)
      await snap(`raise-choice-1440-light-${lang}`)
    }
    await openTheRaiseForm(page, 'light')
    await page.locator('.rec-choice[data-choice="another"]').click()
    await page.locator('.rec-day').fill(thatDay)
    await page.locator('.rec-hour').selectOption('8')
    await page.locator('.rec-passed').waitFor()
    await snap('raise-passed-1440-light')
    // THE RAISE HOLDING.
    await page.locator('.tc-elev-reason-box textarea').fill('Tidy the notes tonight')
    await page.locator('.rec-choice[data-choice="4h"]').click()
    await page.getByRole('button', { name: thePress(THE_TEST_OFFICES_SECRETARY.name) }).click()
    await page.locator('.tc-elev-on').waitFor({ timeout: 30_000 })
    for (const look of ['light', 'dark'] as const) {
      await openTheRaiseForm(page, look, 'en', '.tc-elev-on')
      await snap(`raise-holding-1440-${look}`)
    }
  })
})
