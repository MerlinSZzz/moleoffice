// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DEEP LINK IN A BROWSER THAT HAS NEVER CHOSEN A PROJECT READS ITS PROJECT FIRST. Problem
 * ipeva-Ir-5by, wave 13q round 13 (R13c).
 *
 * A browser with nothing stored starts on the stated default project, and the frame moves it to the
 * project holding the most records once the list of projects has answered. The record page used to
 * read before that move: opened at a record of the fuller project, it asked the default project for
 * the record three times (the record, its context and what is around it), was answered 404 each
 * time, and only then drew the record.
 *
 * WHAT IS PROVED HERE, in a real browser against a real server:
 *   1. While the list of projects is held unanswered, the page asks nothing about the record.
 *   2. Once it answers, every request about the record carries the record's own project, and none
 *      is answered 404.
 *   3. The record is drawn.
 *   4. On a phone, the bar at the top draws the short mark for the project while the list is read,
 *      as the sidebar does, and never the project's id; then the project's name (problem
 *      Hz0sA-l6YmpY, found in the phone bar on the way to this one).
 *
 * THE WAIT IS MADE CERTAIN, NOT LUCKY: the list's reply is held in the browser for two seconds.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { deleteTheCopiedDefaultChapters, deleteTheFiledCardWords, liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { DEFAULT_WORKSPACE } from '../src/shared/workspaces.ts'
import { createI18n } from '../src/shared/i18n.ts'

let app: LiveApp
const PROJECT = { id: 'test-heron', title: 'Heron Bay' }
const RECORD = 'The heron nests need counting before the spring tide'
let recordId = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function file(title: string): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': PROJECT.id },
    body: JSON.stringify({ kind: 'problem', title, data: { state: 'open' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'deep-link-project', viewport: { width: 1440, height: 1000 } })
  // The default chapters a fresh office copies at its first start (wave 13s round 7) are module records
  // this test did not file, and it counts or draws modules, so it deletes them first.
  await deleteTheCopiedDefaultChapters(app.api)
  // The five role card text records a fresh office files at its first start (wave 13w round 3) are records
  // of the default project this test did not file, and it counts that project's records, so they go too.
  await deleteTheFiledCardWords(app.api)
  const made = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': DEFAULT_WORKSPACE },
    body: JSON.stringify(PROJECT),
  })
  expect(made.status, await made.text()).toBe(201)
  // THE RECORD'S PROJECT HOLDS THE MOST RECORDS, so it is where a never-chosen browser opens.
  // Five, because the default project holds four: two session records (one is liveApp's own) and the flow run the
  // office files beside every session (wave 13p round 25). Before flow runs it held two, and three did.
  await file('The first heron problem')
  await file('The second heron problem')
  await file('The third heron problem')
  await file('The fourth heron problem')
  recordId = await file(RECORD)
  // The premise is checked rather than assumed: if another project ever holds as many, the browser
  // would rightly open there, and every assertion below would fail for a reason they do not name.
  const listed = (await (await fetch(`${app.api}/api/workspaces`, { headers: AS_THE_PERSON })).json()) as {
    workspaces: { id: string; records: number }[]
  }
  const heron = listed.workspaces.find((one) => one.id === PROJECT.id)?.records ?? 0
  const others = listed.workspaces.filter((one) => one.id !== PROJECT.id)
  const counted = others.map((one) => `${one.id} holds ${String(one.records)}`).join(', ')
  expect(others.filter((one) => one.records >= heron), `${PROJECT.id} holds ${String(heron)} records and is not the fullest project (${counted})`).toEqual([])
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

it('asks nothing about the record until its project is chosen, and then asks only that project', async () => {
  // A NEW CONTEXT, so nothing is stored and the browser starts on the default project.
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
  try {
    const page = await context.newPage()
    let listAnswered = false
    const aboutTheRecord: { project: string; status: number; beforeTheList: boolean }[] = []
    await page.route('**/api/workspaces', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      await route.continue()
      listAnswered = true
    })
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname
      if (!path.startsWith(`/api/records/${recordId}`)) return
      aboutTheRecord.push({
        project: response.request().headers()['x-mole-office-workspace'] ?? '(none)',
        status: response.status(),
        beforeTheList: !listAnswered,
      })
    })

    await page.goto(`${app.site}/?lang=en#/r/${recordId}`)
    await page.waitForSelector('.rp-title', { timeout: 30_000 })
    expect(await page.locator('.rp-title').first().innerText()).toBe(RECORD)

    expect(aboutTheRecord.length, 'the page never asked about the record').toBeGreaterThan(0)
    expect(aboutTheRecord.filter((one) => one.beforeTheList), 'the page asked about the record before its project was chosen').toEqual([])
    expect(aboutTheRecord.filter((one) => one.project !== PROJECT.id), 'the page asked another project about the record').toEqual([])
    expect(aboutTheRecord.filter((one) => one.status === 404), 'a request about the record was answered 404').toEqual([])
  } finally {
    await context.close()
  }
}, 120_000)

it('draws the short mark in the phone bar while the list is read, never the project\'s id', async () => {
  const en = createI18n('en')
  const context = await app.browser.newContext({ viewport: { width: 390, height: 900 } })
  try {
    const page = await context.newPage()
    let release: () => void = () => undefined
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/workspaces', async (route) => {
      if (route.request().method() === 'GET') await released
      await route.continue()
    })
    await page.goto(`${app.site}/?lang=en#/r/${recordId}`)
    await page.locator('.shell-bar-project').waitFor({ timeout: 30_000 })
    await page.locator('#main .px-loading').waitFor({ timeout: 30_000 })
    const waiting = (await page.locator('.shell-bar-project').textContent()) ?? ''
    expect(waiting, 'the phone bar drew the id this browser sends').not.toContain(DEFAULT_WORKSPACE)
    expect(waiting).toBe(en.t('nav.empty'))
    release()
    await expect.poll(() => page.locator('.shell-bar-project').textContent(), { timeout: 30_000 }).toBe(PROJECT.title)
  } finally {
    await context.close()
  }
}, 120_000)
