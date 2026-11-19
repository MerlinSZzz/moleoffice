// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { addedRoles, removedAddedRoleNames } from '../lib/added-roles.ts'
import { theShippedRoleCards } from '../lib/roles.ts'
/**
 * THE ROLE CARDS, AND THE COPIES OF THEM A PERSON READS INSIDE MOLE OFFICE.
 *
 * ---------------------------------------------------------------------------------------
 * TWO ROUTES AND ONE AUTHORITY
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P12 of design/permissions/ACCEPTANCE.md, on answer 2: sum up the role cards needed now.
 * *Each of the five cards is one thing a person can read, and the card
 * and the enforcement cannot disagree.*
 *
 * `design/permissions/roles.json` is the only authority. `GET /api/roles` serves it, together with
 * the record mirroring each card in this project and whether that copy still matches.
 * `POST /api/roles/mirror` writes the copies and rewrites the stale ones.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS A COPY AT ALL, AND WHY IT IS NOT KEPT IN STEP BY HAND
 * ---------------------------------------------------------------------------------------
 *
 * The owner's standing rule is that writing meant for them is published inside Mole Office, not in a file they
 * has to open a checkout to read. A card is exactly that sort of writing. So each one is also a
 * record: findable, linkable, and readable on a page like anything else.
 *
 * That makes one fact live in two places, which is the defect this repository keeps producing. Of
 * the three answers CLAUDE.md allows, this takes the third: something fails when they disagree. The
 * read below compares every copy to the declaration and says which are out of date, and
 * `tests/a-role-card-is-readable-in-mole-office.test.ts` fails when a copy drifts unreported.
 *
 * ---------------------------------------------------------------------------------------
 * THE COPY GRANTS NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * Editing one of these records changes no permission and the next mirror overwrites it. Nothing
 * anywhere reads a `role_card` record to decide whether to refuse a request; the gate reads the
 * declaration. That is stated on the kind, in the reply, and here, because a card sitting in the
 * place a reader trusts to say what the rules are would otherwise be taken for the rules.
 */

import { theChaptersOfTheCards } from '../lib/chapters.ts'
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import { z } from 'zod'

import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import {
  createRecordWithReport,
  getRecord,
  listRecords,
  patchRecord,
  // THE DOOR THAT MAY WRITE A CARD OR A GRANT ONTO AN AGENT RECORD. Problem mz5ddKDITE3j: the
  // ordinary record write path refuses those two fields to everybody but the person, and points
  // at the routes in this file. This is how those routes say the write is one of theirs.
  throughTheCardDoor,
  theSecretaryActingForThePerson,
  aRaiseCarriesIt,
} from '../lib/records.ts'
import { now } from '@shared/now.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { ROLE_CARDS_FILE, theRoleCards } from '../lib/roles.ts'
import { whatTheGrantDoesNotPressNow } from '../lib/what-the-grant-carries.ts'
import { portraitToSend, portraitsIn, smallPortraitToSend } from '../lib/portraits.ts'
import { openToSend, sendTheOpenFile } from './files.ts'
import { type RegisteredAgent } from '../lib/participants.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import {
  aGrant,
  aRaiseOnTheRun,
  everyGrantMadeTo,
  readRaises,
  theGrantEverMadeTo,
  // THE RAISE A RAISED AGENT ENDS ITSELF, found by its id.
  theRaiseWithTheId,
} from '../lib/elevation.ts'
import { asStored } from '@shared/as-stored.ts'
import { ended } from '../lib/elevations-that-end-with.ts'
import { anyRecordForAgent } from '../db/any-record-for-agent.ts'
// THE RAISE: the run the secretary is in when the person presses, and the line that tells it.
import { theLiveHoldOn } from '../lib/handles.ts'
import { sayItWasDoneFromAnotherComputer } from '../lib/changed-from-another-computer.ts'
import { writeASystemLineToOne } from '../lib/groups.ts'
import { theSecretarysName, whoPressedItUnderTheGrant } from '../lib/the-persons-own-words.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { localStamp, nowStamp, readATypedTime, theClockZone, theSameTimeTheNextDay } from '@shared/time.ts'
import { everybodyActingForYou } from '../lib/actingfor.ts'
import { aNewKeyAsk, withdrawANewKeyGrant } from '../lib/newkey.ts'
import { withdrawARequestToThePerson } from '../lib/withdraw-a-request.ts'
import { answerARoleRequest } from '../lib/answering-a-role-request.ts'
// THE ONE MESSAGE AN AGENT GETS WHEN ITS CARD CHANGES.
import { writeTheCardMessageToOne } from '../lib/cardmessage.ts'
import { theHandbooksOnTheCards, type HandbooksAReaderMayRead } from '../lib/handbooks.ts'
import { theMessageReader } from '../lib/messages.ts'
// EACH CARD'S WORDS, FROM THE OFFICE'S WORDS RECORD OF IT where it holds them.
import {
  THE_PRESS_OF_THE_SHIPPED_WORDS,
  copyTheShippedWords,
  theShippedWordsBesideTheOffices,
  whereTheWordsCameFrom,
} from '../lib/card-words.ts'
import { theCardInTheOfficesWords, theWordsRecords } from '../lib/the-card-in-the-offices-words.ts'
import type { TheShippedWords } from '@shared/the-shipped-words.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import {
  isMoleOffice,
  moleOffice,
  MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD,
  theMoleOfficeTest,
} from '@shared/participants.ts'
import {
  A_PERSON_WITH_NO_ROLE_READS_AS,
  aRaisesEndHasCome,
  A_ROW_WITH_NO_ROLE_READS_AS,
  cardAsRead,
  DEFAULT_VISITOR_CARD_CEILING,
  howThisOneEnds,
  isARole,
  isAWayElevationEnds,
  mayBeElevated,
  theVisitorCeilingWasRaised,
  whyThisRoleMayNotBeGiven,
} from '@shared/roles.ts'
import type { Actor } from '../lib/records.ts'
import type { PanelRecord } from '@shared/types.ts'
import type {
  CardHolder,
  CardHolders,
  Elevation,
  ElevationHeld,
  PersonCard,
  RoleCard,
  RoleCardCopy,
  RoleCardMadeHere,
  RolesDeclaration,
  WhatTheRolesSay,
  WhoHoldsTheCards,
} from '@shared/roles.ts'
// THE PICTURE A CITIZEN IS SHOWN BY, read the one way this product reads it. Criterion P72 draws a
// citizen beside its name, and a second rule for which picture that is would drift from the first.
import { avatarsOnOffer, pictureShownFor } from '../lib/avatars.ts'
import { defaultAvatarAssetId } from '@shared/participants.ts'
import { sqlite } from '../db/client.ts'
import {
  PORTRAITS_IN_THE_CHECKOUT,
  PORTRAITS_KEPT_HERE,
  SMALL_PORTRAIT_WIDTH,
  isAPortraitSet,
  theFirstPortraitOf,
  type PortraitOnOffer,
} from '@shared/portraits.ts'
// THE VISITOR CARD CEILING, criterion P86, for the Settings panel that draws it.
import { theVisitorCardCeiling } from '../lib/visitorceiling.ts'
import { theNotebookOnACardFor } from '../lib/notebook.ts'
// THE ONE STANDING GROUP FOR THE OWNER AND EVERY SECRETARY. Giving an agent a card is one of the two
// ways it can become a secretary or stop being one, so it is one of the doors that keeps the group
// in step with the registry.
import { syncTheSecretariatGroup } from '../lib/secretariat.ts'
import { nothingWrittenSentence } from '../lib/records/patching.ts'
// AND THE ONE BROADCAST SCHEDULE PER SECRETARY, made at the same two doors for the same reason, on 16 September 2026.
import { syncTheBroadcastSchedules } from '../lib/broadcast.ts'

const ROLES_NOTE =
  'The role cards, and the copy of each one filed in this project. `cards` is the declaration in ' +
  'src/config/roles.json, which is the only thing that decides what an agent of a role may do, and ' +
  '`personCards` is the same file\'s list of the roles a PERSON holds — criterion P45. Nothing reads across the ' +
  'two lists: a person role is never one an agent can be registered as. `mirror` ' +
  'says, per card, which record copies it here and whether that copy still matches — `state` is "current", ' +
  '"out of date" or "not copied yet", and an out-of-date copy names the fields that differ. THE COPY GRANTS ' +
  'NOTHING: nothing reads a `role_card` record to decide a refusal, and editing one changes no permission. It ' +
  'exists so that a card can be read in Mole Office rather than only in a checkout. Write the copies with ' +
  'POST /api/roles/mirror. `handbooks` lists, by card word, every live handbook record hung on the card, in any ' +
  'state, that is filed in a project you may read; a card none hangs on is not a key. `narrowedByPermission` counts ' +
  'the others, without their ids or titles, and is null when there are none. Writes nothing.'

const PORTRAITS_NOTE =
  'The portraits painted for each role card, by role. Criterion P47: three per role, in one style, and whoever ' +
  'holds the card picks one of the three. Each entry is the address to draw. Nothing in Mole Office paints or ' +
  `stores a portrait; these are files in ${PORTRAITS_IN_THE_CHECKOUT}/<role>/. Writes nothing.`

const ONE_FOLDER_NOTE =
  'The pictures in one portrait folder, by name: GET /api/portraits/role/<role> for a role\'s three, and ' +
  'GET /api/portraits/custom/<who> for the ones one person keeps for themselves. GET /api/portraits above lists ' +
  'every role at once and lists no custom folder, because whose a picture is decides who sees it; this is how a ' +
  'caller asks for one folder by name. An empty list means nothing is in that folder, not that this failed. ' +
  'Writes nothing.'

const PORTRAIT_BYTES_NOTE =
  'The bytes of one portrait. The set is "role" for one of a role\'s three, or "custom" for a picture somebody ' +
  'keeps for themselves under data/portraits/custom/<who>/, which is never committed and never leaves this ' +
  'machine. A name is a plain name and never a path, so this cannot be asked for a file outside the two folders. ' +
  `?size=small answers a copy ${String(SMALL_PORTRAIT_WIDTH)} pixels wide, which is what the pages draw: it is made ` +
  'the first time it is asked for and kept in portrait-copies/ beside the database, and the picture itself is ' +
  'never changed. A picture that cannot be shrunk (anything but an 8-bit PNG) is sent whole. The header ' +
  'x-mole-office-picture says which was sent. Without ?size this writes nothing.'

const MADE_HERE_NOTE =
  'Switched off. This door wrote a role card somebody defined in Mole Office itself, criterion P51, and such a ' +
  'card granted nothing. It now refuses every write with 410 and writes nothing: add an office role on the Role ' +
  'cards page instead, where it takes effect at once. The cards it wrote are kept, and GET /api/roles answers ' +
  'them as madeHere.'

const THE_SHIPPED_WORDS_NOTE =
  'Each role card in the shipped file beside the words this office holds for it. The office copied each card\'s ' +
  'words from src/config/roles.json once, at its first start, so a later change of that file shows here. For each ' +
  'card: its words record and version, what the record says it was copied from, and every word field where the ' +
  'shipped text and the office\'s differ, with both texts and where the office\'s text came from: the office\'s ' +
  'copy, a change somebody made after it, or a history that cannot say. Optional query `role` asks for one card. ' +
  'Writes nothing.'
const COPY_THE_SHIPPED_WORDS_NOTE =
  'Copy one card\'s shipped words onto the words this office holds for it. Body {"role", "ifVersion"}, the version ' +
  'GET /api/roles/shipped-words named. It writes the shipped text of every field that differs, takes off a field the ' +
  'shipped card does not have, and says the file, commit and time of the copy, through the record door with the ' +
  'history kept. It is refused, and writes nothing, where the record changed after that version, so a change is ' +
  'never written over unseen. The person presses it, or the secretary under the person\'s grant.'
const MIRROR_NOTE =
  'Copy every role card into this project as a `role_card` record, and rewrite the copies that no longer match ' +
  'the declaration. Every card of both lists is copied — the roles an agent holds and the roles a person holds. ' +
  'It takes no body: what is copied is every card, and which project is the workspace header. ' +
  'It is safe to run again — a card whose copy already matches is left alone, and the reply says how many were ' +
  'written, how many were rewritten and how many were already current, rather than reporting a write that did ' +
  'not happen. It changes no permission: the declaration is the authority and this is the copy.'

/**
 * WHY THE TWO ELEVATION ROUTES ARE KEPT ON THIS MACHINE, AND THE ONE CALLER FROM ELSEWHERE THEY TAKE.
 *
 * The press is the person's. A request arriving from somewhere else asking to hand the person's acts to an agent is one
 * this product must never answer on a claim: `human` on a request from another machine proves nothing.
 * One decision makes the person's decisions theirs wherever they make them. So the one caller
 * from elsewhere these routes take is the one another decision let set the person's office keys.
 * That is the person's own key, over an encrypted door (`thePersonMayAskFromThere` in lib/reach.ts). An agent
 * from elsewhere and the keyless window claim are still refused, and each act made that way is said to the person on their devices.
 */
const KEPT_HERE = {
  act: 'Starting or ending a secretary\'s right to act for you',
  because: 'reserved-to-the-owner',
  thePersonMayFromAnotherComputer: true,
} as const

/**
 * WHY ENDING A GRANT EARLY IS KEPT ON THIS MACHINE, in its own words rather than KEPT_HERE's. A request from another
 * computer asking to take the person's acts away is answered only to the person's own key, as giving a grant is. But this office's list
 * of what the grant carries may let a secretary holding the person's grant press this door for them, so the act is named as the
 * ending itself and not as the two halves together.
 */
const ENDING_IT_EARLY_IS_KEPT_HERE = {
  act: 'Ending a secretary\'s grant early',
  because: 'reserved-to-the-owner',
  thePersonMayFromAnotherComputer: true,
} as const

const GRANT_NOTE =
  'Let one secretary act for the person, criterion P59. It takes which of the three ends it has — the words are in ' +
  '`elevation.howItEnds` on GET /api/roles — and what it ends at: a local wall-clock stamp for "at a time", the id ' +
  'of the record for "when a piece of work ends", and nothing for "when you say". While it holds, that secretary ' +
  'has every one of the acts under the power `elevation.givesThePower`, and every write it makes under it names the ' +
  'grant on the change row and on the revision. Only the person may ask for this, and an elevation does not carry ' +
  'it: a secretary already acting for the person is refused here exactly as one that is not.'

const END_NOTE =
  'End what a secretary is doing for the person, before whichever end it was given. The person may ask, and so may a ' +
  'secretary holding the person\'s grant where this office\'s list of what the grant carries says it may press this ' +
  'door for them; every such press gives its reason. While the gate who-ends-another-agents-raise is off, any agent ' +
  'proved by its own key may also end it, and is counted; the end and the line to the secretary then name that ' +
  'agent. The agent the grant was given to ends its own at POST ' +
  '/api/roles/raises/<id>/end. Nothing already written is rewritten: the grant stays on the ledger rows of every ' +
  'write made under it, and the grant itself keeps its object with `endedAt` set.'

const OWN_END_NOTE =
  'A RAISED AGENT ENDS ITS OWN RAISE. It takes no body. The address names the raise by its ' +
  'id, which is in the office message that told the agent it was raised, in elevation.holding on GET /api/roles, and ' +
  'in raises on the run it was given in. Only the agent the raise was given to may ask, sending its own key and its ' +
  'own name; any other agent is refused with the code raiseEndNotYours, and ' +
  'the person ends a raise at DELETE /api/roles/elevation/<handle>. While the gate who-ends-another-agents-raise is ' +
  'off, any agent proved by its own key may also end another agent\'s raise here, and is counted; the end names that ' +
  'agent, the agent whose raise it was is told, and the reply carries the id of that line as `told`. The raise ' +
  'keeps its object with `endedAt` set, on ' +
  'the agent record and on its run, and nothing written under it is rewritten. It only ends: no agent can give or ' +
  'lengthen a raise at any door.'

/**
 * WRITE THE END OF ONE RAISE: the grant, ended, back into the list on the agent's record, and its end on the run it was
 * pressed in, when that run is still there. Both ending doors call it, inside their own
 * transaction, so the person's end and an agent's own end are written the same way. It answers the run it wrote the end on, or
 * null. THROUGH THE CARD DOOR, because the ordinary record door refuses a change to `elevation` on an agent record and to
 * `raises` on a run (problem mz5ddKDITE3j); who may is decided by the door that calls this.
 */
function writeTheEndOfARaise(input: { record: string; every: readonly Elevation[]; over: Elevation; actor: Actor }): string | null {
  const { over } = input
  const run = over.run === null ? null : getRecord(over.run)
  throughTheCardDoor(() => {
    patchRecord(input.record, { dataPatch: { elevation: asStored(input.every.map((one) => (one.id === over.id ? over : one))) } }, input.actor)
    if (run !== null) {
      const raises = readRaises(run.data?.['raises']).map((one) =>
        one['elevation'] === over.id ? { ...one, endedAt: over.endedAt, endedBecause: over.endedBecause } : one,
      )
      patchRecord(run.id, { dataPatch: { raises } }, input.actor)
    }
  })
  return run === null ? null : run.id
}

/** Why a raise the office has found no longer holds, for the refusal that says so. Each case is the reading's own. */
function whyARaiseNoLongerHolds(found: NonNullable<ReturnType<typeof theRaiseWithTheId>>): string {
  const grant = found.grant
  if (grant.endedAt !== null) return `it ended at ${grant.endedAt}${grant.endedBecause === null ? '' : `: ${grant.endedBecause}`}`
  if (found.every[found.every.length - 1]?.id !== grant.id) return `a later raise was given to "${found.handle}" after it`
  if (grant.endsWhen === 'at a time' && (grant.until === null || aRaisesEndHasCome(grant.until, nowStamp()))) {
    return `its end time ${grant.until ?? '(none written)'} has come`
  }
  return `"${found.handle}" does not hold the card that can act for the person, or the role cards could not be read`
}

/**
 * WHY GIVING AN AGENT A CARD IS KEPT ON THIS MACHINE. Criterion P64, and the reason is KEPT_HERE's, with
 * the same one caller from elsewhere: the person's own key over an encrypted door.
 */
const APPOINTING_IS_KEPT_HERE = {
  act: 'Giving an agent a role card',
  because: 'reserved-to-the-owner',
  thePersonMayFromAnotherComputer: true,
} as const

const ASK_NOTE =
  'AN AGENT ASKS THE AGENT THAT STARTED IT FOR A HIGHER RUNG, criterion P65. Body {"asking": "<a word from `cards` ' +
  'on GET /api/roles>", "because"?: "<why, in your own words>"}. WHO ASKS AND WHO ANSWERS ARE BOTH READ FROM THE ' +
  'REGISTRY and never from the body: the asker is the caller, and the answerer is whoever started it, because an ' +
  'agent that could name its own answerer could name one that would say yes. It files a `role_request` record and ' +
  'sends the starter a message carrying it. It changes no rung: what a grant does is the press, and until the ' +
  'starter presses, the asker holds exactly the card it held. WHERE THE STARTER IS A PERSON the ask is recorded ' +
  'the same way and waits for the person: it appears on GET /api/needs-you and on the asker’s own citizen’s page, and their ' +
  'press grants it. Their press, not a sentence in a terminal — the ask used to be refused with a 409.'

const ANSWER_NOTE =
  'THE STARTER ANSWERS A ROLE REQUEST WITH ONE PRESS, criterion P65: grant or refuse. Optional body {"says": ' +
  '"<your own words>"}. Only the agent the request says answers it may press, and the person may press for any ' +
  'of them. A GRANT RAISES THE RUNG WITHIN THE STARTER\'S OWN RUNG, checked with the same reading registration ' +
  'uses — a starter cannot hand out a card it could not register somebody with, and the refusal names which rule ' +
  'stopped it. The answer is written on the request record, once: a request that has been answered is answered, ' +
  'and a second press is refused with what the first one said.'

const WITHDRAW_NOTE =
  'WITHDRAW A GRANTED NEW-KEY ASK THAT NOBODY COLLECTED. No body. ' +
  'The person may withdraw one, and so may the agent that granted it as the registered starter, sending its own ' +
  'key, even where the starter has changed since; nobody else, and never the agent itself. The ask\'s answer ' +
  'becomes "withdrawn" and it records when and as whom; the revision records who pressed. It gives back none of the keys the grant revoked. The agent\'s next new-key ask ' +
  'at POST /api/agents/register-myself files a new ask. A grant already collected and an ask not granted are ' +
  'refused, and nothing is written. ' +
  'AND A CARD REQUEST OR A WAITING SELF-REGISTRATION THAT WAITS FOR THE PERSON: its asker, or ' +
  'the asker\'s registered starter, sending its own key, may withdraw it while the person has not answered it. The ' +
  'request is kept, its answer becomes "withdrawn", and extra.withdrawn says when, who and as what. The person\'s ' +
  'Needs you list shows it as withdrawn for 7 days. Anyone else, an answered request and a request that waits for an ' +
  'agent are refused, and nothing is written.'

const APPOINT_NOTE =
  'Give one agent a role card, criterion P64. Body {"role": "<a word from `cards` on GET /api/roles>"}. The person ' +
  'may give any card. An agent sending its own key may give a card by its own rank: a card at or below its own ' +
  'rung, to another agent whose present card it could also give, and never to itself. So no agent gives the ' +
  'secretary card or takes one away. The person\'s grant adds nothing to an agent\'s rank. An agent asking to be ' +
  'raised uses the request its starter answers instead. The word is written on the agent\'s own record, so the ' +
  'change gets a change row and a revision saying who gave it, and the registry row a refusal reads follows the ' +
  'record. A word no card holds is refused with the list of words that are cards.'

/** Mole Office itself, as the office's other lines to one participant are written. */
function theOfficeItself(): Actor { return { type: 'system', id: moleOffice().id } }

/**
 * A RAISE'S DEFAULT END: a day from the press, and a day is a calendar
 * day. It is the same clock time on the next day of the office's
 * calendar, so across a clock change it is 23
 * or 25 hours on, not 24. The office's zone is this process's zone, the one `localStamp` writes every stored stamp in.
 * An end that cannot be worked out is refused rather than guessed.
 */
function aDayFromThePress(): string {
  const ends = theSameTimeTheNextDay(Date.now(), theClockZone())
  if (ends === null) throw new PanelError('The same time tomorrow could not be worked out on the office clock. Nothing was written.', 500)
  return localStamp(new Date(ends))
}

/**
 * THE END TIME THE PERSON TYPED FOR A RAISE, in the stored form, or a refusal. Problem OpT-wLSCwlZ-: the end was stored as typed
 * and compared as text, so `07:00` had ended before it began and `tomorrow 7am` never ended. It is read with
 * `readATypedTime`, and a time that has already come is refused with the comparison `elevationStillHolds` uses, so the
 * door never answers that a raise was given when it had already ended. Both refusals carry a code the page draws.
 */
function theEndTheyTyped(typed: string): string {
  const read = readATypedTime(typed)
  if (read === null) {
    throw new PanelError(
      `"${typed}" does not read as a date and a time, so the raise would have no end the office could compare with the ` +
        'clock. Send `until` as YYYY-MM-DD HH:MM, for example 2026-10-01 07:00, or leave it out for a day. Nothing was ' +
        'written.',
      400,
      undefined,
      undefined,
      'An end time is a date and a time: YYYY-MM-DD HH:MM.',
      { code: 'raiseUntilUnreadable', values: { typed } },
    )
  }
  if (aRaisesEndHasCome(read, nowStamp())) {
    throw new PanelError(
      `The end time ${read} has already come, so the raise would end before it began. Send a later time. Nothing was ` +
        'written.',
      400,
      undefined,
      undefined,
      'The end time has already come.',
      { code: 'raiseUntilPassed', values: { until: read } },
    )
  }
  return read
}

/**
 * REFUSE EVERY CALLER BUT THE PERSON, and say what was being asked for. Criteria P59 and P60.
 *
 * It asks NOTHING about warrants and nothing about elevations, which is the whole of P60's second
 * half: a secretary acting for the person may not hand the person's acts to anybody, itself included.
 *
 * `door` is what the refusal says about whose act it is and who may do it. Every door here is the person's own press
 * but the card door, which an agent may also press by its own rank.
 */
function refuseAnybodyButThePerson(actor: Actor, req: FastifyRequest, door: ThisDoorsWords = THE_PERSONS_OWN_PRESS): void {
  // AND A STATED PERSON HAS TO HOLD THE PERSON'S KEY. Criterion P83, point 1: the header claim is
  // attribution, and the key is what makes a caller the person. A secretary acting for the person is still
  // refused this exactly as before; the grant is not changed by this line.
  if (thePersonIsProved(actor)) return
  // INSIDE A TEST WORLD, ITS STARTER AND THE SECRETARY MAY. Criterion P84, rule 5 of chapter 8, problem aRP8Co6BB_Hv:
  // they hold the owner's authority there, and appointing and raising are the person's acts like the rest. This is not an agent handing
  // itself standing in the office: the field is absent in the office, and a world's grants stay in the world's copy.
  if (actor.theOwnersAuthority?.holds === true) return
  // THE WORDS ARE WRITTEN IN ONE PLACE, lib/not-proved-the-person.ts: why this request is not the person
  // and the way on. This guard holds the actor and not the request, so the words say only what holds
  // whichever way the facts it cannot read go.
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, null), {
      refused: `${theActKeptHere(req)} ${door.isWhose}`,
      nothingWasDone: 'Nothing was written.',
      whoMay: door.whoMay,
    }),
    403,
  )
}

/** What a door that `refuseAnybodyButThePerson` guards says about whose act it is and who may do it. */
interface ThisDoorsWords {
  /** After the act's name, with no stop: "is the person's own act". */
  isWhose: string
  whoMay: string
}

/** The words of a door that is the person's own press. */
const THE_PERSONS_OWN_PRESS: ThisDoorsWords = {
  isWhose: "is the person's own act",
  whoMay:
    'It is the person\'s press, made in Mole Office on the card itself. An agent already acting for the person is refused this ' +
    'exactly as one that is not: an agent that could grant it would be able to extend its own standing with ' +
    'nothing said outside the press.',
}

/** The words of the card door, which an agent with its own key may also press, by its own rank. */
const GIVING_A_CARD_BY_RANK: ThisDoorsWords = {
  isWhose: "is the person's act, and an agent's own act within its rank",
  whoMay:
    'The person gives any card, in Mole Office on the agent\'s profile. An agent sends its own key as ' +
    'x-mole-office-key and gives a card at or below its own rung, to another agent whose present card it could also ' +
    'give. The person\'s grant adds nothing to that, so only the person gives a secretary card or takes one away.',
}

/**
 * WHO GIVES A CARD AT THE CARD DOOR: null for the person, and for a test world's starter and secretary, who give any
 * card; the registry row of an agent proved by its own key, which gives by its own rank. Anybody else is refused here
 * with the card door's words. A decision says the cards are given by rank.
 */
function theAgentGivingByItsRank(actor: Actor, req: FastifyRequest): RegisteredAgent | null {
  const byItsKey =
    actor.type === 'agent' && actor.provedBy === 'an-agent-key' && actor.theOwnersAuthority?.holds !== true
      ? participantForActor(actor)
      : null
  const row = byItsKey?.kind === 'agent' ? (readParticipant(byItsKey) as RegisteredAgent | null) : null
  if (row !== null) return row
  refuseAnybodyButThePerson(actor, req, GIVING_A_CARD_BY_RANK)
  return null
}

/**
 * WHY AN AGENT MAY NOT MAKE ONE CARD CHANGE, or null when it may. Three rules, and the refusal names the one that
 * stopped it. An agent never changes its own card: it asks its starter for a higher rung instead. It gives a card at or
 * below its own rung, by the rule registration reads (`whyThisRoleMayNotBeGiven`). And it changes only the card of an
 * agent whose present card it could also give, so it cannot take away a card above its own rank, and only the person
 * takes a secretary card away.
 */
function whyThisAgentMayNotChangeTheCard(
  decl: RolesDeclaration,
  giver: RegisteredAgent,
  target: RegisteredAgent,
  giving: string,
): string | null {
  if (giver.id === target.id) {
    return (
      'An agent may not change its own card. An agent that needs a higher rung asks the agent that started it, at ' +
      'POST /api/roles/requests.'
    )
  }
  const mine = giver.role ?? A_ROW_WITH_NO_ROLE_READS_AS
  const no = whyThisRoleMayNotBeGiven(decl, mine, giving)
  if (no !== null) return no
  const present = target.role ?? A_ROW_WITH_NO_ROLE_READS_AS
  const notThatOne = whyThisRoleMayNotBeGiven(decl, mine, present)
  if (notThatOne === null) return null
  return (
    `An agent may change only the card of another agent whose present card it could also give, and "${target.handle}" ` +
    `holds the ${present} card. ${notThatOne}`
  )
}

/**
 * THE PERSON, OR THE PERSON'S GRANT WHERE THIS OFFICE'S LIST CARRIES THE DOOR, for ending a grant early. The person and
 * a test world's authority come first, as they do for every person-only door; then the one check; then the old
 * refusal, which an agent with no grant still hears unchanged.
 *
 * WHILE THE GATE who-ends-another-agents-raise IS OFF, any agent its own key proves may end it too, and the gate counts
 * it. The grant is then not asked. Any other caller is refused in words that say the gate is off. The answer is true
 * when the gate let the caller through.
 */
function thePersonOrTheGrant(actor: Actor, req: FastifyRequest): boolean {
  if (thePersonIsProved(actor)) return false
  if (actor.theOwnersAuthority?.holds === true) return false
  const position = gatePosition('who-ends-another-agents-raise')
  if (position === 'block' && aRaiseCarriesIt(actor)) return false
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-ends-another-agents-raise', position!) !== 'block') return true
  if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-ends-another-agents-raise', "end another agent's raise")
  refuseAnybodyButThePerson(actor, req)
  return false
}

/** What the end of a raise, and the line to its agent, say when the gate let another agent end it. */
const endedWhileTheGateWasOff = (by: string): string =>
  `"${theSecretarysName(by)}" ended it while the gate "who-ends-another-agents-raise" was off.`

// WHO IS ACTING FOR THE PERSON RIGHT NOW is read in `src/server/lib/actingfor.ts`. It used to be a
// function here, because the Role cards page was the only screen that drew it. Criterion P64 moved
// the press to the agent's own profile, so two replies answer that question now, and two readings of
// one fact is how a card and a profile come to disagree about whether an agent holds the person's acts.

/** The title a card's copy carries. One place, so the mirror and the read cannot look for two names. */
function titleFor(card: RoleCard): string {
  return `The ${card.name} role card`
}

/**
 * Which fields of a stored copy differ from the card, by name. Empty when the copy is current.
 *
 * EXACT, AND THAT IS WHY THE MIRROR REPLACES THE CARD WHOLE. A null declared on the card must be a
 * null on the copy, and a key the card does not have must not be on the copy. The mirror below
 * stores the card exactly as it is declared, so a copy it has just written always reads current,
 * and a copy somebody changed by hand always reads out of date. Problem 9Y5Isyx1zzy0 is what
 * happened while the writer stored the card one way and this read it another.
 */
function differencesFrom(card: RoleCard, stored: unknown): string[] {
  if (typeof stored !== 'object' || stored === null) return ['the whole card']
  const held = stored as Record<string, unknown>
  const differs: string[] = []
  for (const key of Object.keys(card) as (keyof RoleCard)[]) {
    if (JSON.stringify(held[key]) !== JSON.stringify(card[key])) differs.push(String(key))
  }
  for (const key of Object.keys(held)) {
    if (!(key in card)) differs.push(`${key}, which the card no longer has`)
  }
  return differs
}

/** Every copy in one project, read by the role each names. A card made here is not a copy. */
function copiesIn(workspaceId: string): Map<string, { id: string; card: unknown; copiedAt: unknown }> {
  const held = new Map<string, { id: string; card: unknown; copiedAt: unknown }>()
  for (const row of listRecords({ workspaceId, kind: 'role_card' })) {
    const name = row.data['roleName']
    if (typeof name !== 'string') continue
    // A CARD WRITTEN HERE IS NOT A COPY OF ANYTHING, so it is never compared to a declaration it did
    // not come from. Reading it as a copy would report every one of them as out of date for ever.
    if (row.data['madeHere'] === true) continue
    held.set(name, { id: row.id, card: row.data['card'], copiedAt: row.data['copiedAt'] })
  }
  return held
}

/**
 * THE CARDS SOMEBODY WROTE IN MOLE OFFICE, in one project. Criterion P51.
 *
 * A record whose card is not readable is left out rather than drawn half-empty: the card is stored
 * as one unknown object and a row that lost it is a row nothing can say anything about.
 */
function cardsMadeIn(workspaceId: string): RoleCardMadeHere[] {
  const out: RoleCardMadeHere[] = []
  for (const row of listRecords({ workspaceId, kind: 'role_card' })) {
    if (row.data['madeHere'] !== true) continue
    const name = row.data['roleName']
    const card = row.data['card']
    if (typeof name !== 'string' || typeof card !== 'object' || card === null) continue
    out.push({
      record: row.id,
      role: name,
      // WITH ITS POWERS FILLED IN, the same way a declared card gets them. A card written here names
      // a step of the tree (criterion P62), so its powers are as readable as any other card's — and
      // still enforced by nothing, which is what `nothingEnforcesACardMadeHere` says.
      card: cardAsRead(theRoleCards(), card as RoleCard),
      portrait: typeof row.data['portrait'] === 'string' ? row.data['portrait'] : null,
      madeAt: typeof row.data['madeAt'] === 'string' ? row.data['madeAt'] : row.createdAt,
    })
  }
  return out
}

/**
 * EVERY CARD THIS INSTALLATION DECLARES, in one list, each saying who holds it.
 *
 * TWO LISTS IN THE FILE AND ONE HERE. `cards` are the roles an agent holds and `personCards` are the
 * roles a person holds (criterion P45); nothing reads across them, so they are separate where a role
 * is given. Copying and reading are the same job for both, so they are walked together and each row
 * says which list it came from.
 */
function everyCard(): { card: RoleCard; heldBy: 'agent' | 'person' }[] {
  const decl = theRoleCards()
  // WITH THE POWERS FILLED IN FROM THE TREE. `cardAsRead` says why: a card on the tree declares
  // `powers: null`, which is one fact in one place and is neither readable nor copyable. Every
  // reader here — the served list, the copy, and the comparison that says a copy is stale — takes
  // the same resolved card, so none of the three can come to disagree about what a card holds.
  // AND IN THE OFFICE'S WORDS, for the same reason: a copy is of the card as the office shows it, so a
  // change to a card's words record makes its copy out of date until the mirror rewrites it.
  const held = theWordsRecords()
  return [
    ...decl.cards.map((card) => ({ card: cardAsRead(decl, theCardInTheOfficesWords(card, held)), heldBy: 'agent' as const })),
    ...decl.personCards.map((card: PersonCard) => ({
      card: cardAsRead(decl, theCardInTheOfficesWords(card, held)) as RoleCard,
      heldBy: 'person' as const,
    })),
  ]
}

/** What the read publishes about every card's copy. */
function mirrorState(workspaceId: string): RoleCardCopy[] {
  const copies = copiesIn(workspaceId)
  return everyCard().map(({ card, heldBy }) => {
    const held = copies.get(card.name)
    if (held === undefined) {
      return { role: card.name, heldBy, record: null, state: 'not copied yet' as const, differsIn: [], copiedAt: null }
    }
    const differsIn = differencesFrom(card, held.card)
    return {
      role: card.name,
      heldBy,
      record: held.id,
      state: differsIn.length === 0 ? ('current' as const) : ('out of date' as const),
      differsIn,
      copiedAt: typeof held.copiedAt === 'string' ? held.copiedAt : null,
    }
  })
}

/**
 * WHO HOLDS EACH CARD — CRITERION P72.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE SCREEN SHOWS, AND WHAT THE TWO NUMBERS ARE FOR
 * ---------------------------------------------------------------------------------------
 *
 * Pressing in opens a statistics screen with a bar chart per role and, under it, each role's citizens.
 *
 * A ROW WITH NO CARD IS COUNTED, AND SAID TO BE. Every agent registered before 6 September 2026 has
 * no card written on its row, and every refusal reads such a row as the worker card. Leaving them
 * out would understate what the worker card governs; folding them in silently would say somebody
 * chose it for them. So `holds` counts what the card is read on and `chose` counts what was written,
 * and each citizen carries `readNotChosen`.
 *
 * A RETIRED ROW IS NOT A CITIZEN. Criterion zyCcJYCLsAe7 retires a row and the Embassy folds it
 * away; a census that kept counting it would say the office had more people than it has.
 *
 * NOR IS THE OFFICE'S OWN SENDER ROW. It sits in the agent registry and holds no card, and the
 * Embassy draws it apart as the office itself. Counted here, it would be a worker nobody chose.
 */
function whoHoldsTheCards(workspaceId: string): WhoHoldsTheCards {
  const decl = theRoleCards()
  const { people, agents } = listParticipants()
  const onOffer = avatarsOnOffer()
  const officeTest = theMoleOfficeTest()
  const bag = new Map<string, { forWhom: 'agent' | 'person'; holders: CardHolder[] }>()
  const put = (card: string, forWhom: 'agent' | 'person', holder: CardHolder): void => {
    const held = bag.get(card) ?? { forWhom, holders: [] }
    held.holders.push(holder)
    bag.set(card, held)
  }

  for (const one of agents) {
    if (one.retired) continue
    const who = { kind: 'agent' as const, id: one.id }
    // THE OFFICE'S OWN SENDER ROW HOLDS NO CARD. It is the office itself, so it is counted under none.
    if (officeTest(who)) continue
    put(one.role ?? A_ROW_WITH_NO_ROLE_READS_AS, 'agent', {
      kind: 'agent',
      id: one.id,
      name: one.name,
      avatarUrl: pictureShownFor(who, one.avatarAssetId, onOffer, one.role ?? A_ROW_WITH_NO_ROLE_READS_AS, officeTest),
      readNotChosen: one.role === null,
    })
  }
  for (const one of people) {
    const who = { kind: 'person' as const, id: one.id }
    put(one.role ?? A_PERSON_WITH_NO_ROLE_READS_AS, 'person', {
      kind: 'person',
      id: one.id,
      name: one.name,
      avatarUrl: pictureShownFor(who, one.avatarAssetId ?? defaultAvatarAssetId(who), onOffer, null, officeTest),
      readNotChosen: one.role === null,
    })
  }

  const asEntry = (card: string, forWhom: 'agent' | 'person'): CardHolders => {
    const held = bag.get(card)?.holders ?? []
    const holders = [...held].sort((a, b) => a.name.localeCompare(b.name))
    return {
      card,
      forWhom,
      portrait: theFirstPortraitOf(card),
      holds: holders.length,
      chose: holders.filter((one) => !one.readNotChosen).length,
      holders,
    }
  }

  // EVERY DECLARED CARD IS DRAWN, INCLUDING THE ONES NOBODY HOLDS. A card missing from the chart
  // because its count is nought would read as a card that does not exist.
  const cards = [
    ...decl.cards.map((one) => asEntry(one.name, 'agent')),
    ...decl.personCards.map((one) => asEntry(one.name, 'person')),
  ]
  const declared = new Set(cards.map((one) => one.card))
  const cardsNoLongerDeclared = [...bag.keys()]
    .filter((card) => !declared.has(card))
    .sort()
    .map((card) => asEntry(card, bag.get(card)?.forWhom ?? 'agent'))

  const read = cards.reduce((n, one) => n + (one.holds - one.chose), 0)
  return {
    cards,
    cardsNoLongerDeclared,
    says:
      'Counted from the two registries of this installation, which are not narrowed to a project. ' +
      String(cards.reduce((n, one) => n + one.holds, 0)) +
      ' citizens hold a declared card, ' +
      String(read) +
      ' of them on a row nobody wrote a card on, which every refusal reads as the card it is listed under. ' +
      'Retired rows are not counted, and neither is the office\'s own row, which holds no card.',
    workspaceId,
  }
}

const WHO_HOLDS_NOTE =
  'How many citizens hold each role card, and who they are. Criterion P72. `holds` is how many the card is READ ' +
  'on, which is how many it governs; `chose` is how many of those have the word written on the registry row. The ' +
  'difference is rows nobody wrote a card on, and each such citizen carries readNotChosen. `cardsNoLongerDeclared` ' +
  'holds a word a row names that no declaration holds any more — the investigator, which left the tree on ' +
  '6 September 2026 — and is empty in the ordinary case. Retired rows are counted nowhere. It reads both ' +
  'registries, which belong to the installation rather than to a project, so the numbers do not change with the ' +
  'workspace header; the header is answered back so a reader can see which project the page was opened from.'

/**
 * THE REGISTRY ROW AN ARRIVING REFERENCE IN A ROLE DOOR NAMES, read the one way. The reference may
 * be an id or a handle; the resolver answers which agent that is, and the whole row is then read by
 * the exact id it answered, because a card and a starter live on the row and not in its name. Null
 * means nobody bears the name. A write refuses a retired name through the resolver's own words.
 */
function theAgentARoleDoorNames(reference: string): RegisteredAgent | null {
  const named = theAgentAnArrivingReferenceNames(reference, 'writing')
  if (named === null) return null
  return readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent | null
}

/**
 * GRANT OR REFUSE ONE ROLE REQUEST. It lives in src/server/lib/answering-a-role-request.ts, so the person's one press
 * runs it without importing this file. The route below runs it too.
 */
export { answerARoleRequest }

export async function roleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/roles', route('role.read', 'remote', ROLES_NOTE), async (req: FastifyRequest): Promise<WhatTheRolesSay & Pick<HandbooksAReaderMayRead<unknown>, 'narrowedByPermission'>> => {
    const workspaceId = workspaceOf(req)
    const handbooks = theHandbooksOnTheCards(theMessageReader(actorFrom(req)))
    const mirror = mirrorState(workspaceId)
    const stale = mirror.filter((one) => one.state !== 'current')
    const ceiling = theVisitorCardCeiling()
    const ceilingRaised = ceiling.problem === null && theVisitorCeilingWasRaised(theRoleCards(), ceiling.word)
    const held = theWordsRecords()
    return {
      declaredIn: ROLE_CARDS_FILE,
      cards: theRoleCards().cards.map((one) => ({ ...cardAsRead(theRoleCards(), theCardInTheOfficesWords(one, held)), source: theShippedRoleCards().cards.some(card => card.name === one.name) ? 'built-in' as const : 'added' as const })),
      leftOut: addedRoles().filter(row => row.problems.length > 0),
      removedAddedRoles: [...removedAddedRoleNames()],
      personCards: theRoleCards().personCards.map((one) => ({ ...cardAsRead(theRoleCards(), theCardInTheOfficesWords(one, held)), source: 'built-in' as const })),
      words: [...theRoleCards().cards, ...theRoleCards().personCards].map((one) => ({
        role: one.name,
        ...whereTheWordsCameFrom(one, held),
      })),
      // THE POWERS AND THE TREE, so a screen works out a card's powers with `powersOn` — the same
      // function the refusal uses — rather than with a rule of its own. Criterion P57. A card on the
      // tree carries `powers: null`, so without these two a browser could draw no powers at all.
      powers: theRoleCards().powers,
      tree: theRoleCards().tree,
      // EACH CHAPTER'S NAME FROM THE OFFICE'S CHAPTER RECORDS: roles.json holds the number only, so a name cannot drift.
      chapters: theChaptersOfTheCards(theRoleCards()),
      readingLevels: theRoleCards().readingLevels,
      // EVERY LIVE HANDBOOK HUNG ON A CARD that the reader may read, in any state, by the card's word. The Role cards
      // page lists them under the card's How it works. The rest are counted in narrowedByPermission, at the end.
      handbooks: handbooks.handbooks,
      elevation: {
        rule: theRoleCards().elevation,
        holding: everybodyActingForYou(),
        // WHICH AGENTS HOLD THE CARD THAT CAN BE ELEVATED. The press acts on an agent, so a screen
        // drawing it needs the handle; an empty list means nobody holds that card and the page says
        // so rather than drawing a press that would answer 404.
        couldHoldIt: listParticipants()
          .agents.filter((one) => !one.retired && one.role === theRoleCards().elevation.onlyThisCardCanHoldIt)
          .map((one) => one.handle),
      },
      // THE NOTEBOOK OF EVERY AGENT HOLDING THAT CARD, with its numbers. Criterion N3. Built from the
      // same list `couldHoldIt` above is built from, so a card can never show a notebook for an
      // agent the page does not say holds the card.
      notebooks: listParticipants()
        .agents.filter((one) => !one.retired && one.role === theRoleCards().elevation.onlyThisCardCanHoldIt)
        .map((one) => theNotebookOnACardFor(workspaceId, one.handle)),
      mirror,
      // THE CARDS SOMEBODY WROTE HERE, criterion P51. Their own list, because nothing reads across:
      // a word here is not a role an agent can be registered as.
      madeHere: cardsMadeIn(workspaceId),
      // WHAT A CARD MADE HERE IS WORTH, as the door says it to its caller.
      // It is not a softer version of `theCopyGrantsNothing` below: that one is about a COPY of a rule
      // that is enforced somewhere else, and this is about a card that is enforced nowhere at all. The
      // page draws its own key, `addedRoles.nothingEnforcesAnOldCard`, which says "add it above"
      // because its reader is on the page. A caller of this door is not, so the door's words name the
      // Role cards page instead (the inspector's note on run JtwB8_PFtSv2).
      nothingEnforcesACardMadeHere: sayInEnglish('addedRoles.nothingEnforcesAnOldCardForTheDoor'),
      // THE HIGHEST CARD A VISITOR MAY HOLD. Criterion P86. The Settings page draws this; the ask
      // door and the confirm read the same `theVisitorCardCeiling`.
      visitorCardCeiling: {
        setting: ceiling.setting,
        ceiling: ceiling.problem === null ? (ceiling.card?.name ?? ceiling.word) : ceiling.word,
        defaultCeiling: DEFAULT_VISITOR_CARD_CEILING,
        raised: ceilingRaised,
        says:
          ceiling.problem ??
          (ceilingRaised
            ? `The highest card a visitor may hold is ${ceiling.word}, raised above the default ` +
              `(${DEFAULT_VISITOR_CARD_CEILING}) by ${ceiling.setting}.`
            : `The highest card a visitor may hold is ${ceiling.word}, which is the default. It can be raised ` +
              `with ${ceiling.setting}.`),
      },
      mirrorSays:
        stale.length === 0
          ? 'Every card is copied into this project and every copy matches the declaration.'
          : `${String(stale.length)} of ${String(mirror.length)} cards have no current copy in this project: ` +
            `${stale.map((one) => `${one.role} (${one.state})`).join(', ')}. POST /api/roles/mirror writes them. ` +
            'The declaration is what is enforced either way; a stale copy is a stale reading and not a stale rule.',
      theCopyGrantsNothing:
        'Nothing reads one of these records to decide a refusal. What an agent of a role may do is the file named ' +
        'in declaredIn, read when this server started.',
      narrowedByPermission: handbooks.narrowedByPermission,
    }
  })

  app.get(
    '/roles/who-holds-them',
    route('role.census', 'remote', WHO_HOLDS_NOTE),
    async (req: FastifyRequest): Promise<WhoHoldsTheCards> => whoHoldsTheCards(workspaceOf(req)),
  )

  app.get('/portraits', route('portrait.on-offer', 'remote', PORTRAITS_NOTE), async () => {
    // WHAT IS ON THIS MACHINE, read off the two folders. Every card of both lists, plus whatever
    // somebody has put in a folder of their own. A role with no folder comes back with an empty
    // list, which says nobody has painted it rather than that it has none.
    const roles: Record<string, PortraitOnOffer[]> = {}
    for (const { card } of everyCard()) roles[card.name] = portraitsIn('role', card.name)
    return {
      roles,
      note:
        'The portraits on this machine, by role. Each is the address to draw and nothing else: a picture is a ' +
        'file somebody put in a folder, and nothing in Mole Office writes one. A role with an empty list has no ' +
        'folder in this checkout, which says nobody has painted it. A picture somebody keeps for themselves is ' +
        'under data/portraits/custom/<who>/ and is not listed here, because whose it is decides who sees it: ask ' +
        'for it by name at GET /api/portraits/custom/<who>/<name>. Writes nothing.',
    }
  })

  /**
   * THE PICTURES IN ONE FOLDER, by name. Criterion P52.
   *
   *   GET /api/portraits/role/secretary     the three painted for the secretary card
   *   GET /api/portraits/custom/owner       the ones one person keeps for themselves
   *
   * `GET /api/portraits` above lists every ROLE's three and deliberately lists no custom folder,
   * because whose a picture is decides who sees it. This is the other half of that rule rather than
   * a hole in it: a caller has to name whose folder it wants, which is what "ask for it by name"
   * meant, and the answer is that one person's folder and nothing else.
   *
   * IT IS NOT A PERMISSION CHECK AND DOES NOT PRETEND TO BE. Mole Office authenticates nobody, so
   * this address is no more secret than any other; what it is not is a way to discover whose
   * folders exist. The Profile page draws the picker only on a person's own page, which is where
   * the door that WRITES the choice refuses everybody else.
   */
  app.get('/portraits/:set/:of', route('portrait.on-offer', 'remote', ONE_FOLDER_NOTE), async (req) => {
    const asked = parse(
      z.object({ set: z.string().min(1), of: z.string().min(1) }).strict(),
      req.params,
      'The folder asked for',
    )
    if (!isAPortraitSet(asked.set)) {
      throw new PanelError(
        `There is no set of portraits called "${asked.set}". There are two: "role" for the three painted for a ` +
          'role, and "custom" for the pictures somebody keeps for themselves.',
        404,
      )
    }
    const portraits = portraitsIn(asked.set, asked.of)
    return {
      set: asked.set,
      of: asked.of,
      portraits,
      // AN EMPTY LIST IS AN ANSWER AND IT SAYS WHICH ONE. There is no folder, which is different
      // from a folder somebody emptied, and neither is this route failing.
      note:
        portraits.length === 0
          ? `Nothing is in ${asked.set === 'role' ? PORTRAITS_IN_THE_CHECKOUT : PORTRAITS_KEPT_HERE}/${asked.of}, ` +
            'so nobody has put a picture there. Mole Office paints none: a portrait is a file somebody added.'
          : `${String(portraits.length)} picture${portraits.length === 1 ? '' : 's'}, each with the address to ` +
            'draw it at. Writes nothing.',
    }
  })

  app.get('/portraits/:set/:of/:name', route('portrait.read', 'remote', PORTRAIT_BYTES_NOTE), async (req, reply) => {
    const asked = parse(
      z.object({ set: z.string().min(1), of: z.string().min(1), name: z.string().min(1) }).strict(),
      req.params,
      'The portrait asked for',
    )
    if (!isAPortraitSet(asked.set)) {
      throw new PanelError(
        `There is no set of portraits called "${asked.set}". There are two: "role" for the three painted for a ` +
          'role, and "custom" for a picture somebody keeps for themselves.',
        404,
      )
    }
    // NOT STRICT: a picture that failed is asked for again with `?again=` (`askedAgain` in src/web/components/Avatar.tsx),
    // and every picture door reads past a key it does not know.
    const { size } = parse(z.object({ size: z.enum(['small']).optional() }), req.query, 'The size asked for')
    const found = size === 'small' ? smallPortraitToSend(asked.set, asked.of, asked.name) : { ...portraitToSend(asked.set, asked.of, asked.name), served: 'the whole picture' }
    // SENT FROM THE FILE, and not read whole first (wave 13y round 34).
    const file = openToSend(found.path)
    void reply.header('x-mole-office-picture', found.served)
    void reply.header('content-type', found.mime)
    void reply.header('cache-control', found.cacheControl)
    return sendTheOpenFile(req, reply, found.path, file, 'whole')
  })

  /**
   * THE DOOR THAT WROTE A CARD SOMEBODY DEFINED IN MOLE OFFICE ITSELF, SWITCHED OFF. Criterion P51, and a decision
   * of the owner's agreed with the coordinator in AWhlI0gV62Ep and worded in t9qYGYdZcolq.
   *
   *   POST /api/roles/cards   → 410, and nothing is written
   *
   * Such a card took effect nowhere: the refusals are built from the declaration file, and nothing in this product
   * has ever read a `role_card` record to decide one. An office role added on the Role cards page takes effect at
   * once, so this door now says to go there. It refuses every write, from anybody, without
   * reading the body. The cards it wrote are kept, and `GET /api/roles` still answers them as `madeHere`.
   *
   * WHO ASKED IS READ FIRST, so an id no registry holds meets the registry's refusal here as at every writing door.
   * THE DOOR KEEPS ITS OWN WORDS. Its caller is not on the page, so it names the page to go to and adds "Nothing was
   * written."; the page says "Add an office role above" for a reader who is on it (8NsXCjJEaqQR item 3).
   */
  app.post('/roles/cards', route('role.write', 'remote', MADE_HERE_NOTE), (req: FastifyRequest) => {
    actorFrom(req)
    throw new PanelError(`${sayInEnglish('addedRoles.cardsNoLongerWrittenHere')} Nothing was written.`, 410)
  })

  /**
   * THE PRESS: THE PERSON SAYS A SECRETARY MAY ACT FOR THEM. Criterion P59, the owner's 代管.
   *
   *   POST   /api/roles/elevation/<handle>  {"endsWhen": "...", "until": "..."}
   *   DELETE /api/roles/elevation/<handle>
   *
   * Only the person's own press in the product lets a secretary be elevated, and only a secretary
   * may be elevated for a time. Once elevated, it holds every power.
   *
   * ---------------------------------------------------------------------------------------
   * IT IS THE PERSON'S, AND ELEVATION DOES NOT CARRY IT. Criterion P60
   * ---------------------------------------------------------------------------------------
   *
   * The first clause below refuses every caller that is not the person, and it asks nothing about
   * warrants and nothing about elevations. A secretary already acting for the person is refused here
   * exactly as one that is not: a secretary that could grant this could extend its own standing
   * without the person having said anything, and the whole of the criterion is a press the person makes.
   *
   * IT WRITES THE AGENT'S RECORD AND NOT THE REGISTRY ROW, which is the arrangement `role` has and
   * the reason is the same: the record is the source, so the grant gets a change row and a revision
   * saying the person made it, and `keepTheAgentRegistryInStep` copies it to the row a refusal reads.
   */
  app.post('/roles/elevation/:handle', route('role.elevate', 'local', KEPT_HERE, GRANT_NOTE), async (req, reply) => {
    const actor = actorFrom(req)
    const asked = parse(z.object({ handle: z.string().min(1) }).strict(), req.params, 'The agent asked for')
    refuseAnybodyButThePerson(actor, req)
    // THE PERSON'S KEY, NOT THE PERSON'S NAME ALONE. Only the person raises, pressing with their own key. The one-version
    // window lets a keyless claim count as the person for other acts while it is open; a raise is not one of them, because a
    // raise hands the person's acts on, and a claim anybody on a trusted machine can type must not be able to do that.
    // (The starter or the secretary of a test world carries no key of the person's, and holds the owner's authority there: criterion P84.)
    if (actor.provedBy !== 'the-person-key' && actor.theOwnersAuthority?.holds !== true) {
      throw new PanelError(
        `Raising "${asked.handle}" is pressed with the person's own key, from a browser they have paired, and this request carried ` +
          'their name without it. The one-version window counts such a claim for other acts; a raise is not one of them. ' +
          'Pair this browser and press again. Nothing was written.',
        403,
      )
    }
    const decl = theRoleCards()
    // THE BODY AFTER WHO IS ASKING, so an agent is told it may not rather than that its body was wrong.
    const body = parse(
      z
        .object({
          // WHY THE PERSON RAISES IT, IN THEIR WORDS. The press asks for a reason, so what a secretary may
          // do for the person is never without the purpose they gave it.
          reason: z.string().trim().min(1).max(500),
          // A DAY UNLESS THE PERSON SAYS OTHERWISE. A day is the default, which they may change, and a calendar
          // day, as `aDayFromThePress` reads it.
          endsWhen: z.string().min(1).optional(),
          until: z.string().nullish(),
        })
        .strict(),
      req.body ?? {},
      'The press',
    )

    const row = theAgentARoleDoorNames(asked.handle)
    if (row === null) {
      throw new PanelError(
        `Nothing is registered as "${asked.handle}", so there is nobody to act for you. GET /api/participants ` +
          'lists every person and every durable agent. Nothing was written.',
        404,
      )
    }
    if (!mayBeElevated(decl, row.role)) {
      // MOLE OFFICE'S OWN ROW HOLDS NO CARD, so its sentence does not name one.
      const holds = isMoleOffice({ kind: 'agent', id: row.id })
        ? MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD
        : `holds the ${row.role ?? A_ROW_WITH_NO_ROLE_READS_AS} card`
      throw new PanelError(
        `"${asked.handle}" ${holds}, and only the ${decl.elevation.onlyThisCardCanHoldIt} card can act for you. ` +
          `${decl.elevation.whatItIs.en} Nothing was written.`,
        403,
      )
    }
    const endsWhen = body.endsWhen ?? 'at a time'
    if (!isAWayElevationEnds(decl, endsWhen)) {
      throw new PanelError(
        `"${endsWhen}" is not one of the ways this ends. There are ` +
          `${String(decl.elevation.howItEnds.length)}: ` +
          `${decl.elevation.howItEnds.map((one) => `"${one.kind}" (${one.inWords})`).join(', ')}. Nothing was written.`,
        400,
      )
    }
    // WHAT `until` MEANS DEPENDS ON WHICH END WAS CHOSEN, so each is checked for what it needs. An
    // end nobody can act on — a time with no stamp, a piece of work with no record — would be a
    // grant that never ends, which is the one of the three the owner did not ask for.
    const askedUntil = body.until === undefined || body.until === null || body.until.trim() === '' ? null : body.until.trim()
    // A DAY FROM THE PRESS, when no time is named: the same clock time
    // tomorrow. A time that is named is read here and stored in the stored form (problem OpT-wLSCwlZ-), so the end
    // is compared as a time and the reply shows back what was read.
    const until = endsWhen !== 'at a time' ? askedUntil : askedUntil === null ? aDayFromThePress() : theEndTheyTyped(askedUntil)
    if (endsWhen === 'when a piece of work ends') {
      if (until === null) {
        throw new PanelError(
          'An elevation that ends when a piece of work ends needs the record of that work, as `until`. Nothing was ' +
            'written.',
          400,
        )
      }
      if (getRecord(until) === null) {
        throw new PanelError(
          `There is no record ${until}, so nothing would ever end this. Pick the piece of work it lasts for. ` +
            'Nothing was written.',
          404,
        )
      }
    }

    const held = anyRecordForAgent(row.id)
    if (held === null) {
      throw new PanelError(
        `"${asked.handle}" is registered and has no record in any project, so there is nothing to write the grant ` +
          'on. The grant lives on the agent\'s own record, which is what gives it a change row and a revision. ' +
          'Nothing was written.',
        409,
      )
    }
    // THE RUN IT IS PRESSED IN. The raise is written on the session record of the run the
    // secretary is in when the person presses, with its start and its end. That is the session answering as it now. A
    // secretary answering in no session has no run at that moment; the grant is the person's press all the same, so it is made
    // and written on the agent's record, as every grant is, and the reply says there was no run to write it on.
    const hold = theLiveHoldOn(row.id, true)
    const grant = aGrant({ endsWhen, until, by: actor.id, reason: body.reason, run: hold?.session ?? null })
    // APPENDED TO WHAT THE PERSON HAS ALREADY SAID, rather than written over it. The field is every grant the person
    // made to this agent, oldest first, and the last is the one that counts.
    // THROUGH THE DOOR, so the record write path lets the grant through. Problem mz5ddKDITE3j: the
    // ordinary record door refuses a change to `elevation` on an agent record, and this is the act
    // that door points at. Who may is decided above, by the person-only guard on this route.
    // AND ON THE RUN, through the same door, which `checkNobodyIsWritingTheirOwnRaise` in lib/records/decision-core.ts asks for, and
    // THE SECRETARY IS TOLD, by the office. ONE TRANSACTION: a run or a line that could not be
    // written leaves no grant behind it, so a press answered with a refusal has raised nobody.
    const untilInWords = `${howThisOneEnds(decl, grant.endsWhen)}${until === null ? '' : `, ${until}`}`
    const notPressed = { ...whatTheGrantDoesNotPressNow(), never: decl.elevation.doesNotCarry.map((one) => one.name) }
    const told = sqlite.transaction(() => {
      throughTheCardDoor(() => {
        patchRecord(held.record, { dataPatch: { elevation: asStored([...everyGrantMadeTo(asked.handle), grant]) } }, actor)
        if (hold !== null) {
          patchRecord(hold.session, { dataPatch: { raises: [...readRaises(getRecord(hold.session)?.data?.['raises']), aRaiseOnTheRun(grant)] } }, actor)
        }
      })
      return writeASystemLineToOne({ kind: 'agent', id: row.id }, workspaceOf(req), SYSTEM_LINES.youAreRaised(untilInWords, body.reason, grant.id, notPressed), theOfficeItself())
    })()
    // SAID ON THE PERSON'S DEVICES when it was pressed on another computer, after the raise is written.
    sayItWasDoneFromAnotherComputer(req, `"${asked.handle}" was raised to act for you`)
    void reply.code(201)
    return {
      agent: asked.handle,
      elevation: grant,
      writtenOn: held.record,
      writtenOnTheRun: hold?.session ?? null,
      told: told.id,
      note:
        `"${asked.handle}" is acting for you ${untilInWords}. Every write it makes under this names the grant, on the ` +
        'change row and on the revision. ' +
        (hold === null
          ? 'It was answering in no session when you pressed, so there was no run to write the raise on; it is on its record. '
          : `The raise is written on its run ${hold.session} with its start and its end. `) +
        'It was told. Only you can end it early: DELETE this address.',
    }
  })

  app.delete('/roles/elevation/:handle', route('role.end-a-grant-early', 'local', ENDING_IT_EARLY_IS_KEPT_HERE, END_NOTE), async (req) => {
    const actor = actorFrom(req)
    const asked = parse(z.object({ handle: z.string().min(1) }).strict(), req.params, 'The agent asked for')
    const byTheGate = thePersonOrTheGrant(actor, req)

    const row = theAgentARoleDoorNames(asked.handle)
    if (row === null) {
      throw new PanelError(`Nothing is registered as "${asked.handle}". Nothing was written.`, 404)
    }
    const grant = theGrantEverMadeTo(asked.handle)
    if (grant === null || grant.endedAt !== null) {
      throw new PanelError(
        `"${asked.handle}" is not acting for you, so there is nothing to end. ` +
          `${grant === null ? 'You have never said it may.' : `The last grant ended: ${grant.endedBecause ?? ''}`} ` +
          'Nothing was written.',
        409,
      )
    }
    const held = anyRecordForAgent(row.id)
    if (held === null) {
      throw new PanelError(`"${asked.handle}" has no record in any project, so there is nothing to write on.`, 409)
    }
    // WHAT IT RECORDS UNDER THE GRANT NAMES THE SECRETARY, NEVER THE PERSON. A press the person made says what it always
    // said; a press a grant carried says which secretary ended it and under which grant, so the record and the line to
    // the secretary whose grant ended cannot be read as the person's own press. An end the gate let through names the
    // agent and the gate instead.
    const pressed = byTheGate ? null : whoPressedItUnderTheGrant(actor)
    const underTheGrant = byTheGate
      ? endedWhileTheGateWasOff(anAgentItsOwnKeyProves(actor) ?? actor.id)
      : pressed === null ? null : `"${theSecretarysName(pressed.by)}" ended it under the person's grant ${pressed.grant}.`
    const over = ended(grant, underTheGrant ?? 'You ended it.')
    // ONE TRANSACTION, as the press is. AND THE SECRETARY IS TOLD, as it was when the person pressed, whether or not there was a
    // run to write the end on.
    const told = sqlite.transaction(() => {
      writeTheEndOfARaise({ record: held.record, every: everyGrantMadeTo(asked.handle), over, actor })
      return writeASystemLineToOne(
        { kind: 'agent', id: row.id },
        workspaceOf(req),
        SYSTEM_LINES.yourRaiseEnded(underTheGrant ?? 'The person ended it.'),
        theOfficeItself(),
      ).id
    })()
    sayItWasDoneFromAnotherComputer(req, `The raise of "${asked.handle}" was ended`)
    return {
      agent: asked.handle,
      elevation: over,
      told,
      note:
        `"${asked.handle}" is not acting for you any more. What it wrote while it was still says so: the grant is ` +
        'on the change row and on the revision of every write it made under it, and none of that is rewritten.',
    }
  })

  /**
   * A RAISED AGENT ENDS ITS OWN RAISE. An agent cannot start a raise itself, and it may end its own.
   *
   *   POST /api/roles/raises/<raise id>/end   (no body)
   *
   * WHO MAY: the agent the raise was given to, sending its own key and its own name. The raise is named by its id, and
   * whose it is is read from the registry row that holds it, so the request cannot name somebody else's. Every other
   * agent is refused with the code raiseEndNotYours, raised or not. The person is sent to their own door, DELETE
   * /api/roles/elevation/<handle>, which is kept on this machine.
   *
   * WHY ANOTHER MACHINE MAY ASK. Ending a raise takes the person's acts away and gives nothing, and an agent may run in a sandbox
   * that reaches the office from another address. The key, not the address, is what proves the agent.
   *
   * IT ONLY ENDS. It takes no body, so it cannot move a raise's end, and a raise that no longer holds is refused rather
   * than written again. Giving or lengthening a raise stays the person's press above, refused to every agent.
   */
  app.post('/roles/raises/:id/end', route('role.elevate', 'remote', OWN_END_NOTE), async (req) => {
    const actor = actorFrom(req)
    const asked = parse(z.object({ id: z.string().min(1) }).strict(), req.params, 'The raise asked for')
    takesNoInput(req, 'POST /api/roles/raises/<id>/end', 'the raise is named in the address and the agent by its own key and name')
    // AN AGENT, PROVED BY ITS OWN KEY. A claim to be an agent with no key, the office's key and the person are refused,
    // in words that say the gate is off while it is.
    const position = gatePosition('who-ends-another-agents-raise')
    const caller = actor.type === 'agent' && actor.provedBy === 'an-agent-key' ? participantForActor(actor) : null
    if (caller === null || caller.kind !== 'agent') {
      if (position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-ends-another-agents-raise', "end another agent's raise")
      throw new PanelError(
        'This door is for the agent a raise was given to: it sends its own key as x-mole-office-key and its own name as ' +
          'x-mole-office-actor-id, and this request did not prove an agent that way. The person ends a raise at DELETE ' +
          '/api/roles/elevation/<handle>. Nothing was written.',
        403,
      )
    }
    const found = theRaiseWithTheId(asked.id)
    if (found === null) {
      throw new PanelError(
        `There is no raise ${asked.id}. A raise's id is in elevation.holding on GET /api/roles, and in raises on the run ` +
          'it was given in. Nothing was written.',
        404,
      )
    }
    // ANOTHER AGENT'S RAISE, while the gate is off, may be ended by any agent its own key proves, and the gate counts it.
    const keyed = found.agentId !== caller.id && anAgentItsOwnKeyProves(actor) !== null
    const byTheGate = keyed && gateMet('who-ends-another-agents-raise', position!) !== 'block'
    if (found.agentId !== caller.id && !byTheGate) {
      if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-ends-another-agents-raise', "end another agent's raise")
      throw new PanelError(
        `Raise ${asked.id} was given to "${found.handle}", not to "${actor.id}". An agent may end only its own raise, ` +
          'and the person may end any. Nothing was written.',
        403,
        undefined,
        undefined,
        'An agent may end only its own raise.',
        { code: 'raiseEndNotYours', values: {} },
      )
    }
    if (!found.holds) {
      throw new PanelError(`Raise ${asked.id} is already over: ${whyARaiseNoLongerHolds(found)}. Nothing was written.`, 409)
    }
    const held = anyRecordForAgent(found.agentId)
    if (held === null) {
      throw new PanelError(`"${found.handle}" has no record in any project, so there is nothing to write the end on. Nothing was written.`, 409)
    }
    const byWhom = byTheGate ? endedWhileTheGateWasOff(caller.id) : null
    const over = ended(found.grant, byWhom ?? `"${found.handle}" ended it itself.`)
    // AND THE AGENT WHOSE RAISE ANOTHER AGENT ENDED IS TOLD, in the same transaction, as the person's door tells it.
    const { run, told } = sqlite.transaction(() => ({
      run: writeTheEndOfARaise({ record: held.record, every: found.every, over, actor }),
      told: byWhom === null ? null : writeASystemLineToOne({ kind: 'agent', id: found.agentId }, workspaceOf(req), SYSTEM_LINES.yourRaiseEnded(byWhom), theOfficeItself()).id,
    }))()
    return {
      agent: found.handle,
      elevation: over,
      writtenOn: held.record,
      writtenOnTheRun: run,
      told,
      note:
        (byWhom === null
          ? `"${found.handle}" ended its own raise ${over.id}, and no longer acts for the person. `
          : `The raise ${over.id} of "${found.handle}" is ended, while the gate "who-ends-another-agents-raise" is off, and "${found.handle}" was told who ended it. `) +
        (run === null ? 'The raise named no run, so its end is written on the agent record only. ' : `Its end is written on the agent record and on the run ${run}. `) +
        'What it wrote while the raise held still names the raise, and none of that is rewritten. Only the person can ' +
        'raise it again.',
    }
  })

  /**
   * THE PERSON, OR AN AGENT BY ITS OWN RANK, GIVES AN AGENT A CARD. Criterion P64.
   *
   *   POST /api/roles/card/<handle>  {"role": "supervisor"}
   *
   * Appointing a role, and choosing for how long, belong on the role profile in the Embassy, where
   * pressing in used to change nothing.
   *
   * THE PERSON GIVES ANY CARD, AND AN AGENT GIVES BY ITS OWN RANK. A decision says the cards go by rank,
   * given by the secretary and the supervisor alike, so rank is each agent's own right, proved
   * by its own key, and the person's grant adds nothing to it (`theAgentGivingByItsRank`). An agent gives a card
   * at or below its own rung, to another agent whose present card it could also give, and never to
   * itself (`whyThisAgentMayNotChangeTheCard`). So it cannot hand itself a card or take away a card
   * above its rank, and only the person gives or takes away the secretary card. An agent that needs a higher
   * rung for itself asks with the request its starter answers — criterion P65 — and that is a
   * different door for that reason.
   *
   * IT WRITES THE AGENT'S RECORD AND NOT THE REGISTRY ROW, which is the arrangement the elevation
   * press has and the reason is the same: the record is the source, so the change gets a change row
   * and a revision saying who gave the card, and `keepTheAgentRegistryInStep` copies it to the row a
   * refusal reads.
   */
  app.post('/roles/card/:handle', route('role.appoint', 'local', APPOINTING_IS_KEPT_HERE, APPOINT_NOTE), async (req, reply) => {
    const actor = actorFrom(req)
    const asked = parse(z.object({ handle: z.string().min(1) }).strict(), req.params, 'The agent asked for')
    const body = parse(z.object({ role: z.string().min(1) }).strict(), req.body ?? {}, 'The card')
    const giver = theAgentGivingByItsRank(actor, req)

    const row = theAgentARoleDoorNames(asked.handle)
    if (row === null) {
      throw new PanelError(
        `Nothing is registered as "${asked.handle}", so there is nobody to give a card to. GET /api/participants ` +
          'lists every person and every durable agent. Nothing was written.',
        404,
      )
    }
    const decl = theRoleCards()
    const said = body.role.trim()
    // AND IS IT A CARD AN AGENT MAY HOLD AT ALL. `cards` and `personCards` are two lists in one
    // declaration and nothing reads across them, so a person's card offered to an agent is refused
    // here rather than stored and drawn as a role no registration could ever use.
    if (!isARole(decl, said)) {
      throw new PanelError(
        `"${said}" is not a card an agent holds. The cards an agent may hold are ` +
          `${decl.cards.map((one) => one.name).join(', ')}, from the cards list in ${ROLE_CARDS_FILE}. The other ` +
          'list in that file is the cards a PERSON holds, and nothing reads across the two. Nothing was written.',
        400,
      )
    }
    if (giver !== null) {
      const no = whyThisAgentMayNotChangeTheCard(decl, giver, row, said)
      if (no !== null) throw new PanelError(`${no} Nothing was written.`, 403)
    }
    const held = anyRecordForAgent(row.id)
    if (held === null) {
      throw new PanelError(
        `"${asked.handle}" is registered and has no record in any project, so there is nothing to write the card ` +
          "on. The card lives on the agent's own record, which is what gives it a change row and a revision. " +
          'Nothing was written.',
        409,
      )
    }
    const before = row.role
    // THROUGH THE DOOR, so the record write path lets the card through. Problem mz5ddKDITE3j: the
    // ordinary record door refuses a change to `role` on an agent record and names this route as
    // where the act is done. Who may is decided above: the person, or an agent by its own rank. The
    // write is the giver's, so the change row and the revision name the agent that gave the card.
    const patched = throughTheCardDoor(() => patchRecord(held.record, { dataPatch: { role: said } }, actor))
    // AND THE ONE MESSAGE THAT SAYS THE CARD CHANGED, where it really changed. A change writes one,
    // and a change that leaves the card as it was writes nothing. It goes to the
    // agent in the project its own record is in, from the office, unseen.
    const heldWord = before ?? A_ROW_WITH_NO_ROLE_READS_AS
    const cardChanged = heldWord !== said
    if (cardChanged) {
      writeTheCardMessageToOne({
        to: { kind: 'agent', id: row.id },
        workspaceId: held.workspaceId,
        role: said,
        actor,
        change: { from: heldWord, by: actor.id },
      })
    }
    // AND THE SECRETARIAT GROUP FOLLOWS THE CARD. A new secretary joins it; an agent that stopped
    // holding the card leaves it.
    const group = syncTheSecretariatGroup()
    // AND THE BROADCAST SCHEDULE FOLLOWS THE SAME CARD: a new secretary gets one, and one that stopped
    // holding the card has its schedule ended.
    const broadcasts = syncTheBroadcastSchedules()
    const remoteLine = sayItWasDoneFromAnotherComputer(req, `"${asked.handle}" was given the ${said} card`)
    void reply.code(201)
    return {
      agent: asked.handle,
      role: said,
      wasHolding: before,
      writtenOn: held.record,
      ...(patched.nothingWritten !== undefined && !cardChanged && !group.created && !group.membershipChanged && broadcasts.added.length === 0 && broadcasts.ended.length === 0 && remoteLine === null
        ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) }
        : {}),
      note:
        `"${asked.handle}" holds the ${said} card. What it may do is computed from that word and the tree in ` +
        `${ROLE_CARDS_FILE} on the next request it makes; nothing it already wrote is changed.`,
    }
  })

  /**
   * AN AGENT ASKS ITS STARTER FOR A HIGHER RUNG. Criterion P65.
   *
   *   POST /api/roles/requests             {"asking": "supervisor", "because": "…"}
   *   POST /api/roles/requests/<id>/grant  {"says"?: "…"}
   *   POST /api/roles/requests/<id>/refuse {"says"?: "…"}
   *
   * An agent registers as a worker by default and may ask to be raised. It asks whoever started it: a
   * worker that finds its module too big for one sends the request to its supervisor, and if the
   * supervisor agrees the worker is raised to supervisor.
   *
   * ---------------------------------------------------------------------------------------
   * WHO ANSWERS IS THE REGISTRY'S ANSWER AND NEVER THE BODY'S
   * ---------------------------------------------------------------------------------------
   *
   * You talk to whoever started you. So the answerer is read from `startedBy` on the
   * asker's registry row, the same field the chain of starters is built from. A body field would let
   * an agent name an answerer that would say yes, which is the whole of what a starter is for.
   *
   * ---------------------------------------------------------------------------------------
   * A GRANT IS CHECKED WITH THE READING REGISTRATION USES
   * ---------------------------------------------------------------------------------------
   *
   * `whyThisRoleMayNotBeGiven` is what `POST /api/agents/started` asks, and it is what a grant asks:
   * a starter gives a card at or below its own rung, a worker gives none, and only the person
   * appoints a secretary or an inspector. A second reading here would be a second answer to "may
   * this agent hand out that card", and the two would come apart the day the tree moved.
   */
  app.post('/roles/requests', route('role.request', 'remote', ASK_NOTE), async (req, reply) => {
    const actor = actorFrom(req)
    const body = parse(
      z.object({ asking: z.string().min(1), because: z.string().optional() }).strict(),
      req.body ?? {},
      'The request',
    )
    const decl = theRoleCards()
    const asking = body.asking.trim()

    const asker = participantForActor(actor)
    if (asker === null || asker.kind !== 'agent') {
      // THE CALLER IS NAMED AS THE KIND IT ASKED AS (line round 51; see `whyAnUnregisteredWriterIsRefused` in lib/messages.ts).
      if (actor.type === 'human' && asker !== null) {
        throw new PanelError(
          `The person "${actor.id}" is registered, and a rung is held by an agent, not by a person. ` +
            'A rung is asked for by the agent that holds it, under its own handle. GET /api/participants lists every ' +
            'person and every durable agent. Nothing was written.',
          403,
        )
      }
      if (actor.type === 'human') {
        throw new PanelError(
          `Nothing is registered as the person "${actor.id}", and a rung is held by an agent, not by a person. ` +
            'A rung is asked for by the agent that holds it, under its own handle. GET /api/participants lists every ' +
            'person and every durable agent. Nothing was written.',
          403,
        )
      }
      if (actor.type === 'system') {
        throw new PanelError(
          `Nothing is registered as the system writer "${actor.id}". No registry holds a system writer, and a rung is ` +
            'held by an agent. A rung is asked for by the agent that holds it, under its own handle. GET ' +
            '/api/participants lists every person and every durable agent. Nothing was written.',
          403,
        )
      }
      throw new PanelError(
        `Nothing is registered as the agent "${actor.id}", so there is nobody to raise and nobody who started it. ` +
          'A rung is asked for by the agent that holds it, under its own handle. GET /api/participants lists every ' +
          'person and every durable agent. Nothing was written.',
        403,
      )
    }
    if (!isARole(decl, asking)) {
      throw new PanelError(
        `"${asking}" is not a card an agent holds. The cards an agent may hold are ` +
          `${decl.cards.map((one) => one.name).join(', ')}, from the cards list in ${ROLE_CARDS_FILE}. Nothing ` +
          'was written.',
        400,
      )
    }
    // `asker` came from `participantForActor`, so its id is the registry id; the row is read by
    // that exact id rather than being looked up again by the handle.
    const row = readParticipant(asker) as RegisteredAgent | null
    const holding = row?.role ?? null
    if (holding === asking) {
      throw new PanelError(
        `"${asker.id}" already holds the ${asking} card, so there is nothing to raise. Nothing was written.`,
        409,
      )
    }
    const starter = row?.startedBy ?? null
    if (starter === null) {
      throw new PanelError(
        `Nobody is recorded as having started "${asker.id}", so there is nobody to ask. The person's rule is 谁开的向谁沟通 ` +
          '— you ask whoever started you — and a request with no answerer is a request nobody will ever press. A ' +
          'person can say they started it: PATCH /api/participants/agent/' +
          `${asker.id} {"startedBy":"me"}. Nothing was written.`,
        409,
      )
    }
    // A PERSON'S AGENT ASKS THEM DIRECTLY, AND THAT IS NOT A REFUSAL. Criterion P65 used to refuse
    // here with a 409, because a person appoints with a press rather than by answering a request. The
    // refusal reached the agent as a sentence it could only say out loud in a terminal, which is not a
    // thing that happens; F15 point 2 asks for the ask to reach the screen instead. So the ask is
    // recorded with the person as its answerer and the needs-you list and the citizen's page draw the
    // press. The grant route below admits a waiting self-registration and gives the card in one press.

    // ONE TRANSACTION. A refusal of the message says nothing was written, so the request it carries is
    // not left behind without the message that asks anybody (problem jwgat4DE1kR2). Until wave 13w
    // round 10 a `because` that seemed to hold a key was such a refusal; it is now stored, and the
    // reminder is passed on in this answer.
    const { created, said } = sqlite.transaction(() => {
      const created = createRecordWithReport({
        workspaceId: workspaceOf(req),
        kind: 'role_request',
        title: `${asker.id} asks for the ${asking} card`,
        data: {
          asking,
          ...(holding === null ? {} : { holding }),
          asker: { kind: asker.kind, id: asker.id },
          answersTo: { kind: starter.kind, id: starter.id },
          ...(body.because === undefined || body.because.trim() === '' ? {} : { because: body.because.trim() }),
        },
        actor,
        // NEITHER LIST OF TITLES ALREADY FILED. The answer below names neither, and nothing else reads them.
        namesWhatIsAlreadyFiled: false,
      })

      // AND THE MESSAGE THAT CARRIES IT. The asker SENDS the request to
      // the supervisor. A record nobody was told about is a request nobody was asked, so the message
      // is written here rather than left to the asker: an agent that filed the record and forgot the
      // message would have asked nobody, and nothing would have failed.
      const said = createRecordWithReport({
        workspaceId: workspaceOf(req),
        kind: 'message',
        title: `A request for the ${asking} card`,
        data: {
          body:
            `${asker.id} asks for the ${asking} card` +
            `${holding === null ? '' : `, holding the ${holding} card`}.` +
            `${body.because === undefined || body.because.trim() === '' ? '' : ` ${body.because.trim()}`}` +
            ` Grant it or refuse it in one press on the request.`,
          to: [{ kind: starter.kind, id: starter.id }],
          sentBy: { kind: asker.kind, id: asker.id },
          // WHAT THE MESSAGE IS CARRYING. The request record itself, so the starter opens the thing it
          // is answering rather than a description of it.
          target: { target: { kind: 'record', recordId: created.record.id, workspaceId: workspaceOf(req) } },
        },
        actor,
        // NEITHER LIST, for the same reason: the answer keeps the message's id and its key reminder only.
        namesWhatIsAlreadyFiled: false,
      })
      return { created, said }
    })()

    void reply.code(201)
    return {
      request: created.record.id,
      message: said.record.id,
      asking,
      holding,
      answersTo: starter,
      incomplete: created.incomplete,
      note:
        `${starter.id} has been asked, and holds the answer. Nothing about "${asker.id}" has changed: it holds ` +
        `the ${holding ?? A_ROW_WITH_NO_ROLE_READS_AS} card until that press. Only ${starter.id} or the person ` +
        'may answer.',
      ...(said.keyReminder === undefined ? {} : { keyReminder: said.keyReminder }),
    }
  })

  /**
   * THE ROLE REQUEST A PRESS NAMES, filed in the project the request names, or a refusal.
   *
   * IT MUST BE FILED IN THE PROJECT THIS REQUEST NAMES. A record belongs to one project; answering
   * about one from another would let a starter in one project settle a rung asked for in a project it
   * is not working in, and the id would look ordinary. The same rule `readMessage` states, in the same
   * words: named rather than answered about.
   */
  function theRoleRequestThisPressNames(req: FastifyRequest): PanelRecord {
    const asked = parse(z.object({ id: z.string().min(1) }).strict(), req.params, 'The request asked for')
    const request = getRecord(asked.id)
    if (request === null || request.kind !== 'role_request') {
      throw new PanelError(`There is no role request ${asked.id}. Nothing was written.`, 404)
    }
    if (request.workspaceId !== workspaceOf(req)) {
      throw new PanelError(
        `Role request ${asked.id} is filed in another project, so this project cannot answer it. Send ` +
          `x-mole-office-workspace: ${request.workspaceId}. Nothing was written.`,
        404,
      )
    }
    return request
  }

  /**
   * THE PERSON, OR THE AGENT THAT GRANTED IT AS THE STARTER, WITHDRAWS A NEW-KEY GRANT NOBODY COLLECTED, by point 9
   * of a decision. The rule and the checks are in src/server/lib/newkey.ts.
   */
  app.post('/roles/requests/:id/withdraw', route('role.request', 'remote', WITHDRAW_NOTE), async (req) => {
    const actor = actorFrom(req)
    parse(z.object({}).strict(), req.body ?? {}, 'The withdrawal')
    const request = theRoleRequestThisPressNames(req)
    const ask = aNewKeyAsk(request)
    // A CARD REQUEST OR A WAITING SELF-REGISTRATION IS WITHDRAWN BY ITS ASKER, while the person has not answered it
    // (decision tFl1YWLH3eCl). The rule and the checks are in src/server/lib/withdraw-a-request.ts.
    if (ask === null) return withdrawARequestToThePerson({ request, actor })
    return withdrawANewKeyGrant({ request, ask, actor })
  })

  for (const answer of ['grant', 'refuse'] as const) {
    app.post(`/roles/requests/:id/${answer}`, route('role.request', 'remote', ANSWER_NOTE), async (req, reply) => {
      const actor = actorFrom(req)
      const body = parse(z.object({ says: z.string().optional() }).strict(), req.body ?? {}, 'The answer')
      const request = theRoleRequestThisPressNames(req)
      return answerARoleRequest(request, answer, body, actor, () => {
        void reply.code(201)
      })
    })
  }

  app.post('/roles/mirror', route('role.mirror', 'remote', MIRROR_NOTE), async (req: FastifyRequest) => {
    // ITS OWN DECLARATION SAYS IT TAKES NO BODY, so it refuses one. A key an endpoint does not read
    // is a caller believing something about it that is not true, and answering 200 confirms it.
    takesNoInput(
      req,
      'POST /api/roles/mirror',
      'It copies every role card, and which project the copies go in is the workspace header.',
    )
    const workspaceId = workspaceOf(req)
    const actor = actorFrom(req)
    const copies = copiesIn(workspaceId)
    const at = now()
    const written: string[] = []
    const rewritten: string[] = []
    const alreadyCurrent: string[] = []

    for (const { card } of everyCard()) {
      const held = copies.get(card.name)
      const data = { roleName: card.name, card, copiedFrom: ROLE_CARDS_FILE, copiedAt: at }
      if (held === undefined) {
        createRecordWithReport({
          workspaceId,
          kind: 'role_card',
          title: titleFor(card),
          summary: card.duties,
          // AND THE FIRST OF ITS THREE PORTRAITS, criterion P47. A card copied for the first time
          // gets the role's -1 picture, which is a default and not a choice: whoever holds the card
          // picks another of the three, and a later mirror never writes over what they picked.
          data: { ...data, portrait: theFirstPortraitOf(card.name) },
          actor,
          // NEITHER LIST OF TITLES ALREADY FILED. The mirror keeps nothing this write gives back.
          namesWhatIsAlreadyFiled: false,
        })
        written.push(card.name)
        continue
      }
      if (differencesFrom(card, held.card).length === 0) {
        // NOTHING IS WRITTEN WHEN NOTHING CHANGED. Rewriting a matching copy would put a revision in
        // the ledger saying somebody changed a card on a day nobody did.
        alreadyCurrent.push(card.name)
        continue
      }
      // THE CARD IS REPLACED WHOLE, AND EVERY OTHER FIELD OF THE RECORD IS CARRIED OVER AS IT IS.
      //
      // This used to be a `dataPatch`, and that is why the mirror never settled (problem
      // 9Y5Isyx1zzy0). A merge patch merges an object into the object already stored, and a null
      // in it deletes the key instead of storing a null. A card declares nulls: the inspector's and
      // the administrator's `rung` is null, and `mustRead.andWhatItsStarterNames` is null on the
      // secretary's and the administrator's cards. So every rewrite stored those cards without
      // those keys, the comparison above read the stored card as different from the declared one,
      // and the next run rewrote the same three cards again. A merge also could never take off a
      // key that somebody added to a copy by hand, so such a copy read out of date for ever.
      //
      // The copy is meant to hold the card exactly as the declaration holds it, and `differencesFrom`
      // compares exactly that. A wholesale `data` stores exactly what it is given, so the writer and
      // the comparison now read the card one way. The reason it was a merge still holds, and is
      // still met: a copy that gained a field somebody else wrote must not be emptied because this
      // write did not mention it. So the record's other fields, such as the `portrait` its holder
      // picked, are read from the stored record and sent back unchanged, and nothing is emptied.
      // The read and the write are one synchronous step, so nothing else can write the record
      // between them.
      const stored = getRecord(held.id)?.data ?? {}
      patchRecord(held.id, { data: { ...stored, ...data }, title: titleFor(card), summary: card.duties }, actor)
      rewritten.push(card.name)
    }

    return {
      written,
      rewritten,
      alreadyCurrent,
      note:
        `${String(written.length)} copied for the first time, ${String(rewritten.length)} rewritten, ` +
        `${String(alreadyCurrent.length)} already matched and were left alone. The declaration in ` +
        `${ROLE_CARDS_FILE} is unchanged: this route copies it and never the other way round.`,
    }
  })

  app.get('/roles/shipped-words', route('role.shipped-words', 'remote', THE_SHIPPED_WORDS_NOTE), async (req: FastifyRequest): Promise<TheShippedWords> => {
    const asked = parse(z.object({ role: z.string().min(1).optional() }).strict(), req.query, 'The card asked for')
    return theShippedWordsBesideTheOffices(asked.role)
  })

  // THE PERSON'S PRESS, OR THE SECRETARY'S UNDER THE PERSON'S GRANT, and nobody else's. The record door's own guard
  // lets the grant carry this press and no other change of a card's words (lib/card-words.ts).
  app.post('/roles/shipped-words/copy', route(THE_PRESS_OF_THE_SHIPPED_WORDS, 'remote', COPY_THE_SHIPPED_WORDS_NOTE), async (req: FastifyRequest) => {
    const body = z.strictObject({ role: z.string().min(1), ifVersion: z.string().min(1) }).safeParse(req.body)
    if (!body.success) {
      throw new PanelError('Send the card and the version you read: {"role": "<a card>", "ifVersion": "<its version>"}. Nothing was written.', 400)
    }
    const actor = actorFrom(req)
    if (!thePersonIsProved(actor) && actor.theOwnersAuthority?.holds !== true && !theSecretaryActingForThePerson(actor)) {
      throw new PanelError('Only the person, the owner’s authority, or a secretary under the person’s grant copies a card’s shipped words. Nothing was written.', 403)
    }
    return copyTheShippedWords(body.data.role, body.data.ifVersion, actor)
  })
}
