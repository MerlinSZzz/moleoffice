// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The workspace registry: which projects this installation holds, and the one gate every request
 * naming one goes through.
 *
 * src/shared/workspaces.ts says what a workspace IS and why it is not a user, a role or a record
 * kind. This file is the server's side of it: reading the set, establishing a new one, and
 * refusing a request that names a project that does not exist.
 *
 * WHY THE REFUSAL IS THE WHOLE POINT. Without a declared set, `x-mole-office-workspace: greenhousee`
 * would file a write into a project nobody has — silently, and unreachably afterwards by anyone
 * spelling it right. That is the misspelt-actor-header defect one door along, and it is answered
 * the same way it was: refuse, and name what does exist.
 */

import { KNOWLEDGE_WORKSPACE } from '@shared/knowledge/constants.ts'
import { KNOWLEDGE_WORDS } from '@shared/words/en-wave-13u.ts'
import type { FastifyRequest } from 'fastify'
import { and, count, eq, isNull, ne, sql } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records, workspaces } from '../db/schema.ts'
import { FLOW_RUN_KIND } from '../../shared/flow-run.ts'
import {
  DEFAULT_WORKSPACE,
  MESSAGE_CENTRE,
  isAProjectOnAList,
  reviewLevelOf,
  workspaceIdFault,
  workspaceTitleFault,
  type ReviewLevel,
  type Workspace,
  type WorkspaceReading,
} from '@shared/workspaces.ts'
import { now } from '@shared/now.ts'
import { PanelError } from './panel-error.ts'
import { workspaceFrom } from './http.ts'
import { EVERY_PROJECT, justThisProject, type WhichProjects } from '@shared/which-projects.ts'
import { narrowedToProjects } from '@shared/which-projects-sql.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { toWorkspace } from '../db/get-workspace.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import { requireWorkspace } from './require-workspace.ts'

// ============================================================================ how wide a read is

export { EVERY_PROJECT, justThisProject, narrowedToProjects, type WhichProjects }

/** How to say which projects a read covered, for a reply that reports it. */
export function theProjectsRead(which: WhichProjects): string | null {
  return 'oneProject' in which ? which.oneProject : null
}

export { toWorkspace } from '../db/get-workspace.ts'

export { theReviewLevel } from '../db/the-review-level.ts'

export { listWorkspaces } from '../db/list-workspaces.ts'

export { getWorkspace } from '../db/get-workspace.ts'

/**
 * Every workspace with how much live work is in it, which is what makes the list usable.
 *
 * "Which exist" on its own does not tell an agent which one to work in. The count does, and it is
 * counted rather than remembered — there is no `records` column on the registry to fall out of
 * date with the records.
 *
 * A FLOW RUN IS NOT COUNTED. The office files one beside every run (src/server/lib/flow-runs.ts), so counting them
 * would count each run twice and make a project full of runs look fuller than its work. Wave 13p round 26.
 */
export function readWorkspaces(): WorkspaceReading[] {
  const counts = new Map(
    db
      .select({ workspaceId: records.workspaceId, n: count() })
      .from(records)
      .where(and(isNull(records.deletedAt), ne(records.kind, FLOW_RUN_KIND)))
      .groupBy(records.workspaceId)
      .all()
      .map((r) => [r.workspaceId, r.n]),
  )
  return listWorkspaces().map((w) => ({
    ...w,
    records: counts.get(w.id) ?? 0,
    isDefault: w.id === DEFAULT_WORKSPACE,
  }))
}

export { requireWorkspace } from './require-workspace.ts'

/**
 * Which project this request is working in, as one line at the top of a route.
 *
 * THE PAIR THAT EVERY ROUTE USES: `workspaceFrom` reads the header and checks its shape,
 * `requireWorkspace` checks that the project exists. Written as one call so that no route can do
 * the first and forget the second — a route that read the header and did not check it would file
 * work into a project nobody has, which is the whole thing the registry is for.
 */
export function workspaceOf(req: FastifyRequest): string {
  const claim = workspaceFrom(req)
  return requireWorkspace(claim.id, claim.stated).id
}

/**
 * Establish a new project boundary.
 *
 * NOTHING IS COPIED AND NOTHING IS MOVED. A new workspace is empty, and the records that belong in
 * it are written into it or moved into it one at a time by somebody who knows. A "create a project
 * from these records" verb would be exactly the guess the corpus migration refuses to make.
 *
 * NOT HUMAN-ONLY. An agent starting work on a new project may say so; the human-only rule guards
 * the `decision` kind, which is a person's judgement, and this is a filing cabinet.
 */
export function createWorkspace(input: { id: string; title: string; note?: string | null }): Workspace {
  if (input.id === KNOWLEDGE_WORKSPACE) throw new PanelError(KNOWLEDGE_WORDS.onlyProject, 400)
  const fault = workspaceIdFault(input.id)
  if (fault !== null) throw new PanelError(fault)
  const titleFault = workspaceTitleFault(input.title)
  if (titleFault !== null) throw new PanelError(titleFault)
  const title = input.title.trim()

  const clash = getWorkspace(input.id)
  if (clash !== null) {
    throw new PanelError(
      `There is already a workspace called "${input.id}" ("${clash.title}"). Nothing was changed: an id is how ` +
        `every row in seven tables names its project, so taking one that is in use would silently adopt ` +
        `somebody else's work.`,
      409,
    )
  }

  // A NEW PROJECT CHOOSES NO REVIEW LEVEL, so it reads as `full` until somebody opens Settings and
  // says otherwise. Establishing a project is not the moment to decide how much review it wants.
  // NOR A MODULE REMINDER SECRETARY: nothing set here, so the .env line counts until somebody chooses on Settings.
  const row = {
    id: input.id,
    title,
    note: input.note ?? null,
    reviewLevel: null,
    packageInspection: false,
    moduleReminderSecretary: null,
    moduleReminderSecretaryBecause: null,
    masterPipeline: null,
    createdAt: now(),
    updatedAt: now(),
  }
  db.insert(workspaces).values(row).run()
  return toWorkspace(row)
}

/**
 * Rename a project, or change the note under its name. THE ID NEVER MOVES.
 *
 * WHY THE ID IS NOT IN THE BODY AT ALL. The id is what every row in seven tables stores, what
 * `x-mole-office-workspace` carries, and what names a directory in the per-workspace export.
 * Changing it would be a migration across the whole database wearing the clothes of a rename, and
 * every browser and every agent holding the old id would be reading a project that no longer
 * answers. The title is presentation and it is the only thing a person is renaming.
 *
 * NOTHING IS RECORDED ABOUT WHO RENAMED IT, and that is a real gap rather than a decision. The
 * registry has no change log: it stores id, title, note and two timestamps, and a workspace is not
 * a record, so the `changes` and `revisions` tables cannot hold this write. What a reader can see
 * afterwards is the new title and `updatedAt`.
 *
 * NOT HUMAN-ONLY, for the reason `createWorkspace` gives above: the human-only rule guards the
 * `decision` kind, which is a person's judgement about the work, and a project's name is
 * presentation. See tests/workspace-rename.test.ts.
 */
export function renameWorkspace(
  id: string,
  input: { title?: string; note?: string | null; reviewLevel?: ReviewLevel | null; packageInspection?: boolean },
): Workspace {
  const found = getWorkspace(id)
  if (id === KNOWLEDGE_WORKSPACE) throw new PanelError(KNOWLEDGE_WORDS.onlyProject, 400)
  if (id === MESSAGE_CENTRE) {
    throw new PanelError(
      `"${MESSAGE_CENTRE}" is the office's message centre, where every message is kept, and not a project. Nothing was ` +
        'renamed.',
      400,
    )
  }
  if (found === null) {
    const existing = listWorkspaces()
    throw new PanelError(
      `There is no workspace called "${id}", so nothing was renamed. This installation holds ` +
        `${existing.length === 0 ? 'none at all' : existing.map((w) => `${w.id} ("${w.title}")`).join(', ')}. ` +
        `GET /api/workspaces lists them.`,
      404,
    )
  }
  if (input.title === undefined && input.note === undefined && input.reviewLevel === undefined && input.packageInspection === undefined) {
    throw new PanelError(
      `This request changed nothing about "${id}". Send a title, a note, a review level, a package inspection choice, or any of them — ` +
        `an empty change would move updatedAt and say a rename happened when none did.`,
    )
  }
  if (input.title !== undefined) {
    const fault = workspaceTitleFault(input.title)
    if (fault !== null) throw new PanelError(fault)
  }

  const next = {
    title: input.title === undefined ? found.title : input.title.trim(),
    note: input.note === undefined ? found.note : input.note,
    // NULL PUTS IT BACK TO NOBODY HAVING CHOSEN; leaving the key out
    // keeps what is stored. The three words themselves are refused at the route, which is where
    // every other shape in this product is refused.
    reviewLevel: input.reviewLevel === undefined ? found.reviewLevel : input.reviewLevel,
    packageInspection: input.packageInspection === undefined ? found.packageInspection : input.packageInspection,
    updatedAt: now(),
  }
  db.update(workspaces).set(next).where(eq(workspaces.id, id)).run()
  return { ...found, ...next }
}

/**
 * How many rows in each table name a workspace that is not in the registry.
 *
 * Not called by the product. It is what tests/workspace-boundary.test.ts asks after a migration:
 * an orphaned workspace_id is a row nobody can reach, and the only way to notice one is to look.
 */
export function rowsNamingNoWorkspace(): { table: string; rows: number }[] {
  const check = (table: string, column = 'workspace_id'): { table: string; rows: number } => {
    const row = db.get<{ n: number }>(
      sql.raw(
        `SELECT count(*) AS n FROM "${table}" WHERE ${column} IS NOT NULL AND ${column} NOT IN (SELECT id FROM workspaces)`,
      ),
    )
    return { table, rows: row?.n ?? 0 }
  }
  return [
    check('records'),
    check('links'),
    check('changes'),
    check('reader_anchors'),
    check('presentation_intent'),
    check('panel_layouts'),
    check('session_resources'),
  ].filter((r) => r.rows > 0)
}

/** True when this workspace holds nothing at all. Used by the refusal sentences, not by a rule. */
export function workspaceIsEmpty(id: string): boolean {
  const row = db
    .select({ n: count() })
    .from(records)
    .where(and(eq(records.workspaceId, id), isNull(records.deletedAt)))
    .get()
  return (row?.n ?? 0) === 0
}
