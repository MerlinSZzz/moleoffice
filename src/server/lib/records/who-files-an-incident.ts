// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MAY FILE AN INCIDENT, IN A MODULE OF ITS OWN.
 *
 * The two checks were moved whole out of src/server/lib/records.ts with no change of behaviour: the
 * question both filing and closing ask, and the refusal of a filing by anybody else. records.ts
 * hands the names on with `export *`, so no caller changed.
 *
 * This file imports records.ts only for the Actor type. theCallersAgentRow comes from the file that
 * declares it, so nothing here is read through records.ts at run time.
 */
import { A_ROW_WITH_NO_ROLE_READS_AS, mayBeElevated } from '@shared/roles.ts'
import { gatePosition } from '../../../config/settings.mjs'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from '../gate-counts.ts'
import { PanelError } from '../panel-error.ts'
import { theCallersAgentRow } from './the-callers-agent-row.ts'
import type { Actor } from '../records.ts'
import { theRoleCards, theRoleCardsAreRead } from '../roles.ts'

/**
 * WHO MAY FILE AN INCIDENT, OR RECLASSIFY A RECORD INTO ONE. Criterion I4: "An incident is filed by
 * a secretary or the person." Called from the create path for `kind === INCIDENT_KIND` and from the
 * patch path when a kind change WOULD MAKE a record an incident (`nextKind === INCIDENT_KIND` and
 * the record was not one already) — the same reasoning `HUMAN_ONLY_KINDS`' reclassify refusal gives
 * for `decision`: changing a record INTO a kind only certain writers may create is the same act as
 * creating one, and a guard on one write path and not the other is not a guard.
 *
 * IT IS NOT CALLED ON EVERY PATCH TO AN EXISTING INCIDENT. Filing is one act, not every subsequent
 * edit: once an incident exists, an ordinary agent may still retitle it, add a corrective action or
 * change most of its fields exactly as it could for a `problem` — I4 narrows only the filing itself
 * and the responsibility sentences (`checkTheIncidentResponsibility` in `./patching.ts`). A generic "who
 * may write this kind at all" guard would refuse the OPEN_KINDS sweep in tests/guard-human-only.test.ts,
 * which is right to refuse that: nothing in the rule takes ordinary editing away from a worker.
 *
 * A PERSON ALWAYS PASSES. Where no role declaration has been read, this refuses nobody — the same
 * choice `checkTheNotebook` makes — because a refusal this file cannot point at a declaration for
 * would be inventing a rule rather than reading one.
 */
/**
 * THE ONE QUESTION BOTH "FILING" AND "CLOSING" ASK: is this actor the person, or an agent holding
 * the secretary card? Never throws, and never says WHAT was refused — each caller knows that better
 * than this function does, and a shared refusal sentence is how "filing" and "closing" end up
 * describing each other. Exported so `POST /api/records/:id/close-incident` in
 * src/server/api/incidents.ts asks the same question in its own words, rather than this file and
 * that route drifting into two answers about who a secretary is.
 *
 * A PERSON ALWAYS PASSES, and where no role declaration has been read this answers true for
 * everybody — the same choice `checkTheNotebook` makes — because a refusal this file cannot point
 * at a declaration for would be inventing a rule rather than reading one.
 */
export function actorMayActAsSecretaryOrThePerson(actor: Actor): boolean {
  if (actor.type === 'human') return true
  if (!theRoleCardsAreRead()) return true
  if (actor.type !== 'agent') return false
  const row = theCallersAgentRow(actor)
  const card = row?.role ?? A_ROW_WITH_NO_ROLE_READS_AS
  return mayBeElevated(theRoleCards(), card)
}

export function checkWhoMayFileAnIncident(actor: Actor): void {
  if (actorMayActAsSecretaryOrThePerson(actor)) return
  const met = () => gateMet('who-files-or-closes-an-incident')
  if (gatePosition('who-files-or-closes-an-incident') !== 'block') return void met()
  const card = theRoleCardsAreRead() ? theRoleCards().elevation.onlyThisCardCanHoldIt : 'secretary'
  throw gateMetOnceTheWriteIsTakenBack(new PanelError(
    `Filing an incident is the secretary's or the person's own act. This request came from ${actor.type} ` +
      `"${actor.id}", which does not hold the ${card} card, so nothing was written. Prepare what you have ` +
      `instead — the evidence, the timeline moments, the fields you can honestly support — and ask a secretary ` +
      `or the person to file it. A worker that finds an incident hands it on this way, and that is what you ` +
      `should do here.`,
    403,
  ), met)
}
