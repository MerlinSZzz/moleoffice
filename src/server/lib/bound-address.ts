// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ADDRESS THIS PROCESS REALLY ANSWERS ON, READ OFF THE LISTENING SOCKET.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/runtime` used to report `addresses.api` from the settings declaration. So a scratch
 * server started from a checkout whose `.env` names a MOLE_OFFICE_PORT answered that it was on that
 * port, whatever port it had really taken, and the runtime page drew that under *The API this page
 * is talking to*.
 * Problem `ES5fb2_BHsVn`, found by `tests/the-runtime-page-names-what-is-running.test.ts`: the test
 * passed in a worktree with no `.env` and failed in the live checkout, on the same code.
 *
 * A declaration is what somebody wrote down. A socket is what happened. The one page whose job is
 * to say which world answered has to draw the second.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A MODULE OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * Two readers want it and neither can reach the other. `src/server/index.ts` is the file that
 * binds, and it cannot be imported by `lib/runtime.ts` — importing the entry point from a library
 * it imports is a cycle. `src/server/index.ts` used to hold the bound port in a module variable of
 * its own, read only by `GET /api/health`; that variable is gone and this is the one place the fact
 * lives, so the health check and the runtime record cannot come to different answers about it.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS WRITTEN UNTIL SOMETHING BINDS
 * ---------------------------------------------------------------------------------------
 *
 * A server built for a test and driven with `inject` reaches `buildApp` and never listens, so it
 * answers on no address at all. That reads as `null` here, and the runtime record says in words
 * that this process is holding no socket rather than guessing an address for it.
 */

import type { Server } from 'node:http'

/** The host and port of a listening socket, as the kernel reports them. */
export interface BoundAddress {
  host: string
  port: number
}

let bound: BoundAddress | null = null

/**
 * Write down what this process bound, by asking the socket.
 *
 * ASKING THE SOCKET AND NOT THE CALLER. `listenForOtherMachines` in src/server/index.ts already
 * takes this line, and its own note says why: comparing against the port that was asked for would
 * agree with the request rather than with the machine, and port 0 — which a test may ask for — is
 * never the port that gets taken.
 *
 * @param server the HTTP server that has just started listening
 */
export function rememberWhatThisProcessBound(server: Server): void {
  const address = server.address()
  if (address === null || typeof address === 'string') return
  bound = { host: address.address, port: address.port }
}

/** What this process bound, or null when it has bound nothing. */
export function theAddressThisProcessAnswersOn(): BoundAddress | null {
  return bound
}

/** The port this process really bound, or null when it has bound none. */
export function theBoundPort(): number | null {
  return bound?.port ?? null
}

/** Forget it, for a test that has to reach the state of a process that has not listened. */
export function forgetWhatThisProcessBound(): void {
  bound = null
}

/**
 * The address as a person types it, from a host and a port.
 *
 * `::` and `0.0.0.0` mean "every address on this machine", which is not something anybody can put
 * in an address bar, so those are written as loopback — which is where a request to this process
 * arrives. Anything else is used as it was read, and an IPv6 address is bracketed because that is
 * how one goes in a URL.
 */
export function addressText(at: BoundAddress): string {
  const host =
    at.host === '::' || at.host === '0.0.0.0' || at.host === '' ? '127.0.0.1' : at.host
  const inUrl = host.includes(':') ? `[${host}]` : host
  return `http://${inUrl}:${String(at.port)}`
}
