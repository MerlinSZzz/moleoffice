// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { Locator, Page } from 'playwright'
import { liveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { KEY_REVOCATION_UNDO_MS } from '../src/shared/danger-tiers.ts'
import type { TheNotebookRead } from '../src/shared/notebook.ts'
import type { WhatTheEmbassySays } from '../src/shared/worlds.ts'

const owner = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const visitor = { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'danger-tier-fixture' }
const shots = process.env['DANGER_TIER_SHOTS']
const sizes = shots ? [1440, 990, 660, 390] : [390]
const themes = shots ? ['light', 'dark'] : ['light']

async function post(api: string, path: string, body: unknown, headers = owner) {
  const reply = await fetch(`${api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.ok, text).toBe(true)
  return JSON.parse(text)
}

async function fit(page: Page, element: Locator) {
  const box = await element.boundingBox()
  expect(box).not.toBeNull()
  const viewport = page.viewportSize()!
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

it('asks before Remove, keeps the entry on Cancel, and removes it only after confirmation', async () => {
  const live = await liveApp({ name: 'danger-tier-notebook', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  try {
    await post(live.api, '/api/agents/started', { handle: 'scribe', name: 'Scribe', role: 'secretary' })
    const words = 'Test entry: Read the whole report before changing the plan.'
    await post(live.api, '/api/agents/scribe/notebook/entries', { entryKind: 'a-summary', text: words })
    const read = async () => (await (await fetch(`${live.api}/api/agents/scribe/notebook`, { headers: owner })).json()) as TheNotebookRead
    let removals = 0
    live.page.on('request', (req) => { if (req.method() === 'DELETE' && req.url().includes('/notebook/entries/')) removals++ })
    await live.page.goto(`${live.site}/#/who/agent/scribe/notebook`)
    await waitForThePage(live.page)
    const remove = live.page.locator('.nb-entry').getByRole('button', { name: 'Remove', exact: true })
    await remove.click()
    const dialog = live.page.getByRole('dialog', { name: 'Remove this entry?' })
    await dialog.waitFor()
    expect(await dialog.locator('blockquote').innerText()).toBe(words)
    expect(await dialog.innerText()).toContain('This cannot be undone.')
    expect(removals).toBe(0)
    expect((await read()).entries).toHaveLength(1)
    expect(await dialog.getByRole('button', { name: 'Cancel' }).evaluate((el) => el === document.activeElement)).toBe(true)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'hidden' })
    expect(removals).toBe(0)
    expect((await read()).entries).toHaveLength(1)
    expect(await remove.evaluate((el) => el === document.activeElement)).toBe(true)
    await remove.click()
    await dialog.waitFor()
    await live.page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    expect((await read()).entries).toHaveLength(1)
    await remove.click()
    await dialog.waitFor()
    if (shots) mkdirSync(shots, { recursive: true })
    for (const width of sizes) for (const theme of themes) {
      await live.page.setViewportSize({ width, height: 1000 })
      await live.page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme)
      await fit(live.page, dialog)
      if (shots) await live.page.screenshot({ path: `${shots}/notebook-question-${width}-${theme}.png`, fullPage: true })
    }
    const deleted = live.page.waitForResponse((reply) => reply.request().method() === 'DELETE' && reply.url().includes('/notebook/entries/'))
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
    expect((await deleted).status()).toBe(200)
    await live.page.locator('.nb-entry').waitFor({ state: 'hidden' })
    expect(removals).toBe(1)
    expect((await read()).entries).toHaveLength(0)
  } finally { await live.stop() }
}, 120_000)

it('revokes at once, counts down, and brings the key back when Undo is pressed', async () => {
  const live = await liveApp({ name: 'danger-tier-embassy', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  try {
    await post(live.api, '/api/agents/started', { handle: 'danger-tier-fixture', name: 'Danger tier fixture', role: 'worker' })
    const asked = await post(live.api, '/api/office/visitors', { device: 'Scribe' }, visitor)
    const confirmed = await post(live.api, `/api/office/visitors/${asked.credential.id}/confirm`, {})
    const keyId = confirmed.deviceKey.id as string
    const read = async () => (await (await fetch(`${live.api}/api/office/embassy`, { headers: owner })).json()) as WhatTheEmbassySays
    const key = async () => (await read()).rows.find((row) => row.name === 'Scribe')?.heldKeys[0]?.id ?? null
    // A DEVICE'S KEY IS REVOKED ON ITS ROW ON THE PERSON'S CARD. A device is one of the person's browsers,
    // and since design C of early idea B9 its row and the press are there. Its old address forwards there.
    const { hisBrowserPath } = await import('../src/web/components/router.tsx')
    await live.page.goto(`${live.site}/#${hisBrowserPath(asked.credential.id as string)}`)
    await waitForThePage(live.page)
    const row = live.page.locator(`[data-browser="${asked.credential.id as string}"]`)
    await row.getByRole('button', { name: 'Revoke its own key', exact: true }).waitFor()
    await live.page.clock.install()
    await live.page.clock.pauseAt(new Date())
    if (shots) mkdirSync(shots, { recursive: true })
    for (const width of sizes) for (const theme of themes) {
      await live.page.setViewportSize({ width, height: 1000 })
      await live.page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme)
      await row.getByRole('button', { name: 'Revoke its own key', exact: true }).click()
      const bar = row.locator('.tiered-undo')
      await bar.waitFor()
      expect(await live.page.getByRole('dialog').count()).toBe(0)
      expect(await key()).toBeNull()
      expect(await bar.innerText()).toContain('Its own key: revoked.')
      const before = await bar.getByRole('button').innerText()
      await live.page.clock.runFor(1000)
      expect(await bar.getByRole('button').innerText()).not.toBe(before)
      await bar.scrollIntoViewIfNeeded()
      await fit(live.page, bar)
      if (shots) await live.page.screenshot({ path: `${shots}/embassy-undo-${width}-${theme}.png`, fullPage: true })
      await bar.getByRole('button', { name: /^Undo/ }).click()
      await row.getByRole('button', { name: 'Revoke its own key', exact: true }).waitFor()
      expect(await key()).toBe(keyId)
      expect(await bar.count()).toBe(0)
    }
    await row.getByRole('button', { name: 'Revoke its own key', exact: true }).click()
    await row.locator('.tiered-undo').waitFor()
    await live.page.clock.runFor(KEY_REVOCATION_UNDO_MS)
    await row.locator('.tiered-undo').waitFor({ state: 'hidden' })
    expect(await key()).toBeNull()
  } finally { await live.stop() }
}, 120_000)
