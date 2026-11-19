// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STOPPING SERVER ANSWERS THE READS IT HAS TAKEN (message n5g0uTda98in, round 6f of wave 13x).
 *
 * At a load of 46 to 75 the real office took 5 to 25 s to answer a read. Its stop kept the listener
 * open through every step, gave the reads it held 1 s, and serve-dev killed it after 5 s, so a read it
 * had taken was reset: 3 of 3 runs of case 4 of tests/the-office-answers-while-it-restarts.test.ts.
 * `drain` (src/server/lib/drain.ts) stops taking reads at once and answers the ones it holds.
 *
 * The read here takes 6 s, longer than serve-dev's old 5 s, and the client keeps its connection, as
 * a browser does.
 *
 * MUTATIONS: a grace of 1 s in drain.ts resets the held read (the answer's claim goes red). Without
 * the closing of idle connections the drain waits for the kept connection until the grace runs out
 * (the last claim goes red).
 */
import { Agent, createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, it } from 'vitest'
import { SHUTDOWN_CONNECTION_GRACE_MS } from '../src/config/settings.mjs'
import { drain } from '../src/server/lib/drain.ts'

const HELD_FOR_MS = 6_000

type Read = { status: number; body: string; connection: string | undefined } | { failed: string }

function read(port: number, agent: Agent): Promise<Read> {
  return new Promise((done) => {
    const asked = request({ host: '127.0.0.1', port, path: '/', agent }, (reply) => {
      let body = ''
      reply.setEncoding('utf8')
      reply.on('data', (chunk: string) => { body += chunk })
      reply.on('end', () => done({ status: reply.statusCode ?? 0, body, connection: reply.headers.connection }))
      reply.on('error', (err: NodeJS.ErrnoException) => done({ failed: err.code ?? err.message }))
    })
    asked.on('error', (err: NodeJS.ErrnoException) => done({ failed: err.code ?? err.message }))
    asked.end()
  })
}

it('answers a read it took 6 s before, takes no new read, and closes the kept connection with the answer', async () => {
  let taken = 0
  const server = createServer((_request, reply) => {
    taken += 1
    setTimeout(() => reply.end('answered'), HELD_FOR_MS)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as AddressInfo).port
  const agent = new Agent({ keepAlive: true })
  try {
    const held = read(port, agent)
    while (taken === 0) await new Promise((done) => setTimeout(done, 10))
    const drained = drain(server)
    const afterTheStop = await read(port, new Agent())
    expect(afterTheStop).toEqual({ failed: 'ECONNREFUSED' })
    expect(await held).toMatchObject({ status: 200, body: 'answered' })
    const result = await drained
    expect(result.endedUnanswered).toBe(0)
    expect(result.took).toBeGreaterThanOrEqual(HELD_FOR_MS - 100)
    // The kept connection is closed with the answer, not at the end of the grace.
    expect(result.took).toBeLessThan(HELD_FOR_MS + 2_000)
    expect(SHUTDOWN_CONNECTION_GRACE_MS).toBeGreaterThan(HELD_FOR_MS + 2_000)
  } finally {
    agent.destroy()
    server.closeAllConnections()
  }
}, 30_000)
