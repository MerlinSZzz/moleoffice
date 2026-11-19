// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE AN ASK FOR A KEY CAME FROM, AND WHEN THE AGENT'S KEY WAS LAST USED. Finding 83, mends
 * b1 and b2 (problem zAI2kxjbCrTd).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A new-key ask sent with no key in a worker's name was filed, and the office's message to the
 * worker's starter was stored as sent by the worker, with the caller's own reason. A starter reading
 * it could not tell that the ask proved nobody, nor where it came from, so it could be led to grant a
 * worker's new key to a stranger.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * The facts of one ask are read once, when it is filed, and stored on the ask as `extra.askedFrom`:
 * what the ask proved, the address its connection showed, which machine the listener stamped it as,
 * and the session it named. Every surface reads them back with `whereTheAskCameFrom` and says them in
 * the words `whereTheAskCameFromInWords` writes: the message to the starter, the ask's own page and
 * its line on the person's waiting list. So the three cannot describe one ask differently (invariant
 * 9). `whenItsKeyWasLastUsedInWords` is the second sentence the page and the list show.
 *
 * THE ADDRESS IS THE SOCKET'S, NEVER A FORWARDED HEADER. A header is something the caller wrote. On
 * the door other machines reach through a proxy, the socket's address is the proxy's, and the words
 * say so rather than pass it off as the caller's.
 */
import type { FastifyRequest } from 'fastify'

import type { HowACallerProvedItself } from '@shared/types.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { WhatAnAskShows } from '@shared/profile.ts'
import { AN_ASK_THAT_PROVED_NOTHING } from '@shared/what-an-ask-proved.ts'
import { arrivalOf } from '@shared/arrival-of.ts'
import { whoTheSocketIs } from './caller-address-of.ts'
import { whenTheKeysOfTheAgentWithThisIdWereUsed } from './keys.ts'
import { theHandleOfTheAgentAKeyProves } from './the-handle-of-the-agent-a-key-proves.ts'
import { theHashOfTheKeyOnThisRequest } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import type { Actor } from './records.ts'

/** The facts of where one ask came from, as stored on the ask. */
export interface WhereAnAskCameFrom {
  /** How the ask proved itself, or null because it proved nobody. */
  provedBy: HowACallerProvedItself | null
  /** The handle of the agent whose key the ask carried, or null because it carried no agent's key. */
  keyOf: string | null
  /** True when the ask carried a key that proved nobody; false when it carried no key. */
  carriedAKeyThatProvedNobody: boolean
  /** The address the connection showed, or null because no listener carried the ask. */
  address: string | null
  /** Which machine the listener stamped the ask as, or null because no listener carried it. */
  arrival: 'this machine' | 'another machine' | null
  /** True when the address is a proxy on this computer that carried the ask, not the caller. */
  addressIsAProxy: boolean
  /** The session the ask named in its headers, or null because it named none. */
  session: string | null
}

/**
 * READ THE FACTS OF THIS ASK FROM THE REQUEST, once, when it is filed. `provedBy` and the key's
 * holder come from the actor `actorFrom` made; the address from the socket; the machine from the
 * listener's stamp.
 */
export function whereThisAskCameFrom(req: FastifyRequest, actor: Actor): WhereAnAskCameFrom {
  const arrival = arrivalOf(req) ?? null
  const provedBy = actor.provedBy ?? null
  const agentKey = provedBy === 'an-agent-key' ? (actor.keyHolder ?? actor.id) : null
  const session = actor.sessionId === undefined || actor.sessionId === null || actor.sessionId === '' ? null : actor.sessionId
  return {
    provedBy,
    keyOf: agentKey === null ? null : theHandleOfTheAgentAKeyProves(agentKey),
    carriedAKeyThatProvedNobody: provedBy === null && theHashOfTheKeyOnThisRequest(req) !== null,
    // THE SOCKET'S OWN ADDRESS, and only when a listener carried the ask: an in-process call has no
    // connection, and the address a test harness makes up for one is nobody's.
    address: arrival === null ? null : (req.raw?.socket?.remoteAddress ?? null),
    arrival,
    addressIsAProxy: whoTheSocketIs(req) === 'a proxy on this computer',
    session,
  }
}

/** The stored facts on an ask, or null because it was filed before they were stored. */
export function whereTheAskCameFrom(record: PanelRecord): WhereAnAskCameFrom | null {
  const extra = record.data['extra']
  if (typeof extra !== 'object' || extra === null) return null
  const said = (extra as Record<string, unknown>)['askedFrom']
  if (typeof said !== 'object' || said === null) return null
  const one = said as Record<string, unknown>
  const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
  const provedBy = one['provedBy']
  return {
    provedBy:
      provedBy === 'the-person-key' || provedBy === 'the-office-key' || provedBy === 'an-agent-key' || provedBy === 'his-tool-key' ? provedBy : null,
    keyOf: text(one['keyOf']),
    carriedAKeyThatProvedNobody: one['carriedAKeyThatProvedNobody'] === true,
    address: text(one['address']),
    arrival: one['arrival'] === 'this machine' || one['arrival'] === 'another machine' ? one['arrival'] : null,
    addressIsAProxy: one['addressIsAProxy'] === true,
    session: text(one['session']),
  }
}

/** The facts as they are stored in `extra.askedFrom`. */
export function theAskedFromMarker(facts: WhereAnAskCameFrom): Record<string, unknown> {
  return { askedFrom: { ...facts } }
}

/**
 * WHERE THE ASK CAME FROM, in sentences. The first says whether it proved anybody; the second where
 * its connection came from; the third which session it named.
 */
export function whereTheAskCameFromInWords(facts: WhereAnAskCameFrom): string {
  const proved =
    facts.provedBy === null
      ? facts.carriedAKeyThatProvedNobody
        ? AN_ASK_THAT_PROVED_NOTHING.carriedAKeyThatProvesNothing
        : AN_ASK_THAT_PROVED_NOTHING.carriedNoKey
      : facts.provedBy === 'his-tool-key'
        ? 'The key proves only the person’s mail tool, which cannot ask for an agent’s key.'
        : facts.provedBy === 'an-agent-key'
        ? facts.keyOf === null
          ? "The ask carried an agent's key, and which agent's was not recorded."
          : `The ask carried the key of the agent "${facts.keyOf}", so it proved that agent.`
        : facts.provedBy === 'the-office-key'
          ? "The ask carried the office's own key, which proves the office and no agent."
          : "The ask carried the person's key, so it proved the person."
  const where =
    facts.arrival === null
      ? "No listener carried it: it was made inside the office's own program, so no address was read."
      : `${facts.address === null ? 'Its connection showed no address' : `Its connection came from ${facts.address}`}, ` +
        `and the listener that took it stamped it as ${facts.arrival === 'this machine' ? 'this computer' : 'another machine'}.` +
        (facts.addressIsAProxy && facts.address !== null
          ? ' That address is the proxy on this computer that carried it, not the caller.'
          : '')
  const session =
    facts.session === null ? 'It named no session.' : `It named the session "${facts.session}" in its headers.`
  return `${proved} ${where} ${session}`
}

/** What an ask filed before these facts were stored says instead. */
export const NOBODY_RECORDED_WHERE_IT_CAME_FROM =
  'Nobody recorded where this ask came from: it was filed before the office stored that.'

/**
 * WHEN THE AGENT'S CURRENT KEY WAS LAST USED, in one or two sentences. `agentId` is a registry id, or
 * null because no live agent bears the handle yet (a registration still waiting).
 */
export function whenItsKeyWasLastUsedInWords(agentId: string | null, handle: string): string {
  if (agentId === null) return `No live agent is registered as "${handle}", so no key of it has been used.`
  const used = whenTheKeysOfTheAgentWithThisIdWereUsed(agentId)
  if (used.liveKeys === 0) return `"${handle}" holds no live key now.`
  if (used.lastUsedAt !== null) {
    return (
      `A key "${handle}" holds now was last used at ${used.lastUsedAt}. The office writes this at most once a ` +
      'minute per key, so a later use within that minute is not shown.'
    )
  }
  if (used.everyKeyWasWatched) return `No key "${handle}" holds now has been used since it was made.`
  return (
    `No use of a key "${handle}" holds now is recorded.` +
    (used.recordingSince === null
      ? ' This server is not recording key use.'
      : ` This server has recorded key use since ${used.recordingSince}, so a use before then may have gone ` +
        'unrecorded.')
  )
}

/** Both sentences for one ask, and which computer it came from, as the page and the waiting list show them. */
export function whatThisAskShows(record: PanelRecord, agentId: string | null, handle: string): WhatAnAskShows {
  const facts = whereTheAskCameFrom(record)
  return {
    cameFrom: facts === null ? NOBODY_RECORDED_WHERE_IT_CAME_FROM : whereTheAskCameFromInWords(facts),
    keyLastUsed: whenItsKeyWasLastUsedInWords(agentId, handle),
    fromWhere:
      facts === null
        ? 'not recorded'
        : facts.arrival === null
          ? 'inside the office'
          : facts.arrival === 'this machine'
            ? 'this computer'
            : 'another computer',
  }
}
