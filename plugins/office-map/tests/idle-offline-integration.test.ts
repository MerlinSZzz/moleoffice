// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type BrowserContext, type Frame, type Page } from 'playwright'
import { build } from 'vite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PLUGIN_READ_INTERFACE } from '../../../src/shared/plugin-read.ts'
import { whereabouts } from '../src/ownership.ts'
import { idleEligible } from '../src/idle-eligibility.ts'
import { agent, projects as projectFixture, talk as talkFixture } from './fixtures.ts'
// @ts-expect-error The database-free screen shell is shared with the JS browser tools.
import { screenWorld } from './fixtures/screen-read-world.mjs'

declare global { interface Window { configure: (value: unknown) => void; openPlugin: () => void; __officeMapScreenTest?: { layout?: unknown } } }

const offline = ['made-offline-a', 'made-offline-b', 'made-offline-c']
const onlineUnknown = 'made-online-unknown'
const ids = [...offline, onlineUnknown]
const person = { kind: 'person' as const, id: 'made-person', handle: 'made-person', name: 'Made-up person' }
const secretary = agent('made-secretary', { role: 'secretary', startedBy: { kind: 'person', id: 'made-person' } })
const looks = ['bare', 'scarf', 'sand-apron', 'silver-glasses'] as const
const worker = (id: string) => agent(id, { startedBy: { kind: 'agent', id: secretary.id }, appearance: { version: 2, style: 'c-forest', lookId: looks[ids.indexOf(id)]! } })
const roster = {
  interface: PLUGIN_READ_INTERFACE, view: 'roster' as const, narrowedByPermission: null, people: [person],
  agents: [secretary, ...ids.map(worker)].map(row => ({ kind: row.kind, id: row.id, handle: row.handle, name: row.name, role: row.role, retired: row.retired, visitor: row.visitor, startedBy: row.startedBy, createdAt: row.createdAt })),
}
const views = {
  roster,
  people: { interface: PLUGIN_READ_INTERFACE, view: 'people' as const, narrowedByPermission: null, people: [person], agents: [secretary, ...ids.map(worker)] },
  projects: projectFixture,
  talk: talkFixture(),
  online: { interface: PLUGIN_READ_INTERFACE, view: 'online' as const, narrowedByPermission: null, agents: [{ id: secretary.id, online: true }, ...ids.map(id => ({ id, online: id === onlineUnknown }))] },
}

const plugin = resolve(import.meta.dirname, '..')
let world: { url: string; close: () => Promise<void> }, browser: BrowserContext, profile: string, built: string, page: Page | undefined

beforeAll(async () => {
  built = mkdtempSync('/dev/shm/office-map-idle-offline-')
  const callers = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await build({ root: plugin, base: './', configFile: false, envDir: false, logLevel: 'warn',
      build: { outDir: built, emptyOutDir: true, rolldownOptions: { input: { main: join(plugin, 'main.html') } } } })
  } finally { if (callers === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = callers }
  world = await screenWorld({ built })
  profile = mkdtempSync('/dev/shm/office-map-idle-offline-profile-')
  browser = await chromium.launchPersistentContext(profile, { headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1000 } })
}, 180000)

afterAll(async () => {
  await browser?.close(); await world?.close()
  for (const folder of [profile, built]) if (folder) rmSync(folder, { recursive: true, force: true })
})

async function open(count = 3, reducedMotion = false): Promise<Frame> {
  await page?.close(); page = await browser.newPage()
  await page.goto(world.url)
  const online = { ...views.online, agents: [{ id: secretary.id, online: true }, ...ids.map(id => ({ id, online: !offline.slice(0, count).includes(id) }))] }
  await page.evaluate(({ fixture, reducedMotion }) => { window.configure({ fixture, reducedMotion, idleSeed: 1 }); window.openPlugin() }, { fixture: { synthetic: true, views: { ...views, online } }, reducedMotion })
  let frame: Frame | undefined
  for (let i = 0; i < 100 && !frame; i++) { frame = page.frames().find(one => one.url().split('?')[0]!.endsWith('/plugin/main.html')); if (!frame) await page.waitForTimeout(100) }
  if (!frame) throw new Error('No plugin frame')
  await frame.waitForSelector('.map-viewport', { state: 'attached' })
  await frame.waitForFunction(() => (window as unknown as { __officeMapScreenTest?: { layout?: unknown } }).__officeMapScreenTest?.layout !== undefined, undefined, { timeout: 90000 })
  await frame.waitForFunction(() => document.querySelector<HTMLCanvasElement>('.map-plane canvas')?.dataset['paintReady'] === 'true', undefined, { timeout: 90000 })
  await frame.waitForFunction(() => document.querySelector('#art-error')?.textContent === '', undefined, { timeout: 120000 })
  // The enlarged rooms make Fit office a population view, where individual figures do not
  // animate. Put the actual play places on camera at an individual-figure zoom instead.
  await frame.evaluate(() => {
    const hooks = (window as any).__officeMapScreenTest, layout = hooks.layout
    hooks.setCamera(.5)
    const view = document.querySelector<HTMLElement>('.map-viewport')!, plane = document.querySelector<HTMLElement>('.map-plane')!
    const points = layout.places.play as { x: number; y: number }[]
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length
    const zoom = Number(plane.dataset['zoom'])
    view.scrollLeft = (x - layout.bounds.x) * zoom + Number(plane.dataset['paddingX']) - view.clientWidth / 2
    view.scrollTop = (y - layout.bounds.y) * zoom + Number(plane.dataset['paddingY']) - view.clientHeight / 2
    view.dispatchEvent(new Event('scroll'))
  })
  await frame.waitForFunction(() => document.querySelector<HTMLCanvasElement>('.map-plane canvas')?.dataset['paintReady'] === 'true', undefined, { timeout: 90000 })
  expect(await frame.evaluate(() => Number(document.querySelector<HTMLElement>('.map-plane')?.dataset['zoom']))).toBeGreaterThanOrEqual(.25)
  return frame
}

it('keeps the online unknown agent at its desk while an offline play agent is idle from visibility alone', () => {
  const found = whereabouts(ids.map(id => ({ id, retired: false })), new Map(ids.map(id => [id, id === onlineUnknown])), new Set(), { play: 3, sleep: 0 })
  for (const id of offline) expect(found.get(id), id).toMatchObject({ where: 'play' })
  expect(found.get(onlineUnknown)).toEqual({ where: 'desk' })
  const unknown = { facts: undefined, work: [] }
  for (const id of offline) expect(idleEligible(unknown, found.get(id)!, false), id).toBe(true)
  expect(idleEligible(unknown, found.get(onlineUnknown)!, false)).toBe(false)
})

type Sample = { actors: { id: string; phase: string; point: { x: number; y: number } }[]; moving: number }
async function observe(frame: Frame, count: number, deadline: number): Promise<Sample[]> {
  const samples: Sample[] = [], end = Date.now() + deadline
  while (Date.now() < end) {
    samples.push(await frame.evaluate(() => ({ actors: (window as any).__officeMapScreenTest?.idleActors ?? [], moving: Number(document.querySelector<HTMLCanvasElement>('.map-plane canvas')?.dataset['moving'] ?? 0) })))
    const walks = samples.flatMap(sample => sample.actors).filter(actor => actor.phase === 'walk')
    const displaced = walks.some(a => walks.some(b => a.id === b.id && Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y) > 5))
    const played = samples.some(sample => sample.actors.filter(actor => actor.phase === 'play').length === 2)
    if (displaced && samples.some(sample => sample.moving > 0) && (count === 1 || played)) break
    await new Promise(done => setTimeout(done, 150))
  }
  return samples
}
for (const count of [1, 3]) it(`shows movement with ${count} offline agents present on the real page`, async () => {
  const frame = await open(count)
  const samples = await observe(frame, count, 45000)
  const actors = samples.flatMap(sample => sample.actors)
  const walking = actors.filter(actor => actor.phase === 'walk')
  console.log(JSON.stringify({ count, samples: samples.length, phases: [...new Set(actors.map(actor => actor.phase))], ids: [...new Set(actors.map(actor => actor.id))], canvasMoving: Math.max(...samples.map(sample => sample.moving)), start: walking[0]?.point, end: walking.at(-1)?.point }))
  if (!samples.some(sample => sample.moving > 0)) console.log('OFFLINE-IDLE-DIAGNOSTIC', JSON.stringify(await frame.evaluate(() => ({ debug: (window as any).__officeMapScreenTest?.idleDebug, route: (window as any).__officeMapScreenTest?.idleRoute }))))
  expect(samples.some(sample => sample.moving > 0)).toBe(true)
  expect(walking.some(a => walking.some(b => a.id === b.id && Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y) > 5))).toBe(true)
  expect(actors.every(actor => offline.slice(0, count).some(id => actor.id === JSON.stringify(['agent', id])))).toBe(true)
  if (count > 1) expect(samples.some(sample => sample.actors.filter(actor => actor.phase === 'play').length === 2)).toBe(true)
}, 60000)
