// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `GET /api/access` — WHO MAY REACH MOLE OFFICE, AND FROM WHERE. TODAY THE ANSWER IS: ONLY THIS MACHINE.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS BUILT BEFORE THE THING IT DESCRIBES, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/index.ts` binds `127.0.0.1` and the comment above that line says why: *"this holds a
 * research diary; it has no login, so it must not be reachable from the network."* Nothing in wave
 * 14 changes that. The second listener is wave 15's, and it does not exist.
 *
 * So this route answers `remoteAccess: 'off'` and the Settings panel draws *off*, and both are
 * PHOTOGRAPHED BEFORE EITHER IS EVER TRUE. A panel first drawn on the day the feature arrives has
 * never been seen saying no, and *off* is the state every installation of Mole Office is in and will
 * stay in unless somebody deliberately changes it. It is the ordinary case, not the edge.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO OBJECTS, AND WHY THEY ARE TWO
 * ---------------------------------------------------------------------------------------
 *
 * `remote-access.md` §8.5 asks for two, because two surfaces ask two different questions and one
 * reader answers both so they cannot disagree.
 *
 *   `caller`  — what THIS request may do. Per request, never cached. The browser reads it to decide
 *               whether to draw a control at all, rather than drawing one and then refusing it.
 *   `machine` — the state of remote access on this machine. One answer for every caller.
 *
 * ---------------------------------------------------------------------------------------
 * `refusedHere` IS COMPUTED FROM THE ROUTE DECLARATIONS, NEVER TYPED
 * ---------------------------------------------------------------------------------------
 *
 * §8.5: *"The previous version of this design said the route declarations and the guard registry
 * without naming a registry that existed — so the governance half would have been a hand-typed
 * array with a green test in front of it."* The half built here is the half that is derivable
 * today: every route declaring `reach: 'local'` contributes its operation name. The list is read
 * off the registered routes at request time, so a route that changes its reach changes this answer
 * with nothing to keep in step.
 *
 * THE GUARD HALF IS NOT HERE AND IS NOT PRETENDED. `settings-and-governance.md` §8.4's guard
 * registry contributes the acts reserved to the owner, and joining it is wave 15's step 2. Until
 * then this list is SHORTER than the twelve §6.7 enumerates, and a short list is the true state of
 * the product rather than a wrong one. `governanceHalfJoined: false` says so on the wire, so a
 * reader does not have to know that to read the answer.
 *
 * ---------------------------------------------------------------------------------------
 * IT WRITES NOTHING AND OPENS NO DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * Two in-memory facts: which listeners exist, and what the routes declared. No table, no socket, no
 * process. `reach: 'remote'` because reading this is the first thing a remote client would need to
 * do and refusing it would leave a client unable to learn what it may not do.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ApiRoute } from './kinds.ts'
import { arrivalOf } from '@shared/arrival-of.ts'
// THE SAME READING THE HOOK MAKES, so the person's list and the rule are one (invariant 9).
import { theRequestMayActAsThePersonFromThere } from '../lib/reach.ts'
import { readAccess, type AccessReply } from '../lib/access.ts'
import { GOVERNANCE_GUARDS } from '../lib/records.ts'
// WHAT THE CALLER'S ROLE REFUSES, from the same reading the hook that enforces it uses.
import { theRoleOfTheCaller } from '../lib/rolegate.ts'
import { theRoleCards, theRoleCardsAreRead } from '../lib/roles.ts'
import { actsRefusedTo } from '@shared/roles.ts'
import { addressForOtherMachines } from '../lib/runtime.ts'
import { settings } from '../../config/settings.mjs'
import { clientsFromOtherMachines, refusalsFromOtherMachines } from '../lib/usage-reads.ts'
// THE MACHINES THIS OFFICE TRUSTS, criterion P73. One list, read here and on the world's page.
import { machinesTrustedHere } from '../lib/trustedmachines.ts'
import { route } from '../lib/route.ts'

const ACCESS_NOTE =
  'Whether other machines can reach this Mole Office, how this one is exposed, and which machines have ' +
  'been seen. Writes nothing. It answers "off" unless MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES names an ' +
  'address this server bound, or MOLE_OFFICE_REMOTE_PORT opens a second listener; with neither, ' +
  'Mole Office listens on 127.0.0.1 only and nothing but this computer can open it. `machine.trusts` is the ' +
  'machines this office TRUSTS, which is a different fact from `machine.machines`, the ones that ' +
  'have CALLED. The list is set on the world\'s page and this route reads it rather than holding a second copy.'

export interface AccessOptions {
  /** The same closure GET /api uses, so the two read one registration rather than two. */
  listRoutes: () => ApiRoute[]
  /**
   * The port the second listener actually bound, or null because there is no second listener.
   *
   * WHAT WAS BOUND, NEVER WHAT WAS CONFIGURED. `start()` passes this only after
   * `listenForOtherMachines` has come up and checked its own address, so a port set in `.env` that
   * failed to bind is reported as `off` rather than as `listening`. A panel that read the setting
   * would say On over a listener that is not there.
   */
  remotePort: number | null
  /** Whether this process serves the browser app itself. §11.3's fourth state turns on it. */
  production: boolean
}

/**
 * The caller's role and the acts it is refused, or null because no role narrows this request.
 *
 * ONE READING, TWO CALLERS. `refuseAnActThisRoleMayNotPerform` uses `theRoleOfTheCaller` to decide
 * whether to refuse, and this uses it to say what would be refused. That is what makes the published
 * answer and the enforced rule the same thing rather than two lists.
 */
function theRoleThisRequestIsMadeUnder(req: FastifyRequest): { role: string; refused: ReadonlyMap<string, string> } | null {
  if (!theRoleCardsAreRead()) return null
  const mine = theRoleOfTheCaller(req)
  if (mine === null) return null
  return { role: mine.role, refused: actsRefusedTo(theRoleCards(), mine.role) }
}

export async function accessRoutes(app: FastifyInstance, options: AccessOptions): Promise<void> {
  app.get('/access', route('machine.access', 'remote', ACCESS_NOTE), async (req: FastifyRequest): Promise<AccessReply> => {
    // THE REGISTRY IS PASSED IN, not imported by the reading. lib/access.ts stays a pure function
    // of what it is given — a test can hand it any route table and any registry with no database
    // open — and this route is the one place that knows where the real registry lives.
    return readAccess({
      routes: options.listRoutes(),
      guards: GOVERNANCE_GUARDS,
      // AND WHAT THIS CALLER'S ROLE TAKES OFF IT, criterion P3, read from the same declaration the
      // refusal reads. Null for a person and for a caller no registry holds; neither is narrowed.
      role: theRoleThisRequestIsMadeUnder(req),
      // WHICH DOOR, from the listener that accepted the connection. The address below is still
      // reported, because Developer mode asks where this request arrived and that is a fact worth
      // having — but it is not what decides whether the caller is somewhere else. Both listeners
      // are on loopback, so an address cannot tell them apart. lib/access.ts records what that cost.
      arrival: arrivalOf(req),
      address: req.socket.localAddress ?? null,
      remotePort: options.remotePort,
      // THE OTHER WAY IN, and the same reading the Runtime page draws rather than a second one.
      // Reading `MOLE_OFFICE_REMOTE_PORT` alone is what made this route say "off" over a live
      // tailnet address on the owner's own machine (problem XLES-b1vFBla).
      forOtherMachines: addressForOtherMachines(settings()),
      // WHO HAS ACTUALLY CALLED, and what they were refused, out of the call log the Runtime page
      // lists from. Both are reads: nothing is stored to answer this route.
      machines: clientsFromOtherMachines(),
      // AND WHO IT TRUSTS, criterion P73. The list is the one place that answer lives, so this route
      // and the world's page cannot come to name different machines.
      trusts: machinesTrustedHere(),
      refusals: refusalsFromOtherMachines(),
      production: options.production,
      // THE PERSON'S OWN SETTINGS ARE NOT REFUSED TO THEM from their other computer, so their
      // list leaves them off, read by the very function the hook in lib/reach.ts asks: an encrypted door and their key itself.
      thePersonMayAskFromThere: theRequestMayActAsThePersonFromThere(req),
    })
  })
}
