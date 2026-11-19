// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whyGitDidNotAnswer` was moved byte for byte out of src/server/lib/resources.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

/** Why `readGit` threw, in the words `runCommand` uses for the same failures of another command. */
export function whyGitDidNotAnswer(error: unknown): string {
  const failed = error as NodeJS.ErrnoException & { status?: number | null; signal?: string | null; stderr?: Buffer | string }
  if (failed.code === 'ENOENT') return 'git is not installed on this machine'
  if (typeof failed.signal === 'string') return `git did not finish (killed by ${failed.signal})`
  if (typeof failed.status === 'number') {
    const stderr = String(failed.stderr ?? '').trim().split('\n')[0] ?? ''
    return `git exited ${failed.status}${stderr ? `: ${stderr}` : ''}`
  }
  return `git could not be run: ${failed.message}`
}
