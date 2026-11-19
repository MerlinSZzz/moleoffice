// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'

// Wave 13q's E1 gave the address door's refusals codes (src/shared/refusal-codes.ts), and its report
// (h3Rjf86iBrO5, block b-8) left the address card on a person's own page still drawing the door's
// English sentence. This draws the card, answers its save with a refusal the real door wrote, and
// reads what the card says in Chinese and in English.
let app: LiveApp
const shots = process.env.W13K_PN_SHOTS
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let refusal: { error: string; code: string }

beforeAll(async () => {
  app = await liveApp({ name: 'address-card-refusal', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // A REAL REFUSAL FROM THE REAL DOOR: a worker's key asking to set the person's address.
  const made = await fetch(`${app.api}/api/agents/started`, { method: 'POST', headers, body: JSON.stringify({ handle: 'test-alder', name: 'Test Alder', role: 'worker' }) })
  expect(made.status, await made.clone().text()).toBe(201)
  const registered = await made.json()
  const reply = await fetch(`${app.api}/api/participants/person/${THE_PERSON}/address-as`, {
    method: 'PUT', headers: { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': registered.agent.id, 'x-mole-office-key': registered.whatToGiveIt.key },
    body: JSON.stringify({ name: 'Rowan' }),
  })
  expect(reply.status).toBe(403)
  refusal = await reply.json()
  expect(refusal.code).toBe('addressPersonNeedsSecretary')
  // The page's own save goes to the real door carrying the worker's key, so the door refuses it and
  // the card draws the whole reply the door sent, headers and all.
  await app.page.route('**/api/participants/person/*/address-as', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    await route.continue({ headers: { ...route.request().headers(), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': registered.agent.id, 'x-mole-office-key': registered.whatToGiveIt.key } })
  })
  if (shots) mkdirSync(shots, { recursive: true })
})
afterAll(async () => { await app?.stop() })

async function refuseASave(language: 'en' | 'zh'): Promise<string> {
  await app.page.goto(`${app.site}/?lang=${language}#/who/person/${encodeURIComponent(THE_PERSON)}`)
  await waitForThePage(app.page)
  const words = language === 'zh' ? zh : en
  await app.page.locator('main.page .prof-address-as-open button', { hasText: words['address.change'] }).click()
  await app.page.locator('main.page .prof-address-as-form input[name="name"]').fill('Rowan')
  await app.page.locator('main.page .prof-address-as-presses button', { hasText: words['address.save'] }).click()
  const failure = app.page.locator('main.page .prof-address-as-failure')
  await failure.waitFor({ timeout: 5_000 })
  if (shots) await failure.screenshot({ path: join(shots, `address-refusal-${language}.png`) })
  return failure.innerText()
}

it('draws the address refusal in Chinese on a Chinese page, by its code', async () => {
  const said = await refuseASave('zh')
  expect(said).toContain(zh['server.addressPersonNeedsSecretary'])
  expect(said).not.toContain(refusal.error)
  expect(said).toContain(zh['address.faultLead'])
})

it('draws the same refusal in English on an English page', async () => {
  const said = await refuseASave('en')
  expect(said).toContain(en['server.addressPersonNeedsSecretary'])
})
