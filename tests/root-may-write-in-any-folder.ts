// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CASE THAT NEEDS A FOLDER OR A FILE THIS PROCESS MAY NOT WRITE IN SKIPS WHERE THERE CAN BE NONE, AND SAYS WHY (wave
 * 13t, rounds W27 and W28).
 *
 * Root may write in a folder or a file whatever its mode, so a case that shuts one to see a press refused proves
 * nothing when it runs as root. Such a case asks `skippedAsRoot` before it does anything else. Until round W28 the rule
 * asked whether the uid was 0. Now it asks tests/a-shut-folder-takes-a-write.ts whether a folder shut to 0o500 takes a
 * write, so it skips only where such a case really cannot run, whoever the process is. There it warns and skips with
 * the reason, and anywhere else the case runs exactly as before. tests/a-folder-shut-after-the-copy.ts asks the same
 * question and throws the same words, for a case that forgets to ask first.
 *
 * tests/root-may-write-in-any-folder.test.ts proves the rule with a stand-in for that answer, never by running as root.
 */
import { aShutFolderTakesAWrite } from './a-shut-folder-takes-a-write.ts'

/** Why such a case skips, in the words the warning, the skip and the shut-folder helper all say. */
export const ROOT_MAY_WRITE_IN_ANY_FOLDER =
  'This process may write in a folder whose mode says it may not, as root may, so a case that needs a folder or a file this process may not write in proves nothing here.'

/**
 * Where a shut folder takes a write, warn and skip the case, with the reason. Ask it first, as
 * `if (skippedAsRoot(context)) return`; the `return` is never reached, because the runner's skip throws, but it keeps
 * the case from going on if it did not.
 */
export function skippedAsRoot(context: { skip: (note: string) => void }): boolean {
  if (!aShutFolderTakesAWrite()) return false
  console.warn(`Skipped. ${ROOT_MAY_WRITE_IN_ANY_FOLDER}`)
  context.skip(ROOT_MAY_WRITE_IN_ANY_FOLDER)
  return true
}
