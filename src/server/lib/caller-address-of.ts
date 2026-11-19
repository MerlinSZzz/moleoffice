// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `callerAddressOf` was moved byte for byte out of src/server/lib/http.ts, with no change of behaviour.
 * `CLIENT_ADDRESS_HEADER` was moved byte for byte out of src/server/lib/http.ts, with no change of behaviour.
 * `whoTheSocketIs` was moved byte for byte out of src/server/lib/http.ts, with no change of behaviour.
 * `WHO_THE_SOCKET_IS` was moved byte for byte out of src/server/lib/http.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { FastifyRequest } from 'fastify'
import { headerValue } from './header-value.ts'
import { arrivalOf } from '@shared/arrival-of.ts'
import type { WhoTheSocketIs } from './http.ts'

/**
 * WHERE THE CALLER WAS, as well as Mole Office could establish it, or null because nothing said.
 *
 * ---------------------------------------------------------------------------------------
 * TWO SOURCES, ONE PER ARRIVAL, AND NEITHER IS A GUESS
 * ---------------------------------------------------------------------------------------
 *
 * From this machine, the socket address is the answer and it is a measurement: `req.ip` is the peer
 * on the connection and a caller cannot move it, because this server is built without `trustProxy`.
 *
 * From another machine, the socket address is useless — the proxy that carried the request is on
 * loopback, so every remote call would read `127.0.0.1` and a reader would file the owner's other
 * machine as this one. So the forwarded header is read instead, and its LAST value, because proxies
 * append and the last value is the one the nearest proxy wrote. It is told rather than measured, and
 * `GET /api/access` is where that marking is published — once, because it is a property of the
 * serving arrangement and identical for every remote call, not a fact about any one row.
 *
 * NULL IS AN ANSWER. A remote call carrying no usable forwarded value has nothing to store, and null
 * says exactly that. Filling it in with `req.ip` would write `127.0.0.1` and mean "this machine",
 * which is the one thing that is certainly false.
 *
 * NOTHING READS THIS YET. The recorder that will is the code that writes a row per call, and that
 * lands beside it. It is here rather than there because it reads the request's arrival
 * and the request's headers, which is this file's job and not the recorder's, and because a second
 * copy of the last-value rule would be the defect this repository keeps producing.
 *
 * AND SINCE THERE ARE TWO KINDS OF DOOR FOR ANOTHER MACHINE, THE DOOR SAYS WHICH RULE APPLIES.
 * The paragraph above is true of a door on 127.0.0.1 that a private network daemon passes requests
 * through, and false of a door bound to the address other machines reach this computer at: nothing
 * stands between that one and the caller, so `req.ip` IS the caller and there is no forwarded header
 * to read. `whoTheSocketIs` is the listener's own answer to that, written beside the arrival, and it
 * is a measurement for the same reason the arrival is — the caller cannot reach it.
 */
export function callerAddressOf(req: FastifyRequest): string | null {
  if (arrivalOf(req) !== 'another machine') return req.ip ?? null
  if (whoTheSocketIs(req) === 'the caller') return req.ip ?? null
  const forwarded = headerValue(req, CLIENT_ADDRESS_HEADER)
  if (forwarded === undefined) return null
  // Proxies append, so the nearest one wrote the last value. A single-value header answers the same
  // way, which is why there is no branch for it.
  const last = forwarded.split(',').pop()?.trim()
  return last === undefined || last === '' ? null : last
}
/**
 * WHERE THE CALLER WAS, when the caller was not on this machine. The one header a client writes
 * that Mole Office reads and does not own.
 *
 * `X-Forwarded-For` is written by whatever proxied the request — for Mole Office that is `tailscaled`,
 * and proxies APPEND, so the LAST value is the one the nearest proxy wrote. `callerAddressOf` below
 * reads it, and reads it only for a request that arrived on the listener for other machines.
 *
 * IT IS NOT ON `READ_HEADER_NAMES`, and that is a decision rather than an oversight. That list
 * exists for one job: to stop a near-miss spelling of a Mole Office header being silently ignored. A
 * near-miss of this one cannot be silently ignored into damage — nothing is attributed to it,
 * nothing is filed under it, and no authority reads it. Putting it on the list would also make
 * `refuseMisspeltActorHeaders` name a header that is nobody's to send, in a sentence whose whole
 * subject is identity.
 *
 * AUTHORITY NEVER READS THIS. A caller can write whatever it likes here and change nothing it is
 * allowed to do. The worst a forged value can do is put the wrong one of the owner's own machines
 * in an audit line, and that is said out loud rather than left to be discovered.
 */
export const CLIENT_ADDRESS_HEADER = 'x-forwarded-for'
/**
 * Whose address this request's socket carries, or undefined because it came through no listener.
 *
 * Undefined is the same third answer `arrivalOf` gives and it means the same thing: an in-process
 * caller, which has no socket for anybody's address to be on.
 */
export function whoTheSocketIs(req: FastifyRequest): WhoTheSocketIs | undefined {
  const raw = req.raw as Partial<Record<typeof WHO_THE_SOCKET_IS, WhoTheSocketIs>> | undefined
  return raw?.[WHO_THE_SOCKET_IS]
}
/**
 * The second thing a listener writes on a raw request: whether the address at the other end of the
 * socket is the caller, or something on this computer standing in for them.
 *
 * Its own symbol rather than a field on the arrival, because it answers a different question and
 * only one reader wants it. `arrivalOf` answers *may this act be asked from here*, which is
 * authority; this answers *whose address is `req.ip`*, which is a reading.
 */
export const WHO_THE_SOCKET_IS = Symbol.for('mole-office.whoTheSocketIs')
