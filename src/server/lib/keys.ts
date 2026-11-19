// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE OFFICE'S KEYS, MADE AT FIRST RUN AND KEPT BESIDE THE DATABASE. Criterion P83, point 1.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * The office makes two secrets the first time it runs: the PERSON'S key and the OFFICE'S OWN key.
 * Each is 32 random bytes, and they live together in one file in the directory the database is in.
 * The path is worked out in src/config/settings.mjs from the database path and nowhere else; this
 * file never reads `.env` and never reads a `MOLE_OFFICE_` setting itself.
 *
 * The person's key is what makes a request the person. The office's key is what the office's own
 * processes (the message worker, the inspector's tool) hold; it is proof that a request came from
 * the office and it does NOT make its holder the person.
 *
 * An agent's key is never stored here. Only its SHA-256 is kept, in the `held_keys` table, so the
 * value itself exists only with the agent that holds it.
 *
 * ---------------------------------------------------------------------------------------
 * COMPARISON IS CONSTANT TIME, AND WHY THAT IS NOT A STYLE CHOICE
 * ---------------------------------------------------------------------------------------
 *
 * A key compared with `===` leaks its prefix by timing: the comparison stops at the first byte that
 * differs, so an attacker who can time the reply can recover the key one byte at a time. The
 * repository used `crypto.timingSafeEqual` nowhere before this file. `keysMatch` below hashes both
 * sides and compares the 32-byte digests with it, which is also why a presented value of any length
 * cannot make it throw.
 *
 * ---------------------------------------------------------------------------------------
 * ON WINDOWS, AN ACCESS LIST IN PLACE OF THE MODE
 * ---------------------------------------------------------------------------------------
 *
 * On Linux and the Mac the file is made mode 600 — the owner may read and write it and nobody else
 * may do either. Windows has no such mode, and `writeFileSync`'s `mode` is ignored there. So on
 * Windows the file is made empty beside its place, the system layer gives it an access list with
 * one entry, this user's, and reads the list back (src/config/systems/windows-private-files.mjs).
 * Only then are the keys written into it, and the file is moved into place, or linked there when it
 * is the first, which keeps its list. A list that cannot be set, or that reads back as anything
 * else, is refused in words, and no key is written. This has not been run on Windows. An
 * administrator can still read the file, as root can read a file of mode 600. Keychain or DPAPI
 * encryption would be a second step, and it needs a dependency.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROVIDER SECTION, AND WHY IT IS EMPTY ON PURPOSE
 * ---------------------------------------------------------------------------------------
 *
 * The file also carries a `providers` section, nested so a provider name can never collide with
 * `person` or `office`. It maps a provider's name to that provider's key. Cluster D's U2 is the
 * SECOND READER of this file: after P83 is on main it decides the Settings surface, how a provider
 * key is set and tested there, and every reader that may ask about one. Until then the section is
 * EMPTY ON PURPOSE and `setProviderSecret` is the only writer. Nobody may delete the section as
 * unused: a decision puts each runtime's provider keys in one
 * office-managed file beside the database, and this is that file.
 *
 * NOTHING EXPORTED HERE RETURNS A PROVIDER'S VALUE. A door may learn only WHETHER one is set —
 * `aProviderSecretIsSet` answers that with a boolean — and the value leaves only when the Settings
 * surface of U2 reads it for the person who set it.
 *
 * ---------------------------------------------------------------------------------------
 * THE VALUE IS NEVER PRINTED, LOGGED OR STORED ANYWHERE ELSE
 * ---------------------------------------------------------------------------------------
 *
 * A refusal from here names the file and never the bytes in it. `theKeyFile` is deliberately not
 * exported. ONE FUNCTION RETURNS THE VALUE, AND IT IS `makeAnAgentKey`: the office made the key a
 * moment earlier, so there is no holder to hand it to except the reply to the registration that
 * made it, and that reply is the only time it is ever shown. Every other reader answers a boolean
 * or a row id.
 */

import { MOLE_OFFICE_HANDLE, moleOfficeId } from '@shared/participants.ts'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { KEY_COOKIE, KEY_HEADER } from '../../config/key-header.mjs'
import { keysPathFrom } from '../../config/settings.mjs'
import { thisSystem, type WhatSettingTheListDid } from '../../config/systems/the-system.mjs'
import { refuseADataFolderInAWorktree } from './git-checkout.ts'
import { THE_PERSON } from '@shared/person.ts'
import { nowStamp, parseAnyStamp } from '@shared/time.ts'
import { KEY_REVOCATION_UNDO_GRACE_MS, KEY_REVOCATION_UNDO_MS } from '@shared/danger-tiers.ts'
// HOW A CALLER PROVED ITSELF. Declared in `src/shared/types.ts` so the browser can read the same
// word off a change row, and re-exported here because every server reader has looked for it beside
// the key comparison since P83 landed.
import type { HowACallerProvedItself } from '@shared/types.ts'
import type { EmbassyKey as AKeyOfAHolder, EmbassyKeyRunState as KeyRunState } from '@shared/worlds.ts'
import { sqlite } from '../db/client.ts'
// THE RUN KEY A SESSION'S RECORD OR A REVISION NAMES, in the one wording of migration 0277's indexes. SQLite finds a
// lookup by key through one of them only when it asks these same words, so they are written once, in the schema.
import { STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
// WHAT THIS PROCESS WAS TOLD ABOUT THE TEST WORLD IT IS. Criterion P84's last clause: a world
// trusts its starter's key and the secretary's key and nothing else. Read here because the key
// comparison is the one place a key is read, and this module makes no loop with that one.
import { theWorldsOwnAuthority } from './worldauthority.ts'
// WHICH AGENT A REFERENCE NAMES. Criterion I5: a key is bound to the agent's id, so a holder string
// that arrives here is resolved to an agent before a row is written or read. Two readers, because
// this file asks two different questions — `theHolderAnAgentsKeysAreKeptUnder` in
// ./held-keys-made-and-revoked.ts says which is which and why one of them may refuse while the other
// may not. That file reads the one that may refuse; this file reads the other.
import { readParticipant } from '../db/read-participant.ts'
import { theOneAgentAStringNames, type AgentIdentity } from './agent-references.ts'
// THE STAMPS A WRITER'S ROWS MAY BE STORED UNDER, its handle, its id and the old ids it alone answers to, read by the
// one rule every reader of a writer's stamp reads them by. A row the office wrote before a re-mint keeps its old id.
import { isOneOfTheStamps, theStampsOfAnAgent } from './registry-aliases/stamps.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { theKeyHolderIsTheRegisteredStarterOf } from './claims.ts'
// HOW THE CALL THAT MADE A KEY WAS PROVED. Worked out by the door that makes the key, with the
// functions of ./provedkeys.ts, and written here on the row, as a decision asks.
import type { HowAKeysMintWasProved } from './provedkeys.ts'
import type { RunState } from './agents.ts'
import { RUN_IS_OVER_STATES, theRunHasEnded } from '@shared/run-has-ended.ts'
import { theHeldKeyRowWhoseHashIs } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { theHashOfTheKeyOnThisRequest } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { keyHash } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { whatTheKeyWithThisIdIsFor } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { THE_RUN_KEY_NAMED } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { keyOn } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { oneHeader } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { whereARunStands } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { theKeyFile } from './a-provider-secret-is-set.ts'
import { alreadyRead } from './a-provider-secret-is-set.ts'
import { theKeyFilePath } from './a-provider-secret-is-set.ts'
import { theModificationTimeOf } from './a-provider-secret-is-set.ts'
import { aPrivateKeyFileBeside } from './a-provider-secret-is-set.ts'
import { THEIR_TOOL_KEY_KIND } from './how-this-request-proved-itself.ts'
import { keysMatch } from './how-this-request-proved-itself.ts'
import { heldKeyByHash } from './how-this-request-proved-itself.ts'
import { aHeldKeyThisWorldTrusts } from './how-this-request-proved-itself.ts'
import { theHandleOfTheAgentAKeyProves } from './the-handle-of-the-agent-a-key-proves.ts'

export { THEIR_TOOL_KEY_KIND } from './how-this-request-proved-itself.ts'

export { THE_RUN_KEY_NAMED } from '../db/the-key-on-this-request-was-made-for-a-run.ts'

/**
 * HOW A CALLER PROVED ITSELF. Absent means it proved nothing, and the window decides what that is
 * worth. The three words are what `actorFrom` puts on the Actor as `provedBy`.
 */
export type { HowACallerProvedItself }

/** A key that was presented and recognised, and the id it names where the key names one. */
export interface KeyProof {
  how: HowACallerProvedItself
  /**
   * The person's name for the person's key, the office's own for the office's, and for an agent's
   * key the agent's ID — criterion I5, so a name freed by a retirement proves nobody. It is a name
   * on the rows written before that criterion; their tool proof instead names the tool alone.
   * Every reader of an agent holder resolves it rather
   * than comparing it as characters.
   */
  whoseId: string
  /**
   * THE RUN WHOSE OWN KEY THIS WAS, WHEN IT PROVED ANYTHING ONLY BECAUSE IT IS A SEALED RUN'S KEY ON THAT RUN'S OWN
   * RECORD (`aSealedRunsOwnKey` below). Absent for every other proof. `patchRecord` takes nothing but that run's
   * `served` from a request it is on.
   */
  sealedRun?: string
  /**
   * THE RUN WHOSE OWN KEY THIS WAS, WHEN IT PROVED ANYTHING ONLY BECAUSE THE RUN FINISHED LESS THAN
   * `A_FINISHED_RUNS_KEY_REPORTS_ITS_END_FOR_MS` AGO AND THE REQUEST IS ONE OF THE THREE ACTS ITS END STILL NEEDS
   * (`aFinishedRunsOwnKey` below). Absent for every other proof. `patchRecord` takes nothing but that run's `usageReceipt`
   * from a request it is on (beside `served`, which `sealedRun` carries), and `createRecord` nothing but a message about
   * that run.
   */
  finishedRun?: string
  /**
   * A SUPERVISOR'S RUN KEY, ACTING FOR A RUN ITS HOLDER STARTED, as item 7 says. Present
   * only then, and `whoseId` is then the agent that run serves, not the key's holder. `holder` is the agent whose key it
   * is, `run` the run acted in, and `holdersRun` the holder's own run, whose key this is. `aRunKeysActingFor` below is
   * the rule; lib/acting-for.ts is its reader.
   */
  actingFor?: { run: string; holder: string; holdersRun: string }
}

export { RUN_IS_OVER_STATES, theRunHasEnded }

/**
 * REVOKE THE RUN KEY A SESSION RECORD CARRIES, if it carries one, and name why.
 *
 * A run the office started holds the `held_keys` row of the key it was minted under
 * `data.extra.runKeyId`. This reads that row and revokes it. It answers the row id it revoked, or
 * null because the record holds no run key — every session filed before runs were minted keys, every
 * session somebody wrote by hand, and the office's own worker session.
 *
 * ONE READER, CALLED FROM TWO PLACES: where a session's state moves to an end (`patchRecord`), and
 * the door that stops a run that will not stop (`POST /api/runtime/runs/:id/stop`), which revokes the
 * key while the run's process may still be running. The office writes the run key id onto the record
 * when it mints the key, and this file owns both ends of that fact so the id's key name is spelled once.
 */
export function revokeTheRunKeyRecordedOn(data: Record<string, unknown>, because: string): string | null {
  const id = theRunKeyIdRecordedOn(data)
  return id !== null && revokeTheKeyNamed(id, because) ? id : null
}

/** The id's field is read here by both revocation and the verdict door's reading of its standing. */
function theRunKeyIdRecordedOn(data: Record<string, unknown>): string | null {
  const extra = data['extra']
  if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) return null
  const id = (extra as Record<string, unknown>)['runKeyId']
  return typeof id === 'string' && id !== '' ? id : null
}

/** The run key's standing, live or revoked, with no credential or hash read or returned. */
export function theRunKeyRecordedOn(data: Record<string, unknown>): { revokedAt: string | null; revokedBecause: string | null } | null {
  const id = theRunKeyIdRecordedOn(data)
  if (id === null) return null
  const row = sqlite.prepare('SELECT revoked_at AS revokedAt, revoked_because AS revokedBecause FROM held_keys WHERE id = ?')
    .get(id) as { revokedAt: string | null; revokedBecause: string | null } | undefined
  return row ?? null
}

/**
 * THE REASON A RUN'S KEY ROW CARRIES WHEN THE RUN'S END REVOKED IT, in one place: `patchRecord` writes it with
 * `revokeTheRunKeyRecordedOn`, and `aFinishedRunsOwnKey` below reads it back to tell a key the run's finish revoked from
 * one revoked any other way (the owner at the Embassy, a retirement, a terminal holder's restart).
 */
export function whyARunsKeyWasRevokedAtItsEnd(runId: string, endedAs: string): string {
  return `The run ${runId} ended as ${endedAs}, so the key it was minted was revoked.`
}

/**
 * WHAT THE REGISTRATION REPLY SAYS ABOUT THE KEY IT IS ANSWERING. Criterion P83, point 5.
 *
 * ONE COPY, READ BY BOTH REGISTRATION DOORS, for the ninth invariant: a second copy of this sentence
 * in records.ts could be edited while this one stayed behind, and nothing would fail.
 */
export const THE_AGENT_KEY_IS_SHOWN_ONCE =
  'This is the only time this key is shown. Give it to the agent, which keeps it in its own notes folder or in ' +
  'the environment of its process — never in .env. Send it as x-mole-office-key on every request, reads included: ' +
  'a request carrying it is this agent and no more, and the office keeps only its SHA-256, so it cannot be ' +
  'answered a second time.'

/** The two secrets, exactly as the file holds them: lower-case hex of 32 random bytes. */
export interface KeyFile {
  person: string
  office: string
  /** Each provider's own key, by the provider's name. Empty until Cluster D's U2 sets one. */
  providers: Record<string, string>
}

export { alreadyRead } from './a-provider-secret-is-set.ts'

export { HEX_64 } from './a-provider-secret-is-set.ts'

export { whatIsWrongWithTheKeyFile } from './a-provider-secret-is-set.ts'

export { isKeyFile } from './a-provider-secret-is-set.ts'

export { theKeyFilePath } from './a-provider-secret-is-set.ts'

export { theKeyFile } from './a-provider-secret-is-set.ts'

export { theModificationTimeOf } from './a-provider-secret-is-set.ts'

export { readAgain } from './a-provider-secret-is-set.ts'

export { readOrMake } from './a-provider-secret-is-set.ts'

export { aPrivateKeyFileBeside } from './a-provider-secret-is-set.ts'

/**
 * REPLACE THE WHOLE KEY FILE, THROUGH A TEMPORARY FILE IN THE SAME DIRECTORY AND A RENAME.
 *
 * THE TEMPORARY FILE IS IN THE SAME DIRECTORY because a rename is only atomic within one
 * filesystem, and a rename is the only thing that cannot leave a half-written key file behind. It is
 * itself made private because between this write and the rename it holds BOTH secrets.
 *
 * ONE DESIGN WITH A BRANCH PER SYSTEM, which a decision asks for. The system layer
 * says which. On Linux and the Mac the temporary file is made mode 0o600, and `renameSync` over an
 * existing file is atomic there; that branch was measured. On Windows it is made empty and given an
 * access list for this user alone, read back, before the keys are written into it
 * (`aPrivateKeyFileBeside` above), and a rename within its folder keeps that list. That branch has
 * not been run on Windows. Both systems write a temporary file beside the target and rename it, so a
 * failure leaves the target as it was.
 *
 * A CLEANUP THAT CANNOT THROW. If the write or the rename fails, the temporary file is removed and
 * the original error is rethrown. A cleanup failure is swallowed on purpose: the caller must hear
 * about the write, not about the cleanup, and the leftover is named by the thrown message's own path.
 */
function writeTheKeyFileAt(path: string, contents: KeyFile): void {
  const body = `${JSON.stringify(contents, null, 2)}\n`
  const privately = thisSystem().aFileIsMadePrivate
  const temporary =
    privately.by === 'its-access-list'
      ? aPrivateKeyFileBeside(path, body, privately.set)
      : join(dirname(path), `.keys.${randomBytes(8).toString('hex')}.tmp`)
  try {
    // LINUX AND THE MAC — measured. The temporary file holds both secrets until the rename.
    if (privately.by === 'its-mode') writeFileSync(temporary, body, { mode: 0o600 })
    renameSync(temporary, path)
  } catch (err) {
    try {
      rmSync(temporary, { force: true })
    } catch {
      // The write is the error worth reporting. The temporary file is named by the path above.
    }
    throw err
  }
}

/**
 * ADD OR REPLACE ONE PROVIDER'S ENTRY, and rewrite the whole file.
 *
 * THE WHOLE FILE IS READ, ONE ENTRY IS MERGED IN, AND THE WHOLE FILE IS WRITTEN BACK. The two
 * secrets keep exactly the values they had, and every other provider entry is left alone: adding
 * one provider cannot drop another.
 *
 * THE FILE IT MERGES INTO IS THE FILE AS IT IS NOW: `theKeyFile` reads it again when it changed on disk,
 * so an entry taken out by hand stays out (problem 7MYfhEqomIRO). THE COPY IS THEN REPLACED WITH WHAT
 * WAS WRITTEN, with the time the write gave the file, so the next read does not read it again.
 *
 * AND IT WRITES NOTHING OVER A FILE CHANGED BY HAND INTO ONE THIS OFFICE COULD NOT READ (problem
 * AHyi2ht3-Zqb): merging into the copy it kept would put the old file back and lose whatever the hand
 * edit was for, without a word. It refuses instead, and says how to set it right; the refusal names the
 * file and never its contents.
 *
 * NOTHING HERE RETURNS THE VALUE. A caller that sets a provider key learns only that the write
 * happened or what the refusal was, and `aProviderSecretIsSet` is the only question a door may ask.
 */
export function setProviderSecret(provider: string, value: string): void {
  const name = provider.trim()
  if (name === '') {
    throw new Error('A provider key needs a provider name, and an empty name was given. Nothing was written.')
  }
  const path = theKeyFilePath()
  const held = theKeyFile()
  if (alreadyRead.get(path)?.theDiskIsNotOurs === true) {
    throw new Error(
      `The key file ${path} was changed and is not a file this office writes, so no key was written into it: writing ` +
        'now would put back the file as it was before the change. Put it right, or move it aside for the office to make ' +
        'a new one when it starts, which stops every caller holding the old keys.',
    )
  }
  const next: KeyFile = {
    person: held.person,
    office: held.office,
    providers: { ...held.providers, [name]: value },
  }
  writeTheKeyFileAt(path, next)
  alreadyRead.set(path, { file: next, mtimeMs: theModificationTimeOf(path) })
}

export { aProviderSecretIsSet } from './a-provider-secret-is-set.ts'

/** Make both keys if they are not there yet. Called once at server start; safe to call more often. */
export function ensureKeysExist(): void {
  theKeyFile()
}

export { keysMatch } from './how-this-request-proved-itself.ts'

export { keyHash } from '../db/the-key-on-this-request-was-made-for-a-run.ts'

import { theHolderAnAgentsKeysAreKeptUnder } from './held-keys-made-and-revoked.ts'

export { theAgentAKeysHolderNames } from './the-handle-of-the-agent-a-key-proves.ts'

export { theHandleOfTheAgentAKeyProves } from './the-handle-of-the-agent-a-key-proves.ts'

/** One row of `held_keys`, as SQLite hands it over. */
export interface HeldKeyRow {
  /** The row's id, which a run's own record names as `data.extra.runKeyId` when the key is that run's. */
  id: string
  whose_kind: string
  whose_id: string
  key_hash: string
}

export { heldKeyByHash } from './how-this-request-proved-itself.ts'

/** One key row looked up by its hash, standing or not. The id is public; the hash is not the token. */
export interface AHeldKeyRow {
  id: string
  whoseKind: string
  whoseId: string
  revokedAt: string | null
}

export { theHeldKeyRowWhoseHashIs } from '../db/the-key-on-this-request-was-made-for-a-run.ts'

export { aHeldKeyThisWorldTrusts } from './how-this-request-proved-itself.ts'

export { oneHeader } from '../db/the-key-on-this-request-was-made-for-a-run.ts'

export { cookieValue } from '../db/the-key-on-this-request-was-made-for-a-run.ts'

export { keyOn } from '../db/the-key-on-this-request-was-made-for-a-run.ts'

export { theHashOfTheKeyOnThisRequest } from '../db/the-key-on-this-request-was-made-for-a-run.ts'

/**
 * THE SHA-256 OF A KEY IN THE KEY HEADER THAT THIS OFFICE NEVER GAVE, OR NULL. Null when the header carries no key, or
 * a key the key file holds, or a key that has a row in `held_keys`, live or revoked. A revoked key is one this office
 * gave, so it is never answered here.
 *
 * THE HEADER ONLY, NEVER THE COOKIE. A browser cannot clear a cookie the office set as HttpOnly, so a refusal of the
 * cookie would leave that browser refused on every request with nothing it could do. A waiting credential's token has
 * no row here either; lib/keyheader.ts asks the credentials for it, because lib/visitors.ts imports this file.
 */
export function theHashOfAHeaderKeyNoKeyFileOrRowHolds(req: FastifyRequest): string | null {
  const presented = oneHeader(req.headers[KEY_HEADER])
  if (presented === undefined) return null
  const keys = theKeyFile()
  if (keysMatch(presented, keys.person) || keysMatch(presented, keys.office)) return null
  const hash = keyHash(presented)
  return theHeldKeyRowWhoseHashIs(hash) === null ? hash : null
}

/**
 * THE COOKIE THE PAIRING PAGE SETS, WHETHER IT HOLDS THE PERSON'S KEY OR A DEVICE'S TOKEN.
 *
 * It is one string in one place because the pairing press and the ask door must set the same
 * cookie: HttpOnly so page JavaScript cannot read it, SameSite strict so another site cannot make
 * this browser act as the person, Path=/ so every route receives it, a long Max-Age because "paired
 * once" means once, and no Secure because the office is reached over plain HTTP on the machine it
 * runs on.
 */
const THE_BROWSER_COOKIE_ATTRIBUTES = 'Max-Age=34560000; Path=/; HttpOnly; SameSite=Strict'

/**
 * PAIR THIS BROWSER: PUT THE PERSON'S KEY IN A COOKIE, ONCE. Criterion P83, point 2.
 *
 * ---------------------------------------------------------------------------------------
 * THE VALUE NEVER LEAVES THIS FUNCTION
 * ---------------------------------------------------------------------------------------
 *
 * The caller is the pairing door, and all it learns is that a reply now carries a cookie. The key
 * itself is read here from the file the office made at first run and written straight into the
 * header; it is never returned, never logged and never put on a record or a page. This is the same
 * rule `setProviderSecret` follows about a provider's value, and it is why the route can be a door
 * that sets a cookie without any code outside this file ever holding the person's key.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO ATTRIBUTES THE CRITERION NAMES, AND THE REST
 * ---------------------------------------------------------------------------------------
 *
 * `HttpOnly` means page JavaScript cannot read the cookie. That is the point of it: a script on a
 * page the browser later loads cannot lift the person's key, and the browser attaches it to the
 * request by itself. `SameSite=Strict` means the browser does not send it on a request started by
 * another site, so a page anywhere else cannot make this browser act as the person. Both are named
 * by P83 point 2 and both are load-bearing rather than stylistic.
 *
 * `Path=/` so every route this app calls receives it. `Max-Age` is long because "paired once" means
 * once: a session cookie would make the person pair again every time the browser restarts. There is
 * no `Secure`, because the office is reached over plain HTTP on the machine it runs on and a Secure
 * cookie would simply never be sent there.
 *
 * A COOKIE IS NOT A HEADER, and this is a convenience rather than a new identity fact: the same
 * value sent as KEY_HEADER reads identically in `howThisRequestProvedItself`. The local app holds
 * the key and sends the header; the paired browser is given this cookie.
 */
export function setThePairedBrowserCookie(reply: FastifyReply): void {
  const keys = theKeyFile()
  reply.header('set-cookie', `${KEY_COOKIE}=${encodeURIComponent(keys.person)}; ${THE_BROWSER_COOKIE_ATTRIBUTES}`)
}

/**
 * ASK TO PAIR: SET THIS BROWSER'S OWN CREDENTIAL TOKEN AS THE SAME COOKIE, AND ANSWER NO TOKEN.
 * Criterion D2, P83 point 4.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TOKEN GOES INTO THE COOKIE AND NOWHERE ELSE
 * ---------------------------------------------------------------------------------------
 *
 * A browser on a trusted machine asks for a person's-device credential. The token it is issued is
 * the key it will hold once the person confirms it, and this is where that token is installed: the
 * cookie, exactly as `setThePairedBrowserCookie` installs the person's key. The caller — the ask
 * door — learns only that a reply now carries a cookie; the value never appears in the reply, a
 * log, a record or a page. Ending the credential revokes the key the token bound, so the cookie is
 * the same one the loopback press sets and the same one the office can take back.
 *
 * ---------------------------------------------------------------------------------------
 * THE ATTRIBUTES ARE ONE DECLARATION, NOT TWO COPIES
 * ---------------------------------------------------------------------------------------
 *
 * HttpOnly, SameSite=Strict, Path=/ and the same Max-Age are named once, in
 * `THE_BROWSER_COOKIE_ATTRIBUTES` above, because the criterion says this cookie is *the same* one
 * the loopback press sets. A second hand-written attribute list is the defect this repository keeps
 * producing: somebody tightens one and the other is the one an attacker finds.
 */
export function setTheAskingBrowsersCookie(reply: FastifyReply, token: string): void {
  reply.header('set-cookie', `${KEY_COOKIE}=${encodeURIComponent(token)}; ${THE_BROWSER_COOKIE_ATTRIBUTES}`)
}

/**
 * HOW THIS REQUEST PROVED ITSELF, read from the one place a key is read or compared.
 *
 * `undefined` means the request carried no key, or carried one this office does not know. Both are
 * "nothing was proved", and this reader refuses neither. A key in the header that this office never
 * gave is refused before any door, by `refuseAKeyThisOfficeNeverGave` in lib/keyheader.ts, unless no
 * listener carried the request or the office is a test world; those two still get undefined here.
 */
export function howThisRequestProvedItself(req: FastifyRequest): KeyProof | undefined {
  const presented = keyOn(req)
  if (presented === undefined) return undefined
  const keys = theKeyFile()
  if (keysMatch(presented, keys.person)) return { how: 'the-person-key', whoseId: THE_PERSON }
  if (keysMatch(presented, keys.office)) return { how: 'the-office-key', whoseId: moleOfficeId() }
  const held = heldKeyByHash(keyHash(presented))
  // A REVOKED KEY PROVES NOTHING, BUT FOR ONE WRITE: a sealed run's own record, its served conditions (below). AND FOR
  // FIFTEEN MINUTES AFTER A FINISH, THREE ACTS OF THAT RUN'S OWN END (below). On a PATCH both may hold, and the proof
  // then carries both runs, which are the same run; `patchRecord` lets through what either allows and nothing else.
  if (held === undefined) {
    const sealed = aSealedRunsOwnKey(req, presented)
    const finished = aFinishedRunsOwnKey(req, presented)
    return finished === undefined ? sealed : { ...sealed, ...finished }
  }
  // AND IN A TEST WORLD ONLY TWO OF THE COPIED ROWS PROVE ANYTHING. Criterion P84's last clause: the
  // starter's key and the secretary's key. A key the copied table holds that is neither proves
  // nothing here, exactly as an unknown key does, so the caller falls back to the window the way a
  // keyless request does. `theHeldKeyThisWorldRefuses` is what turns it into a named refusal.
  if (!aHeldKeyThisWorldTrusts(held)) return undefined
  if (held.whose_kind === 'person' || held.whose_kind === 'person-device') {
    return { how: 'the-person-key', whoseId: held.whose_id }
  }
  if (held.whose_kind === 'office') return { how: 'the-office-key', whoseId: held.whose_id }
  // THE PERSON'S TOOL IS NEITHER THE PERSON NOR AN AGENT. Report H-forI_Vk5H7 says so
  // too. An earlier decision made the tool an agent. Its new kind must
  // therefore be read before the agent default and a run’s delegation.
  if (held.whose_kind === THEIR_TOOL_KEY_KIND) return { how: 'his-tool-key', whoseId: held.whose_id }
  // A SUPERVISOR'S RUN KEY, ACTING FOR A RUN ITS HOLDER STARTED, proves the agent that run serves (see below).
  const acts = aRunKeysActingFor === null ? null : aRunKeysActingFor(req, { id: held.id, whoseId: held.whose_id })
  if (acts !== null) {
    return { how: 'an-agent-key', whoseId: acts.agentId, actingFor: { run: acts.run, holder: held.whose_id, holdersRun: acts.holdersRun } }
  }
  return { how: 'an-agent-key', whoseId: held.whose_id }
}

/**
 * WHETHER THE KEY THIS REQUEST CARRIES IS ONE A SESSION HEADER IS TAKEN FROM AS GIVEN (problem TwH5ICyRxLVd): the
 * office's key, from its file or its row, the person's key file, and the person's own device and tool keys. A row of
 * kind `person` is not among them, though `howThisRequestProvedItself` above reads it as the person: nothing in this
 * build makes one, so where one is found it is held to the rule like any agent's key (lib/the-run-a-key-holds.ts). A
 * test world's rows count only where that world trusts them, as above.
 */
export function theKeyOnThisRequestIsTakenAsGiven(req: FastifyRequest): boolean {
  const presented = keyOn(req)
  if (presented === undefined) return false
  const keys = theKeyFile()
  if (keysMatch(presented, keys.person) || keysMatch(presented, keys.office)) return true
  const held = heldKeyByHash(keyHash(presented))
  return held !== undefined && aHeldKeyThisWorldTrusts(held) && ['office', 'person-device', THEIR_TOOL_KEY_KIND].includes(held.whose_kind)
}

/** What a run key acts for, when the rule below holds: the agent it proves, the run it acts in, and its own run. */
export interface ARunKeyActsFor {
  agentId: string
  run: string
  holdersRun: string
}

/** The reader of that rule: the request, and the key row it carries (its id and its holder). */
export type WhatARunKeyActsFor = (req: FastifyRequest, key: { id: string; whoseId: string }) => ARunKeyActsFor | null

/**
 * A SUPERVISOR'S RUN KEY ACTS FOR THE RUNS OF AGENTS IT REGISTERED AND STARTED, WHILE THOSE RUNS RUN, by item 7 of a
 * decision. It is of 29 September 2026, on problem 296sqTPPdWsQ: an in-process subagent
 * shares its supervisor's process and environment, so it could not hold a key of its own there, and wave 13q handed
 * each one its run key through a file every agent in the sandbox could read. With this, no key is put on disk: the
 * subagent sends its supervisor's run key, and names itself and its own run in the headers.
 *
 * THE RULE IS READ IN lib/acting-for.ts, not here, and handed in when the server is built (`buildApp` in
 * src/server/index.ts). It reads the run records and the registry, and those modules import this one, so this low module
 * cannot import them without a loop. Until it is handed in, as in a process that built no server, no key acts for
 * anything: the answer fails closed, and a key under another name is refused as before.
 *
 * ASKED ONLY OF A LIVE AGENT KEY THIS OFFICE TRUSTS, after the person's, the office's and the revoked keys have had their
 * answers. The reader answers null quickly when the headers name the key's own agent or no run.
 */
let aRunKeysActingFor: WhatARunKeyActsFor | null = null

/** Hand in the reader of the rule above. lib/acting-for.ts does, once, when the server is built. */
export function readWhatARunKeyActsForWith(reader: WhatARunKeyActsFor): void {
  aRunKeysActingFor = reader
}

/**
 * A SEALED RUN'S OWN KEY, ON THE ONE WRITE THAT COMES AFTER ITS SEAL. Decision oVlDVG_F8RsG of 27 September 2026
 * (on the answer to problem VJom2joVhqjM).
 *
 * A run's key is revoked in the write that ends it, and from then on it proves nobody: nothing more is written on a sealed
 * run's behalf. One write comes after the end in the normal order: the launcher's record of the conditions the run was
 * served (theServedIsWritten in tools/sandbox-start.mjs), written when the command ends, which for a run that seals itself
 * is after its seal. A round started from the host holds no other key in its container, by design, so without this its
 * served conditions were never recorded (finish.log: "the model that answered could not be recorded").
 *
 * SO A REVOKED RUN KEY STILL PROVES ITS RUN'S AGENT ON EXACTLY ONE DOOR: a PATCH of that same run's record, once the run
 * has ended, in the office and not in a test world. The proof names the run (`sealedRun`), and `patchRecord` takes
 * nothing but `served` from it. Any other request with the key proves nobody, as before. The run's own agent could write
 * `served` before its seal anyway, so this lets nothing new be written.
 *
 * READ FROM THE URL AND NEVER THE BODY: this reading runs in hooks before the body is parsed, so the body's half of the
 * rule is `patchRecord`'s (`aSealedRunWritesOnlyItsServed` in lib/records/served-doors.ts).
 */
function aSealedRunsOwnKey(req: FastifyRequest, presented: string): KeyProof | undefined {
  if (req.method !== 'PATCH') return undefined
  const runId = theRecordAPatchNames(req.url)
  if (runId === null || theWorldsOwnAuthority().inATestWorld) return undefined
  const row = theHeldKeyRowWhoseHashIs(keyHash(presented))
  if (row === null || row.revokedAt === null || row.whoseKind !== 'agent') return undefined
  const run = sqlite
    .prepare(
      "SELECT kind, json_extract(data, '$.extra.runKeyId') AS runKeyId, json_extract(data, '$.state') AS state " +
        'FROM records WHERE id = ? AND deleted_at IS NULL',
    )
    .get(runId) as { kind: string; runKeyId: unknown; state: unknown } | undefined
  if (run === undefined || run.kind !== 'session' || run.runKeyId !== row.id || !theRunHasEnded(run.state)) return undefined
  return { how: 'an-agent-key', whoseId: row.whoseId, sealedRun: runId }
}

/**
 * HOW LONG A FINISHED RUN'S OWN KEY STILL REPORTS THAT RUN'S END: 15 minutes after the finish revoked it. The coordinator's
 * agreement, message 0upwNAzS4yqT, on problem 20JhqbVS3KJ4. A supervisor or a worker seals its run, which records it
 * finished, while its own process is still running, and the sandbox helper reports the run's end with the run's key only
 * when that process exits, a few minutes later as a rule. Fifteen minutes covers that wait and leaves a dead key nothing to
 * do once it is over. It is a constant and not a setting, because widening it widens what a revoked key can do, and that
 * is a decision and not a preference.
 */
export const A_FINISHED_RUNS_KEY_REPORTS_ITS_END_FOR_MS = 15 * 60 * 1000

/**
 * A FINISHED RUN'S OWN KEY, ON THE THREE ACTS OF ITS END, FOR FIFTEEN MINUTES. The coordinator's agreement, message
 * 0upwNAzS4yqT (7 October 2026), on problem 20JhqbVS3KJ4, built beside the served-conditions exception above.
 *
 * A run's key is revoked in the write that ends it. A supervisor or a worker that seals its run records it finished while
 * its process still runs, and when the command exits the sandbox helper (finishOrCrashTheRun in tools/sandbox-start.mjs)
 * reads the run's record, stores its usage receipt, and may tell its starter how the command ended, all with the run's
 * key. Before this the office refused all three: in 134 of 256 run ends in sandboxes from 5 to 7 October the receipt was
 * not stored and the record could not be read.
 *
 * SO A REVOKED RUN KEY STILL PROVES ITS RUN'S AGENT ON EXACTLY THREE DOORS, and only for its own run:
 *   - GET /api/records/<the run>, which is a read and is decided here, from the URL;
 *   - PATCH /api/records/<the run>, whose body `patchRecord` holds to a `dataPatch` of `usageReceipt` alone
 *     (`aFinishedRunStoresOnlyItsReceipt` in lib/records.ts);
 *   - POST /api/records, whose body `createRecord` holds to a message whose `aboutRun` is the run, which is how the
 *     helper's message names it (`aFinishedRunPostsOnlyItsEndMessage` in lib/records.ts).
 * And only while all of this holds: the key's row was revoked less than `A_FINISHED_RUNS_KEY_REPORTS_ITS_END_FOR_MS` ago,
 * for the reason the run's move to `finished` writes (`whyARunsKeyWasRevokedAtItsEnd`), the run's record still says
 * finished and names this key as its own, and the office is not a test world. A key revoked any other way, a run that
 * crashed, paused or was orphaned, and every other request with the key prove nobody, as before. The run's own agent could
 * do all three before its seal, so this lets nothing new be done.
 *
 * READ FROM THE URL AND NEVER THE BODY, for the reason given on `aSealedRunsOwnKey` above.
 */
function aFinishedRunsOwnKey(req: FastifyRequest, presented: string): KeyProof | undefined {
  const onTheMessageDoor = req.method === 'POST' && (req.url.split('?')[0] ?? '') === '/api/records'
  const named = req.method === 'GET' || req.method === 'PATCH' ? theRecordAPatchNames(req.url) : null
  if ((!onTheMessageDoor && named === null) || theWorldsOwnAuthority().inATestWorld) return undefined
  const row = sqlite
    .prepare("SELECT id, whose_id, revoked_at, revoked_because FROM held_keys WHERE key_hash = ? AND whose_kind = 'agent' AND revoked_at IS NOT NULL")
    .get(keyHash(presented)) as { id: string; whose_id: string; revoked_at: string; revoked_because: string | null } | undefined
  if (row === undefined) return undefined
  const revokedAt = parseAnyStamp(row.revoked_at)?.getTime()
  if (revokedAt === undefined || Number.isNaN(revokedAt) || Date.now() - revokedAt >= A_FINISHED_RUNS_KEY_REPORTS_ITS_END_FOR_MS) return undefined
  // THE RUN IS THE ONE WHOSE RECORD NAMES THIS KEY AS ITS OWN, and it must still say finished, for the reason its finish
  // gave. Asked only inside the window, so a key long dead costs no search of the records.
  const run = sqlite
    .prepare(
      "SELECT id, json_extract(data, '$.state') AS state FROM records " +
        `WHERE kind = 'session' AND ${THE_RUN_KEY_NAMED} = ? AND deleted_at IS NULL`,
    )
    .get(row.id) as { id: string; state: unknown } | undefined
  if (run === undefined || run.state !== 'finished' || row.revoked_because !== whyARunsKeyWasRevokedAtItsEnd(run.id, 'finished')) return undefined
  // AND A READ OR A PATCH IS OF THAT RUN'S OWN RECORD. The message's door names its run in the body (lib/records.ts).
  if (named !== null && named !== run.id) return undefined
  return { how: 'an-agent-key', whoseId: row.whose_id, finishedRun: run.id }
}

/** The one record a PATCH (or, for the finished run's read, a GET) of `/api/records/<id>` names, or null for any other path. */
function theRecordAPatchNames(url: string): string | null {
  const named = /^\/api\/records\/([A-Za-z0-9_-]{1,64})$/.exec(url.split('?')[0] ?? '')
  return named === null ? null : (named[1] ?? null)
}

/**
 * THE HOLDER OF A KEY THE COPIED TABLE STILL HOLDS THAT THIS TEST WORLD REFUSES, or null.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SECOND READER AND NOT A THROW INSIDE `howThisRequestProvedItself`
 * ---------------------------------------------------------------------------------------
 *
 * `howThisRequestProvedItself` is asked on every path, including a read that only reports which
 * kind of caller it was (src/server/lib/usage.ts). A throw there would turn a bookkeeping question
 * into a refusal. So the reading stays a reading — an untrusted key proves nothing — and this
 * reader gives `actorFrom` the holder's name for the one refusal it has to write. Both use
 * `aHeldKeyThisWorldTrusts` above, so the decision is worked out once.
 *
 * IT IS NULL IN THE OFFICE, before any row is looked up, because the office is never a test world
 * and nothing about its key path may move. It is also null for a key the table does not hold: a key
 * made in the office after the copy was taken, and the office's own key, are not in the copy, so
 * they already prove nothing and the window decides, exactly as before.
 *
 * IN A WORLD THAT NAMED NOBODY, every key the table holds is refused here, because no holder can be
 * the starter or a secretary. The refusal says nobody was named, which is who may there.
 */
export function theHeldKeyThisWorldRefuses(req: FastifyRequest): { holder: string } | null {
  if (!theWorldsOwnAuthority().inATestWorld) return null
  const presented = keyOn(req)
  if (presented === undefined) return null
  const held = heldKeyByHash(keyHash(presented))
  if (held === undefined) return null
  if (aHeldKeyThisWorldTrusts(held)) return null
  // THE HOLDER IS NAMED AND NOT NUMBERED. `aWorldRefusesTheKeyHeldBy` puts this string in front of a
  // person, and criterion I5 makes `whose_id` an id — a nanoid of 12 after the mint, which names
  // nobody. The agent's handle is what a reader can act on.
  return { holder: held.whose_kind === 'agent' ? theHandleOfTheAgentAKeyProves(held.whose_id) : held.whose_id }
}

/** For a test only: let the next read of the file go back to disk. */
export function forgetTheKeysThisProcessRead(): void {
  alreadyRead.clear()
}

// ============================================================================ the keys the office holds

import { holdTheKeyWhoseHashIs } from './held-keys-made-and-revoked.ts'
export { holdTheKeyWhoseHashIs } from './held-keys-made-and-revoked.ts'

/**
 * MAKE AN AGENT'S KEY, KEEP ONLY ITS SHA-256, AND ANSWER THE VALUE ONCE. Criterion P83, point 5.
 *
 * THIS IS THE OFFICE MAKING A SECRET, not registering one it was shown. A person's-device key is the
 * token the device already held, so `holdTheKeyWhoseHashIs` is handed a hash it already knows; an
 * agent's key is 32 random bytes made here, and the value goes back to the reply to the registration
 * that made it and nowhere else. The office never stores it: the row in `held_keys` is its SHA-256,
 * so a copied, backed-up or exported database carries nothing anybody can present.
 *
 * IT IS BOUND TO THE AGENT'S ID, criterion I5, so that a name freed by a retirement carries none of
 * the key history of the agent that bore it. The id is what `howThisRequestProvedItself` hands back
 * as `whoseId` and what a later request with the key is resolved to. It is `agent` and not `office`:
 * a key made here proves that agent and no more, which is the whole of point 5. The caller may hand
 * this an id or a handle; `holdTheKeyWhoseHashIs` resolves it.
 *
 * NOTHING CHECKS WHETHER THE AGENT ALREADY HOLDS A KEY. That is the caller's question, because only
 * the caller knows whether this is the registration that made the row. Both registration doors ask
 * `aKeyWasEverHeldBy` first, so a second press answers no second key.
 */
export function makeAnAgentKey(whoseId: string, provedBy: HowAKeysMintWasProved | null): string {
  return makeARunKey(whoseId, provedBy).key
}

import { makeARunKey } from './held-keys-made-and-revoked.ts'
export { makeARunKey } from './held-keys-made-and-revoked.ts'

/**
 * THE LIVE KEY ONE OWNER HOLDS, newest first, or null because there is none.
 *
 * A revoked key is not live and is not returned. This is the reader the Embassy's revoke press uses:
 * a row with no live key draws no press, and a row with one draws a press naming the key it revokes.
 *
 * THE HOLDER IS AN ARRIVING REFERENCE HERE: a name or an id, resolved to the agent's id by
 * `theHolderAnAgentsKeysAreKeptUnder`. A caller that already holds a STORED id — the Embassy reading
 * a registry row — asks `theLiveKeyOfTheAgentWithThisId` below instead, and its note says why the
 * two are not one question.
 */
export function theLiveKeyHeldBy(whoseKind: string, whoseId: string): { id: string; madeAt: string } | null {
  return theLiveKeyKeptUnder(whoseKind, theHolderAnAgentsKeysAreKeptUnder(whoseKind, whoseId))
}

/**
 * THE LIVE KEY OF THE AGENT WHOSE ID THIS IS, resolved by exact id and by nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT `theLiveKeyHeldBy` WITH A DIFFERENT NAME
 * ---------------------------------------------------------------------------------------
 *
 * Criterion I2's first sentence: a STORED reference is always an id and resolves by exact id only;
 * an ARRIVING reference may be an id or a name and goes through the five steps. The two questions
 * give different answers the day a retired agent's name is taken by a new one, and both answers are
 * right for their own caller:
 *
 *   THE REGISTRATION DOOR HOLDS A NAME. It asks whether the agent registering as `quill` already
 *   holds a key. `quill` is also the legacy id of the retired agent that used to bear the name, and
 *   answering that agent's rows would refuse the new agent the key it has never been given. It must
 *   mean the live agent, which is what the five steps say.
 *
 *   THE EMBASSY HOLDS AN ID. It asks about the row it is drawing, whose id is `quill`. That is the
 *   retired agent and nobody else, and the five steps would refuse the string as ambiguous — which
 *   would be true of a name and is not true of the id of the very row in hand.
 *
 * ONE STRING, TWO QUESTIONS, AND THE CALLER KNOWS WHICH IT IS ASKING. A flag would hide that inside
 * an argument; two names say it out loud, which is what lib/participants.ts does with the same pair.
 */
export function theLiveKeyOfTheAgentWithThisId(agentId: string): { id: string; madeAt: string } | null {
  return theLiveKeyKeptUnder('agent', agentId)
}

/** The read itself, by the exact string a row is kept under, with the resolving already done. */
function theLiveKeyKeptUnder(whoseKind: string, whoseId: string): { id: string; madeAt: string } | null {
  const row = sqlite
    .prepare(
      'SELECT id, made_at FROM held_keys WHERE whose_kind = ? AND whose_id = ? AND revoked_at IS NULL ' +
        'ORDER BY made_at DESC, id DESC LIMIT 1',
    )
    .get(whoseKind, whoseId) as { id: string; made_at: string } | undefined
  return row === undefined ? null : { id: row.id, madeAt: row.made_at }
}

/**
 * EVERY LIVE KEY OF ONE HOLDER, EACH SAYING WHAT IT IS, oldest first. Problem yZ71bheXm-Ji.
 *
 * An agent can hold several live keys at once: its own key, and one more for each run, dispatched run
 * or world the office made a key for. The Embassy's one Revoke press used to name only the newest
 * (`theLiveKeyOfTheAgentWithThisId`), so a press meant for the agent's own key revoked a running
 * round's key instead. The citizen's page now draws one row per key, and each row's press names its
 * own key by id.
 *
 * THE HOLDER IS READ AS `theLiveKeyHeldBy` AND `theLiveKeyOfTheAgentWithThisId` READ IT: an
 * arriving reference is resolved first, a stored registry id is read by exact id.
 */
export function everyLiveKeyHeldBy(whoseKind: string, whoseId: string): AKeyOfAHolder[] {
  return everyLiveKeyKeptUnder(whoseKind, theHolderAnAgentsKeysAreKeptUnder(whoseKind, whoseId))
}

/** Every live key of the agent whose registry id this is, read by exact id. See `everyLiveKeyHeldBy`. */
export function everyLiveKeyOfTheAgentWithThisId(agentId: string): AKeyOfAHolder[] {
  return everyLiveKeyKeptUnder('agent', agentId)
}

function everyLiveKeyKeptUnder(whoseKind: string, whoseId: string): AKeyOfAHolder[] {
  const rows = sqlite
    .prepare(
      // ROWID BREAKS A TIE: made_at is to the second, and keys made in one second keep the order they were made in.
      'SELECT id, made_at, last_used_at FROM held_keys WHERE whose_kind = ? AND whose_id = ? AND revoked_at IS NULL ' +
        'ORDER BY made_at ASC, rowid ASC',
    )
    .all(whoseKind, whoseId) as { id: string; made_at: string; last_used_at: string | null }[]
  return rows.map((row) => ({ id: row.id, madeAt: row.made_at, lastUsedAt: row.last_used_at, ...whatTheKeyWithThisIdIsFor(row.id) }))
}

export { whatTheKeyWithThisIdIsFor } from '../db/the-key-on-this-request-was-made-for-a-run.ts'

export { theKeyOnThisRequestWasMadeForARun } from '../db/the-key-on-this-request-was-made-for-a-run.ts'

/** The id of the live `held_keys` row of an agent's key this request carries, or undefined where it carries none. */
export function theAgentKeyRowOnThisRequest(req: FastifyRequest): string | undefined {
  const hash = theHashOfTheKeyOnThisRequest(req)
  const row = hash === null ? null : theHeldKeyRowWhoseHashIs(hash)
  return row === null || row.whoseKind !== 'agent' || row.revokedAt !== null ? undefined : row.id
}

/**
 * WHETHER A KEY IS ITS HOLDER'S OWN AND NO RUN'S: no mint or reopen binds it to a run (`theRunThisRunKeyIsBoundTo`), and
 * none of the places that name a run's key names it (`whatTheKeyWithThisIdIsFor`). The binding is asked first, because a
 * patch may take `data.extra.runKeyId` off a run's record, and the mint's revisions stay.
 */
export function theKeyWithThisIdIsItsHoldersOwn(id: string): boolean {
  return theRunThisRunKeyIsBoundTo(id) === undefined && whatTheKeyWithThisIdIsFor(id).is === 'its-own'
}

/** The revision a run key's original mint wrote, and the first revision of the run beside it. */
type AMintRow = { record_id:string; seq:number; kind:string; op:string; data:string; actor_type:string; actor_id:string; proved_by:string|null; proved_holder:string|null; session_id:string|null; at:string }

/**
 * THE RUN A KEY'S ORIGINAL MINT BOUND IT TO, read from the mint's own revisions and never from a record's
 * `data.extra.runKeyId`, which any later patch may copy. The session door mints on a running, noninspection create,
 * and `recordTheOriginalRunKeyMint` in lib/records.ts writes the binding as the create's second revision, by the same
 * caller, at the key row's own `made_at`. So the first revision that names the key is that seq 2, beside that seq 1.
 * A terminal's open is minted the same way. Undefined where any of that does not hold.
 *
 * Two readers ask it: `theOwnRunThisRequestKeyProves` below, which then asks who minted it, and
 * `theRunThisRunKeyIsBoundTo`, which the session header's rule reads (lib/the-run-a-key-holds.ts).
 */
function theOriginalMintOf(keyId: string, whoseId: string): { run: string; seq: number; holder: AgentIdentity; mint: AMintRow; created: Record<string, unknown> } | undefined {
  const mint = sqlite.prepare(
    "SELECT record_id, seq, kind, op, data, actor_type, actor_id, proved_by, proved_holder, session_id, at " +
    `FROM revisions WHERE ${THE_RUN_KEY_NAMED} = ? ORDER BY rowid LIMIT 1`,
  ).get(keyId) as AMintRow | undefined
  if (mint === undefined || mint.seq !== 2 || mint.kind !== 'session' || mint.op !== 'update') return undefined
  const original = sqlite.prepare("SELECT data, actor_type, actor_id, proved_by, proved_holder, session_id FROM revisions WHERE record_id = ? AND seq = 1 AND kind = 'session' AND op = 'create'").get(mint.record_id) as { data:string; actor_type:string; actor_id:string; proved_by:string|null; proved_holder:string|null; session_id:string|null } | undefined
  const held = sqlite.prepare('SELECT made_at FROM held_keys WHERE id = ?').get(keyId) as { made_at:string } | undefined
  if (original === undefined || held?.made_at !== mint.at || original.actor_type !== mint.actor_type || original.actor_id !== mint.actor_id || original.proved_by !== mint.proved_by || original.proved_holder !== mint.proved_holder || original.session_id !== mint.session_id) return undefined
  const created = JSON.parse(original.data) as Record<string,unknown>, minted = JSON.parse(mint.data) as Record<string,unknown>
  const extra = created['extra'] as { purpose?:unknown; runKeyId?:unknown } | undefined
  const holder = theOneAgentAStringNames(sqlite, whoseId)
  if (created['state'] !== 'running' || extra?.purpose === 'inspection' || extra?.runKeyId !== undefined || holder === null || theAgentARunServes(created)?.id !== holder.id || theAgentARunServes(minted)?.id !== holder.id) return undefined
  return { run: mint.record_id, seq: mint.seq, holder, mint, created }
}

/**
 * THE STAMPS THE OFFICE'S OWN WRITES MAY BE STORED UNDER: its handle, its id now, and each old id it alone answers to.
 * A re-mint gives the office a new id and leaves every row it wrote before as it was, so a binding the office wrote
 * then names its old id. The two readers of the office's bindings below read them by these, and by no other agent's.
 */
function theOfficesStamps(): string[] {
  return theStampsOfAnAgent(sqlite, { id: moleOfficeId(), handle: MOLE_OFFICE_HANDLE })
}

type AReopenShape = Pick<AMintRow, 'seq' | 'kind' | 'op' | 'actor_type' | 'actor_id' | 'proved_by' | 'session_id'>

/** The metadata a genuine reopen binding must have, shared by both readers. */
function hasTheShapeOfAReopen(binding: AReopenShape, stamps: () => string[] = theOfficesStamps): boolean {
  return binding.seq >= 3 && binding.kind === 'session' && binding.op === 'update' &&
    binding.actor_type === 'system' && binding.proved_by === null && binding.session_id === null && stamps().includes(binding.actor_id)
}

/**
 * THE RUN A REOPENED TERMINAL'S NEW KEY WAS BOUND TO, read from its revisions. `replaceTheRunKeyOfAReopenedRun` in
 * lib/records.ts writes that binding as the office, at the new key's own `made_at`, in the transaction that revokes the
 * key the run named before at that same moment. So the first revision that names the key is an update of a session by
 * the office, with no key behind it, at the key's `made_at`; the revision before it names another key of the same
 * agent; and that key was revoked at that moment. A patch that names a key and revokes nothing is no binding.
 */
function theReopenBindingOf(keyId: string): { run: string; seq: number } | undefined {
  const binding = sqlite.prepare(
    "SELECT record_id, seq, kind, op, data, actor_type, actor_id, proved_by, session_id, at " +
    `FROM revisions WHERE ${THE_RUN_KEY_NAMED} = ? ORDER BY rowid LIMIT 1`,
  ).get(keyId) as Omit<AMintRow, 'proved_holder'> | undefined
  if (binding === undefined || !hasTheShapeOfAReopen(binding)) return undefined
  const held = sqlite.prepare('SELECT whose_kind, whose_id, made_at FROM held_keys WHERE id = ?').get(keyId) as { whose_kind:string; whose_id:string; made_at:string } | undefined
  if (held === undefined || held.whose_kind !== 'agent' || held.made_at !== binding.at) return undefined
  const before = sqlite.prepare("SELECT json_extract(data, '$.extra.runKeyId') AS id FROM revisions WHERE record_id = ? AND seq = ?").get(binding.record_id, binding.seq - 1) as { id:unknown } | undefined
  const replaced = typeof before?.id === 'string' && before.id !== keyId
    ? sqlite.prepare('SELECT whose_kind, whose_id, revoked_at FROM held_keys WHERE id = ?').get(before.id) as { whose_kind:string; whose_id:string; revoked_at:string|null } | undefined
    : undefined
  if (replaced === undefined || replaced.whose_kind !== 'agent' || replaced.whose_id !== held.whose_id || replaced.revoked_at !== binding.at) return undefined
  const holder = theOneAgentAStringNames(sqlite, held.whose_id)
  if (holder === null || theAgentARunServes(JSON.parse(binding.data) as Record<string,unknown>)?.id !== holder.id) return undefined
  return { run: binding.record_id, seq: binding.seq }
}

/**
 * THE RUN A RUN KEY IS BOUND TO, by its original mint or by a reopen's binding, and whether that binding is still the
 * run's newest. A reopen binds a new key to the run, and from then on the key bound before it is not the newest. Only
 * a binding read by the two readers above counts, so a patch that copies a key's id onto a record moves nothing.
 * Undefined for a key no binding names: a holder's own key, a dispatched run's, a world's.
 */
export function theRunThisRunKeyIsBoundTo(keyId: string): { run: string; newest: boolean } | undefined {
  const row = sqlite.prepare('SELECT whose_kind, whose_id FROM held_keys WHERE id = ?').get(keyId) as { whose_kind:string; whose_id:string } | undefined
  if (row === undefined || row.whose_kind !== 'agent') return undefined
  const bound = theOriginalMintOf(keyId, row.whose_id) ?? theReopenBindingOf(keyId)
  if (bound === undefined) return undefined
  // Every genuine reopen starts in this run with this metadata. Read IDs only from those rows;
  // the expression index finds later mentions too, including a copy of an older genuine reopen.
  const revisions = sqlite.prepare(
    'SELECT seq, kind, op, actor_type, actor_id, proved_by, session_id FROM revisions WHERE record_id = ?',
  ).all(bound.run) as AReopenShape[]
  const keyOf = sqlite.prepare(`SELECT ${THE_RUN_KEY_NAMED} AS id FROM revisions WHERE record_id = ? AND seq = ?`)
  const mentionedLater = sqlite.prepare(
    `SELECT 1 FROM revisions WHERE rowid IN (SELECT rowid FROM revisions WHERE ${THE_RUN_KEY_NAMED} = ?) AND record_id = ? AND seq > ? LIMIT 1`,
  )
  let officeStamps: string[] | undefined
  const stamps = () => officeStamps ??= theOfficesStamps()
  const checked = new Set<string>()
  const replaced = revisions.some((revision) => {
    if (!hasTheShapeOfAReopen(revision, stamps)) return false
    const { id } = keyOf.get(bound.run, revision.seq) as { id:unknown }
    if (typeof id !== 'string' || id === keyId || checked.has(id)) return false
    checked.add(id)
    return mentionedLater.get(id, bound.run, bound.seq) !== undefined && theReopenBindingOf(id)?.run === bound.run
  })
  return { run: bound.run, newest: !replaced }
}

/** An object and not an array: the shape each stored part below is read as before its fields are asked for. */
function isAnObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * WHETHER A STORED `{ started: { run, runKeyId } }` NAMES THIS RUN AND THIS KEY. The office writes that pair as
 * `nextRound.started` on the run a round continues, and as `workerRuns[<agent id>].started` on the supervisor's run.
 */
function theStartedNamesThisRun(value: unknown, run: string, runKeyId: string): boolean {
  if (!isAnObject(value)) return false
  const started = value['started']
  return isAnObject(started) && started['run'] === run && started['runKeyId'] === runKeyId
}

/**
 * WHETHER THE OFFICE'S START OF THIS RUN IS IN THE PARENT'S CURRENT DATA: one primary-key read of the record
 * `parentAttachment` names, and, for a next round, the previous run's record. The live office took 47 to 55 seconds on
 * 10 November 2026 in the revisions scan below, on every request carrying a run key the office minted for a next round
 * or a worker run, because that table is far larger than this correlation needs. The same office-written pair is in
 * the parent's current data, which is what this reads. It is a short cut and not a second rule: no match falls through
 * to the scan, so a run whose current data no longer names it keeps the answer the revisions gave.
 */
function theCurrentParentDataNamesThisStart(created: Record<string, unknown>, run: string, runKeyId: string): boolean {
  const parentId = created['parentAttachment']
  if (typeof parentId !== 'string' || parentId === '') return false
  const parent = sqlite.prepare('SELECT kind, data FROM records WHERE id = ? AND deleted_at IS NULL').get(parentId) as
    | { kind: string; data: string }
    | undefined
  if (parent === undefined || parent.kind !== 'session') return false
  const parentData: unknown = JSON.parse(parent.data)
  if (!isAnObject(parentData)) return false
  // A WORKER RUN: the supervisor's run keeps one entry for each worker it started, by the worker's agent id.
  const workerRuns = parentData['workerRuns']
  if (isAnObject(workerRuns) && Object.values(workerRuns).some((workerRun) => theStartedNamesThisRun(workerRun, run, runKeyId))) return true
  // A NEXT ROUND: the launcher run names the run it continues, and that run's nextRound names the round it started.
  const extra = parentData['extra']
  if (!isAnObject(extra) || extra['purpose'] !== 'round' || typeof extra['round'] !== 'string' || extra['round'] === '') return false
  if (theStartedNamesThisRun(parentData['nextRound'], run, runKeyId)) return true
  const previous = sqlite.prepare('SELECT kind, data FROM records WHERE id = ? AND deleted_at IS NULL').get(extra['round']) as
    | { kind: string; data: string }
    | undefined
  if (previous === undefined || previous.kind !== 'session') return false
  const previousData: unknown = JSON.parse(previous.data)
  return isAnObject(previousData) && theStartedNamesThisRun(previousData['nextRound'], run, runKeyId)
}

/**
 * The actual live session whose original create transaction minted this key. The normal session
 * door always mints on a proved starter's running, noninspection create, before exposing the token.
 * Its first key-row occurrence is therefore seq2 beside that seq1, by the same proved caller
 * (`theOriginalMintOf` above). Ordinary later metadata stays editable; it cannot move this authority
 * to another run. A terminal's key is bound by its open and its reopen, by the office and with no
 * proved caller, so it proves no own run here. Legacy key purpose/display readers above keep their
 * existing meaning.
 */
export function theOwnRunThisRequestKeyProves(req: FastifyRequest): string | undefined {
  const proof = howThisRequestProvedItself(req)
  if (proof?.how !== 'an-agent-key' || proof.actingFor !== undefined || proof.sealedRun !== undefined || proof.finishedRun !== undefined) return undefined
  const hash = theHashOfTheKeyOnThisRequest(req)
  const row = hash === null ? null : theHeldKeyRowWhoseHashIs(hash)
  if (row === null || row.whoseKind !== 'agent' || row.revokedAt !== null) return undefined
  const original = theOriginalMintOf(row.id, row.whoseId)
  if (original === undefined) return undefined
  const { mint, created, holder } = original
  const agent = readParticipant({ kind:'agent', id:holder.id })
  const proved = mint.proved_holder === null ? null : JSON.parse(mint.proved_holder) as { id?:string; how?:string }
  const byStarter = mint.proved_by === 'an-agent-key' && proved?.how === 'an-agent-key' && proved.id !== undefined && agent !== null && 'startedBy' in agent && theKeyHolderIsTheRegisteredStarterOf(agent, proved.id)
  // Office launchers also keep an Office-written started correlation beside the original mint, under the office's stamps.
  const office = mint.proved_by === 'the-office-key' ? theOfficesStamps() : []
  // THE PARENT'S CURRENT DATA IS ASKED BEFORE THE REVISIONS SCAN, and it is one primary-key read. The scan measured
  // 47 to 55 seconds on the live office on 10 November 2026; the same office-written pair is in the parent record.
  const officeStart = mint.proved_by === 'the-office-key' && (created['startedByMoleOffice'] === true ||
    theCurrentParentDataNamesThisStart(created, mint.record_id, row.id) ||
    sqlite.prepare(
      `SELECT 1 FROM revisions v WHERE v.kind = 'session' AND v.actor_type = 'system' AND ${isOneOfTheStamps('v.actor_id', office)} AND (` +
      "(json_extract(v.data, '$.nextRound.started.run') = ? AND json_extract(v.data, '$.nextRound.started.runKeyId') = ?) OR " +
      "EXISTS (SELECT 1 FROM json_each(v.data, '$.workerRuns') w WHERE json_extract(w.value, '$.started.run') = ? AND json_extract(w.value, '$.started.runKeyId') = ?)) LIMIT 1",
    ).get(...office, mint.record_id, row.id, mint.record_id, row.id) !== undefined)
  if (!(byStarter || (mint.proved_by === 'the-office-key' && officeStart))) return undefined
  const current = sqlite.prepare("SELECT data FROM records WHERE id = ? AND kind = 'session' AND deleted_at IS NULL").get(mint.record_id) as { data:string } | undefined
  if (current === undefined) return undefined
  const data = JSON.parse(current.data) as Record<string,unknown>
  return whereARunStands(data['state']) === 'not-ended' && theAgentARunServes(data)?.id === holder.id && (data['extra'] as { runKeyId?:unknown } | undefined)?.runKeyId === row.id ? mint.record_id : undefined
}

export { whereARunStands } from '../db/the-key-on-this-request-was-made-for-a-run.ts'

export { WHERE_A_DISPATCHED_RUN_STANDS } from '../db/the-key-on-this-request-was-made-for-a-run.ts'

/**
 * WHETHER THIS PARAMETER NAMES A KEY ROW AT ALL, revoked or live. The revoke door asks it to tell a
 * key that was already revoked (404, as before) from a string that is not a key's id: an agent's
 * name, its registry id, a credential (problem yZ71bheXm-Ji).
 */
export function aKeyRowHasThisId(id: string): boolean {
  return sqlite.prepare('SELECT 1 AS one FROM held_keys WHERE id = ?').get(id) !== undefined
}

/** The kind of holder a key row is kept under (`agent`, `person-device`), revoked or live, or null because no row has this id. */
export function theKindOfHolderOfTheKey(id: string): string | null {
  const row = sqlite.prepare('SELECT whose_kind FROM held_keys WHERE id = ?').get(id) as { whose_kind: string } | undefined
  return row?.whose_kind ?? null
}

/** One live key row, the kind of holder it is kept under, and what it is. Null because no live row has this id. */
export function theLiveKeyWithThisId(id: string): (AKeyOfAHolder & { whoseKind: string; whoseId: string }) | null {
  const row = sqlite
    .prepare('SELECT id, whose_kind, whose_id, made_at, last_used_at FROM held_keys WHERE id = ? AND revoked_at IS NULL')
    .get(id) as { id: string; whose_kind: string; whose_id: string; made_at: string; last_used_at: string | null } | undefined
  if (row === undefined) return null
  return {
    id: row.id,
    whoseKind: row.whose_kind,
    whoseId: row.whose_id,
    madeAt: row.made_at,
    lastUsedAt: row.last_used_at,
    ...whatTheKeyWithThisIdIsFor(row.id),
  }
}

/**
 * WHETHER ANY KEY WAS EVER HELD BY ONE OWNER, revoked or not.
 *
 * THE ONE-OFF PASS ASKS THIS AND NOT `theLiveKeyHeldBy`: a key the person has revoked must not be
 * issued again at the next server start, and the revoked row is the record that it was revoked. The
 * pass gives a key only where no row of any standing exists.
 *
 * AND IT IS THE AGENT'S ID THAT IS ASKED ABOUT, criterion I5. Both registration doors ask this with
 * the handle the registration named, to decide whether to answer a key. A freed name asked as a name
 * would find the retired agent's rows and the new agent would be refused the key it has never been
 * given — the key-history inheritance this criterion exists to stop, arriving as a missing key
 * rather than as a loud failure.
 */
export function aKeyWasEverHeldBy(whoseKind: string, whoseId: string): boolean {
  const row = sqlite
    .prepare('SELECT 1 AS one FROM held_keys WHERE whose_kind = ? AND whose_id = ? LIMIT 1')
    .get(whoseKind, theHolderAnAgentsKeysAreKeptUnder(whoseKind, whoseId))
  return row !== undefined
}

import { revokeTheKeyNamed } from './held-keys-made-and-revoked.ts'
export { revokeTheKeyNamed } from './held-keys-made-and-revoked.ts'

/** Only the Embassy press writes this reason. Other revocations cannot be undone here. */
export const EMBASSY_KEY_REVOCATION = 'The owner revoked it at the Embassy.'

/** Returns a refusal without writing, or null after restoring this exact Embassy revocation. */
export function undoEmbassyKeyRevocation(id: string, revokedAt: string): string | null {
  return sqlite.transaction(() => {
    const key = sqlite.prepare('SELECT * FROM held_keys WHERE id = ?').get(id) as
      { revoked_at: string | null; revoked_because: string | null; whose_kind: string; whose_id: string; key_hash: string } | undefined
    if (key === undefined || key.revoked_at === null || key.revoked_because !== EMBASSY_KEY_REVOCATION) {
      return 'Only a key revoked at the Embassy can be brought back here.'
    }
    if (key.revoked_at !== revokedAt) return 'This is not the same revocation. The key was not changed.'
    const at = parseAnyStamp(key.revoked_at)?.getTime()
    const age = at === undefined ? NaN : Date.now() - at
    if (!Number.isFinite(age) || age < 0 || age >= KEY_REVOCATION_UNDO_MS + KEY_REVOCATION_UNDO_GRACE_MS) {
      return `The ${String(KEY_REVOCATION_UNDO_MS / 1000)} seconds to undo have passed or could not be checked. The key stays revoked.`
    }
    // Ending the holder, its credential, or its run also closes the chance to restore its key.
    const retired = key.whose_kind === 'agent' && sqlite.prepare('SELECT 1 FROM agents WHERE id = ? AND retired_at IS NOT NULL').get(key.whose_id)
    const endedCredential = sqlite.prepare("SELECT 1 FROM visitor_credentials WHERE token_hash = ? AND standing = 'ended'").get(key.key_hash)
    const runs = sqlite.prepare(`SELECT data FROM records WHERE kind = 'session' AND ${THE_RUN_KEY_NAMED} = ?`).all(id) as { data: string }[]
    if (retired || endedCredential || runs.some((run) => theRunHasEnded((JSON.parse(run.data) as Record<string, unknown>)['state']))) {
      return 'The holder, credential, or run has ended. The key stays revoked.'
    }
    sqlite.prepare('UPDATE held_keys SET revoked_at = NULL, revoked_because = NULL WHERE id = ?').run(id)
    return null
  })()
}

/**
 * REVOKE THE LIVE KEY WHOSE HASH IS THIS, AND NAME WHY. Returns the id it revoked, or null because
 * there was no live key with that hash.
 *
 * THE HASH IS THE ONLY THING A CREDENTIAL KNOWS ABOUT ITS OWN KEY. Criterion D2 binds a confirmed
 * person's device by registering the SHA-256 of the token the device already holds, so ending that
 * credential has to find the key by the same hash the credential stores. `endACredential` in
 * visitors.ts is the one caller: ending a credential must kill the key it bound, or the token keeps
 * proving the person after the office has said it ended. Problem cJHoRBVT6IG8 is the measurement of
 * exactly that — 200 on the end press, and 201 on the decision the ended token wrote afterwards.
 *
 * IT DOES NOT GO THE OTHER WAY. Revoking a key does not end the credential that bound it; that is a
 * separate question and not this function's. This is the one direction the defect was in.
 */
export function revokeTheKeyWhoseHashIs(hash: string, because: string): string | null {
  const row = sqlite
    .prepare('SELECT id FROM held_keys WHERE key_hash = ? AND revoked_at IS NULL')
    .get(hash) as { id: string } | undefined
  if (row === undefined) return null
  revokeTheKeyNamed(row.id, because)
  return row.id
}

/**
 * REVOKE EVERY LIVE KEY ONE OWNER HOLDS, IN ONE ACT, AND NAME WHY. Returns how many were revoked.
 *
 * WHY EVERY AND NOT THE NEWEST. `theLiveKeyHeldBy` answers the newest live row and is what the
 * Embassy's revoke press names, but a retirement is about the owner and not about one key: a row can
 * legitimately hold more than one (the registration's key, and a key another door bound), and a
 * retirement that killed only the newest would leave the owner still able to write with an older
 * one. That is the same shape of defect this act exists to prevent — problem cJHoRBVT6IG8, where a
 * press marked one row and a second route went on proving the holder.
 *
 * IT IS THE `whose_kind` AND `whose_id` PAIR AND NOT A HASH. The retire door knows the agent's
 * handle, not its key, so it revokes by the owner it is ending. A revoked row is kept and marked,
 * never deleted, the same shape the rest of `held_keys` uses.
 *
 * THE HANDLE IT KNOWS IS RESOLVED TO THE AGENT'S ID, criterion I5, so a retirement revokes the keys
 * of the agent being retired and no others. Without that the retirement of an agent that took a
 * freed name would revoke the keys of the agent that bore the name before it.
 */
export function revokeEveryLiveKeyHeldBy(whoseKind: string, whoseId: string, because: string): number {
  const answer = sqlite
    .prepare(
      'UPDATE held_keys SET revoked_at = ?, revoked_because = ? ' +
        'WHERE whose_kind = ? AND whose_id = ? AND revoked_at IS NULL',
    )
    .run(nowStamp(), because, whoseKind, theHolderAnAgentsKeysAreKeptUnder(whoseKind, whoseId))
  return answer.changes
}

// ============================================================================ when a key was last used

/**
 * WHEN A KEY WAS LAST USED: WRITTEN AFTER THE REPLY, AT MOST ONCE A MINUTE PER KEY. Finding 83,
 * mend b2 (problem zAI2kxjbCrTd).
 *
 * ---------------------------------------------------------------------------------------
 * WHY `held_keys.last_used_at` AND NOT A READ OF `api_calls`
 * ---------------------------------------------------------------------------------------
 *
 * The page of a new-key ask shows when the agent's current key was last used, so the one who answers
 * can see whether the key the ask says is lost is in fact still being used. Measured on 26 September
 * 2026 on a 4.43-million-row copy of the `api_calls` shape: the last keyed call of an agent that has
 * none, or only old ones, took 650 ms, because the table has no index on `actor_id` and SQLite walks
 * `api_calls_at_idx` backwards through every row. That is on every read of the page, and of the
 * waiting list once per ask. `api_calls` also records the name the headers gave, not which key, and a
 * long-poll is folded into an hourly count with no key on it. Writing the column costs 4.8 µs per
 * write and reading it 2 µs, on the same machine.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE COLUMN CAN AND CANNOT SAY
 * ---------------------------------------------------------------------------------------
 *
 * It is written in `onResponse`, after the reply has been sent, so a request never waits for it. It
 * is written at most once a minute per key, so it can be up to a minute earlier than the last use.
 * Nothing wrote it before this: on 26 September 2026 none of the office's 380 rows had it. So an
 * empty column says "nobody recorded a use", and it says "never used" only for a key made after this
 * server process began recording and while no write of it has failed. `recordingSince` is that
 * moment, and a failed write turns it off for good.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ONCE-A-MINUTE MEMORY HOLDS ONLY LIVE KEYS, AND ONLY FOR A MINUTE
 * ---------------------------------------------------------------------------------------
 *
 * The process remembers when it last wrote each key's use, so it writes at most once a minute. That
 * memory is kept under the id of the `held_keys` row the presented key matched, and only for a key
 * that matched a live row. Before this it was kept under the hash of whatever the request carried,
 * and nothing was ever removed, so every made-up key a caller sent added an entry for as long as the
 * process ran (problem KJWqE5DQC5TS). Each call now also removes every entry a minute old or older.
 * So the memory holds at most one entry per live key used in the last minute, and nothing taken from
 * a key the office does not hold.
 */
const KEY_USE_IS_WRITTEN_AT_MOST_EVERY_MS = 60_000

/** When the use of each live held key was last written, in this process, by the key row's id. */
const lastWrittenAt = new Map<string, number>()

/** For a test only: how many keys the once-a-minute memory holds now. */
export function howManyKeysTheUseMemoryHolds(): number {
  return lastWrittenAt.size
}

/** When this process began recording key use, or null because it has not, or because a write failed. */
let recordingSince: string | null = null

/** True once a write of a key's use has failed, so "never used" is never said again in this process. */
let aKeyUseWentUnrecorded = false

/** Say that this process records key use from now on. `buildApp` calls it where it adds the hook. */
export function beginRecordingKeyUse(): void {
  if (recordingSince === null && !aKeyUseWentUnrecorded) recordingSince = nowStamp()
}

/**
 * RECORD THAT THE KEY ON THIS REQUEST WAS USED. Called from an `onResponse` hook, never on the request's
 * own path. A request with no key writes nothing. A key the office does not hold, or holds as revoked,
 * matches no live row, so nothing is written and nothing is remembered. The person's and the office's
 * own keys live in the key file, not in `held_keys`, so their use is not recorded here.
 */
export function recordTheUseOfTheKeyOn(req: FastifyRequest): void {
  const presented = keyOn(req)
  if (presented === undefined) return
  const at = Date.now()
  for (const [id, when] of lastWrittenAt) {
    if (at - when >= KEY_USE_IS_WRITTEN_AT_MOST_EVERY_MS) lastWrittenAt.delete(id)
  }
  try {
    const held = sqlite
      .prepare('SELECT id FROM held_keys WHERE key_hash = ? AND revoked_at IS NULL')
      .get(keyHash(presented)) as { id: string } | undefined
    if (held === undefined || lastWrittenAt.has(held.id)) return
    lastWrittenAt.set(held.id, at)
    sqlite.prepare('UPDATE held_keys SET last_used_at = ? WHERE id = ? AND revoked_at IS NULL').run(nowStamp(), held.id)
  } catch (err) {
    // A LOST WRITE IS SAID, AND "NEVER USED" IS NOT SAID AGAIN. The reply has already gone, so there is
    // nobody to refuse; the log names the failure without the key or its hash.
    aKeyUseWentUnrecorded = true
    recordingSince = null
    req.log?.error?.({ err }, 'mole-office: the use of a key was not recorded')
  }
}

/** When the live keys of one agent were last used, as far as the office recorded it. */
export interface WhenAnAgentsKeysWereUsed {
  /** How many live keys the agent holds. */
  liveKeys: number
  /** The latest recorded use of any of them, local wall clock, or null because none is recorded. */
  lastUsedAt: string | null
  /**
   * True when every live key was made while this process was recording key use, so an empty
   * `lastUsedAt` means none of them has been used. False when that cannot be said.
   */
  everyKeyWasWatched: boolean
  /** When this process began recording key use, or null because it does not record it. */
  recordingSince: string | null
}

/**
 * WHEN THE LIVE KEYS OF THE AGENT WITH THIS ID WERE LAST USED. The id is a registry id, read by exact
 * id (a STORED reference), as `theLiveKeyOfTheAgentWithThisId` reads it.
 */
export function whenTheKeysOfTheAgentWithThisIdWereUsed(agentId: string): WhenAnAgentsKeysWereUsed {
  const rows = sqlite
    .prepare(
      "SELECT made_at, last_used_at FROM held_keys WHERE whose_kind = 'agent' AND whose_id = ? AND revoked_at IS NULL",
    )
    .all(agentId) as { made_at: string; last_used_at: string | null }[]
  let lastUsedAt: string | null = null
  for (const row of rows) {
    if (row.last_used_at !== null && (lastUsedAt === null || row.last_used_at > lastUsedAt)) lastUsedAt = row.last_used_at
  }
  const since = recordingSince
  return {
    liveKeys: rows.length,
    lastUsedAt,
    everyKeyWasWatched: since !== null && rows.every((row) => row.made_at >= since),
    recordingSince: since,
  }
}
