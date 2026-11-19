// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aParticipantRowForThePage } from '../src/shared/short-lists.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const trace = vi.hoisted(() => ({ chainReads: 0 }))
vi.mock('../src/shared/the-chain-up-with.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/shared/the-chain-up-with.ts')>()
  return {
    ...actual,
    theChainUpWith: (...args: Parameters<typeof actual.theChainUpWith>) => {
      trace.chainReads++
      return actual.theChainUpWith(...args)
    },
  }
})

let db: TestDb
let app: FastifyInstance
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const prefix = randomUUID()
const handles = [`${prefix}-b`, `${prefix}-c`, `${prefix}-a`]

async function addAgent(handle: string): Promise<string> {
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: 'Synthetic participant', role: 'worker' } })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { agent: { id: string } }).agent.id
}

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => { await app?.close(); db?.close() })

it('answers only page fields and follows a stable continuation when the registry changes', async () => {
  const firstId = await addAgent(handles[0]!)
  const secondId = await addAgent(handles[1]!)
  const full = await app.inject({ method: 'GET', url: `/api/participants/agent/${encodeURIComponent(firstId)}`, headers })
  expect(full.statusCode).toBe(200)
  const before = (full.json() as { participant: { id: string } }).participant
  trace.chainReads = 0
  const page = await app.inject({ method: 'GET', url: '/api/participants?shape=page', headers })
  expect(page.statusCode).toBe(200)
  const initial = page.json<{ people: { id: string }[]; agents: { id: string }[] }>()
  const row = initial.agents.find(one => one.id === before.id)
  expect(row).toEqual(aParticipantRowForThePage(before))
  expect(trace.chainReads).toBe(0)

  type Page = { people: { id: string }[]; agents: { id: string }[]; next: string | null }
  let next: string | null = '/api/participants?shape=page&limit=1'
  const found: string[] = []
  const foundPeople: string[] = []
  while (next !== null && !found.includes(firstId)) {
    const answer = await app.inject({ method: 'GET', url: next, headers })
    expect(answer.statusCode).toBe(200)
    const part: Page = answer.json<Page>()
    // Every continuation must retain the requested page shape.
    for (const one of [...part.people, ...part.agents]) expect(one).toEqual(aParticipantRowForThePage(one))
    found.push(...part.agents.map(one => one.id))
    foundPeople.push(...part.people.map(one => one.id))
    next = part.next
  }
  expect(found).toContain(firstId)
  expect(next).not.toBeNull()
  // A row inserted before the cursor is not included in the read already in progress.
  const insertedBefore = await addAgent(handles[2]!)
  while (next !== null) {
    const answer = await app.inject({ method: 'GET', url: next, headers })
    expect(answer.statusCode).toBe(200)
    const part = answer.json<Page>()
    // Every continuation must retain the requested page shape.
    for (const one of [...part.people, ...part.agents]) expect(one).toEqual(aParticipantRowForThePage(one))
    found.push(...part.agents.map(one => one.id))
    foundPeople.push(...part.people.map(one => one.id))
    next = part.next
  }
  expect(found).not.toContain(insertedBefore)
  expect(initial.agents.map(one => one.id)).toEqual(expect.arrayContaining([firstId, secondId]))
  for (const one of initial.agents) expect(found.filter(id => id === one.id)).toHaveLength(1)
  for (const one of initial.people) expect(foundPeople.filter(id => id === one.id)).toHaveLength(1)
})

type WorkerAgent = { id?: string; handle?: string; homeWorld?: string | null }
type WorkerPage = { ok: boolean; body: Record<string, unknown> | null }
type WorkerPageReader = (path: string) => Promise<WorkerPage>

async function workerCollector(): Promise<(read: WorkerPageReader) => Promise<WorkerAgent[]>> {
  const worker = await import('../src/worker/index.ts')
  const read = (worker as unknown as { theParticipantsTheWorkerNeeds?: (read: WorkerPageReader) => Promise<WorkerAgent[]> }).theParticipantsTheWorkerNeeds
  expect(read).toBeTypeOf('function')
  return read!
}

it('collects every worker roster page before returning it', async () => {
  const collect = await workerCollector()
  const first: WorkerAgent = { id: randomUUID(), handle: randomUUID(), homeWorld: randomUUID() }
  const second: WorkerAgent = { id: randomUUID(), handle: randomUUID(), homeWorld: randomUUID() }
  const next = `/api/participants?cursor=${randomUUID()}`
  const read = vi.fn<WorkerPageReader>(async path => ({
    ok: true,
    body: path === next ? { agents: [second], next: null } : { agents: [first], next },
  }))
  const written = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    expect(await collect(read)).toEqual([first, second])
    expect(read).toHaveBeenCalledTimes(2)
    expect(written).not.toHaveBeenCalled()
  } finally { written.mockRestore() }
})

it('discards all worker roster rows when a middle page fails', async () => {
  const collect = await workerCollector()
  const next = `/api/participants?cursor=${randomUUID()}`
  const read = vi.fn<WorkerPageReader>(async path => path === next
    ? { ok: false, body: null }
    : { ok: true, body: { agents: [{ id: randomUUID() }], next } })
  const written = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    expect(await collect(read)).toEqual([])
    expect(read).toHaveBeenCalledTimes(2)
    expect(written).toHaveBeenCalledWith(expect.stringContaining('The participant roster read stopped at page 2: the office refused that page. No rows were used.'))
  } finally { written.mockRestore() }
})

it('discards all worker roster rows when a continuation repeats', async () => {
  const collect = await workerCollector()
  const next = `/api/participants?cursor=${randomUUID()}`
  let reads = 0
  const read = vi.fn<WorkerPageReader>(async () => {
    if (++reads > 2) throw new Error('The same page was asked for twice.')
    return { ok: true, body: { agents: [{ id: randomUUID() }], next } }
  })
  const written = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    expect(await collect(read)).toEqual([])
    expect(read).toHaveBeenCalledTimes(2)
    expect(written).toHaveBeenCalledWith(expect.stringContaining('The participant roster read stopped at page 3: the office named a page that was already read. No rows were used.'))
  } finally { written.mockRestore() }
})


it('discards all worker roster rows when the page limit is reached', async () => {
  const collect = await workerCollector()
  const worker = await import('../src/worker/index.ts')
  const limit = (worker as unknown as { WORKER_PARTICIPANT_PAGE_LIMIT: number }).WORKER_PARTICIPANT_PAGE_LIMIT
  expect(limit).toBeGreaterThan(0)
  let asked = 0
  const read = vi.fn<WorkerPageReader>(async () => {
    if (asked >= limit) throw new Error('The read passed its page limit.')
    return { ok: true, body: { agents: [{ id: randomUUID() }], next: `/api/participants?cursor=${String(++asked)}` } }
  })
  const written = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    expect(await collect(read)).toEqual([])
    expect(read).toHaveBeenCalledTimes(limit)
    expect(written).toHaveBeenCalledWith(expect.stringContaining(`The participant roster read stopped at page ${String(limit + 1)}: it reads at most ${String(limit)} pages. No rows were used.`))
  } finally { written.mockRestore() }
})
it('stops before asking for a participant page twice', async () => {
  const { everyParticipantPage } = await import('../src/shared/every-participant-page.ts')
  const first = '/api/participants'
  const again = '/api/participants?cursor=one'
  let reads = 0
  const read = vi.fn(async (path: string) => {
    if (++reads > 2) throw new Error('The same page was asked for twice.')
    if (path === first) return { ok: true, body: { next: again } }
    return { ok: true, body: { next: again } }
  })
  await expect(everyParticipantPage(first, read)).rejects.toThrow('The participant roster read stopped at page 3: the office named a page that was already read. No rows were used.')
  expect(read).toHaveBeenCalledTimes(2)
})

it('stops before asking past the participant page limit', async () => {
  const { everyParticipantPage, PARTICIPANT_PAGE_LIMIT } = await import('../src/shared/every-participant-page.ts')
  let count = 0
  const read = vi.fn(async () => {
    count++
    if (count > PARTICIPANT_PAGE_LIMIT) throw new Error('The read passed its page limit.')
    return { ok: true, body: { next: `/api/participants?cursor=${String(count)}` } }
  })
  await expect(everyParticipantPage('/api/participants', read)).rejects.toThrow(`The participant roster read stopped at page ${String(PARTICIPANT_PAGE_LIMIT + 1)}: it reads at most ${String(PARTICIPANT_PAGE_LIMIT)} pages. No rows were used.`)
  expect(read).toHaveBeenCalledTimes(PARTICIPANT_PAGE_LIMIT)
})

it('joins every real participant page once without leaving out a row', async () => {
  const { everyParticipantPage } = await import('../src/shared/every-participant-page.ts')
  type Row = { id: string }
  type Page = { people: Row[]; agents: Row[]; next: string | null }
  const wholeAnswer = await app.inject({ method: 'GET', url: '/api/participants?shape=page', headers })
  expect(wholeAnswer.statusCode).toBe(200)
  const whole = wholeAnswer.json<Page>()
  expect(whole.next).toBeNull()
  let next: string | null = '/api/participants?shape=page&limit=1'
  const direct: Page[] = []
  while (next !== null) {
    expect(direct.length).toBeLessThan(whole.people.length + whole.agents.length + 1)
    const answer = await app.inject({ method: 'GET', url: next, headers })
    expect(answer.statusCode).toBe(200)
    const page: Page = answer.json<Page>()
    direct.push(page)
    next = page.next
  }
  const pages = await everyParticipantPage<Page>('/api/participants?shape=page&limit=1', async (url) => {
    const answer = await app.inject({ method: 'GET', url, headers })
    expect(answer.statusCode).toBe(200)
    return { ok: true, body: answer.json<Page>() }
  })
  expect(pages.length).toBeGreaterThan(1)
  expect(pages).toEqual(direct)
  const people = pages.flatMap((page) => page.people)
  const agents = pages.flatMap((page) => page.agents)
  expect(people).toEqual(whole.people)
  expect(agents).toEqual(whole.agents)
  expect(new Set(people.map((row) => row.id)).size).toBe(people.length)
  expect(new Set(agents.map((row) => row.id)).size).toBe(agents.length)
})

it('keeps every page field of a person with a chosen label', async () => {
  const labels = [{ text: 'Example', colour: 'blue' }]
  const changed = await app.inject({ method: 'PATCH', url: `/api/participants/person/${THE_PERSON}`, headers, payload: { chatLabels: labels } })
  expect(changed.statusCode, changed.body).toBe(200)
  const full = await app.inject({ method: 'GET', url: `/api/participants/person/${THE_PERSON}`, headers })
  expect(full.statusCode).toBe(200)
  const person = full.json<{ participant: { id: string; chatLabels: typeof labels } }>().participant
  expect(person.chatLabels).toEqual(labels)
  const answer = await app.inject({ method: 'GET', url: '/api/participants?shape=page', headers })
  expect(answer.statusCode).toBe(200)
  const row = answer.json<{ people: { id: string }[] }>().people.find((one) => one.id === person.id)
  expect(row).toEqual(aParticipantRowForThePage(person))
})

// The tools that take only the first page of the roster. Each takes the first person and the first
// agent, to photograph one profile of each kind. People come first in the roster, so the first page
// holds both while the people fit on one page, and a kind that is missing is named on the sheet as
// unreachable rather than left out quietly.


