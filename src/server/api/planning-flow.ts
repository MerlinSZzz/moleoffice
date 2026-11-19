// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOW FOR PLANNING A BIG PIECE OF WORK, OVER HTTP, from wave 13j round 49.
 *
 *   POST /api/modules/:id/plan-step-done   the planner says the plan is in the module and drawn as a pipeline
 *   POST /api/modules/:id/plan             the planner submits the questioned plan, with an answer to each question
 *
 * THE RULES ARE IN src/server/lib/planning-flow.ts and the questions in src/shared/planning-flow.ts. What is here is
 * the door: what shape the body is, and what comes back. Both are remote: the planner is an agent, and may work from
 * any machine the office is opened on. Who may ask is the planner the module names, checked in the library.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { PLAN_QUESTIONS, PLAN_QUESTION_KEYS, type PlanAnswers } from '@shared/planning-flow.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { sayThePlanStepIsDone, submitThePlan } from '../lib/planning-flow.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const STEP_NOTE =
  'The planner named in the module says the plan step is done: the plan is written into the module and drawn as a ' +
  'pipeline. Body {pipeline: "<id>", checklist?: "<id>"}. The pipeline must be linked to the module, or hold the module ' +
  'or a record linked to it. The request must name the caller\'s run (x-mole-office-session). In one write the office ' +
  'files a planning flow run about the module, puts an item on the planner\'s own checklist (the one named, else the ' +
  'only one, else the newest changed, else a new one), sends the planner one message with the four questions, and ' +
  'records module.planning. Refused with a code when the module names no planner (planModuleNamesNoPlanner), the ' +
  'caller is not the planner (planCallerIsNotThePlanner), the module has no pipeline (planModuleHasNoPipeline), the ' +
  'pipeline is not the module\'s (planPipelineNotTheModules), or an earlier plan step waits to be submitted ' +
  '(planStepAlreadyDone). Reply 201: {module, planning, flowRun, checklist, item, prompt, says}.'

const SUBMIT_NOTE =
  'The planner submits the plan after questioning it. Body {answers: {' +
  PLAN_QUESTION_KEYS.map((key) => `${key}: "<short answer>"`).join(', ') +
  '}}, one short answer to each question the office asked: ' +
  PLAN_QUESTION_KEYS.map((key) => `${key}: ${PLAN_QUESTIONS[key]}`).join(' ') +
  ' The request must name the caller\'s run. The office records on module.planning that the plan was questioned, when ' +
  'and the answers, and which of the plan\'s records (the module, the pipeline, its blocks) changed since the plan step, ' +
  'read from their revisions: a submit that changed nothing is accepted, and the record and the reply say nothing ' +
  'changed. It writes ended on the planning flow run, and ticks the checklist item with the run as its evidence. Refused ' +
  'with planNotOpen when no plan step waits to be submitted. Reply 200: {module, planning, ticked, says}.'

const whichModule = z.object({ id: z.string().min(1) })

const stepBody = z.strictObject({
  pipeline: z.string().trim().min(1),
  checklist: z.string().trim().min(1).optional(),
})

const AN_ANSWER = z.string().trim().min(1)

const submitBody = z.strictObject({
  answers: z.strictObject(Object.fromEntries(PLAN_QUESTION_KEYS.map((key) => [key, AN_ANSWER])) as Record<keyof PlanAnswers, typeof AN_ANSWER>),
})

export async function planningFlowRoutes(app: FastifyInstance): Promise<void> {
  app.post('/modules/:id/plan-step-done', route('module.plan-step-done', 'remote', STEP_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichModule, req.params, 'The module')
    const body = parse(stepBody, req.body ?? {}, 'The plan step')
    const done = sayThePlanStepIsDone({
      workspaceId,
      moduleId: id,
      pipeline: body.pipeline,
      ...(body.checklist === undefined ? {} : { checklist: body.checklist }),
      actor: actorFrom(req),
    })
    void reply.code(201)
    return { ...done, workspaceId }
  })

  app.post('/modules/:id/plan', route('module.submit-plan', 'remote', SUBMIT_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichModule, req.params, 'The module')
    const body = parse(submitBody, req.body ?? {}, 'The submitted plan')
    return { ...submitThePlan({ workspaceId, moduleId: id, answers: body.answers as PlanAnswers, actor: actorFrom(req) }), workspaceId }
  })
}
