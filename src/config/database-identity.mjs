// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A STABLE ID FOR ONE DATABASE FILE, WORKED OUT IN ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------
 *
 * The first 16 hex characters of the SHA-256 of a database file's absolute path and the moment the
 * file was created. It goes on every reply, inside the `x-mole-office-world` header of criterion G3.
 *
 * ---------------------------------------------------------------------------------------
 * WHY AN IDENTITY AND NOT THE PATH
 * ---------------------------------------------------------------------------------------
 *
 * A path is not an identity. The negative control criterion G7 asks for COPIES the database and
 * serves the copy; a copy restored back over the original path keeps the path and is a different
 * file with different work in it. `./data/panelx.db` is also the same nine characters in every
 * checkout on this machine, so on its own it tells two of them apart not at all.
 *
 * The declaration in src/config/settings.mjs gives the database a path and nothing else — there is
 * no id there to take, which is why one is worked out.
 *
 * BOTH HALVES ARE NEEDED. The creation time is what tells a copy from the file it was copied from.
 * The path is in the hash because two files created in the same instant at different paths are
 * still two files.
 *
 * SIXTEEN CHARACTERS AND NOT SIXTY-FOUR, because this goes on every reply and is read by people in
 * terminals. Sixty-four bits is far more than enough to tell apart the handful of database files
 * one machine has.
 *
 * ---------------------------------------------------------------------------------------
 * WHO READS IT, AND WHY IT IS JAVASCRIPT AND ITS OWN FILE
 * ---------------------------------------------------------------------------------------
 *
 * Three callers: `src/server/lib/world.ts`, which writes the header; `tools/session-hook.mjs`,
 * which works out the identity of the database the declaration calls canonical, so it can compare;
 * and `tools/negative-control.mjs`. The hook is spawned by Claude Code with the bare word `node`,
 * which on this machine is v18.19.1 and cannot read TypeScript, so a TypeScript version of this
 * would have to be written twice. src/config/settings.mjs says the same thing at more length.
 *
 * IT IS SEPARATE FROM src/config/world-header.mjs because that file is imported by the BROWSER,
 * which has no `node:fs` and no `node:crypto` and no files to stat.
 */

import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'

/** What a value says when the thing it names could not be read. Kept in step with world-header.mjs. */
const UNKNOWN = 'unknown'

/**
 * What a database identity is, and how it was worked out.
 *
 * @typedef {object} DatabaseIdentity
 * @property {string} id 16 hex characters, or `unknown` when the file could not be read.
 * @property {string} how One plain sentence: what was hashed, or why nothing could be.
 */

/**
 * The identity of the database file at `path`.
 *
 * A file that cannot be read answers `unknown` WITH the reason. That is a real answer and not a
 * failure: a server whose database has been deleted under it is a state this product has been in,
 * and it went on answering every request perfectly while it was.
 *
 * @param {string} path
 * @returns {DatabaseIdentity}
 */
export function databaseIdentity(path) {
  const full = resolve(path)
  /** @type {number} */
  let born
  try {
    born = statSync(full).birthtimeMs
  } catch (err) {
    return {
      id: UNKNOWN,
      how: `${full} could not be read, so this database has no identity here (${err instanceof Error ? err.message : String(err)}).`,
    }
  }
  // A filesystem that does not record a creation time reports 0. Hashing that would produce an id
  // that looks exactly as strong as a real one while telling a copy from its original not at all,
  // which is the substitution invariant 2 of USER.md forbids. Say `unknown` instead.
  if (!Number.isFinite(born) || born === 0) {
    return {
      id: UNKNOWN,
      how: `The filesystem holding ${full} does not record when a file was created, so a copy of this database could not be told from the original.`,
    }
  }
  return {
    id: createHash('sha256').update(`${full}\n${String(born)}`).digest('hex').slice(0, 16),
    how: `the SHA-256 of the path ${full} and its creation time, cut to 16 characters`,
  }
}
