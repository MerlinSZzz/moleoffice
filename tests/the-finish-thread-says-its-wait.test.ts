// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A finish's thread reading says how many asks were ahead and separates its own read from the wait. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { FINISHED_STATES } from '../src/config/finished.mjs'
import { STILL_GOING_STATES } from '../src/config/still-going.mjs'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { aGitThatWaits, aRepository, asAgent, git, theOfficesCheckers, type AGitThatWaits } from './a-seal-read-fixture.ts'
import { freshDb, type TestDb } from './helpers.ts'

const WHO = 'a-finisher-whose-thread-wait-is-said'
let t: TestDb
let app: FastifyInstance
let folder = ''
let directory = ''
let held: AGitThatWaits
let apart: typeof import('../src/server/lib/the-seal-read-apart.ts')
const logged: Record<string, unknown>[] = []

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'finish-thread-wait-'))
  held = aGitThatWaits(folder)
  directory = aRepository(join(folder, 'repository'))
  git(directory, 'switch', '-qc', 'worker')
  t = await freshDb()
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  copyTheDefaultRegulationsOnce()
  const { buildApp } = await import('../src/server/index.ts')
  let partial = ''
  const logStream = { write(msg: string) {
    partial += msg
    for (let end = partial.indexOf('\n'); end !== -1; end = partial.indexOf('\n')) {
      const line = partial.slice(0, end)
      partial = partial.slice(end + 1)
      if (line.trim()) logged.push(JSON.parse(line) as Record<string, unknown>)
    }
  } }
  app = (await buildApp({ production: false, webDir: '/nonexistent', webAppUrl: 'http://localhost:5173', logLevel: 'info', logStream })).app
  await app.ready()
  apart = await import('../src/server/lib/the-seal-read-apart.ts')
  await theOfficesCheckers(app)
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: { handle: WHO, name: WHO, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
  expect(started.statusCode, started.body).toBe(201)
}, 60_000)

afterAll(async () => {
  held?.letGo()
  await app?.close()
  t?.close()
  held?.remove()
  if (folder) rmSync(folder, { recursive: true, force: true })
})

type Timing = { asksAhead: number; gitReadMs: number; threadWaitMs: number }
const timingOf = (read: unknown) => read as Timing
const ask = () => ({ facts: [{ directory, cutFrom: 'main', startedMs: null, look: null, kind: null, copied: false }], seals: [] })

it('counts the first outstanding ask when a second arrives, and gives both durations', async () => {
  held.holdAt('--others')
  const first = apart.readTheFinishApart(ask())
  try {
    await held.reached()
    const second = apart.readTheFinishApart(ask())
    held.letGo()
    const [one, two] = (await Promise.all([first, second])).map(timingOf)
    expect(one!.asksAhead).toBe(0)
    expect(two!.asksAhead).toBe(1)
    for (const answer of [one!, two!]) {
      expect(answer.gitReadMs).toEqual(expect.any(Number))
      expect(answer.threadWaitMs).toEqual(expect.any(Number))
      expect(answer.gitReadMs).toBeGreaterThanOrEqual(0)
      expect(answer.threadWaitMs).toBeGreaterThanOrEqual(0)
    }
  } finally { held.letGo() }
}, 30_000)

it('includes the timing fields in the finish line while retaining its total', async () => {
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(WHO), payload: { kind: 'session', title: 'A finish with a timed read', data: { state: STILL_GOING_STATES[0], servingAgent: WHO, doing: 'a finish under test', workingDirectory: directory, cutFrom: 'main' } } })
  expect(made.statusCode, made.body).toBe(201)
  const id = (made.json() as { record: { id: string } }).record.id
  const mark = logged.length
  await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asAgent(WHO), payload: { dataPatch: { state: FINISHED_STATES[0] }, remindBeforeTheSeal: false } })
  const lines = logged.slice(mark).filter((one) => 'finishParts' in one)
  expect(lines).toHaveLength(1)
  const text = String(lines[0]!['msg'])
  expect(text).toMatch(/the git read apart after pass \d+, for .*?\d+(?:\.\d+)? ms/)
  expect(text).toMatch(/asks ahead: \d+/)
  expect(text).toMatch(/thread wait: \d+(?:\.\d+)? ms/)
  expect(text).toMatch(/git read: \d+(?:\.\d+)? ms/)
}, 60_000)
