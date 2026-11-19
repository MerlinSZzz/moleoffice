// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A dispatched run's key stays in a private file until the run ends. */
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { keysPathFrom } from '../../config/settings.mjs'
import { thisSystem } from '../../config/systems/the-system.mjs'
import { makeARunKey, revokeTheKeyNamed } from './held-keys-made-and-revoked.ts'
import { keysMatch } from './how-this-request-proved-itself.ts'
import { keyHash } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import type { HowAKeysMintWasProved } from './provedkeys.ts'
import { sqlite } from '../db/client.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { filesInTransactions } from '../db/with-dispatched-agent-keys.ts'
import { forgetADispatchedAgentsKey } from '../db/with-dispatched-agent-keys.ts'
import { keyFile } from '../db/with-dispatched-agent-keys.ts'

export { keyFile } from '../db/with-dispatched-agent-keys.ts'

export { filesInTransactions } from '../db/with-dispatched-agent-keys.ts'

export { withDispatchedAgentKeys } from '../db/with-dispatched-agent-keys.ts'

/**
 * The database keeps the hash and its proof; this file keeps the value for the worker. On Linux and the Mac the file
 * is made mode 0600. On Windows it is made empty, and the key is written into it only once its access list is this
 * user's alone and read back; when that cannot be, the empty file is removed and the dispatch refused in words.
 */
export function keepADispatchedAgentsKey(runId: string, agentId: string, proof: HowAKeysMintWasProved): string {
  const made = makeARunKey(agentId, proof)
  const file = keyFile(runId)
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const descriptor = openSync(file, 'wx', 0o600)
  for (const files of filesInTransactions) files.push(runId)
  const privately = thisSystem().aFileIsMadePrivate
  try {
    const set = privately.by === 'its-access-list' ? privately.set(file) : { ok: true as const }
    if (!set.ok) {
      throw new PanelError(`This run's private key file could not be made one that only this user may read and write (${set.says}). No key was written to it, and the run was not dispatched.`, 500)
    }
    writeFileSync(descriptor, made.key)
  } catch (error) {
    closeSync(descriptor)
    forgetADispatchedAgentsKey(runId)
    throw error
  }
  closeSync(descriptor)
  return made.heldKeyId
}

/** Read before claiming, so a refused worker leaves the run waiting. */
export function aDispatchedAgentsKey(runId: string, keyId: string, actor: Actor | undefined): string {
  if (actor?.provedBy !== 'the-office-key' && actor?.provedBy !== 'the-person-key') {
    throw new PanelError('Taking this run needs the office\'s key or the person\'s key. Nothing was taken.', 403)
  }
  const held = sqlite.prepare('SELECT key_hash, revoked_at FROM held_keys WHERE id = ?').get(keyId) as
    { key_hash: string; revoked_at: string | null } | undefined
  if (held === undefined || held.revoked_at !== null) {
    throw new PanelError('This run\'s key is no longer live. Nothing was taken.', 409)
  }
  const key = readFileSync(keyFile(runId), 'utf8')
  if (!keysMatch(keyHash(key), held.key_hash)) {
    throw new PanelError('This run\'s private key file does not match its registered key. Nothing was taken.', 409)
  }
  return key
}

/** A declined run keeps its key for the next worker; a finished or failed run gives it up. */
export function endADispatchedAgentsKey(runId: string, keyId: string): void {
  revokeTheKeyNamed(keyId, 'The dispatched run ended.')
  forgetADispatchedAgentsKey(runId)
}

export { forgetADispatchedAgentsKey } from '../db/with-dispatched-agent-keys.ts'
