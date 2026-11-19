// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ADDRESS FOR BROWSERS: THE ONE ADDRESS A PAGE LOAD IS SENT TO, SO THAT ONE PAIRING COVERS THE OFFICE.
 *
 *   GET  /api/office/address-for-browsers   the address in force, what the person chose, and what .env names
 *   POST /api/office/address-for-browsers   the person chooses the address, or takes the choice away
 *
 * src/server/lib/address-for-browsers.ts says what the address does and what is never sent anywhere.
 *
 * Both halves are remote, like the other settings on the page: the person may read and choose it from any
 * machine they open Mole Office on. What keeps the write theirs is the actor clause below, not the machine.
 *
 * ONLY THE PERSON, AND A RAISE ONLY WHERE THIS OFFICE SAYS IT CARRIES IT. Where the person's browser is sent is
 * where the person pairs, so an agent that could choose it could send the person to pair at an address of its
 * choosing. The secretary card keeps the door for the person, so an office that changed nothing refuses the grant
 * as before; an office whose list of what the grant carries says it may press lets a secretary holding the grant
 * choose it, and the change row names the secretary and the grant.
 * tests/every-person-only-check-is-sorted-for-a-raise.test.ts lists this file as carried.
 *
 * At off the gate who-chooses-the-address-for-browsers lets any agent its own key proves choose it too, and counts it.
 * The address must still be one of this computer's own at both positions.
 *
 * Every change is written in the office's change log with who made it and when, as the other settings are.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import {
  setTheAddressForBrowsers,
  theAddressForBrowsers,
  theAddressForBrowsersAsStored,
  whyTheAddressIsNotThisMachines,
  type AddressForBrowsers,
} from '../lib/address-for-browsers.ts'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
// THE REFUSAL FOR A REQUEST NOT PROVED TO BE THE PERSON, written in one place for every door that keeps an act for
// them. In a test world it also names who may act there (criterion P84).
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'
import { aRaiseCarriesIt, writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const READ_NOTE =
  'The one address a browser is sent to when it opens a page at another of this computer\'s own addresses, so one ' +
  'pairing covers the office. Read only, and no body is read. The reply is {inForce, chosen, fromTheEnvironment}: ' +
  'inForce is the address page loads are sent to now, or null when nothing is sent; chosen is what the person ' +
  'chose, or null when nobody has; fromTheEnvironment is what MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES names, which ' +
  'is in force when nobody has chosen. Only a page load is sent: GET or HEAD, outside /api, asking for HTML. An ' +
  'API call, loopback and an address that is not this computer\'s are never sent anywhere.'

const SET_NOTE =
  'Choose the address for browsers, or take the choice away. Body {"address": string | null}. The address is a ' +
  'name or a number on its own, with no http:// and no port; it is stored in lower case. It must be this ' +
  'computer\'s: a number must be one of its own network addresses and a name must resolve to one, or it is refused ' +
  'with a 400; a name that cannot be looked up just now is refused with a 503. Either way nothing is stored. null takes the choice ' +
  'away, and then what MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES names is in force. Only the person may choose it; ' +
  'the secretary card keeps it for them, so a raise carries it only where this office\'s list of what the grant ' +
  'carries says the grant presses it. While the gate who-chooses-the-address-for-browsers is off, any agent proved ' +
  'by its own key may also choose it, and is counted. The reply is the reading as it now stands.'

const setBody = z.strictObject({ address: z.string().nullable() })

/** ONLY THE PERSON, WHOEVER HOLDS THEIR AUTHORITY IN A TEST WORLD, OR A RAISE THIS OFFICE LETS CARRY IT, MAY CHOOSE WHERE BROWSERS ARE SENT. */
function onlyThePersonMayChooseTheAddress(actor: Actor, req: FastifyRequest): void {
  if (thePersonIsProved(actor)) return
  if (actor.theOwnersAuthority?.holds === true) return
  // AND THE PERSON'S RAISE, WHERE THIS OFFICE'S LIST SAYS IT CARRIES THE ACT. The card keeps it, so an office that changed
  // nothing refuses a secretary holding the grant in the check's words. Asked last, so the raise is named only where
  // nothing else allowed it.
  // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate who-chooses-the-address-for-browsers lets any agent its
  // own key proves choose it too, and counts it, and the raise is not asked. At block the raise is asked as before, and
  // a change it carries is not counted.
  const position = gatePosition('who-chooses-the-address-for-browsers')
  if (position === 'block' && aRaiseCarriesIt(actor)) return
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-chooses-the-address-for-browsers', position!) !== 'block') return
  if (!keyed && position !== 'block') {
    throw refusedWhileTheGateIsOff(actor.id, 'who-chooses-the-address-for-browsers', 'choose the address browsers are sent to')
  }
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: 'Which address browsers are sent to is the owner\'s own setting',
      nothingWasDone: 'Nothing was changed.',
      whoMay:
        'The owner chooses it on the Settings page, because it decides where the owner pairs. A raise carries it only ' +
        'where this office\'s list of what the grant carries says so. An agent may read it and may file a proposal ' +
        'about it.',
    }),
    403,
  )
}

export async function addressForBrowsersRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/address-for-browsers',
    route('office.address-for-browsers', 'remote', READ_NOTE),
    async (): Promise<AddressForBrowsers> => theAddressForBrowsers(),
  )

  app.post(
    '/office/address-for-browsers',
    route('office.set-address-for-browsers', 'remote', SET_NOTE),
    async (req): Promise<AddressForBrowsers> => {
      const actor = actorFrom(req)
      onlyThePersonMayChooseTheAddress(actor, req)
      const body = parse(setBody, req.body ?? {}, 'The address for browsers')
      let address: string | null = null
      if (body.address !== null) {
        const checked = theAddressForBrowsersAsStored(body.address)
        if ('why' in checked) throw new PanelError(`${checked.why} Nothing was changed.`, 400)
        const notThisMachines = await whyTheAddressIsNotThisMachines(checked.address)
        if (notThisMachines !== null) throw new PanelError(`${notThisMachines.why} Nothing was changed.`, notThisMachines.status)
        address = checked.address
      }
      const before = theAddressForBrowsers()
      const after = setTheAddressForBrowsers(address)
      writeDownASettingChange(actor, {
        setting: 'address-for-browsers',
        field: 'the address browsers are sent to',
        before: before.chosen,
        after: after.chosen,
        workspaceId: workspaceOf(req),
      })
      return after
    },
  )
}
