// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE SANDBOX'S OWN CODEX, AND HOW A COPY OF IT IS TOLD FROM A REAL CODEX.
 *
 * tools/sandbox-start.mjs puts tools/sandbox-codex first on the PATH of every command it starts. The codex there is no
 * Codex: it hands the start on to the next codex on PATH. Two programs must tell it from a real codex, and both ask
 * here, so the two cannot drift apart:
 *   - tools/codex-in-a-sandbox.mjs passes every copy over when it looks for the codex to become;
 *   - whereIsThisTool in ./runtimes.mjs calls a copy installed only when a real codex stands after it on PATH.
 *
 * A copy is told by its size first and then by its bytes. So a real codex, which may be the native program of tens of
 * MB, is never read. The bytes compared are this checkout's, so the copy of a second checkout on PATH is told too.
 *
 * IT IMPORTS NOTHING OF THE OFFICE'S OWN, because ./runtimes.mjs imports it. It is not kept in
 * ./the-environment-a-codex-gets.mjs: that file imports ./systems/the-system.mjs, which reaches ./runtimes.mjs, so
 * ./runtimes.mjs would import itself in a cycle.
 */
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The sandbox's own codex in this checkout. In a bundle, import.meta.url is the chunk's own place, so this names a file
 * two folders above the bundle's folder. In dist/bundle of a checkout that is the checkout's own file. A packed app
 * ships no tools/ folder (scripts/no-development-material.mjs).
 */
export const THE_SANDBOX_CODEX = fileURLToPath(new URL('../../tools/sandbox-codex/codex', import.meta.url))

/**
 * Its bytes once read, and null when this build holds no sandbox codex.
 * @type {Buffer | null | undefined}
 */
let itsBytes

/**
 * Whether the file at `program` is a copy of the sandbox's own codex: of its size, and then of its bytes. Nothing at
 * `program`, or no file, is no copy.
 *
 * A BUILD WITHOUT THE SANDBOX'S CODEX holds no copy of it, and answers false for every program. A packed app is such a
 * build: it starts no sandbox, so no command it starts has the sandbox's codex on PATH. tools/codex-in-a-sandbox.mjs
 * does not rely on that answer: that file starts it, and it stops first when the file is not there.
 *
 * It throws when a file of a copy's size cannot be read, because then nobody can tell. Each caller says what it does.
 *
 * @param {string} program
 * @returns {boolean}
 */
export function isACopyOfTheSandboxCodex(program) {
  if (itsBytes === undefined) {
    itsBytes = statSync(THE_SANDBOX_CODEX, { throwIfNoEntry: false }) === undefined ? null : readFileSync(THE_SANDBOX_CODEX)
  }
  if (itsBytes === null) return false
  const itself = statSync(program, { throwIfNoEntry: false })
  if (itself === undefined || !itself.isFile() || itself.size !== itsBytes.length) return false
  return readFileSync(program).equals(itsBytes)
}
