// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY MESSAGE MOVES INTO THE OFFICE'S MESSAGE CENTRE, KEEPING ITS OLD PROJECT AS THE MARK OF WHERE IT WAS SAID.
 * This is point 3 of a decision. Problem cxRB633r_N37. One transaction.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES
 * ---------------------------------------------------------------------------------------
 *
 *   1. It writes the message centre's row in the project registry, when it is not there: the id `message-centre`
 *      (MESSAGE_CENTRE in src/shared/workspaces.ts), the title "Message centre", and a note saying what it holds.
 *   2. For every message not already in the message centre, deleted ones included, so that no message stays filed in a
 *      project, it:
 *        - writes `data.writtenIn` = { project: the project it was filed in, recordedBy: … }, and no page, which nobody
 *          recorded, unless the
 *          message already holds a `writtenIn`, which is then left as it is;
 *        - moves the row to the message centre;
 *        - writes one change row for each of the two fields and one revision holding what the message now holds, as
 *          the office, so the message's newest revision still names what it holds and the message stays writable.
 *      The older revisions and change rows are not touched: they say truly where the message was when they were
 *      written.
 *   3. Every link with a message at one end is filed where a link to a message now lives: a link between two messages
 *      in the message centre, and a link between a message and a record in the record's project.
 *
 * NOTHING IS DELETED. It changes no message's words, title, sender or recipients.
 *
 * ---------------------------------------------------------------------------------------
 * A SECOND RUN CHANGES NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * A message already in the message centre is left alone, the registry row is written only when it is missing, and a
 * link already filed where it belongs is left alone. So the counts of a second run are all nought.
 */
import type Database from 'better-sqlite3'
import { anOfficeId } from './ids.ts'
import { MESSAGE_CENTRE, MESSAGE_CENTRE_NOTE, MESSAGE_CENTRE_TITLE, WRITTEN_IN_BY_THE_MOVE } from '../../shared/workspaces.ts'
import { nowStamp } from '../../shared/time.ts'
import { contentOf, versionOf } from './version.ts'

/** Who writes the move, as the other data steps that write as the office do. */
const THE_OFFICE = { type: 'agent', id: 'mole-office/the-api-server' } as const
const REVISION_NOTE = 'The office moved this message into the message centre, keeping its old project as the mark of where it was written.'

export interface Report {
  /** True when this database has no `revisions` or `workspaces` table yet, so nothing was read or written. */
  tablesMissing: boolean
  /** Whether the message centre's registry row was written by this run. */
  registryRowWritten: boolean
  /** Messages moved into the message centre by this run. */
  moved: number
  /** Of those, how many were deleted messages. */
  movedDeleted: number
  /** How many messages each old project gave up, by project id. */
  movedFrom: Record<string, number>
  /** Messages that already held a `writtenIn`, which was kept. */
  markKept: number
  /** Links refiled to where a link to a message now lives. */
  linksRefiled: number
}

interface MessageRow {
  id: string
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
  workspace_id: string
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const tableExists = (sqlite: Database.Database, name: string): boolean =>
  sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined

/** Move every message into the message centre. */
export function moveMessagesIntoTheMessageCentre(sqlite: Database.Database): Report {
  const report: Report = { tablesMissing: false, registryRowWritten: false, moved: 0, movedDeleted: 0, movedFrom: {}, markKept: 0, linksRefiled: 0 }
  if (!tableExists(sqlite, 'revisions') || !tableExists(sqlite, 'workspaces') || !tableExists(sqlite, 'links')) {
    report.tablesMissing = true
    return report
  }
  const run = sqlite.transaction(() => {
    const at = nowStamp()
    const written = sqlite
      .prepare('INSERT OR IGNORE INTO workspaces (id, title, note, review_level, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)')
      .run(MESSAGE_CENTRE, MESSAGE_CENTRE_TITLE, MESSAGE_CENTRE_NOTE, at, at)
    report.registryRowWritten = written.changes === 1

    const messages = sqlite
      .prepare("SELECT id, kind, title, summary, data, deleted_at, workspace_id FROM records WHERE kind = 'message' AND workspace_id != ? ORDER BY created_at, rowid")
      .all(MESSAGE_CENTRE) as MessageRow[]
    const move = sqlite.prepare('UPDATE records SET workspace_id = ?, data = ? WHERE id = ?')
    const newestSeq = sqlite.prepare('SELECT max(seq) AS seq FROM revisions WHERE record_id = ?')
    const addChange = sqlite.prepare(
      'INSERT INTO changes (id, record_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at, workspace_id) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    const addRevision = sqlite.prepare(
      'INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, deleted_at, op, ' +
        'actor_type, actor_id, session_id, at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const row of messages) {
      const parsed = JSON.parse(row.data) as unknown
      const data: Record<string, unknown> = isObject(parsed) ? parsed : {}
      const hadAMark = Object.hasOwn(data, 'writtenIn')
      if (hadAMark) report.markKept += 1
      else data['writtenIn'] = { project: row.workspace_id, recordedBy: WRITTEN_IN_BY_THE_MOVE }
      move.run(MESSAGE_CENTRE, JSON.stringify(data), row.id)
      addChange.run(anOfficeId(), row.id, 'update', THE_OFFICE.type, THE_OFFICE.id, null, 'workspaceId', JSON.stringify(row.workspace_id), JSON.stringify(MESSAGE_CENTRE), at, MESSAGE_CENTRE)
      if (!hadAMark) {
        addChange.run(anOfficeId(), row.id, 'update', THE_OFFICE.type, THE_OFFICE.id, null, 'data.writtenIn', null, JSON.stringify(data['writtenIn']), at, MESSAGE_CENTRE)
      }
      const content = contentOf({ kind: row.kind, title: row.title, summary: row.summary, data, deletedAt: row.deleted_at })
      const seq = ((newestSeq.get(row.id) as { seq: number | null } | undefined)?.seq ?? 0) + 1
      addRevision.run(
        anOfficeId(),
        row.id,
        MESSAGE_CENTRE,
        seq,
        versionOf(content),
        row.kind,
        row.title,
        row.summary,
        JSON.stringify(content.data),
        row.deleted_at,
        'update',
        THE_OFFICE.type,
        THE_OFFICE.id,
        null,
        at,
        REVISION_NOTE,
      )
      report.moved += 1
      if (row.deleted_at !== null) report.movedDeleted += 1
      report.movedFrom[row.workspace_id] = (report.movedFrom[row.workspace_id] ?? 0) + 1
    }

    // THE LINKS WITH A MESSAGE AT ONE END. Where each belongs, worked out by the one rule the link door uses.
    const links = sqlite
      .prepare(
        'SELECT l.id AS id, l.workspace_id AS now, f.kind AS fromKind, f.workspace_id AS fromProject, t.kind AS toKind, t.workspace_id AS toProject ' +
          "FROM links l JOIN records f ON f.id = l.from_id JOIN records t ON t.id = l.to_id WHERE f.kind = 'message' OR t.kind = 'message'",
      )
      .all() as { id: string; now: string; fromKind: string; fromProject: string; toKind: string; toProject: string }[]
    const refile = sqlite.prepare('UPDATE links SET workspace_id = ? WHERE id = ?')
    for (const link of links) {
      const belongs = whereALinkWithAMessageIsFiled(
        { kind: link.fromKind, workspaceId: link.fromProject },
        { kind: link.toKind, workspaceId: link.toProject },
      )
      if (belongs === link.now) continue
      refile.run(belongs, link.id)
      report.linksRefiled += 1
    }
  })
  run()
  return report
}

/**
 * WHERE A LINK WITH A MESSAGE AT ONE END IS FILED: in the project of the end that is not a message, so that record's
 * own read still lists it, and in the message centre when both ends are messages. Null when neither end is a message.
 * The one statement of the rule, read by the link door (lib/records.ts) and by the move above.
 */
export function whereALinkWithAMessageIsFiled(
  from: { kind: string; workspaceId: string },
  to: { kind: string; workspaceId: string },
): string {
  if (from.kind !== 'message' && to.kind !== 'message') throw new Error('Neither end of this link is a message.')
  if (from.kind === 'message' && to.kind === 'message') return MESSAGE_CENTRE
  return from.kind === 'message' ? to.workspaceId : from.workspaceId
}

/** The report as a person reads it. */
export function describeTheMoveIntoTheMessageCentre(report: Report): string {
  if (report.tablesMissing) return 'message centre: this database has no revisions, workspaces or links table yet, so nothing was read or written'
  const registry = report.registryRowWritten ? 'its row written in the project registry' : 'its row was already in the project registry'
  if (report.moved === 0 && report.linksRefiled === 0) {
    return `message centre: ${registry}; no message was left in a project, and no link needed refiling`
  }
  const from = Object.entries(report.movedFrom)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([project, n]) => `${String(n)} from ${project}`)
    .join(', ')
  return (
    `message centre: ${registry}; ${String(report.moved)} message(s) moved in (${from}), ${String(report.movedDeleted)} of them deleted ` +
    `messages, each keeping its old project as the mark of where it was written (${String(report.markKept)} already held a mark, kept); ` +
    `${String(report.linksRefiled)} link(s) refiled; nothing deleted`
  )
}
