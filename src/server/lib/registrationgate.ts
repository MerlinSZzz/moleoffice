// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MAY REGISTER AN AGENT FROM ANOTHER MACHINE, AND WHAT THE ROW SAYS AFTERWARDS. Criterion P69.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED
 * ---------------------------------------------------------------------------------------
 *
 * On 7 September 2026 at 14:48 an agent on the owner's other machine registered itself in Mole Office. It
 * became a worker whose id named the owner, a citizen of this world, on the contacts list, with
 * nobody recorded as having started it. It should have been a visitor, and no step let the person confirm it
 * before it joined.
 *
 * MEASURED ON THE OWNER'S OWN CORPUS. The record `KafK03fZvjgd` holds `handle`, `state`, `source`,
 * `workArea`, `role` and `runtime` and NO `startedBy` — so it was not written by
 * `POST /api/agents/started`, which always writes one. It came through `POST /api/records` with kind
 * `agent`, under its own actor id, from the address 192.0.2.10, which the call log holds against
 * that agent with fourteen requests.
 *
 * SO A GATE ON ONE OF THE TWO DOORS WOULD NOT HAVE STOPPED IT, and this is why this check is a
 * function two routes call rather than a clause inside one handler.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT DECIDES "ANOTHER MACHINE", AND WHY IT IS NOT THE ADDRESS
 * ---------------------------------------------------------------------------------------
 *
 * `arrivalOf` — the mark the server stamps on the socket, from WHICH LISTENER accepted the
 * connection. A caller cannot send it, because it is not a header. `writtenFrom` reads the same mark
 * and then names the machine, and that name is what the refusal quotes and what the credential
 * records; but the DECISION is the arrival, because `writtenFrom` answers "nobody could tell" both
 * for a caller here whose machine has no name and for one elsewhere whose address could not be read,
 * and those two must not be refused alike.
 *
 * A request that arrived through neither listener — one this process made of itself, or a migration
 * — is not a registration from anywhere and meets nothing here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT LETS ONE THROUGH
 * ---------------------------------------------------------------------------------------
 *
 * A credential the person has confirmed, carried on the request. `whyThisCredentialMayNotWork` is
 * asked, which is the same reading the credential hook asks on every request, so a credential this
 * gate accepted and the hook refused is not a state that can exist. A pending one is refused here
 * with the same sentence the hook gives, because a visitor whose credential the person has not yet confirmed
 * is exactly the case the owner found.
 */

import type { FastifyRequest } from 'fastify'

import { arrivalOf } from '@shared/arrival-of.ts'
import { writtenFrom } from './machines.ts'
import { credentialTokenOn } from './visitorgate.ts'
import { whyThisCredentialMayNotWork } from './visitorgate.ts'
import { credentialForToken } from './visitors.ts'
import type { VisitorCredential } from '@shared/visitors.ts'
// (The runtime set P88 used to judge by is no longer imported here. The 14 September 2026 amendment
// ends the judgment by runtime; this file keeps only the sentence that used to make it, so the
// mutation that restores the gate has one place to go.)

/** The door a visiting agent asks for a credential at. Written once; the refusal names it. */
export const THE_CREDENTIAL_DOOR = 'POST /api/office/visitors'

/** Where the person confirms one, in the words a person reads. */
export const WHERE_THEY_CONFIRM_IT = 'the Embassy, at #/embassy'

/**
 * What this request may register an agent on, or why it may not register one at all.
 *
 * `credential` is the credential the row will name: null for a registration on this machine, which
 * needs none. `refusal` is null when the registration may go ahead.
 */
export interface WhereARegistrationCameFrom {
  fromThisMachine: boolean
  /** The machine as `writtenFrom` measured it, for the refusal and for the record. */
  machine: string | null
  credential: VisitorCredential | null
  refusal: string | null
}

/**
 * WHY A REGISTRATION MADE ON THIS MACHINE MAY NOT GO AHEAD. Criterion P88, as amended: this machine is not a
 * visitor, and the judgment by runtime ends.
 *
 * AN AGENT ON THIS MACHINE IS NOT A VISITOR, WHATEVER RUNTIME IT RUNS ON. A visitor is only an agent
 * from another machine, which comes in through the Embassy on a credential the person confirms. So a
 * registration that arrived on this machine's own listener goes ahead and this function answers
 * null for every runtime — codex, dsh, none, or any word at all.
 *
 * WHAT THE GATE JUDGES NOW. The listener the registration arrived on, in
 * `whereThisRegistrationCameFrom` below, and the starter's proof: the caller must be a registered
 * agent (or the person) for the started-agent door, and the chain of starters must reach the person.
 * The old wording is in the commit and in design/permissions/ACCEPTANCE.md; the sentence it made is
 * reproduced by the tests named there.
 *
 * THE OLD WORDING, KEPT WHERE THE MUTATION BELONGS. The body below used to refuse every runtime
 * outside `THE_RUNTIMES_THIS_OFFICE_STARTS_HERE`, and `codex` above all. Putting that refusal back
 * here is the mutation that turns the self-registration tests red, which is how this file's one
 * remaining job is proved rather than assumed.
 */
export function whyThisRegistrationFromThisMachineIsRefused(_declaredRuntime: unknown): string | null {
  return null
}

/**
 * `declaredRuntime` IS THE RUNTIME THE REGISTRATION NAMES — `body.runtime` on the started-agent door and
 * `data.runtime` on the ordinary record door. It is passed in because this reader takes the request and
 * not a body.
 *
 * THE RUNTIME RULE APPLIES TO A REGISTRATION THAT ARRIVED ON A LISTENER. An in-process caller —
 * `app.inject()` in a test, or a migration — arrived through neither listener, and this file's header
 * already says such a request is not a registration from anywhere and meets nothing here. A real
 * caller on this machine is a registration from this machine and is judged.
 */
export function whereThisRegistrationCameFrom(
  req: FastifyRequest,
  declaredRuntime?: unknown,
): WhereARegistrationCameFrom {
  const arrived = arrivalOf(req)
  const here = arrived !== 'another machine'
  const measured = writtenFrom(req)
  if (here) {
    return {
      fromThisMachine: true,
      machine: measured.machine,
      credential: null,
      refusal: arrived === undefined ? null : whyThisRegistrationFromThisMachineIsRefused(declaredRuntime),
    }
  }

  const said = `The request came from ${measured.machine === null ? 'a machine nobody could name' : measured.machine}.`
  const token = credentialTokenOn(req)
  const credential = token === null || token === '' ? null : credentialForToken(token)
  if (credential === null) {
    return {
      fromThisMachine: false,
      machine: measured.machine,
      credential: null,
      refusal:
        'Registering an agent from another computer needs a credential the owner has confirmed, and this request ' +
        `carried ${token === null ? 'none' : 'one nothing here matches'}. ${said} Nothing was written.\n\n` +
        `ASK FOR ONE: ${THE_CREDENTIAL_DOOR}, with the handle, the name, the card you want and the facts of this ` +
        'run — where it writes its transcript, or the directory it started in. The token comes back once.\n\n' +
        `THEN THE PERSON CONFIRMS IT, as administrator, at ${WHERE_THEY_CONFIRM_IT}, on either machine. Nothing under a ` +
        'credential works until the person has. Once they have, send the token on this same request and register through ' +
        'this ordinary door: the row will name the credential it came in on.',
    }
  }

  // A CREDENTIAL THAT MAY NOT WORK IS REFUSED IN THE HOOK'S OWN WORDS. Two sentences for one state
  // would let a pending visitor be told two different things by two parts of one server.
  const no = whyThisCredentialMayNotWork(credential)
  if (no !== null) {
    return {
      fromThisMachine: false,
      machine: measured.machine,
      credential: null,
      refusal: `${no}\n\n${said} Nothing was registered. The person confirms a credential at ${WHERE_THEY_CONFIRM_IT}.`,
    }
  }

  return { fromThisMachine: false, machine: measured.machine, credential, refusal: null }
}

/**
 * THE DATA OF A REGISTRATION, WITH THE CREDENTIAL THE OFFICE MEASURED. Criterion P69.
 *
 * IT IS NEVER TAKEN FROM THE BODY. A caller that could name its own credential could name one the
 * owner confirmed for somebody else, which would turn the field from a fact into a claim. So a
 * `credential` the caller sent is REPLACED — by the measured one, or by nothing at all where the
 * request came from this machine and needed none.
 *
 * `data` that is not an object is handed back untouched: whether a record may be written with such
 * a body is the validator's question and not this one's.
 */
export function withTheCredentialMeasuredHere<T>(data: T, from: WhereARegistrationCameFrom | null): T {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return data
  const out = { ...(data as Record<string, unknown>) }
  delete out['credential']
  if (from?.credential != null) out['credential'] = from.credential.id
  return out as T
}
