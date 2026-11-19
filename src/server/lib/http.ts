// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Shared plumbing for the HTTP layer.
 *
 * "HTTP" is the request/response protocol the browser -- and any agent script with curl --
 * uses to talk to this server. A "route" is one URL pattern plus the code that answers it.
 *
 * Three things every route needs live here so that no route re-invents them:
 *
 *   1. actorFrom            -- who is making this request, taken from request headers.
 *   2. parse                -- check a body or query string, and turn a failure into a 400
 *                              with a sentence you can act on.
 *   3. installErrorHandling -- the single place that decides what an exception becomes on
 *                              the wire.
 *
 * Why the error handling is centralised: the house rule "never swallow an error and return
 * an empty successful result" only holds if there is exactly one path from exception to
 * response. With two paths, one of them eventually forgets.
 */

import { isPrivateLoginRequest } from '../../config/private-sandbox-login.mjs'
import { enWave13q } from '@shared/words/en-wave-13q.ts'
import { MOLE_OFFICE_HANDLE, moleOfficeId } from '@shared/participants.ts'
import type { IncomingMessage } from 'node:http'
// NOTHING FROM A SANDBOX IS THE PERSON: which program sent a claim to be them.
import { THEIR_OWN_PROGRAM, readWhoSentItFromThisComputer, theSenderIsReadByTheWayThatWaits, whoSentItFromThisComputer, type TheSender } from './from-a-sandbox.ts'
import { Socket } from 'node:net'

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { savedWords } from '@shared/word-settings.ts'
import { readStoredWord, type WordKey } from '@shared/i18n.ts'
import { readRefusal, PRIVATE_LOGIN_REFUSAL_CODES, type PrivateLoginRefusalCode } from '@shared/refusal-codes.ts'
import { isPurpose, operationNamed, PURPOSES, theActAGateAsksAbout, type OperationName } from '@shared/ops.ts'
import { explain } from '@shared/zod-words.ts'
import { ACTOR_HEADERS, PAGE_HEADER, WORKSPACE_HEADER } from '@shared/request-headers.ts'
import { nowSaid, SYSTEM_ACTOR_IDS_RENAMED } from '@shared/renamed-words.ts'
// WHAT PROGRAM IS WRITING. Declared in src/shared so the page that sends it and the door that reads
// it are one name and not two. Criterion M63.
import { PROGRAM_HEADER } from '@shared/messages.ts'
import { HOME_HEADER, VISIT_HEADER } from '../../config/visit-headers.mjs'
import {
  CONVERSATION_HEADER,
  CREDENTIAL_HEADER,
  START_DIRECTORY_HEADER,
} from '../../config/visitor-headers.mjs'
import { KEY_HEADER } from '../../config/key-header.mjs'
import { SEAL_READ_HEADER } from '../../config/seal-read-header.mjs'
import { ACTOR_TYPES, type ActorType, type Change, type ChangeOp, type RecordOrigin } from '@shared/types.ts'
import { DEFAULT_WORKSPACE } from '@shared/workspaces.ts'
import {
  changeOrigins,
  HUMAN,
  sameAgent,
  THE_REGISTRATION_DOORS,
  whyAnUnregisteredAgentMayNotWrite,
  type Actor,
  type Arrival,
  type PressForThePerson,
} from './records.ts'
import { PanelError } from './panel-error.ts'
import { NARROWED_BY_PERMISSION } from '@shared/disclosure.ts'
import { readWarrant } from '@shared/warrant.ts'
import { theCitedPlaceExists } from '../db/the-cited-place-exists.ts'
import { whyTheCitedPlaceMayNotBeCited } from './why-the-cited-place-may-not-be-cited.ts'
// WHETHER THIS CALLER HOLDS THE OWNER'S AUTHORITY IN A TEST WORLD. Criterion P84, rule 5 of
// chapter 8. It reads the environment and nothing else, so it makes no loop with anything here.
import { theOwnersAuthorityOf, aWorldRefusesTheKeyHeldBy } from './worldauthority.ts'
import {
  howThisRequestProvedItself,
  theHeldKeyThisWorldRefuses,
  theRunThisRunKeyIsBoundTo,
  type KeyProof,
} from './keys.ts'
import { theHandleOfTheAgentAKeyProves } from './the-handle-of-the-agent-a-key-proves.ts'
import { theKeyWindowIsClosed } from '../db/the-key-window-is-closed.ts'
import { whyThisReadNeedsARunKey, whyThisWriteNeedsARunKey } from './run-keys-only.ts'
import { theAgentKeyRowOnThisRequest, theOwnRunThisRequestKeyProves } from './keys.ts'
import { whatTheKeyMakesOfTheRunNamed } from './the-run-a-key-holds.ts'
import {
  theRefusalForARegistrationThatNamesNoAgent,
  theRefusalForARequestNobodyProved,
  theRefusalForAWriteWithNoKey,
  whatThisRequestShowed,
} from './not-proved-the-person.ts'
import { thisOfficeTrusts } from './trustedmachines.ts'
import { countARefusalItsWriteTookBack } from './gate-counts.ts'
import { nowStamp } from '@shared/time.ts'
import { sqlite } from '../db/client.ts'
import type { ChangeRow } from '../db/schema.ts'
import { theKeyProvedTheRowsOwnWriter } from './agent-references.ts'
import { parse } from './parse.ts'
import { callerAddressOf } from './caller-address-of.ts'
import { WHO_THE_SOCKET_IS } from './caller-address-of.ts'
import { arrivalOf } from '@shared/arrival-of.ts'
import { ARRIVED_FROM } from '@shared/arrival-of.ts'
import { headerValue } from './header-value.ts'
export { ACTOR_HEADERS, PAGE_HEADER, WORKSPACE_HEADER }

// ---------------------------------------------------------------------------- who is asking

/** The same three as a list, for the checks and the refusal sentence below. */
const ACTOR_HEADER_NAMES: readonly string[] = Object.values(ACTOR_HEADERS)

/** The most characters a page name may have: a route with its query, and never a paragraph. */
const MOST_PAGE_CHARACTERS = 200

/** The page the request named, or null when it named none. */
export function pageFrom(req: FastifyRequest): string | null {
  const raw = req.headers[PAGE_HEADER]
  if (raw === undefined) return null
  const value = Array.isArray(raw) ? raw.join(',') : raw
  if (value.trim() === '') {
    throw new PanelError(`${PAGE_HEADER} was sent blank. Leave it out when no page is named, or name the page, such as #/chat.`)
  }
  if (value.length > MOST_PAGE_CHARACTERS) {
    throw new PanelError(`${PAGE_HEADER} is ${String(value.length)} characters long; a page is named in at most ${String(MOST_PAGE_CHARACTERS)}.`)
  }
  return value.trim()
}

/** Whether the request named a project, rather than leaving the header reader to fall back to the default. */
export function namedAProject(req: FastifyRequest): boolean {
  return req.headers[WORKSPACE_HEADER] !== undefined
}

/**
 * WHICH PIECE OF WORK THIS REQUEST BELONGS TO, and what the caller was trying to do.
 *
 * Neither header changes a single answer this server gives. They are read so that a run's calls can
 * be counted together afterwards, which is what `api_calls` is for. They are NOT identity: sending
 * either one claims nothing about who is writing, so neither obliges a caller to send the actor
 * pair, exactly as `x-mole-office-workspace` does not.
 *
 * `x-mole-office-trace` is a name the caller picks for one stretch of work: 1 to 64 characters of
 * letters, digits, underscore and dash. The shape is checked, and the reason it is checked at all is
 * that a value nobody can read groups nothing.
 *
 * `x-mole-office-purpose` is one word from a closed list of eight. THAT LIST IS NOT WRITTEN ANYWHERE YET.
 * It belongs in `src/shared/ops.ts` beside the operation names, and the word itself is therefore not
 * judged here — see `refuseBadTraceHeaders` below, which says what that costs and what to do about
 * it. What IS refused today is the header sent present and blank, which is the rule every header in
 * this file already answers to.
 */
export const TRACE_HEADERS = {
  trace: 'x-mole-office-trace',
  purpose: 'x-mole-office-purpose',
} as const

/** The same two as a list, for the checks and the refusal sentences below. */
const TRACE_HEADER_NAMES: readonly string[] = Object.values(TRACE_HEADERS)

/**
 * THE HEADER A WARRANT USED TO TRAVEL IN. IT IS REFUSED NOW, AND THIS IS WHY.
 *
 * ---------------------------------------------------------------------------------------
 * IT COULD NOT CARRY CHINESE WORDS
 * ---------------------------------------------------------------------------------------
 *
 * An HTTP header value is a string of bytes 0 to 255. A warrant's words are often in Chinese, so
 * an `x-mole-office-warrant` header whose `words` hold a Chinese character fails in the CLIENT, before the
 * request is sent: *Cannot convert argument to a ByteString because the character at index 35 has a
 * value of 25105 which is greater than 255.* An agent following the documentation met a type error
 * with nothing in Mole Office to explain it, and nothing was logged because no request arrived.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE HEADER WENT RATHER THAN GAINING AN ENCODING
 * ---------------------------------------------------------------------------------------
 *
 * The two candidates were base64 in the header, and the body alone. The body alone is smaller and it
 * is honest: BOTH routes that take a warrant have a body and both already declare the field, so the
 * header existed only for a route with no body — and there is no such route. Building for one was
 * the sixth rule broken, and it shipped a channel that could not carry the very words it was built
 * to carry. Base64 would have kept that channel and made their sentence unreadable in a log and in a
 * `curl` line, on a mechanism whose whole point is that their words can be read.
 *
 * ---------------------------------------------------------------------------------------
 * REFUSED RATHER THAN IGNORED, AND THE NAME STAYS ON `READ_HEADER_NAMES`
 * ---------------------------------------------------------------------------------------
 *
 * A caller that sends it is told where the warrant goes instead, by `refuseTheOldWarrantHeader` below,
 * and not only on the doors that take a warrant: that function's comment says on which doors it runs
 * and on which it does not. Silently dropping it would take the governance write it was carrying and
 * make it an ordinary refused write, and the caller would look for the fault in the wrong place — the
 * same reason a blank header here was refused rather than read as absent.
 */
export const WARRANT_HEADER = 'x-mole-office-warrant'

export { CLIENT_ADDRESS_HEADER } from './caller-address-of.ts'


/**
 * Every Mole Office header a request may send, for the misspelling check below and for nothing else.
 *
 * SEPARATE FROM `ACTOR_HEADER_NAMES` ON PURPOSE. The misspelling check has to know all of them, or
 * `x-mole-office-workspace` would be refused as a misspelt actor header — it carries the product's
 * name, and so do the two trace names. The identity rules must know only three, or sending the
 * workspace alone would be read as a half-finished identity claim and refused. One list doing both
 * jobs would have to be wrong at one of them.
 *
 * Being on this list is also what makes `x-mole-office-tarce` refused rather than ignored, which is
 * the whole point of the list and the reason a new header of this product's joins it on the day it
 * is added.
 */
const READ_HEADER_NAMES: readonly string[] = [
  ...ACTOR_HEADER_NAMES,
  WORKSPACE_HEADER,
  // WHICH PAGE A MESSAGE WAS WRITTEN ON. On the list so that a near-miss is refused rather than a
  // mark silently lost.
  PAGE_HEADER,
  ...TRACE_HEADER_NAMES,
  WARRANT_HEADER,
  // WHICH WORLD THE CALLER LIVES IN, AND THE VISIT IT HOLDS. Criterion C4 of
  // design/messages/ACCEPTANCE.md section 8. They are on this list for the reason the list exists:
  // `x-mole-office-hoem` has to be refused rather than ignored, because a home that goes unread makes
  // a visitor look like a local — which is the one caller this product never checks.
  HOME_HEADER,
  VISIT_HEADER,
  // WHAT PROGRAM IS WRITING. On the list for the reason the list exists: a near-miss spelling has
  // to be refused rather than dropped, because a message that quietly lost where it was written
  // from looks exactly like one whose writer never said. Criterion M63.
  PROGRAM_HEADER,
  // A VISITING AGENT'S CREDENTIAL AND THE FACTS OF ITS RUN. Criteria P24 to P29.
  // On this list for the reason the list exists, and the stake here is the
  // highest of any of them: `x-mole-office-credentail` unread is a visitor treated as an ordinary
  // caller with no credential at all, which is the check skipped rather than failed. The two fact
  // headers matter for the same reason in the other direction — a misspelt conversation path that
  // went unread would be recorded as a mismatch on every request of a run that had done nothing
  // wrong.
  CREDENTIAL_HEADER,
  CONVERSATION_HEADER,
  START_DIRECTORY_HEADER,
  // THE PERSON'S OR AN AGENT'S KEY. Criterion P83, point 1. On this list for the reason the list
  // exists, and the stake is as high as the credential's: `x-mole-office-ky` unread is a request
  // that proved nothing while looking like one that proved itself.
  KEY_HEADER,
  // A CHECK'S READ JUST BEFORE ITS VERDICT, of a git seal from its sealed commit (src/config/seal-read-header.mjs). On
  // the list so that it is read at all: every other x-mole-office name is refused here.
  SEAL_READ_HEADER,
]

/**
 * HEADERS OTHER PROGRAMS SEND THAT `looksLikeActorHeader` BELOW MATCHES AND THAT ARE NOT OURS, named one by one. The
 * program that sends each is not a caller trying to name Mole Office's actor, session or project, and refusing its header
 * refuses every request it makes. A name goes on this list only with the program and the measurement that put it here.
 *
 *   - `x-playback-session-id`: Apple's media player (AppleCoreMedia) sends it with every request a <video> makes on an
 *     iPhone or an iPad, naming its own playback. Refused, it stopped every report video on the owner's iPhone with a 400
 *     before the file door read the file (24 September 2026, 16:12; acceptance finding 74). It is never read here.
 */
const NOT_OURS_THOUGH_IT_LOOKS_IT: readonly string[] = ['x-playback-session-id']

/**
 * Does this header name look like somebody trying to say who is writing?
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS: THE HEADER NAME WAS NEVER CHECKED, ONLY THE VALUE
 * ---------------------------------------------------------------------------------------
 *
 * `actorFrom` reads `x-mole-office-actor-type`. A request that sent an old-prefixed header instead — a real
 * misspelling, made by hand while testing this server, back when the headers began with an older one-word
 * prefix — arrived with no actor type at all, and a request with no actor type is attributed to
 * `human/<person-id>`. So dropping four characters promoted an agent to the one identity allowed to write
 * `decision` records, and nothing said a word. An unrecognised VALUE was already refused, loudly and
 * correctly. Nothing looked at the NAME, so the likelier mistake was the silent one.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND IT IS DELIBERATELY GENEROUS
 * ---------------------------------------------------------------------------------------
 *
 * A near-miss that is silently ignored is the defect, so the test for "looks like an actor header"
 * is wide and the answer to a match is a refusal naming the headers this server reads. A name
 * matches when, lowercased:
 *
 *   - it contains the product's name once every character that is not a letter or a digit has been
 *     taken out of it. That is the misspelling that keeps the name and gets the rest wrong:
 *     `x-mole-office-actor`, `x-mole-office-actorid`, `x-mole-office-agent`,
 *     `x-mole-office-actor-kind`, `x_mole_office_actor_type`, `mole-office-actor-type`,
 *     `x-mole-officesession`.
 *   - or one of its segments starts with `actor` or `session`. That is the misspelling that gets the
 *     product name wrong instead and keeps the rest: `x-mole-ofice-actor-type`, `x-actor-id`,
 *     `x-sessionid`.
 *
 * A segment is a run of letters and digits, so `user-agent` is `["user","agent"]`.
 *
 * THE FIRST RULE SQUASHES THE NAME BEFORE IT LOOKS, AND THE OLD PREFIX DID NOT NEED THAT. Until 28
 * August 2026 these headers began with an older one-word prefix, nothing inside it to get wrong, and the
 * rule was a plain `includes` of that prefix. `mole-office` has a hyphen in the middle, which is a new way
 * to get the name wrong that did not exist before: `x-moleoffice-actor-type` is the likeliest single
 * mistake a person will make typing it. A plain `includes('mole-office')` would miss it. Squashing
 * catches it, and catches `x-mole_office-actor-type` and `x-Mole.Office-actor-type` with it.
 *
 * THE OLD PREFIX IS STILL A TRIGGER, AND THAT IS DELIBERATE. Every agent that read the old skill, and
 * every script written against it, sends a header beginning with it. Three of those — the old prefixed
 * actor-type, actor-id and session names — would be caught by the second rule anyway, but the old
 * prefixed agent and projekt names would not, and being ignored means being attributed to
 * `human/<person-id>`. This is a refusal of the old name, not an alias for it: nothing reads those headers,
 * and a caller sending one is told so. It can go when no caller still sends them.
 *
 * `workspace` is a trigger on the same footing as `actor` and `session`, added when
 * `x-mole-office-workspace` did: `x-moleofice-workspace` and `x-workspace` are the two ways to name
 * the project boundary and get the product name wrong, and a request whose workspace header is
 * ignored is filed in the default project rather than the one it said.
 *
 * WHAT IS DELIBERATELY NOT A TRIGGER, and why: the word `agent` on its own. `user-agent` is sent by
 * every browser and `x-user-agent` by some clients, so triggering on it would refuse ordinary
 * requests — much worse than the defect being fixed. The cost is one gap, stated rather than papered
 * over: a header that misspells the product name AND says `agent` rather than `actor`, such as
 * `x-mole-ofice-agent`, is not caught, and would still be ignored. `x-mole-office-agent` IS caught,
 * by the first rule.
 */
function looksLikeActorHeader(name: string): boolean {
  const lower = name.toLowerCase()
  const squashed = lower.replace(/[^a-z0-9]+/g, '')
  if (squashed.includes('moleoffice') || squashed.includes('panelx')) return true
  return lower
    .split(/[^a-z0-9]+/)
    .some((part) => part.startsWith('actor') || part.startsWith('session') || part.startsWith('workspace'))
}

/**
 * Refuse a request that tried to name its writer and got the header name wrong.
 *
 * Recognition here is EXACT, not case-insensitive, and that is on purpose: `headerValue` below looks
 * each name up literally, so a name in any other spelling — including a different case — is a name
 * this server will not read. Node lowercases every header name on a real request and Fastify's
 * `inject` does the same; I measured both rather than assuming it. So a mixed-case name only reaches
 * here from a caller that built the request object itself, and for that caller the header really
 * would go unread. Treating it as recognised would put the silence straight back.
 *
 * A request carrying NO actor headers at all is not touched by this and keeps defaulting to
 * `human/<person-id>`, because that is how a person using the browser or a bare `curl` writes. That
 * default is now the ONLY thing absence buys — see `refusePartialIdentity` below.
 *
 * WHERE THIS DOES AND DOES NOT RUN, stated so nobody reads it as wider than it is: it runs inside
 * `actorFrom`, and `actorFrom` is called by every write route and by the two `/api/anchor` routes,
 * which are the only reads that need to know WHO is reading. Every other GET never calls it, so a
 * misspelt header on one of those is still ignored and a caller testing its spelling that way
 * learns nothing. That is deliberate — a read nobody is identified for is filed against nobody, so
 * there is nothing to attribute wrongly — and the first write tells the caller immediately.
 */
function refuseMisspeltActorHeaders(req: FastifyRequest): void {
  const wrong = Object.keys(req.headers)
    .filter((name) => !READ_HEADER_NAMES.includes(name) && !NOT_OURS_THOUGH_IT_LOOKS_IT.includes(name) && looksLikeActorHeader(name))
    .sort()
  if (wrong.length === 0) return
  const subject =
    wrong.length === 1
      ? `${wrong[0]} is not a header Mole Office reads, and it looks like`
      : `${wrong.join(', ')} are not headers Mole Office reads, and they look like`
  throw new PanelError(
    `${subject} an attempt to say who is writing or which project this is. The headers Mole Office reads are ` +
      `${READ_HEADER_NAMES.join(', ')}. ` +
      `This is refused rather than ignored: a write carrying none of the three identity headers is ` +
      `attributed to ${HUMAN.type}/${HUMAN.id}, so a misspelt header would have filed your work under the ` +
      `one identity allowed to write decisions.`,
  )
}

/**
 * Refuse a request that sent one of the three MORE THAN ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY: NODE JOINS REPEATS WITH ", " AND THE JOIN WAS STORED AS AN IDENTITY
 * ---------------------------------------------------------------------------------------
 *
 * Measured against a real socket on 2026-08-11, not reasoned about:
 *
 *     x-mole-office-actor-id: a
 *     x-mole-office-actor-id: b        ->  201, change row logged as `agent:a, b`
 *     x-mole-office-session: s1
 *     x-mole-office-session: s2        ->  201, change row logged under session `s1, s2`
 *
 * Nobody is called `a, b` and no run is called `s1, s2`. Two identity claims were merged into a
 * third that was never made, and the change log is permanent, so `GET /api/changes?session=s1`
 * answers "nothing is filed as that" about a run that wrote plenty. That is the blank-header damage
 * again, reached by saying something twice instead of saying nothing.
 *
 * The type header already failed loudly by luck — `agent, agent` is not in ACTOR_TYPES, so it was
 * refused as an unrecognised type, with a sentence that told the caller to fix its VALUE when what
 * was wrong was that it had been sent twice. The id and the session have no closed vocabulary to be
 * caught by, so they were stored.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS READS rawHeaders AND NOT `req.headers`
 * ---------------------------------------------------------------------------------------
 *
 * `req.headers` cannot answer the question. Node joins repeats of these names into ONE string, so
 * `a` sent twice and the single value `a, b` arrive there identically, and a check written against
 * `req.headers` would have to guess — which would mean refusing a legitimate id that happens to
 * contain a comma. `req.raw.rawHeaders` is the wire as it arrived, name and value alternating, with
 * every repeat still separate. Measured: a real socket gives `["x-mole-office-actor-id","a",
 * "x-mole-office-actor-id","b"]`, and it preserves the sender's capitalisation, which is why the names
 * are lowercased before they are counted.
 *
 * A REPEAT IS REFUSED EVEN WHEN BOTH VALUES ARE THE SAME, and that is not pedantry: Node joins
 * `a` and `a` into `a, a`, so the value that reaches the log is wrong either way.
 *
 * WHERE THIS CANNOT SEE: a request object built in-process rather than parsed off a socket has no
 * `raw`, and then there is no wire for a header to have been repeated on. That case is not guessed
 * at here; the array shape `headerValue` refuses below is the only evidence such a caller can carry,
 * and it refuses it.
 */
function refuseRepeatedActorHeaders(req: FastifyRequest): void {
  const raw = req.raw?.rawHeaders
  if (!Array.isArray(raw)) return

  const seen = new Map<string, number>()
  for (let i = 0; i < raw.length; i += 2) {
    const name = String(raw[i]).toLowerCase()
    if (READ_HEADER_NAMES.includes(name)) seen.set(name, (seen.get(name) ?? 0) + 1)
  }

  const repeated = [...seen].filter(([, count]) => count > 1).map(([name]) => name).sort()
  if (repeated.length === 0) return
  throw new PanelError(
    `${repeated.join(', ')} ${repeated.length === 1 ? 'was' : 'were'} sent more than once. Send each of ` +
      `${READ_HEADER_NAMES.join(', ')} exactly once: repeats are joined with a comma before this server sees ` +
      `them, so two claims become one identity that nobody made — "a" and "b" become the writer "a, b", and ` +
      `that name goes into a change log that is never rewritten.`,
  )
}

/**
 * Refuse the old warrant header.
 *
 * A warrant goes in the write's own body and nowhere else (chapter 4, rule 5), and the header that
 * used to carry it is refused rather than ignored. A header dropped on a door that takes no warrant
 * makes the act an ordinary one without a word, which is the silence this refusal exists to prevent.
 *
 * WHERE THIS RUNS: inside `actorFrom`, so on every door that reads its caller through it, whether or
 * not that door takes a warrant. `GET /api/office/summonses` lets the mail tool's key through without
 * `actorFrom`, so it calls this itself before it reads the key. `GET /api/restore` and
 * `GET /api/restore/:handle` read the key, or the handle in the path, and never call `actorFrom`, so
 * `theRestore` calls this itself first.
 *
 * WHERE THIS DOES NOT RUN, and why the door is safe without it:
 *   - The update press of the reduced mode (src/server/lib/the-update.ts) does not judge the header.
 *     It has its own guard: the owner's key, or this computer's own program with no key. The header
 *     changes nothing about who may press, so a caller gets nothing there by sending it.
 * Any other read that never calls `actorFrom` is not judged either, as `refuseMisspeltActorHeaders`
 * above says of itself.
 */
export function refuseTheOldWarrantHeader(req: FastifyRequest): void {
  if (headerValue(req, WARRANT_HEADER) !== undefined) {
    throw new PanelError(
      `${WARRANT_HEADER} was sent and Mole Office no longer reads it. Nothing was written. Send the warrant as a ` +
        `field of the body instead — {"warrant":{"saidBy":"…","words":"…","where":"…","when":"…","for":["…"]}} — ` +
        `which every route that takes one already accepts. The header is gone because a header value may hold ` +
        `only bytes 0 to 255, so it could not carry the owner's own sentences: they are in Chinese, and the ` +
        `request failed in the client before Mole Office ever saw it.`,
    )
  }
}

export { fromLatin1 } from './header-value.ts'

export { headerValue } from './header-value.ts'

/**
 * Read one actor header, and refuse it if it arrived present and blank.
 *
 * ---------------------------------------------------------------------------------------
 * WHY: BLANK WAS READ AS ABSENT, AND ABSENT MEANS THE HUMAN
 * ---------------------------------------------------------------------------------------
 *
 * `actorFrom` used to test each value for truthiness, and an empty string is falsy. So
 * `x-mole-office-actor-type: ` — the header sent, the value blank — took the same path as no header at
 * all and was attributed to `human`. An agent that sent its own name in `x-mole-office-actor-id` beside
 * it was filed as `human:nightly-sweep`, and all four human-only verbs on a `decision` were let
 * through. That is the misspelt-header defect again, reached through the correctly spelled header.
 *
 * A client that builds headers from variables produces this when a variable is unset, so it is the
 * likeliest mistake there is rather than an exotic one. Not every client produces it the same way,
 * and I measured the two that matter here rather than assuming:
 *
 *   - `fetch`, in the browser and in Node, sends a header whose value is an empty string exactly as
 *     written. So an unset variable in a JavaScript client arrives present and blank, and this is
 *     the reproduction in design/adversarial/authorization.md §2.
 *   - `curl -H 'name: '` does the opposite: a blank right-hand side means "delete this header" to
 *     curl, and nothing is sent. The same slip in a shell script therefore arrives as ABSENCE, not
 *     as blankness, and this function never sees it. `curl -H 'name;'` is the form that really
 *     sends the header empty, and that one is refused here.
 *
 * The shell version of the mistake used to land one door along, on a request that names itself in
 * `x-mole-office-actor-id` and has no type header at all — `human:<the agent's own name>`. That was
 * section 10 of design/DECISIONS-PENDING.md, it has been decided, and `refusePartialIdentity` below
 * is the answer.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, FOR ALL THREE HEADERS: PRESENCE IS A CLAIM, AND A BLANK CLAIM IS A BROKEN ONE
 * ---------------------------------------------------------------------------------------
 *
 * Sending a header is a caller saying "here is who I am" or "here is which run this belongs to".
 * Sending it empty says that and then says nothing, which is never what anybody means. So all three
 * are refused the same way, with the header named, and the caller is told the one shape that still
 * carries a default. What each blank header used to cost differed, and the difference is the reason
 * all three are named separately in tests/http-actor.test.ts:
 *
 *   - a blank ACTOR TYPE was the human, the one identity allowed to write decisions.
 *   - a blank ACTOR ID was the person's id — so `x-mole-office-actor-type: agent` with a blank id filed an
 *     agent's work under the person's name, which is a lie in the change log even though it is not
 *     a promotion.
 *   - a blank SESSION was no session, so the run's own writes vanish from
 *     `GET /api/changes?session=…`, which is how the human asks what a run did. Cheaper than the
 *     other two and the same shape: the caller tried to say something and was heard saying nothing.
 *
 * Refusing is better than guessing in all three cases because the caller finds out on its first
 * write, in a sentence naming the header, instead of finding out never.
 *
 * WHAT THIS DELIBERATELY DOES NOT CHANGE: a request carrying NO actor headers at all is untouched
 * and still means `human/<person-id>`. That is how a person writing from the browser or a bare `curl` is
 * filed, and it is the whole reason the default exists.
 *
 * Whitespace-only is blank. The value is trimmed HERE, before the test, because a header built from
 * `"$VAR "` is the same mistake with a space in it and the caller cannot see the difference.
 */
function actorHeader(req: FastifyRequest, name: string): string | undefined {
  const raw = headerValue(req, name)
  if (raw === undefined) return undefined
  const value = raw.trim()
  if (value !== '') return value
  throw new PanelError(
    `${name} was sent with an empty value. A header that is present and blank is refused rather than ` +
      `read as absence: an unset variable in a client's header template produces exactly this, and reading ` +
      `it as absence would file this write under a name you did not send. Send a real value. ` +
      `${ACTOR_HEADERS.session} may be left off on its own; ${ACTOR_HEADERS.type} and ${ACTOR_HEADERS.id} may ` +
      `only be left off by a request that sends none of ${ACTOR_HEADER_NAMES.join(', ')}, which is the person ` +
      `typing by hand and is still allowed.`,
  )
}

/**
 * REFUSE A SESSION HEADER THAT HOLDS THE ID OF A RECORD THAT IS NOT A RUN.
 *
 * Two supervisors sent their AGENT record's id as x-mole-office-session on 13 September 2026, and
 * every change they wrote stored it. `resolveSessionRef` in lib/records.ts reads such an id as the id
 * of another kind and not a session, so those rows name no run, and a record's spend counts them as
 * changes that name no run. Nothing told the writer.
 *
 * The header now takes a session record's id or a run name. An id that names a record of another
 * kind is refused here, before any write, with the sentence that says what to send. A run name
 * nobody has filed yet still passes: filing the session later binds it and repoints its rows.
 *
 * AN AGENT'S RECORD IS NOT RESOLVED TO "ITS RUN". An agent may have several runs, and picking one
 * would be a guess. Rows already stored with such an id stay as they are, and the readers say they
 * are unresolved.
 *
 * A READ IS NOT REFUSED. The harm is a change row that stores an id naming no run, and only a write
 * stores change rows. So a route that declares itself a read passes whatever its session header says.
 * A route that declares a write, or declares nothing, is checked.
 */
function refuseASessionHeaderThatNamesARecordThatIsNotARun(req: FastifyRequest, session: string): void {
  if (theActThisRouteIsGatedAs(req)?.effect === 'read') return
  const row = sqlite.prepare('SELECT kind FROM records WHERE id = ?').get(session) as { kind: string } | undefined
  if (row === undefined || row.kind === 'session') return
  throw new PanelError(
    `${ACTOR_HEADERS.session} is "${session}", which is the id of a record that is not a run's session record. ` +
      `Send the id of your run's own session record (the record of kind session that was filed for this run), ` +
      `or a run name. A change stored under this id would name no run.`,
  )
}

/**
 * WHAT A READING OF THE CALLER ASKS BESIDES WHO IS CALLING. `proveOwnRun`: the door proves the caller's own run, and
 * refuses a session header that is not that run in its own words. `whoOnly`: who is calling and nothing about the run
 * its session header names. A gate that runs before every door reads the caller so, and so does a door's first reading
 * before it knows whether it will prove its own run. The door's own reading after that asks the run. `runKeyFor`: read
 * the run this request's run key is bound to, for the reminder `patchRecord` writes when a run's key writes another run
 * of the same agent. Only the record write path asks for it, so an ordinary read reads no revision history.
 */
export type WhatActorFromAsks = { proveOwnRun?: true; whoOnly?: true; runKeyFor?: true }

/**
 * THE RULE A SESSION HEADER IS HELD TO ON A WRITE THAT CARRIES A KEY, in the words every
 * refusal of one carries. lib/the-run-a-key-holds.ts is the rule itself.
 */
const A_KEYS_RUN_IS_THE_RUN_IT_HOLDS =
  `A write may name a run in ${ACTOR_HEADERS.session} only when the key it carries holds that run: the run the key was ` +
  `made for, a run its holder started that the key acts for, or, for an agent's own key, a running session that ` +
  `serves the agent, ran as it, or was filed by the agent for itself and serves no other agent. The office's key and ` +
  `the person's own keys name any run.`

/**
 * THE REQUESTS WHOSE DOOR PROVES THE CALLER'S OWN RUN. A door that reads its caller with `proveOwnRun` refuses, in its
 * own words, a session header that is not that run, and it does so when it writes. Its other readings of the caller
 * on the same request come before that, as the reader of its answer does, and they leave the header to it.
 */
const THE_REQUESTS_WHOSE_DOOR_ASKS_ITS_OWN_RUN = new WeakSet<FastifyRequest>()

/**
 * THE REQUESTS WHOSE SESSION HEADER WAS JUDGED HELD. A door reads its caller before it writes, and many read it again
 * after the write to build the answer. A write may end the run its header names, and an agent's own key holds only a
 * running run, so a second judgement would refuse a write that was made, with "Nothing was written". The header is
 * judged once, by the first reading that asks about the run, and every later reading on the request keeps that.
 */
const THE_REQUESTS_WHOSE_HEADER_WAS_HELD = new WeakSet<FastifyRequest>()

/**
 * REFUSE A SESSION HEADER THE KEY DOES NOT HOLD. lib/the-run-a-key-holds.ts is the rule.
 *
 * A change row names the run that wrote it, and before this the header was taken as said, so any key could file its
 * work under another agent's run. Asked on a write only, after the header has been read as a run at all
 * (`refuseASessionHeaderThatNamesARecordThatIsNotARun` above). A door that proves its caller's own run
 * (`proveOwnRun`) is not asked: it refuses a header that is not that run in its own words, and every later reading of
 * the caller on that request leaves the header to it too (`THE_REQUESTS_WHOSE_DOOR_ASKS_ITS_OWN_RUN` below). Nor is a
 * reading that asks only who is calling (`whoOnly`, at `WhatActorFromAsks`). A header judged held once is not judged
 * again on the same request (`THE_REQUESTS_WHOSE_HEADER_WAS_HELD` above).
 *
 * A REQUEST WITH NO KEY is not held to the rule, except at a door to a key, where it is refused: nothing yet proves
 * that the run it names is the caller's, and the change row the door writes would say so.
 */
function refuseASessionHeaderTheKeyDoesNotHold(req: FastifyRequest, session: string, options?: WhatActorFromAsks): void {
  if (options?.proveOwnRun === true) THE_REQUESTS_WHOSE_DOOR_ASKS_ITS_OWN_RUN.add(req)
  if (theActThisRouteIsGatedAs(req)?.effect === 'read' || options?.whoOnly === true || THE_REQUESTS_WHOSE_DOOR_ASKS_ITS_OWN_RUN.has(req)) return
  if (THE_REQUESTS_WHOSE_HEADER_WAS_HELD.has(req)) return
  const made = whatTheKeyMakesOfTheRunNamed(req, session, workspaceFrom(req).id)
  if (made.is === 'held') {
    THE_REQUESTS_WHOSE_HEADER_WAS_HELD.add(req)
    return
  }
  if (made.is === 'no-key') {
    const operation = theActThisRouteIsGatedAs(req)
    if (operation === undefined || !THE_DOORS_TO_A_KEY.includes(operation.name)) return
    throw new PanelError(
      `${ACTOR_HEADERS.session} names "${session}", but this request carries no key, and a door that gives out a key ` +
        `takes no run name: nothing yet proves that the run is yours. Ask again without ${ACTOR_HEADERS.session}. ` +
        `Nothing was written.`,
      403,
      undefined,
      undefined,
      'A request with no key may not name a run at a door to a key.',
    )
  }
  if (made.is === 'a-dispatched-runs-key') {
    throw new PanelError(
      `${ACTOR_HEADERS.session} names "${session}". This key was made for a dispatched agent run, which ` +
        `tools/agent-worker.mjs serves. That tool's writes cannot be tied to its run until problem J60KF9L_OR-X is ` +
        `fixed, so a write with this key may not name a run in ${ACTOR_HEADERS.session}. Stop, and tell the person ` +
        `who started the tool. Nothing was written.`,
      403,
      undefined,
      undefined,
      "A dispatched run's key may not name a run yet.",
    )
  }
  throw new PanelError(
    `${ACTOR_HEADERS.session} names "${session}", and ${made.because}. ${A_KEYS_RUN_IS_THE_RUN_IT_HOLDS} Nothing was written.`,
    403,
    undefined,
    undefined,
    'The key on this write does not hold the run it names.',
  )
}

/**
 * Which of the three arrived, by PRESENCE and never by value.
 *
 * SEPARATE FROM READING THEM, and that is the whole point. Both defects this file carries scars from
 * were a presence test done by looking at a value: the first read a header name that was never sent
 * and called it absent, the second read `''` and called it absent. So "was this header supplied?" is
 * answered here, once, by asking the request whether it has the key — and a key that is present with
 * no readable value is SUPPLIED, which makes it a claim, which is what the caller meant by sending it.
 */
function suppliedActorHeaders(req: FastifyRequest): string[] {
  return ACTOR_HEADER_NAMES.filter((name) => Object.prototype.hasOwnProperty.call(req.headers, name))
}

/**
 * Refuse a caller that started to say who it is and stopped.
 *
 * ---------------------------------------------------------------------------------------
 * DECISION 10, DECIDED: THE DEFAULT IS FOR A REQUEST THAT CLAIMS NOTHING, NOT FOR A HALF-CLAIM
 * ---------------------------------------------------------------------------------------
 *
 * Before this function existed, a request missing one header could be filed as the human. Generic examples:
 *
 *     x-mole-office-actor-id: <agent-id>, nothing else        ->  human:<agent-id>
 *     x-mole-office-session: sess-1, nothing else             ->  human:<person-id>, in run sess-1
 *     x-mole-office-actor-type: human, no id                  ->  human:<person-id>
 *     x-mole-office-actor-type: agent, no id                  ->  agent:<person-id>
 *
 * The first is the one design/DECISIONS-PENDING.md §10 was raised for, and it is a promotion: an
 * agent that names itself honestly and forgets one header is filed as the human, and `human` is the
 * one actor allowed to write a `decision`. `curl -H 'x-mole-office-actor-type: '` produces exactly this,
 * because curl reads a blank right-hand side as "delete this header", so the shell form of the
 * unset-variable slip arrives here rather than at the blank check above.
 *
 * THE FOURTH LINE IS THE ONE NOBODY HAD WRITTEN DOWN, and it is the same damage the blank ID was
 * fixed for, reached by omitting the header instead of emptying it: an agent that says what it is
 * and not who it is has its work filed under **the person's name**. §10's own table does not list
 * it. It is a permanent wrong name in the change log, and it was reachable by a curl template with
 * one unset variable in it.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * Sending ANY of the three is making an identity claim, and a claim must be complete: the actor type
 * and the actor id must both be there and both be usable. The session header stays optional — a
 * caller may send a type and an id and no session — but it is an attribution header like the other
 * two, so sending it ALONE is a claim as well, and it cannot buy the human default either. Nothing
 * becomes the human by leaving something out.
 *
 * The default survives for exactly one request: one carrying none of the three. That is the browser
 * and it is a bare `curl`, and it is the case the default was written for.
 *
 * THE REFUSAL QUOTES THE IDENTITY THAT WOULD HAVE BEEN INVENTED, because that is the sentence the
 * caller can act on. "You are missing a header" is a code path; "this would have been filed as
 * human:nightly-sweep, and only human may write a decision" is what actually goes wrong.
 */
function refusePartialIdentity(supplied: readonly string[], type: string | undefined, id: string | undefined): void {
  const missing: string[] = [
    type === undefined ? ACTOR_HEADERS.type : null,
    id === undefined ? ACTOR_HEADERS.id : null,
  ].filter((name) => name !== null)
  if (missing.length === 0) return

  // What the old defaults would have made of this request, quoted rather than described. Built from
  // the same `HUMAN` that `actorFrom` returns for a header-less request, so this sentence cannot
  // name an identity this server would not actually have invented.
  const invented = `${type ?? HUMAN.type}:${id ?? HUMAN.id}`
  throw new PanelError(
    `This request sent ${supplied.join(', ')}, so it is claiming an identity, and ${missing.join(' and ')} ` +
      `${missing.length === 1 ? 'is' : 'are'} missing. Both ${ACTOR_HEADERS.type} and ${ACTOR_HEADERS.id} are ` +
      `required as soon as ANY of ${ACTOR_HEADER_NAMES.join(', ')} is sent. Filling the gap in from the defaults ` +
      `would have filed this write as ${invented}, which is not what you said — and ${HUMAN.type} is the one ` +
      `actor allowed to write a decision. Send both, or send none of the three: a request carrying none of ` +
      `them is the person typing by hand, and that is the only thing the default is for.`,
  )
}

/** A trace name: 1 to 64 characters of letters, digits, underscore and dash, and nothing else. */
const TRACE_SHAPE = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Refuse a trace or purpose header that cannot mean what it was sent to mean.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS THE PRODUCT'S RULE AND NOT THE RECORDER'S
 * ---------------------------------------------------------------------------------------
 *
 * These two headers exist so that one run's calls can be counted together afterwards. The obvious
 * place to check their shape is the code that does the counting — and that is the version this
 * replaces, because it makes the product answer differently depending on whether counting is
 * switched on. A malformed header would be a 400 with recording on and a 200 with recording off.
 * The caller's contract would then depend on a setting the caller cannot see, and no test could
 * ever assert "recording changes nothing", because recording would change this.
 *
 * So the check lives here, beside the four refusals `actorFrom` already runs, and it is called from
 * both `actorFrom` and `workspaceFrom` — which is exactly the set of routes where the other header
 * refusals already run. The answer is the same whether anything is being recorded or not.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REFUSED, AND THE ONE THING THAT IS NOT REFUSED YET
 * ---------------------------------------------------------------------------------------
 *
 * BOTH, PRESENT AND BLANK. Same rule and same reason as the other four: a client that builds
 * headers from variables sends precisely this when a variable is unset, and reading it as absence
 * would file this call under no run at all while the caller believed it had named one.
 *
 * THE TRACE, WRONGLY SHAPED. A trace name is what groups a run's calls together, so a value holding
 * a space, a comma or a newline groups nothing and would be discovered months later as a gap in a
 * count. 64 characters is the limit because the value is stored on every row of a table that grows
 * per call.
 *
 * THE PURPOSE, WHEN IT IS NOT ONE OF THE EIGHT. This paragraph used to say the list did not exist
 * anywhere and that whoever wrote it into `src/shared/ops.ts` should add the check here in the same
 * commit. `PURPOSES` is in that file now and this function imports it, so the list is written once
 * and judged once. A purpose outside it is refused rather than counted as its own thing for ever,
 * which is the same argument that closes the operation vocabulary one file away.
 *
 * WHERE THIS DOES NOT RUN: the handful of routes that resolve neither an actor nor a project call
 * neither `actorFrom` nor `workspaceFrom`, so no header of any kind is checked on them today —
 * that is already true of `x-mole-office-workspace` and this does not change it.
 */
function refuseBadTraceHeaders(req: FastifyRequest): void {
  for (const name of TRACE_HEADER_NAMES) {
    const raw = headerValue(req, name)
    if (raw === undefined) continue
    const value = raw.trim()
    if (value === '') {
      throw new PanelError(
        `${name} was sent with an empty value. A header that is present and blank is refused rather than ` +
          `read as absence: an unset variable in a client's header template produces exactly this, and this ` +
          `call would then be counted under no run at all while you believed you had named one. Send a real ` +
          `value, or leave the header off — neither ${TRACE_HEADER_NAMES.join(' nor ')} is required, and ` +
          `leaving both off changes nothing about what Mole Office answers.`,
      )
    }
    if (name === TRACE_HEADERS.trace && !TRACE_SHAPE.test(value)) {
      throw new PanelError(
        `${TRACE_HEADERS.trace} must be 1 to 64 characters of letters, digits, underscore and dash — it was ` +
          `"${value}". It is the name one stretch of work is counted under, so a value carrying a space, a ` +
          `comma or a line break would group nothing, and you would find that out as a hole in a count ` +
          `rather than as a refusal.`,
      )
    }
    if (name === TRACE_HEADERS.purpose && !isPurpose(value)) {
      throw new PanelError(
        `${TRACE_HEADERS.purpose} must be one of ${PURPOSES.join(', ')} — it was "${value}". The list is closed ` +
          `because free text would give a hundred spellings of one word and no count worth reading. If none of ` +
          `the eight is what you are doing, leave the header off: saying nothing is a real answer here and an ` +
          `invented word is not.`,
      )
    }
  }
}

// ------------------------------------------------------- what a request SAID, judged by nothing

/**
 * THE TWO TRACE HEADERS, READ AND NOT JUDGED, for the code that records what each call did.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SECOND, DUMBER READER EXISTS BESIDE THE REFUSAL ABOVE
 * ---------------------------------------------------------------------------------------
 *
 * `refuseBadTraceHeaders` runs inside `actorFrom` and `workspaceFrom`, which is every route that
 * resolves an actor or a project — and that is most of them but not all. On the handful that
 * resolve neither, nothing has judged these headers, and the recorder still has to write a row.
 *
 * So this reader REFUSES NOTHING. A malformed value comes back as null and is COUNTED as ignored,
 * because a count is a fact and "some traces may be missing" is prose about a fact. What it must
 * never do is throw: a request that is answered today would start being refused because something
 * was counting, which is the one thing the recorder is forbidden to cause.
 */
export interface ObservedTrace {
  trace: string | null
  purpose: string | null
  /** True when a header was there and could not mean what it was sent to mean. */
  ignored: boolean
}

export function observedTrace(req: FastifyRequest): ObservedTrace {
  const read = (name: string): string | null => {
    const raw = req.headers[name]
    const one = Array.isArray(raw) ? raw[0] : raw
    if (typeof one !== 'string') return null
    const value = one.trim()
    return value === '' ? null : value
  }
  const traceRaw = read(TRACE_HEADERS.trace)
  const purposeRaw = read(TRACE_HEADERS.purpose)
  const trace = traceRaw !== null && TRACE_SHAPE.test(traceRaw) ? traceRaw : null
  const purpose = purposeRaw !== null && isPurpose(purposeRaw) ? purposeRaw : null
  return { trace, purpose, ignored: (traceRaw !== null && trace === null) || (purposeRaw !== null && purpose === null) }
}

/**
 * THE THREE IDENTITY HEADERS AS THEY WERE SENT, with no judgement of any kind.
 *
 * Most requests are reads and a read never calls `actorFrom`. So the recorder falls back to this: a
 * deliberately dumb reader that returns what was there, trimmed, or null. THE JUDGEMENT STAYS IN
 * EXACTLY ONE PLACE, which is `actorFrom`, and this function makes none to duplicate.
 *
 * If the recorder called `actorFrom` itself, a GET carrying a half-made identity claim would start
 * being refused where it is answered today — a change in what the product does, caused by
 * telemetry, which is the worst thing a measurement layer could do.
 */
export interface ObservedIdentity {
  actorType: string | null
  actorId: string | null
  sessionId: string | null
  /** True when any of the three was sent, which is what tells `header` from `none`. */
  any: boolean
}

export function observedIdentity(req: FastifyRequest): ObservedIdentity {
  const read = (name: string): string | null => {
    const raw = req.headers[name]
    const one = Array.isArray(raw) ? raw[0] : raw
    if (typeof one !== 'string') return null
    const value = one.trim()
    return value === '' ? null : value
  }
  const actorType = read(ACTOR_HEADERS.type)
  const actorId = read(ACTOR_HEADERS.id)
  const sessionId = read(ACTOR_HEADERS.session)
  return { actorType, actorId, sessionId, any: actorType !== null || actorId !== null || sessionId !== null }
}

// -------------------------------------------------------------- what this request already worked out

/**
 * What one request has already resolved about who is asking and which project it means.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS STAMPED RATHER THAN WORKED OUT AGAIN
 * ---------------------------------------------------------------------------------------
 *
 * `actorFrom` has 64 call sites and `workspaceOf` has 92, every one of them inside a handler with a
 * local result. Anything outside a handler that wants those two answers — the code that records
 * what each call did is the first such thing — has two choices: call the same two functions a
 * second time, or read what the first call worked out. Calling them again is the same fact worked
 * out in two places, which is the defect this repository keeps producing, and it is worse than
 * usual here: `actorFrom` REFUSES things, so a second call would refuse a request the handler had
 * already answered, and a read that is answered today would start being refused because something
 * was counting.
 *
 * So the resolving functions stamp what they resolved, and everything else reads the stamp.
 *
 * A SYMBOL, so nothing can collide with it, and on the Fastify request rather than the raw one
 * because both writers and every reader hold the Fastify request.
 *
 * ABSENT MEANS NOBODY RESOLVED IT, WHICH IS NOT THE SAME AS "THERE WAS NOTHING TO RESOLVE". An
 * ordinary GET never calls `actorFrom`, so its actor stamp is absent, and that is the honest answer:
 * nobody asked who was reading. A reader that turned an absent stamp into `human/<person-id>` would be
 * inventing an identity for a request that made no claim.
 */
const RESOLVED = Symbol.for('mole-office.resolved')

interface Resolved {
  actor?: Actor
  workspace?: WorkspaceClaim
}

function resolvedOn(req: FastifyRequest): Resolved {
  const holder = req as Partial<Record<typeof RESOLVED, Resolved>>
  const existing = holder[RESOLVED]
  if (existing !== undefined) return existing
  const fresh: Resolved = {}
  holder[RESOLVED] = fresh
  return fresh
}

/**
 * Record the actor this request resolved to, for anything outside the handler that needs it.
 *
 * Called on BOTH of `actorFrom`'s returns. The one that is easy to miss is the early one — the
 * request that sent no identity header at all, the person typing by hand — and missing it would
 * make a hand-typed write look like a write by a caller nobody ever resolved. Those are different
 * facts and only one of them is true.
 */
export function stampActor(req: FastifyRequest, actor: Actor): Actor {
  // AN AGENT'S ACTOR NAMES THE DOOR IT PRESSES, so `mayPressForThePerson` in lib/records/own-words.ts can ask whether
  // the person's grant reaches that door. The person is never asked that, so the person's actor carries none.
  if (actor.type === 'agent') actor.press = thePressOf(req)
  resolvedOn(req).actor = actor
  return actor
}

/** Each request's press, made at its first reading. */
const THE_PRESS_OF = new WeakMap<FastifyRequest, PressForThePerson>()

/**
 * THE DOOR THIS REQUEST PRESSES, AND THE REASON IT GAVE FOR PRESSING IT FOR THE PERSON: one object for the whole
 * request (`Actor.press` in lib/records/actor.ts). Made at its first reading from the operation the matched route
 * declared, so no door names its operation a second time. lib/for-the-person.ts puts the reason on it before the door
 * reads its body. Every agent actor `actorFrom` answers carries this same object, so all a door's copies of its caller
 * name one press, and the gate that reads it before the body is read sees the reason the door sees.
 */
export function thePressOf(req: FastifyRequest): PressForThePerson {
  const known = THE_PRESS_OF.get(req)
  if (known !== undefined) return known
  const declared = theOperationThisRouteDeclared(req)
  const press: PressForThePerson = { operation: declared?.name ?? null, aRead: declared?.effect === 'read', reason: null }
  THE_PRESS_OF.set(req, press)
  return press
}

/** Record the project this request resolved to. Called on BOTH of `workspaceFrom`'s returns. */
export function stampWorkspace(req: FastifyRequest, claim: WorkspaceClaim): WorkspaceClaim {
  resolvedOn(req).workspace = claim
  return claim
}

/**
 * The actor this request resolved to, or undefined because nothing resolved one.
 *
 * UNDEFINED IS AN ANSWER AND IT IS NOT `human/<person-id>`. It means no code on this request's path asked
 * who was calling, which is the ordinary state of every read.
 */
export function resolvedActorOf(req: FastifyRequest): Actor | undefined {
  return (req as Partial<Record<typeof RESOLVED, Resolved>>)[RESOLVED]?.actor
}

/** The project this request resolved to, or undefined because nothing resolved one. */
export function resolvedWorkspaceOf(req: FastifyRequest): WorkspaceClaim | undefined {
  return (req as Partial<Record<typeof RESOLVED, Resolved>>)[RESOLVED]?.workspace
}

/**
 * THE REFUSAL FOR AN AGENT ID NO REGISTRY HOLDS, ASKED WHERE EVERY WRITING ROUTE PASSES.
 *
 * `whyAnUnregisteredAgentMayNotWrite` in lib/records/unregistered-agent.ts is the rule and its
 * sentence; its declared exceptions are in lib/records.ts. It used to be asked by the records door
 * alone, and the inspector found the other writing doors — the incident timeline, the notebook, the
 * roles doors, the folder-reading draft — still storing a write under a name no registry holds.
 * This asks it from `actorFrom`, which every writing route builds its actor through, so a door
 * added tomorrow is behind it without knowing.
 *
 * IT ASKS ONLY ABOUT A WRITE. `effect` is on the operation in src/shared/ops.ts, which is the one
 * declaration of what a route does, and it is not the HTTP method: `GET /api/groups/:id` writes a
 * delivery mark and is a write here, while three POSTs that change nothing are reads. A read stores
 * no change row, so a made-up name on one is not the false attribution this rule exists against.
 *
 * THE DOORS THROUGH WHICH AN ID BECOMES REGISTERED PASS. `THE_REGISTRATION_DOORS` in lib/records.ts
 * names them by the method and path the router matched and says why each is there; without it the
 * door an unregistered session registers at would refuse the session that has nowhere else to go.
 *
 * AN UNKNOWN ROUTE FAILS CLOSED. Every route declares an operation and a path, but a request built
 * in process may carry neither; it is an in-process caller then, so `whyAnUnregisteredAgentMayNotWrite`
 * already answers null for it on the `from` line. A real socket whose route somehow declared nothing
 * would be refused, which is the honest direction.
 */
function refuseAnUnregisteredAgentOnAWrite(req: FastifyRequest, actor: Actor): void {
  const operation = theActThisRouteIsGatedAs(req)
  // A read stores nothing under the name, so this rule is not about it.
  if (operation?.effect === 'read') return
  // The doors through which an id becomes registered. Their own notes are in lib/records.ts.
  const route = `${req.method} ${req.routeOptions?.url ?? req.url ?? ''}`
  if (THE_REGISTRATION_DOORS.includes(route)) return
  const no = whyAnUnregisteredAgentMayNotWrite(actor)
  if (no !== null) throw new PanelError(no, 403)
}

/**
 * A REQUEST IN THE NAME OF AN AGENT REGISTERED WITH NO KEY OF ITS OWN IS ANSWERED ONLY WITH A RUN KEY OR THE OFFICE'S
 * KEY, a read as well as a write. The rule and its two sentences are in lib/run-keys-only.ts. An in-process caller,
 * such as `app.inject` in a test, is asked as well.
 */
function refuseARequestWithNoRunKeyForAnAgentWithNoKeyOfItsOwn(req: FastifyRequest, actor: Actor): void {
  const no =
    theActThisRouteIsGatedAs(req)?.effect === 'read' ? whyThisReadNeedsARunKey(req, actor) : whyThisWriteNeedsARunKey(req, actor)
  if (no !== null) throw new PanelError(no, 403)
}

/**
 * THE OPERATION THE MATCHED ROUTE DECLARED, or undefined because it declared none. The two refusals
 * on a write read it here, and so does the notice in lib/a-write-that-names-no-run.ts, so all three
 * judge "is this a write" from the one declaration in src/shared/ops.ts.
 */
export function theOperationThisRouteDeclared(req: FastifyRequest): ReturnType<typeof operationNamed> {
  const declared = (req.routeOptions?.config as { operation?: unknown } | undefined)?.operation
  return typeof declared === 'string' ? operationNamed(declared) : undefined
}

/**
 * THE ACT THE GATES ON THE CALLER ASK ABOUT: what the route declared, or, for a door that only checks
 * a write, that write (`gatedAs` in src/shared/ops.ts). So a check is refused wherever its write is.
 */
function theActThisRouteIsGatedAs(req: FastifyRequest): ReturnType<typeof operationNamed> {
  const declared = (req.routeOptions?.config as { operation?: unknown } | undefined)?.operation
  // The explicit marking form performs the same write as needs-no-run. Plain queue readings keep
  // their existing gates; usage and version tags still read the route's declared operation.
  const query = req.query as { only?: unknown; markDelivered?: unknown } | undefined
  if (declared === 'worker.queue' && query?.only === 'checks' && query.markDelivered === '1') {
    return theActAGateAsksAbout('worker.needs-no-run')
  }
  return typeof declared === 'string' ? theActAGateAsksAbout(declared) : undefined
}

/**
 * THE DOORS A CALLER WITH NO KEY USES TO GET ONE, by the operation each declares. After the close
 * every other write needs a key, and these four doors are how a caller comes to hold one:
 *
 *   - `office.pair`: POST /api/office/pairing, the loopback press that sets their key as a cookie.
 *   - `office.issue-credential`: POST /api/office/pairing/ask, where a browser on a trusted machine
 *     asks for their key, and POST /api/office/visitors, where a visitor asks for a credential. Each
 *     is confirmed by the person before the key it binds proves anybody.
 *   - `agent.register-myself`: POST /api/agents/register-myself. With the window closed it registers
 *     nothing by itself: it writes a waiting row and answers its first ask a one-time secret, the person's one
 *     press admits the session, and the ask of the same door that sends the secret back is answered
 *     the agent's key. It takes a keyless registration only under an agent's
 *     name, because the waiting row is written under the caller's actor and the person's name, or
 *     nobody's, would write it as their act (see `refuseAKeylessWriteAfterTheClose`).
 *
 * Refusing these for want of a key would leave no way to a key but a terminal.
 */
const THE_DOORS_TO_A_KEY: readonly string[] = ['office.pair', 'office.issue-credential', 'agent.register-myself']

/**
 * AFTER THE CLOSE, A WRITE A LISTENER CARRIED WITH NO KEY IS REFUSED. Criterion P83, points 1 and 6.
 *
 * Once the person has closed the key window, a claim with no key is nobody, from this computer and
 * from the trusted machines alike. That holds for every kind of claim: an agent's name, the person's name, and
 * a request that named nobody. Before this, only the doors that ask `thePersonIsProved` refused, so a
 * message in their name with no key was still written as theirs, and an agent's name with no key was
 * still taken as that agent.
 *
 * `window` is what `theHeaderWindowCovers` made of this request, so the window is read once per
 * request. Only `closed` is refused: a key, an in-process caller, and every caller while the window is
 * open are exactly as before.
 *
 * IT ASKS ONLY ABOUT A WRITE, read from the operation's declared effect, the way
 * `refuseAnUnregisteredAgentOnAWrite` reads it. A read with no key that named nobody or an agent is
 * refused by `refuseARequestNobodyProved` below, outside the doors to a key; `actorFrom` asks it. The
 * doors to a key above pass.
 */
function refuseAKeylessWriteAfterTheClose(req: FastifyRequest, actor: Actor, window: WhatTheWindowMakesOfIt): void {
  if (window !== 'closed') return
  const operation = theActThisRouteIsGatedAs(req)
  if (operation?.effect === 'read') return
  /**
   * THE REGISTRATION DOOR TAKES ONLY AN AGENT'S NAME. It is the one door to a key that writes a row
   * under the caller's actor: its waiting row. A keyless request in the person's name, or in nobody's,
   * is the person's claim, so that row would be written as their act (an inspector's refusal of 26
   * September 2026). The two pairing doors write no row under the actor,
   * so every claim still passes them.
   */
  if (operation?.name === 'agent.register-myself' && actor.type !== 'agent') {
    throw new PanelError(
      theRefusalForARegistrationThatNamesNoAgent(whatThisRequestShowed(actor, req)),
      403,
      undefined,
      undefined,
      'This registration named no agent and carried no key.',
    )
  }
  if (operation !== undefined && THE_DOORS_TO_A_KEY.includes(operation.name)) return
  throw new PanelError(theRefusalForAWriteWithNoKey(whatThisRequestShowed(actor, req)), 403, undefined, undefined, 'This write carried no key.')
}

/**
 * THE DOORS A REQUEST THAT NOBODY PROVED MAY STILL REACH: the three doors to a key above, and the pairing page's read,
 * which tells a browser whether it holds their key and how to get it. Refusing that read would leave an unpaired
 * browser no page that says what to do.
 */
const THE_DOORS_NOBODY_NEEDS_A_KEY_FOR: readonly string[] = [...THE_DOORS_TO_A_KEY, 'office.pairing']

/** A read can distinguish this refusal without changing the response sent by other doors. */
export class UnprovedIdentityError extends PanelError {}

/**
 * A REQUEST NO KEY PROVED IS NOT ANSWERED AS ANYBODY.
 *
 * A request that a listener carried, with no key that proves anybody, is refused here in two cases:
 *
 *   - IT NAMED NOBODY, and the key window does not cover it for this computer's own program. That is every such
 *     request after the close, and while the window is open one from a sandbox, from a program the office cannot
 *     find, or from a machine this office does not trust. Their own page names them on every fetch and carries their key
 *     once it is paired, so this never refuses it.
 *   - IT IS A READ UNDER AN AGENT'S NAME AFTER THE CLOSE. Such a read used to be answered as a request that named
 *     nobody, which was the person, so any program could read every message by sending an agent's name.
 *
 * NOT ASKED FOR A REQUEST NO LISTENER CARRIED (`from` undefined): a call inside the office's own program is the
 * office itself (design/permissions/ACCEPTANCE.md, P83 point 1). And the doors in
 * `THE_DOORS_NOBODY_NEEDS_A_KEY_FOR` pass, because they are how a caller comes to hold a key.
 *
 * A REQUEST THAT NAMES THE PERSON WITH NO KEY is refused here too, on the same condition; `actorFrom` asks it
 * for that case after the write refusal.
 */
function refuseARequestNobodyProved(req: FastifyRequest, actor: Actor): void {
  const operation = theActThisRouteIsGatedAs(req)
  if (operation !== undefined && THE_DOORS_NOBODY_NEEDS_A_KEY_FOR.includes(operation.name)) return
  if (actor.type === 'agent') {
    throw new UnprovedIdentityError(
      theRefusalForARequestNobodyProved(whatThisRequestShowed(actor, req)),
      403,
      undefined,
      undefined,
      'This read named an agent and carried no key.',
    )
  }
  throw new UnprovedIdentityError(
    theRefusalForARequestNobodyProved(whatThisRequestShowed(actor, req)),
    403,
    undefined,
    undefined,
    actor.stated === false
        ? 'This request named nobody and carried no key.'
        : 'This request named the person and carried no key.',
    { code: 'identityNotProved', values: {} },
  )
}

/**
 * Build the Actor that every write is attributed to.
 *
 * This is attribution, not authentication: nothing here proves the caller is who it says it
 * is. Mole Office runs on one machine for one person, and the point of the actor is to answer
 * "did I write this, or did an agent?" later. Do not put this on a public network as-is.
 *
 * THE CONTRACT, IN ONE LINE: a request that sends none of the three actor headers and no key is the
 * person only where no listener carried it, or where the open key window covers this computer's own
 * program; any other is refused. A request that sends any of them must say what
 * it is and who it is, in full.
 *
 * ONE FIELD ON THE RESULT IS NOT TAKEN FROM A HEADER: `from`, which machine asked. It comes from
 * `arrivalOf` — the listener that accepted the connection — precisely because everything else here
 * is the caller's word for itself and a question about authority cannot be answered with one.
 *
 * The six refusals below are in this order because each one can only be judged once the ones above
 * it have passed, and each answers a different mistake:
 *
 *   1. a header name that ALMOST names the writer   — refuseMisspeltActorHeaders
 *   2. one of the Mole Office headers sent twice         — refuseRepeatedActorHeaders
 *   3. a trace or purpose header that cannot mean   — refuseBadTraceHeaders
 *      what it was sent to mean
 *   4. the old warrant header sent at all           — refuseTheOldWarrantHeader
 *   5. one of the three sent present and blank      — actorHeader
 *   6. a claim that names itself only halfway       — refusePartialIdentity
 *
 * Values that WERE given are judged before headers that were not: an unrecognised actor type is a
 * definite mistake whatever else is missing, and its sentence is the more specific of the two.
 *
 * AND TWO REFUSALS ARE NOT ABOUT A HEADER AT ALL, and both are asked only on a write. An agent id no
 * registry holds is refused on both agent returns by `refuseAnUnregisteredAgentOnAWrite` above. And
 * once the person has closed the key window, a write a listener carried with no key is refused on
 * both keyless returns by `refuseAKeylessWriteAfterTheClose` above, whatever the headers claimed.
 * A read with no key under an agent's name, or naming nobody, is then refused by
 * `refuseARequestNobodyProved`, outside the doors to a key.
 */
export function actorFrom(req: FastifyRequest, options?: WhatActorFromAsks): Actor {
  refuseMisspeltActorHeaders(req)
  refuseRepeatedActorHeaders(req)
  refuseBadTraceHeaders(req)
  refuseTheOldWarrantHeader(req)

  // WHICH MACHINE ASKED, from the listener and never from a header, worked out once and carried on
  // both returns below.
  const from = arrivalOf(req)
  /**
   * HOW THIS REQUEST PROVED ITSELF. Criterion P83, point 1. One reading, in src/server/lib/keys.ts,
   * so a key is compared in one place and every guard reads the same answer. In a test world this
   * reading already refuses every copied key but the starter's and the secretary's: they prove
   * nothing there, exactly as an unknown key does.
   */
  const proof = howThisRequestProvedItself(req)
  // A tool has no Actor identity. Its sole reading door asks its proof directly; every other
  // actor reader refuses it.
  if (proof?.how === 'his-tool-key') {
    throw new PanelError('This key proves only your mail tool, which may only read the summonses. Use your own key or an agent’s own key here. Nothing was done.', 403)
  }

  // PRESENCE, decided before anything is read. A request that supplied none of the three leaves by the
  // branch below: proved by its key, or the person, or refused.
  const supplied = suppliedActorHeaders(req)
  /**
   * AND A KEY THIS TEST WORLD DOES NOT TRUST, ON A REQUEST THAT SAYS NOTHING ELSE, IS REFUSED.
   * Criterion P84's last clause: a world trusts the starter's key and the secretary's key and
   * nothing else. A world's database is a copy, so `held_keys` carries the SHA-256 of every agent
   * key and device key the office ever made; without this, a request carrying one of them and no
   * other identity would be read as that agent, or — for a copied device key — as the person.
   *
   * WHAT THIS DELIBERATELY DOES NOT DO. It does not refuse a request that named itself with actor
   * headers. The headers are the name path P84 built, and this piece is about what a world accepts
   * as PROOF; the key proves nothing, so the name path decides exactly as it does with no key at
   * all. That keeps a world reached by the two who may working by name until the window closes,
   * which is what W3 requires. The office is never a test world, so this is null there and its key
   * path does not move. A key the copy does not hold — one made after the copy, or the office's own
   * key — is not refused here and stays judged by the window, which is what point 6 of P83 keeps
   * open.
   */
  if (supplied.length === 0) {
    const refusedHeldKey = theHeldKeyThisWorldRefuses(req)
    if (refusedHeldKey !== null) {
      throw new PanelError(
        aWorldRefusesTheKeyHeldBy(refusedHeldKey.holder),
        403,
        undefined,
        undefined,
        'This test world does not trust that key.',
      )
    }
  }
  // `stated: false` is the whole of owner decision §36 at this layer. Where a header-less request
  // is answered at all it is the person —
  // but `assertMayWrite` now knows the difference between a person who said so and a request that
  // said nothing, and refuses the four governance verbs to the second.
  if (supplied.length === 0) {
    /**
     * A KEY WITH NO ACTOR HEADERS IS STILL A PROOF. The local app holds the person's key and may
     * send nothing else, and the pairing cookie arrives on requests whose JavaScript sets no actor
     * header at all. The key decides the identity; the headers were only ever attribution.
     */
    if (proof !== undefined) {
      const keyed = proof.how === 'the-person-key'
        ? { ...HUMAN, sessionId: null as string | null, stated: true }
        : { type: 'agent' as ActorType, id: proof.whoseId, sessionId: null as string | null, stated: true }
      /**
       * AND A KEY A TEST WORLD TRUSTS DOES THE PERSON'S ACTS HERE. Criterion P84's last clause: a
       * world trusts the starter's key and the secretary's key. The reading above already refused
       * every copied key but those two, so an agent this names is the starter or a secretary, and
       * `theOwnersAuthorityOf` says so. In the office it always answers holds: false, so its key
       * path is unchanged; the person's key sets `type: human`, which it is asked about and never
       * about, so nothing here makes a second way to be the person.
       *
       * AND IT IS ASKED UNDER THE AGENT'S HANDLE. `MOLE_OFFICE_WORLD_STARTED_BY` and
       * `MOLE_OFFICE_WORLD_SECRETARIES` hold handles — the tool that starts a world writes them off
       * the ledger row and off the cards, and the refusal they feed names them to a person. Since
       * criterion I5 a key's holder is the agent's ID, so a world asked about the id would refuse
       * its own starter. `theHandleOfTheAgentAKeyProves` is the one reader of that, in keys.ts
       * beside the key it reads; it answers the string unchanged where this database holds no such
       * agent, which is every holder in the office.
       */
      const owners = theOwnersAuthorityOf({
        type: keyed.type,
        id: keyed.type === 'agent' ? theHandleOfTheAgentAKeyProves(keyed.id) : keyed.id,
      })
      // THE RUN THIS REQUEST'S RUN KEY IS BOUND TO, carried so a write that names another run of the same agent can
      // remind its caller. Only a live run key that is still its run's newest carries it.
      const keyRowWithoutHeaders =
        proof.how === 'an-agent-key' && proof.actingFor === undefined && proof.sealedRun === undefined && proof.finishedRun === undefined
          ? theAgentKeyRowOnThisRequest(req)
          : undefined
      // THE BINDING IS READ ONLY FOR A RECORD WRITE (see `runKeyFor` above): an ordinary read reads no revision history.
      const boundWithoutHeaders =
        options?.runKeyFor === true && keyRowWithoutHeaders !== undefined
          ? theRunThisRunKeyIsBoundTo(keyRowWithoutHeaders)
          : undefined
      const proven: Actor = {
        ...keyed,
        ...(owners.holds ? { theOwnersAuthority: owners } : {}),
        provedBy: proof.how,
        ...(boundWithoutHeaders === undefined || !boundWithoutHeaders.newest ? {} : { runKeyFor: boundWithoutHeaders.run }),
        // A SEALED RUN'S OWN KEY SENT ALONE writes only its served conditions, as with headers.
        ...(proof.sealedRun === undefined ? {} : { sealedRunsOwnKey: proof.sealedRun }),
        // A FINISHED RUN'S OWN KEY SENT ALONE is held to the same three acts as with headers.
        ...(proof.finishedRun === undefined ? {} : { finishedRunsOwnKey: proof.finishedRun }),
        from,
      }
      refuseAnUnregisteredAgentOnAWrite(req, proven)
      refuseARequestWithNoRunKeyForAnAgentWithNoKeyOfItsOwn(req, proven)
      return stampActor(req, proven)
    }
    // NO `theOwnersAuthority` HERE, and that is right rather than an omission: this request named
    // nobody, so where it is answered it is already the person. Criterion P84's rule is
    // about an AGENT holding the person's authority in a world, and there is no agent here to ask about.
    const window = theHeaderWindowCovers(req, from, false)
    // AND ONLY WHEN THIS COMPUTER'S OWN PROGRAM SENT IT: nothing from a sandbox is the person.
    const sentBy = whoSentAClaimToBeThem(req, from, window)
    const namedNobody: Actor = {
      ...HUMAN,
      sessionId: null,
      stated: false,
      from,
      ...(window === 'covered' && sentBy === THEIR_OWN_PROGRAM ? { theKeyWindowCovers: true } : {}),
      ...(sentBy === THEIR_OWN_PROGRAM ? {} : { sentFrom: sentBy }),
    }
    // AFTER THE CLOSE A WRITE THAT NAMED NOBODY AND HELD NO KEY IS REFUSED (finding 82).
    refuseAKeylessWriteAfterTheClose(req, namedNobody, window)
    // AND IT IS THE PERSON ONLY WHERE THE WINDOW COVERS IT FOR THIS COMPUTER'S OWN PROGRAM, or where no listener
    // carried it. Every other request that named nobody and held no key is refused.
    if (from !== undefined && !(window === 'covered' && sentBy === THEIR_OWN_PROGRAM)) refuseARequestNobodyProved(req, namedNobody)
    return stampActor(req, namedNobody)
  }

  // Each of these is either undefined — the header was not sent — or a non-empty trimmed value.
  // actorHeader has already refused everything in between.
  const type = actorHeader(req, ACTOR_HEADERS.type)
  const id = actorHeader(req, ACTOR_HEADERS.id)
  const session = actorHeader(req, ACTOR_HEADERS.session)

  // An unrecognised actor type is rejected rather than treated as human. Quietly promoting an
  // agent to human would let it write the record kinds only you are allowed to write.
  if (type !== undefined && !ACTOR_TYPES.includes(type as ActorType)) {
    throw new PanelError(
      `${ACTOR_HEADERS.type} must be one of: ${ACTOR_TYPES.join(', ')} — it was "${type}"`,
    )
  }

  refusePartialIdentity(supplied, type, id)
  if (session !== undefined) refuseASessionHeaderThatNamesARecordThatIsNotARun(req, session)
  if (session !== undefined) refuseASessionHeaderTheKeyDoesNotHold(req, session, options)

  /**
   * WHETHER THIS CALLER HOLDS THE OWNER'S AUTHORITY IN A TEST WORLD. Criterion P84, rule 5 of
   * chapter 8: whoever opened a test world holds the highest authority in it.
   *
   * IT IS WORKED OUT HERE AND NOWHERE ELSE, for the reason `from` below is: a fact about the REQUEST
   * belongs on the actor, so every guard reads one answer rather than each asking its own question
   * of the environment. It changes neither `type` nor `id`: a world that let an agent write as
   * `human` would put a false name in a permanent change log.
   *
   * IT IS PUT ON THE ACTOR ONLY WHEN IT HOLDS, and absent is the ordinary answer — every request in
   * the office, which is never a test world, and every request in a world by somebody who holds
   * nothing. That is the same shape `stated` and `from` have: absent means the rule does not apply.
   * Setting a `{ holds: false }` on every actor would put a field on every request in the product to
   * say a thing that is true of almost all of them.
   */
  const owners = theOwnersAuthorityOf({ type: type as string, id: id as string })

  /**
   * AND THE PERSON'S KEY MAKES THE CALLER THE PERSON, whatever the headers say. A request carrying
   * it is the person by construction; the id is theirs. The office's key and an agent's key do not
   * do this — they prove which process is asking and leave the headers to say who.
   */
  const asserted: { type: ActorType; id: string } =
    proof?.how === 'the-person-key'
      ? { type: 'human', id: HUMAN.id }
      : // A SYSTEM WRITE NAMED BY THE PRODUCT'S EARLIER NAME is stored under the office's own id
        // (`SYSTEM_ACTOR_IDS_RENAMED`, then its live row), so a page or script that still sends the product's earlier name writes what the office writes.
        { type: type as ActorType, id: type === 'system' && nowSaid(SYSTEM_ACTOR_IDS_RENAMED, id as string) === MOLE_OFFICE_HANDLE ? moleOfficeId() : (id as string) }

  /**
   * WHO A KEY PROVED, WHERE THAT IS NOT THE NAME THE HEADERS GAVE. Criterion P83, point 5: the
   * actor keeps the header's name — the change log must keep naming
   * the agent that wrote each record — and the holder the key proved is carried beside it.
   *
   * THIS IS THE ONE PLACE BOTH FACTS ARE IN HAND. The key's holder is `proof.whoseId` and the name
   * the headers gave is `id`; they are compared here and nowhere else, so the ledgers write what
   * this worked out rather than asking the question a second time. `actorFrom`'s other return, the
   * request that sent no headers at all, cannot differ from itself and so adds nothing.
   *
   * ABSENT IS THE ANSWER BOTH TIMES THE RULE DOES NOT APPLY: no key proved anything, or the key's
   * holder is the very agent the headers named. `stated`, `from` and `theOwnersAuthority` have the
   * same shape, and it is why no `{ mismatch: false }` is written on every actor.
   *
   * THE TWO ARE COMPARED AS AGENTS AND NOT AS CHARACTERS. Criterion I5:
   * `theKeyProvedTheNameTheHeadersGave` below is that comparison, and its own note says why.
   *
   * THE NAME IS CARRIED AS WELL AS THE HOLDER, because on a person's-key row `asserted.id` IS the
   * proved holder — the key replaced the claim — so the name the headers gave survives nowhere else.
   * The word for how it proved is carried so the page can tell the office's own key from an agent's
   * without a second declaration of the office's id in the browser.
   *
   * AN AGENT'S KEY UNDER ANOTHER NAME NEVER GETS HERE. `refuseAnAgentsKeyUnderAnotherName` in
   * lib/keyheader.ts refuses it on every request before any handler runs. So the rows this writes
   * today are the office's key under an agent's name, the person's key under another name, and a
   * supervisor's run key acting for a run its holder started (lib/acting-for.ts). That key proves the
   * agent the headers named, so the comparison below finds nothing to say, and the holder is named
   * here from the proof instead: every write done that way still shows whose key did it. Rows written
   * before that rule can still carry an agent's key, and the page still says so for them.
   */
  // WHAT THE KEY WINDOW MAKES OF THIS REQUEST, read once and used by the actor and by the refusal.
  const window = theHeaderWindowCovers(req, from, proof !== undefined)
  // AND A CLAIM TO BE THE PERSON COUNTS ONLY WHEN THIS COMPUTER'S OWN PROGRAM SENT IT. An agent's own
  // keyless claim is not narrowed: the rule is about them.
  const sentBy = asserted.type === 'human' ? whoSentAClaimToBeThem(req, from, window) : THEIR_OWN_PROGRAM

  const provedHolder =
    proof?.actingFor !== undefined && id !== undefined
      ? { id: proof.actingFor.holder, how: proof.how, claimed: id }
      : proof === undefined || id === undefined || theKeyProvedTheNameTheHeadersGave(proof, type, id)
        ? undefined
        : { id: proof.whoseId, how: proof.how, claimed: id }

  // Both are known to be present: refusePartialIdentity threw otherwise. Nothing here is defaulted,
  // and that is deliberate — the only default this function has is the early return above, where a
  // reader can see the whole of it at once instead of finding it spread over three fields.
  const ownKeyRun = options?.proveOwnRun === true && proof?.how === 'an-agent-key' && proof.actingFor === undefined ? theOwnRunThisRequestKeyProves(req) : undefined
  // THE ROW OF AN AGENT'S KEY THAT PROVED ITS HOLDER ITSELF: not acting for another run, and not a sealed or finished run's
  // key on the acts after its end. The run's sandbox rule asks whether it is the holder's own (`assertMayWriteASandbox`).
  const agentKeyRow =
    proof?.how === 'an-agent-key' && proof.actingFor === undefined && proof.sealedRun === undefined && proof.finishedRun === undefined
      ? theAgentKeyRowOnThisRequest(req)
      : undefined
  // THE RUN A LIVE RUN KEY IS BOUND TO, read from the binding and not from the session header. The write path uses it
  // to tell a run key writing another run of the same agent, which is taken with a reminder. It is read only when the
  // record write path asks for it, so an ordinary read reads no revision history to answer who is calling.
  const boundRunKey = options?.runKeyFor === true && agentKeyRow !== undefined ? theRunThisRunKeyIsBoundTo(agentKeyRow) : undefined
  const actor: Actor = {
    type: asserted.type,
    id: asserted.id,
    sessionId: session === undefined ? null : session,
    // WHO HOLDS THE OWNER'S AUTHORITY HERE, worked out above and carried only when it holds.
    ...(owners.holds ? { theOwnersAuthority: owners } : {}),
    // WHICH MACHINE ASKED, from the listener and never from a header. Left undefined for an
    // in-process caller, which means "the rule does not apply" and never "this machine" — the same
    // shape `stated` above has, and for the same reason.
    from,
    ...(proof === undefined ? {} : { provedBy: proof.how }),
    ...(provedHolder === undefined ? {} : { provedHolder }),
    // WHO AN AGENT'S KEY PROVED, for the resolver's step 1 (criterion I2) through `participantForActor`.
    // A handle freed by a retirement can be a retired legacy agent's id as well (criterion I3), and the
    // key is what tells the agent sending that handle apart from the one whose id it is.
    ...(proof?.how === 'an-agent-key' ? { keyHolder: proof.whoseId } : {}),
    ...(agentKeyRow === undefined ? {} : { agentKeyRow }),
    ...(boundRunKey === undefined || !boundRunKey.newest ? {} : { runKeyFor: boundRunKey.run }),
    ...(ownKeyRun === undefined ? {} : { ownKeyRun }),
    // A SEALED RUN'S OWN KEY, ON ITS OWN RECORD: `patchRecord` takes nothing but its `served`.
    ...(proof?.sealedRun === undefined ? {} : { sealedRunsOwnKey: proof.sealedRun }),
    // A FINISHED RUN'S OWN KEY, FOR FIFTEEN MINUTES, ON THE THREE ACTS OF ITS END: `patchRecord`
    // takes nothing but its `usageReceipt` and `createRecord` nothing but a message about it.
    ...(proof?.finishedRun === undefined ? {} : { finishedRunsOwnKey: proof.finishedRun }),
    ...(window === 'covered' && sentBy === THEIR_OWN_PROGRAM ? { theKeyWindowCovers: true } : {}),
    ...(sentBy === THEIR_OWN_PROGRAM ? {} : { sentFrom: sentBy }),
  }
  // THE ONE PLACE EVERY WRITING ROUTE PASSES, so a made-up agent id is refused here rather than at
  // each door. See this function's own note above.
  refuseAnUnregisteredAgentOnAWrite(req, actor)
  // AND A REQUEST IN THE NAME OF AN AGENT REGISTERED WITH NO KEY OF ITS OWN, WITHOUT A RUN KEY. Asked before the
  // close's refusals, so the caller is told which keys a request in such an agent's name needs.
  refuseARequestWithNoRunKeyForAnAgentWithNoKeyOfItsOwn(req, actor)
  // AND AFTER THE CLOSE, A WRITE WITH NO KEY, whatever it claimed (findings 79 and 82). Asked after
  // the registration refusal, so an unregistered caller still learns that first.
  refuseAKeylessWriteAfterTheClose(req, actor, window)
  /**
   * AND A REQUEST THAT NAMES THE PERSON WITH NO KEY IS THE PERSON ONLY WHERE A REQUEST THAT NAMES NOBODY WOULD BE: while the open key
   * window covers it and this computer's own program sent it. Any other such request is refused with the same
   * sentence, which says what to send; the doors to a
   * key still pass, so an unpaired browser can still pair. Their page names them on every fetch and carries the pairing
   * cookie once paired, and the cookie is a key, so a paired page never reaches this. Not asked where no listener
   * carried the request: a call inside the office's own program is the office itself (P83 point 1).
   */
  if (
    asserted.type === 'human' &&
    proof === undefined &&
    from !== undefined &&
    !(window === 'covered' && sentBy === THEIR_OWN_PROGRAM)
  ) {
    refuseARequestNobodyProved(req, actor)
  }
  /**
   * AND A READ WITH NO KEY UNDER AN AGENT'S NAME, AFTER THE CLOSE, IS REFUSED, except at
   * the doors a caller uses to get a key, where it is a request that named nobody (finding 79). The agent's name
   * counts only with the agent's key now.
   *
   * IT IS NOT STAMPED AS THE RESOLVED ACTOR. The request that named nobody is written as the person,
   * and the call log and the request line read the stamped actor; stamping it here would write the
   * person's name on a call an agent made. Left unstamped, both write what the headers said, and the
   * call log marks it as a claim nobody checked.
   */
  /**
   * ONLY A READ IS TURNED. A write that reaches here after the close came through a door to a key with
   * an agent's name (every other keyless write was refused above), and it stays written under the name
   * it gave: turning it would write the person's name on an agent's act (the inspector's refusal of
   * 26 September 2026). The call log marks it as a claim no key proved.
   */
  if (window === 'closed' && actor.type === 'agent' && theActThisRouteIsGatedAs(req)?.effect === 'read') {
    /**
     * AND OUTSIDE THE DOORS TO A KEY IT IS REFUSED. Answered as a request that named nobody,
     * it was the person, so any program could read every message by sending an agent's name with no key. The
     * refusal names the key and the two headers to send.
     */
    refuseARequestNobodyProved(req, actor)
    return { ...HUMAN, sessionId: null, stated: false, from }
  }
  return stampActor(req, actor)
}

/**
 * DID THE KEY PROVE THE VERY AGENT THE HEADERS NAMED? Criterion I5.
 *
 * TWO CALLERS ASK IT, SO THE TWO CANNOT DISAGREE. `actorFrom` above, for `provedHolder`, and
 * `refuseAnAgentsKeyUnderAnotherName` in lib/keyheader.ts, which refuses an agent's key under another
 * agent's name on every request.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT `provedHolder` IS FOR, AND WHAT IT MUST NOT BECOME
 * ---------------------------------------------------------------------------------------
 *
 * One agent's key under another agent's name is refused now, and the change log still draws a line
 * for the rows written before that. A difference of SPELLING is neither: an agent whose key was
 * bound to its id and which sends its handle on the request is one agent said two ways. Refusing it
 * would stop almost every agent's work, and marking its writes as somebody else's would put that line
 * on almost every row and make it mean nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE STEPS, IN THIS ORDER
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE SAME CHARACTERS SETTLE IT, and that is the ordinary case: the office's own key under the
 *      office's own name, and every agent registered before the mint. Nothing is looked up.
 *   2. ONLY AN AGENT'S KEY IS RESOLVED FURTHER. The person's key names the person and the office's
 *      key names the office; neither is an agent whose name could be spelt two ways, and asking the
 *      registry about them would be asking a question about an agent that is not there.
 *   3. AND THEN THE TWO ARE ASKED WHICH AGENT THEY NAME. `sameAgent` is the one reader of that
 *      question in this product — the five governance guards in lib/records.ts ask it too — so the
 *      change log and the guards cannot come to disagree about who wrote a row.
 *
 * IT MAY REFUSE, AND THAT IS THE HONEST ANSWER. `sameAgent` raises a 409 when the name the headers
 * gave means two agents, which is one agent's id and another live agent's handle. A request that
 * carries a key AND a name nobody can resolve is not something to write a row about either way.
 */
export function theKeyProvedTheNameTheHeadersGave(proof: KeyProof, type: string | undefined, id: string): boolean {
  if (proof.whoseId === id) return true
  if (proof.how !== 'an-agent-key' || type !== 'agent') return false
  // THE KEY GOES WITH THE NAME, so the name is resolved the way the request's own actor will be: a
  // handle that is also a retired legacy agent's id is settled by the key rather than refused.
  return sameAgent(
    { actorType: 'agent', actorId: proof.whoseId },
    { type: 'agent', id, sessionId: null, keyHolder: proof.whoseId },
  )
}

/**
 * WHAT THE KEY WINDOW MAKES OF ONE REQUEST. `theHeaderWindowCovers` answers one of four words.
 *
 *   - `not asked`: a key proved the caller, or no listener carried the request. The window is about
 *     a claim with no key that a listener carried, and neither is one.
 *   - `covered`: the window is open and the request came from this machine or a trusted machine.
 *   - `not covered`: the window is open and the request came from a machine this office does not
 *     trust. Nothing is refused for that here; the doors that keep an act for them refuse it.
 *   - `closed`: the person has closed the window, so this claim with no key is nobody.
 */
export type WhatTheWindowMakesOfIt = 'not asked' | 'covered' | 'not covered' | 'closed'

/**
 * WHETHER THE ONE-VERSION HEADER WINDOW COVERS THIS REQUEST. Criterion P83, point 6.
 *
 * A header claim with no key still counts when the request came from loopback OR from a machine on
 * the trusted list (P73). Their phone, their MacBook and their browser come in by the trusted list
 * and can hold no key yet.
 *
 * IT COVERS EVERY CLAIM, the person's and an agent's. Point 6 says the window
 * "covers every caller the office trusts today", and the secretary's tools and every agent's hooks are
 * among those callers. Until the close an agent's claim with no key is taken as that agent, as it
 * always was, and afterwards it is nobody, as the person's is.
 *
 * THE RULE IS ABOUT A REQUEST A LISTENER CARRIED. `from` is undefined for an in-process caller — a
 * migration, a script, `app.inject()` — and that is the office itself, so this answers `not asked`.
 *
 * WHICH MACHINE ASKED IS THE LISTENER'S STAMP AND NOTHING ELSE. The loopback half reads the stamp;
 * the trusted half reads the trusted list by the caller's address, which is the second thing a
 * guard may read (lib/http.ts's `callerAddressOf`). Nothing here reads a header the caller could
 * use to move the stamp.
 *
 * AND ONLY WHILE THE WINDOW IS OPEN. The person closes it with one press, recorded in the
 * installation row, and from then on a listener-carried claim with no key is nobody from this
 * computer and from a trusted machine alike. The close is read here and nowhere else in `actorFrom`:
 * the actor carries `theKeyWindowCovers` for a covered request, and the refusal of a write with no
 * key reads the `closed` this answers. `thePersonIsProved` in records.ts reads `theKeyWindowCovers`
 * and never asks the window again.
 */
function theHeaderWindowCovers(
  req: FastifyRequest,
  from: Arrival | undefined,
  provedByAKey: boolean,
): WhatTheWindowMakesOfIt {
  if (provedByAKey) return 'not asked'
  if (from === undefined) return 'not asked'
  // `theKeyWindowIsClosed` reads the installation row through a process cache, so this costs a map
  // lookup and not a database read on every listener-carried caller who has no key.
  if (theKeyWindowIsClosed()) return 'closed'
  if (from === 'this machine') return 'covered'
  return thisOfficeTrusts(callerAddressOf(req)) ? 'covered' : 'not covered'
}

/**
 * WHO SENT A CLAIM TO BE THE PERSON THAT THE WINDOW WOULD COVER FROM THIS MACHINE. Nothing that comes from a sandbox is
 * the person, and the office finds that out itself (lib/from-a-sandbox.ts). Asked only when the
 * window would cover the claim and the request arrived on the listener for this machine; any other request is not
 * asked, and answers as their own program so nothing else about it changes.
 */
function whoSentAClaimToBeThem(req: FastifyRequest, from: Arrival | undefined, window: WhatTheWindowMakesOfIt): TheSender {
  if (!aClaimToBeThemIsAsked(from, window)) return THEIR_OWN_PROGRAM
  return whoSentItFromThisComputer(req)
}

/** Whether a claim to be the person is asked who sent it: only when it came from this machine and the window covers it. */
function aClaimToBeThemIsAsked(from: Arrival | undefined, window: WhatTheWindowMakesOfIt): boolean {
  return window === 'covered' && from === 'this machine'
}

/**
 * WHETHER `actorFrom` WILL ASK WHO SENT THIS REQUEST, worked out before the handler and from the same facts. It asks
 * for a request that came from this machine, that the window covers, that no key proved, and that named the person or
 * sent no name at all. An agent's own keyless claim is not asked. A key that proves anybody is not asked either, so
 * this reads the key last.
 */
export function actorFromWillAskWhoSentIt(req: FastifyRequest): boolean {
  const from = arrivalOf(req)
  if (!aClaimToBeThemIsAsked(from, theHeaderWindowCovers(req, from, false))) return false
  if (suppliedActorHeaders(req).length > 0) {
    const type = req.headers[ACTOR_HEADERS.type]
    if (typeof type !== 'string' || type.trim() !== 'human') return false
  }
  return howThisRequestProvedItself(req) === undefined
}

/**
 * THE DOORS THAT NEVER ASK WHO SENT A REQUEST, so nothing is read for them. `mole-office start`, `status` and `stop`
 * ask health with no key and wait three seconds for each answer, and the owner's name is the window's page's first
 * read. A door named here that came to ask would be refused in words, because nothing was read first
 * (lib/from-a-sandbox.ts).
 */
const THE_DOORS_THAT_NEVER_ASK: ReadonlySet<string> = new Set<OperationName>(['runtime.health', 'office.owner'])

/**
 * Whether the door a request matched never asks who sent it: one named above, or an address that declares no
 * operation. Those are the app's own files, its page, and an /api address that matches no door.
 */
function aDoorThatNeverAsks(req: FastifyRequest): boolean {
  const config: unknown = req.routeOptions?.config
  const operation = typeof config === 'object' && config !== null ? (config as { operation?: unknown }).operation : undefined
  return typeof operation !== 'string' || THE_DOORS_THAT_NEVER_ASK.has(operation)
}

/**
 * READ WHO SENT A REQUEST BEFORE ITS HANDLER, by the way that does not hold the server's thread, wherever the probe
 * reads that way and `actorFrom` would ask. Inside the installed Windows app the answer runs PowerShell, which took
 * about four and a half seconds when it was measured, and it is kept on the socket for the handler
 * (lib/from-a-sandbox.ts).
 *
 * IT IS READ AT EVERY DOOR THAT MAY ASK, NOT AT A LIST OF THE DOORS THAT DO. While the key window is open every door
 * counts a keyless request from this machine as the person, and the window's page sends such requests to many doors,
 * so a list of the doors that ask would leave some of them refusing the person. Only the doors that never ask are
 * named (`aDoorThatNeverAsks`). The cost: another door whose handler never asks reads the connection once too. That
 * happens only inside the installed Windows app, while the key window is open, for a keyless request that names the
 * person or nobody, and once for each connection.
 *
 * A READING IS WAITED FOR ONLY SO LONG. One that runs past its time is refused in words, so a door that asks answers
 * within that time (`THE_LONGEST_A_READING_WAITS` in lib/from-a-sandbox.ts).
 *
 * Anywhere the probe has no way that waits, nothing is read here, and the handler asks as it always did.
 */
export async function readWhoSentAClaimToBeThemFirst(req: FastifyRequest): Promise<void> {
  if (!theSenderIsReadByTheWayThatWaits()) return
  if (aDoorThatNeverAsks(req)) return
  if (!actorFromWillAskWhoSentIt(req)) return
  await readWhoSentItFromThisComputer(req)
}

// ------------------------------------------------------------- the words this request acts on

/**
 * THE ACTOR, PLUS THE PERSON'S OWN WORDS IT ACTS ON, when the request carries any.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES, AND WHY EACH REFUSAL IS LOUD
 * ---------------------------------------------------------------------------------------
 *
 * A warrant reaches a route in one place: the body field the route declares. `x-mole-office-warrant`
 * is refused by `refuseTheOldWarrantHeader`, which `actorFrom` calls, because a header cannot carry the
 * owner's own Chinese sentences at all — see `WARRANT_HEADER` above for the measurement and for why
 * the header went instead of gaining an encoding.
 *
 * A PERSON'S OWN REQUEST IS REFUSED A WARRANT, and that is the rule this function exists to state.
 * A warrant is an agent saying *I am acting on what you said*. A person acting is acting for
 * themselves and needs nobody's words, so a warrant on their request is either a mistake or a
 * browser bug, and the act would afterwards be marked *on the owner's words* — which would make their
 * own press look like somebody else's. Refusing it is what keeps that mark meaning one thing.
 *
 * A WARRANT THAT DOES NOT NAME THIS RECORD IS REFUSED, AND `actingOn` IS WHERE THAT COMES FROM. It
 * is the id in the URL, so which act a warrant is being spent on is a fact about the request rather
 * than something the warrant says about itself.
 *
 * EVERYTHING ELSE `readWarrant` REFUSES is refused there, in @shared/warrant.ts, so the browser and
 * the server judge a warrant by one reading.
 */
export function actorWithTheWordsItActsOn(req: FastifyRequest, fromBody: unknown, actingOn: string, options?: WhatActorFromAsks): Actor {
  const actor = actorFrom(req, options)
  const sent = fromBody
  if (sent === undefined) return actor

  if (actor.type === 'human') {
    throw new PanelError(
      `This request carries a warrant and it came from a person. Nothing was written. A warrant is an agent ` +
        `saying it is acting on what somebody else said; a person's own write needs none and is never marked ` +
        `as made on anybody's words. Send the write again without the warrant — it is allowed exactly as it ` +
        `was.`,
    )
  }

  const read = readWarrant(sent, {
    knownPerson: HUMAN.id,
    now: nowStamp(),
    // WHICH RECORD THIS ACT IS ON, taken from the URL and never from the warrant. A warrant that
    // does not name it is refused: see `Warrant.for` in @shared/warrant.ts for the reproduction.
    actingOn,
    placeExists: theCitedPlaceExists,
    // AND WHETHER A NEW WARRANT MAY CITE IT, once the key window is closed.
    whyThePlaceMayNotBeCited: whyTheCitedPlaceMayNotBeCited,
  })
  if (read.refusal !== undefined) throw new PanelError(read.refusal, 403)
  return { ...actor, warrant: read.warrant }
}

/**
 * THE WARRANT A REQUEST'S BODY CARRIES, READ ALONE, for a door that asks who the caller is before it reads the rest of
 * its body: the doors of their settings the office keeps outside its records, which open to a secretary on their
 * words. `actorWithTheWordsItActsOn` judges what this hands it, and the
 * door's own schema reads the whole body after its guard, so a caller it refuses is told who may before anything about
 * the body. The act a warrant there names in `for` is the door's own name, as its route declares it (office.set-key):
 * a setting has no record id.
 */
export function theWordsInTheBody(req: FastifyRequest): unknown {
  const body = req.body
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return undefined
  return (body as Record<string, unknown>)['warrant']
}

// ---------------------------------------------------------------------------- which project

/** What a request said about which project it is working in. */
export interface WorkspaceClaim {
  /** The workspace id to use: what the header said, or the stated default. */
  id: string
  /** True when the caller named it. False when it took the default. */
  stated: boolean
}

/**
 * Which project this request means.
 *
 * ATTRIBUTION-SHAPED, LIKE `actorFrom`, AND CHECKED THE SAME WAY: a name that almost matches is
 * refused, a repeat is refused, and a value that is present and blank is refused. What it does NOT
 * do is decide whether that workspace exists — that needs the database, and this file opens none.
 * `requireWorkspace` in lib/workspaces.ts is the gate, and every route goes through it.
 *
 * THE HEADER REFUSALS RUN EVEN ON A READ. `actorFrom` is called only by writes and by the two
 * anchor routes, because a read nobody is identified for is filed against nobody and there is
 * nothing to attribute wrongly. A workspace is different: a read is an ANSWER ABOUT a project, so a
 * misspelt workspace header on a GET would quietly answer about the wrong one, and the caller
 * would have no way to tell. So every route reads its workspace through this, reads and writes
 * alike.
 */
export function workspaceFrom(req: FastifyRequest): WorkspaceClaim {
  refuseMisspeltActorHeaders(req)
  refuseRepeatedActorHeaders(req)
  refuseBadTraceHeaders(req)

  const raw = headerValue(req, WORKSPACE_HEADER)
  if (raw === undefined) return stampWorkspace(req, { id: DEFAULT_WORKSPACE, stated: false })
  const value = raw.trim()
  if (value !== '') return stampWorkspace(req, { id: value, stated: true })
  throw new PanelError(
    `${WORKSPACE_HEADER} was sent with an empty value. A header that is present and blank is refused rather ` +
      `than read as absence: an unset variable in a client's header template produces exactly this, and reading ` +
      `it as absence would file this request under "${DEFAULT_WORKSPACE}" rather than the project you meant. ` +
      `Send a real workspace id, or leave the header off entirely — a request that sends none is answered from ` +
      `"${DEFAULT_WORKSPACE}", and GET /api/workspaces lists what there is to choose from.`,
  )
}

// ---------------------------------------------------------------------------- which machine asked

export { ARRIVED_FROM } from '@shared/arrival-of.ts'

export { WHO_THE_SOCKET_IS } from './caller-address-of.ts'

/**
 * WHOSE ADDRESS THE SOCKET CARRIES, which is not the same question as which door a request came
 * through, and which is why a door has to say both.
 *
 * Mole Office opens two kinds of door for another machine and `req.ip` means opposite things on them.
 * A door on 127.0.0.1 for a private network daemon to pass requests through sees the daemon, so
 * `req.ip` is `127.0.0.1` and the caller is whatever the daemon wrote in `x-forwarded-for`. A door
 * bound to the address other machines reach this computer at has nothing in between, so `req.ip` is
 * the caller and there is no forwarded header to read.
 *
 * Reading `req.ip` on the first would record `127.0.0.1` for a machine that is not this one; reading
 * `x-forwarded-for` on the second would record nothing for a machine whose address was in hand. Both
 * are the same defect — a value worked out from the wrong fact — and only the door knows which.
 */
export type WhoTheSocketIs = 'the caller' | 'a proxy on this computer'

export type { Arrival }

/**
 * Record which door a request came through, and whose address that door's socket carries. THE ONLY
 * THING THAT MAY WRITE EITHER.
 *
 * Every listener Mole Office opens calls this, with its own two words, before the request is routed.
 * Written as a function rather than as an assignment at each listener so that there is one cast and
 * one place where the symbols are written — a second listener that assigned them itself could get a
 * key subtly wrong and would then be a door that reads as unclassified while looking correct.
 *
 * BOTH WORDS ARE REQUIRED, and that is the point of putting them in one call. A door that answered
 * only the first question would leave `callerAddressOf` guessing which kind it was, and the guess
 * would be wrong for exactly one of the three doors — silently, because an address is never checked
 * against anything.
 *
 * `IncomingMessage`, not `FastifyRequest`: the stamp goes on the raw Node request, because that is
 * the object a listener holds and it is the object that exists before Fastify has made anything.
 */
export function stampArrival(raw: IncomingMessage, arrival: Arrival, socketCarries: WhoTheSocketIs): void {
  ;(raw as unknown as Record<symbol, Arrival>)[ARRIVED_FROM] = arrival
  ;(raw as unknown as Record<symbol, WhoTheSocketIs>)[WHO_THE_SOCKET_IS] = socketCarries
}

export { whoTheSocketIs } from './caller-address-of.ts'

export { arrivalOf } from '@shared/arrival-of.ts'

/**
 * Was this request carried by a real network connection?
 *
 * The honest way to ask "could a listener have seen this?". A request built in-process has a mock
 * socket or none at all; a request off the wire has a `net.Socket`. `instanceof` rather than a duck
 * test on some property, because a mock is written to look like the real thing and a property test
 * would be asking the mock whether it is a mock.
 */
function isOnARealSocket(req: FastifyRequest): boolean {
  return req.raw?.socket instanceof Socket
}

/**
 * Refuse a request that came in on a network connection no listener of ours classified.
 *
 * ---------------------------------------------------------------------------------------
 * WHY 500 AND NOT 403
 * ---------------------------------------------------------------------------------------
 *
 * A 403 says *you may not do this*, which is a claim about the caller. This is not about the caller.
 * It says Mole Office cannot answer the question its authority model is built on, which is the fourth
 * invariant — fail loudly on a broken assumption rather than pick the permissive answer. The reply
 * says so in those words, because a person meeting it has done nothing wrong.
 *
 * IT CANNOT HAPPEN TODAY. There is one listener and it stamps. This exists so that the day somebody
 * adds a second door, the door is refused until it says which side it is on — rather than every
 * request through it being silently promoted to the authority a local caller has.
 *
 * AN IN-PROCESS CALLER PASSES, AND BY NAME. It has no socket, so no listener could have stamped it,
 * so its unstamped state is the truth rather than a gap. That is the case this function must not get
 * wrong: `app.inject()` is how the whole test suite reaches the product, and a rule that read "no
 * arrival means refuse" would refuse all of it.
 */
export function refuseAnUnclassifiedDoor(req: FastifyRequest): void {
  if (arrivalOf(req) !== undefined) return
  if (!isOnARealSocket(req)) return
  throw new PanelError(
    `Mole Office could not tell which door this request came through. It arrived on a network connection that ` +
      `none of Mole Office's listeners stamped, so nothing can say whether it came from this machine or ` +
      `another one, and Mole Office will not guess. Nothing was done. This is a fault in Mole Office, not in your ` +
      `request.`,
    500,
  )
}

export { callerAddressOf } from './caller-address-of.ts'

// ------------------------------------------------------ what permission took off this reply

/**
 * EVERY ANSWER SAYS WHETHER PERMISSION NARROWED IT, AND FROM THIS COMMIT THE ANSWER IS `null`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A FIELD THAT IS ALWAYS NULL IS WORTH A HOOK
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/projections.md` §7.2: *a reply may be narrowed by what the caller asked
 * for, by a size budget, or by permission — and by nothing else. Every narrowing is declared in the
 * same reply, as structure.* Two of those three causes already have somewhere to be declared.
 * Permission has not, because until the second listener exists no caller has less permission than
 * any other, so nothing narrows and there is nothing to declare.
 *
 * The moment a caller can have less, a reply that quietly carries fewer members is a SILENT
 * SUBTRACTION: a reader gets a shorter list and a complete-looking answer, and cannot tell the
 * difference. §7.2 would then have to forbid scoped reads outright rather than bound them.
 *
 * So the field lands FIRST, over the whole surface, saying `null` — *permission took nothing off
 * this*. A reader that has learnt to check it will find it on every route on the day one of them
 * starts saying something else. Adding it later, route by route, is the same promise with 144
 * chances to forget and nothing that notices.
 *
 * ---------------------------------------------------------------------------------------
 * ONE HOOK AND NOT 144 HANDLERS, WHICH IS A DEPARTURE FROM THE PLAN'S FILE LIST AND IS SAID SO
 * ---------------------------------------------------------------------------------------
 *
 * The build plan's step 3 names *every route file*. One hook is one place a reader can check and
 * one place a rule can be wrong, and `tests/every-reply-says-what-permission-took.test.ts` drives
 * the registered route table rather than a list somebody typed. A field written into 144 handlers
 * is the same fact in 144 places, which is the defect this codebase names as its own — and no test
 * over it could be stronger than the list it was written from.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT TOUCH, AND EACH EXCLUSION IS A RULE RATHER THAN A CONVENIENCE
 * ---------------------------------------------------------------------------------------
 *
 * · **Anything that is not a JSON object.** `preSerialization` only runs when Fastify is about to
 *   serialize a payload, so a file's bytes, a stream and a string reply never reach here. An array
 *   reply is left alone too: there is nowhere on an array to put a field, and inventing a wrapper
 *   would change every one of those routes' shape for a value that is null.
 * · **A refusal.** Status 400 and above is not an answer that was narrowed; it is no answer. A 403
 *   carrying *permission took nothing off this* would be a sentence about a thing that did not
 *   happen.
 * · **A reply that already says.** A route that computes its own narrowing keeps it. The hook fills
 *   in absence and never overwrites, so the day a real subtraction lands it is the handler's word
 *   that ships.
 */
export function sayWhetherPermissionNarrowedIt(app: FastifyInstance): void {
  app.addHook('preSerialization', async (_req, reply, payload: unknown) => {
    if (reply.statusCode >= 400) return payload
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return payload
    if (NARROWED_BY_PERMISSION in payload) return payload
    return { ...(payload as Record<string, unknown>), [NARROWED_BY_PERMISSION]: null }
  })
}

// ---------------------------------------------------------------------------- validation

/** Moved to src/shared/zod-words.ts, so a tool that posts to a door can say what the door would say; re-exported here for the routes. */
export { explain }

export { parse } from './parse.ts'

/**
 * Refuse a body on a route that takes none, naming the keys that were sent.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS SHARED AND NOT WRITTEN PER ROUTE
 * ---------------------------------------------------------------------------------------
 *
 * Fastify parses a JSON body and hands it to the handler whether or not the route wants one, and
 * this server declares no route-level schemas at all — every check is a `parse()` call inside a
 * handler, which means a route is guarded only if its author remembered. Measured 2026-08-12 by
 * sending `{"totalNonsense":42}` to all 31 non-GET routes: 21 refused it and TEN took it.
 *
 * The worst of the ten is the one that reads as a safety net. `POST /api/import` publishes "Takes
 * NO BODY" and answers `{"dryRun":true}` with 200, `applied: true`, and a row overwritten — a
 * destructive import run by a request whose entire content asked it not to. `POST /api/export`
 * publishes the same sentence and wrote 452 files while ignoring a `destination` it was handed.
 *
 * THE ANSWER IS TO MAKE THE SENTENCE TRUE, NOT TO HONOUR THE KEY. `GET /api/import` is already the
 * dry run and both answers come out of one `buildPlan`, deliberately, so that the safe reading
 * "cannot be reached by accident from a request that was meant to be safe". Adding `dryRun` to the
 * POST would reverse a recorded decision, and the measured 200 above is that decision's own
 * argument coming true.
 *
 * `.nullish()` is not decoration. src/server/index.ts installs a JSON parser that turns an empty or
 * whitespace-only body into `undefined` on purpose, so a plain `strictObject({})` would refuse the
 * ordinary bodyless request this route is FOR. Shaped after `reindexBody` in api/source.ts, which
 * had this right and was the only route of the three that changed nothing important.
 */
export function takesNoInput(
  req: { body?: unknown; query?: unknown },
  endpoint: string,
  because: string,
): void {
  parse(takesNoBody(endpoint, because), req.body, 'The request body is not usable:')
  parse(takesNoBody(endpoint, because), req.query, 'The query string is not usable:')
}

/**
 * The schema behind `takesNoInput`. Prefer that — it checks BOTH ways in, and there are two.
 *
 * THE FIX WENT IN ON THE BODY AND THE SAME INCIDENT SURVIVED IN THE QUERY STRING. Measured by an
 * agent asked to break it, hours after the body half shipped:
 *
 *     POST /api/import?dryRun=true   ->   200 {"ok":true,"applied":true,...}
 *
 * which is the destructive import running under a request whose entire content asked it not to —
 * the exact sentence written in the commit that closed the body half. `POST /api/export?destination=`
 * wrote 518 files to the configured root and ignored the key, while the body form quotes it back and
 * refuses. Guarding one of two doors and writing down that the door is shut is worse than guarding
 * neither, because the next person reads the note.
 */
export function takesNoBody(endpoint: string, because: string) {
  return z
    .strictObject(
      {},
      {
        error: (issue) =>
          issue.code === 'unrecognized_keys'
            ? `${endpoint} takes no body. ${because} This request carried ` +
              `${issue.keys.map((k) => `"${k}"`).join(', ')}, and nothing was done — a key this endpoint does not ` +
              `read is a caller believing something about it that is not true, and answering 200 would confirm it.`
            : undefined,
      },
    )
    .nullish()
}

// ---------------------------------------------------------------------------- shape helpers

/**
 * Widen a database row into the shared `Change` type.
 *
 * SQLite has no enum column type, so `op` and `actorType` come back as plain strings. The
 * narrow union is enforced on the way in, in records.ts, which is why widening here is safe.
 */
export function toChange(row: ChangeRow, origin: RecordOrigin | null): Change {
  return { ...row, op: row.op as ChangeOp, actorType: row.actorType as ActorType, origin }
}

/**
 * A page of change rows as they are SERVED, each carrying the provenance of the record it is about.
 *
 * THE ONE PLACE ROWS BECOME SERVED CHANGES. `toChange` widens one row and now requires an origin,
 * so a caller cannot forget it — it can only pass the wrong one, which is why every caller goes
 * through here instead. `changeOrigins` does ONE query for the records a page mentions rather than
 * one per row: 200 rows over 56 records was the measurement on the live corpus.
 *
 * A row about a record that is no longer there gets null, which is honest — there is nothing left
 * to ask. That is the same null as "nobody stamped it", and it is fine here in a way it was not on
 * a session row: a change row always names a record, so there is no second meaning to confuse it
 * with.
 */
export function toChanges(rows: readonly ChangeRow[]): Change[] {
  const origins = changeOrigins(rows)
  return rows.map((row) => {
    const change = toChange(row, origins.get(row.recordId) ?? null)
    // WHETHER THE KEY PROVED THE ROW'S OWN WRITER, only on a row that stores a holder. The page cannot tell this
    // itself, because the names it reads carry no old ids; a row without the answer draws as before.
    if (row.provedHolder === null || row.provedHolder === undefined) return change
    return { ...change, provedHolderIsTheWriter: theKeyProvedTheRowsOwnWriter(sqlite, { type: row.actorType, id: row.actorId }, row.provedHolder) }
  })
}

// ---------------------------------------------------------------------------- errors

/**
 * SQLite constraint violations reach us as exceptions from better-sqlite3. They are the
 * caller's problem, not a server fault, so they must not become a 500 that says nothing.
 *
 * THE (workspace_id, title) BRANCH BELOW IS UNREACHABLE ON A DATABASE THAT IS UP TO DATE, and that
 * is the whole reason it still exists. `records_title_idx` was UNIQUE(workspace_id, title) from the
 * first migration until 17 August 2026; the migration `drizzle/0030_titles_may_repeat` makes it a
 * plain index, because a title may repeat — an id is what tells two records
 * apart. So SQLite can only still refuse a repeated title on a database that has not had that
 * migration applied. The reply says exactly that, and says which command applies it. It is not the
 * caller's mistake and there is nothing they can change about their request to get past it.
 *
 * ONLY A UNIQUE VIOLATION IS READ THIS WAY. `records.title` is also NOT NULL, and a NOT NULL
 * failure carries the same column name in its message. Answering that one with a sentence about a
 * missing migration would be a confident wrong diagnosis, so the code has to say UNIQUE too.
 */
function constraintMessage(err: unknown): string | null {
  const code = (err as { code?: unknown }).code
  if (typeof code !== 'string' || !code.startsWith('SQLITE_CONSTRAINT')) return null
  const raw = err instanceof Error ? err.message : String(err)
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' && (raw.includes('records.title') || raw.includes('records_title_idx'))) {
    return (
      'This database still refuses two records with the same title, and Mole Office no longer does. ' +
      'The migration drizzle/0030_titles_may_repeat has not been applied here, so a second record ' +
      'of this title cannot be stored yet. Run npm run db:migrate. Nothing was written.'
    )
  }
  return `The database rejected this write: ${raw}`
}

/**
 * One exception-to-response mapping for the whole server.
 *
 * - PanelError carries its own status and a message written for a person: pass both through.
 * - A zod error that escaped `parse` is still bad input: 400.
 * - A constraint violation is bad input too: 409 (conflict), with the reason.
 * - Fastify's own client errors (malformed JSON, missing content-type) already carry a 4xx.
 * - Anything else is a bug in this server: 500, generic message to the client, real error and
 *   stack in the server log. It is never reported as success.
 */
export function installErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    const privateLogin = isPrivateLoginRequest(req.url)
    if (privateLogin) reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer')
    // This guard supplies a fixed act and the registered route template, never private request data.
    // Preserve its exact refusal through the normal serializer; every other private error stays redacted.
    const safeReachRefusal = err instanceof PanelError && err.status === 403 && err.code === 'keptOnTheOfficesComputer'
    if (privateLogin && !safeReachRefusal) {
      // Parser failures and pre-handler failures also cross this boundary, without raw diagnostics.
      const code: PrivateLoginRefusalCode = err instanceof PanelError && Object.hasOwn(PRIVATE_LOGIN_REFUSAL_CODES, err.code ?? '') ? err.code as PrivateLoginRefusalCode : 'privateLoginShape'
      const status = err instanceof PanelError ? err.status : typeof (err as { statusCode?: unknown }).statusCode === 'number' ? (err as { statusCode: number }).statusCode : 500
      const answer = { error: enWave13q[`server.${code}`], code, values: {} }
      return reply.status(status).send(answer)
    }

    if (err instanceof PanelError) {
      // COUNT THE REFUSAL AFTER EVERY TRANSACTION OF THE REQUEST: gate-counts.ts holds it until then.
      countARefusalItsWriteTookBack(err)
      // The English error stays intact for agents and logs. A code and its values let the page
      // read its sentence from the word lists. Older refusals still draw their English error.
      // `reason` is the same refusal in ONE SHORT SENTENCE, written beside the long one by the door
      // that refused. The box on the screen draws it and keeps the long one one press away; a
      // refusal that has none is drawn in full, as every refusal was before this existed.
      // `elsewhere` goes with them when it is set, and it is the one part of a refusal that is not
      // prose: it is the two facts the browser needs to draw "Open it in Greenhouse" as a button
      // rather than as an instruction. See the PanelError docstring.
      return reply.status(err.status).send({
        error: err.code !== undefined && Object.hasOwn(savedWords(), `server.${err.code}`) && readRefusal(err.code, err.values) !== null
          ? readStoredWord(`server.${err.code}` as WordKey, err.values)
          : err.message,
        ...(err.code === undefined ? {} : { code: err.code, values: err.values }),
        ...(err.reason === undefined ? {} : { reason: err.reason }),
        ...(err.detail === undefined ? {} : { detail: err.detail }),
        ...(err.elsewhere === undefined ? {} : { elsewhere: err.elsewhere }),
        ...(err.recorded === undefined ? {} : { recorded: err.recorded }),
      })
    }
    if (err instanceof z.ZodError) {
      return reply.status(400).send({ error: explain(err) })
    }
    const constraint = constraintMessage(err)
    if (constraint) {
      req.log.warn({ err }, 'database constraint rejected a write')
      return reply.status(409).send({ error: constraint })
    }
    // Fastify types the thing thrown as unknown, because any value can be thrown in
    // JavaScript, so its status has to be read defensively rather than assumed.
    const status = (err as { statusCode?: unknown }).statusCode
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.status(status).send({ error: err instanceof Error ? err.message : String(err) })
    }
    req.log.error({ err }, 'unhandled error')
    return reply.status(500).send({ error: 'internal error' })
  })
}
