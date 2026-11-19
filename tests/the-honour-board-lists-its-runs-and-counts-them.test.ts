// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HONOUR BOARD'S LIST DOOR AND ITS WEEKLY TABLE — criteria HB3, HB5 and HB6 of
 * design/honour-board/ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, on a made-up office of five runs across two models
 * ---------------------------------------------------------------------------------------
 *
 *   1. ONE PAGE, NEWEST FIRST. `GET /api/honour-board` hands back the runs whose stored reading is
 *      exemplary, newest first, each with its agent, its signals and their evidence, its conditions
 *      (or none where nobody wrote any), the model it was started with, and its brief and report.
 *      The noted runs are a second page of the same door; a run whose reading is `none`, or that was
 *      never read, is on neither.
 *   2. THE TABLE COUNTS BY THE MODEL THE RUN WAS STARTED WITH, per temperature band, over the last
 *      seven days and over all time, and says how many runs carry the model the provider served and
 *      a temperature. A band is the number the runner wrote, or the words it wrote instead.
 *   3. THE COST IS THE RECORDS IT TOUCHED (HB6): the stored readings, the page's run records, and what
 *      the brief and report search opened. Pages are 25 at most, and a bigger one is refused.
 *
 * THE MUTATIONS THIS IS WRITTEN AGAINST, after a control run: the table counted by `served.model`
 * turns case 2 red; the brief and report search left out of the cost turns case 3 red; the page
 * ordered oldest first turns case 1 red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
const runs: Record<string, string> = {}
let brief = ''

const NOT_REPORTED = { model: 'not reported', temperature: 'not reported', briefBytes: 812, contextTokens: { largestTurn: 'not reported', total: 'not reported' } }

function aReading(standing: 'exemplary' | 'noted' | 'none', signals: string[], evidence: string): Record<string, unknown> {
  return {
    read_at: '2026-10-10 12:00:00',
    standing,
    threshold: 2,
    signals: signals.map((signal) => ({ signal, evidence: [evidence], read_at: '2026-10-10 12:00:00' })),
    missing: [],
    cost: { records: 4, ms: 1 },
  }
}

async function aRun(key: string, made: { model: string; served?: Record<string, unknown>; createdAt: string; honour?: Record<string, unknown> }): Promise<void> {
  const opened = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'session', title: `Example run ${key} (made up for this test)`, data: { state: 'running', runtime: 'dsh', servingAgent: 'board-worker', model: made.model, ...(made.served ? { served: made.served } : {}) } },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  const id = (opened.json() as { record: { id: string } }).record.id
  runs[key] = id
  if (made.honour) t.api.patchRecord(id, { dataPatch: { honour: made.honour } }, { type: 'human', id: THE_PERSON })
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(made.createdAt, id)
}

async function theBoard(query = ''): Promise<{ status: number; body: any }> {
  const read = await app.inject({ method: 'GET', url: `/api/honour-board${query}`, headers: AS_THE_PERSON })
  return { status: read.statusCode, body: read.json() }
}

function aDayAgo(days: number): string {
  const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${String(when.getFullYear())}-${two(when.getMonth() + 1)}-${two(when.getDate())} ${two(when.getHours())}:${two(when.getMinutes())}:${two(when.getSeconds())}`
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'board-worker', name: 'Board worker', role: 'worker' } })
  expect(registered.statusCode, registered.body).toBe(201)
  await aRun('A1', { model: 'model-alpha', served: NOT_REPORTED, createdAt: aDayAgo(1), honour: aReading('exemplary', ['needed no rework', 'proved every test by mutation'], 'EVIDENCE_A1') })
  await aRun('A2', { model: 'model-alpha', served: { ...NOT_REPORTED, model: 'alpha-served', temperature: 0.7 }, createdAt: aDayAgo(20), honour: aReading('exemplary', ['corrected its brief', 'needed no rework', 'found a real defect outside its brief'], 'EVIDENCE_A2') })
  await aRun('A3', { model: 'model-alpha', served: NOT_REPORTED, createdAt: aDayAgo(2), honour: aReading('none', [], 'unused') })
  await aRun('B1', { model: 'model-beta', createdAt: aDayAgo(3), honour: aReading('noted', ['needed no rework'], 'EVIDENCE_B1') })
  await aRun('B2', { model: 'model-beta', createdAt: aDayAgo(4) })
  const note = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'note', title: `Brief of board-worker's run ${runs['A1']!}`, data: { body: 'An example brief, made up for this test.' }, links: [{ type: 'about', toId: runs['A1'] }] },
  })
  expect(note.statusCode, note.body).toBe(201)
  brief = (note.json() as { record: { id: string } }).record.id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the honour board', () => {
  it('lists the exemplary runs newest first, with their signals, conditions and brief, and the noted runs as their own page', async () => {
    const board = await theBoard()
    expect(board.status, JSON.stringify(board.body)).toBe(200)
    expect(board.body.rows.map((row: { run: string }) => row.run)).toEqual([runs['A1'], runs['A2']])
    expect(board.body.counts).toEqual({ read: 4, exemplary: 2, noted: 1, none: 1 })
    expect(board.body.threshold).toBe(2)
    const [first, second] = board.body.rows
    expect(first.agent).toEqual({ id: expect.any(String), handle: 'board-worker', name: 'Board worker' })
    expect(first.startedWith).toBe('model-alpha')
    expect(first.served).toEqual(NOT_REPORTED)
    expect(first.signals.map((one: { signal: string; evidence: string[] }) => [one.signal, one.evidence])).toEqual([
      ['needed no rework', ['EVIDENCE_A1']],
      ['proved every test by mutation', ['EVIDENCE_A1']],
    ])
    expect(first.brief).toEqual({ id: brief, title: `Brief of board-worker's run ${runs['A1']!}` })
    expect(first.report).toBeNull()
    expect(second.brief).toBeNull()

    const noted = await theBoard('?standing=noted')
    expect(noted.body.rows.map((row: { run: string }) => row.run)).toEqual([runs['B1']])
    expect(noted.body.rows[0].served).toBeNull()

    const paged = await theBoard('?limit=1')
    expect([paged.body.rows.length, paged.body.total, paged.body.next]).toEqual([1, 2, 1])
    const rest = await theBoard('?limit=1&offset=1')
    expect([rest.body.rows[0].run, rest.body.next]).toEqual([runs['A2'], null])
  })

  it('counts signals by the model the run was started with and the temperature band, this week and in all', async () => {
    const { body } = await theBoard()
    expect(body.table.countsBy).toBe('the model the run was started with')
    expect(body.table.lines).toEqual([
      { model: 'model-alpha', temperature: 'not reported', lastSevenDays: { runs: 2, signals: 2, exemplary: 1, noted: 0 }, allTime: { runs: 2, signals: 2, exemplary: 1, noted: 0 } },
      { model: 'model-alpha', temperature: '0.7', lastSevenDays: { runs: 0, signals: 0, exemplary: 0, noted: 0 }, allTime: { runs: 1, signals: 3, exemplary: 1, noted: 0 } },
      { model: 'model-beta', temperature: 'not recorded', lastSevenDays: { runs: 1, signals: 1, exemplary: 0, noted: 1 }, allTime: { runs: 1, signals: 1, exemplary: 0, noted: 1 } },
    ])
    expect(body.table.servedModel).toEqual({ on: 1, of: 4 })
    expect(body.table.temperature).toEqual({ on: 1, of: 4 })
  })

  it('says what it cost in the records it touched, and refuses a page bigger than 25', async () => {
    const { body } = await theBoard()
    // Four stored readings, two run records for the page, and for each row the brief and report
    // search: the run's record once more, then every record pointed `about` the run, opened once
    // looking for a report and once looking for the brief. The office files one such record for
    // every session it is given, and A1 has its brief besides.
    let searched = 0
    for (const row of body.rows as { run: string }[]) {
      const read = await app.inject({ method: 'GET', url: `/api/records/${row.run}`, headers: AS_THE_PERSON })
      const about = (read.json() as { links: { type: string; isBacklink: boolean }[] }).links.filter((one) => one.type === 'about' && one.isBacklink)
      searched += 1 + 2 * about.length
    }
    expect(searched).toBe(1 + 2 * 2 + 1 + 2 * 1)
    expect(body.cost.records).toBe(4 + 2 + searched)
    expect(typeof body.cost.ms).toBe('number')
    expect((await theBoard('?limit=26')).status).toBe(400)
    expect((await theBoard('?standing=none')).status).toBe(400)
  })
})
