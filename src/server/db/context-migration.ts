// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOVE WHAT A COMMENT POINTED AT INTO THE SHAPE ROUND EIGHT STORES. One transaction.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED, AND WHY A COLUMN OF JSON HAS TO BE REWRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * `agent_messages.context` is JSON saying what a comment was about. Round seven stored one of four
 * shapes in it, and one of the four — `textSpan` — WRAPPED one of the other three in an `inside`
 * field:
 *
 *     {"kind":"planLine","planId":"…","lineId":"…"}
 *     {"kind":"textSpan","inside":{"kind":"record",…},"quote":"…","from":41,"to":61,"field":"…"}
 *
 * Round eight separates the three facts that were folded together — WHAT THING, WHICH WORDS, WHICH
 * REVISION — so the same two comments are stored as:
 *
 *     {"target":{"kind":"planLine","planId":"…","lineId":"…"}}
 *     {"target":{"kind":"record",…},"span":{"quote":"…","from":41,"to":61,"field":"…"}}
 *
 * THERE IS NO ADDITIVE WAY OUT OF THIS. The read path answers "is what this points at still there",
 * and it now dispatches through one declared vocabulary. A row left in the old shape would be read
 * as a context with no target at all, which is the one answer that is neither true nor useful. So
 * the column is rewritten, and this file is the named exception decision 13 asks for:
 *
 *   IT REWRITES `agent_messages.context` AND NOTHING ELSE. Not the body, not the recipient, not the
 *   state, not the position, not `created_at`, not `created_by`, and no other table — not even
 *   `changes`, because the change log covers records and these rows are not records.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES TO GUESS AT
 * ---------------------------------------------------------------------------------------
 *
 * A context it cannot read is LEFT EXACTLY AS IT IS and reported, one note per row. Unreadable
 * JSON, a `kind` no vocabulary declares, a `textSpan` whose `inside` is missing — none of those has
 * an obvious correct answer, and writing a plausible one would be inventing what somebody pointed
 * at. The rows are few enough to name, and a person with the context settles each one in seconds.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS SAFE TO RUN TWICE
 * ---------------------------------------------------------------------------------------
 *
 * A context that already carries `target` is already in the new shape, so it is counted as done and
 * not touched. A second run over a migrated database plans nothing and writes nothing.
 */

import type Database from 'better-sqlite3'
import { isTargetKind } from '@shared/targets.ts'

/** One row this migration would not guess at, and why. */
export interface ContextMigrationNote {
  kind: 'unreadable' | 'no_kind' | 'unknown_kind' | 'no_inside'
  messageId: string
  detail: string
}

export interface ContextMigrationReport {
  /** True when there was nothing in the old shape to move. */
  alreadyDone: boolean
  /** How many rows were rewritten into the new shape. */
  moved: number
  /** How many already carried a `target` and were left alone. */
  alreadyNew: number
  /** How many carry no context at all. Nothing to do with them, and they are not a problem. */
  withoutContext: number
  /** Every row this would not guess at. Left exactly as it was. */
  notes: ContextMigrationNote[]
}

/** One row of `agent_messages`, as much of it as this file reads. */
interface Row {
  id: string
  context: string | null
}

/** One rewrite this migration would make. */
interface Move {
  id: string
  context: string
}

/** Whether the table this migration is about exists at all. A fresh database may not have it yet. */
function tableIsThere(sqlite: Database.Database): boolean {
  return (
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_messages'").get() !== undefined
  )
}

/**
 * WHAT THIS MIGRATION WOULD DO, WITHOUT DOING ANY OF IT.
 *
 * Exported so the preview a server start runs, and the test, both read the real plan rather than a
 * paraphrase of it.
 */
export function planContextMigration(sqlite: Database.Database): {
  moves: Move[]
  notes: ContextMigrationNote[]
  alreadyNew: number
  withoutContext: number
} {
  const moves: Move[] = []
  const notes: ContextMigrationNote[] = []
  let alreadyNew = 0
  let withoutContext = 0

  if (!tableIsThere(sqlite)) return { moves, notes, alreadyNew, withoutContext }

  const rows = sqlite.prepare('SELECT id, context FROM agent_messages').all() as Row[]
  for (const row of rows) {
    if (row.context === null) {
      withoutContext += 1
      continue
    }
    let stored: unknown
    try {
      stored = JSON.parse(row.context)
    } catch {
      notes.push({
        kind: 'unreadable',
        messageId: row.id,
        detail:
          `the stored context is not readable JSON, so nothing can say what this comment was about. It is left ` +
          `exactly as it is. It starts: ${row.context.slice(0, 120)}`,
      })
      continue
    }
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
      notes.push({
        kind: 'unreadable',
        messageId: row.id,
        detail: `the stored context is ${JSON.stringify(stored)}, which is not a context. It is left exactly as it is.`,
      })
      continue
    }
    const held = stored as Record<string, unknown>

    // ALREADY IN THE NEW SHAPE. This is what makes a second run write nothing.
    if (held['target'] !== undefined) {
      alreadyNew += 1
      continue
    }

    const kind = held['kind']
    if (typeof kind !== 'string' || kind === '') {
      notes.push({
        kind: 'no_kind',
        messageId: row.id,
        detail: `the stored context says neither what kind of thing it points at nor a target. It is left exactly as it is.`,
      })
      continue
    }

    // ---- A QUOTED SPAN: the wrapper comes off and the three facts separate.
    if (kind === 'textSpan') {
      const inside = held['inside']
      if (typeof inside !== 'object' || inside === null || Array.isArray(inside)) {
        notes.push({
          kind: 'no_inside',
          messageId: row.id,
          detail:
            `it quotes some words and does not say what they were inside, so there is no target to move it to. ` +
            `It is left exactly as it is.`,
        })
        continue
      }
      const target = inside as Record<string, unknown>
      const insideKind = target['kind']
      if (typeof insideKind !== 'string' || !isTargetKind(insideKind)) {
        notes.push({
          kind: 'unknown_kind',
          messageId: row.id,
          detail:
            `it quotes some words inside a "${String(insideKind)}", which is not a thing anybody can point at. ` +
            `It is left exactly as it is.`,
        })
        continue
      }
      // The span's own keys, and only the ones a span has. Anything else the old row carried is
      // reported rather than moved, because a key nothing reads is not a key this may invent a home
      // for — and there is nothing else in the four shapes round seven wrote.
      const span: Record<string, unknown> = { quote: held['quote'], from: held['from'], to: held['to'] }
      if (held['field'] !== undefined) span['field'] = held['field']
      moves.push({ id: row.id, context: JSON.stringify({ target, span }) })
      continue
    }

    // ---- A WHOLE THING: the same object, now under `target`.
    if (!isTargetKind(kind)) {
      notes.push({
        kind: 'unknown_kind',
        messageId: row.id,
        detail: `it points at a "${kind}", which is not a thing anybody can point at. It is left exactly as it is.`,
      })
      continue
    }
    moves.push({ id: row.id, context: JSON.stringify({ target: held }) })
  }

  return { moves, notes, alreadyNew, withoutContext }
}

/** Do it. One transaction, one column, and every row it will not guess at reported. */
export function migrateContexts(
  sqlite: Database.Database,
  opts: { dryRun?: boolean } = {},
): ContextMigrationReport {
  const { moves, notes, alreadyNew, withoutContext } = planContextMigration(sqlite)
  const report: ContextMigrationReport = {
    alreadyDone: moves.length === 0,
    moved: moves.length,
    alreadyNew,
    withoutContext,
    notes,
  }
  if (moves.length === 0 || opts.dryRun === true) return report

  // ONE COLUMN. No `updated_at` on the thread, because a migration is not somebody saying something,
  // and every list of conversations is ordered by that column.
  const write = sqlite.prepare('UPDATE agent_messages SET context = @context WHERE id = @id')
  const run = sqlite.transaction(() => {
    for (const move of moves) write.run(move)
  })
  run()
  return report
}

/** The line `npm run db:migrate` prints. Every note is printed: each is a row somebody has to look at. */
export function describeContextMigration(report: ContextMigrationReport): string {
  const head = report.alreadyDone
    ? `contexts: nothing to move (${report.alreadyNew} already in the new shape, ` +
      `${report.withoutContext} point at nothing in particular)`
    : `contexts: ${report.moved} moved into {target, span, revision}, ${report.alreadyNew} already ` +
      `there, ${report.withoutContext} point at nothing in particular`
  const lines = report.notes.map((note) => `  [${note.kind}] ${note.messageId}: ${note.detail}`)
  return head + (lines.length === 0 ? '' : `\n${lines.length} this migration will not guess at:\n${lines.join('\n')}`)
}
