// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE TWO LINES A SERVER PRINTS AROUND ITS MIGRATIONS, IN ONE PLACE FOR BOTH SIDES.
 *
 * `tools/serve-dev.mjs` stops a new server that has not answered within
 * MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN (check `qCP4OR2YDwvZ`, path 2). A server that is
 * migrating a large database is alive and does not answer, and that is not a fault. It was asked in
 * message DXXb8QZ_9EfG that the time spent migrating does not count against the limit, so that a
 * long migration is not stopped and started again for ever.
 *
 * src/server/index.ts prints the first line before `prepareToServe` and the second after it.
 * serve-dev reads them from the child's output, as it reads the guard's refusal
 * (`guard-refusal.mjs`), and leaves the time between them out of the limit. Between them its
 * stand-in answers on the port, and past MOLE_OFFICE_MIGRATIONS_HAVE_TO_FINISH_WITHIN serve-dev
 * stops the server (check `m5X4lu3B2F7L`), so the first line alone cannot hold the port. If the two sides spelt
 * the lines separately, one could change and the limit would count the migration again with
 * nothing failing.
 *
 * Each is matched as a whole line. JavaScript for the reason guard-refusal.mjs is.
 */

/** Printed by the server just before its migrations run. */
export const THE_MIGRATIONS_BEGIN = 'migrations: running. This server answers nothing until they finish.'

/** Printed by the server once its migrations have run, whatever they decided. */
export const THE_MIGRATIONS_END = 'migrations: finished running.'

/**
 * WHAT ONE LINE OF THE CHILD'S OUTPUT SAYS ABOUT ITS MIGRATIONS.
 *
 * @param {string} line one line of the child's output
 * @returns {'began' | 'ended' | null} null when the line is not a marker
 */
export function theMigrationMarkerIn(line) {
  const trimmed = line.trim()
  if (trimmed === THE_MIGRATIONS_BEGIN) return 'began'
  if (trimmed === THE_MIGRATIONS_END) return 'ended'
  return null
}
