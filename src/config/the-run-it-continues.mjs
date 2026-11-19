// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
import { readFileSync } from 'node:fs'

/**
 * THE OUTPUT OF THE RUN A ROUND CONTINUES, READ IN ONE PLACE (wave 13s round 43). The launcher reads it for a round
 * (theRunItContinues in tools/sandbox-start.mjs) and the message worker for a resumed Codex run
 * (src/worker/runtimes/codex.ts). Both hand it to the receipt readers of src/config/usage.mjs as `ThePreviousRun`.
 * That module reads no file itself, because the pages import it.
 *
 * The answer is the file's text, or why it could not be read, and never an empty text in place of a file that is not
 * there: an empty output and a missing one are different facts, and the receipt says which.
 * @param {string} run The session record of the run that is continued.
 * @param {string} path The file that run's output went to.
 * @returns {{ run: string, text: string } | { run: string, unread: string }}
 */
export function theOutputOfTheRunItContinues(run, path) {
  try {
    return { run, text: readFileSync(path, 'utf8') }
  } catch (error) {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : null
    return { run, unread: `${path}: ${code ?? (error instanceof Error ? error.message : String(error))}` }
  }
}
