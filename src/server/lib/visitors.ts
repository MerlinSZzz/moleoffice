// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TRUSTED VISITOR'S CREDENTIAL: issuing it, reading it, confirming it, ending it, and counting
 * what was done under it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * The store, and nothing else. Every word a person reads about a credential is in
 * src/shared/visitors.ts; the refusal on a request is in ./visitorgate.ts; the doors are in
 * src/server/api/visitors.ts. Criteria P24 to P31 of design/permissions/ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * THE TOKEN IS GENERATED HERE AND LEAVES ONCE
 * ---------------------------------------------------------------------------------------
 *
 * `issueACredential` and `issueAPersonsDeviceCredential` are the only functions in this product that return a token.
 * Each stores SHA-256 of it and hands the plain secret back exactly once, in the reply to the request that asked for
 * it. A browser's token is handed back in two halves, one in a cookie and one in the answer. There is no route that
 * reads it back, and there could not be: the office does not hold it.
 *
 * A 256-BIT SECRET FROM `randomBytes`, not a nanoid. nanoid is what ids are made of here and an id
 * is not a secret — it is drawn on pages, quoted in refusals and put in briefs. A token that looked
 * like every other id in the product would be one somebody pasted into a report one day.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * It does not decide who may confirm a credential. That is the route's, because it is a question
 * about the caller and not about the credential, and src/server/api/visitors.ts says why it is not
 * left to the role cards.
 */

import { createHash, randomBytes } from 'node:crypto'
import { anOfficeId } from './ids.ts'
import { announce } from './events.ts'

import { ASKS_TO_PAIR_ALLOWED } from '@shared/pairing.ts'
import { localStamp, nowStamp, parseStoredStamp } from '@shared/time.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import {
  A_DEVICE_ASKS_FOR_NO_CARD,
  factsThatDiffer,
  isAPersonsDeviceCredential,
  theSameMachine,
  type FactMismatch,
  type RunFacts,
  type VisitorCredential,
  type VisitorRequestRow,
  type VisitorStanding,
} from '@shared/visitors.ts'

import { sqlite } from '../db/client.ts'
// THE ROW SHAPE THE BIND ANSWERS, so the confirm press in src/server/api/visitors.ts and the
// one-off pass below read back one kind (`whoseKind`) rather than working it out twice.
import {
  holdTheKeyWhoseHashIs,
  revokeTheKeyWhoseHashIs,
  type AHeldKeyRow,
} from './keys.ts'
import { aDeviceKeyFrom, theHeldKeyRowWhoseHashIs } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import type { HowAKeysMintWasProved } from './provedkeys.ts'
import { type AgentIdentity } from './agent-references.ts'
import { everyAgentAReferenceCouldName } from '../db/agent-references.ts'
import { theWorldsOwnAuthority } from './worldauthority.ts'
import { PanelError } from './panel-error.ts'
// WHAT A COPY WRITES WHERE IT TOOK A TOKEN HASH OUT, declared once for every program that copies the file.
import { REMOVED_MARK } from '../../config/what-a-copy-must-not-carry.mjs'

/**
 * HOW LONG A CREDENTIAL LASTS WITHOUT BEING RENEWED, in days.
 *
 * NO NUMBER HAS BEEN SET. Answer 3 asks for confirmation and supervision and names no length,
 * and the design's table has `endsAt` with no value in it. Thirty days is this file's choice, said
 * out loud rather than hidden in an expression: it is long enough that a visiting agent is not asked
 * for a new credential in the middle of a piece of work, and short enough that a credential the person has
 * forgotten about stops working within a month.
 *
 * IT IS ONE NUMBER IN ONE PLACE, so a number set later is an edit here. The visitor does not choose it: a
 * caller that named its own expiry would be a caller choosing how long its own permission lasts.
 */
export const HOW_LONG_A_CREDENTIAL_LASTS_DAYS = 30

/** SHA-256 of a token, in hex. The one place the hash is computed, so a read and a write agree. */
function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** One row of `visitor_credentials`, exactly as SQLite hands it over. */
interface CredentialRow {
  id: string
  handle: string
  name: string
  role: string
  token_hash: string
  world: string | null
  machine: string | null
  machine_how: string
  conversation_path: string | null
  start_directory: string | null
  runtime: string | null
  session_record: string | null
  standing: string
  confirmed_by_kind: string | null
  confirmed_by_id: string | null
  confirmed_at: string | null
  ends_at: string
  ended_at: string | null
  ended_because: string | null
  issued_at: string
}

/** One row of `visitor_requests`, exactly as SQLite hands it over. */
interface RequestRow {
  id: string
  credential_id: string
  at: string
  method: string
  route: string
  operation: string | null
  wrote: number
  refused_because: string | null
  mismatch: string | null
}

/**
 * WHAT WAS DONE UNDER ONE CREDENTIAL, counted from the rows themselves.
 *
 * Criterion P26 asks the Embassy row for how many requests, what it wrote and how many mismatches.
 * All three are counted here, in one statement, so no number in this product is a stored copy of
 * another number.
 */
function whatWasDoneUnder(credentialId: string): {
  requests: number
  writes: number
  mismatches: number
  lastAskedAt: string | null
} {
  const counted = sqlite
    .prepare(
      'SELECT COUNT(*) AS requests, SUM(wrote) AS writes, ' +
        'SUM(CASE WHEN mismatch IS NOT NULL THEN 1 ELSE 0 END) AS mismatches, MAX(at) AS last ' +
        'FROM visitor_requests WHERE credential_id = ?',
    )
    .get(credentialId) as { requests: number; writes: number | null; mismatches: number | null; last: string | null }
  return {
    requests: counted.requests,
    writes: counted.writes ?? 0,
    mismatches: counted.mismatches ?? 0,
    lastAskedAt: counted.last,
  }
}

/** One stored row, in the shape the API hands back. It never carries the token or its hash. */
function asCredential(row: CredentialRow): VisitorCredential {
  const done = whatWasDoneUnder(row.id)
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    role: row.role,
    world: row.world,
    machine: row.machine,
    machineHow: row.machine_how,
    facts: {
      conversationPath: row.conversation_path,
      startDirectory: row.start_directory,
      runtime: row.runtime,
      machine: row.machine,
      sessionRecord: row.session_record,
    },
    standing: row.standing as VisitorStanding,
    confirmedBy:
      row.confirmed_by_id === null || row.confirmed_by_kind === null
        ? null
        : ({ kind: row.confirmed_by_kind, id: row.confirmed_by_id } as ParticipantRef),
    confirmedAt: row.confirmed_at,
    endsAt: row.ends_at,
    endedAt: row.ended_at,
    endedBecause: row.ended_because,
    issuedAt: row.issued_at,
    ...done,
    tokenRemoved: aTokenHashWasRemoved(row.token_hash),
  }
}

/**
 * WHETHER A STORED TOKEN HASH IS THE NOTE A COPY LEAVES WHERE IT TOOK THE HASH OUT. A backup, and every
 * other copy of the database, writes REMOVED_MARK and the row's id there (COLUMNS_A_COPY_CLEARS in
 * src/config/what-a-copy-must-not-carry.mjs). No token hashes to that text, so
 * nothing can arrive under such a credential, and it must bind no key.
 */
export function aTokenHashWasRemoved(stored: string): boolean {
  return stored.startsWith(REMOVED_MARK)
}

// ============================================================================ reading

/** One credential by its id, or null because nothing here holds one. */
export function credentialById(id: string): VisitorCredential | null {
  const row = sqlite.prepare('SELECT * FROM visitor_credentials WHERE id = ?').get(id) as CredentialRow | undefined
  return row === undefined ? null : asCredential(row)
}

/**
 * THE CREDENTIAL A TOKEN BELONGS TO, or null because no credential here matches it.
 *
 * THE TOKEN IS HASHED BEFORE IT IS LOOKED FOR, so a token that matches nothing is never stored, never
 * logged and never compared to anything a second time.
 */
export function credentialForToken(token: string): VisitorCredential | null {
  const row = sqlite.prepare('SELECT * FROM visitor_credentials WHERE token_hash = ?').get(hashOf(token)) as
    | CredentialRow
    | undefined
  return row === undefined ? null : asCredential(row)
}

/**
 * THE CREDENTIAL WHOSE TOKEN HASH IS THIS, or null because no credential here matches it. Criterion
 * D2, P83 point 4.
 *
 * IT TAKES A HASH AND NOT A TOKEN, which is the whole point: the pairing page is told whether the
 * browser already asked and is still waiting, and it must never be handed the token to check with.
 * `theHashOfTheKeyOnThisRequest` in keys.ts is the one reader that turns the request's own cookie
 * into this hash, and the hash is a value the office already stores in the clear.
 */
export function credentialByTokenHash(hash: string): VisitorCredential | null {
  const row = sqlite.prepare('SELECT * FROM visitor_credentials WHERE token_hash = ?').get(hash) as
    | CredentialRow
    | undefined
  return row === undefined ? null : asCredential(row)
}

/**
 * THE SHA-256 OF ONE CREDENTIAL'S TOKEN, or null because nothing here holds one.
 *
 * IT IS THE HASH AND NEVER THE TOKEN. The office never stores the token, so it cannot give it back,
 * and this is the one reading that lets a confirmed person's device become the person: the hash the
 * device's own token already matches is registered in `held_keys` through keys.ts. Criterion D2.
 */
export function tokenHashOf(id: string): string | null {
  const row = sqlite.prepare('SELECT token_hash FROM visitor_credentials WHERE id = ?').get(id) as
    | { token_hash: string }
    | undefined
  return row === undefined ? null : row.token_hash
}

/** Every credential this office holds, newest first. Criterion P26: the Embassy lists them all. */
export function everyCredential(): VisitorCredential[] {
  const rows = sqlite
    .prepare('SELECT * FROM visitor_credentials ORDER BY issued_at DESC, id DESC')
    .all() as CredentialRow[]
  return rows.map(asCredential)
}

/** Every request made under one credential, newest first. */
export function requestsUnder(credentialId: string, limit = 200): VisitorRequestRow[] {
  const rows = sqlite
    .prepare('SELECT * FROM visitor_requests WHERE credential_id = ? ORDER BY at DESC, id DESC LIMIT ?')
    .all(credentialId, limit) as RequestRow[]
  return rows.map((row) => ({
    id: row.id,
    credential: row.credential_id,
    at: row.at,
    method: row.method,
    route: row.route,
    operation: row.operation,
    wrote: row.wrote === 1,
    refusedBecause: row.refused_because,
    mismatch: row.mismatch === null ? [] : (JSON.parse(row.mismatch) as FactMismatch[]),
  }))
}

/**
 * WHETHER THIS CREDENTIAL'S MOMENT HAS PASSED, asked of the clock rather than stored.
 *
 * There is no `expired` standing, for the reason src/shared/visitors.ts gives: a fourth word would
 * be the same fact stored beside the moment it came from, free to disagree with it.
 */
export function hasRunOut(credential: Pick<VisitorCredential, 'endsAt'>, now = Date.now()): boolean {
  const ends = parseStoredStamp(credential.endsAt)
  // A STAMP THAT CANNOT BE READ IS NOT TREATED AS "STILL GOOD". Nothing writes one — `endsAt` is
  // written by this file from `localStamp` — so this can only be a row somebody edited by hand, and
  // the safe direction for a permission is to have run out.
  return ends === null || ends <= now
}

// ============================================================================ issuing

/**
 * WHY A VISITOR MAY NOT COME IN UNDER THIS HANDLE, or null. Problem z-9zXhVeAPvA.
 *
 * A confirmed credential's token is bound as an agent key, and `holdTheKeyWhoseHashIs` keeps it
 * under the agent the handle names, through `theAgentAnArrivingReferenceNames`. A credential under a
 * handle that already names an agent would therefore prove that agent: a visitor asking under an agent's handle
 * would be that agent. The design words (design/permissions/DESIGN-2026-09-08-perm-5.md, "Confirm is a
 * new server act and is sized") say such a handle is refused with the existing row named. The
 * attach they offer beside the refusal is not built.
 *
 * THE SAME READING THE KEY'S RESOLVER MAKES, `everyAgentAReferenceCouldName`, so the two cannot
 * disagree. Two of its answers name an agent before any row is written for this credential:
 *   - the live agent bearing the handle;
 *   - an agent whose id IS the handle, live or retired. The resolver would refuse the handle later
 *     with 409, after the confirm had written the standing and a row, so it is refused here first.
 * An agent that is retired and bore the handle is not one of them: the handle is free again
 * (criterion I3), and the new row the confirm writes is what the resolver answers afterwards.
 *
 * ONE ANSWER FOR BOTH DOORS. The ask door passes no credential. The confirm door passes the
 * credential, and an agent whose row already carries it is not a reason to refuse: that is the same
 * credential confirmed a second time. A person's device is never asked, because it binds a
 * `person-device` key under its own name and writes no agent row.
 */
export function whyAVisitorMayNotTakeThisHandle(
  handle: string,
  credentialId: string | null,
  nothingWasDone: string,
): string | null {
  const could = everyAgentAReferenceCouldName(sqlite, handle)
  const itsOwn = new Set(
    credentialId === null
      ? []
      : (sqlite.prepare('SELECT id FROM agents WHERE credential = ?').all(credentialId) as { id: string }[]).map(
          (one) => one.id,
        ),
  )
  const named = new Map<string, { agent: AgentIdentity; how: string }>()
  if (could.liveByHandle !== null && !itsOwn.has(could.liveByHandle.id)) {
    named.set(could.liveByHandle.id, { agent: could.liveByHandle, how: 'a live agent bears it as its handle' })
  }
  if (could.byId !== null && !itsOwn.has(could.byId.id) && !named.has(could.byId.id)) {
    named.set(could.byId.id, {
      agent: could.byId,
      how: could.byId.retired ? 'it is the id of a retired agent' : 'it is the id of a live agent',
    })
  }
  if (named.size === 0) return null
  const who = [...named.values()].map((one) => `${one.agent.name} (${one.agent.id}): ${one.how}`).join('; ')
  return (
    `The handle "${handle}" already names an agent here. ${who}. A visitor's credential is bound to the agent ` +
    `its handle names, so a credential under this handle would act as that agent. ${nothingWasDone} The ` +
    'visitor can ask again under a handle that names no agent here.'
  )
}


export interface CredentialAsked {
  handle: string
  name: string
  role: string
  world: string | null
  machine: string | null
  machineHow: string
  facts: Pick<RunFacts, 'conversationPath' | 'startDirectory' | 'runtime' | 'sessionRecord'>
}

/**
 * ISSUE ONE CREDENTIAL, PENDING, AND HAND THE TOKEN BACK ONCE. Criterion P24.
 *
 * It is `pending` whatever else is true, because the person must confirm it, and a credential that
 * arrived usable would mean the confirmation decided nothing. `registerACitizenOfAKnownWorld` is the
 * one path that skips it, and it is a different function for that reason: criterion P30's exception
 * is about a world having vouched, and burying it as a branch here would make "is a confirmation
 * needed" a question answered inside the function that issues.
 */
export function issueACredential(asked: CredentialAsked): { credential: VisitorCredential; token: string } {
  const now = new Date()
  const ends = new Date(now.getTime() + HOW_LONG_A_CREDENTIAL_LASTS_DAYS * 24 * 60 * 60 * 1000)
  return writeACredential(asked, { standing: 'pending', confirmedBy: null, at: now, endsAt: ends })
}

/**
 * A PERSON'S DEVICE ASKS UNDER ITS OWN NAME AND FOR NO CARD. Criterion D2, P83 point 4.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS AS WELL AS `issueACredential`
 * ---------------------------------------------------------------------------------------
 *
 * There are three doors a browser's credential can come from — the credential flow's device ask
 * (`POST /api/office/visitors` with `{"device": …}`), the pairing page's own ask
 * (`POST /api/office/pairing/ask`) and the pairing press (`POST /api/office/pairing`) — and they must
 * issue the SAME credential. `issueACredential` is the one issuing path; this is the one place the
 * device's shape is filled in, so the role, the absent world and the four empty run facts cannot
 * drift between the doors. Invariant 9: one fact worked out in one place.
 *
 * A DEVICE NAMES NO RUN AND NO WORLD. It has no handle it chose and no role card, so the empty word
 * `A_DEVICE_ASKS_FOR_NO_CARD` is what marks it, and `isAPersonsDeviceCredential` reads that mark at
 * the confirm. The machine it asked from is measured by the door, never read from the body.
 */
export function issueAPersonsDeviceCredential(asked: {
  name: string
  machine: string | null
  machineHow: string
  runtime: string | null
}): { credential: VisitorCredential; token: string; halves: ADeviceKeyInTwoHalves } {
  // A BROWSER'S KEY IS MADE IN TWO HALVES, and the token is the key they join to (`aDeviceKeyFrom`), so the stored
  // hash is the hash of the key a request with both halves carries. The door sets the cookie half and answers the
  // header half; neither is kept here.
  const halves = { cookie: aSecret(), header: aSecret() }
  const now = new Date()
  const ends = new Date(now.getTime() + HOW_LONG_A_CREDENTIAL_LASTS_DAYS * 24 * 60 * 60 * 1000)
  const issued = writeACredential(
    {
      handle: asked.name,
      name: asked.name,
      role: A_DEVICE_ASKS_FOR_NO_CARD,
      world: null,
      machine: asked.machine,
      machineHow: asked.machineHow,
      facts: {
        conversationPath: null,
        startDirectory: null,
        runtime: asked.runtime,
        sessionRecord: null,
      },
    },
    { standing: 'pending', confirmedBy: null, at: now, endsAt: ends },
    aDeviceKeyFrom(halves.cookie, halves.header),
  )
  return { ...issued, halves }
}

/** A browser's device key in its two halves: the cookie half and the header half. */
export interface ADeviceKeyInTwoHalves {
  cookie: string
  header: string
}

/**
 * PAIR A BROWSER AS THE PERSON AT ONCE: the whole write of the pairing press on this computer.
 *
 * The press issues a person's-device credential, confirms it in the person's name and binds its key, in that order and
 * with the same three functions the ask and the confirm use, so a browser paired here is the same row and the same key
 * as one confirmed at the Embassy. It hands back the credential and the two halves; the caller sets the cookie half and
 * answers the header half, and nothing here keeps either. `provedBy` is how the press that asked was proved, for the
 * key's row.
 */
export function pairABrowserAsThePerson(
  asked: { name: string; machine: string | null; machineHow: string; runtime: string | null },
  confirmedBy: ParticipantRef,
  provedBy: HowAKeysMintWasProved | null,
): { credential: VisitorCredential; halves: ADeviceKeyInTwoHalves } {
  const issued = issueAPersonsDeviceCredential(asked)
  const credential = confirmACredential(issued.credential.id, confirmedBy)
  theKeyOneConfirmedCredentialBinds(credential, provedBy)
  return { credential, halves: issued.halves }
}

/**
 * 256 BITS FROM THE OPERATING SYSTEM'S OWN GENERATOR, in base64url. See this file's header for why it is not a nanoid:
 * an id here is public, and a secret that looked like one would be pasted into a report.
 */
function aSecret(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * THE KNOCKS ONE ADDRESS HAS MADE, in the server's memory and nowhere else. It is read only by the bound below, which
 * bounds a live flood; a restart begins the count again. The office keeps no new row for a knock, because the credential
 * it asks for is the record, and a refused one writes nothing.
 */
const knocksByAddress = new Map<string, number[]>()

/**
 * REFUSE A KNOCK FROM ONE ADDRESS BEYOND ITS BOUND. The decision of 9 November 2026 lets a browser the office does
 * not trust knock; a knock makes a request the person has to read, so one address may ask `ASKS_TO_PAIR_ALLOWED.most`
 * times in the window and the next is refused with 429. The refusal says how long to wait, and nothing is written: no
 * credential row and no cookie. The count is kept in memory, so a restart forgets it.
 */
export function refuseIfThisMachineKnockedTooOften(address: string, now: number = Date.now()): void {
  const windowMs = ASKS_TO_PAIR_ALLOWED.minutes * 60_000
  const since = now - windowMs
  const kept = (knocksByAddress.get(address) ?? []).filter((at) => at > since)
  if (kept.length >= ASKS_TO_PAIR_ALLOWED.most) {
    const retryAfterSeconds = Math.max(1, Math.ceil((kept[0]! + windowMs - now) / 1000))
    knocksByAddress.set(address, kept)
    throw new PanelError(
      `This machine asked to be paired ${String(kept.length)} times in the last ${String(ASKS_TO_PAIR_ALLOWED.minutes)} ` +
        `minutes, and it may ask ${String(ASKS_TO_PAIR_ALLOWED.most)} times. Try again in ${String(retryAfterSeconds)} ` +
        'seconds. Nothing was asked.',
      429,
    )
  }
  kept.push(now)
  knocksByAddress.set(address, kept)
}

/**
 * ISSUE ONE CREDENTIAL ALREADY TRUSTED, BECAUSE A WORLD THE SAME PERSON OWNS VOUCHED FOR IT.
 * Criterion P30.
 *
 * Answer 3: once the other machine runs a Mole Office with a world, its agents are citizens of
 * that world — because the same person logs in to each of those worlds — and register with no confirmation. The confirmation
 * existed because there was no world to vouch for the agent. Once there is one, it is the world that vouches, and `confirmedBy` names that
 * world's declared owner rather than a person who pressed anything — because nobody pressed anything,
 * and writing the person's name there as though they had would be the first invariant broken in a stored field.
 */
export function registerACitizenOfAKnownWorld(
  asked: CredentialAsked & { world: string },
  vouchedForBy: ParticipantRef | null,
): { credential: VisitorCredential; token: string } {
  const now = new Date()
  const ends = new Date(now.getTime() + HOW_LONG_A_CREDENTIAL_LASTS_DAYS * 24 * 60 * 60 * 1000)
  return writeACredential(asked, { standing: 'trusted', confirmedBy: vouchedForBy, at: now, endsAt: ends })
}

function writeACredential(
  asked: CredentialAsked,
  how: { standing: VisitorStanding; confirmedBy: ParticipantRef | null; at: Date; endsAt: Date },
  token: string = aSecret(),
): { credential: VisitorCredential; token: string } {
  const handle = asked.handle.trim()
  if (handle === '') throw new PanelError('A credential is issued to a handle, and this request named none.', 400)
  const id = anOfficeId()
  const at = localStamp(how.at)
  sqlite
    .prepare(
      'INSERT INTO visitor_credentials (id, handle, name, role, token_hash, world, machine, machine_how, ' +
        'conversation_path, start_directory, runtime, session_record, standing, confirmed_by_kind, ' +
        'confirmed_by_id, confirmed_at, ends_at, ended_at, ended_because, issued_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)',
    )
    .run(
      id,
      handle,
      asked.name.trim() === '' ? handle : asked.name.trim(),
      asked.role,
      hashOf(token),
      asked.world,
      asked.machine,
      asked.machineHow,
      blankIsAbsence(asked.facts.conversationPath),
      blankIsAbsence(asked.facts.startDirectory),
      blankIsAbsence(asked.facts.runtime),
      blankIsAbsence(asked.facts.sessionRecord),
      how.standing,
      how.confirmedBy?.kind ?? null,
      how.confirmedBy?.id ?? null,
      how.confirmedBy === null ? null : at,
      localStamp(how.endsAt),
      at,
    )
  const written = credentialById(id)
  if (written === null) throw new PanelError('The credential was issued and could not be read back.', 500)
  // A PENDING CREDENTIAL WAITS ON THE PERSON; a trusted one waits on nobody, so only the first is announced.
  if (written.standing === 'pending') tellThePages()
  return { credential: written, token }
}

/**
 * TELL EVERY OPEN PAGE THAT THE LIST OF WHAT WAITS ON THE PERSON CHANGED.
 *
 * Every pending credential is a row of that list (src/server/lib/waiting.ts), and Home draws a waiting browser's ask at
 * its top. An open page reads the list again at once only on this event, so without it an ask reached Home at its
 * minute's re-read, and a press elsewhere left the answered ask on Home as long.
 */
function tellThePages(): void {
  announce({ name: 'list.changed', workspaceId: null, lists: ['needsYou'], about: null, groupId: null, because: 'A pairing request was asked, confirmed or ended.' })
}

/** A blank string is nobody having said, which is what NULL means in every column here. */
function blankIsAbsence(said: string | null | undefined): string | null {
  const trimmed = (said ?? '').trim()
  return trimmed === '' ? null : trimmed
}


// ============================================================================ confirming and ending

/**
 * THE PERSON CONFIRMS IT. Criterion P25's second half: after the person confirms, the same request is accepted.
 *
 * A CREDENTIAL ALREADY ENDED IS NOT CONFIRMED BACK INTO LIFE. Ending is the person's act and undoing it by
 * pressing the other button would make the two presses one toggle, which is not what "end it" means.
 * A visitor whose credential the person ended asks for a new one.
 */
export function confirmACredential(id: string, by: ParticipantRef): VisitorCredential {
  const credential = credentialById(id)
  if (credential === null) throw new PanelError(`No credential here has the id "${id}". Nothing was done.`, 404)
  if (credential.standing === 'ended') {
    throw new PanelError(
      `The credential "${credential.handle}" (${id}) was ended` +
        (credential.endedAt === null ? '' : ` at ${credential.endedAt}`) +
        ', and an ended credential is not confirmed back into use. Nothing was done. Ask the visitor for a new ' +
        'credential and confirm that one.',
      409,
    )
  }
  // A CREDENTIAL WHOSE TOKEN HASH WAS LEFT OUT OF A COPY IS NOT CONFIRMED, whatever its standing:
  // no token matches it, and the key the confirm binds would be the note that stands where the hash
  // was. Refused before anything is written.
  if (credential.tokenRemoved) {
    throw new PanelError(
      `The credential "${credential.handle}" (${id}) came from a copy of the office that leaves token hashes out, ` +
        'such as a backup, so no token works under it. Nothing was done. Ask the visitor ' +
        'for a new credential and confirm that one.',
      409,
    )
  }
  if (credential.standing === 'trusted') return credential
  sqlite
    .prepare(
      'UPDATE visitor_credentials SET standing = ?, confirmed_by_kind = ?, confirmed_by_id = ?, confirmed_at = ? ' +
        'WHERE id = ?',
    )
    .run('trusted', by.kind, by.id, nowStamp(), id)
  const written = credentialById(id)
  if (written === null) throw new PanelError('The credential was confirmed and could not be read back.', 500)
  tellThePages()
  return written
}

/**
 * WHICH KEY ONE CONFIRMED CREDENTIAL HOLDS, BOUND IN ONE PLACE.
 *
 * A device credential binds a `person-device` key; every other credential binds an `agent` key.
 * In both shapes the key is the token the holder was shown once when it asked, so what is
 * registered in `held_keys` is that token's SHA-256 and no second secret has to travel. `whoseId`
 * is the handle, which is what `howThisRequestProvedItself` hands back and what a revoke press
 * names.
 *
 * ONE DECISION FOR TWO CALLERS. The confirm press in src/server/api/visitors.ts and the one-off
 * catch-up pass below this are the two places a confirmed credential could get its keys from, and
 * two copies of this working-out would be able to disagree — the ninth invariant, measured in the
 * visitor flow plan J_RIKvfdVUMn. Both call this function now, so the kind, the id and the
 * by-hash guard are decided once.
 *
 * THE GUARD IS BY THIS TOKEN'S HASH, revoked rows included (theHeldKeyRowWhoseHashIs answers a row
 * whatever its standing), so a credential whose key the person has since revoked binds nothing new,
 * and a second confirm answers the row that is already there rather than a second one.
 *
 * IT THROWS ONLY ON AN UNREADABLE ROW. A credential id present but its hash unreadable is a row
 * somebody wrote by hand, and a confirmed credential with no hash cannot hold the key it is
 * described as holding — that is a 500, not a quiet pass.
 */
export function theKeyOneConfirmedCredentialBinds(
  credential: {
    id: string
    handle: string
    role: string
  },
  /** How the confirm that binds it was proved (migration 0180), or null because nobody recorded it. */
  provedBy: HowAKeysMintWasProved | null,
): AHeldKeyRow {
  const device = isAPersonsDeviceCredential({ role: credential.role })
  const hash = tokenHashOf(credential.id)
  if (hash === null) {
    throw new PanelError('The credential was confirmed and its token hash could not be read.', 500)
  }
  if (aTokenHashWasRemoved(hash)) {
    throw new PanelError('The credential holds no token hash, because a copy of the office left it out, so it binds no key.', 500)
  }
  if (theHeldKeyRowWhoseHashIs(hash) === null) {
    holdTheKeyWhoseHashIs(device ? 'person-device' : 'agent', credential.handle, hash, provedBy)
  }
  const bound = theHeldKeyRowWhoseHashIs(hash)
  if (bound === null) {
    throw new PanelError('The credential was confirmed and the key it binds could not be read back.', 500)
  }
  return bound
}

/**
 * A CREDENTIAL ALREADY CONFIRMED WHEN THIS LANDS RECEIVES ITS KEY WITHOUT A SECOND CONFIRMATION.
 *
 * Criterion D2, on P83 point 4 and a decision. The key a device holds is the token
 * it was shown once when it asked; confirming registers that token's SHA-256 in `held_keys` through
 * keys.ts, so the device already holds it and no second secret has to travel. A credential confirmed
 * BEFORE the confirm door learned to do that would otherwise hold no key, and the person would have
 * to confirm it again — which is exactly what that decision forbids.
 *
 * IT RUNS AT FIRST START, from `start()` in src/server/index.ts, and the line it prints names every
 * key it registered so the pass is never silent. It is idempotent for the only reason that matters:
 * it asks whether a key row with this credential's OWN token hash already exists, revoked or not,
 * so a key the person has since revoked is not issued again and a second start registers nothing.
 * It returns the pairs it registered, for the caller to print; an empty list means there was nothing
 * to do, which is the ordinary second start.
 *
 * THE SAME MEND AS THE CONFIRM, problem _vd-_MXlswH5. It used to ask `aKeyWasEverHeldBy(kind, id)`,
 * which sees the FIRST credential under a device name and skips the second, leaving that second
 * token proving nothing. Reading by this credential's own token hash binds each one its own key.
 * The pass runs over credentials confirmed before the confirm door could bind, so on an installation
 * where two trusted credentials share a name the old guard lost one of them; the by-hash guard does
 * not. It is not a live defect on the owner's office — the pass has already run there — but it is the same
 * shape and the same fix, and leaving it would be the second copy of the defect the confirm just lost.
 *
 * A device credential gets a `person-device` key; every other confirmed credential got an agent key.
 * Nothing here decides the Settings surface or the agent-key piece's readers.
 *
 * ---------------------------------------------------------------------------------------
 * A TEST WORLD BINDS NOTHING HERE
 * ---------------------------------------------------------------------------------------
 *
 * A world's database is a copy of the office's. The copy's `held_keys` is emptied, but
 * `visitor_credentials` travels with every trusted credential's token hash. So this pass, run at
 * every world's start, used to put the office's visitor keys back into the world's table, a person's
 * device keys included (problem FmGa9AOxfaw1, a check of 25 September 2026). P84's amendment
 * says a world's copy carries none of the office's live key hashes, and a key bound back from a
 * copied credential is one of them. It also is not the catch-up this pass exists for: the office
 * already bound these keys, and the world emptied them on purpose.
 *
 * So in a test world this binds no key, for any credential, the starter's and the secretaries'
 * included: their keys from the office do not travel either. The credential rows stay as they were
 * copied. The visitor gate still reads them, and a credential confirmed inside the world still binds
 * its key at the confirm press, where `aHeldKeyThisWorldTrusts` in keys.ts decides whether that key
 * proves anything.
 */
export function giveAlreadyConfirmedCredentialsTheirKeysOnce(): { whoseKind: string; whoseId: string }[] {
  if (theWorldsOwnAuthority().inATestWorld) return []
  const rows = sqlite
    .prepare("SELECT id, handle, role, token_hash FROM visitor_credentials WHERE standing = 'trusted'")
    .all() as { id: string; handle: string; role: string; token_hash: string }[]
  const given: { whoseKind: string; whoseId: string }[] = []
  for (const row of rows) {
    // THE SAME GUARD IT HAS ALWAYS HAD. It asks about this credential's OWN token hash, revoked or
    // not (problem _vd-_MXlswH5), so a key the person revoked is not issued again; the pass exists
    // only for credentials confirmed before the confirm press could bind.
    if (theHeldKeyRowWhoseHashIs(row.token_hash) !== null) continue
    // A CREDENTIAL RESTORED FROM A BACKUP HOLDS NO TOKEN HASH, only the note
    // that stands where it was, so there is no key to bind. The visitor asks for a new credential.
    if (aTokenHashWasRemoved(row.token_hash)) continue
    // THE KIND AND THE ID COME FROM THE ONE BIND, not from a second copy of the same question.
    // A device credential got a `person-device` key; every other confirmed credential got an agent
    // key. Nothing here decides the Settings surface or the agent-key piece's readers.
    // HOW ITS CONFIRM WAS PROVED WAS NEVER RECORDED, so the key says nobody recorded it.
    const bound = theKeyOneConfirmedCredentialBinds(row, null)
    given.push({ whoseKind: bound.whoseKind, whoseId: bound.whoseId })
  }
  return given
}

/**
 * THE PERSON ENDS IT, IN ONE PRESS. Criterion P29.
 *
 * THE ROW IS KEPT AND MARKED; NOTHING IS DELETED, and every request made under it stays. That is the
 * same rule a world and a visit already answer to: the office does not delete the evidence of how
 * somebody got in.
 *
 * A CREDENTIAL ALREADY ENDED KEEPS THE REASON IT WAS ENDED WITH, exactly as a world already closed
 * does: the first thing to notice is the one whose reason is true.
 *
 * ENDING IT ALSO REVOKES THE KEY IT BOUND. Criterion P83 point 4 and problem cJHoRBVT6IG8: a
 * confirmed person's device became the person through the SHA-256 of its own token in `held_keys`,
 * and ending the credential only updated the credential, so the token went on proving the person.
 * The revoke below is in the same act and names the credential.
 */
export function endACredential(id: string, because: string): VisitorCredential {
  const credential = credentialById(id)
  if (credential === null) throw new PanelError(`No credential here has the id "${id}". Nothing was done.`, 404)
  if (credential.standing === 'ended') return credential
  sqlite
    .prepare('UPDATE visitor_credentials SET standing = ?, ended_at = ?, ended_because = ? WHERE id = ?')
    .run('ended', nowStamp(), because, id)
  /**
   * AND THE KEY THIS CREDENTIAL BOUND IS REVOKED IN THE SAME ACT. Criterion P83, point 4.
   *
   * WHY THIS IS HERE AND NOT LEFT OUT. A confirmed person's device binds the credential's own token
   * as its key: the SHA-256 of the token the device already holds is registered in `held_keys`
   * (`holdTheKeyWhoseHashIs` by the confirm press, and the one-off pass over credentials confirmed
   * before that press existed). Ending the credential used to update `visitor_credentials` and
   * nothing else, so the token went on proving the person — measured on 13 September 2026, problem
   * cJHoRBVT6IG8: the end press answered 200 and the office then answered 201 to a decision written
   * with the token it had just said it ended. The key arrives on a different header from the
   * credential and `heldKeyByHash` never reads the credential's standing, so the visitor gate could
   * not have caught it. Two presses existed and only one of them worked.
   *
   * THE KEY IS FOUND BY THE HASH THE CREDENTIAL ALREADY STORES, so the secret never has to be read
   * back or printed. An agent credential that holds an agent key is revoked the same way; a
   * credential that bound no key revokes nothing.
   *
   * IT IS NOT THE REVERSE. Whether revoking a key should also end the credential is a separate
   * question and not this function's.
   */
  const hash = tokenHashOf(id)
  if (hash !== null) {
    revokeTheKeyWhoseHashIs(
      hash,
      `The credential ${id} for "${credential.handle}" was ended, so the key it bound is revoked with it.`,
    )
  }
  const written = credentialById(id)
  if (written === null) throw new PanelError('The credential was ended and could not be read back.', 500)
  tellThePages()
  return written
}

/**
 * EVERY OPEN CREDENTIAL FOR ONE WORLD IS ENDED, BECAUSE THAT WORLD IS NOW REGISTERED. Criterion P30.
 *
 * *Its earlier visitor rows are kept and marked ended.* The reason is written on each row so that a
 * person reading the Embassy in a month sees why a visitor stopped being one, rather than a row that
 * simply ends.
 *
 * IT ENDS NOTHING FOR A WORLD THAT WAS ALREADY REGISTERED, because there is nothing to end: every
 * credential issued after the world was registered is already a citizen's.
 */
export function endTheVisitsOfANewlyRegisteredWorld(
  world: string,
  addresses: readonly (string | null)[] = [],
): VisitorCredential[] {
  const open = sqlite
    .prepare("SELECT * FROM visitor_credentials WHERE standing IN ('pending', 'trusted')")
    .all() as CredentialRow[]
  const its = open.filter(
    (row) => row.world === world || addresses.some((address) => theSameMachine(row.machine, address)),
  )
  return its.map((row) =>
    endACredential(
      row.id,
      `This world was registered, so its agents are citizens of it and this visitor credential is no longer how ` +
        `${row.handle} gets in.`,
    ),
  )
}

// ============================================================================ recording a request

export interface RequestUnderACredential {
  method: string
  route: string
  operation: string | null
  wrote: boolean
  refusedBecause: string | null
  mismatch: FactMismatch[]
  /**
   * Whether the machine this request came from is one the office trusts. Criterion P73.
   *
   * Null is a real answer: nobody could tell which machine it was, which is every request on the
   * loopback door. It refuses nothing — that is question Q2, and the owner's.
   */
  fromATrustedMachine: boolean | null
}

/**
 * WRITE DOWN ONE REQUEST MADE UNDER A CREDENTIAL, answered or refused.
 *
 * A REFUSED REQUEST IS RECORDED TOO, and that is the half that matters for supervision: a credential
 * the person has not confirmed yet, or has ended, still tells them that something is trying to use it.
 * Criterion P25 says nothing the pending visitor sent is stored UNDER ITS HANDLE — no record, no
 * message, no claim — and this row is not that. It is the office's own note that a refusal happened,
 * in the office's own words, holding nothing the caller wrote.
 */
export function recordARequestUnder(credentialId: string, request: RequestUnderACredential): void {
  sqlite
    .prepare(
      'INSERT INTO visitor_requests (id, credential_id, at, method, route, operation, wrote, refused_because, ' +
        'mismatch, from_a_trusted_machine) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      anOfficeId(),
      credentialId,
      nowStamp(),
      request.method,
      request.route,
      request.operation,
      request.wrote ? 1 : 0,
      request.refusedBecause,
      request.mismatch.length === 0 ? null : JSON.stringify(request.mismatch),
      // THREE ANSWERS. Null stays null: nobody could tell which machine this came from, which is not
      // the same as a machine the office does not trust. Criterion P73.
      request.fromATrustedMachine === null || request.fromATrustedMachine === undefined
        ? null
        : request.fromATrustedMachine
          ? 1
          : 0,
    )
}

/** Which of the facts a request sent differ from the ones the credential was issued with. */
export function mismatchOn(credential: VisitorCredential, sent: Partial<RunFacts>): FactMismatch[] {
  return factsThatDiffer(credential.facts, sent)
}
