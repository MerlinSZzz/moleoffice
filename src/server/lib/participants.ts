// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { generatePixelScale, pixelScaleSchema, type PixelScale } from '@shared/pixel-scale.ts'
import { generateCWholeAppearance, pixelAppearanceSchema, type PixelAppearance } from '@shared/pixel-office.ts'
/**
 * THE TWO REGISTRIES: the people of this installation and its durable agents.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS HERE, AND WHY IT IS A DOOR AND NOT ONLY A MIGRATION
 * ---------------------------------------------------------------------------------------
 *
 * Migration 0114 wrote a registry row for every durable agent this database already named.
 * Everything written AFTER that has to get its row at the moment it is written, and that is what
 * this file is for.
 *
 * A DATABASE WITH WORK WAITING FOR A MIGRATION IS ONE A SERVER START REFUSES. So a door that left a
 * new agent record unmapped would leave the migration with something to write, and the next server
 * start — under `tsx watch`, the next time anybody saves a server file — would refuse to come up.
 * That is not a guess: it happened on 31 August 2026 with the durable identity a comment's recipient
 * needs, it was measured, and `assertRunIsAddressable` in lib/records.ts is the door written to stop
 * it. This is the same shape, so it is the same answer.
 *
 * EVERY VALUE IS KNOWN AT WRITE TIME, which is what makes a door possible: the record is in front of
 * us, its `handle` is its address, its title is its name, and the picture is worked out from the id.
 *
 * ---------------------------------------------------------------------------------------
 * ONE REGISTRY ROW PER HANDLE, WHICH IS WHAT THE MIGRATION DID
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M2: *Every existing `agent` record maps to one registry row by handle.* A handle is
 * unique inside a project and not across the installation, so two projects each holding an agent
 * called `builder` share one registry row and both records point at it. The door follows the same
 * rule as the migration, or the two would disagree about what a handle means.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT FOLLOWS THE RECORD AND WHAT DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * THE HANDLE FOLLOWS. It is an address, and two addresses for one agent misdeliver mail silently —
 * which is the whole reason the record kind refuses a duplicate handle in the first place.
 *
 * THE NAME DOES NOT. It is set from the record's title when the registry row is made and is never
 * overwritten afterwards, because M3 gives a person the right to change any agent's name and a door
 * that copied the title over it would undo that edit the next time anybody touched the record. So a
 * record renamed after its registry row exists keeps two names, on purpose: the record's title, and
 * the name a person chose for the agent.
 */

import { aSeedForADrawing, anIdForAnAgent } from './ids.ts'
import { databaseFileStatus, sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { AGENT_REGISTRY_NAMESPACE, readRegistryAliases, registryAliasTarget } from './registry-aliases/index.ts'
// THE THREE-QUESTION READING, IN A FILE THAT OPENS NO DATABASE. Its own header says why it is not in
// here: the message-delivery migration asks the same question, and a migration that imported this
// module would pull db/client.ts in at module load.
import {
  theAgentWithThisId,
  theOneAgentAStringNames,
  type AgentIdentity,
  type AgentRowReader,
  type WhatAReferenceCouldName,
} from './agent-references.ts'
import { everyAgentAReferenceCouldName } from '../db/agent-references.ts'

export {
  everyAgentAReferenceCouldName,
  type AgentIdentity,
  type AgentRowReader,
  type WhatAReferenceCouldName,
}
import { localStamp, nowStamp } from '@shared/time.ts'
import { readElevation, readElevations } from '@shared/read-elevations.ts'
import type { Elevation, RoleCard } from '@shared/roles.ts'
import {
  AVATAR_ASSET_KIND,
  CIRCLE_SHOWS,
  CHAT_BUTTON_STAYS,
  CHAT_OPENS_AS,
  CHAT_TEXT_SIZES,
  LANGUAGES,
  isLanguage,
  type Language,
  GENERATED_AVATAR_LICENCE,
  GENERATED_AVATAR_MIME,
  MESSAGE_LINK_LAYOUTS,
  MESSAGE_PROJECT_MARKS,
  MESSAGE_LINK_LEVELS,
  moleOffice,
  MOLE_OFFICE_HANDLE,
  readMoleOfficeIdWith,
  MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE,
  MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD,
  PRESENCE_CHOICES,
  SEND_KEY_SETTINGS,
  declaredRuntimeOrNull,
  isChatButtonStays,
  isChatOpensAs,
  isChatTextSize,
  isCircleShows,
  isMessageLinkLayout,
  isMessageProjectMark,
  isSendKeySetting,
  readShortcutSettings,
  type MessageProjectMark,
  isMessageLinkLevel,
  isMoleOffice,
  isParticipantKind,
  isPresenceChoice,
  defaultAvatarAssetId,
  whyHandleIsRefused,
  participantWord,
  whyNameIsRefused,
  whyStateIsRefused,
  type ChatButtonStays,
  type ChatOpensAs,
  type ChatLayout,
  type ChatTextSize,
  type CircleShows,
  type MessageLinkLayout,
  type MessageLinkLevel,
  type ParticipantKind,
  type ParticipantRef,
  type PresenceChoice,
  type SendKeySetting,
  type ShortcutSettings,
} from '@shared/participants.ts'
import { CIRCLE_PICTURES, circlePicture } from '@shared/messages.ts'
// HOW A PERSON OR AN AGENT WISHES TO BE ADDRESSED, declared once.
import { ADDRESS_AS_PARTS, theAddressAsStored, type AddressAs, type AddressAsPart, type AddressAsSetBy } from '@shared/address-as.ts'
// HOW A PICTURE IN A MESSAGE IS DRAWN, declared once for the door, the reply and the control.
import { MESSAGE_PICTURE_CHOICES, isMessagePictureChoice, type MessagePictureChoice } from '@shared/messagepictures.ts'
// WHETHER MEDIA A RECORD POINTS AT ARE LOADED, declared once for the door, the reply and the control.
// IT IS NOT `messagepictures.ts` ABOVE: that is a picture inside a chat message, and its three words
// are `shown`, `pressed` and `path`; this answers about media a report points at.
import { MEDIA_LOAD_CHOICES, isMediaLoadChoice, type MediaLoadChoice } from '@shared/mediaload.ts'
// A PERSON'S OWN LABELS FOR THE MESSAGES THEY WRITE, read by the one strict reading.
import { readMessageLabels, type TheStoredMessageLabels } from '@shared/message-label.ts'
import { readShippedFlags, type StoredShippedFlags } from '@shared/intent-mark.ts'
import {
  A_PERSON_WITH_NO_ROLE_READS_AS,
  A_ROW_WITH_NO_ROLE_READS_AS,
  cardFor,
  aOrAn,
  theRoleWordsSaid,
  isAPersonRole,
  theMarkSaying,
  whyTheAreaBreaksTheCardsRule,
  type WhoChoseTheCard,
} from '@shared/roles.ts'
// THE CARDS THIS INSTALLATION DECLARES, read once when the server started. `theRoleCardsAreRead`
// is asked first because a migration and a test may reach this before any server has read them,
// and a check that threw there would refuse a write for a reason that is about the caller's timing
// rather than about what they sent. lib/roles.ts opens a file and imports nothing from here.
import { theRoleCards, theRoleCardsAreRead } from './roles.ts'
import { theCardInTheOfficesWords } from './the-card-in-the-offices-words.ts'
import type { MachineSeenFrom } from '@shared/profile.ts'
import { giveTheOfferedPicture } from './avatars.ts'
import { writeTheBroadcastSkip, writeTheBroadcastTimes, type BroadcastSchedule, type TheBroadcastSkip, type TheBroadcastTimesChange } from './broadcast.ts'
import { aRaiseCarriesIt, getRecord, patchRecord, sameAgent, throughTheRetireDoor, throughTheStartFolderDoor, type Actor } from './records.ts'
// THE ONE READING OF WHICH AGENT A RUN IS, the seal's, so a work area set for a run names the run the seal will empty it at.
import { theSealsReadingOfARunsAgent } from './inspection.ts'
// AND THE ENTRIES AN ASKED START IS KEPT IN, so the seal reads which run the ask a declared area was set for started.
import { theWorkerRunOf } from '../db/registry-aliases/worker-runs.ts'
import { NEXT_ROUND, readTheNextRound } from '@shared/next-round.ts'
import type { PanelRecord } from '@shared/types.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from './not-proved-the-person.ts'
import { posix, win32 } from 'node:path'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { canonicalDatabasePath, databaseDirectoryFrom, gatePosition } from '../../config/settings.mjs'
import { gateMet, gateMetAgainOnceTheWriteIsTakenBack } from './gate-counts.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from './who-may-act.ts'
import { theFilesAreaFolderAsWritten, theGitTreeHolding, theHiddenHomeFolderHolding, theHomes } from '../../config/files-area.mjs'
import { THIS_PLATFORM, isTheRoot, thePathsOf } from '../../config/the-paths-of-a-system.mjs'
// HOW A START FOLDER IS STORED AND WHEN TWO FOLDERS ARE THE SAME ONE, at part (c).
// The same module src/server/lib/records.ts checks the field with, so the door and the record cannot come to
// two answers about one folder.
import { theStartFolderAsItIsStored } from '../../config/start-folder.mjs'
import { theAgentRecordsNamingTheStartFolder } from './terminals/agent-records-naming-a-start-folder.ts'
import { theInstallationThisDatabaseBelongsTo, theWorldThisDatabaseIs } from './world.ts'
import { writeThePersonsOwnRename } from './write-the-persons-own-rename.ts'
import { whyALiveAgentBearsThisName } from '../db/why-a-live-agent-bears-this-name.ts'
import { readParticipant } from '../db/read-participant.ts'
import { asAgent } from '../db/read-participant.ts'
import { ADDRESS_AS_COLUMN } from '../db/read-participant.ts'
import { whoSetIt } from '../db/read-participant.ts'
import { pathsOrNull } from '../db/read-participant.ts'
import { whoTheRowSays } from '../db/read-participant.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { everyAgentsRuntime } from '../db/list-participants.ts'
import { theRegistryListStatements } from '../db/list-participants.ts'
import { agentByHandle } from '../db/agent-by-handle.ts'
import { recordForAgentIn } from '../db/record-for-agent-in.ts'
import { theNewestOfEach } from '../db/records-for-agents-in.ts'
import { theRecordsForAgentsStatements } from '../db/records-for-agents-in.ts'
import { isAPermanentResident } from '../db/is-a-permanent-resident.ts'
import { theRegistryNameStatements } from '../db/every-name-in-the-registries.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theChainUpWith } from '@shared/the-chain-up-with.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { whyTheChangeIsRefused } from '@shared/why-the-change-is-refused.ts'
import { theAgentAStoredIdNames } from './the-agent-a-stored-id-names.ts'
import { theAgentTheKeyProves } from './the-agent-the-key-proves.ts'
import { theAgentAStoredReferenceNamesIn } from './the-agent-a-stored-reference-names-in.ts'
import { theKeyProvesASecretary } from './the-key-proves-a-secretary.ts'
import { repositoryRelativePaths } from './repository-relative-paths.ts'
import { whyTheRegistryCannotFollow } from '../db/why-the-registry-cannot-follow.ts'

/** One durable agent as the registry holds it. */
export interface RegisteredAgent {
  pixelScale?: PixelScale | null
  pixelAppearance?: PixelAppearance | null

  id: string
  name: string
  handle: string
  avatarAssetId: string
  state: string | null
  stateAt: string | null
  /**
   * Who set the state line, or null because nobody recorded it.
   *
   * Null is not "the agent set it": it is what every row written before criterion M21 holds, and
   * naming a setter nobody wrote down would be inventing a record of an act nobody witnessed.
   */
  stateBy: ParticipantRef | null
  runtime: string | null
  /**
   * Who started this agent, or null because nobody recorded one.
   *
   * NULL IS NOT "THE PERSON STARTED IT". It is what every row registered before 6 September 2026
   * holds and what an agent a person registered by hand holds. Reading the absence as the owner
   * would make 199 unregistered writers the person's own children on the strength of a missing value.
   */
  startedBy: ParticipantRef | null
  /** The agent responsible for this agent, kept separately from its starter. */
  ownerId: string | null
  ownerKind: string | null
  /**
   * The word on the role card this agent holds, or null because nobody set one.
   *
   * A row with null here is READ AS a worker — `A_ROW_WITH_NO_ROLE_READS_AS` in shared/roles.ts is
   * the one place that says so — and a screen says "no role set" rather than drawing that word,
   * because nobody chose it.
   */
  role: string | null
  /**
   * WHO CHOSE THAT CARD, as it is stored, or null because nobody recorded it. Criterion P75.
   *
   * NULL IS NOT "THE RULE CHOSE IT". It is what every row registered before 8 September 2026 holds,
   * and the word on such a row may have been a starter's choice or may be the word the row was read
   * as. A screen says nobody recorded it; nothing infers which.
   */
  cardChosenBy: WhoChoseTheCard | null
  /**
   * The person's say that this agent may act for them, as it is stored, or null because they never
   * said. Criterion P59.
   *
   * A GRANT THAT HAS ENDED IS STILL HERE, with `endedAt` set. Whether it still HOLDS is a different
   * question — it asks the clock and asks whether this card can hold one at all — and
   * `theElevationHeldBy` in lib/elevation.ts is what answers it. Nothing decides a refusal from this
   * field directly.
   */
  elevation: Elevation | null
  /** Every grant they ever made to this agent, oldest first. Empty because they never made one. */
  everyElevation: Elevation[]
  /**
   * The folders and files this agent was started to change, or null because nobody recorded any.
   *
   * Null and an empty list are different answers. Null is nobody recorded one; an empty list is
   * somebody saying there is no area. Criterion P43.
   */
  workArea: string[] | null
  /**
   * The record whose end ends this role, or null because nobody said. Criterion P15.
   *
   * Null is never read as "there is no end": it is read as nobody having named one, and an agent
   * with none is never retired by the rule that reads it.
   */
  startedFor: string | null
  /** The session record of the run that registered this agent, or null because nobody recorded one. */
  startedByRun: string | null
  retired: boolean
  retiredBecause: string | null
  /**
   * WHEN IT WAS RETIRED AND BY WHOM. Problem zyCcJYCLsAe7, and null on a row that is not retired.
   *
   * Null on a RETIRED row is a real answer as well: every row retired before the retire door existed
   * was retired by the release of a claim, and nobody recorded the moment or the hand.
   */
  retiredAt: string | null
  retiredBy: ParticipantRef | null
  createdAt: string
  /** The world it is a citizen of, or null because nobody could say. */
  homeWorld: string | null
  /** The installation that world belongs to, or null because nobody could say. */
  homeInstallation: string | null
  /** When it became a citizen, which is when it was registered. Null exactly when `homeWorld` is. */
  citizenSince: string | null
  /**
   * THE VISITOR CREDENTIAL THIS AGENT WAS REGISTERED ON, or null because it needed none. P69.
   *
   * Null is the ordinary answer and means this machine: a registration made here needs no
   * credential, and one made from elsewhere cannot be written without one. So null says "none was
   * needed" and never "nobody looked".
   */
  credential: string | null
  /**
   * HOW THIS AGENT WISHES TO BE ADDRESSED. A part left out is a
   * part nobody has set; an empty object is an agent that has set none.
   */
  addressAs: AddressAs
  /** Who last set `addressAs`, and when, or null because nobody recorded it. */
  addressAsSetBy: AddressAsSetBy
}

/**
 * THE OFFICE'S CURRENT ID, FOUND BY ITS RESERVED HANDLE.
 * Every participant writer reaches this module, including the serving app and scripts through
 * records.ts. Register the function when the module loads, and read the row on every call.
 * The later migration 0269 must re-mint the row while the server serves. An import-time
 * copy or cached answer would quietly keep naming the old id afterward.
 */
let theOfficeRowStatement: ReturnType<typeof sqlite.prepare> | undefined
export function moleOfficeIdFromItsRow(): string {
  // Prepare only after migrations made the registry. Reuse the statement, never its result:
  // each execution sees a re-minted row on the next call without a server restart.
  theOfficeRowStatement ??= sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0 LIMIT 2')
  const rows = theOfficeRowStatement.all(MOLE_OFFICE_HANDLE) as { id: string }[]
  if (rows.length !== 1) {
    throw new PanelError(`Mole Office needs exactly one live row with the handle "${MOLE_OFFICE_HANDLE}", and found ${String(rows.length)}. Its id could not be read.`, 500)
  }
  return rows[0]!.id
}
readMoleOfficeIdWith(moleOfficeIdFromItsRow)

/** One person as the registry holds it. */
export interface RegisteredPerson {
  id: string
  name: string
  handle: string
  avatarAssetId: string
  state: string | null
  stateAt: string | null
  /** What they said about whether they are here, or null because they have never said. */
  presenceChoice: PresenceChoice | null
  /** When they said it. Null exactly when `presenceChoice` is null. */
  presenceChoiceAt: string | null
  /**
   * How they want the number on the chat circle drawn, or null because they have never chosen.
   *
   * Null is read as `CIRCLE_BEFORE_ANYBODY_CHOOSES` by whatever draws it, and it is not the same
   * fact as having chosen that word. Criterion M32.
   */
  circleShows: CircleShows | null
  /**
   * Which picture they put on the round chat button, or null because they never chose. Criterion
   * M38; with null, the page draws mole-at-the-sill in both looks.
   */
  circlePicture: string | null
  /**
   * Which name a record named in a message is drawn under: `label`, `title`, or null because they
   * have never chosen. Criterion M47; null is read as `MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES`.
   */
  messageLinkLevel: MessageLinkLevel | null
  /**
   * How a link in a message is laid out in the bubble: `own-line`, `inline`, or null because they
   * have never chosen. Criterion M48; null is read as `MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES`.
   */
  messageLinkLayout: MessageLinkLayout | null
  /**
   * Whether a message says which project it is in: `always`, `never`, or null because they have
   * never chosen. Criterion M73; null is read as `MESSAGE_PROJECT_MARK_BEFORE_ANYBODY_CHOOSES`.
   */
  messageProjectMark: MessageProjectMark | null
  /**
   * How a picture in a message is drawn: `shown`, `pressed`, `path`, or null because they have
   * never chosen. Criterion M64, moved off the browser by decision rJphPkCG3l7X; null is read as
   * `MESSAGE_PICTURE_BY_DEFAULT`.
   */
  messagePictures: MessagePictureChoice | null
  /**
   * Whether media a record points at are loaded: `with-page`, `never`, `on-press`, or null because
   * they have never chosen. Criterion U5; null is read as `MEDIA_LOAD_BY_DEFAULT`.
   *
   * IT IS NOT `messagePictures` ABOVE. That one is about a picture inside a chat message and answers
   * `shown`, `pressed` or `path`; this one is about media a report points at.
   */
  mediaLoad: MediaLoadChoice | null
  /**
   * How big the chat's own text is: `small`, `normal`, `large`, or null because they have never
   * chosen. Criterion M112; null is read as `CHAT_TEXT_SIZE_BEFORE_ANYBODY_CHOOSES`.
   */
  chatTextSize: ChatTextSize | null
  /**
   * Which key sends a message: `shift-or-alt-enter` or `enter`, or null because they have never
   * chosen. Null is read as `SEND_KEY_BEFORE_ANYBODY_CHOOSES`.
   */
  sendKey: SendKeySetting | null
  /**
   * Which keyboard shortcuts are on, or null because they have never chosen,
   * at item 5. Null is read as `SHORTCUTS_BEFORE_ANYBODY_CHOOSES`, every shortcut on.
   */
  shortcuts: ShortcutSettings | null
  /**
   * When the chat circle shows: `when-unread`, `always`, or null because they have never chosen. Null
   * is read by `chatButtonStaysBeforeAnybodyChooses` according to the reader kind.
   */
  chatButtonStays: ChatButtonStays | null
  /**
   * How the chat opens: `split` (beside the page), `window`, or null because they have never chosen.
   * Null is read as `CHAT_OPENS_AS_BEFORE_ANYBODY_CHOOSES`.
   */
  chatOpensAs: ChatOpensAs | null
  /** The chosen column layout, or null to follow the available width. */
  chatLayout: ChatLayout | null
  /** The person's own labels for the messages they write, unreadable with the reader's sentences, or null because they have never made one. Migration 0341. */
  chatLabels: TheStoredMessageLabels
  /** The person's own settings for the two shipped flags and 'No mark', or null because they changed none. Migration 0346. */
  shippedFlags: StoredShippedFlags | null
  language: Language | null
  createdAt: string
  /** The world they are a citizen of, or null because nobody could say. */
  homeWorld: string | null
  /** The installation that world belongs to, or null because nobody could say. */
  homeInstallation: string | null
  /** When they became a citizen, which is when they were registered. Null exactly when `homeWorld` is. */
  citizenSince: string | null
  /**
   * WHICH ROLE CARD THEY HOLD, one word from `personCards` in design/permissions/roles.json, or null
   * because nobody wrote one. Criterion P45. Null is read as `A_PERSON_WITH_NO_ROLE_READS_AS`, and a
   * screen says no role set rather than drawing a word nobody chose.
   */
  role: string | null
  /**
   * WHAT THEY DO, in their own words, or null because nobody has written one. Criterion P45. It is
   * theirs to write and nothing checks it; the role above is where they stand in the Office.
   */
  occupation: string | null
  /**
   * WHICH PORTRAIT IS ON THEIR CARD, by the address it is served at, or null because they have not
   * chosen. Criterion P47. Null is not "no picture": the card's own portrait is drawn instead.
   */
  portrait: string | null
  /**
   * HOW THIS PERSON WISHES TO BE ADDRESSED. A part left out is a
   * part nobody has set; an empty object is a person who has set none.
   */
  addressAs: AddressAs
  /** Who last set `addressAs`, and when, or null because nobody recorded it. */
  addressAsSetBy: AddressAsSetBy
}

export { ADDRESS_AS_COLUMN } from '../db/read-participant.ts'

export { addressAsOf } from '../db/read-participant.ts'

export { addressAsSetByOf } from '../db/read-participant.ts'

/**
 * Write the `assets` row for the picture this product draws for a participant, if it is not there.
 *
 * The id is worked out from the participant, so this is the same row every time and running it twice
 * writes nothing. No file is written: a generated picture is drawn when it is asked for, which is why
 * `path` and `bytes` are both NULL.
 */
export function ensureDefaultAvatar(who: ParticipantRef, by: ParticipantRef | null, at: string): string {
  const id = defaultAvatarAssetId(who)
  sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, ?, 'default', NULL, ?, NULL, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    )
    .run(id, AVATAR_ASSET_KIND, GENERATED_AVATAR_MIME, at, by?.kind ?? null, by?.id ?? null, GENERATED_AVATAR_LICENCE)
  return id
}

/**
 * WHERE A CHAIN OF STARTERS ENDS UP: the rungs above one agent, and whether they reach the person.
 *
 * Criterion P9. Three things can happen and they are three different answers, so all three are said
 * rather than folded into a boolean anybody would read as "fine".
 */
export interface ChainReading {
  /** The starters above this one, nearest first, ending at the person where it gets there. */
  chain: ParticipantRef[]
  /** True only when a person is at the top of it. */
  reachesThePerson: boolean
  /** The participant the chain came back to, when it goes round. Null when it does not. */
  loopAt: ParticipantRef | null
  /** The participant the chain stopped at because nobody recorded a starter for it. Null when it did not. */
  stopsAt: ParticipantRef | null
  /** One sentence, for a person and for a refusal. Both read this, so the two cannot disagree. */
  says: string
}

/** What the chain of starters reads of one agent: its id, its handle and who started it. */
export type AStarter = Pick<RegisteredAgent, 'id' | 'handle' | 'startedBy'>

export { STORED_READERS } from './the-agent-a-stored-reference-names-in.ts'

export { theAgentAStoredReferenceNamesIn } from './the-agent-a-stored-reference-names-in.ts'

export { theStarterEachStringNames } from './the-starter-each-string-names.ts'

export { STARTERS_BY_ID_OR_HANDLE } from './the-starter-each-string-names.ts'

export { theStartersWithThisIdOrHandleStatement } from './the-starter-each-string-names.ts'

/**
 * FOLLOW THE STARTERS UP. A report goes to the agent's starter, then to that one's starter, and on up
 * to the top one, the agent that works with the person directly, which reports to the person.
 *
 * IT TAKES THE WHOLE REGISTRY RATHER THAN QUERYING PER RUNG, because the one caller that needs many
 * chains is the participants list, and a query per rung per agent would be one read per row of the
 * table for every page draw.
 *
 * A LOOP IS NOT AN ERROR TO THROW, it is a reading to report. Two agents that started each other are
 * a real state somebody has to be able to see and undo, and a function that threw would take the
 * page down instead of drawing the problem.
 */
export function theChainUpFrom(from: ParticipantRef | null, everyAgent: readonly RegisteredAgent[]): ChainReading {
  return theChainUpWith(from, theAgentAStoredReferenceNamesIn(everyAgent))
}

export { theChainUpWith } from '@shared/the-chain-up-with.ts'

export { agentsStartedFor } from '../db/agents-started-for.ts'

/**
 * ONE REGISTRY ROW AS THE WORKERS READING NEEDS IT: the id a run's record is joined by, and the two
 * words a person reads. Nothing else is read, and in particular not the runtime, which lives on the
 * agent's record and would cost one read per worker (`asAgent` without the bulk map).
 */
export interface StartedAgentRow {
  id: string
  handle: string
  name: string
}

/**
 * EVERY ACTIVE AGENT ONE AGENT STARTED, IN ONE STATEMENT.
 *
 * `started_by_id` IS A REGISTRY ID AND NOT A HANDLE (criterion I9), so the caller passes the id the
 * handle door resolved and never the handle it arrived with. A retired agent is left out: it is given
 * no new work, and a run of one that is still open is not an agent at work here.
 *
 * The reading is for a caller that wants one agent's workers and nothing else. It replaces listing the
 * whole registry and filtering it, which is what the Stop hook asked at every end of a supervisor's
 * turn: one profile per worker after that, and the office answered nobody meanwhile (problem xiv1cwqWTmhb).
 */
export function agentsStartedBy(startedById: string): StartedAgentRow[] {
  const rows = sqlite
    .prepare("SELECT id, handle, name FROM agents WHERE started_by_kind = 'agent' AND started_by_id = ? AND retired = 0")
    .all(startedById) as { id?: unknown; handle?: unknown; name?: unknown }[]
  return rows.map((row) => ({ id: String(row.id), handle: String(row.handle), name: String(row.name) }))
}

export { agentByHandle } from '../db/agent-by-handle.ts'

export { AGENT_BY_HANDLE } from '../db/agent-by-handle.ts'

export { theAgentByHandleStatement } from '../db/agent-by-handle.ts'

/**
 * THE ROW ONE CREDENTIAL ALREADY HAS, or null because it has none. Criterion P81's collision rule.
 *
 * ---------------------------------------------------------------------------------------
 * THEIR CASE, MEASURED ON 8 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * The Codex session on their other machine registered TWICE, under two handles, and they had to work out
 * which of the two rows was which. A credential is issued to ONE agent — `POST /api/office/visitors`
 * says so in its own words, "one credential per agent, not per machine and not per world" — so a
 * second registration under it is one session asking twice rather than a second agent arriving.
 *
 * Reproduced before this was built: two registrations under one credential, from one machine, by one
 * program, were both answered 201 and left two rows, codex-a and codex-b, both carrying the same
 * credential id.
 *
 * IT IS THE CREDENTIAL AND NOT THE HANDLE. Two handles is exactly what went wrong, so a rule keyed on
 * the handle would have let their case through. The credential fixes the machine and the run's facts as
 * well, because they were written on it when it was issued.
 *
 * A RETIRED ROW IS NOT ANSWERED WITH. A row somebody closed is closed, and handing it back would
 * revive an agent by answering a request; such a registration is a new row, as it is anywhere else.
 */
export function theRowThisCredentialAlreadyHas(credentialId: string): RegisteredAgent | null {
  const row = sqlite
    .prepare('SELECT * FROM agents WHERE credential = ? AND retired = 0 ORDER BY created_at ASC LIMIT 1')
    .get(credentialId) as Record<string, unknown> | undefined
  return row === undefined ? null : asAgent(row)
}

export { recordForAgentIn } from '../db/record-for-agent-in.ts'

export { recordsForAgentsIn } from '../db/records-for-agents-in.ts'

export { theOwnRecordsOfTheAgentsHolding } from '../db/the-own-records-of-the-agents-holding.ts'

export { theNewestOfEach } from '../db/records-for-agents-in.ts'

export type ReadAll = { all: (...args: unknown[]) => unknown[] }

export { RECORDS_FOR_AGENTS } from '../db/records-for-agents-in.ts'

export { theRecordsForAgentsStatements } from '../db/records-for-agents-in.ts'

/**
 * WHICH PROJECT AN AGENT'S OWN RECORD IS IN, OR NULL BECAUSE THIS INSTALLATION HOLDS NONE.
 *
 * F15 point 1; problem `kXXiGKoVoGQN`. The waiter for a durable agent has a handle and, usually, a
 * session record. When the session record answers nothing — it does not exist, or it is hidden —
 * the tool has to find the project some other way, and the agent's own record is the next best fact.
 * The registry row is the installation's, and the record it was filed from is in one project, so
 * this reads the mapping the registration already keeps.
 *
 * NULL IS A REAL ANSWER. An agent with no `agent_records` mapping was registered before the mapping
 * existed or has no record here, and the caller then falls back to the checkout's `.env` rather
 * than to a guessed project.
 */
export function theProjectOfTheAgentRecord(agentId: string): string | null {
  const row = sqlite
    .prepare(
      'SELECT r.workspace_id AS ws FROM agent_records m JOIN records r ON r.id = m.record_id ' +
        'WHERE m.agent_id = ? AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1',
    )
    .get(agentId) as { ws?: unknown } | undefined
  return row === undefined || typeof row.ws !== 'string' || row.ws === '' ? null : row.ws
}

export { RECORD_FOR_AGENT } from '../db/record-for-agent-in.ts'

export { theRecordForAgentStatement } from '../db/record-for-agent-in.ts'

export { runtimeOfTheAgentRecord } from '../db/read-participant.ts'

export { theRuntimeOnTheNewestRecord } from '../db/list-participants.ts'

export { NEWEST_RECORD_FIRST } from '../db/the-model-on-the-agent-record.ts'

export { everyAgentsRuntime } from '../db/list-participants.ts'

export { agentsWithTheseIds } from '../db/agents-with-these-ids.ts'

export { theModelOnTheAgentRecord } from '../db/the-model-on-the-agent-record.ts'

export { RUNTIME_FOR_AGENT } from '../db/the-model-on-the-agent-record.ts'

export { theRuntimeForAgentStatement } from '../db/the-model-on-the-agent-record.ts'

export { agentsForRecords } from '../db/agents-for-records.ts'

export { agentForRecord } from '../db/agent-for-record.ts'

export { theAgentsOfTheseAgentRecords } from '../db/the-agents-of-these-agent-records.ts'

export { theAgentRecordsOf } from '../db/the-agent-records-of.ts'

export { AGENT_RECORDS } from '../db/the-agent-records-of.ts'

export { theAgentRecordStatements } from '../db/the-agent-records-of.ts'

export { whoSetIt } from '../db/read-participant.ts'

/**
 * The participant a `{kind, id}` on a record names, or null because nothing usable is there.
 *
 * The same reading `whoSetIt` makes, from one value rather than two columns. Half a reference is
 * read as none: a starter with a kind and no id is a chain that goes nowhere, and storing it would
 * make an agent look answered-for by somebody nothing can find.
 */
function refOrNull(value: unknown): ParticipantRef | null {
  if (typeof value !== 'object' || value === null) return null
  const said = value as Record<string, unknown>
  return whoSetIt(said['kind'], said['id'])
}

/** The starter a record's `startedBy` would give a row holding `held`, or null where the row would keep its own. */
function theStarterMovedTo(held: ParticipantRef | null, startedBy: unknown): ParticipantRef | null {
  const followed = refOrNull(startedBy)
  if (followed === null) return null
  return held !== null && held.kind === followed.kind && held.id === followed.id ? null : followed
}

/**
 * THE STARTER A WRITE OF THIS AGENT RECORD WOULD GIVE ITS REGISTRY ROW, with the one the row holds now, or null where
 * the write leaves the row's starter as it is: no row maps the record, the record names no starter, or it names the
 * one the row holds. `keepTheAgentRegistryInStep` moves the row by the same reading, so the record write can ask who
 * may move a starter of exactly the writes that would move one.
 */
export function theStarterAWriteWouldGive(recordId: string, startedBy: unknown): { from: ParticipantRef | null; to: ParticipantRef } | null {
  const mapped = agentForRecord(recordId)
  if (mapped === null) return null
  const to = theStarterMovedTo(mapped.startedBy, startedBy)
  return to === null ? null : { from: mapped.startedBy, to }
}

export { pathsOrNull } from '../db/read-participant.ts'

export { safelyParsed } from '../db/read-participant.ts'

export { theRoleOnTheRow } from '../db/the-role-on-the-agent-row.ts'

/** The fields of a participant stored on its registry row as they are, which the plugins' roster carries. */
export type WhoAnAgentIs = Pick<RegisteredAgent, 'id' | 'handle' | 'name' | 'role' | 'retired' | 'credential' | 'startedBy' | 'createdAt'>

export { whoTheRowSays } from '../db/read-participant.ts'

export { asAgent } from '../db/read-participant.ts'

export { citizenshipOf } from '../db/read-participant.ts'

/** What a record of kind `agent` says about itself, read by the caller and handed here. */
export interface AgentRecordFacts {
  id: string
  title: string
  handle: unknown
  runtime: unknown
  state: unknown
  retiredBecause: unknown
  /**
   * The three below are optional because `unknown` already admits `undefined`, so requiring the key
   * would buy nothing but the word. Absent and `undefined` mean the same thing here: the record did
   * not say, and the row is left as it is rather than emptied.
   */
  startedBy?: unknown
  role?: unknown
  /** Who chose that card, criterion P75, or absent because this write says nothing about it. */
  cardChosenBy?: unknown
  /** The person's say that this agent may act for them, criterion P59, or absent because they have not. */
  elevation?: unknown
  workArea?: unknown
  startedFor?: unknown
  startedByRun?: unknown
  /** The visitor credential this registration came in on, criterion P69, or absent for none. */
  credential?: unknown
}

export { whyTheRegistryCannotFollow } from '../db/why-the-registry-cannot-follow.ts'

/**
 * Give a record of kind `agent` its registry row and its mapping, and keep its handle in step.
 *
 * CALLED FROM BOTH WRITE PATHS, because a rule enforced on one write path is not a rule. It is
 * called INSIDE the record write's own transaction, so a refusal further down rolls this back with
 * everything else.
 *
 * IT REFUSES NOTHING AND INVENTS NOTHING. A record whose handle nothing can use is left unmapped,
 * exactly as the migration leaves it: the record is still written, because the handle rule belongs to
 * `validateRecordData` and answering it twice would refuse a write for a reason the caller has
 * already been given.
 */
export function keepTheAgentRegistryInStep(record: AgentRecordFacts, by: ParticipantRef | null, newRegistration = false): void {
  const handle = typeof record.handle === 'string' ? record.handle.trim() : ''
  if (handle === '' || whyHandleIsRefused(handle) !== null) return
  // TWO LIVE AGENTS NEVER SHARE A HANDLE, criterion I3. The record write asked this before it wrote
  // anything; it is asked again here because this is the function that writes the row, and a caller
  // that did not ask would otherwise meet the index's raw error.
  const refused = whyTheRegistryCannotFollow(record)
  if (refused !== null) throw new PanelError(refused, 409)

  const at = nowStamp()
  const retired = record.state === 'retired' ? 1 : 0
  const retiredBecause =
    retired === 1 && typeof record.retiredBecause === 'string' && record.retiredBecause.trim() !== ''
      ? record.retiredBecause.trim()
      : null
  const mapped = agentForRecord(record.id)
  if (mapped !== null) {
    // THE HANDLE FOLLOWS AND THE NAME DOES NOT — the file header says why. Nothing is written when
    // the two already agree, so an ordinary patch of an agent record touches no row here. A handle
    // another live agent bears was refused above, in words; a handle only retired agents bear is free.
    if (mapped.handle !== handle) {
      sqlite.prepare('UPDATE agents SET handle = ? WHERE id = ?').run(handle, mapped.id)
    }
    // AND SO DOES RETIREMENT, WHICH IS THE SAME FACT IN TWO TABLES UNTIL PART 2B MOVES THE MESSAGES.
    // The record's `state` is what the existing inbox reads and this column is what the chat will
    // read. Two copies with nothing making them agree is the defect CLAUDE.md names as this
    // repository's own, and this is the third of its three answers: derive one from the other.
    // The record is the source, because retiring an agent is a write to the record today.
    if (mapped.retired !== (retired === 1) || mapped.retiredBecause !== retiredBecause) {
      sqlite.prepare('UPDATE agents SET retired = ?, retired_because = ? WHERE id = ?').run(retired, retiredBecause, mapped.id)
    }
    // AND SO DO THE STARTER AND THE ROLE, for the same reason and with one difference: a record that
    // says nothing about either LEAVES THE ROW ALONE rather than emptying it. A patch that changes a
    // handle sends no `role`, and clearing a role because a write did not mention it would take a
    // permission off an agent by accident. Sending the field with a new value is how it changes.
    const movedStarter = theStarterMovedTo(mapped.startedBy, record.startedBy)
    if (movedStarter !== null) {
      sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run(movedStarter.kind, movedStarter.id, mapped.id)
    }
    const followedRole = typeof record.role === 'string' && record.role.trim() !== '' ? record.role.trim() : null
    if (followedRole !== null && mapped.role !== followedRole) {
      sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run(followedRole, mapped.id)
    }
    // AND WHO CHOSE THE CARD, criterion P75, by the same rule as the role above: a record that says
    // nothing leaves the column alone rather than emptying it, because an ordinary patch of an agent
    // record sends no mark and clearing it would turn a recorded choice into "nobody recorded one".
    const followedMark = theMarkSaying(record.cardChosenBy)
    if (followedMark !== null && JSON.stringify(mapped.cardChosenBy) !== JSON.stringify(followedMark)) {
      sqlite.prepare('UPDATE agents SET card_chosen_by = ? WHERE id = ?').run(JSON.stringify(followedMark), mapped.id)
    }
    // AND SO DOES THE PERSON'S SAY THAT THIS AGENT MAY ACT FOR THEM. Criterion P59. Same rule as the
    // role: a record that says nothing leaves the column alone, and sending the object with a new
    // value — an ended one, say — is how it changes. The record is the source and this row is what a
    // refusal reads, because the row is the installation's and a record belongs to one project.
    // BOTH SIDES ARE READ THE SAME WAY BEFORE THEY ARE COMPARED. The record stores no null keys —
    // the validator refuses them — and the column stores them, so comparing the raw forms would
    // rewrite this row on every patch of an agent record and put a change in the ledger on a day
    // nobody changed anything.
    const followedElevation = readElevations(record.elevation)
    if (followedElevation.length > 0 && JSON.stringify(mapped.everyElevation) !== JSON.stringify(followedElevation)) {
      sqlite.prepare('UPDATE agents SET elevation = ? WHERE id = ?').run(JSON.stringify(followedElevation), mapped.id)
    }
    const followedArea = pathsOrNull(record.workArea)
    if (followedArea !== null && JSON.stringify(mapped.workArea) !== JSON.stringify(followedArea)) {
      sqlite.prepare('UPDATE agents SET work_area = ? WHERE id = ?').run(JSON.stringify(followedArea), mapped.id)
    }
    const followedFor =
      typeof record.startedFor === 'string' && record.startedFor.trim() !== '' ? record.startedFor.trim() : null
    if (followedFor !== null && mapped.startedFor !== followedFor) {
      sqlite.prepare('UPDATE agents SET started_for = ? WHERE id = ?').run(followedFor, mapped.id)
    }
    // AND THE CREDENTIAL THE REGISTRATION CAME IN ON. Criterion P69, same rule as the role and the
    // starter: a record that says nothing leaves the column alone rather than emptying it, because
    // an ordinary patch of an agent record sends no credential and clearing it would say a row
    // registered from another machine had come in on nothing.
    const followedCredential =
      typeof record.credential === 'string' && record.credential.trim() !== '' ? record.credential.trim() : null
    if (followedCredential !== null && mapped.credential !== followedCredential) {
      sqlite.prepare('UPDATE agents SET credential = ? WHERE id = ?').run(followedCredential, mapped.id)
    }
    return
  }

  // THE ONE LIVE AGENT BEARING THIS HANDLE, if one does. A retired agent's handle is free again,
  // criterion I3, which replaced the refusal of problem zyCcJYCLsAe7. A record under it
  // is a NEW agent with a NEW id, minted below. The retired row is not touched, so the closed
  // agent keeps its id, its messages and its history, and the new agent inherits none of them.
  const existing = agentByHandle(handle)
  if (existing !== null) {
    // ONE LIVE REGISTRY ROW PER HANDLE. Another project's record already holds this handle, so this
    // record is that same agent — which is the rule the migration mapped by, applied at the door.
    sqlite
      .prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?) ON CONFLICT(record_id) DO NOTHING')
      .run(record.id, existing.id)
    return
  }

  // A NEW AGENT IS GIVEN AN ID OF ITS OWN, criterion I1. The id is minted
  // here and never changes; the handle is the name the agent goes by and may change in place. An
  // agent registered before this line keeps the id it has, which is its handle,
  // and nothing stored about it is rewritten.
  const id = newParticipantId()
  const drawn = ensureDefaultAvatar({ kind: 'agent', id }, by, at)
  // AND IT TAKES THE PICTURE IT IS OFFERED, nobody asked. Decision `HnoPsajfgR0A` on proposal
  // `1V9UWM8nrBTD`: an agent that chose no picture when it registered takes the
  // recommended one directly. What Mole Office drew from the id is still there — `ensureDefaultAvatar`
  // wrote it just above and nothing deletes it — so a person may go back to it. Null here means this
  // checkout offers no pictures, and then the drawing is what the row points at, as before.
  const avatar = giveTheOfferedPicture({ kind: 'agent', id }, drawn, moleOffice()) ?? drawn
  // AND IT BECOMES A CITIZEN OF THE WORLD IT IS REGISTERED IN, at the moment it is registered, and by
  // default that is the main world. Criterion C1. `home` is null when this
  // database has no identity at all, and that is left empty rather than invented — the whole
  // argument is in src/server/db/citizenship-migration.ts.
  const home = citizenshipHere()
  // THE RUNTIME IS NOT WRITTEN HERE. It lives on the agent record (`data.runtime`) and nowhere
  // else, and `runtimeOfTheAgentRecord` reads it from there. The row's
  // `runtime` column is left dead rather than dropped — see the comment on it in db/schema.ts.
  const name = theNameARecordGives(record.title, handle)
  // WHO STARTED IT AND WHAT IT MAY DO, both read off the record and both allowed to be absent. The
  // rule is that whoever starts an agent manages it and answers for it. A record that says neither registers
  // with neither, which is a row nobody started and nobody gave a role — a real state, and the one
  // every row written before this column existed is in.
  const startedBy = refOrNull(record.startedBy)
  const role = typeof record.role === 'string' && record.role.trim() !== '' ? record.role.trim() : null
  // AND WHO CHOSE THAT CARD, criterion P75. Null is nobody having recorded it, which is what a
  // record filed by any door but the registration holds.
  const cardChosenBy = theMarkSaying(record.cardChosenBy)
  const workArea = pathsOrNull(record.workArea)
  const startedFor = typeof record.startedFor === 'string' && record.startedFor.trim() !== '' ? record.startedFor.trim() : null
  const startedByRun =
    typeof record.startedByRun === 'string' && record.startedByRun.trim() !== '' ? record.startedByRun.trim() : null
  // AND THE CREDENTIAL THE OFFICE LET IT IN ON, criterion P69, allowed to be absent like the two
  // above. Absent is the ordinary answer and means this machine: a registration made here needs
  // none, and one made from another machine is refused without one.
  const credential =
    typeof record.credential === 'string' && record.credential.trim() !== '' ? record.credential.trim() : null
  sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, state, state_at, started_by_kind, ' +
        'started_by_id, owner_id, owner_kind, role, card_chosen_by, work_area, started_for, started_by_run, credential, retired, ' +
        'retired_because, created_at, created_by_kind, created_by_id, home_world, home_installation, ' +
        'citizen_since, pixel_scale, pixel_appearance) ' +
        'VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
    )
    .run(
      id,
      name,
      handle,
      avatar,
      startedBy?.kind ?? null,
      startedBy?.id ?? null,
      startedBy?.id ?? null,
      startedBy?.kind ?? null,
      role,
      cardChosenBy === null ? null : JSON.stringify(cardChosenBy),
      workArea === null ? null : JSON.stringify(workArea),
      startedFor,
      startedByRun,
      credential,
      retired,
      retiredBecause,
      at,
      by?.kind ?? null,
      by?.id ?? null,
      home.world,
      home.installation,
      home.world === null ? null : at,
      JSON.stringify(generatePixelScale(id, role)),
      // A new record registration reaches this insert only for a genuinely new identity.
      // Existing handles return above. Patch and reconstruction callers leave this flag false.
      newRegistration ? JSON.stringify(generateCWholeAppearance(aSeedForADrawing(), 'registration')) : null,
    )
  sqlite
    .prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?) ON CONFLICT(record_id) DO NOTHING')
    .run(record.id, id)
}

/**
 * THE NAME A REGISTRATION TAKES FROM ITS RECORD, or the handle where the title is not a name.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A TITLE IS NOT ALWAYS A NAME
 * ---------------------------------------------------------------------------------------
 *
 * A record's title may run to fifteen words: it says what the record is, in one line. A registry
 * name is a label, at most five words, and criterion M35 is what says so: the names were too long, and a
 * name need not explain what the agent does. So a record whose title is a description registers
 * under its handle, and the title stays on the record page where it belongs. That is the same
 * fallback this line always had for an empty title, widened from "there is no title" to "the title
 * is not a name".
 *
 * IT IS NOT A CUT AND IT IS NOT A GUESS. Shortening the title would invent a name nobody wrote, and
 * refusing the registration would stop an agent taking part because somebody titled its record well.
 * The handle is a real short address the agent chose for itself, and it is what a reader sees until
 * a person gives it a name — which is theirs to give, and only theirs (`whyTheChangeIsRefused`).
 */
export function theNameARecordGives(title: string, handle: string): string {
  const said = title.trim()
  if (said === '') return handle
  return whyNameIsRefused(said) === null ? said : handle
}

/**
 * THE CITIZENSHIP A REGISTRATION MADE IN THIS WORLD CARRIES.
 *
 * Criterion C1: *a new registration is citizenship of the world it is made in.* Both values come
 * from the database this process has open, so a row and the world header on the reply that wrote it
 * say the same thing about the same world.
 *
 * A WORLD WITH NO IDENTITY GIVES NO CITIZENSHIP, and the installation goes with it. A row saying
 * "this agent belongs to the installation X and to no world" would be half a fact, and the half that
 * is missing is the one every check reads.
 */
export function citizenshipHere(): { world: string | null; installation: string | null } {
  const world = theWorldThisDatabaseIs()
  if (world === null) return { world: null, installation: null }
  return { world, installation: theInstallationThisDatabaseBelongsTo() }
}

/** A brand-new registry id for a participant nothing else names. The agent registration mints with it, and it could never be a handle. */
export function newParticipantId(): string {
  return anIdForAnAgent()
}

// ============================================================ the one resolver, criterion I2

/**
 * THERE ARE TWO KINDS OF REFERENCE TO AN AGENT AND THEY ARE NOT RESOLVED THE SAME WAY.
 *
 * ---------------------------------------------------------------------------------------
 * A STORED REFERENCE IS ALWAYS AN ID
 * ---------------------------------------------------------------------------------------
 *
 * `changes.actor_id`, `message_delivery.recipient_id`, `group_members.member_id`,
 * `held_keys.whose_id`, the `{kind:"agent",id:…}` inside `records.data`. Each holds the string that
 * WAS the agent's id when the row was written, and an id is never reused. So it resolves by exact id
 * and by nothing else, for ever, and `theAgentAStoredIdNames` below is that reading.
 *
 * Nothing is rewritten for this to be true. The agents already
 * registered keep their handle-shaped ids, and every row naming one goes on naming it.
 *
 * ---------------------------------------------------------------------------------------
 * AN ARRIVING REFERENCE MAY BE AN ID OR A NAME
 * ---------------------------------------------------------------------------------------
 *
 * The `x-mole-office-actor-id` header, a `:handle` path segment, a `to:` field in a body. A caller
 * sends whatever it has, and criterion I9 keeps it that way: every agent alive at the landing goes
 * on sending its handle, so nothing running has to restart on the day.
 * `theAgentAnArrivingReferenceNames` below is that reading, in five steps.
 *
 * ---------------------------------------------------------------------------------------
 * WHY TWO FUNCTIONS AND NOT ONE WITH A FLAG
 * ---------------------------------------------------------------------------------------
 *
 * Criterion I2's first sentence. A reader of a call site has to be able to tell which of the two
 * questions is being asked, and a flag hides that inside an argument. Two names say it out loud.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS REPLACES
 * ---------------------------------------------------------------------------------------
 *
 * `SELECT id FROM agents WHERE id = ? OR handle = ?`, written seven times across this repository.
 * One statement, no ordering, so SQLite hands back whichever row it reaches first. That is harmless
 * while every agent's id equals its handle and becomes a silent wrong-agent answer the day a handle
 * is freed. The other six sites convert inside the pieces that own their files.
 */

export { theAgentAStoredIdNames } from './the-agent-a-stored-id-names.ts'

/** Whether the caller is reading something or writing something. */
export type WhatTheCallerIsDoing = 'reading' | 'writing'

/** Which of the resolver's steps answered. */
export type HowAReferenceResolved = 'the-key' | 'an-id' | 'a-live-handle' | 'a-retired-handle'

/** The agent an arriving reference named, and which step of the resolver said so. */
export interface TheAgentNamed {
  agent: AgentIdentity
  how: HowAReferenceResolved
}

export { stateOf } from './the-agent-an-arriving-reference-names.ts'

export { whyAReferenceNamesTwoAgents } from './the-agent-an-arriving-reference-names.ts'

export { whyAWriteMayNotFollowARetiredName } from './the-agent-an-arriving-reference-names.ts'

export { whyANameSeveralRetiredAgentsBoreIsRefused } from './the-agent-an-arriving-reference-names.ts'

export { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'

export { theAgentAKeysHolderIs } from './the-agent-an-arriving-reference-names.ts'

export { participantForActor } from './participant-for-actor.ts'

export { theRowAnArrivingReferenceNames } from './the-row-an-arriving-reference-names.ts'

// ============================================================ reading the registries

export { listParticipants } from '../db/list-participants.ts'

export { theseAgentsInTheRegistrysOrder } from '../db/these-agents-in-the-registrys-order.ts'

export { everyNameInTheRegistries } from '../db/every-name-in-the-registries.ts'

/** THE ID, NAME AND HANDLE OF EVERY PERSON, in the order `listParticipants` gives, and nothing of any agent. */
export function everyPersonsName(): { id: string; name: string; handle: string }[] {
  return (theRegistryNameStatements().people.all() as Record<string, unknown>[]).map((row) => ({ id: String(row['id']), name: String(row['name']), handle: String(row['handle']) }))
}

export { everyAgentOnTheRoster } from '../db/every-agent-on-the-roster.ts'

export { REGISTRY_ROSTER } from '../db/every-agent-on-the-roster.ts'

export { theRosterStatement } from '../db/every-agent-on-the-roster.ts'

export { theNamesWithThisIdOrHandle } from '../db/the-names-with-this-id-or-handle.ts'

export { NAMES_BY_ID_OR_HANDLE } from '../db/the-names-with-this-id-or-handle.ts'

export { theNamesWithThisIdOrHandleStatements } from '../db/the-names-with-this-id-or-handle.ts'

export { REGISTRY_NAMES } from '../db/every-name-in-the-registries.ts'

export { theRegistryNameStatements } from '../db/every-name-in-the-registries.ts'

export { REGISTRY_LIST } from '../db/list-participants.ts'

export { THE_REGISTRYS_ORDER } from '../db/list-participants.ts'

export { theRegistryListStatements } from '../db/list-participants.ts'

/**
 * THE IDS OF THE AGENTS THAT SHARE THEIR NAME WITH AN OLDER ONE, among the agents that are not retired.
 *
 * Problem hqbovBMnTu-z, the decision in message p_04qFPdNmoQ. The press to start a new agent keeps
 * the old name when no longer name is free, so two agents can bear one name. The chat draws a small
 * "new" mark beside the newer one, in its contact row and its conversation's head. Newer is read from
 * the registry: the later registration time, and for two in the same second, the row stored later.
 *
 * A RETIRED AGENT IS LEFT OUT ON BOTH SIDES, because the chat does not draw one (criterion M114). So
 * the mark goes away once the older agent retires, or is renamed, because then no listed agent shares
 * the newer one's name. It is one query for everybody, for the reason `retiredAgentIds` below is.
 */
export function theAgentsNewerThanASameNamedOne(): Set<string> {
  const rows = sqlite
    .prepare(
      'SELECT a.id FROM agents a WHERE a.retired = 0 AND EXISTS (SELECT 1 FROM agents b WHERE b.retired = 0 ' +
        'AND b.name = a.name AND b.id <> a.id AND (b.created_at < a.created_at OR (b.created_at = a.created_at AND b.rowid < a.rowid)))',
    )
    .all() as { id: string }[]
  return new Set(rows.map((row) => row.id))
}

/**
 * THE IDS OF EVERY RETIRED AGENT IN THIS INSTALLATION.
 *
 * A retired agent is given no new work, so it is not somebody a person may write to and it is not
 * drawn on the chat page — criterion M114. This is the contacts door's reading of that fact; the
 * groups the page draws read the same flag off the participants reply, which carries `retired` on
 * each registry row. Both are the one stored column read twice, so they cannot disagree about who
 * is retired. A person has no retirement, so no person ever appears here.
 *
 * IT IS ONE QUERY THAT ANSWERS FOR EVERYBODY, and a set of ids rather than a question asked per
 * row, because the contacts list walks every registered participant. Asking the database once per
 * row would be the same answer computed as many times as there are agents, which is the shape of
 * problem 9UeL9VeVPn33.
 */
export function retiredAgentIds(): Set<string> {
  const rows = sqlite.prepare('SELECT id FROM agents WHERE retired = 1').all() as { id: string }[]
  return new Set(rows.map((row) => row.id))
}

/**
 * WHO MAY RETIRE WHOM, AND WHY NOT. Criterion P82, and problem zyCcJYCLsAe7 before it.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE AND WHAT IT CHANGED
 * ---------------------------------------------------------------------------------------
 *
 * A secretary may retire a supervisor or a worker, and likewise a supervisor may retire a worker. Until
 * this, two callers could retire a row: the person, and the agent named on it as its starter.
 * Measured on 8 September on a fresh database: a secretary asking for a supervisor's row was
 * refused 403, and so was a supervisor asking for a worker's row. They met the same refusal on a
 * stray row with no starter recorded at all, so only they could close it.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, IN THE ORDER IT IS ASKED
 * ---------------------------------------------------------------------------------------
 *
 *   0. Nobody retires Mole Office's own row, the person included.
 *   1. The person may retire anybody else.
 *   2. An agent the person has raised may retire anybody else.
 *   3. A card declared appointed by the person is refused to every other caller, including its starter.
 *   4. Otherwise an agent may retire what it started. This is the one hop on the row, not the chain above it.
 *   5. Otherwise by rank, STRICTLY BELOW. Nobody retires a row holding an equal or higher card.
 *
 * STRICTLY BELOW AND NOT AT OR BELOW, which is the trap the critic named (note IyKUXwTqwOTq,
 * objection 4). `appoints` in design/permissions/roles.json says *at or below its own rung*, and a
 * retire rule that reused that comparison would let a supervisor close another supervisor and close
 * itself. The rule is downward only.
 *
 * MOLE OFFICE'S OWN ROW IS ASKED FIRST, AND REFUSED TO EVERY CALLER. Every reading of Mole Office's id asks for exactly
 * one live row with its handle (`moleOfficeIdFromItsRow`). With that row retired, every message, the participant list,
 * a profile and every request made with the office's key fail, no door puts the row back, and a restart does not mend
 * it, because the seed meets the retired row and writes nothing. Nobody gains anything by the act, and every other
 * change to the row already refuses the person, so this refuses the person too. It is asked before the person's pass
 * and before the gate, so it holds at both positions and the gate counts nothing.
 *
 * A CARD APPOINTED BY THE PERSON IS THE PERSON'S TO RETIRE, or a raised agent's. This is read from
 * `appointedBy` in the declaration, before the starter or rank is asked. A card off the tree has no
 * rank to compare in either direction. An agent holding one retires nothing by rank.
 *
 * THE CARD IS THE ONE THE ROW IS READ AS, which is the reading every refusal in this product
 * already uses: a row with no card written on it is read as the worker card
 * (`A_ROW_WITH_NO_ROLE_READS_AS`). Reading it any other way here would make the rank rule disagree
 * with every other permission in the product about the same row.
 *
 * A WORD NO CARD HOLDS IS A REFUSAL AND NOT A GUESS. A registry row may carry a word this
 * declaration no longer holds — the investigator rung left the tree on 6 September 2026 and rows
 * written while it existed still carry the word. Nothing here decides what such a word is worth.
 *
 * ---------------------------------------------------------------------------------------
 * ONE FUNCTION FOR EVERY RETIREMENT PATH, AND WHY THE BROWSER IS NOT ONE OF THEM
 * ---------------------------------------------------------------------------------------
 *
 * The retire door, a record PATCH that retires an agent and deletion of its last live record ask
 * this rule. The profile reply carries its answer so the page can draw the press for whoever may
 * press it. The page never works the rank out: the browser would need its own
 * copy of the card tree and of this rule, which is the ninth invariant broken on a permission. That
 * is the same arrangement `src/shared/authority.ts` already describes for an act kept to this
 * machine — a control is not drawn rather than drawn and then refused.
 *
 * ---------------------------------------------------------------------------------------
 * WHILE THE GATE who-retires-an-agent IS OFF
 * ---------------------------------------------------------------------------------------
 *
 * Any agent its own key proves may also retire any agent the rule above refuses it, a secretary too, and the gate
 * counts it. The raise is then not asked. Mole Office's own row is refused by step 0 at both positions. A
 * caller no key proves is refused in words that say the gate is off. Only a press is counted: the door asks with
 * `pressed`, and the profile's reading counts nothing.
 */
export interface MayRetireThisRow {
  /** Whether this actor may retire this row. */
  may: boolean
  /** Why not, in a sentence a person reads, or null because they may. */
  whyNot: string | null
}

export function whoMayRetire(row: RegisteredAgent, actor: Actor, pressed = false): MayRetireThisRow {
  const may: MayRetireThisRow = { may: true, whyNot: null }

  // 0. MOLE OFFICE'S OWN ROW, refused to every caller and never counted. The comment above says why.
  if (isMoleOffice({ kind: 'agent', id: row.id })) return { may: false, whyNot: MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE }
  // 1. THE PERSON. Criterion P83, point 1: the key is what makes a caller the person; a header that
  // only claims it counts for one version on loopback or a trusted machine, and nowhere else.
  if (thePersonIsProved(actor)) return may
  // 1a. INSIDE A TEST WORLD, ITS STARTER AND THE SECRETARY, who hold the person's authority there. Criterion P84, rule 5
  // of chapter 8, problem aRP8Co6BB_Hv. The retirement is still filed as the agent that asked.
  if (actor.theOwnersAuthority?.holds === true) return may
  // 2. A RAISE CARRIES THE PERSON'S RIGHT TO RETIRE ANY CARD, asked only while the gate is at block.
  const position = gatePosition('who-retires-an-agent')
  if (position === 'block' && actor.type === 'agent' && aRaiseCarriesIt(actor)) return may
  const byTheCards = whoMayRetireByTheCards(row, actor)
  if (byTheCards.may) return byTheCards
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && (pressed ? gateMet('who-retires-an-agent', position!) : position) !== 'block') return may
  if (!keyed && position !== 'block') return { may: false, whyNot: refusedWhileTheGateIsOff(actor.id, 'who-retires-an-agent', 'retire any agent').message }
  return byTheCards
}

/** Rules 3 to 5 above, asked of every caller that is not the person, the owner's authority or a raised agent. */
function whoMayRetireByTheCards(row: RegisteredAgent, actor: Actor): MayRetireThisRow {
  const may: MayRetireThisRow = { may: true, whyNot: null }
  const no = (whyNot: string): MayRetireThisRow => ({ may: false, whyNot })

  // 3. A CARD APPOINTED BY THE PERSON IS ALSO THE PERSON'S TO RETIRE.
  // Its declared authority decides; the office's words only explain the refusal.
  const decl = theRoleCards()
  const theirsWord = row.role ?? A_ROW_WITH_NO_ROLE_READS_AS
  const theirs = cardFor(decl, theirsWord)
  if (theirs?.appointedBy === 'the person') {
    const words = theCardInTheOfficesWords(theirs)
    return no(`Only the person, or an agent the person has raised, may retire "${row.handle}", because it holds the ${theirs.name} card, which says: "${words.whatEndsIt}" Nothing was written.`)
  }

  if (actor.type !== 'agent') {
    // A CLAIM TO BE THE PERSON THAT IS NOT PROVED. The words are written in one place,
    // lib/not-proved-the-person.ts. This reads the actor and not the request, so the words say only
    // what holds whichever way the facts it cannot read go. The retire door adds that nothing was
    // written, so this says nothing about what was done.
    return no(
      theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, null), {
        refused: `Retiring "${row.handle}" is the person's act, or the act of an agent that started it or holds a higher card`,
        nothingWasDone: null,
        whoMay: 'Such an agent asks under its own name.',
      }),
    )
  }

  // 4. THE STARTER. One hop, from the row itself. `startedBy` is a stored reference and the caller
  // is the live one, so they are compared through `sameAgent`: a starter that sends its handle and a
  // starter that sends its registry id are both the agent the row stored.
  const starter = row.startedBy
  if (starter !== null && starter.kind === 'agent' && sameAgent({ actorType: 'agent', actorId: starter.id }, actor)) {
    return may
  }

  // 5. RANK. Both cards are read the way the rest of the product reads them. The caller's own row
  // is reached through `participantForActor`, which is the one reader of an arriving actor, and then
  // by exact registry id, because the row can hold a card only a live row can be compared by.
  const caller = participantForActor(actor)
  const asking = caller !== null && caller.kind === 'agent' ? (readParticipant(caller) as RegisteredAgent | null) : null
  const said = starter === null ? 'nobody recorded a starter for it' : `it was started by ${participantWord(starter.kind)} ${theStarterAsNamed(starter)}`
  if (asking === null) {
    return no(
      `Retiring "${row.handle}" is the owner's act, the act of the agent that started it, or the act of an agent ` +
        `holding a card above the one this row holds. No agent in this installation answers to "${actor.id}", so ` +
        `nothing says which card is asking.`,
    )
  }
  const mineWord = asking.role ?? A_ROW_WITH_NO_ROLE_READS_AS
  const mine = cardFor(decl, mineWord)
  if (mine === null) {
    return no(
      `"${actor.id}" holds the card "${mineWord}", which is not a card here. The cards are ${theRoleWordsSaid(decl)}. ` +
        'Nothing was written.',
    )
  }
  if (theirs === null) {
    return no(
      `"${row.handle}" holds the card "${theirsWord}", which is not a card here, so no rank can be compared. ` +
        `Retiring it is the owner's act. Nothing was written.`,
    )
  }
  if (theirs.rung === null) {
    return no(
      `${capitaliseTheCard(aOrAn(theirs.name))} is off the power tree, so no card ranks above it. Retiring ` +
        `"${row.handle}" is the owner's act, or the act of the agent that started it — ${said}. This request was ` +
        `made by "${actor.id}".`,
    )
  }
  if (mine.rung === null) {
    return no(
      `${capitaliseTheCard(aOrAn(mine.name))} is off the power tree, so it has no rung and retires nothing by rank. ` +
        `Retiring "${row.handle}" is the owner's act, or the act of the agent that started it — ${said}. This ` +
        `request was made by "${actor.id}".`,
    )
  }
  if (mine.rung > theirs.rung) return may
  // MOLE OFFICE'S OWN ROW HOLDS NO CARD. It ranks where a row with no card ranks, as before, and its refusal says so
  // rather than saying it holds a card.
  if (isMoleOffice({ kind: 'agent', id: asking.id })) {
    return no(
      `"${asking.handle}" ${MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD}, and a row with no card ranks at the ${mine.name} ` +
        `card's rung ${String(mine.rung)}. "${row.handle}" holds the ${theirs.name} card at rung ` +
        `${String(theirs.rung)}, which is not below it. Retiring it is the owner's act, or the act of the agent that ` +
        `started it — ${said}.`,
    )
  }
  return no(
    `${capitaliseTheCard(aOrAn(mine.name))} retires a row holding a card below its own rung, and ` +
      `"${row.handle}" holds the ${theirs.name} card at rung ${String(theirs.rung)} while "${actor.id}" holds the ` +
      `${mine.name} card at rung ${String(mine.rung)}. Retiring it is also the owner's act, or the act of the agent ` +
      `that started it — ${said}.`,
  )
}

/**
 * A STORED STARTER AS A PERSON READS IT. An agent is named by the handle on its row, read with the
 * stored reader: the exact id first, then the one agent bearing the string as a handle. Where no row
 * answers, or more than one does, the stored string is shown as it is. A person is shown by id.
 */
function theStarterAsNamed(starter: ParticipantRef): string {
  if (starter.kind !== 'agent') return starter.id
  const row = theAgentAStoredIdNames(starter.id) ?? theOneAgentAStringNames(sqlite, starter.id)
  return row === null ? starter.id : row.handle
}

/** The same phrase at the start of a sentence. `aOrAn` is shared/roles.ts's; this capitalises it. */
function capitaliseTheCard(said: string): string {
  return said.slice(0, 1).toUpperCase() + said.slice(1)
}

/**
 * Refuse the retire unless this actor may. The door's half of `whoMayRetire`.
 *
 * The card's refusal already ends with the line about nothing being written. Other refusals get
 * that line here. The profile reply carries the same rule's reason.
 */
export function whyThisIsNotYoursToRetire(row: RegisteredAgent, actor: Actor): void {
  const said = whoMayRetire(row, actor, true)
  if (said.may) return
  const why = said.whyNot ?? 'This row is not yours to retire.'
  const refusal = new PanelError(why.endsWith('Nothing was written.') ? why : `${why} Nothing was written.`, 403)
  // AN AGENT ITS OWN KEY PROVES, REFUSED HERE, WAS COUNTED AS STOPPED. A revision put back asks this inside its write,
  // which the refusal takes back with the count, so the count is made again once the write is taken back.
  if (anAgentItsOwnKeyProves(actor) === null || isMoleOffice({ kind: 'agent', id: row.id })) throw refusal
  throw gateMetAgainOnceTheWriteIsTakenBack(refusal, () => gateMet('who-retires-an-agent', 'block'))
}

/**
 * RETIRE AN AGENT'S REGISTRY ROW. Problem zyCcJYCLsAe7.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Under proposal R9T5Xov_ueav a secretary removed the Codex
 * agent's record. Its registry row, whose id named the owner, stayed in the Embassy as an active
 * contact, because NOTHING retired a registry row: `PATCH /api/participants/agent/<id>` does not
 * take `retired`, and the only writer of that column was `retireWhateverWasStartedFor` in
 * src/server/lib/claims.ts — the release of a claim, which that agent never had.
 *
 * Retirement was written for agents an office STARTED under a claim. An agent that registered itself,
 * or came in through the plain records door, had no way out of the registry at all.
 *
 * ---------------------------------------------------------------------------------------
 * THE ROW IS KEPT AND THE HANDLE IS FREE AGAIN
 * ---------------------------------------------------------------------------------------
 *
 * Nothing is deleted. The row reads retired and the Embassy folds it away. Its handle is free again,
 * criterion I3: a later registration under it makes a new agent with a new id, and this row keeps
 * its own id, its messages and its history.
 *
 * THE RECORD IS FOLLOWED WHERE THERE IS ONE. Retirement is stored twice — `state` on the agent
 * record and `retired` on the row — and `keepTheAgentRegistryInStep` derives the second from the
 * first. This retires the row and every live record mapped to it in one transaction, so a later
 * record edit cannot make the row active again. A row with no record is retired too.
 */
export function retireThisAgent(
  id: string,
  by: ParticipantRef | null,
  because: string,
): RegisteredAgent & { nothingWritten?: boolean } {
  const row = sqlite.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (row === undefined) return theAgentThisIsNot(id)
  const held = asAgent(row)
  if (held.retired) return { ...held, nothingWritten: true }
  return sqlite.transaction(() => {
    sqlite
      .prepare(
        'UPDATE agents SET retired = 1, retired_because = ?, retired_at = ?, retired_by_kind = ?, ' +
          'retired_by_id = ? WHERE id = ?',
      )
      .run(because.trim(), nowStamp(), by?.kind ?? null, by?.id ?? null, id)
    const records = sqlite.prepare(
      'SELECT r.id FROM agent_records m JOIN records r ON r.id = m.record_id WHERE m.agent_id = ? AND r.deleted_at IS NULL',
    ).all(id) as { id: string }[]
    for (const record of records) {
      throughTheRetireDoor(() => patchRecord(record.id, { dataPatch: { state: 'retired', retiredBecause: because.trim() } },
        { type: 'agent', id: 'mole-office/the-api-server', stated: true }))
    }
    return asAgent(sqlite.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Record<string, unknown>)
  })()
}

/** Thrown where no registry row answers to an id. Its own function so the sentence is written once. */
function theAgentThisIsNot(id: string): never {
  throw new PanelError(`No agent in this installation answers to "${id}". Nothing was written.`, 404)
}

export { readParticipant } from '../db/read-participant.ts'

export { theAgentRowAnIdNames } from './the-agent-row-an-id-names.ts'

export { theCardOfAgent } from '../db/the-card-of-agent.ts'

export { theCardTheRoleIs } from '@shared/the-card-the-role-is.ts'

export { theRoleOnTheAgentRow } from '../db/the-role-on-the-agent-row.ts'

export { PARTICIPANT_BY_ID } from '../db/read-participant.ts'

export { theParticipantByIdStatements } from '../db/read-participant.ts'

export { asPerson } from '../db/read-participant.ts'

// ============================================================ who may change what, and the sentences

/**
 * WHO MAY CHANGE WHAT. Three rules, from criterion M3, each with its sentence.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULES
 * ---------------------------------------------------------------------------------------
 *
 * A NAME is a person's to give: a user may change an agent's
 * avatar and its name. So a person may change any agent's name and their own. An agent may change no
 * name at all, including its own: a name is what everybody else calls it, and M3 gives that to the
 * person.
 *
 * A PICTURE follows the same rule with one addition: an agent is given one when it starts, and may
 * change its own. So a person may change any
 * agent's picture and their own, and an agent may change its own and no other.
 *
 * A STATE IS SELF-SET AND NOBODY ELSE'S. Criterion M4: *a participant's state is short text they set
 * themselves.* So a person sets their own and an agent sets its own, and neither sets the other's —
 * including the owner, because a state somebody else can write is not a state they set themselves.
 * That reading is the agent's and the person can take it back; nothing in the criterion asks for it either way.
 *
 * ---------------------------------------------------------------------------------------
 * A CALLER NOTHING HAS REGISTERED IS REFUSED HERE, AND ONLY HERE
 * ---------------------------------------------------------------------------------------
 *
 * This refusal is older than the general one. When it was written, a record write from an
 * unregistered agent was accepted exactly as it was — criterion M14 then, and the owner's F1 answer of
 * 3 September 2026: name it, never stop it. Since 16 September 2026 such a write is refused as well,
 * by `whyAnUnregisteredAgentMayNotWrite` in lib/records/unregistered-agent.ts (criterion M14 as amended on 30 September
 * 2026). This refusal stays for its own reason. Changing a
 * participant means changing somebody's own name, picture or state, and a caller the registries do
 * not know has no own to change and no way to be checked against one. The refusal says how to
 * register rather than only saying no.
 */
export type ParticipantChange = 'name' | 'avatar' | 'state' | 'presence' | 'circle' | 'messageLink' | 'card' | 'look'

export { whyTheChangeIsRefused } from '@shared/why-the-change-is-refused.ts'

/**
 * WRITE WHAT IS ON A PERSON'S OWN ROLE CARD: their occupation, and which portrait is on it.
 *
 * Criteria P45 and P47. Both are theirs and nothing checks either: an occupation is what somebody
 * says they do, and a portrait is one of the pictures painted for their card or one of their own.
 *
 * AN EMPTY WORD PUTS THE ROW BACK TO NOBODY HAVING WRITTEN ONE, which is read as an absence rather
 * than as an empty occupation — the same shape every other setting on this row has.
 *
 * THE PORTRAIT IS CHECKED FOR SHAPE AND NOT FOR EXISTENCE. It is the address the picture is served
 * at, and whether a file is behind it is a question about a folder on a machine; the card page says
 * plainly when there is no picture. What is refused here is a value that is not one of this
 * product's own portrait addresses, because a card pointing anywhere else would be this page
 * fetching a picture from somewhere nobody chose.
 */
export function setWhatIsOnTheirCard(
  who: ParticipantRef,
  change: { occupation?: string; portrait?: string },
  by: ParticipantRef | null,
): void {
  assertTheChangeIsAllowed('card', who, by)
  theRowOrARefusal(who)
  if (change.occupation !== undefined) {
    const said = change.occupation.trim()
    sqlite.prepare('UPDATE people SET occupation = ? WHERE id = ?').run(said === '' ? null : said, who.id)
  }
  if (change.portrait !== undefined) {
    const said = change.portrait.trim()
    if (said === '') {
      sqlite.prepare('UPDATE people SET portrait = NULL WHERE id = ?').run(who.id)
    } else {
      if (!said.startsWith('/api/portraits/')) {
        throw new PanelError(
          `"${said}" is not a portrait this product serves. A portrait is one of the pictures painted for a ` +
            'card, or one kept on this machine, and both are addressed under /api/portraits/. GET /api/portraits ' +
            'names what there is. Nothing was written.',
          400,
        )
      }
      sqlite.prepare('UPDATE people SET portrait = ? WHERE id = ?').run(said, who.id)
    }
  }
}

/**
 * SAY WHICH ROLE CARD A PERSON HOLDS. Criterion P46: every citizen holds one.
 *
 * ---------------------------------------------------------------------------------------
 * TWO RULES, BECAUSE THERE ARE TWO DIFFERENT ACTS HERE
 * ---------------------------------------------------------------------------------------
 *
 * CHANGING A CARD SOMEBODY HOLDS IS THEIRS. Moving a person from one card to another is a statement
 * about where they stand in the Office, and it is not an agent's to make.
 *
 * WRITING DOWN THE CARD A ROW IS ALREADY READ AS IS NOT A CHANGE. A person's row that names no role
 * is read as `A_PERSON_WITH_NO_ROLE_READS_AS` by every refusal, every gate and every screen, so
 * writing that same word changes nothing about what anybody may do: it makes the row say what the
 * product already believes. That is what the one-off act of criterion P46 does, and it is the only
 * thing an agent may write here — any other word on an empty row is refused, by name.
 */
export function setThePersonsCard(who: ParticipantRef, role: string, by: ParticipantRef | null): void {
  if (who.kind !== 'person') {
    throw new PanelError(
      "An agent's card is written on its agent record, and the registry row follows the record. There is nothing " +
        'to write here. Nothing was written.',
      400,
    )
  }
  const row = theRowOrARefusal(who) as RegisteredPerson
  const said = role.trim()
  if (said === '') {
    throw new PanelError(
      'A card is a word from the personCards list in src/config/roles.json. Send one. Nothing was written.',
      400,
    )
  }
  const itsOwn = by !== null && by.kind === 'person' && by.id === who.id
  if (!itsOwn) {
    if (row.role !== null) {
      throw new PanelError(
        `${row.name} already holds the ${row.role} card, and moving somebody from one card to another is theirs ` +
          'to do. Nothing was written.',
        403,
      )
    }
    if (said !== A_PERSON_WITH_NO_ROLE_READS_AS) {
      throw new PanelError(
        `A row that names no card is read as the ${A_PERSON_WITH_NO_ROLE_READS_AS} card everywhere in this ` +
          `product, so writing that word down changes nothing and anybody may do it. "${said}" is a different ` +
          'card, and giving somebody a card is theirs to accept. Nothing was written.',
        403,
      )
    }
  }
  /**
   * AND IS IT A CARD A PERSON MAY HOLD AT ALL. Criterion P52, and it was measured missing.
   *
   * `personCards` and `cards` are two lists in one declaration and nothing reads across them: a
   * person's card is never one an agent can be registered as, which is what `isAPersonRole` and
   * `isARole` in @shared/roles.ts are two functions for. This door checked neither, so
   * `{"role":"worker"}` on a person was stored — and then `personCardFor` answers null, the standing
   * line has no card to build from, and the Role cards page draws a person holding a role that is
   * not in the list it is drawn from.
   *
   * IT IS ASKED AFTER WHO IS ASKING, and that order is the existing rule's and not a preference.
   * Moving somebody from one card to another is theirs to do, whatever word was sent — criterion
   * P46 and the test that holds it — so a caller who may not do it at all hears that first. This
   * check answers the caller who MAY, and sent a word from the other list.
   */
  if (theRoleCardsAreRead() && !isAPersonRole(theRoleCards(), said)) {
    const cards = theRoleCards().personCards.map((one) => one.name)
    throw new PanelError(
      `"${said}" is not a card a person holds. The cards a person may hold are ${cards.join(', ')}, from the ` +
        'personCards list in src/config/roles.json. The other list in that file is the roles an AGENT ' +
        'holds, and nothing reads across the two. Nothing was written.',
      400,
    )
  }

  sqlite.prepare('UPDATE people SET role = ? WHERE id = ?').run(said, who.id)
}

/**
 * The refusal for an agent whose starter is already written down. Exported so the test reads the
 * sentence from here rather than writing it out a second time.
 */
export function itAlreadyHasAStarter(name: string, startedBy: ParticipantRef): string {
  return (
    `${name} already has a starter: ${participantWord(startedBy.kind)} ${startedBy.id}. ` +
    'A starter is only filled in where none is recorded. Nothing was written.'
  )
}

/**
 * SAY THAT YOU STARTED AN AGENT THAT NOBODY IS DOWN AS HAVING STARTED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The registry gained a starter in migration 0135 and `POST /api/agents/started` writes it for an
 * agent being registered. An agent registered before that has none, and the registration route
 * refuses to file anybody under it: a chain of starters that reaches nobody has nobody answering for
 * the agents on it, which is the whole of what a starter is. Its refusal names the way out — a
 * person sets the starter of whichever agent the chain stopped at — and until now that door did not
 * exist, so every builder under such an agent was unregisterable.
 *
 * ---------------------------------------------------------------------------------------
 * A PERSON, AND ONLY AS THEMSELVES
 * ---------------------------------------------------------------------------------------
 *
 * ONLY A PERSON. An agent naming a starter would be an agent deciding who answers for another agent,
 * which is the act the registration route already refuses to let a caller make about anybody but
 * itself.
 *
 * ONLY THEMSELVES. `tools/register-a-started-agent.mjs` says why in the one sentence this obeys: a
 * caller that could name somebody else would be naming somebody who has not agreed to answer for the
 * agent. A person writing their own name has agreed, in the act of writing it. A third party has
 * not, and nothing here can ask them.
 *
 * ONLY WHERE THERE IS NONE. Moving an agent from one starter to another is a different act: it takes
 * an agent off somebody who answered for it, without their saying so. This mends a gap and does not
 * reassign anybody, and an agent that already has a starter is refused by name.
 *
 * NEVER MOLE OFFICE'S OWN ROW. It is the product writing its own lines, and nobody started it. A starter written on it
 * would be untrue, and a starter is what a new key for an agent asks first.
 */
export function sayYouStartedThisAgent(agentId: string, by: ParticipantRef | null): void {
  if (by === null || by.kind !== 'person') {
    throw new PanelError(
      "Only a person can name an agent's starter. Nothing was written.",
      403,
    )
  }
  const row = theRowOrARefusal({ kind: 'agent', id: agentId }) as RegisteredAgent
  // Mole Office is not an agent somebody started, so nobody is written down as its starter.
  if (isMoleOffice({ kind: 'agent', id: row.id })) throw new PanelError(MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE, 403)
  if (row.startedBy !== null) {
    throw new PanelError(itAlreadyHasAStarter(row.name, row.startedBy), 409)
  }
  sqlite
    .prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?')
    .run('person', by.id, agentId)
}

/**
 * WHY THIS CALLER MAY NOT SET HOW `who` WISHES TO BE ADDRESSED, in one plain sentence, or null
 * because it may.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND HOW EACH CALLER PROVES WHO IT IS
 * ---------------------------------------------------------------------------------------
 *
 * A PERSON SETS THEIR OWN, with a request proved to be them: `thePersonIsProved` in lib/records.ts,
 * the one answer every person-only door reads, and the actor's id is the person the path names.
 *
 * THE OWNER MAY SET ANY AGENT'S, with the same proof.
 *
 * AN AGENT SETS ITS OWN, WITH ITS OWN KEY. `actorFrom` in lib/http.ts reads the key through
 * `howThisRequestProvedItself` in lib/keys.ts and carries the holder it proved as `keyHolder`. The
 * holder must be the agent the path names. A header naming the agent without its key is refused,
 * whether or not the key window is open: a name on a header proves nothing.
 *
 * A SECRETARY MAY SET ANYBODY'S, a person's or an agent's, as a basic duty and with no raise
 * . A secretary is the agent its own key proves,
 * whose registry row holds the secretary card and is not retired: the card is read from that row the way
 * `holdsTheSecretaryCard` in lib/merge-queue.ts and the area rule above read it, never from the request.
 *
 * NOBODY ELSE SETS ANOTHER'S: not an ordinary agent for anybody, and not a person for another person.
 *
 * A PERMANENT RESIDENT'S IS ITS OWN AND THE OWNER'S, and a secretary's power stops there.
 * Answer 8 of proposal GsGFiDygATd5: a resident's address may be set only by the
 * resident, with its own key, and by the person. Every other agent, a secretary included, is refused on a
 * resident, and everybody else's rule is unchanged. Whether an agent is a resident is `isAPermanentResident`.
 *
 * Mole Office's own row is nobody's to change, as for every other setting on it.
 *
 * WHILE THE GATE who-sets-how-another-agent-is-addressed IS OFF, any agent its own key proves may also set another
 * agent's, a resident's too, and the gate counts it. Mole Office's own row and a person's address keep the rule above. A
 * caller no key proves is refused in words that say the gate is off. Only the door's own ask is counted: it passes
 * `pressed`, and the write's second ask counts nothing.
 */
export function whyThisAddressAsWriteIsRefused(who: ParticipantRef, actor: Actor, pressed = false): PanelError | null {
  const refused = whyThisAddressAsWriteIsRefusedAtBlock(who, actor)
  if (refused === null || who.kind !== 'agent' || isMoleOffice(who)) return refused
  const position = gatePosition('who-sets-how-another-agent-is-addressed')
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && (pressed ? gateMet('who-sets-how-another-agent-is-addressed', position!) : position) !== 'block') return null
  if (!keyed && position !== 'block') return refusedWhileTheGateIsOff(actor.id, 'who-sets-how-another-agent-is-addressed', 'set how another agent is addressed')
  return refused
}

/** The rule above as it stands while the gate is at block. */
function whyThisAddressAsWriteIsRefusedAtBlock(who: ParticipantRef, actor: Actor): PanelError | null {
  if (isMoleOffice(who)) return new PanelError(MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE, 403)
  const nothing = 'Nothing was written.'
  const aResident = who.kind === 'agent' && isAPermanentResident(who.id)
  if (aResident && actor.type === 'agent') {
    const residentMay =
      'A permanent resident’s address is set only by the resident itself, with its own key sent as x-mole-office-key, or by the owner. A secretary may not set it.'
    const proves = theAgentTheKeyProves(actor)
    if (proves === who.id && actor.provedHolder === undefined) return null
    const named = participantForActor(actor)
    if (proves === null && named !== null && named.kind === 'agent' && named.id === who.id) {
      return new PanelError(`This request names that resident, and no key on it proves that resident. ${residentMay} ${nothing}`, 403, undefined, undefined, undefined, { code: 'addressResidentKeyMissing', values: {} })
    }
    return new PanelError(`That agent is a permanent resident. ${residentMay} ${nothing}`, 403, undefined, undefined, undefined, { code: 'addressResidentIsItsOwn', values: {} })
  }
  if (theKeyProvesASecretary(actor)) return null
  if (who.kind === 'person') {
    if (actor.type === 'human' && actor.id === who.id && thePersonIsProved(actor)) return null
    const whoMay =
      "How a person wishes to be addressed is set by that person, with a request proved to be them, or by a secretary with its own key."
    if (actor.type === 'agent') return new PanelError(`An agent that is not a secretary may not set it for a person. ${whoMay} ${nothing}`, 403, undefined, undefined, undefined, { code: 'addressPersonNeedsSecretary', values: {} })
    if (actor.type === 'human' && actor.id !== who.id) return new PanelError(`One person may not set it for another. ${whoMay} ${nothing}`, 403, undefined, undefined, undefined, { code: 'addressPersonCannotSetAnother', values: {} })
    return new PanelError(`This request is not proved to be that person. ${whoMay} ${nothing}`, 403, undefined, undefined, undefined, { code: 'addressPersonNotProved', values: {} })
  }
  const whoMay =
    'How an agent wishes to be addressed is set by that agent with its own key sent as x-mole-office-key, by the owner, or by a secretary with its own key.'
  if (actor.type === 'human') {
    if (thePersonIsProved(actor)) return null
    if (aResident) {
      return new PanelError(
        `This request is not proved to be the owner. A permanent resident’s address is set only by the resident itself, with its own key, or by the owner. ${nothing}`,
        403, undefined, undefined, undefined, { code: 'addressResidentOwnerNotProved', values: {} },
      )
    }
    return new PanelError(`This request is not proved to be the owner. ${whoMay} ${nothing}`, 403, undefined, undefined, undefined, { code: 'addressOwnerNotProved', values: {} })
  }
  const keyProves = theAgentTheKeyProves(actor)
  if (actor.type === 'agent' && keyProves === who.id && actor.provedHolder === undefined) return null
  if (actor.type !== 'agent') return new PanelError(`This request is not from that agent. ${whoMay} ${nothing}`, 403, undefined, undefined, undefined, { code: 'addressNotFromAgent', values: {} })
  const named = participantForActor(actor)
  if (named !== null && named.kind === 'agent' && named.id === who.id) {
    return new PanelError(`This request names that agent, and no key on it proves that agent. ${whoMay} ${nothing}`, 403, undefined, undefined, undefined, { code: 'addressAgentKeyMissing', values: {} })
  }
  return new PanelError(`One agent may not set it for another unless it is a secretary. ${whoMay} ${nothing}`, 403, undefined, undefined, undefined, { code: 'addressAgentCannotSetAnother', values: {} })
}

export { theAgentTheKeyProves } from './the-agent-the-key-proves.ts'

export { theKeyProvesASecretary } from './the-key-proves-a-secretary.ts'

export { isAPermanentResident } from '../db/is-a-permanent-resident.ts'

export { everyPermanentResident } from '../db/every-permanent-resident.ts'

/**
 * SET HOW `who` WISHES TO BE ADDRESSED, replacing the whole field, or refuse with the sentence that
 * names the rule. `addressAs` has already been read by `readTheAddressAsSent` in
 * src/shared/address-as.ts. The refusal and the row check both come before the one write, so a
 * refused request writes nothing. The same UPDATE records who set it and when (migration 0182):
 * the caller's registry id for an agent, the person's id for a person.
 */
export function setParticipantAddressAs(who: ParticipantRef, addressAs: AddressAs, actor: Actor): void {
  const because = whyThisAddressAsWriteIsRefused(who, actor)
  if (because !== null) throw because
  theRowOrARefusal(who)
  const setBy: { kind: 'person' | 'agent'; id: string } =
    actor.type === 'human' ? { kind: 'person', id: actor.id } : { kind: 'agent', id: theAgentTheKeyProves(actor) ?? actor.id }
  sqlite
    .prepare(SET_ADDRESS_AS[who.kind])
    .run(...ADDRESS_AS_PARTS.map((part) => addressAs[part] ?? null), setBy.kind, setBy.id, nowStamp(), who.id)
}

/**
 * WHETHER AN AGENT READS A RELEASE FROM THE CHECK'S OWN RESULT, as the agent or the owner said it, with who, when
 * and why. Wave 13y round 9, answer HeBxwj6QRGjS. When `on` is true a release written to this agent does
 * not wake it, because it has already read the verdict where the inspector wrote it; a refusal wakes it whatever
 * this says (`theKindOfARelease` in lib/inspection.ts).
 */
export interface ReadsReleasesFromTheCheck {
  on: boolean
  by: { kind: 'person' | 'agent'; id: string }
  at: string
  because: string
}

/**
 * WHAT ONE AGENT HAS SAID, or null because nobody has said anything, which reads as off. A stored value this
 * cannot read is thrown, not read as off: only `setReadsReleasesFromTheCheck` writes the column, so such a
 * value means something else wrote it.
 */
export function theReleaseReadingOf(agentId: string): ReadsReleasesFromTheCheck | null {
  const row = sqlite.prepare('SELECT reads_releases_from_the_check AS said FROM agents WHERE id = ?').get(agentId) as
    | { said: unknown }
    | undefined
  if (row === undefined || row.said === null) return null
  const said: unknown = typeof row.said === 'string' ? JSON.parse(row.said) : null
  const one = said as Partial<ReadsReleasesFromTheCheck> | null
  if (
    one === null ||
    typeof one !== 'object' ||
    typeof one.on !== 'boolean' ||
    typeof one.at !== 'string' ||
    typeof one.because !== 'string' ||
    typeof one.by !== 'object' ||
    one.by === null ||
    (one.by.kind !== 'person' && one.by.kind !== 'agent') ||
    typeof one.by.id !== 'string'
  ) {
    throw new Error(
      `Agent ${agentId}'s reads_releases_from_the_check holds ${String(row.said)}, which is not the shape ` +
        'setReadsReleasesFromTheCheck writes. Something else wrote it.',
    )
  }
  return { on: one.on, by: { kind: one.by.kind, id: one.by.id }, at: one.at, because: one.because }
}

/**
 * WHO MAY SAY IT: the owner, with a request proved to be them, and the agent itself, with its own key. The first
 * condition (HeBxwj6QRGjS). A secretary the owner has raised passes as the owner does, because it gives a raised
 * secretary the owner's acts except three it names, and this act is not one of them. An
 * unraised secretary is refused, because it is a fact about how that agent works.
 *
 * WHILE THE GATE who-says-whether-another-agent-reads-releases IS OFF, any agent its own key proves may also say it for
 * another agent, and the gate counts it. The raise is then not asked. A caller no key proves is refused in words that
 * say the gate is off. `byTheGate` is true when the gate let the caller through, so that the door writes the change
 * down in the caller's name and not as an act under the raise.
 */
export function whyThisReleaseReadingWriteIsRefused(who: ParticipantRef, actor: Actor): { refusal: PanelError | null; byTheGate: boolean } {
  const allowed = { refusal: null, byTheGate: false }
  const refused = (refusal: PanelError) => ({ refusal, byTheGate: false })
  const whoMay =
    'Whether an agent reads a release from the check is said by that agent, with its own key sent as x-mole-office-key, ' +
    'by the owner, or by a secretary the owner has raised. Nothing was written.'
  if (who.kind !== 'agent' || isMoleOffice(who)) return refused(new PanelError(`Only an agent reads releases. ${whoMay}`, 400))
  if (actor.type === 'human' && thePersonIsProved(actor)) return allowed
  if (actor.type === 'agent' && theAgentTheKeyProves(actor) === who.id && actor.provedHolder === undefined) return allowed
  const position = gatePosition('who-says-whether-another-agent-reads-releases')
  if (position === 'block' && actor.type !== 'human' && aRaiseCarriesIt(actor)) return allowed
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-says-whether-another-agent-reads-releases', position!) !== 'block') return { refusal: null, byTheGate: true }
  if (!keyed && position !== 'block') {
    return refused(refusedWhileTheGateIsOff(actor.id, 'who-says-whether-another-agent-reads-releases', 'say whether another agent reads a release from the check'))
  }
  if (actor.type === 'human') return refused(new PanelError(`This request is not proved to be the owner. ${whoMay}`, 403))
  return refused(new PanelError(`This request is not from that agent with its own key, nor from the owner, nor from a secretary the owner has raised. ${whoMay}`, 403))
}

/**
 * Say it, on or off, with a reason. The whole value is written in one UPDATE, and the value written is returned, with
 * whether the gate let the caller through.
 */
export function setReadsReleasesFromTheCheck(who: ParticipantRef, on: boolean, because: string, actor: Actor): { said: ReadsReleasesFromTheCheck; byTheGate: boolean } {
  const { refusal, byTheGate } = whyThisReleaseReadingWriteIsRefused(who, actor)
  if (refusal !== null) throw refusal
  if (because.trim() === '') throw new PanelError('Say why. Nothing was written.', 400)
  theRowOrARefusal(who)
  const said: ReadsReleasesFromTheCheck = {
    on,
    by: actor.type === 'human' ? { kind: 'person', id: actor.id } : { kind: 'agent', id: theAgentTheKeyProves(actor) ?? actor.id },
    at: nowStamp(),
    because: because.trim(),
  }
  sqlite.prepare('UPDATE agents SET reads_releases_from_the_check = ? WHERE id = ?').run(JSON.stringify(said), who.id)
  return { said, byTheGate }
}

/**
 * THE ONE UPDATE FOR EACH REGISTRY, written once from `ADDRESS_AS_COLUMN`, with the parts in the
 * order of `ADDRESS_AS_PARTS`. `setParticipantAddressAs` passes the values in that same order.
 */
function theAddressAsUpdateFor(table: 'people' | 'agents'): string {
  const columns = ADDRESS_AS_PARTS.map((part) => `${ADDRESS_AS_COLUMN[part]} = ?`).join(', ')
  return `UPDATE ${table} SET ${columns}, address_set_by_kind = ?, address_set_by_id = ?, address_set_at = ? WHERE id = ?`
}

const SET_ADDRESS_AS: Readonly<Record<ParticipantKind, string>> = {
  person: theAddressAsUpdateFor('people'),
  agent: theAddressAsUpdateFor('agents'),
}

/** Refuse the change with the sentence naming the rule, or return having said nothing. */
function assertTheChangeIsAllowed(what: ParticipantChange, who: ParticipantRef, by: ParticipantRef | null): void {
  const because = whyTheChangeIsRefused(what, who, by)
  if (because !== null) throw new PanelError(because, 403)
}

/** The row this is about, or a refusal naming what was asked for. */
function theRowOrARefusal(who: ParticipantRef): RegisteredPerson | RegisteredAgent {
  const found = readParticipant(who)
  if (found === null) {
    throw new PanelError(
      `No ${participantWord(who.kind)} in this installation answers to "${who.id}". Nothing was written.`,
      404,
    )
  }
  return found
}

const TABLE_OF: Readonly<Record<ParticipantKind, string>> = { person: 'people', agent: 'agents' }

/** Change a participant's name, or refuse with the sentence that names the rule. */
export function setParticipantName(who: ParticipantRef, name: string, by: ParticipantRef | null, nameBecause: string | null = null): void {
  assertTheChangeIsAllowed('name', who, by)
  theRowOrARefusal(who)
  const because = whyNameIsRefused(name)
  if (because !== null) throw new PanelError(`${because} Nothing was written.`, 400)
  if (who.kind === 'agent') {
    const taken = whyALiveAgentBearsThisName(name, who.id)
    if (taken !== null) throw new PanelError(`${taken} Nothing was written.`, 409)
  }
  // AN AGENT THE PERSON RENAMES HERE LEAVES ONE ROW in agent_renames, the person as proposer and approver (item 42).
  // It reads the old name before the UPDATE below, and writes nothing when the name does not change.
  if (who.kind === 'agent' && by !== null) writeThePersonsOwnRename(who.id, name.trim(), by, nameBecause)
  const table = TABLE_OF[who.kind]
  sqlite.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(name.trim(), who.id)
  // THE OWNER WHO HAD NO NAME HAS ONE NOW: only the person changes their own name, so the name is
  // theirs, and the office's owner setting says so (src/server/db/owner-setting.ts).
  if (who.kind === 'person') {
    sqlite.prepare("UPDATE people SET office_owner = 'named-by-the-person' WHERE id = ? AND office_owner = 'unnamed'").run(who.id)
  }
}

/**
 * Change a participant's state, or refuse with the sentence that names the rule.
 *
 * THE TEXT AND ONLY THE TEXT IS STORED. The app offers `working`, `away` and `do not disturb` beside
 * the box so the common ones need no typing, and the door has no list to check against: a state
 * nobody had thought of would otherwise be refused, and a self-set state that somebody else has to
 * approve is not self-set.
 *
 * EMPTY MEANS "I AM NOT SAYING", and it is stored as NULL with no time beside it — which is what
 * every participant starts with and is different from a state that says nothing.
 */
export function setParticipantState(who: ParticipantRef, state: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('state', who, by)
  theRowOrARefusal(who)
  const because = whyStateIsRefused(state)
  if (because !== null) throw new PanelError(`${because} Nothing was written.`, 400)
  const text = state.trim()
  // WHO SET IT IS WRITTEN BESIDE IT, AND ONLY FOR AN AGENT. A person's line is their own and has no
  // second possible setter, so a column there would say nothing. Criterion M21.
  if (who.kind === 'agent') {
    if (text === '') {
      sqlite
        .prepare('UPDATE agents SET state = NULL, state_at = NULL, state_by_kind = NULL, state_by_id = NULL WHERE id = ?')
        .run(who.id)
      return
    }
    sqlite
      .prepare('UPDATE agents SET state = ?, state_at = ?, state_by_kind = ?, state_by_id = ? WHERE id = ?')
      .run(text, nowStamp(), by?.kind ?? null, by?.id ?? null, who.id)
    return
  }
  if (text === '') {
    sqlite.prepare('UPDATE people SET state = NULL, state_at = NULL WHERE id = ?').run(who.id)
    return
  }
  sqlite.prepare('UPDATE people SET state = ?, state_at = ? WHERE id = ?').run(text, nowStamp(), who.id)
}

/**
 * SAY WHETHER A PERSON IS HERE, or refuse with the sentence that names the rule.
 *
 * Criterion M20, on decision `wvfrwvuzsKF_`. An empty word puts the row back to nobody having
 * chosen, which is read as the default rather than as a fourth answer — the same shape clearing a
 * state has, and for the same reason: "they have not said" is a real answer this product has words
 * for, and it is not the same fact as "they said online".
 */
export function setParticipantPresence(who: ParticipantRef, choice: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('presence', who, by)
  theRowOrARefusal(who)
  const word = choice.trim()
  if (word === '') {
    sqlite.prepare('UPDATE people SET presence_choice = NULL, presence_choice_at = NULL WHERE id = ?').run(who.id)
    return
  }
  if (!isPresenceChoice(word)) {
    throw new PanelError(
      `"${word}" is not one of the answers a person may give about whether they are here. They are: ` +
        `${PRESENCE_CHOICES.join(', ')}. Nothing was written.`,
      400,
    )
  }
  sqlite
    .prepare('UPDATE people SET presence_choice = ?, presence_choice_at = ? WHERE id = ?')
    .run(word, nowStamp(), who.id)
}

/**
 * SAY HOW THE NUMBER ON THE CHAT CIRCLE SHOULD BE DRAWN, or refuse with the sentence naming the rule.
 *
 * Criterion M32. An empty word puts the row back to nobody having chosen, which is read as the
 * default rather than as a third answer — the same shape clearing a presence has, and for the same
 * reason.
 *
 * IT IS A PERSON'S OWN AND NOBODY ELSE'S. Nothing draws a circle for an agent, so a word stored for
 * one would be a word nothing reads; `whyTheChangeIsRefused` says so rather than storing it.
 */
export function setParticipantCircle(who: ParticipantRef, choice: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('circle', who, by)
  theRowOrARefusal(who)
  const word = choice.trim()
  if (word === '') {
    sqlite.prepare('UPDATE people SET circle_shows = NULL WHERE id = ?').run(who.id)
    return
  }
  if (!isCircleShows(word)) {
    throw new PanelError(
      `"${word}" is not one of the ways the number on the chat circle may be drawn. They are: ` +
        `${CIRCLE_SHOWS.join(', ')}. Nothing was written.`,
      400,
    )
  }
  sqlite.prepare('UPDATE people SET circle_shows = ? WHERE id = ?').run(word, who.id)
}

/**
 * SAY WHEN THE CHAT CIRCLE SHOWS, or refuse with the sentence naming the rule.
 *
 * An empty word puts the row back to nobody having chosen, which is read as the default, the same
 * shape clearing the circle's number has. It is a person's own, under the `circle` permission, for
 * the reason `setParticipantCircle` above gives.
 */
export function setParticipantChatButtonStays(who: ParticipantRef, choice: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('circle', who, by)
  theRowOrARefusal(who)
  const word = choice.trim()
  if (word === '') {
    sqlite.prepare('UPDATE people SET chat_button_stays = NULL WHERE id = ?').run(who.id)
    return
  }
  if (!isChatButtonStays(word)) {
    throw new PanelError(
      `"${word}" is not one of the answers to when the chat circle shows. They are: ` +
        `${CHAT_BUTTON_STAYS.join(', ')}. Nothing was written.`,
      400,
    )
  }
  sqlite.prepare('UPDATE people SET chat_button_stays = ? WHERE id = ?').run(word, who.id)
}

/**
 * SAY HOW THE CHAT OPENS, or refuse with the sentence naming the rule. The same shape and the same
 * permission as `setParticipantChatButtonStays` above.
 */
export function setParticipantChatOpensAs(who: ParticipantRef, choice: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('circle', who, by)
  theRowOrARefusal(who)
  const word = choice.trim()
  if (word === '') {
    sqlite.prepare('UPDATE people SET chat_opens_as = NULL WHERE id = ?').run(who.id)
    return
  }
  if (!isChatOpensAs(word)) {
    throw new PanelError(
      `"${word}" is not one of the ways the chat may open. They are: ${CHAT_OPENS_AS.join(', ')}. Nothing was written.`,
      400,
    )
  }
  sqlite.prepare('UPDATE people SET chat_opens_as = ? WHERE id = ?').run(word, who.id)
}

/** Keep a person's chosen column layout, or clear it to follow the available width. */
export function setParticipantChatLayout(who: ParticipantRef, choice: ChatLayout | '', by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('circle', who, by)
  theRowOrARefusal(who)
  sqlite.prepare('UPDATE people SET chat_layout = ? WHERE id = ?').run(choice === '' ? null : choice, who.id)
}

/**
 * PUT A PICTURE ON THE ROUND CHAT BUTTON, or refuse with the sentence naming the rule.
 *
 * Criterion M38. An empty name puts the row back to nobody having chosen, which is read as the
 * default rather than as a fifth answer — the same shape clearing a presence or a circle has.
 *
 * IT IS A PERSON'S OWN AND NOBODY ELSE'S, for the reason `setParticipantCircle` gives: nothing draws
 * a chat button for an agent, so a name stored for one would be a name nothing reads.
 */
export function setParticipantCirclePicture(who: ParticipantRef, name: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('circle', who, by)
  theRowOrARefusal(who)
  const said = name.trim()
  if (said === '') {
    sqlite.prepare('UPDATE people SET circle_picture = NULL WHERE id = ?').run(who.id)
    return
  }
  if (circlePicture(said) === null) {
    throw new PanelError(
      `"${said}" is not one of the pictures the round chat button may carry. They are: ` +
        `${CIRCLE_PICTURES.map((one) => one.name).join(', ')}. Nothing was written.`,
      400,
    )
  }
  sqlite.prepare('UPDATE people SET circle_picture = ? WHERE id = ?').run(said, who.id)
}

/**
 * SAY WHICH NAME A RECORD NAMED IN A MESSAGE IS DRAWN UNDER, or refuse with the sentence naming the
 * rule.
 *
 * Criterion M47. An empty word puts the row back to nobody having chosen, which is read as the
 * default rather than as a third answer — the same shape clearing a presence or a circle has.
 *
 * IT IS A PERSON'S OWN AND NOBODY ELSE'S, for the reason `setParticipantCircle` gives: nothing draws
 * a messages panel for an agent, so a word stored for one would be a word nothing reads.
 */
export function setParticipantMessageLinkLevel(who: ParticipantRef, choice: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('messageLink', who, by)
  theRowOrARefusal(who)
  const word = choice.trim()
  if (word === '') {
    sqlite.prepare('UPDATE people SET message_link_level = NULL WHERE id = ?').run(who.id)
    return
  }
  if (!isMessageLinkLevel(word)) {
    throw new PanelError(
      `"${word}" is not one of the names a record named in a message may be drawn under. They are: ` +
        `${MESSAGE_LINK_LEVELS.join(', ')}. Nothing was written.`,
      400,
    )
  }
  sqlite.prepare('UPDATE people SET message_link_level = ? WHERE id = ?').run(word, who.id)
}

/**
 * SAY HOW A LINK IN A MESSAGE IS LAID OUT, or refuse with the sentence naming the rule.
 *
 * Criterion M48. An empty word puts the row back to nobody having chosen, which is read as the
 * default rather than as a third answer — the same shape the setting above it has.
 *
 * IT IS A PERSON'S OWN AND NOBODY ELSE'S, for the reason `setParticipantMessageLinkLevel` gives.
 */
export function setParticipantMessageLinkLayout(who: ParticipantRef, choice: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('messageLink', who, by)
  theRowOrARefusal(who)
  const word = choice.trim()
  if (word === '') {
    sqlite.prepare('UPDATE people SET message_link_layout = NULL WHERE id = ?').run(who.id)
    return
  }
  if (!isMessageLinkLayout(word)) {
    throw new PanelError(
      `"${word}" is not one of the ways a link in a message may be laid out. They are: ` +
        `${MESSAGE_LINK_LAYOUTS.join(', ')}. Nothing was written.`,
      400,
    )
  }
  sqlite.prepare('UPDATE people SET message_link_layout = ? WHERE id = ?').run(word, who.id)
}

/**
 * SAY WHETHER A MESSAGE DRAWS WHICH PROJECT IT IS IN. Criterion M73.
 *
 * An empty word takes the choice away rather than writing a default, so a reader is told "they have
 * not chosen" rather than "they chose never" — the same shape as every setting above it.
 *
 * IT IS A PERSON'S OWN AND NOBODY ELSE'S, for the reason `setParticipantMessageLinkLevel` gives.
 */
export function setParticipantMessageProjectMark(who: ParticipantRef, choice: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('messageLink', who, by)
  theRowOrARefusal(who)
  const word = choice.trim()
  if (word === '') {
    sqlite.prepare('UPDATE people SET message_project_mark = NULL WHERE id = ?').run(who.id)
    return
  }
  if (!isMessageProjectMark(word)) {
    throw new PanelError(
      `"${word}" is not one of the ways a message may say which project it is in. They are: ` +
        `${MESSAGE_PROJECT_MARKS.join(', ')}. Nothing was written.`,
      400,
    )
  }
  sqlite.prepare('UPDATE people SET message_project_mark = ? WHERE id = ?').run(word, who.id)
}

/**
 * SAY HOW A PICTURE IN A MESSAGE IS DRAWN. Criterion M64, moved here by decision rJphPkCG3l7X.
 *
 * IT WAS A SETTING OF THE BROWSER until 7 September 2026 and is a setting of the person now: their
 * words are that it follows them, like every other choice about how their chat is drawn. A browser
 * that already held one is not read from here and nothing is copied up: this product cannot read a
 * browser's storage, and inventing a choice would say they had made one.
 */
export function setParticipantMessagePictures(who: ParticipantRef, choice: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('messageLink', who, by)
  theRowOrARefusal(who)
  const word = choice.trim()
  if (word === '') {
    sqlite.prepare('UPDATE people SET message_pictures = NULL WHERE id = ?').run(who.id)
    return
  }
  if (!isMessagePictureChoice(word)) {
    throw new PanelError(
      `"${word}" is not one of the ways a picture in a message may be drawn. They are: ` +
        `${MESSAGE_PICTURE_CHOICES.join(', ')}. Nothing was written.`,
      400,
    )
  }
  sqlite.prepare('UPDATE people SET message_pictures = ? WHERE id = ?').run(word, who.id)
}

/**
 * SAY WHETHER MEDIA A RECORD POINTS AT ARE LOADED. Criterion U5.
 *
 * An empty word takes the choice away rather than writing a default, so a reader is told "nobody
 * has chosen" rather than "they chose with the page" — the same shape as every setting beside it.
 *
 * IT IS NOT `setParticipantMessagePictures` ABOVE. That one is about a picture inside a chat
 * message and its three words are `shown`, `pressed` and `path`; this one is about media a report
 * points at and its three are `with-page`, `never` and `on-press`. The two are separate columns on
 * the person's row and neither reads the other.
 *
 * IT IS A PERSON'S OWN AND NOBODY ELSE'S, for the reason `setParticipantMessageLinkLevel` gives.
 */
export function setParticipantMediaLoad(who: ParticipantRef, choice: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('messageLink', who, by)
  theRowOrARefusal(who)
  const word = choice.trim()
  if (word === '') {
    sqlite.prepare('UPDATE people SET media_load = NULL WHERE id = ?').run(who.id)
    return
  }
  if (!isMediaLoadChoice(word)) {
    throw new PanelError(
      `"${word}" is not one of the ways media in a record may be loaded. They are: ` +
        `${MEDIA_LOAD_CHOICES.join(', ')}. Nothing was written.`,
      400,
    )
  }
  sqlite.prepare('UPDATE people SET media_load = ? WHERE id = ?').run(word, who.id)
}

/**
 * SAY HOW BIG THE CHAT'S OWN TEXT IS. Criterion M112.
 *
 * IT IS A PERSON'S OWN AND NOBODY ELSE'S, for the reason `setParticipantMessageLinkLevel` gives, and
 * it reuses the same `messageLink` permission group as every other setting of how the chat is drawn:
 * there is no fourth group for a fourth choice about the same screen.
 */
export function setParticipantChatTextSize(who: ParticipantRef, choice: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('messageLink', who, by)
  theRowOrARefusal(who)
  const word = choice.trim()
  if (word === '') {
    sqlite.prepare('UPDATE people SET chat_text_size = NULL WHERE id = ?').run(who.id)
    return
  }
  if (!isChatTextSize(word)) {
    throw new PanelError(
      `"${word}" is not one of the sizes the chat's text may be. They are: ${CHAT_TEXT_SIZES.join(', ')}. Nothing was written.`,
      400,
    )
  }
  sqlite.prepare('UPDATE people SET chat_text_size = ? WHERE id = ?').run(word, who.id)
}

/**
 * SAY WHICH KEY SENDS A MESSAGE.
 *
 * IT IS A PERSON'S OWN AND NOBODY ELSE'S, for the reason `setParticipantChatTextSize` above gives,
 * and it reuses the same `messageLink` permission group as every other setting of how the chat is
 * written in and drawn: there is no fifth group for a fifth choice about the same screen.
 */
export function setParticipantSendKey(who: ParticipantRef, choice: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('messageLink', who, by)
  theRowOrARefusal(who)
  const word = choice.trim()
  if (word === '') {
    sqlite.prepare('UPDATE people SET send_key = NULL WHERE id = ?').run(who.id)
    return
  }
  if (!isSendKeySetting(word)) {
    throw new PanelError(
      `"${word}" is not one of the two keys that may send a message. They are: ${SEND_KEY_SETTINGS.join(', ')}. Nothing was written.`,
      400,
    )
  }
  sqlite.prepare('UPDATE people SET send_key = ? WHERE id = ?').run(word, who.id)
}

export { theStoredShortcuts } from '../db/read-participant.ts'

/**
 * SAY WHICH KEYBOARD SHORTCUTS ARE ON, at item 5.
 *
 * A PERSON'S OWN, in the same `messageLink` permission group as the send key beside it. `null`
 * clears the column, which reads as every shortcut on. Anything `readShortcutSettings` does not
 * accept is refused with a 400 before the row is touched.
 */
export function setParticipantShortcuts(who: ParticipantRef, choice: unknown, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('messageLink', who, by)
  theRowOrARefusal(who)
  if (choice === null) {
    sqlite.prepare('UPDATE people SET shortcuts = NULL WHERE id = ?').run(who.id)
    return
  }
  const read = readShortcutSettings(choice)
  if (!read.ok) throw new PanelError(`${read.why} Nothing was written.`, 400)
  sqlite.prepare('UPDATE people SET shortcuts = ? WHERE id = ?').run(JSON.stringify(read.settings), who.id)
}

export { theStoredMessageLabels } from '../db/read-participant.ts'

/**
 * KEEP A PERSON'S OWN LABELS FOR THE MESSAGES THEY WRITE. Migration 0341.
 *
 * A PERSON'S OWN, in the same `messageLink` permission group as the shortcuts above. `null` clears the
 * column. Anything `readMessageLabels` does not accept is refused with a 400 before the row is touched.
 */
export function setParticipantChatLabels(who: ParticipantRef, choice: unknown, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('messageLink', who, by)
  theRowOrARefusal(who)
  if (choice === null) {
    sqlite.prepare('UPDATE people SET chat_labels = NULL WHERE id = ?').run(who.id)
    return
  }
  const read = readMessageLabels(choice)
  if (!read.ok) throw new PanelError(`${read.why} Nothing was written.`, 400)
  sqlite.prepare('UPDATE people SET chat_labels = ? WHERE id = ?').run(JSON.stringify(read.labels), who.id)
}

/**
 * KEEP A PERSON'S OWN SETTINGS FOR THE TWO SHIPPED FLAGS AND 'NO MARK'. Migration 0346.
 *
 * A PERSON'S OWN, in the same `messageLink` permission group as the labels above. `null` clears the column, which
 * puts every default back. Anything `readShippedFlags` does not accept is refused with a 400 before the row is touched.
 */
export function setParticipantShippedFlags(who: ParticipantRef, choice: unknown, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('messageLink', who, by)
  theRowOrARefusal(who)
  if (choice === null) {
    sqlite.prepare('UPDATE people SET shipped_flags = NULL WHERE id = ?').run(who.id)
    return
  }
  const read = readShippedFlags(choice)
  if (!read.ok) throw new PanelError(`${read.why} Nothing was written.`, 400)
  sqlite.prepare('UPDATE people SET shipped_flags = ? WHERE id = ?').run(JSON.stringify(read.flags), who.id)
}

/** A person chooses their page language, or clears it to follow each browser. */
export function setParticipantLanguage(who: ParticipantRef, choice: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('messageLink', who, by)
  theRowOrARefusal(who)
  const word = choice.trim()
  if (word !== '' && !isLanguage(word)) {
    throw new PanelError(
      `"${word}" is not a page language. Choose ${Object.keys(LANGUAGES).join(', ')}, or an empty string to follow the browser. Nothing was written.`,
      400,
    )
  }
  sqlite.prepare('UPDATE people SET language = ? WHERE id = ?').run(word === '' ? null : word, who.id)
}

/**
 * Point a participant at a picture, or refuse with the sentence that names the rule.
 *
 * IT NEVER DELETES THE ONE BEING REPLACED. Resetting to the drawing this product made points back at
 * a row that is still there, and an uploaded picture that is no longer shown keeps its row and its
 * file — an asset says who put it there and when, and losing that to make room is not this door's
 * decision to make.
 */
export function setParticipantAvatar(who: ParticipantRef, assetId: string, by: ParticipantRef | null): void {
  assertTheChangeIsAllowed('avatar', who, by)
  theRowOrARefusal(who)
  const asset = sqlite.prepare('SELECT id FROM assets WHERE id = ?').get(assetId) as { id: string } | undefined
  if (asset === undefined) {
    throw new PanelError(`No picture in this installation answers to "${assetId}". Nothing was written.`, 404)
  }
  const table = TABLE_OF[who.kind]
  sqlite.prepare(`UPDATE ${table} SET avatar_asset_id = ? WHERE id = ?`).run(assetId, who.id)
}

// ============================================================ M14, naming who is not registered

/** One agent actor id that has written here and answers to no registry row. */
export interface UnregisteredAgent {
  /** The id exactly as it arrived in the actor header. Never tidied and never guessed at. */
  id: string
  /** How many change rows it has written. */
  writes: number
  /** When it last wrote, local wall clock. */
  lastWroteAt: string
}

/**
 * THE AGENT ACTOR IDS THAT HAVE WRITTEN AND ARE IN NO REGISTRY, most recent first.
 *
 * Criterion M14, as amended on 30 September 2026: *An actor id on a request is
 * looked up in the registries. A record write from an unknown agent is refused with HTTP 403, and
 * nothing is written.* The refusal is `whyAnUnregisteredAgentMayNotWrite` in lib/records/unregistered-agent.ts, asked at
 * the door since 16 September 2026. So the ids this reading finds are the writers that may write
 * without a registration — the office's own programs and tools, calls inside the server's own
 * process, and a test world's starter and secretaries — and the unknown agents that wrote before the
 * refusal existed. Until then M14 said such a write was accepted and only named.
 *
 * IT NAMES, AND NOTHING ELSE HAPPENS. Nothing here refuses a write, retires anybody, stops a process
 * or files a problem; the refusal of a new write is at the door, not here. The F1 answer is to name
 * it and nothing more. An agent is sometimes started for something
 * unrelated to this project, and a rule that acted on whatever is unregistered would be too wide.
 *
 * WHY IT IS READ FROM `changes` AND NOT FROM A LIST OF CALLERS. `changes` is what a write really
 * left behind; a list of callers would be a second place the same fact is worked out. It is read
 * across every project on purpose: an agent identity is installation-level, so "which agents have
 * been writing here" is not a question about one project.
 *
 * `id` IS THE HEADER'S OWN STRING. `claude-code/builder-x` stays exactly that. Trimming it to a
 * handle would be guessing which part is the name, and the point of naming it is that a person can
 * see what was really sent.
 *
 * EVERY ONE OF THEM, AND NOT THE FIRST TWENTY. This used to take a limit of 20 and return that many
 * rows with no count of what it left out, so the page drew twenty of a hundred and ten and said
 * nothing about the other ninety, under a sentence a reader takes as covering all of them. Problem
 * `yKFPQXucwshV`. The number of rows is the number of distinct agent ids that have ever written
 * here, which is 110 on this corpus and grows only when a new id writes; the page decides how many
 * of them to draw at once and says which number it is drawing.
 */
/**
 * THE COUNTS THE LAST READING CARRIED FORWARD, by agent actor id, and the ledger place it read to.
 *
 * WHY THIS IS HERE, MEASURED. The aggregation below read all 1,020,194 rows of `changes` and grouped
 * every agent actor in them on every roster read: 108.3 ms of a warm `GET /api/working` on the 13
 * November office, for 159 rows. `changes.append_order` is the office's own "what has changed since I
 * last looked" (migration 0194), so a later reading asks only for the rows placed after the one it
 * read to. The counter is kept for every agent actor, not only the unregistered ones, so a writer
 * that is registered today and gone tomorrow is counted while it is hidden.
 *
 * WHAT MAKES IT RIGHT AFTER EVERY WRITE. Every append gets a place above all others: the trigger
 * gives one to any program's insert that names none, and the importer re-places every inserted row
 * above the highest stored row unless the archive's places are already all above it (`import.ts`,
 * `appendOrderOfTheInserts`). Nothing in the office deletes change rows; the storage tool's copy
 * filter does, on a copy, and a copy is a new file with a new process. The registry is not cached:
 * every reading asks the current ids and handles, so a registration, a handle change or a freeing is
 * right on the next reading. A ledger whose highest place is below the one this cache read to (a
 * replaced or rolled-back file) is counted again from the beginning.
 */
let theAgentActorCountsRead: Map<string, { writes: number; lastWroteAt: string }> | null = null
let theChangeLedgerReadTo = 0

export function unregisteredAgentsSeen(): UnregisteredAgent[] {
  const place = sqlite.prepare('SELECT max(append_order) AS place FROM changes').get() as { place: number | null }
  const readTo = place.place ?? 0
  let counts = theAgentActorCountsRead
  if (counts === null || readTo < theChangeLedgerReadTo) {
    counts = new Map()
    const rows = sqlite
      .prepare(
        `SELECT actor_id AS id, count(*) AS writes, max(at) AS lastWroteAt
           FROM changes
          WHERE actor_type = 'agent' AND actor_id IS NOT NULL
          GROUP BY actor_id`,
      )
      .all() as { id: string; writes: number; lastWroteAt: string }[]
    for (const row of rows) counts.set(row.id, { writes: row.writes, lastWroteAt: row.lastWroteAt })
    theChangeLedgerReadTo = readTo
  } else if (readTo > theChangeLedgerReadTo) {
    const rows = sqlite
      .prepare(
        `SELECT actor_id AS id, count(*) AS writes, max(at) AS lastWroteAt
           FROM changes
          WHERE append_order > ? AND actor_type = 'agent' AND actor_id IS NOT NULL
          GROUP BY actor_id`,
      )
      .all(theChangeLedgerReadTo) as { id: string; writes: number; lastWroteAt: string }[]
    for (const row of rows) {
      const held = counts.get(row.id)
      counts.set(row.id, {
        writes: (held?.writes ?? 0) + row.writes,
        lastWroteAt: held !== undefined && held.lastWroteAt > row.lastWroteAt ? held.lastWroteAt : row.lastWroteAt,
      })
    }
    theChangeLedgerReadTo = readTo
  }
  theAgentActorCountsRead = counts

  const known = new Set<string>()
  for (const row of sqlite.prepare('SELECT id AS one FROM agents UNION SELECT handle AS one FROM agents').all() as {
    one: string
  }[]) {
    known.add(row.one)
  }
  const seen: UnregisteredAgent[] = []
  for (const [id, held] of counts) {
    if (known.has(id)) continue
    seen.push({ id, writes: held.writes, lastWroteAt: held.lastWroteAt })
  }
  seen.sort((a, b) =>
    a.lastWroteAt < b.lastWroteAt ? 1 : a.lastWroteAt > b.lastWroteAt ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
  return seen
}

/**
 * THE MACHINES ONE PARTICIPANT WAS SEEN FROM, newest first. Criterion M51.
 *
 * ---------------------------------------------------------------------------------------
 * IT READS THE CALL LOG, WHICH IS THE ONLY PLACE THAT NAMES A MACHINE
 * ---------------------------------------------------------------------------------------
 *
 * `api_calls.client_addr` is the network address a request arrived from, and the note on that column
 * says it is the one value in the table naming a machine. Nothing else in this database records
 * where a person was sitting. So this is that column, grouped, and it is a network address rather
 * than a name somebody gave the computer — there is no such name stored, and writing a friendly one
 * here would be inventing it.
 *
 * A ROW WITH NO ADDRESS IS LEFT OUT RATHER THAN COUNTED AS LOOPBACK. The column is null only when a
 * request reached the hook with no socket, and the schema note calls that honest absence. Counting
 * it as 127.0.0.1 would put a machine on the page that nobody measured.
 *
 * ---------------------------------------------------------------------------------------
 * BY BOTH THE HANDLE AND THE REGISTRY ID, FOR AN AGENT
 * ---------------------------------------------------------------------------------------
 *
 * An actor id is whatever the caller typed, and a durable agent has written under both spellings
 * over its life. That is the same pair `recentlyWritten` in agentmemory.ts matches on and the same
 * pair `participantForActor` looks a caller up by, for the same reason. A person writes under the
 * one id the registry holds.
 *
 * AN AGENT USUALLY HAS NOTHING HERE, and that is a real answer rather than a fault. Tools send an
 * actor id of their own choosing — `claude-code/builder-bo` — which answers to no registry row, so
 * its calls are counted against no agent at all. The sentence beside the list says so.
 */
export function machinesSeenFrom(who: ParticipantRef, mostMachines = 12): MachineSeenFrom[] {
  const held = readParticipant(who)
  // ACTOR TYPE IS THE HEADER'S WORD AND NOT THE PARTICIPANT KIND. A person writes as `human`; the
  // registries call the same participant a `person`. They are two vocabularies for one thing and
  // this is the one place they meet.
  const actorType = who.kind === 'person' ? 'human' : 'agent'
  const handle = held === null ? who.id : String((held as unknown as Record<string, unknown>)['handle'])
  const rows = sqlite
    .prepare(
      `SELECT client_addr AS address, max(at_ms) AS lastMs, count(*) AS calls
         FROM api_calls
        WHERE actor_type = ?
          AND client_addr IS NOT NULL
          AND (actor_id = ? OR actor_id = ?)
        GROUP BY client_addr
        ORDER BY lastMs DESC
        LIMIT ?`,
    )
    .all(actorType, who.id, handle, mostMachines) as { address: string; lastMs: number; calls: number }[]
  return rows.map((row) => ({
    address: row.address,
    lastSeen: localStamp(new Date(row.lastMs)),
    calls: row.calls,
  }))
}

export { repositoryRelativePaths } from './repository-relative-paths.ts'

/**
 * A work area names paths relative to the repository, including files not created yet.
 *
 * AND ITS GRAIN IS THE REGISTERING ROLE'S, criterion P92: the normalised paths are handed to the
 * card's own rule, and the card's `says` is the refusal. This function is the one place a work area
 * is checked, so both doors and no other writer can disagree about what the rule is.
 */
export function validateWorkArea(area: readonly string[], card: RoleCard | null): string[] {
  const paths = repositoryRelativePaths(area, 'A work area')
  // THE RULE IS THE DECLARED CARD'S, AND ITS SENTENCE IS THE OFFICE'S: the words record changes `says` and
  // nothing that decides which areas are refused (./card-words.ts).
  const because = whyTheAreaBreaksTheCardsRule(paths, card === null ? null : theCardInTheOfficesWords(card))
  if (because !== null) throw new PanelError(because, 400)
  return paths
}

/**
 * WHO MAY CHANGE AN AGENT'S AREAS, its work area or its files area: the owner, the agent that started it, or a
 * holder of the secretary card. Answers which of the three it is, for the record.
 */
export function whoMayChangeItsAreas(row: RegisteredAgent, actor: Actor, which: string): 'the-owner' | 'a-starter' | 'a-secretary' {
  const caller = participantForActor(actor)
  const isStarter = caller !== null && row.startedBy?.kind === caller.kind && row.startedBy.id === caller.id
  /**
   * THE SECRETARY MAY TOO, which agreed to proposal YDQYmaFDCSzZ:
   * before it only the owner or the starter could, and the finish of an agent they had started themselves
   * waited on them pasting 69 lines. The card is the one the declaration says acts for them, read from
   * the caller's own registry row and never from the request; a retired holder is nobody here. The
   * change below says which of the three did it, so the row can say who registered the area.
   */
  const secretaryCard = theRoleCardsAreRead() ? theRoleCards().elevation.onlyThisCardCanHoldIt : null
  const callerRow = caller !== null && caller.kind === 'agent' ? (readParticipant(caller) as RegisteredAgent | null) : null
  const isSecretary = secretaryCard !== null && callerRow !== null && callerRow.role === secretaryCard && callerRow.retired !== true
  if (actor.type !== 'human' && !isStarter && !isSecretary) {
    const whoMay = `Only the owner, the agent that started this worker, or a holder of the secretary card may change its ${which}. Nothing was written.`
    // MOLE OFFICE'S OWN ROW HOLDS NO CARD. It is refused here as any other caller is, and its refusal says what the row
    // is before it says who may, rather than speaking to it as an agent that could be one of the three.
    if (callerRow !== null && isMoleOffice({ kind: 'agent', id: callerRow.id })) {
      throw new PanelError(`"${callerRow.handle}" ${MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD}, and it did not start this worker. ${whoMay}`, 403)
    }
    throw new PanelError(whoMay, 403)
  }
  return actor.type === 'human' ? 'the-owner' : isStarter ? 'a-starter' : 'a-secretary'
}

/**
 * WHAT A WORK AREA WAS SET FOR, kept on its mark so Mole Office can empty it again when that is over, as long as nobody
 * has changed it since. `forRun` names a running run of the agent, filed by a launcher run by hand: its seal empties
 * the area, and so does its ending crashed. `declared` is a start asked at one of the two doors where a start is asked, set from the brief's declaration
 * before any run is filed, so it names the ask instead: the brief, the door, the run the ask is kept on and when it was
 * asked. The seal of the run that ask started empties the area, and so do that run's ending crashed and the ask's
 * failing to start.
 */
export type WhatAWorkAreaWasSetFor = { forRun: string } | { declared: TheAskAWorkAreaWasDeclaredFor }

/** The ask a declared work area was set for, as its mark keeps it. */
export interface TheAskAWorkAreaWasDeclaredFor {
  brief: string
  door: 'worker-run' | 'next-round'
  /** The run the ask is kept on: the asking supervisor's run for a worker run, the agent's last run for a next round. */
  askedOn: string
  askedAt: string
}

export function changeWorkArea(id: string, workspace: string, area: string[], because: string, actor: Actor, setFor?: WhatAWorkAreaWasSetFor): RegisteredAgent & { nothingWritten?: boolean } {
  // THE ARRIVING `:id` RESOLVES THE ONE WAY. It may be the agent's registry id or its handle, and
  // this door writes, so a retired agent's name is refused here in words. A row is then read by the
  // exact id the resolver answered, because this function needs the whole row and not only its name.
  const named = theAgentAnArrivingReferenceNames(id, 'writing')
  if (named === null) throw new PanelError(`No agent answers to "${id}". Nothing was written.`, 404)
  const row = readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent
  const how = whoMayChangeItsAreas(row, actor, 'work area')
  /**
   * THE WIDENING IS JUDGED BY THE CARD OF THE AGENT WHOSE AREA IT IS, and the WHOLE area is judged:
   * `area` is the full list the caller sent, not only the paths added to it, so an old area moves to
   * the new grain the next time somebody touches it. Criterion P92, and the ruling that narrows it.
   */
  const card = theRoleCardsAreRead() ? cardFor(theRoleCards(), row.role ?? A_ROW_WITH_NO_ROLE_READS_AS) : null
  area = validateWorkArea(area, card)
  if (because.trim() === '') throw new PanelError('Say why the work area changed. Nothing was written.', 400)
  if (setFor !== undefined && 'forRun' in setFor) theRunAnAreaIsSetFor(setFor.forRun, row)
  const recordId = recordForAgentIn(row.id, workspace)
  if (recordId === null) throw new PanelError('This agent has no record in this project to keep its work area and reason. Nothing was written.', 404)
  const record = getRecord(recordId)!
  const extra = record.data['extra'] as Record<string, unknown> | undefined
  // THE STAMP NAMES THE CALLER'S REGISTRY ID, which is what `participantForActor` answers, so an
  // agent that wrote under its handle and returned under its id still owns the change it made.
  const caller = participantForActor(actor)
  const written = patchRecord(recordId, { dataPatch: { workArea: area, extra: { ...extra, workAreaChange: {
    ...NOTHING_IT_WAS_SET_FOR, by: { type: actor.type, id: caller?.id ?? actor.id }, how, at: nowStamp(), because, before: row.workArea, after: area, ...setFor,
  } } } }, actor)
  return { ...(readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent), ...(written.nothingWritten === undefined ? {} : { nothingWritten: true }) }
}

/** What the two doors where a start is asked say of a work area they set from the brief's declaration. */
export function theDeclaredAreaWasSetSays(handle: string, area: readonly string[], declaration: string, asker: string): string {
  return `The declaration ${declaration} names a work area, so ${handle}'s work area is now ${area.join(', ')}, set in the name of ${asker}. ` +
    'The seal of the run this ask starts empties it again, and so does a start that fails or a run that ends crashed, unless somebody changes the area before then.'
}

/**
 * THE SEAL EMPTIES A WORK AREA THAT WAS SET FOR ITS RUN: one set for the run by name (`forRun`), or one set from a
 * declaration for the ask that started this run, which the ask's entry says once the run is filed. Only when that is
 * the agent's last change: an area somebody changed since is theirs and is left as it is. `sealFinishedRun` calls this
 * inside the seal's own write, after the seal has stored the area, so a refused seal empties nothing.
 */
export function theSealEmptiesTheAreaSetForItsRun(agent: RegisteredAgent, runId: string, workspace: string, office: Actor): void {
  theEndOfARunEmptiesTheAreaSetForIt(agent, runId, workspace, 'the-seal', `Run ${runId}, which this work area was set for, was sealed.`, office)
}

/**
 * A RUN THAT ENDS CRASHED EMPTIES THE WORK AREA SET FOR IT, by the seal's reading, so a start that never runs leaves no
 * area behind: a launcher run by hand marks its filed run crashed when the helper does not start it, and that is no
 * seal. A run that crashes later is read the same way. `patchRecord` calls this in the write that ends the run.
 */
export function aCrashedRunEmptiesTheAreaSetForIt(run: Pick<PanelRecord, 'id' | 'workspaceId' | 'data'>, office: Actor): void {
  const reading = theSealsReadingOfARunsAgent(run)
  if (!('agent' in reading)) return
  theEndOfARunEmptiesTheAreaSetForIt(reading.agent, run.id, run.workspaceId, 'a-crashed-run', `Run ${run.id}, which this work area was set for, ended crashed.`, office)
}

/**
 * The seal's reading: the agent's last area change was set for this run by name, or for the ask that started it. Only
 * then is the area emptied.
 */
function theEndOfARunEmptiesTheAreaSetForIt(
  agent: RegisteredAgent, runId: string, workspace: string, how: 'the-seal' | 'a-crashed-run', because: string, office: Actor,
): void {
  const last = theLastAreaChangeOf(agent.id, workspace)
  if (last === null) return
  const setFor = last.mark['forRun'] === runId || theAskStartedTheRun(last.mark['declared'], agent.id, runId)
  if (setFor) moleOfficeEmptiesTheArea(last, agent.workArea, how, because, { run: runId }, office)
}

/**
 * A START THAT FAILED EMPTIES THE WORK AREA ITS ASK SET, so an asked start that never runs leaves no area behind. The
 * two doors call this where an ask they kept is written failed. Only when the agent's last change is the one that ask
 * made, by the same reading as the seal's, and with a mark of the same shape.
 */
export function aFailedStartEmptiesTheAreaOfItsAsk(agentId: string, workspace: string, ask: Omit<TheAskAWorkAreaWasDeclaredFor, 'brief'>, office: Actor): void {
  const last = theLastAreaChangeOf(agentId, workspace)
  const declared = last?.mark['declared'] as Partial<TheAskAWorkAreaWasDeclaredFor> | undefined
  if (last === null || declared?.door !== ask.door || declared.askedOn !== ask.askedOn || declared.askedAt !== ask.askedAt) return
  const row = readParticipant({ kind: 'agent', id: agentId }) as RegisteredAgent | null
  const what = ask.door === 'worker-run' ? 'worker run' : 'next round'
  moleOfficeEmptiesTheArea(last, row?.workArea ?? null, 'a-failed-start', `The ${what} asked on run ${ask.askedOn} at ${ask.askedAt}, which this work area was set for, did not start.`, { ask }, office)
}

/** The agent's record in this project and the mark of its last area change, or null when it has neither. */
function theLastAreaChangeOf(agentId: string, workspace: string): { record: PanelRecord; extra: Record<string, unknown>; mark: Record<string, unknown> } | null {
  const recordId = recordForAgentIn(agentId, workspace)
  const record = recordId === null ? null : getRecord(recordId)
  const extra = record?.data['extra']
  const mark = typeof extra === 'object' && extra !== null ? (extra as Record<string, unknown>)['workAreaChange'] : undefined
  if (record === null || typeof mark !== 'object' || mark === null) return null
  return { record, extra: extra as Record<string, unknown>, mark: mark as Record<string, unknown> }
}

/** Whether the ask a declared area was set for is the ask that started this run, by the entry the ask is kept in. */
function theAskStartedTheRun(declared: unknown, agentId: string, runId: string): boolean {
  if (typeof declared !== 'object' || declared === null) return false
  const ask = declared as Partial<TheAskAWorkAreaWasDeclaredFor>
  const holder = typeof ask.askedOn === 'string' ? getRecord(ask.askedOn) : null
  if (holder === null) return false
  const entry = ask.door === 'worker-run' ? theWorkerRunOf(sqlite, holder.data, agentId) : ask.door === 'next-round' ? readTheNextRound(holder.data[NEXT_ROUND]) : null
  return entry !== null && entry.askedAt === ask.askedAt && entry.state === 'started' && entry.started?.run === runId
}

/** Mole Office empties the area, by its own row, with a mark saying when, why, what it was, and what it was set for. */
function moleOfficeEmptiesTheArea(
  last: { record: PanelRecord; extra: Record<string, unknown> }, before: string[] | null,
  how: 'the-seal' | 'a-failed-start' | 'a-crashed-run', because: string, about: Record<string, unknown>, office: Actor,
): void {
  patchRecord(last.record.id, { dataPatch: { workArea: [], extra: { ...last.extra, workAreaChange: {
    ...NOTHING_IT_WAS_SET_FOR, by: { type: 'agent', id: moleOfficeIdFromItsRow() }, how, at: nowStamp(), because, before, after: [], ...about,
  } } } }, office)
}

/**
 * A PATCH MERGES INTO THE MARK THAT IS THERE, so a key naming what the last change was set for would outlive it, and the
 * seal would read a later change as the one set for its run. Each such key is removed, by its null, unless the change
 * carries it again.
 */
const NOTHING_IT_WAS_SET_FOR = { forRun: null, declared: null, run: null, ask: null } as const

/**
 * THE RUN A WORK AREA IS SET FOR, named by `forRun`: the seal of that run empties the area again, unless somebody has
 * changed it since (`sealFinishedRun` in ./sealed-tip.ts). So the run must be one this office holds, its agent must be
 * the agent whose area this is, read the way the seal reads it, and it must still be running, or there is no seal to
 * come that could empty it. Anything else is refused before the area is written.
 */
function theRunAnAreaIsSetFor(forRun: string, row: RegisteredAgent): void {
  const run = getRecord(forRun)
  if (run === null || run.kind !== 'session') throw new PanelError(`No run answers to "${forRun}", so no work area can be set for it. Nothing was written.`, 404)
  const reading = theSealsReadingOfARunsAgent(run)
  if (!('agent' in reading) || reading.agent.id !== row.id) {
    throw new PanelError(`The run "${forRun}" is not a run of "${row.handle}", so its work area cannot be set for that run. Nothing was written.`, 409)
  }
  if (run.data['state'] !== 'running') {
    throw new PanelError(`The run "${forRun}" is no longer running, so a work area set for it would never be emptied by its seal. Nothing was written.`, 409)
  }
}

/** One folder of a files area: as it was written, and as it resolved, with every link followed, when registered. */
export interface FilesAreaFolder {
  written: string
  resolved: string
}

/**
 * THE FOLDERS OF A FILES AREA, CHECKED AND RESOLVED. Acceptance finding 52, on the design approved
 * on 23 September 2026. Each folder is written absolute and plain, exists, and is resolved with every link followed;
 * both forms are kept. Refused, whoever asks: `/`, a home, or a folder that holds a home; a hidden folder directly
 * under a home, or anything below one (~/.ssh, ~/.config, ~/.claude); the office's own data folder, or a folder that
 * holds it; and any folder inside a git working tree, because files that belong to a repository go through the git
 * lane. One agent's reason for the last: the folder the owner's runs land in was once a link into a working tree deployed to
 * a robot.
 */
export function validateFilesArea(folders: readonly string[], platform: string = THIS_PLATFORM): FilesAreaFolder[] {
  const paths = thePathsOf(platform)
  /** Whether the real location `inner` is the folder `outer` or lies under it. */
  const inOrAt = (inner: string, outer: string): boolean => {
    const below = paths.relative(outer, inner)
    return below === '' || (!below.startsWith('..') && !paths.isAbsolute(below))
  }
  const homes = theHomes()
  // THE FOLDER OF THE DATABASE THIS OFFICE OPENED, AND THE CANONICAL OFFICE'S: a throwaway office on this machine
  // never lets the real one's data folder be written by a files run either.
  const dataFolders = [...new Set([databaseFileStatus().path, canonicalDatabasePath()].map((one) => databaseDirectoryFrom(one)))].map((one) =>
    existsSync(one) ? realpathSync(one) : one,
  )
  const out: FilesAreaFolder[] = []
  for (const entry of folders) {
    // TRAILING SLASHES ARE DROPPED, and the root stays the root, so it is refused as the root.
    const { written, because } = theFilesAreaFolderAsWritten(entry, platform)
    const refuse = (why: string): never => {
      throw new PanelError(`The files area cannot hold "${entry}": ${why} Nothing was written.`, 400)
    }
    if (because !== null) refuse(because)
    if (!existsSync(written) || !statSync(written).isDirectory()) refuse('it is not a folder on this machine.')
    const resolved = realpathSync(written)
    if (isTheRoot(resolved, platform)) refuse('it resolves to the root of the machine.')
    for (const home of homes) {
      if (resolved === home) refuse(`it resolves to the home folder ${home} itself.`)
      if (inOrAt(home, resolved)) refuse(`it resolves to ${resolved}, which holds the home folder ${home}.`)
    }
    const hidden = theHiddenHomeFolderHolding(resolved, homes)
    if (hidden !== null) refuse(`it resolves to ${resolved}, under the hidden folder ${hidden}.`)
    for (const data of dataFolders) {
      if (inOrAt(resolved, data)) refuse(`it resolves to ${resolved}, inside the office's own data folder ${data}.`)
      if (inOrAt(data, resolved)) refuse(`it resolves to ${resolved}, which holds the office's own data folder ${data}.`)
    }
    const tree = theGitTreeHolding(resolved)
    if (tree !== null) refuse(`it resolves to ${resolved}, inside the git working tree ${tree}; files that belong to a repository go through the git lane.`)
    out.push({ written, resolved })
  }
  return out
}

/**
 * CHANGE AN AGENT'S FILES AREA: the folders a files run of it may land in, resolved and kept on the agent's record in
 * this project with who changed it, how, when and why, as a work area is. The same three may: the owner, its
 * starter, or a secretary.
 */
export function changeFilesArea(id: string, workspace: string, folders: string[], because: string, actor: Actor): RegisteredAgent & { nothingWritten?: boolean } {
  // THE ARRIVING `:id` RESOLVES THE ONE WAY, as its sibling changeWorkArea does (acceptance finding 55, found in
  // message 7L31AqPevOJO): the agent's registry id or its handle, in writing mode, so a retired
  // agent's name is refused in words; the row is then read by the exact id the resolver answered.
  const named = theAgentAnArrivingReferenceNames(id, 'writing')
  if (named === null) throw new PanelError(`No agent answers to "${id}". Nothing was written.`, 404)
  const row = readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent
  const how = whoMayChangeItsAreas(row, actor, 'files area')
  const area = validateFilesArea(folders)
  if (because.trim() === '') throw new PanelError('Say why the files area changed. Nothing was written.', 400)
  const recordId = recordForAgentIn(row.id, workspace)
  if (recordId === null) throw new PanelError('This agent has no record in this project to keep its files area and reason. Nothing was written.', 404)
  const record = getRecord(recordId)!
  const extra = record.data['extra'] as Record<string, unknown> | undefined
  // THE STAMP NAMES THE CALLER'S REGISTRY ID, as changeWorkArea's does (the release of wave 4, DMOgwnBd6dFt), so the two
  // sibling doors record the same thing and an agent that wrote under its handle still owns its change.
  const caller = participantForActor(actor)
  const written = patchRecord(recordId, { dataPatch: { filesArea: area, extra: { ...extra, filesAreaChange: {
    by: { type: actor.type, id: caller?.id ?? actor.id }, how, at: nowStamp(), because, before: record.data['filesArea'] ?? null, after: area,
  } } } }, actor)
  return { ...(readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent), ...(written.nothingWritten === undefined ? {} : { nothingWritten: true }) }
}

/** An agent's files area in one project, as its record keeps it, or null when it has none. */
export function theFilesAreaOf(agentId: string, workspace: string): FilesAreaFolder[] | null {
  const recordId = recordForAgentIn(agentId, workspace)
  const area = recordId === null ? undefined : getRecord(recordId)?.data['filesArea']
  if (!Array.isArray(area)) return null
  return area.filter((one): one is FilesAreaFolder => typeof one?.written === 'string' && typeof one?.resolved === 'string')
}

// --------------------------------------------------------- the folder an agent's sessions start in

/**
 * ONE LIVE AGENT REGISTERED AS STARTING IN A FOLDER: its registry id, its handle, and the record the
 * folder is written on.
 */
export interface AnAgentStartingIn {
  id: string
  handle: string
  /** The `agent` record carrying the folder, so a caller need not look it up again. */
  record: string
}

/**
 * EVERY LIVE AGENT REGISTERED AS STARTING IN EXACTLY THIS FOLDER, by handle.
 *
 * The session hook asks this when neither the session's environment nor a `.env` names an agent, and it is what
 * lets a durable agent be recognised in a terminal that says nothing about itself, at part (c).
 *
 * THE MATCH IS THE EXACT FOLDER, after trailing slashes go, and no link is followed. The answer
 * to open question 10. A subfolder is not a match: one folder can hold the session records of
 * several conversations and only one of them is the registered agent's, so anything looser
 * than equality would hand one agent's name to other people's sessions.
 *
 * LIVE ONLY, AND ONE ENTRY PER AGENT. A retired agent is not live; a deleted record is not read; an
 * agent with a record in two projects is one agent and appears once. A registry row the record maps
 * to nowhere is nobody and is left out — a folder must never name a session, so an unreadable row is
 * an absence rather than a guess.
 *
 * THE LIST IS SORTED BY HANDLE so the sentence a caller builds from it reads the same way twice.
 *
 * THE RECORDS ARE READ BY theAgentRecordsNamingTheStartFolder (lib/terminals/agent-records-naming-a-start-folder.ts),
 * with retired agents left out. The open of an office terminal reads the same records with retired agents counted.
 */
export function agentsStartingIn(directory: string): AnAgentStartingIn[] {
  const asked = theStartFolderAsItIsStored(directory)
  if (asked.folder === null) return []
  const found = new Map<string, AnAgentStartingIn>()
  for (const { record, agent } of theAgentRecordsNamingTheStartFolder(asked.folder, { retiredAgents: 'left out' })) {
    if (agent === null) continue
    if (!found.has(agent.id)) found.set(agent.id, { id: agent.id, handle: agent.handle, record })
  }
  return [...found.values()].sort((a, b) => a.handle.localeCompare(b.handle))
}

/** The folder an agent's sessions start in, as its record in one project keeps it, or null. */
export function theStartFolderOf(agentId: string, workspace: string): string | null {
  const recordId = recordForAgentIn(agentId, workspace)
  const folder = recordId === null ? undefined : getRecord(recordId)?.data['startFolder']
  return typeof folder === 'string' && folder !== '' ? folder : null
}

/**
 * CHANGE THE FOLDER AN AGENT'S SESSIONS START IN, with who changed it, how, when and why on the
 * record, as a work area and a files area are changed.
 *
 * The answer to open question 13 of the recognition measurement, which follows the work-area
 * rule: the owner, the agent's starter or a holder of the secretary card, with a reason, and never
 * the agent itself. `whoMayChangeItsAreas` is that reading and is not written a second time here.
 *
 * THE WRITE GOES THROUGH THE START FOLDER DOOR. `checkNobodyIsChangingAStartFolder` in lib/records/decision-core.ts
 * refuses an ordinary write of this field by any agent, so this door opens the marker around its own
 * patch. Without that the field would have two routes and only one of them would ask who is asking.
 */
/**
 * A SECRETARY'S OWN BROADCAST TIMES, CHANGED BY THE THREE WHO MAY CHANGE ITS AREAS: the owner, its
 * starter or a holder of the secretary card, with a reason. That is why a secretary has times of its own, as the
 * ai-news reports at 12:00 alone show. `null` hands it back to the office's setting, and
 * an empty list ends its reports. The times are written on the schedule itself, so every rule
 * that reads the schedule reads them.
 */
export function changeBroadcastTimes(
  id: string,
  times: readonly string[] | null,
  because: string,
  actor: Actor,
): { agent: RegisteredAgent; schedule: BroadcastSchedule; change: TheBroadcastTimesChange; nothingWritten?: boolean } {
  const named = theAgentAnArrivingReferenceNames(id, 'writing')
  if (named === null) throw new PanelError(`No agent answers to "${id}". Nothing was written.`, 404)
  const row = readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent
  const how = whoMayChangeItsAreas(row, actor, 'broadcast times')
  if (because.trim() === '') throw new PanelError('Say why the broadcast times changed. Nothing was written.', 400)
  const caller = participantForActor(actor)
  const done = writeTheBroadcastTimes(row.id, times, { by: { type: actor.type, id: caller?.id ?? actor.id }, how, at: nowStamp(), because }, actor)
  return { agent: row, ...done }
}

/**
 * SAY ONE OF A SECRETARY'S SLOTS HAS NOTHING TO REPORT, so no reminder comes for it and it does not count
 * toward the pause. On a quiet day a secretary may file nothing, as decided. Only the secretary
 * itself or the person may say it, because it is the secretary's own report, and the person is the one
 * it is for. The skip is a message, written in the name of whoever said it, so the conversation shows it.
 */
export function sayASlotHasNothingToReport(
  id: string,
  at: string,
  workspaceId: string,
  actor: Actor,
): { agent: RegisteredAgent } & TheBroadcastSkip {
  const named = theAgentAnArrivingReferenceNames(id, 'writing')
  if (named === null) throw new PanelError(`No agent answers to "${id}". Nothing was written.`, 404)
  const row = readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent
  const caller = participantForActor(actor)
  const itself = caller !== null && caller.kind === 'agent' && caller.id === row.id
  if (actor.type !== 'human' && !itself) {
    throw new PanelError('Only this secretary itself or the person may say one of its reports has nothing in it. Nothing was written.', 403)
  }
  return { agent: row, ...writeTheBroadcastSkip(row.id, at, workspaceId, actor) }
}

export function changeStartFolder(
  id: string,
  workspace: string,
  written: string,
  because: string,
  actor: Actor,
): { agent: RegisteredAgent; startFolder: string; alsoRegisteredThere: AnAgentStartingIn[]; nothingWritten?: boolean } {
  // THE ARRIVING `:id` RESOLVES THE ONE WAY, as its two siblings do: the agent's registry id or its
  // handle, in writing mode, so a retired agent's name is refused in words; the row is then read by
  // the exact id the resolver answered.
  const named = theAgentAnArrivingReferenceNames(id, 'writing')
  if (named === null) throw new PanelError(`No agent answers to "${id}". Nothing was written.`, 404)
  const row = readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent
  const how = whoMayChangeItsAreas(row, actor, 'start folder')
  const read = theStartFolderAsItIsStored(written)
  if (read.folder === null) {
    throw new PanelError(`This cannot be a start folder. ${String(read.because)} Nothing was written.`, 400)
  }
  if (because.trim() === '') throw new PanelError('Say why the start folder changed. Nothing was written.', 400)
  const recordId = recordForAgentIn(row.id, workspace)
  if (recordId === null) {
    throw new PanelError('This agent has no record in this project to keep its start folder and reason. Nothing was written.', 404)
  }
  const record = getRecord(recordId)!
  const extra = record.data['extra'] as Record<string, unknown> | undefined
  // THE STAMP NAMES THE CALLER'S REGISTRY ID, as the work-area and files-area stamps do, so an agent
  // that wrote under its handle and returned under its id still owns the change it made.
  const caller = participantForActor(actor)
  const patch = throughTheStartFolderDoor(() =>
    patchRecord(
      recordId,
      {
        dataPatch: {
          startFolder: read.folder,
          extra: {
            ...extra,
            startFolderChange: {
              by: { type: actor.type, id: caller?.id ?? actor.id },
              how,
              at: nowStamp(),
              because,
              before: record.data['startFolder'] ?? null,
              after: read.folder,
            },
          },
        },
      },
      actor,
    ),
  )
  return {
    agent: readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent,
    startFolder: read.folder,
    // WHO ELSE HAS IT NOW, so the reply can warn rather than leave the caller to find out from the
    // hook naming nobody. Two agents with one folder is recorded and never refused (the answer to
    // open question 12); this agent is left out of its own warning.
    alsoRegisteredThere: agentsStartingIn(read.folder).filter((one) => one.id !== row.id),
    ...(patch.nothingWritten === undefined ? {} : { nothingWritten: true }),
  }
}
