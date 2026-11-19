// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHICH FILE A CODEX SESSION'S OWN TURN WAS WRITTEN IN.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A SESSION'S LOG PATH IS NOT ON ITS RECORD FOR CODEX
 * ---------------------------------------------------------------------------------------------
 *
 * A claude-code session's hook receives `transcript_path` in its SessionStart payload and writes
 * `data.extra.discovered` from it, so the office has the path on the record. The codex bridge does
 * not write a discovery stamp at all; it writes the thread id it speaks for — `data.providerSession`
 * and `data.extra.codexBridge.thread` — and codex itself names each rollout file after that thread.
 * So the path is a fact the office can still find, and this is the one place it is worked out.
 *
 * WHAT THE END OF THAT FILE SAYS is `theLastLinesOf` and `theCodexTranscriptLastWrittenAt` in
 * `stopped-run-cause.mjs`, beside the claude reading of the same file. This module only answers
 * which file it is.
 *
 * ---------------------------------------------------------------------------------------------
 * WHERE CODEX WRITES IT, MEASURED
 * ---------------------------------------------------------------------------------------------
 *
 * Measured on this machine on 12 September 2026 against codex-cli 0.153.4:
 *
 *   `~/.codex/sessions/<year>/<month>/<day>/rollout-<ISO timestamp>-<thread-uuid>.jsonl`
 *
 * One file per thread, appended to across resumes: the rollout for a thread first written on
 * 8 September 2026 still carried that thread's turns on 11 September, with the same name. Filenames
 * on this machine were checked for a repeated thread id and there were none, so a filename match is
 * the thread's own file and not a choice between several.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT WILL NOT DO
 * ---------------------------------------------------------------------------------------------
 *
 * IT DOES NOT INVENT A PATH. A thread with no file, a sessions root that cannot be walked, and a
 * thread id that names nothing all answer `null`, and the caller says it could not read whether the
 * session is answering rather than guessing a cause.
 *
 * IT READS THE FILESYSTEM AND NEVER WRITES IT. Nothing here creates, moves or deletes a file, so
 * the office can look at the owner's own codex directory without changing a byte of it.
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** How deep under a sessions root a rollout may sit. codex's own layout is `<Y>/<M>/<D>/<file>`. */
const MOST_DIRECTORIES_DEEP = 4

/**
 * The rollout file for one codex thread under a sessions root, or null when there is none.
 *
 * THE FILENAME IS THE MATCH, and it is a stronger statement than searching file contents: codex
 * names the file after the thread, so the name alone proves the file is that thread's. The newest
 * match by modification time wins when a thread somehow has more than one, because that is the one
 * codex is still writing.
 *
 * @param {unknown} threadId
 * @param {unknown} sessionsRoot
 * @returns {string | null}
 */
export function theCodexRolloutFor(threadId, sessionsRoot) {
  if (typeof threadId !== 'string' || threadId.trim() === '') return null
  if (typeof sessionsRoot !== 'string' || sessionsRoot.trim() === '') return null

  /** @type {string | null} */
  let best = null
  let bestMs = -1

  /** @param {string} dir @param {number} depth */
  const walk = (dir, depth) => {
    if (depth > MOST_DIRECTORIES_DEEP) return
    /** @type {import('node:fs').Dirent[]} */
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      // A directory that cannot be read is not a thread with no log. The caller is told null and
      // says it could not read; it is never told a path that does not exist.
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      if (!entry.name.startsWith('rollout-') || !entry.name.endsWith('.jsonl')) continue
      if (!entry.name.includes(threadId)) continue
      let ms = 0
      try {
        ms = statSync(full).mtimeMs
      } catch {
        ms = 0
      }
      if (best === null || ms > bestMs) {
        best = full
        bestMs = ms
      }
    }
  }

  walk(sessionsRoot, 0)
  return best
}
