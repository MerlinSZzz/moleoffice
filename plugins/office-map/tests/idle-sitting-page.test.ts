// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type BrowserContext, type Frame, type Page } from 'playwright'
import { build } from 'vite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { agent, projects, talk, workRow } from './fixtures.ts'
import sitting from '../assets/sitting-looks/sitting.json'
import village from '../assets/village-catalog.json'
import { standingOf, portraitOf } from '../src/appearance.ts'
import { sittingChances } from '../src/idle-outings.ts'
import { visualBodyBounds } from '../src/visual-body.ts'
import { DEFAULT_MOLE_SCALE, PAPER_MEETING_SPACING, sittingSpacing } from '../src/walks.ts'
import type { SpriteFrame } from '../src/pack.ts'
// @ts-expect-error The database-free screen shell is shared with the JS browser tools.
import { screenWorld } from './fixtures/screen-read-world.mjs'

const PLUGIN_READ_INTERFACE = 'office-read/1' as const

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
  built = mkdtempSync('/dev/shm/office-map-idle-sitting-')
  const callers = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await build({ root: plugin, base: './', configFile: false, envDir: false, logLevel: 'warn',
      build: { outDir: built, emptyOutDir: true, rolldownOptions: { input: { main: join(plugin, 'main.html') } } } })
  } finally { if (callers === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = callers }
  world = await screenWorld({ built })
  profile = mkdtempSync('/dev/shm/office-map-idle-sitting-profile-')
  browser = await chromium.launchPersistentContext(profile, { headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1000 } })
}, 180000)

afterAll(async () => {
  await page?.close(); await browser?.close(); await world?.close()
  for (const folder of [profile, built]) if (folder) rmSync(folder, { recursive: true, force: true })
})

async function open(seed: number): Promise<Frame> {
  await page?.close(); page = await browser.newPage()
  await page.goto(world.url)
  await page.evaluate(([fixture, options]) => { window.configure({ fixture, reducedMotion: false, ...options }); window.openPlugin() }, [{ synthetic: true, views }, { idleSeed: seed }] as const)
  let frame: Frame | undefined
  for (let i = 0; i < 100 && !frame; i++) { frame = page.frames().find(one => one.url().split('?')[0]!.endsWith('/plugin/main.html')); if (!frame) await page.waitForTimeout(100) }
  if (!frame) throw new Error('No plugin frame')
  await frame.waitForFunction(() => document.querySelector<HTMLCanvasElement>('.map-plane canvas')?.dataset['paintReady'] === 'true', undefined, { timeout: 90000 })
  return frame
}

it('shows the drawn sitting pair close and facing each other', async () => {
  const frame = await open(7)
  // Wait for a single snapshot in which both scheduler actors and the map's painted actors agree.
  await frame.waitForFunction(() => {
    const hooks = (window as any).__officeMapScreenTest, pair = hooks?.idleActors ?? [], painted = hooks?.paintedActors ?? []
    return pair.length === 2 && pair.every((one: any) => one.phase === 'sit' && painted.some((drawn: any) => drawn.key === one.id && drawn.sprite?.startsWith('sit-') && drawn.point.x === one.point.x && drawn.point.y === one.point.y))
  }, undefined, { timeout: 90000 })
  const snapshot = await frame.evaluate(() => {
    const hooks = (window as any).__officeMapScreenTest
    return { pair: hooks.idleActors, painted: hooks.paintedActors, places: hooks.idleDebug?.places, selected: hooks.idleDebug?.selectedIdle }
  })
  expect(snapshot.pair.map((one: any) => one.id).sort()).toEqual([...idleOnes].sort())
  expect(snapshot.pair.map((one: any) => one.point)).toEqual(snapshot.places)
  expect(snapshot.pair[0].point.y).toBe(snapshot.pair[1].point.y)
  expect(snapshot.pair.map((one: any) => one.facing)).toEqual([1, -1])
  const pair = [...snapshot.pair].sort((a: any, b: any) => a.point.x - b.point.x)
  const drawings = pair.map((one: any) => snapshot.painted.find((actor: any) => actor.key === one.id))
  const scales = pair.map((one: any) => snapshot.selected.find((selected: any) => selected.id === one.id).scale as number)
  const found = pair.map((one: any) => {
    const original = direct.find(agent => JSON.stringify(['agent', agent.id]) === one.id)!
    return standingOf(portraitOf(original.appearance), one.id, original.createdAt).look
  })
  const bodies = found.map((look: typeof found[number], i: number) => visualBodyBounds(look, scales[i]!, village.sprites as unknown as Record<string, SpriteFrame>)!)
  const spacing = pair[1].point.x - pair[0].point.x
  expect(spacing, `looks ${found.join(', ')} at scales ${scales.join(', ')}`).toBe(sittingSpacing(bodies[0]!, bodies[1]!))
  if (scales.every((scale: number) => scale === DEFAULT_MOLE_SCALE)) expect(spacing).toBe(80)
  expect(drawings.map((one: any) => one.facing)).toEqual([1, -1])
  const frames = sitting.sprites as unknown as Record<string, SpriteFrame>
  const extent = (drawn: any, scale: number) => {
    expect(drawn.sprite).toMatch(/^sit-/)
    const frame = frames[drawn.sprite]!
    return (frame.trim![2]! - frame.anchor![0]!) * scale
  }
  const gap = spacing - extent(drawings[0], scales[0]!) - extent(drawings[1], scales[1]!)
  expect(gap, `looks ${found.join(', ')} at scales ${scales.join(', ')}`).toBeGreaterThanOrEqual(16)
  expect(gap).toBeLessThanOrEqual(48)
  for (let i = 0; i < 2; i++) expect(drawings[i].point).toEqual(pair[i].point)
}, 180000)


it('keeps a pair that chooses play at the paper spacing', async () => {
  const seed = Array.from({ length: 100 }, (_, i) => i).find(i => sittingChances(i)() >= .5)!
  const frame = await open(seed)
  await frame.waitForFunction(() => {
    const pair = (window as any).__officeMapScreenTest?.idleActors ?? []
    return pair.length === 2 && pair.every((one: any) => one.phase === 'play')
  }, undefined, { timeout: 90000 })
  const pair = await frame.evaluate(() => (window as any).__officeMapScreenTest.idleActors)
  const places = [...pair].sort((a: any, b: any) => a.point.x - b.point.x)
  expect(places[0].point.y).toBe(places[1].point.y)
  expect(places[1].point.x - places[0].point.x).toBe(PAPER_MEETING_SPACING)
  expect(pair.every((one: any) => one.paper)).toBe(true)
}, 180000)
