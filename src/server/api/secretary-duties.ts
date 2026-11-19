// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT EACH SECRETARY DOES IN THIS PROJECT: TWO READ DOORS AND ONE WRITE DOOR. Wave 13s round 92, item 2 of the line's
 * requirements.
 *
 *   GET /api/secretaries/duties          every secretary's duties in this project, or that nobody recorded them  (anyone who may read)
 *                                        ?scope=office reads every project's, as the chat does (wave 13y round 111)
 *   GET /api/secretaries/:agent/duties   one secretary's duties, its doors as the grant list answers now, and
 *                                        the one-job settings that name it                                       (anyone who may read)
 *   PUT /api/secretaries/:agent/duties   writes one secretary's duties                                           (the person, or that secretary on the person's words)
 *
 * `:agent` is the agent's registry id, never its handle. src/server/lib/grant/secretary-duties.ts is the one guard:
 * src/server/lib/records.ts calls it on every create and change of the kind, so this file only finds the record and
 * hands the write on. What the grant list answers and what the one-job settings name are read on every request and
 * never stored on the record.
 *
 * THE GRANT NEVER CARRIES THE PUT. The guard refuses the person's grant alone and a signed package item, so the door is
 * not on the list of what the grant carries.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { isADoorTheListNames } from '@shared/what-the-grant-carries-words.ts'
import { THE_OWNER } from '@shared/kinds.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { ADoorAndWhatTheGrantDoes } from '@shared/what-the-grant-carries.ts'
import { sqlite } from '../db/client.ts'
import { theDeadLetterSecretary } from '../lib/dead-letter-secretary.ts'
import {
  AN_AREA_AT_MOST,
  THE_ACT_OF_SETTING_DUTIES,
  theBindingOf,
  type TheDuties,
} from '../lib/grant/secretary-duties.ts'
import { THE_DUTIES_FIELDS, theDutiesIn } from '../db/the-duties-part-for.ts'
import { holdsTheSecretaryCard } from '../lib/holds-the-secretary-card-2.ts'
import { SECRETARY_DUTIES_KIND, theSecretaryNamedIn } from '@shared/secretary-duties-record.ts'
import { nothingWrittenSentence } from '../lib/records/patching.ts'
import { actorFrom, actorWithTheWordsItActsOn, theWordsInTheBody } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theMergeQueueOwner } from '../lib/merge-queue-owner.ts'
import { theModuleReminderSecretaries, type TheModuleReminderSecretaryInForce } from '../lib/module-reminder-secretaries.ts'
import { type RegisteredAgent } from '../lib/participants.ts'
import { theAgentRowAnIdNames } from '../lib/the-agent-row-an-id-names.ts'
import { listParticipants } from '../db/list-participants.ts'
import { createRecord, patchRecord } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theFiledAliasesReadOnce } from '../lib/registry-aliases/runs.ts'
import { route } from '../lib/route.ts'
import { theListAsItStands } from '../lib/what-the-grant-carries.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { warrantBody } from './records.ts'

const LIST_NOTE =
  "Every secretary's duties in this project. secretaries lists every agent holding the secretary card that is not " +
  'retired, in registry order, each with its duties record or, where there is none, nobodyRecorded saying that nobody ' +
  'has recorded duties for it. notASecretaryNow lists duties records whose agent no longer holds the card, is retired ' +
  'or is not in the registry, each with why. Takes no body. With ?scope=office the duties records of every project are ' +
  'read, as the chat reads them, so a secretary reads the same from any project; a secretary with records in more ' +
  'than one project is given its first written.'

/** The list door's query: scope=office, or nothing. Other keys are left alone, as they were before it had one. */
const listQuery = z.object({
  scope: z.literal('office', { error: 'scope is "office", which reads the duties of every project; left out, this project\'s are read.' }).optional(),
})

const ONE_NOTE =
  "One secretary's duties in this project, by the agent's registry id. duties is its record, or null with " +
  'nobodyRecorded saying that nobody has recorded duties for it. doors gives each door the duties name with the grant ' +
  "list's answer now, from GET /api/office/what-the-grant-carries. oneJobSettings says which of the office's one-job " +
  'settings name this agent now: the module reminders project by project, the dead letters and the merge queue. ' +
  'doors and oneJobSettings are read on every request and never stored. A registry id no agent has is a 404.'

const SET_NOTE =
  "Writes one secretary's duties in this project, by the agent's registry id. Body {\"area\": one line of at most " +
  `${String(AN_AREA_AT_MOST)} characters, "responsibleFor"?, "lines"?, "doors"? and "reportsToThePerson"?: lists of ` +
  "short lines, \"restsOn\": the ids of the person's decisions the duties rest on, \"supervisors\"?: the supervisors it " +
  'answers for, each {"agent": {"kind": "agent", "id": <registry id>}, "area": one line of at most ' +
  `${String(AN_AREA_AT_MOST)} characters}, each a live agent holding the supervisor card, named once and by no other ` +
  "secretary's duties in this project, \"warrant\"?: warrant}. The person " +
  'may write by their own press. Otherwise the caller must be that secretary, using its own key, with a warrant ' +
  "quoting the person's words from a decision in restsOn and \"for\" naming " +
  `${THE_ACT_OF_SETTING_DUTIES}:<registry id>: plus JSON of the duties in the order ${THE_DUTIES_FIELDS.join(', ')}. ` +
  `Each decision must be live, replaced by none, decided by "${THE_OWNER}" and on the person's own words. The grant ` +
  'alone, a signed package item and any other agent are refused. The first write creates the record (201); a later ' +
  'one replaces its duties, so a list left out is emptied. The reply is what GET /api/secretaries/<registry id>/duties ' +
  'answers, with written and the record.'

/** The PUT's body: the duties, and the warrant that opens the write for the secretary. */
const dutiesBody = z.strictObject({
  area: z.string(),
  responsibleFor: z.array(z.string()).optional(),
  lines: z.array(z.string()).optional(),
  doors: z.array(z.string()).optional(),
  reportsToThePerson: z.array(z.string()).optional(),
  restsOn: z.array(z.string()),
  supervisors: z.array(z.record(z.string(), z.unknown())).optional(),
  warrant: warrantBody.optional(),
})

/** One agent as these doors name it. */
interface AnAgentNamed {
  id: string
  handle: string
  name: string
}

/** One duties record as these doors show it. */
type TheDutiesShown = TheDuties & { recordId: string; title: string }

/** One live duties record, as stored. */
interface ADutiesRow {
  id: string
  title: string
  data: string | null
}

/** One door the duties name, with the grant list's answer now, or that the list does not name it. */
type ADoorNamed = { door: string; onTheList: true; asTheListAnswersNow: ADoorAndWhatTheGrantDoes } | { door: string; onTheList: false }

/** One project whose module reminders name this agent now. */
interface AProjectThatNamesIt {
  project: string
  title: string
  inForce: TheModuleReminderSecretaryInForce
  says: string
}

/** Whether one of the office's one-job settings names this agent, read now. */
interface ASettingThatNamesIt {
  /** The agent the setting names in force now is this one. */
  inForce: boolean
  /** What the setting holds is this agent's registry id, in force or not. */
  stored: boolean
  says: string
}

/** What GET /api/secretaries/:agent/duties answers. */
interface OneSecretarysDuties {
  agent: AnAgentNamed & { holdsTheCard: boolean; retired: boolean }
  duties: TheDutiesShown | null
  /** Null where `duties` is a record; otherwise the sentence that nobody has recorded duties for it. */
  nobodyRecorded: string | null
  /** Null where nobody has recorded duties: no door is named. */
  doors: ADoorNamed[] | null
  oneJobSettings: {
    moduleReminders: { namesIt: AProjectThatNamesIt[]; says: string }
    deadLetters: ASettingThatNamesIt
    mergeQueue: ASettingThatNamesIt
  }
}

/** What GET /api/secretaries/duties answers. */
interface EverySecretarysDuties {
  secretaries: { agent: AnAgentNamed; duties: TheDutiesShown | null; nobodyRecorded: string | null }[]
  notASecretaryNow: { duties: TheDutiesShown & { secretary: string }; why: string }[]
  note: string
}

const named = (row: RegisteredAgent): AnAgentNamed => ({ id: row.id, handle: row.handle, name: row.name })

const nobodyRecordedFor = (row: RegisteredAgent, workspaceId: string | null): string =>
  `Nobody has recorded duties for ${row.handle} in ${workspaceId === null ? 'any project' : 'this project'}.`

/**
 * The live duties records of this project, or of every project for null, each with its data parsed, or the one record of
 * one secretary. That record may be stored under any id the secretary has had: its canonical id or an old one filed as
 * its alias.
 */
function theDutiesRecords(workspaceId: string | null, secretaryId: string | null): { id: string; title: string; data: Record<string, unknown> }[] {
  const ids = secretaryId === null ? null : JSON.stringify(theFiledAliasesReadOnce(sqlite).everyIdOf(secretaryId))
  const rows = (workspaceId === null
    ? sqlite
      .prepare(
        `SELECT id, title, data FROM records WHERE kind = ? AND deleted_at IS NULL
           AND (? IS NULL OR json_extract(data, '$.secretary.id') IN (SELECT value FROM json_each(?))) ORDER BY created_at, id`,
      )
      .all(SECRETARY_DUTIES_KIND, ids, ids)
    : sqlite
      .prepare(
        `SELECT id, title, data FROM records WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL
         AND (? IS NULL OR json_extract(data, '$.secretary.id') IN (SELECT value FROM json_each(?))) ORDER BY created_at, id`,
      )
      .all(workspaceId, SECRETARY_DUTIES_KIND, ids, ids)) as ADutiesRow[]
  return rows.map((row) => ({ id: row.id, title: row.title, data: (row.data === null ? {} : JSON.parse(row.data)) as Record<string, unknown> }))
}

const shown = (one: { id: string; title: string; data: Record<string, unknown> }): TheDutiesShown => ({
  recordId: one.id,
  title: one.title,
  ...(theDutiesIn(one.data) as unknown as TheDuties),
})

/** The agent `:agent` names, by its registry id or an old id filed as its alias, or a 404 that says where the ids are. */
function theAgentNamed(req: FastifyRequest): RegisteredAgent {
  const id = (req.params as { agent: string }).agent
  const row = theAgentRowAnIdNames(id)
  if (row === null) {
    throw new PanelError(
      `No agent has the registry id ${id}. Name a secretary by its registry id, never its handle: GET /api/secretaries/duties ` +
        'lists the secretaries with their ids.',
      404,
    )
  }
  return row
}

/** Each door the duties name, with the grant list's answer read now. */
function theDoorsNow(doors: readonly string[]): ADoorNamed[] {
  if (doors.length === 0) return []
  const byDoor = new Map(theListAsItStands().doors.map((one) => [one.door, one]))
  return doors.map((door) => {
    const now = isADoorTheListNames(door) ? byDoor.get(door) : undefined
    return now === undefined ? { door, onTheList: false } : { door, onTheList: true, asTheListAnswersNow: now }
  })
}

/** Which one-job settings name this agent, read now. */
function theOneJobSettingsThatName(row: RegisteredAgent): OneSecretarysDuties['oneJobSettings'] {
  const namesIt = theModuleReminderSecretaries()
    .projects.filter(({ inForce }) =>
      inForce.from === 'set here'
        ? inForce.agent.id === row.id
        : inForce.from === 'set here, cannot remind'
          ? inForce.stored === row.id
          : inForce.from === 'from the .env line' && inForce.handle === row.handle,
    )
    .map(({ project, title, inForce, says }) => ({ project, title, inForce, says }))
  const moduleReminders = {
    namesIt,
    says:
      namesIt.length === 0
        ? `No project's module reminders name ${row.handle}.`
        : `The module reminders of ${String(namesIt.length)} project${namesIt.length === 1 ? '' : 's'} name ${row.handle}. ` +
          'Where the .env line names it, it is matched by its handle.',
  }
  const deadLetters = theDeadLetterSecretary()
  const mergeQueue = theMergeQueueOwner()
  return {
    moduleReminders,
    deadLetters: { inForce: deadLetters.named?.id === row.id, stored: deadLetters.stored === row.id, says: deadLetters.says },
    mergeQueue: { inForce: mergeQueue.named?.id === row.id, stored: mergeQueue.stored === row.id, says: mergeQueue.says },
  }
}

/** One secretary's duties and what is read live beside them. */
function oneSecretarysDuties(workspaceId: string, row: RegisteredAgent): OneSecretarysDuties {
  const found = theDutiesRecords(workspaceId, row.id)[0]
  const duties = found === undefined ? null : shown(found)
  return {
    agent: { ...named(row), holdsTheCard: holdsTheSecretaryCard(row), retired: row.retired },
    duties,
    nobodyRecorded: duties === null ? nobodyRecordedFor(row, workspaceId) : null,
    doors: duties === null ? null : theDoorsNow(duties.doors ?? []),
    oneJobSettings: theOneJobSettingsThatName(row),
  }
}

/**
 * Every secretary with its duties or the sentence that nobody recorded them, and the records of agents that are not. Null
 * reads every project. A record may be stored under an old id filed as its secretary's alias: it is read as that
 * secretary's, and the id is shown as stored.
 */
function everySecretarysDuties(workspaceId: string | null): EverySecretarysDuties {
  const records = theDutiesRecords(workspaceId, null)
  const { canonicalOf } = theFiledAliasesReadOnce(sqlite)
  const agents = listParticipants().agents
  const secretaries = agents.filter((row) => !row.retired && holdsTheSecretaryCard(row))
  const theirs = new Set(secretaries.map((row) => row.id))
  const notASecretaryNow = records.flatMap((one) => {
    const secretary = theSecretaryNamedIn(one.data)?.id
    if (secretary === undefined) return []
    const agent = canonicalOf(secretary)
    if (theirs.has(agent)) return []
    const row = agents.find((each) => each.id === agent)
    const why =
      row === undefined
        ? `No agent has the registry id ${secretary}.`
        : row.retired
          ? `${row.handle} is retired.`
          : `${row.handle} does not hold the secretary card now.`
    return [{ duties: { ...shown(one), secretary }, why }]
  })
  return {
    secretaries: secretaries.map((row) => {
      const found = records.find((one) => {
        const secretary = theSecretaryNamedIn(one.data)?.id
        return secretary !== undefined && canonicalOf(secretary) === row.id
      })
      const duties = found === undefined ? null : shown(found)
      return { agent: named(row), duties, nobodyRecorded: duties === null ? nobodyRecordedFor(row, workspaceId) : null }
    }),
    notASecretaryNow,
    note:
      secretaries.length === 0
        ? 'No agent holds the secretary card that is not retired.'
        : 'GET /api/secretaries/<registry id>/duties adds the grant list\'s answer for each door and the one-job settings that name it.',
  }
}

export async function secretaryDutiesRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/secretaries/duties',
    route('secretaries.duties', 'remote', LIST_NOTE),
    async (req): Promise<EverySecretarysDuties> => {
      const workspaceId = workspaceOf(req)
      return everySecretarysDuties(parse(listQuery, req.query ?? {}, 'The secretaries asked about').scope === 'office' ? null : workspaceId)
    },
  )

  app.get(
    '/secretaries/:agent/duties',
    route('secretaries.agent-duties', 'remote', ONE_NOTE),
    async (req): Promise<OneSecretarysDuties> => oneSecretarysDuties(workspaceOf(req), theAgentNamed(req)),
  )

  app.put(
    '/secretaries/:agent/duties',
    route('secretaries.set-duties', 'remote', SET_NOTE),
    async (req, reply): Promise<OneSecretarysDuties & { written: 'created' | 'changed' | 'nothing changed'; record: PanelRecord; nothingWritten?: string }> => {
      const row = theAgentNamed(req)
      const workspaceId = workspaceOf(req)
      const { warrant: _warrant, ...duties } = parse(dutiesBody, req.body ?? {}, "A secretary's duties:")
      const warrant = theWordsInTheBody(req)
      // THE WARRANT IS BOUND TO THE ID THE PATH NAMES, which may be an old id the secretary kept.
      const named = (req.params as { agent: string }).agent
      const actor = warrant === undefined ? actorFrom(req) : actorWithTheWordsItActsOn(req, warrant, theBindingOf(named, duties))
      const secretary = { kind: 'agent', id: row.id }
      const found = theDutiesRecords(workspaceId, row.id)[0]
      if (found === undefined) {
        const record = createRecord({
          kind: SECRETARY_DUTIES_KIND,
          title: `The duties of ${row.handle}`,
          data: { secretary, ...duties },
          workspaceId,
          actor,
        })
        void reply.code(201)
        return { ...oneSecretarysDuties(workspaceId, row), written: 'created', record }
      }
      // A PUT REPLACES THE DUTIES AND KEEPS THE REST: the record's own fields beside the duties stay as they are, and
      // so does the secretary as stored, which may be an old id of this agent.
      const kept = Object.fromEntries(Object.entries(found.data).filter(([key]) => !(THE_DUTIES_FIELDS as readonly string[]).includes(key)))
      const { record, newSeq, nothingWritten } = patchRecord(found.id, { data: { ...kept, ...duties } }, actor)
      return { ...oneSecretarysDuties(workspaceId, row), written: newSeq === null ? 'nothing changed' : 'changed', record, ...(nothingWritten === undefined ? {} : { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) }) }
    },
  )
}
