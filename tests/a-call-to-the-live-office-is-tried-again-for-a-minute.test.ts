// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CALL TO THE LIVE OFFICE BEFORE DOWNTIME THAT GETS NO ANSWER IS TRIED AGAIN FOR ABOUT A MINUTE.
 *
 * Upgrade 19 was killed by a 57-second stall of one call to the live office. Part (6) of the decision
 * "A slimmer stable release" says that a call that gets no answer — the transport's time ran out, or the
 * connection was refused or reset — is sent again, the same method, path and body, for about 60
 * seconds. A reply with any status is an answer and is never sent again, and only a GET and
 * the notice POST (whose sendId makes a second send the same notice) are safe to send. A gate count has
 * no sendId, so it is sent once.
 *
 * The stand-in below is a real node:http server on 127.0.0.1 at port 0. It records each request's
 * method, path and raw body, never its headers, and a script says what each request gets: a status and
 * a JSON body, a hold until the transport gives up (or a later answer), or a destroyed socket. The
 * transport is the real upgradeOfficeRequest, pointed at it by a made-up environment. MOLE_AGENT_KEY is
 * a made-up key for every case and the old value is put back after, so no real key reaches the stand-in.
 * For a refused connection, a port is listened on, its server closed, and that port is used.
 *
 * MUTATIONS, after a control run, each turning its named case red:
 *   M1: the transport never marks `noAnswer` — the held-then-answered GET and the notice POST are not tried.
 *   M2: a reply with status 500 is sent again — the reply-of-any-status case is red.
 *   M3: the gate count is sent again — the gate-count case is red.
 *   M4: the window is never checked — the window case stops its retries and fails instead of hanging.
 *   M5: the body is rebuilt on each try from the caller's object — the notice case changes that object
 *       between tries and sees a different second body.
 */
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  THE_PAUSE_BETWEEN_TRIES_MS,
  THE_RETRY_WINDOW_MS,
  triedAgainForAMinute,
  upgradeOfficeRequest,
} from '../tools/stable/stable-upgrade-notices.mjs'

// The notice path and the emergency gate path are declared in the module but not exported, so they are
// copied here; each is the path the criterion names and the transport permits.
const NOTICE_PATH = '/api/office/upgrades/notice'
const EMERGENCY_COUNT_PATH = '/api/office/gates/stable-emergency/met'
// The transport's own time is made short so the file runs in a few seconds. The wrapper's window and
// pause are the test's short values, not the product's 60 seconds and 1 second.
const TRANSPORT_MS = 200
const WINDOW_MS = 1_500
const PAUSE_MS = 50
const HELD_LONGER_THAN_TRANSPORT_MS = 400

interface Received {
  method: string
  path: string
  body: string
  at: number
}

type Answer =
  | { status: number; body: unknown }
  | { reset: true }
  | { hold: true }
  | { holdForMs: number; status: number; body: unknown }

type Script = (request: Received, tryNumber: number) => Answer

interface CallOptions {
  windowMs?: number
  pauseMs?: number
  say?: (line: string) => void
  pause?: (ms: number) => Promise<void>
}

let server: Server
let origin = ''
let received: Received[] = []
let held: ServerResponse[] = []
let script: Script = () => ({ status: 200, body: {} })
const REAL_AGENT_KEY = process.env.MOLE_AGENT_KEY

const envAt = (api = origin) => ({
  MOLE_OFFICE_API: api,
  MOLE_OFFICE_AGENT: 'fixture-writer',
  MOLE_OFFICE_SESSION: 'fixture-run',
  MOLE_OFFICE_WORKSPACE: 'fixture-project',
})

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk as Buffer))
    request.on('end', () => {
      const seen: Received = {
        method: request.method ?? '',
        path: request.url ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
        at: Date.now(),
      }
      received.push(seen)
      const answer = script(seen, received.length)
      if ('reset' in answer) {
        response.destroy()
        return
      }
      if ('hold' in answer) {
        held.push(response)
        return
      }
      const send = () => {
        if (response.destroyed) return
        response.writeHead(answer.status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(answer.body))
      }
      if ('holdForMs' in answer) {
        held.push(response)
        setTimeout(send, answer.holdForMs).unref()
        return
      }
      send()
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
})

beforeEach(() => {
  for (const response of held) response.destroy()
  held = []
  received = []
  script = () => ({ status: 200, body: {} })
  process.env.MOLE_AGENT_KEY = 'made-up-key-that-reaches-no-real-office'
})

afterEach(() => {
  for (const response of held) response.destroy()
  held = []
  if (REAL_AGENT_KEY === undefined) delete process.env.MOLE_AGENT_KEY
  else process.env.MOLE_AGENT_KEY = REAL_AGENT_KEY
})

afterAll(async () => {
  for (const response of held) response.destroy()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

/** The real transport, shortened, and the wrapper with the test's short window and pause. */
const theCall = (api = origin, { windowMs = WINDOW_MS, pauseMs = PAUSE_MS, say = (_line: string) => {}, pause }: CallOptions = {}) => {
  const transport = upgradeOfficeRequest(envAt(api), TRANSPORT_MS)
  const call = triedAgainForAMinute(transport, { windowMs, pauseMs, say, ...(pause === undefined ? {} : { pause }) })
  return { transport, call }
}

describe('a call to the live office that gets no answer is tried again for about a minute', () => {
  // Mutation M1: the transport never marks noAnswer, so the held first try is thrown, not sent again.
  it('sends a GET again when the first try gets no answer, and returns the answer', async () => {
    const path = '/api/office/upgrades?sendId=fixture-get&limit=1'
    script = (_request, tryNumber) => tryNumber === 1
      ? { holdForMs: HELD_LONGER_THAN_TRANSPORT_MS, status: 200, body: { answered: 'second' } }
      : { status: 200, body: { answered: 'second' } }
    const said: string[] = []
    const { call } = theCall(origin, { say: line => said.push(line) })

    const reply = await call({ method: 'GET', path })

    expect(reply.status).toBe(200)
    expect(JSON.parse(reply.body)).toEqual({ answered: 'second' })
    expect(received.length).toBeGreaterThanOrEqual(2)
    for (const one of received) {
      expect(one.method).toBe('GET')
      expect(one.path).toBe(path)
      expect(one.body).toBe('')
    }
    // Each try again is said in one line naming the method, the path and the seconds since the first
    // try. The transport's own reason is named after them; it is not exported for a read, so the line
    // is only required to carry more than the three values the test can read.
    expect(said.length).toBeGreaterThanOrEqual(1)
    for (const line of said) {
      expect(line).toContain('GET')
      expect(line).toContain(path)
      expect(line).toMatch(/\d+(?:\.\d+)? seconds?\b/)
      expect(line.length).toBeGreaterThan(`GET ${path} seconds`.length)
    }
  })

  // Mutation M5: the caller's object changes between tries, so a body rebuilt on each try is caught.
  it('sends the notice POST again, and every try carries the body copied before the first try', async () => {
    script = (_request, tryNumber) => tryNumber === 1
      ? { holdForMs: HELD_LONGER_THAN_TRANSPORT_MS, status: 201, body: { notice: 'filed' } }
      : { status: 201, body: { notice: 'filed' } }
    const request = {
      method: 'POST',
      path: NOTICE_PATH,
      body: { stage: 'before', sendId: 'made-up-send-id', announcement: { notice: 'Synthetic approved notice.' } },
    }
    const bodyAsAsked = JSON.stringify(request.body)
    const { call } = theCall(origin, {
      // M5's red case: the caller's own object is changed in the moment between the first try and the
      // second. The copy made before the first try must still be what is sent.
      say: () => { request.body.announcement.notice = 'changed between tries' },
    })

    const reply = await call(request)

    expect(reply.status).toBe(201)
    expect(received.length).toBeGreaterThanOrEqual(2)
    for (const one of received) {
      expect(one.method).toBe('POST')
      expect(one.path).toBe(NOTICE_PATH)
      expect(one.body).toBe(bodyAsAsked)
    }
    expect(new Set(received.map(one => one.body)).size).toBe(1)
  })

  // Mutation M4: the window is never checked, so the retries never stop. The test's pause stops them
  // after the window instead of letting the file hang, and the per-test timeout is the last guard.
  it('stops after the window, throwing a no-answer error naming the path and the number of tries', async () => {
    const path = '/api/office/upgrades?sendId=held-past-the-window&limit=1'
    script = () => ({ hold: true })
    let pauses = 0
    const { call } = theCall(origin, {
      pause: async ms => {
        if (pauses >= 12) throw new Error('The retry loop ran past its window; the test stopped it.')
        pauses += 1
        await delay(ms)
      },
    })

    const failure = await call({ method: 'GET', path }).then(() => null, (error: unknown) => error as Error & { noAnswer?: boolean })

    expect(failure).not.toBeNull()
    expect(failure?.noAnswer).toBe(true)
    expect(failure?.message).toContain(path)
    expect(failure?.message).toContain(String(received.length))
    expect(received.length).toBeGreaterThan(1)
    // No try was sent after the window: every request reached the stand-in before it had passed.
    const beganAt = received[0]?.at ?? 0
    expect(received.filter(one => one.at - beganAt > WINDOW_MS + 750)).toEqual([])
  }, 20_000)

  // Mutation M2: a reply with status 500 is sent again, and every other answer is sent again too.
  it('returns a reply with any status at once, and never sends a 500 or a 404 again', async () => {
    for (const status of [500, 404]) {
      received = []
      script = () => ({ status, body: { status } })
      const { call } = theCall()

      const reply = await call({ method: 'GET', path: `/api/office/upgrades?sendId=status-${String(status)}&limit=1` })

      expect(reply.status).toBe(status)
      expect(received).toHaveLength(1)
    }
  })

  it('tries again when the connection is refused, then says no answer after the window', async () => {
    // Listen on a port, close the server, and use that port: nothing answers it.
    const spare = createServer(() => {})
    const port = await new Promise<number>((resolve, reject) => {
      spare.once('error', reject)
      spare.listen(0, '127.0.0.1', () => resolve((spare.address() as AddressInfo).port))
    })
    await new Promise<void>(resolve => spare.close(() => resolve()))
    const said: string[] = []
    const { call } = theCall(`http://127.0.0.1:${String(port)}`, { windowMs: 600, say: line => said.push(line) })

    const failure = await call({ method: 'GET', path: '/api/office/upgrades?sendId=refused&limit=1' })
      .then(() => null, (error: unknown) => error as Error & { noAnswer?: boolean })

    expect(failure).not.toBeNull()
    expect(failure?.noAnswer).toBe(true)
    // The tries all failed before reaching the stand-in, so the count is read from the lines said.
    expect(said.length).toBeGreaterThan(1)
    expect(failure?.message).toMatch(/\d+ tries\b/)
    expect(failure?.message).toContain('/api/office/upgrades?sendId=refused&limit=1')
    expect(received).toHaveLength(0)
  })

  it('tries again when the socket is reset', async () => {
    script = (_request, tryNumber) => tryNumber === 1 ? { reset: true } : { status: 200, body: { reset: false } }
    const { call } = theCall()

    const reply = await call({ method: 'GET', path: '/api/office/upgrades?sendId=reset&limit=1' })

    expect(reply.status).toBe(200)
    expect(JSON.parse(reply.body)).toEqual({ reset: false })
    expect(received).toHaveLength(2)
    expect(received.every(one => one.method === 'GET' && one.path === '/api/office/upgrades?sendId=reset&limit=1')).toBe(true)
  })

  // Mutation M3: the gate count is sent again, though it carries no sendId and would count twice.
  it('sends a gate count once and throws the transport\'s own error when it gets no answer', async () => {
    script = () => ({ hold: true })
    const request = { method: 'POST', path: EMERGENCY_COUNT_PATH, body: { position: '1' } }
    const transport = upgradeOfficeRequest(envAt(origin), TRANSPORT_MS)
    const direct = await transport(request).then(() => null, (error: unknown) => error as Error)
    received = []
    const { call } = theCall()

    const failure = await call(request).then(() => null, (error: unknown) => error as Error & { noAnswer?: boolean })

    expect(failure).not.toBeNull()
    // The transport's own sentence is thrown, unchanged, not a wrapper's sentence after a window.
    expect(failure?.message).toBe(direct?.message)
    expect(received).toHaveLength(1)
    expect(received[0]?.method).toBe('POST')
    expect(received[0]?.path).toBe(EMERGENCY_COUNT_PATH)
  })

  it('throws an error that is not no-answer at once, and sends nothing', async () => {
    const dry = upgradeOfficeRequest(envAt(origin), TRANSPORT_MS, true)
    const request = { method: 'POST', path: NOTICE_PATH, body: { stage: 'before' } }
    const refusal = await dry(request).then(() => null, (error: unknown) => error as Error)
    const call = triedAgainForAMinute(dry, { windowMs: WINDOW_MS, pauseMs: PAUSE_MS })

    const failure = await call(request).then(() => null, (error: unknown) => error as Error & { noAnswer?: boolean })

    expect(call.identity).toEqual(dry.identity)
    expect(failure?.message).toBe(refusal?.message)
    expect(failure?.noAnswer).not.toBe(true)
    expect(received).toHaveLength(0)
  })

  it('waits the agreed sixty seconds, and pauses one second between tries', () => {
    // The 60-second window is copied from the owner's agreed design, part (6) of "A slimmer stable
    // release". The 1-second pause is this round's engineering choice, pinned here so
    // that a change to it is made on purpose. Neither number can be read from the code: they are the
    // requirement itself.
    expect(THE_RETRY_WINDOW_MS).toBe(60_000)
    expect(THE_PAUSE_BETWEEN_TRIES_MS).toBe(1_000)
  })
})
