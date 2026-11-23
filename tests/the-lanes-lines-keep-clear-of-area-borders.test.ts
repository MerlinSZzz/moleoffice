// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Lines must cross an area's frame without running alongside it. The 5 px distance is a few screen pixels, including
 * zoom, and a distance of exactly 5 px counts; more than 20 px is long enough to be a visible second border and
 * excludes a short perpendicular crossing. A tinted band has a 1 px border of its own, so a line beside a band looks
 * like a second border too, and the bands are read beside the framed areas with the same rule. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import { prepareThePage, storeTheAreas, theAreasWereStored, theDrawingIsDrawn, writerFor } from './a-made-up-office-drawn-in-lanes.ts'
import { storeTheTwoDrawings, setTheMasterAndStoreTheAreas, type Drawing } from './a-made-up-reel-page-and-master-opened-fresh.ts'
import { MASTER, storeTheMadeUpMaster } from './a-made-up-master-at-real-shape.ts'
import type { Stored } from './a-made-up-reel-page-and-a-master-of-54-boxes.ts'

const widths = [1440, 660] as const
const wait = 900_000
let serial = 0
async function readRuns(app: LiveApp, named: Map<string, string>, context: string) {
  const read = await app.page.locator('[data-drawing="lanes"][data-fit]').evaluate((root) => {
    const areas = [
      ...root.querySelectorAll<HTMLElement>('.e-area[data-framed="1"]'),
      ...root.querySelectorAll<HTMLElement>('.e-band'),
    ].map((el, i) => ({
      name: el.classList.contains('e-band')
        ? `band ${el.dataset.bandOf ?? `area ${i + 1}`}`
        : el.querySelector('.e-area-head')?.textContent?.trim() ?? `area ${i + 1}`,
      box: el.getBoundingClientRect(),
    }))
    const failures: { link: string; area: string; distance: number; length: number }[] = []
    const paths = [...root.querySelectorAll<SVGPathElement>('path.e-path')]
    for (const path of paths) {
      const matrix = path.getScreenCTM()
      if (!matrix) throw new Error('A line has no screen geometry')
      const points = JSON.parse(path.dataset.points ?? '[]') as [number, number][]
      for (let i = 1; i < points.length; i++) {
        const a = new DOMPoint(...points[i - 1]!).matrixTransform(matrix)
        const b = new DOMPoint(...points[i]!).matrixTransform(matrix)
        const overlap = (x: number, y: number, min: number, max: number) => Math.max(0, Math.min(Math.max(x, y), max) - Math.max(Math.min(x, y), min))
        for (const { name, box } of areas) {
          const h = overlap(a.x, b.x, box.left, box.right)
          const v = overlap(a.y, b.y, box.top, box.bottom)
          const dh = Math.min(Math.abs(a.y - box.top), Math.abs(a.y - box.bottom))
          const dv = Math.min(Math.abs(a.x - box.left), Math.abs(a.x - box.right))
          if (Math.abs(a.y - b.y) < 0.1 && h > 20 && dh <= 5) failures.push({link: path.dataset.link ?? '', area: name, distance: dh, length: h})
          if (Math.abs(a.x - b.x) < 0.1 && v > 20 && dv <= 5) failures.push({link: path.dataset.link ?? '', area: name, distance: dv, length: v})
        }
      }
    }
    return { failures, paths: paths.length, areas: areas.length }
  })
  expect(read.paths, `${context} has lines to inspect`).toBeGreaterThan(0)
  const failures = read.failures.map((f) => `${named.get(f.link) ?? f.link} alongside ${f.area}: ${f.distance.toFixed(1)} px away for ${f.length.toFixed(1)} px`)
  console.log(`BORDER ${JSON.stringify({context, paths: read.paths, areas: read.areas, failures})}`)
  expect(failures, `${context}: ${failures.length} runs lie along an area border: ${failures.join('; ')}`).toEqual([])
}
async function open(app: LiveApp, pipeline: string, width: number, level: 'boxes' | 'steps' | null) {
  await app.page.setViewportSize({width, height: 1000})
  await app.page.goto(`${app.site}/?lang=en&theme=light&open=${++serial}#${pipelinePath(pipeline)}`, {waitUntil: 'commit', timeout: 60_000})
  await app.page.locator('[data-drawing="lanes"][data-fit]').waitFor({timeout: wait})
  if (level !== null && await app.page.locator('[data-drawing="lanes"]').getAttribute('data-level') !== level) {
    await app.page.locator(`[data-level-control] button[data-level="${level}"]`).click()
    await app.page.locator(`[data-drawing="lanes"][data-level="${level}"][data-fit]`).waitFor({timeout: wait})
  }
  await app.page.waitForFunction(() => {
    const root = document.querySelector('[data-drawing="lanes"][data-fit]')
    return root !== null && root.querySelector('.e-card') !== null && document.querySelector('[data-being-drawn]') === null
  }, null, { timeout: wait })
  await theDrawingIsDrawn(app.page)
}

describe('the reel and 54-box master keep lines clear of area borders', () => {
  const project = {id: 'test-border-two-drawings', title: 'Example office for area border lines (made up)'}
  let db: TestDb, app: LiveApp, stored: Record<Drawing, Stored>
  beforeAll(async () => {
    db = await freshDb()
    stored = await storeTheTwoDrawings(db, project)
    app = await liveApp({name: 'border-two-drawings', database: db.file, workspace: 'default', viewport: {width: 1440, height: 1000}})
    const areas = await setTheMasterAndStoreTheAreas(app, db, project.id, stored)
    theAreasWereStored(areas.reel, 'the reel')
    theAreasWereStored(areas.master, 'the master')
    await prepareThePage(app, project.id)
  }, 300_000)
  afterAll(async () => { await app?.stop(); db?.close() }, 120_000)
  for (const width of widths) for (const name of ['reel', 'master'] as const) {
    it(`${name} at ${width} px`, async () => {
      await open(app, stored[name].pipeline, width, name === 'master' ? 'boxes' : null)
      await readRuns(app, stored[name].linkNamed, `${name}, ${width} px`)
    }, wait + 120_000)
  }
})

describe('the real-shape master and its largest block keep lines clear of area borders', () => {
  const project = {id: 'test-border-real-shape', title: 'Example office for real-shape border lines (made up)'}
  const largest = MASTER.blockPipelines.reduce((a, b) => a.boxes.length >= b.boxes.length ? a : b)
  let db: TestDb, app: LiveApp, stored: ReturnType<typeof storeTheMadeUpMaster>
  beforeAll(async () => {
    db = await freshDb()
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace(project)
    stored = storeTheMadeUpMaster(db, project.id)
    app = await liveApp({name: 'border-real-shape', database: db.file, workspace: 'default', viewport: {width: 1440, height: 1000}})
    const write = writerFor(app, project.id, join(dirname(db.file), 'keys.json'))
    await write.call('PUT', `/api/projects/${project.id}/master-pipeline`, {pipeline: stored.master})
    const lanes = Array.from({length: 6}, (_, n) => ({name: `Example area ${n + 1} (made up)`, arrange: 'row', order: n, tint: `--area-${n + 1}`}))
    const nodes = Object.fromEntries(largest.boxes.map((box, n) => [stored.id[box]!, {lane: lanes[n % lanes.length]!.name, order: n}]))
    theAreasWereStored(await storeTheAreas(write, stored.id[largest.key]!, {lanes, nodes}), 'the largest block')
    await prepareThePage(app, project.id)
  }, 300_000)
  afterAll(async () => { await app?.stop(); db?.close() }, 120_000)
  for (const width of widths) for (const name of ['boxes', 'steps', 'block'] as const) {
    it(`${name} at ${width} px`, async () => {
      await open(app, name === 'block' ? stored.id[largest.key]! : stored.master, width, name === 'steps' ? 'steps' : name === 'boxes' ? 'boxes' : null)
      await readRuns(app, stored.linkNamed, `${name}, ${width} px`)
    }, wait + 120_000)
  }
})
