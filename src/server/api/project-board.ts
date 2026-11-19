// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECT'S MASTER PIPELINE, AND THE BOARD READ FROM IT.
 *
 *   GET /api/projects/:project/master-pipeline   which pipeline is the project's master, or that none is marked
 *   PUT /api/projects/:project/master-pipeline   mark one, or mark none
 *   GET /api/projects/:project/board             one row for each step of the master, worked out now and not stored
 *   GET /api/map/dictionary                      a file path or a module in, its block, module and owning line out
 *
 * The id in a /projects path is a project, not a record in one: the Settings page and an agent may mark a project's master
 * from whichever project is open. The pipeline must be in the project the path names, and the writer refuses one that
 * is not.
 *
 * THE DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING. Who is asking is checked first, then the body and the reason,
 * then the record, and only then is the column written and the change written down.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { MapDictionary } from '@shared/big-map-reading.ts'
import type { ProjectBoard } from '@shared/project-board.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { readTheMapDictionary } from '../lib/map-dictionary.ts'
import { markTheMasterPipeline, theMasterPipeline, type TheMasterPipeline } from '../lib/master-pipeline.ts'
import { readTheProjectBoard } from '../lib/project-board.ts'
import { theKeyProvesASecretary } from '../lib/the-key-proves-a-secretary.ts'
import { PanelError } from '../lib/panel-error.ts'
import {
  theLastChangeOfASetting,
  thePersonIsProved,
  writeDownASettingChange,
  type Actor,
  type ASettingsLastChange,
} from '../lib/records.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const READ_NOTE =
  "Which pipeline is this project's master: the pipeline whose steps are the project's architecture blocks. Read " +
  'only, and no body is read. The reply is {project, state, lastChange} with state "marked" (and id, title), ' +
  '"unmarked" (nobody has marked one) or "broken" (and id, because: "not there", "deleted", "not a pipeline" or "in ' +
  'another project"). No pipeline is chosen in place of a missing or broken mark. lastChange is the newest recorded ' +
  'change to this project\'s mark, {by: {type, id}, at, field, from, to}, whose field carries the reason given, or ' +
  'null when the change log holds none.'

const SET_NOTE =
  'Mark this project\'s master pipeline. Body {pipeline: "<record id>" | null, because: "<why>"}; null marks none. ' +
  'The owner may, with or without a reason. A secretary proved by its own key may, and must give a reason. Any other ' +
  'agent is refused. The record must be a live pipeline of this project. Every change is kept in the change log with ' +
  'who, when and why, and a press that leaves the mark as it was writes nothing. The reply is the reading as it now ' +
  'stands, with lastChange as in the GET.'

const BOARD_NOTE =
  "This project's board: one row for each step of its master pipeline, in the order the board shows them, worked " +
  'out from records, links and main\'s history when asked, and nothing stored. Read only, and no body is read. Each ' +
  'row has its group (nobody-on-it, stalled, not-known, moving-or-done or no-pipeline), the pipelines under it at any ' +
  'depth, their unfinished steps with each one\'s age in days, the runs that sent the office a request within ' +
  'actingWithinHours, open packages, open backlog items and the landings on main of the last 7 days. ' +
  'actingWithinHours is the idle reminder\'s setting, the hours an agent may go idle before the office reminds it of ' +
  'its role, so the board and the reminder count the same runs as quiet. lines is the same reading by line. When no ' +
  'master is marked, or the mark is broken, master says so and rows is empty. PUT ' +
  '/api/projects/:project/master-pipeline marks the master. The owner may mark it, with or without a reason. A ' +
  'secretary proved by its own key may mark it, and must give a reason. No other agent may. When main\'s history ' +
  'could not be read, landings says why and each row\'s landing count is null. This door holds no hours main was ' +
  'red: the board\'s quick view reads them from GET /api/merge-queue/measures, the merge queue\'s own measure. The ' +
  'board gives no estimate, because no way of working one out from the records has been chosen yet. The shapes are ' +
  'in src/shared/project-board.ts.'

const DICTIONARY_NOTE =
  'For a file path or a module, its block on the big map, the module and the line that owns it. Ask with ' +
  '?path=<repository-relative path> or ?module=<module id>, one of the two, in the project the request names. Read ' +
  'only. By path, modules is every live module with a stated row whose pattern matches the path, in any repository ' +
  'of the project, each with the rows that matched; no module is guessed from a folder, so a path nobody states ' +
  'answers with none. Each module has owner, from its owner field, or null when nobody has recorded one, and places: ' +
  'the boxes of the big map it implements, each with its block pipeline and its block (place 0 is M0). places [] ' +
  'means the module is on no block yet; null means the map was not read, because master is unmarked or broken. ' +
  'others names live records of other kinds that state the path. The shapes are in src/shared/big-map-reading.ts.'

/** What the dictionary may be asked: a path or a module. Which of the two is checked in the door, with a code. */
const dictionaryQuery = z.object({
  path: z.string().trim().min(1).optional(),
  module: z.string().trim().min(1).optional(),
})

/** What a caller may send: one pipeline or none, and a reason. */
const setBody = z.strictObject({
  pipeline: z.string().trim().min(1).nullable(),
  because: z.string().optional(),
})

/**
 * A SECRETARY MARKS IT, AND THE PERSON MAY CHANGE IT. The secretary of each project marks that project's master. Any
 * other agent may read the mark and may file a proposal about it.
 *
 * The answer is whether a reason is required: the person's press needs none, a secretary's change does.
 */
function whoMayMarkTheMasterPipeline(actor: Actor): { reasonRequired: boolean } {
  if (thePersonIsProved(actor)) return { reasonRequired: false }
  if (actor.theOwnersAuthority?.holds === true) return { reasonRequired: false }
  if (theKeyProvesASecretary(actor)) return { reasonRequired: true }
  throw new PanelError(
    `A project's master pipeline is marked by a secretary with a reason, or by the owner, and this request was made ` +
      `by "${actor.id}", which is neither. Nothing was changed. A secretary is proved by its own key. Any agent may ` +
      'read the mark and may file a proposal about it.',
    403,
    undefined,
    undefined,
    undefined,
    { code: 'masterPipelineNotAllowed', values: {} },
  )
}

/** The stored mark, as the change log keeps it: the record id, or null for none. */
function theStoredMark(reading: TheMasterPipeline): string | null {
  return reading.state === 'unmarked' ? null : reading.id
}

/** The change log's name for one project's mark, so each project's changes are read on their own. */
function theSetting(project: string): string {
  return `master-pipeline:${project}`
}

/** What both doors answer: the reading, and the newest recorded change to it. */
type TheMarkAndItsLastChange = TheMasterPipeline & { lastChange: ASettingsLastChange | null }

function withItsLastChange(reading: TheMasterPipeline): TheMarkAndItsLastChange {
  return { ...reading, lastChange: theLastChangeOfASetting(theSetting(reading.project)) }
}

export async function projectBoardRoutes(app: FastifyInstance): Promise<void> {
  const projectParam = z.object({ project: z.string().min(1) })

  app.get(
    '/projects/:project/master-pipeline',
    route('project.master-pipeline', 'remote', READ_NOTE),
    async (req): Promise<TheMarkAndItsLastChange> => {
      const { project } = parse(projectParam, req.params, 'The project')
      return withItsLastChange(theMasterPipeline(project))
    },
  )

  app.get(
    '/projects/:project/board',
    route('project.board', 'remote', BOARD_NOTE),
    async (req): Promise<ProjectBoard> => {
      const { project } = parse(projectParam, req.params, 'The project')
      return readTheProjectBoard(project)
    },
  )

  app.get('/map/dictionary', route('map.dictionary', 'remote', DICTIONARY_NOTE), async (req): Promise<MapDictionary> => {
    const query = parse(dictionaryQuery, req.query, 'The query string is not usable:')
    if ((query.path === undefined) === (query.module === undefined)) {
      throw new PanelError(
        'The dictionary is asked one thing at a time: send ?path=<a file path> or ?module=<a module id>, and not both.',
        400,
        undefined,
        undefined,
        undefined,
        { code: 'mapDictionaryAsksOneThing', values: {} },
      )
    }
    return readTheMapDictionary(workspaceOf(req), query.path === undefined ? { module: query.module! } : { path: query.path })
  })

  app.put(
    '/projects/:project/master-pipeline',
    route('project.set-master-pipeline', 'remote', SET_NOTE),
    async (req): Promise<TheMarkAndItsLastChange> => {
      const actor = actorFrom(req)
      const { reasonRequired } = whoMayMarkTheMasterPipeline(actor)
      const { project } = parse(projectParam, req.params, 'The project')
      const body = parse(setBody, req.body ?? {}, 'The master pipeline')
      const because = body.because?.trim() ? body.because.trim() : null
      if (reasonRequired && because === null) {
        throw new PanelError(
          'A secretary who marks a project\'s master pipeline gives a reason, in "because". Nothing was changed.',
          400,
          undefined,
          undefined,
          undefined,
          { code: 'masterPipelineNeedsAReason', values: {} },
        )
      }
      const before = theMasterPipeline(project)
      const after = markTheMasterPipeline(project, body.pipeline)
      // WHAT WAS MARKED AND WHY: the stored id, or null for none. No column keeps the reason, so the row's words carry
      // it, and a press that left the mark as it was writes no row.
      writeDownASettingChange(actor, {
        setting: theSetting(project),
        field: `the master pipeline of ${project}` + (because === null ? '' : `, because: ${because}`),
        before: theStoredMark(before),
        after: theStoredMark(after),
        workspaceId: project,
      })
      return withItsLastChange(after)
    },
  )
}
