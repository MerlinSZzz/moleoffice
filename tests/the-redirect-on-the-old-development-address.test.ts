// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OLD DEVELOPMENT ADDRESS SENDS THE BROWSER TO THE BUILT OFFICE, IN ONE LINE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------------------
 *
 * S4 of design/ground/ACCEPTANCE.md section 9. For the week after the switch, `5173` — the address
 * the owner's bookmarks on their other machine point at — answers with one redirect to the same path on the
 * API's port. And it must NOT be started when the port is already held: the usual holder is the
 * development Vite this change replaces, and a second process fighting for the port is exactly the
 * race four supervisors once had for the configured port.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PORT IN THIS TEST IS NOT 5173
 * ---------------------------------------------------------------------------------------
 *
 * 5173 is the owner's own dev server on this machine and a test may never bind it. What is being
 * proved is the MECHANISM: it answers 302 with the same path on the API's port, and it refuses a
 * port somebody else holds. The configured port is a setting, and the supervisor passes it; this
 * test passes its own so that it takes nothing anybody else is using.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer as servePlainly, type Server } from 'node:http'
import { createServer as probe } from 'node:net'
import { startTheOneLineRedirect, theRedirectTarget } from '../tools/serve-dev.mjs'

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const socket = probe()
    socket.on('error', fail)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      if (address === null || typeof address === 'string') {
        socket.close(() => fail(new Error('the probe socket reported no port')))
        return
      }
      const { port } = address
      socket.close(() => done(port))
    })
  })
}

let webPort = 0
let apiPort = 0
let redirect: Awaited<ReturnType<typeof startTheOneLineRedirect>> | null = null
let somebodyElses: Server | null = null
let aHeldPort = 0

beforeAll(async () => {
  webPort = await freePort()
  apiPort = await freePort()
  redirect = await startTheOneLineRedirect({ webPort, apiPort, say: () => {} })
})

afterAll(async () => {
  if (redirect?.started === true) await redirect.close()
  if (somebodyElses !== null) await new Promise<void>((done) => somebodyElses?.close(() => done()))
})

describe('the target the one line sends a browser to', () => {
  it('is the same path on the API port, and the host the browser asked for', () => {
    expect(theRedirectTarget('a-machine.test:5173', '/records/abc?x=1', 39017)).toBe('http://a-machine.test:39017/records/abc?x=1')
  })

  it('falls back to loopback when the browser named no host, and keeps the query', () => {
    expect(theRedirectTarget(null, '/waiting?days=7', 39017)).toBe('http://127.0.0.1:39017/waiting?days=7')
  })
})

describe('the listener on the old development address', () => {
  it('started, because nothing else held the port', () => {
    expect(redirect?.started).toBe(true)
  })

  it('answers 302 to the same path on the API port', async () => {
    const answered = await fetch(`http://127.0.0.1:${String(webPort)}/records/abc?x=1`, { redirect: 'manual' })
    expect(answered.status).toBe(302)
    expect(answered.headers.get('location')).toBe(`http://127.0.0.1:${String(apiPort)}/records/abc?x=1`)
    // A redirect is not something a browser or a proxy may keep.
    expect(answered.headers.get('cache-control')).toBe('no-store')
    await answered.text()
  })

  it('answers 302 for the root as well, so a bookmark to / works', async () => {
    const answered = await fetch(`http://127.0.0.1:${String(webPort)}/`, { redirect: 'manual' })
    expect(answered.status).toBe(302)
    expect(answered.headers.get('location')).toBe(`http://127.0.0.1:${String(apiPort)}/`)
    await answered.text()
  })

  it('refuses to start when the port is already held, and says whose problem it is', async () => {
    aHeldPort = await freePort()
    somebodyElses = servePlainly((_req, res) => {
      res.statusCode = 204
      res.end()
    })
    await new Promise<void>((done) => somebodyElses?.listen(aHeldPort, '127.0.0.1', () => done()))

    const second = await startTheOneLineRedirect({ webPort: aHeldPort, apiPort, say: () => {} })
    expect(second.started).toBe(false)
    if (second.started) return
    expect(second.why).toContain(String(aHeldPort))
    expect(second.why).toContain('nothing is redirecting')
  })
})
