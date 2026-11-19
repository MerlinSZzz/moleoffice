// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `THEIR_TOOL_KEY_KIND` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `keysMatch` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `heldKeyByHash` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `aHeldKeyThisWorldTrusts` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { sqlite } from '../db/client.ts'
import type { HeldKeyRow } from './keys.ts'
import { theWorldsOwnAuthority } from './worldauthority.ts'
import { theAgentAKeysHolderNames } from './the-handle-of-the-agent-a-key-proves.ts'

/** The person's tools have their own key kind: never a person, device or agent. Two decisions and report
 * H-forI_Vk5H7 say so. */
export const THEIR_TOOL_KEY_KIND = 'person-tool'
/**
 * Do two pieces of text hold the same secret?
 *
 * BOTH SIDES ARE HASHED FIRST, so the comparison is always over 32 bytes and no length is leaked.
 * `timingSafeEqual` is what compares them — never `===`, which leaks the shared prefix by timing.
 */
export function keysMatch(one: string, other: string): boolean {
  const a = createHash('sha256').update(one).digest()
  const b = createHash('sha256').update(other).digest()
  return timingSafeEqual(a, b)
}
/**
 * A key the office has issued, looked up by its hash. Revoked keys are not found: a revoked key is
 * a key the office has taken back.
 *
 * THE TABLE HOLDS AN AGENT'S KEY AND A PERSON'S-DEVICE KEY. The mapping below reads the kind rather
 * than assuming every row is an agent: `person-device` proves the person, `agent` proves that agent
 * and `office` proves the office. A person's-device key is bound to the person through that kind,
 * and `whose_id` names the one device so one device can be revoked without touching their other devices.
 */
export function heldKeyByHash(hash: string): HeldKeyRow | undefined {
  return sqlite
    .prepare('SELECT id, whose_kind, whose_id, key_hash FROM held_keys WHERE key_hash = ? AND revoked_at IS NULL')
    .get(hash) as HeldKeyRow | undefined
}
/**
 * WHETHER A KEY THE OFFICE'S OWN TABLE HOLDS IS ONE THIS TEST WORLD TRUSTS. Criterion P84's last
 * clause: a world trusts the agent that started it and the secretary, and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ASKED AT ALL: A WORLD'S DATABASE IS A COPY
 * ---------------------------------------------------------------------------------------
 *
 * A world is started from a copy of the office's database, and `held_keys` — the SHA-256 of every
 * agent key and every device key the office ever made — is copied with it. So before this clause,
 * `howThisRequestProvedItself` found an inherited hash and read the key as proof exactly as the
 * office would: every agent key the office ever made proved that agent in every world, and a copied
 * person's-device key made its holder THE PERSON there. The door that closes that is here.
 *
 * ---------------------------------------------------------------------------------------
 * THE OFFICE IS UNCHANGED
 * ---------------------------------------------------------------------------------------
 *
 * `inATestWorld` is false in the office, which is never a test world, so this answers true for every
 * held key and the office's own key path is exactly what it was. Only a process the world-setting
 * names is narrowed.
 *
 * ---------------------------------------------------------------------------------------
 * ONLY AN AGENT KEY IS EVER TRUSTED, AND ONLY THESE TWO HOLDERS
 * ---------------------------------------------------------------------------------------
 *
 * A `person-device` key proves the person and an `office` key proves the office; neither is the
 * starter's key or the secretary's, so neither is trusted in a world. An agent key is trusted only
 * when its holder is the starter the ledger row named or one of the secretaries of the office the
 * copy came from. A person-device row whose holder happens to share the starter's handle is not the
 * starter's key and is refused by the kind check before it.
 *
 * ---------------------------------------------------------------------------------------
 * A WORLD THAT NAMED NOBODY TRUSTS NO KEY IN ITS TABLE
 * ---------------------------------------------------------------------------------------
 *
 * A throwaway world is told it is a world with both names empty (`theWorldsOwnAuthority`), so the
 * list below is empty and no row matches it. Before that reading, empty meant "not a world" and a
 * throwaway world trusted every row as the office does (problem FmGa9AOxfaw1).
 *
 * THIS COVERS EVERY ROW A WORLD'S TABLE CAN HOLD, NOT ONLY COPIED ONES. P84 says a world trusts the
 * starter's key and the secretary's key "and nothing else". So a key minted inside the world after
 * it started — an agent registered there, a run key, a credential confirmed there — proves its
 * holder only when that holder is the starter or a secretary. tools/how-long-to-the-first-write.mjs
 * already works to that rule. The world's own person key and office key are not rows in this table:
 * they are read from the world's own key file before this is asked, so they prove as they do in the
 * office.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO SIDES ARE TWO DIFFERENT SHAPES OF NAME, SO THEY ARE RESOLVED BEFORE THEY ARE COMPARED
 * ---------------------------------------------------------------------------------------
 *
 * `MOLE_OFFICE_WORLD_STARTED_BY` and `MOLE_OFFICE_WORLD_SECRETARIES` hold HANDLES: the tool that
 * starts a world reads them off the ledger row and off the cards, and a person reads them in the
 * refusal. `held_keys.whose_id` holds an ID since criterion I5. While every agent's id was its own
 * handle the two were the same characters; after the mint they are not, and a world would stop
 * trusting the very agent that started it — its own starter refused by its own rule, with a sentence
 * saying the key belongs to somebody else. So each side is asked which agent it names and the answer
 * is compared.
 *
 * THE STRINGS ARE COMPARED FIRST, and that is the whole of the ordinary case: a holder no registry
 * row answers to, which is what a world copied from an office whose agents this database does not
 * hold is full of. Nothing is looked up for it.
 *
 * IT REFUSES NOTHING AND THROWS NOTHING. `theAgentAKeysHolderNames` is the reader that answers null
 * rather than raising, because this is asked on every request. A name this world cannot place, or
 * one that means two agents, simply does not match, and a key that does not match is not trusted —
 * which is this function's answer for everything it cannot vouch for.
 *
 * IT READS THE WORLD'S OWN COPY OF THE REGISTRY, which is the only registry this process has. That
 * is not a way in: anybody who can edit the copy can write a `held_keys` row for a key they already
 * hold, so this reading assumes nothing the table did not already assume.
 */
export function aHeldKeyThisWorldTrusts(held: HeldKeyRow): boolean {
  const world = theWorldsOwnAuthority()
  if (!world.inATestWorld) return true
  if (held.whose_kind !== 'agent') return false
  const trusted = world.startedBy === null ? world.secretaries : [world.startedBy, ...world.secretaries]
  if (trusted.includes(held.whose_id)) return true
  const holder = theAgentAKeysHolderNames(held.whose_id)
  if (holder === null) return false
  return trusted.some((said) => theAgentAKeysHolderNames(said)?.id === holder.id)
}
