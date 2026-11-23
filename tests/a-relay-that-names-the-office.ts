// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELAY TO A TEST'S OWN OFFICE THAT NAMES THE OFFICE IN EACH REQUEST'S HOST.
 *
 * The office refuses a request whose Host does not name the port it listens on, with 421
 * (src/server/lib/a-host-that-is-not-this-office.ts). A relay that passes the bytes through leaves the caller's
 * Host, which names the relay, so every request it carried was refused. This relay reads each request and sends it
 * on with the Host `127.0.0.1:<the office's port>`, the name the office answers to, and passes the answer back as it
 * came. What the caller connects to, and when, is still the relay's port and the test's own timing.
 */
import { createServer, request, type Server } from 'node:http'

/** A relay to the office on 127.0.0.1 at `port`, not yet listening: the test chooses where and when it listens. */
export function aRelayThatNamesTheOffice(port: number): Server {
  return createServer((inbound, outbound) => {
    const onward = request(
      { host: '127.0.0.1', port, method: inbound.method, path: inbound.url, headers: { ...inbound.headers, host: `127.0.0.1:${String(port)}` } },
      (answer) => {
        outbound.writeHead(answer.statusCode!, answer.headers)
        answer.pipe(outbound)
      },
    )
    onward.on('error', () => outbound.destroy())
    // A caller that goes before its answer is complete takes the onward request with it, so a long wait at the office
    // is not left holding a connection that nobody reads, and the office can close.
    outbound.on('close', () => {
      if (!outbound.writableFinished) onward.destroy()
    })
    inbound.pipe(onward)
  })
}
