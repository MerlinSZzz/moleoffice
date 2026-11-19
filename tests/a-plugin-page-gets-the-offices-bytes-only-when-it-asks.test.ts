// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A plugin page gets the office's bytes only when it asks (wave 13y round 44).
 * The plugin and its office are made up in temporary folders. The browser's response event keeps
 * the very response the slot read. Its body is compared with what crossed into the sandboxed frame.
 * The init script keeps the slot's own arrayBuffer results, so detachment needs no shipped hook.
 * The refusal of an unknown view names the published interface and its current views.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Frame, Response as BrowserResponse, Route } from 'playwright'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { PLUGIN_READ_INTERFACE as INTERFACE, PLUGIN_READ_VIEWS } from '../src/shared/plugin-read.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const ID = 'made-up-bytes'
const scratch = aTestDatabaseFolder('plugin-bytes')
const pluginsBefore = process.env['MOLE_OFFICE_PLUGINS']
const responses: BrowserResponse[] = []
let app: LiveApp
let frame: Frame
let sequence = 0

interface KeptMessage {
  message: Record<string, unknown>
  hasBytes: boolean
  isBuffer: boolean
  bytes: number[] | null
}

const context = (answers?: 'bytes', theme = 'light') => ({
  interface: INTERFACE, kind: 'context', plugin: ID, page: 'main', language: 'en',
  theme, reducedMotion: false, project: 'default', ...(answers === undefined ? {} : { answers }),
})
const hash = (bytes: Uint8Array | number[]) => createHash('sha256').update(Uint8Array.from(bytes)).digest('hex')

beforeAll(async () => {
  const folder = join(scratch, 'plugins', ID)
  mkdirSync(join(folder, 'dist', 'assets'), { recursive: true })
  writeFileSync(join(folder, 'plugin.json'), JSON.stringify({
    id: ID, name: { en: 'Made-up bytes reader' }, version: '0.1.0', interface: INTERFACE,
    pages: [{ slug: 'main', title: { en: 'Main' } }], reads: ['projects', 'people'],
    budget: { builtKilobytes: 20 },
  }))
  writeFileSync(join(folder, 'dist', 'main.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Made-up bytes reader</title><script src="assets/ask.js"></script></head><body>A made-up plugin for the bytes criterion.</body></html>')
  writeFileSync(join(folder, 'dist', 'assets', 'ask.js'), `
    window.told = []
    window.addEventListener('message', event => {
      if (event.source === window.parent) window.told.push(event.data)
    })
  `)
  process.env['MOLE_OFFICE_PLUGINS'] = join(scratch, 'plugins')
  app = await liveApp({ name: 'plugin-bytes', viewport: { width: 1440, height: 1000 } })
  await app.page.addInitScript(() => {
    const held: ArrayBuffer[] = []
    ;(window as unknown as { slotBuffers: ArrayBuffer[] }).slotBuffers = held
    const read = Response.prototype.arrayBuffer
    Response.prototype.arrayBuffer = async function () {
      const buffer = await read.call(this)
      held.push(buffer)
      return buffer
    }
  })
  app.page.on('response', response => {
    if (new URL(response.url()).pathname.startsWith('/api/plugin-read/v1/')) responses.push(response)
  })
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

async function framesPage(): Promise<Frame> {
  const element = await app.page.waitForSelector('iframe.plgp-frame')
  const found = await element.contentFrame()
  if (found === null) throw new Error('The made-up plugin has no frame document.')
  await found.waitForFunction(() => Array.isArray((window as unknown as { told: unknown }).told))
  return found
}

beforeEach(async () => {
  await app.page.unrouteAll({ behavior: 'wait' })
  await app.page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
  await app.page.goto(`${app.site}/?lang=en#/plugin/${ID}/main`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  frame = await framesPage()
  responses.length = 0
})

async function count(): Promise<number> {
  return frame.evaluate(() => (window as unknown as { told: unknown[] }).told.length)
}

async function send(message: Record<string, unknown>): Promise<void> {
  await frame.evaluate(message => window.parent.postMessage(message, '*'), message)
}

async function kept(at: number): Promise<KeptMessage> {
  return frame.evaluate(at => {
    const raw = (window as unknown as { told: Record<string, unknown>[] }).told[at]!
    const { bytes, ...rest } = raw
    const hasBytes = Object.hasOwn(raw, 'bytes')
    return {
      message: hasBytes ? rest : raw, hasBytes, isBuffer: bytes instanceof ArrayBuffer,
      bytes: bytes instanceof ArrayBuffer ? Array.from(new Uint8Array(bytes)) : !hasBytes || bytes === null ? null : [],
    }
  }, at)
}

async function nextMessage(after: number, id?: string): Promise<KeptMessage> {
  await frame.waitForFunction(({ after, id }) => {
    const all = (window as unknown as { told: Record<string, unknown>[] }).told
    return all.slice(after).some(one => id === undefined || one['id'] === id)
  }, { after, id }, { timeout: 15_000 })
  const at = await frame.evaluate(({ after, id }) => {
    const all = (window as unknown as { told: Record<string, unknown>[] }).told
    return all.findIndex((one, at) => at >= after && (id === undefined || one['id'] === id))
  }, { after, id })
  return kept(at)
}

async function ready(answers?: string, mustGrant = true): Promise<KeptMessage> {
  const after = await count()
  await send({ interface: INTERFACE, ask: 'ready', ...(answers === undefined ? {} : { answers }) })
  const told = await nextMessage(after)
  if (mustGrant) expect(told).toEqual({ message: context(answers === 'bytes' ? 'bytes' : undefined), hasBytes: false, isBuffer: false, bytes: null })
  return told
}

async function read(view = 'projects', extra: Record<string, unknown> = {}) {
  const id = `read-${++sequence}`
  const after = await count()
  const responseAt = responses.length
  await send({ interface: INTERFACE, ask: 'read', id, view, ...extra })
  const told = await nextMessage(after, id)
  const response = responses.slice(responseAt).find(one => new URL(one.url()).pathname === `/api/plugin-read/v1/${view}`)
  if (response === undefined) throw new Error(`The browser kept no office response for ${id}.`)
  return { id, view, told, response }
}

async function objectAnswer(one: Awaited<ReturnType<typeof read>>): Promise<void> {
  const body = one.response.status() === 304 ? null : await one.response.json()
  expect(one.told).toEqual({
    message: { interface: INTERFACE, kind: 'answer', id: one.id, view: one.view,
      status: one.response.status(), tag: one.response.headers()['etag'] ?? null, body },
    hasBytes: false, isBuffer: false, bytes: null,
  })
}

async function bytesAnswer(one: Awaited<ReturnType<typeof read>>, routedBody?: Uint8Array): Promise<void> {
  expect(one.told.message).toEqual({ interface: INTERFACE, kind: 'bytes', id: one.id, view: one.view,
    status: one.response.status(), tag: one.response.headers()['etag'] ?? null,
    type: one.response.headers()['content-type'] ?? null })
  expect(one.told.hasBytes).toBe(true)
  expect(one.told.isBuffer).toBe(true)
  expect(one.told.bytes).not.toBeNull()
  expect(hash(one.told.bytes!)).toBe(hash(routedBody ?? await one.response.body()))
}

async function refusal(message: Record<string, unknown>, why: string, said: unknown): Promise<void> {
  const after = await count()
  await send({ interface: INTERFACE, ask: 'read', ...message })
  const told = await nextMessage(after, String(message['id']))
  expect(told).toEqual({ message: { interface: INTERFACE, kind: 'refused', id: message['id'], view: message['view'], why, said }, hasBytes: false, isBuffer: false, bytes: null })
  if (why === 'not-a-view') expect(told.message['said']).toContain(INTERFACE)
}

async function refusals(): Promise<void> {
  const beforeNonsense = await count()
  await send({ interface: INTERFACE, ask: 'something-else' })
  const nonsense = await nextMessage(beforeNonsense)
  expect(nonsense).toEqual({ message: { interface: INTERFACE, kind: 'refused', id: null, view: null, why: 'not-understood', said: expect.any(String) }, hasBytes: false, isBuffer: false, bytes: null })
  expect(String(nonsense.message['said']).length).toBeGreaterThan(0)
  await refusal({ id: 'no-view', view: 'secrets' }, 'not-a-view', expect.stringContaining(PLUGIN_READ_VIEWS.join(', ')))
  await refusal({ id: 'not-named', view: 'work' }, 'not-in-the-manifest', 'This plugin\'s manifest does not name "work" in its reads, so the slot does not read it.')
  let entered!: (route: Route) => void
  const intercepted = new Promise<Route>(done => { entered = done })
  const address = '**/api/plugin-read/v1/projects'
  await app.page.route(address, route => { entered(route) }, { times: 1 })
  const after = await count()
  await send({ interface: INTERFACE, ask: 'read', id: 'held', view: 'projects' })
  const route = await intercepted
  try {
    await refusal({ id: 'duplicate', view: 'projects' }, 'already-asking', 'The slot is still reading "projects" for this page. Ask again when that answer comes.')
  } finally {
    await route.continue()
  }
  await nextMessage(after, 'held')
  await app.page.route(address, route => route.abort(), { times: 1 })
  await refusal({ id: 'unreachable', view: 'projects' }, 'could-not-ask', 'The slot could not reach the office: Failed to fetch')
}

describe('a plugin page gets the office\'s bytes only when it asks', () => {
  it('a. carries the very office response bytes for projects and people', async () => {
    await ready('bytes')
    for (const view of ['projects', 'people']) {
      const one = await read(view)
      expect(one.response.status()).toBe(200)
      await bytesAnswer(one)
    }
  })

  it('b. detaches the slot\'s own buffer when it transfers the answer', async () => {
    await ready('bytes')
    const one = await read()
    await bytesAnswer(one)
    const lengths = await app.page.evaluate(() => (window as unknown as { slotBuffers: ArrayBuffer[] }).slotBuffers.map(one => one.byteLength))
    expect(lengths).toEqual([0])
    expect(one.told.bytes!.length).toBeGreaterThan(0)
  })

  it('c. carries the exact Content-Type, including no header and an empty non-304 body', async () => {
    await ready('bytes')
    await bytesAnswer(await read())
    // Wave 13y round 44: DevTools recodes non-UTF-8 text; the routed body supplies its known raw bytes.
    const examples: { headers: Record<string, string>; body: Buffer }[] = [
      { headers: { 'Content-Type': 'text/plain; charset=iso-8859-1; office=MadeUp' }, body: Buffer.from([0, 255, 128, 13, 10]) },
      { headers: {}, body: Buffer.alloc(0) },
    ]
    for (const example of examples) {
      await app.page.route('**/api/plugin-read/v1/projects', route => route.fulfill({ status: 200, headers: example.headers, body: example.body }), { times: 1 })
      const one = await read()
      expect(one.response.headers()['content-type'] ?? null).toBe(example.headers['Content-Type'] ?? null)
      await bytesAnswer(one, example.body)
    }
  })

  it('d. keeps today\'s object context, parsed 200, 304, error, and every refusal without an ask', async () => {
    await ready()
    const first = await read()
    expect(first.response.status()).toBe(200)
    await objectAnswer(first)
    const again = await read('projects', { tag: first.told.message['tag'] })
    expect(again.response.status()).toBe(304)
    await objectAnswer(again)
    const error = await read('projects', { query: { nothing: 1 } })
    expect(error.response.status()).toBe(400)
    await objectAnswer(error)
    await refusals()
  })

  it('e. grants bytes in every context, including a changed theme', async () => {
    await ready('bytes')
    const after = await count()
    await app.page.emulateMedia({ colorScheme: 'dark' })
    expect(await nextMessage(after)).toEqual({ message: context('bytes', 'dark'), hasBytes: false, isBuffer: false, bytes: null })
  })

  it('f. each accepted ready decides later reads while an earlier read keeps its form, and reopening clears it', async () => {
    await ready('bytes')
    let entered!: (route: Route) => void
    const intercepted = new Promise<Route>(done => { entered = done })
    await app.page.route('**/api/plugin-read/v1/projects', route => { entered(route) }, { times: 1 })
    const after = await count()
    await send({ interface: INTERFACE, ask: 'read', id: 'bytes-before-ready', view: 'projects' })
    const held = await intercepted
    try { await ready() } finally { await held.continue() }
    const told = await nextMessage(after, 'bytes-before-ready')
    const response = responses.at(-1)!
    await bytesAnswer({ id: 'bytes-before-ready', view: 'projects', told, response })
    await objectAnswer(await read())
    await ready('bytes')
    await frame.evaluate(() => { window.location.href = 'main.html' })
    await app.page.waitForSelector('.plgp-again')
    await app.page.click('.plgp-again')
    frame = await framesPage()
    await objectAnswer(await read())
    await ready()
  })

  it('g. answers 304 with null bytes and null type and transfers nothing', async () => {
    await ready('bytes')
    const first = await read()
    await bytesAnswer(first)
    const again = await read('projects', { tag: first.told.message['tag'] })
    expect(again.response.status()).toBe(304)
    expect(again.told).toEqual({ message: { interface: INTERFACE, kind: 'bytes', id: again.id, view: 'projects', status: 304, tag: first.told.message['tag'], type: null }, hasBytes: true, isBuffer: false, bytes: null })
    expect(await app.page.evaluate(() => (window as unknown as { slotBuffers: ArrayBuffer[] }).slotBuffers.map(one => one.byteLength))).toEqual([0])
  })

  it('h. carries an office error\'s status, type, and unchanged body as bytes', async () => {
    await ready('bytes')
    const one = await read('projects', { query: { nothing: 1 } })
    expect(one.response.status()).toBe(400)
    await bytesAnswer(one)
  })

  it('i. refuses the same reads in both forms', async () => {
    for (const mode of [undefined, 'bytes']) {
      // Wave 13y round 44: the old host refuses this ready; its read refusals already have the same shape.
      await ready(mode, false)
      await refusals()
    }
  })

  it('j. refuses another answer form without a context or a change to the last accepted form', async () => {
    await ready('bytes')
    const after = await count()
    const refused = await ready('text', false)
    expect(refused.message).toEqual({ interface: INTERFACE, kind: 'refused', id: null, view: null, why: 'not-understood', said: expect.any(String) })
    expect(refused.hasBytes).toBe(false)
    expect(refused.message['said']).toContain('answers')
    await bytesAnswer(await read())
    const kinds = await frame.evaluate(after => (window as unknown as { told: { kind: string }[] }).told.slice(after).map(one => one.kind), after)
    expect(kinds).toEqual(['refused', 'bytes'])
  })
})
