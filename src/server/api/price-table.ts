// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRICE TABLE THE PERSON SETS IN SETTINGS. Criterion U3.
 *
 *   GET  /api/office/price-table   the table in force, who set it and when, and the unit
 *   POST /api/office/price-table   the person sets the table, or clears it
 *
 * ---------------------------------------------------------------------------------------
 * WHY BOTH ARE REMOTE, AND WHO MAY WRITE
 * ---------------------------------------------------------------------------------------
 *
 * The table belongs to the office and follows it, so the person may read and set it from whatever
 * machine they open Mole Office from. What keeps the write theirs is the actor clause below, the same
 * clause criterion U6 uses for what the office keeps: an agent is refused with a 403 that says who
 * may, unless it is a secretary holding the person's grant and this office's list of what the grant
 * carries lets the grant press it. The read answers the same refusal in words, so a page read by an
 * agent can say it before anybody presses.
 *
 * ---------------------------------------------------------------------------------------
 * EVERYTHING IS CHECKED BEFORE ANYTHING IS WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * The caller is checked first, then the body's shape, then the table itself with `readPriceTable`
 * inside `setThePriceTable`. Each refusal happens before the one write.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { theNoPriceTableSentence, thePriceUnitSentence } from '@shared/price-table.ts'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import {
  clearThePriceTable,
  setThePriceTable,
  thePriceTableAsStored,
  type ThePriceTableAsStored,
  type WhatThePriceTableDoorSays,
} from '../lib/price-table.ts'
import {
  aRaiseCarriesIt,
  writeDownASettingChange,
  writeDownAnActUnderTheRaise,
  type Actor,
} from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
// THE REFUSAL FOR A REQUEST NOT PROVED TO BE THE PERSON, written in one place for every door that keeps
// an act for them. In a test world it also names who may act there (criterion P84).
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'

const READ_NOTE =
  'The price table the Usage page estimates a price from, as the person set it in Settings. Read only, and ' +
  'no body is read. state is "none" when nobody has set a table, and then says carries the sentence saying so; ' +
  'it is "set" with the table, who set it and when. unit says what every price is per. refusal is null when ' +
  'this caller may change the table, and otherwise the words the write door refuses it with.'

const SET_NOTE =
  'Set or clear the price table. Body {"table": {"currency": string, "prices": {"<model>": {"input": number, ' +
  '"output": number, "cachedInput": number}}}} replaces the whole table; each price is in the currency per ' +
  'million tokens, and a model is matched by its exact name as a usage receipt carries it. Body {"clear": true} ' +
  'removes the table, so no price is estimated. The table is checked before anything is written, and a table ' +
  'that is not one is refused with nothing written. This is the owner\'s own act. A secretary holding the ' +
  'owner\'s grant may press it where this office\'s list of what the grant carries says so; any other agent is ' +
  'refused and the refusal names who may. While the gate who-changes-the-owners-settings is off, any agent proved ' +
  'by its own key may also press it, and is counted, and a change it makes is written down with its name. The reply ' +
  'is the reading as it now stands.'

/** Set a whole table, or clear it. The table itself is checked by `readPriceTable`, not here. */
const setBody = z.union([z.strictObject({ table: z.unknown() }), z.strictObject({ clear: z.literal(true) })])

/**
 * WHY THIS CALLER MAY NOT CHANGE THE PRICE TABLE, or null when it may.
 *
 * The same clause `onlyThePersonMayChangeWhatIsKept` asks. The read answers these words and the
 * write throws them, so the page and the refusal cannot say different things.
 *
 * `byTheGate` says the gate who-changes-the-owners-settings let the caller through at off, so the change is written
 * down with that agent's name. The gate counts only a press: the read asks the same with `pressed` false.
 */
function whyThisCallerMayNotSetThePriceTable(
  actor: Actor,
  req: FastifyRequest,
  pressed: boolean,
): { refusal: string | null; byTheGate: boolean } {
  if (thePersonIsProved(actor)) return { refusal: null, byTheGate: false }
  if (actor.theOwnersAuthority?.holds === true) return { refusal: null, byTheGate: false }
  // AND A SECRETARY THE PERSON HAS RAISED. A raised secretary holds the person's acts but a few, and this
  // is not one of them. Asked last, so the grant is named on the act only when nothing else allowed it.
  // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate lets any agent its own key proves change the table
  // too, and the raise is not asked. At block the raise is asked as before, and a change it carries is not counted.
  const position = gatePosition('who-changes-the-owners-settings')
  if (position === 'block' && aRaiseCarriesIt(actor)) return { refusal: null, byTheGate: false }
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && pressed) gateMet('who-changes-the-owners-settings', position!)
  if (keyed && position !== 'block') return { refusal: null, byTheGate: true }
  if (!keyed && position !== 'block') {
    return { refusal: refusedWhileTheGateIsOff(actor.id, 'who-changes-the-owners-settings', 'change the price table').message, byTheGate: false }
  }
  // THE WORDS ARE WRITTEN IN ONE PLACE, lib/not-proved-the-person.ts, from the facts of this request:
  // why it is not the person and the way on for its kind of caller, and in a test world who may act there.
  const refusal = theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
    refused: "The price table is the owner's own setting",
    nothingWasDone: 'Nothing was changed.',
    whoMay:
      'The owner sets the price table on the Settings page. An agent may read it and may file a proposal about ' +
      'it; it may not set the prices this office estimates with.',
  })
  return { refusal, byTheGate: false }
}

/** The table as stored, with the unit, the absence sentence and this caller's refusal beside it. */
function whatTheDoorSays(stored: ThePriceTableAsStored, actor: Actor, req: FastifyRequest): WhatThePriceTableDoorSays {
  return {
    ...stored,
    unit: thePriceUnitSentence(),
    says: stored.reading.state === 'none' ? theNoPriceTableSentence() : null,
    refusal: whyThisCallerMayNotSetThePriceTable(actor, req, false).refusal,
  }
}

export async function priceTableRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/price-table',
    route('office.price-table', 'remote', READ_NOTE),
    async (req): Promise<WhatThePriceTableDoorSays> => whatTheDoorSays(thePriceTableAsStored(), actorFrom(req), req),
  )

  app.post(
    '/office/price-table',
    route('office.set-price-table', 'remote', SET_NOTE),
    async (req): Promise<WhatThePriceTableDoorSays> => {
      const actor = actorFrom(req)
      const { refusal, byTheGate } = whyThisCallerMayNotSetThePriceTable(actor, req, true)
      if (refusal !== null) throw new PanelError(refusal, 403)
      const body = parse(setBody, req.body ?? {}, 'The price table change')
      const before = thePriceTableAsStored()
      const stored = 'clear' in body ? clearThePriceTable() : setThePriceTable(body.table, actor)
      // An agent the gate let through at off is written down by name, as the change log names any change.
      ;(byTheGate ? writeDownASettingChange : writeDownAnActUnderTheRaise)(actor, {
        setting: 'price-table',
        field: 'the price table',
        before: before.reading,
        after: stored.reading,
        workspaceId: workspaceOf(req),
      })
      return whatTheDoorSays(stored, actor, req)
    },
  )
}
