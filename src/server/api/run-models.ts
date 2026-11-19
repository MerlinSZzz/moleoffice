// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MODEL A RUN USES, AS A SETTING. Criterion U2.
 *
 *   GET  /api/office/run-models                  every place and role: what is set, what is in force, and where it came from
 *   POST /api/office/run-models                  the person sets or clears the office's choices
 *   GET  /api/office/run-models/agent/:agent     one agent's own model, and what its runs get now
 *   POST /api/office/run-models/agent/:agent     the person sets or clears one agent's own model
 *   GET  /api/office/run-models/for/:agent       what one run of that agent gets, for the tools that start runs
 *
 * The reading and the layers are in src/server/lib/run-models.ts; this file only reads the request,
 * refuses what is not the person's, and validates before anything is written.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { AGENT_RUNTIMES } from '@shared/participants.ts'
import { RUN_MODEL_PLACES, type AnAgentsRunModel, type RunModelsReading, type TheModelARunGets } from '@shared/run-models.ts'
import { theModelTheLauncherIsGiven } from '@shared/worker-runs.ts'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import {
  aRaiseCarriesIt,
  writeDownASettingChange,
  writeDownAnActUnderTheRaise,
  type Actor,
} from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { anAgentsRunModel, everyRunModel, setTheRunModels, theModelARunStartsWith } from '../lib/run-models.ts'
import { setAnAgentsRunModel } from '../lib/setting-an-agents-run-model.ts'
// THE REFUSAL FOR A REQUEST NOT PROVED TO BE THE PERSON, written in one place for every door that keeps
// an act for them. In a test world it also names who may act there (criterion P84).
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'

const READ_NOTE =
  'The place the office starts a run by itself and keeps a model for here: answering a message. What the ' +
  'Settings page holds, or null because nobody set it; and what a run there gets now, with the layer it came ' +
  'from and one sentence saying why. A builder\'s model and the check\'s are kept in the Casting table ' +
  '(GET /api/casting). A notice starts no run, so it has no entry. theWorkerGives names the runtimes the ' +
  'message worker passes a model to (aModelTo) and a reasoning effort to (aVariantTo), from the table the runtime ' +
  'adapters read; a pair for any other runtime, or an effort for any other, is refused. No body is read.'

const SET_NOTE =
  `Set or clear the office's choices. Body {"places": {${RUN_MODEL_PLACES.map((name) => `"${name}"?: pair|null`).join(', ')}}}, ` +
  'where a pair is {"runtime": word, "model": string, "variant"?: string} and null clears the slot. Only the ' +
  'slots named are touched. Every slot is checked before anything is written, so a refusal leaves everything ' +
  'as it was. A builder\'s model and the check\'s are set on the Casting table (POST /api/casting/:role). ' +
  'This is the owner\'s own act. A secretary holding the owner\'s grant may press it where this office\'s list ' +
  'of what the grant carries says so; any other agent is refused with a 403. While the gate ' +
  'who-changes-the-owners-settings is off, any agent proved by its own key may also press it, and is counted, and a ' +
  'change it makes is written down with its name. The reply is the whole reading as it now stands.'

const AGENT_READ_NOTE =
  'One agent\'s own model, from its agent record beside its runtime, and what its runs get now: a builder run ' +
  'and a run answering a message, each with the layer it came from, and theWorkerGives as GET ' +
  '/api/office/run-models gives it. :agent is an id or a handle.'

const AGENT_SET_NOTE =
  'Set or clear one agent\'s own model. Body {"model": string|null, "variant"?: string|null}. It is stored on ' +
  'the agent\'s record beside its runtime and is for that runtime; null clears the model and the variant ' +
  'together. A reasoning effort is refused for a runtime that is not in theWorkerGives.aVariantTo of the ' +
  'reading. This is the owner\'s own act. A ' +
  'secretary holding the owner\'s grant may press it where this office\'s list of what the grant carries says ' +
  'so; any other agent is refused with a 403. While the gate who-changes-the-owners-settings is off, any agent ' +
  'proved by its own key may also press it, and is counted. :agent is an id or a handle.'

const FOR_NOTE =
  'What one run of an agent gets: {runtime, model, variant, effort, effortFrom, from, says}. Optional ?model= names a model the caller already chose. ?place= is conversation, check or ' +
  'builder, and ?runtime= is the runtime the run goes to, when the caller knows it. A builder and a check read ' +
  'the Casting row of their role card for the project the request names. tools/agent-worker.mjs, ' +
  'tools/the-inspector.mjs and tools/sandbox-start.mjs ask this when no --model was given. :agent is an id, a ' +
  'handle, or the id of the agent\'s own record. A builder\'s Codex model, from its Casting row or set on the agent\'s own ' +
  'profile, is given as openai/<model>, the name the launcher takes; `says` names the model as the row or the profile holds it. ' +
  'A Casting row held after a native refusal is refused with a 409 that names the hold. ' +
  'A Codex conversation that nothing names a model for takes its Casting row in force, and a missing or incomplete row is refused with a 409 that says what it lacks. ' +
  'A named model is a Casting row\'s when it is the row\'s Office model or its native provider and native model; a name that matches ' +
  'rows in force naming different models is refused with a 409 that names the name and each row. ' +
  'Optional ?row= is the Casting row a message run\'s queue read, as JSON {id, revision, program, model, effort}, or null for none, ' +
  'and only with ?place=conversation. That row is read again first. The answer is refused with a 409 when the row was held, removed ' +
  'or changed since, or when the answer would read another row, or a row where the queue read none.'

const pair = z.strictObject({
  runtime: z.enum(AGENT_RUNTIMES).optional(),
  model: z.string(),
  variant: z.string().optional(),
})

const slots = <K extends string>(names: readonly [K, ...K[]]) =>
  z.strictObject(Object.fromEntries(names.map((name) => [name, pair.nullable().optional()])) as Record<K, z.ZodOptional<z.ZodNullable<typeof pair>>>)

const setBody = z
  .strictObject({
    places: slots(RUN_MODEL_PLACES).optional(),
  })
  .refine((body) => Object.keys(body.places ?? {}).length > 0, {
    message: 'name a place to set or clear; an empty body would change nothing. A builder\'s model and the check\'s are set on the Casting table.',
  })

const agentBody = z.strictObject({
  model: z.string().nullable(),
  variant: z.string().nullable().optional(),
})

/**
 * THE CASTING ROW A MESSAGE RUN'S QUEUE READ, as its start gives it: the row as JSON, by its id, its selection revision
 * and its cells, or null because the queue read none.
 */
const theRowTheQueueRead = z
  .string()
  .transform((text, context) => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      context.addIssue({ code: 'custom', message: 'The row the queue read is not JSON.' })
      return z.NEVER
    }
  })
  .pipe(
    z
      .strictObject({
        id: z.number().int().positive(),
        revision: z.string().min(1).nullable(),
        program: z.string().min(1),
        model: z.string().min(1),
        effort: z.string().min(1).nullable(),
      })
      .nullable(),
  )

const forQuery = z
  .strictObject({
    place: z.enum(['conversation', 'check', 'builder']),
    runtime: z.enum(AGENT_RUNTIMES).optional(),
    model: z.string().trim().min(1).optional(),
    row: theRowTheQueueRead.optional(),
  })
  .refine((query) => query.row === undefined || query.place === 'conversation', {
    message: 'The row the queue read is given only for a run that answers a message.',
    path: ['row'],
  })

/**
 * ONLY THE PERSON, OR WHOEVER HOLDS THEIR AUTHORITY IN A TEST WORLD, CHOOSES WHICH MODEL RUNS GET.
 *
 * The same clause `onlyThePersonMayChangeWhatIsKept` asks, with its own sentence. Which model a run
 * gets decides what the office spends, so an agent may read the choices and may file a proposal
 * about them, and may not make them.
 *
 * The answer is whether the gate who-changes-the-owners-settings let the caller through at off, so the change is
 * written down with that agent's name. `act` is what the refusal at off says such an agent may do.
 */
function onlyThePersonMayChooseTheModels(actor: Actor, req: FastifyRequest, act: string): boolean {
  if (thePersonIsProved(actor)) return false
  if (actor.theOwnersAuthority?.holds === true) return false
  // AND A SECRETARY THE PERSON HAS RAISED. A raised secretary holds the person's acts but a few, and this
  // is not one of them. Asked last, so the grant is named on the act only when nothing else allowed it.
  // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate who-changes-the-owners-settings lets any agent its own
  // key proves choose too, and counts it, and the raise is not asked. At block the raise is asked as before, and a
  // change it carries is not counted.
  const position = gatePosition('who-changes-the-owners-settings')
  if (position === 'block' && aRaiseCarriesIt(actor)) return false
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-changes-the-owners-settings', position!) !== 'block') return true
  if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-changes-the-owners-settings', act)
  // THE WORDS ARE WRITTEN IN ONE PLACE, lib/not-proved-the-person.ts, from the facts of this request:
  // why it is not the person and the way on for its kind of caller, and in a test world who may act there.
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: "Which model a run gets is the owner's own setting",
      nothingWasDone: 'Nothing was changed.',
      whoMay:
        'The owner sets it on the Settings page and on an agent\'s profile. An agent may read the choices and may ' +
        'file a proposal about them; it may not decide which model the office\'s runs use.',
    }),
    403,
  )
}

/**
 * THE AGENT A PATH SEGMENT NAMES, or a refusal naming the segment nothing answers to.
 *
 * An id or a handle goes through the one resolver of arriving references. When that names nobody,
 * the segment may be the id of the agent's own record, which is what a thread message stores as
 * `recipient.agentId` and what tools/agent-worker.mjs sends. That id names one agent exactly, through
 * the agent_records row, read by `agentForRecord` as `retireTheRowBehind` in lib/records.ts reads it,
 * and never through the handle the record carries (criterion I3).
 */
function theAgentNamed(reference: string, doing: 'reading' | 'writing', actor: Actor): string {
  const named = theAgentAnArrivingReferenceNames(reference, doing, actor.keyHolder ?? null)
  if (named !== null) return named.agent.id
  const byItsRecord = agentForRecord(reference.trim())
  if (byItsRecord !== null) return byItsRecord.id
  throw new PanelError(`Mole Office has no agent called "${reference}". GET /api/participants lists every agent it knows.`, 404)
}

export async function runModelRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/run-models',
    route('office.run-models', 'remote', READ_NOTE),
    async (): Promise<RunModelsReading> => everyRunModel(),
  )

  app.post(
    '/office/run-models',
    route('office.set-run-models', 'remote', SET_NOTE),
    async (req): Promise<RunModelsReading> => {
      const actor = actorFrom(req)
      const byTheGate = onlyThePersonMayChooseTheModels(actor, req, 'set or clear the models the office\'s runs get')
      const body = parse(setBody, req.body ?? {}, 'The models the office\'s runs use')
      const before = everyRunModel()
      const after = setTheRunModels(body, actor)
      // THE AGENT'S OWN MODEL, below, is written on its record, whose revision names the grant; this one is a row of its own.
      // An agent the gate let through at off is written down by name, as the change log names any change.
      ;(byTheGate ? writeDownASettingChange : writeDownAnActUnderTheRaise)(actor, {
        setting: 'run-models',
        field: 'the models the office\'s runs use',
        before,
        after,
        workspaceId: workspaceOf(req),
      })
      return after
    },
  )

  app.get<{ Params: { agent: string } }>(
    '/office/run-models/agent/:agent',
    route('office.agent-run-model', 'remote', AGENT_READ_NOTE),
    async (req): Promise<AnAgentsRunModel> => anAgentsRunModel(theAgentNamed(req.params.agent, 'reading', actorFrom(req))),
  )

  app.post<{ Params: { agent: string } }>(
    '/office/run-models/agent/:agent',
    route('office.set-agent-run-model', 'remote', AGENT_SET_NOTE),
    async (req): Promise<AnAgentsRunModel> => {
      const actor = actorFrom(req)
      // The record's revision names whoever made the change, so an agent the gate let through is named there too.
      onlyThePersonMayChooseTheModels(actor, req, "set or clear one agent's own model")
      const body = parse(agentBody, req.body ?? {}, 'The model this agent\'s runs get')
      const agentId = theAgentNamed(req.params.agent, 'writing', actor)
      return setAnAgentsRunModel(agentId, body, actor)
    },
  )

  app.get<{ Params: { agent: string } }>(
    '/office/run-models/for/:agent',
    route('office.run-model-for', 'remote', FOR_NOTE),
    async (req): Promise<TheModelARunGets> => {
      const asked = parse(forQuery, req.query ?? {}, 'Which run to answer for')
      const agentId = theAgentNamed(req.params.agent, 'reading', actorFrom(req))
      // A RUN ABOUT TO START ASKS THIS DOOR, so a held Casting row is refused here with a 409.
      const { runtimeSays: _unused, ...answered } = theModelARunStartsWith({
        place: asked.place,
        agentId,
        runtime: asked.runtime ?? null,
        model: asked.model,
        project: workspaceOf(req),
        ...(asked.row === undefined ? {} : { kept: asked.row }),
      })
      // THE LAUNCHER GIVEN NO --model ASKS HERE, and its worker command takes a Codex model only as openai/<model>. A
      // builder's Casting row is given that name, as a rolled row is (item 2ac), and so is a Codex model set on the
      // agent's own profile (item 2ae). A check keeps the name as it is set.
      if (answered.selection === undefined && asked.place === 'builder' && (answered.from === 'the role' || answered.from === 'the agent') && answered.runtime !== null && answered.model !== null) {
        return { ...answered, model: theModelTheLauncherIsGiven({ runtime: answered.runtime, model: answered.model }) }
      }
      return answered
    },
  )
}
