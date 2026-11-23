// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The plugin window uses the room below its own top, including after the browser or header changes size. */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { PLUGIN_READ_INTERFACE } from '../src/shared/plugin-read.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const ID = 'made-up-window'
const scratch = aTestDatabaseFolder('plugin-window')
const pluginsBefore = process.env['MOLE_OFFICE_PLUGINS']
let app: LiveApp

beforeAll(async () => {
  const folder = join(scratch, 'plugins', ID)
  mkdirSync(join(folder, 'dist'), { recursive: true })
  writeFileSync(join(folder, 'plugin.json'), JSON.stringify({
    id: ID, name: { en: 'Made-up window' }, version: '0.1.0', interface: PLUGIN_READ_INTERFACE,
    pages: [{ slug: 'main', title: { en: 'Main' } }], reads: [], budget: { builtKilobytes: 20 },
  }))
  writeFileSync(join(folder, 'dist', 'main.html'), '<!doctype html><html lang="en"><title>Made-up window</title><body>A made-up plugin.</body></html>')
  process.env['MOLE_OFFICE_PLUGINS'] = join(scratch, 'plugins')
  app = await liveApp({ name: 'plugin-window', viewport: { width: 1440, height: 1000 } })
  const on = await fetch(`${app.api}/api/plugins/${ID}/switch`, {
    method: 'POST', headers: {
      'content-type': 'application/json', 'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON,
    }, body: JSON.stringify({ on: true }),
  })
  expect(on.status, await on.text()).toBe(200)
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (pluginsBefore === undefined) delete process.env['MOLE_OFFICE_PLUGINS']
  else process.env['MOLE_OFFICE_PLUGINS'] = pluginsBefore
  rmSync(scratch, { recursive: true, force: true })
}, 60_000)

async function expectWindowToFillTheRoom(): Promise<void> {
  await expect.poll(async () => app.page.locator('iframe.plgp-frame').evaluate(frame => {
    const panel = frame.closest('.px-panel')!
    const box = frame.getBoundingClientRect()
    const style = getComputedStyle(panel)
    const below = parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth)
    return Math.abs(window.innerHeight - below - box.bottom)
  })).toBeLessThanOrEqual(2)
  await expect.poll(() => app.page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0)
  const box = await app.page.locator('iframe.plgp-frame').evaluate(frame => {
    const rect = frame.getBoundingClientRect()
    return { top: rect.top, height: rect.height, windowHeight: window.innerHeight }
  })
  expect(box.top).toBeGreaterThanOrEqual(0)
  expect(box.top).toBeLessThan(box.windowHeight)
  expect(box.height).toBeGreaterThanOrEqual(320)
}

describe('the plugin window takes the rest of the window', () => {
  for (const { width, height } of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    it(`fits at ${width} by ${height} and follows a shorter window and a taller header`, async () => {
      await app.page.setViewportSize({ width, height })
      await app.page.goto(`${app.site}/?lang=en#/plugin/${ID}/main`)
      await app.page.reload()
      await waitForThePage(app.page, 30_000)
      await app.page.waitForSelector('iframe.plgp-frame')
      await expectWindowToFillTheRoom()
      await app.page.setViewportSize({ width, height: height - 200 })
      await expectWindowToFillTheRoom()
      await app.page.locator('.plgp .px-panel-head').evaluate(header => { (header as HTMLElement).style.paddingBottom = '52px' })
      await expectWindowToFillTheRoom()
    }, 60_000)
  }
})
