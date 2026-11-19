// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SANDBOX MEMORY LIMIT'S DOORS: all sandboxes together get one memory limit.
 *
 *   GET  /api/office/sandbox-memory-cap   whether all sandboxes together are held to 60G, and the exact commands   (the person, or a secretary under their grant)
 *   POST /api/office/sandbox-memory-cap   their press, {"on": true | false}: set the limit or take it away       (the person, or a secretary under their grant)
 *
 * src/config/sandbox-memory-cap.mjs says what runs, why it runs through pkexec with fixed arguments, and what each
 * answer means. These doors never pass it a program of their own: what runs is what the page shows.
 *
 * THE PERSON, OR A SECRETARY HOLDING THEIR GRANT. The press runs a command as root on their computer, through the
 * system's own dialog for their password, so the card keeps both doors and a secretary presses them only where this
 * office's list of what the grant carries says the grant does. The press still asks the person at that dialog, and an
 * answer that did not get the password says nothing changed.
 * tests/every-person-only-check-is-sorted-for-a-raise.test.ts lists this file as carried.
 *
 * Both doors stay on this machine: the dialog appears on this computer's screen.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { pressTheSandboxCap, readTheSandboxCap, theMachinesMemory, THE_CAP_OFF_TEXT, THE_CAP_ON_TEXT, THE_SANDBOX_CAP, THE_SANDBOX_CAP_BYTES } from '../../config/sandbox-memory-cap.mjs'
import { SANDBOX_SLICE } from '../../config/sandbox-slice.mjs'
import type { SandboxCapDone, SandboxCapReading } from '../../shared/sandbox-memory-cap.ts'
import type { CodedRefusal, SandboxCapRefusalCode } from '../../shared/refusal-codes.ts'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { aRaiseCarriesIt, assertThePersonIsProved, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { route } from '../lib/route.ts'
import { theWorldsOwnAuthority } from '../lib/worldauthority.ts'

const READ_NOTE =
  'WHETHER ALL SANDBOXES TOGETHER ARE HELD TO ONE MEMORY LIMIT. Only the proved person may read it, or a secretary ' +
  'holding their grant where this office\'s list of what the grant carries says the grant presses it, here on this ' +
  `computer. It asks \`systemctl show ${SANDBOX_SLICE} -p MemoryMax --value\`, which needs no root, and answers on ` +
  `(${THE_SANDBOX_CAP}), off (no limit), other (a limit that is not ${THE_SANDBOX_CAP}) or unreadable, with the exact ` +
  'commands the two presses run as administrator. Takes nothing and writes nothing.'

const PRESS_NOTE =
  'THE PRESS: HOLD ALL SANDBOXES TOGETHER TO ONE MEMORY LIMIT, OR TAKE IT AWAY. Only the proved person may press, or a ' +
  'secretary holding their grant where this office\'s list of what the grant carries says the grant presses it, here ' +
  'on this computer; a test world is refused before anything runs. Body {"on": true | false}. Runs ' +
  `\`${THE_CAP_ON_TEXT}\` or \`${THE_CAP_OFF_TEXT}\`, so the system\'s own dialog asks for the person\'s password, and ` +
  'an answer given under the grant says so. Answers done ' +
  '(and the read afterwards agrees), already (nothing run), cancelled, not authorized, no dialog (none answered within ' +
  'a minute; the request was stopped and nothing changed), failed with the reason, or not readable (nothing run).'

const thePress = z.object({ on: z.boolean() }).strict()

/** A refusal of these doors, with its code, so the page draws it in its own language. */
function aRefusal(code: SandboxCapRefusalCode, sentence: string, status: number): PanelError {
  return new PanelError(sentence, status, undefined, undefined, undefined, { code, values: {} } as CodedRefusal)
}

/**
 * THE ONE PERSON-ONLY CHECK OF THIS FILE, asked first by both doors, before anything else is read or run. The person
 * first, then the grant this office's list may open the door to, and the old refusal otherwise.
 */
function onlyThePerson(actor: Actor, doing: string): void {
  if (thePersonIsProved(actor)) return
  if (aRaiseCarriesIt(actor)) return
  try {
    assertThePersonIsProved(
      actor,
      doing,
      'Only the person may set the memory limit of the sandboxes, or a secretary holding the person\'s grant where this ' +
        'office\'s list of what the grant carries says so. Any other agent is refused.',
    )
  } catch (err) {
    if (err instanceof PanelError) throw aRefusal('sandboxCapOnlyThePerson', err.message, err.status)
    throw err
  }
}

export async function sandboxMemoryCapRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/sandbox-memory-cap',
    route('office.sandbox-memory-cap', 'local', { because: 'acts-on-this-machine', act: 'Reading the memory limit of all sandboxes together on this computer' }, READ_NOTE),
    async (req): Promise<SandboxCapReading> => {
      onlyThePerson(actorFrom(req), theActKeptHere(req))
      takesNoInput(req, 'GET /api/office/sandbox-memory-cap', 'It takes nothing: it asks systemd on this computer.')
      const reading = await readTheSandboxCap()
      return { ...reading, cap: THE_SANDBOX_CAP, capBytes: THE_SANDBOX_CAP_BYTES, machineBytes: theMachinesMemory(), slice: SANDBOX_SLICE, onCommand: THE_CAP_ON_TEXT, offCommand: THE_CAP_OFF_TEXT }
    },
  )

  app.post(
    '/office/sandbox-memory-cap',
    route('office.set-sandbox-memory-cap', 'local', { because: 'acts-on-this-machine', act: 'Setting or taking away the memory limit of all sandboxes together on this computer' }, PRESS_NOTE),
    async (req): Promise<SandboxCapDone> => {
      const actor = actorFrom(req)
      onlyThePerson(actor, theActKeptHere(req))
      // A TEST WORLD IS NOT THE OFFICE, but its sandboxes are this computer's: a press in a world would change the limit
      // of every real sandbox, as root. So it is refused before anything runs.
      if (theWorldsOwnAuthority().inATestWorld) {
        throw aRefusal(
          'sandboxCapTestWorld',
          'This Mole Office is a test world, and the memory limit of the sandboxes is a setting of the whole computer. ' +
            'Nothing was run. Press it on the office itself.',
          409,
        )
      }
      const body = parse(thePress, req.body ?? {}, 'The sandbox memory limit press is not usable:')
      const done = await pressTheSandboxCap(body.on)
      // THE PASSWORD IS THE PERSON'S, EVEN WHEN A SECRETARY PRESSES. The system's own dialog appears on this computer's
      // screen and the person answers it there, so a press under the grant says so. A dialog that was cancelled or never
      // answered changed nothing, and the answer keeps saying that.
      const says = actor.elevationUsed === true
        ? `The system's own dialog asks for the person's password. ${done.says}`
        : done.says
      return { outcome: done.outcome, reason: done.reason, says }
    },
  )
}
