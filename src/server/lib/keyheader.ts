// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S KEY SENT UNDER ANOTHER NAME IS REFUSED, ON EVERY DOOR. A request whose key proves agent A while its
 * header names agent B is refused, and the refusal names both agents. This closes
 * criterion P83, point 5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REFUSED, AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * Refused: an AGENT'S key, with an actor header that names a different agent, or the person. The
 * second case is a reading of the same decision (message F4KyroEu2Pp3): the key is the proof,
 * the header must say what the key proves, and an agent sending the person's header is never a
 * legitimate call.
 *
 * AND, SINCE PROBLEM QWLvqvebC52J (29 September 2026), an agent's key under any actor type but agent, or
 * under a name no registered agent answers to. Both used to pass here: the type `system` is one
 * `actorFrom` accepts, and the office's own writer names (`AGENT_IDS_THAT_NEED_NO_REGISTRATION` in
 * lib/records.ts, 'mole-office/the-api-server' among them) name no registered agent. So an agent holding
 * its own key could send either and be taken as the office, which may end any run (`assertMayEndARun`):
 * measured in a throwaway office with the window closed, as the live office runs. No tool sends an
 * agent's key under any name but its holder's (`anAgentsToolHeaders` in tools/sandbox-common.mjs), and
 * the office's own processes send the office's key, which is not an agent's key.
 *
 * Not refused, and each is decided elsewhere exactly as before:
 *
 *   - no key. The window of P83 point 6 decides.
 *   - a key this office does not know, in the cookie or on a request no listener carried, or in a test world.
 *     The window decides it as it decides no key. In the header, through a listener, it is refused with 401
 *     before this rule is asked (`refuseAKeyThisOfficeNeverGave` below).
 *   - the person's key, or a confirmed device of theirs. It makes the caller the person whatever the
 *     headers say (`actorFrom` in lib/http.ts).
 *   - the office's key under an agent's name. Six of the office's own processes send it on every
 *     request, and the row keeps the agent's name with the office recorded as the one who proved it
 *     (message tP7jF3nErGyY). The office's key is not an agent's key.
 *   - an agent's key with no actor header. The key's holder is the caller.
 *   - an agent's key whose header names the same agent, by its id or by its handle (criterion I5).
 *   - a supervisor's run key acting for a run its holder started, which the session header names, while both runs
 *     run, as item 7 says, and the rule is in lib/acting-for.ts. The key then proves the agent
 *     that run serves, so the header names the agent the key proves and nothing here refuses it. When the headers ask
 *     for that and the rule does not hold, the refusal below says which part of it did not.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A HOOK, AND NOT A LINE IN `actorFrom`
 * ---------------------------------------------------------------------------------------
 *
 * `actorFrom` is not asked on every request. Handlers call it themselves, and the plain reads never
 * do. A rule about "every door the key reaches" has to sit where every door passes, which is an
 * `onRequest` hook registered above every route group in `buildApp`. It runs before any handler, so
 * nothing a door would do has happened when it refuses.
 *
 * IT DOES NOT CALL `actorFrom`. That would mark every read as checked in the call log, which
 * `refuseActsARoleMayNotPerform` in lib/rolegate.ts explains. It reads the two headers itself and
 * asks the one comparison `actorFrom` asks, `theKeyProvedTheNameTheHeadersGave`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT LEAVES TO THE PATHS THAT ALREADY ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * It refuses only the mismatch. Every other fault in the headers is left to the code that already
 * refuses it, in that code's own words:
 *
 *   - a header name misspelt, sent twice, or sent blank, a half claim, or an actor type that is
 *     none of human, agent and system: `actorFrom`'s refusals.
 *   - an agent header that means two agents (one agent's id and another live agent's handle): the
 *     resolver's 409 naming both (criterion I2). The comparison raises it here, and this hook lets
 *     the request go on, so the door that resolves the caller raises it again.
 *   - an agent header that names no registered agent, when no agent's key came with it: the refusal
 *     of an unregistered agent on a write (`whyAnUnregisteredAgentMayNotWrite` in lib/records/unregistered-agent.ts), and
 *     after the close the refusal of a write with no key. With an agent's key it is refused here.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { whyThisRunKeyDidNotActFor } from './acting-for.ts'
import { gateMet } from './gate-counts.ts'
import { actorFrom, aDoorNobodyNeedsAKeyFor, theKeyProvedTheNameTheHeadersGave } from './http.ts'
import { ACTOR_HEADERS } from '@shared/request-headers.ts'
import { arrivalOf } from '@shared/arrival-of.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { THE_MAIL_TOOL_HANDLE } from '../../config/the-mail-tool.mjs'
import {
  howThisRequestProvedItself,
  theHashOfAHeaderKeyNoKeyFileOrRowHolds,
} from './keys.ts'
import { theAgentAKeysHolderNames } from './the-handle-of-the-agent-a-key-proves.ts'
import { oneHeader, theHalvesOn, theHashOfTheKeyOnThisRequest } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { readParticipant } from '../db/read-participant.ts'
import { PanelError } from './panel-error.ts'
import { credentialByTokenHash } from './visitors.ts'
import { theWorldsOwnAuthority } from './worldauthority.ts'
import { KEY_HEADER } from '../../config/key-header.mjs'

/**
 * ONE ACTOR HEADER, TRIMMED, OR UNDEFINED. Never a refusal: a header sent twice or sent blank is
 * `actorFrom`'s to refuse, and this hook only needs to know whether a clear name was given.
 */
function aClearHeader(req: FastifyRequest, name: string): string | undefined {
  const raw = req.headers[name]
  if (typeof raw !== 'string') return undefined
  const value = raw.trim()
  return value === '' ? undefined : value
}

/** An agent as a person reads it: its name and its handle, or the handle alone where they are one. */
function inWords(agent: { name: string; handle: string }): string {
  return agent.name.trim() === '' || agent.name === agent.handle
    ? `"${agent.handle}"`
    : `${agent.name} ("${agent.handle}")`
}

/**
 * THE AGENT THE KEY PROVES, in words. Where no one registered agent answers to the key's holder
 * string, the string itself is quoted: it is what the office holds, and a guess would be worse.
 */
function theKeysHolderInWords(whoseId: string): string {
  const holder = theAgentAKeysHolderNames(whoseId)
  return holder === null ? `"${whoseId}"` : inWords(holder)
}

/** The person the header names, in words. The person's name where the registry holds it. */
function thePersonInWords(id: string | undefined): string {
  const person = id === undefined ? null : readParticipant({ kind: 'person', id })
  return person === null ? 'the person' : `the person, ${person.name}`
}

/**
 * THE REFUSAL, OR NOTHING. Asked on every request; see the note at the top of this file.
 *
 * 403 AND NOT 400. 403 is the office's word for a caller who is not who it says, and that is what
 * this is: the header says who is asking, and the key proves somebody else. The restore door's 400
 * is for a request whose PATH contradicts its key, which is a question about the thing asked for.
 */
export function refuseAnAgentsKeyUnderAnotherName(req: FastifyRequest): void {
  const proof = howThisRequestProvedItself(req)
  // THEIR TOOL HAS ONE DOOR. Before any handler or header can treat it as somebody else, refuse
  // every other door, including reads that never ask for an actor. Two decisions and report H-forI_Vk5H7 change an
  // earlier decision: possession proves only their tool, never a person or agent.
  if (proof?.how === 'his-tool-key') {
    if (proof.whoseId === THE_MAIL_TOOL_HANDLE && req.method === 'GET' && req.url.split('?')[0] === '/api/office/summonses') return
    throw new PanelError(
      'This key proves only your mail tool. It may only read GET /api/office/summonses. Nothing was done. ' +
        'Use your own key for your acts, or an agent’s own key for its acts.',
      403,
    )
  }
  if (proof?.how !== 'an-agent-key') return
  const type = aClearHeader(req, ACTOR_HEADERS.type)
  const id = aClearHeader(req, ACTOR_HEADERS.id)
  const holder = theKeysHolderInWords(proof.whoseId)

  if (type === 'human') {
    throw new PanelError(
      `This request carries the key of ${holder} and its header names ${thePersonInWords(id)}. A key proves ` +
        `who is asking, and an agent's key never makes the caller the person. Name ${holder} in the header. ` +
        'Nothing was done.',
      403,
    )
  }
  // AN AGENT'S KEY NEVER MAKES THE CALLER THE OFFICE EITHER (problem QWLvqvebC52J; see the header).
  if (type !== undefined && type !== 'agent') {
    throw new PanelError(
      `This request carries the key of ${holder} and its header names the type "${type}". A key proves who is ` +
        `asking, and an agent's key makes the caller that agent and nothing else, never the office. Name ${holder} ` +
        'in the header. Nothing was done.',
      403,
    )
  }
  if (type === undefined || id === undefined) return

  let same: boolean
  try {
    same = theKeyProvedTheNameTheHeadersGave(proof, type, id)
  } catch (err) {
    // THE HEADER MEANS TWO AGENTS. The resolver's 409 is the answer, and the door that resolves the
    // caller gives it. Anything else is a fault this hook cannot handle, so it goes on up.
    if (err instanceof PanelError && err.status === 409) return
    throw err
  }
  if (same) return

  // THE HEADER RESOLVED THE WAY THE COMPARISON RESOLVED IT, with the key at step 1, so this cannot
  // raise the 409 the comparison did not. Null means the header names no registered agent, which no
  // agent's key proves: the office's own writer names are among them (problem QWLvqvebC52J).
  const named = theAgentAnArrivingReferenceNames(id, 'reading', proof.whoseId)
  if (named === null) {
    throw new PanelError(
      `This request carries the key of ${holder} and its header names "${id}", which no registered agent answers ` +
        `to. A key proves who is asking, so the header names the agent whose key it is. Name ${holder} in the ` +
        'header. Nothing was done.',
      403,
    )
  }
  const header = inWords(named.agent)
  // A RUN KEY THE HEADERS ASKED TO ACT FOR A RUN, where the rule did not hold: the refusal says which part did not.
  const whyNot = whyThisRunKeyDidNotActFor(req)
  throw new PanelError(
    `This request carries the key of ${holder} and its header names ${header}. A key proves who is asking, ` +
      `so the two must name the same agent. Send the key of ${header}, or name ${holder} in the header. ` +
      (whyNot === null
        ? ''
        : 'A supervisor’s run key acts for a run of an agent it registered and started, named in ' +
          `${ACTOR_HEADERS.session}, while both runs run, but not here: ${whyNot}. `) +
      'Nothing was done.',
    403,
  )
}

/**
 * WHAT A REQUEST WITH A KEY THIS OFFICE NEVER GAVE IS TOLD. It never says the key, or any part of it.
 *
 * "HAS NO RECORD OF GIVING", AND NOT "NEVER GAVE". The office keeps every key it gave, revoked ones too, but a
 * database restored from an older copy holds no row for a key given after that copy was made.
 */
export const A_KEY_THIS_OFFICE_NEVER_GAVE =
  `This request was refused, and nothing was done. This office has no record of giving the key in its ${KEY_HEADER} ` +
  'header, or the key its two halves make. Check the key your headers file or your settings hold. An agent sends the ' +
  'key its registration answered, and an agent that no longer holds that key asks its starter or the person for a new ' +
  "one. The office's own programs send the office's key, from its key file. A browser pairs again on the Pairing page."

/**
 * THE REFUSAL OF A KEY THIS OFFICE NEVER GAVE, OR NOTHING. Asked on every request, before the rule above.
 *
 * A request with such a key used to be read as a request with no key. While the key window was open it was
 * then written under the name its headers gave, and the program that held the wrong key was never told.
 * Now it is refused with 401, whether the window is open or closed. A request with no key is not refused
 * here: the window still decides it.
 *
 * THE KEY IS THE ONE IN THE KEY HEADER, OR THE ONE A BROWSER'S TWO HALVES JOIN TO. Two halves of two different keys
 * join to a key the office never gave, and are refused here, not as one half alone.
 *
 * WHAT IS NOT REFUSED, and is read as before:
 *
 *   - a key the office gave and then revoked, or a waiting credential's token. The office gave both.
 *   - the old cookie. It is no key.
 *   - two halves at the pairing page's read and at the doors to a key. A browser cannot clear its cookie half, which is
 *     HttpOnly, so this is where it is given two new halves.
 *   - a request no listener carried. It is the office itself.
 *   - any key in a test world. A world is a copy of the office with its key rows emptied, so every key the
 *     office gave before the copy would be refused there, and lib/keys.ts already says which keys a world trusts.
 */
export function refuseAKeyThisOfficeNeverGave(req: FastifyRequest): void {
  if (arrivalOf(req) === undefined) return
  if (theWorldsOwnAuthority().inATestWorld) return
  const hash = theHashOfAHeaderKeyNoKeyFileOrRowHolds(req)
  if (hash === null) return
  if (credentialByTokenHash(hash) !== null) return
  if (oneHeader(req.headers[KEY_HEADER]) === undefined && aDoorNobodyNeedsAKeyFor(req)) return
  throw new PanelError(A_KEY_THIS_OFFICE_NEVER_GAVE, 401)
}

/**
 * ONE HALF OF A BROWSER'S DEVICE KEY, WITHOUT THE OTHER, IS REFUSED, OR NOTHING. Asked on every request, first.
 *
 * Neither half alone proves anything, and a request that carries one half is not read as a request with no key. The
 * cookie half alone is what a request another site makes this browser send would carry, and the header half alone is
 * what a script that read the page's storage would hold. Each is refused with 401, whether the key window is open or
 * closed, so the window never lets one half in under the name its headers give.
 *
 * WHAT IS NOT REFUSED:
 *
 *   - a request with a key in the key header. That key decides, and the halves are not read.
 *   - a request outside /api/. A page load carries the cookie half and no header, and asks nothing.
 *   - a load the browser makes itself: a GET or a HEAD with the cookie half alone that names nobody. A picture on a
 *     page of this office is such a load, from /api/portraits, /api/avatars or /api/file, and a page cannot add a
 *     header to it. It is read as a request with no key, exactly as if it carried no cookie, so the cookie half adds
 *     nothing to it: a door that asks who is calling refuses it as unproved, and a door that answers anyone answers it.
 *   - the pairing page's read and the doors to a key. A browser that kept its cookie half and lost the other pairs
 *     again there.
 *   - a request no listener carried, and any request in a test world, as for the refusal above.
 */
export function refuseOneHalfOfADeviceKey(req: FastifyRequest): void {
  if (arrivalOf(req) === undefined) return
  if (theWorldsOwnAuthority().inATestWorld) return
  if (oneHeader(req.headers[KEY_HEADER]) !== undefined) return
  const halves = theHalvesOn(req)
  if ((halves.cookie === undefined) === (halves.header === undefined)) return
  if (!req.url.startsWith('/api/')) return
  if (aDoorNobodyNeedsAKeyFor(req)) return
  if (aLoadTheBrowserMadeItself(req, halves.header)) return
  throw new PanelError(sayInEnglish('server.oneHalfOfADeviceKey'), 401, undefined, undefined, undefined, {
    code: 'oneHalfOfADeviceKey',
    values: {},
  })
}

/** A GET or a HEAD with no header half that names nobody: a load the browser made itself, as the rule above says. */
function aLoadTheBrowserMadeItself(req: FastifyRequest, headerHalf: string | undefined): boolean {
  return (req.method === 'GET' || req.method === 'HEAD')
    && headerHalf === undefined
    && oneHeader(req.headers[ACTOR_HEADERS.type]) === undefined
    && oneHeader(req.headers[ACTOR_HEADERS.id]) === undefined
}

/**
 * INSTALL ALL THREE ABOVE EVERY ROUTE GROUP. A hook registered after a route group does not run for that
 * group's routes, and the failure is silent: those doors would go on accepting one agent's key under
 * another's name, a key this office never gave, and one half of a device key.
 */
export function refuseAgentsKeysUnderAnotherName(app: FastifyInstance): void {
  app.addHook('onRequest', async (req) => {
    refuseOneHalfOfADeviceKey(req)
    refuseAKeyThisOfficeNeverGave(req)
    refuseAnAgentsKeyUnderAnotherName(req)
  })
}

/**
 * A DOOR THAT TAKES AN ACT ONLY WITH A KEY. Keys wave piece 7, and the waiter part of piece 3, which the
 * owner's decision settles.
 *
 * WHICH DOORS ASK. check.answer (acceptance finding 79), and since this piece merge.tool,
 * check.assembled's four doors except ask-again, handle.hold, handle.process, handle.release and
 * handle.took. In the seven days before 25 September 2026 at 22:16, every answered call of each of
 * them came with a key (the count is in the w13m supervisor's M2-fresh-2217.txt). The other doors
 * still take a name alone, because some of their callers had no key that week.
 *
 * WHAT COUNTS. Any key this office knows: the person's, the office's own, or an agent's own key. The
 * office's key counts on purpose. The office's own programs send it, and one agent's waiter sends it
 * until that agent holds a key of its own; nothing here may lock that out. Who the key proves is the
 * rest of each door's business, read after this as before.
 *
 * A REQUEST NO LISTENER CARRIED IS THE OFFICE ITSELF (a migration, a script inside the server,
 * `app.inject()`), as `thePersonIsProved` in lib/records.ts reads it, so an absent `from` is never
 * refused here.
 *
 * WHY THIS FILE AND NOT lib/http.ts. This file already holds the other rule about the key at a door,
 * and http.ts decides who a request is, not which acts need a proof. A refusal written once here is
 * the same words on every door that asks (invariant 9).
 */

/** What one door says around the words `refuseAnActWithNoKey` writes. */
export interface ADoorThatAsksForAKey {
  /** The act, as the subject of a sentence with no stop: "This hold on a handle". */
  act: string
  /** That nothing was done, as one sentence with its stop: "Nothing was written." */
  nothingWasDone: string
  /** The door's own reason for asking, as whole sentences, or absent. */
  why?: string
}

/**
 * THE REFUSAL, OR NOTHING. It throws a 403 when a listener carried the request and no key this
 * office knows came with it. Call it before the door reads or writes anything else.
 *
 * TWO CASES, EACH SAID AS IT IS. A request that carried no key is told so. A request that carried a
 * key which proves nobody here (a key the office never made, a revoked one, or one a test world does
 * not trust) is told that instead, because "no key" would be false for it.
 */
export function refuseAnActWithNoKey(req: FastifyRequest, door: ADoorThatAsksForAKey): void {
  const actor = actorFrom(req)
  if (actor.from === undefined || actor.provedBy !== undefined) return
  const carried = theHashOfTheKeyOnThisRequest(req) !== null
  // Counted here, where every door that asks refuses. Nothing is read or written before this, so no write is taken back.
  gateMet('an-act-at-a-keyed-door-needs-a-key', 'block')
  throw new PanelError(
    [
      carried
        ? `${door.act} came with a key that proves nobody here, so it was not taken.`
        : `${door.act} came with no key, so it was not taken.`,
      door.nothingWasDone,
      ...(door.why === undefined ? [] : [door.why]),
      'A name in the headers alone proves nothing, because any process that can reach the office can send one.',
      `Send a key this office knows on the ${KEY_HEADER} header. An agent sends its own key, and the ` +
        "office's own programs send the office's key.",
    ].join(' '),
    403,
  )
}
