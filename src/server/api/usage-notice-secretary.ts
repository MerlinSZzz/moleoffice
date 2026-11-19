// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO TAKES THE USAGE NOTICES OF THE SANDBOXES' CLAUDE LOGIN. Wave 13y round 136.
 *
 *   GET  /api/office/usage-notice-secretary   who takes them now, and where that came from
 *   POST /api/office/usage-notice-secretary   choose one secretary, or nobody
 *
 * The reader, the writer and the order they are taken in are in lib/usage-notices.ts. Both halves are remote: the
 * setting belongs to the office, so it may be read and changed from any machine the office is opened on. What keeps
 * the write in the right hands is the actor clause below, not the machine.
 *
 * THE DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING. Who is asking is checked first, then the body and the reason,
 * then whether the agent is a secretary, and only then is the one change row written.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { theKeyProvesASecretary } from '../lib/the-key-proves-a-secretary.ts'
import { type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { setTheUsageNoticeSecretary, theUsageNoticeSecretary, type TheUsageNoticeSecretary } from '../lib/usage-notices.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const READ_NOTE =
  "Who takes the notices the office writes when the sandboxes' Claude login has used 50% or 80% of its seven days. " +
  'One secretary takes them. Read only, and no body is read. The reply is {inForce, stored, everSet, because, says, ' +
  'mayBeChosen}. inForce.from is "set here" (the setting names a secretary), "the first secretary appointed" (nobody ' +
  'is chosen, or the agent chosen is retired, not registered or no longer a secretary, and then inForce.chosen says ' +
  'which and why) or "no secretary" (nobody is told). The first appointed is the secretary registered first, then ' +
  'the first by id. mayBeChosen lists the secretaries, first appointed first.'

const SET_NOTE =
  "Choose the one secretary who takes the usage notices of the sandboxes' Claude login. Body {agent: \"<handle or " +
  'id>" | null, because: "<why>"}; null chooses nobody, and the first secretary appointed takes them. The owner may, ' +
  'with or without a reason. A secretary proved by its own key may, and must give a reason. Any other agent is ' +
  'refused. The agent must be a registered secretary that is not retired. Every change is kept with who, when and ' +
  'why. The reply is the reading as it now stands.'

/** What a caller may send: one agent or nobody, and a reason. */
const setBody = z.strictObject({
  agent: z.string().trim().min(1).nullable(),
  because: z.string().optional(),
})

/**
 * THE OWNER, OR A SECRETARY WITH A REASON, MAY CHOOSE WHO TAKES THE USAGE NOTICES. Any other agent may read the
 * setting. The answer is whether a reason is required: the owner's press needs none, a secretary's change does.
 */
function whoMayChooseTheReceiver(actor: Actor): { reasonRequired: boolean } {
  if (thePersonIsProved(actor)) return { reasonRequired: false }
  if (actor.theOwnersAuthority?.holds === true) return { reasonRequired: false }
  if (theKeyProvesASecretary(actor)) return { reasonRequired: true }
  throw new PanelError(
    `Who takes the usage notices is chosen by the owner or by a secretary with a reason, and this request was made ` +
      `by "${actor.id}", which is neither. Nothing was changed. A secretary is proved by its own key. Any agent may ` +
      'read the setting.',
    403,
  )
}

export async function usageNoticeSecretaryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/usage-notice-secretary',
    route('office.usage-notice-secretary', 'remote', READ_NOTE),
    async (): Promise<TheUsageNoticeSecretary> => theUsageNoticeSecretary(),
  )

  app.post(
    '/office/usage-notice-secretary',
    route('office.set-usage-notice-secretary', 'remote', SET_NOTE),
    async (req): Promise<TheUsageNoticeSecretary> => {
      const actor = actorFrom(req)
      const { reasonRequired } = whoMayChooseTheReceiver(actor)
      const body = parse(setBody, req.body ?? {}, 'Who takes the usage notices')
      const because = body.because?.trim() ? body.because.trim() : null
      if (reasonRequired && because === null) {
        throw new PanelError('A secretary who changes who takes the usage notices gives a reason, in "because". Nothing was changed.', 400)
      }
      // THE AGENT MAY BE NAMED BY ITS ID OR ITS HANDLE. The one resolver says which agent it is, and the setting
      // stores its registry id. A name nobody bears is refused here, before anything.
      let id: string | null = null
      if (body.agent !== null) {
        const found = theAgentAnArrivingReferenceNames(body.agent, 'writing')
        if (found === null) {
          throw new PanelError(
            `No agent here answers to "${body.agent}", so it cannot take the usage notices. ` +
              'GET /api/office/usage-notice-secretary lists the secretaries that may. Nothing was changed.',
            400,
          )
        }
        id = found.agent.id
      }
      return setTheUsageNoticeSecretary(actor, id, because, workspaceOf(req))
    },
  )
}
