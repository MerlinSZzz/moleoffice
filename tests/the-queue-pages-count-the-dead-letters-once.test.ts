// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST QUEUE PAGE COUNTS THE DEAD LETTERS, AND A LATER PAGE SAYS IT DOES NOT COUNT THEM AGAIN.
 *
 * A dead letter is a delivery still queued for an agent whose message has been deleted. A walk of every page counts
 * each one once: the first page carries deadLetters.count, and a page asked with a cursor carries no count and a note
 * that says the first page counts them. A later page with nothing on it says that nothing more is waiting, which is
 * not the sentence of an empty queue.
 *
 * WHAT IS REAL HERE. The server is real, on a fresh database; the agent, the messages, the deletions and
 * the delivery rows are real rows written through the API. Nothing here starts a run.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED (control run first, then each mutation, restored byte-identical):
 *
 *   - Count on every page (a later page treated as the first) and "a walk of every page counts each dead letter
 *     once" goes red: the later page carries a count, and the walk counts each dead letter twice.
 *   - Give an empty later page the first page's sentence and "an empty later page says that nothing more is waiting"
 *     goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'

const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const LATER_PAGE_NOTE = 'The first page counts the messages queued for an agent whose message has been deleted. This page does not count them again.'
type Row = { messageId: string; to: { kind: string; id: string } }
type Page = { queue: Row[]; failed: Row[]; next: string | null; note: string; deadLetters: { count?: number; note: string } }

let db: TestDb
let server: FastifyInstance
const DEAD = 2

async function pageSize(): Promise<number> {
  const code = await import('../src/server/lib/worker.ts')
  const size = (code as unknown as { QUEUE_PAGE_SIZE: number }).QUEUE_PAGE_SIZE
  expect(size, 'the queue code defines its one page size').toBeTypeOf('number')
  return size
}

async function post(url: string, payload: object): Promise<string> {
  const response = await server.inject({ method: 'POST', url, headers: PERSON, payload })
  expect(response.statusCode, response.body).toBeLessThan(500)
  return (response.json() as { record: { id: string } }).record.id
}

async function message(title: string): Promise<string> {
  return post('/api/records', { kind: 'message', title, data: { body: 'Please carry out the task.', to: [{ kind: 'agent', id: 'dead-letters' }] } })
}

async function remove(id: string): Promise<void> {
  const response = await server.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: PERSON })
  expect(response.statusCode, response.body).toBeLessThan(300)
}

async function read(url: string): Promise<Page> {
  const response = await server.inject({ method: 'GET', url, headers: PERSON })
  expect(response.statusCode, response.body).toBe(200)
  return response.json() as Page
}

beforeAll(async () => {
  db = await freshDb()
  server = (await apiApp()).app
  supplyRuntimeSubmissions(db, server)
  await server.ready()
  const size = await pageSize()
  await post('/api/records', { kind: 'agent', title: 'dead-letters', data: { handle: 'dead-letters', state: 'active', runtime: 'claude-code' } })
  for (let i = 0; i < DEAD; i++) await remove(await message(`Deleted ${String(i)}`))
  for (let i = 0; i < size + 1; i++) await message(`Waiting ${String(i)}`)
}, 120_000)

afterAll(async () => {
  await server.close()
  db.close()
})

it('the first page carries the count of the dead letters', async () => {
  const whole = await read('/api/worker/queue')
  expect(whole.deadLetters.count).toBe(DEAD)
  const first = await read('/api/worker/queue?page=1')
  expect(first.deadLetters.count).toBe(DEAD)
}, 60_000)

it('a walk of every page counts each dead letter once', async () => {
  let url: string | null = '/api/worker/queue?page=1'
  let counted = 0
  let pages = 0
  do {
    const page: Page = await read(url!)
    if (pages > 0) {
      expect(page.deadLetters, `page ${String(pages + 1)} is asked with a cursor`).not.toHaveProperty('count')
      expect(page.deadLetters.note).toBe(LATER_PAGE_NOTE)
    }
    counted += page.deadLetters.count ?? 0
    pages += 1
    url = page.next
  } while (url !== null)
  expect(pages, 'the queue fills more than one page').toBeGreaterThan(1)
  expect(counted).toBe(DEAD)
}, 60_000)

it('an empty later page says that nothing more is waiting', async () => {
  const first = await read('/api/worker/queue?page=1')
  expect(first.next).not.toBeNull()
  const later = await read(first.next!)
  expect(later.queue.length).toBeGreaterThan(0)
  for (const row of later.queue) await remove(row.messageId)
  const empty = await read(first.next!)
  expect(empty.queue).toEqual([])
  expect(empty.failed).toEqual([])
  expect(empty.note).toBe('Nothing more is waiting for a run in this project.')
  expect(empty.next).toBeNull()
}, 60_000)
