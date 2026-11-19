// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PUSH DOORS: THE PERSON ALLOWS NOTIFICATIONS ON A DEVICE, AND THE OFFICE TELLS THOSE
 * DEVICES WHEN THE PERSON IS CALLED. The sending is lib/push.ts, and the summons
 * door tells every device (lib/summons.ts).
 *
 *   GET  /api/office/push                 the public key a browser subscribes with, and the person's devices, never their addresses
 *   POST /api/office/push/devices         the person allows notifications on the device they are on
 *   POST /api/office/push/devices/remove  the person stops them on a device, named by its id
 *   POST /api/office/push/test            the person sends one notification to a device, named by its id, to see it arrive
 *
 * ---------------------------------------------------------------------------------------
 * WHY THEY ARE THE PERSON'S, AND WHY FROM THE PERSON'S OTHER COMPUTER TOO
 * ---------------------------------------------------------------------------------------
 *
 * A device on the list receives every summons, so adding one is the person's act, as the person's summons settings are, and an agent is
 * refused from anywhere, but for a secretary acting for the person: on the person's words, or while the person has raised
 * it. A summons may be left to a secretary entirely. A change the secretary makes is written down and
 * said to the person. The devices the person allows are mostly not this computer: the person's other computer and their
 * phone. So the doors are `local` and declare `thePersonMayFromAnotherComputer`, as the settings doors
 * do. From another computer they are reached only by a request that proves the person with a paired
 * device's key and came over an encrypted door, and a device added or removed that way is said to the person
 * (lib/changed-from-another-computer.ts). A browser allows notifications only on an encrypted page anyway.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { actorFrom, actorWithTheWordsItActsOn, takesNoInput, theWordsInTheBody } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theSecretaryActingForThePerson, writeDownAnActUnderTheRaise, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { THE_LONGEST_DEVICE_NAME, type PushDevice, type PushOutcome, type PushState } from '@shared/push.ts'
import { aDeviceId, aDeviceThePageMayGive, forgetADevice, keepADevice, tellOneDevice, thePushState, theStoredDevices } from '../lib/push.ts'
import { sayASecretaryChangedItForThem, sayItWasChangedFromAnotherComputer } from '../lib/changed-from-another-computer.ts'
import { warrantBody } from './records.ts'
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'

const READ_NOTE =
  'Push notifications: the public key a browser subscribes with, and each device that takes notifications, by an id ' +
  'made from its address, its name and when it was allowed. No address is returned. The person\'s own read, or a ' +
  'secretary\'s while the person has raised it.'

const ADD_NOTE =
  'Allow notifications on a device. Body {"endpoint": the https address its browser made at its push service, ' +
  '"keys": {"p256dh", "auth"}, "name"?: one line, "warrant"?: the person\'s words}. Kept in the office\'s key file on this ' +
  'computer, never returned. Allowing twice on one device keeps one. The person\'s own act, or a secretary\'s for them ' +
  'on their words (a warrant whose `for` names office.push-allow) or under their raise, which is written down and said to ' +
  'them; any other agent is refused.'

const REMOVE_NOTE =
  'Stop notifications on a device. Body {"device": its id, as GET /api/office/push lists it, "warrant"?: the person\'s words}. ' +
  'The person\'s own act, or a secretary\'s for them on their words (a warrant whose `for` names office.push-stop) or ' +
  'under their raise, which is written down and said to them; any other agent is refused.'

const TEST_NOTE =
  'Send one notification to a device, to see that it arrives. Body {"device": its id, as GET /api/office/push lists ' +
  'it, "warrant"?: the person\'s words}. The reply says told, gone, refused or unreachable, and names no address. The person\'s ' +
  'own act, or a secretary\'s for them on their words (a warrant whose `for` names office.push-test) or under their raise.'

const aDevice = z.strictObject({
  endpoint: z.string().min(1).max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  name: z.string().max(THE_LONGEST_DEVICE_NAME * 4).optional(),
  warrant: warrantBody.optional(),
})

const oneDevice = z.strictObject({
  device: z.string().regex(/^[0-9a-f]{16}$/, 'a device id is 16 hexadecimal characters'),
  warrant: warrantBody.optional(),
})

/** The devices a summons tells, by name, for the change row: never an address. */
const theDevicesByName = (): string[] => theStoredDevices().map((one) => one.name)

/**
 * ONLY THE PERSON, OR WHOEVER HOLDS THE OWNER'S AUTHORITY IN A TEST WORLD, MAY READ OR CHANGE WHICH DEVICES TAKE
 * NOTIFICATIONS, OR A SECRETARY FOR THE PERSON. The same clause the person's summons settings ask, with its own sentence: a secretary
 * may change them for the person on the person's words, and read them while the person has raised it; the card is asked
 * first, so a worker carrying the person's words opens nothing.
 */
function onlyThePersonMayTouchTheirDevices(actor: Actor, req: FastifyRequest): void {
  if (thePersonIsProved(actor)) return
  if (actor.theOwnersAuthority?.holds === true) return
  if (theSecretaryActingForThePerson(actor)) return
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: `${theActKeptHere(req)} is the owner's own act`,
      nothingWasDone: 'Nothing was read or changed.',
      whoMay:
        'The owner allows notifications on the Settings page of each device where they want to be called. A ' +
        'secretary calls the owner with POST /api/office/summon, which tells every device the owner allowed, and may change ' +
        'them for the owner when it carries the person\'s words for this act (a warrant in the body) or while the owner has raised it.',
    }),
    403,
  )
}

export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.get('/office/push', route('office.push', 'local', {
    because: 'acts-on-this-machine',
    act: "Reading the owner's devices for notifications from the office's key file on this computer",
    thePersonMayFromAnotherComputer: true,
  }, READ_NOTE), async (req): Promise<PushState> => {
    onlyThePersonMayTouchTheirDevices(actorFrom(req), req)
    takesNoInput(req, 'GET /api/office/push', 'It takes nothing: it reads the key and the devices.')
    return thePushState()
  })

  app.post('/office/push/devices', route('office.push-allow', 'local', {
    because: 'acts-on-this-machine',
    act: "Writing a device for notifications into the file beside the database",
    thePersonMayFromAnotherComputer: true,
  }, ADD_NOTE), async (req): Promise<{ device: PushDevice; state: PushState }> => {
    const actor = actorWithTheWordsItActsOn(req, theWordsInTheBody(req), 'office.push-allow')
    onlyThePersonMayTouchTheirDevices(actor, req)
    const body = parse(aDevice, req.body ?? {}, 'The device')
    const before = theDevicesByName()
    const device = keepADevice(aDeviceThePageMayGive({ endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, name: body.name }))
    const what = `Notifications were allowed on a device, "${device.name}"`
    writeDownAnActUnderTheRaise(actor, { setting: 'push-devices', field: 'the devices a summons tells', before, after: theDevicesByName(), workspaceId: workspaceOf(req) })
    sayItWasChangedFromAnotherComputer(req, what)
    sayASecretaryChangedItForThem(req, actor, what)
    return { device, state: thePushState() }
  })

  app.post('/office/push/devices/remove', route('office.push-stop', 'local', {
    because: 'acts-on-this-machine',
    act: "Taking a device for notifications out of the file beside the database",
    thePersonMayFromAnotherComputer: true,
  }, REMOVE_NOTE), async (req): Promise<{ removed: boolean; state: PushState }> => {
    const actor = actorWithTheWordsItActsOn(req, theWordsInTheBody(req), 'office.push-stop')
    onlyThePersonMayTouchTheirDevices(actor, req)
    const body = parse(oneDevice, req.body ?? {}, 'The device')
    const before = theDevicesByName()
    const device = theStoredDevices().find((one) => aDeviceId(one.endpoint) === body.device)
    const removed = device === undefined ? false : forgetADevice(device.endpoint)
    if (removed) {
      const what = `Notifications were stopped on a device, "${device?.name ?? ''}"`
      writeDownAnActUnderTheRaise(actor, { setting: 'push-devices', field: 'the devices a summons tells', before, after: theDevicesByName(), workspaceId: workspaceOf(req) })
      sayItWasChangedFromAnotherComputer(req, what)
      sayASecretaryChangedItForThem(req, actor, what)
    }
    return { removed, state: thePushState() }
  })

  app.post('/office/push/test', route('office.push-test', 'local', {
    because: 'acts-on-this-machine',
    act: "Sending a test notification from this computer to one of the owner's devices",
    thePersonMayFromAnotherComputer: true,
  }, TEST_NOTE), async (req): Promise<PushOutcome> => {
    onlyThePersonMayTouchTheirDevices(actorWithTheWordsItActsOn(req, theWordsInTheBody(req), 'office.push-test'), req)
    const body = parse(oneDevice, req.body ?? {}, 'The device')
    const device = theStoredDevices().find((one) => aDeviceId(one.endpoint) === body.device)
    if (device === undefined) {
      throw new PanelError('No device with this id takes notifications: allow them on it first. Nothing was sent.', 404)
    }
    return tellOneDevice(device, { title: 'Mole Office', body: '这台设备能收到召唤通知了。', urgency: 'soon', tag: 'test' })
  })
}
