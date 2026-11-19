// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import type { LayoutInput } from '../src/geometry.ts'
import type { GeometryFailure } from '../src/geometry-client.ts'
import { mapOffice } from '../src/model.ts'
import { liveShapeRoster } from './live-shape-roster.ts'

// The live office's map stopped at this size in the browser's worker and nowhere else, so the layout
// is run there: the production worker program, in Chromium, through the page's own client.
type Outcome = { status: 'ready'; seats: number; plants: number } | { status: 'unavailable'; failure: GeometryFailure }
declare global { interface Window { layoutOnce: (input: LayoutInput) => Promise<Outcome> } }

const roster = liveShapeRoster(), model = mapOffice(roster, null)
const input: LayoutInput = { rooms: model.rooms.map(room => ({ id: room.id, occupants: room.occupants })), roster: model.layoutRoster }
let browser: BrowserContext, page: Page, profile: string
beforeAll(async () => {
  const bundle = async (options: Parameters<typeof build>[0]) => (await build({ ...options, bundle: true, write: false, format: 'iife', platform: 'browser', loader: { '.png': 'dataurl' } })).outputFiles![0]!.text
  const worker = await bundle({ entryPoints: [new URL('../src/geometry.worker.ts', import.meta.url).pathname] })
  const client = await bundle({ stdin: { contents: `import { GeometryClient } from '../src/geometry-client.ts'
window.layoutOnce = input => new Promise(done => {
  const address = URL.createObjectURL(new Blob([${JSON.stringify(worker)}], { type: 'text/javascript' }))
  const client = new GeometryClient(() => new Worker(address), state => {
    if (state.status === 'ready' && state.layout) done({ status: 'ready', seats: Object.keys(state.layout.seats).length, plants: state.layout.pieces.filter(piece => piece.decoration).length })
    else if (state.status === 'unavailable') done({ status: 'unavailable', failure: state.failure })
    else return
    client.dispose(); URL.revokeObjectURL(address)
  })
  client.setContext('live-shape', true); client.update(input)
})`, resolveDir: import.meta.dirname } })
  profile = mkdtempSync('/dev/shm/office-map-live-shape-')
  browser = await chromium.launchPersistentContext(profile, { headless: true, args: ['--no-sandbox'] })
  page = await browser.newPage()
  // A page with an address of its own, so its worker comes from a blob as the plugin's does. Nothing is fetched.
  await page.route('http://made-up.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>layout</title>' }))
  await page.goto('http://made-up.test/')
  await page.addScriptTag({ content: client })
}, 60000)
afterAll(async () => { await browser?.close(); if (profile) rmSync(profile, { recursive: true, force: true }) })

describe('a roster the size of the live office', () => {
  it('is laid out by the browser worker, with a seat for every agent shown and the woodland drawn', async () => {
    const outcome = await page.evaluate(value => window.layoutOnce(value), input)
    expect(outcome).toEqual({ status: 'ready', seats: model.occupants.length, plants: expect.any(Number) })
    // Before the repair, 66,030 plants were passed to one call, and a browser worker's stack overflows
    // between 60,000 and 70,000. Below that this roster would no longer be the size that broke it.
    expect(outcome.status === 'ready' && outcome.plants).toBeGreaterThan(60000)
  }, 60000)

  it('names the agent when the roster lists one twice, and places no seat', async () => {
    const repeated = input.roster!.people[100]!, twice: LayoutInput = { ...input, roster: { ...input.roster!, people: [...input.roster!.people, repeated] } }
    expect(await page.evaluate(value => window.layoutOnce(value), twice)).toEqual({ status: 'unavailable', failure: { cause: 'roster', message: 'Duplicate ownership identity', agent: repeated.id } })
  }, 60000)
})
