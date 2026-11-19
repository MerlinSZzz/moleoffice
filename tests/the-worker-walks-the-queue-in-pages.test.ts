// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A pass walks bounded pages from the front, retaining its state until the whole walk succeeds.
 * Each page's decisions use the office as it stands when that page is read; with no other writes,
 * the same messages start the same runs in the same order as the whole reading. The old query did
 * not specify the order of two deliveries of the same message: the final cursor key fixes it.
 */
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
type Row = { messageId: string; to: { kind: string; id: string } }
type Page = { queue: Row[]; failed: Row[]; next: string | null }

async function pageSize(): Promise<number> {
  const code = await import('../src/server/lib/worker.ts')
  const size = (code as unknown as { QUEUE_PAGE_SIZE: number }).QUEUE_PAGE_SIZE
  expect(size, 'the queue code defines its one page size').toBeTypeOf('number')
  expect(Number.isInteger(size) && size > 0).toBe(true)
  return size
}

async function office() {
  const db = await freshDb()
  const server = (await apiApp()).app
  supplyRuntimeSubmissions(db, server)
  await server.ready()
  await server.listen({ host: '127.0.0.1', port: 0 })
  const outputs = mkdtempSync(join(tmpdir(), 'queue-pages-'))
  const settings: WorkerSettings = {
    api: `http://127.0.0.1:${String((server.server.address() as AddressInfo).port)}`,
    workspace: 'default', session: null, stopWithPid: null, checkout: aCheckoutForATestRun(), runs: 1, hops: 3,
    outputRoot: outputs, env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
  const post = async (url: string, payload: object) => {
    const response = await server.inject({ method: 'POST', url, headers: PERSON, payload })
    expect(response.statusCode, response.body).toBe(url === '/api/records' && 'kind' in payload && payload.kind === 'message' ? 409 : 201)
    return response.json() as { record: { id: string } }
  }
  const agent = async (handle: string) => {
    await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } })
  }
  const message = async (handle: string, title: string, urgent = false) => {
    const result = await post('/api/records', { kind: 'message', title, data: { body: 'Please carry out the task.', urgent, to: [{ kind: 'agent', id: handle }] } })
    return result.record.id
  }
  const start = async (id: string) => {
    const response = await server.inject({ method: 'POST', url: `/api/messages/${id}/start-an-agent`, headers: PERSON, payload: {} })
    expect(response.statusCode, response.body).toBeLessThan(300)
  }
  const read = async (url: string): Promise<Page> => {
    const response = await server.inject({ method: 'GET', url, headers: PERSON })
    expect(response.statusCode, response.body).toBe(200)
    return response.json() as Page
  }
  const close = async () => { await server.close(); db.close(); rmSync(outputs, { recursive: true, force: true }) }
  return { db, server, settings, agent, message, start, read, close }
}

const identities = (rows: Row[]) => rows.map((row) => `${row.messageId}:${row.to.kind}:${row.to.id}`)

it('bounds each reply, names the next page, and walks the whole ordered reading', async () => {
  const t = await office()
  try {
    const size = await pageSize()
    await t.agent('pages-held')
    for (let i = 0; i < size + 2; i++) await t.message('pages-held', `Waiting ${String(i)}`, i === size)
    const whole = await t.read('/api/worker/queue?full=1')
    let url: string | null = '/api/worker/queue?page=1'
    const seen: Row[] = []
    do {
      const page: Page = await t.read(url!)
      expect(page.queue.length + page.failed.length).toBeLessThanOrEqual(size)
      seen.push(...page.queue)
      expect(page).not.toHaveProperty('left')
      expect(page.next === null).toBe(seen.length === whole.queue.length)
      url = page.next
    } while (url !== null)
    expect(identities(seen)).toEqual(identities(whole.queue))
  } finally { await t.close() }
}, 120_000)

/** What the cleanup left, in words, or null when every run ended. It throws nothing, so an error the case threw survives. */
async function finishWatching(settings: WorkerSettings, watching: Parameters<typeof onePass>[1]): Promise<string | null> {
  try {
    const until = Date.now() + 15_000
    while (watching.length > 0 && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      await onePass(settings, watching)
    }
    return watching.length === 0 ? null : `${String(watching.length)} runs were left watching after cleanup`
  } catch (error) {
    return `the cleanup pass threw: ${String(error)}`
  }
}

async function comparedPass(whole: boolean) {
  const t = await office()
  const originalFetch = globalThis.fetch
  const watching: Parameters<typeof onePass>[1] = []
  const starts: string[] = []
  let cleanup: string | null = null
  try {
    const size = await pageSize()
    for (const handle of ['pages-held', 'pages-first', 'pages-second', 'pages-urgent']) await t.agent(handle)
    for (let i = 0; i < size + 1; i++) {
      const held = await t.message('pages-held', `Held ${String(i)}`)
      t.db.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run('2025-01-01 00:00:00', held)
    }
    const first = await t.message('pages-first', 'First')
    const second = await t.message('pages-second', 'Second')
    const urgent = await t.message('pages-urgent', 'Urgent', true)
    for (const id of [first, second, urgent]) await t.start(id)
    // The two ordinary messages share a second, and their delivery IDs sort in the reverse order.
    t.db.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id IN (?, ?)').run('2026-01-01 00:00:00', first, second)
    t.db.client.sqlite.prepare('UPDATE message_delivery SET id = ? WHERE message_id = ?').run('z-pages-first', first)
    t.db.client.sqlite.prepare('UPDATE message_delivery SET id = ? WHERE message_id = ?').run('a-pages-second', second)
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (whole && url.startsWith(`${t.settings.api}/api/worker/queue?page=1`)) {
        const all = await originalFetch(`${t.settings.api}/api/worker/queue?full=1`, init)
        const body = await all.json() as Page
        return Response.json({ ...body, next: null })
      }
      return originalFetch(input, init)
    }) as typeof fetch
    const until = Date.now() + 60_000
    while ((starts.length < 3 || watching.length > 0) && Date.now() < until) {
      const report = await onePass(t.settings, watching)
      starts.push(...report.started.map((row) => row.messageId === first ? 'first' : row.messageId === second ? 'second' : row.messageId === urgent ? 'urgent' : 'other'))
      if (starts.length < 3 || watching.length > 0) await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(watching.length, `${String(watching.length)} runs were left watching`).toBe(0)
    expect(starts.length, `${String(starts.length)} runs started before the walk ended`).toBe(3)
  } finally {
    globalThis.fetch = originalFetch
    try { cleanup = await finishWatching(t.settings, watching) } finally { await t.close() }
  }
  expect(cleanup).toBeNull()
  return starts
}

it('reaches a startable row behind held rows and starts in the whole reading order across passes', async () => {
  const paged = await comparedPass(false)
  expect(paged).toEqual(await comparedPass(true))
  expect(paged).toEqual(['urgent', 'first', 'second'])
}, 120_000)

it('starts a ready message behind more than a page of held messages in the same pass', async () => {
  const t = await office()
  const watching: Parameters<typeof onePass>[1] = []
  let cleanup: string | null = null
  try {
    const size = await pageSize()
    await t.agent('pages-held-front')
    await t.agent('pages-ready-behind')
    for (let i = 0; i < size + 1; i++) await t.message('pages-held-front', `Held in front ${String(i)}`)
    const ready = await t.message('pages-ready-behind', 'Ready behind held messages')
    await t.start(ready)
    const report = await onePass(t.settings, watching)
    expect(report.started.map((one) => one.messageId)).toContain(ready)
  } finally {
    try { cleanup = await finishWatching(t.settings, watching) } finally { await t.close() }
  }
  expect(cleanup).toBeNull()
}, 120_000)

it.each(['refused', 'failed'] as const)('stops loudly on a %s page, keeps its rows queued, and does not clean held sentences', async (failure) => {
  const t = await office()
  const originalFetch = globalThis.fetch
  try {
    const size = await pageSize()
    await t.agent('pages-refused')
    const ids: string[] = []
    for (let i = 0; i < size + 2; i++) ids.push(await t.message('pages-refused', `Refused ${String(i)}`))
    let pageReads = 0
    let refuse = false
    const said: string[] = []
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/api/worker/queue?') && !url.includes('full=1')) {
        pageReads++
        if (refuse && pageReads === 2) {
          if (failure === 'failed') throw new Error('Page unavailable')
          return new Response('Page unavailable', { status: 503 })
        }
      }
      const match = url.match(/\/api\/worker\/messages\/([^/]+)\/held$/)
      if (match) said.push(match[1]!)
      return originalFetch(input, init)
    }) as typeof fetch
    await onePass(t.settings, [])
    expect(said).toContain(ids.at(-1))
    said.length = 0
    pageReads = 0
    refuse = true
    let failureWords = ''
    try {
      const stopped = await onePass(t.settings, [])
      failureWords = stopped.failed.map((row) => row.because).join(' ')
    } catch (error) { failureWords = String(error) }
    expect(failureWords).toMatch(/503|refus|unavailable/i)
    expect((t.db.client.sqlite.prepare("SELECT count(*) AS n FROM message_delivery WHERE mark = 'queued' AND message_id = ?").get(ids.at(-1)) as { n: number }).n).toBe(1)
    refuse = false
    pageReads = 0
    await onePass(t.settings, [])
    expect(said).not.toContain(ids.at(-1))
  } finally { globalThis.fetch = originalFetch; await t.close() }
}, 120_000)

it('does not act twice on a moved row and reads a new urgent row before the cursor on the next pass', async () => {
  const t = await office()
  const originalFetch = globalThis.fetch
  try {
    const size = await pageSize()
    await t.agent('pages-moving')
    const moved = await t.message('pages-moving', 'Moves during the pass', true)
    for (let i = 0; i < size + 1; i++) await t.message('pages-moving', `Later ${String(i)}`)
    let arrived = ''
    let changed = false
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const response = await originalFetch(input, init)
      if (!changed && url.includes('/api/worker/queue?page=1')) {
        changed = true
        t.db.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.urgent', json('false')) WHERE id = ?").run(moved)
        arrived = await t.message('pages-moving', 'Arrives urgently during the pass', true)
        t.db.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run('2020-01-01 00:00:00', arrived)
      }
      return response
    }) as typeof fetch
    const first = await onePass(t.settings, [])
    expect(first.held.filter((row) => row.messageId === moved)).toHaveLength(1)
    expect(first.held.some((row) => row.messageId === arrived)).toBe(false)
    const next = await onePass(t.settings, [])
    expect(next.held.some((row) => row.messageId === arrived)).toBe(true)
  } finally { globalThis.fetch = originalFetch; await t.close() }
}, 120_000)


it('selects queue pages with a limit on the keyset read', async () => {
  const t = await office()
  const prepare = t.db.client.sqlite.prepare.bind(t.db.client.sqlite)
  const selections: string[] = []
  const spy = vi.spyOn(t.db.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    if (/from ["`]?message_delivery/i.test(source) && /order by/i.test(source)) selections.push(source)
    return prepare(source)
  }) as typeof t.db.client.sqlite.prepare)
  try {
    const size = await pageSize()
    await t.agent('pages-plan')
    for (let i = 0; i < size + 1; i++) await t.message('pages-plan', `Selection ${String(i)}`)
    selections.length = 0
    const first = await t.read('/api/worker/queue?page=1')
    expect(first.next).not.toBeNull()
    await t.read(first.next!)
    expect(selections.length).toBeGreaterThanOrEqual(2)
    expect(selections.every((selection) => /\blimit\b/i.test(selection))).toBe(true)
  } finally { spy.mockRestore(); await t.close() }
}, 120_000)

it('walks only messages the reader may see, including when hidden rows lie between pages', async () => {
  const t = await office()
  try {
    const size = await pageSize()
    await t.agent('pages-reader')
    await t.agent('pages-private')
    const hidden: string[] = []
    for (let i = 0; i < size + 1; i++) {
      hidden.push(await t.message('pages-private', `Private ${String(i)}`))
      await t.message('pages-reader', `Visible ${String(i)}`)
    }
    const headers = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'pages-reader' }
    const read = async (url: string) => {
      const response = await t.server.inject({ method: 'GET', url, headers })
      expect(response.statusCode, response.body).toBe(200)
      for (const id of hidden) expect(response.body).not.toContain(id)
      return response.json() as Page
    }
    const whole = await read('/api/worker/queue?full=1')
    let url: string | null = '/api/worker/queue?page=1'
    const seen: Row[] = []
    do {
      const page: Page = await read(url!)
      seen.push(...page.queue)
      expect(page).not.toHaveProperty('left')
      url = page.next
    } while (url !== null)
    expect(identities(seen)).toEqual(identities(whole.queue))
  } finally { await t.close() }
}, 120_000)
