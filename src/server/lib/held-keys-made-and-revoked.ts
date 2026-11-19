// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theHolderAnAgentsKeysAreKeptUnder`, `holdTheKeyWhoseHashIs`, `makeARunKey` and `revokeTheKeyNamed` were moved out of
 * src/server/lib/keys.ts, with no change of behaviour. Their text is as it was, except that one comment that said
 * `above` now names keys.ts, and the first of them is exported so that keys.ts can import it. That file imports them
 * back where it still uses them and re-exports the three it exported, so its export surface is unchanged.
 */

import { randomBytes } from 'node:crypto'
import { nowStamp } from '@shared/time.ts'
import { sqlite } from '../db/client.ts'
import { keyHash, THE_RUN_KEY_NAMED } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { anOfficeId } from './ids.ts'
import { createRunTokenStore } from './keyrouter/run-tokens.ts'
import type { HowAKeysMintWasProved } from './provedkeys.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'

/**
 * THE STRING `held_keys.whose_id` KEEPS ONE HOLDER'S KEYS UNDER: AN AGENT'S ID. Criterion I5.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A KEY BOUND BY NAME GOES WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A handle is a name somebody chose. It can be changed in place, and after piece I-2 it is free
 * again when its agent retires, so a NEW agent can be registered under a RETIRED agent's name. A key
 * kept under the name would then be found by whoever holds the name today: the new agent would be
 * told it already holds a key it has never been given, and the office would answer the retired
 * agent's key rows to it. An id is minted once and belongs to one agent for ever, so a key kept
 * under the id is the one thing a freed name cannot inherit.
 *
 * ---------------------------------------------------------------------------------------
 * THE RESOLUTION IS HERE AND NOT AT THE CALLERS
 * ---------------------------------------------------------------------------------------
 *
 * Seven places mint or read an agent's key and every one of them holds a HANDLE: the three
 * registration doors (api/participants.ts twice, lib/selfregistration.ts, api/records.ts), the
 * retire door, the visitor confirm and its one-off catch-up pass, and the Embassy's credential row.
 * Putting the resolution at each of them would be seven copies of one fact, which is the ninth
 * invariant, and three of those files belong to later pieces. So every caller passes whatever
 * reference it has and this file turns it into the agent's id. One place.
 *
 * ---------------------------------------------------------------------------------------
 * A HOLDER NO REGISTRY ROW ANSWERS TO IS A REAL HOLDER, AND IS KEPT AS IT ARRIVED
 * ---------------------------------------------------------------------------------------
 *
 * `held_keys` holds three kinds of owner and only one of them is an agent this office registered. A
 * `person-device` row's `whose_id` is a DEVICE'S NAME — "Safari on macOS 4f2c" — which names no
 * agent and must never be resolved as one, so the kind is asked first. And a visiting agent asks for
 * a credential under a handle no registry here holds, which is the ordinary case at the Embassy. In
 * both, the string itself is the holder, and it is stored and read exactly as it arrived.
 *
 * ---------------------------------------------------------------------------------------
 * A NAME THAT MEANS TWO AGENTS IS REFUSED RATHER THAN PICKED BETWEEN
 * ---------------------------------------------------------------------------------------
 *
 * `theAgentAnArrivingReferenceNames` refuses with 409 when one string is one agent's id and another
 * live agent's handle, and that refusal is right here: the thing being settled is whose key this is,
 * which is the worst place in the product to guess. It is asked as a READ because the question is
 * *which agent is this*, not *may it write*: a retired agent still holds its keys, and the retire
 * door has to be able to revoke them by the name it is ending.
 */
export function theHolderAnAgentsKeysAreKeptUnder(whoseKind: string, whoseId: string): string {
  if (whoseKind !== 'agent') return whoseId
  const named = theAgentAnArrivingReferenceNames(whoseId, 'reading')
  return named === null ? whoseId : named.agent.id
}

/**
 * REGISTER A SECRET THE OFFICE ALREADY HOLDS THE HASH OF, as one owner's key.
 *
 * The value itself is never seen here and never stored: only its SHA-256 goes into `held_keys`. This
 * is how a person's-device credential's token becomes that device's key at the confirm press — the
 * device already holds the token it was shown once when it asked, so no second secret has to travel
 * to it and the office never has to hold or print one. Criterion D2, P83 point 4.
 *
 * `whoseKind` is the word `howThisRequestProvedItself` reads: `person-device` proves the person,
 * `agent` proves that agent, `office` proves the office. `whoseId` names the one owner: for a device
 * it is the device's name, because `held_keys` has no credential column and this office must be able
 * to revoke one device without touching their other devices, and a migration to add one is above this worker.
 *
 * AN AGENT'S KEY IS KEPT UNDER THE AGENT'S ID. Criterion I5. The caller passes whatever reference it
 * has — the registration doors and the visitor confirm hold a handle — and
 * `theHolderAnAgentsKeysAreKeptUnder` above turns it into the id, so the row cannot be inherited by
 * whoever holds the name next. Nothing else is touched: a device's name is stored as it arrived.
 *
 * `provedBy` IS HOW THE CALL THAT MADE THE KEY WAS PROVED (migration 0180), worked out by the caller
 * with ./provedkeys.ts, or null because nobody can say. Every caller passes it, so no door can forget.
 *
 * Returns the id of the row it wrote, which is what a revoke press names. The id is not a secret.
 */
export function holdTheKeyWhoseHashIs(
  whoseKind: string,
  whoseId: string,
  hash: string,
  provedBy: HowAKeysMintWasProved | null,
): string {
  const id = anOfficeId()
  sqlite
    .prepare(
      'INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at, last_used_at, revoked_at, ' +
        'revoked_because, mint_proved_by) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?)',
    )
    .run(id, whoseKind, theHolderAnAgentsKeysAreKeptUnder(whoseKind, whoseId), hash, nowStamp(), provedBy)
  return id
}

/**
 * MAKE ONE MORE LIVE KEY OF A HOLDER, AND HAND BACK BOTH THE VALUE AND THE ROW THAT KEEPS ITS HASH.
 * Criterion M81 and P83 point 5.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE HOLDER CAN LEGITIMATELY HAVE TWO KEYS AT ONCE
 * ---------------------------------------------------------------------------------------
 *
 * An agent's registration key is the one the registration replied with, and it stays live for the
 * life of the agent. A run the office starts for that agent is minted a SECOND key, so a run carries
 * its own agent's key and never its starter's. Both rows have the same `whose_kind` and `whose_id`,
 * which is what `revokeEveryLiveKeyHeldBy` and `theLiveKeyHeldBy` already understand: retiring the
 * agent revokes every live key of the holder in one act, and `theLiveKeyHeldBy` answers the newest.
 * Nothing here needs a column or a migration: `held_keys` already holds as many live rows per holder
 * as the office gives it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT RETURNS THE ROW ID AND NOT ONLY THE VALUE
 * ---------------------------------------------------------------------------------------
 *
 * The run's key has to be revoked when the run ends, and the office keeps only the SHA-256 of the
 * key. The row id is the one thing that can be written beside the run — it is not a secret — so the
 * record the run already has can say which row to revoke. `revokeTheKeyNamed` is the reader of that
 * id. `makeAnAgentKey` in keys.ts discards the id because a registration's key is revoked by owner, not
 * by run.
 */
export function makeARunKey(
  whoseId: string,
  provedBy: HowAKeysMintWasProved | null,
): { key: string; heldKeyId: string } {
  const value = randomBytes(32).toString('hex')
  const heldKeyId = holdTheKeyWhoseHashIs('agent', whoseId, keyHash(value), provedBy)
  return { key: value, heldKeyId }
}

/**
 * REVOKE ONE KEY BY ITS ID. True when a live key was revoked, false when there was none.
 *
 * The row is kept and marked — `revoked_at` and `revoked_because` — rather than deleted, the same
 * shape `held_keys` was built with: the office does not delete the evidence of a key it once issued.
 * A revoked key is not recognised by `heldKeyByHash`, so the holder stops being whoever it proved.
 */
export function revokeTheKeyNamed(id: string, because: string, at = nowStamp()): boolean {
  return sqlite.transaction(() => {
    const answer = sqlite
      .prepare('UPDATE held_keys SET revoked_at = ?, revoked_because = ? WHERE id = ? AND revoked_at IS NULL')
      .run(at, because, id)
    const runs = sqlite.prepare(`SELECT id FROM records WHERE kind = 'session' AND ${THE_RUN_KEY_NAMED} = ?`).all(id) as { id: string }[]
    for (const run of runs) createRunTokenStore(sqlite).revokeRun(run.id, 'identity-key-revoked')
    return answer.changes > 0
  }).immediate()
}
