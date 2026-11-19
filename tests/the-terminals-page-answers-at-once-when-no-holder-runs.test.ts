// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TERMINALS PAGE'S LIST ANSWERS AT ONCE WHEN NO HOLDER RUNS, AND GIVES UP ON A SLOW ONE IN A NAMED TIME.
 * Wave 13u, round 8.
 *
 * On 5 October the owner's GET /api/terminals took 9.7 s and 14.3 s with no holder running, and the page looked
 * stuck. The door is in src/server/api/terminals.ts; the time it gives a holder is THE_PAGES_HOLDER_READ_MS in
 * src/server/lib/terminals.ts, one second, where it used to be ONE_REQUEST_MS, three seconds, for the hello and
 * three more for the list. A real scratch server process runs on a database in the test's own folder.
 *
 *   1. With no holder (no socket), the list answers 'not running' within half a second.
 *   2. A holder that takes the connection and never answers: the list answers 'unusable' within two seconds, and
 *      says it gave the holder one second.
 *   3. A holder that says hello and then never answers the list: the same, within two seconds.
 *
 * Each request is timed after one warm-up request (GET /api/health), so the server's first-request costs are
 * not counted.
 *
 * MUTATIONS (each after a control run; the commit message that added this file has the runs):
 *   - src/server/api/terminals.ts, the list door: theHolderState() with no time, which is the old three seconds:
 *     case 2 goes red.
 *   - the same door: askTheHolderFor({ op: 'list' }) with no time: case 3 goes red.
 *   - the same door: before reading the holder, a wait for one to come up, as the start press waits
 *     (HOLDER_START_WAIT_MS): case 1 goes red.
 */

import { mkdirSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { dirname } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { aPlace, ask, startAServer, stopEverything, type Place } from './terminal-holder-stand.ts'

afterAll(stopEverything, 60_000)

/** One request to the list, timed, after a warm-up request to the same server. */
async function theListTimed(api: string): Promise<{ ms: number; holder: Record<string, unknown>; terminals: unknown }> {
  await ask(api, '/api/health')
  const started = performance.now()
  const listed = await ask(api, '/api/terminals')
  const ms = performance.now() - started
  expect(listed.status, JSON.stringify(listed.body)).toBe(200)
  return { ms, holder: listed.body['holder'] as Record<string, unknown>, terminals: listed.body['terminals'] }
}

/** A stand-in on the place's socket. `answer` is what it says to one request line, or null for nothing. */
async function aStandIn(place: Place, answer: (request: Record<string, unknown>) => Record<string, unknown> | null): Promise<{ stop: () => Promise<void> }> {
  mkdirSync(dirname(place.socket), { recursive: true, mode: 0o700 })
  const held = new Set<Socket>()
  const server: Server = createServer((socket) => {
    held.add(socket)
    socket.once('close', () => held.delete(socket))
    let pending = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      pending += chunk
      const newline = pending.indexOf('\n')
      if (newline < 0) return
      const said = answer(JSON.parse(pending.slice(0, newline)) as Record<string, unknown>)
      pending = ''
      if (said !== null) socket.write(`${JSON.stringify(said)}\n`)
    })
  })
  await new Promise<void>((done) => server.listen(place.socket, () => done()))
  return {
    stop: async () => {
      // close() waits for every open connection, so they are ended first.
      const closed = new Promise<void>((done) => server.close(() => done()))
      for (const socket of held) socket.destroy()
      await closed
    },
  }
}

it('1: with no holder, the list says none runs within half a second', async () => {
  const place = aPlace('none')
  const server = await startAServer(place, undefined, { MOLE_OFFICE_TERMINAL_HOLDER: 'on' })
  const read = await theListTimed(server.api)
  expect(read.ms, `the list took ${String(Math.round(read.ms))} ms`).toBeLessThan(500)
  expect(read.holder['state']).toBe('not running')
  expect(read.terminals).toBeNull()
}, 120_000)

it('2: a holder that never answers is called unusable within two seconds, with the one second it was given', async () => {
  const place = aPlace('silent')
  const standIn = await aStandIn(place, () => null)
  try {
    const server = await startAServer(place, undefined, { MOLE_OFFICE_TERMINAL_HOLDER: 'on' })
    const read = await theListTimed(server.api)
    expect(read.ms, `the list took ${String(Math.round(read.ms))} ms`).toBeLessThan(2_000)
    expect(read.holder['state']).toBe('unusable')
    expect(read.holder['noAnswerWithinMs']).toBe(1_000)
    expect(read.holder['says']).toContain('did not answer within 1 second.')
    expect(read.terminals).toBeNull()
  } finally {
    await standIn.stop()
  }
}, 120_000)

it('3: a holder that says hello and never lists is called unusable within two seconds', async () => {
  const place = aPlace('no-list')
  const standIn = await aStandIn(place, (request) =>
    request['op'] === 'hello'
      ? { ok: true, id: request['id'], protocol: 1, pid: process.pid, startedAt: null, database: place.database }
      : null,
  )
  try {
    const server = await startAServer(place, undefined, { MOLE_OFFICE_TERMINAL_HOLDER: 'on' })
    const read = await theListTimed(server.api)
    expect(read.ms, `the list took ${String(Math.round(read.ms))} ms`).toBeLessThan(2_000)
    expect(read.holder['state'], JSON.stringify(read.holder)).toBe('unusable')
    expect(read.holder['noAnswerWithinMs']).toBe(1_000)
    expect(read.terminals).toBeNull()
  } finally {
    await standIn.stop()
  }
}, 120_000)
