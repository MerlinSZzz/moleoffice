// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type BrowserContext, type Frame, type Page } from 'playwright'
import { build } from 'vite'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readView } from '../src/read.ts'
import type { PluginReadView } from '../src/contracts.ts'
// @ts-expect-error Browser tools and tests share the generated answers.
import { browserAnswer, ids } from './fixtures/browser-answers.mjs'
// @ts-expect-error Playwright serializes the shared JavaScript predicate into the page.
import { readsSettled, readyWords } from './fixtures/reads-settled.mjs'
// @ts-expect-error The database-free screen shell is shared with browser tools.
import { screenWorld } from './fixtures/screen-read-world.mjs'
// @ts-expect-error Generated fixtures are shared with browser tools.
import { screenFixture } from './fixtures/screen-read-fixtures.mjs'

const plugin = resolve(import.meta.dirname, '..')
const views = JSON.parse(readFileSync(join(plugin, 'plugin.json'), 'utf8')).reads as PluginReadView[]

it('answers every declared view in the shape the page accepts', () => {
  for (const view of views) {
    expect(readView(view, browserAnswer(view, { agents: ids[0] + ',sample-unknown' })), view).not.toBeNull()
  }
})

let world: { url: string; close: () => Promise<void> }, browser: BrowserContext, profile: string, built: string, page: Page | undefined
beforeAll(async () => {
  built = mkdtempSync('/dev/shm/office-map-complete-reads-')
  const callers = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await build({ root: plugin, base: './', configFile: false, envDir: false, logLevel: 'warn',
      build: { outDir: built, emptyOutDir: true, rolldownOptions: { input: { main: join(plugin, 'main.html') } } } })
  } finally { if (callers === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = callers }
  world = await screenWorld({ built })
  profile = mkdtempSync('/dev/shm/office-map-complete-reads-profile-')
  browser = await chromium.launchPersistentContext(profile, { headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1000 } })
}, 120000)
afterAll(async () => {
  await browser?.close(); await world?.close()
  for (const folder of [profile, built]) if (folder) rmSync(folder, { recursive: true, force: true })
})

async function open(fixture: unknown): Promise<Frame> {
  await page?.close(); page = await browser.newPage()
  await page.goto(world.url)
  await page.evaluate(fixture => {
    const shell = window as unknown as { configure: (value: unknown) => void; openPlugin: () => void }
    shell.configure({ fixture }); shell.openPlugin()
  }, fixture)
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow !== null)
  const frame = page.frames().find(one => one.url().endsWith('/plugin/main.html'))!
  await frame.waitForSelector('.read-status', { state: 'attached' })
  return frame
}

it('recognizes the page status only when every part has a successful read', async () => {
  const success = await open(screenFixture(100))
  await success.waitForFunction(readsSettled, readyWords, { timeout: 60000 })
  expect(await success.evaluate(readsSettled, readyWords)).toBe(true)

  const failedFixture = screenFixture(100)
  delete failedFixture.views.projects
  const failed = await open(failedFixture)
  await failed.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('.read-status > p')].filter(line => !line.hidden && line.textContent?.trim()).length === 2, null, { timeout: 60000 })
  expect(await failed.evaluate(readsSettled, readyWords)).toBe(false)

  const narrowedFixture = screenFixture(100)
  narrowedFixture.views.projects.narrowedByPermission = [{ cause: 'permission', bucket: 'projects', count: 1, ids: null }]
  const narrowed = await open(narrowedFixture)
  await narrowed.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('.read-status > p')].filter(line => !line.hidden && line.textContent?.trim()).length === 2, null, { timeout: 60000 })
  expect(await narrowed.evaluate(readsSettled, readyWords)).toBe(false)
}, 120000)
