// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SLOT REFUSES A READ WHOSE PATH AND QUERY ARE OVER 8,192 BYTES, BEFORE IT ASKS (wave 13y round 52).
 *
 * The plugin and its office are made up in temporary folders, and every read goes through the real slot. Node refuses a
 * request whose target and headers are over 16,383 bytes together, with 431 or a closed connection. The slot sends a
 * path and query of at most 8,192 bytes and refuses a longer one before it asks. The refusal is `too-long` with its id,
 * its view, `bytes` (the length of its path and query) and `limit` (8,192), and no `said`: a new refusal is built from
 * fields, not from a sentence (round 52's fix).
 *
 * 1. On the people view a read of 8,193 bytes is refused by the slot, and the browser sends no request for it. One
 *    byte less, exactly 8,192 (121 ids of 64 and one of 51), is answered 200 by the office.
 * 2. The same on the work view, whose path is 2 bytes shorter (121 ids of 64 and one of 53).
 * 3. 500 ids of 12, the length of the ids the office makes, are answered on both views.
 * 4. 500 ids of 64 (33,531 bytes) are refused by the slot. Before this round Node refused that read.
 * 5. The path and query the browser sent are theTargetOfARead's in src/shared/plugin-read.ts, byte for byte.
 * 6. The office map's own builder, imported from plugins/office-map/src/screen-facts.ts, splits a list, and its largest
 *    lists are answered. The test reads the map's code and changes none of it, so a change to that builder can turn it
 *    red: the slot and the map must agree.
 * 7. The slot checks the view and the manifest before the length, and the length before a read already going.
 *
 * The limit is written here as the number 8,192 and the lengths are counted here, so a change to the published limit
 * fails this file rather than moving it.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Frame, Request as BrowserRequest, Route } from 'playwright'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AGENT_CHUNK, chunks, encodedAgentsRequest } from '../plugins/office-map/src/screen-facts.ts'
import { theTargetOfARead } from '../src/shared/plugin-read.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const INTERFACE = 'office-read/1'
const ID = 'made-up-long-reads'
const LIMIT = 8_192
const scratch = aTestDatabaseFolder('plugin-too-long')
const pluginsBefore = process.env['MOLE_OFFICE_PLUGINS']
const requests: BrowserRequest[] = []
let app: LiveApp
let frame: Frame
let sequence = 0

/** A made-up agent id of `length` characters: letters, digits and `-`, as an id may be. */
const anId = (n: number, length: number): string => `agent-${String(n).padStart(5, '0')}`.padEnd(length, 'x')
const ids = (count: number, length: number, from = 0): string[] => Array.from({ length: count }, (_, at) => anId(from + at, length))
const path = (view: 'people' | 'work'): string => `/api/plugin-read/v1/${view}`
/** The path and query as this test counts them: each comma is sent as %2C, three bytes. */
const bytesOf = (view: 'people' | 'work', agents: string[]): number => `${path(view)}?${new URLSearchParams({ agents: agents.join(',') }).toString()}`.length

beforeAll(async () => {
  const folder = join(scratch, 'plugins', ID)
  mkdirSync(join(folder, 'dist', 'assets'), { recursive: true })
  writeFileSync(join(folder, 'plugin.json'), JSON.stringify({
    id: ID, name: { en: 'Made-up long reads' }, version: '0.1.0', interface: INTERFACE,
    pages: [{ slug: 'main', title: { en: 'Main' } }], reads: ['people', 'work'],
    budget: { builtKilobytes: 20 },
  }))
  writeFileSync(join(folder, 'dist', 'main.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Made-up long reads</title><script src="assets/ask.js"></script></head><body>A made-up plugin for the too-long criterion.</body></html>')
  writeFileSync(join(folder, 'dist', 'assets', 'ask.js'), `
    window.told = []
    window.addEventListener('message', event => {
      if (event.source === window.parent) window.told.push(event.data)
    })
  `)
  process.env['MOLE_OFFICE_PLUGINS'] = join(scratch, 'plugins')
  app = await liveApp({ name: 'plugin-too-long', viewport: { width: 1440, height: 1000 } })
  app.page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/plugin-read/v1/')) requests.push(request)
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

beforeEach(async () => {
  await app.page.unrouteAll({ behavior: 'wait' })
  await app.page.goto(`${app.site}/?lang=en#/plugin/${ID}/main`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  const element = await app.page.waitForSelector('iframe.plgp-frame')
  const found = await element.contentFrame()
  if (found === null) throw new Error('The made-up plugin has no frame document.')
  await found.waitForFunction(() => Array.isArray((window as unknown as { told: unknown }).told))
  frame = found
  await send({ interface: INTERFACE, ask: 'ready' })
  await frame.waitForFunction(() => (window as unknown as { told: { kind: string }[] }).told.some(one => one.kind === 'context'))
  requests.length = 0
})

async function send(message: Record<string, unknown>): Promise<void> {
  await frame.evaluate(message => window.parent.postMessage(message, '*'), message)
}

/** Asks the slot for a read and waits for what it tells the page about that id. */
async function ask(view: string, agents: string[], id = `read-${++sequence}`): Promise<Record<string, unknown>> {
  const after = await frame.evaluate(() => (window as unknown as { told: unknown[] }).told.length)
  await send({ interface: INTERFACE, ask: 'read', id, view, query: { agents: agents.join(',') } })
  await frame.waitForFunction(({ after, id }) => (window as unknown as { told: Record<string, unknown>[] }).told.slice(after).some(one => one['id'] === id), { after, id }, { timeout: 30_000 })
  return frame.evaluate(({ after, id }) => (window as unknown as { told: Record<string, unknown>[] }).told.slice(after).find(one => one['id'] === id)!, { after, id })
}

/** The path and query of every read request the browser sent since the last call. */
function sent(): string[] {
  return requests.splice(0).map(one => { const url = new URL(one.url()); return `${url.pathname}${url.search}` })
}

async function answered(view: 'people' | 'work', agents: string[]): Promise<void> {
  const told = await ask(view, agents)
  expect({ kind: told['kind'], view: told['view'], status: told['status'] }).toEqual({ kind: 'answer', view, status: 200 })
  expect((told['body'] as { notAgents: string[] }).notAgents).toEqual([...new Set(agents)])
  const target = theTargetOfARead(view, { agents: agents.join(',') })
  expect(target.length).toBe(bytesOf(view, agents))
  expect(sent()).toEqual([target])
}

async function refusedTooLong(view: 'people' | 'work', agents: string[]): Promise<void> {
  const id = `long-${++sequence}`
  const told = await ask(view, agents, id)
  expect(told).toEqual({ interface: INTERFACE, kind: 'refused', id, view, why: 'too-long', bytes: bytesOf(view, agents), limit: LIMIT })
  // THE NEXT READ'S REQUEST IS THE FIRST THE BROWSER SENT SINCE, so the refused read sent none.
  const after = [anId(99_999, 12)]
  await ask(view, after)
  expect(sent()).toEqual([theTargetOfARead(view, { agents: after.join(',') })])
}

describe('the slot refuses a read whose path and query are over 8,192 bytes', () => {
  it('1. refuses 8,193 bytes on the people view without asking, and answers exactly 8,192', async () => {
    const over = [...ids(121, 64), anId(121, 52)]
    expect(bytesOf('people', over)).toBe(LIMIT + 1)
    await refusedTooLong('people', over)
    const most = [...ids(121, 64), anId(121, 51)]
    expect(bytesOf('people', most)).toBe(LIMIT)
    await answered('people', most)
  })

  it('2. refuses 8,193 bytes on the work view without asking, and answers exactly 8,192', async () => {
    const over = [...ids(121, 64), anId(121, 54)]
    expect(bytesOf('work', over)).toBe(LIMIT + 1)
    await refusedTooLong('work', over)
    const most = [...ids(121, 64), anId(121, 53)]
    expect(bytesOf('work', most)).toBe(LIMIT)
    await answered('work', most)
  })

  it('3. answers 500 ids of 12 on both views', async () => {
    const five = ids(500, 12)
    expect([bytesOf('people', five), bytesOf('work', five)]).toEqual([7_531, 7_529])
    await answered('people', five)
    await answered('work', five)
  })

  it('4. refuses 500 ids of 64 itself, on both views', async () => {
    const five = ids(500, 64)
    expect([bytesOf('people', five), bytesOf('work', five)]).toEqual([33_531, 33_529])
    await refusedTooLong('people', five)
    await refusedTooLong('work', five)
  })

  it('5. sends the path and query theTargetOfARead builds, with every comma as %2C', async () => {
    const some = ids(3, 12)
    expect(theTargetOfARead('people', { agents: some.join(',') })).toBe(`/api/plugin-read/v1/people?agents=${some.join('%2C')}`)
    expect(theTargetOfARead('work', {})).toBe('/api/plugin-read/v1/work')
    await answered('people', some)
  })

  it('6. answers the largest lists the office map builds, split as the map splits them', async () => {
    const byCount = chunks(ids(1_000, 12))
    const size = AGENT_CHUNK
    const remainder = 1_000 % size
    const expectedLengths = [
      ...Array.from({ length: Math.floor(1_000 / size) }, () => size),
      ...(remainder === 0 ? [] : [remainder]),
    ]
    expect(byCount.map(one => one.length)).toEqual(expectedLengths)
    const byBytes = chunks([...ids(121, 64), anId(121, 51), ...ids(200, 64, 122)])
    // With chunks of AGENT_CHUNK the byte bound is no longer reached by real ids: the count bound
    // splits the list first. Cases 3 and 4 still test the slot's byte limit directly.
    for (const chunk of byBytes) {
      expect(chunk.length).toBeLessThanOrEqual(AGENT_CHUNK)
      expect(encodedAgentsRequest('people', chunk).length).toBeLessThanOrEqual(LIMIT)
    }
    for (const view of ['people', 'work'] as const) {
      await answered(view, byCount[0]!)
      await answered(view, byBytes[0]!)
    }
  })

  it('7. checks the view and the manifest first, then the length, then a read already going', async () => {
    const over = ids(500, 64)
    const notAView = await ask('secrets', over, 'long-and-not-a-view')
    expect(notAView['why']).toBe('not-a-view')
    const notNamed = await ask('projects', over, 'long-and-not-named')
    expect(notNamed['why']).toBe('not-in-the-manifest')
    let entered!: (route: Route) => void
    const intercepted = new Promise<Route>(done => { entered = done })
    await app.page.route(url => url.pathname === '/api/plugin-read/v1/people', route => { entered(route) }, { times: 1 })
    const after = await frame.evaluate(() => (window as unknown as { told: unknown[] }).told.length)
    await send({ interface: INTERFACE, ask: 'read', id: 'held', view: 'people', query: { agents: anId(1, 12) } })
    const route = await intercepted
    try {
      const whileHeld = await ask('people', over, 'long-while-one-is-going')
      expect(whileHeld['why']).toBe('too-long')
    } finally {
      await route.continue()
    }
    await frame.waitForFunction(after => (window as unknown as { told: Record<string, unknown>[] }).told.slice(after).some(one => one['id'] === 'held'), after)
    expect(sent()).toEqual([theTargetOfARead('people', { agents: anId(1, 12) })])
  })
})
