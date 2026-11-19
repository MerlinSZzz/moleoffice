// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY ROUGH DRAFT BECOMES A PLAN. The data half of migration 0196 (`every_rough_draft_becomes_a_plan`).
 *
 * Problem k5FNfdgfxbt2: rough thinking was kept in two stores, `planning_drafts` and `plans`. The
 * migration report p414QK6jYovv proposed is carried out at item 6 of a
 * decision. Its plan, which this file follows:
 *
 *   "Move each stored draft row to one open plan, preserving its title, creation and update times, and creator.
 *   Split nonempty bodies with `linesOfBody`, preserving blank lines and trailing whitespace exactly; an empty body
 *   becomes zero plan-line rows. Give lines ordered positions, null `record_id` and `remark`, and the source update
 *   time. Draft rows have no last-editor field, so first define an honest migration-source marker or extend
 *   provenance; do not attribute imported lines to a person without evidence. Keep the draft id as the plan id when
 *   free; on collision, record an explicit mapping for historical references. Keep existing `Delta.fromDraft` data
 *   as history. If a title or line does not meet plan limits, report and abort that row's migration rather than
 *   trimming or truncating it."
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES, FOR EACH DRAFT IT MOVES, IN ONE TRANSACTION WITH EVERY OTHER DATA STEP
 * ---------------------------------------------------------------------------------------
 *
 *   - ONE `plans` ROW: the draft's title as stored, state `open`, `read_at` NULL, the draft's own `created_at` and
 *     `updated_at`, and `moved_from_draft` = the draft's id. Its id is the draft's id when no plan holds that id;
 *     when one does, it is a new id and `moved_from_draft` is how anybody holding the old id finds it.
 *   - ONE `plan_lines` ROW PER LINE of `linesOfBody(body)`, at positions 1, 2, 3 …, `record_id` and `remark` NULL,
 *     `updated_at` = the draft's `updated_at`, `updated_by` = `THE_MOVE`. An empty body writes no line: "nothing is
 *     written yet" and "one blank line is written" are different facts, which is the rule `createPlan` keeps.
 *   - IT DELETES THE DRAFT ROW, so at no moment after the transaction is one draft stored twice. Then, if the table
 *     is empty, it DROPS `planning_drafts`.
 *
 * It writes no `plan_line_revisions` row. A row there carries the writer's own reason, and nobody gave one; that
 * table says the ledger starts when it starts, and a line that was a draft's has no row there, like every line that
 * existed before 0170.
 *
 * ---------------------------------------------------------------------------------------
 * PROVENANCE: WHO IS CREDITED, AND WITH WHAT EVIDENCE
 * ---------------------------------------------------------------------------------------
 *
 * THE PLAN'S `created_by` IS THE DRAFT'S `created_by`, because the draft row recorded who created it, in the same
 * `${type}:${id}` stamp every planning table uses. That is evidence, and it is copied as it stands. A draft whose
 * `created_by` is blank recorded nobody, and its plan carries `THE_MOVE` instead; it is never filled in with the
 * office's owner.
 *
 * EVERY LINE'S `updated_by` IS `THE_MOVE`, and that is the marker the plan asks for. A draft row has no last-editor
 * field: `updateDraft` changed the body and wrote nobody's name, so who last changed these words was never stored.
 * Crediting the draft's creator would be a guess about every later edit, and crediting the person would be the
 * guess USER.md's fifth invariant forbids. The stamp's type is `system`, the same type the module-claims migration
 * stamps its rows with, so `ownerOfWindow` in src/shared/windowowner.ts reads it as neither the person nor an
 * agent, and "written since you read this" names it as what it is.
 *
 * `plans.moved_from_draft` is the plan-level half of the same fact: this plan's words came from a draft.
 *
 * ---------------------------------------------------------------------------------------
 * A DRAFT IT REFUSES STAYS WHERE IT IS, AND SO DOES THE TABLE
 * ---------------------------------------------------------------------------------------
 *
 * A draft is moved only when what it holds is a plan the plan doors would store unchanged. Nothing is trimmed,
 * truncated, split or joined to make it fit. It is refused, with every reason, when:
 *
 *   - its title is blank. A plan needs a name.
 *   - its title begins or ends with white space. The plan door trims a title before it stores it; this step may not.
 *   - its body holds a carriage return. A plan line holds no line ending, and the plan doors take a carriage return
 *     off and say so (`linesOfDocument` in src/server/lib/plans.ts). The plan for this move says split with
 *     `linesOfBody` and keep every character, and those two rules disagree about this one character. When the step
 *     cannot tell which side is right it does neither and says so.
 *   - a line is over its word budget, by `whyALineIsOverItsBudget` in src/shared/planline.ts: the one rule every
 *     plan door applies, so a moved plan is one the person can save again.
 *   - a plan already says it was this draft (`moved_from_draft`). The draft would be stored twice.
 *
 * A refused draft is left exactly as it was, and `planning_drafts` is NOT dropped while it holds a row. The report
 * names each one, its title, and every reason, and quotes each line that is over its budget, so the person can see
 * which words to change. Every later `npm run db:migrate` tries it again and says it again, so the state cannot be
 * forgotten by a log that has scrolled away.
 *
 * WHAT A PERSON DOES NEXT is printed with the refusal. Nothing in the product reads or writes a draft any more, so
 * the words are read with this file run on its own — `npx tsx src/server/db/drafts-into-plans-migration.ts` prints
 * every draft still in the table, whole and verbatim, with why it was refused — and written into a plan by the
 * person, in their own words. Then `--discard <draft id>` deletes that one row and prints what it deleted, and the
 * next migrate drops the empty table. Mole Office does not write the plan for them: making the words fit is
 * changing them, and that is the person's act.
 *
 * ---------------------------------------------------------------------------------------
 * A SECOND RUN CHANGES NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * After a run that moved everything there is no table, and the step reports that and reads nothing. After a run
 * that refused a draft, the same draft is refused again for the same reasons and nothing is written.
 */
import type Database from 'better-sqlite3'
import { anOfficeId } from './ids.ts'
import { isTheProgramRun } from '../../config/settings.mjs'
import { linesOfBody } from '../../shared/plandoc.ts'
import { whyALineIsOverItsBudget } from '../../shared/planline.ts'

/** The table this step empties and then drops. Declared nowhere else, because db/schema.ts no longer has it. */
export const DRAFTS_TABLE = 'planning_drafts'

/**
 * THE MIGRATION-SOURCE MARKER, in the `${type}:${id}` shape every planning stamp uses.
 *
 * On every moved line's `updated_by`, and on a moved plan's `created_by` when the draft recorded no creator. It
 * says the move wrote this row, and it names no person. See "PROVENANCE" above.
 */
export const THE_MOVE = 'system:planning-draft-move'

/**
 * THE MIGRATION FILE THAT CREATED THE TABLE, for a test or a check that has to build a database holding drafts. A
 * fresh database has none: this step drops the empty table on its first run. Such a caller runs this file's SQL as
 * it stands rather than a copy of its statement, because a table made anywhere but drizzle/ is what
 * tests/schema-inventory.test.ts refuses, and a copy could drift from the file.
 */
export const THE_FILE_THAT_MADE_THE_DRAFTS_TABLE = 'drizzle/0008_planning_drafts.sql'

/** One draft moved into a plan. */
export interface MovedDraft {
  draftId: string
  planId: string
  /** False when a plan already held the draft's id and this plan was given a new one. */
  idKept: boolean
  lines: number
  /** True when the draft recorded no creator and the plan carries `THE_MOVE` in `created_by`. */
  creatorUnrecorded: boolean
}

/** One draft this step would not move, left where it was. */
export interface RefusedDraft {
  draftId: string
  title: string
  /** Every reason, each one sentence. Never empty. */
  why: string[]
}

export interface Report {
  /** True when this database has no `planning_drafts` table: an earlier run dropped it, or it never had one. */
  tableMissing: boolean
  /** True when `plans.moved_from_draft` is not there yet: migration 0196 has not run, so nothing was moved. */
  columnMissing: boolean
  /** Drafts the table held when the step began. */
  found: number
  moved: MovedDraft[]
  refused: RefusedDraft[]
  /** True when this run dropped the table, because nothing was left in it. */
  tableDropped: boolean
  /**
   * HOW MANY ROWS THIS RUN WROTE: one per plan, one per line, and one for the dropped table. Zero on a quiet run.
   *
   * Counted as the step writes, rather than added up from `moved` afterwards by each reader, so the step table in
   * db/migrate.ts and this report's own sentence read the same number.
   */
  written: number
}

/** A draft row as stored. */
export interface DraftRow {
  id: string
  title: string
  body: string
  created_at: string
  updated_at: string
  created_by: string
}

const tableExists = (sqlite: Database.Database, name: string): boolean =>
  sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined

/**
 * Every reason this draft cannot become a plan unchanged, or an empty list when it can.
 *
 * A PURE FUNCTION OF THE ROW, apart from the last check, which the caller makes because it needs the database.
 */
export function whyADraftCannotMove(draft: Pick<DraftRow, 'title' | 'body'>): string[] {
  const why: string[] = []
  if (draft.title.trim() === '') {
    why.push('Its title is blank, and a plan needs a name.')
  } else if (draft.title !== draft.title.trim()) {
    why.push(
      `Its title ${JSON.stringify(draft.title)} begins or ends with white space. A plan's title is stored without it, ` +
        'and this move does not trim.',
    )
  }
  const carriageReturns = (draft.body.match(/\r/g) ?? []).length
  if (carriageReturns > 0) {
    why.push(
      `Its body holds ${String(carriageReturns)} carriage return${carriageReturns === 1 ? '' : 's'}. A plan line holds ` +
        'no line ending, and this move keeps every character, so it will not decide which of the two to break.',
    )
  }
  if (draft.body !== '') {
    linesOfBody(draft.body).forEach((text, index) => {
      const problem = whyALineIsOverItsBudget(text)
      if (problem !== null) why.push(`Line ${String(index + 1)}, ${JSON.stringify(text)}, is over its budget. ${problem}`)
    })
  }
  return why
}

/** Move every draft that meets a plan's limits into a plan, and drop the table once it is empty. */
export function moveDraftsIntoPlans(sqlite: Database.Database): Report {
  const report: Report = {
    tableMissing: false,
    columnMissing: false,
    found: 0,
    moved: [],
    refused: [],
    tableDropped: false,
    written: 0,
  }
  if (!tableExists(sqlite, DRAFTS_TABLE)) {
    report.tableMissing = true
    return report
  }
  const columns = sqlite.prepare("SELECT name FROM pragma_table_info('plans')").all() as { name: string }[]
  if (!columns.some((column) => column.name === 'moved_from_draft')) {
    // A DATABASE MIGRATED ONLY AS FAR AS A FILE BEFORE 0196, which the migration tests build. The drafts are still
    // served there by the code of that time, so they are left alone and nothing is said to have been refused.
    report.columnMissing = true
    report.found = (sqlite.prepare(`SELECT count(*) AS n FROM ${DRAFTS_TABLE}`).get() as { n: number }).n
    return report
  }

  const run = sqlite.transaction(() => {
    const drafts = sqlite
      .prepare(`SELECT id, title, body, created_at, updated_at, created_by FROM ${DRAFTS_TABLE} ORDER BY created_at, rowid`)
      .all() as DraftRow[]
    report.found = drafts.length
    const planHolds = sqlite.prepare('SELECT 1 FROM plans WHERE id = ?')
    const alreadyMoved = sqlite.prepare('SELECT id FROM plans WHERE moved_from_draft = ?')
    const addPlan = sqlite.prepare(
      "INSERT INTO plans (id, title, state, read_at, created_at, updated_at, created_by, moved_from_draft) VALUES (?, ?, 'open', NULL, ?, ?, ?, ?)",
    )
    const addLine = sqlite.prepare(
      'INSERT INTO plan_lines (id, plan_id, position, text, record_id, remark, updated_at, updated_by) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)',
    )
    const lineHolds = sqlite.prepare('SELECT 1 FROM plan_lines WHERE id = ?')
    const removeDraft = sqlite.prepare(`DELETE FROM ${DRAFTS_TABLE} WHERE id = ?`)

    for (const draft of drafts) {
      const why = whyADraftCannotMove(draft)
      const earlier = alreadyMoved.get(draft.id) as { id: string } | undefined
      if (earlier !== undefined) {
        why.push(`The plan ${earlier.id} already says it was this draft, so moving it again would store it twice.`)
      }
      if (why.length > 0) {
        report.refused.push({ draftId: draft.id, title: draft.title, why })
        continue
      }

      const idKept = planHolds.get(draft.id) === undefined
      let planId = draft.id
      while (planHolds.get(planId) !== undefined) planId = anOfficeId()
      const creatorUnrecorded = draft.created_by.trim() === ''
      addPlan.run(planId, draft.title, draft.created_at, draft.updated_at, creatorUnrecorded ? THE_MOVE : draft.created_by, draft.id)

      const texts = draft.body === '' ? [] : linesOfBody(draft.body)
      texts.forEach((text, index) => {
        let lineId = anOfficeId()
        while (lineHolds.get(lineId) !== undefined) lineId = anOfficeId()
        addLine.run(lineId, planId, index + 1, text, draft.updated_at, THE_MOVE)
      })
      removeDraft.run(draft.id)
      report.written += 1 + texts.length
      report.moved.push({ draftId: draft.id, planId, idKept, lines: texts.length, creatorUnrecorded })
    }

    const left = (sqlite.prepare(`SELECT count(*) AS n FROM ${DRAFTS_TABLE}`).get() as { n: number }).n
    if (left === 0) {
      sqlite.prepare(`DROP TABLE ${DRAFTS_TABLE}`).run()
      report.tableDropped = true
      report.written += 1
    }
  })
  run()
  return report
}

/** How many rows this step wrote or removed, for the step table in db/migrate.ts. Zero on a quiet run. */
export function rowsTheDraftMoveWrote(report: Report): number {
  return report.written
}

/** What to do about a refused draft, in the words the report prints. One sentence each, in order. */
export const WHAT_TO_DO_ABOUT_A_REFUSED_DRAFT =
  'Nothing in the product reads a draft any more. To see each one whole, run `npx tsx ' +
  'src/server/db/drafts-into-plans-migration.ts` with MOLE_OFFICE_DB pointing at this database. Write its words into ' +
  'a plan yourself, changing what the reasons above name. Then run the same command with `--discard <draft id>`, ' +
  'which deletes that one draft and prints what it deleted. The next `npm run db:migrate` drops the empty table.'

/** The report as a person reads it, in the merge's db-migrate.log. Every draft is named; nothing is summarised away. */
export function describeTheDraftMove(report: Report): string {
  if (report.tableMissing && report.written === 0) {
    return 'rough drafts: there is no planning_drafts table, so there was nothing to move (an earlier run moved every draft into a plan, or this database never had one)'
  }
  if (report.columnMissing) {
    return (
      `rough drafts: ${String(report.found)} draft(s) left where they are, because plans.moved_from_draft is not there ` +
      'yet: migration 0196 has not run against this database, so there is nowhere to record which plan a draft became'
    )
  }
  const parts: string[] = []
  if (report.found === 0) {
    parts.push('rough drafts: the planning_drafts table held no draft')
  } else {
    parts.push(`rough drafts: ${String(report.found)} draft${report.found === 1 ? '' : 's'} found`)
  }
  if (report.moved.length > 0) {
    const kept = report.moved.filter((one) => one.idKept)
    const mapped = report.moved.filter((one) => !one.idKept)
    const lineWord = (n: number): string => `${String(n)} line${n === 1 ? '' : 's'}`
    parts.push(
      `${String(report.moved.length)} moved into a plan each: ` +
        report.moved
          .map(
            (one) =>
              `draft ${one.draftId} -> plan ${one.planId} (${one.idKept ? 'id kept' : 'NEW ID, a plan already held the draft id'}, ` +
              `${lineWord(one.lines)}${one.creatorUnrecorded ? ', the draft recorded no creator so the plan names the move' : ', created by the draft\'s creator'})`,
          )
          .join('; '),
    )
    parts.push(
      mapped.length === 0
        ? `no draft id was taken, so all ${String(kept.length)} kept it`
        : `${String(mapped.length)} draft id${mapped.length === 1 ? ' was' : 's were'} taken by another plan and mapped: ` +
            `${mapped.map((one) => `${one.draftId} -> ${one.planId}`).join(', ')}; plans.moved_from_draft holds the mapping, and ` +
            'a proposal naming the draft is read as about the plan it became',
    )
    parts.push(`every moved line is stamped ${THE_MOVE}, because a draft recorded nobody as its last editor`)
  }
  if (report.refused.length > 0) {
    parts.push(
      `${String(report.refused.length)} REFUSED and left in planning_drafts exactly as ${report.refused.length === 1 ? 'it was' : 'they were'}: ` +
        report.refused.map((one) => `draft ${one.draftId} ${JSON.stringify(one.title)}: ${one.why.join(' ')}`).join(' | '),
    )
    parts.push(
      `the planning_drafts table is KEPT, because it still holds ${String(report.refused.length)} draft${report.refused.length === 1 ? '' : 's'}. ` +
        WHAT_TO_DO_ABOUT_A_REFUSED_DRAFT,
    )
  } else if (report.tableDropped) {
    parts.push('the planning_drafts table was empty and is dropped')
  }
  if (report.written > 0) {
    parts.push(`${String(report.written)} row(s) written in all, counting each plan, each line and a dropped table as one`)
  }
  return parts.join('; ')
}

// ---------------------------------------------------------------------------- the command for a refused draft

/**
 * Every draft still in the table, whole and verbatim, with why it was refused. Reads only.
 */
export function showTheDraftsLeft(sqlite: Database.Database): string {
  if (!tableExists(sqlite, DRAFTS_TABLE)) {
    return 'There is no planning_drafts table in this database, so no draft is waiting. Every draft is a plan now.'
  }
  const drafts = sqlite
    .prepare(`SELECT id, title, body, created_at, updated_at, created_by FROM ${DRAFTS_TABLE} ORDER BY created_at, rowid`)
    .all() as DraftRow[]
  if (drafts.length === 0) {
    return 'The planning_drafts table is empty. The next `npm run db:migrate` drops it.'
  }
  return drafts
    .map((draft) => {
      const why = whyADraftCannotMove(draft)
      return [
        `DRAFT ${draft.id}`,
        `title: ${JSON.stringify(draft.title)}`,
        `created ${draft.created_at} by ${draft.created_by === '' ? 'nobody recorded' : draft.created_by}; last changed ${draft.updated_at}`,
        why.length === 0
          ? 'It meets every plan limit now, so the next `npm run db:migrate` moves it.'
          : `Why it was not moved: ${why.join(' ')}`,
        'The body, exactly as stored, between the two rules:',
        '----------------------------------------',
        draft.body,
        '----------------------------------------',
      ].join('\n')
    })
    .join('\n\n')
}

/**
 * Delete one draft a person has written into a plan by hand, and say what was deleted.
 *
 * Refused for a draft that meets every plan limit: the migration moves that one itself, keeping its creator and
 * times, so deleting it by hand would throw away what the move keeps.
 */
export function discardADraft(sqlite: Database.Database, id: string): string {
  if (!tableExists(sqlite, DRAFTS_TABLE)) {
    throw new Error('There is no planning_drafts table in this database, so there is no draft to discard.')
  }
  const draft = sqlite
    .prepare(`SELECT id, title, body, created_at, updated_at, created_by FROM ${DRAFTS_TABLE} WHERE id = ?`)
    .get(id) as DraftRow | undefined
  if (draft === undefined) throw new Error(`No draft in planning_drafts has the id "${id}". Nothing was deleted.`)
  if (whyADraftCannotMove(draft).length === 0) {
    throw new Error(
      `The draft ${id} meets every plan limit, so \`npm run db:migrate\` moves it into a plan itself, keeping its ` +
        'creator and its times. Nothing was deleted.',
    )
  }
  sqlite.prepare(`DELETE FROM ${DRAFTS_TABLE} WHERE id = ?`).run(id)
  return [
    `Deleted the draft ${id}, ${JSON.stringify(draft.title)}, created ${draft.created_at} by ${draft.created_by}. Its body was:`,
    '----------------------------------------',
    draft.body,
    '----------------------------------------',
  ].join('\n')
}

// Through the one rule, which also holds inside a bundle, where this module is never the program.
const invokedDirectly = isTheProgramRun(import.meta.url, 'src/server/db/drafts-into-plans-migration.ts')

if (invokedDirectly) {
  // Dynamic, so that importing this module for its functions does not open ./data/panelx.db — the reason
  // db/migrate.ts gives for the same guard.
  const { sqlite } = await import('./client.ts')
  const args = process.argv.slice(2)
  try {
    if (args.length === 0) {
      console.log(showTheDraftsLeft(sqlite))
    } else if (args[0] === '--discard' && args.length === 2 && args[1] !== undefined) {
      console.log(discardADraft(sqlite, args[1]))
    } else {
      throw new Error('Run it with no arguments to see the drafts left, or with `--discard <draft id>` to delete one.')
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    sqlite.close()
    process.exit(1)
  }
  sqlite.close()
}
