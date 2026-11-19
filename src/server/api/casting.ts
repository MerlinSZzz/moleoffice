// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { theAgentKeyRowOnThisRequest, theRunThisRunKeyIsBoundTo } from '../lib/keys.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { readACastingSelection, holdACasting } from '../lib/casting.ts'
import { aCastingById } from '../lib/a-casting-by-id.ts'
/**
 * THE CASTING TABLE (选角表), set by two decisions.
 *
 *   GET    /api/casting                    every role card with its castings, grouped by project, and every
 *                                          role nobody has cast, with no casting and a sentence
 *   GET    /api/casting/for/:role          the one casting the tools take for that role (?project=)
 *   GET    /api/casting/:role/history      every change to the role's castings, newest first (?casting=<id>)
 *   POST   /api/casting/:role              add a casting
 *   PATCH  /api/casting/rows/:id           change the cells of one casting
 *   DELETE /api/casting/rows/:id           remove one casting
 *   POST   /api/casting/rows/:id/mark      move the mark to one casting
 *   POST   /api/casting/labels             make a label
 *   PATCH  /api/casting/labels/:id         rename a label, or write what it means
 *   DELETE /api/casting/labels/:id         remove a label no casting carries
 *   GET    /api/casting/labels/:id/history every change to one label, newest first
 *
 * The seven writes are available to a person and to a secretary. The power "The Casting table"
 * in src/config/roles.json holds their acts, and only the secretary's step
 * of the tree holds that power. The reading, the rule for which casting the tools take and the writers
 * are in src/server/lib/casting.ts, and the labels' in src/server/lib/casting-labels.ts; this file only reads the
 * request, refuses whoever may not write, and hands the rest on. Each writer checks everything before it writes anything.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { CASTING_CELLS, type CastingFor, type CastingHistory, type CastingLabelHistory, type CastingLabelWritten, type CastingReading, type CastingWritten } from '@shared/casting.ts'
import { A_PROVIDER_ID, A_PROVIDER_ID_IS } from '@shared/the-provider-table.ts'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { addACasting, authorityOf, castingFor, castingHistory, changeACasting, markACasting, removeACasting, theCastingTable, whoWrote } from '../lib/casting.ts'
import { addACastingLabel, castingLabelHistory, changeACastingLabel, removeACastingLabel, type CastingLabelWriter } from '../lib/casting-labels.ts'
import { type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { whatTheCallersOwnKeyProvesForThisAct } from '../lib/rolegate.ts'
import { route, theDoorAsksTheCard } from '../lib/route.ts'
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { KEY_HEADER } from '../../config/key-header.mjs'
import { whyTheSettingsCannotBeStored } from '../../config/the-launchers-own-settings.mjs'

const CELLS_IN_WORDS =
  'program, model, effort, when it suits (difficulty, quota, cost for what it gives), probability, labels, Out until and why'

const READ_NOTE =
  'The Casting table: for each role card, every way the office casts it (' + CELLS_IN_WORDS + '). ' +
  '{roles: [{role, scopes: [{project, projectTitle, castings: [row], draws}], says}], programs, labels, rules, ' +
  'officeTimeZone}. Every project first, then each project with castings of its own. A row has an id, and `marked` ' +
  'is true on the one row of its scope the tools take when no model is named. Each cell has its value and where it ' +
  'came from (the decision it names, who set it here and when, moved from Settings by migration 0189, copied by ' +
  'migration 0190, or set by a migration with the words of the decision in decisionWords), or is empty. The labels ' +
  'cell holds label ids, and `labels` gives each label its name, meaning and rows. A row also carries officeOut, the ' +
  "sentences in which the office's limits stop its program now. A worker scope's draws say, for each label, which " +
  'rows the roll would draw and with what share, or that it would take the marked row, or that no row carries the ' +
  'label. `rules` are the fixed rules of labels and the roll. A role nobody has cast has no scopes and a sentence. ' +
  'No body is read.'

const FOR_NOTE =
  'The one casting the tools take for a role: {role, project, scope, casting, program, model, effort, cells, ' +
  'empty, says}. ?project= names a project. If that project has any casting of the role, its marked row ' +
  "answers; if it has none, the every-project marked row answers; a project's castings replace the " +
  'every-project ones as a whole, never cell by cell. When the table marks no casting, casting and every ' +
  'cell are null and `says` says so. :role is a role card. tools/register-a-run.mjs and ' +
  'tools/register-a-started-agent.mjs ask this when no --model is given.'

const HISTORY_NOTE =
  "Every change to a role's castings, in every scope and including removed castings, newest first: which " +
  'casting, what (add, change, remove, mark, unmark, migrate), who, when, what allowed it, the decisions the ' +
  'write named, and the row before and after. ?casting=<id> narrows it to one casting.'

const CELL_BODY =
  'A cell is {"value": string|null, "decision"?: id|null}; a null or empty value empties it, and "decision" is ' +
  "the id of the person's decision the value comes from. Probability accepts a decimal from 0 to 1 or a percentage " +
  'from 0% to 100%, and answers with its canonical decimal; 0 means only that the roll does not draw the row. ' +
  'Labels takes the names of labels the table holds, separated by commas, and stores their ids; a roll for work of ' +
  "a label takes only the rows that carry it. Out until takes a date and time on the office's clock, such as " +
  '2026-11-18 09:00, or an instant with its offset, and stores the instant; until then the roll skips the row. ' +
  'The cells are ' + CASTING_CELLS.join(', ') + '.'

const OWNERS_ACT =
  'The owner may do this, and so may an agent whose card holds the power "The Casting table" in ' +
  "src/config/roles.json (by default the secretary's card), proved by the agent's own key in " +
  'x-mole-office-key. Anybody else is refused with a 403 and the code castingNotOwnerOrSecretary, whose value card ' +
  'names the one card that holds the act; where no card or more than one does, the code is ' +
  'castingNotOwnerOrACardThatHoldsIt, with no values. While the gate who-changes-the-casting-table is off, any ' +
  'agent proved by its own key may also do this, and is counted. Everything is ' +
  'checked before anything is written, and every write adds a history row that names who made it.'

const ADD_NOTE =
  'Add one casting of a role. Body {"project"?: id|null, <cell>?: cell, ...}, at least one cell. ' + CELL_BODY +
  ' The first casting of a role in its scope carries the mark, and the answer says so; a later one does not. ' +
  'Answers 201 {casting, says}. ' + OWNERS_ACT

const CHANGE_NOTE =
  'Change the cells of one casting. Body {<cell>?: cell, ...}, at least one cell; the cells not named keep their ' +
  'value and source. The scope and the mark do not change here. ' + CELL_BODY + ' Answers {casting, says}. ' + OWNERS_ACT

const REMOVE_NOTE =
  'Remove one casting. The marked casting is refused with a 409 while other castings of the role remain in its ' +
  'scope: mark another first. The last casting of a scope may go. No body is read. Answers {casting, says}, the ' +
  'casting as it was. ' + OWNERS_ACT

const MARK_NOTE =
  'Move the mark to one casting: the tools take it from now on, and the casting that had the mark in the same ' +
  'scope loses it in the same write. A casting that already carries it is answered as it is. No body is read. ' +
  'Answers {casting, says}. ' + OWNERS_ACT

const LABEL_ACT =
  'The same people may do this as may change a casting: the person, and an agent whose card holds the power "The ' +
  'Casting table" in src/config/roles.json, refused as a casting write is. Every write adds a history row that ' +
  'names who made it.'

const LABEL_NAME =
  'A name is 1 to 32 letters, digits or hyphens once spaces around it are taken off, inner spaces become hyphens ' +
  'and letters are lower-cased; any other mark is refused with castingNotALabel, and a name the table holds, in any ' +
  'letter case, with castingLabelTaken.'

const ADD_LABEL_NOTE =
  'Make a Casting label. Body {"name": string, "meaning"?: {"value": string|null}}. ' + LABEL_NAME + ' A meaning ' +
  'is what the label means in words; an empty one is no meaning. No row carries the new label. Answers 201 ' +
  '{label, says}. ' + LABEL_ACT

const CHANGE_LABEL_NOTE =
  'Rename a Casting label, or write what it means: body {"name": string} or {"meaning": {"value": string|null}}, ' +
  'one of the two. ' + LABEL_NAME + ' The rows that carry it carry it under its new name. An empty meaning empties ' +
  'it. A value the label already has writes nothing, and the answer says so. :id is the label\'s own number; one ' +
  'the table does not hold is a 404 castingNoSuchLabel. Answers {label, says}. ' + LABEL_ACT

const REMOVE_LABEL_NOTE =
  'Remove a Casting label. A label a casting carries is refused with a 409 castingLabelInUse that names the ' +
  'castings: take it off them first. Its history is kept. No body is read. Answers {label, says}, the label as it ' +
  'was. ' + LABEL_ACT

const LABEL_HISTORY_NOTE =
  "Every change to one Casting label, newest first, a removed label's too: {label, changes: [{what, at, by, " +
  'authority, before, after}]}, where what is add, rename, change, remove or migrate and before and after are ' +
  '{name, meaning}. A label that never was is a 404 castingNoSuchLabel.'

const cell = z.strictObject({ value: z.string().nullable(), decision: z.string().nullable().optional() })

const cellsShape = Object.fromEntries(CASTING_CELLS.map((one) => [one, cell.optional()])) as Record<(typeof CASTING_CELLS)[number], z.ZodOptional<typeof cell>>

/** A row's settings are checked by src/config/the-launchers-own-settings.mjs, and an empty list is stored as no key. */
const settingsBody = z.unknown().superRefine((value, said) => {
  const why = whyTheSettingsCannotBeStored(value)
  if (why !== null) said.addIssue({code:'custom',message:why})
}).transform(value => value as {name: string; value: unknown}[])
/** `providerRow` names a provider-table row by its id; src/server/lib/casting.ts refuses one the row's program cannot take. */
const nativeBody = z.strictObject({model:z.string().trim().min(1).max(4096),provider:z.string().trim().min(1).max(4096).nullable(),variant:z.string().trim().min(1).max(4096).nullable(),
  providerRow:z.string().trim().regex(A_PROVIDER_ID, `must be a provider's id: ${A_PROVIDER_ID_IS}`).optional(),settings:settingsBody.optional()})
  .transform(({settings, providerRow, ...native}) => ({...native, ...(providerRow === undefined ? {} : {providerRow}), ...(settings === undefined || settings.length === 0 ? {} : {settings})})).nullable()
const addBody = z.strictObject({ native:nativeBody.optional(), project: z.string().nullable().optional(), ...cellsShape })
const changeBody = z.strictObject({...cellsShape,native:nativeBody.optional(),hold:z.null().optional()})

const projectQuery = z.strictObject({ project: z.string().optional() })
const historyQuery = z.strictObject({ casting: z.string().regex(/^[1-9][0-9]*$/, 'must be a casting id, a whole number').optional() })
const anId = z.strictObject({ id: z.string().regex(/^[1-9][0-9]*$/, 'must be a casting id, a whole number') })
const aLabelMeaning = z.strictObject({ value: z.string().nullable() })
const addLabelBody = z.strictObject({ name: z.string(), meaning: aLabelMeaning.optional() })
const changeLabelBody = z.union([z.strictObject({ name: z.string() }), z.strictObject({ meaning: aLabelMeaning })])

/** Who wrote a label, and what allowed it, worked out as a casting write's are. */
function theLabelWriter(actor: Actor): CastingLabelWriter {
  return { by: whoWrote(actor), authority: authorityOf(actor) }
}

/**
 * THE PERSON, WHOEVER HOLDS THEIR AUTHORITY IN A TEST WORLD, OR AN AGENT WHOSE CARD HOLDS THE ACT, CASTS A ROLE.
 *
 * Changing the Casting table is a secretary's default power. Which card holds it is
 * said once, in src/config/roles.json, and `whatTheCallersOwnKeyProvesForThisAct` reads it there for the
 * act this route declared. An agent counts only when its own key proves it: a name in the headers proves nothing.
 * The routes are marked with `theDoorAsksTheCard`, so the role gate's hook leaves them to this check and its coded
 * refusal. Every write door asks this first, and so do the provider table's write doors in
 * src/server/api/the-provider-table.ts, which hold their acts in the same power. `doing` finishes the sentence of the
 * refusal while the gate is off, and names what the door does.
 */
export function onlyThePersonOrACardThatHoldsItMayCast(actor: Actor, req: FastifyRequest, doing = 'add, change, remove or mark a casting'): void {
  if (thePersonIsProved(actor)) return
  if (actor.theOwnersAuthority?.holds === true) return
  const proved = whatTheCallersOwnKeyProvesForThisAct(req, actor)
  if (proved.may) return
  // At off the gate who-changes-the-casting-table lets any agent its own key proves cast too, and counts it. The history
  // row names that agent, as it names every writer.
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (!keyed && gatePosition('who-changes-the-casting-table') !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-changes-the-casting-table', doing)
  if (keyed && gateMet('who-changes-the-casting-table') !== 'block') return
  const cards = proved.cardsThatMay.length === 0 ? 'no card' : `the ${proved.cardsThatMay.join(' or the ')} card`
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: `Changing the Casting table is for the owner, or for an agent holding ${cards}`,
      nothingWasDone: 'Nothing was changed.',
      whoMay:
        (proved.agent === null
          ? `An agent is taken to hold its card only when its own key proves it, in the ${KEY_HEADER} header, and this ` +
            'request carried no key that proves a registered agent. '
          : `"${proved.agent.handle}" holds the ${proved.agent.role} card, which does not hold that power. `) +
        'The owner adds, changes, removes and marks castings on the Casting page. Any agent may read the table and ' +
        'file a proposal about it. Which card holds the power is written in src/config/roles.json.',
    }),
    403,
    undefined,
    undefined,
    undefined,
    // THE PAGE'S SENTENCE NAMES THE CARD THE GATE READ, from the same reading, so the two cannot disagree (problem
    // XCvn6ypadyMT). It has room for one card. Where no card or more than one holds the act, the page's sentence
    // names no card, since one name would leave the others out; the English above names each card, or says none does.
    proved.cardsThatMay.length === 1
      ? { code: 'castingNotOwnerOrSecretary', values: { card: proved.cardsThatMay[0] ?? '' } }
      : { code: 'castingNotOwnerOrACardThatHoldsIt', values: {} },
  )
}

/** The cells a body names, and nothing else. */
function cellsOf(body: Partial<Record<(typeof CASTING_CELLS)[number], { value: string | null; decision?: string | null | undefined } | undefined>>) {
  return Object.fromEntries(CASTING_CELLS.filter((one) => body[one] !== undefined).map((one) => [one, body[one]]))
}

function onlyThePersonOrSecretaryMayChangeAHeldRow(id: number, actor: Actor, req: FastifyRequest): void {
  if (actor.theOwnersAuthority?.holds === true) return
  if (aCastingById(id).hold == null || thePersonIsProved(actor)) return
  const proved = whatTheCallersOwnKeyProvesForThisAct(req, actor)
  if (!proved.may) throw new PanelError('Only a person or secretary may change or clear a held Casting row. Nothing was written.',403)
}

export async function castingRoutes(app: FastifyInstance): Promise<void> {
  app.get<{Params:{id:string}}>('/casting/rows/:id/selection',route('office.casting-selection','remote','Read one exact Casting row native selection and its content revision; held or changed rows refuse without another choice.'),async req => {
    actorFrom(req)
    const id = Number(parse(anId,req.params,'The casting').id)
    const query = parse(z.strictObject({revision:z.string().min(1).optional()}),req.query ?? {},'The selected revision')
    return readACastingSelection(id,query.revision)
  })
  app.post<{Params:{id:string}}>('/casting/rows/:id/hold',route('office.hold-casting','remote','Atomically hold the selected row after this run reports a structured native model or option refusal. Capacity and limits do not hold. Repeated reports write no second notice.'),async req => {
    const actor = actorFrom(req,{proveOwnRun:true})
    const id = Number(parse(anId,req.params,'The casting').id)
    const body = parse(z.strictObject({revision:z.string().min(1),run:z.string().min(1),refusal:z.strictObject({kind:z.enum(['model','option']),code:z.string().min(1).max(128),said:z.string().min(1).max(2000)})}),req.body ?? {},'The native refusal')
    const keyRow = theAgentKeyRowOnThisRequest(req)
    const binding = keyRow === undefined ? undefined : theRunThisRunKeyIsBoundTo(keyRow)
    return holdACasting(id,body,{...actor,...(binding?.newest === true ? {ownKeyRun:binding.run} : {})},workspaceOf(req))
  })
  app.get('/casting', route('office.casting', 'remote', READ_NOTE), async (): Promise<CastingReading> => theCastingTable())

  app.get<{ Params: { role: string } }>(
    '/casting/for/:role',
    route('office.casting-for', 'remote', FOR_NOTE),
    async (req): Promise<CastingFor> => {
      const asked = parse(projectQuery, req.query ?? {}, 'Which project to answer for')
      return castingFor(req.params.role, asked.project ?? null)
    },
  )

  app.get<{ Params: { role: string } }>(
    '/casting/:role/history',
    route('office.casting-history', 'remote', HISTORY_NOTE),
    async (req): Promise<CastingHistory> => {
      const asked = parse(historyQuery, req.query ?? {}, 'Which casting to read')
      return castingHistory(req.params.role, asked.casting === undefined ? null : Number(asked.casting))
    },
  )

  app.post<{ Params: { role: string } }>(
    '/casting/:role',
    theDoorAsksTheCard(route('office.add-casting', 'remote', ADD_NOTE)),
    async (req, reply): Promise<CastingWritten> => {
      const actor = actorFrom(req)
      onlyThePersonOrACardThatHoldsItMayCast(actor, req)
      const body = parse(addBody, req.body ?? {}, 'The casting')
      const written = addACasting(req.params.role, { project: body.project ?? null, cells: cellsOf(body), ...(body.native === undefined ? {} : {native:body.native}) }, actor)
      reply.code(201)
      return written
    },
  )

  app.patch<{ Params: { id: string } }>(
    '/casting/rows/:id',
    theDoorAsksTheCard(route('office.change-casting', 'remote', CHANGE_NOTE)),
    async (req): Promise<CastingWritten> => {
      const actor = actorFrom(req)
      onlyThePersonOrACardThatHoldsItMayCast(actor, req)
      const id = Number(parse(anId, req.params, 'The casting').id)
      const body = parse(changeBody, req.body ?? {}, 'The change')
      onlyThePersonOrSecretaryMayChangeAHeldRow(id, actor, req)
      return changeACasting(id, cellsOf(body), actor, {...(body.native === undefined ? {} : {native:body.native}),...(body.hold === undefined ? {} : {hold:null})})
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/casting/rows/:id',
    theDoorAsksTheCard(route('office.remove-casting', 'remote', REMOVE_NOTE)),
    async (req): Promise<CastingWritten> => {
      const actor = actorFrom(req)
      onlyThePersonOrACardThatHoldsItMayCast(actor, req)
      const id = Number(parse(anId, req.params, 'The casting').id)
      onlyThePersonOrSecretaryMayChangeAHeldRow(id, actor, req)
      return removeACasting(id, actor)
    },
  )

  app.post<{ Params: { id: string } }>(
    '/casting/rows/:id/mark',
    theDoorAsksTheCard(route('office.mark-casting', 'remote', MARK_NOTE)),
    async (req): Promise<CastingWritten> => {
      const actor = actorFrom(req)
      onlyThePersonOrACardThatHoldsItMayCast(actor, req)
      const id = Number(parse(anId, req.params, 'The casting').id)
      return markACasting(id, actor)
    },
  )

  // THE LABELS. The id is taken as it was written and handed on: casting-labels.ts answers an id the table does not
  // hold, a word that is no number among them, with castingNoSuchLabel naming it as it was given.
  app.post(
    '/casting/labels',
    theDoorAsksTheCard(route('office.add-casting-label', 'remote', ADD_LABEL_NOTE)),
    async (req, reply): Promise<CastingLabelWritten> => {
      const actor = actorFrom(req)
      onlyThePersonOrACardThatHoldsItMayCast(actor, req, 'make, rename or remove a Casting label')
      const body = parse(addLabelBody, req.body ?? {}, 'The label')
      const written = addACastingLabel(body, theLabelWriter(actor))
      reply.code(201)
      return written
    },
  )

  app.patch<{ Params: { id: string } }>(
    '/casting/labels/:id',
    theDoorAsksTheCard(route('office.change-casting-label', 'remote', CHANGE_LABEL_NOTE)),
    async (req): Promise<CastingLabelWritten> => {
      const actor = actorFrom(req)
      onlyThePersonOrACardThatHoldsItMayCast(actor, req, 'make, rename or remove a Casting label')
      const body = parse(changeLabelBody, req.body ?? {}, 'The change to the label')
      return changeACastingLabel(req.params.id, body, theLabelWriter(actor))
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/casting/labels/:id',
    theDoorAsksTheCard(route('office.remove-casting-label', 'remote', REMOVE_LABEL_NOTE)),
    async (req): Promise<CastingLabelWritten> => {
      const actor = actorFrom(req)
      onlyThePersonOrACardThatHoldsItMayCast(actor, req, 'make, rename or remove a Casting label')
      return removeACastingLabel(req.params.id, theLabelWriter(actor))
    },
  )

  app.get<{ Params: { id: string } }>(
    '/casting/labels/:id/history',
    route('office.casting-label-history', 'remote', LABEL_HISTORY_NOTE),
    async (req): Promise<CastingLabelHistory> => castingLabelHistory(req.params.id),
  )
}
