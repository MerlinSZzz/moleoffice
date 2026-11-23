// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY LETS A VISITOR IN ON ITS ROW, AND A KEY IS TAKEN BACK ON THE CITIZEN'S OWN PAGE.
 *
 * Question 15 of report n9Mjk3c_sJRu, answered as recommended by a decision: "Let it in" sits on the row of a visitor
 * asking to come in, and Revoke key moves off the Embassy's rows to the citizen's own page, the page the row opens: the
 * profile for a registered agent (ProfilePage.tsx, cleared in SOdG_M9Rqq3J) and the credential page for a
 * visitor no registry holds. A person's device is on neither since design C of early idea B9: its row and its
 * Revoke press are on the owner's own person card, and the Embassy draws no device row.
 *
 * This is a browser test against a real stack. Made-up agents, visitors and devices come in through
 * the real doors. Then:
 *   - "Let it in" on a visitor's row lets it in where it stands: the row leaves "Asking to come in",
 *     the visitor is in the citizens' Agents group, and the Embassy is not read again;
 *   - no row on the Embassy draws Revoke key, although the office says rows hold keys;
 *   - his card's row for a device and the profile each draw a Revoke press for the key (Revoke its
 *     own key), take the key back at once and give it back on Undo;
 *   - the agents at the door are still drawn first, each with its press;
 *   - no citizen row draws a picture that does not load (problem HeAu5V4oRmjn: a card with no
 *     drawings was given the address of a first drawing that does not exist).
 *
 * MUTATIONS (after a green control), each red; the commit and the report name the logs:
 *   1. drop the line in AskingCard that takes the Let it in reply onto the page (EmbassyPage.tsx);
 *   2. draw Revoke key on the Embassy's rows again (a RevokeTheirKey in EmbassyPage.tsx's Row);
 *   3. take the RevokeTheirKey line out of CredentialPage.tsx;
 *   3b. take the RevokeTheirKey line out of ProfilePage.tsx;
 *   4. take the AsksAtTheDoor element out of EmbassyPage.tsx;
 *   5. answer the first drawing's address for every card again (src/server/api/office.ts).
 *
 * PHOTOGRAPHS at 1440, 990, 660 and 390, light and dark, and at 1440 in Chinese and in the test
 * language, when EMBASSY_DOOR_SHOTS names a folder. They are taken first, before any press.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { WhatTheEmbassySays } from '../src/shared/worlds.ts'
import { en } from '../src/shared/words/en.ts'

let app: LiveApp

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** The asks at the visitors' door are sent by an agent registered here, as the door needs a writer it knows. */
const AS_A_VISITOR = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'moss-sorter' }

async function post(path: string, body: unknown, headers: Record<string, string> = AS_THE_PERSON): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = (await reply.text()).replace(/[0-9a-f]{64}/g, '<a key>')
  expect(reply.status, `${path}: ${text.slice(0, 400)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function theEmbassy(): Promise<WhatTheEmbassySays> {
  const reply = await fetch(`${app.api}/api/office/embassy`, { headers: AS_THE_PERSON })
  expect(reply.status).toBe(200)
  return (await reply.json()) as WhatTheEmbassySays
}

async function open(path: string, query = ''): Promise<void> {
  await app.page.goto(`${app.site}/${query}#${path}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
}

/** Show every row, where the page offers it, so a row that is nobody's contact is drawn too. */
async function showEveryone(): Promise<void> {
  const toggle = app.page.locator('.emb-show[aria-pressed="false"]', { hasText: en['g4.embassy.showEveryone'] })
  if ((await toggle.count()) > 0) await toggle.first().click()
}

/** Every Embassy read this browser made, so "the page was read again" is a count. */
const asked: string[] = []
const embassyReads = (): number => asked.filter((one) => one.includes('/api/office/embassy')).length

/** The credential of the confirmed device, whose page carries its key's press. */
let deviceCredential = ''

beforeAll(async () => {
  app = await liveApp({ name: 'embassy-door', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  app.page.on('request', (req) => asked.push(req.url()))
  // CITIZENS OF THIS MACHINE, on three cards, and one on a card that has no drawings.
  await post('/api/agents/started', { handle: 'wren-ledger', name: 'Wren Ledger', role: 'secretary' })
  await post('/api/agents/started', { handle: 'pike-foreman', name: 'Pike Foreman', role: 'supervisor' })
  await post('/api/agents/started', { handle: 'moss-sorter', name: 'Moss Sorter', role: 'worker' })
  // A CARD WITH NO DRAWINGS IS NOW A CARD THAT HAS GONE. Every declared card has drawings, and the
  // mailer card, which had none, left the declaration on 1 October 2026. An
  // office whose mail tool registered before then still holds a live agent on it. So the row is filed
  // on a declared card, and its stored card word is then set to the old one in this test's own
  // database, the state such an office is in: no door writes a card nobody declares.
  const runner = await post('/api/records', {
    kind: 'agent',
    title: 'Post Runner',
    data: { handle: 'post-runner', role: 'inspector', startedBy: { kind: 'person', id: THE_PERSON } },
  })
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    db.pragma('busy_timeout = 5000')
    const changed = db.prepare("UPDATE records SET data = json_set(data, '$.role', 'mailer') WHERE id = ?").run(String(runner['record'].id))
    expect(changed.changes, 'the Post Runner row was not found to give it the old card').toBe(1)
  } finally {
    db.close()
  }
  // A DEVICE THAT CAME IN: it asked, and the person let it in, so it holds a key.
  const device = await post('/api/office/visitors', { device: 'Kitchen tablet' }, AS_A_VISITOR)
  deviceCredential = String(device['credential'].id)
  await post(`/api/office/visitors/${deviceCredential}/confirm`, {})
  // TWO VISITORS STILL ASKING: an agent from another machine and a device.
  await post('/api/office/visitors', {
    handle: 'heron-visitor', name: 'Heron from the lab', role: 'worker', conversationPath: '/tmp/heron-visitor.jsonl',
  }, AS_A_VISITOR)
  await post('/api/office/visitors', { device: 'Garden phone' }, AS_A_VISITOR)
  // AND ONE AGENT AT THE DOOR, which registered itself and waits for the owner's press.
  const ask = await fetch(`${app.api}/api/agents/register-myself`, {
    method: 'POST',
    headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'finch-newcomer' },
    body: JSON.stringify({ handle: 'finch-newcomer', name: 'Finch Newcomer', workingDirectory: '/tmp', requestedRole: 'worker' }),
  })
  expect(ask.status, (await ask.text()).replace(/[0-9a-f]{64}/g, '<a key>')).toBe(202)
  await app.page.addInitScript(() => {
    if (localStorage.getItem('mole-office.workspace') === null) localStorage.setItem('mole-office.workspace', 'default')
    if (localStorage.getItem('mole-office.preset.theme') === null) localStorage.setItem('mole-office.preset.theme', 'light')
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('photographs', () => {
  it.skipIf(!process.env['EMBASSY_DOOR_SHOTS'])('photographs the Embassy before any press', async () => {
    const shots = process.env['EMBASSY_DOOR_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const take = async (name: string, width: number, theme: 'light' | 'dark', query = '') => {
      await app.page.setViewportSize({ width, height: 1000 })
      await open('/embassy', query)
      await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      await app.page.reload({ timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      await app.page.locator('.emb-row').first().waitFor({ state: 'visible', timeout: 30_000 })
      if (query === '') await showEveryone()
      await app.page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
    }
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) await take(`embassy-${String(width)}-${theme}`, width, theme)
    }
    await take('embassy-1440-zh', 1440, 'light', '?lang=zh')
    await take('embassy-1440-xx', 1440, 'light', '?lang=xx')
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.evaluate(() => localStorage.setItem('mole-office.preset.theme', 'light'))
    // A DEVICE'S CREDENTIAL PAGE OPENS HIS CARD AT ITS ROW, design C of early idea B9.
    await open(`/visitor/${deviceCredential}`)
    await app.page.locator(`[data-browser="${deviceCredential}"]`).first().waitFor({ state: 'visible', timeout: 30_000 })
    await app.page.screenshot({ path: `${shots}/card-row-1440-light.png`, fullPage: true })
    await app.page.setViewportSize({ width: 390, height: 1000 })
    await app.page.reload({ timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.screenshot({ path: `${shots}/card-row-390-light.png`, fullPage: true })
    const pike = (await theEmbassy()).rows.find((one) => one.name === 'Pike Foreman')
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await open(`/who/agent/${String(pike?.who.id)}`)
    await app.page.locator('.prof-name').first().waitFor({ state: 'visible', timeout: 30_000 })
    await app.page.screenshot({ path: `${shots}/profile-1440-light.png`, fullPage: true })
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }, 900_000)
})

describe('the Embassy after question 15', () => {
  it('draws the agents at the door first, under Asking to come in, each with its press', async () => {
    await open('/embassy')
    const asking = app.page.locator('[data-target$="embassy.asking"]')
    const ask = asking.locator('.door-ask[data-door-ask="finch-newcomer"]')
    await ask.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await ask.locator('.tc-ask button', { hasText: 'Admit it' }).count()).toBe(1)
    // FIRST ON THE PAGE: the panel comes before the citizens.
    const order = await app.page.evaluate(() => {
      const panels = [...document.querySelectorAll('[data-target]')].map((one) => one.getAttribute('data-target') ?? '')
      return panels.filter((one) => one.endsWith('embassy.asking') || one.endsWith('embassy.citizens'))
    })
    expect(order[0]).toMatch(/embassy\.asking$/)
  }, 120_000)

  it('draws no Revoke key on any row, though the office says rows hold keys', async () => {
    const said = await theEmbassy()
    const device = said.rows.find((one) => one.credential === deviceCredential)
    expect(device?.heldKeys.length, 'the device holds a key').toBe(1)
    const agent = said.rows.find((one) => one.name === 'Pike Foreman')
    expect(agent?.heldKeys.length, 'and so does a registered agent').toBe(1)
    await open('/embassy')
    await app.page.locator('.emb-row').first().waitFor({ state: 'visible', timeout: 30_000 })
    await showEveryone()
    await app.page.locator('.emb-row', { hasText: 'Pike Foreman' }).waitFor({ state: 'visible', timeout: 30_000 })
    expect(await app.page.getByRole('button', { name: /^Revoke/ }).count(), 'no row at all').toBe(0)
    // THE DEVICE IS NOT A ROW HERE: it is on his card, which his one row leads to (design C of early idea B9).
    expect(await app.page.getByRole('link', { name: 'Kitchen tablet', exact: true }).count(), 'no device row').toBe(0)
    const { hrefOf, whoPath } = await import('../src/web/components/router.tsx')
    expect(await app.page.locator(`.emb-row a[href="${hrefOf(whoPath('person', THE_PERSON))}"]`).count(), 'his row').toBeGreaterThan(0)
  }, 120_000)

  it('draws Revoke key on his card\'s row for the device, takes the key back at once, and gives it back on Undo', async () => {
    const keyOf = async () => (await theEmbassy()).rows.find((one) => one.credential === deviceCredential)?.heldKeys[0]?.id ?? null
    const key = await keyOf()
    expect(key).toBeTruthy()
    const { hisBrowserPath } = await import('../src/web/components/router.tsx')
    await open(hisBrowserPath(deviceCredential))
    const row = app.page.locator(`[data-browser="${deviceCredential}"]`)
    const press = row.getByRole('button', { name: en['embassyKeys.revokeOwn'], exact: true })
    await press.waitFor({ state: 'visible', timeout: 30_000 })
    await press.click()
    const bar = app.page.locator('.tiered-undo')
    await bar.waitFor({ state: 'visible', timeout: 20_000 })
    expect(await keyOf(), 'the key is taken back at once').toBeNull()
    expect(await bar.innerText()).toContain('Its own key: revoked.')
    await bar.getByRole('button', { name: /^Undo/ }).click()
    await press.waitFor({ state: 'visible', timeout: 20_000 })
    expect(await keyOf(), 'and Undo gives the same key back').toBe(key)
  }, 120_000)

  it('draws Revoke key on a registered agent\'s profile, and it takes back that agent\'s key', async () => {
    const rowOf = async () => (await theEmbassy()).rows.find((one) => one.name === 'Pike Foreman')
    const before = await rowOf()
    expect(before?.heldKeys.length).toBe(1)
    await open(`/who/agent/${String(before?.who.id)}`)
    const press = app.page.getByRole('button', { name: en['embassyKeys.revokeOwn'], exact: true })
    await press.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await press.count(), 'one press on the page').toBe(1)
    await press.click()
    const bar = app.page.locator('.tiered-undo')
    await bar.waitFor({ state: 'visible', timeout: 20_000 })
    expect((await rowOf())?.heldKeys, 'the key is taken back at once').toEqual([])
    expect(await bar.innerText()).toContain('Its own key: revoked.')
    await bar.getByRole('button', { name: /^Undo/ }).click()
    await press.waitFor({ state: 'visible', timeout: 20_000 })
    expect((await rowOf())?.heldKeys, 'and Undo gives the same key back').toEqual(before?.heldKeys)
  }, 120_000)

  it('lets a visitor in on its row, where it stands, with no second read of the Embassy', async () => {
    await open('/embassy')
    const asking = app.page.locator('[data-target$="embassy.asking"]')
    const card = asking.locator('.emb-asking-card').filter({ hasText: 'Heron from the lab' })
    await card.waitFor({ state: 'visible', timeout: 30_000 })
    await app.page.evaluate(() => {
      const held = window as unknown as { theList?: Element | null }
      held.theList = document.querySelector('[data-target$="embassy.citizens"]')
    })
    const before = embassyReads()
    await card.getByRole('button', { name: en['g4.embassy.confirm'], exact: true }).click()
    await card.waitFor({ state: 'detached', timeout: 20_000 })
    const citizen = app.page.locator('[data-target$="embassy.citizens"] .emb-row').filter({ hasText: 'Heron from the lab' })
    await citizen.waitFor({ state: 'visible', timeout: 20_000 })
    expect(await citizen.evaluate((one) => one.closest('[data-group]')?.getAttribute('data-group') ?? null)).toBe('agent')
    const sameList = await app.page.evaluate(() => {
      const held = window as unknown as { theList?: Element | null }
      return held.theList !== null && held.theList !== undefined && document.contains(held.theList)
    })
    expect(sameList, 'the citizens list was never taken off the page').toBe(true)
    expect(embassyReads() - before, 'the page did not read the Embassy again').toBe(0)
  }, 120_000)

  it('draws no citizen picture that does not load', async () => {
    const said = await theEmbassy()
    const runner = said.rows.find((one) => one.name === 'Post Runner')
    expect(runner, 'the agent on a card with no drawings has a row').toBeTruthy()
    await open('/embassy')
    await app.page.locator('.emb-row').first().waitFor({ state: 'visible', timeout: 30_000 })
    await showEveryone()
    await app.page.locator('.emb-row', { hasText: 'Post Runner' }).waitFor({ state: 'visible', timeout: 30_000 })
    await app.page.waitForFunction(() => [...document.querySelectorAll('.emb-row img')].every((one) => (one as HTMLImageElement).complete), null, { timeout: 20_000 })
    const broken = await app.page.$$eval('.emb-row img', (all) =>
      all.filter((one) => (one as HTMLImageElement).naturalWidth === 0).map((one) => one.getAttribute('alt') ?? ''))
    expect(broken, 'pictures that did not load').toEqual([])
  }, 120_000)
})
