// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST LINE NAMES ITS PROJECT, AGENT AND SESSION, AND A SLOW ONE SAYS SO.
 *
 * WHY. On 24 September 2026 the office stopped answering for 20 to 26 seconds at a time
 * (acceptance finding 67). The request log said only
 * `GET /api/resources?includeReleased=true 200 21368.4ms`, so nobody could say who was asking or
 * in which project, and nobody could stop it. The secretary asked that every line name its project, agent
 * and session, and that a request over a few seconds get a line of its own.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. Every completed request's line carries the four fields it always carried -- method, url,
 *    status, milliseconds -- and then `project=`, `agent=` and `session=`, read from what a door
 *    resolved or, when no door resolved one, from the request's own headers, and `-` otherwise.
 * 2. A request that takes three seconds or more gets a warn line of its own, naming its door, its
 *    seconds and the same three names.
 * 3. A request held open on purpose is not called slow: neither a route that declares
 *    `waits: true` nor the waiting door's per-request mark from `thisCallIsHeld` gets a slow line.
 *
 * HOW IT READS THE LOG. No other test reads the server's request log, so `buildApp` takes a
 * `logStream` and pino writes every line into the one this file holds. That seam is not a
 * setting: no environment variable names it and `start()` never passes it.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOFS, 24 September 2026, each alone in src/server/index.ts or src/server/lib/usage.ts
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 5 cases, all green. (The worker's proofs were taken on its own version of
 * src/server/index.ts; a review then moved the held mark's reading into lib/usage.ts, and the
 * proofs were run again on the reviewed version, as the run's report says.)
 *
 * (a) NEVER WRITE THE SLOW LINE. The `if (!this.aChosenWait(request) && reply.elapsedTime >=
 *     SLOW_REQUEST_MS)` block was deleted, so no warn line is ever written. RED, 1 case:
 *     "writes a second warn line for the slow one and none for the fast one".
 *
 * (b) LEAVE THE THREE NAMES OFF THE LINE. The `line` was put back to its four fields alone, so no
 *     line carries `project=`, `agent=` or `session=`. RED, 3 cases:
 *     "puts the three names after the four fields it always had",
 *     "writes a second warn line for the slow one and none for the fast one",
 *     "says `-` where neither a door nor a header named anything".
 *
 * (c) TREAT A HELD REQUEST AS SLOW. The one predicate, `thisRequestWasAChosenWait` in lib/usage.ts
 *     (until the follow-up of that day, `requestIsHeldOpen` in index.ts), was made to return `false`,
 *     so held requests get a slow line. RED, 2 cases:
 *     "gives a route declaring waits: true no slow line, however long it takes",
 *     "gives the waiting door's own mark no slow line either".
 *
 * The copy was put back after each and its sha256 checked against the number above; the control
 * run was repeated green.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, type TestDb } from './helpers.ts'

/** The three names every line must carry, sent exactly as an agent's own tool sends them. */
const WORKSPACE = 'panelx'
const AGENT = 'quill'
const SESSION = 'sess-slow'
const AS_THE_AGENT = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': AGENT,
  'x-mole-office-session': SESSION,
}

/**
 * LONGER THAN THE THREE-SECOND MARK, with room for a loaded machine and for the reply itself.
 * The rule is "three seconds or more", so 3.2 leaves nothing to the scheduler.
 */
const A_SLOW_REPLY_MS = 3_200

/** The runner's five-second default is too tight for a test that sleeps 3.2 seconds. */
const A_TEST_THAT_WAITS = 30_000

/**
 * A PLACE FOR THE LOG LINES TO LAND, so the test can read them.
 *
 * Pino writes one JSON object per line to whatever `stream` Fastify was given. This keeps the
 * lines whole and hands back the `msg` field of each, which is the request line itself.
 */
class RecordingStream {
  private readonly whole: string[] = []
  private waiting = ''

  write(msg: string): void {
    this.waiting += msg
    let end = this.waiting.indexOf('\n')
    while (end !== -1) {
      const line = this.waiting.slice(0, end)
      this.waiting = this.waiting.slice(end + 1)
      if (line.trim() !== '') this.whole.push(line)
      end = this.waiting.indexOf('\n')
    }
  }

  /** The `msg` of every line written so far, oldest first. */
  messages(): string[] {
    return this.whole.map((line) => {
      const parsed = JSON.parse(line) as { msg?: unknown }
      return typeof parsed.msg === 'string' ? parsed.msg : ''
    })
  }

  /** Start a case with no line left over from the one before it. */
  clear(): void {
    this.whole.length = 0
    this.waiting = ''
  }
}

let t: TestDb
let app: FastifyInstance
let log: RecordingStream

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Give the log a moment to finish before the lines are read. */
const settle = (): Promise<void> => pause(20)

beforeAll(async () => {
  t = await freshDb()
  const { buildApp } = await import('../src/server/index.ts')
  log = new RecordingStream()
  app = (
    await buildApp({
      production: false,
      webDir: '/nonexistent',
      webAppUrl: 'http://localhost:5173',
      logLevel: 'info',
      logStream: log,
    })
  ).app

  // ONE ROUTE THAT STALLS, ONE THAT ANSWERS AT ONCE, ONE THAT IS HELD ON PURPOSE, AND ONE THAT
  // USES THE WAITING DOOR'S OWN PER-REQUEST MARK. The first three live outside /api, so
  // `trackApiRoutes` leaves them alone and the test does not have to claim any operation or reach
  // for them.
  app.get('/slow', async () => {
    await pause(A_SLOW_REPLY_MS)
    return { answered: 'at last' }
  })
  app.get('/fast', async () => ({ answered: 'at once' }))
  app.get('/held', { config: { waits: true } }, async () => {
    await pause(A_SLOW_REPLY_MS)
    return { answered: 'held open' }
  })
  // THE WAITING DOOR HOLDS ONLY SOME OF ITS REQUESTS, so its mark lives on the request rather
  // than on the route. `thisCallIsHeld` writes that mark into the state `recordCalls` puts on the
  // request -- and `recordCalls` only holds state for `/api`, which is why this route is under
  // `/api`. The borrowed `record.list` declaration is there only because every `/api` route must
  // declare an operation and a reach; what is under test here is the mark, not the operation.
  const { thisCallIsHeld } = await import('../src/server/lib/usage.ts')
  app.get('/api/marked', { config: { operation: 'record.list', reach: 'remote' } }, async (req) => {
    thisCallIsHeld(req)
    await pause(A_SLOW_REPLY_MS)
    return { answered: 'marked held' }
  })
  await app.ready()
}, 60_000)

beforeEach(() => {
  // THE LOG IS THE ONE THING A CASE CHANGES, and a line from the case before it would answer for this one.
  log.clear()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a line names the project, the agent and the session', () => {
  it(
    'puts the three names after the four fields it always had',
    async () => {
      const res = await app.inject({ method: 'GET', url: '/fast', headers: AS_THE_AGENT })
      expect(res.statusCode).toBe(200)
      await settle()
      const line = log.messages().find((m) => m.startsWith('GET /fast 200'))
      expect(line).toBeDefined()
      expect(line).toMatch(/^GET \/fast 200 \d+\.\dms project=panelx agent=quill session=sess-slow$/)
    },
    A_TEST_THAT_WAITS,
  )

  it(
    'writes a second warn line for the slow one and none for the fast one',
    async () => {
      const slow = await app.inject({ method: 'GET', url: '/slow', headers: AS_THE_AGENT })
      expect(slow.statusCode).toBe(200)
      await settle()
      const messages = log.messages()
      const slowLine = messages.find((m) => m.startsWith('GET /slow 200'))
      expect(slowLine).toMatch(/^GET \/slow 200 \d+\.\dms project=panelx agent=quill session=sess-slow$/)

      const slowWarn = messages.find((m) => m.startsWith('slow request: GET /slow'))
      expect(slowWarn).toBeDefined()
      expect(slowWarn).toMatch(
        /^slow request: GET \/slow took \d+\.\d s \(project panelx, agent quill, session sess-slow\)$/,
      )
      // RIGHT AFTER, which is what makes it stand out from the line it belongs to.
      expect(messages.indexOf(slowWarn!)).toBeGreaterThan(messages.indexOf(slowLine!))

      const fast = await app.inject({ method: 'GET', url: '/fast', headers: AS_THE_AGENT })
      expect(fast.statusCode).toBe(200)
      await settle()
      const fastLine = log.messages().find((m) => m.startsWith('GET /fast 200'))
      expect(fastLine).toMatch(/project=panelx agent=quill session=sess-slow$/)
      // THE FAST ONE HAS NO SLOW LINE BECAUSE IT WAS FAST, read from its own line: a machine that stalled it for three
      // seconds would rightly write one, and a loaded suite can (the inspector's note on this file's release, with
      // precedents RzOvH_2PKnih and jddGW981fri2). So the slow line is held to the time the request really took.
      const tookMs = Number(/^GET \/fast 200 (\d+\.\d)ms /.exec(fastLine ?? '')?.[1])
      expect(Number.isFinite(tookMs), `the fast line says its time: ${String(fastLine)}`).toBe(true)
      expect(log.messages().some((m) => m.startsWith('slow request: GET /fast'))).toBe(tookMs >= 3000)
    },
    A_TEST_THAT_WAITS,
  )

  it(
    'says `-` where neither a door nor a header named anything',
    async () => {
      const res = await app.inject({ method: 'GET', url: '/fast' })
      expect(res.statusCode).toBe(200)
      await settle()
      expect(log.messages().find((m) => m.startsWith('GET /fast 200'))).toMatch(
        /^GET \/fast 200 \d+\.\dms project=- agent=- session=-$/,
      )
    },
    A_TEST_THAT_WAITS,
  )
})

describe('a request held open on purpose is not called slow', () => {
  it(
    'gives a route declaring waits: true no slow line, however long it takes',
    async () => {
      const res = await app.inject({ method: 'GET', url: '/held', headers: AS_THE_AGENT })
      expect(res.statusCode).toBe(200)
      await settle()
      expect(log.messages().some((m) => m.startsWith('GET /held 200'))).toBe(true)
      expect(log.messages().some((m) => m.startsWith('slow request: GET /held'))).toBe(false)
    },
    A_TEST_THAT_WAITS,
  )

  it(
    "gives the waiting door's own mark no slow line either",
    async () => {
      const res = await app.inject({ method: 'GET', url: '/api/marked', headers: AS_THE_AGENT })
      expect(res.statusCode).toBe(200)
      await settle()
      expect(log.messages().some((m) => m.startsWith('GET /api/marked 200'))).toBe(true)
      expect(log.messages().some((m) => m.startsWith('slow request: GET /api/marked'))).toBe(false)
    },
    A_TEST_THAT_WAITS,
  )
})
