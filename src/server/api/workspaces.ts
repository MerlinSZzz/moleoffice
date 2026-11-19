// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The workspace routes: which project am I in, which exist, and how do I choose one.
 *
 *   GET   /api/workspaces      -> every project this installation holds, with how much is in each,
 *                                 and which one THIS request was answered from.
 *   POST  /api/workspaces      -> establish a new project boundary. Empty; nothing is moved into it.
 *   PATCH /api/workspaces/:id  -> rename one, or change the note under its name. The id never moves.
 *
 * ---------------------------------------------------------------------------------------
 * WHY DISCOVERY IS SERVED AND NOT DOCUMENTED
 * ---------------------------------------------------------------------------------------
 *
 * An agent arriving at this API has to be able to find out which projects there are and which one
 * its requests are landing in, without reading a file next to the code. A document says what was
 * true when somebody wrote it; this says what is true now, counted from the records. `GET /api`
 * carries the same three facts in its `workspace` block for a caller that has not got here yet.
 *
 * `GET /api/workspaces` ANSWERS ABOUT ALL OF THEM ON PURPOSE, and it is the only endpoint that
 * does. Every other read in Mole Office answers about one project, because mixing two projects' work is
 * the failure the boundary exists to prevent. The list of boundaries is not itself inside one — a
 * caller that could only see the workspace it was already in could never discover the one it
 * wanted, which is the same trap as a login page you have to be logged in to find.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * No DELETE. Deleting a workspace would orphan every row that names it, in seven tables, and there
 * is no answer to "what happened to my records" that a delete route could give. A project that is
 * finished still holds its record.
 *
 * NO WAY TO CHANGE AN ID, and PATCH refuses one rather than ignoring it. The id is what every row
 * in seven tables stores, what `x-mole-office-workspace` carries and what names a directory in the
 * export; changing it is a migration across the whole database and not a rename. The title is the
 * presentation and it is what a person renaming a project means. A project may be renamed, as one
 * first called panelx is now Mole Office — problem `8U1oygjV1k98`.
 *
 * No members, no roles, no sharing, no access rule. Nothing in Mole Office authenticates anybody; a
 * workspace answers "which project is this" and never "who may see it".
 *
 * No "create a project from these records". Which project an existing record belongs to is a
 * judgement about that record, made one at a time by somebody who knows —
 * `POST /api/records/:id/workspace {"to":"<id>"}` moves one, and reports what has to come with it
 * rather than sweeping anything in. A verb that swept a selection into a new project would be the
 * guess the corpus migration in src/server/db/workspace-migration.ts spends 500 lines refusing.
 *
 * THIS SENTENCE USED TO NAME `PATCH /api/records/:id` WITH A `workspaceId`, AND THAT REQUEST HAS
 * NEVER EXISTED. The patch body is a `strictObject` that has never accepted the key, so a reader
 * following this line got a 400 listing the fields it could send — and for as long as the sentence
 * stood there was no way at all to move a record, which is how five records ended up stuck in
 * `default` linked into `panelx` and made the real database unrestorable from its own archive. Two
 * places that must agree with nothing making them agree, in the shortest possible form: a comment
 * describing a route. tests/workspace-move.test.ts now carries out every request this file names.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { DEFAULT_WORKSPACE, REVIEW_LEVELS, type Workspace, type WorkspaceReading } from '@shared/workspaces.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { actorFrom, workspaceFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { createWorkspace, renameWorkspace, readWorkspaces, workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'

/**
 * What POST /api/workspaces accepts, and nothing else.
 *
 * strictObject, like every other body in this API: a caller that sent `{"name":"Greenhouse"}` and
 * got a 201 would have established a workspace titled something it never chose.
 */
const createBody = z.strictObject({
  id: z.string(),
  title: z.string(),
  note: z.string().nullish(),
})

/**
 * What PATCH /api/workspaces/:id accepts, and nothing else.
 *
 * NO `id`. strictObject refuses one by name rather than dropping it, so a caller that thought it
 * was changing a project's id is told it was not, instead of getting a 200 and a project whose id
 * is the one it always was.
 *
 * `note` MAY BE NULL, which clears it; ABSENT LEAVES IT ALONE. The two are different requests and
 * `nullish` alone could not tell them apart, so the field is optional and nullable rather than
 * `nullish`, and `renameWorkspace` reads `undefined` as "not sent".
 */
const renameBody = z.strictObject({
  title: z.string().optional(),
  note: z.string().nullable().optional(),
  /**
   * HOW MUCH REVIEW A FINISHED RUN IN THIS PROJECT GETS.
   *
   * THE THREE WORDS ARE READ FROM `REVIEW_LEVELS` and not typed out again here, so this door and the
   * shared reader cannot come to different answers about which three exist. `null` puts the project
   * back to nobody having chosen, which reads as `full`; leaving the key out keeps what is stored,
   * for the reason `note` above gives.
   */
  reviewLevel: z.enum(REVIEW_LEVELS).nullable().optional(),
  packageInspection: z.boolean().optional(),
})

export interface WorkspacesReply {
  /** Every project this installation holds, oldest first, with its live record count. */
  workspaces: WorkspaceReading[]
  /**
   * The project THIS request was answered from, and whether the request said so.
   *
   * The most useful field here and the reason this is not a static list. An agent that has just
   * set `x-mole-office-workspace` needs to see that the server agreed; an agent that has not needs to
   * see which project its writes have been landing in all along.
   */
  current: { id: string; stated: boolean }
  /** How to choose one, in the same words GET /api uses. Served, so nothing has to be remembered. */
  choosing: string
}

export const CHOOSING_A_WORKSPACE =
  'Send `x-mole-office-workspace: <id>` on every request. A request that sends none is answered from ' +
  `"${DEFAULT_WORKSPACE}" — a stated default, not a guess — and a header that arrives present and blank is ` +
  'refused, because an unset variable in a header template produces exactly that. An id that names no ' +
  'workspace is refused rather than created: a misspelt one would file the write into a project nobody has. ' +
  'Every read answers about one workspace, every write lands in one, and a link whose two ends are in ' +
  'different workspaces is refused.'

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/workspaces',
    route(
      'project.workspaces',
      'remote',
      'Every project boundary this installation holds, with how many live records are in each, plus which ' +
        'workspace THIS request was answered from and whether it said so. The one endpoint that answers about all ' +
        'of them: everything else answers about one.',
    ),
    async (req): Promise<WorkspacesReply> => {
      // Resolved through the same gate every other route uses, so this endpoint refuses an unknown
      // or malformed workspace exactly as a write would. Discovery that accepted a header the rest
      // of the API rejects would be a second answer to "is this a workspace".
      const current = workspaceOf(req)
      return {
        workspaces: readWorkspaces(),
        // `stated` comes from the same header reader the gate uses rather than from comparing the
        // answer against the default, because a caller that sends `x-mole-office-workspace: default`
        // HAS said which project it means and would otherwise be told it had not.
        current: { id: current, stated: workspaceFrom(req).stated },
        choosing: CHOOSING_A_WORKSPACE,
      }
    },
  )

  app.post(
    '/workspaces',
    route(
      'project.new-workspace',
      'remote',
      'Establish a new project boundary: {"id":"greenhouse","title":"Greenhouse","note":"…"}. The id is what every ' +
        'row stores and what x-mole-office-workspace carries — lowercase letters, digits, hyphen and underscore. It ' +
        'arrives EMPTY: nothing is copied and no existing record is moved into it, because which project a record ' +
        'belongs to is a judgement about that record.',
    ),
    async (req, reply): Promise<Workspace> => {
      // Read for the same reason every write reads it: a request from a blank or misspelt actor is
      // refused before it changes anything. Establishing a project is not human-only — the
      // human-only rule guards the `decision` kind, which is a person's judgement about the work.
      actorFrom(req)
      const body = parse(createBody, req.body, 'The request body is not usable:')
      const created = createWorkspace({ id: body.id, title: body.title, note: body.note ?? null })
      reply.status(201)
      return created
    },
  )

  app.patch(
    '/workspaces/:id',
    route(
      'project.rename-workspace',
      'remote',
      'Rename a project, change the note under its name, or say how much review its finished runs get: ' +
        'PATCH /api/workspaces/<id> {"title":"Mole Office"} or {"reviewLevel":"light"}. ' +
        'THE ID NEVER CHANGES and the body may not carry one — the id is what every row stores, what ' +
        'x-mole-office-workspace carries and what names a directory in the export, so changing it would be a ' +
        'migration across the database rather than a rename. The title is what a person reads. Send `note` to ' +
        'rewrite the line under the name, or null to clear it; leave it out to keep it. Send `reviewLevel` as ' +
        'none, light or full, or null to put it back to nobody having chosen, which reads as full. ' +
        sayInEnglish('delegation.inspection.workspaceDoor') + ' Nothing about which records are in the project moves.',
    ),
    async (req): Promise<Workspace> => {
      // Read for the same reason the create route reads it: a request from a blank or misspelt
      // actor is refused before it changes anything.
      actorFrom(req)
      const { id } = parse(z.strictObject({ id: z.string() }), req.params, 'The address is not usable:')
      const body = parse(renameBody, req.body, 'The request body is not usable:')
      return renameWorkspace(id, body)
    },
  )
}
