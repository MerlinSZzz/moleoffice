// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theKeyOnThisRequestWasMadeForARun` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `theHeldKeyRowWhoseHashIs` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `theHashOfTheKeyOnThisRequest` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `keyHash` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `whatTheKeyWithThisIdIsFor` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `THE_RUN_KEY_NAMED` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `keyOn` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `oneHeader` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `whereARunStands` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `cookieValue` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * `WHERE_A_DISPATCHED_RUN_STANDS` was moved byte for byte out of src/server/lib/keys.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { FastifyRequest } from 'fastify'
import { sqlite } from './client.ts'
import type { AHeldKeyRow } from '../lib/keys.ts'
import { createHash } from 'node:crypto'
import type { EmbassyKey as AKeyOfAHolder, EmbassyKeyRunState as KeyRunState } from '@shared/worlds.ts'
import type { RunState } from '../lib/agents.ts'
import { STORED_FIELDS, theWordsOfAStoredField } from './schema.ts'
import { KEY_COOKIE, KEY_HEADER } from '../../config/key-header.mjs'
import { theRunHasEnded } from '@shared/run-has-ended.ts'

/**
 * WHETHER THE KEY THIS REQUEST CARRIES WAS MADE FOR A RUN, read by `whatTheKeyWithThisIdIsFor` above: a run's, a
 * deleted run's, a dispatched run's or a world's. False for a holder's own key, for a key the office does not hold, and
 * for a request that carried none. A revoked row is read as well, so a sealed or finished run's own key, which still
 * proves its agent on the few doors after its end, is still a run key. lib/run-keys-only.ts asks it.
 */
export function theKeyOnThisRequestWasMadeForARun(req: FastifyRequest): boolean {
  const hash = theHashOfTheKeyOnThisRequest(req)
  const row = hash === null ? null : theHeldKeyRowWhoseHashIs(hash)
  return row !== null && whatTheKeyWithThisIdIsFor(row.id).is !== 'its-own'
}
/**
 * THE KEY ROW WHOSE HASH IS THIS, REVOKED OR LIVE, OR NULL BECAUSE THERE IS NONE. Criterion D2 and
 * problem _vd-_MXlswH5.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A BY-HASH READER AND NOT THE BY-HANDLE ONE
 * ---------------------------------------------------------------------------------------
 *
 * A person's device is bound to the person by the SHA-256 of the token it already holds, and
 * `held_keys` has no credential column (see the note on `holdTheKeyWhoseHashIs` below). Two
 * credentials under one device name therefore share a `whose_id`, and the confirm's old
 * `aKeyWasEverHeldBy('person-device', handle)` saw the FIRST device's key and bound nothing for the
 * second — while still answering the sentence saying a key had been bound. Reading by hash asks
 * about THIS credential's own token, so a second credential under one name binds its own key.
 *
 * IT INCLUDES A REVOKED ROW ON PURPOSE. A revoked key is not live and must not be handed back as if
 * it proved anything, which is `heldKeyByHash`'s rule. But "has this token's key already been
 * installed?" is a different question, and the answer stays yes after a revoke: rebinding would be
 * the office reissuing a key the person took back. So the caller binds only where this returns null,
 * and asks `revokedAt` before it names a row as the one it just bound.
 *
 * IT RETURNS A ROW AND NEVER A TOKEN. The token is not in `held_keys` at all: only its SHA-256 is.
 */
export function theHeldKeyRowWhoseHashIs(hash: string): AHeldKeyRow | null {
  const row = sqlite
    .prepare(
      'SELECT id, whose_kind, whose_id, revoked_at FROM held_keys WHERE key_hash = ? ' +
        'ORDER BY made_at DESC, id DESC LIMIT 1',
    )
    .get(hash) as { id: string; whose_kind: string; whose_id: string; revoked_at: string | null } | undefined
  return row === undefined
    ? null
    : { id: row.id, whoseKind: row.whose_kind, whoseId: row.whose_id, revokedAt: row.revoked_at }
}
/**
 * THE SHA-256 OF THE KEY THIS REQUEST CARRIES, OR NULL BECAUSE IT CARRIED NONE. Criterion D2, P83
 * point 4.
 *
 * THE HASH AND NEVER THE VALUE. The office already stores this hash in the clear in `held_keys` and
 * in `visitor_credentials.token_hash`, so handing it to a caller inside the server reveals nothing a
 * database read would not. It is what lets the pairing page learn whether the browser is a device
 * still waiting for its confirmation, without the token itself ever leaving this file or
 * `src/server/lib/visitors.ts`. A caller that presented no key answers null, which is "nothing to
 * look up" rather than a failure.
 */
export function theHashOfTheKeyOnThisRequest(req: FastifyRequest): string | null {
  const presented = keyOn(req)
  return presented === undefined ? null : keyHash(presented)
}
/** The SHA-256 of a key, in hex. The same reading src/server/lib/visitors.ts uses for a credential. */
export function keyHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
/**
 * WHAT ONE KEY WAS MADE FOR, read from the three places the office writes a key's row id:
 *
 *   - a run's session record, `data.extra.runKeyId` (`makeARunKey` from the records door);
 *   - a dispatched run's request, `agentKeyId` (src/server/lib/dispatched-agent-keys.ts);
 *   - a world's `run_key_id` (`closeWorldHere` in src/server/lib/office.ts revokes it).
 *
 * A key none of the three names is the holder's own key: every other way the office makes a key
 * (registration, a new key after a lost one, the mail tool, a confirmed credential) makes the
 * holder's own. `running` is null when the run's record holds no state the office can read.
 *
 * A RUN WHOSE SESSION RECORD WAS DELETED IS STILL A RUN (problem sWNzXXKdB3q6). Deleting the record
 * does not revoke the key, so the key stays live. Its row then says `a-deleted-run`, with the run's id
 * and neither a title nor a state: the record that held both is deleted, and nobody can say where
 * the run stands. Before this, the deleted record was skipped and the key was labelled the holder's
 * own, which was a guess.
 */
export function whatTheKeyWithThisIdIsFor(id: string): Pick<AKeyOfAHolder, 'is' | 'of'> {
  // A LIVE RECORD FIRST, so a key some record still names is labelled by that record.
  const run = sqlite
    .prepare(
      "SELECT id, title, json_extract(data, '$.state') AS state, deleted_at FROM records WHERE kind = 'session' " +
        `AND ${THE_RUN_KEY_NAMED} = ? ORDER BY deleted_at IS NOT NULL, created_at DESC LIMIT 1`,
    )
    .get(id) as { id: string; title: string; state: unknown; deleted_at: string | null } | undefined
  if (run !== undefined && run.deleted_at === null) {
    return { is: 'a-run', of: { id: run.id, title: run.title, state: whereARunStands(run.state) } }
  }
  if (run !== undefined) return { is: 'a-deleted-run', of: { id: run.id, title: null, state: null } }
  const dispatched = sqlite
    .prepare("SELECT id, state FROM agent_runs WHERE json_extract(request, '$.agentKeyId') = ? LIMIT 1")
    .get(id) as { id: string; state: string } | undefined
  if (dispatched !== undefined) {
    return { is: 'a-dispatched-run', of: { id: dispatched.id, title: null, state: WHERE_A_DISPATCHED_RUN_STANDS[dispatched.state as RunState] ?? null } }
  }
  const world = sqlite
    .prepare('SELECT id, name, died_at FROM worlds WHERE run_key_id = ? LIMIT 1')
    .get(id) as { id: string; name: string; died_at: string | null } | undefined
  if (world !== undefined) return { is: 'a-world', of: { id: world.id, title: world.name, state: world.died_at === null ? 'not-ended' : 'ended' } }
  return { is: 'its-own', of: null }
}
/** `json_extract(data, '$.extra.runKeyId')`, which every lookup of a run or a binding by its key below asks. */
export const THE_RUN_KEY_NAMED = theWordsOfAStoredField(STORED_FIELDS.runKeyId, 'data')
/** The key a request carries, from the header first and the cookie second, or undefined. */
export function keyOn(req: FastifyRequest): string | undefined {
  return oneHeader(req.headers[KEY_HEADER]) ?? cookieValue(req.headers.cookie, KEY_COOKIE)
}
/** The header value as one trimmed non-empty string, or undefined because it was not sent. */
export function oneHeader(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value.trim() === '' ? undefined : value.trim()
  if (Array.isArray(value)) {
    const first = value[0]
    return first === undefined || first.trim() === '' ? undefined : first.trim()
  }
  return undefined
}
/**
 * WHERE A RUN'S SESSION RECORD SAYS IT STANDS. Ended by `theRunHasEnded`, the one reading of that. A
 * run that is running or idle has not ended. `unknown`, or no state at all, is null: nobody can say.
 */
export function whereARunStands(state: unknown): KeyRunState {
  if (typeof state !== 'string' || state === 'unknown') return null
  return theRunHasEnded(state) ? 'ended' : 'not-ended'
}
/** The named cookie out of a Cookie header, decoded, or undefined because it is not there. */
export function cookieValue(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined
  for (const piece of header.split(';')) {
    const at = piece.indexOf('=')
    if (at === -1) continue
    if (piece.slice(0, at).trim() !== name) continue
    const raw = piece.slice(at + 1).trim()
    if (raw === '') return undefined
    try {
      return decodeURIComponent(raw)
    } catch {
      // A cookie that cannot be decoded is not this office's key. Refusing the request over a
      // malformed cookie would turn a browser quirk into an outage, so it simply proves nothing.
      return undefined
    }
  }
  return undefined
}
/**
 * WHERE A DISPATCHED RUN STANDS, for every word RUN_STATES in lib/agents.ts holds, so a new word is a
 * type error here and not a silent guess. A queued run and a declined one wait for a worker: the key
 * stays live for it (src/server/lib/dispatched-agent-keys.ts).
 */
export const WHERE_A_DISPATCHED_RUN_STANDS: Record<RunState, KeyRunState> = {
  queued: 'waiting',
  declined: 'waiting',
  claimed: 'not-ended',
  running: 'not-ended',
  finished: 'ended',
  failed: 'ended',
  crashed: 'ended',
  withdrawn: 'ended',
}
