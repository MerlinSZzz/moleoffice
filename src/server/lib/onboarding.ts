// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH PROJECT A WORKING DIRECTORY BELONGS TO, WORKED OUT FROM THE RECORDS THEMSELVES.
 *
 * `src/shared/onboarding.ts` holds the rule: a directory belongs to the project whose registered
 * repository root or work area holds it, deepest match first. This file gathers the facts that rule
 * is applied to — the projects, the repositories registered to each, and the work areas their agents
 * registered — so the bootstrap read, the onboarding read and the registration door all ask one
 * question of one reading rather than three that can disagree.
 *
 * A WORK AREA IS REPOSITORY-RELATIVE, so it is resolved under every repository root of its own
 * project. That is the same resolution `src/server/api/files.ts` uses for the preview roots, and
 * the same reason: a work area cannot name a directory outside the repositories its project
 * registered. A repository with no root contributes nothing and is not a fault — the empty root is
 * a real answer meaning "there is no checkout of it on this machine".
 *
 * THIS READS EVERY AGENT RECORD OF EVERY PROJECT when a directory has to be matched. That is the
 * price of answering honestly and it is paid only when the caller named a directory and no project;
 * every ordinary request resolves its project from the header and never reaches this file.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { join } from 'node:path'
import { db } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { requireWorkspace } from './require-workspace.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { WORKSPACE_HEADER } from '@shared/request-headers.ts'
import { DEFAULT_WORKSPACE } from '@shared/workspaces.ts'
import {
  directoryMatches,
  type DirectoryMatch,
  type RegisteredProject,
  type RegisteredWorkArea,
} from '@shared/onboarding.ts'

/** The work areas one project's agents registered, each resolved to an absolute directory here. */
function workAreasOf(workspaceId: string, roots: readonly { name: string; root: string | null }[]): RegisteredWorkArea[] {
  const rows = db
    .select()
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), eq(records.kind, 'agent'), isNull(records.deletedAt)))
    .all()
  const areas: RegisteredWorkArea[] = []
  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>
    const declared = Array.isArray(data['workArea']) ? data['workArea'] : []
    const handle = typeof data['handle'] === 'string' && data['handle'] !== '' ? data['handle'] : row.title
    for (const entry of declared) {
      if (typeof entry !== 'string' || entry.trim() === '') continue
      const relative = entry.trim()
      if (relative.startsWith('/')) {
        // An absolute work area is stored as it was written. It is matched as it stands rather than
        // being refused: the matcher's job is to say which project holds a directory, and a project
        // whose agent named one absolutely is a real answer.
        areas.push({ name: handle, path: relative })
        continue
      }
      for (const repository of roots) {
        if (repository.root === null) continue
        areas.push({ name: `${handle} in ${repository.name}`, path: join(repository.root, relative) })
      }
    }
  }
  return areas
}

/** Every project's registered directories, as the matcher reads them. */
export function registeredProjectDirectories(): RegisteredProject[] {
  return listWorkspaces().map((workspace) => {
    const repositories = listRepositories(workspace.id).map((repository) => ({
      name: repository.name,
      root: repository.root,
    }))
    return {
      workspaceId: workspace.id,
      repositories,
      workAreas: workAreasOf(workspace.id, repositories),
    }
  })
}

/**
 * WHICH PROJECT HOLDS A WORKING DIRECTORY, deepest match first.
 *
 * An empty list is the answer "nothing registered here holds it", and the caller says so and asks.
 * It is never turned into the default project by this function or by its callers.
 */
export function projectsHolding(directory: string): DirectoryMatch[] {
  return directoryMatches(directory, registeredProjectDirectories())
}

/**
 * WHICH PROJECT A REQUEST IS ABOUT, AND THE SENTENCE SAYING HOW IT WAS WORKED OUT.
 *
 * One reading, so the onboarding read, the bootstrap read and the registration door cannot come to
 * three answers. The caller decides what a `nothing-matched` or `ambiguous` answer means for its
 * own door: onboarding says so and carries on with the doors, bootstrap refuses because it has
 * nothing to answer about. NEITHER TURNS IT INTO THE DEFAULT.
 */
export type ProjectResolution =
  | { kind: 'named'; id: string; because: string }
  | { kind: 'matched'; id: string; because: string }
  | { kind: 'default'; id: string; because: string }
  | { kind: 'nothing-matched'; id: null; because: string }
  | { kind: 'ambiguous'; id: null; because: string }

export function resolveProject(
  claim: { id: string; stated: boolean },
  directory: string | null,
): ProjectResolution {
  if (claim.stated) {
    const id = requireWorkspace(claim.id, true).id
    return { kind: 'named', id, because: `The request named it with ${WORKSPACE_HEADER}: "${id}".` }
  }
  if (directory !== null) {
    const matches = projectsHolding(directory)
    if (matches.length === 0) {
      return {
        kind: 'nothing-matched',
        id: null,
        because:
          `Nothing matched the working directory "${directory}": no repository root and no registered work ` +
          `area of any project holds it. Say which project you meant with ${WORKSPACE_HEADER}, or register a ` +
          'repository root or a work area that holds it.',
      }
    }
    const best = matches[0]
    const tied =
      best === undefined
        ? []
        : matches.filter(
            (match) =>
              match.matchedPath.length === best.matchedPath.length && match.workspaceId !== best.workspaceId,
          )
    if (best === undefined || tied.length > 0) {
      const projects = [...new Set(matches.map((match) => match.workspaceId))]
      return {
        kind: 'ambiguous',
        id: null,
        because:
          `More than one project holds the working directory "${directory}" (${projects.join(', ')}), so ` +
          `this read will not choose between them. Say which project you meant with ${WORKSPACE_HEADER}.`,
      }
    }
    return {
      kind: 'matched',
      id: best.workspaceId,
      because:
        `No ${WORKSPACE_HEADER} header was sent; the working directory "${directory}" matched ` +
        `${best.because} "${best.name}" at "${best.matchedPath}", so this reply is about "${best.workspaceId}".`,
    }
  }
  const id = requireWorkspace(DEFAULT_WORKSPACE, false).id
  return {
    kind: 'default',
    id,
    because:
      `The request named no project. It is answered from the default project "${id}", which is not a project ` +
      `you chose and holds nothing a new agent was assigned. Say which project you meant with ` +
      `${WORKSPACE_HEADER}, or send ?directory=<your working directory>.`,
  }
}
