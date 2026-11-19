// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TELL AN AGENT WHEN ITS WRITE NAMES NO RUN. Problem J1oPHDg-jWeY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The change log is the only place that names the run behind a change: criterion T2 by method C
 * (lib/spent-on-this.ts) sums the runs a record's change log names. A write sent with an agent's
 * actor headers and no x-mole-office-session is answered as usual and stores its change rows with
 * no session, so that run's spend is counted as changes that name no run. Measured on 13 September
 * 2026: 119 of the most recent 1000 changes were such rows, by 11 real agent handles. Nothing told
 * the writer.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES, AND WHAT IT DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * A successful write whose caller was read as an agent, with no session, gets one more header on
 * its answer: `x-mole-office-names-no-run`, carrying the sentence below. The write itself is
 * answered and stored exactly as before.
 *
 * IT DOES NOT REFUSE. The session header is optional by rule (`refusePartialIdentity` in
 * lib/http.ts, decision 10), and the office's own parts rightly carry no run.
 *
 * THE OFFICE'S OWN KEY GETS NO NOTICE. A request its key proved is the office's own program (the
 * message worker, the office's own tools), and those carry no run by design, so a notice there
 * would be a sentence about nothing.
 *
 * NO NAME IS IN THE SENTENCE. A header value must be plain bytes, and an agent's handle may hold
 * any character, so the sentence names the header to send and nothing the caller sent.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { resolvedActorOf, theOperationThisRouteDeclared } from './http.ts'
import { ACTOR_HEADERS } from '@shared/request-headers.ts'

/** The header the notice rides on. */
export const NAMES_NO_RUN_HEADER = 'x-mole-office-names-no-run'

/** The notice. True on every path that sets it: the caller was read as an agent and sent no session. */
export const NAMES_NO_RUN_NOTICE =
  `This write was read as an agent's and carried no ${ACTOR_HEADERS.session} header, so any change it made ` +
  `names no run, and a record's spend counts it as a change that names no run. A run sends its own session ` +
  `record's id in ${ACTOR_HEADERS.session} on every request.`

/**
 * WHETHER THIS ANSWERED REQUEST GETS THE NOTICE. Exported so a test can ask it of one request.
 *
 * All five must hold: the route declared a write; the answer is a success; somebody on the request's
 * path resolved who was calling; that caller is an agent with no session; and no office key proved it.
 */
export function aWriteNamesNoRun(req: FastifyRequest, reply: FastifyReply): boolean {
  if (theOperationThisRouteDeclared(req)?.effect !== 'write') return false
  if (reply.statusCode < 200 || reply.statusCode >= 300) return false
  const actor = resolvedActorOf(req)
  if (actor === undefined || actor.type !== 'agent') return false
  if (actor.sessionId !== null && actor.sessionId !== undefined) return false
  return actor.provedBy !== 'the-office-key'
}

/**
 * ADD THE NOTICE ON EVERY WRITE THAT NAMES NO RUN. Registered in `buildApp` above every route group,
 * because an `onSend` hook does not run for routes registered before it.
 */
export function sayWhenAWriteNamesNoRun(app: FastifyInstance): void {
  app.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    if (aWriteNamesNoRun(req, reply)) reply.header(NAMES_NO_RUN_HEADER, NAMES_NO_RUN_NOTICE)
    return payload
  })
}
