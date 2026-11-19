// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SAY TO THEM THAT ONE OF THEIR SETTINGS WAS CHANGED FROM THEIR OTHER COMPUTER, by a
 * decision. The person, proved on a paired computer, may set their office keys, their summons
 * settings and the sandboxes' logins from there (`thePersonMayAskFromThere` in lib/reach.ts), and each change made
 * that way is said to them, as a line from Mole Office itself, so one they did not make is seen wherever they read
 * the office.
 *
 * A change made on this computer is not said: they made it at the machine, and the change log keeps it as before. The
 * line names what changed and never a value or an address (`aSettingChangedFromAnotherComputer` in shared/groups.ts).
 *
 * AND ONE A SECRETARY MADE FOR THEM. A decision lets a secretary set those settings, and the devices a summons
 * tells, on their quoted words or under their raise. Each such change is said to them the
 * same way (`aSettingChangedForHim`), naming who made it and on what. A secretary's request comes from this
 * computer, because these doors refuse an agent from any other, so a change is said once, by one of the two.
 */
import type { FastifyRequest } from 'fastify'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { writeASystemLineToOne } from './groups.ts'
import { arrivalOf } from '@shared/arrival-of.ts'
import type { Actor } from './records.ts'
import { workspaceOf } from './workspaces.ts'

/** Mole Office itself, as the office's other lines to one participant are written. */
function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/**
 * Write the line when this request came from another computer, after the change is made; answer its id, or null because
 * the request came from this computer and nothing is said. `what` finishes "…, from another computer" and starts with a
 * capital: "The sandboxes' login OPENCODE_API_KEY was set".
 */
export function sayItWasChangedFromAnotherComputer(req: FastifyRequest, what: string): string | null {
  if (arrivalOf(req) !== 'another machine') return null
  return writeASystemLineToOne({ kind: 'person', id: THE_PERSON }, workspaceOf(req), SYSTEM_LINES.aSettingChangedFromAnotherComputer(what), theOffice()).id
}

/**
 * Write the line when one of their acts, not a setting, was made from another computer: a card, a raise, a retirement, an
 * act taken back. Said the same way and for the same reason; `what` is written as above:
 * "A role card was given to agent-7".
 */
export function sayItWasDoneFromAnotherComputer(req: FastifyRequest, what: string): string | null {
  if (arrivalOf(req) !== 'another machine') return null
  return writeASystemLineToOne({ kind: 'person', id: THE_PERSON }, workspaceOf(req), SYSTEM_LINES.anActWasMadeFromAnotherComputer(what), theOffice()).id
}

/**
 * Write the line when a secretary made this change on their words or under their raise, after the change is made; answer its
 * id, or null because nothing of theirs was spent on it and nothing is said. Read from the marks `actsForThePerson` leaves on
 * the actor, so the line says what really allowed the act. `what` is written as for the line above.
 */
export function sayASecretaryChangedItForThem(req: FastifyRequest, actor: Actor, what: string): string | null {
  const how = actor.warrantUsed === true ? 'on your words' : actor.elevationUsed === true ? 'under your raise' : null
  if (how === null) return null
  return writeASystemLineToOne({ kind: 'person', id: THE_PERSON }, workspaceOf(req), SYSTEM_LINES.aSettingChangedForHim(what, actor.id, how), theOffice()).id
}
