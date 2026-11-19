// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `arrivalOf` was moved byte for byte out of src/server/lib/http.ts, with no change of behaviour.
 * `ARRIVED_FROM` was moved byte for byte out of src/server/lib/http.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { FastifyRequest } from 'fastify'
import type { Arrival } from '../server/lib/records.ts'

/**
 * WHICH MACHINE ASKED. Read from the listener that accepted the connection, never from a header.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS THE ONE FACT AUTHORITY IS ALLOWED TO READ
 * ---------------------------------------------------------------------------------------
 *
 * Every other thing a request says about itself is something the request said. A caller that sends
 * `x-mole-office-actor-type: human` is refused by nothing today, and that is correct for attribution —
 * the actor answers "did I write this, or did an agent?", not "who are you". It is not correct for a
 * question like *may this act be performed from where it was asked*, because the answer would be
 * whatever the asker typed.
 *
 * Which socket a connection arrived on is not something the caller can say. Mole Office listens on more
 * than one, each listener writes this symbol on the raw request before Fastify starts routing it,
 * and a caller has no way to reach that object. So this is a measurement, and it is the only one
 * available.
 *
 * ---------------------------------------------------------------------------------------
 * UNDEFINED IS A THIRD ANSWER AND IT IS NOT "THIS MACHINE"
 * ---------------------------------------------------------------------------------------
 *
 * An earlier version of this design read an unset symbol as `this machine` and called that the safe
 * direction. It is not safe in either direction, and the two sentences defending it contradicted
 * each other: it grants full authority to any request a listener failed to stamp, and the failure it
 * was defending against is *a remote request reads as local*.
 *
 * So undefined means the request came through neither listener. Today that is an in-process caller —
 * `app.inject()` in a test, or a migration — and those are not on a socket at all, which is how they
 * are told apart from a door nobody classified. `refuseAnUnclassifiedDoor` below is that test, and
 * it is the reason a third listener added later is refused rather than trusted.
 *
 * THE IN-PROCESS CALLER IS HANDLED BY NAME AND NOT BY A DEFAULT. That distinction is the whole of
 * this function's correctness and it is easy to lose: "it has no arrival, so call it local" and "it
 * has no socket, so no listener could have seen it" produce the same answer today and different
 * answers the day somebody adds a listener.
 */
export function arrivalOf(req: FastifyRequest): Arrival | undefined {
  // A REQUEST WITH NO `raw` IS UNCLASSIFIED, NOT A CRASH. Fastify always gives a real request one,
  // but the unit tests build the smallest object their subject reads, and several call `actorFrom`
  // with no `raw` at all — which is honest, because a test's fake request came through no listener.
  // Reading a symbol off `undefined` throws, and it threw eleven of them; `undefined` is the same
  // answer this function already gives an in-process caller, and it is the true one.
  const raw = req.raw as Partial<Record<typeof ARRIVED_FROM, Arrival>> | undefined
  return raw?.[ARRIVED_FROM]
}
/**
 * The key each listener writes on the raw request. A symbol, so nothing can collide with it.
 *
 * `Symbol.for` rather than `Symbol()` because the writer and the reader are in different modules and
 * this file is loaded dynamically: two `Symbol()` calls would be two different keys.
 */
export const ARRIVED_FROM = Symbol.for('mole-office.arrivedFrom')
