// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ACTS KEPT ON THIS MACHINE, REFUSED TO A REQUEST THAT CAME FROM ANOTHER ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DECIDES, AND IT IS ONE THING
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/reach.ts` is the word a route declares. `src/server/api/kinds.ts` is what refuses to
 * register a route that declared nothing. This is the third piece and it is the only one that
 * refuses a REQUEST: given which door a request came through and what the route it matched
 * declared, either the request goes on or it is answered 403 and no handler runs.
 *
 * `design/round-ten/design/remote-access.md` §6.5 calls this *place one* of two, and the split is
 * not the obvious one. This hook refuses the acts that work on this machine AND the two acts the
 * product reserves to the owner that no guard reaches — committing a planning intent and applying a
 * planning proposal, both measured in §6.7 as having no clause in any of the four guards. The other
 * four owner-reserved acts are refused by their own guards in lib/records.ts, which is place two,
 * because a guard sees things a route cannot: whether the record being deleted is an unsettled
 * proposal, whether the link being written settles a fork.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT REFUSES BEFORE THE HANDLER AND NOT INSIDE IT
 * ---------------------------------------------------------------------------------------
 *
 * `POST /api/import` replaces every authored table. `POST /api/resources/:id/release` sends a signal
 * to a process group. A refusal that ran after the handler had started would be a refusal that had
 * already happened. `onRequest` is the earliest hook Fastify has that knows which route matched, so
 * it is where this goes.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * It does not read the actor, the body, the workspace or the record. Being at another machine is a
 * PERMISSION and not a demotion: an ordinary write from another machine goes through and is still
 * attributed to the person who made it, because they made it. Nothing here changes what a write is
 * attributed to, what a reader is told, or which `audience` anything is drawn for.
 *
 * It also decides nothing about a request that matched no route. That falls through to the ordinary
 * 404, which is correct — an endpoint that does not exist is not a permission question.
 */

import { BlockList } from 'node:net'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { isReach, type Reach } from '@shared/reach.ts'
import type { KeptHere } from '@shared/authority.ts'
import { PanelError } from './panel-error.ts'
import { refusalFromAnotherMachine } from './authority.ts'
import { actorFrom, type WhoTheSocketIs } from './http.ts'
import { arrivalOf } from '@shared/arrival-of.ts'
import { callerAddressOf, whoTheSocketIs } from './caller-address-of.ts'

/**
 * What a route declared about which machines may ask for it, or undefined because it matched none.
 *
 * READ OFF THE ROUTE FASTIFY ACTUALLY MATCHED, never off a list. `req.routeOptions.config` is the
 * same object `trackApiRoutes` collected at registration, so this cannot disagree with what
 * `GET /api/access` publishes: they are the one declaration, read twice.
 *
 * UNDEFINED IS NOT `remote`. It means no route matched — a 404 on its way — and the caller of this
 * function says what to do about that rather than this function guessing. A `local` route that
 * somehow lost its declaration cannot reach here: `reachOn` in api/kinds.ts refuses to register it
 * and the server does not start.
 */
export function reachOf(config: unknown): Reach | undefined {
  const declared: unknown =
    typeof config === 'object' && config !== null && 'reach' in config
      ? (config as { reach: unknown }).reach
      : undefined
  return isReach(declared) ? declared : undefined
}

/**
 * What a route said about being kept here — why, and what the act is — or undefined when it is not a
 * `local` route.
 *
 * Both halves come off the one declaration, because a refusal needs both: the reason decides the
 * clause in the middle of the sentence and the act starts it. `refusalOn` in api/kinds.ts refuses to
 * register a `local` route without them, so a `local` route reaching here has both.
 */
export function keptHereBy(config: unknown): KeptHere | undefined {
  const declared: unknown =
    typeof config === 'object' && config !== null && 'keptHere' in config
      ? (config as { keptHere: unknown }).keptHere
      : undefined
  if (typeof declared !== 'object' || declared === null) return undefined
  const { because, act, thePersonMayFromAnotherComputer } = declared as { because?: unknown; act?: unknown; thePersonMayFromAnotherComputer?: unknown }
  if (typeof because !== 'string' || typeof act !== 'string') return undefined
  return { because, act, ...(thePersonMayFromAnotherComputer === true ? { thePersonMayFromAnotherComputer: true } : {}) } as KeptHere
}

/**
 * THE ACT THIS DOOR DECLARED BESIDE ITSELF, read off the route Fastify matched. A check in a handler names the act by
 * the route's own declaration, so the two cannot say different things.
 */
export function theActKeptHere(req: FastifyRequest): string {
  const kept = keptHereBy(req.routeOptions?.config)
  if (kept === undefined) {
    throw new PanelError(
      `${req.method} ${req.routeOptions?.url ?? req.url} is not kept on this computer, so it has no act to name. ` +
        'Nothing was done. This is a fault in Mole Office, not in your request.',
      500,
    )
  }
  return kept.act
}

/**
 * THE PRIVATE NETWORK'S OWN ADDRESSES: 100.64.0.0/10, and fd7a:115c:a1e0::/48 for IPv6. A door bound on one of them
 * is reached only through that network, which encrypts everything it carries end to end.
 */
const THE_PRIVATE_NETWORK = new BlockList()
THE_PRIVATE_NETWORK.addSubnet('100.64.0.0', 10, 'ipv4')
THE_PRIVATE_NETWORK.addSubnet('fd7a:115c:a1e0::', 48, 'ipv6')

/**
 * WHETHER A DOOR FOR ANOTHER COMPUTER IS AN ENCRYPTED ONE: the last safeguard of a decision,
 * because a login typed on the person's other computer must not cross a network as it was typed. Two kinds of door are,
 * and nothing else:
 *
 *   - the private network's own proxy on this computer (`a proxy on this computer`). It takes the request over its
 *     encrypted tunnel, and over HTTPS from the browser, and hands it on over loopback;
 *   - a door bound on the private network's own address (THE_PRIVATE_NETWORK above).
 *
 * A door bound on any other address, a home or lab network's, carries a request as it was sent, so a login set through
 * it could be read on the way. Such a door still answers everything else it answered before.
 */
export function anEncryptedDoor(socketCarries: WhoTheSocketIs | undefined, localAddress: string | undefined): boolean {
  if (socketCarries === 'a proxy on this computer') return true
  if (socketCarries !== 'the caller' || localAddress === undefined) return false
  // An IPv4 address a dual-stack socket reports in its IPv6 form, ::ffff:192.0.2.10, is the IPv4 one.
  const address = localAddress.startsWith('::ffff:') ? localAddress.slice('::ffff:'.length) : localAddress
  return THE_PRIVATE_NETWORK.check(address, address.includes(':') ? 'ipv6' : 'ipv4')
}

/**
 * WHETHER THIS REQUEST MAY ACT AS THE PERSON FROM THEIR OTHER COMPUTER: it came over an encrypted door (`anEncryptedDoor`),
 * and it carries the person's own key, which from another computer is a paired device's key (`provedBy` is
 * `the-person-key`). A decision says a proved person on a paired device.
 *
 * THE KEY ITSELF, NEVER THE WINDOW. `thePersonIsProved` also counts a keyless claim to be the person from a trusted machine
 * while the one-version window is open, and the first version of this asked it: the inspector's refusal of run
 * TO24fVURElIR measured a bare header naming a human and the owner's id, with no key, from a trusted address through the second
 * listener, answered 200 on setting the person's office keys and the sandboxes' logins. A widening for the person must not
 * widen for whoever at a trusted machine types the person's name.
 *
 * ONE READING FOR THE HOOK AND FOR GET /api/access, so the person's list and the rule cannot come to disagree (invariant 9).
 *
 * IT NEVER THROWS. A request whose actor cannot be read (an agent no registry holds, a malformed claim) is not the
 * person, so it meets the ordinary refusal rather than a refusal about its headers that the door would never have
 * given it. The actor is read here, which this hook otherwise never does, because this is the one clause that widens
 * a door rather than closing one.
 */
export function theRequestMayActAsThePersonFromThere(req: FastifyRequest): boolean {
  if (!anEncryptedDoor(whoTheSocketIs(req), req.socket?.localAddress)) return false
  try {
    return actorFrom(req, { whoOnly: true }).provedBy === 'the-person-key'
  } catch {
    return false
  }
}

/**
 * THE PERSON MAY ASK FOR A DOOR THAT SAYS SO FROM THEIR OTHER COMPUTER: the door declares `thePersonMayFromAnotherComputer`
 * (the person's settings doors and the doors of the person's own decisions; the list is on `thePersonMayFromAnotherComputer`
 * in shared/authority.ts), and the request
 * may act as the person from there (`theRequestMayActAsThePersonFromThere`). Two decisions say
 * so. Each door still asks for the person itself, as it
 * did on this computer.
 */
export function thePersonMayAskFromThere(req: FastifyRequest, kept: KeptHere): boolean {
  if (kept.thePersonMayFromAnotherComputer !== true) return false
  return theRequestMayActAsThePersonFromThere(req)
}

/**
 * REFUSE AN ACT KEPT ON THIS MACHINE WHEN IT WAS ASKED FROM ANOTHER ONE. FOUR CLAUSES, IN ORDER.
 *
 * Each clause answers a different question, and the order is the design rather than a preference:
 *
 *   1. **Which door was this?** Undefined arrival with no socket is an in-process caller — a
 *      migration, `app.inject()` in a test — and it passes, because no listener could have seen it.
 *      Undefined arrival WITH a socket is a door nobody classified, and that is refused 500 by
 *      `refuseAnUnclassifiedDoor`, which is installed above this hook in `buildApp` and is where
 *      that clause lives. It is named here because the four clauses are one rule read in one order,
 *      and a reader looking for the first one should find out where it is rather than conclude it
 *      is missing.
 *   2. **From this machine?** Then nothing is refused for where it came from, and this hook is done.
 *      Every `reach: 'local'` route exists precisely to be called from here.
 *   3. **What did the route say?** Anything that is not `local` — `remote`, or no route matched at
 *      all — goes on. A 404 is not a permission question.
 *   4. **Refuse**, in the one shape, saying what was refused, that nothing was done, where it can be
 *      done, and which machine asked when Mole Office could tell.
 *
 * THE ACT IS NAMED BY ITS OPERATION AND NOT BY ITS URL, because §6.9 asks for a sentence about the
 * act. `req.routeOptions.config.operation` is the same key telemetry stamps and `GET /api/access`
 * publishes, so a person who reads the refusal and then reads the Settings panel meets one word.
 */
export function refuseAnActFromAnotherMachine(req: FastifyRequest, reply: FastifyReply): void {
  const arrival = arrivalOf(req)
  // Clause 1 is refuseAnUnclassifiedDoor, above this hook. Here, undefined means an in-process
  // caller on no socket, and the rule does not apply to it — the same shape `Actor.from` has.
  if (arrival === undefined) return
  // Clause 2.
  if (arrival === 'this machine') return
  const config: unknown = req.routeOptions?.config
  // Clause 3.
  if (reachOf(config) !== 'local') return

  // Clause 4. A `local` route always declared both halves — the registration guard refuses one that
  // did not, and the server does not start — so this is a total read rather than a default.
  const kept = keptHereBy(config)
  if (kept === undefined) {
    throw new PanelError(
      `${req.method} ${req.routeOptions?.url ?? req.url} is kept on this machine and says neither why nor what ` +
        'the act is, so Mole Office cannot write the refusal. Nothing was done. This is a fault in Mole Office, not in ' +
        'your request.',
      500,
    )
  }
  // THE ONE WIDENING: the person's own key, from another computer, at a door that declares it: the person's settings
  // and decisions and the doors one terminal's view asks, as point (d) of
  // the decision behind it says.
  if (thePersonMayAskFromThere(req, kept)) return
  const said = refusalFromAnotherMachine({
    act: kept.act,
    because: kept.because,
    route: `${req.method} ${req.routeOptions?.url ?? req.url}`,
    arrival,
    client: callerAddressOf(req),
  })
  reply.code(403)
  // AND A CODE, so a person who meets it on a page reads one plain sentence in their language and one press, as
  // point 3 of a decision says. The English above stays the reply an agent and
  // Developer mode read.
  throw new PanelError(said.error, 403, said.detail, undefined, undefined, { code: 'keptOnTheOfficesComputer', values: {} })
}

/**
 * Install the refusal above every route group, so every `/api` route inherits it.
 *
 * A hook registered after a route group does not run for that group's routes, and the failure is
 * silent in the worst direction: the routes registered above it would go on being answered with
 * nobody having asked the question. `trackApiRoutes` and `refuseAnUnclassifiedDoor` are placed for
 * the same rule, a few lines above this one in `buildApp`.
 */
export function refuseActsKeptOnThisMachine(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    refuseAnActFromAnotherMachine(req, reply)
  })
}
