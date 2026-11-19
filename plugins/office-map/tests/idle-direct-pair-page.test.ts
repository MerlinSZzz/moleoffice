// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { build } from 'vite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PLUGIN_READ_INTERFACE } from '../../../src/shared/plugin-read.ts'
import { agent, projects, talk, workRow } from './fixtures.ts'
// @ts-expect-error The database-free screen shell is shared with the JS browser tools.
import { screenWorld } from './fixtures/screen-read-world.mjs'

declare global { interface Window { configure: (value: unknown) => void; openPlugin: () => void } }

// Every id here is made up. One secretary has four direct workers; the first two have only closed work,
// so they are the one idle pair, and they sit at desks in the secretary's direct room.
const person = { kind: 'person' as const, id: 'invented-person', handle: 'invented-person', name: 'Made-up person' }
const secretary = agent('invented-secretary', { role: 'secretary', startedBy: { kind: 'person', id: person.id } })
const looks = ['bare', 'scarf', 'sand-apron', 'silver-glasses'] as const
const direct = looks.map((lookId, i) => agent(`invented-direct-${i + 1}`, { startedBy: { kind: 'agent', id: secretary.id }, appearance: { version: 2, style: 'c-forest', lookId } }))
const pair = direct.slice(0, 2).map(one => JSON.stringify(['agent', one.id]))
const agents = [secretary, ...direct]
const views = {
  roster: { interface: PLUGIN_READ_INTERFACE, view: 'roster' as const, narrowedByPermission: null, people: [person],
    agents: agents.map(({ kind, id, handle, name, role, retired, visitor, startedBy, createdAt }) => ({ kind, id, handle, name, role, retired, visitor, startedBy, createdAt })) },
  people: { interface: PLUGIN_READ_INTERFACE, view: 'people' as const, narrowedByPermission: null, people: [person], agents },
  work: { interface: PLUGIN_READ_INTERFACE, view: 'work' as const, narrowedByPermission: null,
    work: agents.map((one, i) => workRow(`invented-work-${i + 1}`, { agent: one.id, ...(i === 1 || i === 2 ? { detail: 'completed', runStanding: 'closed' } : { detail: 'executing', executing: true }) })) },
  projects,
  talk: talk(),
  online: { interface: PLUGIN_READ_INTERFACE, view: 'online' as const, narrowedByPermission: null, agents: agents.map(one => ({ id: one.id, online: true })) },
}

const plugin = resolve(import.meta.dirname, '..')
let world: { url: string; close: () => Promise<void> }, browser: BrowserContext, profile: string, built: string, page: Page | undefined

beforeAll(async () => {
  built = mkdtempSync('/dev/shm/office-map-idle-direct-pair-')
  const callers = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await build({ root: plugin, base: './', configFile: false, envDir: false, logLevel: 'warn',
      build: { outDir: built, emptyOutDir: true, rolldownOptions: { input: { main: join(plugin, 'main.html') } } } })
  } finally { if (callers === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = callers }
  world = await screenWorld({ built })
  profile = mkdtempSync('/dev/shm/office-map-idle-direct-pair-profile-')
  browser = await chromium.launchPersistentContext(profile, { headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1000 } })
}, 180000)

afterAll(async () => {
  await page?.close(); await browser?.close(); await world?.close()
  for (const folder of [profile, built]) if (folder) rmSync(folder, { recursive: true, force: true })
})

type Turn = { selected: string[]; houses: (string | null)[]; places: { x: number; y: number }[]; refusal: { reason: string; ids: string[] } | null }
type IdleRecord = { turns: Turn[]; routes: { start: { x: number; y: number }; target: { x: number; y: number }; status: string | null }[] }

// The page chooses the pair's places on the worker's navigation layout. On the drawing layout, which has
// no obstacles and drawn floors, it finds no place in a direct room and refuses the turn as no-place.
it('chooses places for an idle pair of direct workers on the real page, and the worker finds a route to one', async () => {
  page = await browser.newPage()
  await page.goto(world.url)
  await page.evaluate(fixture => { window.configure({ fixture, reducedMotion: false }); window.openPlugin() }, { synthetic: true, views })
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow !== null)
  const frame = page.frames().find(one => one.url().endsWith('/plugin/main.html'))!
  await frame.waitForFunction(() => (window as any).__officeMapScreenTest !== undefined)
  // Every idle turn and route the page writes to its test hooks is kept, so none is lost between two looks.
  await frame.evaluate(() => {
    const hooks = (window as any).__officeMapScreenTest, record: IdleRecord = (window as any).__idleRecord = { turns: [], routes: [] }, seen = new Set<string>()
    const house = (point: { x: number; y: number }) => hooks.layout?.houses?.find((one: any) => point.x >= one.x && point.x <= one.x + one.width && point.y >= one.y && point.y <= one.y + one.height)?.type ?? null
    let debug: any, route: any
    Object.defineProperty(hooks, 'idleDebug', { configurable: true, get: () => debug, set: value => {
      debug = value
      if (!value?.selectedIdle?.length) return
      const turn = { selected: value.selectedIdle.map((one: any) => one.id), houses: value.selectedIdle.map((one: any) => house(one.foot)), places: value.places, refusal: value.state?.refusal ?? null }, key = JSON.stringify(turn)
      if (!seen.has(key)) { seen.add(key); record.turns.push(turn) }
    } })
    Object.defineProperty(hooks, 'idleRoute', { configurable: true, get: () => route, set: value => { route = value; record.routes.push({ start: value.start, target: value.target, status: value.status ?? null }) } })
  })
  // No camera gesture here: a gesture interrupts an idle route in flight, and the page then has no route
  // until its next layout update.
  const same = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) <= .01
  const reached = (record: IdleRecord) => record.routes.some(route => route.status === 'found' && record.turns.some(turn => turn.places.some(place => same(place, route.target))))
  let record: IdleRecord = { turns: [], routes: [] }
  for (const end = Date.now() + 45000; Date.now() < end && !reached(record);) {
    await new Promise(done => setTimeout(done, 150))
    record = await frame.evaluate(() => (window as any).__idleRecord)
  }
  const chosen = record.turns.filter(turn => turn.places.length)
  console.log(JSON.stringify({ turns: record.turns.length, chosen, routes: record.routes, refusals: record.turns.flatMap(turn => turn.refusal ? [turn.refusal.reason] : []) }))
  expect(record.turns.some(turn => turn.refusal?.reason === 'no-place')).toBe(false)
  expect(chosen.length).toBeGreaterThan(0)
  for (const turn of chosen) {
    expect([...turn.selected].sort()).toEqual([...pair].sort())
    expect([turn.houses, turn.places.length]).toEqual([['direct', 'direct'], 2])
  }
  expect(reached(record)).toBe(true)
}, 90000)
