// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH PROJECTS A READ COVERS.
 * `WhichProjects`, `EVERY_PROJECT` and `justThisProject` were moved byte for byte out of
 * src/server/lib/workspaces.ts, with no change of behaviour. That file re-exports them. `narrowedToProjects`,
 * which turns the answer into SQL, moved to ./which-projects-sql.ts, because it needs drizzle.
 */

/**
 * WHICH PROJECTS A READ COVERS: one of them, or all of them.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * Almost every read in Mole Office is about one project, and that is right: a record belongs to a
 * project and an answer about the wrong one looks entirely normal on arrival. A few reads are about
 * a PERSON instead, and a person is not in a project. The rule of 5 September 2026 put plans and
 * schedules on that side, and criterion M55 puts their conversations there too: *the chat is the
 * person's, whichever project is open*.
 *
 * IT IS A STATEMENT, NOT AN ABSENCE. A caller says `EVERY_PROJECT` out loud; there is no way to
 * reach the wide read by leaving something out. That matters because the two answers look alike —
 * a list of contacts either way — and a read that silently widened would be the same defect as one
 * that silently narrowed, which is what M55 was.
 *
 * IT IS NOT A PERMISSION. Nothing here decides who may read what; Mole Office authenticates nobody.
 * It says how wide one question is.
 */
export type WhichProjects = { oneProject: string } | { everyProject: true }

/** The person's whole pool, across every project of this world. Criterion M55. */
export const EVERY_PROJECT: WhichProjects = { everyProject: true }

/** One project's, which is what almost every read wants. */
export function justThisProject(workspaceId: string): WhichProjects {
  return { oneProject: workspaceId }
}
