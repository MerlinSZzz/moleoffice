// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START THAT FAILS EARLY ENDS ITS RECORD AS "CRASHED".
 *
 * `startOne` files the run's session record with state "running" (the POST /api/records at the top
 * of it). Three steps after that can fail before the model is reached: the office does not answer
 * with the chapters the run reads, the rules a run reads cannot be written, and the words on taking
 * somebody to a page cannot be read. Before this change each failure returned `{ ok: false, because }`
 * and left the record "running", so a run that never started read as one still going.
 *
 * Message sJlcSoK29PeV, item 2, decides the ending: each failure closes the record with state
 * "crashed" and `doing` set to the same sentence the function returns. "failed" was refused because
 * it says the run tried and failed at its work, and these starts never reached the model. The
 * function already closes its other failed starts this way, so one failed start reads like every
 * other.
 *
 * Three cases, one per failure. Each runs the same made-up start through a stubbed fetch and
 * asserts the record was closed exactly once, with exactly the sentence the function returned, and
 * that the close was sent before the function returned.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { TheSelectedChapters } from '../src/shared/chapter-edit.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const MADE_UP_SESSION = 'made-up-early-run'

let db: TestDb, app: FastifyInstance, scratch: string
let choice: TheSelectedChapters

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-early-start-'))
  const person = {
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': 'default',
    ...thePersonsKeyHeader(),
  }
  const answered = await app.inject({ url: '/api/office-regulations/chapters', headers: person })
  expect(answered.statusCode, answered.body).toBe(200)
  choice = answered.json() as TheSelectedChapters
}, 60_000)

afterAll(async () => {
  await app.close()
  db.close()
  rmSync(scratch, { recursive: true, force: true })
})

/** The made-up message and run settings every case starts the same run from. */
function theWaitingMessage(): unknown {
  return {
    messageId: 'made-up-early-message',
    workspaceId: 'default',
    to: { kind: 'agent', id: 'made-up-early-reader' },
    handle: 'made-up-early-reader',
    runtime: 'codex',
    model: 'made-up-early-model',
    body: 'A made-up message for a run that fails before it reaches the model.',
    sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    sentAt: '2026-10-16 05:00',
    resume: null,
    hops: 0,
  }
}

function theSettings(): unknown {
  return {
    api: 'http://made-up-office.invalid',
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: process.cwd(),
    runs: 1,
    hops: 4,
    outputRoot: scratch,
    env: { PATH: '/usr/bin', MOLE_OFFICE_DB: db.file },
  }
}

interface Asked {
  method: string
  path: string
  body: unknown
}

/**
 * The stub every case starts from. It records every request it is given, answers the doors the
 * start needs before the failure, and leaves the chapters door to the case. `order` records that
 * the close was seen, so a case can prove it happened before `startOne` returned.
 */
function theStub(asked: Asked[], order: string[], chapters: () => Response): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url, init) => {
    const path = new URL(url).pathname
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null
    asked.push({ method, path, body })
    if (method === 'PATCH' && path === `/api/records/${MADE_UP_SESSION}`) {
      if ((body as { dataPatch?: { state?: string } } | null)?.dataPatch?.state === 'crashed') order.push('the record was closed')
      return new Response(JSON.stringify({ record: { id: MADE_UP_SESSION } }), { status: 200 })
    }
    if (method === 'POST' && path === '/api/records') {
      return new Response(JSON.stringify({ record: { id: MADE_UP_SESSION }, runKey: { key: 'made-up-early-run-key' } }), { status: 201 })
    }
    if (path === '/api/records/made-up-early-message') return new Response(JSON.stringify({ record: { data: {} } }), { status: 200 })
    if (path === '/api/brief') return new Response(JSON.stringify({ head: 'A made-up brief.' }), { status: 200 })
    if (path === '/api/office-regulations/chapters') return chapters()
    return new Response('Made-up unavailable door', { status: 503 })
  }
}

/** The one PATCH that closes the run's record, and not the start's earlier writes about itself. */
function theClose(asked: Asked[]): Asked[] {
  return asked.filter(
    (one) =>
      one.method === 'PATCH' &&
      one.path === `/api/records/${MADE_UP_SESSION}` &&
      (one.body as { dataPatch?: { state?: string } } | null)?.dataPatch?.state === 'crashed',
  )
}

it('closes the record as crashed when the chapters door does not answer', async () => {
  const { startOne } = await import('../src/worker/index.ts')
  const asked: Asked[] = [], order: string[] = []
  vi.stubGlobal('fetch', theStub(asked, order, () => new Response('Made-up unavailable chapters door', { status: 503 })))
  try {
    const result = await startOne(theWaitingMessage() as Parameters<typeof startOne>[0], theSettings() as Parameters<typeof startOne>[1], [])
    order.push('startOne returned')
    expect(result.ok).toBe(false)
    const because = (result as { ok: false; because: string }).because
    expect(because).toContain('GET /api/office-regulations/chapters')
    const closes = theClose(asked)
    expect(closes).toHaveLength(1)
    expect(closes[0]?.body).toEqual({ dataPatch: { state: 'crashed', doing: because } })
    expect(order).toEqual(['the record was closed', 'startOne returned'])
  } finally {
    vi.unstubAllGlobals()
  }
})

it('closes the record as crashed when the rules a run reads cannot be written', async () => {
  const rules = await import('../src/worker/rules.ts')
  const { startOne } = await import('../src/worker/index.ts')
  const asked: Asked[] = [], order: string[] = []
  const writer = vi.spyOn(rules, 'writeRulesInto').mockImplementation(() => {
    throw new Error('Made up: the rules file could not be written.')
  })
  vi.stubGlobal('fetch', theStub(asked, order, () => new Response(JSON.stringify(choice), { status: 200 })))
  try {
    const result = await startOne(theWaitingMessage() as Parameters<typeof startOne>[0], theSettings() as Parameters<typeof startOne>[1], [])
    order.push('startOne returned')
    expect(result.ok).toBe(false)
    const because = (result as { ok: false; because: string }).because
    expect(because).toContain('The rules a run reads could not be written:')
    expect(because).toContain('Made up: the rules file could not be written.')
    const closes = theClose(asked)
    expect(closes).toHaveLength(1)
    expect(closes[0]?.body).toEqual({ dataPatch: { state: 'crashed', doing: because } })
    expect(order).toEqual(['the record was closed', 'startOne returned'])
  } finally {
    writer.mockRestore()
    vi.unstubAllGlobals()
  }
})

it('closes the record as crashed when the words on taking somebody to a page cannot be read', async () => {
  const rules = await import('../src/worker/rules.ts')
  const { startOne } = await import('../src/worker/index.ts')
  const asked: Asked[] = [], order: string[] = []
  const writer = vi.spyOn(rules, 'writeRulesInto').mockReturnValue({
    file: 'AGENTS.md',
    path: join(scratch, 'AGENTS.md'),
    written: true,
    because: 'A made-up rules file was written for this test.',
  })
  const leader = vi.spyOn(rules, 'howToLead').mockImplementation(() => {
    throw new Error('Made up: the words on taking somebody to a page are gone.')
  })
  vi.stubGlobal('fetch', theStub(asked, order, () => new Response(JSON.stringify(choice), { status: 200 })))
  try {
    const result = await startOne(theWaitingMessage() as Parameters<typeof startOne>[0], theSettings() as Parameters<typeof startOne>[1], [])
    order.push('startOne returned')
    expect(result.ok).toBe(false)
    const because = (result as { ok: false; because: string }).because
    expect(because).toBe('Made up: the words on taking somebody to a page are gone.')
    const closes = theClose(asked)
    expect(closes).toHaveLength(1)
    expect(closes[0]?.body).toEqual({ dataPatch: { state: 'crashed', doing: because } })
    expect(order).toEqual(['the record was closed', 'startOne returned'])
  } finally {
    leader.mockRestore()
    writer.mockRestore()
    vi.unstubAllGlobals()
  }
})
