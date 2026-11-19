// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSED PIN IS DRAWN IN THE PAGE'S LANGUAGE (wave 13q round 41, wave 13k's message kH42Lh1OPu4N).
 *
 * ErrorNote draws a coded refusal as the code's sentence from the word lists only when it is given the fault. Eight
 * error notes in Governance.tsx, TheirCard.tsx and YourCard.tsx kept only the caught error's message, so a coded
 * refusal was drawn as the server's English on a Chinese page. Each now keeps the error as its message and its fault,
 * and draws it with the fault. This file proves one of them: the Pin press on a fork.
 *
 * WHAT IS MEASURED: the person opens a fork's page in Chinese and presses Pin. The office's answer to that one PATCH is
 * a refusal with the code `recordNotFound`. The pin's error note says the Chinese sentence of that code, and not the
 * English the refusal carried.
 * MUTATION: in PinTheFork in src/web/components/Governance.tsx, drop `fault={failed.fault}` from its ErrorNote. The
 * note is then the English sentence, and the case goes red.
 *
 * WHY THE REFUSAL IS ANSWERED IN THE BROWSER: no refusal a pin can meet carries a code today. The test answers the one
 * PATCH itself, with Playwright, in the shape every refusal of the server has (`error`, `reason`, `code`, `values`),
 * with the headers of a real reply of the same server, and lets every other request reach the real API. What is tested
 * is how the pin draws the answer, which is the line that changed.
 *
 * THE OFFICE IS THIS TEST'S OWN: `liveApp` starts its own API and database. Every name here is made up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Route } from 'playwright'
import { createI18n } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let proposalId = ''

const AS_AN_AGENT: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
}

const ENGLISH_ERROR = 'Test: the server refused this pin, in its own English sentence.'

beforeAll(async () => {
  app = await liveApp({ name: 'refused-pin-language', viewport: { width: 1440, height: 900 } })
  // A FORK, filed by an agent, which is who files them.
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_AN_AGENT,
    body: JSON.stringify({
      kind: 'proposal',
      title: 'Test: should the gravel be graded?',
      data: { question: 'Test: should the gravel be graded?', options: ['a — Grade it.', 'b — Leave it.'], who_settles_it: 'the owner' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  proposalId = ((await filed.json()) as { record: { id: string } }).record.id

  await app.page.route(`**/api/records/${proposalId}`, async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    const refusal = { error: ENGLISH_ERROR, reason: 'Test: refused.', code: 'recordNotFound', values: {} }
    // THE SERVER'S OWN HEADERS, from a harmless read of the same server, so the page reads it as this server's reply.
    const real = await route.fetch({ method: 'GET', url: `${app.api}/api`, postData: '' })
    return route.fulfill({ response: real, status: 400, contentType: 'application/json', body: JSON.stringify(refusal) })
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a refused pin is drawn in the page language', () => {
  it('draws, on a Chinese page, the sentence of the refusal code, and not the English the server wrote', async () => {
    const page = app.page
    await page.goto(`${app.site}/?lang=zh#/r/${proposalId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    // The person, as the sidebar's actor picker leaves it when nobody has chosen another.
    await page.evaluate(() => window.localStorage.removeItem('mole-office.actor'))
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.px-pin button', { timeout: 30_000 })
    await page.locator('.px-pin button').first().click()

    const note = page.locator('.px-pin .px-error .px-error-msg')
    await note.waitFor({ timeout: 20_000 })
    const drawn = (await note.innerText()).trim()
    expect(drawn).not.toBe(ENGLISH_ERROR)
    expect(drawn).toBe(createI18n('zh').t('server.recordNotFound', {}))
  }, 120_000)
})
