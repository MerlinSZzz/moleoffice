// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH ADDRESS IS WHICH MACHINE: THE PERSON'S TABLE. Problem 8Kf0hCaK4lQY, settled by
 * a decision.
 *
 *   GET  /api/office/machine-names   every address the person has named, and the name they gave it
 *   POST /api/office/machine-names   the person names the machine at one address, renames it, or takes the name away
 *
 * Built like the what-is-kept door (./what-is-kept.ts). Both halves are remote: the names belong to the office, so the person
 * may read and write them from any machine they open Mole Office on. What keeps the write theirs is the actor clause
 * below, not the machine.
 *
 * EVERY REFUSAL CARRIES A CODE (src/shared/refusal-codes.ts), because the Settings entry draws it: the page says it
 * from the word lists in its own language, and the English sentence stays on the reply for an agent.
 *
 * THE DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING. Who is asking is checked first, then the body, and only then
 * is the one column written. Every change is written in the office's change log with who made it and when
 * (problem 4f6oWJdzJbnk), and the reply gives back what was stored.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { setTheMachineName, theAddressAsStored, theMachineNames, type NamedMachine } from '../lib/machine-names.ts'
import { theNameAsStored } from '@shared/machine-name.ts'
import { aRaiseCarriesIt, writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
// THE REFUSAL FOR A REQUEST NOT PROVED TO BE THE PERSON, written in one place for every door that keeps an act for
// them. In a test world it also names who may act there (criterion P84).
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'

const READ_NOTE =
  'Every address the person has named, and the name the person gave the machine at it, sorted by name. Read only, and no ' +
  'body is read. The reply is {machines: [{address, name}]}; an empty list means nobody has named any address. A ' +
  'message written from a named address stores the name the person gave it in data.writtenFrom, with the address beside it.'

const SET_NOTE =
  'Name the machine at one address, rename it, or take its name away. Body {"address": string, "name": string | ' +
  'null}. The address must be an IPv4 or IPv6 address; an IPv4 address written inside IPv6 is stored as the IPv4 ' +
  'address. The name is trimmed, runs of spaces become one, and it must be 1 to 40 characters. null takes the name ' +
  'away. This is the owner\'s own act. A secretary holding the owner\'s grant may press it where this office\'s ' +
  'list of what the grant carries says so; any other agent is refused and the refusal names who may. The reply is ' +
  '{machines, stored}: the table as it now stands, and the address and name as they were stored.'

const setBody = z.strictObject({ address: z.string(), name: z.string().nullable() })

/** What the write door answers. */
export interface MachineNamesWritten {
  machines: NamedMachine[]
  /**
   * What was stored, in the stored forms: the address and its name, or the address and null when its name was taken
   * away. The page says it back in its own words, from the word lists.
   */
  stored: { address: string; name: string | null }
}

/**
 * ONLY THE PERSON, OR WHOEVER HOLDS THEIR AUTHORITY IN A TEST WORLD, MAY NAME A MACHINE.
 *
 * The same clause the what-is-kept door asks. An agent may read the names; it may not decide what a message says
 * about where it was written from.
 */
function onlyThePersonMayNameAMachine(actor: Actor, req: FastifyRequest): void {
  if (thePersonIsProved(actor)) return
  if (actor.theOwnersAuthority?.holds === true) return
  // AND A SECRETARY THE PERSON HAS RAISED. A raised secretary holds the person's acts but a few, and this
  // is not one of them. Asked last, so the grant is named on the act only when
  // nothing else allowed it.
  if (aRaiseCarriesIt(actor)) return
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: 'Which address is which machine is the owner\'s own table',
      nothingWasDone: 'Nothing was changed.',
      whoMay:
        'The owner names the machines on the Settings page. An agent may read the names and may file a proposal ' +
        'about them; it may not decide which machine an address is.',
    }),
    403,
    undefined,
    undefined,
    undefined,
    { code: 'machineNamesOwnerNotProved', values: {} },
  )
}

export async function machineNamesRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/machine-names',
    route('office.machine-names', 'remote', READ_NOTE),
    async (): Promise<{ machines: NamedMachine[] }> => ({ machines: theMachineNames() }),
  )

  app.post(
    '/office/machine-names',
    route('office.set-machine-names', 'remote', SET_NOTE),
    async (req): Promise<MachineNamesWritten> => {
      const actor = actorFrom(req)
      onlyThePersonMayNameAMachine(actor, req)
      const body = parse(setBody, req.body ?? {}, 'A machine\'s name')
      const address = theAddressAsStored(body.address)
      if (address === null) {
        throw new PanelError(
          `${JSON.stringify(body.address)} is not an address. Write an IPv4 address such as 192.0.2.10, or an IPv6 ` +
            'address. Nothing was changed.',
          400,
          undefined,
          undefined,
          undefined,
          { code: 'machineAddressNotAnAddress', values: {} },
        )
      }
      let name: string | null = null
      if (body.name !== null) {
        const checked = theNameAsStored(body.name)
        if ('why' in checked) {
          throw new PanelError(`${checked.why} Nothing was changed.`, 400, undefined, undefined, undefined, { code: 'machineNameNotAName', values: {} })
        }
        name = checked.name
      }
      const before = theMachineNames()
      const had = before.find((one) => one.address === address)?.name ?? null
      if (name === null && had === null) {
        throw new PanelError(
          `No name is stored for ${address}, so there is no name to take away. Nothing was changed.`,
          404,
          undefined,
          undefined,
          undefined,
          { code: 'machineNameNothingToRemove', values: {} },
        )
      }
      const machines = setTheMachineName(address, name)
      writeDownASettingChange(actor, {
        setting: 'machine-names',
        field: `the name of the machine at ${address}`,
        before: had,
        after: name,
        workspaceId: workspaceOf(req),
      })
      return { machines, stored: { address, name } }
    },
  )
}
