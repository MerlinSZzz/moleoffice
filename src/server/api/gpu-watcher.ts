// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GPU WATCHER: SET ON THE SETTINGS PAGE, OR BY THE .ENV LINE. Wave 13v round 35b.
 *
 *   GET  /api/office/gpu-watcher   who is the GPU watcher now, and where that came from
 *   POST /api/office/gpu-watcher   name one agent, or nobody
 *
 * The reader, the writer and the order of the two places are in lib/gpu-watcher.ts. Both halves are remote: the
 * setting belongs to the office, so it may be read and changed from any machine the office is opened on. What keeps
 * the write in the right hands is the actor clause below, not the machine.
 *
 * THE DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING. Who is asking is checked first, then the body and the reason,
 * then whether the agent can watch, and only then is the one change row written.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { setTheGpuWatcher, theGpuWatcher, type TheGpuWatcher } from '../lib/gpu-watcher.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { theKeyProvesASecretary } from '../lib/the-key-proves-a-secretary.ts'
import { type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { whoMayDoThePersonsActsHere } from '../lib/worldauthority.ts'

const READ_NOTE =
  'Who is the GPU watcher: besides the owner, the one agent that may hand in a reading of the host GPU card and ' +
  'record a cut-in step on a booking. Read only, and no body is read. The reply is {inForce, stored, everSet, ' +
  'because, says, mayBeNamed}. inForce.from is "the .env line" (MOLE_OFFICE_GPU_WATCHER names a handle, and it wins), ' +
  '"set here" (the setting names an agent that can watch), "set here, cannot watch" (the agent it names is retired ' +
  'or not registered, so nobody watches) or "nobody named". everSet is false when nobody has ever set it; the office ' +
  'then sets it once at start from the readings it accepted, when one agent handed them all in.'

const SET_NOTE =
  'Set the GPU watcher. Body {agent: "<handle or id>" | null, because: "<why>"}; null names nobody. The owner may, ' +
  'with or without a reason. A secretary proved by its own key may, and must give a reason. Any other agent is ' +
  'refused, except that while the gate who-names-the-gpu-watcher is off any agent proved by its own key may, with a ' +
  'reason, and is counted. The agent must be registered and not retired. Every change is kept with who, when and why (the newest is ' +
  'in GET /api/office/setting-changes, as gpu-watcher). MOLE_OFFICE_GPU_WATCHER, when set, still wins over this ' +
  'setting. The reply is the reading as it now stands.'

/** What a caller may send: one agent or nobody, and a reason. */
const setBody = z.strictObject({
  agent: z.string().trim().min(1).nullable(),
  because: z.string().optional(),
})

/**
 * THE OWNER, OR THE HOLDER OF THE SECRETARY CARD WITH A REASON, MAY SET THE GPU WATCHER. Any other agent may read the
 * setting and may file a proposal about it; the watcher it would name could then hand in readings of the card.
 *
 * The answer is whether a reason is required: the owner's press needs none, a secretary's change does.
 *
 * While the gate who-names-the-gpu-watcher is off, any agent its own key proves may set it too, with a reason, and the
 * gate counts it.
 */
function whoMaySetTheGpuWatcher(actor: Actor): { reasonRequired: boolean } {
  if (thePersonIsProved(actor)) return { reasonRequired: false }
  if (actor.theOwnersAuthority?.holds === true) return { reasonRequired: false }
  if (theKeyProvesASecretary(actor)) return { reasonRequired: true }
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (!keyed && gatePosition('who-names-the-gpu-watcher') !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-names-the-gpu-watcher', 'name the GPU watcher, with a reason')
  if (keyed && gateMet('who-names-the-gpu-watcher') !== 'block') return { reasonRequired: true }
  const inAWorld = whoMayDoThePersonsActsHere()
  throw new PanelError(
    `The GPU watcher is set by the owner or by the holder of the secretary card with a reason, and this request was ` +
      `made by "${actor.id}", which is neither. Nothing was changed. ` +
      (inAWorld === null ? '' : `${inAWorld} `) +
      'A secretary is proved by its own key. Any agent may read the setting and may file a proposal about it.',
    403,
  )
}

export async function gpuWatcherRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/gpu-watcher',
    route('office.gpu-watcher', 'remote', READ_NOTE),
    async (): Promise<TheGpuWatcher> => theGpuWatcher(),
  )

  app.post(
    '/office/gpu-watcher',
    route('office.set-gpu-watcher', 'remote', SET_NOTE),
    async (req): Promise<TheGpuWatcher> => {
      const actor = actorFrom(req)
      const { reasonRequired } = whoMaySetTheGpuWatcher(actor)
      const body = parse(setBody, req.body ?? {}, 'The GPU watcher')
      const because = body.because?.trim() ? body.because.trim() : null
      if (reasonRequired && because === null) {
        throw new PanelError('A secretary who changes the GPU watcher gives a reason, in "because". Nothing was changed.', 400)
      }
      // THE AGENT MAY BE NAMED BY ITS ID OR ITS HANDLE. The one resolver says which agent it is, and the setting
      // stores its registry id. A name nobody bears is refused here, before anything.
      let id: string | null = null
      if (body.agent !== null) {
        const found = theAgentAnArrivingReferenceNames(body.agent, 'writing')
        if (found === null) {
          throw new PanelError(
            `No agent here answers to "${body.agent}", so it cannot be the GPU watcher. ` +
              'GET /api/office/gpu-watcher lists the agents that may. Nothing was changed.',
            400,
          )
        }
        id = found.agent.id
      }
      return setTheGpuWatcher(actor, id, because, workspaceOf(req))
    },
  )
}
