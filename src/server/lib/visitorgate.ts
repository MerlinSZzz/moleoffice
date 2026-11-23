// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A REQUEST CARRYING A VISITOR'S CREDENTIAL MEETS: the token, the facts, and the standing.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DECIDES
 * ---------------------------------------------------------------------------------------
 *
 * One thing, on every request that sends `x-mole-office-credential`: whether the credential it names
 * may work right now, and what to write down about the request either way. Criteria P25, P27 and P29
 * of design/permissions/ACCEPTANCE.md.
 *
 *   P25. A pending visitor cannot work. Every request under a pending credential is refused, and
 *        nothing it sent is stored under its handle.
 *   P27. A request whose token matches and whose facts do not is recorded as a mismatch and shown.
 *   P29. The person ends a credential in one press, and the ended credential's requests are refused.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A HOOK AND NOT A CHECK INSIDE EACH HANDLER
 * ---------------------------------------------------------------------------------------
 *
 * The same shape `refuseAnActFromAnotherMachine` and `refuseAnActThisRoleMayNotPerform` have, above
 * every route group, for the same reason: a check written into handlers is a check somebody forgets
 * in one handler, and the failure is silent in the worst direction. P25's words are *every request*,
 * which a per-handler check cannot honestly claim.
 *
 * IT RUNS ON `onRequest`, so a refusal happens before any handler starts. P25 says *nothing it sent
 * is stored under its handle*, and a refusal after the write would be a refusal that had already
 * happened — the argument lib/reach.ts makes at greater length.
 *
 * ---------------------------------------------------------------------------------------
 * A REQUEST WITH NO CREDENTIAL IS NOT A VISITOR AND MEETS NOTHING HERE
 * ---------------------------------------------------------------------------------------
 *
 * Every caller this product has today sends no such header, and this file leaves them exactly as
 * they were. A credential is something a caller CARRIES, not something the office works out about
 * it: a gate that decided a caller was a visitor from its address would refuse the owner's own
 * browser the day they opened Mole Office from their other machine.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A MISMATCH DOES, AND WHY IT IS ONE NAMED FUNCTION
 * ---------------------------------------------------------------------------------------
 *
 * The facts half of Q2 is answered by a decision: the mismatch is recorded, counted,
 * shown at the Embassy, and reported to the agent's superior; it does not refuse the request.
 * Whether a request from a machine the office does not trust is refused is still open (proposal
 * b0CW38puqgff). whatAMismatchDoesToTheRequest keeps the facts rule in one named function, so a
 * later decision changes one place rather than requiring a hunt through the hook.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { operationNamed, theActAGateAsksAbout } from '@shared/ops.ts'
import {
  actRefusedToVisitorsRefusal,
  endedRefusal,
  expiredRefusal,
  noSuchCredentialRefusal,
  pendingRefusal,
  type FactMismatch,
  type RunFacts,
  type VisitorCredential,
} from '@shared/visitors.ts'
import { CONVERSATION_HEADER, CREDENTIAL_HEADER, START_DIRECTORY_HEADER } from '../../config/visitor-headers.mjs'

import { headerValue } from './header-value.ts'
import { PanelError } from './panel-error.ts'
import { credentialForToken, hasRunOut, mismatchOn, recordARequestUnder } from './visitors.ts'
// THE MACHINES THIS OFFICE TRUSTS, criterion P73, and where a request says it came from.
import { thisOfficeTrusts } from './trustedmachines.ts'
import { writtenFrom } from './machines.ts'
import { tellTheSuperiorAboutACredentialMismatch } from './credential-mismatch.ts'
import { workspaceOf } from './workspaces.ts'

/** The token this request carries, or null because it carries none and is an ordinary caller. */
export function credentialTokenOn(req: FastifyRequest): string | null {
  const said = headerValue(req, CREDENTIAL_HEADER)
  if (said === undefined) return null
  const trimmed = said.trim()
  // BLANK IS NOT ABSENCE HERE. Every other header in ./http.ts reads blank as "nobody said", and for
  // a credential that would let a caller send an empty header and be treated as having sent none —
  // which is the same request with the check skipped. It is refused instead, below.
  return trimmed === '' ? '' : trimmed
}

/** The facts this request sent, as far as it sent any. Absent and blank are both "did not say". */
export function factsOn(req: FastifyRequest): Partial<RunFacts> {
  const conversation = (headerValue(req, CONVERSATION_HEADER) ?? '').trim()
  const directory = (headerValue(req, START_DIRECTORY_HEADER) ?? '').trim()
  return {
    conversationPath: conversation === '' ? null : conversation,
    startDirectory: directory === '' ? null : directory,
  }
}

/**
 * WHAT A MISMATCH DOES TO THE REQUEST IT WAS FOUND ON. The facts half of Q2 is answered by a
 * decision: it does not refuse the request. The caller records and counts it, and
 * tells the agent's superior once per different mismatch. WHAT_A_MISMATCH_DOES_TODAY in
 * src/shared/visitors.ts says the same on the credential's page, so silence is never read as a
 * decision. Whether a request from a machine the office does not trust is refused is still open
 * (proposal b0CW38puqgff). Keeping this rule in one function makes a later decision one edit.
 */
export function whatAMismatchDoesToTheRequest(_mismatch: readonly FactMismatch[]): string | null {
  return null
}

/**
 * WHETHER THIS REQUEST CAME FROM A MACHINE THIS OFFICE TRUSTS. Criterion P73.
 *
 * THREE ANSWERS AND NOT TWO. `null` is the answer for a request nobody could put a machine to,
 * which is every request that arrived on the loopback door: the peer address of a local call is a
 * loopback address and names no machine at all. `not trusted` and `nobody could tell` lead a reader
 * to do different things, so they are not folded into one false `false`.
 *
 * IT ASKS THE ONE LIST. Before criterion P73 nothing in this file asked about a machine: a
 * credential's own machine is recorded and deliberately never compared, and the note in
 * @shared/visitors.ts says why. This is not that comparison — it is the office's own list, set by
 * the person's presses, and it decides nothing here.
 */
function cameFromATrustedMachine(req: FastifyRequest): boolean | null {
  const from = writtenFrom(req)
  if (from.machine === null) return null
  // A CALL FROM THIS MACHINE IS FROM THIS MACHINE, and this office is not a machine it lists. The
  // question is about the machines it lets IN, so a local call has no answer here rather than a
  // false one.
  if (from.how === 'this machine') return null
  return thisOfficeTrusts(from.machine)
}

/** The act this route declared, or null for a route that declared none — one outside `/api`. */
function operationOf(req: FastifyRequest): string | null {
  const config: unknown = req.routeOptions?.config
  if (typeof config !== 'object' || config === null) return null
  const said = (config as { operation?: unknown }).operation
  return typeof said === 'string' ? said : null
}

/**
 * WHETHER THIS ACT WRITES, read off the operation's own declaration.
 *
 * NEVER GUESSED FROM THE VERB. `POST /api/office/embassy` does not exist, but plenty of reads in
 * this product are POSTs — resolving a recipient, asking what a fold would contain — and a count of
 * "what this visitor has written" built by looking for POST would count those. Criterion P26 asks
 * the Embassy for that number, and a supervision number nobody can trust is worse than none.
 *
 * A ROUTE WHOSE OPERATION IS UNKNOWN IS NOT COUNTED AS A WRITE. That is the honest direction: the
 * only routes with no operation are ones outside `/api`, which write nothing.
 */
function thisActWrites(operation: string | null): boolean {
  if (operation === null) return false
  return operationNamed(operation)?.effect === 'write'
}

/**
 * Check the credential this request carries, write the request down, and refuse where it may not
 * work.
 *
 * FIVE CLAUSES, IN ORDER, and the order is the design:
 *
 *   1. **No header?** An ordinary caller. Nothing here applies and nothing is written.
 *   2. **A token nothing matches?** Refused, and nothing is written: there is no credential to write
 *      it against, and a table of requests under credentials that do not exist would be a table
 *      nobody could read.
 *   3. **Do the facts match?** Worked out before the standing, because a mismatch is recorded on a
 *      refused request too — a pending or ended credential being used from the wrong directory is
 *      exactly the thing the person must be able to see.
 *   4. **May it work?** Pending, ended, or run out: each is refused with its own sentence, naming the
 *      credential, and the request is written down as refused.
 *      So is a working credential asking for an act no visitor may ask for, with that act's own sentence.
 *   5. **Otherwise** the request is written down as answered and goes on.
 */
export function checkTheCredentialOn(req: FastifyRequest, reply: FastifyReply): void {
  // Clause 1.
  const token = credentialTokenOn(req)
  if (token === null) return

  // Clause 2. A blank header lands here too, and is told the same thing: nothing matched it.
  const credential = token === '' ? null : credentialForToken(token)
  if (credential === null) {
    reply.code(403)
    throw new PanelError(noSuchCredentialRefusal(), 403)
  }

  // Clause 3.
  const mismatch = mismatchOn(credential, factsOn(req))

  // Clause 4.
  const operation = operationOf(req)
  const refusal =
    whyThisCredentialMayNotWork(credential) ??
    whyAVisitorMayNotAskThis(credential, operation) ??
    whatAMismatchDoesToTheRequest(mismatch)

  // Clause 5. Written down either way, because trusted visitors are counted and supervised: the person sees the refused attempts as
  // well as the answered ones.
  recordARequestUnder(credential.id, {
    method: req.method,
    route: req.routeOptions?.url ?? req.url,
    operation,
    // AND WHETHER THIS REQUEST CAME FROM A MACHINE THE OFFICE TRUSTS. Criterion P73, and the one
    // place in the request path that asks the trusted list. It REFUSES NOTHING: whether a request
    // from a machine the office does not trust is refused or only marked is question Q2 of
    // design/permissions/ACCEPTANCE.md section 6, and that answer is the owner's. Marking leaves both of
    // the answers open; a refusal built now would have to be unbuilt for one of them.
    fromATrustedMachine: cameFromATrustedMachine(req),
    // A REFUSED REQUEST WROTE NOTHING, whatever act it was asking for. Counting it as a write would
    // put a number on the Embassy that says a visitor changed something it never reached.
    wrote: refusal === null && thisActWrites(operation),
    refusedBecause: refusal,
    mismatch,
  })
  if (mismatch.length > 0) {
    tellTheSuperiorAboutACredentialMismatch(credential, mismatch, refusal, workspaceOf(req))
  }

  if (refusal !== null) {
    reply.code(403)
    throw new PanelError(refusal, 403)
  }
}

/**
 * WHY THIS CREDENTIAL MAY NOT WORK RIGHT NOW, in one sentence, or null because it may.
 *
 * Exported so a route can ask the same question the hook asks, and get the same answer from the same
 * three clauses. Two copies of "may this credential work" is the ninth invariant broken in the one
 * place where drifting apart would mean a refused visitor being served.
 */
export function whyThisCredentialMayNotWork(credential: VisitorCredential): string | null {
  if (credential.standing === 'ended') return endedRefusal(credential)
  if (credential.standing === 'pending') return pendingRefusal(credential)
  // THE MOMENT IS ASKED OF THE CLOCK, and it is asked last: a credential the person ended before it ran out
  // should say they ended it, which is the fact they acted on, rather than that its month was up.
  if (hasRunOut(credential)) return expiredRefusal(credential)
  return null
}

/**
 * WHY A VISITOR MAY NOT ASK FOR THIS ACT, in one sentence, or null because it may.
 *
 * Read off the act's own `refusedToVisitors` mark in src/shared/ops.ts, through the act a gate asks about, so a
 * check of an act is refused wherever the act is. A route that declared no act is not refused here.
 */
function whyAVisitorMayNotAskThis(credential: VisitorCredential, operation: string | null): string | null {
  if (operation === null) return null
  const act = theActAGateAsksAbout(operation)
  if (act?.refusedToVisitors === undefined) return null
  return actRefusedToVisitorsRefusal(credential, act.refusedToVisitors)
}

/**
 * Install the check above every route group, so every `/api` route inherits it.
 *
 * A hook registered after a route group does not run for that group's routes, and the failure is
 * silent in the worst direction: those routes would answer a pending visitor. `refuseActsKeptOnThisMachine`
 * and `refuseActsARoleMayNotPerform` are placed for the same rule, a few lines above this one in
 * `buildApp`.
 */
export function checkVisitorCredentials(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    checkTheCredentialOn(req, reply)
  })
}
