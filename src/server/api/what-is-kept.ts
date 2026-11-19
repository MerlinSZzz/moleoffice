// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE OFFICE KEEPS: THE THREE NUMBERS, AND THE BACKUPS FOLDER AS IT STANDS NOW. Criterion U6.
 *
 *   GET  /api/office/what-is-kept   what is in force, and the folder read at this moment
 *   POST /api/office/what-is-kept   the person sets one or more of the three numbers
 *
 * ---------------------------------------------------------------------------------------
 * WHY BOTH ARE REMOTE
 * ---------------------------------------------------------------------------------------
 *
 * The numbers belong to the office and follow it, so the person may read and set them from whatever
 * machine they open Mole Office from, exactly as they read the key window's state. What keeps the
 * write theirs is not the machine but the actor clause below: an agent is refused and the refusal says
 * who may, unless it is a secretary holding the person's grant and this office's list of what the
 * grant carries lets the grant press it. This is NOT one of the acts that must happen on this
 * computer — it names no folder and touches no process — so it is not `local`, and no machine-only
 * reason is claimed for it.
 *
 * ---------------------------------------------------------------------------------------
 * THE READ DOES NOT THROW ON A BAD VALUE, AND THE WRITE DOES NOT GUESS
 * ---------------------------------------------------------------------------------------
 *
 * `whatTheOfficeKeeps` carries a present-but-unreadable number as a refusal in the reading, so the
 * section can say which setting it was while the other numbers stay readable. A reader that cannot
 * continue without the value — the prune and the Usage page — calls `theKeptNumberInForce`, which
 * throws. Nothing here substitutes a default for a value somebody wrote and the office cannot read.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { WhatTheOfficeKeeps } from '@shared/what-is-kept.ts'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { aRaiseCarriesIt, writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { WHAT_IS_KEPT_CHECK, setWhatTheOfficeKeeps, theChosenNumbers, whatTheOfficeKeeps } from '../lib/what-is-kept.ts'
// THE REFUSAL FOR A REQUEST NOT PROVED TO BE THE PERSON, written in one place for every door that keeps
// an act for them. In a test world it also names who may act there (criterion P84).
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'

const READ_NOTE =
  'What the office keeps, as three numbers, and the folder of backups as it stands at this moment. Read ' +
  'only, and no body is read. The numbers are how many backups to keep, how many days an untraced request ' +
  'row is kept, and how many days a traced one is kept. A number nobody has chosen is drawn with the ' +
  'default and the sentence saying nobody chose; a number that is stored and cannot be read is drawn as a ' +
  'refusal naming it, never as a default. The folder is listed fresh on every request, so the count, the ' +
  'total size and the newest moment are true of the directory now.'

const SET_NOTE =
  'Set one or more of the three numbers. Body {"keepBackups"?: number, "untracedRequestDays"?: number, ' +
  '"tracedRequestDays"?: number}, each a whole number of at least 1 and at most 100000, or null to take ' +
  'the choice away and return it to nobody-having-chosen. Only the keys the body names are written, so ' +
  'one number can be changed without rewriting the others. This is the owner\'s own act. A secretary ' +
  'holding the owner\'s grant may press it where this office\'s list of what the grant carries says so; ' +
  'any other agent is refused and the refusal names who may. While the gate who-changes-the-owners-settings is off, ' +
  'any agent proved by its own key may also press it, and is counted. The reply is the whole reading as it now stands.'

/**
 * ONLY THE PERSON, OR WHOEVER HOLDS THEIR AUTHORITY IN A TEST WORLD, MAY CHANGE WHAT THE OFFICE KEEPS.
 *
 * The same clause the key window's close and the trusted-machine presses ask. Its own sentence here,
 * because this act is not about a credential and a refusal that talks about one would send the reader
 * to the wrong place. An agent may read the numbers and may file a proposal about them; it may not
 * decide how much of the office's history is kept.
 */
function onlyThePersonMayChangeWhatIsKept(actor: Actor, req: FastifyRequest): void {
  if (thePersonIsProved(actor)) return
  if (actor.theOwnersAuthority?.holds === true) return
  // AND A SECRETARY THE PERSON HAS RAISED. A raised secretary holds the person's acts but a few, and this
  // is not one of them. Asked last, so the grant is named on the act only when nothing else allowed it.
  // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate who-changes-the-owners-settings lets any agent its own
  // key proves change the numbers too, and counts it, and the raise is not asked. At block the raise is asked as before,
  // and a change it carries is not counted.
  const position = gatePosition('who-changes-the-owners-settings')
  if (position === 'block' && aRaiseCarriesIt(actor)) return
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-changes-the-owners-settings', position!) !== 'block') return
  if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-changes-the-owners-settings', 'change what the office keeps')
  // THE WORDS ARE WRITTEN IN ONE PLACE, lib/not-proved-the-person.ts, from the facts of this request:
  // why it is not the person and the way on for its kind of caller, and in a test world who may act there.
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: "What the office keeps is the owner's own setting",
      nothingWasDone: 'Nothing was changed.',
      whoMay:
        'The owner sets these numbers on the Settings page. An agent may read them and may file a proposal about ' +
        'them; it may not decide how many backups this office keeps or how long its request rows survive.',
    }),
    403,
  )
}

export async function whatIsKeptRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/what-is-kept',
    route('office.what-is-kept', 'remote', READ_NOTE),
    async (): Promise<WhatTheOfficeKeeps> => whatTheOfficeKeeps(),
  )

  app.post(
    '/office/what-is-kept',
    route('office.set-what-is-kept', 'remote', SET_NOTE),
    async (req): Promise<WhatTheOfficeKeeps> => {
      const actor = actorFrom(req)
      onlyThePersonMayChangeWhatIsKept(actor, req)
      const body = parse(WHAT_IS_KEPT_CHECK, req.body ?? {}, 'What the office should keep')
      const before = whatTheOfficeKeeps()
      const after = setWhatTheOfficeKeeps(body)
      writeDownASettingChange(actor, { setting: 'what-is-kept', field: 'what the office keeps', before: theChosenNumbers(before), after: theChosenNumbers(after), workspaceId: workspaceOf(req) })
      return after
    },
  )
}
