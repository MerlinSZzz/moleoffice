// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AT THE START OF A RUN, THE TEST FOLDERS A KILLED TEST LEFT BEHIND ARE SWEPT (problem `lZ7OSjBOhUIO`).
 *
 * vitest.config.ts names this file under `globalSetup`, after the check that a test file was named.
 * vitest runs it once, in its own process, before any test file starts. It reads the list of test
 * folders in the temporary directory of that process, and only that list: it never lists the directory
 * and never reads another process. What the sweep removes and what it keeps is in tests/a-test-folder.ts.
 * It prints one line when it removed or kept a folder, met a line it could not use, or could not take
 * its list, and nothing otherwise.
 */
import { sweepTheTestFoldersLeftBehind, whatTheSweepSays } from './a-test-folder.ts'

export default function theTestFoldersLeftBehindAreSwept(): void {
  const said = whatTheSweepSays(sweepTheTestFoldersLeftBehind())
  if (said !== null) console.log(said)
}
