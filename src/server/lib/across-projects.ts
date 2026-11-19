// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECTS A READER MAY READ, AND THE ROWS OF THEM THE READER MAY SEE. Goals, Counters,
 * Context bundles and All records read across projects. Every door that answers
 * `?projects=` (src/shared/across-projects.ts) asks this file, so there is one answer to "which
 * projects" and it cannot differ from door to door.
 *
 * NO RULE KEEPS A READER OUT OF A WHOLE PROJECT TODAY. src/shared/disclosure.ts says so itself: no
 * read is narrowed by permission, and every reply says `narrowedByPermission: null`. So the projects
 * a reader may read are every registered project (message Ux8NxlYa-f4o). No project-level rule is
 * invented here: such a rule is the person's decision and its own piece. The day this function
 * leaves a project out, the door that called it fills
 * `narrowedByPermission` with a group whose cause is 'permission'.
 *
 * WHAT IS TAKEN OUT OF THE ROWS is what the one-project doors already take out: a message the reader
 * may not read, through the same `onlyTheMessagesThisReaderMayRead`. Deleted
 * records never arrive, because `listRecords` leaves them out unless asked.
 */
import { sql } from 'drizzle-orm'

import { EVERY_PROJECT, PROJECTS_QUERY } from '@shared/across-projects.ts'
import { MESSAGE_CENTRE, isAProjectOnAList, type Workspace } from '@shared/workspaces.ts'
import { db } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { theViewReadOneWayAtATime } from './message-centre.ts'
import { onlyTheMessagesThisReaderMayRead, type AMessageReader } from './messages.ts'
import { PanelError } from './panel-error.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import { theProjectsAReaderMayRead } from '../db/the-projects-a-reader-may-read.ts'
export { theProjectsAReaderMayRead }

/** The one sentence for a `projects` word sent twice, empty, or as spaces only. */
const NO_PROJECTS_VALUE = `${PROJECTS_QUERY} must be sent once, as ${EVERY_PROJECT} or as one project id.`

/** A `?projects=` value as the one reader reads it: the spaces around it are taken off. */
function theValueAsRead(raw: string): string {
  return raw.trim()
}

/**
 * Whether a `?projects=` value asks for every project, read the way `theProjectsAsked` reads it. A door
 * that answers `all` differently from one project named alone asks this, and never compares the raw value.
 */
export function asksForEveryProject(raw: string): boolean {
  return theValueAsRead(raw) === EVERY_PROJECT
}

/**
 * The projects a `?projects=` value asks for, among those the reader may read. THE ONE READER OF THE
 * VALUE: every door hands it the value as it came, and it trims spaces here, so " all" means the same
 * at every door (problem aLkFgGvcHWIz). A value of spaces only is refused in one sentence.
 *
 * `all` is every project the reader may read. A project id is that one project. An id that names no
 * project, or a project the reader may not read, is REFUSED with a sentence rather than read as
 * "nothing there": an empty page would say the project holds nothing, which is not what happened.
 */
export function theProjectsAsked(raw: string, reader: AMessageReader): Workspace[] {
  const value = theValueAsRead(raw)
  if (value === '') throw new PanelError(NO_PROJECTS_VALUE, 400)
  const mayRead = theProjectsAReaderMayRead(reader)
  if (value === EVERY_PROJECT) return mayRead
  const one = mayRead.find((workspace) => workspace.id === value)
  if (one !== undefined) return [one]
  // THE MESSAGE CENTRE HAS A ROW BUT IS NO PROJECT, so asking for it is asking for no project.
  // Nobody is kept out of it, and saying so would be untrue.
  const exists = getWorkspace(value) !== null && isAProjectOnAList(value)
  throw new PanelError(
    exists
      ? aProjectYouMayNotRead(value)
      : `No project is called "${value}". Ask for ?projects=all, or for the id of a project GET /api/workspaces lists.`,
    exists ? 403 : 400,
  )
}

/**
 * THE REFUSAL OF A PROJECT THE READER MAY NOT READ, with its way on (problem ABymPRdK3fUj). Nothing words it today,
 * because no rule keeps a reader out of a whole project; the day one does, the reader is told what to do next.
 */
export function aProjectYouMayNotRead(id: string): string {
  return `You may not read the project "${id}", so nothing of it was read. Ask for ?projects=all to read every project you may read, or ask the owner to let you read this one.`
}

/**
 * Of these rows, the ones in the projects asked for that this reader may see.
 *
 * A MESSAGE IS KEPT IN THE MESSAGE CENTRE AND BELONGS TO NO PROJECT, so it is kept here when it is
 * in the view of a project asked for: written in it, about it, or commenting on one of its records. Which messages a
 * view holds is asked of the database through `theViewReadOneWayAtATime`, which gives the messages `messagesInTheViewOf`
 * gives, so this cannot answer differently from the project's own pages. A message in no project's view, written by a
 * tool that named no project, is in none of these.
 */
export function theRowsTheReaderMaySee<T extends { id: string; kind: string; workspaceId: string }>(
  rows: readonly T[],
  projects: readonly Workspace[],
  reader: AMessageReader,
): T[] {
  const ids = new Set(projects.map((workspace) => workspace.id))
  const inAView = rows.some((row) => row.workspaceId === MESSAGE_CENTRE) ? theMessagesInTheViewsOf(projects) : new Set<string>()
  return onlyTheMessagesThisReaderMayRead(
    reader,
    rows.filter((row) => ids.has(row.workspaceId) || (row.workspaceId === MESSAGE_CENTRE && inAView.has(row.id))),
  )
}

/**
 * The ids of the messages in the view of any of these projects, deleted ones included. Each project's view is read one
 * way at a time, through the index of each way (`theViewReadOneWayAtATime`), in one statement for each project. Asked as
 * one condition, every project's rule joined by OR, SQLite tested every message of the office against it: 777 to 971 ms
 * for the 126,367 messages in the views of a search across every project, on the made-up office of the live shape, and
 * 169 to 173 ms this way (wave 13y round 167). One statement for every project took 151 to 160 ms. It is not used
 * because SQLite refuses a statement that joins more than 500 reads: at three ways into each project, an office of 167
 * projects would pass that. The made-up office has 11.
 *
 * THE MESSAGE CENTRE HAS NO WAY INTO IT TO READ, so it adds nothing here. Its view is every message filed in it, and
 * `theRowsTheReaderMaySee` keeps each of those by its project when the centre is one of the projects asked.
 */
function theMessagesInTheViewsOf(projects: readonly Workspace[]): Set<string> {
  const found = new Set<string>()
  for (const workspace of projects) {
    const ways = theViewReadOneWayAtATime(workspace.id)
    if (ways.length === 0) continue
    const inTheView = db
      .select({ id: records.id })
      .from(records)
      .where(sql`${records}.rowid IN (${sql.join(ways, sql` UNION `)})`)
      .all()
    for (const row of inTheView) found.add(row.id)
  }
  return found
}

/**
 * The projects a door's query string asks for with `?projects=`, or null when it does not ask, so
 * the door answers from the request's project header as it always has. For the doors that read their
 * query without a schema. A `projects` word sent twice, or sent empty, is refused rather than read
 * as one of its values.
 */
export function theProjectsAQueryAsks(query: unknown, reader: AMessageReader): Workspace[] | null {
  const asked = typeof query === 'object' && query !== null ? (query as Record<string, unknown>)[PROJECTS_QUERY] : undefined
  if (asked === undefined) return null
  if (typeof asked !== 'string') throw new PanelError(NO_PROJECTS_VALUE, 400)
  return theProjectsAsked(asked, reader)
}
