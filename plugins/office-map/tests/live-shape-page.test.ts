// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type BrowserContext, type Frame, type Page } from 'playwright'
import { build } from 'vite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { RosterView } from '../src/contracts.ts'
// @ts-expect-error The database-free screen shell is shared with the JS browser tools.
import { screenWorld } from './fixtures/screen-read-world.mjs'
import { layoutFailureWords, words } from '../src/words.ts'
import { liveShapeRoster, liveShapeViews } from './live-shape-roster.ts'

// On the built page: the map is drawn at the live office's size. When the roster still stops the
// layout, the page says why, and People and Work are read for the agents on the list's page.
// An agent's People or Work fact is loaded only when a read that named the agent was answered and accepted.
type Read = { view: string; query?: { agents?: string } }
type Fact = { status: string; error: unknown }
declare global { interface Window { configure: (value: unknown) => void; openPlugin: () => void; __screenWorld: { reads: Read[]; errors: string[] }; __officeMapScreenTest?: { layout?: unknown } } }
type Hooks = { __officeMapScreenTest?: { renderedFacts?: Record<string, { people: Fact; work: Fact }> } }
const plugin = resolve(import.meta.dirname, '..')
let world: { url: string; close: () => Promise<void> }, browser: BrowserContext, profile: string, built: string, page: Page | undefined
beforeAll(async () => {
  built = mkdtempSync('/dev/shm/office-map-live-page-')
  // A production page, as the office builds it (tools/build-a-plugin.mjs), into a folder of its own.
  const callers = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await build({ root: plugin, base: './', configFile: false, envDir: false, logLevel: 'warn',
      build: { outDir: built, emptyOutDir: true, rolldownOptions: { input: { main: join(plugin, 'main.html') } } } })
  } finally { if (callers === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = callers }
  world = await screenWorld({ built })
  profile = mkdtempSync('/dev/shm/office-map-live-page-profile-')
  browser = await chromium.launchPersistentContext(profile, { headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1000 } })
}, 120000)
afterAll(async () => {
  await browser?.close(); await world?.close()
  for (const folder of [profile, built]) if (folder) rmSync(folder, { recursive: true, force: true })
})

async function open(roster: RosterView): Promise<Frame> {
  await page?.close(); page = await browser.newPage()
  await page.goto(world.url)
  await page.evaluate(fixture => { window.configure({ fixture }); window.openPlugin() }, { synthetic: true, views: liveShapeViews(roster) })
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow !== null)
  const frame = page.frames().find(one => one.url().endsWith('/plugin/main.html'))!
  await frame.waitForSelector('.map-viewport', { state: 'attached' })
  return frame
}
const named = async (view: string) => (await page!.evaluate(() => window.__screenWorld.reads)).filter(read => read.view === view).map(read => read.query?.agents?.split(',') ?? [])
const { en } = words, status = (frame: Frame) => frame.textContent('.map-viewport + p')
const stopped = (frame: Frame) => frame.evaluate(start => (document.querySelector('.map-viewport + p')?.textContent ?? '').startsWith(start), en.layoutStopped)
const listedAgents = (frame: Frame) => frame.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button[data-result]')].map(button => (JSON.parse(button.dataset['result']!) as string[])[1]!))
// The agents whose People or Work fact the page has drawn as loaded from a named read.
const loaded = (frame: Frame, view: 'people' | 'work') => frame.evaluate(view => Object.entries((window as unknown as Hooks).__officeMapScreenTest?.renderedFacts ?? {})
  .filter(([, facts]) => facts[view].status === 'loaded' && facts[view].error === null).map(([id]) => id), view)

it('draws the map at the live office’s size, and reads People and Work for the agents on screen', async () => {
  const frame = await open(liveShapeRoster())
  // Either the layout arrives or the page says why it did not, and a failing run shows the page's words.
  await frame.waitForFunction(start => window.__officeMapScreenTest?.layout !== undefined || (document.querySelector('.map-viewport + p')?.textContent ?? '').startsWith(start), en.layoutStopped, { timeout: 60000 })
  expect(await status(frame)).not.toContain(en.layoutStopped)
  await frame.waitForFunction(() => document.querySelector('.map-plane canvas') !== null, undefined, { timeout: 60000 })
  await expect.poll(async () => (await loaded(frame, 'people')).length, { timeout: 60000 }).toBeGreaterThan(0)
  expect((await named('people')).flat().length).toBeGreaterThan(0)
  expect(await page!.evaluate(() => window.__screenWorld.errors)).toEqual([])
}, 120000)

it('says why when the roster stops the layout, and still reads People and Work for the listed agents', async () => {
  const roster = liveShapeRoster(), twice = roster.agents.find(agent => !agent.retired && agent.role === 'worker' && !/^zh-/.test(agent.handle))!
  roster.agents.push({ ...twice })
  const frame = await open(roster)
  await expect.poll(() => stopped(frame), { timeout: 60000 }).toBe(true)
  expect(await status(frame)).toBe(layoutFailureWords('en', { cause: 'roster', message: '', agent: JSON.stringify(['agent', twice.id]) }, () => twice.name))
  await expect.poll(() => listedAgents(frame), { timeout: 30000 }).toHaveLength(20)
  const listed = await listedAgents(frame)
  // Every listed agent has its People and Work facts loaded.
  for (const view of ['people', 'work'] as const) await expect.poll(async () => { const done = new Set(await loaded(frame, view)); return listed.filter(id => !done.has(id)) }, { timeout: 30000 }).toEqual([])
  for (const view of ['people', 'work']) expect((await named(view)).at(-1)!.sort()).toEqual([...listed].sort())
  expect(await page!.evaluate(() => window.__screenWorld.errors)).toEqual([])
}, 120000)
