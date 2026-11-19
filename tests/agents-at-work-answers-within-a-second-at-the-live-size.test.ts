// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AGENTS AT WORK GETS ITS THREE ANSWERS WITHIN A SECOND AT THE LIVE OFFICE'S SIZE, IN THE TIMING GROUP. Wave 13y
 * round 133.
 *
 * The page waits on three doors: /api/working for its list, /api/attention?machine=omit&shape=home for the shell's
 * count, and /api/agent/marks for the review bar. The live office of 4 November 2026, with 1,826 agents and 721 of
 * them retired, waited about 13 s for them. Each door's median is held under 1 s here.
 *
 * THE OFFICE IS MADE UP at the counts of that day: THE_LIVE_OFFICE_ON_4_NOVEMBER in tests/the-office-at-the-live-scale.ts,
 * with the guesses named beside it. Every name and word is made up. It does not make the live 13 s: on it, before
 * round 133, the marks took 2 ms alone. The office's size makes the doors slow only when they are asked together.
 *
 * WHAT IT COSTS TO RUN. The hook builds the office: about 2 minutes on a quiet machine, and a database of about
 * 1.4 GB in the test's own folder, removed when the file ends. So the timing group takes about 3 minutes longer, and
 * the temporary folder needs 1.4 GB free.
 *
 * THE THREE ARE ASKED TOGETHER, in the order the page asks them: its list first, then the count and the marks. The
 * server answers on one thread, so a door that keeps the thread holds up the doors asked with it. On the made-up
 * office before round 133, asked this way, the list took about 940 ms, the count about 1.7 s and the marks about 940 ms.
 *
 * They are asked together once to warm them, then five times, and each door's median is held against 1 s. Every time
 * is written to the timing results file when the group names one.
 *
 * IT RUNS ONLY IN THE TIMING GROUP (`node tools/run-named-tests.mjs --list timing`), on a quiet machine, as
 * tests/the-timing-tests.ts says.
 */
import { appendFileSync } from 'node:fs'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheOfficeAtAScale, THE_LIVE_OFFICE_ON_4_NOVEMBER } from './the-office-at-the-live-scale.ts'
import { TIMING_RESULTS_VARIABLE } from './the-timing-tests.ts'

/** The three doors, in the order the page asks them. */
const DOORS = ['/api/working', '/api/attention?machine=omit&shape=home', '/api/agent/marks'] as const
const WITHIN_MS = 1_000
/** More rows than this in the list say it was read at the live size: the made-up office lists 1,105. */
const AT_THE_LIVE_SIZE = 1_000
const OUT = process.env[TIMING_RESULTS_VARIABLE] ?? ''

let t: TestDb
let app: FastifyInstance
/** Each door's five times, asked together. */
const times = new Map<string, number[]>(DOORS.map((door) => [door, []]))
let rowsListed = 0

async function askTheThreeTogether(headers: Record<string, string>): Promise<{ door: string; ms: number; status: number; body: string }[]> {
  return Promise.all(
    DOORS.map(async (door) => {
      const started = performance.now()
      const reply = await app.inject({ method: 'GET', url: door, headers })
      return { door, ms: performance.now() - started, status: reply.statusCode, body: reply.body }
    }),
  )
}

beforeAll(async () => {
  t = await freshDb()
  buildTheOfficeAtAScale(t.client.sqlite, THE_TEST_OFFICES_OWNER.id, THE_LIVE_OFFICE_ON_4_NOVEMBER, new Date())
  app = (await apiApp()).app
  await app.ready()
  // THE PERSON IS READ AFTER THE SERVER IS MADE, which tells person.ts who owns the office. Asked as anybody else, the
  // doors answer a reader who is hidden messages, and do other work.
  const { THE_PERSON } = await import('../src/shared/person.ts')
  expect(THE_PERSON, 'the person the server knows').toBe(THE_TEST_OFFICES_OWNER.id)
  const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  for (let round = 0; round <= 5; round++) {
    for (const one of await askTheThreeTogether(headers)) {
      expect(one.status, `${one.door}: ${one.body.slice(0, 300)}`).toBe(200)
      if (round > 0) times.get(one.door)!.push(one.ms)
      if (one.door === '/api/working') rowsListed = (JSON.parse(one.body) as { rows: unknown[] }).rows.length
    }
  }
}, 900_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('Agents at work at the live office size', () => {
  it('lists the made-up office at the live size', () => {
    expect(rowsListed).toBeGreaterThan(AT_THE_LIVE_SIZE)
  })

  for (const door of DOORS) {
    it(`answers ${door} within ${String(WITHIN_MS)} ms, asked with the other two`, () => {
      const five = times.get(door)!
      const median = [...five].sort((a, b) => a - b)[2]!
      const said = `[agents at work timing] ${door}: median ${String(Math.round(median))} ms of ${five.map((ms) => String(Math.round(ms))).join(', ')}; ${String(rowsListed)} rows listed`
      console.log(said)
      if (OUT !== '') appendFileSync(`${OUT}.agents-at-work.log`, `${said}\n`)
      expect(median, `the median time of ${door}`).toBeLessThan(WITHIN_MS)
    })
  }
})
