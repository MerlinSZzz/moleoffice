// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLAN PAGE REFUSES A SAVE BUILT ON AN OLDER COPY, SAYS SO, AND OFFERS A WAY ON.
 *
 * In a browser, against a test office of this file's own. A second writer (the other tab) writes through the office's
 * doors in this process, on the same database, while the page is open.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The other tab renames the plan. The page's rename is not written: the page says the name is not stored, shows
 *      the name the plan has now, and offers Use that name and Keep my name. Keep my name then writes it.
 *   2. The plan has ended and the other tab ends it another way. Put it back in the list is refused, the plan stays as
 *      the other tab left it, and the page says it now shows the plan as it is stored.
 *   3. The other tab changes a line. A tick in the table, built on the older copy, is refused with the table's
 *      sentence, and the line stays as the other tab wrote it.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the commit that added this file names the logs)
 * ---------------------------------------------------------------------------------------
 *
 *   - the rename refusal drawn without its way on (`StoredNameChoice` not drawn in PlanWriting.tsx): case 1 goes red;
 *   - Put it back in the list writing with no check (the press calling `api.savePlan(plan, { state: 'open' }, null)`):
 *     case 2 goes red;
 *   - the tick sent with no version (`storeOneLine` sending null): case 3 goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'

import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let inProcess: BuiltServer
let live: LiveApp

const AS_THE_OTHER_TAB = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const BODY = ['# Week of the harness', '', '- [ ] Build the harness', '- [ ] Read the brief'].join('\n')

/** The other tab: a write through the office's own door, on the copy it has just read. */
async function theOtherTabWrites(planId: string, change: Record<string, unknown>, door = ''): Promise<void> {
  const read = await inProcess.app.inject({ method: 'GET', url: `/api/plans/${planId}/blocks`, headers: AS_THE_OTHER_TAB })
  expect(read.statusCode, read.body).toBe(200)
  const written = await inProcess.app.inject({
    method: door === '/body' ? 'PUT' : 'PATCH',
    url: `/api/plans/${planId}${door}`,
    headers: AS_THE_OTHER_TAB,
    payload: { ...change, ifVersion: read.json().version },
  })
  expect(written.statusCode, written.body).toBe(200)
}

async function aPlan(title: string): Promise<string> {
  const made = await inProcess.app.inject({ method: 'POST', url: '/api/plans', headers: AS_THE_OTHER_TAB, payload: { title, body: BODY } })
  expect(made.statusCode, made.body).toBe(201)
  return String(made.json().plan.id)
}

async function storedPlan(planId: string): Promise<{ title: string; state: string; lines: string[] }> {
  const read = await inProcess.app.inject({ method: 'GET', url: `/api/plans/${planId}/blocks`, headers: AS_THE_OTHER_TAB })
  const reply = read.json() as { plan: { title: string; state: string }; lines: { line: { text: string } }[] }
  return { title: reply.plan.title, state: reply.plan.state, lines: reply.lines.map((one) => one.line.text) }
}

/** Open one plan, in a look and a language, and wait for its name field. */
async function openThePlan(page: Page, planId: string, look: 'light' | 'dark' = 'light', lang: 'en' | 'zh' | 'xx' = 'en'): Promise<void> {
  await page.addInitScript((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  await page.goto(`${live.site}/${lang === 'en' ? '' : `?lang=${lang}`}#/plans/${planId}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.op-title').waitFor()
}

/** The page renames the plan after the other tab did, and waits for the refusal. */
async function renameAfterTheOtherTab(page: Page, planId: string): Promise<void> {
  await theOtherTabWrites(planId, { title: 'Week of the harness, renamed in the other tab' })
  await page.locator('.op-title').fill('Week of the harness and the sensor')
  await page.locator('.pw-name-clash').waitFor({ timeout: 20_000 })
}

beforeAll(async () => {
  t = await freshDb()
  inProcess = await apiApp()
  await inProcess.app.ready()
  live = await liveApp({ name: 'plan-somebody-wrote-first', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: t.file })
})

afterAll(async () => {
  await live?.stop()
  await inProcess?.app.close()
  t?.close()
})

describe('a save built on an older copy', () => {
  it('1: a rename after the other tab renamed is refused, shows the stored name, and Keep my name writes it', async () => {
    const page = live.page
    const planId = await aPlan('Week of the harness')
    await openThePlan(page, planId)
    await renameAfterTheOtherTab(page, planId)
    expect(await page.locator('.pw-name-clash-say').textContent()).toBe('The plan is called “Week of the harness, renamed in the other tab” now.')
    const note = await page.locator('.pw-fault .px-error').textContent()
    expect(note).toContain('This plan was changed after this page read it, so nothing was written.')
    // NO RETRY IS OFFERED, because sending the same name again would be refused the same way, so no sentence asks for one.
    expect(await page.locator('.pw-fault').getByRole('button', { name: 'Retry' }).count()).toBe(0)
    expect(note).not.toContain('Retry')
    expect((await storedPlan(planId)).title, 'the other tab\'s name, untouched').toBe('Week of the harness, renamed in the other tab')

    await page.getByRole('button', { name: 'Keep my name' }).click()
    await expect.poll(async () => (await storedPlan(planId)).title, { timeout: 20_000 }).toBe('Week of the harness and the sensor')
    await page.locator('.pw-name-clash').waitFor({ state: 'detached' })
  })

  it('2: Put it back in the list is refused when the other tab ended the plan another way', async () => {
    const page = live.page
    const planId = await aPlan('Week of the gripper')
    await theOtherTabWrites(planId, { state: 'done' })
    await openThePlan(page, planId)
    await theOtherTabWrites(planId, { state: 'dropped' })
    await page.getByRole('button', { name: 'Put it back in the list' }).click()
    await page.locator('.op-end .px-error').waitFor({ timeout: 20_000 })
    await expect.poll(async () => page.locator('.op-end .px-error').textContent(), { timeout: 20_000 }).toContain("This page now shows the plan's stored state.")
    await expect.poll(async () => page.locator('.op-name .px-chip-word').last().textContent(), { timeout: 20_000 }).toBe('dropped')
    expect((await storedPlan(planId)).state, 'as the other tab left it').toBe('dropped')
  })

  it('3: a tick built on an older copy is refused with the table\'s sentence, and the other tab\'s line stays', async () => {
    const page = live.page
    const planId = await aPlan('Week of the brief')
    await openThePlan(page, planId)
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    await page.locator('.pi-tick').first().waitFor()
    const theirs = BODY.replace('- [ ] Read the brief', '- [ ] Read the brief twice')
    await theOtherTabWrites(planId, { body: theirs }, '/body')
    await page.locator('.pi-tick').first().click()
    await expect.poll(async () => page.locator('.pi-said[data-ok="0"]').first().textContent(), { timeout: 20_000 }).toBe(
      'This plan changed after the table read it, so this was not saved. Reload the page to see the stored row, then make your change again.',
    )
    expect((await storedPlan(planId)).lines).toEqual(theirs.split('\n'))
  })
})
