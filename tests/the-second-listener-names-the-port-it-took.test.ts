// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECOND LISTENER'S STARTUP LINE NAMES THE PORT ITS SOCKET TOOK, NOT THE ONE IT WAS ASKED FOR (problem 2QCiuBNESHbk).
 *
 * src/server/index.ts opens a second listener for other machines when MOLE_OFFICE_REMOTE_PORT is set, and writes one
 * line saying where. That line used to print the host and port from the setting. The first and third listeners already
 * read theirs off the socket. whatTheSecondListenerSays now does the same.
 *
 * The setting refuses port 0 today, so the asked port and the taken port cannot differ in a running office. This test
 * asks for port 0 on a socket of its own, which is the one way to make them differ, and checks that the line names the
 * port the kernel gave.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   · a listener asked for port 0 is described at the port it took.
 *     MUTATION: in whatTheSecondListenerSays, print `remotePortFromEnv()` in place of `bound.port`, as the line printed
 *     the setting before. The line names "null" and this goes red.
 */

import { createServer, type Server } from 'node:http'
import { afterAll, expect, it } from 'vitest'
import { whatTheSecondListenerSays } from '../src/server/index.ts'

const servers: Server[] = []

afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((done) => server.close(() => done()))))
})

it('names the port the socket took when it was asked for port 0', async () => {
  const server = createServer()
  servers.push(server)
  await new Promise<void>((done, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => done())
  })
  const bound = server.address()
  if (bound === null || typeof bound === 'string') throw new Error('The test socket has no port.')
  expect(bound.port).not.toBe(0)

  expect(whatTheSecondListenerSays(server)).toBe(
    `other machines: a second listener on http://127.0.0.1:${String(bound.port)} — same app, and every request ` +
      'through it is stamped as coming from another machine',
  )
})
