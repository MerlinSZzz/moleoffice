// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE RULE OF WHICH MESSAGES A PROJECT'S VIEW HOLDS, on problem cxRB633r_N37.
 *
 * A file of its own so that every reader can ask it, lib/dispatch.ts among them, which lib/messages.ts itself imports.
 * It reads only the records table's columns.
 */
import { and, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'

import { MESSAGE_CENTRE } from '@shared/workspaces.ts'

import { ONE_KIND_WRITTEN_OUT, records, STORED_FIELDS, theProjectOfARowFoundById } from '../db/schema.ts'
import type { WhichProjects } from '@shared/which-projects.ts'

/**
 * WHICH MESSAGES A PROJECT'S VIEW HOLDS: THE ONE RULE. Every message is kept in the message centre and belongs to no
 * project, and a project's pages show a filtered view of it. A message is in the view of a project when it was written
 * there (`writtenIn.project`), when its writer said it is about it (`aboutProject`), or when it is a comment on one of
 * that project's records (its target names the project). Every project, or the message centre
 * itself, is every message.
 *
 * WRITTEN ONCE, IN SQL, so every reader of "this project's messages" asks the same question of the stored mark.
 */
export function messagesInTheViewOf(which: WhichProjects, foundById = false): SQL {
  // Wave 13y round 38: only reads already finding rows by id set this. Keeping both the kind and the centre off their
  // indexes lets SQLite look up the unseen ids instead of walking every message. Other reads keep their indexes.
  const inTheCentre = foundById ? theProjectOfARowFoundById(MESSAGE_CENTRE) : eq(records.workspaceId, MESSAGE_CENTRE)
  if (!('oneProject' in which) || which.oneProject === MESSAGE_CENTRE) return inTheCentre
  return and(inTheCentre, or(...theWaysIntoTheViewOf(which.oneProject).map((way) => way.rule))) as SQL
}

/**
 * THE SAME RULE FOR ANY OF SEVERAL PROJECTS, AS ONE CONDITION (wave 13y round 78), for a read that asks every project of
 * a list in one statement instead of one statement for each. The list goes to SQLite as one JSON list, and each project
 * of it is asked the rule above: the message centre is every message, and any other project is any one of the three
 * ways into its view.
 */
export function messagesInTheViewOfAnyOf(projects: readonly string[]): SQL {
  return and(eq(records.workspaceId, MESSAGE_CENTRE), inTheViewOfAnyOf(projects)) as SQL
}

/** The rule for one project of a list (`messagesInTheViewOfAnyOf`), its id read from the list in SQL. */
function inTheViewOfTheProjectIn(project: SQL): SQL {
  return or(sql`${project} = ${MESSAGE_CENTRE}`, ...theWaysIntoTheViewOf(project).map((way) => way.rule)) as SQL
}

/** Whether a message filed in the message centre is in the view of any of these projects. */
function inTheViewOfAnyOf(projects: readonly string[]): SQL {
  return sql`EXISTS (SELECT 1 FROM json_each(${JSON.stringify(projects)}) AS the_projects WHERE ${inTheViewOfTheProjectIn(sql`the_projects.value`)})`
}

/**
 * WHICH OF THESE PROJECTS' VIEWS HOLD A MESSAGE, as a column of a read of messages filed in the message centre: a JSON
 * list of the places in `projects` of those whose view holds it, by the same rule as `messagesInTheViewOfAnyOf`, in no
 * order. A place and not the id, so a project named twice is named twice, as one statement for each project would read it.
 */
export function theViewsHoldingIt(projects: readonly string[]): SQL<string> {
  return sql<string>`(SELECT json_group_array(the_projects.key) FROM json_each(${JSON.stringify(projects)}) AS the_projects WHERE ${inTheViewOfTheProjectIn(sql`the_projects.value`)})`
}

/**
 * THE THREE WAYS A MESSAGE COMES INTO A PROJECT'S VIEW, each with the index that holds the field it names. The rule
 * above is any one of them, for a message filed in the message centre. `theViewReadOneWayAtATime` reads each through its
 * index, so a way added here is read there too.
 *
 * `holds` is the index's own field, in its words (`STORED_FIELDS`), and `rule` the way itself. Every message `rule`
 * keeps, `holds` keeps as well. The project is an id, or since round 78 an id read in SQL (`inTheViewOfTheProjectIn`).
 *
 * `holdsIsTheRule` says the reverse holds too, so a message `holds` keeps needs no test by `rule`. The first two
 * indexes hold a field only from data that is JSON, and from such data `holds` and `rule` read the same value.
 */
function theWaysIntoTheViewOf(project: string | SQL): { rule: SQL; index: string; holds: SQL; holdsIsTheRule: boolean }[] {
  return [
    {
      rule: sql`json_extract(${records.data}, '$.writtenIn.project') = ${project}`,
      index: 'records_message_written_in_project_idx',
      holds: eq(STORED_FIELDS.messageWrittenInProject(records.data), project),
      holdsIsTheRule: true,
    },
    {
      rule: sql`json_extract(${records.data}, '$.aboutProject') = ${project}`,
      index: 'records_message_about_project_idx',
      holds: eq(STORED_FIELDS.messageAboutProject(records.data), project),
      holdsIsTheRule: true,
    },
    // EVERY WAY `aCommentOnARecordOf` KEEPS A MESSAGE ASKS ABOUT ITS TARGET, so the message has one, and this index holds
    // every message that has a target.
    {
      rule: aCommentOnARecordOf(project),
      index: 'records_message_target_idx',
      holds: isNotNull(STORED_FIELDS.messageTargetType(records.data)),
      holdsIsTheRule: false,
    },
  ]
}

/**
 * ONE PROJECT'S VIEW, AS ONE READ FOR EACH WAY INTO IT: each read gives the rowids of the messages that came in that way,
 * through the index of that way (wave 13y round 65). For a read that joins them with UNION and finds its rows by rowid.
 * Asked through `messagesInTheViewOf`, SQLite tested every message of the office against the rule, through the index of
 * every record of a kind: 85 ms for the count of a project's messages on a made-up office at the scale of 22 October
 * 2026, and 20 ms this way, each the median of 8 warm reads. Migration 0292 says more.
 *
 * THE SAME MESSAGES AS THE RULE, deleted ones included. Each read keeps a message filed in the message centre that its
 * way's rule keeps, and every such message is in that way's index. The indexes are named, so a missing index is an
 * error and not a slow read, and the kind is written out, because SQLite uses those indexes only for a query that
 * names the kind in their words.
 *
 * A WAY WHOSE INDEX HOLDS ITS RULE IS NOT TESTED BY THE RULE AGAIN (`holdsIsTheRule`, wave 13y round 133). Tested again,
 * SQLite read each message's data once more: on a made-up office at the size of 4 November 2026, the read of the 70,717
 * messages written in the project took 108 ms, and 11 ms without the test. Finding the rows of the project's records
 * and its view took 206 ms, then 133 ms, with the same rows in the same order. Each is the median of 5 warm reads.
 *
 * NONE FOR THE MESSAGE CENTRE ITSELF: its view is every message filed in it, which a read finds by the project column.
 *
 * WITH `live`, EACH READ KEEPS ONLY THE MESSAGES NOT DELETED (wave 13y round 167), for a read that counts or orders one
 * way's rows by itself before any join. Without it, each read is the statement it was before the option was added.
 */
export function theViewReadOneWayAtATime(project: string, options: { live?: true } = {}): SQL[] {
  if (project === MESSAGE_CENTRE) return []
  return theWaysIntoTheViewOf(project).map(
    (way) =>
      sql`SELECT ${records}.rowid FROM ${records} INDEXED BY ${sql.raw(way.index)} WHERE ${and(ONE_KIND_WRITTEN_OUT.message, eq(records.workspaceId, MESSAGE_CENTRE), way.holds, way.holdsIsTheRule ? undefined : way.rule, options.live ? isNull(records.deletedAt) : undefined)}`,
  )
}

/**
 * THESE PROJECTS' LIVE MESSAGES WITHIN `bound`, FOUND FROM A MOMENT THROUGH THE INDEX OF EVERY MESSAGE'S MOMENT (migration
 * 0293, wave 13y round 66), as a condition on the rowid for a read of the records. `bound` names `created_at`, so SQLite
 * starts at the place and reads no message before it. With `newest`, it keeps that many of them, newest first, by the
 * moment and then by storage order, as the index gives them.
 *
 * EVERY PROJECT OF THE LIST IN ONE STATEMENT since wave 13y round 78 (`messagesInTheViewOfAnyOf`). It read one project
 * until then, and the talk asked it once for each project, so each read of the talk grew with the projects.
 *
 * The index is named, so a missing index is an error and not a slow read. Its WHERE terms are the kind and the message
 * centre, written out here in its words, because SQLite uses a partial index only for a query that names them so. The
 * centre is written from MESSAGE_CENTRE: if that ever differs from the index's words, the read fails and does not come
 * back empty.
 */
export function theViewFromAMoment(projects: readonly string[], bound: SQL | undefined, newest?: number): SQL {
  const inTheCentre = sql.raw(`"records"."workspace_id" = '${MESSAGE_CENTRE}'`)
  const where = and(ONE_KIND_WRITTEN_OUT.message, inTheCentre, inTheViewOfAnyOf(projects), isNull(records.deletedAt), bound)
  const newestFirst = newest === undefined ? sql`` : sql` ORDER BY ${records.createdAt} DESC, ${records}.rowid DESC LIMIT ${newest}`
  return sql`${records}.rowid IN (SELECT ${records}.rowid FROM ${records} INDEXED BY records_message_moment_idx WHERE ${where}${newestFirst})`
}

/**
 * WHETHER A MESSAGE IS A COMMENT ON A RECORD OF THIS PROJECT: its target names the project, or names a record filed in it,
 * or it is a comment on a message written in this project.
 * The record is asked, because a target the page wrote may name the record and not its project, and where a record is
 * filed is a fact about the record. A target naming neither is taken as on the project it was written in.
 *
 * The record is looked up by its id, row by row, instead of building the list of every record id in the workspace. The
 * CASE keeps NULL where the target names no record, which is the answer the IN list gave.
 */
export function aCommentOnARecordOf(project: string | SQL): SQL {
  const theRecordId = sql`json_extract(${records.data}, '$.target.target.recordId')`
  const aRecordFiledIn = (workspace: string | SQL): SQL =>
    sql`(CASE WHEN ${theRecordId} IS NULL THEN NULL ELSE EXISTS (SELECT 1 FROM records AS the_targets_record WHERE the_targets_record.id = ${theRecordId} AND the_targets_record.workspace_id = ${workspace}) END)`
  return or(
    // A COMMENT ON A MESSAGE points into the message centre, which is no project (problem rJzSELmOPUas): it belongs to
    // the project it was written in, which is where the person was when they pointed at the message.
    and(
      or(
        sql`json_extract(${records.data}, '$.target.target.workspaceId') = ${MESSAGE_CENTRE}`,
        aRecordFiledIn(MESSAGE_CENTRE),
      ),
      sql`json_extract(${records.data}, '$.writtenIn.project') = ${project}`,
    ),
    sql`json_extract(${records.data}, '$.target.target.workspaceId') = ${project}`,
    aRecordFiledIn(project),
    and(
      sql`json_extract(${records.data}, '$.target') IS NOT NULL`,
      sql`json_extract(${records.data}, '$.target.target.workspaceId') IS NULL`,
      sql`${theRecordId} IS NULL`,
      sql`json_extract(${records.data}, '$.writtenIn.project') = ${project}`,
    ),
  ) as SQL
}
