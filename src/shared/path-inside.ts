// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A PATH IS A DIRECTORY OR INSIDE IT.
 * `inside` was moved byte for byte out of src/server/lib/where-a-file-may-be-read.ts, with no change of
 * behaviour. That file imports it back and re-exports it. It reads src/config/the-paths-of-a-system.mjs,
 * which imports node:path, so it has a file of its own.
 */

import { THIS_PLATFORM, theNamesInAPath } from '../config/the-paths-of-a-system.mjs'

/**
 * Is `path` that directory, or inside it? Whole segments, so /tmp/xy is not inside /tmp/x.
 *
 * THE NAMES ARE READ AS THAT SYSTEM WRITES A PATH, so on Windows "\" separates them as "/" does, and the
 * root's names begin the path's names when they are equal name for name. `platform` is a parameter so a test
 * can stand Windows in on a machine that runs another system.
 *
 * EXPORTED SO THAT NOTHING WRITES A SECOND COPY OF IT. A door that stores a file this endpoint will
 * later be asked to serve has to answer the same question before it writes — `whereMessagePictures
 * Go` in lib/messagepictures.ts is the one that does — and a second segment-boundary check written
 * beside it would be the same rule in two places, free to disagree the day one of them is fixed.
 */
export function inside(path: string, root: string, platform: string = THIS_PLATFORM): boolean {
  if (path === root) return true
  const rootNames = theNamesInAPath(root, platform)
  const pathNames = theNamesInAPath(path, platform)
  return pathNames.length >= rootNames.length && rootNames.every((name, index) => name === pathNames[index])
}
