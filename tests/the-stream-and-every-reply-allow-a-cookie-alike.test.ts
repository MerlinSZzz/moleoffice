// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EVENT STREAM AND EVERY OTHER REPLY GIVE A PAGE ON ANOTHER ORIGIN THE SAME ANSWER ABOUT ITS
 * COOKIE.
 *
 * A paired browser sends its key as a cookie. A browser attaches a cookie to a request for another
 * origin only when the reply allows it with `access-control-allow-credentials: true`, and refuses
 * the reply otherwise. Two places write that header. The CORS plugin writes it on every ordinary
 * reply (`credentials` in src/server/index.ts). The event stream writes its own headers, because
 * `reply.hijack()` takes its reply away from every hook, the plugin's included. Both read one rule,
 * `A_PAGE_MAY_SEND_ITS_COOKIE` in src/config/what-a-page-may-read.mjs.
 *
 * If the two came to disagree, a paired page on another origin would read every record and lose its
 * live channel, or the other way round, with nothing on screen saying why. So this opens both, for
 * an origin the office admits and for one it refuses, and fails when their answers differ.
 */
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_PAGE_MAY_SEND_ITS_COOKIE } from '../src/config/what-a-page-may-read.mjs'

const HEAD = { 'x-mole-office-workspace': 'default' }
const THE_HEADER = 'access-control-allow-credentials'

let t: TestDb
let app: FastifyInstance
let at = ''

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  at = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** The CORS headers of one ordinary reply and of the stream, for one origin. */
async function bothAnswers(origin: string): Promise<{ ordinary: Headers; stream: Headers }> {
  const ordinary = await fetch(`${at}/api/health`, { headers: { ...HEAD, origin } })
  await ordinary.arrayBuffer()
  // The stream stays open, so it is dropped as soon as its headers have arrived.
  const stop = new AbortController()
  const stream = await fetch(`${at}/api/events`, {
    headers: { ...HEAD, origin, accept: 'text/event-stream' },
    signal: stop.signal,
  })
  stop.abort()
  return { ordinary: ordinary.headers, stream: stream.headers }
}

describe('whether a page may send its cookie is one answer on the stream and on every other reply', () => {
  it('allows the cookie on both for an origin the office admits', async () => {
    // A page served by something on this machine, which `aPageOnThisMachine` admits.
    const origin = 'http://127.0.0.1:29845'
    const { ordinary, stream } = await bothAnswers(origin)
    // The origin really was admitted on both, or the comparison below would prove nothing.
    expect(ordinary.get('access-control-allow-origin')).toBe(origin)
    expect(stream.get('access-control-allow-origin')).toBe(origin)
    expect(
      stream.get(THE_HEADER),
      'the stream and an ordinary reply disagree on whether this page may send its cookie',
    ).toBe(ordinary.get(THE_HEADER))
    // And the answer is the rule itself, so a rule that said no would be seen here too.
    expect(ordinary.get(THE_HEADER)).toBe(A_PAGE_MAY_SEND_ITS_COOKIE ? 'true' : null)
  })

  it('allows the cookie on neither for an origin the office refuses', async () => {
    const { ordinary, stream } = await bothAnswers('https://evil.example.com')
    expect(ordinary.get('access-control-allow-origin')).toBeNull()
    expect(stream.get('access-control-allow-origin')).toBeNull()
    expect(stream.get(THE_HEADER), 'the stream allows a cookie from an origin it refuses').toBe(
      ordinary.get(THE_HEADER),
    )
  })
})
