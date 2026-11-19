// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGES PASS READS ONLY THE HAND-BACKS IT CAN ACT ON. Wave 13u round 58.
 *
 * Every id, handle and sentence here is made up for this file's throwaway office. Each symptom
 * has its own marker and about 1,500 characters which neither the pass nor its answer uses.
 * One problem is written through createRecord; the offices copy its row in one SQL transaction.
 *
 * WHAT IS PROVED HERE.
 *   1. The three take-back lists are the answer from the code before this change, written out.
 *   2. The small office reads only the open hand-backs without a person-must-look note, and no
 *      whole problem. The counter's guard exercises all, get, iterate and raw array rows, plus
 *      a symptom read without a problem row and an id merely mentioned in another record.
 *   3. At 3,000 problems, one warm-up and seven passes print timing without a timing assertion.
 *      Every measured pass reads the six candidates and no whole problem.
 *
 * WHAT TURNS EACH RED, independently: restore the whole problem listing (2, 3); omit the state
 * term (2, 3); return whole data (2, 3); omit the person-must-look term (2, 3); ask for closed
 * instead of open (1). readTakeBack still checks all its facts after the SQL narrowing.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { theProblemRowsAReadingReads } from './the-problem-rows-a-reading-reads.ts'

const project = 'default'
const idOf = (n: number) => `made-up-problem-${String(n).padStart(4, '0')}`
const markerOf = (n: number) => `made-up symptom marker <${n}>`
const markers = new Map(Array.from({ length: 3000 }, (_, n) => [idOf(n), markerOf(n)]))
const headers = { 'x-mole-office-workspace': project }
const homeBefore = process.env.HOME
let home: string, t: TestDb, app: FastifyInstance
let counter: ReturnType<typeof theProblemRowsAReadingReads>
let template: string

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'made-up-merges-reading-'))
  process.env.HOME = home
  t = await freshDb()
  counter = theProblemRowsAReadingReads(t, markers)
  app = (await apiApp()).app
  await app.ready()
  template = t.api.createRecord({ workspaceId: project, kind: 'problem', title: 'A made-up kiln problem',
    origin: 'fixture', actor: t.api.HUMAN, data: { state: 'open', symptom: 'A made-up kiln symptom.' } }).id
  // Keep one complete envelope to copy, even after each office replaces the live problem rows.
  t.client.sqlite.exec('CREATE TEMP TABLE problem_template AS SELECT * FROM records WHERE 0')
  t.client.sqlite.prepare('INSERT INTO problem_template SELECT * FROM records WHERE id = ?').run(template)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (homeBefore === undefined) delete process.env.HOME
  else process.env.HOME = homeBefore
  if (home) rmSync(home, { recursive: true, force: true })
})

type Shape = 'ordinary-open' | 'ordinary-fixed' | 'wide-red' | 'fixed-hand-back' | 'person' | 'already-person' | 'future' | 'numeric-true' | 'unreadable'
function facts(n: number, deadline = '2001-01-01 10:00:00') {
  return { entry: `made-up-missing-entry-${n}`, repository: '/made-up-kiln-repository', files: ['made-up-kiln.test.ts'],
    commits: ['made-up-landed-commit'], line: { agent: 'made-up-kiln-line', starter: 'made-up-kiln-starter', run: 'made-up-kiln-round' },
    landedAt: '2001-01-01 09:00:00', deadline, timeZone: 'UTC', hours: 1 }
}

/** Copy the createRecord envelope in one transaction, giving each row its own id and symptom. */
function office(shapes: Shape[]) {
  const insert = t.client.sqlite.prepare(`INSERT INTO records
    SELECT ?, workspace_id, owner_id, created_at, ?, kind, title, summary, ?, deleted_at, origin
    FROM problem_template`)
  t.client.sqlite.transaction(() => {
    t.client.sqlite.prepare("DELETE FROM records WHERE kind = 'problem'").run()
    shapes.forEach((shape, n) => {
      const state = shape === 'ordinary-fixed' || shape === 'fixed-hand-back' ? 'fixed' : 'open'
      const handBack = facts(n, shape === 'future' ? '2099-01-01 10:00:00' : shape === 'unreadable' ? 'made-up unreadable deadline' : undefined)
      const extra = shape.startsWith('ordinary') ? {} : shape === 'wide-red' ? { redOnMainFamily: true, wideRed: {} } :
        { redOnMainFamily: shape === 'numeric-true' ? 1 : true, handBack,
          ...(shape === 'already-person' ? { takeBack: { aPersonMustLook: null } } : {}) }
      insert.run(idOf(n), n % 2 === 0 ? '2026-01-01 10:00:01' : '2026-01-01 10:00:00',
        JSON.stringify({ state, extra, symptom: `${markerOf(n)} ${'A made-up kiln holds a made-up glaze. '.repeat(41)}` }))
    })
  })()
}

const small: Shape[] = ['ordinary-open', 'ordinary-fixed', 'wide-red', 'fixed-hand-back', 'person', 'already-person', 'future', 'numeric-true', 'unreadable']
async function pass() {
  counter.reset()
  const start = performance.now()
  const answer = await app.inject({ method: 'GET', url: '/api/worker/merges', headers })
  const ms = performance.now() - start
  return { answer, ms, ...counter.read() }
}

it('1. gives the same three take-back lists as before', async () => {
  office(small)
  const read = await pass()
  expect(read.answer.statusCode, read.answer.body).toBe(200)
  const { takeBacksDue, takeBacksForAPerson, takeBacksCannotBeRead } = read.answer.json()
  expect({ takeBacksDue, takeBacksForAPerson, takeBacksCannotBeRead }).toEqual({
    takeBacksDue: [],
    takeBacksForAPerson: [{ problem: idOf(4), says: `Problem ${idOf(4)}: the handed-back entry is missing or is not a merged merge entry. A person must look.` }],
    takeBacksCannotBeRead: [{ problem: idOf(8), says: `Problem ${idOf(8)}: the deadline made-up unreadable deadline in UTC cannot be read.` }],
  })
})

it('2. reads only the three candidate problems and no whole problem', async () => {
  office(small)
  // THE COUNTER MUST SEE EACH READING SHAPE, including an expression with no records metadata.
  for (const raw of [false, true]) for (const method of ['all', 'get', 'iterate'] as const) {
    counter.reset()
    const statement = t.client.sqlite.prepare('SELECT id AS problem_id, kind AS record_kind, data AS body FROM records WHERE id = ?')
    statement.raw(raw)
    if (method === 'iterate') [...statement.iterate(idOf(0))]
    else statement[method](idOf(0))
    expect(counter.read()).toEqual({ problemIds: [idOf(0)], wholeProblemIds: [idOf(0)], rows: 1 })
  }
  counter.reset()
  t.client.sqlite.prepare('SELECT ? AS data').get(JSON.stringify({ mentionedProblem: idOf(0) }))
  expect(counter.read()).toEqual({ problemIds: [], wholeProblemIds: [], rows: 1 })
  t.client.sqlite.prepare('SELECT json_extract(data, \'$.symptom\') FROM records WHERE id = ?').get(idOf(1))
  expect(counter.read()).toEqual({ problemIds: [], wholeProblemIds: [idOf(1)], rows: 2 })
  const read = await pass()
  expect(read.answer.statusCode, read.answer.body).toBe(200)
  expect(read.problemIds).toEqual([idOf(4), idOf(6), idOf(8)])
  expect(read.wholeProblemIds).toEqual([])
})

it('3. measures seven passes over 3000 problems and reads only the six candidates', async () => {
  const shapes: Shape[] = Array.from({ length: 2940 }, (_, n) => n % 2 === 0 ? 'ordinary-open' : 'ordinary-fixed')
  shapes.push(...Array<Shape>(40).fill('wide-red'), ...Array<Shape>(12).fill('fixed-hand-back'),
    ...Array<Shape>(4).fill('person'), ...Array<Shape>(2).fill('already-person'), ...Array<Shape>(2).fill('future'))
  office(shapes)
  await pass()
  const passes = []
  for (let n = 0; n < 7; n++) passes.push(await pass())
  const times = passes.map(read => read.ms).sort((a, b) => a - b)
  const one = passes[0]!
  console.info(`MERGES PASS MEASURED: 3000 problems; pass median ${times[3]!.toFixed(2)} ms (min ${times[0]!.toFixed(2)}, max ${times[6]!.toFixed(2)}); problem rows read ${one.problemIds.length}; problems read whole ${one.wholeProblemIds.length}; rows read in all ${one.rows}`)
  for (const read of passes) {
    expect(read.answer.statusCode, read.answer.body).toBe(200)
    expect(read.problemIds).toEqual([2992, 2993, 2994, 2995, 2998, 2999].map(idOf))
    expect(read.wholeProblemIds).toEqual([])
  }
})
