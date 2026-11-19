// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `withDispatchedAgentKeys` was moved byte for byte out of src/server/lib/dispatched-agent-keys.ts, with no change of behaviour.
 * `filesInTransactions` was moved byte for byte out of src/server/lib/dispatched-agent-keys.ts, with no change of behaviour.
 * `forgetADispatchedAgentsKey` was moved byte for byte out of src/server/lib/dispatched-agent-keys.ts, with no change of behaviour.
 * `keyFile` was moved byte for byte out of src/server/lib/dispatched-agent-keys.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { keysPathFrom } from '../../config/settings.mjs'

/** A review can roll back after dispatch returns. Each enclosing transaction owns its files too. */
export function withDispatchedAgentKeys<T>(write: () => T): T {
  const files: string[] = []
  filesInTransactions.push(files)
  try {
    return sqlite.transaction(write)()
  } catch (error) {
    for (const id of files) forgetADispatchedAgentsKey(id)
    throw error
  } finally {
    filesInTransactions.pop()
  }
}
export const filesInTransactions: string[][] = []
/** Used after a rolled-back dispatch too, when no registry row or key hash was committed. */
export function forgetADispatchedAgentsKey(runId: string): void {
  rmSync(keyFile(runId), { force: true })
}
export function keyFile(runId: string): string {
  return join(dirname(keysPathFrom(process.env)), 'agent-run-keys', encodeURIComponent(runId))
}
