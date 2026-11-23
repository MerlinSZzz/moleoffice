// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/project-graph ANSWERS WITHIN A SECOND AT THE LIVE SIZE, IN THE TIMING GROUP. Wave 13s round 281, package PG,
 * point PG-1: the project graph answers within a second at the live office's size.
 *
 * The graph is worked out each time it is asked and nothing is stored, so each ask pays for the whole reading. This file
 * holds three things of the door, each by its median of five asks: how long one ask takes to answer, how many database
 * statements it runs, and how many bytes it reads from the database's files.
 *
 * WHY THE BYTES. On the live office on 20 November one ask took 87,685 ms, 86,439 of them in one statement that read
 * 203,799 revision rows (the live server's log). On this made-up office, with its pages in memory, the same reading
 * answered in medians of 569 ms and 553 ms in two measurements on 20 November, under the second, because the pages it
 * reads were already in memory. The bytes it reads do not depend on that: 1.7 GB an ask before the change.
 *
 * THE OFFICE IS MADE UP at the counts of 13 November 2026: THE_LIVE_OFFICE_ON_13_NOVEMBER in
 * tests/the-office-at-the-live-scale.ts, with the guesses named beside it. On it this file writes the project's revision
 * rows and its graph's links, in tests/the-project-graph-at-the-live-size.ts, at the counts of 20 November, which says
 * what was counted and what is a guess. Every name and word is made up.
 *
 * THE APP'S START WRITES. Building the app writes revisions of the office's agent records: one broadcast schedule for
 * each secretary that lacks one. So the project holds more revisions after the start than the office was built with.
 * The first case compares the reply with the count taken after the start, and holds that the asks write no revision.
 *
 * WHAT IT COSTS TO RUN. The hook builds the office: about 3 and a half minutes on a quiet machine, and a database of
 * about 3.2 GB in the test's own folder, removed when the file ends. An ask over the second stops the asking, so a red
 * run does not wait for four more.
 *
 * IT RUNS ONLY IN THE TIMING GROUP (`node tools/run-named-tests.mjs --list timing`), on a quiet machine, as
 * tests/the-timing-tests.ts says.
 *
 * NO RUN OF IT IS CITED AS PROOF. The figures above are measurements that found the cause, and the timing group runs
 * this file.
 *
 * WHAT THIS FILE DOES NOT CATCH. A read that is slow only when its pages are not in memory can stay under the second
 * here. tests/the-project-graph-reads-the-revisions-by-index.test.ts holds the door to the indexes, at any size.
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { monitorEventLoopDelay } from 'node:perf_hooks'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { ProjectGraphReply } from '../src/shared/project-graph.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheOfficeAtAScale, THE_LIVE_OFFICE_ON_13_NOVEMBER } from './the-office-at-the-live-scale.ts'
import { addTheProjectGraphsPast, THE_GRAPH_ON_20_NOVEMBER, THE_PROJECT, theProjectsRevisionRows, type TheGraphsPast } from './the-project-graph-at-the-live-size.ts'
import { TIMING_RESULTS_VARIABLE } from './the-timing-tests.ts'

/** PG-1: the graph answers within a second. */
const ANSWERS_WITHIN_MS = 1_000
/** The most statements one ask may run, as its Server-Timing header counts them. */
const RUNS_WITHIN_STATEMENTS = 200
/** The most bytes one ask may read from the database's files: a choice, under the 1.7 GB read before the change. */
const READS_WITHIN_BYTES = 400 * 2 ** 20

const OUT = process.env[TIMING_RESULTS_VARIABLE] ?? ''

const AS_THE_PERSON = {
  'x-mole-office-workspace': THE_PROJECT,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
const asks: { holdMs: number; statements: number; bytes: number; ms: number }[] = []
/** The first ask over the second, which stopped the asking, or null when none was. */
let overTheLimit: { ask: number; ms: number } | null = null
let graph: ProjectGraphReply | null = null
let past: TheGraphsPast | null = null
let revisionRows = 0
/** The revision rows the project holds once the app has started, before the first ask. */
let revisionsBeforeTheAsks: number | null = null
/** The revision rows the project holds after the last ask. */
let revisionsAfterTheAsks: number | null = null

/** The bytes this thread has read from files so far, as the kernel counts them; the database's pages are read on it. */
function theBytesReadSoFar(): number {
  const counted = /^rchar: (\d+)$/mu.exec(readFileSync('/proc/thread-self/io', 'utf8'))
  if (counted === null) throw new Error('/proc/thread-self/io says no rchar, so the bytes an ask reads cannot be counted.')
  return Number(counted[1])
}

/** One ask as the person: how long it took, how long it kept this thread, its statements and the bytes it read. */
async function oneAsk(): Promise<{ holdMs: number; statements: number; bytes: number; ms: number; status: number; body: string }> {
  const held = monitorEventLoopDelay({ resolution: 1 })
  held.enable()
  const before = theBytesReadSoFar()
  const started = performance.now()
  const reply = await app.inject({ method: 'GET', url: '/api/project-graph', headers: AS_THE_PERSON })
  const ms = performance.now() - started
  const bytes = theBytesReadSoFar() - before
  // The monitor records a kept thread only at its next timer turn, so one is let in before it is read.
  await new Promise((resolve) => setTimeout(resolve, 3))
  held.disable()
  const counted = /desc="(\d+) statements"/.exec(String(reply.headers['server-timing']))
  return { holdMs: held.max / 1e6, statements: counted === null ? Number.NaN : Number(counted[1]), bytes, ms, status: reply.statusCode, body: reply.body }
}

beforeAll(async () => {
  delete process.env['MOLE_OFFICE_IDLE_REMINDER_HOURS']
  t = await freshDb()
  const sqlite = t.client.sqlite
  buildTheOfficeAtAScale(sqlite, THE_TEST_OFFICES_OWNER.id, THE_LIVE_OFFICE_ON_13_NOVEMBER, new Date())
  past = addTheProjectGraphsPast(sqlite)
  revisionRows = (await import('../src/shared/project-graph.ts')).PROJECT_GRAPH_REVISION_ROWS

  app = (await apiApp()).app
  await app.ready()
  // The app's start writes revisions of the made-up office's agent records: a broadcast schedule for each secretary.
  // So the project holds more revisions than were built, and the reply is compared with the count after the start.
  revisionsBeforeTheAsks = theProjectsRevisionRows(sqlite)
  const warm = await oneAsk()
  expect(warm.status, warm.body.slice(0, 400)).toBe(200)
  for (let i = 0; i < 5; i++) {
    const one = await oneAsk()
    expect(one.status, one.body.slice(0, 400)).toBe(200)
    asks.push({ holdMs: one.holdMs, statements: one.statements, bytes: one.bytes, ms: one.ms })
    graph = JSON.parse(one.body) as ProjectGraphReply
    if (one.ms >= ANSWERS_WITHIN_MS) {
      overTheLimit = { ask: i + 1, ms: one.ms }
      break
    }
  }
  revisionsAfterTheAsks = theProjectsRevisionRows(sqlite)
}, 900_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** The median of the asks made. */
function median(of: (one: (typeof asks)[number]) => number): number {
  return [...asks.map(of)].sort((a, b) => a - b)[Math.floor(asks.length / 2)]!
}

function said(what: string): void {
  console.log(what)
  if (OUT !== '') appendFileSync(`${OUT}.project-graph.log`, `${what}\n`)
}

describe('GET /api/project-graph at the live office size', () => {
  it('reads a graph of the live size', () => {
    expect(past?.revisionRows, "the revision rows of the graph's project").toBeGreaterThanOrEqual(THE_GRAPH_ON_20_NOVEMBER.revisionRowsCounted)
    expect(past?.graphRecords, 'the live records of the seven kinds').toBeGreaterThanOrEqual(THE_GRAPH_ON_20_NOVEMBER.graphRecordsCounted)
    expect(past?.linksOfTheGraph, "the links with an end among the graph's records").toBeGreaterThanOrEqual(THE_GRAPH_ON_20_NOVEMBER.linkRowsCounted)
    expect(graph?.counts.revisions, 'the revisions the reply counts, against what the project holds once the app has started').toBe(revisionsBeforeTheAsks)
    expect(revisionsAfterTheAsks, 'the revisions the project holds after the asks: a read writes none').toBe(revisionsBeforeTheAsks)
    expect(graph?.revisions.entries, 'the newest real revisions').toHaveLength(revisionRows)
    expect(graph?.revisions.leftOut, 'the real revisions of the graph left out').toBeGreaterThan(0)
  })

  it(`answers in less than ${String(ANSWERS_WITHIN_MS)} ms`, () => {
    said(`[project graph timing] answered: ${asks.map((one) => one.ms.toFixed(1)).join(', ')} ms; held the thread ${asks.map((one) => one.holdMs.toFixed(1)).join(', ')} ms`)
    expect(overTheLimit, `ask ${String(overTheLimit?.ask)} took ${String(overTheLimit?.ms.toFixed(1))} ms, and the asking stopped there`).toBeNull()
    expect(median((one) => one.ms), 'the median time one ask took to answer').toBeLessThan(ANSWERS_WITHIN_MS)
  })

  it(`runs fewer than ${String(RUNS_WITHIN_STATEMENTS)} statements in one ask`, () => {
    const statements = median((one) => one.statements)
    said(`[project graph timing] statements: median ${String(statements)} of ${asks.map((one) => String(one.statements)).join(', ')}`)
    expect(statements, "the median of the statements one ask's Server-Timing header counts").toBeLessThan(RUNS_WITHIN_STATEMENTS)
  })

  it(`reads fewer than ${String(READS_WITHIN_BYTES / 2 ** 20)} MB from the database's files in one ask`, () => {
    const bytes = median((one) => one.bytes)
    said(`[project graph timing] bytes read: median ${String(bytes)} of ${asks.map((one) => String(one.bytes)).join(', ')}`)
    expect(bytes, 'the median of the bytes one ask read').toBeLessThan(READS_WITHIN_BYTES)
  })
})
