// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type BrowserContext, type Frame, type Page } from 'playwright'
import { build } from 'vite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PLUGIN_READ_INTERFACE } from '../../../src/shared/plugin-read.ts'
import { IDLE_OUTINGS } from '../src/idle-outings.ts'
import { agent, projects, talk, workRow } from './fixtures.ts'
// @ts-expect-error The database-free screen shell is shared with the JS browser tools.
import { screenWorld } from './fixtures/screen-read-world.mjs'

declare global { interface Window { configure: (value: unknown) => void; openPlugin: () => void } }

// Every id here is made up. One secretary has four direct workers. The first two have only closed work, so
// they are the idle ones; the secretary and the other two are working at their desks.
const person = { kind: 'person' as const, id: 'invented-person', handle: 'invented-person', name: 'Made-up person' }
const secretary = agent('invented-secretary', { role: 'secretary', startedBy: { kind: 'person', id: person.id } })
const looks = ['bare', 'scarf', 'sand-apron', 'silver-glasses'] as const
const direct = looks.map((lookId, i) => agent(`invented-direct-${i + 1}`, { startedBy: { kind: 'agent', id: secretary.id }, appearance: { version: 2, style: 'c-forest', lookId } }))
const idleOnes = direct.slice(0, 2).map(one => JSON.stringify(['agent', one.id]))
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
  built = mkdtempSync('/dev/shm/office-map-idle-outings-switch-')
  const callers = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await build({ root: plugin, base: './', configFile: false, envDir: false, logLevel: 'warn',
      build: { outDir: built, emptyOutDir: true, rolldownOptions: { input: { main: join(plugin, 'main.html') } } } })
  } finally { if (callers === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = callers }
  world = await screenWorld({ built })
  profile = mkdtempSync('/dev/shm/office-map-idle-outings-switch-profile-')
  browser = await chromium.launchPersistentContext(profile, { headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1000 } })
}, 180000)

afterAll(async () => {
  await page?.close(); await browser?.close(); await world?.close()
  for (const folder of [profile, built]) if (folder) rmSync(folder, { recursive: true, force: true })
})

// What the page told its test hooks: each idle route reply, every mole it drew on an outing, the most
// that walked at once, and every frame in which a mole out was drawn over another mole. Every value is
// kept as it is written, so nothing is lost between two looks.
type Seen = { routes: string[]; actors: string[]; mostWalking: number; frames: number; bodyCounts: number[]; overlaps: string[] }
async function open(options: { idleOutings?: boolean; idleSeed?: number; reducedMotion?: boolean }): Promise<Frame> {
  await page?.close(); page = await browser.newPage()
  await page.goto(world.url)
  await page.evaluate(([fixture, options]) => { window.configure({ fixture, reducedMotion: false, ...options }); window.openPlugin() }, [{ synthetic: true, views }, options] as const)
  let frame: Frame | undefined
  for (let i = 0; i < 100 && !frame; i++) { frame = page.frames().find(one => one.url().split('?')[0]!.endsWith('/plugin/main.html')); if (!frame) await page.waitForTimeout(100) }
  if (!frame) throw new Error('No plugin frame')
  await frame.waitForFunction(() => (window as any).__officeMapScreenTest !== undefined)
  await frame.evaluate(() => {
    const hooks = (window as any).__officeMapScreenTest, seen: Seen = (window as any).__seen = { routes: [], actors: [], mostWalking: 0, frames: 0, bodyCounts: [], overlaps: [] }
    type Body = { id: string; out: boolean; rect: { x: number; y: number; width: number; height: number } }
    const overlap = (a: Body['rect'], b: Body['rect']) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    let route: unknown, actors: unknown
    Object.defineProperty(hooks, 'idleRoute', { configurable: true, get: () => route, set: value => { route = value; seen.routes.push(String(value?.status)) } })
    Object.defineProperty(hooks, 'idleActors', { configurable: true, get: () => actors, set: (value: { id: string; phase: string }[]) => {
      actors = value; seen.frames++
      for (const one of value) if (!seen.actors.includes(one.id)) seen.actors.push(one.id)
      seen.mostWalking = Math.max(seen.mostWalking, value.filter(one => one.phase === 'walk').length)
      // The page sets every drawn body just before the actors, in the same frame.
      const bodies: Body[] = hooks.idleBodies ?? []
      if (value.length && !seen.bodyCounts.includes(bodies.length)) seen.bodyCounts.push(bodies.length)
      for (const one of bodies.filter(body => body.out)) for (const other of bodies) if (other !== one && overlap(one.rect, other.rect)) seen.overlaps.push(`frame ${seen.frames}: ${one.id} over ${other.id}`)
    } })
  })
  await frame.waitForFunction(() => document.querySelector<HTMLCanvasElement>('.map-plane canvas')?.dataset['paintReady'] === 'true', undefined, { timeout: 90000 })
  return frame
}
const seen = (frame: Frame): Promise<Seen> => frame.evaluate(() => (window as any).__seen)
async function watch(frame: Frame, ms: number, until?: (seen: Seen) => boolean): Promise<Seen> {
  let last = await seen(frame)
  for (const end = Date.now() + ms; Date.now() < end && !until?.(last);) { await new Promise(done => setTimeout(done, 200)); last = await seen(frame) }
  return last
}
const walked = (one: Seen) => one.routes.includes('found') && one.actors.length > 0
// Longer than the 12-second rest between two outings, and the outing below starts well inside it.
const QUIET_MS = 15000

it('ships with idle outings switched on', () => {
  expect(IDLE_OUTINGS).toBe(true)
})

it('takes nobody on an outing when the page opens with motion allowed and the switch turned off', async () => {
  const frame = await open({ idleOutings: false })
  expect(await watch(frame, QUIET_MS)).toMatchObject({ routes: [], actors: [], mostWalking: 0 })
}, 90000)

it('as shipped, takes only the idle moles out, never more than three walking and never over another mole, while the working agents stay at their desks', async () => {
  const frame = await open({}), started = Date.now()
  const on = await watch(frame, 45000, walked)
  console.log(JSON.stringify({ firstOutingMs: Date.now() - started, ...on, overlaps: on.overlaps.slice(0, 5) }))
  expect(walked(on)).toBe(true)
  expect(on.actors.length).toBeGreaterThan(0)
  expect(on.actors.some(id => idleOnes.includes(id))).toBe(true)
  for (const id of on.actors) expect(idleOnes).toContain(id)
  expect(on.mostWalking).toBeGreaterThanOrEqual(1)
  expect(on.mostWalking).toBeLessThanOrEqual(3)
  // Every frame of the outing reported every mole's drawn body, and none out was drawn over another.
  expect(on.bodyCounts).toEqual([agents.length])
  expect(on.overlaps).toEqual([])
}, 90000)

it('as shipped, asks for no idle route under reduced motion', async () => {
  const frame = await open({ reducedMotion: true })
  expect(await watch(frame, QUIET_MS)).toMatchObject({ routes: [], actors: [], mostWalking: 0 })
}, 90000)

it('as shipped, ends the outing when the page is hidden and draws nobody out while it stays hidden', async () => {
  const frame = await open({})
  expect(walked(await watch(frame, 45000, walked))).toBe(true)
  await frame.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const drawnOut: unknown[] = []
  for (const end = Date.now() + QUIET_MS; Date.now() < end;) {
    drawnOut.push(...await frame.evaluate(() => (window as any).__officeMapScreenTest.idleActors ?? []))
    await new Promise(done => setTimeout(done, 250))
  }
  expect(drawnOut).toEqual([])
}, 120000)
