// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theHandleOfTheAgentAKeyProves` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `theAgentAKeysHolderNames` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from '../db/client.ts'
import { theOneAgentAStringNames, type AgentIdentity } from './agent-references.ts'

/**
 * THE NAME OF THE AGENT A KEY PROVES, for a sentence a person reads. The string itself where no one
 * agent answers to it.
 *
 * Criterion I5 makes `held_keys.whose_id` an id, and after the mint an id is a nanoid of 12 that
 * names nobody to a reader. Two sentences put a holder in front of a person — the refusal a test
 * world writes for a key it does not trust, and the reason a world gives for who holds the owner's
 * authority — and both of them said a name until this landed. This keeps them saying one.
 */
export function theHandleOfTheAgentAKeyProves(whoseId: string): string {
  return theAgentAKeysHolderNames(whoseId)?.handle ?? whoseId
}
/**
 * THE AGENT A KEY'S HOLDER STRING NAMES, WITHOUT REFUSING ANYTHING. Null because it names none, or
 * because it names two.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SECOND READER AND NOT `theHolderAnAgentsKeysAreKeptUnder` ABOVE
 * ---------------------------------------------------------------------------------------
 *
 * The two callers below are on the path of EVERY request: the test world's trust reading, and the
 * holder a refusal names. `howThisRequestProvedItself` is asked even by the bookkeeping read in
 * src/server/lib/usage.ts, and a 409 thrown there would turn "which kind of caller was this" into a
 * refusal of the request. So this reader answers null where the other one refuses, and each caller
 * below says in its own words what it does with a null.
 *
 * IT IS THE SAME READING `theAgentAKeysHolderIs` IN lib/participants.ts DOES, for the same holder
 * strings, and `theOneAgentAStringNames` is the one function both of them ask.
 *
 * IT IS EXPORTED FOR ONE MORE SENTENCE. src/server/lib/keyheader.ts refuses an agent's key sent under
 * another name, on every request, and names the key's holder by its name and its handle. It must not
 * throw either, for the same reason.
 */
export function theAgentAKeysHolderNames(whoseId: string): AgentIdentity | null {
  return theOneAgentAStringNames(sqlite, whoseId)
}
