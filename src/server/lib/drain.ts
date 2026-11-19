// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STOPPING SERVER ANSWERS THE READS IT HAS TAKEN (message n5g0uTda98in, round 6f of wave 13x).
 * Its own file so tests/a-stopping-server-answers-what-it-took.test.ts can hold a read and stop it.
 */
import type { Server } from 'node:http'
import { SHUTDOWN_CONNECTION_GRACE_MS } from '../../config/settings.mjs'
import { named } from './named-timers.ts'

/**
 * STOP TAKING CONNECTIONS AT ONCE, AND ANSWER THE ONES ALREADY TAKEN, for at most
 * SHUTDOWN_CONNECTION_GRACE_MS. Then end what is still open. An event stream or a hold is ended
 * before this by `endTheWaits` (src/server/index.ts), since it never ends by itself.
 *
 * A KEPT CONNECTION IS CLOSED ONCE IT HAS ITS ANSWER. Node goes on serving a keep-alive connection
 * after `close()`, so a client that kept its connection would be served by a stopping server, and
 * the drain would last the whole grace (tried on Node 22, 7 October 2026). So a read that arrives
 * from here is answered with `connection: close`. A read already in flight is answered `keep-alive`
 * whatever is set now (tests/a-stopping-server-answers-what-it-took.test.ts found it), so every
 * 100 ms the connections that hold no read are closed.
 */
export function drain(server: Server): Promise<{ took: number; endedUnanswered: number }> {
  const began = Date.now()
  server.on('request', (_request, reply) => reply.setHeader('connection', 'close'))
  let endedUnanswered = 0
  return new Promise((done) => {
    const say = (line: string): void => console.error(line)
    const idle = setInterval(named('the shutdown\'s idle closer', say, () => server.closeIdleConnections()), 100)
    const grace = setTimeout(
      named('the shutdown\'s grace', say, () => {
        server.getConnections((_err, open) => {
          endedUnanswered = open
          server.closeAllConnections()
        })
      }),
      SHUTDOWN_CONNECTION_GRACE_MS,
    )
    server.close(() => {
      clearTimeout(grace)
      clearInterval(idle)
      done({ took: Date.now() - began, endedUnanswered })
    })
  })
}
