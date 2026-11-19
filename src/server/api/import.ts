// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The durable import, over HTTP.
 *
 *   GET  /api/import   -> what an import would do, row by row. Writes nothing.
 *   POST /api/import   -> do it, or refuse and change nothing. Takes no body.
 *
 * The format is specified in design/durability/FORMAT.md; src/server/lib/import.ts implements the
 * reading of it and src/server/lib/export.ts the writing.
 *
 * ---------------------------------------------------------------------------------------
 * WHY GET IS THE DRY RUN RATHER THAN A FLAG ON POST
 * ---------------------------------------------------------------------------------------
 *
 * An import can change every authored row in the database, so "show me what this would do" is not a
 * nicety, it is the thing a person needs before they press the other button. Making it a separate
 * verb rather than `POST {"dryRun": true}` means it cannot be reached by accident from a request
 * that was meant to be safe, it is cacheable and idempotent as GET promises, and there is exactly
 * one body-less POST rather than a POST whose meaning depends on a field.
 *
 * The two answers come from the same function — `buildPlan` inside lib/import.ts — so the plan a
 * person reads is the plan that gets applied, not a second implementation of the same reasoning.
 *
 * ---------------------------------------------------------------------------------------
 * WHY NEITHER ENDPOINT TAKES A SOURCE DIRECTORY
 * ---------------------------------------------------------------------------------------
 *
 * The same reason `POST /api/export` takes no destination, in the other direction: a path in a
 * request body would let a loopback page name any directory this process can READ and have its
 * contents interpreted as Mole Office rows. The server imports from one place — `exportRoot()`, which is
 * `mirror/` beside the database this process opened — and `GET` says where that is so nobody has to
 * guess. The CLI takes `--from`, because a person at a terminal has already chosen.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A CONFLICT IS 409 AND AN OFFICE-ONLY WRITE IS 403
 * ---------------------------------------------------------------------------------------
 *
 * The request was fine — there is no body to get wrong. What is in conflict is the archive and the
 * database, or the archive and itself, and 409 is the status this server already gives a write that
 * two things cannot both be true about (see `constraintMessage` in lib/http.ts). The reply carries
 * EVERY refusal rather than the first, so one round of edits fixes every file.
 * A change to an office-only run field without its office history is forbidden and answers 403.
 */

import type { FastifyInstance } from 'fastify'
import { ABSENT_ORIGIN_RULE, ABSENT_PROVED_BY_RULE, ImportRefused, applyImport, planImport, type ImportPlan } from '../lib/import.ts'
// The guard and the actor reader, borrowed rather than restated: `assertMayWrite` owns both the
// HUMAN_ONLY_KINDS list and the wording of the refusal, so this route cannot drift from the rule
// every other write path applies.
import { assertMayWrite } from '../lib/records.ts'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { EXPORTED_REGIONS, exportRoot } from '../lib/export.ts'
import { DERIVED_TABLES } from '../db/schema.ts'
import { route } from '../lib/route.ts'

/** The sentence both replies carry: the two things an import will never do to this database, and the two kinds of row it deletes. */
const WHAT_AN_IMPORT_NEVER_DOES =
  'An import never deletes a ROW, except two kinds. One is a conversation_reads row that a newer read by the same ' +
  'reader, in the same conversation and project, replaces. The other is the own row of an office nobody has used ' +
  'yet, with its picture, where nothing names that row and the archive holds its own office\'s row. The plan lists ' +
  'each one as a delete before anything is written. It never ' +
  'writes a change row of its own. A row in the database that the archive ' +
  'does not mention is left alone and counted under notInArchive, because an archive says what it holds and never ' +
  'what to remove. The change log it writes is the one the archive carries, which is what makes importing the same ' +
  'text twice leave the same database. ' +
  // A ROW IS NOT THE SAME AS WHAT IS INSIDE ONE, and the sentence above reads as though it were.
  // Measured: a record whose `data` the archive also holds is UPDATED to the archive's version, so
  // a checklist line filed after the export — and every note, state and consequence on it — is gone
  // afterwards, under a reply saying nothing was deleted. That is true of rows and false of work,
  // and it is the difference between a restore and a merge. It is the intended behaviour of a
  // restore; what was wrong was only that the reply did not say it.
  'WHAT IS INSIDE A ROW IS ANOTHER MATTER: a record the archive also holds is written back to the ' +
  'archive\'s version of it, whole. A checklist line, a state word or a note added since the export ' +
  'is not there afterwards, and `plan.records` counts that row as one update rather than naming what ' +
  'it holds. This is a RESTORE and not a merge — GET /api/import is the dry run, and the way to keep ' +
  'newer work is to export first. It also never decides how a record got here: ' +
  ABSENT_ORIGIN_RULE +
  ' Nor does it decide how a write was proved: ' +
  ABSENT_PROVED_BY_RULE

export async function importRoutes(app: FastifyInstance): Promise<void> {
  /**
   * What an import would do, without doing any of it.
   *
   * It runs the WHOLE plan — parses every file, checks every reference, diffs every row against the
   * database — because "how many rows would change" answered from a different code path to the one
   * that changes them is a number about nothing.
   */
  app.get(
    '/import',
    route(
      'archive.plan',
      'remote',
      'What importing the durable archive would do right now: every file it would read, every row it would insert or ' +
        'update with the columns that differ, everything it would refuse and why, and the rows in the database the ' +
        'archive does not mention. Writes nothing. POST the same path to apply it.',
    ),
    async (): Promise<
      ImportPlan & { tables: { imported: readonly string[]; rebuiltByScanning: readonly string[] }; neverDoes: string }
    > => ({
      ...planImport(),
      // Named on every reply, because a table that is absent by decision and a table somebody
      // forgot look identical from the outside, and only one of them is safe.
      tables: { imported: EXPORTED_REGIONS, rebuiltByScanning: DERIVED_TABLES },
      neverDoes: WHAT_AN_IMPORT_NEVER_DOES,
    }),
  )

  /**
   * Apply the archive, in one transaction, or refuse and change nothing.
   *
   * TAKES NO BODY. There is nothing to configure: the source is fixed for the reason in the header,
   * and an import is all of the archive or it is none of it.
   */
  app.post(
    '/import',
    route(
      'archive.write',
      'local',
      // It replaces every authored table from an archive on this host — records, revisions, changes.
      // The most destructive route in the product, and it reads a directory only this machine has.
      { because: 'acts-on-this-machine', act: "Replacing everything in Mole Office from an archive on this computer's disk" },
      'Read the durable archive back into the database, in ONE transaction: every authored table an archive ' +
        'carries, including ' +
        'soft-deleted records, link provenance, gates and the change log. Takes NO BODY. Applies all of it or none ' +
        'of it — a refusal answers 409 with every reason, naming the file and the line, and writes nothing. A ' +
        'panel_layouts row in an archive written before backups and exports left that table out is not written, and the notes say so.',
    ),
    async (
      req,
      reply,
    ): Promise<
      | (ImportPlan & { applied: boolean; neverDoes: string })
      | undefined
    > => {
      // IT SAID "Takes NO BODY" AND TOOK ONE. `{"dryRun":true}` was answered 200, `applied: true`,
      // with a row overwritten — a destructive import run by a request whose whole content asked it
      // not to be. The dry run is GET /api/import and always was; both answers come out of one
      // `buildPlan` so that the safe reading cannot be reached by accident from a request meant to
      // be safe. So the sentence is made true rather than the key honoured.
      takesNoInput(req, 'POST /api/import',
          'It applies the whole archive at data/mirror, or none of it. To see what it WOULD do without ' +
            'writing anything, send GET /api/import — that is the dry run, and it is a different verb rather ' +
            'than a flag so that the safe reading cannot be reached by accident.',)
      /**
       * ONLY THE HUMAN MAY APPLY AN IMPORT OVER HTTP.
       *
       * This handler took no actor at all until 2026-08-11. It ignored the request entirely, so a
       * body-less POST from anything that could reach the port rewrote EVERY authored row in the
       * database — including every `decision`, the one kind `HUMAN_ONLY_KINDS` exists to protect —
       * attributed to nobody. An adversarial pass found it and I reproduced it: neither this file
       * nor lib/import.ts contained `actorFrom`, `assertMayWrite` or `logChange`.
       *
       * It was the cheapest possible bypass of the only access control this product has. Guarding
       * `deleteRecord` and `restoreRecord` — which this project did last week, twice — means nothing
       * while one unauthenticated POST rewrites the same rows wholesale.
       *
       * WHY HUMAN AND NOT MERELY ATTRIBUTED. An import is not a write to one record whose author can
       * be argued about later; it is a total replacement of the authored state from a text archive
       * that anything with a filesystem could have edited. The human-only rule already says an agent
       * may not change one decision. An agent that may replace all of them has not been restrained.
       *
       * WHAT IS NOT LOST. The library call is unguarded on purpose and stays that way:
       * `scripts/import.ts` and `scripts/restore-check.ts` call `applyImport()` directly, and they
       * are run by an operator at a terminal who already has the database file. The boundary is
       * HTTP, because HTTP is the surface an agent reaches.
       */
      assertMayWrite('decision', 'change', actorFrom(req), 'the whole archive')

      try {
        const report = applyImport()
        return { ...report, neverDoes: WHAT_AN_IMPORT_NEVER_DOES }
      } catch (err) {
        if (!(err instanceof ImportRefused)) throw err
        // The plan, whole, so the caller sees the same thing GET would have shown plus the reasons.
        // `applied: false` is on the body as well as in the status, because a caller that reads one
        // and not the other must not be able to mistake this for success.
        await reply.status(err.status).send({
          ...err.plan,
          applied: false,
          error: err.message,
          root: exportRoot(),
          neverDoes: WHAT_AN_IMPORT_NEVER_DOES,
        })
        return undefined
      }
    },
  )
}
