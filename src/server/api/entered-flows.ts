// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ENTERING A FLOW, OVER HTTP. Wave 13j round 52, after a message and a
 * decision.
 *
 *   POST /api/flows/:id/enter   an agent, or a person for an agent, enters a flow about a record, from a run
 *
 * THE RULES ARE IN src/server/lib/entered-flows.ts and the words in src/shared/flow-run.ts. What is here is the door:
 * what shape the body is, and what comes back. It is remote: the agent may work from any machine the office is opened
 * on. Who may ask is the agent the run serves, or the person, checked in the library.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { FLOW_ENDING_EVENTS } from '@shared/flow-run.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { enterAFlow } from '../lib/entered-flows.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

export const ENTER_NOTE =
  'An agent enters a flow, or the person enters it for an agent. Body {about: "<record id>", run?: "<run id>", ' +
  'checklist?: "<id>"}. The run is the caller\'s own (x-mole-office-session) unless run names another; a person must ' +
  'name run. In one write the office files a flow run that names the flow and the run, and puts one item on the ' +
  'checklist of the agent the run serves (the one named, else the only one, else the newest changed, else a new one). ' +
  'The item says the office put it there. The flow is done when the item is ticked: by the office when the flow\'s ' +
  `ends_on event happens on the run (${FLOW_ENDING_EVENTS.join(', ')}), or by hand by that agent or the person; anybody ` +
  'else is refused with flowItemTickedByAnother, and any other change to the item by anybody else, until the flow ' +
  'ends, with flowItemChangedByAnother. Nothing starts a flow but this door and the planning flow\'s own. ' +
  'Refused with a code when the record is not a flow (flowNotAFlow), the flow is the planning flow ' +
  '(flowEnteredByItsOwnDoor), about names no record in this project (flowAboutNotHere), no run is named ' +
  '(flowNeedsARun), the run serves no agent the office knows (flowRunServesNoAgent), the caller is neither that agent ' +
  'nor the person (flowEnteredForAnother), the same flow about the same record from the same run is still open ' +
  '(flowAlreadyEntered), or checklist is not that agent\'s (flowChecklistNotTheirs). Reply 201: {flowRun, flow, run, ' +
  'about, entered, checklist, item, says}.'

const whichFlow = z.object({ id: z.string().min(1) })

const enterBody = z.strictObject({
  about: z.string().trim().min(1),
  run: z.string().trim().min(1).optional(),
  checklist: z.string().trim().min(1).optional(),
})

export async function enteredFlowRoutes(app: FastifyInstance): Promise<void> {
  app.post('/flows/:id/enter', route('flow.enter', 'remote', ENTER_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichFlow, req.params, 'The flow')
    const body = parse(enterBody, req.body ?? {}, 'Entering the flow')
    const entered = enterAFlow({
      workspaceId,
      flowId: id,
      about: body.about,
      ...(body.run === undefined ? {} : { run: body.run }),
      ...(body.checklist === undefined ? {} : { checklist: body.checklist }),
      actor: actorFrom(req),
    })
    void reply.code(201)
    return { ...entered, workspaceId }
  })
}
