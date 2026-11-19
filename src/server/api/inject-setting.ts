// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER AGENTS MAY INJECT: ONE SWITCH FOR EVERY AGENT. Criteria M84 and M91, and the owner's decision of
 * 25 September 2026.
 *
 *   GET  /api/office/agents-may-inject   whether agents may inject, and whether anybody chose
 *   POST /api/office/agents-may-inject   the person switches it on or off
 *
 * Built like the what-is-kept door (src/server/api/what-is-kept.ts). Both halves are remote: the
 * switch belongs to the office, so the person may read and press it from any machine they open Mole
 * Office on. What keeps the write theirs is the actor clause below, not the machine.
 *
 * THE DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING. Who is asking is checked first, then the
 * body, and only then is the one column written.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { MayInject } from '@shared/profile.ts'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { setWhetherAgentsMayInject, whetherAgentsMayInject } from '../lib/inject-setting.ts'
import { aRaiseCarriesIt, writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { whoMayDoThePersonsActsHere } from '../lib/worldauthority.ts'

const READ_NOTE =
  'Whether agents may inject a message to a person. It is one switch for every agent, kept on the office\'s ' +
  'installation row. Read only, and no body is read. The reply is {may, nobodyChose, says, whereItIsSet}: ' +
  'nobodyChose is true when nobody has pressed the switch, and then agents may inject. The message door, the ' +
  'profile and this door all ask the same reader.'

const SET_NOTE =
  'Switch injecting on or off for every agent. Body {"may": true | false | null}; null takes the choice away ' +
  'again, which reads as agents may inject. This is the owner\'s own act. A secretary holding the owner\'s ' +
  'grant may press it where this office\'s list of what the grant carries says so; any other agent is refused ' +
  'and the refusal names who may. While the gate who-switches-whether-agents-may-inject is off, any agent proved by ' +
  'its own key may also press it, and is counted. The reply is the reading as it now stands.'

/** The one value a person may set. */
const setBody = z.strictObject({ may: z.boolean().nullable() })

/**
 * ONLY THE PERSON, OR WHOEVER HOLDS THEIR AUTHORITY IN A TEST WORLD, MAY SWITCH INJECTING.
 *
 * The same clause the what-is-kept door and the goal-spans door ask, with its own sentence so the
 * refusal says what this act is. An agent may read the switch and may file a proposal about it; it
 * may not decide whether agents may inject.
 */
function onlyThePersonMaySwitchInjecting(actor: Actor): void {
  if (thePersonIsProved(actor)) return
  if (actor.theOwnersAuthority?.holds === true) return
  // AND A SECRETARY THE PERSON HAS RAISED. A raised secretary holds the person's acts but a few, and this
  // is not one of them. Asked last, so the grant is named on the act only when
  // nothing else allowed it.
  // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate who-switches-whether-agents-may-inject lets any agent
  // its own key proves switch it too, and counts it, and the raise is not asked. At block the raise is asked as before,
  // and a change it carries is not counted.
  const position = gatePosition('who-switches-whether-agents-may-inject')
  if (position === 'block' && aRaiseCarriesIt(actor)) return
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-switches-whether-agents-may-inject', position!) !== 'block') return
  if (!keyed && position !== 'block') {
    throw refusedWhileTheGateIsOff(actor.id, 'who-switches-whether-agents-may-inject', 'switch whether agents may send a person an urgent message')
  }
  const inAWorld = whoMayDoThePersonsActsHere()
  throw new PanelError(
    `Whether agents may inject is the owner's own setting, and this request was made by "${actor.id}", which is ` +
      'not the owner. Nothing was changed. ' +
      (inAWorld === null ? '' : `${inAWorld} `) +
      'The owner switches it on the Settings page. An agent may read it and may file a proposal about it; it ' +
      'may not decide whether agents may inject.',
    403,
  )
}

export async function injectSettingRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/agents-may-inject',
    route('office.agents-may-inject', 'remote', READ_NOTE),
    async (): Promise<MayInject> => whetherAgentsMayInject(),
  )

  app.post(
    '/office/agents-may-inject',
    route('office.set-agents-may-inject', 'remote', SET_NOTE),
    async (req): Promise<MayInject> => {
      const actor = actorFrom(req)
      onlyThePersonMaySwitchInjecting(actor)
      const body = parse(setBody, req.body ?? {}, 'Whether agents may inject')
      const before = whetherAgentsMayInject()
      const after = setWhetherAgentsMayInject(body.may)
      // WHAT WAS CHOSEN, NOT ONLY WHAT IT READS AS: null is nobody having chosen, which reads as true, so a press from
      // nobody's choice to "on" is a change and is written down (problem 4f6oWJdzJbnk).
      const chosen = (reading: MayInject): boolean | null => (reading.nobodyChose ? null : reading.may)
      writeDownASettingChange(actor, { setting: 'agents-may-inject', field: 'whether agents may inject', before: chosen(before), after: chosen(after), workspaceId: workspaceOf(req) })
      return after
    },
  )
}
