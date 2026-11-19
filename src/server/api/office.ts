// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE OVER HTTP: which worlds there are, and a world's birth, death and name.
 *
 *   GET   /api/office/worlds        every world this installation has had, and where this list came from
 *   POST  /api/office/worlds        a world says it has started
 *   POST  /api/office/worlds/:id/close   a world has ended, with the reason
 *   PATCH /api/office/worlds/:id    the name a person reads
 *
 * EVERY WORLD SERVES THESE, because a world always knows about itself. The office — whichever
 * database holds the home world — answers from its own rows; any other world answers
 * from the mirror the main world writes, and from its own rows when there is no mirror. The reply
 * says which of the three it is, so a reader is never left to guess. That is criterion C2's second
 * half: *a world whose main world does not answer reads the mirror.*
 */

import { agentMarksFor } from '../lib/agent-tags.ts'
import { projectsOfAgents } from '../db/projects-of-agents.ts'
import type { FastifyInstance, FastifyRequest } from 'fastify'
// NOTHING FROM A SANDBOX IS THE PERSON: which program sent the pairing press.
import { THEIR_OWN_PROGRAM, readWhoSentItFromThisComputer, whomThisComputerFinds } from '../lib/from-a-sandbox.ts'
import { theWayToPairOnThisComputer } from '../lib/not-proved-the-person.ts'
import { z } from 'zod'
import { WORLD_KINDS, whyWorldNameIsRefused, type Mirror, type World } from '@shared/worlds.ts'
import type { DevSaying } from '@shared/dev-sayings.ts'
import {
  PARTICIPANT_KINDS,
  admittedBeforeP88,
  admittedBeforeP88Says,
  defaultAvatarAssetId,
  moleOffice,
  theMoleOfficeTest,
  type ParticipantRef,
} from '@shared/participants.ts'
import { avatarsOnOffer, pictureShownFor } from '../lib/avatars.ts'
import { participantKey } from '@shared/messages.ts'
import {
  A_PERSON_WITH_NO_ROLE_READS_AS,
  A_ROW_WITH_NO_ROLE_READS_AS,
  theMarkSaying,
  type WhoChoseTheCard,
} from '@shared/roles.ts'
import { theFirstPortraitThatExists } from '../lib/portraits.ts'
import {
  EMBASSY_PAGE_ROWS,
  EMBASSY_PAGE_ROWS_MOST,
  isEphemeral,
  theEmbassyPageDrawsThisRow,
  type EmbassyKey,
  type EmbassyRow,
  type EmbassyWorldRow,
  type EmbassyView,
  type WhatTheEmbassySays,
} from '@shared/worlds.ts'
import { PAGE_SHAPE } from '@shared/short-lists.ts'
// WHAT A WORLD'S CLAIM TO BE THE PERSON'S IS WORTH, said on the row a person reads. Criterion P31.
import { A_WORLDS_OWNER_IS_A_CLAIM, credentialNeedsOwnerAction, isAPersonsDeviceCredential } from '@shared/visitors.ts'
import {
  credentialByTokenHash,
  endTheVisitsOfANewlyRegisteredWorld,
  everyCredential,
  issueAPersonsDeviceCredential,
  refuseIfThisMachineKnockedTooOften,
} from '../lib/visitors.ts'
// THE KEYS THE OFFICE HOLDS. Criterion D2, P83 point 4: the asking browser's token is set as the
// same cookie the loopback press sets, and the read learns which credential the cookie belongs to by
// its SHA-256 and never by the token.
import {
  setTheAskingBrowsersCookie,
  setThePairedBrowserCookie,
  everyLiveKeyHeldBy,
  everyLiveKeyOfTheAgentWithThisId,
} from '../lib/keys.ts'
import { theHashOfTheKeyOnThisRequest } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
// WHICH MACHINES THIS OFFICE TRUSTS. Criterion P73, and G2 of P83's amendment: the ask press is
// offered on the listener for other machines, to an address on this list and to nothing else.

import { writtenFrom } from '../lib/machines.ts'
// THE CEILING ON A VISITOR'S CARD, and the one setting that raises it. Criterion P86.
import {
  aCardIsAboveTheDefaultVisitorCeiling,
  theVisitorCeilingRaisedSays,
} from '../lib/visitorceiling.ts'
// A FAULT ON A PAGE, FILED AS A PROBLEM BY THE OFFICE. Criterion E4's filing half; the rule and the
// attribution are in the library, so this file holds the door and nothing else.
import { fileAFault } from '../lib/faults.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { theAgentAStoredIdNames } from '../lib/the-agent-a-stored-id-names.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theOneAgentAStringNames } from '../lib/agent-references.ts'
// WHETHER ONE PARTICIPANT CAN BE REACHED, criterion P74. READ from the presence library and never
// rebuilt here: the profile page draws this same reading and the two must not disagree.
import { participantPresence, thePresenceReadingsOf } from '../lib/presence.ts'
// WHETHER PICKING AN AGENT'S NEWEST RUN UP AGAIN IS EXPENSIVE, criterion T6. The warning and its
// two thresholds are read from the pick-up-cost library, so this file builds no sentence of its own.
import { pickUpCostPerAgent, pickUpCostThresholds, type PickUpCostThresholds } from '../lib/pick-up-cost.ts'
import type { PickUpCost } from '@shared/pick-up-cost.ts'
// WHO HAS CALLED WITH A CLAIM AND NO KEY, criterion P83 point 6. The shape is shared with the
// Settings page that draws the list, so the writer and the reader cannot disagree about a row.
import type { AHeaderOnlyCaller, WhatTheHeaderOnlyCallersSay } from '@shared/headeronlycalls.ts'
// WHETHER THIS BROWSER IS PAIRED, criterion P83 point 2. The shape is shared with the pairing page
// that draws it, so the reader and the writer cannot disagree about either half.
import type {
  WhatAskingToPairSays,
  WhatThePairingSays,
  WhatThisBrowserIsWaitingOn,
} from '@shared/pairing.ts'
import { asContactsToPlace, theContactsOfOneReader } from '../lib/messages.ts'
import { groupsOf, placeTheContacts } from '../lib/contacts.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { actorFrom } from '../lib/http.ts'
import { arrivalOf } from '@shared/arrival-of.ts'
import { callerAddressOf } from '../lib/caller-address-of.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { PanelError } from '../lib/panel-error.ts'
import {
  endVisitHere,
  openVisitsThisWorldCanSee,
  registerVisitHere,
  reportHeldVisitsToTheOffice,
  reportThisVisitEndedToTheOffice,
  visitsHere,
} from '../lib/visits.ts'
import { theWorldThisDatabaseIs } from '../lib/world.ts'
import { visitorKindForActorType } from '@shared/worlds.ts'
import {
  closeWorldHere,
  theHomeRowOfAnotherDatabase,
  theMirrorThisWorldMayRead,
  readTheMirror,
  registerAWorldAndItsReportsKey,
  renameWorldHere,
  theOfficeIsInThisDatabase,
  theWorldsThisWorldCanName,
  whereTheOfficeIs,
  worldById,
  worldsHere,
} from '../lib/office.ts'
import { sqlite } from '../db/client.ts'
import { localStamp } from '@shared/time.ts'

// ============================================================================ the sentences

const LIST_NOTE =
  'EVERY WORLD THIS INSTALLATION HAS HAD, newest birth first, alive and dead. A world is one running Mole Office ' +
  'with one database, and the identity of the world is the identity of that database. `from` says where this ' +
  'list came from, and a reader is never left to guess: `the office` when this server holds it, `the mirror` ' +
  'when it does not and read the file the main world writes, and `this world alone` when there was no mirror to ' +
  'read — which is not a statement about the installation and is never to be drawn as one. `mirrorNote` says ' +
  'which file that was, or why none was read: a world a test runner started reads no list but its own. A world ' +
  'whose kind is `test` was started by the test helper and lives for one test file.'

const REGISTER_NOTE =
  'A WORLD SAYS IT HAS STARTED. It is registered by the identity of its database, so a second server on the same ' +
  'database is the same world answering twice and gets the row that is already there, with its address and its ' +
  'commit brought up to date. A world that has died and started again gets a new row, because the office keeps ' +
  'every appearance and every disappearance. Any world takes this: a world always knows about itself, and the ' +
  'office is whichever database holds the home world, alive or dead. A KEY FOR THE WORLD\'S REPORTS: when this ' +
  'call writes a new row and the caller proved itself with its own agent key, the office makes one more key of ' +
  'that agent and answers it once in `reportsKey`, with the handle it proves. The world\'s server sends it under ' +
  'that handle on every report it makes here, and the office revokes it when it marks the world ended. ' +
  '`reportsKeySays` says whether a key was made and why not.'

const CLOSE_NOTE =
  'A WORLD HAS ENDED, with one plain sentence saying why. The row is kept and marked; nothing is deleted. A row ' +
  'already closed keeps the reason it was closed with, because the first thing to notice a world had gone is the ' +
  'one whose reason is true.'

const STOP_NOTE =
  'STOP A WORLD KEPT UP FOR SOMEBODY TO LOOK AT, AND MARK IT ENDED. Criterion C32. It stops every process the ' +
  'office recorded for that world through the one door that stops a registered process — `releaseResource`, which ' +
  'names exactly what it would end — and then closes the row with the reason the caller gave. A world the office ' +
  'holds no process row for is closed and says so; it is never claimed to have been stopped.'

const VISITS_NOTE =
  'WHO IS WORKING AWAY FROM HOME. A visit is a citizen of one world working in another, with what they came to ' +
  'do in their own words. `from` says where this list came from, the same three answers the world list gives. ' +
  'A visit whose `registeredLate` is true began before the office heard about it, because the main world was ' +
  'not answering when it started.'

const REGISTER_VISIT_NOTE =
  'REGISTER A TRIP. It is sent to the world being ENTERED, which is the world that has to check it, and that ' +
  'world reports it to the office. A visit to the world the visitor already lives in is refused: there is ' +
  'nothing to register, because a citizen at home is never checked. A visit says what you came to do, and one ' +
  'with that line empty is refused as well.'

const END_VISIT_NOTE =
  'THE VISIT IS OVER. The row is kept and marked; nothing is deleted. A visit already ended is handed back as ' +
  'it is.'

const RENAME_NOTE =
  'THE NAME A PERSON READS. The identity of a world is its database, and this changes nothing about it: a world ' +
  'renamed is the same world. A home world is called "my world" until somebody changes it.'

const FAULT_NOTE =
  'A FAULT ON A PAGE IS FILED AS A PROBLEM. Criterion E4. Body {"message":…,"reading":…,"what":"while-drawing"|' +
  '"while-sending","page"?:…,"press"?:…,"route"?:…}. `message` is the fault\'s own words, unchanged. `reading` is ' +
  'one browser tab from the moment the product is opened until it is closed, named by the browser because nothing ' +
  'here can tell two tabs apart. THE OFFICE FILES IT, NOT THE CALLER: the problem is written under the office\'s ' +
  'own name whoever asks, because the browser sends the person\'s headers and a problem filed under them would ' +
  'say they found something no person did. ONCE PER FAULT PER READING: the same message on the same page in the ' +
  'same reading writes nothing and answers 200 with the problem it already filed; a new one answers 201. The ' +
  'reply carries the problem\'s id either way, so the panel can draw a link to it.'

// ============================================================================ what a caller sends

const whichWorld = z.object({ id: z.string().min(1) })

/**
 * WHAT THE BROWSER SENDS WHEN A PAGE OR A PRESS STOPPED. Criterion E4.
 *
 * The message is capped because it is a fault's own words and some of them carry a whole stack; the
 * cap is generous enough that no real message this product has produced comes near it, and it stops
 * a page from writing a megabyte into a record title. Nothing is trimmed silently: over the cap the
 * write is refused and the browser is told.
 */
const aFaultOnAPage = z
  .object({
    message: z.string().min(1).max(4000),
    page: z.string().min(1).max(200).nullish(),
    press: z.string().min(1).max(200).nullish(),
    route: z.string().min(1).max(500).nullish(),
    reading: z.string().min(1).max(64),
    what: z.enum(['while-drawing', 'while-sending']),
  })
  .strict()

const registerBody = z.object({
  name: z.string().min(1),
  /**
   * WHAT THE WORLD IS FOR, in the starter's own words, or absent because nobody said.
   *
   * Criterion P87. Absent and null are the same answer here, and it is a real one: a world whose
   * starter said nothing is not an error, and the row stays null rather than being given an
   * invented purpose.
   */
  purpose: z.string().nullish(),
  /**
   * WHICH HANDBACK THIS WORLD BELONGS TO, by record id, or absent because nobody said.
   *
   * Criterion C33. Nothing here checks that the record exists: a world is usually started before
   * its handback is written, so a check would refuse the ordinary case. Absent and null are the
   * same answer and both are real ones.
   */
  handback: z.string().nullish(),
  kind: z.enum(WORLD_KINDS),
  startedBy: z.object({ kind: z.enum(PARTICIPANT_KINDS), id: z.string().min(1) }).nullish(),
  checkout: z.string().nullish(),
  head: z.string().nullish(),
  databaseIdentity: z.string().min(1),
  address: z.string().nullish(),
  /** Where another machine reaches it, when this world binds a second door. Absent means it does not. */
  addressForOtherMachines: z.string().nullish(),
  standing: z.string().min(1),
  parentWorld: z.string().nullish(),
  installation: z.string().min(1),
})

const closeBody = z.object({ because: z.string().min(1) })

const renameBody = z.object({ name: z.string() })

const whichVisit = z.object({ id: z.string().min(1) })

const visitBody = z.object({
  /** Who is visiting. Absent means the actor on the request, which is the ordinary case. */
  visitor: z.object({ kind: z.enum(PARTICIPANT_KINDS), id: z.string().min(1) }).nullish(),
  /** The database identity of the world the visitor lives in. */
  fromWorld: z.string().min(1),
  /**
   * The world the visit is TO. Absent means this world, which is the ordinary case: a visit is
   * registered at the world being entered. It is said out loud when one world reports to the office
   * a visit that was made somewhere else, because the office is not where that visitor went.
   */
  toWorld: z.string().nullish(),
  why: z.string(),
  /** When it began, for a visit that was held while the office was down. Criterion C8. */
  since: z.string().nullish(),
  /**
   * The id the world holding the visit gave it, when that world is reporting it here.
   *
   * IT IS IGNORED FOR A VISIT TO THIS WORLD. A trip registered where it is being made gets a fresh
   * id; only a report about somewhere else keeps the id it already has, so that the two copies of
   * one visit are one visit and ending it in one place ends it in both.
   */
  id: z.string().min(1).nullish(),
})

/** Every world, and where the answer came from. One shape whichever of the two answered. */
interface WhatTheOfficeSays {
  worlds: World[]
  from: 'the office' | 'the mirror' | 'this world alone'
  /** When the mirror was written, for an answer that came from one. Null otherwise. */
  mirrorWrittenAt: string | null
  /**
   * Which file was looked for, or null because this world may not read the declared office's mirror
   * at all. `mirrorNote` says which of the two it is; neither is an empty office.
   */
  mirrorFile: string | null
  /** Why that file, or why there is none. Always said, so a short list is never left to be guessed at. */
  mirrorNote: string
  /**
   * `mirrorNote` as a code the Worlds page draws in its own language (src/shared/dev-sayings.ts), or
   * null when the caller handed in a reason of its own that has none.
   */
  mirrorNoteSaid: DevSaying | null
  /** Whether this server is the one holding the office. */
  isTheOffice: boolean
  /**
   * The database identity on this database's home row, when that is not this database.
   *
   * A COPY OF THE MAIN WORLD'S DATABASE, SERVED AS A SECOND WORLD. It carries the original's rows,
   * home row included, so it believes it is the office and answers about worlds none of which is
   * itself. Null in every ordinary case, including the main world itself. The page says what it
   * means; this says only what was read.
   */
  theHomeRowBelongsTo: string | null
  /** The identity of the database answering, so a reader can compare it with the rows. */
  thisWorld: string | null
  /** Where the main world's API answers, for a caller that has to go there itself. */
  office: string
}

/**
 * The office as far as this server can tell, and where the answer came from.
 *
 * THREE SOURCES AND ONE LIST. The office answers from its own rows. Any other world reads the
 * mirror, and falls back to its own rows — which hold at least itself — when there is no mirror to
 * read. `from` says which of the three, because "here is the list" and "here is what I could still
 * see" are different sentences and a reader has to be told which one this is.
 */
export function whatTheOfficeSays(
  look: { file: string | null; why: string; whySaid?: DevSaying } = theMirrorThisWorldMayRead(),
): WhatTheOfficeSays {
  const shared = {
    mirrorFile: look.file,
    mirrorNote: look.why,
    mirrorNoteSaid: look.whySaid ?? null,
    isTheOffice: theOfficeIsInThisDatabase(),
    theHomeRowBelongsTo: theHomeRowOfAnotherDatabase(),
    thisWorld: theWorldThisDatabaseIs(),
    office: whereTheOfficeIs(),
  }
  if (shared.isTheOffice) {
    return { worlds: worldsHere(), from: 'the office', mirrorWrittenAt: null, ...shared }
  }
  const mirror: Mirror | null = readTheMirror(look.file)
  if (mirror === null) return { worlds: worldsHere(), from: 'this world alone', mirrorWrittenAt: null, ...shared }
  return { worlds: mirror.worlds, from: 'the mirror', mirrorWrittenAt: mirror.writtenAt, ...shared }
}

// ============================================================================ the embassy

const EMBASSY_NOTE =
  'EVERY CITIZEN AND EVERY VISITOR THE OFFICE KNOWS. One row per standing, not per participant: a ' +
  'citizen of one world who visited two others has three rows. A citizen row comes from this ' +
  'database\'s two registries, joined to the office\'s worlds by the world identity each registration ' +
  'carries; a visitor row comes from the visits, and says which world it came from and when. Each row ' +
  'says whether the caller has that participant on their contacts list and in which group. A visitor ' +
  'from another world need not be registered here and its name is then null, which means nobody here ' +
  'can answer rather than that it has no name. The reply says how complete it is: the office sees every ' +
  'trip ever registered, and any other world sees its own rows alone. ' +
  'WITH `?shape=page` IT ANSWERS WHAT THE EMBASSY PAGE DRAWS: one page of the rows (forty unless ' +
  '`?limit=` says otherwise, up to two hundred), `rowsTotal`, and the counts the three presses say ' +
  '(`hidden`, `retiredCount`, `otherWorlds`), plus `next`, the path of the next page, or null. The ' +
  'default view is the live rows of contacts and of anyone holding a credential; `?everyone=1` widens ' +
  'it to everybody, `?retired=1` adds the retired and ended rows, and `?tests=1` adds the test worlds. ' +
  'A page carries only the credentials waiting for the person, not every credential ever issued. ' +
  '`?row=agent:<id>` (or `person:<id>`, `credential:<id>`) answers one row alone, for a panel that ' +
  'draws one citizen\'s keys.'

const HEADER_ONLY_NOTE =
  'EVERY CALLER THAT SENT AN IDENTITY HEADER AND NO KEY, one row per caller per day, per address and per door. Criterion P83: the ' +
  'key is what makes a caller the person, and for one version a header claim with no key still works on ' +
  'this machine and from a machine the office trusts. This is the list the person reads before the window closes, ' +
  'so they can give a key to anything still calling without one. Each row is a claim and not a proof: it ' +
  'says the name the caller used, where it called from, when it was first and last seen that day, and ' +
  'how many times. A caller that held a key is not on the list.'

const PAIRING_NOTE =
  'WHETHER THIS BROWSER HOLDS THE PERSON\'S KEY, WHETHER PAIRING IS OFFERED, WHETHER IT MAY ASK, AND WHAT IT IS ' +
  'WAITING ON. Criterion P83, point 2, and its amendment of 13 September 2026 at 18:50. `paired` is true ' +
  'only when the request carried the person\'s key — as the cookie the pairing press set, or as the header the ' +
  'local app holds — and it is deliberately not the one-version window, which also covers a keyless claim: a ' +
  'browser the window made the person must still be offered pairing, or it would never receive the key that ' +
  'outlives the window. `offered` is true only on the machine Mole Office runs on, which the listener stamped ' +
  'and no caller can set, and only where a program there can pair: not on a Mac or Windows outside the installed ' +
  'app, where Mole Office cannot tell which program sent a request. Inside the installed app a browser is offered ' +
  'it too, and only the window\'s press pairs. `mayAsk` is true only through the listener for other machines, ' +
  'whether the office trusts that machine or not, when this browser holds no key: that is the knock the person ' +
  'approves on this computer. `waiting` is read from the cookie and names the credential this browser already ' +
  'asked under, when, and whether it is pending, confirmed or ended, so a reload does not lose it. Reads nothing ' +
  'and writes nothing.'

const PAIR_NOTE =
  'PAIR THIS BROWSER: SET THE PERSON\'S KEY AS A COOKIE, IN ONE PRESS. Criterion P83, point 2. The key is read ' +
  'from the file the office made at first run and is never returned, logged or stored anywhere else; the reply ' +
  'says only that this browser is now paired. The cookie is HttpOnly, so page JavaScript cannot read it, and ' +
  'SameSite strict, so another site cannot make this browser act as the person. KEPT ON THIS MACHINE: pairing is ' +
  'offered only to a request the listener stamped as this machine, which is one on 127.0.0.1 or one that came to ' +
  'the address for other machines from one of this computer\'s own addresses, and a caller from another computer ' +
  'is refused before this handler runs. It is not the person\'s own act in the registry sense — the browser ' +
  'pressing it holds no key yet, and the listener\'s stamp is the proof — so it asks for no key and changes ' +
  'nothing but this browser\'s cookie.'

const ASK_TO_PAIR_NOTE =
  'ASK TO PAIR THIS BROWSER: ISSUE A PERSON\'S-DEVICE CREDENTIAL AND SET ITS TOKEN AS THE SAME COOKIE THE PRESS ON ' +
  'THIS COMPUTER SETS. Criterion D2 and the amendment of 13 September 2026 at 18:50. Body {"device":"<the name this ' +
  'browser gives itself>"}. It issues through the same issuing path the credential flow\'s device ask uses, and ' +
  'it NEVER ANSWERS THE TOKEN: the reply names the credential\'s id, the device\'s name and that the person\'s confirmation ' +
  'is still needed. Nothing works until the person confirms it at the Embassy on the machine that runs the office. ' +
  'OFFERED FROM ANOTHER MACHINE, WHETHER THE OFFICE TRUSTS IT OR NOT: the request must have arrived through the ' +
  'listener for other machines, which the listener measured, and this browser must hold no key. A caller from this ' +
  'computer uses the press on this computer instead. One address may ask a bounded number of times in a window; after ' +
  'that the answer is 429 and names the wait, and nothing is written.'

/**
 * WHAT A PAGE OF THE EMBASSY ASKS FOR. Null, the third argument left out, answers the whole roll as
 * before, which is what the tools, the agent doors and the tests that read every row ask for.
 */
export interface EmbassyAsked {
  /** The one row a page about one participant needs, or null for the list. */
  row: { kind: 'agent' | 'person' | 'credential'; id: string } | null
  /** Until which list the page has been widened. */
  view: EmbassyView
  /** The place of this page's first row in the whole view, counting from 0. */
  from: number
  /** How many rows this page may hold. */
  limit: number
}

/**
 * WHO THE OFFICE KNOWS, as one list of standings.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE EACH HALF COMES FROM, AND WHY NEITHER IS DERIVED TWICE
 * ---------------------------------------------------------------------------------------
 *
 * A citizen row is a registry row. Both registries are per database and every row carries the world
 * it was registered in (criterion C1), so grouping them by that column IS the roll — nothing else
 * works it out and nothing here re-decides it. A visitor row is a visit, which is the only record of
 * a trip there is. Whether somebody is a contact is `theContactsOfOneReader`, the one reading the
 * contacts list itself is built from.
 *
 * ---------------------------------------------------------------------------------------
 * A CITIZEN WITH NO WORLD IS LEFT OUT, AND THE SENTENCE SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * `homeWorld` is null on a row written before the registries carried a world, and on a row in a
 * database whose own identity could not be read. Putting such a row under some world would be
 * inventing a citizenship; putting it under a made-up "unknown world" would be inventing a world.
 * It is not a row here, and the profile page is where that participant's own page says nobody
 * recorded one.
 */
export function theEmbassy(
  workspaceId: string,
  reader: ParticipantRef | null,
  asked: EmbassyAsked | null = null,
): WhatTheEmbassySays {
  // THE NAMES OF THE WORLDS ON EACH ROW: this database's own table first, then, in a world that is
  // not the office, the office's list from its mirror. A citizen copied from the office has the
  // office as home, and a world's copy carries no row for the office. `theWorldsThisWorldCanName`
  // in lib/office.ts is the one place that lookup is made.
  const { nameOf } = theWorldsThisWorldCanName()
  const worlds = { get: (identity: string): World | undefined => nameOf(identity)?.world }
  const both = listParticipants()
  // WHAT THIS TABLE NEEDS OF EACH REGISTRY ROW: their name, the picture beside it, the card they
  // hold and the drawing on that card. Criteria P46 and P47.
  const held = new Map<
    string,
    {
      name: string
      avatarAssetId: string
      role: string
      /** Whether that word is one somebody wrote, or the one a row with none is read as. P53. */
      choseRole: boolean
      /** The stored mark saying who chose it, or null because nobody recorded one. P75. */
      cardChosenBy: WhoChoseTheCard | null
      portrait: string | null
      /** The credential this agent was registered on, or null because it needed none. P69. */
      credential: string | null
      /** The runtime the row declares, or null because nobody said. Criterion P88. */
      runtime: string | null
      /** When the row was written, for the P88 sentence. Criterion P88. */
      createdAt: string
      /** The machine its credential measured, or null. Criterion P88. */
      machine: string | null
    }
  >()
  /**
   * ONE STANDING, BEFORE ITS ROW IS BUILT. The list's view, its counts and its page are decided from
   * these cheap facts, and a row is built only for the page that draws it. Building all 2,641 rows
   * was the whole roll and the seconds it took; the page draws forty.
   */
  const candidates: {
    standing: EmbassyRow['standing']
    who: ParticipantRef
    /** Whether the row is folded under the retired press: a retired agent or an ended credential. */
    closed: boolean
    /** The credential this row came in on, or null. */
    credential: string | null
    /** Whether the reader has this participant on their contacts list. */
    contact: boolean
    /** The whole row, made when a page draws it. */
    fill: () => EmbassyRow
  }[] = []
  /**
   * THE CREDENTIALS AND THE CEILING, READ ONCE FOR THE WHOLE TABLE. P86 and P88.
   *
   * `credentials` is the same read again below, so reading it twice would be two clocks on one page.
   * `machineOfCredential` lets a citizen row that came in on a credential name the same machine the
   * credential is listed with, rather than reading a second time.
   */
  const credentials = everyCredential()
  const machineOfCredential = new Map(credentials.map((one) => [one.id, one.machine]))
  const ceilingRaisedSays = theVisitorCeilingRaisedSays()
  /** The P88 sentence for a stored row, or null because the row is not one admitted before the gate. */
  const p88SentenceFor = (runtime: string | null, createdAt: string, credential: string | null): string | null =>
    createdAt !== '' && admittedBeforeP88(runtime, createdAt, credential)
      ? admittedBeforeP88Says(runtime, createdAt)
      : null
  /** The P86 sentence for a row whose card is above the default ceiling and came in on a credential. */
  const ceilingSentenceFor = (role: string | null, credential: string | null): string | null =>
    ceilingRaisedSays !== null && credential !== null && aCardIsAboveTheDefaultVisitorCeiling(role)
      ? ceilingRaisedSays
      : null

  /**
   * ONE CLOCK FOR THE WHOLE TABLE. The presence reading and the pick-up warning are taken at the
   * same moment, so a row cannot be drawn from two clocks a tick apart.
   */
  const now = new Date()

  /**
   * ONE READING OF THE SESSION RECORDS, THE MACHINE, THE WAITING RUNS AND THE PROCESS ROWS FOR THE
   * WHOLE TABLE, each made when the first row needs it. They are the readings `everybodysPresence`
   * hands to every row of the roster, from the same function, so the Embassy and the roster read
   * them the same way.
   *
   * Without them, `participantPresence` reads each of them again for every row. Measured on a copy
   * of the owner's office on 25 September 2026 (problem iZtwtr12RSxw): the door took 29 to 41 seconds, most
   * of it those reads repeated per row, and 9 to 12 seconds once the machine, the session records
   * and the waiting runs were read once. The process rows were still read once per agent until 27
   * September 2026: in a CPU profile on a copy of the owner's office that was about 45 ms of each call, when
   * one call took about 580 ms. The pick-up warning reads the same session rows, so the whole
   * Embassy reaches its runs from one read.
   */
  let presenceReadings: ReturnType<typeof thePresenceReadingsOf> | null = null
  /** The one presence reading, made when the first row that draws presence needs it. A page of no rows reads none. */
  const readings = (): ReturnType<typeof thePresenceReadingsOf> =>
    (presenceReadings ??= thePresenceReadingsOf(workspaceId))
  const pickUpThresholds: PickUpCostThresholds = pickUpCostThresholds()
  let pickUpByAgent: Map<string, PickUpCost> | null = null
  /**
   * WHETHER PICKING THIS AGENT'S NEWEST RUN UP IS EXPENSIVE. Criterion T6.
   *
   * The row is a participant and the run is reached through `ranAs`: `recordsForAgentsIn` applies
   * the rule of `recordForAgentIn`, the binding the citizen's page uses, to every agent in one query,
   * and the map is built once over the session rows the presence reading already read. A person
   * starts no runs, so a person's row is always null here.
   */
  const thePickUpCost = (who: ParticipantRef): PickUpCost | null => {
    if (who.kind !== 'agent') return null
    // Every agent's own record in this project, read in one query when the first row needs it, the same
    // reading presence uses.
    const { agentRecords, sessions } = readings()
    const agentRecord = agentRecords().get(who.id) ?? null
    if (agentRecord === null) return null
    pickUpByAgent ??= pickUpCostPerAgent(sessions(), workspaceId, now, pickUpThresholds)
    return pickUpByAgent.get(agentRecord) ?? null
  }

  /**
   * WHETHER ONE PARTICIPANT CAN BE REACHED RIGHT NOW. Criterion P74.
   *
   * IT IS `participantPresence`, THE ONE THE PROFILE PAGE DRAWS. A second reading built here would
   * be the ninth invariant broken in the place a person is deciding who to write to: the row would
   * say offline and the page it opens would say online, and neither would be wrong on its own rule.
   *
   * NULL WHERE NO REGISTRY HERE HOLDS THEM. A visitor from another world is on that world's roll and
   * this office has nothing to ask; the reading's own red state means "nobody answers to this id",
   * which is a different sentence from "this office cannot say".
   */
  const thePresence = (who: ParticipantRef): { colour: string; word: string; says: string } | null => {
    if (readParticipant(who) === null) return null
    const { machine, sessions, waiting, processes, agentRecords, runningRows } = readings()
    const said = participantPresence(who, workspaceId, now, reader, false, machine, sessions, waiting, processes, agentRecords, runningRows)
    return { colour: said.colour, word: said.word, says: said.says }
  }

  /** Which contacts the reader has, and where each sits. Empty when nobody registered is reading. */
  // `theContactsOfOneReader` is the reading the contacts door makes, so the two cannot disagree.
  const readerContacts = reader === null ? null : theContactsOfOneReader(reader)
  const contacts = readerContacts === null ? [] : asContactsToPlace(readerContacts.contacts, readerContacts.agents)
  // THE EMBASSY READS ONLY EACH CONTACT'S GROUP, never its place in it, so whether a contact is online is not read.
  const placed = reader === null ? [] : placeTheContacts(reader, contacts, () => false)
  const groupsByKey = new Map((reader === null ? [] : groupsOf(reader)).map((one) => [one.key, one]))
  const inAGroup = new Map(placed.map((one) => [one.key, groupsByKey.get(one.group) ?? null]))

  // THE TWO PICTURE DIRECTORIES ARE READ ONCE FOR THE WHOLE TABLE, not once per row. Everything
  // below asks `pictureShownFor` what address to give, and that question needs the list.
  const onOffer = avatarsOnOffer()
  const officeTest = theMoleOfficeTest()
  const registered = (
    who: ParticipantRef,
  ): {
    name: string | null
    avatarUrl: string
    registered: boolean
    role: string | null
    portrait: string | null
    chosePortrait: boolean
    choseRole: boolean
    cardChosenBy: WhoChoseTheCard | null
    credential: string | null
    runtime: string | null
    createdAt: string
    machine: string | null
    /** Whether this row is a person's device rather than an agent. Criterion D2. */
    device: boolean
    /** Every live key this row's holder holds, oldest first. Criterion D3, problem yZ71bheXm-Ji. */
    heldKeys: EmbassyKey[]
  } => {
    const row = held.get(participantKey(who))
    if (row === undefined) {
      // NOBODY HERE HOLDS THEM, so there is no name — and there is still a picture, because nobody
      // has chosen one and this is what anybody with none is given. Criteria M30 and M53.
      //
      // AND NO CARD EITHER. A visitor from another world is on that world's roll, and which card
      // they hold is that world's answer rather than this one's. Null says nobody here can say.
      return {
        name: null,
        avatarUrl: pictureShownFor(who, defaultAvatarAssetId(who), onOffer, null, officeTest),
        registered: false,
        role: null,
        choseRole: false,
        // AND NOBODY HERE RECORDED WHO CHOSE IT EITHER, criterion P75, for the same reason: which
        // card they hold is their own world's answer and so is who gave it to them.
        cardChosenBy: null,
        portrait: null,
        chosePortrait: false,
        // NOBODY HERE HOLDS THEM, so no row here says which credential let them in. Criterion P69:
        // null on such a row is this world saying it cannot answer, not that none was needed.
        credential: null,
        // AND NOTHING HERE CAN SAY ITS RUNTIME OR WHEN IT REGISTERED EITHER. Criterion P88: a runtime
        // this office did not record reads as unknown, and the pre-P88 sentence is a fact about a row
        // this office holds, so it is drawn nowhere on a row it does not.
        runtime: null,
        createdAt: '',
        machine: null,
        // A ROW NOTHING HERE HOLDS IS NOT A DEVICE UNLESS ITS CREDENTIAL SAYS SO. The credential
        // loop below draws those rows and sets both of these from the credential itself.
        device: false,
        heldKeys: [],
      }
    }
    return {
      name: row.name,
      avatarUrl: pictureShownFor(who, row.avatarAssetId, onOffer, null, officeTest),
      registered: true,
      // WHICH CARD THEY HOLD, criteria P45 and P46: the word on the row, or the word the row is read
      // as where nobody wrote one. A person's row is read as the administrator card and an agent's
      // as the worker card, which is what every refusal already uses.
      role: row.role,
      // AND WHETHER ANYBODY WROTE IT. Criterion P53: the page has to be able to say "an agent holds the
      // secretary card" without saying the same thing about a row nobody has written a card on. The
      // word above is the READ-AS word on such a row — worker for an agent, administrator for a
      // person — and drawing that as though somebody chose it is the fifth rule broken. It is the
      // same device as `chosePortrait` one line below, for the same reason.
      choseRole: row.choseRole,
      // AND WHO CHOSE IT, criterion P75, READ AND NOT DERIVED. `choseRole` above is worked out from
      // whether a word is on the row, which was the only thing the office could say before the mark
      // existed; this is the mark itself, and null on it means nobody recorded who chose the card
      // rather than that nobody chose it.
      cardChosenBy: row.cardChosenBy,
      // AND THE DRAWING ON IT, criterion P47. The one they picked, or the first of their role's
      // three that is on this machine, or none (problem HeAu5V4oRmjn); `chosePortrait` is what keeps a
      // default from being read as a choice.
      portrait: row.portrait ?? theFirstPortraitThatExists(row.role),
      chosePortrait: row.portrait !== null,
      // AND THE CREDENTIAL THE OFFICE LET THIS AGENT IN ON, criterion P69, or null because it
      // needed none — which is every registration made on this machine and every person.
      credential: row.credential,
      // AND WHAT THE AGENT RECORD DECLARES — the runtime and when the row was written, for the P88 sentence — and
      // the machine its credential measured, for the Embassy row P88 says carries runtime and machine. The runtime
      // is read from the record and nowhere else.
      runtime: row.runtime,
      createdAt: row.createdAt,
      machine: row.machine,
      // A REGISTERED ROW IS NOT A PERSON'S DEVICE. A device asks through the credential door and no
      // registry in this office holds it; the credential loop below draws it. Criterion D2.
      device: false,
      // AND EVERY KEY IT HOLDS, one revoke press each. A person's key lives in the file beside the
      // database and is not in `held_keys`, so a person's row carries none. An agent's is under
      // `(agent, the agent's id)` — criterion I5. Criterion D3.
      //
      // IT ASKS BY THE ID AND NEVER BY THE NAME. `who.id` here is a registry row's own id, which is
      // a stored reference, and criterion I2's first sentence is that one of those resolves by exact
      // id and by nothing else. The credential loop further down holds a NAME instead and resolves
      // it; the two of them agreed only while every agent's id was its own handle, and this is the
      // half that says which question it is asking.
      heldKeys: who.kind === 'agent' ? everyLiveKeyOfTheAgentWithThisId(who.id) : [],
    }
  }

  const asAContact = (who: ParticipantRef): Pick<EmbassyRow, 'contact' | 'group' | 'groupKey' | 'groupMade'> => {
    const key = participantKey(who)
    const group = inAGroup.get(key)
    if (group === undefined) return { contact: false, group: null, groupKey: null, groupMade: null }
    return { contact: true, group: group?.name ?? null, groupKey: group?.key ?? null, groupMade: group?.made ?? null }
  }

  for (const [kind, list] of [
    ['person', both.people],
    ['agent', both.agents],
  ] as const) {
    for (const one of list) {
      const who: ParticipantRef = { kind, id: one.id }
      held.set(participantKey(who), {
        name: one.name,
        avatarAssetId: one.avatarAssetId,
        // WHICH CARD, read as the two registries are read everywhere else: the word somebody wrote,
        // or the word a row with none is read as. The two defaults are different because the two
        // lists of cards are.
        role:
          kind === 'person'
            ? ((one as { role?: string | null }).role ?? A_PERSON_WITH_NO_ROLE_READS_AS)
            : ((one as { role?: string | null }).role ?? A_ROW_WITH_NO_ROLE_READS_AS),
        // WHETHER THAT WORD IS ONE SOMEBODY WROTE, or the one a row with none is read as.
        choseRole: (one as { role?: string | null }).role != null,
        // AND WHO CHOSE IT, criterion P75: the mark stored on the registry row, read as it is. A
        // person's row has none, because a person holds their own card by their own door and who
        // chose it is not a question that door asks.
        cardChosenBy:
          kind === 'agent' ? theMarkSaying((one as { cardChosenBy?: unknown }).cardChosenBy) : null,
        // ONLY A PERSON HAS PICKED ONE SO FAR. An agent's own choice of portrait is not stored yet,
        // so its card's first picture is what is drawn and `chosePortrait` says so.
        portrait: kind === 'person' ? ((one as { portrait?: string | null }).portrait ?? null) : null,
        // AND THE CREDENTIAL THE OFFICE LET THIS AGENT IN ON. Criterion P69: a confirmed visitor
        // registers through the ordinary door with its credential named on the row, and that is
        // what tells a row registered from another machine from one registered here.
        credential: kind === 'agent' ? ((one as { credential?: string | null }).credential ?? null) : null,
        // AND THE THREE FACTS P86 AND P88 DRAW: what runtime the agent RECORD declares, when the row
        // was written, and the machine its credential came from. All three are read here once for
        // the whole table; the runtime comes from the record now.
        runtime: kind === 'agent' ? ((one as { runtime?: string | null }).runtime ?? null) : null,
        createdAt: String((one as { createdAt?: unknown }).createdAt ?? ''),
        machine:
          kind === 'agent'
            ? machineOfCredential.get(String((one as { credential?: unknown }).credential ?? '')) ?? null
            : null,
      })
    }
  }

  // THE OFFICE'S OWN SENDER ROW IS NOT A CITIZEN'S ROW. It is the office itself: it holds no card,
  // and it sends the reminders, the notices and the results of checks and merges. So it is left out
  // of `rows`, and of the citizens each world counts from them, and the reply names it apart.
  const itself = moleOffice()
  for (const [kind, list] of [
    ['person', both.people],
    ['agent', both.agents],
  ] as const) {
    for (const one of list) {
      const homeWorld = one.homeWorld
      if (homeWorld === null) continue
      const who: ParticipantRef = { kind, id: one.id }
      if (officeTest(who)) continue
      const contact = asAContact(who)
      const stored = held.get(participantKey(who))
      candidates.push({
        standing: 'citizen',
        who,
        closed: kind === 'agent' && (one as { retired?: boolean }).retired === true,
        credential: stored?.credential ?? null,
        contact: contact.contact,
        fill: () => {
          const known = registered(who)
          return {
            standing: 'citizen',
            who,
            ...known,
          // AND THE CHOOSER'S HANDLE, read from its row with the stored reader, for the word the row
          // draws (wave rule 5). Null where a person or the rule chose it, or no single row answers.
          cardChosenByHandle:
            known.cardChosenBy?.who?.kind === 'agent'
              ? ((theAgentAStoredIdNames(known.cardChosenBy.who.id) ??
                  theOneAgentAStringNames(sqlite, known.cardChosenBy.who.id))?.handle ?? null)
              : null,
          world: homeWorld,
          worldName: worlds.get(homeWorld)?.name ?? null,
          fromWorld: null,
          fromWorldName: null,
          since: null,
          until: null,
          citizenSince: one.citizenSince ?? null,
          ...asAContact(who),
          // AND WHETHER THEY CAN BE REACHED, criterion P74. The same reading the profile page draws,
          // from the same function, so a row and a page cannot disagree about one agent.
          presence: thePresence(who),
          // AND THE TWO SENTENCES P86 AND P88 PUT ON A ROW. A citizen admitted before the gate that
          // declares a runtime other than this machine's own Claude Code says so, with the date; and a
          // citizen holding a card above the default visitor ceiling says the setting raised it. Both
          // are derived from the row's own stored facts, so no new column is needed for either.
          admittedBeforeP88: kind === 'agent' ? p88SentenceFor(known.runtime, known.createdAt, known.credential) : null,
          cardCeilingRaised: ceilingSentenceFor(known.role, known.credential),
          // AND WHETHER PICKING THIS AGENT'S NEWEST RUN UP AGAIN IS EXPENSIVE. Criterion T6. Null on a
          // person and on an agent whose newest run nobody measured.
          pickUpCost: thePickUpCost(who),
          // AND WHETHER THE ROW IS RETIRED, problem zyCcJYCLsAe7. Null on every ordinary row.
          retired:
            kind === 'agent' && (one as { retired?: boolean }).retired === true
              ? {
                  at: (one as { retiredAt?: string | null }).retiredAt ?? null,
                  because: (one as { retiredBecause?: string | null }).retiredBecause ?? null,
                  by: (one as { retiredBy?: ParticipantRef | null }).retiredBy ?? null,
                  // AND THE RETIRER'S HANDLE, read from its row with the stored reader, for the page to
                  // draw (wave rule 5). Null for a person, for nobody recorded, and where no single row answers.
                  byHandle: ((): string | null => {
                    const by = (one as { retiredBy?: ParticipantRef | null }).retiredBy ?? null
                    if (by === null || by.kind !== 'agent') return null
                    return (theAgentAStoredIdNames(by.id) ?? theOneAgentAStringNames(sqlite, by.id))?.handle ?? null
                  })(),
                }
              : null,
          }
        },
      })
    }
  }

  const trips = visitsHere()
  for (const visit of trips) {
    const contact = asAContact(visit.visitor)
    const stored = held.get(participantKey(visit.visitor))
    candidates.push({
      standing: 'visitor',
      who: visit.visitor,
      closed: false,
      credential: stored?.credential ?? null,
      contact: contact.contact,
      fill: () => {
        const known = registered(visit.visitor)
        return {
          standing: 'visitor',
          who: visit.visitor,
          ...known,
          world: visit.toWorld,
          worldName: worlds.get(visit.toWorld)?.name ?? null,
          fromWorld: visit.fromWorld,
          fromWorldName: worlds.get(visit.fromWorld)?.name ?? null,
          since: visit.since,
          until: visit.until,
          citizenSince: null,
          ...asAContact(visit.visitor),
          presence: thePresence(visit.visitor),
          // A TRIP IS NOT A REGISTRATION, so neither P88 sentence belongs here: the row is a visit
          // registered by a world, and the gate P88 governs never saw it.
          admittedBeforeP88: null,
          cardCeilingRaised: null,
          // A TRIP ROW IS A PARTICIPANT AND MAY STILL HAVE RUNS. Criterion T6 reads the newest run bound
          // to it through `ranAs`, the same binding the citizen's row uses; a visitor with no run here
          // carries null.
          pickUpCost: thePickUpCost(visit.visitor),
          // A TRIP IS NOT RETIRED. Retirement is a fact about a registry row, and a visitor's row is in
          // the world it came from; this office has nothing to say about it.
          retired: null,
        }
      },
    })
  }

  /**
   * AND EVERY VISITING AGENT, AS A ROW IN THE SAME LIST. Criterion P74.
   *
   * The Embassy had a section for credentials and a section for trips, and nothing said what they
   * were for, since an agent is already counted as online or offline. They were two mechanisms
   * drawn as two kinds of participant.
   *
   * SO A CREDENTIAL BECOMES A ROW WHEREVER NOTHING ELSE DRAWS ITS AGENT. That last clause is the
   * whole of the care here, and it was measured: an agent let in from another machine has no world
   * on this roll and no trip registered here, so the loops above draw it NOWHERE — before P74 the
   * credentials panel was the only place it appeared, and folding that panel away without this made
   * a confirmed visiting agent vanish from the Embassy. An agent a loop above HAS drawn is left
   * alone, so nobody is drawn twice.
   *
   * WHICH STANDING EACH GETS. `pending` is the one that asks the person for something and it is marked so,
   * with the two presses on the row. Every other credential's agent is a VISITOR — an agent of no
   * world this office holds a roll for — which is what the word already meant on the rows above.
   *
   * AN ENDED CREDENTIAL IS FOLDED AWAY, through the same `retired` mark problem zyCcJYCLsAe7 added:
   * the office no longer lets that agent in, the row is kept and reads as ended, and the press above
   * the list is what brings it back. Nothing is lost and nothing dead is drawn as live.
   */
  // `participantKey` AND NOT A TEMPLATE OF MY OWN. It is the one spelling of how a participant is
  // keyed in this file, used by the `held` map above; a second one here would be the same fact
  // written twice, and it reads to the machine-word gate as a sentence rather than as a key.
  // AND THE OFFICE'S OWN ROW COUNTS AS DRAWN, since it is drawn apart, so no credential draws it as a row.
  const drawnAlready = new Set([...candidates.map((one) => participantKey(one.who)), participantKey(itself)])
  for (const credential of credentials) {
    // A CREDENTIAL STORES THE HANDLE IT ASKED UNDER, and the rows above are keyed by registry id. The
    // stored handle is read with the stored-reference reader, so an agent this office registered is
    // matched by its id and drawn once (problem MBSi6s2JRMOR). A handle no single agent here answers,
    // the ordinary case for a visitor, and a person's device are kept as the credential stores them.
    const named = isAPersonsDeviceCredential(credential) ? null : theOneAgentAStringNames(sqlite, credential.handle)
    const who: ParticipantRef = { kind: 'agent', id: named?.id ?? credential.handle }
    if (drawnAlready.has(participantKey(who))) continue
    drawnAlready.add(participantKey(who))
    const contact = asAContact(who)
    // EVERY PENDING CREDENTIAL ASKS THE PERSON FOR SOMETHING, by the rule the Embassy's card and the waiting door read. One
    // whose token hash a copy left out cannot be let in, but the person can still refuse it (problem
    // 4fDIo73TuEoK), so its card says why and offers only Refuse. Drawn as a visitor here as well, it was drawn twice.
    const asking = credentialNeedsOwnerAction(credential)
    candidates.push({
      standing: asking ? 'asks to come in' : 'visitor',
      who,
      closed: credential.endedAt !== null,
      credential: credential.id,
      contact: contact.contact,
      fill: () => {
        const known = registered(who)
        const role = known.role ?? credential.role
        return {
        standing: asking ? 'asks to come in' : 'visitor',
        who,
        ...known,
        // THE HANDLE IT ASKED UNDER, where no registry here holds it. That is the ordinary case for a
        // visiting agent, and the name is the one fact about it a person has.
        name: known.name ?? credential.name,
        role,
        world: credential.world ?? '',
        worldName: credential.world === null ? null : (worlds.get(credential.world)?.name ?? null),
        fromWorld: null,
        fromWorldName: null,
        since: credential.issuedAt,
        until: credential.endsAt,
        citizenSince: null,
        credential: credential.id,
        // WHETHER THIS ROW IS A PERSON'S DEVICE, and every key it holds, one revoke press each.
        // Criterion D2 and D3. The empty role is what says device; the key is under `person-device`
        // for one and `agent` for the other, and the device's name is the id that links them.
        //
        // THIS ROW AND THE REGISTRY ROW ABOVE NOW ASK THE SAME QUESTION. Criterion I5. The row above
        // asks by a registry id and this one by the handle the credential asked under, and they
        // agreed only while every agent's id was its own handle. `everyLiveKeyHeldBy` resolves an agent
        // reference to the agent's id before it reads, so both of them ask by id; a handle no
        // registry here holds — the ordinary case for a visitor — is the holder as it stands, and a
        // device's name is never read as an agent at all.
        device: isAPersonsDeviceCredential(credential),
        heldKeys: everyLiveKeyHeldBy(
          isAPersonsDeviceCredential(credential) ? 'person-device' : 'agent',
          credential.handle,
        ),
        // WHAT THE CREDENTIAL ITSELF DECLARES, where no registry here holds the agent: the runtime it
        // named and the machine it was measured from. Criterion P88's whole sentence is that a visitor
        // is judged by its runtime and listed with runtime and machine.
        runtime: known.runtime ?? credential.facts.runtime,
        machine: known.machine ?? credential.machine,
        // A CREDENTIAL IS THE EMBASSY PATH AND NOT A REGISTRATION BEFORE P88, so the P88 sentence is
        // not drawn here. A card above the default ceiling is drawn as raised by the setting.
        admittedBeforeP88: null,
        cardCeilingRaised: ceilingSentenceFor(role, credential.id),
        // AND WHETHER PICKING ITS NEWEST RUN UP AGAIN IS EXPENSIVE. Criterion T6.
        pickUpCost: thePickUpCost(who),
        ...asAContact(who),
        // NO PRESENCE ON A ROW ASKING TO COME IN. Nothing it sends is stored until the person confirms it, so
        // there is nothing to have heard from; a colour here would be a reading of an agent this
        // office has never let speak. One already let in is read like every other agent.
        presence: asking ? null : thePresence(who),
        // AND AN ENDED CREDENTIAL IS FOLDED AWAY, with when and why, through the mark zyCcJYCLsAe7
        // added. `by` is who ended it, which the credential records.
        retired:
          credential.endedAt === null
            ? null
            : { at: credential.endedAt, because: credential.endedBecause, by: null },
        }
      },
    })
  }

  /**
   * AND EVERY VISITING AGENT'S CREDENTIAL, AND EVERY WORLD WITH WHAT IT HAS DONE. Criteria P26, P31.
   *
   * They are confirmed by the person personally, and the person counts and supervises these trusted
   * agents AND worlds. The agents and the worlds are named together and they are one read here, for
   * the reason this whole function is one read: two
   * requests would be two clocks with one page drawn from both.
   *
   * EVERY COUNT IS COUNTED HERE FROM ROWS, and none is stored. `whatWasDoneUnder` in
   * src/server/lib/visitors.ts counts a credential's requests from the requests, and the world
   * numbers below are sums of those. A stored total is the ninth invariant broken in the one place
   * a person is being asked to supervise from.
   */
  const here = theWorldThisDatabaseIs()
  /** Every citizen a world has, by the identity of the world they live in. Counted before any row is built. */
  const citizensByWorld = new Map<string, number>()
  for (const [kind, list] of [
    ['person', both.people],
    ['agent', both.agents],
  ] as const) {
    for (const one of list) {
      if (one.homeWorld === null) continue
      if (officeTest({ kind, id: one.id })) continue
      citizensByWorld.set(one.homeWorld, (citizensByWorld.get(one.homeWorld) ?? 0) + 1)
    }
  }
  /** The world panel's rows, made once when a page draws them. A read about one row does not. */
  let worldRows: EmbassyWorldRow[] | null = null
  const theWorldRows = (): EmbassyWorldRow[] => (worldRows ??= worldsHere().map((one) => {
    const its = credentials.filter((c) => c.world === one.databaseIdentity)
    return {
      world: one,
      // WHO THAT WORLD SAYS STARTED IT. Criterion P31: the ownership is what the world said, and
      // this office checked nothing — so the sentence saying so travels on the row beside it, and a
      // page cannot draw one without the other.
      owner: one.startedBy,
      ownerIsAClaim: A_WORLDS_OWNER_IS_A_CLAIM,
      isThisWorld: here !== null && here === one.databaseIdentity,
      citizens: citizensByWorld.get(one.databaseIdentity) ?? 0,
      visitsFrom: trips.filter((trip) => trip.fromWorld === one.databaseIdentity).length,
      visitsTo: trips.filter((trip) => trip.toWorld === one.databaseIdentity).length,
      credentials: its.length,
      openCredentials: its.filter((c) => c.standing !== 'ended').length,
      requests: its.reduce((sum, c) => sum + c.requests, 0),
      writes: its.reduce((sum, c) => sum + c.writes, 0),
      mismatches: its.reduce((sum, c) => sum + c.mismatches, 0),
    }
  }))

  const office = theOfficeIsInThisDatabase()
  const { name, avatarUrl } = registered(itself)
  const officeRow = { who: itself, name, avatarUrl }
  const says = office
    ? 'Every world registered at the office, with this world’s own roll and every trip ever registered here.'
    : 'This world’s own roll and its own trips. The office holds the whole list and this world may not have reported all of its own yet.'
  const everything = { office: officeRow, says, isTheOffice: office, workspaceId }
  // AND EACH REGISTERED AGENT'S PROJECTS AND THE READER'S OWN MARKS ON IT, put on the row as it is filled,
  // in the whole answer and in a page alike.
  const projectsByAgent = projectsOfAgents()
  const personalMarks = agentMarksFor(reader)
  const fillRow = (one: (typeof candidates)[number]): EmbassyRow => {
    const row = one.fill()
    return row.who.kind === 'agent' && row.registered
      ? { ...row, projects: projectsByAgent.get(row.who.id) ?? [], personalTags: personalMarks.get(row.who.id) ?? [] }
      : row
  }

  // THE WHOLE ANSWER, for a caller that asks for every row. The tools and the agent doors still do.
  if (asked === null) {
    return { rows: candidates.map(fillRow), visitors: credentials, worlds: theWorldRows(), ...everything }
  }

  // A PAGE OF THE VIEW THE PAGE IS DRAWING. A read about one row is answered from every standing,
  // retired or not, because the page that asks for it is already drawing that row and has said why.
  const { view, from, limit, row } = asked
  // AN ASK TO COME IN IS NEVER A ROW, in every view: it is drawn in the asking block above the list.
  // The other two presses only widen which of the standings the list draws.
  const inTheView = (one: (typeof candidates)[number]): boolean =>
    one.standing !== 'asks to come in' &&
    (view.retired || !one.closed) &&
    (view.everyone ||
      // A CLOSED ROW IS IN THE VIEW BY THE RETIRED PRESS ON THE LINE ABOVE, so here it is asked only
      // the contacts rule, as the page's own filter asked before the door answered pages.
      theEmbassyPageDrawsThisRow({
        standing: one.standing,
        retired: false,
        contact: one.contact,
        credential: one.credential,
      }))
  const pageRows =
    row === null
      ? candidates.filter(inTheView).slice(from, from + limit)
      : candidates
          .filter((one) =>
            row.kind === 'credential' ? one.credential === row.id : one.who.kind === row.kind && one.who.id === row.id,
          )
          .slice(0, 1)
  const rowsTotal = candidates.filter(inTheView).length
  /** A world the page draws without the every-world press: live, and not one the test helper started. */
  const stillRunning = (one: EmbassyWorldRow): boolean => !isEphemeral(one.world.kind) && one.world.diedAt === null
  const everyWorld = view.tests ? theWorldRows() : theWorldRows().filter(stillRunning)
  const theNextPage = (): string | null => {
    if (row !== null || from + pageRows.length >= rowsTotal) return null
    const query = new URLSearchParams({ shape: PAGE_SHAPE, from: String(from + pageRows.length), limit: String(limit) })
    if (view.everyone) query.set('everyone', '1')
    if (view.retired) query.set('retired', '1')
    if (view.tests) query.set('tests', '1')
    return `/api/office/embassy?${query.toString()}`
  }
  // THE COUNTS ARE OF THE WHOLE LIST, not of the view drawn, because each press stays on the page
  // when it is on and says how many it would add or put away.
  const hidden = candidates.filter(
    (one) =>
      one.standing !== 'asks to come in' &&
      !one.closed &&
      !theEmbassyPageDrawsThisRow({
        standing: one.standing,
        retired: one.closed,
        contact: one.contact,
        credential: one.credential,
      }),
  ).length
  return {
    rows: pageRows.map(fillRow),
    // A READ ABOUT ONE ROW CARRIES NO ASKING LIST AND NO WORLD PANEL: the panel that asks for it
    // draws one participant's keys, and the confirm reply is the one row the press made.
    visitors: row === null ? credentials.filter(credentialNeedsOwnerAction) : [],
    worlds: row === null ? everyWorld : [],
    ...everything,
    rowsTotal: row === null ? rowsTotal : 1,
    hidden: row === null ? hidden : 0,
    retiredCount: row === null ? candidates.filter((one) => one.closed).length : 0,
    otherWorlds: row === null ? theWorldRows().filter((one) => !stillRunning(one)).length : 0,
    next: theNextPage(),
  }
}

/**
 * WHO HAS CALLED WITH A CLAIM AND NO KEY. Criterion P83, point 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SUMMARY READ AND NOT A QUERY OVER `api_calls`
 * ---------------------------------------------------------------------------------------
 *
 * The Settings list answers "who has not been given a key yet", and it is the page the person reads before
 * they close the window. `api_calls` is 4.43 million rows and 88 per cent of the owner's database (problem
 * a78qfu2K4C4_) with no index on `actor_id`, so grouping over it would make that page slow at the
 * one moment it matters. `lib/usage.ts` folds each header-only call into one row per caller per day,
 * per address and per door — the key is (day, actor_type, actor_id, client_addr, client_origin), so one
 * name can hold two rows in a day and the sentence the page draws says so
 * as it happens, and this reads those rows.
 *
 * A CALLER THAT HELD A KEY IS NOT ON THIS LIST. Only requests that carried actor headers and no key
 * write a row, and the row says which day, which name, from where, first and last seen, and how many
 * times. Nothing here proves anybody: it is a list of claims, and the sentence says so.
 *
 * THE SHAPE OF A ROW LIVES IN `@shared/headeronlycalls.ts`, so the Settings page that draws the list
 * reads the same declaration this function writes and the two cannot drift.
 */
interface HeaderOnlyRow {
  day: string
  actor_type: string
  actor_id: string
  client_addr: string
  client_origin: string
  first_seen: number
  last_seen: number
  calls: number
}

export function theHeaderOnlyCallers(): WhatTheHeaderOnlyCallersSay {
  const rows = sqlite
    .prepare(
      'SELECT day, actor_type, actor_id, client_addr, client_origin, first_seen, last_seen, calls ' +
        'FROM header_only_calls ORDER BY last_seen DESC, calls DESC, actor_id ASC',
    )
    .all() as HeaderOnlyRow[]
  return {
    callers: rows.map((row): AHeaderOnlyCaller => ({
      actorType: row.actor_type,
      actorId: row.actor_id,
      // THE EMPTY STRING IS HOW THE WRITER STORES "NOBODY COULD READ ONE". It reads back as null.
      clientAddr: row.client_addr === '' ? null : row.client_addr,
      clientOrigin: row.client_origin === '' ? null : row.client_origin,
      day: row.day,
      firstSeen: localStamp(new Date(row.first_seen)),
      lastSeen: localStamp(new Date(row.last_seen)),
      calls: row.calls,
    })),
    says:
      'Every caller that sent an identity header and no key: one row a day for each, and a second row where the same name arrived at a different address or through a different door. These are claims, ' +
      'not proofs: Mole Office did not establish their identity. A caller that held a key is not on this list.',
  }
}

// ============================================================================ the routes

/**
 * A PAGE ASKING FOR ONE ROW NAMES IT AS `agent:<id>`, `person:<id>` or `credential:<id>`. Anything else
 * is refused, because a row is what the page draws and a guess would draw somebody else's keys.
 */
function theEmbassyRowTheQueryNames(row: string): { kind: 'agent' | 'person' | 'credential'; id: string } {
  const at = row.indexOf(':')
  const kind = at === -1 ? '' : row.slice(0, at)
  const id = at === -1 ? '' : row.slice(at + 1)
  if (id === '' || (kind !== 'agent' && kind !== 'person' && kind !== 'credential')) {
    throw new PanelError('A row is asked for as "agent:<id>", "person:<id>" or "credential:<id>".')
  }
  return { kind, id }
}

export async function officeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/office/worlds', route('office.worlds', 'remote', LIST_NOTE), async () => whatTheOfficeSays())

  app.post('/office/worlds', route('office.register-world', 'remote', REGISTER_NOTE), async (req, reply) => {
    const body = parse(registerBody, req.body, 'The world to register')
    // The actor is read before anything is written, so a misspelt identity header is refused here as
    // it is on every other write and leaves nothing behind.
    const actor = actorFrom(req)
    /**
     * A KEY FOR THE WORLD'S REPORTS, WHEN AN AGENT REGISTERS THE WORLD WITH ITS OWN KEY. Criterion
     * P83 point 5, decision jjfwwrrJy-qV (answer B). The key is of the agent the caller's
     * key proved, never of a name the body or the headers gave. `registerAWorldAndItsReportsKey` says
     * when one is made and why not otherwise, and the reply carries that sentence either way.
     */
    const keyHolder = actor.provedBy === 'an-agent-key' && actor.keyHolder !== undefined ? actor.keyHolder : null
    const registered = registerAWorldAndItsReportsKey({
      name: body.name,
      purpose: body.purpose ?? null,
      handback: body.handback ?? null,
      kind: body.kind,
      startedBy: body.startedBy ?? null,
      checkout: body.checkout ?? null,
      head: body.head ?? null,
      databaseIdentity: body.databaseIdentity,
      address: body.address ?? null,
      addressForOtherMachines: body.addressForOtherMachines ?? null,
      standing: body.standing,
      parentWorld: body.parentWorld ?? null,
      installation: body.installation,
    }, keyHolder)
    const world = registered.world
    /**
     * AND EVERY VISITOR CREDENTIAL NAMING THIS WORLD IS ENDED, KEPT AND MARKED. Criterion P30's
     * last line: *its earlier visitor rows are kept and marked ended.*
     *
     * IT HANGS OFF THE WORLD REGISTERING AND NOT OFF THE NEXT AGENT ASKING, and that is not a
     * preference. Doing it when an agent asks would end the credential that agent had just been
     * issued — measured on 7 September 2026 by the first run of
     * tests/a-world-of-the-persons-own-makes-its-agents-citizens.test.ts, where the new citizen's own first
     * request was refused with "this world was registered". The moment the visit stops being a visit
     * is the moment the world appears, and that moment is here.
     *
     * REGISTERING A WORLD IS IDEMPOTENT — the same database registering twice gets the row it
     * already has — and so is this: a credential already ended keeps the reason it was ended with.
     *
     * A CREDENTIAL ISSUED BEFORE THE WORLD EXISTED NAMES NO WORLD, because there was none to name,
     * so the two addresses this world registers with are handed over too and the machine is what
     * links them. `theSameMachine` answers false wherever it cannot tell, and such a row stays open
     * and stays on the Embassy — which is the honest direction: a credential wrongly ended stops an
     * agent that was working, and one left open is a row the person can end in one press.
     */
    const noLongerVisitors = endTheVisitsOfANewlyRegisteredWorld(world.databaseIdentity, [
      world.addressForOtherMachines,
      world.address,
    ])
    reply.code(201)
    return {
      world,
      noLongerVisitors: noLongerVisitors.map((one) => one.id),
      // THE KEY IS IN THIS REPLY ONCE, and null where none was made; `reportsKeySays` says which.
      reportsKey: registered.reportsKey === null ? null : { key: registered.reportsKey.key, holder: registered.reportsKey.holder },
      reportsKeySays: registered.says,
    }
  })

  app.post('/office/worlds/:id/close', route('office.close-world', 'remote', CLOSE_NOTE), async (req) => {
    const asked = parse(whichWorld, req.params, 'The world to close')
    const body = parse(closeBody, req.body, 'Why it ended')
    actorFrom(req)
    return { world: closeWorldHere(asked.id, body.because) }
  })

  /**
   * STOP A WORLD KEPT UP FOR SOMEBODY TO LOOK AT. Criterion C32.
   *
   * THE PROCESSES ARE STOPPED BY THE ONE DOOR THAT STOPS A PROCESS. `listResources` finds the live
   * process rows whose own `world` is this world — the tool writes them when it starts a world with
   * `--show-to-the-person` — and each is released through lib/resources.ts, which signals the
   * process GROUP and names what it ended. A second killer written here would be the second-place
   * defect the WorldHere comment already warns about.
   *
   * `force` IS HONEST HERE because the office is stopping a world it recorded on somebody's press,
   * and the run that registered the row is often still going. The release note says so.
   *
   * THE ROW IS CLOSED EITHER WAY, with the words the caller gave, and the reply lists what was
   * stopped and what could not be. Nothing claims a process died that did not; the row says the
   * world ended because somebody pressed Stop, which is exactly what happened.
   */
  app.post(
    '/office/worlds/:id/stop',
    route(
      'office.stop-world',
      'local',
      { because: 'acts-on-this-machine', act: 'Stopping a world kept up for viewing' },
      STOP_NOTE,
    ),
    async (req) => {
      const asked = parse(whichWorld, req.params, 'The world to stop')
      const body = parse(closeBody, req.body, 'Why it ended')
      const actor = actorFrom(req)
      const workspaceId = workspaceOf(req)
      const world = worldById(asked.id)
      if (world === null) throw new PanelError(`No world at this office has the id ${asked.id}.`, 404)
      const { listResources, releaseResource } = await import('../lib/resources.ts')
      const rows = listResources({ workspaceId }).filter(
        (one) => one.type === 'process' && one.world?.databaseIdentity === world.databaseIdentity,
      )
      const stopped: string[] = []
      const couldNotStop: { id: string; why: string }[] = []
      for (const row of rows) {
        try {
          const result = await releaseResource(
            row.id,
            { force: true, note: `the person pressed Stop on the world "${world.name}"`, actor },
            workspaceId,
          )
          if (result.acted) stopped.push(row.id)
          else couldNotStop.push({ id: row.id, why: `nothing was signalled (${String(result.outcome ?? 'the machine was not read')})` })
        } catch (err) {
          couldNotStop.push({ id: row.id, why: err instanceof Error ? err.message : String(err) })
        }
      }
      const closed = closeWorldHere(asked.id, body.because)
      return { world: closed, stopped, couldNotStop }
    },
  )

  /**
   * WHO THE OFFICE KNOWS: every citizen and every visitor of every world it holds. Criterion M52.
   *
   * It is one read for the same reason the profile is: the roll, the trips and who is a contact are
   * three answers, and three calls would be three clocks with the page drawn from all of them.
   */
  app.get('/office/embassy', route('office.embassy', 'remote', EMBASSY_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const reader = participantForActor(actorFrom(req))
    const asked = parse(
      z.object({
        shape: z.literal(PAGE_SHAPE).optional(),
        everyone: z.enum(['1']).optional(),
        retired: z.enum(['1']).optional(),
        tests: z.enum(['1']).optional(),
        row: z.string().optional(),
        from: z.coerce.number().int().min(0).optional(),
        limit: z.coerce.number().int().min(1).max(EMBASSY_PAGE_ROWS_MOST).optional(),
      }),
      req.query,
      'The Embassy page asked for:',
    )
    if (asked.shape !== PAGE_SHAPE) return theEmbassy(workspaceId, reader)
    const row = asked.row === undefined ? null : theEmbassyRowTheQueryNames(asked.row)
    return theEmbassy(workspaceId, reader, {
      row,
      view: { everyone: asked.everyone === '1', retired: asked.retired === '1', tests: asked.tests === '1' },
      from: asked.from ?? 0,
      limit: asked.limit ?? EMBASSY_PAGE_ROWS,
    })
  })

  /**
   * WHO HAS CALLED WITH A CLAIM AND NO KEY. Criterion P83, point 6. The reading is
   * `theHeaderOnlyCallers` above; this is its door, read-only and open from another machine because
   * it is the list the person checks from wherever they are.
   */
  app.get('/office/header-only-calls', route('office.header-only-calls', 'remote', HEADER_ONLY_NOTE), async () =>
    theHeaderOnlyCallers(),
  )

  /**
   * A FAULT ON A PAGE IS FILED AS A PROBLEM. Criterion E4, the filing half.
   *
   * IT IS THE OFFICE THAT FILES IT, whoever asked. The caller's actor headers are read for the
   * ordinary reason — a misspelt identity header is refused here as everywhere — and then they go
   * no further: `fileAFault` writes as the office's own name. A browser sends the person's headers,
   * and a problem filed under them would say the person found and reported something no person did.
   */
  app.post('/office/faults', route('office.file-a-fault', 'remote', FAULT_NOTE), async (req, reply) => {
    const body = parse(aFaultOnAPage, req.body, 'The fault to file')
    // Read so that a misspelt or half-written identity header is refused here as on every other
    // write. Nothing about it reaches the record.
    actorFrom(req)
    const said = fileAFault(workspaceOf(req), {
      message: body.message,
      page: body.page ?? null,
      press: body.press ?? null,
      route: body.route ?? null,
      reading: body.reading,
      what: body.what,
    })
    reply.code(said.filed ? 201 : 200)
    return said
  })

  app.get('/office/visits', route('office.visits', 'remote', VISITS_NOTE), async () => {
    const open = openVisitsThisWorldCanSee()
    return { visits: open.visits, all: visitsHere(), from: open.from, note: open.note, thisWorld: theWorldThisDatabaseIs() }
  })

  app.post('/office/visits', route('office.register-visit', 'remote', REGISTER_VISIT_NOTE), async (req, reply) => {
    const body = parse(visitBody, req.body, 'The visit to register')
    const actor = actorFrom(req)
    const kind = visitorKindForActorType(actor.type)
    const visitor = body.visitor ?? (kind === null ? null : { kind, id: actor.id })
    if (visitor === null) {
      throw new PanelError(
        `A visit is registered by a person or an agent, and "${actor.type}" is neither. Say who is visiting in ` +
          'the body, or send the actor headers.',
        400,
      )
    }
    const here = body.toWorld ?? theWorldThisDatabaseIs()
    if (here === null) {
      throw new PanelError(
        'This world has no identity, so a visit to it could not be found again. Its database file could not be ' +
          'read, or the filesystem records no creation time for it; GET /api/runtime says which.',
        409,
      )
    }
    const visit = registerVisitHere({
      visitor,
      fromWorld: body.fromWorld,
      toWorld: here,
      why: body.why,
      ...(body.since === null || body.since === undefined ? {} : { since: body.since }),
      ...(body.id === null || body.id === undefined ? {} : { id: body.id }),
    })
    // AND THE OFFICE IS TOLD, if it can be reached. When it cannot, the row stays here with nothing
    // in `reportedAt` and the next report carries it — criterion C8.
    const told = await reportHeldVisitsToTheOffice()
    reply.code(201)
    return { visit, toldTheOffice: told }
  })

  app.post('/office/visits/:id/end', route('office.end-visit', 'remote', END_VISIT_NOTE), async (req) => {
    const asked = parse(whichVisit, req.params, 'The visit to end')
    actorFrom(req)
    const visit = endVisitHere(asked.id)
    // AND THE OFFICE IS TOLD. The office holds its own copy of the row, under the same id since
    // `vFrn8Z7VZLhD`; a trip ended only here left that copy open, so the list of who is away from
    // home only ever grew.
    const told = await reportThisVisitEndedToTheOffice(asked.id)
    return { visit, toldTheOffice: told }
  })

  app.patch('/office/worlds/:id', route('office.rename-world', 'remote', RENAME_NOTE), async (req) => {
    const asked = parse(whichWorld, req.params, 'The world to rename')
    const body = parse(renameBody, req.body, 'The new name')
    const wrong = whyWorldNameIsRefused(body.name)
    if (wrong !== null) throw new PanelError(wrong, 400)
    actorFrom(req)
    return { world: renameWorldHere(asked.id, body.name.trim()) }
  })

  // ================================================================= the pairing page
  //
  // A LOCAL BROWSER IS PAIRED ONCE. Criterion P83, point 2. The read answers whether this request
  // carried the person's key, whether pairing is offered here, whether this browser may ask, and
  // what it is already waiting on; the press sets the key as a cookie. `arrivalOf` is the listener's
  // stamp and is the only thing the offer reads — never an address and never a header — so a caller
  // cannot move the offer to itself. The press is `reach: 'local'`, so `refuseAnActFromAnotherMachine`
  // answers a caller from another computer before this handler runs and no cookie is set.
  //
  // NOTHING HERE IS A PERSON'S DECLARED ACT. Pairing is how the browser BECOMES the person, so its
  // door cannot ask for the person's key; the loopback listener is what proves where the press came
  // from. The registry of the person's acts (roles.json) is untouched by this pair, and the read is
  // open from another machine so the page there can learn it must use the Embassy.
  //
  // THE SECOND WAY IN, an earlier amendment of 13 September 2026 at 18:50, widened by the decision of
  // 9 November 2026: a browser on another machine, on neither this computer nor a program that sends a
  // header, asks with one press and receives a person's-device credential. Whether the office trusts
  // that machine does not decide it. The ask door below is that press; the confirm stays `local` and
  // reserved to the person, so they confirm it from a browser already paired on the machine the office
  // runs on. One address may knock a bounded number of times, so a flood cannot fill the Embassy list.

  app.get('/office/pairing', route('office.pairing', 'remote', PAIRING_NOTE), async (req): Promise<WhatThePairingSays> => {
    // Read so a misspelt identity header is refused here as on every other route. Nothing about the
    // actor changes the answer: `paired` is the key half of what `actorFrom` worked out.
    const actor = actorFrom(req)
    const paired = actor.provedBy === 'the-person-key'
    return {
      paired,
      offered: !paired && arrivalOf(req) === 'this machine' && whomThisComputerFinds() !== 'no program',
      mayAsk: !paired && mayThisBrowserKnock(req),
      // A PAIRED BROWSER IS NOT WAITING. The cookie may still match the credential that made it the
      // person, but the page's paired state is the whole answer then; null keeps the two apart.
      waiting: paired ? null : theCredentialThisCookieIsWaitingOn(req),
    }
  })

  app.post(
    '/office/pairing',
    route('office.pair', 'local', { because: 'reserved-to-the-owner', act: 'Pairing this browser' }, PAIR_NOTE),
    async (req, reply): Promise<WhatThePairingSays> => {
      // The same read as the get above, for the same reason, and the answer is discarded.
      actorFrom(req)
      // NOTHING FROM A SANDBOX IS THE PERSON, AND PAIRING MAKES A BROWSER THE PERSON. A decision on problem
      // T5Dbi_Z55666 says so.
      // An ordinary sandbox shares this computer's network, so its request arrives here as the person's
      // browser's does, and this press answers the person's key itself. So the office asks which program sent it, and pairs
      // only when it is this computer's own, found, and in no container this server is not in (lib/from-a-sandbox.ts).
      // An in-process caller has no socket and nobody to ask. The reading waits without holding the thread, because
      // inside the installed Windows app it runs PowerShell, and the answer is kept on the socket.
      if (arrivalOf(req) === 'this machine') {
        const sentBy = await readWhoSentItFromThisComputer(req)
        if (sentBy !== THEIR_OWN_PROGRAM) {
          throw new PanelError(
            `Pairing gives the browser that asks the person's key, and this request came from ${sentBy}. Nothing that comes from ` +
              "a sandbox is the person, and a program Mole Office cannot find is not taken for " +
              `one of theirs. Nothing was paired and no cookie was set. ${theWayToPairOnThisComputer().whoPairs}`,
            403,
          )
        }
      }
      setThePairedBrowserCookie(reply)
      return { paired: true, offered: false, mayAsk: false, waiting: null }
    },
  )

  /**
   * ASK TO PAIR: THE SECOND WAY IN. Criterion D2, the amendment of 18:50, and the decision of 9 November 2026
   * that a browser may knock.
   *
   * It issues a person's-device credential through the same `issueAPersonsDeviceCredential` the
   * credential flow's device ask uses, sets the credential's token as the same cookie the loopback
   * press sets, and answers neither the token nor anything derived from it. The browser is nobody
   * until the person confirms the credential at the Embassy; the cookie is the token's only home,
   * and ending the credential revokes the key that token bound.
   *
   * IT IS `remote` AND IT IS NOT THE PERSON'S ACT. A caller from this computer is refused because
   * the loopback press is its way in. A caller from another machine, trusted or not, is answered and
   * becomes a pending credential the person sees at the Embassy. One address may knock only
   * `ASKS_TO_PAIR_ALLOWED.most` times in the window, so a flood is refused with 429 and writes nothing.
   */
  app.post(
    '/office/pairing/ask',
    route('office.issue-credential', 'remote', ASK_TO_PAIR_NOTE),
    async (req, reply): Promise<WhatAskingToPairSays> => {
      actorFrom(req)
      if (!mayThisBrowserKnock(req))
        throw new PanelError(`${WHY_THIS_COMPUTER_DOES_NOT_ASK} ${theWayToPairOnThisComputer().onTheOfficesMachine}`, 403)
      refuseIfThisMachineKnockedTooOften(callerAddressOf(req) ?? 'an address the listener did not read')
      const body = parse(askingToPair, req.body, 'The name this browser gives itself')
      const from = writtenFrom(req)
      const issued = issueAPersonsDeviceCredential({
        name: body.device,
        machine: from.machine,
        machineHow: from.how,
        runtime: from.program,
      })
      setTheAskingBrowsersCookie(reply, issued.token)
      reply.code(201)
      return {
        credentialId: issued.credential.id,
        device: issued.credential.handle,
        waitingForConfirmation: true,
      }
    },
  )
}

/**
 * WHETHER THIS REQUEST MAY KNOCK. G2 of the amendment of 13 September 2026 at 18:50, widened by the decision of
 * 9 November 2026.
 *
 * THE FACT IS THE LISTENER'S: the request arrived through the listener for other machines. It is a symbol the listener
 * stamped, so a caller cannot set it. A caller from this computer is not offered the knock — the loopback press is its
 * way in. Whether the office trusts the machine no longer decides the knock; it decides only what a keyless read from
 * there counts as, and the person approves the knock on the computer that runs the office.
 */
function mayThisBrowserKnock(req: FastifyRequest): boolean {
  return arrivalOf(req) === 'another machine'
}

/**
 * THE CREDENTIAL THIS BROWSER'S COOKIE BELONGS TO, or null because the cookie matches none.
 *
 * IT IS THE HASH AND NEVER THE TOKEN. keys.ts hashes whatever the request carried and hands back
 * only the SHA-256, which the office already stores in the clear. The visitor library then reads the
 * credential by that hash. So the page can say which device this browser asked under, when, and
 * whether it is still waiting — across a reload — without the token leaving the two files allowed to
 * hold it.
 */
function theCredentialThisCookieIsWaitingOn(req: FastifyRequest): WhatThisBrowserIsWaitingOn | null {
  const hash = theHashOfTheKeyOnThisRequest(req)
  if (hash === null) return null
  const credential = credentialByTokenHash(hash)
  if (credential === null) return null
  return { device: credential.handle, askedAt: credential.issuedAt, standing: credential.standing }
}

/**
 * What the ask door takes: the name the browser gives itself, and nothing else. It is a label the person reads at the
 * Embassy, so it is bounded: a name longer than a sentence's worth of characters is refused rather than stored.
 */
const askingToPair = z.object({ device: z.string().trim().min(1).max(80) }).strict()

/**
 * The refusal a knock from the computer that runs the office reads. Its last sentence, what pairs directly on that
 * machine, depends on the system and is added at the throw.
 */
const WHY_THIS_COMPUTER_DOES_NOT_ASK =
  'A browser on another machine knocks here to be paired. This request came from the computer that runs the office, ' +
  'where the pairing page is its way in, so nothing was asked.'
