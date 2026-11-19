// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

// ---------------------------------------------------------------------------- workspaces

/**
 * The project boundaries this installation holds. One row per project.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A TABLE AT ALL, WHEN EVERY OTHER TABLE ALREADY CARRIES `workspace_id`
 * ---------------------------------------------------------------------------------------
 *
 * Because without it the set of workspaces is only ever `SELECT DISTINCT workspace_id`, and that
 * answer is wrong in both directions. A workspace with nothing in it yet does not exist at all —
 * so a project cannot be established before its first record, and the first record has nowhere to
 * go. And a MISSPELT id in a header would create a workspace: `x-mole-office-workspace: projectt`
 * would file a write into a project nobody has, silently, and the row would be unreachable
 * afterwards by anyone spelling it right. That is the misspelt-actor-header defect exactly, one
 * door along, and the fix is the same one: a closed set, and a refusal naming what does exist.
 *
 * SO THE SET IS DECLARED, AND EVERY WORKSPACE A REQUEST NAMES MUST BE IN IT. `requireWorkspace` in
 * lib/workspaces.ts is the one gate; nothing else may invent a workspace.
 *
 * THIS IS NOT A `project` RECORD KIND, and the difference is not cosmetic. A record is a thing
 * inside a project — it has a kind, a completeness, links, a change history, an attention score,
 * and it appears on the Records page. A workspace is the boundary those live in. Making it a
 * record would put the boundary inside the thing it bounds: the project's own row would have to
 * live in some workspace, and either it lives in itself or there is a second identity beside the
 * one every key in this database already uses.
 *
 * AUTHORED. The titles and notes are somebody's words and exist nowhere else, so this table
 * round-trips through the export like the other authored tables.
 *
 * NOTHING DELETES FROM IT. Deleting a workspace would orphan every row that names it, in seven
 * tables, and there is no route that does it. A project that is finished still holds its record.
 */
export const workspaces = aPartTable(sqliteTable('workspaces', {
  /**
   * The id every other table's `workspace_id` holds, and the value `x-mole-office-workspace` carries.
   *
   * Shaped by `workspaceIdFault` in shared/workspaces.ts, which is the ONE statement of the rule —
   * the header reader and the create route both ask it, so what a request may name and what a
   * request may establish cannot drift apart.
   */
  id: text('id').primaryKey(),
  /** What a person reads. Any script, spaces allowed. */
  title: text('title').notNull(),
  /**
   * What this workspace holds, in the words of whoever established it.
   *
   * The corpus migration writes its EVIDENCE here — how many records it placed and on what — so a
   * reader can see why a project boundary exists at all rather than having to find the migration.
   */
  note: text('note'),
  /**
   * HOW MUCH REVIEW A FINISHED RUN IN THIS PROJECT GETS: `none`, `light` or `full`. The column was
   * added by migration 0153, under a decision.
   *
   * NULLABLE, AND NULL IS NOBODY HAVING CHOSEN rather than a missing value. It is read through
   * `reviewLevelOf` in shared/workspaces.ts, which is the one place saying that the level before
   * anybody chooses is `full` — today's behaviour, so nothing changed on the day this landed.
   *
   * NO SQL DEFAULT AND NO CHECK CONSTRAINT. The three words are declared in shared code and enforced
   * at `PATCH /api/workspaces/:id`. A second statement of the list inside SQLite would be this
   * repository's recurring defect: two places that must agree, with nothing making them agree.
   */
  reviewLevel: text('review_level'),
  /** Whether this project's handed-back package points are inspected; null means nobody has chosen. */
  packageInspection: integer('package_inspection', { mode: 'boolean' }),
  /**
   * THE SECRETARY REMINDED ABOUT THIS PROJECT'S MODULES, AS SET ON THE SETTINGS PAGE, by its registry id. Added by
   * migration 0211.
   *
   * NULL MEANS NOTHING IS SET HERE, and the line MOLE_OFFICE_MODULE_REMINDER_SECRETARIES in .env then decides.
   * `src/server/lib/module-reminder-secretaries.ts` is the one reader and the one writer, and it checks on every
   * read that the agent is still an un-retired holder of the secretary card.
   */
  moduleReminderSecretary: text('module_reminder_secretary'),
  /** The reason given with the last change of the column above, or NULL when none was given. Migration 0211. */
  moduleReminderSecretaryBecause: text('module_reminder_secretary_because'),
  /**
   * THE PROJECT'S MASTER PIPELINE, by its record id: the pipeline whose steps are the project's architecture blocks.
   * Migration 0338.
   *
   * NULL MEANS NOBODY HAS MARKED ONE, and the project board then says so and draws no rows. A secretary sets it and
   * the person may change it; the office's change log keeps who, when and why. `src/server/lib/master-pipeline.ts` is
   * the one reader and the one writer, and it checks on every read that the record is still a live pipeline here.
   */
  masterPipeline: text('master_pipeline'),
  /** When it was established, LOCAL wall clock. No SQL default, for the reason `base` gives. */
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}), { existingArchive: true })
