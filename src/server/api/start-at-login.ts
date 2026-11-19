// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE START-AT-LOGIN DOORS. Wave 13u, round 3, piece H9.
 *
 *   GET  /api/office/start-at-login   whether a systemd user unit starts the office at their login (the person, or a secretary under their grant)
 *   POST /api/office/start-at-login   their press, {"on": true | false}: turn it on or off          (the person, or a secretary under their grant)
 *
 * src/config/start-at-login.mjs says what the unit is, why each of its lines is there, what a user unit does and does
 * not do, and why neither press starts or stops the office that runs now. These doors only ask it, with this server's
 * own home folder and this server's own office, never a folder or an office the request names.
 *
 * THE PERSON, OR A SECRETARY HOLDING THEIR GRANT. Whether the office starts again after a reboot is the life of the
 * service on their computer, so the card keeps both doors and a secretary presses them only where this office's list of
 * what the grant carries says the grant does. The unit also puts a program to run under the person's login at every
 * login. tests/every-person-only-check-is-sorted-for-a-raise.test.ts lists this file as carried.
 *
 * Both doors stay on this machine: they ask systemd on this computer, under this server's login.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { readStartAtLogin, theOfficeThisServerIs, theUnitIsUnderAFile, turnStartAtLoginOff, turnStartAtLoginOn } from '../../config/start-at-login.mjs'
import { theOwnersHome } from '../../config/install-the-entry.mjs'
import type { StartAtLoginDone, StartAtLoginReading } from '../../shared/start-at-login.ts'
import type { CodedRefusal, StartAtLoginBackupRefusalCode, StartAtLoginRefusalCode } from '../../shared/refusal-codes.ts'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { aRaiseCarriesIt, assertThePersonIsProved, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { route } from '../lib/route.ts'
import { theWorldsOwnAuthority } from '../lib/worldauthority.ts'

const READ_NOTE =
  'WHETHER THE OFFICE STARTS AT THE PERSON\'S LOGIN. Only the proved person may read it, or a secretary holding their grant where ' +
  'this office\'s list of what the grant carries says the grant presses it, here on this computer. It answers whether ' +
  'systemd answers for the person\'s login (`not linux` on any other system), whether the unit ~/.config/systemd/user/mole-office.service ' +
  'is there and written by the press for this office as it is now, what `systemctl --user is-enabled` and `is-active` say, ' +
  'and whether lingering is on, as loginctl says. A user unit starts at the person\'s login, not at boot, unless lingering is on. ' +
  'Takes nothing and writes nothing.'

const PRESS_NOTE =
  'THE PRESS: START THE OFFICE AT LOGIN, OR STOP DOING SO. Only the proved person may press, or a secretary holding ' +
  'their grant where this office\'s list of what the grant carries says the grant presses it, here on this computer; a ' +
  'test world is refused. Body {"on": true | false}. On writes the user unit (copying an older one the press wrote beside it ' +
  'first, to the first backup name nothing has, so no press writes over a backup), asks systemd to read it again, and ' +
  'enables it, so it starts at the person\'s next login. Off disables it and keeps the ' +
  'file. Neither starts nor stops the office that runs now, and neither turns lingering on. A unit of that name the press ' +
  'did not write is refused and left as it is. Never needs root and never touches a system unit.'

const thePress = z.object({ on: z.boolean() }).strict()

/** A refusal of these doors, with its code, so the page draws it in its own language. */
function aRefusal(code: StartAtLoginRefusalCode | StartAtLoginBackupRefusalCode, sentence: string, status: number, values: Record<string, string> = {}): PanelError {
  return new PanelError(sentence, status, undefined, undefined, undefined, { code, values } as CodedRefusal)
}

/**
 * THE ONE PERSON-ONLY CHECK OF THIS FILE, asked first by both doors, before anything else is read. The person first,
 * then the grant this office's list may open the door to, and the old refusal otherwise.
 */
function onlyThePerson(actor: Actor, doing: string): void {
  if (thePersonIsProved(actor)) return
  if (aRaiseCarriesIt(actor)) return
  try {
    assertThePersonIsProved(
      actor,
      doing,
      'Only the person may say whether the office starts at login, or a secretary holding the person\'s grant where this ' +
        'office\'s list of what the grant carries says so. Any other agent is refused.',
    )
  } catch (err) {
    if (err instanceof PanelError) throw aRefusal('startAtLoginOnlyThePerson', err.message, err.status)
    throw err
  }
}

export async function startAtLoginRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/start-at-login',
    route('office.start-at-login', 'local', { because: 'acts-on-this-machine', act: 'Reading the office\'s start-at-login setting on this computer' }, READ_NOTE),
    async (req): Promise<StartAtLoginReading> => {
      onlyThePerson(actorFrom(req), theActKeptHere(req))
      takesNoInput(req, 'GET /api/office/start-at-login', 'It takes nothing: it reads systemd on this computer.')
      try {
        return readStartAtLogin({ home: theOwnersHome(), office: theOfficeThisServerIs() })
      } catch (err) {
        // A FILE WHERE A FOLDER OF THE UNIT GOES is refused with the presses' own code, never a 500 (round W28).
        const underAFile = theUnitIsUnderAFile(err)
        if (underAFile === null) throw err
        throw aRefusal(underAFile.code, underAFile.says, 409, underAFile.path === undefined ? {} : { path: underAFile.path })
      }
    },
  )

  app.post(
    '/office/start-at-login',
    route('office.set-start-at-login', 'local', { because: 'acts-on-this-machine', act: 'Changing the office\'s start-at-login setting on this computer' }, PRESS_NOTE),
    async (req): Promise<StartAtLoginDone> => {
      onlyThePerson(actorFrom(req), theActKeptHere(req))
      // A TEST WORLD SERVES FROM A COPY OF THE CHECKOUT THAT IS DELETED WITH IT, so a unit it wrote would start a copy
      // that is gone, under the person's real login (the mail tool's press refuses the same way, api/summons.ts).
      if (theWorldsOwnAuthority().inATestWorld) {
        throw aRefusal(
          'startAtLoginTestWorld',
          'This Mole Office is a test world. Its unit would start a copy of the checkout that is deleted with the world, ' +
            'under your real login. Nothing was changed. Press it on the office itself.',
          409,
        )
      }
      const body = parse(thePress, req.body ?? {}, 'The start-at-login press is not usable:')
      const input = { home: theOwnersHome(), office: theOfficeThisServerIs() }
      const done = body.on ? turnStartAtLoginOn(input) : turnStartAtLoginOff(input)
      if (!done.ok) throw aRefusal(done.code, done.says, 409, { ...(done.path === undefined ? {} : { path: done.path }), ...(done.beside === undefined ? {} : { beside: done.beside }) })
      return { turned: done.turned, wrote: 'wrote' in done ? done.wrote : [], says: done.says }
    },
  )
}
