// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHY A RECORD WRITE UNDER AN AGENT ID THE REGISTRY DOES NOT HOLD IS REFUSED:
 * `whyAnUnregisteredAgentMayNotWrite`. It was moved whole out of src/server/lib/records.ts, with
 * no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands this name on with `export *`, and every caller still imports
 * `whyAnUnregisteredAgentMayNotWrite` from records.ts.
 *
 * THIS FILE AND records.ts IMPORT EACH OTHER. `AGENT_IDS_THAT_NEED_NO_REGISTRATION` and `Actor` are
 * taken from records.ts and are read only inside `whyAnUnregisteredAgentMayNotWrite`, so nothing
 * of records.ts is read while this file is being evaluated. `Actor` is a type-only import, which
 * the compiler erases.
 */
import { type Actor } from '../records.ts'
import { AGENT_IDS_THAT_NEED_NO_REGISTRATION } from '@shared/agent-ids-that-need-no-registration.ts'
import { participantForActor } from '../participant-for-actor.ts'

/**
 * WHY A RECORD WRITE UNDER AN AGENT ID THE REGISTRY DOES NOT HOLD IS REFUSED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED, AND WHAT THE REFUSAL PREVENTS
 * ---------------------------------------------------------------------------------------
 *
 * On 16 September 2026 at 13:27 a run filed a report with
 * `x-mole-office-actor-id: HANDLE`, a placeholder its brief had not filled in. The office stored
 * the report, and the create change row says `HANDLE` for ever, so nobody can place its author.
 * An id on a change row is permanent and is the only thing that says who
 * wrote a record, so a name the registry cannot answer is a false attribution nobody can repair.
 * Refusing the write at the door is the one point at which it can still be stopped.
 *
 * ---------------------------------------------------------------------------------------
 * WHY AN IN-PROCESS CALLER IS NOT ASKED
 * ---------------------------------------------------------------------------------------
 *
 * `actor.from` is written by the listener that accepted the connection, and an in-process caller —
 * the seed, a migration, a script, `app.inject()` — arrived on no socket. The rule does not apply
 * to it, which is the same line `isSomebodyMoleOfficeCannotPlace` and `theHeaderWindowCovers` draw.
 * Criterion M14 said a record write from an unknown agent is NAMED, never stopped. Since 30 September
 * 2026 it says the write is refused with HTTP 403, and this function is that refusal.
 * It only stops a NEW header claim from arriving: a row already written under such a
 * name stays, a write in process is still accepted, and `unregisteredAgentsSeen` still names both.
 *
 * ---------------------------------------------------------------------------------------
 * RETIRED AGENTS PASS AND MUST GO ON PASSING
 * ---------------------------------------------------------------------------------------
 *
 * `participantForActor` answers for a registry row whatever its `retired` flag, so a retired agent
 * is somebody this rule knows. The rules that refuse a retired agent are asked elsewhere.
 *
 * ---------------------------------------------------------------------------------------
 * A NAME THAT MEANS TWO AGENTS IS TOLD THAT, AND IS NOT TOLD THAT NOTHING IS REGISTERED
 * ---------------------------------------------------------------------------------------
 *
 * Since piece I-1 landed, `participantForActor` answers `null` where NOTHING bears the name and
 * RAISES I-1's refusal where the name is one agent's id and another live agent's handle. This door
 * lets that refusal through rather than turning it into its own sentence, and that is a decision
 * with two halves:
 *
 *   THE SENTENCE BELOW WOULD BE FALSE. It says *nothing is registered as the agent "X"* when two
 *   things are. A refusal that stops the right write for a reason that is not true is the failure
 *   this whole cluster exists to prevent — invariant 2, no silent semantic fallback, and invariant 5,
 *   absence beats a guess. Ambiguity is neither of them.
 *
 *   AND THE RESOLVER'S SENTENCE IS THE ONE WORTH READING. `whyAReferenceNamesTwoAgents` in
 *   lib/participants.ts names both agents, says what state each is in, and gives the id to send
 *   instead. Writing a second sentence about the same fact here would be one fact answered in two
 *   places, free to disagree, which is invariant 9. Its 409 is also the honest status: the request
 *   is not forbidden, it is unreadable.
 *
 * It cannot fire on this branch or on main. Every handle is unique across every row until piece I-2
 * frees one, and all 370 legacy ids equal their handles, so no string is both. The behaviour is
 * built and proved now because the day it starts firing is the day I-2 lands.
 *
 * @throws PanelError 409 when the actor's name means two agents. `refuseAnUnregisteredAgentActor` in
 * src/server/api/records.ts turns THIS function's SENTENCE into a 403 and passes a raised refusal
 * through untouched, so a caller gets the resolver's own answer with the resolver's own status.
 */
export function whyAnUnregisteredAgentMayNotWrite(actor: Actor): string | null {
  // Only an agent that named itself in a header is asked. A person, a system writer and an
  // in-process caller are none of this rule's business.
  if (actor.type !== 'agent') return null
  if (actor.from === undefined) return null
  // INSIDE A TEST WORLD, ONLY THE WORLD'S STARTER AND ITS SECRETARIES MAY WRITE WITHOUT A REGISTRY
  // ROW THERE. Chapter 8 rule 5 gives the owner's authority in a world to the agent that started it
  // and to the secretary, and to nobody else, so this reads the one fact `actorFrom` worked out and
  // carried as `actor.theOwnersAuthority`. Every other unregistered agent id is refused here exactly
  // as it is in the office. The world's change log is its own and nothing written in it is the
  // owner's word, so the false attribution this rule exists against cannot reach the office.
  if (actor.theOwnersAuthority?.holds === true) return null
  if (AGENT_IDS_THAT_NEED_NO_REGISTRATION.includes(actor.id)) return null
  // BY ID OR BY HANDLE, and a retired row counts: `participantForActor` is the one reader both the
  // registry and the rest of the server use, so this cannot drift from who the office says exists.
  // IT MAY RAISE RATHER THAN ANSWER, and the raise is deliberately not caught — see the block above.
  if (participantForActor(actor) !== null) return null
  return (
    `Nothing is registered as the agent "${actor.id}", so this write is refused. Every record an agent writes ` +
    `carries the id on the request in its change row for ever, so the office only accepts an agent id a registry ` +
    `row answers to. Nothing was written. Register first, and then send the handle the registration answers as ` +
    `x-mole-office-actor-id — POST /api/agents/register-myself for a session registering itself, or ` +
    `POST /api/agents/started for the agent that started you. GET /api/participants lists every person and every ` +
    `agent that keeps a standing inbox, with the id of each.`
  )
}
