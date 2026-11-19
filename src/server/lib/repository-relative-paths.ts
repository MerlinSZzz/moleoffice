// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `repositoryRelativePaths` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { PanelError } from './panel-error.ts'
import { posix, win32 } from 'node:path'

/**
 * PATHS RELATIVE TO THE REPOSITORY, normalised, including files not created yet; `what` names the list in
 * the refusal ("A work area", "A territory"). An empty entry, an absolute path, a drive letter, the
 * repository root and a path outside it are refused. This is the one place that rule is written, so a work
 * area and a territory cannot disagree about which paths lie inside the repository.
 */
export function repositoryRelativePaths(area: readonly string[], what: string): string[] {
  const paths: string[] = []
  for (const entry of area) {
    const path = posix.normalize(entry.trim().replaceAll('\\', '/'))
    if (entry.trim() === '' || posix.isAbsolute(path) || win32.isAbsolute(entry.trim()) ||
        /^[a-z]:/i.test(entry.trim()) || path === '.' || path === './' || path === '..' || path.startsWith('../')) {
      throw new PanelError(`${what} is files and folders inside the repository, written as repository-relative paths. ` +
        `"${entry}" names an absolute path, the repository root, or a path outside it. Nothing was written.`, 400)
    }
    paths.push(path.replace(/\/+$/u, ''))
  }
  return paths
}
